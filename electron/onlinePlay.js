'use strict';
// Online Play (0.9.66, owner: "its own Settings section ... make sure these online components are linked to the
// emulator ... after every emulator update, re-check the online settings"). Each emulator that plays online has an
// adapter: where its settings file is, which of its own settings turn each online feature on, and the fields a player
// fills in (nickname, server, account). Every fact comes from the emulator's own source; the adapters name the file
// and line. Cartridge changes only those settings: the file is backed up first, nothing is written while the emulator
// runs, and what Cartridge set is remembered (online-play.json, never a password) so an update that resets it gets it
// back. Tested in test/onlinePlay.test.js.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { FORMATS } = require('./onlineFormats');

const truthy = (v) => /^(true|1|yes|on|connected)$/i.test(String(v ?? '').trim());
const ADAPTERS = require('./onlineAdapters');

function createOnline(ctx) {
  const home = ctx.home || os.homedir(), log = ctx.log || (() => {});
  const recFile = path.join(ctx.dataDir, 'online-play.json');
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  let rec = readJson(recFile, {});
  const saveRec = () => { try { fs.writeFileSync(recFile + '.tmp', JSON.stringify(rec, null, 1)); fs.renameSync(recFile + '.tmp', recFile); } catch (e) { log('online: record', e.message); } };
  const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  // the emulator's settings folder: its portable folder beside the program, its Flatpak folder, else the usual one;
  // the first that holds its main settings file wins (an emulator never opened has none yet: the usual folder)
  function dirOf(a) {
    const main = a.files.main[0];
    const cands = [...(ctx.portable?.(a.emu) || []), ...a.dirs.map((d) => path.join(home, d))];
    return cands.find((d) => exists(path.join(d, main))) || cands.find(isDir) || null;
  }
  const fileOf = (a, dir, f) => path.join(dir, a.files[f][0]);
  function texts(a, dir) { const t = {}; for (const f of Object.keys(a.files)) { try { t[f] = fs.readFileSync(fileOf(a, dir, f), 'utf8'); } catch { t[f] = null; } } return t; }
  const get = (a, t, [f, at]) => (t[f] == null ? undefined : FORMATS[a.files[f][1]].get(t[f], at));
  const put = (a, t, [f, at], v) => { t[f] = FORMATS[a.files[f][1]].set(t[f] ?? a.files[f][2] ?? '', at, v); };
  // the files that changed: each backed up once a day into Cartridge's own folder, then replaced in one step
  // 0.9.67 (agreed plan, 7.2: "parse before and after"): every changed file must still parse before it's written, and
  // after writing the files are read back and the emulator's own check (RPCS3: can it load config.yml) runs again;
  // anything wrong puts every file back as it was and says why
  function write(a, dir, before, after) {
    const stamp = new Date().toISOString().slice(0, 10);
    const changed = Object.keys(after).filter((f) => after[f] !== before[f]);
    for (const f of changed) {
      const fmt = FORMATS[a.files[f][1]];
      if (fmt.valid && !fmt.valid(after[f])) throw new Error(`Cartridge’s change would leave ${path.basename(fileOf(a, dir, f))} unreadable, so nothing was written.`);
    }
    const putBack = () => { for (const f of changed) { const file = fileOf(a, dir, f); try { if (before[f] == null) fs.rmSync(file, { force: true }); else { fs.writeFileSync(file + '.cartridge-tmp', before[f]); fs.renameSync(file + '.cartridge-tmp', file); } } catch (e) { log('online: put back', file, e.message); } } };
    for (const f of changed) {
      const file = fileOf(a, dir, f);
      if (before[f] != null) {
        const bak = path.join(ctx.dataDir, 'online-backups', a.emu, `${stamp}-${path.basename(file)}`);
        if (!exists(bak)) { fs.mkdirSync(path.dirname(bak), { recursive: true }); fs.writeFileSync(bak, before[f]); }
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.cartridge-tmp', after[f]); fs.renameSync(file + '.cartridge-tmp', file);
    }
    let why = null;
    for (const f of changed) { let back = null; try { back = fs.readFileSync(fileOf(a, dir, f), 'utf8'); } catch {} if (back !== after[f]) { why = `${path.basename(fileOf(a, dir, f))} didn’t read back as written`; break; } }
    if (!why) { let bad = null; try { bad = a.precheck?.({ dir, ctx }) || null; } catch (e) { bad = { line: 0, text: e.message }; } if (bad) why = `${a.label} couldn’t read its settings file after the change (line ${bad.line})`; }
    if (why) { putBack(); log('online: change undone', a.emu, why); throw new Error(`${why}, so the file was put back as it was.`); }
  }
  // on/off can depend on the file (shadPS4's account is per user in a list): a function of the getter gives the pairs
  const pairsOf = (a, t, list) => (typeof list === 'function' ? list((ref) => get(a, t, ref)) : list || []);
  const isOn = (a, k, t) => (k.isOn ? k.isOn((ref) => get(a, t, ref), t) : pairsOf(a, t, k.on).every(([ref, v]) => String(get(a, t, ref) ?? '').toLowerCase() === String(v).toLowerCase()));
  function fieldValue(a, f, t) { if (f.read) return f.read((ref) => get(a, t, ref), t); const v = get(a, t, f.at); return f.secret ? (v ? '•' : '') : v ?? ''; }
  function list() {
    const have = new Set(ctx.installed?.() || []);
    const emus = [], issues = [];
    for (const a of ADAPTERS) {
      const dir = dirOf(a);
      // installed: found by Cartridge's scan, or its settings file is here (a distro package, a copy elsewhere)
      if (!have.has(a.emu) && !(dir && exists(path.join(dir, a.files.main[0])))) continue;
      const t = dir ? texts(a, dir) : {};
      const running = !!ctx.running?.(a.emu);
      // a settings file the emulator itself can't read (RPCS3's EmuDeck leftover): Repair is offered before anything is written
      let damaged = null; if (dir && t.main != null) try { damaged = a.precheck?.({ dir, ctx }) || null; } catch {}
      // a kind with `status` reports what it can't change (Pretendo's console files): { ready, note }
      const statusOf = (k) => { try { return k.status?.({ dir, home, exists, get: (ref) => get(a, t, ref) }) || null; } catch { return null; } };
      emus.push({
        emu: a.emu, label: a.label, dir, version: ctx.versionOf?.(a.emu) || null, running, opened: !!(dir && t.main != null), damaged,
        kinds: a.kinds.map((k) => { const st = statusOf(k); return {
          id: k.id, name: k.name, what: k.what, note: !t.main ? `Open ${a.label} once first, so it makes its settings file.` : st?.note || k.note || null, locked: (!t.main && !k.noFile) || !!damaged,
          info: !!k.info, ready: st ? !!st.ready : null,
          on: !!(!k.info && t.main != null && isOn(a, k, t)), showFields: !!(k.fieldsAlways || k.info),
          fields: (k.fields || []).map((f) => ({ key: f.key, label: f.label, icon: f.icon, required: !!f.required, secret: !!f.secret, choices: f.choices || null, free: !!f.free, help: f.help || '', placeholder: f.placeholder || '', note: f.note || '', value: t.main != null ? fieldValue(a, f, t) : '' })),
          actions: (k.actions || []).map((x) => ({ id: x.id, label: x.label, sub: x.sub || '', icon: x.icon, url: x.url || null, confirm: x.confirm || null, asks: x.asks || null, then: x.then || null })),
        }; }),
      });
      for (const i of rec[a.emu]?.issues || []) issues.push({ emu: a.emu, kind: i.kind, text: i.text });
    }
    return { emus, issues };
  }
  function prep(emu) {
    const a = ADAPTERS.find((x) => x.emu === emu);
    if (!a) throw new Error('Cartridge doesn’t know this emulator’s online settings.');
    if (ctx.running?.(emu)) throw new Error(`Close ${a.label} first: it would write its own settings over these when it closes.`);
    const dir = dirOf(a);
    if (!dir) throw new Error(`${a.label}’s settings folder wasn’t found. Open ${a.label} once first.`);
    const before = texts(a, dir);
    if (before.main == null) throw new Error(`Open ${a.label} once first, so it makes its settings file.`);
    const bad = a.precheck?.({ dir, ctx });
    if (bad) throw new Error(bad.known ? `${a.label}’s settings file is damaged (line ${bad.line}). Repair it first, at the top of ${a.label}’s section.` : `${a.label} can’t read line ${bad.line} of its settings file (“${bad.text}”), so Cartridge leaves it alone. Fix it in a text editor, or rename it so ${a.label} makes a new one.`);
    return { a, dir, before, t: { ...before } };
  }
  const remember = (emu, fn) => { rec[emu] ||= { kinds: {}, fields: {} }; fn(rec[emu]); saveRec(); };
  // a feature on or off: its own settings written, what it needs checked first
  async function set(emu, kind, on) {
    const { a, dir, before, t } = prep(emu), k = a.kinds.find((x) => x.id === kind);
    if (!k || k.info) throw new Error('Unknown online feature.');
    if (on) for (const f of k.fields || []) if (f.required && !fieldValue(a, f, t)) throw new Error(`Set ${f.label} first.`);
    // 0.9.80: a kind whose status says it isn't ready (Pretendo without the Wii U's files) can't be turned on
    if (on && k.status) { let st = null; try { st = k.status({ dir, home, exists, get: (ref) => get(a, t, ref) }); } catch {} if (st && !st.ready) throw new Error(st.note || 'It isn’t ready yet.'); }
    for (const [ref, v] of pairsOf(a, t, on ? k.on : k.off)) put(a, t, ref, v);
    write(a, dir, before, t);
    remember(emu, (r) => { r.kinds[kind] = { on, at: Date.now() }; r.wroteAt = Date.now(); r.issues = (r.issues || []).filter((i) => i.kind !== kind); });
    log('online', emu, kind, on ? 'on' : 'off');
    return { on };
  }
  async function field(emu, kind, key, value) {
    const { a, dir, before, t } = prep(emu), k = a.kinds.find((x) => x.id === kind), f = k?.fields?.find((x) => x.key === key);
    if (!f) throw new Error('Unknown setting.');
    const why = f.check?.(value);
    if (why) throw new Error(why);
    if (f.write) await f.write({ value, put: (ref, v) => put(a, t, ref, v), get: (ref) => get(a, t, ref), ctx, has: (file) => t[file] != null });
    else put(a, t, f.at, value);
    write(a, dir, before, t);
    remember(emu, (r) => { if (!f.secret) r.fields[key] = value; r.wroteAt = Date.now(); });
    log('online', emu, kind, 'set', key);
    return { ok: true };
  }
  // an action may ask for input (`asks`) and write settings afterwards (`ready` checks the file can be written first,
  // so an account is never made and then left unsaved; `save` writes pairs of [ref, value])
  async function action(emu, kind, id, input = {}) {
    const a = ADAPTERS.find((x) => x.emu === emu), k = a?.kinds.find((x) => x.id === kind), x = k?.actions?.find((y) => y.id === id);
    if (!x?.run) throw new Error('Unknown action.');
    return x.run({
      ctx, dir: dirOf(a), adapter: a, input,
      ready: () => { prep(emu); },
      get: (ref) => { const { a: A, t } = prep(emu); return get(A, t, ref); },
      save: (pairs) => { const { a: A, dir, before, t } = prep(emu); for (const [ref, v] of pairs) put(A, t, ref, v); write(A, dir, before, t); log('online', emu, kind, id); },
    });
  }
  function repair(emu) {
    const a = ADAPTERS.find((x) => x.emu === emu);
    if (!a?.repair) throw new Error('Nothing to repair.');
    if (ctx.running?.(emu)) throw new Error(`Close ${a.label} first.`);
    return a.repair({ dir: dirOf(a), ctx });
  }
  // after an emulator update (owner): what Cartridge turned on is checked again; settings an update reset are put
  // back, and a file that moved or changed shape is reported, never guessed at
  function recheck(emu) {
    const a = ADAPTERS.find((x) => x.emu === emu), r = rec[emu];
    if (!a || !r || !Object.values(r.kinds || {}).some((x) => x.on)) return { checked: false };
    if (ctx.running?.(emu)) return { checked: false, busy: true };
    const dir = dirOf(a), issues = [];
    const before = dir ? texts(a, dir) : {};
    if (!dir || before.main == null) {
      issues.push({ kind: '*', text: `After ${a.label}’s update its settings file isn’t where it was, so its online settings couldn’t be checked. Open ${a.label} once, then come back here.` });
      remember(emu, (x) => { x.issues = issues; });
      return { checked: true, issues };
    }
    let bad = null; try { bad = a.precheck?.({ dir, ctx }) || null; } catch {}
    if (bad) {
      issues.push({ kind: '*', text: `After ${a.label}’s update its settings file can’t be read (line ${bad.line}), so its online settings weren’t checked. ${bad.known ? 'Repair it in Online Play.' : 'Fix it in a text editor.'}` });
      remember(emu, (x) => { x.issues = issues; });
      return { checked: true, issues };
    }
    const t = { ...before };
    let fixed = 0;
    // 0.9.67 (agreed plan, 7.2: "say plainly if the format changed"): emulators marked `full` write every one of their
    // settings to their file. When such an emulator has rewritten its file since Cartridge last wrote it and a setting
    // Cartridge uses is gone, the update renamed or moved it: reported, never written back under the old name
    const mtime = (f) => { try { return fs.statSync(fileOf(a, dir, f)).mtimeMs; } catch { return 0; } };
    const rewritten = (f) => before[f] != null && mtime(f) > (r.wroteAt || 0) + 2000;
    const gone = (ref) => a.full && rewritten(ref[0]) && get(a, t, ref) === undefined;
    const name = (ref) => [].concat(ref[1]).join(' → ');
    for (const [kind, s] of Object.entries(r.kinds)) {
      const k = a.kinds.find((x) => x.id === kind);
      if (!k || !s.on) continue;
      const missing = pairsOf(a, t, k.on).map(([ref]) => ref).filter(gone);
      if (missing.length) { issues.push({ kind, text: `After ${a.label}’s update, ${missing.map(name).join(', ')} ${missing.length > 1 ? 'are' : 'is'} no longer in its settings file: the update renamed or moved ${missing.length > 1 ? 'them' : 'it'}. Cartridge didn’t write the old name back. Check ${k.name} in ${a.label} itself; Cartridge needs an update for the new name.` }); continue; }
      if (!isOn(a, k, t)) { for (const [ref, v] of pairsOf(a, t, k.on)) put(a, t, ref, v); fixed++; }
      for (const f of k.fields || []) {
        if (f.secret || f.write || r.fields?.[f.key] == null || get(a, t, f.at) != null) continue;
        if (gone(f.at)) { issues.push({ kind, text: `After ${a.label}’s update, its ${f.label} setting (${name(f.at)}) is no longer in its settings file: the update renamed or moved it. Cartridge didn’t write it back.` }); continue; }
        put(a, t, f.at, r.fields[f.key]); fixed++;
      }
    }
    if (fixed) { try { write(a, dir, before, t); log('online: put back after an update', emu, fixed); } catch (e) { issues.push({ kind: '*', text: e.message }); fixed = 0; } }
    for (const i of issues) log('online: after an update', emu, i.text);
    remember(emu, (x) => { x.issues = issues; x.checkedAt = Date.now(); if (fixed) x.wroteAt = Date.now(); });
    return { checked: true, fixed, issues };
  }
  return { list, set, field, action, repair, recheck, dirOf: (emu) => dirOf(ADAPTERS.find((x) => x.emu === emu)), records: () => rec };
}
module.exports = { createOnline, ADAPTERS, truthy };
