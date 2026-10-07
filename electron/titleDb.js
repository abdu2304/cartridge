// Game names from their codes, without the game on this device (0.9.57, owner: "can we see what games these IDs
// are for without having them installed?"). Saves, memory cards and Syncthing texture folders are named by a game's
// code (SLUS-20946); Cartridge only knew the code of a game it had downloaded and read. The emulators keep a database
// of every game's code and name: PCSX2's GameIndex.yaml (PS2) and DuckStation's gamedb.yaml (PS1), same layout:
//   SLUS-20946:
//     name: "Grand Theft Auto - San Andreas"
//     name-en: "..."   (Japanese games: the English name)
// The copy inside the installed emulator is read first (Flatpak, distro package, AppImage), else the file from the
// emulator's own repository once, kept in <data>/titledb/ and refreshed every 60 days. A name found this way is then
// matched to your RomM library by name, as CIDE does.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DBS = {
  ps2: {
    label: 'PCSX2',
    url: 'https://raw.githubusercontent.com/PCSX2/pcsx2/master/bin/resources/GameIndex.yaml',
    inApp: 'usr/bin/resources/GameIndex.yaml', appRe: /pcsx2/i,
    files: (home) => [
      ...['/var/lib/flatpak', path.join(home, '.local/share/flatpak')].flatMap((b) => ['files/bin/resources', 'files/share/PCSX2/resources'].map((s) => path.join(b, 'app/net.pcsx2.PCSX2/current/active', s, 'GameIndex.yaml'))),
      '/usr/share/PCSX2/resources/GameIndex.yaml', '/usr/share/pcsx2/resources/GameIndex.yaml', '/usr/lib/pcsx2/resources/GameIndex.yaml', '/opt/pcsx2/resources/GameIndex.yaml',
    ],
  },
  ps1: {
    label: 'DuckStation',
    url: 'https://raw.githubusercontent.com/stenzek/duckstation/master/data/resources/gamedb.yaml',
    inApp: 'usr/bin/resources/gamedb.yaml', appRe: /duckstation/i,
    files: (home) => [
      ...['/var/lib/flatpak', path.join(home, '.local/share/flatpak')].flatMap((b) => ['files/bin/resources', 'files/share/duckstation/resources'].map((s) => path.join(b, 'app/org.duckstation.DuckStation/current/active', s, 'gamedb.yaml'))),
      '/usr/share/duckstation/resources/gamedb.yaml', '/opt/duckstation/resources/gamedb.yaml',
    ],
  },
};
const MAX_AGE = 60 * 86400e3;
const key = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// code -> name from the YAML text: the top-level "XXXX-00000:" lines and the name (English when there is one) below
function parse(text) {
  const out = {};
  let cur = null, en = false;
  for (const line of String(text).split('\n')) {
    const top = /^([A-Z]{4}-\d{3,5}):\s*$/.exec(line);
    if (top) { cur = key(top[1]); en = false; continue; }
    if (!cur || line[0] !== ' ') { if (line && line[0] !== ' ' && line[0] !== '#') cur = null; continue; }
    const m = /^ {2}(name|name-en):\s*"?(.*?)"?\s*$/.exec(line);
    if (!m || !m[2]) continue;
    if (m[1] === 'name-en') { out[cur] = m[2].replace(/\\"/g, '"'); en = true; } else if (!en) out[cur] = m[2].replace(/\\"/g, '"');
  }
  return out;
}

function createTitleDb({ dataDir, home = os.homedir(), fetchImpl = null, readAppImageFile = null, appImages = () => [], log = () => {} } = {}) {
  const books = {}; // console -> { code: name }
  const cacheFile = (c) => path.join(dataDir, 'titledb', c + '.json');
  const fromCache = (c, fresh) => { try { const j = JSON.parse(fs.readFileSync(cacheFile(c), 'utf8')); if (fresh && Date.now() - j.at > MAX_AGE) return null; return j; } catch { return null; } };
  const keep = (c, names, from) => { try { fs.mkdirSync(path.dirname(cacheFile(c)), { recursive: true }); fs.writeFileSync(cacheFile(c), JSON.stringify({ at: Date.now(), from, names })); } catch {} };
  // the emulator's own copy on this device
  function local(c) {
    const D = DBS[c];
    for (const f of D.files(home)) { try { return { text: fs.readFileSync(f, 'utf8'), from: f }; } catch {} }
    if (readAppImageFile) for (const a of appImages(c).filter((x) => D.appRe.test(path.basename(x)))) { try { const b = readAppImageFile(a, D.inApp); if (b) return { text: b.toString('utf8'), from: a }; } catch {} }
    return null;
  }
  async function load(c) {
    if (books[c]) return books[c];
    const cached = fromCache(c, true);
    if (cached) return (books[c] = cached.names);
    const own = local(c);
    if (own) { const names = parse(own.text); if (Object.keys(names).length > 100) { keep(c, names, own.from); log('title names', c, Object.keys(names).length, 'from', own.from); return (books[c] = names); } }
    if (fetchImpl) {
      try {
        const r = await fetchImpl(DBS[c].url);
        if (r.ok) { const names = parse(await r.text()); if (Object.keys(names).length > 100) { keep(c, names, DBS[c].url); log('title names', c, Object.keys(names).length, 'downloaded'); return (books[c] = names); } }
      } catch (e) { log('title names', c, e.message); }
    }
    const old = fromCache(c, false); // out of date beats nothing
    return (books[c] = old ? old.names : {});
  }
  const ready = () => Promise.all(Object.keys(DBS).map((c) => load(c).catch(() => ({}))));
  // the name of a code, from whichever book has it (PS1 and PS2 codes look alike: both are tried)
  function nameOf(code) { const k = key(code); for (const c of Object.keys(DBS)) { const n = books[c]?.[k]; if (n) return n; } return null; }
  return { load, ready, nameOf, books };
}

module.exports = { createTitleDb, parse, DBS, key };
