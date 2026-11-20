// BIOS, firmware and keys some consoles need, and whether they're where the emulators look. Since
// 0.9.17 (owner: set emulators up without leaving Cartridge) place() copies files from the BIOS folder
// into the folders of the emulators that are set up here. It only adds: a file already there is never
// replaced, and nothing is moved or deleted.
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const ls = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
const size = (p) => { try { return fs.statSync(p).size; } catch { return -1; } };
const var_ = (id, ...p) => path.join(HOME, '.var/app', id, ...p);

// RetroArch's system folder (its own setting first), for every install
function raSystemDirs(steamRoots = []) {
  const cfgs = [path.join(HOME, '.config/retroarch'), var_('org.libretro.RetroArch', 'config/retroarch'), ...steamRoots.map((r) => path.join(r, 'steamapps/common/RetroArch'))];
  const out = [];
  for (const c of cfgs) {
    try {
      const m = fs.readFileSync(path.join(c, 'retroarch.cfg'), 'utf8').match(/^system_directory\s*=\s*"([^"]*)"/m);
      if (m && m[1] && m[1] !== 'default') out.push(m[1].replace(/^~(?=\/)/, HOME).replace(/^:\//, c + '/'));
    } catch {}
    out.push(path.join(c, 'system'));
  }
  return out;
}

// What each console needs. files: any one of these names (case-insensitive) is enough; test: a
// custom check for firmware installed into the emulator. where: folders to look in, best first.
// optional: the usual emulators run without it (shown as a tip, not a problem).
function table(roots, steamRoots, extra = []) {
  const eb = [...extra, ...roots.map((r) => path.join(r, 'bios'))];
  const ra = raSystemDirs(steamRoots);
  const sub = (dirs, s) => dirs.map((d) => path.join(d, s));
  const keysIn = (names) => names.flatMap((n) => [path.join(HOME, '.local/share', n, 'keys'), var_(`org.${n}_emu.${n}`, 'data', n, 'keys'), var_(`dev.${n}_emu.${n}`, 'data', n, 'keys'), ...roots.map((r) => path.join(r, 'bios', n, 'keys'))]);
  return {
    psx: { label: 'PlayStation BIOS', files: ['scph5500.bin', 'scph5501.bin', 'scph5502.bin', 'scph1001.bin', 'scph7001.bin', 'scph101.bin', 'psxonpsp660.bin', 'ps1_rom.bin'], where: [path.join(HOME, '.local/share/duckstation/bios'), var_('org.duckstation.DuckStation', 'data/duckstation/bios'), ...eb, ...ra] },
    ps2: { label: 'PS2 BIOS', any: (f, n) => /\.(bin|rom0)$/i.test(n) && size(f) >= 4 * 1024 * 1024 - 1 && size(f) <= 4 * 1024 * 1024 + 1024 * 1024, where: [path.join(HOME, '.config/PCSX2/bios'), var_('net.pcsx2.PCSX2', 'config/PCSX2/bios'), ...eb, ...sub(ra, 'pcsx2/bios')] },
    ps3: { label: 'PS3 firmware', test: () => [path.join(HOME, '.config/rpcs3/dev_flash/vsh/module/vsh.self'), var_('net.rpcs3.RPCS3', 'config/rpcs3/dev_flash/vsh/module/vsh.self'), ...roots.map((r) => path.join(r, 'storage/rpcs3/dev_flash/vsh/module/vsh.self'))].find((f) => size(f) > 0), hint: 'Install it in RPCS3: File → Install Firmware.' },
    psvita: { label: 'Vita firmware', test: () => [path.join(HOME, '.local/share/Vita3K/Vita3K/vs0/vsh'), path.join(HOME, '.local/share/Vita3K/vs0/vsh'), ...roots.map((r) => path.join(r, 'storage/Vita3K/vs0/vsh'))].find(isDir), hint: 'Install it in Vita3K: File → Install Firmware.' },
    ns2: { label: 'Switch 2 keys (prod.keys)', files: ['prod.keys'], where: [...keysIn(['lichii']), ...eb] }, // 0.9.98: Lichii, an Eden fork: keys in its data folder's keys/
    switch: { label: 'Switch keys (prod.keys)', files: ['prod.keys'], where: [...keysIn(['eden', 'lichii', 'citron', 'yuzu', 'sudachi', 'suyu', 'torzu']), path.join(HOME, '.config/Ryujinx/system'), var_('io.github.ryubing.Ryujinx', 'config/Ryujinx/system'), var_('org.ryujinx.Ryujinx', 'config/Ryujinx/system'), ...eb] },
    segacd: { label: 'Sega CD BIOS', files: ['bios_CD_U.bin', 'bios_CD_E.bin', 'bios_CD_J.bin'], where: [...ra, ...eb] },
    saturn: { label: 'Saturn BIOS', files: ['sega_101.bin', 'mpr-17933.bin', 'saturn_bios.bin'], where: [...ra, ...sub(ra, 'kronos'), ...eb], optional: true },
    dreamcast: { label: 'Dreamcast BIOS', files: ['dc_boot.bin'], where: [path.join(HOME, '.local/share/flycast/data'), var_('org.flycast.Flycast', 'data/flycast/data'), ...sub(ra, 'dc'), ...eb], optional: true },
    pcenginecd: { label: 'PC Engine CD system card', files: ['syscard3.pce', 'syscard2.pce', 'syscard1.pce'], where: [...ra, ...eb] },
    neogeo: { label: 'Neo Geo BIOS', files: ['neogeo.zip'], where: [...ra, ...eb], optional: true },
    xbox: { label: 'Xbox BIOS and hard disk', files: ['mcpx_1.0.bin'], where: [...eb, ...roots.map((r) => path.join(r, 'bios/xemu')), path.join(HOME, '.local/share/xemu/xemu'), var_('app.xemu.xemu', 'data/xemu/xemu')], hint: 'xemu also needs a BIOS (Complex or retail) and a hard disk image, set in its Machine settings.' },
    nds: { label: 'DS BIOS', files: ['bios7.bin'], where: [...ra, ...eb, path.join(HOME, '.config/melonDS'), var_('net.kuribo64.melonDS', 'config/melonDS')], optional: true },
    gba: { label: 'GBA BIOS', files: ['gba_bios.bin'], where: [...ra, ...eb], optional: true },
  };
}

// For one console: null when it needs nothing, else { label, ok, where (the file found), look (where
// it goes), optional, hint }
function status(key, { roots = [], steamRoots = [], extra = [] } = {}) {
  const t = table(roots, steamRoots, extra.filter(Boolean))[key === 'megacd' ? 'segacd' : key];
  if (!t) return null;
  const out = { key, label: t.label, optional: !!t.optional, hint: t.hint || '', ok: false, where: '', look: '' };
  if (t.test) { const hit = t.test(); out.ok = !!hit; out.where = hit || ''; return out; }
  const want = new Set((t.files || []).map((f) => f.toLowerCase()));
  for (const d of t.where) {
    if (!isDir(d)) continue;
    const hit = ls(d).find((n) => (want.size && want.has(n.toLowerCase())) || (t.any && t.any(path.join(d, n), n)));
    if (hit) { out.ok = true; out.where = path.join(d, hit); return out; }
  }
  out.look = t.where.find(isDir) || t.where[0] || '';
  out.names = t.files || [];
  return out;
}

// Copy one console's BIOS files from src into every emulator folder that's there (its parent exists,
// so the emulator is set up), never over a file. Returns the files written.
function place(key, src, { roots = [], steamRoots = [] } = {}) {
  const t = table(roots, steamRoots, [])[key === 'megacd' ? 'segacd' : key];
  if (!t || t.test || !isDir(src)) return [];
  const names = new Set([...(t.files || []), ...(key === 'switch' || key === 'ns2' ? ['title.keys'] : []), ...(key === 'nds' ? ['bios9.bin', 'firmware.bin'] : [])].map((f) => f.toLowerCase()));
  const files = ls(src).filter((n) => names.has(n.toLowerCase()) || (t.any && t.any(path.join(src, n), n)));
  const out = [];
  for (const d of [...new Set(t.where)]) {
    if (path.resolve(d) === path.resolve(src) || !(isDir(d) || isDir(path.dirname(d)))) continue;
    for (const n of files) {
      const to = path.join(d, n);
      if (fs.existsSync(to)) continue;
      try { fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(path.join(src, n), to, fs.constants.COPYFILE_EXCL); out.push(to); } catch {}
    }
  }
  return out;
}
// Switch firmware: the data folders of the yuzu family that are set up here (firmware goes in
// nand/system/Contents/registered, as their Install Firmware puts it)
function switchNandDirs() {
  const out = [];
  for (const n of ['eden', 'lichii', 'citron', 'yuzu', 'sudachi', 'suyu', 'torzu']) {
    for (const d of [path.join(process.env.XDG_DATA_HOME || path.join(HOME, '.local/share'), n), var_(`org.${n}_emu.${n}`, 'data', n), var_(`dev.${n}_emu.${n}`, 'data', n)]) if (isDir(d)) out.push(path.join(d, 'nand/system/Contents/registered'));
  }
  return [...new Set(out)];
}

module.exports = { status, place, switchNandDirs, raSystemDirs, KEYS: () => Object.keys(table([], [])) };
