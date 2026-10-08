// Design rules (0.9.50, docs/design-rules.md): the rules code can check. The rest are checked by eye and by
// `npm run audit:ui` (focus, contrast, clipping). A failure here means a rule was broken, not that the test is wrong:
// read the rule first.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const walk = (d, ext) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), ext) : ext.test(e.name) ? [path.join(d, e.name)] : []));
const SRC = walk(path.join(ROOT, 'src'), /\.(vue|js|css)$/);
const rel = (f) => path.relative(ROOT, f);

test('no em dashes in the app, its notes or its docs (owner\'s rule)', () => {
  const files = [...SRC, ...walk(path.join(ROOT, 'electron'), /\.js$/), ...walk(path.join(ROOT, 'docs'), /\.md$/), 'RELEASE_NOTES.md', 'CLAUDE.md'].map((f) => path.resolve(ROOT, f));
  const bad = files.filter((f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('—')).map(rel);
  assert.deepStrictEqual(bad, []);
});

// Vue scoped CSS drops everything after :global(x): `:global(body.a) .b` compiles to `body.a { ... }` and restyles the
// whole app (0.9.20). Write `:global(body.a .b)`.
test('no selector continues after :global(...) in a .vue file', () => {
  const bad = [];
  for (const f of SRC.filter((x) => x.endsWith('.vue'))) {
    const t = fs.readFileSync(f, 'utf8'), css = t.slice(t.indexOf('<style'));
    for (let i = css.indexOf(':global('); i >= 0; i = css.indexOf(':global(', i + 1)) {
      let depth = 0, j = i + 7;
      for (; j < css.length; j++) { if (css[j] === '(') depth++; else if (css[j] === ')' && --depth === 0) break; }
      const next = css.slice(j + 1).match(/^\s*(\S)/)?.[1];
      if (next && !/[,{)]/.test(next)) bad.push(`${rel(f)}: ${css.slice(i, j + 12).replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

// Nothing moves the whole screen on its own (0.9.49: a slow whole-screen zoom made people feel sick): the drift of the
// page art and the header picture may pan a little, never change scale.
test('background and header drift never zoom', () => {
  const files = { 'src/styles.css': /@keyframes\s+bg-[\w-]*\s*\{([^@]*?)\}\s*\}/g, 'src/components/MediaBar.vue': /@keyframes\s+media-drift\s*\{([^@]*?)\}\s*\}/g };
  for (const [f, re] of Object.entries(files)) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of t.matchAll(re)) {
      const scales = [...m[1].matchAll(/scale\(([\d.]+)\)/g)].map((x) => x[1]);
      assert.ok(new Set(scales).size <= 1, `${f}: ${m[0].slice(0, 80)} changes scale`);
    }
  }
  // the page art never gets a transition or animation on its scale
  const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
  assert.ok(!/\.bg-stage \.layer[^{]*\{[^}]*transition:[^;}]*transform/.test(css), '.bg-stage .layer animates its transform');
});

// Text wraps instead of being cut; an ellipsis only on the single-line controls listed in docs/design-rules.md
test('ellipsis only where the rules allow it', () => {
  const ALLOWED = { 'src/components/ControllerTest.vue': 1, 'src/components/Keyboard.vue': 1, 'src/styles.css': 2, 'src/views/Start.vue': 2 };
  const found = {};
  for (const f of SRC) { const n = (fs.readFileSync(f, 'utf8').match(/text-overflow:\s*ellipsis/g) || []).length; if (n) found[rel(f)] = n; }
  assert.deepStrictEqual(found, ALLOWED, 'a new ellipsis: make the text wrap instead, or add it to the rules with the owner');
});

// Plain and Glass stay separate: covered by test/styleModes.test.js. Logos: test/logos.test.js.
test('the rule book points at its checks', () => {
  const t = fs.readFileSync(path.join(ROOT, 'docs/design-rules.md'), 'utf8');
  for (const x of ['clipping.js', 'contrast.js', 'focus.js', 'styleModes.test.js', 'logos.test.js']) assert.ok(t.includes(x), x);
});

// Nothing decodes or shrinks pictures on Electron's main thread in code that runs by itself (0.9.60: 25 to 120 ms a
// picture there froze the controller and every call). The image worker (src/imageWorker.js) does it; these are the only
// places left, each on demand or a fallback, pinned so a new one has to be argued for.
test('picture work stays off the main thread', () => {
  const t = fs.readFileSync(path.join(ROOT, 'electron/main.js'), 'utf8');
  const fns = [...t.matchAll(/nativeImage\.createFromBuffer/g)].map((m) => { const before = t.slice(0, m.index); const f = [...before.matchAll(/\n(?:async )?function (\w+)/g)].pop(); return f ? f[1] : '?'; });
  // coverCrop and iconOpaque: Steam art, made when you add games to Steam; asPng, sgdbImage, prepareLogoHere: only when
  // the image worker can't answer
  assert.deepStrictEqual([...new Set(fns)].sort(), ['asPng', 'coverCrop', 'iconOpaque', 'prepareLogoHere', 'sgdbImage'].sort());
});
