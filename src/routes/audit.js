const express = require('express');
const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const router = Router();

// POST /api/audit/upload — 手動上傳掃描 JSON (accepts raw text body)
router.post('/upload', express.text({ type: '*/*', limit: '10mb' }), (req, res) => {
  try {
    let text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    // Remove BOM and null bytes
    text = text.replace(/\uFEFF/g, '').replace(/\0/g, '').trim();

    const scanData = JSON.parse(text);

    if (!scanData || !scanData.items) {
      return res.status(400).json({ message: 'Invalid scan data format' });
    }

    const id = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    res.json({ id, result: { ...scanData, _scanId: id } });
  } catch (err) {
    res.status(500).json({ message: `Upload failed: ${err.message}` });
  }
});

// POST /api/audit/upload-file — 上傳檔案（後端處理編碼）
router.post('/upload-file', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  try {
    const buf = Buffer.from(req.body);
    let text = '';

    // Detect encoding
    if (buf[0] === 0xFF && buf[1] === 0xFE) {
      // UTF-16 LE
      text = buf.toString('utf16le');
    } else if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      // UTF-8 with BOM
      text = buf.toString('utf-8');
    } else {
      text = buf.toString('utf-8');
    }

    // Clean up
    text = text.replace(/\uFEFF/g, '').replace(/\0/g, '').trim();
    const scanData = JSON.parse(text);

    if (!scanData || !scanData.items) {
      return res.status(400).json({ message: 'Invalid scan data format' });
    }

    const id = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    res.json({ id, result: { ...scanData, _scanId: id } });
  } catch (err) {
    res.status(500).json({ message: `Parse failed: ${err.message}` });
  }
});

// GET /api/audit/script — 下載 PowerShell 腳本
router.get('/script', (_req, res) => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'CheckPC.ps1');
  if (fs.existsSync(scriptPath)) {
    res.download(scriptPath, 'CheckPC.ps1');
  } else {
    res.status(404).json({ message: '找不到腳本檔案' });
  }
});

// GET /api/audit/config — 下載設定檔
router.get('/config', (_req, res) => {
  const configPath = path.join(__dirname, '..', 'scripts', 'config.json');
  if (fs.existsSync(configPath)) {
    res.download(configPath, 'config.json');
  } else {
    res.status(404).json({ message: '找不到設定檔' });
  }
});

module.exports = router;
