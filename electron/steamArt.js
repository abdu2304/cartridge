// Finds Cartridge's non-Steam shortcut in shortcuts.vdf and drops custom artwork into Steam's grid folder.
const fs = require('fs');
const path = require('path');
const os = require('os');

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

function steamRoots() {
  const h = os.homedir();
  return [
    path.join(h, '.local/share/Steam'),
    path.join(h, '.steam/steam'),
    path.join(h, '.var/app/com.valvesoftware.Steam/data/Steam'),
  ].filter((p) => fs.existsSync(path.join(p, 'userdata')));
}

function applySteamArt(artDir) {
  const done = [];
  const seen = new Set();
  for (const root of steamRoots()) {
    const real = fs.realpathSync(root);
    if (seen.has(real)) continue;
    seen.add(real);
    for (const uid of fs.readdirSync(path.join(root, 'userdata'))) {
      const vdf = path.join(root, 'userdata', uid, 'config', 'shortcuts.vdf');
      if (!fs.existsSync(vdf)) continue;
      let data;
      try { data = parseVdf(fs.readFileSync(vdf)); } catch { continue; }
      const list = Object.values(data.shortcuts || data.Shortcuts || {});
      for (const sc of list) {
        const name = sc.AppName || sc.appname || '';
        const exe = sc.Exe || sc.exe || '';
        if (!/cartridge/i.test(name + ' ' + exe)) continue;
        const appid = (sc.appid >>> 0);
        const grid = path.join(root, 'userdata', uid, 'config', 'grid');
        fs.mkdirSync(grid, { recursive: true });
        const map = { 'grid.png': `${appid}p.png`, 'wide.png': `${appid}.png`, 'hero.png': `${appid}_hero.png`, 'logo.png': `${appid}_logo.png` };
        for (const [src, dst] of Object.entries(map)) fs.writeFileSync(path.join(grid, dst), fs.readFileSync(path.join(artDir, src)));
        done.push({ user: uid, appid, name });
      }
    }
  }
  return done;
}

module.exports = { applySteamArt, parseVdf };
