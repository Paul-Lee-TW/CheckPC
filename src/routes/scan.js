const { Router } = require('express');
const { remoteScan } = require('../services/sshScanner');
const { saveScanResult, getScanResult } = require('../services/resultStore');

const router = Router();

// POST /api/scan/remote — 遠端 SSH 掃描
router.post('/remote', async (req, res) => {
  try {
    const { host, port, username, password } = req.body;

    if (!host || !username || !password) {
      return res.status(400).json({ message: '請填寫 IP、帳號和密碼' });
    }

    console.log(`[Scan] 開始遠端掃描 ${host}...`);
    const result = await remoteScan({ host, port: port || 22, username, password });

    // 存入暫存（id 由 resultStore 以 crypto.randomUUID 產生）
    const id = saveScanResult(result, { host });

    console.log(`[Scan] 掃描完成: ${host} -> ${id}`);
    res.json({ id, result });
  } catch (err) {
    console.error(`[Scan] 掃描失敗:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/scan/results/:id — 取得掃描結果
router.get('/results/:id', (req, res) => {
  const data = getScanResult(req.params.id);
  if (!data) {
    return res.status(404).json({ message: '找不到掃描結果' });
  }
  res.json(data);
});

module.exports = router;
