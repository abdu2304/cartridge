// Writes electron/recipes/index.json, every Cartridge Verified recipe in one file: Cartridge fetches it once a day from
// the repository, so a recipe added or fixed on main reaches everyone without a release (0.9.70). Run it after
// changing a recipe; test/recipes.test.js fails while index.json and the recipe files differ.
//   node tools/recipes/index.js
const fs = require('fs'), path = require('path');
const R = require('../../electron/recipes');
const dir = R.SHIPPED, all = [];
for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'index.json').sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')), bad = R.validate(r);
  if (bad.length) { console.error(`${n}: ${bad.join(', ')}`); process.exit(1); }
  all.push(r);
}
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(all) + '\n');
console.log(`${all.length} recipes in index.json`);
