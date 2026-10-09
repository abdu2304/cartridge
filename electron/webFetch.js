// Requests to outside services (GitHub, RetroAchievements, rpcs3.net, GameBanana, PPSSPP...), 0.9.17.
// Several sit behind Cloudflare-style bot checks that answer 403 to Node's own HTTP client; Electron's
// net.fetch goes through Chromium's network stack, as a browser does. RomM keeps using plain fetch
// (its own server, often a self-signed or LAN address). Outside Electron (tests) it is plain fetch.
//
// 0.9.19 (owner: no 403s accepted): when a site still answers 403, 429 or 503 with a browser check,
// Cartridge loads the address once in a hidden browser window, the way a person's browser passes the
// check (it runs the page's script and keeps the cookie it gets), then asks again with that cookie.
// A text or JSON answer is read straight from that window when the second try still fails.
let electron = null;
if (process.versions.electron) try { electron = require('electron'); if (typeof electron.net?.fetch !== 'function') electron = null; } catch { electron = null; }

const BLOCKED = new Set([403, 429, 503]);
const looksChecked = (r) => !!(r && BLOCKED.has(r.status) && (r.headers.get('cf-mitigated') || r.headers.get('cf-ray') || /cloudflare|ddos-guard|akamai/i.test(r.headers.get('server') || '')));
let queue = Promise.resolve();
// one hidden window at a time; resolves with the page's text (JSON pages show as text) or null
function viaWindow(url, headers = {}, wait = 25000) {
  const run = () => new Promise((resolve) => {
    const { BrowserWindow } = electron;
    let win = null, done = false;
    const end = (v) => { if (done) return; done = true; clearTimeout(timer); try { win?.destroy(); } catch {} resolve(v); };
    const timer = setTimeout(() => end(null), wait);
    try {
      win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { sandbox: true, contextIsolation: true, javascript: true, images: false } });
      const extra = Object.entries(headers).filter(([k]) => !/^user-agent$/i.test(k)).map(([k, v]) => `${k}: ${v}`).join('\n');
      const read = async () => {
        if (done) return;
        try {
          const title = await win.webContents.executeJavaScript('document.title', true);
          if (/just a moment|attention required|checking your browser|ddos/i.test(title || '')) return; // the check reloads the page when it passes
          end(await win.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true));
        } catch { end(null); }
      };
      win.webContents.on('did-finish-load', () => setTimeout(read, 300));
      win.webContents.on('did-fail-load', (_e, code) => { if (code !== -3) end(null); }); // -3: aborted by a redirect
      win.loadURL(url, extra ? { extraHeaders: extra } : {}).catch(() => {});
    } catch { end(null); }
  });
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

async function webFetch(url, opts = {}) {
  if (!electron || !electron.app.isReady()) return fetch(url, opts);
  const { net } = electron;
  const go = () => net.fetch(url, { ...opts, credentials: 'include' });
  let r = null, err = null;
  try { r = await go(); } catch (e) { err = e; }
  if (r && !BLOCKED.has(r.status)) return r;
  if (err && opts.signal?.aborted) throw err;
  // only plain GETs can be handed to a window
  if ((opts.method || 'GET').toUpperCase() !== 'GET') { if (r) return r; throw named(err, url); }
  const headers = opts.headers instanceof Headers ? Object.fromEntries(opts.headers) : (opts.headers || {});
  if (!r || looksChecked(r)) { // a rate limit (GitHub's API) is not a check: its own fallbacks handle it
    const text = await viaWindow(url, headers);
    // passed the check: the session now has its cookie, so the real request works (binary answers too)
    try { const again = await go(); if (!BLOCKED.has(again.status)) return again; } catch {}
    if (text != null && text !== '') return new Response(text, { status: 200, headers: { 'content-type': /^\s*[[{]/.test(text) ? 'application/json' : 'text/plain' } });
  }
  if (r) return r;
  throw named(err, url);
}
// 0.9.63: a network failure names the site ("objects.githubusercontent.com couldn't be reached (ERR_ADDRESS_UNREACHABLE)")
function named(err, url) {
  let host = ''; try { host = new URL(url).host; } catch {}
  const m = String(err?.message || err);
  if (!host || m.includes(host) || !/ERR_|ENOTFOUND|EAI_AGAIN|ECONN|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|fetch failed/.test(m)) return err;
  return Object.assign(new Error(`${host} couldn’t be reached (${m.replace(/^net::/, '')})`), { cause: err, code: err?.code });
}
module.exports = webFetch;
module.exports.viaWindow = (u, h) => (electron ? viaWindow(u, h) : Promise.resolve(null));
