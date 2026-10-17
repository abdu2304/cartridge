// Worst-case audit (0.9.70, break-ui skill): the library real people have, not the one that looks good. Japanese and
// accented names, emoji, a one-letter name, a console with one game and one with 1,284, games with no cover or
// summary, play time of exactly one minute. Every main page, Settings section and the game page are scanned for cut
// text (clipping.js SCAN) and for words a person should never read: NaN, undefined, null, [object Object],
// Invalid Date, and counts of one in the plural ("1 games").
// Usage: npx vite build && node tools/ui-audit/worst.js   (exits 1 when anything is found)
const { open, TABS } = require('./harness.js');
const { SCAN } = require('./clipping.js');

const NAMES = ['ファイナルファンタジーX/X-2 HD Remaster', 'Pokémon Mystery Dungeon: Explorers of Sky', 'Q', '🎮 Super Mario 64 (Beta) [!]', 'Tom Clancy’s Splinter Cell: Chaos Theory (Collector’s Edition) (USA, Europe) (En,Fr,De,Es,It,Nl,Sv,No,Da,Fi) (Rev 2)', 'Ōkami HD', 'Dragon Quest VIII: Sora to Umi to Daichi to Norowareshi Himegimi', 'NBA 2K24', 'Ys VIII: Lacrimosa of DANA'];
function worstLib() {
  const svg = (h) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="100%" height="100%" fill="hsl(${h},50%,40%)"/></svg>`);
  const plats = [
    { id: 1, slug: 'ps2', fs_slug: 'ps2', name: 'PlayStation 2', display_name: 'PlayStation 2', family_name: 'PlayStation', rom_count: 1284 },
    { id: 2, slug: 'n64', fs_slug: 'n64', name: 'Nintendo 64', display_name: 'Nintendo 64', family_name: 'Nintendo', rom_count: 1 },
    { id: 3, slug: 'wonderswan-color', fs_slug: 'wsc', name: 'Bandai WonderSwan Color', display_name: 'Bandai WonderSwan Color', family_name: 'Bandai', rom_count: 2 },
  ].map((p) => ({ ...p, target: { path: '/roms/' + p.fs_slug, exists: true } }));
  const roms = {}; let id = 1;
  for (const p of plats) {
    roms[p.id] = [];
    for (let i = 0; i < p.rom_count; i++, id++) {
      const name = i < NAMES.length && p.id !== 2 ? NAMES[(i + p.id) % NAMES.length] : p.id === 2 ? 'Q' : `Game ${id}`;
      const bare = id % 4 === 0; // no cover, no summary, no genres
      roms[p.id].push({ id, name, fs_name: `g${id}.iso`, platform_id: p.id, platform_slug: p.slug, platform_display_name: p.display_name, fs_size_bytes: id % 5 ? 4.7e9 : 0, regions: [], genres: bare ? [] : ['Action'], developer: bare ? null : 'Studio', files: [], created_at: '2026-09-1' + (i % 9), summary: bare ? null : 'A game.', path_cover_small: bare ? null : svg(id * 37 % 360), path_cover_large: bare ? null : svg(id * 37 % 360) });
    }
  }
  const all = Object.values(roms).flat();
  const installed = Object.fromEntries(all.slice(0, 30).map((r) => [r.id, '/roms/x/' + r.fs_name]));
  return { plats, roms, installed };
}
const WORDS = () => {
  const root = document.querySelector('.scrim .dialog') || document.querySelector('main.main') || document.body;
  const text = root.innerText || '';
  const out = [];
  for (const re of [/\bNaN\b/, /\bundefined\b/, /\bnull\b/, /\[object \w+\]/, /Invalid Date/, /\b1 (games|files|saves|trophies|minutes|hours|days|items|settings|emulators|folders|updates|devices|achievements|shortcuts|versions|copies)\b/]) {
    const m = re.exec(text); if (m) out.push(`"${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}"`);
  }
  return out;
};

async function run(width, height) {
  const lib = worstLib();
  const extra = { 'play:stats': { 2: { min: 1, last: Date.now() - 60e3 }, 3: { min: 61, last: Date.now() - 3600e3 } } };
  const { browser, page: p, errors } = await open({ width, height, lib, answers: extra });
  await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' }).catch(() => {});
  const bad = new Set();
  const scan = async (label) => { await p.waitForTimeout(600); for (const x of [...await p.evaluate(SCAN), ...(await p.evaluate(WORDS)).map((w) => 'reads ' + w)]) bad.add(`${width}x${height} ${label} | ${x}`); };
  for (const t of TABS) { await p.click(`[data-tab="${t}"]`).catch(() => {}); await scan(t); }
  await p.click('[data-tab="settings"]').catch(() => {}); await p.waitForTimeout(600);
  for (const k of await p.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key))) { await p.evaluate(() => document.querySelector(".hub-back")?.click()); await p.waitForTimeout(200); await p.click(`[data-key="${k}"]`).catch(() => {}); await scan('settings ' + k); }
  for (const id of [1, 4, 1290]) { await p.evaluate((x) => window.__cartStore?.go?.('game', { romId: x }), id).catch(() => {}); await scan('game page ' + id); }
  await p.click('[data-tab="consoles"]').catch(() => {}); await p.waitForTimeout(500);
  for (const k of await p.evaluate(() => [...document.querySelectorAll('[data-key^="sys-"]')].slice(0, 4).map((e) => e.dataset.key))) { await p.click(`[data-key="${k}"]`).catch(() => {}); await scan('console ' + k); await p.click('[data-tab="consoles"]').catch(() => {}); await p.waitForTimeout(300); }
  await browser.close();
  return { bad: [...bad], errors };
}
if (require.main === module) (async () => {
  let n = 0;
  for (const [w, h] of [[1280, 800], [1920, 1080]]) { const r = await run(w, h); n += r.bad.length; for (const x of r.bad) console.log('  ' + x); for (const e of r.errors) console.log('  ERROR ' + e); }
  console.log(`== worst case: ${n} problem${n === 1 ? '' : 's'}`);
  process.exitCode = n ? 1 : 0;
})();
module.exports = { run, worstLib };
