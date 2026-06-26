const { Router } = require('express');
const { newId } = require('../services/resultStore');
const { enableSshHost } = require('../services/sshEnabler');
const persistence = require('../services/persistence');

const router = Router();

// In-memory enable jobs. Passwords live ONLY in the request-scoped targets
// closure — never in a job/result, on disk, or in the audit log.
const enableJobs = new Map();

const MAX_TARGETS = 50;
const MAX_CONCURRENCY = 8;
const DEFAULT_CONCURRENCY = 4;
const MAX_JOBS = 200;
const TTL_MS = 2 * 60 * 60 * 1000;
const CLEAN_INTERVAL_MS = 10 * 60 * 1000;

function normPort(p) {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 22;
}

function jobView(job) {
  return {
    id: job.id, kind: job.kind, createdAt: job.createdAt, operator: job.operator,
    status: job.status, total: job.total, concurrency: job.concurrency,
    counts: job.counts, results: job.results,
  };
}
function jobSummary(job) {
  return {
    id: job.id, kind: job.kind, createdAt: job.createdAt, operator: job.operator,
    status: job.status, total: job.total, counts: job.counts,
  };
}

// Fixed-size worker pool: one cursor, N workers; a failed host is isolated.
async function runEnable(job, targets) {
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
        const res = await enableSshHost({
          host: t.host,
          port: normPort(t.port),
          username: t.username,
          password: t.password,
          allowedSource: job.allowedSource,
        });
        r.status = res.status || 'error';
        r.channel = res.channel || null;
        r.sshVersion = res.sshVersion || null;
        r.error = res.error || null;
        if (r.status === 'success') job.counts.success++;
        else if (r.status === 'partial') job.counts.partial++;
        else if (r.status === 'blocked') job.counts.blocked++;
        else job.counts.error++;
        console.log(`[Enable] ${job.id} ${t.host} -> ${r.status}`);
      } catch (err) {
        r.status = 'error';
        r.error = { type: 'error', message: err.message };
        job.counts.error++;
        console.error(`[Enable] ${job.id} ${t.host} -> error: ${err.message}`);
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
  console.log(`[Enable] ${job.id} done: ${job.counts.success} ok, ${job.counts.partial} partial, ${job.counts.blocked} blocked, ${job.counts.error} error`);

  // Persist (password-free) + audit trail.
  persistence.saveBatch(jobView(job));
  persistence.appendAuditLog({
    ts: new Date().toISOString(),
    operator: job.operator || null,
    action: 'ssh_enable',
    batchId: job.id,
    total: job.total,
    success: job.counts.success,
    partial: job.counts.partial,
    blocked: job.counts.blocked,
    failed: job.counts.error,
    hosts: job.results.map((r) => ({ host: r.host, status: r.status, channel: r.channel })),
  });
}

// POST /api/ssh-enable — create a remote-enable job (single host = targets[1]).
router.post('/', (req, res) => {
  const { targets, concurrency, operator, allowedSource } = req.body || {};

  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ message: '請提供至少一台目標主機' });
  }
  if (targets.length > MAX_TARGETS) {
    return res.status(400).json({ message: `目標數量超過上限（最多 ${MAX_TARGETS} 台）` });
  }
  for (const t of targets) {
    if (!t || !t.host || !t.username || !t.password) {
      return res.status(400).json({ message: '每台目標都需填寫 IP、管理員帳號和密碼' });
    }
    if (t.port !== undefined && t.port !== null && t.port !== '') {
      const p = Number(t.port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return res.status(400).json({ message: `port 無效（${t.host}）` });
      }
    }
  }

  const conc = Math.min(MAX_CONCURRENCY, Math.max(1, Number(concurrency) || DEFAULT_CONCURRENCY));
  const id = newId();
  const job = {
    id,
    kind: 'ssh_enable',
    createdAt: Date.now(),
    operator: operator ? String(operator).slice(0, 100) : undefined,
    allowedSource: (allowedSource && String(allowedSource).trim()) ? String(allowedSource).trim().slice(0, 100) : 'Any',
    status: 'running',
    total: targets.length,
    concurrency: conc,
    counts: { pending: targets.length, running: 0, success: 0, partial: 0, blocked: 0, error: 0 },
    results: targets.map((t, index) => ({
      index, host: t.host, port: normPort(t.port),
      status: 'pending', channel: null, sshVersion: null, error: null,
      startedAt: null, finishedAt: null,
    })),
  };
  enableJobs.set(id, job);
  enforceMaxJobs();

  runEnable(job, targets).catch((e) => console.error('[Enable] 未預期錯誤:', e.message));

  console.log(`[Enable] 建立啟用作業 ${id}：${targets.length} 台，並行 ${conc}`);
  res.status(202).json({ batchId: id, total: targets.length });
});

// GET /api/ssh-enable — list (memory + persisted ssh_enable jobs).
router.get('/', (_req, res) => {
  const mem = [...enableJobs.values()].map(jobSummary);
  const memIds = new Set(mem.map((j) => j.id));
  const persisted = persistence.listBatches()
    .filter((b) => b.kind === 'ssh_enable' && !memIds.has(b.id));
  const list = [...mem, ...persisted].sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

// GET /api/ssh-enable/:id — progress/results (memory first, else disk).
router.get('/:id', (req, res) => {
  const job = enableJobs.get(req.params.id);
  if (job) return res.json(jobView(job));
  const persisted = persistence.loadBatch(req.params.id);
  if (persisted && persisted.kind === 'ssh_enable') return res.json(persisted);
  return res.status(404).json({ message: '找不到啟用作業' });
});

function enforceMaxJobs() {
  while (enableJobs.size > MAX_JOBS) {
    const oldest = enableJobs.keys().next().value;
    if (oldest === undefined) break;
    enableJobs.delete(oldest);
  }
}
function cleanup(now = Date.now()) {
  for (const [id, job] of enableJobs) {
    if (job.status === 'done' && now - job.createdAt > TTL_MS) enableJobs.delete(id);
  }
}
const timer = setInterval(cleanup, CLEAN_INTERVAL_MS);
if (timer.unref) timer.unref();

module.exports = router;
module.exports.enableJobs = enableJobs;
