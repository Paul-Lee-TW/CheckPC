const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { verifyHostKey } = require('./hostKeys');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'CheckPC.ps1');
const CONFIG_PATH = path.join(__dirname, '..', 'scripts', 'config.json');

function sshExec(conn, cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Command timeout')), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err); }
      // Buffer raw chunks and decode once. Decoding per 'data' event with
      // d.toString() would split multi-byte UTF-8 (CJK) characters across
      // packet boundaries and silently corrupt them (U+FFFD).
      const outChunks = [];
      const errChunks = [];
      stream.on('data', (d) => { outChunks.push(d); });
      stream.stderr.on('data', (d) => { errChunks.push(d); });
      stream.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(outChunks).toString('utf8'),
          stderr: Buffer.concat(errChunks).toString('utf8'),
          code,
        });
      });
    });
  });
}

function sftpUpload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (err2) => {
        sftp.end();
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

function remoteScan({ host, port = 22, username, password }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const config = fs.readFileSync(CONFIG_PATH, 'utf-8');

    conn.on('ready', async () => {
      try {
        // Get remote temp path
        console.log(`[SSH] Connected to ${host}`);
        const tempResult = await sshExec(conn, 'echo %TEMP%', 5000);
        const remoteTmp = tempResult.stdout.trim().replace(/\\/g, '/');

        // Step 1: Upload script via SFTP
        console.log(`[SSH] Uploading script to ${host}...`);
        await sftpUpload(conn, SCRIPT_PATH, `${remoteTmp}/CheckPC_scan.ps1`);

        // Step 2: Upload config via SFTP (same directory as script, named config.json)
        await sftpUpload(conn, CONFIG_PATH, `${remoteTmp}/config.json`);

        // Step 3: Execute script (no -ConfigJson param, script reads config.json from its own directory)
        console.log(`[SSH] Running scan on ${host}...`);
        const runCmd = `powershell -ExecutionPolicy Bypass -File "%TEMP%\\CheckPC_scan.ps1"`;
        const result = await sshExec(conn, runCmd, 120000);

        // Step 4: Cleanup
        sshExec(conn, `powershell -Command "Remove-Item $env:TEMP\\CheckPC_scan.ps1,$env:TEMP\\config.json -EA SilentlyContinue"`, 5000)
          .catch(() => {})
          .finally(() => conn.end());

        const output = result.stdout.trim();
        if (!output) {
          throw new Error(`Empty output. stderr: ${result.stderr.substring(0, 300)}`);
        }

        // Clean and parse JSON — strip only control chars (0x00-0x1F, 0x7F),
        // keep printable non-ASCII so CJK computer names survive.
        const clean = output.replace(/[\x00-\x1F\x7F]/g, '');
        const parsed = JSON.parse(clean);
        console.log(`[SSH] Scan complete for ${host}: ${parsed.computerName}`);
        resolve(parsed);

      } catch (err) {
        conn.end();
        reject(new Error(`Scan failed: ${err.message}`));
      }
    });

    conn.on('error', (err) => {
      reject(new Error(`SSH connection failed: ${err.message}`));
    });

    const connectOpts = { host, port, username, password, readyTimeout: 15000 };
    // Host-key verification (TOFU by default). Disable with CHECKPC_SSH_VERIFY=false.
    if (process.env.CHECKPC_SSH_VERIFY !== 'false') {
      connectOpts.hostHash = 'sha256';
      connectOpts.hostVerifier = (hashedKey) => verifyHostKey(host, port, hashedKey);
    }
    conn.connect(connectOpts);
  });
}

module.exports = { remoteScan };
