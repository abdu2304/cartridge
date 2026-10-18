'use strict';
// Reading and changing single settings in emulators' own files (0.9.66, Online Play). Each writer changes only the
// key asked for and keeps every other line as it was (comments, order, line endings), so an emulator's file is never
// rewritten from scratch. `at` names a setting:
//   ini   [section, key]            ppsspp.ini, PCSX2.ini, Dolphin.ini
//   qt    [section, key]            Eden/Azahar qt-config.ini: "key=value" plus "key\default=false" (Qt's own pair)
//   cfg   [key]                     retroarch.cfg: key = "value"
//   json  ['a', 'b', 'c']           shadPS4 config.json / users.json, Ryujinx Config.json
//   yaml  ['Net', 'PSN status']     RPCS3 config.yml / rpcn.yml: "Section:" then two-space "Key: value" lines
//   xml   ['content', 'Account', 'ActiveService']   Cemu settings.xml: nested tags, the first of each name
// Tested in test/onlinePlay.test.js.
const nlOf = (t) => (/\r\n/.test(t) ? '\r\n' : '\n');
const lines = (t) => { const l = String(t || '').split(/\r?\n/); if (l.length && l[l.length - 1] === '') l.pop(); return l; };

// ---- ini (and Qt's variant)
function iniFind(ls, section) {
  const want = section.toLowerCase();
  const start = ls.findIndex((l) => { const m = /^\s*\[(.+)\]\s*$/.exec(l); return m && m[1].replace(/%20/g, ' ').toLowerCase() === want; });
  if (start < 0) return null;
  let end = start + 1;
  while (end < ls.length && !/^\s*\[.*\]\s*$/.test(ls[end])) end++;
  return [start, end];
}
const keyOf = (l) => { if (/^\s*[;#]/.test(l)) return null; const i = l.indexOf('='); return i > 0 ? l.slice(0, i).trim() : null; };
function iniGet(text, [section, key]) {
  const ls = lines(text), r = iniFind(ls, section);
  if (!r) return undefined;
  for (let i = r[0] + 1; i < r[1]; i++) if (keyOf(ls[i]) === key) return ls[i].slice(ls[i].indexOf('=') + 1).trim().replace(/^"(.*)"$/, '$1');
  return undefined;
}
function iniSet(text, [section, key], value, { qt = false } = {}) {
  const nl = nlOf(text), ls = lines(text);
  let r = iniFind(ls, section);
  if (!r) { if (ls.length) ls.push(''); ls.push(`[${section}]`); r = [ls.length - 1, ls.length]; }
  const put = (k, v) => {
    for (let i = r[0] + 1; i < r[1]; i++) if (keyOf(ls[i]) === k) { const sp = / = /.test(ls[i]) ? ' = ' : '='; ls[i] = `${k}${sp}${v}`; return; }
    let at = r[1]; while (at > r[0] + 1 && ls[at - 1].trim() === '') at--; // before the blank line that ends the section
    const own = ls.slice(r[0] + 1, r[1]).filter((l) => keyOf(l)), pool = own.length ? own : ls.filter((l) => keyOf(l)); // an empty section follows the file
    const sp = !qt && pool.some((l) => / = /.test(l)) ? ' = ' : '=';
    ls.splice(at, 0, `${k}${sp}${v}`); r = [r[0], r[1] + 1];
  };
  put(key, value);
  if (qt) put(`${key}\\default`, 'false'); // Qt keeps "is this still the default" beside each value; false = use ours
  return ls.join(nl) + nl;
}
// ---- retroarch.cfg
function cfgGet(text, [key]) { const m = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*"?([^"\\r\\n]*)"?`, 'm').exec(String(text || '')); return m ? m[1] : undefined; }
function cfgSet(text, [key], value) {
  const nl = nlOf(text), ls = lines(text), line = `${key} = "${value}"`;
  const i = ls.findIndex((l) => new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`).test(l));
  if (i >= 0) ls[i] = line; else ls.push(line);
  return ls.join(nl) + nl;
}
// ---- json (the file parsed, one value changed, written back with the same indent)
function jsonGet(text, at) { let o; try { o = JSON.parse(text); } catch { return undefined; } for (const k of at) { if (o == null || typeof o !== 'object') return undefined; o = o[k]; } return o; }
function jsonSet(text, at, value) {
  let root; try { root = JSON.parse(text || '{}'); } catch { throw new Error('The settings file is damaged (not valid JSON), so Cartridge leaves it as it is.'); }
  let o = root;
  for (const k of at.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
  o[at[at.length - 1]] = value;
  const ind = (/\n(\s+)"/.exec(text || '') || [])[1] || '  ';
  return JSON.stringify(root, null, ind.includes('\t') ? '\t' : ind.length) + nlOf(text || '\n');
}
// ---- yaml: "Section:" followed by indented "Key: value" lines (RPCS3's own writer), or top-level "Key: value"
function yamlFind(ls, at) {
  if (at.length === 1) return { from: 0, to: ls.length, ind: '' };
  const s = ls.findIndex((l) => l === `${at[0]}:` || l.startsWith(`${at[0]}: `) || l === `${at[0]}: `);
  if (s < 0) return null;
  let e = s + 1; while (e < ls.length && (/^\s/.test(ls[e]) || ls[e] === '')) e++;
  const ind = (/^(\s+)\S/.exec(ls[s + 1] || '') || [])[1] || '  ';
  return { from: s + 1, to: e, ind, head: s };
}
const yq = (v) => (v === '' ? '""' : /^[\w.@/-][\w .@/:|-]*$/.test(v) && !/:\s|\s$/.test(v) ? v : JSON.stringify(v));
function yamlGet(text, at) {
  const ls = lines(text), r = yamlFind(ls, at);
  if (!r) return undefined;
  const k = at[at.length - 1];
  for (let i = r.from; i < r.to; i++) { const l = ls[i]; if (l.startsWith(r.ind + k + ':') && !l.startsWith(r.ind + ' ')) { let v = l.slice(r.ind.length + k.length + 1).trim(); if (/^".*"$/.test(v)) v = JSON.parse(v); else if (/^'.*'$/.test(v)) v = v.slice(1, -1); return v; } }
  return undefined;
}
function yamlSet(text, at, value) {
  const nl = nlOf(text), ls = lines(text), k = at[at.length - 1], v = yq(String(value));
  let r = yamlFind(ls, at);
  if (!r) { ls.push(`${at[0]}:`); r = { from: ls.length, to: ls.length, ind: '  ' }; }
  for (let i = r.from; i < r.to; i++) if (ls[i].startsWith(r.ind + k + ':') && !ls[i].startsWith(r.ind + ' ')) { ls[i] = `${r.ind}${k}: ${v}`; return ls.join(nl) + nl; }
  let at2 = r.to; while (at2 > r.from && ls[at2 - 1] === '') at2--;
  ls.splice(at2, 0, `${r.ind}${k}: ${v}`);
  return ls.join(nl) + nl;
}
// ---- xml: the text of nested tags (Cemu writes them one per line)
function xmlRange(text, at) {
  let from = 0, to = text.length;
  for (const tag of at) {
    const o = new RegExp(`<${tag}(\\s[^>]*)?>`).exec(text.slice(from, to));
    if (!o) return null;
    const s = from + o.index + o[0].length, c = text.indexOf(`</${tag}>`, s);
    if (c < 0 || c > to) return null;
    from = s; to = c;
  }
  return [from, to];
}
const xmlUnesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 0.9.80: the last step can be { tag, where: [name, value], attr }: an attribute of the child element picked by another
// attribute (Cemu's <AccountService><SelectedService PersistentId=".." Service=".."/>, CemuConfig.cpp)
const attrsOf = (s) => Object.fromEntries([...String(s || '').matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], xmlUnesc(m[2])]));
function xmlPick(text, range, step) {
  const re = new RegExp(`<${step.tag}(\\s[^>]*?)?\\s*(/?)>`, 'g'), body = text.slice(range[0], range[1]);
  for (let m; (m = re.exec(body));) { const a = attrsOf(m[1]); if (String(a[step.where[0]]) === String(step.where[1])) return { at: range[0] + m.index, len: m[0].length, attrs: a, self: !!m[2] }; }
  return null;
}
// a parent written empty as <Tag/> (tinyxml2 does) opened up so a child can go in
function xmlOpen(text, at) {
  if (xmlRange(text, at)) return text;
  const up = at.length > 1 ? xmlRange(text, at.slice(0, -1)) : [0, text.length];
  if (!up) return text;
  const tag = at[at.length - 1], body = text.slice(up[0], up[1]), m = new RegExp(`<${tag}\\s*/>`).exec(body);
  if (m) return text.slice(0, up[0] + m.index) + `<${tag}>\n\t</${tag}>` + text.slice(up[0] + m.index + m[0].length);
  const trail = /\s*$/.exec(body)[0], cut = up[1] - trail.length;
  return text.slice(0, cut) + `\n\t<${tag}>\n\t</${tag}>` + text.slice(cut);
}
function xmlGet(text, at) {
  const t = String(text || ''), last = at[at.length - 1];
  if (last && typeof last === 'object') { const r = xmlRange(t, at.slice(0, -1)); const el = r && xmlPick(t, r, last); return el ? el.attrs[last.attr] : undefined; }
  const r = xmlRange(t, at); return r ? xmlUnesc(t.slice(r[0], r[1]).trim()) : undefined;
}
function xmlSet(text, at, value) {
  const last = at[at.length - 1];
  if (last && typeof last === 'object') {
    const t = xmlOpen(String(text || ''), at.slice(0, -1)), r = xmlRange(t, at.slice(0, -1));
    if (!r) throw new Error(`The settings file has no <${at[at.length - 2]}> section, so Cartridge leaves it as it is.`);
    const el = xmlPick(t, r, last), attrs = { ...(el?.attrs || { [last.where[0]]: last.where[1] }), [last.attr]: value };
    const tag = `<${last.tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${xmlEsc(v).replace(/"/g, '&quot;')}"`).join(' ')}${el && !el.self ? '' : '/'}>`;
    if (el) return t.slice(0, el.at) + tag + t.slice(el.at + el.len);
    const ind = (/\n([ \t]*)<[^/]/.exec(t.slice(r[0], r[1])) || [])[1] || '\t\t';
    const trail = /\s*$/.exec(t.slice(r[0], r[1]))[0], cut = r[1] - trail.length;
    return t.slice(0, cut) + `\n${ind}${tag}` + t.slice(cut);
  }
  const t = String(text || ''), r = xmlRange(t, at);
  if (r) return t.slice(0, r[0]) + xmlEsc(value) + t.slice(r[1]);
  // the last tag missing inside its parent: added before the parent closes
  const parent = xmlRange(t, at.slice(0, -1));
  if (!parent) throw new Error(`The settings file has no <${at[at.length - 2]}> section, so Cartridge leaves it as it is.`);
  const ind = (/\n([ \t]*)<[^/][^>]*>[^<]*<\/[^>]+>\s*$/.exec(t.slice(parent[0], parent[1])) || [])[1] || '\t\t';
  const trail = /\s*$/.exec(t.slice(parent[0], parent[1]))[0], cut = parent[1] - trail.length; // the closing tag keeps its own indent
  return t.slice(0, cut) + `\n${ind}<${at[at.length - 1]}>${xmlEsc(value)}</${at[at.length - 1]}>` + t.slice(cut);
}
// 0.9.67 (agreed plan, 7.2: "parse before and after"): a format that can be parsed is parsed after Cartridge's change,
// before anything is written. YAML through js-yaml (FAILSAFE, as patches.js reads RPCS3's files), JSON with JSON.parse.
function yamlValid(t) { try { require('js-yaml').load(String(t || ''), { schema: require('js-yaml').FAILSAFE_SCHEMA }); return true; } catch { return false; } }
function jsonValid(t) { try { JSON.parse(String(t || '')); return true; } catch { return false; } }
const FORMATS = {
  ini: { get: iniGet, set: (t, at, v) => iniSet(t, at, v) },
  qt: { get: iniGet, set: (t, at, v) => iniSet(t, at, v, { qt: true }) },
  cfg: { get: cfgGet, set: cfgSet },
  json: { get: jsonGet, set: jsonSet, valid: jsonValid },
  yaml: { get: yamlGet, set: yamlSet, valid: yamlValid },
  xml: { get: xmlGet, set: xmlSet },
};
module.exports = { FORMATS, iniGet, iniSet, cfgGet, cfgSet, jsonGet, jsonSet, yamlGet, yamlSet, xmlGet, xmlSet };
