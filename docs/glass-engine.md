# The Glass engine

Glass is one of Cartridge's two Styles (Settings → Look & Feel → Theme → Style). Plain and Glass are designed
separately and never mixed (owner, 6 Oct 2026). This page is about Glass only.

In 0.9.47 the owner asked for Glass to be rebuilt with the `liquid-glass-design` skill (affaan-m/everything-claude-code,
MIT): real refraction instead of only a blur, a lens that is thicker in the middle and tapers at the rim, a light that
catches the rim, pop-ups that grow out of what opened them, and a step down to plain frosted glass when frames get
slow. Both dark colours and Light.

Code: `src/glassEngine.js` (the engine), the end of `src/styles.css` (Liquid Glass block and "Glass engine"),
`src/themes.js` (`--glass-bg`, `--lg-*` tokens).

## What it does

**Refraction.** Each glass surface (the Dock, search, pop-ups and sheets, toasts, the game page's buttons over its
art) gets an SVG filter as its `backdrop-filter`:

```
feGaussianBlur (frost) -> feImage (lens map) -> feDisplacementMap -> feColorMatrix (saturate) -> contrast
```

The tone depends on the theme (0.9.54): dark glass saturates 1.45 and adds 5% contrast, so game art stays rich under smoked glass without turning loud; Light keeps saturate 1.6. Each piece's filter key carries the tone, and a theme change rebuilds them. Dark glass itself is smoked obsidian (near-black with 9% of the chosen colour, 72% fill, 80% on sheets, no brightening of the backdrop), shaped by its edges: the moving rim light fading to a dark line on the far side, a light bevel top-left and a dark one bottom-right, a faint top-down sheen, a contact shadow on controls and a deep one on floating pieces.

The lens map is drawn once per size on a canvas at half resolution: a rounded rectangle's signed distance field;
inside the bezel the surface curves down to the rim like a quarter circle, and the slope of that curve sets how far
the view behind is pulled (Snell's law at small angles: the offset follows the surface slope). The middle stays calm,
the rim magnifies what is behind it. Red and green hold the x and y offsets (128 means none).

| Surface | Frost | Bezel | Strength |
|---|---|---|---|
| Pop-ups and sheets | 14 | up to 26 px | 34 |
| Dock | 7 | up to 18 px | up to 44 |
| Search, toasts, buttons | 5 | up to 18 px | up to 44 |

Big sheets frost more so text on them reads; controls refract more, as the skill's controls-and-navigation glass does.

**Light.** The rim's highlight (`--lg-rim-grad`, `--lg-lit-rim`) is a gradient at `--lg-angle`. The engine turns it
towards the mouse pointer, or towards the focused thing when using a controller, so edges catch the light as you
move. It only writes the property when the angle changes by 4 degrees or more.

**Liquid morph.** In Glass only, pop-ups grow out of the button that opened them (scale 0.9 from the trigger's
position on `--spring-soft`). Plain keeps its own arrival.

**Cost.** Nothing runs per frame. A filter is made once per size (rounded to 8 px) and kept, at most 32 (least
recently used goes first). New glass is found by a MutationObserver and resized by a ResizeObserver.

**Step down.** When a page or pop-up arrives, or once every 5 s while scrolling, the engine times 40 frames. If they
average over 20 ms (under 50 a second), `body.lg-lite` turns refraction off for a minute and the surfaces fall back
to frosted glass, then it tries again.

**Off** in Plain, with light effects (no GPU), with reduced motion, and with reduced transparency (the system's
setting), where the surfaces become solid.

## Rules for Glass

From the liquid-glass skills, adapted to CSS:

- Glass is for controls and navigation (Dock, search, buttons, pop-ups), never for content. Cards, rows and text
  blocks stay solid or tinted panels (`--glass-bg`).
- The chosen option is not the focus. Chosen uses `--lg-sel` (a lit glass fill); focus uses `--lg-lit` and the ring.
- Light keeps its own values: lighter panels (`rgba(250, 250, 251, 0.72)`), dark text, a darker primary button.
- Every new glass element is checked in dark, Light and OLED, and next to its Plain version.
