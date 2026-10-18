// PS4 updates laid out the way shadPS4 reads them (0.9.79, owner: yes): shadPS4 (core/file_sys/fs.cpp OverlayPath)
// takes a game's update from the folder beside the game named "<game folder>-UPDATE" (or "-patch"). A game Cartridge
// downloads with its update (two archives in RomM, or one holding both) is unpacked into folders named after the
// archives; here the update's folder is renamed to sit beside the game under that name. Judged by param.sfo only:
// CATEGORY "gd" is a game, "gp" an update, with the same TITLE_ID. Nothing is ever replaced or deleted.
const fs = require('fs');
const path = require('path');

const SUFFIX = /-(UPDATE|patch|mods)$/;
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const kids = (d) => { try { return fs.readdirSync(d).filter((n) => n !== '__MACOSX' && isDir(path.join(d, n))).sort(); } catch { return []; } };
const num = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0);
const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

// every folder holding sce_sys/param.sfo, the root and two levels down
function dumps(root, sfo) {
  const out = [];
  const look = (d, depth) => {
    const p = sfo(path.join(d, 'sce_sys/param.sfo'));
    if (p && p.TITLE_ID) { out.push({ dir: d, id: String(p.TITLE_ID).toUpperCase(), cat: String(p.CATEGORY || '').toLowerCase(), ver: p.APP_VER || '' }); return; }
    if (depth < 2) for (const k of kids(d)) if (k !== 'sce_sys' && k !== 'sce_module') look(path.join(d, k), depth + 1);
  };
  look(root, 0);
  return out;
}

// returns the moves made: [{ from, to, id, ver }]
function arrange(root, { sfo }) {
  const all = dumps(root, sfo), moves = [];
  const games = all.filter((x) => x.cat.startsWith('gd') && !SUFFIX.test(path.basename(x.dir)));
  for (const g of games) {
    const target = path.join(path.dirname(g.dir), path.basename(g.dir) + '-UPDATE');
    if (fs.existsSync(target) || fs.existsSync(path.join(path.dirname(g.dir), path.basename(g.dir) + '-patch'))) continue; // already in place
    const ups = all.filter((x) => x.cat === 'gp' && x.id === g.id && !x.dir.startsWith(g.dir + path.sep) && x.dir !== g.dir);
    if (!ups.length) continue;
    const best = ups.reduce((a, b) => (newer(b.ver, a.ver) ? b : a));
    // the update's folder must not hold the game (a root that is both): only a folder of its own moves
    if (g.dir.startsWith(best.dir + path.sep)) continue;
    fs.renameSync(best.dir, target);
    moves.push({ from: best.dir, to: target, id: g.id, ver: best.ver });
    // the folder the update came in, left empty, goes (never one with anything in it)
    for (let d = path.dirname(best.dir); d.startsWith(root + path.sep); d = path.dirname(d)) { try { fs.rmdirSync(d); } catch { break; } }
  }
  return moves;
}

module.exports = { arrange, dumps, SUFFIX };
