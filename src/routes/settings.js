const { Router } = require('express');
const configStore = require('../services/configStore');

const router = Router();

// GET /api/settings — 取得目前設定（讀可寫的使用者設定，首次從內建範本 seed）
router.get('/', (_req, res) => {
  try {
    res.json(configStore.readConfig());
  } catch (err) {
    res.status(500).json({ message: `讀取設定失敗: ${err.message}` });
  }
});

// PUT /api/settings — 更新設定（寫入 CHECKPC_DATA，避開唯讀 asar）
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

    configStore.writeConfig(newConfig);
    console.log('[Settings] 設定已更新');
    res.json({ message: '設定已儲存', config: newConfig });
  } catch (err) {
    res.status(500).json({ message: `儲存設定失敗: ${err.message}` });
  }
});

module.exports = router;
