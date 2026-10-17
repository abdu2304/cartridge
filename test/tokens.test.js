// One token source for Plain and Glass (0.9.70): src/tokens.css is what tools/tokens/gen.js makes from src/tokens.js,
// and no token belongs to both Styles (the owner's rule: Plain and Glass are never merged).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const gen = require('../tools/tokens/gen.js');

test('src/tokens.css is made from src/tokens.js (run node tools/tokens/gen.js)', async () => {
  assert.strictEqual(fs.readFileSync(gen.FILE, 'utf8'), await gen.css());
});
test('every token is Plain\'s or Glass\'s, never both, and has a value', async () => {
  const { LOOKS, TOKENS } = await import(path.join(__dirname, '../src/tokens.js'));
  const styleOf = Object.fromEntries(LOOKS.map((l) => [l.id, l.style]));
  for (const [k, t] of Object.entries(TOKENS)) {
    const looks = Object.keys(t).filter((x) => x !== 'what');
    assert.ok(looks.length, k + ' has no value');
    for (const l of looks) assert.ok(styleOf[l], `${k}: unknown look ${l}`);
    assert.strictEqual(new Set(looks.map((l) => styleOf[l])).size, 1, `${k} is given to both Plain and Glass`);
    assert.ok(t.what, k + ' says what it is for');
    assert.ok(!(k in {}) && !/[;{}]/.test(looks.map((l) => t[l]).join('')), k + ': a value must not hold ; { or }');
  }
});
test('styles.css no longer sets the tokens it moved', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  for (const k of ['--lg-fill', '--lg-pane', '--lg-lit', '--pl-edge', '--chip-bg']) assert.ok(!new RegExp(`${k}\\s*:`).test(css), k + ' is set in styles.css too');
});
