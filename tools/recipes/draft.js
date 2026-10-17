// Drafts a Cartridge Verified recipe from a project link (0.9.71), the first step when the owner sends one:
//   GITHUB_TOKEN=... node tools/recipes/draft.js https://github.com/<owner>/<repo> [id]
// Reads the repo (name, licence, description), its newest release (which file is the Linux build, which the Windows
// one, by the same rules Cartridge installs with) and the README's first paragraph, and writes
// electron/recipes/<id>.json with every part a person must still fill in marked "TODO". It never guesses the game's
// IDs, its files, its settings or its saves: those come from reading the port's own launcher and runtime source
// (docs/recipes.md). A draft fails validation until they're filled in, so it can't ship half done.
const fs = require('fs');
const path = require('path');
const RC = require('../../electron/recipes');

const [link, wantId] = process.argv.slice(2);
const m = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?]|$)/.exec(link || '');
if (!m) { console.error('usage: draft.js https://github.com/<owner>/<repo> [id]'); process.exit(2); }
const repo = `${m[1]}/${m[2]}`;
const headers = { accept: 'application/vnd.github+json', 'user-agent': 'cartridge-recipe-draft', ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) };
const get = async (u) => { const r = await fetch(u, { headers }); if (!r.ok) throw new Error(`${u} answered ${r.status}`); return r; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

(async () => {
  const info = await (await get(`https://api.github.com/repos/${repo}`)).json();
  const rels = (await (await get(`https://api.github.com/repos/${repo}/releases?per_page=10`)).json()).filter((r) => !r.draft);
  const rel = rels.find((r) => !r.prerelease) || rels[0];
  if (!rel) throw new Error('It has no releases: Cartridge installs releases only.');
  let readme = '';
  try { readme = await (await get(`https://api.github.com/repos/${repo}/readme`)).json().then((j) => Buffer.from(j.content, 'base64').toString('utf8')); } catch {}
  const para = (readme.split(/\n\s*\n/).map((p) => p.replace(/[#*_`>[\]]|\(http[^)]*\)|<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).find((p) => p.length > 60) || '').slice(0, 400);
  // the build per system: the same rules Cartridge uses (an x86_64 AppImage or archive for Linux, a Windows zip)
  const names = (rel.assets || []).map((a) => a.name);
  const linux = names.find((n) => /x86_64\.AppImage$/i.test(n)) || names.find((n) => /linux.*\.(tar\.(gz|xz)|zip|7z)$/i.test(n) && !/arm|aarch64/i.test(n)) || names.find((n) => /linux/i.test(n) && !/\.(sha\d*|sig|asc|txt)$/i.test(n) && !/arm|aarch64/i.test(n));
  const win = names.find((n) => /(win|windows).*\.(zip|7z)$/i.test(n) && !/arm/i.test(n));
  const builds = [
    ...(linux ? [{ os: 'linux', asset: `^${esc(linux)}$`, program: /\.AppImage$/i.test(linux) ? linux : 'TODO: the program inside the archive', args: [], files: {} }] : []),
    ...(win ? [{ os: 'windows', asset: `^${esc(win)}$`, program: 'TODO: the .exe inside the zip', args: [], files: {} }] : []),
  ];
  const id = wantId || m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-?(pc|port|recomp)$/, '').slice(0, 30);
  const draft = {
    schema: 1, id, name: info.name, by: `TODO: who made it (${info.owner?.login})`, repo: `github:${repo}`, licence: info.license?.spdx_id && info.license.spdx_id !== 'NOASSERTION' ? info.license.spdx_id : 'TODO',
    about: para || info.description || 'TODO',
    verified: { on: 'TODO: the date it was installed and set up for real', release: rel.tag_name, played: false },
    game: { console: 'TODO', title: 'TODO', ids: ['TODO'], kind: 'folder', has: ['eboot.bin'], why: 'TODO' },
    builds, app: {}, saves: ['TODO'], settings: [],
    todo: [
      'game: console, title, the IDs the project names, the files its runtime opens (has), the version it needs',
      'builds: the program inside each archive, its arguments, the launcher settings file it reads (files.app / files.ini)',
      'settings: every setting of its launcher, from its source (id, tab, label, type, def, options, at)',
      'saves and achievements: where its runtime writes them',
      'then: node tools/recipes/index.js, npm test, node tools/recipes/install-test.js ' + id,
    ],
  };
  const out = path.join(__dirname, '../../electron/recipes', `${id}.json`);
  if (fs.existsSync(out)) throw new Error(`${path.relative(process.cwd(), out)} exists already: give another id.`);
  fs.writeFileSync(out, JSON.stringify(draft, null, 1) + '\n');
  console.log(`drafted ${path.relative(process.cwd(), out)} from ${repo} ${rel.tag_name}: Linux ${linux || 'none'}, Windows ${win || 'none'}`);
  console.log('not valid until filled in:', RC.validate(draft).join(', ') || 'nothing missing');
})().catch((e) => { console.error(e.message); process.exit(1); });
