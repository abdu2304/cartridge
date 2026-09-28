// Animated backgrounds. Each renderer is set up once per canvas size / palette and then draws a
// frame for a given time. They are all original designs, only loosely inspired by console menus,
// and they are kept cheap: a handful of paths or pre-rendered sprites per frame, no CSS filters.

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function sprite(color, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, rgba(color, 1));
  r.addColorStop(0.35, rgba(color, 0.55));
  r.addColorStop(1, rgba(color, 0));
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return c;
}
// deterministic pseudo random, so a reduced-motion still frame looks the same every time
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// PSP-style XMB ribbons (the original Cartridge background)
function waves(g, w, h, S) {
  const WAVES = [
    { a: 0.09, k: 1.6, s: 0.10, y: 0.58, h: 0.16, al: 0.10 },
    { a: 0.07, k: 2.3, s: -0.07, y: 0.62, h: 0.10, al: 0.08 },
    { a: 0.11, k: 1.1, s: 0.05, y: 0.55, h: 0.22, al: 0.06 },
    { a: 0.05, k: 3.1, s: 0.13, y: 0.64, h: 0.05, al: 0.12 },
  ];
  const STEP = 18;
  const grads = WAVES.map((wv) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.3, `rgba(255,255,255,${wv.al})`);
    gr.addColorStop(0.7, `rgba(255,255,255,${wv.al * 1.3})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    return gr;
  });
  return (time) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    WAVES.forEach((wv, wi) => {
      const top = [], bot = [];
      for (let x = 0; x <= w + STEP; x += STEP) {
        const u = x / w;
        const base = wv.y * h + Math.sin(u * Math.PI * wv.k + time * wv.s * 6) * wv.a * h + Math.sin(u * Math.PI * wv.k * 0.5 - time * wv.s * 3) * wv.a * 0.5 * h;
        const thick = wv.h * h * (0.55 + 0.45 * Math.sin(u * Math.PI * 1.3 + time * wv.s * 4));
        top.push(x, base - thick / 2); bot.push(x, base + thick / 2);
      }
      g.beginPath();
      for (let i = 0; i < top.length; i += 2) (i ? g.lineTo(top[i], top[i + 1]) : g.moveTo(top[i], top[i + 1]));
      for (let i = bot.length - 2; i >= 0; i -= 2) g.lineTo(bot[i], bot[i + 1]);
      g.closePath(); g.fillStyle = grads[wi]; g.fill();
      g.beginPath();
      for (let i = 0; i < top.length; i += 2) (i ? g.lineTo(top[i], top[i + 1]) : g.moveTo(top[i], top[i + 1]));
      g.strokeStyle = `rgba(255,255,255,${wv.al * 1.6})`; g.lineWidth = 1.5 * S; g.stroke();
    });
  };
}

// Ribbons: one silky band made of many thin lines (inspired by the PS3 menu wave)
function ribbons(g, w, h, S, pal, light) {
  const N = light ? 14 : 26, STEP = light ? 32 : 20;
  const glow = g.createLinearGradient(0, 0, w, 0);
  glow.addColorStop(0, 'rgba(255,255,255,0)'); glow.addColorStop(0.5, 'rgba(255,255,255,0.09)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  return (time) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const yOf = (u, k) => h * (0.6 + 0.07 * Math.sin(u * 2.6 + time * 0.22 + k * 0.05) + 0.05 * Math.sin(u * 5.1 - time * 0.31 + k * 0.11)) + (k - N / 2) * h * (light ? 0.014 : 0.009) * (1 + 0.8 * Math.sin(u * 3 + time * 0.4));
    // soft body of the band
    g.beginPath();
    for (let x = 0; x <= w + STEP; x += STEP) { const u = x / w; x ? g.lineTo(x, yOf(u, 0) - h * 0.03) : g.moveTo(x, yOf(u, 0) - h * 0.03); }
    for (let x = Math.ceil((w + STEP) / STEP) * STEP; x >= 0; x -= STEP) { const u = x / w; g.lineTo(x, yOf(u, N) + h * 0.03); }
    g.closePath(); g.fillStyle = glow; g.fill();
    g.lineWidth = 1.1 * S;
    for (let k = 0; k <= N; k++) {
      const edge = Math.abs(k - N / 2) / (N / 2);
      g.strokeStyle = `rgba(255,255,255,${0.07 + 0.22 * (1 - edge)})`;
      g.beginPath();
      for (let x = 0; x <= w + STEP; x += STEP) { const y = yOf(x / w, k); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  };
}

// ---------------------------------------------------------------- console backgrounds
// Each follows its console's own look: colours, shapes and how things move. Nothing is copied from
// the consoles themselves. The bright Nintendo ones are toned down so Cartridge's white text reads.
// Their base colour is a CSS gradient (BG_BASE); the canvas draws the motion on top.
const TAU = Math.PI * 2;
// a pattern drawn once, then reused every frame
function once(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return c; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// PS2: the boot screen's towers of light rising out of a dark blue haze, small blocks drifting up
function ps2(g, w, h, S, pal, light) {
  const r = rng(22), cols = light ? 13 : 21;
  const towers = Array.from({ length: cols }, (_, i) => ({ x: (i + 0.5) / cols + (r() - 0.5) * 0.02, z: 0.35 + r() * 0.65, hh: 0.2 + r() * 0.5, p: r() * TAU, s: 0.12 + r() * 0.2 })).sort((a, b) => a.z - b.z);
  const blocks = Array.from({ length: light ? 16 : 28 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, v: 0.008 + r() * 0.016, p: r() * TAU }));
  const floor = once(w, h, (c) => { const gr = c.createLinearGradient(0, h * 0.55, 0, h); gr.addColorStop(0, 'rgba(90,130,255,0)'); gr.addColorStop(1, 'rgba(90,130,255,0.14)'); c.fillStyle = gr; c.fillRect(0, h * 0.55, w, h * 0.45); });
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.drawImage(floor, 0, 0);
    for (const tw of towers) {
      const th = h * tw.hh * (0.8 + 0.2 * Math.sin(t * tw.s + tw.p)), bw = (w / cols) * 0.5 * tw.z;
      const x = tw.x * w - bw / 2, base = h * (0.8 + (1 - tw.z) * 0.1);
      const gr = g.createLinearGradient(0, base - th, 0, base);
      gr.addColorStop(0, 'rgba(150,180,255,0)'); gr.addColorStop(0.75, `rgba(120,160,255,${0.1 * tw.z})`); gr.addColorStop(1, `rgba(210,225,255,${0.2 * tw.z})`);
      g.fillStyle = gr; g.fillRect(x, base - th, bw, th);
      g.fillStyle = `rgba(225,235,255,${0.22 * tw.z})`; g.fillRect(x, base - th, bw, 1.5 * S);
    }
    for (const b of blocks) {
      const y = (((b.y - t * b.v) % 1) + 1) % 1, sz = (3 + 8 * b.z) * S * (h / 1080) * 1.4;
      g.fillStyle = `rgba(195,215,255,${(0.06 + 0.16 * b.z) * (0.6 + 0.4 * Math.sin(t + b.p))})`;
      g.fillRect(b.x * w + Math.sin(t * 0.3 + b.p) * 10 * S, y * h, sz, sz);
    }
  };
}

// Wii: the soft grey menu with its fine pinstripes, the channel grid, and the Wii blue light
function wii(g, w, h, S, pal, light) {
  const stripes = once(w, h, (c) => { c.fillStyle = 'rgba(255,255,255,0.045)'; const st = Math.max(2, Math.round(3 * S)); for (let y = 0; y < h; y += st * 2) c.fillRect(0, y, w, st); });
  const cols = 4, rows = 3, gw = w * 0.74, gh = h * 0.56, gx = (w - gw) / 2, gy = h * 0.14;
  const cw = gw / cols, ch = gh / rows, pad = Math.min(cw, ch) * 0.08, rad = Math.min(cw, ch) * 0.16;
  const BLUE = [52, 190, 237];
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.drawImage(stripes, 0, 0);
    // channels: ghosted rounded tiles, one at a time lighting up in Wii blue
    const lit = Math.floor(t / 2.6) % (cols * rows), k = (t % 2.6) / 2.6, glow = Math.sin(k * Math.PI);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const n = j * cols + i, x = gx + i * cw + pad, y = gy + j * ch + pad;
      rrect(g, x, y, cw - pad * 2, ch - pad * 2, rad);
      g.fillStyle = 'rgba(255,255,255,0.02)'; g.fill();
      g.lineWidth = (n === lit ? 2 : 1) * S;
      g.strokeStyle = n === lit ? `rgba(${BLUE},${0.12 + 0.3 * glow})` : 'rgba(255,255,255,0.055)'; g.stroke();
    }
    // the curved bar along the bottom, its edge in Wii blue
    const by = h * 0.86, sag = h * 0.05 * (1 + 0.1 * Math.sin(t * 0.4));
    g.beginPath(); g.moveTo(0, by - sag); g.quadraticCurveTo(w / 2, by + sag, w, by - sag); g.lineTo(w, h); g.lineTo(0, h); g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill();
    g.beginPath(); g.moveTo(0, by - sag); g.quadraticCurveTo(w / 2, by + sag, w, by - sag);
    g.strokeStyle = `rgba(${BLUE},0.55)`; g.lineWidth = 2 * S; g.stroke();
  };
}

// Wii U: a calm blue-white gradient with big soft bubbles floating up, like the plaza's light
function wiiu(g, w, h, S, pal, light) {
  const r = rng(31), sp = [sprite('#ffffff', 256), sprite('#8fdcff', 256), sprite('#cfe9ff', 256)];
  const bubbles = Array.from({ length: light ? 12 : 20 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, s: Math.floor(r() * 3), v: 0.006 + r() * 0.01, p: r() * TAU }));
  const band = once(w, h, (c) => { const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.07)'); gr.addColorStop(0.7, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 0.15); g.drawImage(band, 0, 0); g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    for (const b of bubbles) {
      const size = (80 + b.z * 280) * (h / 1080), y = (((b.y - t * b.v) % 1.3) + 1.3) % 1.3 - 0.15;
      g.globalAlpha = 0.08 + 0.16 * b.z;
      g.drawImage(sp[b.s], (b.x + Math.sin(t * 0.18 + b.p) * 0.02) * w - size / 2, y * h - size / 2, size, size);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  };
}

// Switch: its dark theme, flat and quiet, with the two Joy-Con colours glowing at the edges
function nswitch(g, w, h, S, pal, light) {
  const blue = sprite('#00c3e3', 256), red = sprite('#ff4554', 256);
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const a = 0.34 + 0.1 * Math.sin(t * 0.5), b = 0.34 + 0.1 * Math.sin(t * 0.5 + Math.PI), size = h * 1.3;
    g.globalAlpha = a; g.drawImage(blue, -size * 0.55, h - size * 0.55, size, size);
    g.globalAlpha = b; g.drawImage(red, w - size * 0.45, h - size * 0.55, size, size);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // the thin line the home menu sits on, blue into red
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,195,227,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,69,84,0.5)');
    g.fillStyle = gr; g.fillRect(0, h * 0.9, w, 1.5 * S);
  };
}

// Xbox: the green glowing core of the original console, rings pulsing out through a dark haze
function xbox(g, w, h, S, pal, light) {
  const core = sprite('#6dff3a', 256), fog = sprite('#1f8a14', 256);
  const r = rng(5), motes = Array.from({ length: light ? 20 : 36 }, () => ({ a: r() * TAU, d: 0.15 + r() * 0.7, v: 0.02 + r() * 0.05, z: r() }));
  const cx = w * 0.5, cy = h * 0.46;
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
    g.globalAlpha = 0.25; g.drawImage(fog, cx - h, cy - h, h * 2, h * 2);
    g.globalAlpha = 0.28 + 0.12 * pulse; const cs = h * (0.55 + 0.05 * pulse); g.drawImage(core, cx - cs / 2, cy - cs / 2, cs, cs);
    g.globalAlpha = 1;
    // rings travelling outward
    g.lineWidth = 1.5 * S;
    for (let i = 0; i < 5; i++) {
      const k = ((t * 0.06 + i / 5) % 1), rr = h * (0.12 + k * 0.9);
      g.strokeStyle = `rgba(120,255,80,${0.16 * (1 - k)})`;
      g.beginPath(); g.ellipse(cx, cy, rr * 1.35, rr, 0, 0, TAU); g.stroke();
    }
    for (const m of motes) {
      const a = m.a + t * m.v, d = (m.d + t * 0.01 * (0.5 + m.z)) % 1, x = cx + Math.cos(a) * d * w * 0.6, y = cy + Math.sin(a) * d * h * 0.55;
      g.fillStyle = `rgba(150,255,110,${0.1 + 0.25 * m.z * (1 - d)})`; g.fillRect(x, y, 2 * S, 2 * S);
    }
    g.globalCompositeOperation = 'source-over';
  };
}

// Xbox 360: bright green swooshes sweeping through the scene, with soft white orbs
function xbox360(g, w, h, S, pal, light) {
  const orb = sprite('#ffffff', 128), r = rng(9);
  const orbs = Array.from({ length: light ? 10 : 18 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, v: 0.004 + r() * 0.01, p: r() * TAU }));
  const SW = [{ y: 0.55, a: 0.18, k: 1.2, s: 0.05, c: '155,227,90', al: 0.22 }, { y: 0.66, a: 0.14, k: 1.7, s: -0.04, c: '230,255,210', al: 0.14 }, { y: 0.48, a: 0.22, k: 0.9, s: 0.03, c: '120,200,60', al: 0.16 }];
  const STEP = light ? 40 : 24;
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (const sw of SW) {
      const yOf = (u) => h * (sw.y + sw.a * Math.sin(u * Math.PI * sw.k + t * sw.s * 6) * 0.5);
      const thick = (u) => h * 0.06 * (0.4 + 0.6 * Math.sin(u * Math.PI));
      g.beginPath();
      for (let x = 0; x <= w + STEP; x += STEP) { const u = x / w; x ? g.lineTo(x, yOf(u) - thick(u)) : g.moveTo(x, yOf(u) - thick(u)); }
      for (let x = Math.ceil((w + STEP) / STEP) * STEP; x >= 0; x -= STEP) { const u = x / w; g.lineTo(x, yOf(u) + thick(u)); }
      g.closePath();
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, `rgba(${sw.c},0)`); gr.addColorStop(0.5, `rgba(${sw.c},${sw.al})`); gr.addColorStop(1, `rgba(${sw.c},0)`);
      g.fillStyle = gr; g.fill();
    }
    for (const o of orbs) {
      const size = (20 + o.z * 70) * (h / 1080), y = (((o.y - t * o.v) % 1.2) + 1.2) % 1.2 - 0.1;
      g.globalAlpha = 0.12 + 0.22 * o.z * (0.7 + 0.3 * Math.sin(t + o.p));
      g.drawImage(orb, o.x * w - size / 2, y * h - size / 2, size, size);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  };
}

// DS: the menu's wide pale stripes gliding slowly, a soft blue top screen glow
function ds(g, w, h, S, pal, light) {
  const bandH = h / 9;
  const top = once(w, h, (c) => { const gr = c.createLinearGradient(0, 0, 0, h * 0.45); gr.addColorStop(0, 'rgba(120,190,255,0.18)'); gr.addColorStop(1, 'rgba(120,190,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h * 0.45); });
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.drawImage(top, 0, 0);
    const off = (t * 6 * S) % (bandH * 2);
    g.fillStyle = 'rgba(255,255,255,0.028)';
    for (let y = -bandH * 2 + off; y < h; y += bandH * 2) g.fillRect(0, y, w, bandH);
    // the hinge line between the two screens
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, h * 0.5, w, 1.5 * S);
  };
}

// 3DS: a white grid running away into depth, with see-through squares floating at different depths
function n3ds(g, w, h, S, pal, light) {
  const r = rng(13), squares = Array.from({ length: light ? 8 : 13 }, () => ({ x: r(), y: 0.12 + r() * 0.42, z: 0.25 + r() * 0.75, p: r() * TAU, v: 0.01 + r() * 0.02 }));
  const hz = h * 0.52, lines = light ? 12 : 18;
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.lineWidth = 1 * S;
    // floor grid: lines to a vanishing point, rows moving towards you
    for (let i = -lines; i <= lines; i++) { g.strokeStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(w / 2 + i * w * 0.02, hz); g.lineTo(w / 2 + i * w * 0.12, h); g.stroke(); }
    for (let k = 0; k < 10; k++) {
      const d = ((k + (t * 0.25) % 1) / 10), y = hz + (h - hz) * d * d;
      g.strokeStyle = `rgba(255,255,255,${0.02 + 0.08 * d})`; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    for (const q of squares) {
      const sz = (30 + 90 * q.z) * (h / 1080), x = ((q.x + t * q.v * q.z * 0.2) % 1.1) * w - sz, y = q.y * h + Math.sin(t * 0.5 + q.p) * 12 * S;
      g.fillStyle = `rgba(255,255,255,${0.015 + 0.035 * q.z})`; g.strokeStyle = `rgba(255,255,255,${0.05 + 0.08 * q.z})`;
      rrect(g, x, y, sz, sz, sz * 0.14); g.fill(); g.stroke();
    }
  };
}

export const RENDERERS = { waves, ribbons, ps2, wii, wiiu, switch: nswitch, xbox, xbox360, ds, n3ds };
// Picker entries. The first two follow your theme colours, the console ones use their own.
export const BACKGROUNDS = [
  { v: 'waves', l: 'XMB Waves', sub: 'PSP style, in your theme colours', group: 'Theme' },
  { v: 'ribbons', l: 'Ribbons', sub: 'PS3 style, in your theme colours', group: 'Theme' },
  { v: 'ps2', l: 'PlayStation 2', sub: 'Towers of light in blue haze', group: 'Consoles' },
  { v: 'wii', l: 'Wii', sub: 'Pinstripes, channels and Wii blue', group: 'Consoles' },
  { v: 'wiiu', l: 'Wii U', sub: 'Soft light bubbles', group: 'Consoles' },
  { v: 'switch', l: 'Switch', sub: 'Dark theme with Joy-Con glow', group: 'Consoles' },
  { v: 'ds', l: 'Nintendo DS', sub: 'Gliding menu stripes', group: 'Consoles' },
  { v: 'n3ds', l: 'Nintendo 3DS', sub: 'A grid running into depth', group: 'Consoles' },
  { v: 'xbox', l: 'Xbox', sub: 'The glowing green core', group: 'Consoles' },
  { v: 'xbox360', l: 'Xbox 360', sub: 'Green swooshes and orbs', group: 'Consoles' },
  { v: 'solid', l: 'Still', sub: 'A still gradient, no motion', group: 'Other' },
  { v: 'art', l: 'Game artwork', sub: 'The highlighted game', group: 'Other' },
  { v: 'wallpaper', l: 'Wallpaper', sub: 'An image of your own', group: 'Other' },
];
// The console backgrounds' own base colours (under the canvas)
export const BG_BASE = {
  ps2: 'radial-gradient(120% 90% at 50% 100%, #122466 0%, #070c24 55%, #020308 100%)',
  wii: 'linear-gradient(180deg, #6f7988 0%, #535c69 50%, #353b45 100%)',
  wiiu: 'linear-gradient(160deg, #5b7897 0%, #34495f 50%, #1a2432 100%)',
  switch: 'linear-gradient(180deg, #343434 0%, #282828 60%, #1c1c1c 100%)',
  ds: 'linear-gradient(180deg, #5c6470 0%, #40464f 55%, #272b31 100%)',
  n3ds: 'linear-gradient(180deg, #5d6169 0%, #3d4046 55%, #232529 100%)',
  xbox: 'radial-gradient(90% 90% at 50% 45%, #0f3a10 0%, #051405 50%, #010401 100%)',
  xbox360: 'linear-gradient(170deg, #3e6c20 0%, #1d3b0e 50%, #0a1606 100%)',
};
// darker base for renderers that need contrast (theme gradient under the canvas)
export const DARK_BASE = new Set([]);
