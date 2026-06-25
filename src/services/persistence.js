const fs = require('fs');
const path = require('path');

// File-based persistence under the writable data dir (CHECKPC_DATA, set by
// electron/main.js to userData; otherwise ./data). Read lazily so tests can
// point CHECKPC_DATA at a temp dir. Nothing written here ever contains
// credentials — callers pass password-free views only.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dataDir() {
  return process.env.CHECKPC_DATA || path.join(__dirname, '..', '..', 'data');
}
function batchesDir() {
  return path.join(dataDir(), 'batches');
}
function auditLogPath() {
  return path.join(dataDir(), 'audit-log.jsonl');
}
function ensureDirs() {
  fs.mkdirSync(batchesDir(), { recursive: true });
}

// Persist a completed batch view (already password-free).
function saveBatch(view) {
  try {
    if (!view || !UUID_RE.test(view.id)) return false;
    ensureDirs();
    fs.writeFileSync(path.join(batchesDir(), `${view.id}.json`), JSON.stringify(view), 'utf8');
    return true;
  } catch (e) {
    console.error('[Persist] saveBatch 失敗:', e.message);
    return false;
  }
}

function loadBatch(id) {
  try {
    if (!UUID_RE.test(id)) return null; // guard against path traversal
    const file = path.join(batchesDir(), `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('[Persist] loadBatch 失敗:', e.message);
    return null;
  }
}

function listBatches(limit = 200) {
  try {
    if (!fs.existsSync(batchesDir())) return [];
    const out = [];
    for (const f of fs.readdirSync(batchesDir())) {
      if (!f.endsWith('.json')) continue;
      try {
        const v = JSON.parse(fs.readFileSync(path.join(batchesDir(), f), 'utf8'));
        out.push({
          id: v.id, createdAt: v.createdAt, operator: v.operator,
          status: v.status, total: v.total, counts: v.counts,
        });
      } catch { /* skip corrupt file */ }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out.slice(0, limit);
  } catch (e) {
    console.error('[Persist] listBatches 失敗:', e.message);
    return [];
  }
}

// Append one audit-trail line (JSONL). Entry must not contain credentials.
function appendAuditLog(entry) {
  try {
    ensureDirs();
    fs.appendFileSync(auditLogPath(), JSON.stringify(entry) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[Persist] appendAuditLog 失敗:', e.message);
    return false;
  }
}

function readAuditLog(limit = 200) {
  try {
    if (!fs.existsSync(auditLogPath())) return [];
    const lines = fs.readFileSync(auditLogPath(), 'utf8').split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .reverse(); // newest first
  } catch (e) {
    console.error('[Persist] readAuditLog 失敗:', e.message);
    return [];
  }
}

module.exports = {
  dataDir, batchesDir, auditLogPath,
  saveBatch, loadBatch, listBatches,
  appendAuditLog, readAuditLog,
};
