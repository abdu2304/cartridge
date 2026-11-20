// A download's checksum off the main thread (0.9.92): the same digest as crypto in place, errors and aborts reported
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { hashFile } = require('../electron/hashWorker');

test('hashFile: md5 and sha1 as crypto gives them, across the read buffer\'s edge', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashw-')), f = path.join(dir, 'game.bin');
  const data = crypto.randomBytes((4 << 20) * 2 + 12345);
  fs.writeFileSync(f, data);
  for (const algo of ['md5', 'sha1']) assert.strictEqual(await hashFile(f, algo), crypto.createHash(algo).update(data).digest('hex'));
  fs.writeFileSync(f, '');
  assert.strictEqual(await hashFile(f, 'md5'), 'd41d8cd98f00b204e9800998ecf8427e');
  fs.rmSync(dir, { recursive: true, force: true });
});
test('hashFile: a missing file is an error, an aborted check ends', async () => {
  await assert.rejects(hashFile(path.join(os.tmpdir(), 'no-such-file-' + Date.now()), 'md5'));
  const ac = new AbortController(); ac.abort();
  await assert.rejects(hashFile(__filename, 'md5', { signal: ac.signal }), /aborted/);
  const ac2 = new AbortController(), p = hashFile(__filename, 'md5', { signal: ac2.signal }); ac2.abort();
  await p.then(() => {}, (e) => assert.match(e.message, /aborted/)); // done first or aborted: never hangs
});
