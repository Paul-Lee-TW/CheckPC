const { Router } = require('express');
const { remoteScan } = require('../services/sshScanner');

const router = Router();

// 暫存掃描結果（in-memory）
const scanResults = new Map();

// POST /api/scan/remote — 遠端 SSH 掃描
router.post('/remote', async (req, res, next) => {
  try {
    const { host, port, username, password } = req.body;

    if (!host || !username || !password) {
      return res.status(400).json({ message: '請填寫 IP、帳號和密碼' });
    }

    console.log(`[Scan] 開始遠端掃描 ${host}...`);
    const result = await remoteScan({ host, port: port || 22, username, password });

    // 存入暫存
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    scanResults.set(id, { ...result, _scanId: id, _host: host });

    console.log(`[Scan] 掃描完成: ${host} -> ${id}`);
    res.json({ id, result });
  } catch (err) {
    console.error(`[Scan] 掃描失敗:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scan/results/:id — 取得掃描結果
router.get('/results/:id', (req, res) => {
  const data = scanResults.get(req.params.id);
  if (!data) {
    return res.status(404).json({ message: '找不到掃描結果' });
  }
  res.json(data);
});

module.exports = router;
