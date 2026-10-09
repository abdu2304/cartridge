// Send text from your phone (0.9.64, owner: "is there a way to put in the GitHub link much easier, like sending it from
// my phone"). Cartridge opens a tiny page on this device for a few minutes; the QR code it shows holds its address on
// your home network and a one-time secret. The phone opens it, pastes the link, presses Send, and the text arrives in
// Cartridge. No outside service is involved. Only that secret path answers, only short text is taken, and the page
// closes after the first text or after 10 minutes. Plain Node (http), tested in test/phoneLink.test.js.
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const PAGE = (title) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Send to Cartridge</title><style>
body{margin:0;font:16px system-ui,sans-serif;background:#111214;color:#f2f2f4;display:grid;place-items:center;min-height:100vh}
main{width:min(92vw,520px);display:grid;gap:14px;padding:16px}h1{font-size:22px;margin:0}p{margin:0;color:#a9abb2}
textarea{width:100%;box-sizing:border-box;min-height:120px;font:inherit;padding:12px;border-radius:12px;border:1px solid #3a3b40;background:#1c1d21;color:inherit}
button{font:inherit;font-weight:600;padding:14px;border-radius:12px;border:0;background:#f2f2f4;color:#111214}
.ok{color:#7fe0a0}</style></head><body><main><h1>Send to Cartridge</h1><p>${title}</p>
<textarea id="t" placeholder="Paste here" autofocus></textarea><button id="b">Send</button><p id="s"></p></main>
<script>b.onclick=async()=>{const v=t.value.trim();if(!v)return;b.disabled=true;
try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'text/plain'},body:v});
s.textContent=r.ok?'Sent. You can close this page.':'Cartridge has closed this page. Open it again from Cartridge.';s.className=r.ok?'ok':''}catch(e){s.textContent='It didn’t arrive. Check you’re on the same network.'}}</script></body></html>`;

// this device's addresses on the local network (IPv4, not loopback)
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
  return out;
}
// -> { urls, close } ; onText(text) is called once with what the phone sent
function open({ title = 'Paste the link and press Send.', onText, ttl = 10 * 60e3, maxBytes = 4096, host = '0.0.0.0' } = {}) {
  const secret = crypto.randomBytes(16).toString('hex'), at = '/' + secret;
  let done = false, timer = null;
  const server = http.createServer((req, res) => {
    if (req.url !== at || done) { res.writeHead(404); return res.end(); }
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); return res.end(PAGE(title)); }
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    let body = '', big = false;
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > maxBytes) { big = true; req.destroy(); } });
    req.on('end', () => {
      if (big || done) { res.writeHead(413); return res.end(); }
      const text = body.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim();
      if (!text) { res.writeHead(400); return res.end(); }
      done = true; res.writeHead(200); res.end('ok');
      try { onText?.(text); } finally { close(); }
    });
  });
  function close() { clearTimeout(timer); try { server.close(); } catch {} }
  return new Promise((ok, bad) => {
    server.once('error', bad);
    server.listen(0, host, () => {
      const port = server.address().port;
      timer = setTimeout(close, ttl); timer.unref?.();
      ok({ urls: (host === '0.0.0.0' ? lanAddresses() : [host]).map((ip) => `http://${ip}:${port}${at}`), port, close });
    });
  });
}
module.exports = { open, lanAddresses };
