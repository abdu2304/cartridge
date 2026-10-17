// Accessibility audit (0.9.70, accessibility-review skill, WCAG 2.1 AA where it applies to a controller app): every
// main page, Settings section, the game page and the Cartridge Verified sheet are scanned for controls with no name
// (4.1.2: a button that is only an icon needs aria-label or title), pictures that carry meaning with no alt (1.1.1),
// and touch targets under 32 px (2.5.5 asks 44; Cartridge's dense rows on a 1280x800 handheld are allowed 32, so only
// the ones below that are listed). Contrast and visible focus are focus.js and contrast.js.
// Usage: npx vite build && node tools/ui-audit/a11y.js   (exits 1 when a control has no name)
const { open, TABS } = require('./harness.js');

const SCAN = () => {
  const root = document.querySelector('.scrim .dialog') || document.querySelector('main.main') || document.body;
  const vis = (el) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) && !el.closest('[aria-hidden="true"], .st-ov');
  const path = (el) => { const p = []; for (let a = el; a && a !== document.body && p.length < 3; a = a.parentElement) p.unshift(a.tagName.toLowerCase() + (a.classList[0] ? '.' + a.classList[0] : '')); return p.join(' > '); };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join(' ') || [...el.querySelectorAll('svg[aria-label]')].map((s) => s.getAttribute('aria-label')).join(' ') || '').trim();
  const out = { noName: [], noAlt: [], small: [] };
  for (const el of root.querySelectorAll('button, a[href], [role="button"], input, select, textarea, [data-focus]')) {
    if (!vis(el)) continue;
    if (el.matches('input, select, textarea')) { if (!(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.labels?.length || el.getAttribute('title'))) out.noName.push(path(el)); continue; }
    if (!name(el)) out.noName.push(path(el));
    const r = el.getBoundingClientRect();
    if (r.width && r.height && (r.width < 32 || r.height < 32) && !el.closest('.kb, .st-handle')) out.small.push(`${path(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const img of root.querySelectorAll('img')) if (vis(img) && !img.hasAttribute('alt') && !img.closest('button, a, [data-focus]')) out.noAlt.push(path(img));
  return out;
};

async function run(width = 1280, height = 800) {
  const { browser, page: p, errors } = await open({ width, height });
  await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' }).catch(() => {});
  const res = { noName: new Set(), noAlt: new Set(), small: new Set() };
  const scan = async (label) => { await p.waitForTimeout(600); const r = await p.evaluate(SCAN); for (const k of Object.keys(res)) for (const x of r[k]) res[k].add(`${label} | ${x}`); };
  for (const t of TABS) { await p.click(`[data-tab="${t}"]`).catch(() => {}); await scan(t); }
  await p.click('[data-tab="settings"]').catch(() => {}); await p.waitForTimeout(600);
  for (const k of await p.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key))) { await p.click(`[data-key="${k}"]`).catch(() => {}); await scan('settings ' + k); }
  await p.click('[data-tab="library"]').catch(() => {}); await p.waitForTimeout(800); await p.locator('.card').first().click().catch(() => {}); await scan('game page');
  await p.click('[data-tab="consoles"]').catch(() => {}); await p.waitForTimeout(500);
  await p.click('[data-key="sys-steam"]').catch(() => {}); await scan('recomps page');
  for (const id of ['uncharted', 'pt']) { await p.evaluate((x) => { window.__cartStore?.openModal?.('verified', { id: x }); }, id).catch(() => {}); await scan('verified ' + id); await p.evaluate(() => window.__cartStore?.closeModal?.(null)).catch(() => {}); }
  await browser.close();
  return { noName: [...res.noName], noAlt: [...res.noAlt], small: [...res.small], errors };
}
if (require.main === module) (async () => {
  const r = await run();
  for (const x of r.noName) console.log('  NO NAME ' + x);
  for (const x of r.noAlt) console.log('  NO ALT  ' + x);
  for (const x of r.small) console.log('  SMALL   ' + x);
  console.log(`== accessibility: ${r.noName.length} controls with no name, ${r.noAlt.length} pictures with no alt, ${r.small.length} small targets`);
  process.exitCode = r.noName.length ? 1 : 0;
})();
module.exports = { run };
