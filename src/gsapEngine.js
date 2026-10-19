// GSAP, Cartridge's motion engine for everything script moves (0.9.88, owner: "no need to keep GSAP as a test, fully
// commit to it"; it was a test switch from 0.9.70). Its ticker is the one frame loop (motion.js frame()), and GSAP runs
// the card's flight to its page (morph), the tiles moving while Start is arranged (Flip) and the welcome's opening (a
// timeline). CAE (docs/cae.md) stays the rule book: its curves and timings, and focus, presses and page arrivals as
// CSS springs, which the compositor runs, so they don't stutter while the page is busy.
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);
gsap.ticker.lagSmoothing(0); // a slow frame never makes the next ones jump to catch up (CAE caps dt the same way)
export { gsap, Flip };
// the curve GSAP uses here: close to CAE's critically damped spring (starts at full speed, no overshoot)
export const EASE = 'expo.out';
