// Writes src/tokens.css from src/tokens.js (0.9.70): one block per look, in LOOKS order, each token's value for that
// look. Run after changing a token: node tools/tokens/gen.js. test/tokens.test.js checks the file is up to date.
const fs = require('fs');
const path = require('path');

async function css() {
  const { LOOKS, TOKENS } = await import(path.join(__dirname, '../../src/tokens.js'));
  const out = ['/* Made by tools/tokens/gen.js from src/tokens.js. Change the tokens there, not here. */'];
  for (const l of LOOKS) {
    const lines = Object.entries(TOKENS).filter(([, t]) => t[l.id] != null).map(([k, t]) => `  ${k}: ${t[l.id]};`);
    if (!lines.length) continue;
    if (l.media) out.push(`/* ${l.what} */`, `@media ${l.media} {`, `${l.sel} {`, ...lines, '}', '}');
    else out.push(`/* ${l.what} */`, `${l.sel} {`, ...lines, '}');
  }
  return out.join('\n') + '\n';
}
const FILE = path.join(__dirname, '../../src/tokens.css');
if (require.main === module) css().then((c) => { fs.writeFileSync(FILE, c); console.log('src/tokens.css written'); });
module.exports = { css, FILE };
