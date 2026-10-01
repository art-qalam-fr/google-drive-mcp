// Upload un fichier local vers Drive via le serveur MCP google-drive (stdio JSON-RPC).
// Usage: node mcp-upload.cjs <localPath> <driveName> <fileId> <mime>
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const [localPath, driveName, fileId, mime] = process.argv.slice(2);
const content = fs.readFileSync(localPath, 'utf8');

const srv = spawn('node', [path.join(__dirname, 'index.js')], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
const pending = new Map();
let id = 0;

function send(method, params) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mid, method, params }) + '\n');
  });
}

srv.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch {}
  }
});

(async () => {
  await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'uploader', version: '1.0' } });
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const r = await send('tools/call', {
    name: 'write_file',
    arguments: { name: driveName, content, mime_type: mime, file_id: fileId }
  });
  console.log(JSON.stringify(r.result || r, null, 1).slice(0, 600));
  srv.kill();
  process.exit(0);
})();
