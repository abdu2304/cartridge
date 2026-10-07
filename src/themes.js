// Look & Feel: colour themes, surfaces, text, fonts, cards and motion.
// Everything is applied as CSS variables and body classes, so switching is instant and costs nothing.

// ---------------- colour
export const hex2rgb = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgb2hex(f(0) * 255, f(8) * 255, f(4) * 255);
}
// A whole theme from one accent colour: accent shades, a warm second colour and the background
// gradient, all in the same family.
export function themeFrom(accent, label = 'Custom') {
  const [h, s0, l0] = rgb2hsl(...hex2rgb(accent));
  const s = Math.max(0.12, s0), grey = s0 < 0.12;
  const bgS = grey ? 0.08 : Math.min(0.75, s * 0.85);
  return {
    label,
    accent: [hsl(h, s, Math.max(0.5, Math.min(0.68, l0))), hsl(h, s, 0.76), hsl(h, s, 0.42)],
    warm: grey ? '#e6e8ee' : hsl(h + 40, Math.min(1, s + 0.1), 0.75),
    grad: [hsl(h + 12, bgS, 0.66), hsl(h, bgS, 0.42), hsl(h - 4, bgS, 0.32), hsl(h - 8, bgS, 0.2), hsl(h - 10, bgS, 0.11), hsl(h + 6, bgS, 0.26)],
  };
}
export const THEMES = {
  // Cartridge's own: white on neutral greys (the default since 0.9; white highlights, buttons and bars since 0.9.2)
  cartridge: { label: 'Cartridge', grad: ['#3a3d44', '#1c1e23', '#15171b', '#101114', '#0b0c0e', '#1a1c20'], accent: ['#ffffff', '#ffffff', '#d4d4d8'], bgAccent: ['#ef4b23', '#ff7a55'], warm: '#ffb35c', neutral: true },
  purple: { label: 'Purple', grad: ['#b16cf0', '#6a2fc2', '#4a1b92', '#2b0f5e', '#170838', '#3a1170'], accent: ['#8b74e8', '#a18fff', '#6043c8'], warm: '#e1a38d' },
  blue: { label: 'Blue', grad: ['#6fb2ff', '#2f5fd0', '#1f3f9e', '#122768', '#0a1538', '#16307a'], accent: ['#5b8cff', '#8fb1ff', '#3561d6'], warm: '#8fe3ff' },
  red: { label: 'Red', grad: ['#ff7a6b', '#c2302f', '#921c28', '#5e0f1a', '#33070d', '#701223'], accent: ['#f0616a', '#ff8f95', '#c23a44'], warm: '#ffc48f' },
  green: { label: 'Green', grad: ['#7fe3a1', '#2c9c5e', '#1c7445', '#0f4a2c', '#072a18', '#135233'], accent: ['#45c77f', '#7fe3a6', '#26955a'], warm: '#d8f58f' },
  orange: { label: 'Orange', grad: ['#ffb36b', '#d9701f', '#a84d14', '#6b2f0b', '#3a1805', '#7a3810'], accent: ['#f59440', '#ffb877', '#c86a1f'], warm: '#ffe08f' },
  pink: { label: 'Pink', grad: ['#ff8fd4', '#c93a95', '#95226f', '#5e1247', '#330826', '#6e1553'], accent: ['#ee6ab8', '#ff9ad2', '#bd3c8b'], warm: '#ffc0e4' },
  teal: { label: 'Teal', grad: ['#6fe8e0', '#1f9e9a', '#157472', '#0c4a4a', '#052828', '#0f5555'], accent: ['#3cc9c2', '#79e6e0', '#1f9690'], warm: '#b0f5d8' },
  midnight: { label: 'Midnight', grad: ['#5a5f7a', '#262a3a', '#1a1d29', '#11131b', '#08090d', '#1b1e2b'], accent: ['#8b74e8', '#a18fff', '#6043c8'], warm: '#e1a38d' },
  gold: themeFrom('#e8b43a', 'Gold'),
  crimson: themeFrom('#d6284b', 'Crimson'),
  lime: themeFrom('#9bd33c', 'Lime'),
  sky: themeFrom('#3fb6f0', 'Sky'),
  lavender: themeFrom('#b89cf5', 'Lavender'),
  graphite: themeFrom('#9aa3b2', 'Graphite'),
  // 0.9.38 (owner): OLED, pure black behind everything with Cartridge's neutral panels; Light, an off-white page
  // (never paper white, it glares on a TV at night) with dark text, a dark highlight and backgrounds drawn in dark ink
  oled: { label: 'OLED', grad: ['#121214', '#000000', '#000000', '#000000', '#000000', '#000000'], accent: ['#ffffff', '#ffffff', '#d4d4d8'], bgAccent: ['#ef4b23', '#ff7a55'], warm: '#ffb35c', neutral: true, black: true, oled: true },
  light: { label: 'Light', grad: ['#fbfbfc', '#f0f0f3', '#e9e9ed', '#dedee4', '#d4d4db', '#f2f2f5'], accent: ['#1c1c1e', '#3a3a3f', '#000000'], bgAccent: ['#d8401c', '#ef6a45'], warm: '#b8651a', neutral: true, light: true },
};
// Swatches for the custom colour picker: 12 hues x 3 shades, plus greys
export const CUSTOM_SWATCHES = [
  ...[0.62, 0.5, 0.4].flatMap((l) => Array.from({ length: 12 }, (_, i) => hsl(i * 30, 0.72, l))),
  '#e6e8ee', '#9aa3b2', '#5a6273',
];

// Background (ui.surface, 0.9.37 renamed from Panels): the page behind everything. Glass is a darker page that lets
// the animated background through. OLED Black moved to the OLED colour (0.9.41, owner).
export const SURFACES = {
  solid: { label: 'Solid', glassA: 1, bg: '#0c0d10' },
  glass: { label: 'Glass', glassA: 0.62, bg: '#06070b' },
};
// Elements (ui.elements, 0.9.37, owner: panels set apart from the background): cards, panels, buttons and the
// highlight. Unset follows the Background picked before 0.9.37 (Panels did both).
// 0.9.42 (owner: build Glass with the liquid-glass skill and only that): Liquid Glass is a material for the
// navigation and control layer (the Dock, buttons, switches, sheets, toasts, search) floating over the content,
// never for the content itself, so cards, rows and panels stay solid in Glass too (glassA 1). The material is in
// styles.css (body.elements-glass, the --lg-* tokens set below).
export const ELEMENTS = {
  plain: { label: 'Plain', glassA: 1 },
  // 0.9.44 (owner, photos of 0.9.37: the solid near-black panels didn't sit well): cards and panels are see-through again,
  // grey over the background as before; the Liquid Glass material stays on controls, the Dock and pop-ups
  glass: { label: 'Glass', glassA: 0.62, glass: true },
};
// 0.9.45 (owner: "two different UI elements, glass and plain, don't merge them; one Plain mode and one Glass mode
// across the board"): one Style setting (ui.style) sets the page, the elements and the Dock together. Plain is solid
// and matte (styles.css body.style-plain); Glass is the see-through page, frosted panels and the Liquid Glass controls
// (body.elements-glass). Every new element is designed for both. Saves from before 0.9.45 carry over: Glass in
// either the old Background or Elements setting means Glass.
export const STYLES = { plain: { label: 'Plain', sub: 'Solid and matte: crisp panels, clear edges, nothing see-through' }, glass: { label: 'Glass', sub: 'See-through: frosted panels over the background, glass buttons, switches and Dock' } };
export const styleOf = (ui) => (STYLES[ui?.style] ? ui.style : ui?.elements === 'glass' || (!ui?.elements && ui?.surface === 'glass') ? 'glass' : 'plain');
export const elementsOf = styleOf;
// the Dock: glass in Glass; in Plain the colour picked (Black, White or Accent), else white with Light and black
export const DOCK_PLAIN = ['black', 'white', 'accent'];
export const dockOf = (ui) => (styleOf(ui) === 'glass' ? 'glass' : DOCK_PLAIN.includes(ui?.dockColor) ? ui.dockColor : ui?.theme === 'light' ? 'white' : 'black');
export const TEXTS = {
  // three clearly different sets (0.9.3): High contrast lifts the secondary text right up, Soft is
  // dimmer and slightly warm for dark rooms
  normal: { label: 'Standard', text: '#f4f4f5', muted: '#a4a6ad', dim: '#6c6f77' },
  bright: { label: 'High Contrast', text: '#ffffff', muted: '#e6e7eb', dim: '#b9bcc4' },
  soft: { label: 'Soft', text: '#cfccc6', muted: '#8a8781', dim: '#5a5853' },
};
// the same three on the Light theme (0.9.38): dark ink on the off-white page
// 0.9.41 rebuilt (owner: "light looks off, cards look off"): the way light interfaces are layered. A soft grey page
// (never paper white), cards and panels nearly white and raised with a soft shadow, controls inside them a light grey,
// dark text in Apple's light greys, the highlight near-black with white text
const LIGHT_TEXTS = { normal: { text: '#1c1c1e', muted: '#6b6b73', dim: '#9a9aa2' }, bright: { text: '#000000', muted: '#3c3c43', dim: '#6b6b73' }, soft: { text: '#3a3a3c', muted: '#7c7c84', dim: '#a5a5ad' } };
// 0.9.56 (owner: Light cards blended into the page): a deeper page and pure white cards
const LIGHT_S = ['#e3e3e9', '#ffffff', '#e8e8ed', '#d4d4db']; // page, cards (raised: lighter), controls, pressed/borders
// Bundled open-source fonts (SIL Open Font License), display + body
export const FONTS = {
  cartridge: { label: 'Archivo + Inter', display: "'Archivo Variable', 'Inter Variable', Roboto, sans-serif", body: "'Inter Variable', Roboto, 'Noto Sans', system-ui, sans-serif" },
  outfit: { label: 'Outfit', display: "'Outfit Variable', 'Outfit', Roboto, sans-serif", body: "Roboto, 'Noto Sans', system-ui, sans-serif" },
  inter: { label: 'Inter', display: "'Inter Variable', Roboto, sans-serif", body: "'Inter Variable', Roboto, sans-serif" },
  nunito: { label: 'Nunito', display: "'Nunito Variable', Roboto, sans-serif", body: "'Nunito Variable', Roboto, sans-serif" },
  rubik: { label: 'Rubik', display: "'Rubik Variable', Roboto, sans-serif", body: "'Rubik Variable', Roboto, sans-serif" },
  grotesk: { label: 'Space Grotesk', display: "'Space Grotesk Variable', Roboto, sans-serif", body: "Roboto, 'Noto Sans', system-ui, sans-serif" },
  lexend: { label: 'Lexend', display: "'Lexend Variable', Roboto, sans-serif", body: "'Lexend Variable', Roboto, sans-serif" },
};
export const CARD_SHAPES = { rounded: { label: 'Rounded', r: '6px' }, square: { label: 'Square', r: '2px' }, soft: { label: 'Soft', r: '14px' }, round: { label: 'Extra Round', r: '22px' } };
export const CARD_SIZES = { sm: { label: 'Small', w: '128px' }, md: { label: 'Medium', w: '152px' }, lg: { label: 'Large', w: '184px' }, xl: { label: 'Huge', w: '220px' } };
export const DENSITIES = { compact: { label: 'Compact', x: '12px', y: '14px' }, normal: { label: 'Normal', x: '18px', y: '22px' }, spacious: { label: 'Spacious', x: '28px', y: '34px' } };

// Highlights, Buttons and Progress Bars set by picking a colour (0.9.56, owner): Light sets them to black, OLED to white,
// and leaving either puts back the theme's own, unless you changed them since (ui.colorsAuto says which set them)
export const AUTO_PARTS = ['highlight', 'buttons', 'bars'];
export const PURE = { black: '#000000', white: '#ffffff' };
export function autoColors(key, ui = {}) {
  const want = THEMES[key]?.light ? PURE.black : key === 'oled' ? PURE.white : '';
  const col = ui.colors || {}, was = ui.colorsAuto ? PURE[ui.colorsAuto] : '';
  const out = {};
  for (const k of AUTO_PARTS) if (want) out[k] = want; else if (was && col[k] === was) out[k] = '';
  return { colors: out, colorsAuto: want ? (want === PURE.black ? 'black' : 'white') : '' };
}

export function themeOf(ui) {
  if (ui?.theme === 'custom' && /^#[0-9a-f]{6}$/i.test(ui.customColor || '')) return themeFrom(ui.customColor);
  return THEMES[ui?.theme] || THEMES.cartridge;
}

export function applyTheme(uiOrName) {
  const ui = typeof uiOrName === 'string' ? { theme: uiOrName } : uiOrName || {};
  const col = ui.colors || {};
  const ok = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  let t = themeOf(ui);
  // fine-tuned colours on top of the theme: background, highlights, buttons and bars
  if (ok(col.background)) t = { ...t, grad: themeFrom(col.background).grad };
  const r = document.documentElement.style;
  const lum = (h) => { const [x, y, z] = hex2rgb(h); return (0.299 * x + 0.587 * y + 0.114 * z) / 255; };
  // themeFrom turns white into grey (it clamps lightness), so near-white picks stay white
  // ...and pure black stays black (0.9.56, owner's Pure Black)
  const accentOf = (c) => lum(c) > 0.85 ? [c, c, '#d4d4d8'] : lum(c) < 0.06 ? [c, '#2a2a2e', c] : themeFrom(c).accent;
  const [a, al, ad] = ok(col.highlight) ? accentOf(col.highlight) : t.accent;
  if (ok(col.buttons)) {
    const [b, bl, bd] = accentOf(col.buttons);
    r.setProperty('--btn', `linear-gradient(120deg, ${bl} 0%, ${b} 55%, ${bd} 100%)`);
    r.setProperty('--on-btn', lum(b) > 0.6 ? '#141018' : '#ffffff');
  } else { r.removeProperty('--btn'); r.removeProperty('--on-btn'); }
  if (ok(col.bars)) { const [b, bl] = accentOf(col.bars); r.setProperty('--bar', `linear-gradient(90deg, ${b}, ${bl})`); }
  else r.removeProperty('--bar');
  document.body.classList.toggle('custom-bars', ok(col.bars));
  // Light has its own page and panels: Background's Glass doesn't apply to it (0.9.41: Light with Glass went black)
  const style = styleOf(ui);
  const surf = (themeOf(ui).light ? null : SURFACES[style === 'glass' ? 'glass' : 'solid']) || SURFACES.solid;
  const el = ELEMENTS[style] || ELEMENTS.plain;
  const lightT = !!t.light, black = !!(surf.black || t.black);
  const tx = lightT ? LIGHT_TEXTS[ui.text] || LIGHT_TEXTS.normal : TEXTS[ui.text] || TEXTS.normal;
  const g = t.grad;
  const rgb = (h) => hex2rgb(h).join(', ');
  const [th, ts] = rgb2hsl(...hex2rgb(g[3]));
  const tint = hex2rgb(hsl(th, Math.min(0.7, ts), 0.1)).join(', ');
  const ah = rgb2hsl(...hex2rgb(a))[0];
  r.setProperty('--primary', a);
  r.setProperty('--primary-l', al);
  r.setProperty('--primary-d', ad);
  r.setProperty('--primary-rgb', rgb(a));
  r.setProperty('--primary-l-rgb', rgb(al));
  const light = lum(a) > 0.75;
  r.setProperty('--primary-t', lightT ? a : light ? '#ffffff' : hsl(ah, 0.9, 0.86));
  r.setProperty('--on-primary', lightT && !light ? '#fafafb' : light ? '#0c0d10' : hsl(ah, 0.5, 0.1));
  r.setProperty('--knob', light ? '#0c0d10' : '#ffffff');
  r.setProperty('--peach', t.warm);
  // 0.9: one flat accent, no gradients. Focus (where you are) is white, or the Highlights colour
  // when one is picked, with text that reads on it (0.9.2)
  const fo = ok(col.highlight) ? a : lightT ? '#1c1c1e' : '#ffffff', foLight = lum(fo) > 0.6;
  r.setProperty('--grad', `linear-gradient(${a}, ${a})`);
  // focus is solid in both (0.9.42): in Glass a focused control becomes prominent glass of this colour (--lg-hi)
  r.setProperty('--focus', fo);
  r.setProperty('--focus-solid', fo);
  r.setProperty('--on-focus', foLight ? '#0c0d10' : lightT ? '#fafafb' : '#ffffff');
  r.setProperty('--on-focus-dim', foLight ? 'rgba(12, 13, 16, 0.7)' : lightT ? 'rgba(250, 250, 251, 0.72)' : 'rgba(255, 255, 255, 0.75)');
  r.setProperty('--ring', `0 0 0 3px var(--s0), 0 0 0 6px ${fo}`);
  r.setProperty('--ring-soft', `0 0 0 2px ${fo}`);
  // surfaces: neutral greys, tinted a little towards the theme for the coloured themes
  const sh = rgb2hsl(...hex2rgb(g[2])), ss = t.neutral ? 0 : Math.min(0.16, sh[1] * 0.25);
  // the page (s0) follows Background, the panels (s1 to s3) follow Elements (0.9.37)
  const pageL = black ? 0 : 0.05, elL = el.black ? [0.055, 0.09, 0.14] : [0.085, 0.12, 0.165];
  const S = lightT ? [...LIGHT_S] : [pageL, ...elL].map((l) => hsl(sh[0], ss, l));
  if (surf.bg && !black && !lightT && surf.glassA < 1) S[0] = surf.bg;
  // OLED (0.9.41, owner: "no difference from Cartridge"): black panels too, set apart by a fine edge (body.theme-oled)
  if (t.oled) { S[1] = '#000000'; S[2] = '#101012'; S[3] = '#1c1c1f'; }
  // chosen but not where you are (0.9.2: a fill, never stripes). 0.9.57 (owner: the grey highlights "look like absolute
  // shit"): in the dark looks the chosen fill is your highlight colour, solid, with its own text colour (--on-sel), the
  // same as focus; focus adds its ring. Light keeps its soft grey, which reads as chosen on a light page.
  r.setProperty('--sel', lightT ? '#d1d1d8' : fo);
  r.setProperty('--on-sel', lightT ? tx.text : foLight ? '#0c0d10' : '#ffffff');
  r.setProperty('--on-sel-dim', lightT ? tx.muted : foLight ? 'rgba(12, 13, 16, 0.66)' : 'rgba(255, 255, 255, 0.78)');
  // 0.9.57 (owner: dark Glass looked grey): dark Glass panels are mostly solid, so the page behind only tints them
  const ga = el.glassA < 1 && !lightT ? Math.max(el.glassA, 0.86) : el.glassA;
  S.forEach((c, i) => r.setProperty('--s' + i, ga < 1 && i ? `rgba(${rgb(c)}, ${ga})` : c));
  r.setProperty('--xmb', `radial-gradient(120% 90% at 85% 0%, ${g[0]} 0%, transparent 55%), radial-gradient(90% 80% at 0% 100%, ${g[5]} 0%, transparent 60%), linear-gradient(160deg, ${g[1]} 0%, ${g[2]} 38%, ${g[3]} 70%, ${g[4]} 100%)`);
  r.setProperty('--xmb-base', black ? '#000' : g[4]);
  // Cartridge's own theme: a flat page, so art and panels meet it without a seam
  if (t.neutral) { r.setProperty('--xmb', black ? '#000' : S[0]); r.setProperty('--xmb-base', black ? '#000' : S[0]); }
  for (let i = 0; i < 6; i++) r.setProperty('--g' + i, g[i]);
  r.setProperty('--tint-rgb', black ? '0, 0, 0' : lightT ? '227, 227, 233' : tint);
  // Light (0.9.47): white frosted panels; the dark tint made grey slabs with unreadable text in Light + Glass
  r.setProperty('--glass-bg', el.glassA < 1 ? `rgba(${lightT ? '255, 255, 255' : black || t.oled ? '0, 0, 0' : tint}, ${lightT ? 0.84 : ga})` : S[1]);
  // Liquid Glass tokens (0.9.42): the material's tint (the theme's hue, white glass on Light, black on OLED) and the
  // prominent colour (the highlight) for focused controls and primary buttons
  r.setProperty('--lg-tint', lightT ? '255, 255, 255' : black || t.oled ? '0, 0, 0' : tint);
  r.setProperty('--lg-hi', rgb(fo));
  r.setProperty('--lg-on-hi', foLight ? '#0c0d10' : '#ffffff');
  r.setProperty('--bg', black ? '#000' : S[0]);
  r.setProperty('--text', tx.text);
  r.setProperty('--muted', tx.muted);
  r.setProperty('--dim', tx.dim);
  const f = FONTS[ui.font] || FONTS.cartridge;
  r.setProperty('--display', f.display);
  r.setProperty('--body', f.body);
  r.setProperty('--card-r', (CARD_SHAPES[ui.cardShape] || CARD_SHAPES.rounded).r);
  const d = DENSITIES[ui.density] || DENSITIES.normal;
  r.setProperty('--gap-x', d.x);
  r.setProperty('--gap-y', d.y);
  const b = document.body.classList;
  b.toggle('motion-fast', ui.motion === 'fast');
  b.toggle('motion-reduce', ui.motion === 'reduce');
  b.toggle('surface-oled', !!black);
  b.toggle('surface-glass', surf.glassA < 1 && !black);
  b.toggle('elements-glass', !!el.glass);
  b.toggle('style-plain', !el.glass); // Plain's own look (styles.css), never mixed with Glass
  b.toggle('elements-oled', false);
  b.toggle('focus-light', foLight); // glass sheen strength
  b.toggle('theme-light', lightT);
  b.toggle('theme-oled', !!t.oled);
  document.documentElement.style.colorScheme = lightT ? 'light' : 'dark'; // scrollbars and form controls
  b.toggle('no-titles', ui.cardTitles === false);
}
// Colours the animated backgrounds draw with
export function paletteOf(ui) {
  let t = themeOf(ui);
  if (/^#[0-9a-f]{6}$/i.test(ui?.colors?.background || '')) t = { ...t, grad: themeFrom(ui.colors.background).grad };
  // animated backgrounds keep the brand colour when the highlights are plain white, or pure black or white (0.9.56)
  const hl = String(ui?.colors?.highlight || '').toLowerCase(), plainHl = !hl || hl === PURE.black || hl === PURE.white;
  if (!plainHl && /^#[0-9a-f]{6}$/i.test(hl)) t = { ...t, accent: themeFrom(hl).accent };
  const [pa, pl] = plainHl && t.bgAccent ? t.bgAccent : t.accent;
  return { accent: pa, light: pl, warm: t.warm, grad: t.grad, black: !!t.black, ink: t.light ? '24,25,29' : '' };
}
// "Light effects" when the GPU is off (software rendering), unless the user picked otherwise
export function lightEffects(ui, info) {
  const e = ui?.effects || 'auto';
  return e === 'light' || (e === 'auto' && info?.gpu === false);
}
