// Picture work off Electron's main thread (0.9.60, owner: "the whole app feels slower", pictures slow, the controller
// late at start). Shrinking a cover with nativeImage held the main thread 25 to 50 ms, a hero 120 ms (measured), and a page
// of collections asks for hundreds: the main thread, which also answers the controller and every call, sat frozen for
// seconds. Main now sends the bytes here; a worker thread of this window decodes, shrinks and encodes them and the answer
// goes back. Same results as before: width-limited JPEG (PNG kept for see-through PNGs), and logos trimmed of their
// transparent edges with their brightness measured exactly as main's prepareLogo did.
const CODE = `
self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    const bmp = await createImageBitmap(new Blob([m.buf], { type: m.type || 'image/jpeg' }));
    if (m.op === 'logo') return self.postMessage(await logo(m, bmp));
    if (m.op === 'probe') { const r = { id: m.id, w: bmp.width, h: bmp.height }; bmp.close(); return self.postMessage(r); }
    if (m.op === 'png') { const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); bmp.close(); return self.postMessage({ id: m.id, w: c.width, h: c.height, buf: new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()) }); }
    if (bmp.width <= m.w * 1.15) { bmp.close(); return self.postMessage({ id: m.id, skip: true }); }
    const h = Math.max(1, Math.round(bmp.height * m.w / bmp.width));
    const small = await createImageBitmap(bmp, { resizeWidth: m.w, resizeHeight: h, resizeQuality: 'high' });
    bmp.close();
    const c = new OffscreenCanvas(m.w, h); c.getContext('2d').drawImage(small, 0, 0); small.close();
    const png = !m.jpeg && /png/i.test(m.type || '');
    const out = await c.convertToBlob(png ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.88 });
    self.postMessage({ id: m.id, buf: new Uint8Array(await out.arrayBuffer()), type: png ? 'image/png' : 'image/jpeg' });
  } catch (e) { self.postMessage({ id: m.id, error: String(e && e.message || e) }); }
};
async function logo(m, bmp) {
  let W = bmp.width, H = bmp.height, src = bmp;
  if (W > 900) { H = Math.max(1, Math.round(H * 900 / W)); W = 900; src = await createImageBitmap(bmp, { resizeWidth: W, resizeHeight: H, resizeQuality: 'high' }); }
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  const px = x.getImageData(0, 0, W, H).data; // RGBA
  let x0 = W, y0 = H, x1 = -1, y1 = -1, lum = 0, sat = 0, wsum = 0;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const i = (y * W + xx) * 4, a = px[i + 3];
    if (a < 24) continue;
    if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const r = px[i], g = px[i + 1], b = px[i + 2], w = a / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum += w * (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    sat += w * (mx ? (mx - mn) / mx : 0);
    wsum += w;
  }
  if (x1 < 0 || x1 - x0 < 8 || y1 - y0 < 4) return { id: m.id, none: true };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, cc = new OffscreenCanvas(cw, ch);
  cc.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
  const out = await cc.convertToBlob({ type: 'image/png' });
  const L = wsum ? lum / wsum : 1, S = wsum ? sat / wsum : 1;
  return { id: m.id, buf: new Uint8Array(await out.arrayBuffer()), w: cw, h: ch, dark: L < 0.22 && S < 0.35, lum: +L.toFixed(3) };
}
`;

export function startImageWorker() {
  if (!window.cart || typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return;
  let worker;
  try { worker = new Worker(URL.createObjectURL(new Blob([CODE], { type: 'text/javascript' }))); } catch { return; }
  worker.onmessage = (ev) => { window.cart.call('img:done', ev.data).catch(() => {}); };
  window.cart.on('img-work', (m) => worker.postMessage(m));
  window.cart.call('img:ready', true).catch(() => {});
}
