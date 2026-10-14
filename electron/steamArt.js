// Steam integration: find/add Cartridge's non-Steam shortcut and install its library artwork.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

// ---------- binary VDF (shortcuts.vdf)
function parseVdf(buf) {
  let i = 0;
  const cstr = () => { const e = buf.indexOf(0, i); const s = buf.toString('utf8', i, e); i = e + 1; return s; };
  const map = () => {
    const obj = {};
    for (;;) {
      const t = buf[i++];
      if (t === 0x08 || t === undefined) return obj;
      const k = cstr();
      if (t === 0x00) obj[k] = map();
      else if (t === 0x01) obj[k] = cstr();
      else if (t === 0x02) { obj[k] = buf.readUInt32LE(i); i += 4; }
      else if (t === 0x07) { obj[k] = buf.readBigUInt64LE(i); i += 8; }
      else throw new Error('Unknown VDF type ' + t);
    }
  };
  return map();
}
function writeVdf(obj) {
  const parts = [];
  const str = (s) => parts.push(Buffer.from(String(s) + '\0', 'utf8'));
  const walk = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && typeof v !== 'bigint') { parts.push(Buffer.from([0x00])); str(k); walk(v); parts.push(Buffer.from([0x08])); }
      else if (typeof v === 'number') { parts.push(Buffer.from([0x02])); str(k); const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); parts.push(b); }
      else if (typeof v === 'bigint') { parts.push(Buffer.from([0x07])); str(k); const b = Buffer.alloc(8); b.writeBigUInt64LE(v); parts.push(b); }
      else { parts.push(Buffer.from([0x01])); str(k); str(v ?? ''); }
    }
  };
  walk(obj);
  parts.push(Buffer.from([0x08]));
  return Buffer.concat(parts);
}

// Steam's id for a non-Steam shortcut: crc32(exe + name) with the top bit set
function crc32(str) {
  let c, crc = 0xffffffff;
  for (const byte of Buffer.from(str, 'utf8')) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const shortcutId = (exe, name) => (crc32(exe + name) | 0x80000000) >>> 0;

function steamRoots() {
  const h = os.homedir();
  const seen = new Set();
  return [path.join(h, '.local/share/Steam'), path.join(h, '.steam/steam'), path.join(h, '.var/app/com.valvesoftware.Steam/data/Steam')]
    .filter((p) => fs.existsSync(path.join(p, 'userdata')))
    .filter((p) => { const r = fs.realpathSync(p); if (seen.has(r)) return false; seen.add(r); return true; });
}
function steamUsers(root) {
  return fs.readdirSync(path.join(root, 'userdata')).filter((u) => /^\d+$/.test(u) && u !== '0' && fs.existsSync(path.join(root, 'userdata', u, 'config')));
}
function isCartridge(sc) { return /cartridge/i.test(`${sc.AppName || sc.appname || ''} ${sc.Exe || sc.exe || ''}`); }

function installArt(grid, appid, artDir) {
  fs.mkdirSync(grid, { recursive: true });
  const map = { 'grid.png': `${appid}p.png`, 'wide.png': `${appid}.png`, 'hero.png': `${appid}_hero.png`, 'logo.png': `${appid}_logo.png` };
  for (const [src, dst] of Object.entries(map)) fs.writeFileSync(path.join(grid, dst), fs.readFileSync(path.join(artDir, src)));
  const icon = path.join(grid, `${appid}_icon.png`);
  fs.writeFileSync(icon, fs.readFileSync(path.join(artDir, 'icon.png')));
  return icon;
}

function applySteamArt(artDir) {
  const done = [];
  for (const root of steamRoots()) {
    for (const uid of steamUsers(root)) {
      const vdf = path.join(root, 'userdata', uid, 'config', 'shortcuts.vdf');
      if (!fs.existsSync(vdf)) continue;
      let data;
      try { data = parseVdf(fs.readFileSync(vdf)); } catch { continue; }
      for (const sc of Object.values(data.shortcuts || data.Shortcuts || {})) {
        if (!isCartridge(sc)) continue;
        const appid = sc.appid >>> 0;
        installArt(path.join(root, 'userdata', uid, 'config', 'grid'), appid, artDir);
        done.push({ user: uid, appid, name: sc.AppName });
      }
    }
  }
  return done;
}

// Steam saves its own copy of shortcuts.vdf when it exits, so writing while it runs gets undone.
// Look at every process (name and command line) plus Steam's pid file, not just one pgrep pattern.
function steamRunning() {
  const me = String(process.pid);
  let procOk = true;
  try {
    for (const pid of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pid) || pid === me) continue;
      let comm = '', cmd = '';
      try { comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { continue; }
      if (comm === 'steam' || comm === 'steamwebhelper' || comm === 'steam.sh') return true;
      try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0]; } catch {}
      if (/(ubuntu12_32|ubuntu12_64)\/steam(webhelper)?$|\/steam\.sh$/.test(cmd)) return true;
    }
  } catch { procOk = false; }
  for (const f of [path.join(os.homedir(), '.steam/steam.pid'), path.join(os.homedir(), '.var/app/com.valvesoftware.Steam/.steam/steam.pid')]) {
    try { const pid = parseInt(fs.readFileSync(f, 'utf8'), 10); if (pid > 1) { process.kill(pid, 0); return true; } } catch {}
  }
  if (procOk) return false; // every process was looked at: pgrep (a blocking process start, 20 to 80 ms) only when /proc couldn't be read
  try { execSync('pgrep -x steam || pgrep -x steamwebhelper', { stdio: 'ignore' }); return true; } catch { return false; }
}
function waitForSteamExit(ms) {
  const end = Date.now() + ms;
  return new Promise((resolve) => {
    const t = setInterval(() => { if (!steamRunning() || Date.now() > end) { clearInterval(t); resolve(!steamRunning()); } }, 500);
  });
}

// Add (or refresh) the Cartridge shortcut for every Steam user, then install artwork.
async function addToSteam({ exe, artDir, restartSteam }) {
  if (!exe) throw new Error('This only works from the AppImage build.');
  const roots = steamRoots();
  if (!roots.length) throw new Error('Steam was not found on this device.');
  const wasRunning = steamRunning();
  if (wasRunning) {
    if (!restartSteam) return { needsRestart: true };
    try { spawn('steam', ['-shutdown'], { detached: true, stdio: 'ignore' }).unref(); } catch {}
    if (!(await waitForSteamExit(30000))) throw new Error('Steam did not close. Close it and try again.');
  }
  const name = 'Cartridge';
  const results = [];
  for (const root of roots) {
    // Flatpak Steam runs shortcuts in its sandbox: Cartridge starts on the system through
    // flatpak-spawn --host instead (0.9.3 K, K2; Steam needs the Flatpak permission, see Issues)
    const fp = root.includes('com.valvesoftware.Steam');
    const quotedExe = fp ? '"/usr/bin/flatpak-spawn"' : `"${exe}"`;
    const launchOptions = fp ? `--host --directory="${path.dirname(exe)}" "${exe}"` : '';
    const appid = shortcutId(quotedExe, name);
    for (const uid of steamUsers(root)) {
      const cfg = path.join(root, 'userdata', uid, 'config');
      const vdf = path.join(cfg, 'shortcuts.vdf');
      let data = { shortcuts: {} };
      if (fs.existsSync(vdf)) {
        try { data = parseVdf(fs.readFileSync(vdf)); } catch { throw new Error('Could not read Steam shortcuts file'); }
        fs.copyFileSync(vdf, vdf + '.cartridge-backup');
      }
      const list = data.shortcuts || data.Shortcuts || (data.shortcuts = {});
      const icon = installArt(path.join(cfg, 'grid'), appid, artDir);
      let entry = Object.values(list).find(isCartridge);
      const fields = {
        appid, AppName: name, Exe: quotedExe, StartDir: `"${path.dirname(exe)}"`, icon, ShortcutPath: '', LaunchOptions: launchOptions,
        IsHidden: 0, AllowDesktopConfig: 1, AllowOverlay: 1, OpenVR: 0, Devkit: 0, DevkitGameID: '', DevkitOverrideAppID: 0,
        LastPlayTime: 0, FlatpakAppID: '', tags: {},
      };
      if (entry) {
        const oldId = entry.appid >>> 0;
        Object.assign(entry, fields, { tags: entry.tags || {} });
        if (oldId !== appid) installArt(path.join(cfg, 'grid'), appid, artDir);
      } else {
        // next free key: Steam's numbering can have gaps, and reusing a key would replace a shortcut
        const idx = String(Object.keys(list).reduce((m, k) => Math.max(m, /^\d+$/.test(k) ? Number(k) + 1 : m), 0));
        list[idx] = fields;
      }
      fs.mkdirSync(cfg, { recursive: true });
      fs.writeFileSync(vdf, writeVdf(data.shortcuts ? { shortcuts: data.shortcuts } : data));
      results.push({ user: uid, appid });
    }
  }
  if (wasRunning) { try { spawn('steam', [], { detached: true, stdio: 'ignore' }).unref(); } catch {} }
  return { added: results, restarted: wasRunning };
}

// Is Cartridge in Steam already (any account)? For Settings → Steam (0.9.3 L)
function cartridgeInSteam() {
  for (const root of steamRoots()) for (const uid of steamUsers(root)) {
    try { const d = parseVdf(fs.readFileSync(path.join(root, 'userdata', uid, 'config', 'shortcuts.vdf'))); if (Object.values(d.shortcuts || d.Shortcuts || {}).some(isCartridge)) return true; } catch {}
  }
  return false;
}

module.exports = { cartridgeInSteam, applySteamArt, addToSteam, parseVdf, writeVdf, shortcutId, steamRunning };
