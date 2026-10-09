// Builds electron/recomps.json, the recomp catalogue Cartridge ships (0.9.65), from the researched entries
// (one JSON array per batch, each entry checked against its project: see docs/recomps.md for the sources).
//   node tools/recomps/build.js <entries.json>... [--updated YYYY-MM-DD]
// Every entry is checked: known console keys, a project or a site, build kinds, asset patterns that compile, no em
// dashes. The research notes ("evidence", "check", "assetsSeen") stay out of the shipped file; docs/recomps.md lists
// every entry with them.
const fs = require('fs');
const path = require('path');
const { CONSOLES } = require('../../electron/recomps');

const args = process.argv.slice(2);
const at = args.indexOf('--updated');
const updated = at >= 0 ? args.splice(at, 2)[1] : new Date().toISOString().slice(0, 10);
const all = [];
for (const f of args) all.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
const SHIP = ['id', 'name', 'games', 'origin', 'repo', 'site', 'builds', 'linuxAsset', 'windowsAsset', 'prerelease', 'program', 'args', 'needs', 'setup', 'done', 'saves', 'achievements', 'license', 'description'];
const out = [], problems = [], ids = new Set(), repos = new Set(), left = [];
for (const e of all) {
  const bad = (m) => problems.push(`${e.id || e.name}: ${m}`);
  // nothing to point anyone at (no project and no site found): left out of the shipped list, named in the docs
  if (!e.repo && !e.site) { left.push(e); continue; }
  if (!/^[a-z0-9-]+$/.test(e.id || '')) bad('id');
  if (ids.has(e.id)) { bad('duplicate id'); continue; }
  if (e.repo && repos.has(e.repo.toLowerCase())) { bad('duplicate project ' + e.repo); continue; }
  if (!e.games?.length || e.games.some((g) => !CONSOLES[g.console] || !g.title)) bad('games/console');
  if (e.repo && !/^(github|gitlab):[\w.-]+\/[\w.-]+$/.test(e.repo)) bad('repo ' + e.repo);
  if (!['linux', 'windows', 'site', 'none'].includes(e.builds)) bad('builds ' + e.builds);
  if (e.builds === 'site' && !e.site) bad('site builds without a site');
  for (const k of ['linuxAsset', 'windowsAsset']) if (e[k]) { try { new RegExp(e[k], 'i'); } catch { bad(k + ' does not compile'); } }
  if (/—/.test(JSON.stringify(e))) bad('em dash');
  if (e.setup && !['picker', 'place', 'path', 'none'].includes(e.setup.how)) bad('setup.how');
  if (e.setup?.how === 'path' && !/\{FILE\}/.test(e.setup.arg || '')) bad('path setup without {FILE}');
  if (e.setup?.how === 'place' && !e.setup.place) bad('place setup without a place');
  ids.add(e.id); if (e.repo) repos.add(e.repo.toLowerCase());
  const o = {};
  for (const k of SHIP) if (e[k] != null && !(Array.isArray(e[k]) && !e[k].length)) o[k] = e[k];
  if (o.setup) o.setup = Object.fromEntries(Object.entries(o.setup).filter(([, v]) => v != null && v !== ''));
  out.push(o);
}
const order = Object.keys(CONSOLES);
out.sort((a, b) => order.indexOf(a.games[0].console) - order.indexOf(b.games[0].console) || a.name.localeCompare(b.name));
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
const file = path.join(__dirname, '../../electron/recomps.json');
fs.writeFileSync(file, JSON.stringify({ updated, source: "PCGamingWiki's List of unofficial ports (console sections), each project checked; see docs/recomps.md", entries: out }, null, 1) + '\n');
// docs/recomps.md: every entry with what was checked and what's still uncertain (the record for the next session)
const BUILD = { linux: 'Linux build', windows: 'Windows build (Proton)', site: 'From its own site', none: 'Build it yourself' };
const md = ['# Recomp catalogue', '', `Built ${updated} by \`tools/recomps/build.js\` from the researched entries. Source list: PCGamingWiki's "List of unofficial ports", console sections only (owner's choice), status notes ignored (owner). Each project was checked from its own repository: tags, release files (a download answering 302), CI, README and source. Entries are shipped in \`electron/recomps.json\` without the notes below.`, ''];
for (const k of order) {
  const list = all.filter((e) => e.games?.[0]?.console === k && ids.has(e.id));
  if (!list.length) continue;
  md.push(`## ${CONSOLES[k]}`, '');
  for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
    md.push(`### ${e.name}`, '', `- Games: ${e.games.map((g) => g.title).join(', ')}`, `- Project: ${e.repo || e.site || 'none found'}`, `- Builds: ${BUILD[e.builds] || e.builds}${e.latestTag ? `, newest checked ${e.latestTag}` : ''}${e.assetsSeen?.length ? ` (${e.assetsSeen.join(', ')})` : ''}`);
    if (e.needs) md.push(`- Needs: ${e.needs.what}${e.needs.md5?.length || e.needs.sha1?.length ? ' (hashes listed by the project)' : ''}`);
    if (e.setup?.how) md.push(`- Setup: ${e.setup.how}${e.setup.place ? ` (${e.setup.place})` : ''}${e.setup.arg ? ` (${e.setup.arg})` : ''}${e.setup.notes ? `. ${e.setup.notes}` : ''}`);
    if (e.saves?.length) md.push(`- Saves: ${e.saves.join(', ')}`);
    if (e.achievements) md.push(`- Achievements: ${typeof e.achievements === 'string' ? e.achievements : JSON.stringify(e.achievements)}`);
    if (e.evidence?.length) md.push(`- Sources: ${e.evidence.join('; ')}`);
    if (e.check?.length) md.push(`- Not certain: ${e.check.join('; ')}`);
    md.push('');
  }
}
if (left.length) md.push('## Left out', '', 'Rows on the list with no project or download found anywhere:', '', ...left.map((e) => `- ${e.games?.map((g) => g.title).join(', ') || e.name} (${e.name}): ${(e.check || []).join('; ') || 'nothing found'}`), '');
fs.writeFileSync(path.join(__dirname, '../../docs/recomps.md'), md.join('\n').replace(/\u2014/g, ',') + '\n');
console.log(`${out.length} entries -> ${path.relative(process.cwd(), file)}${problems.length ? ` (${problems.length} problems)` : ''}, docs/recomps.md`);
