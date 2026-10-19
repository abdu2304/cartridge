'use strict';
// Interface size (moved out of main.js in 0.9.86 to be tested). The UI is laid out for 1920x1080 (what the Ally shows
// in Game Mode). Bigger windows, like a 4K TV, zoom in by the same ratio so text and art keep their size on screen.
// Smaller windows (Steam Deck 1280x800) stay at 100%, which is what they were designed around; smaller than that
// (0.9.17, a Desktop Mode window) zooms out to fit. A size you pick (scale) wins, but 0.9.86 (PC playtest): never so big
// that Cartridge has less than 1280x800 to lay out in. 2.5, picked for a 4K TV, left a 2560x1440 desktop window
// (KDE at 150%) 1024x576, and Home's rows sat under the Dock.
const step = (z) => Math.round(z * 20) / 20;
function autoZoom(w, h) {
  if (!w || !h) return 1;
  if (w < 1280 || h < 800) return Math.max(0.6, step(Math.min(w / 1280, h / 800)));
  return Math.max(1, Math.min(3, step(Math.min(w / 1920, h / 1080))));
}
function zoomFor(w, h, scale) {
  if (!scale || scale === 'auto') return autoZoom(w, h);
  const want = Math.max(0.75, Math.min(3, Number(scale) || 1));
  if (!w || !h) return want;
  const most = Math.floor(Math.min(w / 1280, h / 800) * 20) / 20; // the biggest zoom that still leaves 1280x800
  return Math.max(Math.min(want, autoZoom(w, h)), Math.min(want, most));
}
module.exports = { autoZoom, zoomFor };
