const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const router = Router();
const CONFIG_PATH = path.join(__dirname, '..', 'scripts', 'config.json');

// GET /api/settings — 取得目前設定
router.get('/', (_req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: `讀取設定失敗: ${err.message}` });
  }
});

// PUT /api/settings — 更新設定
router.put('/', (req, res) => {
  try {
    const newConfig = req.body;

    // 驗證必要欄位
    if (!newConfig.approvedSoftware || !Array.isArray(newConfig.approvedSoftware)) {
      return res.status(400).json({ message: '缺少 approvedSoftware 欄位' });
    }
    if (!newConfig.blockedSites || !Array.isArray(newConfig.blockedSites)) {
      return res.status(400).json({ message: '缺少 blockedSites 欄位' });
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
    console.log('[Settings] 設定已更新');
    res.json({ message: '設定已儲存', config: newConfig });
  } catch (err) {
    res.status(500).json({ message: `儲存設定失敗: ${err.message}` });
  }
});

module.exports = router;
