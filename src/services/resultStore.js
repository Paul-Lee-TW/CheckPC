const crypto = require('crypto');

// 單台掃描結果的記憶體暫存。集中於此，供 scan.js 與（後續）batch.js 共用。
// - id 一律用 crypto.randomUUID()（取代原本低熵的 Date.now()-Math.random().substr）。
// - TTL 清掃：僅刪除「由批次產生（帶 _batchId）且超過保留時間」的條目；
//   單機掃描條目維持原有生命週期（不被 TTL 清除），避免單機路徑回歸。
// - MAX_ENTRIES：記憶體安全上限，超過時淘汰最舊條目（不分來源）。

const TTL_MS = 2 * 60 * 60 * 1000; // 批次條目保留 2 小時
const CLEAN_INTERVAL_MS = 10 * 60 * 1000; // 每 10 分鐘清掃一次
const MAX_ENTRIES = 1000; // 記憶體安全上限

const scanResults = new Map();

function newId() {
  return crypto.randomUUID();
}

// 儲存單台掃描結果，回傳新 id。meta: { host, batchId }
function saveScanResult(result, { host, batchId } = {}) {
  const id = newId();
  scanResults.set(id, {
    ...result,
    _scanId: id,
    _host: host,
    ...(batchId ? { _batchId: batchId } : {}),
    _createdAt: Date.now(),
  });
  enforceMaxEntries();
  return id;
}

function getScanResult(id) {
  return scanResults.get(id);
}

// 清掃：刪除超過 TTL 且帶 _batchId 的條目。回傳刪除筆數。
function cleanup(now = Date.now()) {
  let removed = 0;
  for (const [id, entry] of scanResults) {
    if (entry._batchId && now - (entry._createdAt || 0) > TTL_MS) {
      scanResults.delete(id);
      removed++;
    }
  }
  return removed;
}

// 安全上限：超過上限時淘汰最舊條目（Map 以插入順序迭代）。
function enforceMaxEntries() {
  while (scanResults.size > MAX_ENTRIES) {
    const oldestKey = scanResults.keys().next().value;
    if (oldestKey === undefined) break;
    scanResults.delete(oldestKey);
  }
}

let timer = null;
function startCleanup() {
  if (timer) return timer;
  timer = setInterval(cleanup, CLEAN_INTERVAL_MS);
  if (timer.unref) timer.unref(); // 不阻止程序結束
  return timer;
}
startCleanup();

module.exports = {
  newId,
  saveScanResult,
  getScanResult,
  cleanup,
  scanResults,
  _config: { TTL_MS, CLEAN_INTERVAL_MS, MAX_ENTRIES },
};
