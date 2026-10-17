// Runs the UI audits: focus and contrast in all six looks (Plain and Glass, in the Cartridge, Light and OLED colours). Before a release:
//   npx vite build && node tools/ui-audit/run.js
// then clipping (0.9.49, and the worst-case library since 0.9.70: text its box cuts off, every page and widget at 1280x800 and 1920x1080).
// Needs Playwright with a Chromium (CHROMIUM=/path/to/chrome to pick one). Exits 1 when a focus can't be seen or a text is cut.
const focus = require('./focus.js'), contrast = require('./contrast.js'), clipping = require('./clipping.js'), tour = require('./tour.js'), worst = require('./worst.js'), a11y = require('./a11y.js');
const { LOOKS } = require('./harness.js');
(async () => {
  let hidden = 0;
  for (const [th, st] of LOOKS) {
    const f = await focus(th, st), c = await contrast(th, st);
    hidden += f.bad.length;
    console.log(`== ${th} ${st}: ${f.bad.length} focus hard to see, ${c.bad.length} low-contrast texts to look at${f.errors.length ? `, ${f.errors.length} page errors` : ''}`);
    for (const x of f.bad) console.log('  FOCUS ' + x);
    for (const x of c.bad) console.log('  TEXT  ' + x);
    for (const e of f.errors) console.log('  ERROR ' + e);
  }
  let cut = 0;
  for (const [w, h] of [[1280, 800], [1920, 1080]]) for (const r of [await clipping.pages(w, h), await clipping.widgets(w, h)]) { cut += r.bad.length; for (const x of r.bad) console.log('  CUT   ' + x); }
  console.log(`== clipping: ${cut} cut text${cut === 1 ? '' : 's'}`);
  // 0.9.70: the worst-case library (break-ui): cut text and words nobody should read (NaN, undefined, "1 games")
  let worse = 0;
  for (const [w, h] of [[1280, 800], [1920, 1080]]) { const r = await worst.run(w, h); worse += r.bad.length; for (const x of r.bad) console.log('  WORST ' + x); }
  console.log(`== worst case: ${worse} problem${worse === 1 ? '' : 's'}`);
  // 0.9.70: controls with no name and pictures with no alt (accessibility-review)
  const ax = await a11y.run(); for (const x of ax.noName) console.log('  NONAME ' + x);
  console.log(`== accessibility: ${ax.noName.length} controls with no name, ${ax.noAlt.length} pictures with no alt`);
  let stuck = 0;
  for (const kb of ['builtin', 'auto']) { const r = await tour.run(kb); if (!r.ok) stuck++; console.log(`== tour (${kb}): ${r.ok ? 'finished' : 'stuck on ' + r.stuck}`); }
  process.exitCode = hidden || cut || worse || ax.noName.length || stuck ? 1 : 0;
})();
