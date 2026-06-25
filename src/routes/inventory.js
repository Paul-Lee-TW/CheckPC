const { Router } = require('express');
const persistence = require('../services/persistence');
const { newId } = require('../services/resultStore');

const router = Router();

const MAX_INVENTORY = 500;

function normPort(p) {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 22;
}

// GET /api/inventory — 主機清單（不含密碼）。
router.get('/', (_req, res) => {
  res.json(persistence.readInventory());
});

// PUT /api/inventory — 整檔覆寫主機清單。憑證一律剔除、絕不儲存。
router.put('/', (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) {
    return res.status(400).json({ message: '主機清單必須是陣列' });
  }
  if (list.length > MAX_INVENTORY) {
    return res.status(400).json({ message: `主機數量超過上限（最多 ${MAX_INVENTORY} 台）` });
  }

  const normalized = [];
  for (const item of list) {
    if (!item || typeof item.host !== 'string' || !item.host.trim()) {
      return res.status(400).json({ message: '每筆主機都需填寫 host' });
    }
    if (item.port !== undefined && item.port !== null && item.port !== '') {
      const p = Number(item.port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return res.status(400).json({ message: `port 無效（${item.host}）` });
      }
    }
    // Only persist non-credential fields. username/password are never stored.
    normalized.push({
      id: typeof item.id === 'string' && item.id ? item.id : newId(),
      label: (typeof item.label === 'string' && item.label.trim()) ? item.label.trim().slice(0, 100) : item.host.trim(),
      host: item.host.trim(),
      port: normPort(item.port),
      group: (typeof item.group === 'string' && item.group.trim()) ? item.group.trim().slice(0, 50) : undefined,
    });
  }

  if (!persistence.writeInventory(normalized)) {
    return res.status(500).json({ message: '儲存主機清單失敗' });
  }
  res.json({ saved: normalized.length, inventory: normalized });
});

module.exports = router;
