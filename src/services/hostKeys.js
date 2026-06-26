const fs = require('fs');
const path = require('path');

// SSH host-key pinning (known_hosts) under the writable data dir.
// Default policy: trust-on-first-use (TOFU) — the first connection to a host
// pins its key fingerprint; later connections must match, so a changed key
// (possible MITM / reinstall) is rejected. Env overrides:
//   CHECKPC_SSH_VERIFY=false  -> verification disabled entirely (legacy behavior)
//   CHECKPC_SSH_STRICT=true   -> reject unknown hosts (no TOFU; must be pre-pinned)

function dataDir() {
  return process.env.CHECKPC_DATA || path.join(__dirname, '..', '..', 'data');
}
function knownHostsPath() {
  return path.join(dataDir(), 'known_hosts.json');
}

function read() {
  try {
    if (!fs.existsSync(knownHostsPath())) return {};
    const d = JSON.parse(fs.readFileSync(knownHostsPath(), 'utf8'));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch (e) {
    console.error('[HostKeys] read 失敗:', e.message);
    return {};
  }
}

function write(map) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(knownHostsPath(), JSON.stringify(map, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[HostKeys] write 失敗:', e.message);
    return false;
  }
}

/**
 * 驗證主機金鑰。回傳 true 接受、false 拒絕（拒絕會使 SSH 連線失敗）。
 * @param {string} host
 * @param {number} port
 * @param {string} hashedKey - sha256 指紋（由 ssh2 hostHash 提供）
 * @param {object} [opts] - { strict?: boolean } 覆寫環境變數
 */
function verifyHostKey(host, port, hashedKey, opts = {}) {
  const strict = opts.strict !== undefined
    ? opts.strict
    : process.env.CHECKPC_SSH_STRICT === 'true';

  const key = `${host}:${port}`;
  const map = read();
  const known = map[key];

  if (!known) {
    if (strict) return false; // 嚴格模式：未知主機一律拒絕
    map[key] = hashedKey;
    write(map); // TOFU：首次釘選
    return true;
  }
  return known === hashedKey;
}

module.exports = { verifyHostKey, read, write, knownHostsPath };
