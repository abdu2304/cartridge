// Send from your phone (0.9.64): only the secret path answers, text arrives once, then the page is gone.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../electron/phoneLink');

test('the phone page takes one short text on its secret path, then closes', async () => {
  let got = null;
  const s = await P.open({ host: '127.0.0.1', onText: (t) => { got = t; } });
  const url = s.urls[0], base = url.replace(/\/[0-9a-f]{32}$/, '');
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/);
  assert.strictEqual((await fetch(base + '/')).status, 404);
  assert.strictEqual((await fetch(base + '/' + '0'.repeat(32))).status, 404);
  assert.match(await (await fetch(url)).text(), /Send to Cartridge/);
  assert.strictEqual((await fetch(url, { method: 'POST', body: 'x'.repeat(5000) }).catch(() => ({ status: 0 }))).status !== 200, true);
  assert.strictEqual((await fetch(url, { method: 'POST', body: '  https://github.com/owner/fork \n' })).status, 200);
  assert.strictEqual(got, 'https://github.com/owner/fork');
  await new Promise((r) => setTimeout(r, 50));
  await assert.rejects(fetch(url)); // closed
});
