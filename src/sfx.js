// Tiny synthesized UI sounds (no assets). Soft, short, console-like.
let ctx;
let enabled = true;
export function setSoundEnabled(v) { enabled = v; }
function tone(freqs, { dur = 0.05, type = 'sine', vol = 0.05, glide = 0 } = {}) {
  if (!enabled) return;
  try {
    ctx ||= new AudioContext();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      const st = t0 + i * dur * 0.8;
      o.frequency.setValueAtTime(f, st);
      if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, st + dur);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(vol, st + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      o.connect(g).connect(ctx.destination);
      o.start(st); o.stop(st + dur + 0.02);
    });
  } catch {}
}
export const sfx = {
  move: () => tone([1320], { dur: 0.035, type: 'triangle', vol: 0.025 }),
  accept: () => tone([660, 990], { dur: 0.06, type: 'triangle', vol: 0.05 }),
  back: () => tone([520, 390], { dur: 0.06, type: 'triangle', vol: 0.04 }),
  tab: () => tone([880], { dur: 0.05, type: 'sine', vol: 0.04, glide: 1.25 }),
  error: () => tone([220, 180], { dur: 0.09, type: 'square', vol: 0.02 }),
  done: () => tone([784, 988, 1319], { dur: 0.09, type: 'sine', vol: 0.05 }),
};
