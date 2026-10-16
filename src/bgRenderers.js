// Animated backgrounds. Each renderer is set up once per canvas size / palette and then draws a
// frame for a given time. They are all original designs, only loosely inspired by console menus,
// and they are kept cheap: a handful of paths or pre-rendered sprites per frame, no CSS filters.

// 0.9.38 (owner): on the Light theme the same lines are drawn in dark ink, laid over the page normally instead of
// added together (adding light to an off-white page shows nothing). Set by setInk() before a renderer is made.
let INK = '255,255,255', COMP = 'lighter';
export function setInk(ink) { INK = ink || '255,255,255'; COMP = ink ? 'source-over' : 'lighter'; }
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
    gr.addColorStop(0, `rgba(${INK},0)`);
    gr.addColorStop(0.3, `rgba(${INK},${wv.al})`);
    gr.addColorStop(0.7, `rgba(${INK},${wv.al * 1.3})`);
    gr.addColorStop(1, `rgba(${INK},0)`);
    return gr;
  });
  return (time) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = COMP;
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
      g.strokeStyle = `rgba(${INK},${wv.al * 1.6})`; g.lineWidth = 1.5 * S; g.stroke();
    });
  };
}

// Ribbons: one silky band made of many thin lines (inspired by the PS3 menu wave)
function ribbons(g, w, h, S, pal, light) {
  const N = light ? 14 : 26, STEP = light ? 32 : 20;
  const glow = g.createLinearGradient(0, 0, w, 0);
  glow.addColorStop(0, `rgba(${INK},0)`); glow.addColorStop(0.5, `rgba(${INK},0.09)`); glow.addColorStop(1, `rgba(${INK},0)`);
  return (time) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = COMP;
    const yOf = (u, k) => h * (0.6 + 0.07 * Math.sin(u * 2.6 + time * 0.22 + k * 0.05) + 0.05 * Math.sin(u * 5.1 - time * 0.31 + k * 0.11)) + (k - N / 2) * h * (light ? 0.014 : 0.009) * (1 + 0.8 * Math.sin(u * 3 + time * 0.4));
    // soft body of the band
    g.beginPath();
    for (let x = 0; x <= w + STEP; x += STEP) { const u = x / w; x ? g.lineTo(x, yOf(u, 0) - h * 0.03) : g.moveTo(x, yOf(u, 0) - h * 0.03); }
    for (let x = Math.ceil((w + STEP) / STEP) * STEP; x >= 0; x -= STEP) { const u = x / w; g.lineTo(x, yOf(u, N) + h * 0.03); }
    g.closePath(); g.fillStyle = glow; g.fill();
    g.lineWidth = 1.1 * S;
    for (let k = 0; k <= N; k++) {
      const edge = Math.abs(k - N / 2) / (N / 2);
      g.strokeStyle = `rgba(${INK},${0.07 + 0.22 * (1 - edge)})`;
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

// glow sprite (used by Drift and by Game artwork's light)
function glow(rgb, size) {
  size = Math.max(2, Math.round(size));
  return once(size, size, (c) => { const r = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); r.addColorStop(0, `rgba(${rgb},1)`); r.addColorStop(0.4, `rgba(${rgb},0.35)`); r.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = r; c.fillRect(0, 0, size, size); });
}
const rgbOf = (hex) => { const n = parseInt(String(hex || '#ffffff').slice(1).padEnd(6, '0').slice(0, 6), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };

// ---------------------------------------------------------------- styles (0.9.19, rebuilt in 0.9.47)
// The owner retired the console scenes ("they all look bad, except Ribbons and XMB"): backgrounds are styles,
// made the way Ribbons is. 0.9.47 (owner: raise the others to Waves/Ribbons quality, with formal maths) rebuilt
// Aurora, Drift and Tide and retuned Contours on the rules Ribbons follows:
// - one focal shape, low in the frame and to the right, the left kept quiet for the page's words;
// - every motion is a short Fourier sum (PRESETS below: amplitude A, wavenumber k, angular speed w, phase ph), slow
//   and low-frequency, so neighbours move together and nothing jitters;
// - hair-fine lines or soft sprites added together ('lighter'; dark ink laid over on Light), fading at their ends;
// - a pure function of time t: the same t gives the same frame at any frame rate, so dropped frames never speed it up;
// - built once per size: gradients and sprites are made in setup, never per frame.
// Waves and Ribbons above are left exactly as they were.

// sum of sines: Σ A·sin(k·u + w·t + ph)
const fsum = (P, u, t) => { let s = 0; for (const p of P) s += p.A * Math.sin(p.k * u + p.w * t + p.ph); return s; };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const v = clamp01((x - a) / (b - a)); return v * v * (3 - 2 * v); };
export const PRESETS = {
  // Aurora: the fold each curtain hangs from (fraction of height) and the brightness travelling along it
  aurora: [
    { y: 0.56, len: 0.36, fold: [{ A: 0.075, k: 2.7, w: 0.09, ph: 0 }, { A: 0.028, k: 6.3, w: -0.14, ph: 1.3 }], lit: [{ A: 0.55, k: 7.1, w: -0.31, ph: 0 }, { A: 0.35, k: 3.3, w: 0.17, ph: 2.2 }] },
    { y: 0.42, len: 0.24, fold: [{ A: 0.05, k: 2.1, w: -0.07, ph: 2.1 }, { A: 0.02, k: 5.2, w: 0.12, ph: 0.4 }], lit: [{ A: 0.6, k: 5.7, w: 0.27, ph: 1.1 }, { A: 0.3, k: 9.4, w: -0.19, ph: 0.3 }] },
  ],
  // Drift: a stream function ψ(x, y, t); the motes follow its curl, so the flow is smooth and never converges
  drift: [{ A: 0.035, kx: 3.1, ky: 1.7, w: 0.05, ph: 0 }, { A: 0.022, kx: -1.9, ky: 4.3, w: -0.04, ph: 1.7 }, { A: 0.012, kx: 6.2, ky: -2.8, w: 0.07, ph: 4.1 }],
  // Tide: deep-water swells (Airy waves, ω = √(g·k)), each with a direction; height in world units
  tide: [{ A: 0.24, k: 0.9, dx: 0.94, dz: 0.34, ph: 0 }, { A: 0.12, k: 1.9, dx: -0.55, dz: 0.83, ph: 1.9 }, { A: 0.05, k: 4.1, dx: 0.2, dz: 0.98, ph: 3.3 }],
  // Contours: the height field, two folded sines (unchanged shape, now named)
  contours: { speed: 0.05, levels: 17, lightLevels: 9 },
};
const G = 9.81 * 0.02; // gravity scaled to Cartridge's slow time: a swell of k = 1 takes about 45 s to roll by

// Aurora: two curtains of light hanging from slow folds. Each curtain is narrow vertical strips of one pre-made
// gradient (bright at the fold, fading up; a short soft fade below it), so the light is continuous and rays come from
// a fixed fine striation, not from hundreds of separate strokes. A hair-fine line traces each fold, as in Ribbons.
function aurora(g, w, h, S, pal, light) {
  const acc = rgbOf(pal?.accent), lig = rgbOf(pal?.light || pal?.accent), R = rng(7);
  const STEP = Math.max(2, Math.round((light ? 5 : 3) * S));
  const cols = Math.ceil(w / STEP) + 1;
  // rays: a few incommensurate sines over the column index, so they come in soft bundles of varying width instead
  // of a regular comb (and a little noise so no two bundles match)
  const p1 = R() * TAU, p2 = R() * TAU, p3 = R() * TAU;
  const stria = Float32Array.from({ length: cols }, (_, i) => { const x = (i * STEP) / (4 * S); return clamp01(0.55 + 0.2 * Math.sin(x * 0.23 + p1) + 0.14 * Math.sin(x * 0.71 + p2) + 0.08 * Math.sin(x * 1.9 + p3) + 0.08 * (R() - 0.5)); });
  const strip = (rgb) => once(1, 256, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.45, `rgba(${rgb},0.2)`); gr.addColorStop(0.72, `rgba(${rgb},0.7)`);
    gr.addColorStop(0.78, `rgba(${rgb},1)`); gr.addColorStop(0.86, `rgba(${rgb},0.35)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = gr; c.fillRect(0, 0, 1, 256);
  });
  const CURT = PRESETS.aurora.map((c, i) => ({ ...c, img: strip(i ? lig : acc), rgb: i ? lig : acc }));
  const body = glow(acc, Math.round(h * 0.8));
  // the curtains thin out to the left, where the words are
  const side = Float32Array.from({ length: cols }, (_, i) => 0.25 + 0.75 * smooth(0.05, 0.6, (i * STEP) / w));
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = COMP;
    for (const c of CURT) {
      const fold = (u) => h * (c.y + fsum(c.fold, u, t));
      for (let i = 0; i <= 4; i++) { const u = 0.3 + (i / 4) * 0.7; g.globalAlpha = 0.05; g.drawImage(body, u * w - body.width / 2, fold(u) - body.height * 0.6); }
      for (let i = 0; i < cols; i++) {
        const u = (i * STEP) / w, lit = clamp01(0.5 + 0.5 * fsum(c.lit, u, t));
        const len = h * c.len * (0.45 + 0.55 * lit), y0 = fold(u);
        g.globalAlpha = (light ? 0.5 : 0.34) * side[i] * stria[i] * (0.35 + 0.65 * lit);
        g.drawImage(c.img, i * STEP, y0 - len * 0.78, STEP + 0.6, len); // the strip's bright point (0.78) sits on the fold, a soft glow runs on below
      }
      g.globalAlpha = 1;
      g.beginPath();
      for (let x = 0; x <= w + STEP; x += STEP * 3) { const y = fold(x / w); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = `rgba(${c.rgb},${light ? 0.45 : 0.3})`; g.lineWidth = 1.1 * S; g.stroke();
    }
  };
}

// Contours: slowly shifting height lines, like a map's, drawn by marching squares over a moving field
function contours(g, w, h, S, pal, light) {
  const C = light ? 40 : 72, Rw = Math.ceil(C * h / w), dx = w / C, dy = h / Rw;
  const NL = light ? PRESETS.contours.lightLevels : PRESETS.contours.levels, LEVELS = Array.from({ length: NL }, (_, i) => -0.8 + (1.6 * i) / (NL - 1));
  const f = new Float32Array((C + 1) * (Rw + 1));
  const acc = rgbOf(pal?.accent);
  return (t) => {
    const T = t * PRESETS.contours.speed;
    for (let j = 0; j <= Rw; j++) for (let i = 0; i <= C; i++) {
      const x = i / C * 3.2, y = j / Rw * 1.8;
      f[j * (C + 1) + i] = 0.55 * Math.sin(x * 1.3 + T * 1.7 + Math.sin(y * 1.1 - T)) + 0.45 * Math.cos(y * 1.9 - T * 1.3 + Math.sin(x * 0.7 + T * 0.6)) * Math.sin(x * 0.5 + y * 0.4 + T * 0.4);
    }
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = COMP;
    g.lineJoin = 'round'; g.lineCap = 'round';
    LEVELS.forEach((L, li) => {
      g.beginPath();
      for (let j = 0; j < Rw; j++) for (let i = 0; i < C; i++) {
        const a = f[j * (C + 1) + i], b = f[j * (C + 1) + i + 1], c = f[(j + 1) * (C + 1) + i + 1], d = f[(j + 1) * (C + 1) + i];
        const k = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
        if (k === 0 || k === 15) continue;
        const x0 = i * dx, y0 = j * dy;
        const T_ = [x0 + dx * (L - a) / (b - a), y0], R_ = [x0 + dx, y0 + dy * (L - b) / (c - b)], B_ = [x0 + dx * (L - d) / (c - d), y0 + dy], L_ = [x0, y0 + dy * (L - a) / (d - a)];
        const seg = (p, q) => { g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); };
        switch (k) {
          case 1: case 14: seg(L_, B_); break; case 2: case 13: seg(B_, R_); break; case 3: case 12: seg(L_, R_); break;
          case 4: case 11: seg(T_, R_); break; case 5: seg(L_, T_); seg(B_, R_); break; case 6: case 9: seg(T_, B_); break;
          case 7: case 8: seg(L_, T_); break; case 10: seg(T_, R_); seg(L_, B_); break;
        }
      }
      // every fourth line heavier, as maps draw their index lines; the middle one in your colour
      const idx = li % 4 === 0, mid = li === (LEVELS.length - 1) / 2;
      g.lineWidth = (idx ? 1.6 : 1) * S;
      g.strokeStyle = mid ? `rgba(${acc},0.38)` : `rgba(${INK},${(idx ? 0.15 : 0.075) * (1.1 - Math.abs(L) * 0.5)})`;
      g.stroke();
    });
    // the lines fade towards the left, where the page's words are, and softly at the top
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, 0, w * 0.55, 0); fade.addColorStop(0, 'rgba(0,0,0,0.85)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, w * 0.55, h);
    const top = g.createLinearGradient(0, 0, 0, h * 0.25); top.addColorStop(0, 'rgba(0,0,0,0.6)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top; g.fillRect(0, 0, w, h * 0.25);
    g.globalCompositeOperation = 'source-over';
  };
}

// Drift: soft points of light carried along a slow current. Each mote has a home on a long diagonal band (the
// focal shape, low left to high right like Ribbons' band), travels along it, and is displaced by the curl of the
// stream function, so neighbours sway together. Three depths: near ones big, soft and slow, far ones small and sharp.
function drift(g, w, h, S, pal, light) {
  const R = rng(11), N = light ? 34 : 70;
  const acc = rgbOf(pal?.accent), lig = rgbOf(pal?.light || pal?.accent);
  const sprites = [glow(INK, 26 * S), glow(lig, 90 * S), glow(acc, 260 * S)];
  const ALPHA = light ? [0.5, 0.2, 0.1] : [0.42, 0.16, 0.085], SPEED = [0.006, 0.0045, 0.003];
  const pts = Array.from({ length: N }, () => { const z = R(); return { s: R(), off: (R() + R() + R() - 1.5) * 0.22, d: z < 0.6 ? 0 : z < 0.9 ? 1 : 2, ph: R() * TAU, sp: 0.7 + R() * 0.6 }; });
  const P = PRESETS.drift;
  // curl of ψ = Σ A sin(kx·x + ky·y + w·t + ph): v = (∂ψ/∂y, -∂ψ/∂x)
  const curl = (x, y, t) => { let vx = 0, vy = 0; for (const p of P) { const c = p.A * Math.cos(p.kx * x + p.ky * y + p.w * t + p.ph); vx += p.ky * c; vy -= p.kx * c; } return [vx, vy]; };
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = COMP;
    for (const p of pts) {
      const s = (p.s + t * SPEED[p.d] * p.sp) % 1; // along the band, 0 at the left edge
      const bx = -0.1 + s * 1.2, by = 0.78 - s * 0.42 + p.off + 0.05 * Math.sin(s * 5 + p.ph);
      const [vx, vy] = curl(bx, by, t);
      const x = (bx + vx * 0.9) * w, y = (by + vy * 0.9) * h;
      // fade in and out at the band's ends (no pop on wrap), quieter on the left, a slow breathe
      const life = smooth(0, 0.12, s) * (1 - smooth(0.88, 1, s)), side = 0.35 + 0.65 * smooth(0.1, 0.55, s);
      const img = sprites[p.d];
      g.globalAlpha = ALPHA[p.d] * life * side * (0.7 + 0.3 * Math.sin(t * 0.4 * p.sp + p.ph));
      g.drawImage(img, x - img.width / 2, y - img.height / 2);
    }
    g.globalAlpha = 1;
  };
}

// Tide: a sea of fine points seen from just above, rising and falling in long swells. A real perspective plane
// (rows spread to the frame's full width at every depth, so there's no point at the horizon), heights from the
// Airy swells in PRESETS.tide (each crest moves at its own speed, √(g/k)), the far rows fading into haze and the
// crests catching your colour.
function tide(g, w, h, S, pal, light) {
  const ROWS = light ? 22 : 36, GAP = light ? 0.2 : 0.12; // world spacing between points, the same at every depth
  const acc = rgbOf(pal?.accent), P = PRESETS.tide.map((p) => ({ ...p, om: Math.sqrt(G * p.k) }));
  const horizon = h * 0.5, camH = 1.1, f = h * 0.9, Z0 = 1.1, Z1 = 16;
  const zs = Array.from({ length: ROWS }, (_, r) => Z0 * Math.pow(Z1 / Z0, r / (ROWS - 1))); // even on screen, not in depth
  const crest = [];
  return (t) => {
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = COMP;
    crest.length = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      const z = zs[r], half = (w / 2) * z / f * 1.06; // world half-width that fills the frame at this depth
      const gap = Math.max(GAP, (2 * half) / 260); // far rows: no more than 260 points
      const haze = Math.exp(-(z - Z0) * 0.14), a = (light ? 0.75 : 0.6) * haze;
      const s = Math.max(1, 2.6 * S * Z0 / z + 0.5 * S);
      g.fillStyle = `rgba(${INK},${a.toFixed(3)})`;
      for (let x = -Math.floor(half / gap) * gap; x <= half; x += gap) {
        let y = 0; for (const p of P) y += p.A * Math.sin(p.k * (p.dx * x + p.dz * z) - p.om * t + p.ph);
        const X = w / 2 + x * f / z, Y = horizon + (camH - y) * f / z;
        if (Y > h + 8) continue;
        if (y > 0.25) crest.push(X, Y, s, haze); else g.fillRect(X - s / 2, Y - s / 2, s, s);
      }
    }
    for (let i = 0; i < crest.length; i += 4) { g.fillStyle = `rgba(${acc},${((light ? 0.85 : 0.85) * crest[i + 3]).toFixed(3)})`; const s = crest[i + 2] * 1.2; g.fillRect(crest[i] - s / 2, crest[i + 1] - s / 2, s, s); }
    // haze over the horizon so the far rows melt into the page
    g.globalCompositeOperation = 'destination-out';
    const hz = g.createLinearGradient(0, horizon, 0, horizon + h * 0.12); hz.addColorStop(0, 'rgba(0,0,0,1)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hz; g.fillRect(0, 0, w, horizon + h * 0.12);
    g.globalCompositeOperation = 'source-over';
  };
}

// ---------------------------------------------------------------- scenes with their own colours (0.9.47)
// Owner asked for more backgrounds at Waves/Ribbons quality, from formal presets. Each is one of the two originals'
// constructions with its numbers written down: a wave scene is Waves' layered bands (a sum of sines for the centre
// line, a breathing thickness, the front layer brightest and the back ones wider and fainter); a ribbon scene is
// Ribbons' band of hair-fine lines (each line offset from the centre curve, brightest in the middle) with a
// specular glint travelling along it. They keep their own colours over their own dark base (BG_BASE), in every
// theme, and are pure functions of time like the rest.
const SCENES = {
  midnight: { kind: 'ribbon', cols: ['#5ef2ff', '#9b7bff'], n: 22, spread: 0.010, y: 0.58, fold: [{ A: 0.08, k: 2.6, w: 0.2, ph: 0 }, { A: 0.045, k: 5.3, w: -0.29, ph: 1.1 }], twist: 0.9, glint: 0.1, line: 1.1, alpha: 0.42 },
  solar: { kind: 'wave', cols: ['#ff9d3c', '#ffd56b', '#ff6a2b'], speed: 0.6, layers: [{ a: 0.10, k: 1.3, s: 0.07, y: 0.6, h: 0.24, al: 0.16 }, { a: 0.07, k: 2.1, s: -0.05, y: 0.64, h: 0.14, al: 0.12 }, { a: 0.12, k: 0.9, s: 0.04, y: 0.56, h: 0.3, al: 0.07 }, { a: 0.05, k: 2.9, s: 0.09, y: 0.67, h: 0.06, al: 0.2 }] },
  nordic: { kind: 'ribbon', cols: ['#3dffa8', '#2bd4d0'], n: 26, spread: 0.016, y: 0.5, fold: [{ A: 0.12, k: 1.9, w: 0.12, ph: 0.4 }, { A: 0.05, k: 4.4, w: -0.17, ph: 2.0 }], twist: 1.6, glint: 0.06, line: 1.1, alpha: 0.3, sway: 0.06 },
  cyber: { kind: 'wave', cols: ['#a24bff', '#ff3fb4', '#6a5bff'], speed: 1.25, layers: [{ a: 0.09, k: 1.8, s: 0.11, y: 0.6, h: 0.15, al: 0.14 }, { a: 0.07, k: 2.6, s: -0.09, y: 0.63, h: 0.09, al: 0.12 }, { a: 0.11, k: 1.2, s: 0.06, y: 0.56, h: 0.22, al: 0.07 }, { a: 0.04, k: 3.6, s: 0.15, y: 0.66, h: 0.04, al: 0.22 }] },
  titanium: { kind: 'ribbon', cols: ['#eef2f8', '#8a93a3'], n: 34, spread: 0.008, y: 0.6, fold: [{ A: 0.07, k: 2.2, w: 0.16, ph: 0.8 }, { A: 0.04, k: 5.9, w: -0.22, ph: 0.2 }], twist: 1.1, glint: 0.08, line: 0.9, alpha: 0.26 },
};
function sceneWave(cfg) {
  return (g, w, h, S) => {
    const STEP = 18;
    const grads = cfg.layers.map((wv, i) => {
      const c = rgbOf(cfg.cols[i % cfg.cols.length]), gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.3, `rgba(${c},${wv.al})`); gr.addColorStop(0.7, `rgba(${c},${wv.al * 1.3})`); gr.addColorStop(1, `rgba(${c},0)`);
      return { gr, c };
    });
    return (time) => {
      const t = time * cfg.speed;
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      cfg.layers.forEach((wv, wi) => {
        const top = [], bot = [];
        for (let x = 0; x <= w + STEP; x += STEP) {
          const u = x / w;
          const base = wv.y * h + Math.sin(u * Math.PI * wv.k + t * wv.s * 6) * wv.a * h + Math.sin(u * Math.PI * wv.k * 0.5 - t * wv.s * 3) * wv.a * 0.5 * h;
          const thick = wv.h * h * (0.55 + 0.45 * Math.sin(u * Math.PI * 1.3 + t * wv.s * 4));
          top.push(x, base - thick / 2); bot.push(x, base + thick / 2);
        }
        g.beginPath();
        for (let i = 0; i < top.length; i += 2) (i ? g.lineTo(top[i], top[i + 1]) : g.moveTo(top[i], top[i + 1]));
        for (let i = bot.length - 2; i >= 0; i -= 2) g.lineTo(bot[i], bot[i + 1]);
        g.closePath(); g.fillStyle = grads[wi].gr; g.fill();
        g.beginPath();
        for (let i = 0; i < top.length; i += 2) (i ? g.lineTo(top[i], top[i + 1]) : g.moveTo(top[i], top[i + 1]));
        g.strokeStyle = `rgba(${grads[wi].c},${wv.al * 1.8})`; g.lineWidth = 1.5 * S; g.stroke();
      });
      g.globalCompositeOperation = 'source-over';
    };
  };
}
function sceneRibbon(cfg) {
  return (g, w, h, S) => {
    const N = cfg.n, STEP = 20, a = rgbOf(cfg.cols[0]), b = rgbOf(cfg.cols[1]);
    const lineGrad = (al) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, `rgba(${b},0)`); gr.addColorStop(0.25, `rgba(${b},${al})`); gr.addColorStop(0.7, `rgba(${a},${al})`); gr.addColorStop(1, `rgba(${a},${al * 0.4})`); return gr; };
    const grads = Array.from({ length: N + 1 }, (_, k) => lineGrad(cfg.alpha * (0.3 + 0.7 * (1 - Math.abs(k - N / 2) / (N / 2)))));
    const glintS = glow(a, Math.round(h * 0.32));
    const body = g.createLinearGradient(0, 0, w, 0); body.addColorStop(0, `rgba(${b},0)`); body.addColorStop(0.5, `rgba(${a},0.06)`); body.addColorStop(1, `rgba(${a},0)`);
    return (t) => {
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const sway = cfg.sway ? Math.sin(t * 0.09) * cfg.sway : 0; // Nordic: the whole band drifts up and down
      const yOf = (u, k) => h * (cfg.y + sway + fsum(cfg.fold, u * 2, t * 0.5)) + (k - N / 2) * h * cfg.spread * (1 + 0.8 * Math.sin(u * 3 * cfg.twist + t * 0.35));
      g.beginPath();
      for (let x = 0; x <= w + STEP; x += STEP) { const u = x / w; x ? g.lineTo(x, yOf(u, 0) - h * 0.03) : g.moveTo(x, yOf(u, 0) - h * 0.03); }
      for (let x = Math.ceil((w + STEP) / STEP) * STEP; x >= 0; x -= STEP) g.lineTo(x, yOf(x / w, N) + h * 0.03);
      g.closePath(); g.fillStyle = body; g.fill();
      g.lineWidth = cfg.line * S;
      for (let k = 0; k <= N; k++) {
        g.strokeStyle = grads[k];
        g.beginPath();
        for (let x = 0; x <= w + STEP; x += STEP) { const y = yOf(x / w, k); x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      // the specular glint: a soft light travelling along the band's middle, once every ~40 s
      const gu = ((t * 0.025) % 1.4) - 0.2;
      g.globalAlpha = cfg.glint * Math.sin(Math.PI * clamp01((gu + 0.2) / 1.4)) * 4;
      g.drawImage(glintS, gu * w - glintS.width / 2, yOf(gu, N / 2) - glintS.height / 2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    };
  };
}
const SCENE_R = Object.fromEntries(Object.entries(SCENES).map(([k, c]) => [k, (c.kind === 'wave' ? sceneWave : sceneRibbon)(c)]));

export function artPan(urls, rgb = '150,150,170') {
  const imgs = [];
  for (const u of urls.slice(0, 24)) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = u; imgs.push(im); }
  return (g, w, h, S, pal, light) => {
    const tw = Math.round(w / 6), th = Math.round(tw * 4 / 3), blur = Math.max(4, Math.round(w / 110));
    const tiles = [];
    const make = (im) => once(tw, th, (c) => { c.filter = `blur(${blur}px) brightness(0.6) saturate(1.1)`; c.drawImage(im, -blur, -blur, tw + blur * 2, th + blur * 2); });
    const lightG = glow(rgb, Math.round(w * 1.2));
    return (t) => {
      if (tiles.length < imgs.length) for (let i = tiles.length; i < imgs.length && imgs[i].complete; i++) tiles.push(imgs[i].naturalWidth ? make(imgs[i]) : null);
      const ok = tiles.filter(Boolean);
      g.clearRect(0, 0, w, h);
      if (ok.length) {
        const off = (t * 0.012 * w) % (tw * 1.1);
        for (let row = -1; row < 4; row++) for (let col = -1; col < 8; col++) {
          const tile = ok[((row + 10) * 7 + col + 10) % ok.length];
          g.drawImage(tile, col * tw * 1.1 - off + (row % 2) * tw * 0.5, row * th * 1.05 - th * 0.3 + Math.sin(t / 9 + col) * 6 * S);
        }
      }
      g.globalAlpha = 0.3; g.drawImage(lightG, w * 0.85 - lightG.width / 2, h * 0.1 - lightG.height / 2); g.globalAlpha = 1;
      const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0.35)'); v.addColorStop(0.6, 'rgba(0,0,0,0.2)'); v.addColorStop(1, 'rgba(0,0,0,0.75)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    };
  };
}

export const RENDERERS = { waves, ribbons, aurora, contours, drift, tide, ...SCENE_R };
// Backgrounds from before 0.9.15 whose console now shows its own game art (A)
export const LEGACY_ART = { wiiu: 'wiiu', ds: 'nds', n3ds: '3ds', xbox: 'xbox', ps2: 'ps2', gc: 'ngc', wii: 'wii', xbox360: 'xbox360', switch: 'switch' }; // 0.9.19: the console scenes retired too (owner)
// Picker entries. The first two follow your theme colours, the console ones use their own.
export const BACKGROUNDS = [
  { v: 'ribbons', l: 'Ribbons', sub: 'One silky band of fine lines', group: 'Theme' },
  { v: 'waves', l: 'XMB Waves', sub: 'Soft waves of light', group: 'Theme' },
  { v: 'aurora', l: 'Aurora', sub: 'Curtains of light that sway and shimmer', group: 'Theme' },
  { v: 'contours', l: 'Contours', sub: 'Slow height lines, like a map', group: 'Theme' },
  { v: 'drift', l: 'Drift', sub: 'Soft lights floating by', group: 'Theme' },
  { v: 'tide', l: 'Tide', sub: 'A sea of points rising and falling', group: 'Theme' },
  { v: 'midnight', l: 'Midnight', sub: 'Neon glass ribbons on obsidian', group: 'Scenes' },
  { v: 'solar', l: 'Solar Flare', sub: 'Slow amber and gold waves', group: 'Scenes' },
  { v: 'nordic', l: 'Nordic Aurora', sub: 'Emerald and teal ribbons drifting', group: 'Scenes' },
  { v: 'cyber', l: 'Cyber Gradient', sub: 'Purple and magenta waves', group: 'Scenes' },
  { v: 'titanium', l: 'Liquid Titanium', sub: 'Chrome ribbons catching the light', group: 'Scenes' },
  { v: 'solid', l: 'Still', sub: 'A still gradient, no motion', group: 'Other' },
  { v: 'art', l: 'Game artwork', sub: 'The highlighted game', group: 'Other' },
  { v: 'wallpaper', l: 'Wallpaper', sub: 'An image of your own', group: 'Other' },
];
// The console backgrounds' own base colours (under the canvas)
export const BG_BASE = {
  art: 'linear-gradient(180deg, #0b0b0d 0%, #070708 100%)',
  midnight: 'linear-gradient(160deg, #0b0d1a 0%, #05060c 60%, #020206 100%)',
  solar: 'linear-gradient(170deg, #2a0e04 0%, #160703 55%, #0a0402 100%)',
  nordic: 'linear-gradient(170deg, #04201c 0%, #021210 55%, #010807 100%)',
  cyber: 'linear-gradient(160deg, #2a0838 0%, #15041f 55%, #090210 100%)',
  titanium: 'linear-gradient(170deg, #1b1d22 0%, #0f1013 55%, #070708 100%)',
};
// darker base for renderers that need contrast (theme gradient under the canvas)
export const DARK_BASE = new Set([]);

// A still picture of a background for the picker (0.9.3 L): the renderer's frame a few seconds in,
// drawn small over its base colour (theme ones over a dark tint of your accent)
export function bgPreview(v, pal, w = 320, h = 180) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, w, h);
  const css = BG_BASE[v] || '';
  const ink = pal?.ink || ''; // the Light theme's previews look like its page (0.9.38)
  const stops = css.match(/#[0-9a-f]{6}/gi) || (ink ? ['#f0efeb', '#e4e3de', '#d8d7d1'] : ['#0c0e15', pal?.accent || '#2a2f45', '#07080c']);
  stops.forEach((col, i) => base.addColorStop(i / Math.max(1, stops.length - 1), col));
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  if (!BG_BASE[v] && !ink) { g.fillStyle = 'rgba(5, 6, 10, 0.55)'; g.fillRect(0, 0, w, h); }
  const R = RENDERERS[v];
  if (R) {
    const layer = document.createElement('canvas');
    layer.width = w; layer.height = h;
    const was = [INK, COMP];
    setInk(ink);
    try { R(layer.getContext('2d'), w, h, w / 1920, pal, true)(4000); g.drawImage(layer, 0, 0); } catch {}
    [INK, COMP] = was; // the live background keeps its own
  }
  return c.toDataURL('image/png');
}
