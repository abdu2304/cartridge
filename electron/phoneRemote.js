'use strict';
// Phone Remote (0.9.94, owner's pick from the "make it OP" list): your phone as a remote for Cartridge on the TV.
// A page on this device, on your home network only, at an address with a secret in it (the QR code in Settings →
// Controls → Phone Remote). On it: your library with covers and search (Download, Show on TV), your downloads with
// their progress, and a remote (D-pad, A, B, X, Y, LT, RT, Start, Select) that steers Cartridge like a controller.
// No outside service is involved. Only the secret path answers, only devices on the local network, only small JSON
// bodies; it closes when turned off, when Cartridge closes, or after 3 hours with no phone. The secret and port are
// kept (config.phoneRemote) so a bookmark or home-screen icon keeps working; New Address makes a new secret.
// Plain Node (http). Tested in test/phoneRemote.test.js.
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const PADS = new Set(['up', 'down', 'left', 'right', 'accept', 'back', 'x', 'y', 'lt', 'rt', 'lb', 'rb', 'start', 'select']);

// the local network only: private IPv4 ranges, link-local, loopback, and IPv6 unique-local / link-local
function isLocal(addr) {
  const a = String(addr || '').replace(/^::ffff:/i, '');
  if (a === '::1' || /^fe80:/i.test(a) || /^f[cd][0-9a-f]{2}:/i.test(a)) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(a);
  if (!m) return false;
  const [x, y] = [Number(m[1]), Number(m[2])];
  return x === 10 || x === 127 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254) || (x === 100 && y >= 64 && y <= 127); // 100.64/10: Tailscale and carrier NAT
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal && isLocal(a.address)) out.push(a.address);
  return out;
}
const newSecret = () => crypto.randomBytes(16).toString('hex');

// ctx: { name, games({ q, offset }) -> { total, list }, downloads() -> list, download(romId), show(romId), pad(a),
//        cover(romId) -> { type, body } | null, seen() }
// -> Promise<{ urls, port, secret, close, phones() }>
function open(ctx, { secret = newSecret(), port = 0, host = '0.0.0.0', idleMs = 3 * 3600e3 } = {}) {
  const base = '/' + secret;
  const phones = new Map(); // address -> last request
  let idle = null;
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => close(), idleMs); idle.unref?.(); };
  const send = (res, code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const readJson = (req) => new Promise((ok, bad) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { s += c; if (s.length > 2048) { bad(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { bad(new Error('not JSON')); } });
    req.on('error', bad);
  });
  const server = http.createServer(async (req, res) => {
    try {
      if (!isLocal(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== base && !u.pathname.startsWith(base + '/')) { res.writeHead(404); return res.end(); }
      const p = u.pathname.slice(base.length) || '/';
      phones.set(req.socket.remoteAddress, Date.now()); touch(); ctx.seen?.();
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, PAGE(ctx.name || 'Cartridge'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && p === '/api/games') return send(res, 200, await ctx.games({ q: String(u.searchParams.get('q') || '').slice(0, 80), offset: Math.max(0, Number(u.searchParams.get('offset')) || 0) }));
      if (req.method === 'GET' && p === '/api/downloads') return send(res, 200, await ctx.downloads());
      const cv = /^\/api\/cover\/(-?\d+)$/.exec(p);
      if (req.method === 'GET' && cv) { const c = await ctx.cover(Number(cv[1])).catch(() => null); if (!c) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': c.type, 'Cache-Control': 'private, max-age=86400' }); return res.end(c.body); }
      if (req.method === 'POST' && /^\/api\/(download|show|pad)$/.test(p)) {
        if (!/^application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only' }); // a plain form from another page can't send JSON
        const b = await readJson(req);
        if (p === '/api/pad') { if (!PADS.has(b.a)) return send(res, 400, { error: 'unknown button' }); ctx.pad(b.a); return send(res, 200, { ok: true }); }
        const romId = Number(b.romId);
        if (!Number.isInteger(romId)) return send(res, 400, { error: 'romId' });
        if (p === '/api/download') { await ctx.download(romId); return send(res, 200, { ok: true }); }
        ctx.show(romId); return send(res, 200, { ok: true });
      }
      send(res, 404, { error: 'not found' });
    } catch (e) { try { send(res, 500, { error: String(e.message || e).slice(0, 200) }); } catch {} }
  });
  function close() { clearTimeout(idle); try { server.close(); server.closeAllConnections?.(); } catch {} ctx.closed?.(); }
  const listen = (p) => new Promise((ok, bad) => { server.once('error', bad); server.listen(p, host, () => { server.off('error', bad); ok(server.address().port); }); });
  return listen(port).catch(() => listen(0)).then((got) => {
    touch();
    return { urls: lanAddresses().map((a) => `http://${a}:${got}${base}`), port: got, secret, close, phones: () => [...phones.values()].filter((t) => Date.now() - t < 5 * 60e3).length };
  });
}

// the phone's page: one file, no outside scripts or fonts; dark, big touch targets, works on any phone browser
const PAGE = (name) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0c0d10"><meta name="apple-mobile-web-app-capable" content="yes"><title>${esc(name)} · Phone Remote</title><style>
*{box-sizing:border-box}html,body{margin:0;background:#0c0d10;color:#f4f4f5;font:16px/1.4 system-ui,-apple-system,sans-serif;-webkit-tap-highlight-color:transparent}
header{position:sticky;top:0;z-index:2;background:#0c0d10;padding:12px 14px 8px;padding-top:max(12px,env(safe-area-inset-top))}
h1{font-size:18px;margin:0 0 10px}nav{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#16171b;border-radius:12px;padding:4px}
nav button{font:inherit;font-weight:600;border:0;border-radius:9px;padding:10px 4px;background:none;color:#a9abb2}nav button.on{background:#f4f4f5;color:#0c0d10}
main{padding:8px 14px calc(24px + env(safe-area-inset-bottom))}input{width:100%;font:inherit;padding:12px 14px;border-radius:12px;border:1px solid #2a2c32;background:#16171b;color:inherit;margin-bottom:10px}
.g{display:flex;gap:12px;align-items:center;padding:8px;border-radius:12px;background:#16171b;margin-bottom:6px}.g img,.g .ph{flex:none;width:48px;height:64px;border-radius:6px;object-fit:cover;background:#2a2c32}
.g .m{flex:1;min-width:0}.g b{display:block;font-weight:600;overflow-wrap:anywhere}.g small{color:#a9abb2}.g .a{display:flex;flex-direction:column;gap:6px}
.btn{font:inherit;font-size:14px;font-weight:600;border:0;border-radius:10px;padding:9px 12px;background:#2a2c32;color:#f4f4f5;white-space:nowrap}.btn.p{background:#f4f4f5;color:#0c0d10}.btn:disabled{opacity:.5}
.pill{font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;background:rgba(63,185,80,.16);color:#7fe0a0}
.bar{height:6px;border-radius:3px;background:#2a2c32;overflow:hidden;margin-top:6px}.bar i{display:block;height:100%;background:#f4f4f5}
.e{color:#a9abb2;text-align:center;padding:28px 8px}.more{width:100%;margin-top:6px}
.pad{display:grid;gap:14px;justify-items:center;padding-top:6px;user-select:none;-webkit-user-select:none}.row{display:flex;gap:10px;justify-content:center;width:100%}
.k{font:inherit;font-weight:700;border:0;border-radius:14px;background:#1f2025;color:#f4f4f5;min-width:64px;min-height:56px;padding:0 14px;touch-action:manipulation}.k:active{background:#f4f4f5;color:#0c0d10}
.d{display:grid;grid-template-columns:repeat(3,76px);grid-template-rows:repeat(3,76px);gap:6px}.d .k{min-width:0;font-size:22px}
.f{display:grid;grid-template-columns:repeat(3,72px);grid-template-rows:repeat(3,72px);gap:6px}.f .k{border-radius:50%;min-width:0;font-size:20px}
#t{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#f4f4f5;color:#0c0d10;padding:10px 16px;border-radius:12px;font-weight:600;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw}#t.on{opacity:1}
</style></head><body><header><h1>${esc(name)}</h1><nav><button data-v="lib" class="on">Library</button><button data-v="dl">Downloads</button><button data-v="pad">Remote</button></nav></header>
<main><section id="lib"><input id="q" type="search" placeholder="Search your games" autocomplete="off"><div id="gl"></div><button id="more" class="btn more" hidden>Show More</button></section>
<section id="dl" hidden><div id="dll"></div></section>
<section id="pad" hidden><div class="pad"><div class="row"><button class="k" data-a="lt">LT</button><button class="k" data-a="lb">LB</button><button class="k" data-a="rb">RB</button><button class="k" data-a="rt">RT</button></div>
<div class="d"><span></span><button class="k" data-a="up" aria-label="Up">▲</button><span></span><button class="k" data-a="left" aria-label="Left">◀</button><span></span><button class="k" data-a="right" aria-label="Right">▶</button><span></span><button class="k" data-a="down" aria-label="Down">▼</button><span></span></div>
<div class="f"><span></span><button class="k" data-a="y">Y</button><span></span><button class="k" data-a="x">X</button><span></span><button class="k" data-a="back">B</button><span></span><button class="k" data-a="accept">A</button><span></span></div>
<div class="row"><button class="k" data-a="select">Select</button><button class="k" data-a="start">Start</button></div></div></section></main><div id="t"></div>
<script>
const B=location.pathname.replace(/\\/$/,''),$=(s)=>document.querySelector(s),T=(m)=>{const t=$('#t');t.textContent=m;t.classList.add('on');clearTimeout(T.h);T.h=setTimeout(()=>t.classList.remove('on'),2200)};
const H=(s)=>String(s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=async(p)=>{const r=await fetch(B+p,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json()};
const post=async(p,b)=>{const r=await fetch(B+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Cartridge said no ('+r.status+')'));return j};
const im=(id)=>'<img loading="lazy" alt="" src="'+B+'/api/cover/'+id+'" onerror="this.replaceWith(Object.assign(document.createElement(\\'div\\'),{className:\\'ph\\'}))">';
const size=(n)=>n>=1e9?(n/1e9).toFixed(1)+' GB':n>=1e6?Math.round(n/1e6)+' MB':n?Math.round(n/1e3)+' KB':'';
let view='lib',off=0,q='',timer=null,dlT=null;
document.querySelectorAll('nav button').forEach((b)=>b.onclick=()=>show(b.dataset.v));
function show(v){view=v;document.querySelectorAll('nav button').forEach((b)=>b.classList.toggle('on',b.dataset.v===v));['lib','dl','pad'].forEach((s)=>$('#'+s).hidden=s!==v);clearInterval(dlT);if(v==='dl'){loadDl();dlT=setInterval(loadDl,1500)}}
async function loadGames(more){try{const r=await get('/api/games?q='+encodeURIComponent(q)+'&offset='+off);const gl=$('#gl');if(!more)gl.innerHTML='';
if(!r.list.length&&!more)gl.innerHTML='<div class="e">'+(q?'No games match.':'Your library is empty.')+'</div>';
for(const g of r.list){const d=document.createElement('div');d.className='g';d.innerHTML=im(g.id)+'<div class="m"><b>'+H(g.name)+'</b><small>'+H(g.platform)+(g.size?' · '+size(g.size):'')+'</small></div><div class="a">'+(g.installed?'<span class="pill">On Device</span>':'<button class="btn p" data-d>Download</button>')+'<button class="btn" data-s>Show on TV</button></div>';
const dl=d.querySelector('[data-d]');if(dl)dl.onclick=async()=>{dl.disabled=true;try{await post('/api/download',{romId:g.id});dl.textContent='Queued';T('Downloading '+g.name)}catch(e){dl.disabled=false;T(e.message)}};
d.querySelector('[data-s]').onclick=async()=>{try{await post('/api/show',{romId:g.id});T('Showing it on '+${JSON.stringify(esc(name))})}catch(e){T(e.message)}};gl.appendChild(d)}
off+=r.list.length;$('#more').hidden=off>=r.total}catch(e){$('#gl').innerHTML='<div class="e">Cartridge can’t be reached. Is Phone Remote still on?</div>'}}
$('#q').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{q=$('#q').value.trim();off=0;loadGames(false)},250)};$('#more').onclick=()=>loadGames(true);
async function loadDl(){try{const l=await get('/api/downloads');const el=$('#dll');if(!l.length){el.innerHTML='<div class="e">Nothing downloading. Pick a game in Library.</div>';return}
el.innerHTML=l.map((d)=>{const pct=d.total?Math.min(100,Math.round(d.received/d.total*100)):0;const st={downloading:pct+'%'+(d.speed?' · '+size(d.speed)+'/s':''),queued:'Waiting',done:'Done',error:'Failed',cancelled:'Paused'}[d.status]||d.status;
return '<div class="g">'+im(d.romId)+'<div class="m"><b>'+H(d.name)+'</b><small>'+H(st)+(d.error?' · '+H(d.error):'')+'</small>'+(d.status==='downloading'||d.status==='queued'?'<div class="bar"><i style="width:'+pct+'%"></i></div>':'')+'</div></div>'}).join('')}catch(e){}}
document.querySelectorAll('[data-a]').forEach((k)=>{const go=(e)=>{e.preventDefault();navigator.vibrate&&navigator.vibrate(12);post('/api/pad',{a:k.dataset.a}).catch((x)=>T(x.message))};k.addEventListener('pointerdown',go)});
loadGames(false);
</script></body></html>`;
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

module.exports = { open, isLocal, lanAddresses, newSecret, PADS };
