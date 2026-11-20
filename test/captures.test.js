'use strict';
// Captures (0.9.95): found in Steam and in emulators' own folders (native, Flatpak, EmuDeck), matched to the game,
// newest first; nothing else (thumbnails, saves, tiny files) taken for a capture
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../electron/captures');

const put = (p, n = 2048, t = 0) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(n, 1)); if (t) fs.utimesSync(p, t / 1000, t / 1000); return p; };
const ROMS = [{ id: 1, name: 'Okami' }, { id: 2, name: 'Ratchet & Clank: Size Matters' }, { id: 3, name: 'The Legend of Zelda: The Wind Waker (USA)' }, { id: 4, name: 'Ratchet & Clank' }, { id: 5, name: 'Ico' }];

test('capName takes off what emulators add', () => {
  assert.strictEqual(C.capName('Okami 2026-11-20 10-15-00.png'), 'okami');
  assert.strictEqual(C.capName('Ratchet & Clank - Size Matters-241120-101500.png'), 'ratchet and clank size matters');
  assert.strictEqual(C.capName('screenshot_Ico_0003.jpg'), 'ico');
});

test('matcher: the longest library name in the text wins; nothing for nonsense', () => {
  const m = C.matcher(ROMS);
  assert.strictEqual(m('ratchet and clank size matters'), 2); // not plain Ratchet & Clank
  assert.strictEqual(m('ratchet and clank 3'), 4);
  assert.strictEqual(m('the legend of zelda the wind waker'), 3); // region and brackets don't stop it
  assert.strictEqual(m('icon pack'), null); // Ico is a whole word, not part of one
  assert.strictEqual(m('20261120'), null);
});

test('scan: Steam, native, Flatpak and EmuDeck folders; thumbnails and tiny files left out; newest first', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'caps-')), now = Date.now();
  try {
    const steam = path.join(home, '.local/share/Steam/userdata/123/760/remote');
    put(path.join(steam, '3000000001/screenshots/20261120101500_1.jpg'), 4096, now - 1000);
    put(path.join(steam, '3000000001/screenshots/thumbnails/20261120101500_1.jpg'), 4096, now); // a thumbnail, not a capture
    put(path.join(steam, '440/screenshots/x.jpg'), 4096, now); // not one of Cartridge's
    put(path.join(home, '.config/PCSX2/snaps/Okami 2026-11-19 20-00-00.png'), 4096, now - 5000);
    put(path.join(home, '.var/app/org.DolphinEmu.dolphin-emu/data/dolphin-emu/ScreenShots/GZLE01/GZLE01-1.png'), 4096, now - 7000);
    put(path.join(home, '.config/retroarch/screenshots/Ratchet & Clank - Size Matters-241120-101500.png'), 4096, now - 3000);
    put(path.join(home, '.config/retroarch/records/clip.mp4'), 9000, now - 2000);
    put(path.join(home, '.config/retroarch/screenshots/tiny.png'), 10, now);
    put(path.join(home, '.config/retroarch/saves/notacapture.png'), 4096, now);
    const emu = path.join(home, 'Emulation');
    put(path.join(emu, 'storage/ppsspp/screenshots/ULUS10414_00001.jpg'), 4096, now - 9000);
    const items = await C.scan({ home, emulationRoots: [emu], steam: { dirs: [steam], apps: { 3000000001: { name: 'Okami', romId: 1 } } }, roms: ROMS });
    const rel = items.map((i) => [path.basename(i.path), i.source, i.romId, i.kind]);
    assert.deepStrictEqual(rel, [
      ['20261120101500_1.jpg', 'Steam', 1, 'image'],
      ['clip.mp4', 'RetroArch', null, 'video'],
      ['Ratchet & Clank - Size Matters-241120-101500.png', 'RetroArch', 2, 'image'],
      ['Okami 2026-11-19 20-00-00.png', 'PCSX2', 1, 'image'],
      ['GZLE01-1.png', 'Dolphin', null, 'image'],
      ['ULUS10414_00001.jpg', 'PPSSPP', null, 'image'],
    ]);
    assert.ok(items.every((i) => /^[0-9a-f]{20}$/.test(i.id)));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
