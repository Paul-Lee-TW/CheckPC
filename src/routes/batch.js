const { Router } = require('express');
const { remoteScan } = require('../services/sshScanner');
const { saveScanResult, newId } = require('../services/resultStore');

const router = Router();

// 批次工作（in-memory）。完成時落地與歷史列表為 M3 範圍；此處僅記憶體。
// 注意：job 與 results 內「絕不」存放密碼——密碼只活在請求期間的 targets 閉包。
const batchJobs = new Map();

const MAX_TARGETS = 50;
const MAX_CONCURRENCY = 8;
const DEFAULT_CONCURRENCY = 4;
const MAX_BATCH_JOBS = 200; // 記憶體安全上限（每筆僅小量 metadata；完整結果在已設上限的 resultStore）
const TTL_MS = 2 * 60 * 60 * 1000; // 完成的批次保留 2 小時
const CLEAN_INTERVAL_MS = 10 * 60 * 1000;

// 將 port 正規化為合法整數，否則回退 22。
function normPort(p) {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 22;
}

// 將底層錯誤訊息分類，方便前端顯示（不洩漏敏感資訊）。
function classifyError(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('authentication') || m.includes('password') || m.includes('permission denied')) return 'auth';
  if (m.includes('timeout') || m.includes('timed out')) return 'timeout';
  if (
    m.includes('econnrefused') || m.includes('ehostunreach') || m.includes('enotfound') ||
    m.includes('connect') || m.includes('network')
  ) return 'connect';
  if (m.includes('json') || m.includes('parse') || m.includes('empty output')) return 'parse';
  return 'error';
}

// 對外視圖：job 本身已不含密碼，直接回傳即可。
function jobView(job) {
  return {
    id: job.id,
    createdAt: job.createdAt,
    operator: job.operator,
    status: job.status,
    total: job.total,
    concurrency: job.concurrency,
    counts: job.counts,
    results: job.results,
  };
}

function jobSummary(job) {
  return {
    id: job.id,
    createdAt: job.createdAt,
    operator: job.operator,
    status: job.status,
    total: job.total,
    counts: job.counts,
  };
}

// 固定大小 worker-pool：以游標取下一台，逐台呼叫既有 remoteScan，失敗只標該台、不中斷整批。
async function runBatch(job, targets) {
  let cursor = 0;
  const worker = async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = cursor++;
      if (index >= targets.length) return;
      const t = targets[index];
      const r = job.results[index];

      r.status = 'running';
      r.startedAt = Date.now();
      job.counts.pending--;
      job.counts.running++;

      try {
        const result = await remoteScan({
          host: t.host,
          port: normPort(t.port),
          username: t.username,
          password: t.password,
        });
        const scanId = saveScanResult(result, { host: t.host, batchId: job.id });
        r.scanId = scanId;
        r.status = 'success';
        job.counts.success++;
        console.log(`[Batch] ${job.id} ${t.host} -> success (${scanId})`);
      } catch (err) {
        r.status = 'error';
        r.error = { type: classifyError(err.message), message: err.message };
        job.counts.error++;
        console.error(`[Batch] ${job.id} ${t.host} -> error: ${err.message}`);
      } finally {
        r.finishedAt = Date.now();
        job.counts.running--;
      }
    }
  };

  const workers = [];
  for (let i = 0; i < job.concurrency; i++) workers.push(worker());
  await Promise.allSettled(workers);
  job.status = 'done';
  console.log(`[Batch] ${job.id} done: ${job.counts.success} ok, ${job.counts.error} failed`);
}

// POST /api/scan/batch — 建立批次並背景並行掃描，立即回 202。
router.post('/', (req, res) => {
  const { targets, concurrency, operator } = req.body || {};

  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ message: '請提供至少一台目標主機' });
  }
  if (targets.length > MAX_TARGETS) {
    return res.status(400).json({ message: `目標數量超過上限（最多 ${MAX_TARGETS} 台）` });
  }
  for (const t of targets) {
    if (!t || !t.host || !t.username || !t.password) {
      return res.status(400).json({ message: '每台目標都需填寫 IP、帳號和密碼' });
    }
    if (t.port !== undefined && t.port !== null && t.port !== '') {
      const p = Number(t.port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return res.status(400).json({ message: `port 無效（${t.host}）` });
      }
    }
  }

  const conc = Math.min(MAX_CONCURRENCY, Math.max(1, Number(concurrency) || DEFAULT_CONCURRENCY));
  const batchId = newId();

  const job = {
    id: batchId,
    createdAt: Date.now(),
    operator: operator ? String(operator).slice(0, 100) : undefined,
    status: 'running',
    total: targets.length,
    concurrency: conc,
    counts: { pending: targets.length, running: 0, success: 0, error: 0 },
    // 不含密碼
    results: targets.map((t, index) => ({
      index,
      host: t.host,
      port: normPort(t.port),
      status: 'pending',
      scanId: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    })),
  };
  batchJobs.set(batchId, job);
  enforceMaxJobs();

  // 背景執行，不 await。
  runBatch(job, targets).catch((e) => console.error('[Batch] 未預期錯誤:', e.message));

  console.log(`[Batch] 建立批次 ${batchId}：${targets.length} 台，並行 ${conc}`);
  res.status(202).json({ batchId, total: targets.length });
});

// GET /api/scan/batch — 列出批次摘要（記憶體；落地歷史為 M3）。
router.get('/', (_req, res) => {
  const list = [...batchJobs.values()].map(jobSummary).sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

// GET /api/scan/batch/:batchId — 取得批次進度／結果（不含密碼）。
router.get('/:batchId', (req, res) => {
  const job = batchJobs.get(req.params.batchId);
  if (!job) {
    return res.status(404).json({ message: '找不到批次' });
  }
  res.json(jobView(job));
});

// 安全上限：超過上限時淘汰最舊批次（Map 以插入順序迭代）。
function enforceMaxJobs() {
  while (batchJobs.size > MAX_BATCH_JOBS) {
    const oldest = batchJobs.keys().next().value;
    if (oldest === undefined) break;
    batchJobs.delete(oldest);
  }
}

// TTL：清掉已完成且超過保留時間的批次（其單台結果由 resultStore 自行清掃）。
function cleanup(now = Date.now()) {
  for (const [id, job] of batchJobs) {
    if (job.status === 'done' && now - job.createdAt > TTL_MS) {
      batchJobs.delete(id);
    }
  }
}
const timer = setInterval(cleanup, CLEAN_INTERVAL_MS);
if (timer.unref) timer.unref();

module.exports = router;
module.exports.batchJobs = batchJobs;
module.exports.cleanup = cleanup;
