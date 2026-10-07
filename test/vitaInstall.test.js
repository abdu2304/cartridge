// Vita3K installs (0.9.57, run for real against Vita3K build 4111 in the build container): Vita3K's command line takes
// Windows-style options, so an argument starting with "/" was read as an option and dropped ("Failed to load archive
// file in path: 13.zip" for .../Unit 13.zip, or no install at all and Vita3K's window). Files go over as "./<name>"
// from their own folder, through a link without spaces when the name has odd characters.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../electron/pkgInstall');

test('Vita3K gets a relative path, never one starting with a slash', () => {
  const H = fs.mkdtempSync(path.join(os.tmpdir(), 'cartridge-vita-'));
  try {
    const plain = path.join(H, 'Game.zip'); fs.writeFileSync(plain, 'x');
    const a = P.stageForVita3k(plain, H);
    assert.deepStrictEqual([a.cwd, a.file], [H, './Game.zip']);
    const spaced = path.join(H, 'my games', 'Unit 13.zip'); fs.mkdirSync(path.dirname(spaced)); fs.writeFileSync(spaced, 'y');
    const b = P.stageForVita3k(spaced, H);
    assert.match(b.file, /^\.\/game-\d+-\d+\.zip$/);
    assert.ok(!b.file.includes(' '));
    const link = path.join(b.cwd, b.file);
    assert.strictEqual(fs.readFileSync(link, 'utf8'), 'y', 'the link leads to the game');
    b.done();
    assert.ok(!fs.existsSync(link), 'the link goes once the install ends');
  } finally { fs.rmSync(H, { recursive: true, force: true }); }
});

test('an install ends on any of Vita3K’s own end lines', () => {
  for (const l of ['Failed to load archive file in path: 13.zip', 'Content installed, will auto-boot: PCSE00000', 'NoNpDrm installation failed, deleting data!', 'Install app before patch', 'miniz error reading archive: x', 'A Vitamin dump was detected, aborting installation...'.replace('A Vitamin dump was detected', 'Vitamin dump')]) assert.ok(P.VITA3K_END.test(l), l);
  assert.ok(!P.VITA3K_END.test('Extracting /x/ux0/app/PCSE00000/eboot.bin'));
});
