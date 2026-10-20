'use strict';
// Cartridge Verified (0.9.70, owner: "a curated list I update myself via you"): one recipe per game in
// electron/recipes/<id>.json, each made from that port's own source, so Cartridge sets it up with no input beyond
// picking the game: the build for this system, your copy from the library, the port's settings (written into the
// port's own files, the ones its launcher writes), and one start script that Steam and Cartridge both run.
//
// A recipe holds:
//   game      the console game it needs: title, title IDs, what the folder must hold, the version (APP_VER in
//             sce_sys/param.sfo) and whether an update has to be laid over it
//   builds    per system (linux first, windows through Proton): the release file, the program, its arguments,
//             an installer to run instead of unpacking (P.T.), and where its files are:
//               app   the launcher's settings.json (its --play reads it), json
//               ini   the game's own settings file: flat (key=value) or ini ([section] key = value)
//   app       constant keys of settings.json ({game} is your copy); play entries can add their own (Uncharted's
//             three games are one start each, "start": u1/u2/u3)
//   settings  every setting Cartridge shows: id, tab, label, type (choice, bool, number, text), def (the port's own
//             default), options, at: ['app', key] or ['ini', key | [section, key]]
//   saves     the folders that hold the saves ({dir}, {data}, {config}); per system when they differ
// Templates: {dir} the install folder, {game} your copy (a Windows path for Windows builds), {home}, {config}
// ($XDG_CONFIG_HOME), {data} ($XDG_DATA_HOME), {appdata} (AppData/Roaming in Cartridge's Proton prefix), {result}.
// Tested in test/recipes.test.js.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SHELL_UNSET } = require('./childEnv');

const SHIPPED = path.join(__dirname, 'recipes');
const TYPES = new Set(['choice', 'bool', 'number', 'text']);
const TPL = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g; // 0.9.91: any name varsFor gives ({gameDir}, {gamePosix}, a recipe's look vars); unknown ones expand to ''

// ---- loading and checking: a recipe that fails a check is left out (and named in the log), never half used
function validate(r) {
  const bad = [];
  if (!r || typeof r !== 'object') return ['not an object'];
  if (r.schema !== 1) bad.push('schema is not 1');
  // a draft (tools/recipes/draft.js) never loads: every TODO must be filled in and the todo list removed
  if (r.todo) bad.push('todo list still there');
  const todo = []; (function walk(v, at) { if (typeof v === 'string') { if (/^TODO\b/.test(v)) todo.push(at); } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k); })(r, '');
  for (const at of todo) bad.push(`${at} is TODO`);
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(r.id || '')) bad.push('id');
  if (!r.name) bad.push('name');
  if (!/^github:[\w.-]+\/[\w.-]+$/.test(r.repo || '')) bad.push('repo');
  if (!r.game?.console || !r.game?.title) bad.push('game');
  if (r.game?.kind && !['folder', 'folder-or-pkg', 'file', 'none'].includes(r.game.kind)) bad.push('game kind');
  if (r.game?.unpack && r.game.unpack !== 'xiso') bad.push('game unpack');
  if (r.game?.keep && !(Array.isArray(r.game.keep) && r.game.keep.every((k) => /^[\w.-]+$/.test(k) && !/^\.\.?$/.test(k)))) bad.push('game keep');
  if (r.game?.alsoOn && !(Array.isArray(r.game.alsoOn) && r.game.alsoOn.every((c) => /^[a-z0-9]+$/.test(c)))) bad.push('game alsoOn');
  if (r.game?.kind === 'file' && !(Array.isArray(r.game.ext) && r.game.ext.length && r.game.ext.every((e) => /^\.[\w.]+$/.test(e)))) bad.push('game ext');
  if (r.game?.sha1 && !(Array.isArray(r.game.sha1) && r.game.sha1.every((h) => /^[0-9a-f]{40}$/.test(h)))) bad.push('game sha1');
  if (r.setup && !(r.setup.by === 'port' && Array.isArray(r.setup.done) && r.setup.done.length && r.setup.done.every((f) => /^\{(dir|home|config|data|appdata)\}\//.test(f)) && typeof r.setup.say === 'string')) bad.push('setup');
  for (const l of r.look || []) if (!/^[a-z][a-zA-Z0-9]*$/.test(l.var || '') || !Array.isArray(l.files) || !l.files.length || !Array.isArray(l.dirs) || !l.dirs.every((d) => /^\{(dir|home|config|data|appdata)\}\//.test(d))) bad.push(`look ${l.var}`);
  if (r.game?.tested && !(Array.isArray(r.game.tested) && r.game.tested.every((v) => /^\d{2}\.\d{2}$/.test(v)))) bad.push('game tested');
  if (r.game?.find && !(Array.isArray(r.game.find.files) && r.game.find.files.length && r.game.find.files.every((f) => f && !/[/\\]|^\.\.?$/.test(f)) && Number.isInteger(r.game.find.depth ?? 0))) bad.push('game find');
  if (!Array.isArray(r.builds) || !r.builds.length) bad.push('builds');
  for (const b of r.builds || []) {
    if (!['linux', 'windows'].includes(b.os)) bad.push(`build os ${b.os}`);
    try { new RegExp(b.asset); } catch { bad.push(`build asset ${b.asset}`); }
    if (!b.program || /[/\\]\.\.|^\//.test(b.program)) bad.push(`build program ${b.program}`);
    for (const [k, f] of Object.entries(b.files || {})) if (!['app', 'ini', 'list'].includes(k) || !(k === 'list' ? f.format === 'lines' : ['json', 'flat', 'ini'].includes(f.format)) || !/^\{(dir|home|config|data|appdata)\}\//.test(f.path || '')) bad.push(`build file ${k}`);
    if (b.prepare && !(Array.isArray(b.prepare.cmd) && b.prepare.cmd.length && typeof b.prepare.done === 'string' && /^\{(dir|home|config|data|appdata)\}\//.test(b.prepare.done))) bad.push('build prepare');
    if (b.first && !(typeof b.first.unless === 'string' && /^\{(dir|home|config|data|appdata)\}\//.test(b.first.unless) && Array.isArray(b.first.args))) bad.push('build first');
  }
  if (r.achievements) {
    const a = r.achievements;
    for (const f of a.files || []) if (!/^\{(dir|config|data|appdata)\}\//.test(f)) bad.push(`achievements file ${f}`);
    if (a.format && !['ps4', 'keyed', 'hedge'].includes(a.format)) bad.push('achievements format');
    if (a.format === 'hedge' && !(/^[\w.-]+$/.test(a.user || '') && /^[\w.-]+$/.test(a.file || ''))) bad.push('achievements hedge');
    for (const t of a.list || []) if (!Array.isArray(t) || !(a.format === 'keyed' ? typeof t[0] === 'string' && t[0] : Number.isInteger(t[0])) || !t[1] || !(a.format === 'keyed' ? t[3] == null || ['P', 'G', 'S', 'B'].includes(t[3]) : ['P', 'G', 'S', 'B'].includes(t[3]))) bad.push(`achievements list ${t?.[0]}`);
  }
  if (r.known && !(['app', 'ini'].every((k) => r.known[k] == null || (Array.isArray(r.known[k]) && r.known[k].every((x) => typeof x === 'string'))))) bad.push('known');
  const ids = new Set();
  for (const s of r.settings || []) {
    if (!s.id || ids.has(s.id)) bad.push(`setting id ${s.id}`); ids.add(s.id);
    if (!TYPES.has(s.type)) bad.push(`setting ${s.id} type`);
    if (s.type === 'choice' && !(s.options || []).some(([v]) => String(v) === String(s.def))) bad.push(`setting ${s.id} default not a choice`);
    if (!Array.isArray(s.at) || !['app', 'ini', 'list', 'env'].includes(s.at[0]) || (s.at[0] === 'env' && !/^[A-Z_][A-Z0-9_]*$/.test(s.at[1] || ''))) bad.push(`setting ${s.id} at`);
  }
  return bad;
}
function loadDir(dir) {
  const out = [];
  for (const n of (() => { try { return fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'index.json').sort(); } catch { return []; } })()) {
    try { out.push(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))); } catch {}
  }
  return out;
}
// the shipped recipes, then a newer copy of any of them fetched from Cartridge's repository (its "rev" higher)
function load({ dir = SHIPPED, fetched = [], log = () => {} } = {}) {
  const by = new Map();
  for (const r of [...loadDir(dir), ...(Array.isArray(fetched) ? fetched : [])]) {
    const bad = validate(r);
    if (bad.length) { log('recipe left out', r?.id || '?', bad.join(', ')); continue; }
    const had = by.get(r.id);
    if (!had || (r.rev || 0) > (had.rev || 0)) by.set(r.id, r);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---- the build for this system: yours if picked, else Linux, else Windows when Proton (or umu) can run it
function chooseBuild(r, { pick, runner } = {}) {
  const b = r.builds || [];
  const mine = pick && b.find((x) => x.os === pick);
  if (mine && (mine.os === 'linux' || runner)) return mine;
  return b.find((x) => x.os === 'linux') || (runner ? b.find((x) => x.os === 'windows') : null) || null;
}
const winPath = (p) => 'Z:' + String(p).replace(/\//g, '\\');
// what the templates stand for, for one install (the prefix is Cartridge's own, beside the install)
function varsFor(r, build, rec, { home = os.homedir(), env = process.env, game } = {}) {
  const prefix = prefixOf(rec);
  const g = game ?? rec?.game?.path ?? '';
  return {
    dir: rec.dir, home,
    config: env.XDG_CONFIG_HOME || path.join(home, '.config'),
    data: env.XDG_DATA_HOME || path.join(home, '.local/share'),
    appdata: path.join(prefix, 'pfx/drive_c/users/steamuser/AppData/Roaming'),
    game: build?.os === 'windows' && g ? winPath(g) : g,
    gamePosix: g,
    // the folder the game is in (a ROM's folder), for ports that are pointed at a folder
    gameDir: g ? (build?.os === 'windows' ? winPath(path.dirname(g)) : path.dirname(g)) : '',
    ...lookVars(r, build, rec, { home, env }),
    result: path.join(rec.dir, '.cartridge', 'install-result.txt'),
    prefix,
  };
}
// 0.9.91: files of the player's own a port needs beside the game (Shadow of the Colossus's sound modules, from their
// own console), looked for where other programs keep them (shadPS4's sys_modules): r.look [{ var, files, dirs }], the
// first folder holding every file becomes {var}, '' when none does
function lookVars(r, build, rec, { home, env }) {
  if (!r?.look?.length) return {};
  const base = { dir: rec?.dir || '', home, config: env.XDG_CONFIG_HOME || path.join(home, '.config'), data: env.XDG_DATA_HOME || path.join(home, '.local/share'), appdata: rec ? path.join(prefixOf(rec), 'pfx/drive_c/users/steamuser/AppData/Roaming') : '' };
  const out = {};
  for (const l of r.look) {
    const hit = l.dirs.map((d) => expand(d, base)).find((d) => l.files.every((f) => { try { return fs.statSync(path.join(d, f)).isFile(); } catch { return false; } }));
    out[l.var] = hit ? (build?.os === 'windows' ? winPath(hit) : hit) : '';
  }
  return out;
}
// beside the install, unless its drive can't hold one (0.9.83: rec.prefix, on the internal drive, recomps.js prefixFor)
const prefixOf = (rec) => rec.prefix || path.join(rec.dir, '.cartridge', 'proton');
const expand = (t, v) => String(t).replace(TPL, (_, k) => v[k] ?? '');

// ---- values: yours where you changed one, else the port's own default; settings for another system are left out
function settingsFor(r, build) { return (r.settings || []).filter((s) => !s.os || s.os === build?.os); }
function effective(r, build, saved = {}, sets = settingsFor(r, build)) {
  const out = {};
  for (const s of sets) out[s.id] = saved[s.id] != null ? saved[s.id] : s.def;
  return out;
}
// a value in the type the port's file holds: settings.json booleans and numbers as JSON, ini values as text
// (booleans 1/0, as the launchers write them)
function typed(s, v, where) {
  if (s.type === 'bool') { const on = v === true || v === 'true' || v === '1' || v === 1; return where === 'app' ? (s.int ? (on ? 1 : 0) : on) : s.word ? String(on) : on ? '1' : '0'; } // word: an ini that writes true/false; int: a JSON 1/0 (libultraship's CVars)
  if (s.quote && where === 'ini') return `"${String(v ?? '').replace(/"/g, '')}"`; // P.T. writes its text values in quotes
  // 0.9.91: a choice of numbers (Dusklight's enums) stays a number in a JSON file
  if (s.type === 'choice' && where === 'app' && typeof s.def === 'number' && v != null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  if (s.type === 'number') { const n = Number(v); if (!Number.isFinite(n)) return where === 'app' ? s.def : String(s.def); return where === 'app' && typeof s.def === 'number' ? n : String(v); }
  return v == null ? '' : String(v);
}
// a value read back from the port's own file, as Cartridge holds it (so a choice you made in the port's launcher
// before is kept when Cartridge takes over)
function untyped(s, v) {
  if (v == null) return null;
  if (s.quote) v = String(v).replace(/^"(.*)"$/, '$1');
  if (s.type === 'bool') return v === true || v === 'true' || v === '1' || v === 1;
  if (s.type === 'choice' && !(s.options || []).some(([o]) => String(o) === String(v))) return null;
  return typeof s.def === 'number' && s.type === 'number' ? Number(v) : String(v);
}
function check(s, v) {
  if (v == null) return null;
  if (s.type === 'choice' && !(s.options || []).some(([o]) => String(o) === String(v))) return `${s.label}: that isn’t one of its choices.`;
  if (s.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return `${s.label}: type a number.`;
    if (s.num && (n < s.num.min || n > s.num.max)) return `${s.label}: ${s.num.min} to ${s.num.max}${s.num.unit ? ' ' + s.num.unit : ''}.`;
  }
  if (s.type === 'text' && /[\r\n\0]/.test(String(v))) return `${s.label}: one line only.`;
  return null;
}

// 0.9.91: a JSON setting may sit inside objects (Ship of Harkinian's CVars > gSettings > Volume > Master): its key
// is then a list of names. A plain key stays one name.
const keyPath = (k) => (Array.isArray(k) ? k : [k]);
const keyName = (k) => keyPath(k).join('.');
function getPath(o, k) { let x = o; for (const n of keyPath(k)) { if (!x || typeof x !== 'object') return undefined; x = x[n]; } return x; }
function delPath(o, k) {
  const p = keyPath(k), up = []; let x = o;
  for (const n of p.slice(0, -1)) { if (!x || typeof x !== 'object') return; up.push([x, n]); x = x[n]; }
  if (!x || typeof x !== 'object') return;
  delete x[p[p.length - 1]];
  for (let i = up.length - 1; i >= 0; i--) { const [par, n] = up[i]; if (par[n] && typeof par[n] === 'object' && !Object.keys(par[n]).length) delete par[n]; else break; }
}
function setPath(o, k, v) {
  const p = keyPath(k); let x = o;
  for (const n of p.slice(0, -1)) { if (!x[n] || typeof x[n] !== 'object' || Array.isArray(x[n])) x[n] = {}; x = x[n]; }
  x[p[p.length - 1]] = v;
}
// 0.9.91: a file of lines, each line one thing turned on (DRIVECLUB's data\user\patches_enabled.txt: the community
// patches by name). A toggle is its line; a choice is one of its options' lines, '' for none. Lines no setting
// names are kept.
const listLines = (s) => (s.type === 'bool' ? [s.at[1]] : (s.options || []).map(([v]) => String(v)).filter(Boolean));
function listSet(text, sets, values) {
  const nl = /\r\n/.test(text || '') ? '\r\n' : '\n';
  const mine = new Set(sets.flatMap(listLines));
  const ls = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !mine.has(l.trim()));
  for (const s of sets) {
    const v = values[s.id];
    if (s.type === 'bool') { if (v === true || v === 'true' || v === 1 || v === '1') ls.push(s.at[1]); }
    else if (v != null && String(v)) ls.push(String(v));
  }
  return ls.length ? ls.join(nl) + nl : '';
}
function listGet(text, s) {
  const have = new Set(String(text || '').split(/\r?\n/).map((l) => l.trim()));
  if (s.type === 'bool') return have.has(s.at[1]);
  const hit = (s.options || []).find(([v]) => String(v) && have.has(String(v)));
  return hit ? String(hit[0]) : '';
}

// ---- the files: the launcher's settings.json for each start (Uncharted: one per game) and the game's own ini.
// read(path) gives a file's text or null; nothing here touches the disk.
function render(r, build, rec, values, { read = () => null, home, env, sets = settingsFor(r, build), saved = null } = {}) {
  const F = require('./onlineFormats').FORMATS, v = varsFor(r, build, rec, { home, env });
  const files = [], starts = [];
  const appAt = build.files?.app, iniAt = build.files?.ini;
  // the game's ini: only the keys of the settings shown, every other line kept
  if (iniAt) {
    const p = expand(iniAt.path, v);
    let text = read(p) || '';
    const fmt = iniAt.format === 'flat' ? flat : F.ini;
    // 0.9.91: values written every time, as r.app is for JSON (DRIVECLUB's launcher.ini: update= and base=, your copy)
    for (const [k, x] of Object.entries(r.ini || {})) text = fmt.set(text, k.split('/'), typeof x === 'string' ? expand(x, v) : String(x));
    // a sparse ini (Wind Waker HD's settings.ini: it reads only the keys it finds) gets only what you changed
    for (const s of sets.filter((x) => x.at[0] === 'ini')) {
      const at = Array.isArray(s.at[1]) ? s.at[1] : [s.at[1]];
      if (iniAt.sparse && saved && iniAt.format === 'flat') text = saved[s.id] != null ? fmt.set(text, at, typed(s, saved[s.id], 'ini')) : flat.del(text, at);
      else text = fmt.set(text, at, typed(s, values[s.id], 'ini'));
    }
    files.push({ path: p, text });
  }
  const listAt = build.files?.list;
  if (listAt) { const p = expand(listAt.path, v); files.push({ path: p, text: listSet(read(p) || '', sets.filter((x) => x.at[0] === 'list'), values) }); }
  const plays = r.play?.length ? r.play : [{ id: 'main', name: r.name }];
  for (const pl of plays) {
    const st = { id: pl.id, name: pl.name, sub: pl.sub || '' };
    if (appAt) {
      const target = expand(appAt.path, v);
      let base = {}; try { base = JSON.parse(read(target) || '{}') || {}; } catch {}
      const json = { ...base };
      for (const [k, x] of Object.entries({ ...(r.app || {}), ...(pl.app || {}) })) json[k] = typeof x === 'string' ? expand(x, v) : x;
      // 0.9.91: files.app.sparse (a port that writes only what differs from its own defaults: Ship of Harkinian): only
      // what you changed in Cartridge is written, and a setting put back to its default is taken out, so the port's
      // own defaults hold everywhere else
      for (const s of sets.filter((x) => x.at[0] === 'app')) {
        if (appAt.sparse && saved) { if (saved[s.id] != null) setPath(json, s.at[1], typed(s, saved[s.id], 'app')); else delPath(json, s.at[1]); }
        else setPath(json, s.at[1], typed(s, values[s.id], 'app'));
      }
      const staged = path.join(rec.dir, '.cartridge', `settings-${pl.id}.json`);
      files.push({ path: staged, text: JSON.stringify(json, null, 2) + '\n' });
      st.copy = { from: staged, to: target };
    }
    st.envValues = Object.fromEntries(sets.filter((x) => x.at[0] === 'env').map((x) => [x.at[1], x.type === 'bool' ? (values[x.id] === true || values[x.id] === 'true' ? '1' : null) : values[x.id]]));
    st.script = path.join(rec.dir, '.cartridge', plays.length > 1 ? `play-${pl.id}.sh` : 'play.sh');
    starts.push(st);
  }
  return { files, starts, vars: v };
}
// flat "key=value" files (bbport.ini, gow3.ini): a key rewritten in place, a missing one added at the end
const flat = {
  get(text, [key]) { const m = new RegExp(`^\\s*${esc(key)}\\s*=(.*)$`, 'm').exec(String(text || '')); return m ? m[1].trim() : undefined; },
  del(text, [key]) {
    const nl = /\r\n/.test(text || '') ? '\r\n' : '\n', ls = String(text || '').split(/\r?\n/).filter((l) => /^\s*[#;]/.test(l) || !l.includes('=') || l.slice(0, l.indexOf('=')).trim() !== key);
    if (ls.length && ls[ls.length - 1] === '') ls.pop();
    return ls.length ? ls.join(nl) + nl : '';
  },
  set(text, [key], value) {
    const nl = /\r\n/.test(text || '') ? '\r\n' : '\n', ls = String(text || '').split(/\r?\n/);
    if (ls.length && ls[ls.length - 1] === '') ls.pop();
    const i = ls.findIndex((l) => !/^\s*[#;]/.test(l) && l.includes('=') && l.slice(0, l.indexOf('=')).trim() === key);
    if (i >= 0) ls[i] = `${key}=${value}`; else ls.push(`${key}=${value}`);
    return ls.join(nl) + nl;
  },
};
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// the values already in the port's files (first set up: what you chose in its own launcher stays)
function readBack(r, build, rec, { read = () => null, home, env } = {}) {
  const F = require('./onlineFormats').FORMATS, v = varsFor(r, build, rec, { home, env }), out = {};
  const iniText = build.files?.ini ? read(expand(build.files.ini.path, v)) : null;
  let app = null; try { app = build.files?.app ? JSON.parse(read(expand(build.files.app.path, v)) || 'null') : null; } catch {}
  const listText = build.files?.list ? read(expand(build.files.list.path, v)) : null;
  for (const s of settingsFor(r, build)) {
    let x;
    if (s.at[0] === 'ini' && iniText) x = (build.files.ini.format === 'flat' ? flat : F.ini).get(iniText, Array.isArray(s.at[1]) ? s.at[1] : [s.at[1]]);
    if (s.at[0] === 'app' && app) x = getPath(app, s.at[1]);
    if (s.at[0] === 'list' && listText != null) x = listGet(listText, s);
    const u = untyped(s, x);
    if (u != null && String(u) !== String(s.def)) out[s.id] = u;
  }
  return out;
}

// ---- 0.9.90 (owner: "if a game has an update and it removes settings or adds settings it should also be reflected in
// cartridge change game settings"): what the port's own files hold. A key the port writes that the recipe doesn't
// know (an update added a setting) shows in Game Settings under More, typed by its value; a recipe setting the port
// no longer writes (an update took it away) is hidden. Only top-level JSON values and ini lines: nested objects,
// lists and long or multi-line text are the port's business.
function iniEntries(text, isFlat) {
  const out = []; let sec = null;
  for (const l of String(text || '').split(/\r?\n/)) {
    const t = l.trim();
    if (!t || /^[#;]/.test(t)) continue;
    const m = /^\[(.+)\]$/.exec(t);
    if (m) { sec = m[1]; continue; }
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim(), value = t.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    out.push({ at: isFlat ? [key] : [sec || '', key], value });
  }
  return out;
}
function portKeys(r, build, rec, { read = () => null, home, env } = {}) {
  const v = varsFor(r, build, rec, { home, env }), out = { app: null, ini: null };
  if (build.files?.app) { try { const j = JSON.parse(read(expand(build.files.app.path, v)) || 'null'); if (j && typeof j === 'object' && !Array.isArray(j)) out.app = j; } catch {} }
  if (build.files?.ini) { const t = read(expand(build.files.ini.path, v)); if (t != null) out.ini = iniEntries(t, build.files.ini.format === 'flat'); }
  return out;
}
const iniKey = (at) => (Array.isArray(at) ? at : [at]).join('/');
const words = (k) => { const w = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').trim().toLowerCase(); return w ? w[0].toUpperCase() + w.slice(1) : String(k); };
// r.known: the keys the port's files already held when the recipe was written (left out on purpose: progress,
// window state, what the recipe covers elsewhere). Only keys beyond those are new; a recipe without the list shows none.
// a port file's values: top-level ones, or every value inside its objects when the recipe says the file nests them
// (files.app.nested), each with its key as a list of names
function appLeaves(o, build) {
  if (!o) return [];
  if (!build?.files?.app?.nested) return Object.entries(o);
  const out = [], walk = (x, at) => { for (const [k, y] of Object.entries(x)) { if (y && typeof y === 'object' && !Array.isArray(y)) walk(y, [...at, k]); else out.push([[...at, k], y]); } };
  walk(o, []);
  return out;
}
function discovered(r, build, files) {
  if (!r.known) return [];
  const sets = settingsFor(r, build), out = [], seenSet = new Set([...(r.known.app || []), ...(r.known.ini || []).map((k) => 'ini:' + k)]);
  // a known name ending in * covers every name it starts (Ship of Harkinian's controller mappings, window state)
  const wild = [...seenSet].filter((k) => k.endsWith('*')).map((k) => k.slice(0, -1));
  const seen = { has: (k) => seenSet.has(k) || wild.some((w) => k.startsWith(w) || ('ini:' + k).startsWith(w)) };
  const knownApp = new Set([...sets.filter((s) => s.at[0] === 'app').map((s) => keyName(s.at[1])), ...Object.keys(r.app || {}), ...(r.play || []).flatMap((pl) => Object.keys(pl.app || {}))]);
  const knownIni = new Set([...Object.keys(r.ini || {}), ...sets.filter((s) => s.at[0] === 'ini').map((s) => iniKey(build.files?.ini?.format === 'flat' ? [].concat(s.at[1]).slice(-1) : s.at[1]))]);
  const one = (id, at, value) => {
    if (typeof value === 'boolean') return { id, at, type: 'bool', def: value };
    if (typeof value === 'number' && Number.isFinite(value)) return { id, at, type: 'number', def: value, num: { min: -1e9, max: 1e9 } };
    if (typeof value !== 'string' || value.length > 200 || /[\r\n]/.test(value)) return null;
    if (at[0] === 'ini' && /^(true|false)$/i.test(value)) return { id, at, type: 'bool', def: /^true$/i.test(value), word: true };
    if (/^-?\d+(\.\d+)?$/.test(value)) return { id, at, type: 'number', def: value, num: { min: -1e9, max: 1e9 } };
    return { id, at, type: 'text', def: value };
  };
  for (const [k, x] of appLeaves(files.app, build)) { const n = keyName(k); if (!knownApp.has(n) && !seen.has(n)) { const s = one(`x.app.${n}`, ['app', k], x); if (s) out.push(s); } }
  const flatIni = build.files?.ini?.format === 'flat';
  for (const e of files.ini || []) if ((flatIni || e.at[0]) && !knownIni.has(iniKey(e.at)) && !seen.has('ini:' + iniKey(e.at))) { const s = one(`x.ini.${iniKey(e.at)}`, ['ini', flatIni ? e.at[0] : e.at], e.value); if (s) out.push(s); }
  return out.map((s) => ({ ...s, tab: 'More', label: words([].concat(s.at[1]).slice(-1)[0]), desc: 'From the port’s own settings file: a setting Cartridge’s recipe doesn’t name yet, shown as the port names it.', found: true }));
}
// the settings to show and write: the recipe's, less what the port no longer writes (rec.portKeys, recorded from a
// file the port itself wrote for this release, and only when that file holds at least half of the recipe's keys, so a
// port that writes only what you changed hides nothing), plus what the port's files hold that the recipe doesn't name
function settingsNow(r, build, rec, { read = () => null, home, env } = {}) {
  const sets = settingsFor(r, build), pk = rec?.portKeys;
  let keep = sets;
  if (pk && pk.tag === rec.tag) {
    const has = (s) => (s.at[0] === 'list' ? null : s.at[0] === 'app' ? (pk.app ? pk.app.includes(keyName(s.at[1])) : null) : pk.ini ? pk.ini.includes(iniKey(build.files?.ini?.format === 'flat' ? [].concat(s.at[1]).slice(-1) : s.at[1])) : null);
    const judged = sets.filter((s) => has(s) !== null);
    if (judged.length && judged.filter((s) => has(s)).length * 2 >= judged.length) keep = sets.filter((s) => has(s) !== false);
  }
  return [...keep, ...discovered(r, build, portKeys(r, build, rec, { read, home, env }))];
}
// the keys a port file holds, as rec.portKeys records them
function keysOf(files, build) { return { app: files.app ? appLeaves(files.app, build).map(([k]) => keyName(k)) : null, ini: files.ini ? files.ini.map((e) => iniKey(e.at)) : null }; }

// ---- the start script: Steam's shortcut and Cartridge's Play both run it, so a setting changed in Cartridge needs
// nothing changed in Steam. Linux builds start directly; Windows builds through umu-launcher when it's installed,
// else Proton inside Steam's own runtime (as Steam starts them), else Proton by itself, always in Cartridge's prefix
// beside the install. The launcher's settings.json for this start is copied into place first.
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
function script(r, build, rec, start, runner, vars, { env = {} } = {}) {
  const program = rec.program || path.join(rec.dir, build.program); // as installed (a lone AppImage is renamed after the game)
  const args = (build.args || []).map((a) => expand(a, vars)).map(q).join(' ');
  const L = ['#!/bin/sh', `# Cartridge's start for ${start.name}. Its settings are changed in Cartridge, which writes this file again.`];
  if (start.copy) L.push(`mkdir -p ${q(path.dirname(start.copy.to))} && cp -f ${q(start.copy.from)} ${q(start.copy.to)}`);
  for (const [k, x] of Object.entries({ ...(r.env || {}), ...env })) if (/^[A-Z_][A-Z0-9_]*$/.test(k)) L.push(`export ${k}=${q(expand(x, vars))}`);
  // 0.9.91: settings the port reads from its environment (JSRF Unleashed's RECOMP_FULLSCREEN): a toggle is set to 1
  // when on and left out when off; anything else is set to its value
  for (const [k, x] of Object.entries(start.envValues || {})) if (/^[A-Z_][A-Z0-9_]*$/.test(k) && x != null && x !== '') L.push(`export ${k}=${q(String(x))}`);
  L.push(`cd ${q(path.dirname(program))}`);
  // 0.9.91: arguments for the first start only (Ship of Harkinian: the ROM, until it has made oot.o2r from it)
  if (build.first) L.push(`[ -e ${q(expand(build.first.unless, vars))} ] || set -- ${build.first.args.map((a) => q(expand(a, vars))).join(' ')} "$@"`);
  // 0.9.71: a port that prints its trophy unlocks ("Runtime: trophy N unlocked") has its output kept in
  // .cartridge/output.log for Achievements; past 5 MB only the trophy lines are kept
  const out = r.achievements?.output ? outputLog(rec) : null;
  if (out) L.push(`[ -f ${q(out)} ] && [ "$(wc -c < ${q(out)})" -gt 5000000 ] && { grep -a 'Runtime: trophy' ${q(out)} > ${q(out + '.t')}; mv -f ${q(out + '.t')} ${q(out)}; }`);
  const run = (cmd) => L.push(out ? `${cmd} 2>&1 | tee -a ${q(out)}` : `exec ${cmd}`);
  if (build.os === 'linux') { run(`${q(program)}${args ? ' ' + args : ''} "$@"`); return L.join('\n') + '\n'; }
  if (!runner) throw new Error('Proton isn’t installed, and this game’s port is a Windows build.');
  const pfx = vars.prefix;
  L.push(SHELL_UNSET); // started by Steam, the script carries Steam's launch of it (childEnv.js)
  if (runner.kind === 'umu') {
    L.push(`export WINEPREFIX=${q(path.join(pfx, 'pfx'))} GAMEID=0 STORE=none`);
    if (runner.proton) L.push(`export PROTONPATH=${q(runner.proton)}`);
    run(`${q(runner.umu)} ${q(program)}${args ? ' ' + args : ''} "$@"`);
  } else {
    L.push(`export STEAM_COMPAT_DATA_PATH=${q(pfx)} STEAM_COMPAT_CLIENT_INSTALL_PATH=${q(runner.steam || '')}`);
    const proton = `${q(path.join(runner.proton, 'proton'))} waitforexitandrun ${q(program)}${args ? ' ' + args : ''} "$@"`;
    const rt = runtimeOf(runner);
    run(rt ? `${q(path.join(rt, '_v2-entry-point'))} --verb=waitforexitandrun -- ${proton}` : proton);
  }
  return L.join('\n') + '\n';
}
const outputLog = (rec) => path.join(rec.dir, '.cartridge', 'output.log');
// where a port's trophy unlocks are (0.9.71): its own files (templates filled in) and the kept output
function achievementsOf(r, build, rec, vars) {
  const a = r.achievements;
  if (!a || !rec?.dir) return null;
  // 0.9.91: hedge (Unleashed Recompiled's save/ACH-DATA), found where the port keeps its user folder (recompAchievements.locate)
  if (a.format === 'hedge') return { format: 'hedge', user: a.user, file: a.file };
  return { format: a.format === 'keyed' ? 'keyed' : 'ps4', files: [...(a.files || []).map((f) => expand(f, vars)), ...(a.output ? [outputLog(rec)] : [])], list: a.list || null, game: rec.game?.path || null };
}
// the Steam runtime a runner starts Proton in (0.9.86 'runtime'; 0.9.70 to 0.9.85 called it 'sniper')
const runtimeOf = (runner) => runner.runtime || runner.sniper || null;
// the same runner once with wineboot, so Proton makes the prefix before Cartridge puts settings.json in it
function prefixCommand(runner, vars) {
  if (runner.kind === 'umu') return { cmd: runner.umu, args: ['wineboot', '-u'], env: { WINEPREFIX: path.join(vars.prefix, 'pfx'), GAMEID: '0', STORE: 'none', ...(runner.proton ? { PROTONPATH: runner.proton } : {}) } };
  const proton = [path.join(runner.proton, 'proton'), 'run', 'wineboot', '-u'];
  const env = { STEAM_COMPAT_DATA_PATH: vars.prefix, STEAM_COMPAT_CLIENT_INSTALL_PATH: runner.steam || '' };
  const rt = runtimeOf(runner);
  return rt ? { cmd: path.join(rt, '_v2-entry-point'), args: ['--verb=run', '--', ...proton], env } : { cmd: proton[0], args: proton.slice(1), env };
}

// a Windows program started with the same runner (0.9.71: an update's trial start, as Linux builds get since 0.9.66)
function runCommand(runner, program, args, prefix) {
  if (runner.kind === 'umu') return { cmd: runner.umu, args: [program, ...args], env: { WINEPREFIX: path.join(prefix, 'pfx'), GAMEID: '0', STORE: 'none', ...(runner.proton ? { PROTONPATH: runner.proton } : {}) } };
  const proton = [path.join(runner.proton, 'proton'), 'run', program, ...args];
  const env = { STEAM_COMPAT_DATA_PATH: prefix, STEAM_COMPAT_CLIENT_INSTALL_PATH: runner.steam || '' };
  const rt = runtimeOf(runner);
  return rt ? { cmd: path.join(rt, '_v2-entry-point'), args: ['--verb=run', '--', ...proton], env } : { cmd: proton[0], args: proton.slice(1), env };
}

// ---- your copy: a dump folder (eboot.bin, sce_sys/param.sfo), its title ID and version, and what's missing
const verNum = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0);
const verCmp = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
// the folder holding every one of find.files: the folder itself, then up to find.depth levels of folders inside it
// (sce_sys and sce_module skipped, 256 folders a level), as the port's own search does
function findDir(dir, find) {
  const holds = (d) => find.files.every((f) => { try { return fs.statSync(path.join(d, f)).isFile(); } catch { return false; } });
  if (holds(dir)) return dir;
  let level = [dir];
  for (let depth = 0; depth < (find.depth || 0) && level.length; depth++) {
    const next = [];
    for (const d of level) {
      let names = []; try { names = fs.readdirSync(d, { withFileTypes: true }); } catch {}
      for (const e of names) {
        if (next.length >= 256) break;
        if (e.name === 'sce_sys' || e.name === 'sce_module') continue;
        const p = path.join(d, e.name);
        let isDir = e.isDirectory(); if (!isDir && e.isSymbolicLink()) { try { isDir = fs.statSync(p).isDirectory(); } catch {} }
        if (!isDir) continue;
        if (holds(p)) return p;
        next.push(p);
      }
    }
    level = next;
  }
  return null;
}
// 0.9.91: a game that is one file (a ROM, a disc image) or a folder that holds one: the file with one of the
// recipe's endings (game.ext), checked by SHA-1 when the recipe names the copies the port accepts (game.sha1) and the
// file is small enough to read now (ROMs; a 1.4 GB disc is left to the port's own check)
function pickGameFile(g, dir) {
  const ok = (n) => (g.ext || []).some((e) => n.toLowerCase().endsWith(e.toLowerCase()));
  let st; try { st = fs.statSync(dir); } catch { return { problems: ['That isn’t there any more.'] }; }
  // a game that can also be its unpacked files (an extracted Xbox disc): a folder that holds them is used as it is
  if (st.isDirectory() && g.unpack && g.has?.length && g.has.every((f) => fs.existsSync(path.join(dir, f)))) return { folder: dir };
  if (st.isFile()) return ok(dir) ? { file: dir } : { problems: [`It needs ${g.ext.join(', ')}; that’s a ${path.extname(dir) || 'file with no ending'}.`] };
  let names = []; try { names = fs.readdirSync(dir).filter((n) => ok(n) && fs.statSync(path.join(dir, n)).isFile()).sort(); } catch {}
  if (!names.length) return { problems: [`There’s no ${g.ext.join(', ')} in it.`] };
  if (names.length > 1 && g.sha1?.length) { const hit = names.find((n) => sha1Ok(g, path.join(dir, n)) === true); if (hit) return { file: path.join(dir, hit) }; }
  return { file: path.join(dir, names[0]) };
}
function sha1Ok(g, f) {
  if (!g.sha1?.length) return null;
  let st; try { st = fs.statSync(f); } catch { return false; }
  if (st.size > 128 * 1024 * 1024) return null;
  try { return g.sha1.includes(require('crypto').createHash('sha1').update(fs.readFileSync(f)).digest('hex')); } catch { return false; }
}
function checkGame(r, dir, { sfo } = {}) {
  const g = r.game || {}, out = { ok: true, problems: [], notes: [] };
  if (g.kind === 'none') return out;
  if (g.kind === 'file') {
    const p = pickGameFile(g, dir);
    if (p.problems) return { ok: false, problems: p.problems, notes: [] };
    if (p.folder) { out.folder = p.folder; return out; }
    out.file = p.file;
    const h = sha1Ok(g, p.file);
    if (h === false) { if (g.soft) out.notes.push(g.why || `It isn’t one of the copies ${r.name} was tested with.`); else return { ok: false, problems: [g.why || `It isn’t a copy ${r.name} accepts.`], notes: [] }; }
    return out;
  }
  let st; try { st = fs.statSync(dir); } catch { return { ok: false, problems: ['That folder isn’t there any more.'] }; }
  const pkg = st.isFile() && /\.pkg$/i.test(dir);
  if (pkg && g.kind !== 'folder-or-pkg') return { ok: false, problems: [`${r.name} needs the game as a dump folder (with eboot.bin), not a PKG.`] };
  if (!st.isDirectory() && !pkg) return { ok: false, problems: ['That’s a file, not the game’s folder.'] };
  if (st.isDirectory()) {
    for (const f of g.has || []) if (!fs.existsSync(path.join(dir, f))) out.problems.push(`${f} isn’t in it.`);
    // files the port finds by itself in the folder or a few folders down (P.T.: first_run.cpp FindGameFolder)
    if (g.find && !findDir(dir, g.find)) out.problems.push(`${g.find.files.join(' and ')} ${g.find.files.length === 1 ? 'isn’t' : 'aren’t'} in it${g.find.depth ? ' or the folders inside it' : ''}.`);
    const p = sfo ? sfo(path.join(dir, 'sce_sys/param.sfo')) : {};
    out.id = p.TITLE_ID || null; out.version = p.APP_VER || p.VERSION || null; out.title = p.TITLE || null;
    if (out.id && g.ids?.length && !g.ids.includes(out.id)) out.notes.push(`It’s ${out.id}; the port is tested with ${g.ids.join(' and ')}.`);
    // 0.9.79 (owner: yes): the versions the port was tested with, so a copy outside them says so plainly
    if (g.tested?.length && out.version && !g.tested.includes(out.version) && !(g.version?.want && verCmp(out.version, g.version.want) < 0)) out.notes.push(`It’s version ${out.version}; the port was tested with ${g.tested.length === 1 ? 'version ' + g.tested[0] : 'versions ' + g.tested.slice(0, -1).join(', ') + ' and ' + g.tested.at(-1)}.`);
    if (g.version?.want && out.version && verCmp(out.version, g.version.want) < 0) {
      if (g.version.soft) out.notes.push(`It’s version ${out.version}. ${g.version.why}`);
      else { out.needsUpdate = g.version.want; out.problems.push(`It’s version ${out.version}; it needs ${g.version.want}.`); }
    }
  }
  out.ok = !out.problems.length;
  return out;
}
// an update for that game on this device: a folder with the same title ID and a newer version (a dumped patch,
// CUSA00223-patch), from the folders given (beside the game, and the library's other copies)
function findUpdate(r, gameDir, candidates, { sfo }) {
  const base = sfo(path.join(gameDir, 'sce_sys/param.sfo'));
  if (!base.TITLE_ID) return null;
  let best = null;
  for (const c of candidates) {
    if (path.resolve(c) === path.resolve(gameDir)) continue;
    const p = sfo(path.join(c, 'sce_sys/param.sfo'));
    if (p.TITLE_ID !== base.TITLE_ID || !p.APP_VER) continue;
    if (verCmp(p.APP_VER, base.APP_VER) <= 0) continue;
    if (!best || verCmp(p.APP_VER, best.version) > 0) best = { dir: c, version: p.APP_VER };
  }
  return best;
}
// the game with its update on top, as links (no copies): every file of the game, then the update's files over them
function viewPlan(base, update, { list }) {
  const plan = new Map();
  for (const rel of list(base)) plan.set(rel, path.join(base, rel));
  for (const rel of list(update)) plan.set(rel, path.join(update, rel));
  return [...plan].map(([rel, from]) => ({ rel, from }));
}

module.exports = { iniEntries, portKeys, discovered, settingsNow, keysOf, findDir, achievementsOf, outputLog, SHIPPED, validate, load, chooseBuild, winPath, varsFor, expand, settingsFor, effective, typed, untyped, check, render, readBack, flat, script, prefixCommand, runCommand, checkGame, findUpdate, viewPlan, verCmp, prefixOf };
