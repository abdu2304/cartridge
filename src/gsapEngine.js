// GSAP behind a test switch (0.9.70, owner's pick after the skills review). CAE stays the rule book and keeps focus,
// presses and page arrivals on CSS springs (the compositor runs them, so they don't stutter when the window is busy).
// With Settings → Help and About → Motion Engine on GSAP, three moving parts run on GSAP instead, so the owner can
// compare both on the Deck: the card to game page flight (motion.js morph), tiles moving while Start is arranged
// (Flip) and the welcome's opening (a timeline). GSAP is loaded only when the switch is on (its own chunk).
// Measured with tools/ui-audit/motionBench.js. If GSAP isn't at least as smooth there and on the Deck, it goes.
let lib = null, loading = null;
export const gsapOn = () => document.body.classList.contains('motion-gsap');
export function load() {
  if (lib) return Promise.resolve(lib);
  return (loading ||= Promise.all([import('gsap'), import('gsap/Flip')]).then(([g, f]) => {
    const gsap = g.gsap || g.default, Flip = f.Flip || f.default;
    gsap.registerPlugin(Flip);
    gsap.ticker.lagSmoothing(0); // a slow frame never makes the next ones jump to catch up (CAE caps dt the same way)
    lib = { gsap, Flip };
    return lib;
  }));
}
export const ready = () => lib;
// the curve GSAP uses here: close to CAE's critically damped spring (starts at full speed, no overshoot)
export const EASE = 'expo.out';
