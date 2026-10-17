// One token source for Plain and Glass (0.9.70, design-system skill). Every value that belongs to one Style lives
// here, side by side for each look it changes in, and nowhere else. tools/tokens/gen.js writes src/tokens.css from it
// (run it after a change; test/tokens.test.js fails when the two differ, or when a token is given to both Styles).
// The owner's rule: Plain and Glass are two separate modes, never merged. A token is Plain's or Glass's, never both.
// Shared tokens (type, space, radius, motion, theme colours) stay in styles.css :root and themes.js.

// Where each look's values go, in cascade order (later wins at the same specificity).
export const LOOKS = [
  { id: 'glass', style: 'glass', sel: 'body.elements-glass', what: 'Glass, dark colours (Cartridge, OLED and your own)' },
  { id: 'glassLight', style: 'glass', sel: 'body.elements-glass.theme-light', what: 'Glass in Light' },
  { id: 'glassFx', style: 'glass', sel: 'body.elements-glass.light-fx', what: 'Glass with Light Effects (no blur, so fills are firmer)' },
  { id: 'glassFxLight', style: 'glass', sel: 'body.elements-glass.light-fx.theme-light', what: 'Glass with Light Effects in Light' },
  { id: 'glassBlur', style: 'glass', sel: 'body.elements-glass:not(.light-fx)', what: 'Glass with blur allowed' },
  // the system's own asks, after the rest so they win
  { id: 'glassClear', style: 'glass', media: '(prefers-reduced-transparency: reduce)', sel: 'body.elements-glass', what: 'Glass when the system asks for less see-through' },
  { id: 'glassContrast', style: 'glass', media: '(prefers-contrast: more)', sel: 'body.elements-glass', what: 'Glass when the system asks for more contrast' },
  { id: 'glassContrastLight', style: 'glass', media: '(prefers-contrast: more)', sel: 'body.elements-glass.theme-light', what: 'Glass in Light when the system asks for more contrast' },
  { id: 'plain', style: 'plain', sel: 'body.style-plain:not(.theme-light):not(.theme-oled)', what: 'Plain, dark colours (Light and OLED have their own rules in styles.css)' },
];

// token: { what, <look id>: value }
export const TOKENS = {
  // 0.9.57 (owner: dark Glass looked grey, not black): nearly black smoke, more of it, so what's behind only tints it
  '--lg-ob': { what: 'the obsidian tint every dark glass fill is mixed from', glass: 'color-mix(in srgb, rgb(var(--lg-tint)) 5%, rgb(4, 5, 8))' },
  '--lg-fill': { what: 'controls: buttons, search, switches, the Dock', glass: 'color-mix(in srgb, var(--lg-ob) 84%, transparent)', glassLight: 'rgba(255, 255, 255, 0.42)', glassFx: 'color-mix(in srgb, var(--lg-ob) 88%, transparent)', glassFxLight: 'rgba(250, 250, 251, 0.88)', glassClear: 'color-mix(in srgb, var(--lg-ob) 94%, transparent)' },
  '--lg-fill-hover': { what: 'a control under the mouse', glass: 'color-mix(in srgb, var(--lg-ob) 92%, transparent)', glassLight: 'rgba(255, 255, 255, 0.62)', glassFx: 'color-mix(in srgb, var(--lg-ob) 94%, transparent)', glassFxLight: '#fff' },
  // sheets and pop-ups: smoked glass so long text reads
  '--lg-pane': { what: 'sheets, pop-ups and toasts', glass: 'color-mix(in srgb, var(--lg-ob) 90%, transparent)', glassLight: 'rgba(250, 250, 251, 0.62)', glassFx: 'color-mix(in srgb, var(--lg-ob) 96%, transparent)', glassFxLight: 'rgba(250, 250, 251, 0.97)', glassClear: 'color-mix(in srgb, var(--lg-ob) 98%, transparent)' },
  '--lg-blur': { what: 'what shows through (backdrop-filter)', glass: 'blur(28px) saturate(1.3) contrast(1.05) brightness(0.85)', glassLight: 'blur(22px) saturate(1.7) brightness(1.04)' },
  '--lg-rim-grad': { what: 'the rim light round a glass piece', glass: 'linear-gradient(var(--lg-angle, 135deg), rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.14) 22%, rgba(255, 255, 255, 0.04) 50%, rgba(0, 0, 0, 0.3) 78%, rgba(0, 0, 0, 0.45) 100%)', glassLight: 'linear-gradient(var(--lg-angle, 135deg), #fff 0%, rgba(255, 255, 255, 0.7) 24%, rgba(0, 0, 0, 0.06) 50%, rgba(255, 255, 255, 0.6) 76%, #fff 100%)', glassContrast: 'linear-gradient(rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.75))', glassContrastLight: 'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5))' },
  '--lg-bevel': { what: 'its thickness: light top edge, dark bottom edge', glass: 'inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 1px 0 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.45), inset -1px 0 0 rgba(0, 0, 0, 0.3)', glassLight: 'inset 0 1px 1px #fff, inset 0 -1px 2px rgba(30, 30, 45, 0.12), inset 0 0 0 3px rgba(255, 255, 255, 0.25)' },
  '--lg-drop': { what: 'contact shadow', glass: '0 4px 8px rgba(0, 0, 0, 0.5)', glassLight: '0 16px 40px -18px rgba(30, 30, 45, 0.32), 0 1px 3px rgba(30, 30, 45, 0.1)' },
  '--lg-drop-deep': { what: 'shadow for the Dock, search, pop-ups, toasts', glass: '0 4px 8px rgba(0, 0, 0, 0.5), 0 20px 40px rgba(0, 0, 0, 0.65)', glassLight: 'var(--lg-drop)' },
  '--lg-gloss': { what: 'the sheen on top', glass: 'linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 40%, rgba(0, 0, 0, 0.25) 100%), linear-gradient(166deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 36%, rgba(255, 255, 255, 0) 36.4%)', glassLight: 'linear-gradient(166deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.2) 36%, rgba(255, 255, 255, 0) 36.4%)' },
  '--lg-grain': { what: 'grain on sheets', glass: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3CfeColorMatrix values=\'0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .5 0\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'.12\'/%3E%3C/svg%3E")' },
  // dark: the highlight colour, solid (0.9.57: 0.88 still read grey over black); Light (0.9.49, owner: black frosted
  // buttons in Light): crisp dark, not a muddy see-through grey
  '--lg-lit': { what: 'focus: the lit piece', glass: 'rgb(var(--lg-hi))', glassLight: 'rgba(var(--lg-hi), 0.96)', glassClear: 'rgb(var(--lg-hi))' },
  '--lg-lit-rim': { what: 'focus rim', glass: 'linear-gradient(var(--lg-angle, 135deg), #fff 0%, rgba(255, 255, 255, 0.55) 30%, rgba(255, 255, 255, 0.3) 55%, rgba(255, 255, 255, 0.9) 100%)', glassLight: 'linear-gradient(var(--lg-angle, 135deg), rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.12) 40%, rgba(255, 255, 255, 0.5))' },
  // 0.9.56 (owner: white shadows moving round whatever is focused in dark Glass): no white halo round focus any more, only a fine edge and the same contact shadow as everything else
  '--lg-lit-glow': { what: 'focus edge and shadow', glass: '0 0 0 1px rgba(255, 255, 255, 0.35), 0 4px 10px rgba(0, 0, 0, 0.5)', glassLight: '0 10px 26px -12px rgba(30, 30, 45, 0.5)' },
  '--lg-on-lit': { what: 'text on a lit piece', glass: 'var(--lg-on-hi)', glassLight: 'var(--lg-on-hi)' },
  // chosen (0.9.58, owner's pick A): a ring in the highlight colour (--sel-ring), as in Plain
  '--lg-sel': { what: 'chosen, not focused', glass: 'var(--sel-bg)', glassLight: 'rgba(255, 255, 255, 0.85)' },
  '--pl-edge': { what: 'hairline round panels and rows', plain: 'inset 0 0 0 1px rgba(255, 255, 255, 0.055)' },
  '--pl-top': { what: 'light top edge', plain: 'inset 0 1px 0 rgba(255, 255, 255, 0.075)' },
  '--pl-raise': { what: 'short soft drop under raised things', plain: '0 1px 2px rgba(0, 0, 0, 0.45), 0 6px 14px -6px rgba(0, 0, 0, 0.4)' },
  '--pl-sink': { what: 'sunk tracks (a switch row)', plain: 'inset 0 1px 3px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.035)' },
  '--chip-bg': { what: 'collection badge', glass: 'rgba(255, 255, 255, 0.14)' },
  '--kb-sleek-bg': { what: 'the welcome\'s keyboard', glass: 'rgba(14, 16, 22, 0.72)' },
  '--chip-blur': { what: 'collection badge blur', glassBlur: 'blur(6px)' },
  '--kb-sleek-blur': { what: 'the welcome\'s keyboard blur', glassBlur: 'blur(28px) saturate(1.3)' },
};
