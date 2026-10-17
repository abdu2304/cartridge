// Recipe watchdog (0.9.70): checks that every Cartridge Verified recipe's newest release still has a file for each
// of its builds, so a renamed download or a moved repo shows up here before users hit it. Run by
// .github/workflows/recipes-check.yml every night (it opens or updates an issue when something fails), or by hand:
//   GITHUB_TOKEN=... node tools/recipes/check.js
// Exits 1 when a recipe has a build with no matching file. Not shipped.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../../electron/recipes');
const headers = { accept: 'application/vnd.github+json', 'user-agent': 'cartridge-recipes-check', ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) };

async function newest(repo) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers });
  if (r.status === 404) throw new Error('the repo is gone or private');
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const list = (await r.json()).filter((x) => !x.draft);
  if (!list.length) throw new Error('it has no releases');
  return list;
}

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const bad = [];
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const repo = String(r.repo || '').replace(/^github:/, '');
    try {
      const list = await newest(repo);
      // the newest release counts; a pre-release only when the project has nothing else
      const rel = list.find((x) => !x.prerelease) || list[0];
      for (const b of r.builds || []) {
        const re = new RegExp(b.asset, 'i');
        const hit = (rel.assets || []).find((a) => re.test(a.name));
        if (hit) console.log(`ok   ${r.id} ${b.os}: ${rel.tag_name} ${hit.name}`);
        else bad.push(`${r.name} (${r.id}): the ${b.os} build is missing from ${rel.tag_name} (looked for /${b.asset}/; files: ${(rel.assets || []).map((a) => a.name).join(', ') || 'none'})`);
      }
    } catch (e) { bad.push(`${r.name} (${r.id}): ${e.message} (https://github.com/${repo})`); }
  }
  for (const x of bad) console.log('FAIL ' + x);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, bad.length ? bad.map((x) => '- ' + x).join('\n') + '\n' : 'Every recipe has its files.\n');
  if (bad.length && process.env.RECIPES_REPORT) fs.writeFileSync(process.env.RECIPES_REPORT, bad.map((x) => '- ' + x).join('\n') + '\n');
  process.exitCode = bad.length ? 1 : 0;
})();
