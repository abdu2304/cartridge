'use strict';
// Phone Remote (0.9.94): only the secret path answers, only the local network, only JSON posts, only known buttons
const test = require('node:test');
const assert = require('node:assert');
const R = require('../electron/phoneRemote');

const ctx = () => {
  const got = { downloads: [], shown: [], pads: [] };
  return {
    got,
    name: 'Living Room <PC>',
    games: async ({ q }) => ({ total: 1, list: [{ id: 7, name: 'Okami' + q, platform: 'PS2', installed: false }] }),
    downloads: async () => [{ romId: 7, name: 'Okami', status: 'downloading', received: 5, total: 10 }],
    download: async (id) => { got.downloads.push(id); },
    show: (id) => got.shown.push(id),
    pad: (a) => got.pads.push(a),
    cover: async (id) => (id === 7 ? { type: 'image/png', body: Buffer.from('png') } : null),
  };
};

test('isLocal: home networks yes, the internet no', () => {
  for (const a of ['192.168.1.20', '10.0.0.5', '172.20.3.4', '127.0.0.1', '::ffff:192.168.0.9', '::1', 'fe80::1', 'fd12::3', '100.101.102.103']) assert.ok(R.isLocal(a), a);
  for (const a of ['8.8.8.8', '172.32.0.1', '2001:db8::1', '', 'nonsense']) assert.ok(!R.isLocal(a), a);
});

test('the page, its data and its buttons answer only at the secret path', async () => {
  const c = ctx(), s = await R.open(c, { host: '127.0.0.1' });
  const base = `http://127.0.0.1:${s.port}/${s.secret}`;
  try {
    const page = await fetch(base);
    assert.strictEqual(page.status, 200);
    const html = await page.text();
    assert.match(html, /Living Room &lt;PC&gt;/); // the device name is escaped
    assert.ok(!html.includes('—'));
    assert.strictEqual((await fetch(`http://127.0.0.1:${s.port}/wrong`)).status, 404);
    assert.strictEqual((await fetch(`http://127.0.0.1:${s.port}/${s.secret}x`)).status, 404);
    assert.deepStrictEqual((await (await fetch(base + '/api/games?q=%20HD')).json()).list[0].name, 'Okami HD');
    assert.strictEqual((await (await fetch(base + '/api/downloads')).json())[0].received, 5);
    assert.strictEqual((await fetch(base + '/api/cover/7')).headers.get('content-type'), 'image/png');
    assert.strictEqual((await fetch(base + '/api/cover/8')).status, 404);
    const post = (p, b, type = 'application/json') => fetch(base + p, { method: 'POST', headers: { 'Content-Type': type }, body: typeof b === 'string' ? b : JSON.stringify(b) });
    assert.strictEqual((await post('/api/pad', 'a=up', 'application/x-www-form-urlencoded')).status, 415); // a form from another page can't press anything
    assert.strictEqual((await post('/api/pad', { a: 'rm -rf' })).status, 400);
    assert.strictEqual((await post('/api/pad', { a: 'accept' })).status, 200);
    assert.strictEqual((await post('/api/download', { romId: 7 })).status, 200);
    assert.strictEqual((await post('/api/show', { romId: 7 })).status, 200);
    assert.strictEqual((await post('/api/show', { romId: 'x' })).status, 400);
    const big = await post('/api/pad', { a: 'up', pad: 'x'.repeat(5000) }).then((r) => r.status, () => 'cut off');
    assert.ok(big === 'cut off' || big >= 400, String(big)); // too big: refused or cut off, never pressed
    assert.deepStrictEqual([c.got.pads, c.got.downloads, c.got.shown], [['accept'], [7], [7]]);
    assert.strictEqual(s.phones(), 1);
  } finally { s.close(); }
});

test('the same secret and port come back, so a saved address keeps working', async () => {
  const a = await R.open(ctx(), { host: '127.0.0.1' }); const { port, secret } = a; a.close();
  await new Promise((r) => setTimeout(r, 50));
  const b = await R.open(ctx(), { host: '127.0.0.1', port, secret });
  try { assert.deepStrictEqual([b.port, b.secret], [port, secret]); assert.strictEqual((await fetch(`http://127.0.0.1:${port}/${secret}`)).status, 200); } finally { b.close(); }
});
