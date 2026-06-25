const express = require('express');
const path = require('path');
const fs = require('fs');
try { require('dotenv').config(); } catch(e) {}

const app = express();
const PORT = process.env.PORT || 3001;

// Support both normal and Electron packaged paths
const ROOT = process.env.CHECKPC_ROOT || path.join(__dirname, '..');

// Writable data directory for persisted state (inventory / batches / audit log).
// Created here as the foundation for upcoming batch-scan persistence (wired in
// later milestones). Must NOT be inside the app dir: Electron's app.asar is
// read-only when packaged. electron/main.js sets CHECKPC_DATA to
// app.getPath('userData'); otherwise it defaults to ./data.
const DATA = process.env.CHECKPC_DATA || path.join(ROOT, 'data');
try {
  fs.mkdirSync(DATA, { recursive: true });
} catch (e) {
  console.error('[CheckPC] 無法建立資料目錄:', e.message);
}

app.use(express.json({ limit: '10mb' }));

// --- Routes ---
const scanRoutes = require('./routes/scan');
const batchRoutes = require('./routes/batch');
const settingsRoutes = require('./routes/settings');
const auditRoutes = require('./routes/audit');
const auditLogRoutes = require('./routes/auditLog');

// Mount the more specific /api/scan/batch before /api/scan.
app.use('/api/scan/batch', batchRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/audit', auditRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
const distPath = path.join(ROOT, 'frontend', 'dist');
app.use(express.static(distPath));
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Error handling
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// Bind to loopback by default — the web UI is used locally (Electron / local
// browser); SSH scanning reaches out to targets. This keeps the unauthenticated
// API off the LAN. Set HOST=0.0.0.0 to opt into LAN access (not recommended).
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`[CheckPC] Server running on http://localhost:${PORT}`);
});
