// Switch cheats from switch-cheats-db (0.9.71, handover Part 9 item 17). The database (HamletDuFromage/switch-cheats-db,
// mirrored from GBAtemp's list, updated daily) keeps cheats/<TITLE ID>.json: { <build ID>: { "[name]": "<cheat text>" } }.
// Eden and its family read <load>/<TITLE ID>/<mod>/cheats/<build ID>.txt for every mod folder that isn't turned off
// (patch_manager.cpp CreateCheatList), with every cheat in the file active, so Cartridge writes one mod folder,
// "Cartridge Cheats", holding only the cheats you pick, one file per build ID the database has: the emulator takes the
// one matching the game's version. Ryujinx reads the same layout under mods/contents/<title id>; it lists the cheats
// in its Manage Cheats window, where they are turned on.
const fs = require('fs');
const path = require('path');

const RAW = 'https://raw.githubusercontent.com/HamletDuFromage/switch-cheats-db/master/cheats/';
const FOLDER = 'Cartridge Cheats';

async function download(tid, { fetchImpl = fetch, cacheDir } = {}) {
  const id = String(tid || '').toUpperCase();
  if (!/^[0-9A-F]{16}$/.test(id)) return {};
  const cache = cacheDir && path.join(cacheDir, id + '.json');
  try { if (cache && Date.now() - fs.statSync(cache).mtimeMs < 7 * 864e5) return JSON.parse(fs.readFileSync(cache, 'utf8')); } catch {}
  try {
    const res = await fetchImpl(RAW + id + '.json', { signal: AbortSignal.timeout(15000) });
    if (res.status === 404) { if (cache) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cache, '{}'); } return {}; }
    if (!res.ok) throw new Error(String(res.status));
    const db = await res.json();
    if (cache) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cache, JSON.stringify(db)); }
    return db;
  } catch { try { return JSON.parse(fs.readFileSync(cache, 'utf8')); } catch { return {}; } }
}
const clean = (n) => String(n).replace(/^[[{]\s*|\s*[\]}]$/g, '').trim();
const keyOf = (tid, name) => `nx:${String(tid).toUpperCase()}:${clean(name)}`;
const dirOf = (modsDir) => path.join(modsDir, FOLDER, 'cheats');
// the names in Cartridge's files now (the "[name]" lines)
function chosen(modsDir) {
  const out = new Set();
  try { for (const f of fs.readdirSync(dirOf(modsDir))) for (const m of fs.readFileSync(path.join(dirOf(modsDir), f), 'utf8').matchAll(/^\s*[[{]([^\]}]+)[\]}]\s*$/gm)) out.add(clean(m[1])); } catch {}
  return out;
}
// one row per cheat name, across the build IDs (the versions) it exists for
function list(modsDir, tid, db, mine = {}) {
  const on = chosen(modsDir), rows = new Map();
  for (const [bid, cheats] of Object.entries(db || {})) for (const name of Object.keys(cheats || {})) {
    const n = clean(name); if (!n) continue;
    if (!rows.has(n)) rows.set(n, { key: keyOf(tid, n), name: n, description: n, notes: 'Cheat', builds: [], on: on.has(n) });
    rows.get(n).builds.push(bid);
  }
  return [...rows.values()].map((r) => ({ ...r, version: r.builds.length > 1 ? `${r.builds.length} versions` : 'One version', by: r.on ? (mine[r.key] ? 'cartridge' : 'emulator') : null }))
    .sort((a, b) => Number(b.on) - Number(a.on) || a.name.localeCompare(b.name));
}
// rewrite Cartridge's folder from the cheats now on; gone entirely when none are
function set(modsDir, tid, db, changes, mine = {}) {
  const rec = { ...mine }, want = new Set(chosen(modsDir));
  for (const c of changes) { const n = c.key.replace(/^nx:[0-9A-F]{16}:/, ''); if (c.on) { want.add(n); rec[c.key] = true; } else { want.delete(n); delete rec[c.key]; } }
  const dir = dirOf(modsDir);
  fs.rmSync(path.join(modsDir, FOLDER), { recursive: true, force: true });
  if (!want.size) return rec;
  fs.mkdirSync(dir, { recursive: true });
  for (const [bid, cheats] of Object.entries(db || {})) {
    const parts = Object.entries(cheats || {}).filter(([name]) => want.has(clean(name))).map(([, text]) => String(text).trim());
    if (parts.length && /^[0-9A-F]{16}$/i.test(bid)) fs.writeFileSync(path.join(dir, bid.toUpperCase() + '.txt'), parts.join('\n\n') + '\n');
  }
  return rec;
}

module.exports = { download, list, set, chosen, FOLDER, keyOf };
