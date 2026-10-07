// The mods engine (0.9.52): sources per console, Nexus game matching (console suffixes, RomM's "Title, The" names),
// Premium vs page downloads, and Romhacking.net's pages read by what they link to. A fake web engine, nothing goes out.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../electron/modEngine');

const fakeWeb = (route) => ({ json: async (url, o = {}) => route(url, o), text: async (url, o = {}) => route(url, o) });
const gamesAnswer = (nodes) => ({ data: { games: { nodes } } });

test('which sources a game has', () => {
  const e = M.createModEngine({ web: fakeWeb(() => ({})) });
  const ids = (g, k) => e.sourcesFor(g, k).map((s) => s.id);
  assert.deepStrictEqual(ids({ name: 'Ico', slug: 'ps2' }), ['ps2', 'gb', 'nexus']);
  assert.deepStrictEqual(ids({ name: 'Super Metroid', slug: 'snes' }), ['gb', 'nexus', 'rh']);
  assert.deepStrictEqual(ids({ name: 'Super Metroid', slug: 'snes' }, 'hacks'), ['rh']);
  assert.deepStrictEqual(ids({ name: 'Bloodborne', slug: 'ps4' }, 'mods'), ['gb', 'nexus']);
  assert.ok(e.sourcesFor({ name: 'x', slug: 'snes' }).find((s) => s.id === 'rh').beta);
});

test('Nexus: the right game for RomM names, the console\'s own when Nexus has two', async () => {
  const nodes = [{ id: 1, domainName: 'mariokart8', name: 'Mario Kart 8 (Wii U)', modCount: 2 }, { id: 2, domainName: 'mk8pc', name: 'Mario Kart 8', modCount: 5 }, { id: 3, domainName: 'botw', name: 'The Legend of Zelda: Breath of the Wild', modCount: 71 }, { id: 4, domainName: 'empty', name: 'Ico', modCount: 0 }];
  let mods = null;
  const web = fakeWeb((url, o) => {
    const b = JSON.parse(o.body || '{}');
    if (/games\(/.test(b.query)) return gamesAnswer(nodes);
    mods = b.variables.d;
    return { data: { mods: { totalCount: 1, nodes: [{ modId: 9, name: 'Mod', downloads: 5, endorsements: 2, author: 'a', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-02-01T00:00:00Z', modCategory: { name: 'Visuals' } }] } } };
  });
  const nx = M.nexus({ web });
  let r = await nx.list({ name: 'Mario Kart 8 (USA)', slug: 'wiiu' });
  assert.strictEqual(mods, 'mariokart8');
  assert.strictEqual(r.items[0].url, 'https://www.nexusmods.com/mariokart8/mods/9');
  r = await nx.list({ name: 'Mario Kart 8', slug: 'switch' });
  assert.strictEqual(mods, 'mk8pc'); // no Switch entry: the one without a console suffix
  r = await nx.list({ name: 'Legend of Zelda, The - Breath of the Wild (USA)', slug: 'wiiu' });
  assert.strictEqual(mods, 'botw');
  r = await nx.list({ name: 'Ico', slug: 'ps2' });
  assert.ok(!r.items.length && /no game called “Ico”/.test(r.error)); // a game with no mods counts as none
});

test('Nexus downloads: Premium gets the file, everyone else its page', async () => {
  const it = { id: 30, domain: 'bloodborne' }, f = { id: 200, size: 10 };
  const page = 'https://www.nexusmods.com/bloodborne/mods/30?tab=files&file_id=200';
  assert.deepStrictEqual(await M.nexus({ web: fakeWeb(() => ({})), key: () => null }).download(it, f), { page });
  const free = M.nexus({ web: fakeWeb((u) => (/validate/.test(u) ? { is_premium: false } : null)), key: () => 'k' });
  assert.deepStrictEqual(await free.download(it, f), { page });
  const paid = M.nexus({ web: fakeWeb((u, o) => { assert.strictEqual(o.headers.apikey, 'k'); return /validate/.test(u) ? { is_premium: true } : [{ URI: 'https://cdn.example/f.zip' }]; }), key: () => 'k' });
  assert.deepStrictEqual(await paid.download(it, f), { url: 'https://cdn.example/f.zip', size: 10 });
  const refused = M.nexus({ web: fakeWeb(() => { throw Object.assign(new Error('no'), { code: 'auth' }); }), key: () => 'k' });
  assert.deepStrictEqual(await refused.download(it, f), { page });
});

test('Romhacking.net: hacks read from a list page, kept for the game\'s console', () => {
  const html = `<table class="datatable"><tr><th>Title</th><th>Released By</th><th>Platform</th></tr>
    <tr><td class="col_1 Title"><a href="/hacks/1234/">Super Metroid: Redesign</a></td><td>Drewseph</td><td>Improvement</td><td>SNES</td></tr>
    <tr><td><a href="https://www.romhacking.net/hacks/77/">Metroid Plus &amp; More</a></td><td>someone</td><td>NES</td></tr>
    <tr><td><a href="/hacks/1234/">dup</a></td></tr></table>`;
  const rows = M.rhList(html);
  assert.deepStrictEqual(rows.map((r) => [r.id, r.name]), [[1234, 'Super Metroid: Redesign'], [77, 'Metroid Plus & More']]);
  assert.ok(rows[0].cells.includes('SNES'));
});

test('Romhacking.net: a hack\'s facts, text, pictures and download link', () => {
  const html = `<html><head><title>Super Metroid: Redesign - Romhacking.net - Hacks</title><meta name="description" content="A harder Super Metroid."></head><body>
    <h2>Super Metroid: Redesign</h2><table><tr><th>Hack By:</th><td><a>Drewseph</a></td></tr><tr><th>Version:</th><td>1.2</td></tr><tr><th>Patch Format:</th><td>IPS</td></tr></table>
    <img src="/hacks/images/1234/shot1.png"><a href="/download/hacks/1234/">Download</a>
    <h3>ROM / ISO Information:</h3><p>Super Metroid (JU) [!].smc, no header. CRC32: D63ED5F8</p></body></html>`;
  const p = M.rhHack(html);
  assert.strictEqual(p.title, 'Super Metroid: Redesign');
  assert.strictEqual(p.facts['Hack By'], 'Drewseph');
  assert.strictEqual(p.facts['Patch Format'], 'IPS');
  assert.strictEqual(p.download, 'https://www.romhacking.net/download/hacks/1234/');
  assert.deepStrictEqual(p.images, ['https://www.romhacking.net/hacks/images/1234/shot1.png']);
  assert.match(p.romInfo, /CRC32: D63ED5F8/);
  assert.strictEqual(p.text, 'A harder Super Metroid.');
});

test('a source that fails says why, in words, without breaking the others', async () => {
  const e = M.createModEngine({ web: fakeWeb(() => { throw Object.assign(new Error('Cartridge can’t reach Nexus Mods right now.'), { code: 'offline' }); }) });
  const r = await e.list('nexus', { name: 'Bloodborne', slug: 'ps4' });
  assert.deepStrictEqual([r.items.length, r.code], [0, 'offline']);
  assert.match(r.error, /can’t reach Nexus Mods/);
  assert.strictEqual(M.bbText('[b]Bold[/b] [url=https://x]link[/url]<br />next [color=#f00]red[/color]'), 'Bold link\nnext red');
});

// 0.9.56 (owner: "Nexus Mods has no game called Bloodborne Game of the Year Edition. It does have Bloodborne"): no game
// under the full title offers the first shorter form the site has, and listing with it (as) finds the mods
test('Nexus: a shorter name is offered when the full title has no game, and used when picked', async () => {
  const nodes = [{ id: 5, domainName: 'bloodborne', name: 'Bloodborne', modCount: 40 }];
  let asked = null;
  const web = fakeWeb((url, o) => {
    const b = JSON.parse(o.body || '{}');
    if (/games\(/.test(b.query)) return gamesAnswer(nodes);
    asked = b.variables.d;
    return { data: { mods: { totalCount: 1, nodes: [{ modId: 1, name: '60 FPS', downloads: 1, endorsements: 1, author: 'a', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }] } } };
  });
  const nx = M.nexus({ web });
  let r = await nx.list({ name: 'Bloodborne Game of the Year Edition', slug: 'ps4' });
  assert.ok(!r.items.length && /no game called “Bloodborne Game of the Year Edition”/.test(r.error));
  assert.deepStrictEqual(r.suggest, { as: 'Bloodborne', name: 'Bloodborne' });
  r = await nx.list({ name: 'Bloodborne Game of the Year Edition', slug: 'ps4', as: 'Bloodborne' });
  assert.strictEqual(asked, 'bloodborne');
  assert.strictEqual(r.items.length, 1);
});
test('shorter titles: edition words, then the subtitle; never the full title', () => {
  const S = require('../electron/addonSources');
  assert.deepStrictEqual(S.shorterTitles('Bloodborne Game of the Year Edition'), ['Bloodborne']);
  assert.deepStrictEqual(S.shorterTitles('Dark Souls: Remastered'), ['Dark Souls']);
  assert.deepStrictEqual(S.shorterTitles('God of War III Remastered (USA)'), ['God of War III']);
  assert.deepStrictEqual(S.shorterTitles('Bloodborne'), []);
});
