const { Router } = require('express');
const persistence = require('../services/persistence');

const router = Router();

// GET /api/audit-log?limit= — 批次掃描的操作軌跡（newest first，不含密碼）。
router.get('/', (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
  res.json(persistence.readAuditLog(limit));
});

module.exports = router;
