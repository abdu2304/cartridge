'use strict';
// The mods engine (0.9.52, owner: "one engine for every mod site; Nexus Mods and ROM hacks are just more sources").
// Every place a game's mods come from is a provider with the same steps, so the Mods tab shows them the same way and
// the right stick moves between them:
//   forGame(game)            -> does this source have anything for this console at all
//   list(game, opts)         -> { items, page?, error? }  (items share one shape, below)
//   detail(item)             -> { files, text, images, version, author, ... }
//   download(item, file)     -> { url } (Cartridge downloads it) | { page } (a page opens in Cartridge's window,
//                               whose download is caught and installed: Nexus without Premium, sites with a check)
// Installing is not here: AddonsSheet and main.js's addons:install put archives in each emulator's layout
// (addonInstall.plan by emuProfiles.modKind), and ROM hacks go through romPatch (RetroArch soft-patch or a patched copy).
// Item: { source, id, name, authors[], category, downloads, likes, views, added, updated, url, preview, kind, ... }
// Sources: EmuCoreX (PS2 texture catalog), GameBanana, Nexus Mods, Romhacking.net. All requests go through the web
// engine (web.js). No Electron imports.
const S = require('./addonSources');

const loose = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[™®©’']/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
// a RomM title in the order people write it: "Legend of Zelda, The - X (USA)" -> "The Legend of Zelda: X"
const titleOf = (t) => S.titleForms(t)[1] || S.titleForms(t)[0] || t;
// GameBanana's helpers take a fetch: answer them through the web engine (pacing, retries, plain errors)
const asFetch = (web) => async (url, o = {}) => { const data = await web.json(url, { headers: o.headers }); return { ok: true, status: 200, json: async () => data }; };

// a site's game under a shorter form of the title (0.9.56): { as, name } for the first form it has, else null
async function suggestFrom(g, find) {
  for (const n of S.shorterTitles(g.name)) { try { const hit = await find(n); if (hit) return { as: n, name: String(hit.name || n).replace(NX_SUFFIX, '') }; } catch {} }
  return null;
}

// ---------------------------------------------------------------- Nexus Mods
// Its public API (v2 GraphQL) lists games, mods, files and descriptions with no key. A personal API key (Settings)
// is only used for Premium members' direct downloads (v1 download_link); everyone else downloads on the mod's page.
const NX = 'https://api.nexusmods.com';
const NX_HEAD = { 'Content-Type': 'application/json', 'Application-Name': 'Cartridge', Accept: 'application/json' };
// Nexus names console games with the console: "Pokemon Legends: Arceus (Switch)", "Mario Kart 8 (Wii U)",
// "Monster Hunter 4 Ultimate - 3DS", "Metroid Prime 2: Echoes - Gamecube"
const NX_CON = { switch: /switch/i, wiiu: /wii\s*u/i, wii: /\bwii\b(?!\s*u)/i, ngc: /gamecube|\bgc\b/i, gc: /gamecube|\bgc\b/i, '3ds': /3ds/i, n3ds: /3ds/i, ps4: /ps4|playstation 4/i, ps3: /ps3|playstation 3/i, ps2: /ps2|playstation 2/i, psp: /\bpsp\b/i, psvita: /vita/i };
const NX_SUFFIX = /\s*(?:\((?:switch|wii u|wii|gamecube|3ds|ps\d|psp|vita)[^)]*\)|-\s*(?:3ds|gamecube|wii u|wii|switch|psp|ps\d))\s*$/i;
const NX_FILES = new Set(['MAIN', 'OPTIONAL', 'UPDATE', 'MISCELLANEOUS']);
function bbText(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/\[\/?(?:b|i|u|s|size|color|font|center|right|left|quote|spoiler|heading|line|youtube|img)[^\]]*\]/gi, '')
    .replace(/\[url=[^\]]*\]([^[]*)\[\/url\]/gi, '$1').replace(/\[\*\]/g, '• ').replace(/\[\/?list[^\]]*\]/gi, '').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, '’').replace(/\n{3,}/g, '\n\n').trim();
}
function nexus({ web, key = () => null, log = () => {} }) {
  const gql = async (query, variables, cache, maxAge) => {
    const j = await web.json(`${NX}/v2/graphql`, { method: 'POST', headers: NX_HEAD, body: JSON.stringify({ query, variables }), cache, maxAge });
    if (j?.errors?.length) throw new Error('Nexus Mods couldn’t answer: ' + (j.errors[0].message || 'unknown error'));
    return j.data;
  };
  // the Nexus game for a library game: an exact title match (console suffix aside), the console's own when there are two
  async function game(g, name = g.name) {
    const want = loose(titleOf(name));
    if (!want) return null;
    const words = titleOf(name).replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ').trim();
    const d = await gql('query($n: String!) { games(filter: { name: [{ value: $n, op: WILDCARD }] }, count: 20) { nodes { id domainName name modCount } } }', { n: words }, 'nexus-games-' + want, 7 * 864e5);
    const hits = (d?.games?.nodes || []).filter((x) => loose(String(x.name).replace(NX_SUFFIX, '')) === want && x.modCount > 0);
    const con = NX_CON[g.slug];
    return hits.find((x) => con && con.test(x.name)) || hits.find((x) => !NX_SUFFIX.test(x.name)) || hits[0] || null;
  }
  const SORT = { downloads: 'downloads', liked: 'endorsements', newest: 'createdAt', updated: 'updatedAt' };
  return {
    id: 'nexus', name: 'Nexus Mods', kind: 'mods', site: 'https://www.nexusmods.com',
    forGame: (g) => !!g.name && g.mods !== false, // only with an emulator Cartridge knows how to install mods into (modRules)
    async list(g, { sort = 'downloads', page = 1 } = {}) {
      // g.as: a shorter name picked from a suggestion (0.9.56); otherwise, with no game under the full name, the
      // shorter forms are tried and the first found is offered, never used without asking
      const gm = await game(g, g.as || g.name);
      if (!gm) return { items: [], error: `Nexus Mods has no game called “${titleOf(g.as || g.name)}”.`, suggest: g.as ? null : await suggestFrom(g, (n) => game(g, n)) };
      const d = await gql(`query($d: String!, $o: Int!) { mods(filter: { gameDomainName: [{ value: $d }], adultContent: [{ value: false }] }, sort: [{ ${SORT[sort] || 'downloads'}: { direction: DESC } }], count: 50, offset: $o) { totalCount nodes { modId name summary downloads endorsements author uploader { name } thumbnailUrl pictureUrl updatedAt createdAt version modCategory { name } } } }`,
        { d: gm.domainName, o: (page - 1) * 50 }, `nexus-mods-${gm.domainName}-${sort}-${page}`, 30 * 60e3);
      const items = (d?.mods?.nodes || []).map((m) => ({ source: 'nexus', id: m.modId, name: m.name, summary: m.summary || '', authors: [m.author || m.uploader?.name].filter(Boolean), category: m.modCategory?.name || '',
        downloads: m.downloads || 0, likes: m.endorsements || 0, views: 0, added: Date.parse(m.createdAt) || 0, updated: Date.parse(m.updatedAt) || 0, version: m.version || '',
        url: `https://www.nexusmods.com/${gm.domainName}/mods/${m.modId}`, preview: m.thumbnailUrl || m.pictureUrl || '', domain: gm.domainName, gameId: gm.id, kind: 'mods' }));
      return { items, game: { id: gm.id, name: gm.name, domain: gm.domainName }, total: d?.mods?.totalCount || items.length };
    },
    async detail(it) {
      const d = await gql('query($m: ID!, $g: ID!, $ids: [CompositeDomainWithIdInput!]!) { modFiles(modId: $m, gameId: $g) { fileId name version sizeInBytes category date description uri } legacyModsByDomain(ids: $ids) { nodes { description summary pictureUrl version author } } }',
        { m: String(it.id), g: String(it.gameId), ids: [{ gameDomain: it.domain, modId: Number(it.id) }] }, `nexus-mod-${it.domain}-${it.id}`, 30 * 60e3);
      const mod = d?.legacyModsByDomain?.nodes?.[0] || {};
      const files = (d?.modFiles || []).filter((f) => NX_FILES.has(String(f.category).toUpperCase()) && /\.(zip|7z|rar)$/i.test(f.uri || ''))
        .sort((a, b) => (a.category === 'MAIN' ? -1 : 0) - (b.category === 'MAIN' ? -1 : 0) || b.date - a.date)
        .map((f) => ({ id: f.fileId, name: f.uri, title: f.name, size: Number(f.sizeInBytes) || 0, version: f.version || '', description: bbText(f.description).slice(0, 300), category: String(f.category).toLowerCase() }));
      return { files, text: bbText(mod.description || mod.summary).slice(0, 6000), images: [mod.pictureUrl || it.preview].filter(Boolean), version: mod.version || it.version || '', author: mod.author || it.authors?.[0] || '', likes: it.likes, updated: it.updated };
    },
    // Premium: a direct link with the key; anyone else: the file's page, downloaded there and caught by Cartridge
    async download(it, f) {
      const page = `https://www.nexusmods.com/${it.domain}/mods/${it.id}?tab=files&file_id=${f.id}`;
      const k = key('nexus');
      if (!k) return { page };
      try {
        const me = await web.json(`${NX}/v1/users/validate.json`, { headers: { apikey: k, ...NX_HEAD }, cache: 'nexus-me', maxAge: 6 * 3600e3 });
        if (!me?.is_premium) return { page };
        const links = await web.json(`${NX}/v1/games/${it.domain}/mods/${it.id}/files/${f.id}/download_link.json`, { headers: { apikey: k, ...NX_HEAD }, retry: 1 });
        const url = Array.isArray(links) && links.find((l) => /^https:\/\//.test(l?.URI || ''))?.URI;
        return url ? { url, size: f.size } : { page };
      } catch (e) { log('nexus: direct download refused, using the page:', e.code || e.message); return { page }; }
    },
    // the key's account (Settings shows it): { name, premium } or throws a plain error
    async account(k) { const me = await web.json(`${NX}/v1/users/validate.json`, { headers: { apikey: k, ...NX_HEAD }, retry: 0 }); return { name: me?.name || '', premium: !!me?.is_premium }; },
  };
}

// ---------------------------------------------------------------- GameBanana (and EmuCoreX for PS2)
function gamebanana({ web }) {
  const f = asFetch(web);
  return {
    id: 'gb', name: 'GameBanana', kind: 'mods', site: 'https://gamebanana.com',
    forGame: (g) => !!g.name && g.mods !== false, // only with an emulator Cartridge knows how to install mods into (modRules)
    async list(g, { sort = 'downloads', page = 1 } = {}) {
      const gm = await S.gbGame(g.as || g.name, { fetchImpl: f });
      if (!gm) return { items: [], error: `GameBanana has no game called “${titleOf(g.as || g.name)}”.`, suggest: g.as ? null : await suggestFrom(g, (n) => S.gbGame(n, { fetchImpl: f })) };
      return { items: (await S.gbMods(gm.id, { fetchImpl: f, sort, page })).map((x) => ({ ...x, kind: 'mods' })), game: gm };
    },
    detail: (it) => S.gbMod(it.id, { fetchImpl: f }),
    download: async (_it, file) => ({ url: file.url, size: file.size, md5: file.md5 }),
  };
}
function emucorex({ web, cacheFile }) {
  return {
    id: 'ps2', name: 'EmuCoreX', kind: 'tex', site: 'https://emucorex.com',
    forGame: (g) => g.slug === 'ps2',
    async list(g) {
      if (!g.serial) return { items: [], error: 'Cartridge couldn’t read this game’s serial, which the packs are matched by.' };
      const all = await S.ps2Catalog({ cacheFile, fetchImpl: async (url, o) => ({ ok: true, status: 200, json: async () => web.json(url, { headers: o?.headers, timeout: 30000 }) }) });
      return { items: S.ps2For(all, g.serial).map((p) => ({ ...p, serial: g.serial, kind: 'tex' })) };
    },
    detail: async (it) => ({ files: [], text: it.description || '', images: it.previews || [], version: it.version, author: (it.authors || [])[0] || '' }),
    download: async (it) => (it.parts ? { parts: it.parts, sha256: it.sha256 } : { url: it.url, size: it.size, sha256: it.sha256 }),
  };
}

// ---------------------------------------------------------------- Romhacking.net (ROM hacks)
// Romhacking.net became read-only in August 2024; its pages and downloads stay up behind a browser check (the web
// engine's transport passes it in the app). Its pages are read loosely, by what they link to, so small layout
// changes don't break it: hacks are links to /hacks/<id>/, a hack's facts are its table's header and cell pairs, its
// file is the /download/hacks/<id>/ link. Hacks are patches (IPS, UPS, BPS; xdelta and PPF named but not applied).
const RH = 'https://www.romhacking.net';
// the console names Romhacking.net uses, per RomM slug (hacks are kept only for the game's own console)
const RH_PLATFORM = {
  nes: ['NES', 'Famicom'], famicom: ['NES', 'Famicom'], fds: ['FDS', 'Famicom Disk System'], snes: ['SNES', 'Super Famicom'], sfc: ['SNES', 'Super Famicom'], n64: ['N64', 'Nintendo 64'],
  gb: ['GB', 'Game Boy'], gbc: ['GBC', 'Game Boy Color'], gba: ['GBA', 'Game Boy Advance'], nds: ['NDS', 'Nintendo DS'], vb: ['VB', 'Virtual Boy'],
  genesis: ['GEN', 'Genesis', 'Mega Drive'], megadrive: ['GEN', 'Genesis', 'Mega Drive'], sms: ['SMS', 'Master System'], mastersystem: ['SMS', 'Master System'], gamegear: ['GG', 'Game Gear'], gg: ['GG', 'Game Gear'],
  pce: ['TG16', 'TurboGrafx-16', 'PC Engine'], pcengine: ['TG16', 'TurboGrafx-16', 'PC Engine'], tg16: ['TG16', 'TurboGrafx-16', 'PC Engine'], psx: ['PSX', 'PlayStation'], segacd: ['SCD', 'Sega CD'], sega32x: ['32X'],
  ngp: ['NGP', 'Neo Geo Pocket'], ngpc: ['NGPC', 'Neo Geo Pocket Color'], wonderswan: ['WS', 'WonderSwan'], wonderswancolor: ['WSC', 'WonderSwan Color'], msx: ['MSX'],
};
const unent = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, '’').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (h) => unent(String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
// the hacks in a list page: [{ id, name, cells }] (one per table row that links to a hack)
function rhList(html) {
  const out = [], seen = new Set();
  for (const row of String(html || '').split(/<tr[\s>]/i).slice(1)) {
    const m = row.match(/href="(?:https?:\/\/(?:www\.)?romhacking\.net)?\/hacks\/(\d+)\/?"[^>]*>([\s\S]*?)<\/a>/i);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => strip(c[1])).filter(Boolean);
    out.push({ id: Number(m[1]), name: strip(m[2]), cells });
  }
  return out;
}
// one hack's page: its facts (table header -> cell), description, pictures and download link
function rhHack(html) {
  const h = String(html || ''), facts = {};
  for (const m of h.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) { const k = strip(m[1]).replace(/:$/, ''); if (k && !(k in facts)) facts[k] = strip(m[2]); }
  const dl = h.match(/href="((?:https?:\/\/(?:www\.)?romhacking\.net)?\/download\/hacks\/\d+\/?)"/i)?.[1];
  const desc = h.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || '';
  const body = strip(h.match(/<div[^>]+class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
  const romInfo = strip(h).match(/ROM\s*\/\s*ISO Information:?\s*([\s\S]{0,700}?)(?:\n\n|Credits|Reviews|$)/i)?.[1]?.trim() || '';
  const images = [...h.matchAll(/<img[^>]+src="((?:https?:\/\/(?:www\.)?romhacking\.net)?\/hacks\/images\/[^"]+)"/gi)].map((m) => (m[1].startsWith('http') ? m[1] : RH + m[1])).slice(0, 6);
  const title = strip(h.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || h.match(/<title>([^<]*)/i)?.[1] || '').replace(/\s*-\s*Romhacking\.net.*$/i, '');
  return { title, facts, text: (body || unent(desc)).slice(0, 6000), romInfo, images, download: dl ? (dl.startsWith('http') ? dl : RH + dl) : '' };
}
const factOf = (facts, ...names) => { for (const n of names) for (const k of Object.keys(facts)) if (k.toLowerCase() === n.toLowerCase()) return facts[k]; return ''; };
function romhacks({ web }) {
  const UA = { Accept: 'text/html' };
  const onCon = (cells, slug) => { const names = RH_PLATFORM[slug] || []; return !cells.length || cells.some((c) => names.some((n) => c === n || c.toLowerCase() === n.toLowerCase())); };
  return {
    id: 'rh', name: 'ROM Hacks', site: RH, kind: 'hacks', beta: true,
    forGame: (g) => !!RH_PLATFORM[g.slug],
    async list(g) {
      const t = titleOf(g.name).replace(/\(.*?\)|\[.*?\]/g, '').trim();
      const html = await web.text(`${RH}/?page=hacks&perpage=200&game=${encodeURIComponent(t)}`, { headers: UA, cache: 'rh-' + loose(t) + '-' + g.slug, maxAge: 7 * 864e5, timeout: 45000 });
      const rows = rhList(html);
      const mine = rows.filter((r) => onCon(r.cells, g.slug));
      const items = (mine.length ? mine : rows).map((r) => ({ source: 'rh', id: r.id, name: r.name, authors: r.cells.length > 1 ? [r.cells[1]] : [], category: r.cells.find((c) => /^(improvement|translation|graphics|gameplay|text|sound|bug fix|other|complete|addendum)/i.test(c)) || 'Hack', downloads: 0, likes: 0, views: 0, added: 0, updated: 0, url: `${RH}/hacks/${r.id}/`, preview: '', kind: 'hacks' }));
      return { items, error: items.length ? '' : `Romhacking.net has no hacks listed for “${t}”.` };
    },
    async detail(it) {
      const p = rhHack(await web.text(it.url, { headers: UA, cache: 'rh-hack-' + it.id, maxAge: 30 * 864e5, timeout: 45000 }));
      const fmt = factOf(p.facts, 'Patch Format', 'Patching Format');
      return { files: p.download ? [{ id: it.id, name: `${it.name}.zip`, url: p.download, size: 0, description: [fmt && `${fmt} patch`, factOf(p.facts, 'Version') && 'Version ' + factOf(p.facts, 'Version')].filter(Boolean).join(' · ') }] : [],
        text: p.text, romInfo: p.romInfo, images: p.images, version: factOf(p.facts, 'Version'), author: factOf(p.facts, 'Hack by', 'Released By', 'Author'), facts: p.facts, updated: Date.parse(factOf(p.facts, 'Last Modified', 'Release Date')) || 0 };
    },
    download: async (_it, f) => ({ url: f.url, size: 0 }),
  };
}

// ---------------------------------------------------------------- the engine
function createModEngine({ web, key = () => null, cacheFile = null, log = () => {} }) {
  const providers = [emucorex({ web, cacheFile }), gamebanana({ web }), nexus({ web, key, log }), romhacks({ web })];
  const byId = Object.fromEntries(providers.map((p) => [p.id, p]));
  return {
    providers,
    get: (id) => byId[id] || null,
    // the sources a game has, in the order they show (PS2 textures, then mods, then ROM hacks)
    sourcesFor: (g, kind = null) => providers.filter((p) => p.forGame(g) && (!kind || p.kind === kind)).map((p) => ({ id: p.id, name: p.name, kind: p.kind, site: p.site, beta: !!p.beta })),
    async list(id, g, o) { const p = byId[id]; if (!p) throw new Error('Unknown add-on source.'); try { return await p.list(g, o); } catch (e) { return { items: [], error: e.message, code: e.code || '' }; } },
    detail: (id, it) => byId[id].detail(it),
    download: (id, it, f) => byId[id].download(it, f),
  };
}

module.exports = { createModEngine, nexus, gamebanana, emucorex, romhacks, rhList, rhHack, RH_PLATFORM, NX_SUFFIX, bbText, loose, titleOf };
