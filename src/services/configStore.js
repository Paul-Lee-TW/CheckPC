const fs = require('fs');
const path = require('path');
const { dataDir } = require('./persistence');

// The audit policy (config.json) must be WRITABLE, but the bundled copy lives
// inside the app dir — read-only when packaged in Electron's app.asar. So the
// editable copy lives under the writable data dir (CHECKPC_DATA), seeded from
// the bundled template on first run. Reads prefer the user copy, else bundled.

const BUNDLED = path.join(__dirname, '..', 'scripts', 'config.json');
const DEFAULT_CONFIG = { approvedSoftware: [], remoteCommKeywords: [], blockedSites: [], folderRules: [] };

function userConfigPath() {
  return path.join(dataDir(), 'config.json');
}

// Ensure a writable user config exists (seed from bundle on first run).
// Returns the writable path; logs and continues if seeding fails.
function ensureUserConfig() {
  const target = userConfigPath();
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(BUNDLED)) {
        fs.copyFileSync(BUNDLED, target);
      } else {
        fs.writeFileSync(target, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      }
    }
  } catch (e) {
    console.error('[Config] 無法初始化使用者設定:', e.message);
  }
  return target;
}

// Path to read the effective config from (user copy if present, else bundled).
// Used by sshScanner (SFTP upload) and the /api/audit/config download.
function effectiveConfigPath() {
  const p = userConfigPath();
  return fs.existsSync(p) ? p : BUNDLED;
}

function readConfig() {
  const p = ensureUserConfig();
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    try { return JSON.parse(fs.readFileSync(BUNDLED, 'utf8')); } catch { return { ...DEFAULT_CONFIG }; }
  }
}

function writeConfig(obj) {
  const p = userConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
  return p;
}

module.exports = { BUNDLED, userConfigPath, effectiveConfigPath, ensureUserConfig, readConfig, writeConfig };
