// Cemu's graphic packs per game (0.9.24, owner: Cemu's own per-game Graphics, Enhancements and Mods weren't
// in Cartridge). Read the way Cemu does (src/Cafe/GraphicPack/GraphicPack2.cpp, src/config/CemuConfig.cpp):
// - every rules.txt under <Cemu data>/graphicPacks (Cemu's own download is graphicPacks/downloadedGraphicPacks);
//   [Definition] titleIds = 0005000010145D00,..., name, path = "Game/Graphics/Resolution", description;
//   [Preset] sections with name (and category) are its choices, the first in a category is its default
// - which are on: settings.xml <GraphicPack><Entry filename="graphicPacks/.../rules.txt"> with <Preset>
//   <category/><preset/> children; disabled="true" keeps the choice but turns it off. Cartridge adds or
//   removes only the Entry of the pack you switch, and records what it turned on (the only ones it turns off).
const fs = require('fs');
const path = require('path');

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const unXml = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// rules.txt: its definition and presets (ini-like, values may be quoted)
function parseRules(text) {
  const out = { def: {}, presets: [] }; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.replace(/#.*$/, '').trim(); if (!l) continue;
    const m = /^\[(.+)\]$/.exec(l);
    if (m) { cur = m[1].toLowerCase(); if (cur === 'preset') out.presets.push({}); continue; }
    const i = l.indexOf('='); if (i < 0) continue;
    const k = l.slice(0, i).trim().toLowerCase(), v = l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    if (cur === 'definition') out.def[k] = v;
    else if (cur === 'preset' && ['name', 'category', 'default', 'condition'].includes(k)) out.presets[out.presets.length - 1][k] = v;
  }
  return out;
}
function findRules(dir, depth = 0, out = []) {
  if (depth > 6) return out;
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  if (ents.some((e) => e.isFile() && e.name.toLowerCase() === 'rules.txt')) { out.push(path.join(dir, 'rules.txt')); return out; }
  for (const e of ents) if (e.isDirectory() && !e.name.startsWith('.')) findRules(path.join(dir, e.name), depth + 1, out);
  return out;
}
// the entries in settings.xml: filename -> { disabled, presets: { category: preset } }
function entries(settings) {
  const out = {};
  const gp = (/<GraphicPack>([\s\S]*?)<\/GraphicPack>/.exec(settings || '') || [])[1] || '';
  for (const m of gp.matchAll(/<Entry\b([^>]*?)(\/>|>([\s\S]*?)<\/Entry>)/g)) {
    const fn = unXml((/filename="([^"]*)"/.exec(m[1]) || [])[1] || ''); if (!fn) continue;
    const presets = {};
    for (const p of String(m[3] || '').matchAll(/<Preset>([\s\S]*?)<\/Preset>/g)) presets[unXml((/<category>([^<]*)<\/category>/.exec(p[1]) || [])[1] || '')] = unXml((/<preset>([^<]*)<\/preset>/.exec(p[1]) || [])[1] || '');
    out[fn.replace(/\\/g, '/')] = { disabled: /disabled="(true|1)"/.test(m[1]), presets };
  }
  return out;
}
// the group Cemu's window shows a pack under (the second part of its path): Graphics, Enhancements, Mods,
// Workarounds, Cheats (0.9.32, owner: Wind Waker's Mega Cheats); anything else goes with Enhancements
function sectionOf(seg) { const sec = String(seg || '').toLowerCase(); return { graphics: 'Graphics', enhancements: 'Enhancements', mods: 'Mods', workarounds: 'Workarounds', workaround: 'Workarounds', cheats: 'Cheats', fixes: 'Workarounds' }[sec] || (/cheat/.test(sec) ? 'Cheats' : /fps|enhance/.test(sec) ? 'Enhancements' : 'Graphics'); }
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
// a game's packs: { root: Cemu's data folder, settings: settings.xml, titleIds: [...], name }
function list(c, mine = {}) {
  const ids = new Set((c.titleIds || []).map((x) => String(x).toUpperCase()));
  const nameKey = norm(String(c.name || '').replace(/\s*[([].*$/, ''));
  const on = entries(read(c.settings));
  const items = [];
  for (const f of findRules(path.join(c.root, 'graphicPacks'))) {
    const r = parseRules(read(f)); const d = r.def;
    const tids = String(d.titleids || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    const p = String(d.path || '').split('/').filter(Boolean);
    // no title ID (a .wua Cemu hasn't listed yet): the pack's game folder by name, also when one name holds the
    // other ("Breath of the Wild" packs for "The Legend of Zelda Breath of the Wild")
    const pk = norm(p[0] || '');
    const match = tids.some((t) => ids.has(t)) || (!ids.size && nameKey.length >= 4 && pk && (pk === nameKey || (pk.length >= 8 && nameKey.includes(pk)) || (nameKey.length >= 8 && pk.includes(nameKey))));
    if (!match) continue;
    const rel = path.relative(c.root, f).split(path.sep).join('/');
    const e = on[rel];
    const cats = {};
    for (const pr of r.presets) { const k = pr.category || ''; (cats[k] ||= []).push(pr.name); }
    // the group Cemu's window shows it under (the second part of its path): Graphics, Enhancements, Mods,
    // Workarounds, Cheats (0.9.32, owner: Wind Waker's Mega Cheats); anything else goes with Enhancements
    const section = sectionOf(p[1]);
    const presetText = Object.entries(cats).map(([k, v]) => `${k ? k + ': ' : ''}${(e?.presets?.[k]) || v[0]}`).join(' · ');
    items.push({ key: rel, name: d.name || p[p.length - 1] || path.basename(path.dirname(f)), description: [String(d.description || '').replace(/\\n/g, ' '), presetText].filter(Boolean).join('\n'), section, group: section, on: !!e && !e.disabled, by: e && !e.disabled ? (mine[rel] ? 'cartridge' : 'emulator') : null, presets: cats, chosen: e?.presets || {} });
  }
  items.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
  return items;
}
// switch packs: todo [{ key, on, presets? }]; returns how many changed
function set(c, todo, mine = {}) {
  let text = read(c.settings);
  if (text == null) throw new Error('Cemu’s settings.xml wasn’t found. Open Cemu once, then come back.');
  if (!/<GraphicPack>/.test(text)) text = /<GraphicPack\s*\/>/.test(text) ? text.replace(/<GraphicPack\s*\/>/, '<GraphicPack>\n    </GraphicPack>') : text.replace(/<\/content>/, '    <GraphicPack>\n    </GraphicPack>\n</content>');
  let n = 0;
  for (const t of todo) {
    const fnRe = new RegExp(`\\s*<Entry\\b[^>]*filename="${xml(t.key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*?(\\/>|>[\\s\\S]*?<\\/Entry>)`);
    text = text.replace(fnRe, '');
    if (t.on) {
      const pr = Object.entries(t.presets || {}).map(([k, v]) => `\n            <Preset>${k ? `\n                <category>${xml(k)}</category>` : ''}\n                <preset>${xml(v)}</preset>\n            </Preset>`).join('');
      text = text.replace(/<GraphicPack>/, `<GraphicPack>\n        <Entry filename="${xml(t.key)}">${pr}${pr ? '\n        ' : ''}</Entry>`);
      mine[t.key] = Date.now();
    } else delete mine[t.key];
    n++;
  }
  const tmp = c.settings + '.cartridge-new';
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, c.settings);
  return n;
}
// a Wii U game's title IDs: its own meta/meta.xml (folder games), else Cemu's title list cache by path
// 0.9.37 (owner: Enhancements, Mods and Cheats empty): paths are compared as real paths (Cemu keeps /var/home/...
// on Bazzite and Fedora Atomic where Cartridge has /home/...), and a title Cemu lists under the game's own name
// counts too, so the game's title ID is known and its packs match the way Cemu matches them
const realp = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
function titleIds(gamePath, cemuConfigDir, name = '') {
  const out = new Set();
  const tryMeta = (f) => { const m = /<title_id[^>]*>([0-9A-Fa-f]{16})<\/title_id>/.exec(read(f) || ''); if (m) out.add(m[1].toUpperCase()); };
  if (gamePath) { tryMeta(path.join(gamePath, 'meta', 'meta.xml')); try { for (const n of fs.readdirSync(gamePath)) tryMeta(path.join(gamePath, n, 'meta', 'meta.xml')); } catch {} }
  // a .wua (or a folder holding one): the title folders' names inside it (0.9.63, electron/wua.js)
  if (gamePath) { const W = require('./wua'); const wuas = /\.wua$/i.test(gamePath) ? [gamePath] : (() => { try { return fs.readdirSync(gamePath).filter((n) => /\.wua$/i.test(n)).map((n) => path.join(gamePath, n)); } catch { return []; } })(); for (const w of wuas) for (const t of W.titles(w)) out.add(t.id); }
  const cache = read(path.join(cemuConfigDir || '', 'title_list_cache.xml')) || '';
  const gp = gamePath ? realp(gamePath) : '', want = norm(String(name || '').replace(/\s*[([].*$/, '')), byName = [];
  for (const m of cache.matchAll(/<title\b[^>]*titleId="([0-9A-Fa-f]{16})"[^>]*>([\s\S]*?)<\/title>/g)) {
    const raw = unXml((/<path>([^<]*)<\/path>/.exec(m[2]) || [])[1] || ''), p = raw ? realp(raw) : '';
    if (p && gamePath && (p === gp || p.startsWith(gp + '/') || raw === gamePath || raw.startsWith(gamePath + '/'))) out.add(m[1].toUpperCase());
    const n = norm(unXml((/<name>([^<]*)<\/name>/.exec(m[2]) || [])[1] || ''));
    if (want.length >= 4 && n && (n === want || (n.length >= 8 && want.includes(n)) || (want.length >= 8 && n.includes(want)))) byName.push(m[1].toUpperCase());
  }
  if (!out.size) for (const id of byName) out.add(id);
  // updates and DLC carry the same game: 0005000E/0005000C share the low half with the game's 00050000
  for (const id of [...out]) out.add('00050000' + id.slice(8));
  return [...out];
}
// packs for this game's name that list other regions' title IDs only (Cemu won't load them for this copy): per group
function otherRegions(c) {
  const ids = new Set((c.titleIds || []).map((x) => String(x).toUpperCase())), nameKey = norm(String(c.name || '').replace(/\s*[([].*$/, ''));
  const out = {};
  if (!ids.size || nameKey.length < 4) return out;
  for (const f of findRules(path.join(c.root, 'graphicPacks'))) {
    const d = parseRules(read(f)).def, p = String(d.path || '').split('/').filter(Boolean), pk = norm(p[0] || '');
    if (!pk || !(pk === nameKey || (pk.length >= 8 && nameKey.includes(pk)) || (nameKey.length >= 8 && pk.includes(nameKey)))) continue;
    const tids = String(d.titleids || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (tids.some((t) => ids.has(t))) continue;
    const sec = sectionOf(p[1]);
    out[sec] = (out[sec] || 0) + 1;
  }
  return out;
}
// Cemu's community graphic packs (0.9.29, owner: "Cemu patches still aren't appearing"): fetched the way Cemu's own
// Download Community Graphic Packs does (gui/wxgui/DownloadGraphicPacksWindow.cpp): the newest release of
// cemu-project/cemu_graphic_packs, its first asset (a zip) unpacked into graphicPacks/downloadedGraphicPacks, the
// release name in version.txt there, so Cemu sees them as current. Only that folder, the one Cemu manages itself.
const PACKS_REPO = 'https://api.github.com/repos/cemu-project/cemu_graphic_packs/releases/latest';
async function downloadCommunity(root, { fetchImpl, unzip, force = false, release = null } = {}) {
  const dir = path.join(root, 'graphicPacks', 'downloadedGraphicPacks'), vf = path.join(dir, 'version.txt');
  const have = (read(vf) || '').split(/\r?\n/)[0].trim();
  let st = null; try { st = fs.statSync(vf); } catch {}
  if (!force && have && st && Date.now() - st.mtimeMs < 7 * 864e5) return { updated: false, version: have };
  let name = '', url = '';
  const r = await fetchImpl(PACKS_REPO, { headers: { 'User-Agent': 'Cartridge', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (r?.ok) { const j = await r.json(); name = String(j.name || j.tag_name || '').trim(); url = j.assets?.[0]?.browser_download_url || ''; }
  // 0.9.32: GitHub's API refuses after a few asks an hour; its release page says the same (github.js release())
  if (!url && release) { const rel = await release().catch(() => null); const a = rel?.assets?.find((x) => /\.zip$/i.test(x.name)) || rel?.assets?.[0]; if (a) { name = String(rel.name || rel.tag || '').trim(); url = a.url || a.browser_download_url; } }
  if (!url && !r?.ok) throw new Error(`GitHub answered ${r ? r.status : 'nothing'} for Cemu's graphic packs.`);
  if (!name || !url) throw new Error('Cemu\'s graphic pack release had nothing to download.');
  if (name === have && !force) { try { fs.utimesSync(vf, new Date(), new Date()); } catch {} return { updated: false, version: have }; }
  const z = await fetchImpl(url, { signal: AbortSignal.timeout(120000) });
  if (!z.ok) throw new Error(`GitHub answered ${z.status} for the graphic packs download.`);
  const tmp = path.join(require('os').tmpdir(), `cartridge-cemu-packs-${Date.now()}.zip`);
  fs.writeFileSync(tmp, Buffer.from(await z.arrayBuffer()));
  try {
    // like Cemu: what was in downloadedGraphicPacks goes, then the release is unpacked there
    try { for (const n of fs.readdirSync(dir)) fs.rmSync(path.join(dir, n), { recursive: true, force: true }); } catch {}
    fs.mkdirSync(dir, { recursive: true });
    await unzip(tmp, dir);
    fs.writeFileSync(vf, name);
  } finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
  return { updated: true, version: name };
}
module.exports = { otherRegions, sectionOf, parseRules, findRules, entries, list, set, titleIds, downloadCommunity };
