// Where add-ons come from (0.9.17, owner: texture packs and mods downloaded from Cartridge).
// - PS2 texture packs: the catalog ARMSX2 and EmuCoreX read, sashkinbro/EmuCoreX-Textures on GitHub
//   (textures.json, schemaVersion 1: entries with serials ["SLUS-21287"], downloadUrl or ordered parts,
//   sizeBytes, sha256 of the whole zip, authors, sourceUrl). Its zips hold SERIAL/replacements/... or
//   replacements/..., PNG and DDS, which is PCSX2's own layout (textures/<SERIAL>/replacements).
//   ARMSX2's other catalog (dl.ps2ktxpak.net) is ASTC for phone GPUs and isn't used.
// - Everything else: GameBanana's public API (apiv11), the way mod managers read it: find the game
//   (Util/Search/Results, model Game), its mods (Game/<id>/Subfeed), a mod's files (Mod/<id>, _aFiles:
//   _idRow, _sFile, _nFilesize, _sDownloadUrl, _sMd5Checksum). gamebanana.com was blocked where this
//   was written, so the shapes are read defensively and anything unexpected says so.
const fs = require('fs');
const webFetch = require('./webFetch');

const PS2_CATALOG = 'https://raw.githubusercontent.com/sashkinbro/EmuCoreX-Textures/main/textures.json';
const GB = 'https://gamebanana.com/apiv11';
const UA = { 'User-Agent': 'Cartridge (RomM client)', Accept: 'application/json' };

// ---------------------------------------------------------------- PS2 (EmuCoreX catalog)
function parsePs2Catalog(j) {
  if (!j || j.schemaVersion !== 1 || !Array.isArray(j.entries)) throw new Error('The PS2 texture catalog changed its format.');
  const out = [];
  for (const e of j.entries) {
    // one bad entry only drops itself (as ARMSX2 reads it)
    if (!e || typeof e.id !== 'string' || !Array.isArray(e.serials) || !/^[0-9A-Fa-f]{64}$/.test(e.sha256 || '') || !(e.sizeBytes > 0)) continue;
    const parts = Array.isArray(e.parts) && e.parts.length > 1 ? e.parts.filter((p) => /^https:\/\//.test(p.downloadUrl || '') && /^[0-9A-Fa-f]{64}$/.test(p.sha256 || '')) : null;
    if (!parts && !/^https:\/\//.test(e.downloadUrl || '')) continue;
    if (parts && parts.length !== e.parts.length) continue;
    out.push({ source: 'ps2', id: e.id, name: e.name || e.gameTitle || e.id, game: e.gameTitle || '', serials: e.serials.map((s) => String(s).toUpperCase()), version: e.version || '', authors: e.authors || [], credits: e.credits || '', description: e.description || '', sourceUrl: e.sourceUrl || '', license: e.license || '', size: e.sizeBytes, sha256: e.sha256.toLowerCase(), files: e.fileCount || 0, url: parts ? null : e.downloadUrl, parts: parts && parts.map((p) => ({ url: p.downloadUrl, size: p.sizeBytes, sha256: p.sha256.toLowerCase() })), previews: (e.previewUrls || []).filter((u) => /^https:\/\//.test(u)) });
  }
  return out;
}
async function ps2Catalog({ cacheFile, fetchImpl = webFetch, maxAge = 24 * 3600e3 } = {}) {
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
  if (cached && Date.now() - cached.at < maxAge) return parsePs2Catalog(cached.data);
  try {
    const r = await fetchImpl(PS2_CATALOG, { headers: UA, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`The PS2 texture catalog answered ${r.status}`);
    const data = await r.json();
    const list = parsePs2Catalog(data);
    try { fs.writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), data })); } catch {}
    return list;
  } catch (e) { if (cached) return parsePs2Catalog(cached.data); throw e; }
}
const ps2For = (list, serial) => list.filter((e) => e.serials.includes(String(serial || '').toUpperCase()));

// ---------------------------------------------------------------- GameBanana
const key = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, '');
async function gbGet(path, fetchImpl) {
  const r = await fetchImpl(GB + path, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`GameBanana answered ${r.status}`);
  return r.json();
}
// the GameBanana game for a title: an exact name match only (no guessing between games)
// 0.9.19: RomM names like "Legend of Zelda, The - Twilight Princess (USA)" are tried as "The Legend of
// Zelda: Twilight Princess" too; a leading "The" and region tags never stop an exact match
const loose = (s) => key(String(s || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/^the\s+/i, ''));
function titleForms(title) {
  const t = String(title || '').replace(/\s*\((?:USA|Europe|Japan|World|En|Rev[^)]*|v[\d.]+)[^)]*\)/gi, '').trim();
  const moved = t.replace(/^(.*?),\s*(The|A|An)\b(.*)$/i, '$2 $1$3'); // "Zelda, The - X" -> "The Zelda - X"
  return [...new Set([t, moved, moved.replace(/\s+-\s+/g, ': ')].filter(Boolean))];
}
// Shorter forms of a title for when a site has no game under the full one (0.9.56, owner: "Nexus Mods has no game called
// Bloodborne Game of the Year Edition. It does have Bloodborne"): the edition words off, then the subtitle off. Longest
// first, the full title never included. "Bloodborne Game of the Year Edition" -> ["Bloodborne"];
// "Dark Souls: Remastered" -> ["Dark Souls"]; "Ratchet & Clank: Up Your Arsenal" -> ["Ratchet & Clank"].
const EDITION = /\s*[-:–]?\s*\b(?:game of the year(?: edition)?|goty(?: edition)?|definitive edition|complete edition|complete|deluxe edition|deluxe|special edition|ultimate edition|enhanced edition|anniversary edition|collector'?s edition|gold edition|platinum(?: hits)?|greatest hits|director'?s cut|remastered|remaster|hd(?: remaster(?:ed)?)?|edition)\s*$/i;
function shorterTitles(title) {
  const base = titleForms(title)[titleForms(title).length - 1] || String(title || '');
  const out = [];
  let t = base.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) { const n = t.replace(EDITION, '').trim(); if (n === t || !n) break; t = n; out.push(t); }
  const sub = /^(.{3,}?)\s*(?::|\s[-–]\s)\s*.+$/.exec(t);
  if (sub) out.push(sub[1].trim());
  const full = loose(base);
  return [...new Set(out)].filter((x) => x.length >= 3 && loose(x) !== full);
}
async function gbGame(title, { fetchImpl = webFetch } = {}) {
  for (const q of titleForms(title)) {
    const j = await gbGet(`/Util/Search/Results?_sModelName=Game&_sOrder=best_match&_nPage=1&_sSearchString=${encodeURIComponent(q)}`, fetchImpl);
    const recs = Array.isArray(j?._aRecords) ? j._aRecords : [];
    const want = loose(q);
    const hit = recs.find((g) => g && g._idRow && key(g._sName) === key(q)) || recs.find((g) => g && g._idRow && loose(g._sName) === want);
    if (hit) return { id: hit._idRow, name: hit._sName };
  }
  return null;
}
function parseGbMods(j) {
  const recs = Array.isArray(j?._aRecords) ? j._aRecords : [];
  return recs.filter((m) => m && m._idRow && (!m._sModelName || m._sModelName === 'Mod')).map((m) => {
    const img = m._aPreviewMedia?._aImages?.[0];
    return { source: 'gb', id: m._idRow, name: m._sName || `Mod ${m._idRow}`, authors: m._aSubmitter?._sName ? [m._aSubmitter._sName] : [], category: m._aRootCategory?._sName || '', likes: m._nLikeCount || 0, downloads: m._nDownloadCount || 0, views: m._nViewCount || 0, added: (m._tsDateAdded || 0) * 1000, updated: (m._tsDateUpdated || m._tsDateModified || m._tsDateAdded || 0) * 1000, url: m._sProfileUrl || `https://gamebanana.com/mods/${m._idRow}`, preview: img?._sBaseUrl && (img._sFile220 || img._sFile) ? `${img._sBaseUrl}/${img._sFile220 || img._sFile}` : '' };
  });
}
// 0.9.32 (owner: sort mods, most downloaded first): GameBanana's own sorted index for the game, else its game
// feed sorted here by what each mod carries (downloads, likes, dates)
const GB_SORT = { downloads: 'Generic_MostDownloaded', liked: 'Generic_MostLiked', newest: 'Generic_Newest', updated: 'Generic_LatestUpdated' };
const sortMods = (l, sort) => [...l].sort(sort === 'liked' ? (a, b) => b.likes - a.likes : sort === 'newest' ? (a, b) => b.added - a.added : sort === 'updated' ? (a, b) => b.updated - a.updated : (a, b) => (b.downloads - a.downloads) || (b.likes - a.likes) || (b.views - a.views));
async function gbMods(gameId, { fetchImpl = webFetch, page = 1, sort = 'downloads' } = {}) {
  if (GB_SORT[sort]) {
    try {
      const l = parseGbMods(await gbGet(`/Mod/Index?_nPage=${page}&_nPerpage=50&_aFilters%5BGeneric_Game%5D=${Number(gameId)}&_sSort=${GB_SORT[sort]}`, fetchImpl));
      if (l.length) return l;
    } catch {}
  }
  return sortMods(parseGbMods(await gbGet(`/Game/${Number(gameId)}/Subfeed?_nPage=${page}&_sSort=default&_csvModelInclusions=Mod`, fetchImpl)), sort);
}
const ARCHIVE = /\.(zip|7z|rar)$/i;
function parseGbFiles(j) {
  const files = Array.isArray(j?._aFiles) ? j._aFiles : [];
  return files.filter((f) => f && f._idRow && /^https:\/\//.test(f._sDownloadUrl || '') && ARCHIVE.test(f._sFile || '') && !f._bContainsExe)
    .map((f) => ({ id: f._idRow, name: f._sFile, size: f._nFilesize || 0, url: f._sDownloadUrl, md5: /^[0-9a-f]{32}$/i.test(f._sMd5Checksum || '') ? f._sMd5Checksum.toLowerCase() : '', description: f._sDescription || '' }));
}
// one mod in full (0.9.24, owner: A opens a page with everything about it): its files, its text, pictures
async function gbMod(modId, { fetchImpl = webFetch } = {}) {
  const j = await gbGet(`/Mod/${Number(modId)}?_csvProperties=_aFiles,_sName,_aSubmitter,_sText,_aPreviewMedia,_nLikeCount,_tsDateUpdated,_sVersion`, fetchImpl);
  const text = String(j?._sText || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, '’').replace(/\n{3,}/g, '\n\n').trim();
  const images = (j?._aPreviewMedia?._aImages || []).map((im) => (im?._sBaseUrl && im._sFile ? `${im._sBaseUrl}/${im._sFile530 || im._sFile}` : '')).filter(Boolean).slice(0, 6);
  return { files: parseGbFiles(j), text: text.slice(0, 6000), images, version: j?._sVersion || '', updated: j?._tsDateUpdated ? j._tsDateUpdated * 1000 : 0, likes: j?._nLikeCount || 0, author: j?._aSubmitter?._sName || '' };
}
async function gbFiles(modId, { fetchImpl = webFetch } = {}) {
  return parseGbFiles(await gbGet(`/Mod/${Number(modId)}?_csvProperties=_aFiles,_sName,_aSubmitter`, fetchImpl));
}

// Featured texture packs for other consoles (0.9.23, owner: more high-quality catalogs like
// HenrikoMagnifico's for Nintendo games). No such catalog has a machine-readable list or direct
// downloads (their packs are on the creators' own pages, Mega or Google Drive), so this is a short,
// hand-checked list: each pack's page opens in the browser, and the file you download installs from
// Add-ons → Texture Packs → Install a Download into the right folder. Matched by Dolphin's game ID
// (the first 3 characters, every region), from each pack's own page or list.
const FEATURED = [
  { con: 'gc', ids: ['GZL'], title: 'The Legend of Zelda: The Wind Waker 4K', author: 'HenrikoMagnifico', page: 'https://www.henrikomagnifico.com/wind-waker-4k' },
  { con: 'gc', ids: ['GZ2'], title: 'The Legend of Zelda: Twilight Princess 4K', author: 'HenrikoMagnifico', page: 'https://www.henrikomagnifico.com/zelda-twilight-princess-4k' },
  { con: 'gc', ids: ['GMS'], title: 'Super Mario Sunshine 4K', author: 'HenrikoMagnifico', page: 'https://www.henrikomagnifico.com/super-mario-sunshine-4k' },
  { con: 'gc', ids: ['GLM'], title: 'Luigi’s Mansion 4K', author: 'HenrikoMagnifico', page: 'https://www.henrikomagnifico.com/luigis-mansion-4k' },
  { con: 'gc', ids: ['GPI'], title: 'Pikmin 4K', author: 'HenrikoMagnifico', page: 'https://www.henrikomagnifico.com/pikmin-4k' },
  { con: 'gc', ids: ['GPV'], title: 'Pikmin 2 4K', author: 'HenrikoMagnifico', page: 'https://www.henrikomagnifico.com/pikmin-2-4k-texture-pack' },
  { con: 'gc', ids: ['GM8'], title: 'Metroid Prime HD', author: 'Dolphin community (rapka’s list)', page: 'https://github.com/rapka/dolphin-textures/blob/master/PACKS.md' },
  { con: 'gc', ids: ['GAL'], title: 'Super Smash Bros. Melee HD', author: 'Dolphin community (rapka’s list)', page: 'https://github.com/rapka/dolphin-textures/blob/master/PACKS.md' },
  { con: 'gc', ids: ['GT3'], title: 'Tony Hawk’s Pro Skater 3 HD', author: 'Dolphin community (rapka’s list)', page: 'https://github.com/rapka/dolphin-textures/blob/master/PACKS.md' },
  { con: 'gc', ids: ['GVJ'], title: 'Viewtiful Joe HD', author: 'Dolphin community (rapka’s list)', page: 'https://github.com/rapka/dolphin-textures/blob/master/PACKS.md' },
  { con: 'gc', ids: ['GRS'], title: 'Soulcalibur II HD', author: 'Dolphin community (rapka’s list)', page: 'https://github.com/rapka/dolphin-textures/blob/master/PACKS.md' },
];
// HenrikoMagnifico's packs (0.9.23 GameCube; 0.9.24, owner: add his whole list): these pages, checked by
// search, plus whatever his texture-packs page lists when Cartridge can reach it (read live, cached a week).
// Matched by game ID where known, else by the game's name. Consoles: GameCube, Wii and 3DS.
const HENRIKO = [
  ['wind-waker-4k', 'The Legend of Zelda: The Wind Waker 4K', ['gc'], ['GZL']],
  ['zelda-twilight-princess-4k', 'The Legend of Zelda: Twilight Princess 4K', ['gc', 'wii'], ['GZ2', 'RZD']],
  ['zelda-skyward-sword-4k-wii-edition', 'The Legend of Zelda: Skyward Sword 4K (Wii Edition)', ['wii'], ['SOU']],
  ['super-mario-sunshine-4k', 'Super Mario Sunshine 4K', ['gc'], ['GMS']],
  ['luigis-mansion-4k', 'Luigi’s Mansion 4K', ['gc'], ['GLM']],
  ['pikmin-4k', 'Pikmin 4K', ['gc', 'wii'], ['GPI', 'R9I']],
  ['pikmin-2-4k-texture-pack', 'Pikmin 2 4K', ['gc', 'wii'], ['GPV', 'R92']],
  ['wii-sports-4k', 'Wii Sports 4K', ['wii'], ['RSP']],
  ['zelda-ocarina-of-time-3d-4k', 'The Legend of Zelda: Ocarina of Time 3D 4K', ['3ds'], []],
  ['zelda-majoras-mask-3d-4k', 'The Legend of Zelda: Majora’s Mask 3D 4K', ['3ds'], []],
  ['zelda-a-link-between-worlds-4k', 'The Legend of Zelda: A Link Between Worlds 4K', ['3ds'], []],
  ['super-mario-3d-land-hd', 'Super Mario 3D Land 4K', ['3ds'], []],
].map(([slug, title, cons, ids]) => ({ slug, title, cons, ids, page: 'https://www.henrikomagnifico.com/' + slug }));
const CON_OF = { ngc: 'gc', gamecube: 'gc', gc: 'gc', wii: 'wii', n3ds: '3ds', '3ds': '3ds', 'new-nintendo-3ds': '3ds' };
const NAME_STOP = new Set(['the', 'legend', 'of', 'zelda', 'a', 'and', '4k', 'hd', 'texture', 'pack', 'wii', 'edition', 'gamecube', 'gc', 'remastered']);
const words = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
// does this pack's title name this game? every word of the pack's title (beyond the common ones) is in the game's name
function namesGame(packTitle, gameName) {
  const g = new Set(words(gameName)), need = words(packTitle).filter((w) => !NAME_STOP.has(w));
  return need.length > 0 && need.every((w) => g.has(w)) && (/3d\b/i.test(packTitle) === /3d\b/i.test(gameName));
}
// the texture-packs page: links to his pack pages, with their titles
function parseHenriko(html) {
  const out = [], seen = new Set();
  for (const m of String(html).matchAll(/<a\b[^>]*href="(?:https?:\/\/(?:www\.)?henrikomagnifico\.com)?\/([a-z0-9-]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const slug = m[1].toLowerCase();
    if (seen.has(slug) || !/(4k|hd|texture)/.test(slug)) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
    seen.add(slug);
    out.push({ slug, title: text && text.length < 90 ? text : slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), page: 'https://www.henrikomagnifico.com/' + slug });
  }
  return out;
}
let henrikoLive = null;
async function henrikoCatalog({ cacheFile, fetchImpl = require('./webFetch') } = {}) {
  if (henrikoLive) return henrikoLive;
  const fs = require('fs');
  try { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (Date.now() - c.t < 7 * 864e5) return (henrikoLive = c.list); } catch {}
  try {
    const r = await fetchImpl('https://www.henrikomagnifico.com/texture-packs', { headers: { 'User-Agent': 'Mozilla/5.0 Cartridge' }, signal: AbortSignal.timeout(12000) });
    if (r.ok) { const list = parseHenriko(await r.text()); if (list.length) { try { fs.writeFileSync(cacheFile, JSON.stringify({ t: Date.now(), list })); } catch {} return (henrikoLive = list); } }
  } catch {}
  return [];
}
function featuredFor(ids = {}, live = []) {
  const g = String(ids.gameId || '').toUpperCase().slice(0, 3), con = CON_OF[String(ids.slug || '').toLowerCase()] || (g ? 'gc' : '');
  const out = [];
  const add = (id, name, author, page) => { if (!out.some((x) => x.page === page)) out.push({ source: 'page', id, name, authors: [author], page }); };
  for (const h of HENRIKO) if ((g && h.ids.includes(g)) || ((!con || h.cons.includes(con)) && ids.name && namesGame(h.title, ids.name))) add('h:' + h.slug, h.title, 'HenrikoMagnifico', h.page);
  for (const h of live) if (ids.name && namesGame(h.title, ids.name) && (!con || con !== '3ds' || /3d/i.test(h.title) || /3d/i.test(ids.name))) add('h:' + h.slug, h.title, 'HenrikoMagnifico', h.page);
  if (g) FEATURED.filter((f) => f.ids.includes(g) && !/henriko/i.test(f.author)).forEach((f, i) => add('f:' + f.ids[0] + i, f.title, f.author, f.page));
  return out;
}

module.exports = { sortMods, gbMod, FEATURED, HENRIKO, featuredFor, parseHenriko, henrikoCatalog, namesGame, PS2_CATALOG, parsePs2Catalog, ps2Catalog, ps2For, gbGame, gbMods, gbFiles, parseGbMods, parseGbFiles, key, titleForms, shorterTitles };
