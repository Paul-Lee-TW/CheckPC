const { spawn } = require('child_process');
const path = require('path');

// Per-host orchestration for remotely enabling OpenSSH. Spawns the PowerShell
// host script on the (Windows) admin machine, feeding the password via STDIN so
// it never lands in argv/logs. Returns a password-free result object.
// On non-Windows the feature is unavailable -> returns a clear 'unsupported'.

const HOST_SCRIPT = path.join(__dirname, '..', 'scripts', 'Enable-OpenSSH-Host.ps1');

function enableSshHost({ host, port = 22, username, password, allowedSource = 'Any', timeoutSec = 90 }) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({
        host, status: 'error', channel: null, sshVersion: null,
        error: { type: 'unsupported', message: '遠端啟用 OpenSSH 僅能在 Windows 管理機上執行' },
      });
    }

    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', HOST_SCRIPT,
      '-ComputerName', host,
      '-Username', username,
      '-AllowedSource', allowedSource,
      '-TimeoutSec', String(timeoutSec),
    ];

    let child;
    try {
      child = spawn('powershell', args, { windowsHide: true });
    } catch (e) {
      return resolve({ host, status: 'error', channel: null, sshVersion: null, error: { type: 'spawn', message: e.message } });
    }

    let out = '';
    let err = '';
    const killer = setTimeout(() => { try { child.kill(); } catch {} }, (timeoutSec + 60) * 1000);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(killer);
      resolve({ host, status: 'error', channel: null, sshVersion: null, error: { type: 'spawn', message: e.message } });
    });
    child.on('close', () => {
      clearTimeout(killer);
      const line = out.trim().split(/\r?\n/).filter(Boolean).pop();
      try {
        const parsed = JSON.parse(line);
        resolve({ host, channel: null, sshVersion: null, error: null, ...parsed });
      } catch {
        resolve({
          host, status: 'error', channel: null, sshVersion: null,
          error: { type: 'parse', message: (err || out || 'no output').slice(0, 300) },
        });
      }
    });

    // Feed the password via stdin only (never argv / env / disk).
    try {
      child.stdin.write((password || '') + '\n');
      child.stdin.end();
    } catch { /* child.on('error') handles it */ }
  });
}

module.exports = { enableSshHost };
