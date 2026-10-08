# Cartridge design rules

How Cartridge looks and feels, written down so every screen follows the same rules (owner, 6 Oct 2026: "make a rule
set regarding clipping and how things should look, based on what we already have, like the console icons"; "develop
our design system, how the app looks, how it should feel"). This file is the rule book. The values (type sizes, space,
radius, colours) are in `docs/design.md`, motion in `docs/cae.md`, Glass in `docs/glass-engine.md`, logos in
`docs/logos.md`.

**How the rules are kept.** A rule marked **(checked)** fails `npm test` or `npm run audit:ui` when it's broken. The rest
are checked by eye before a release, in the six looks (Plain and Glass, each in the Cartridge colour, Light and OLED),
at 1280x800, 1920x1080 and 3840x2160. When a rule and a request disagree, ask the owner; don't quietly break the rule.

---

## 1. What Cartridge feels like

- **A console menu, not a website.** Calm, quick, heavy. It's used from a sofa with a controller first, then touch,
  then a mouse. Every screen works with all three.
- **The art leads.** Game covers, heroes and logos are the colour on screen. The interface around them is quiet.
- **Nothing surprises you.** Things move a short way and stop. Nothing flashes, jumps, zooms the whole screen, or
  moves on its own fast enough to notice from across the room.
- **You always know where you are.** One thing has focus, it is the brightest thing on screen, and it never looks the
  same as something merely chosen.
- **It never shows its seams.** No cut-off text, no clipped ring, no half picture, no stray control in a preview, no
  page sliding under the Dock without fading.

## 2. Layout

- **Three sizes, all first class:** 1280x800 (handheld), 1920x1080 and 3840x2160 (TV). Nothing is clipped, overlapped
  or unreachable at any of them. Below 1280x800 the app zooms out (`autoZoom`), it never reflows into a phone layout.
- **The Dock** sits at the bottom, centred, as a pill by default. Pages scroll under it and fade out over their last
  56 px; a page's own end has at least 60 px of room so its last row can scroll clear of the fade. A focused item is
  always scrolled at least 120 px from the edge of its scroller (nav.js), so it's never in the fade.
- **No top vignette** when the Dock isn't on top: headers and banners run to the top edge.
- **Grids keep their columns:** up and down stay in a column (`[data-columns]` for masonry, `[data-grid]` across
  separate rows), left and right stay in a row. A move that finds nothing gives one soft bump, never a jump elsewhere.
- **Space on the 4 px grid** (`--s-1` to `--s-8`). Use tokens, not new pixel values.
- **Radius:** small controls `--r-sm`, buttons, rows and cards `--r-md`, panels, sheets and tiles `--r-lg`. A shape
  inside another follows its curve (the inner radius is the outer less the gap).

## 3. Text

- **Two faces:** display (Archivo, wide and bold) for titles and big numbers, Inter for everything else. Numbers that
  change (clocks, counts, percentages) are tabular.
- **Title Case for buttons, menu items, page and section titles** ("Set Up Anyway", "Open Its Website"). Plain
  sentences for explanations. British spelling ("Colour", "Customisation").
- **Short and plain.** No "seamless", no exclamation marks, no "Oops". Say what happened and what to do.
- **No em dashes** anywhere: UI text, notes, commits. Commas, colons, full stops, or "·" in titles. **(checked)**
- **Text wraps, it isn't cut.** No ellipsis on text that matters (names, descriptions, settings). An ellipsis only on a
  single-line control where the full text is elsewhere: keyboard suggestion keys, field values, the dev pill, Start
  overview tags, spine labels. A long text may be clamped to whole lines only where the full text is one press away
  (hold A to expand, `[data-expand]`).

## 4. Clipping (owner: "always look for things that are clipping")

- **Text:** no line is ever cut by its box. **(checked: `tools/ui-audit/clipping.js`, every page, Settings section, the
  game page and every Start widget, with long real-world names, 0 cut texts before a release)**
- **Focus rings and shadows** fit inside their scroller and every clipping box around them. A row inside a list uses a
  fill for focus, not an outside ring (the ring-exemption list in `styles.css`). A card in a scroller gets padding equal
  to its ring and lift. Check by moving focus to the first and last item of every row and grid.
- **Pictures** cover their box or sit inside it; a picture is never cut at an edge it doesn't own. A glyph with a
  shadow gets padding inside its box (`--gp`).
- **Logos** shrink to their box, never past it (see `docs/logos.md`).
- **Previews show only content.** A picture of a page (Start's overview) never shows arrange handles, add buttons or
  size badges.
- **Pop-ups fit the screen** at 1280x800: they scroll inside, never off the bottom. Spotlights and bubbles are clamped
  to the window.
- **Glass blur covers the whole glass piece.** No sharp or shifted strip of the page at a glass edge (0.9.49).

## 5. Colour

- **Neutral chrome, one accent.** Surfaces `--s0` (page) to `--s3` (hover) are neutral; the theme colour marks the main
  action, progress and switches. No gradients on controls.
- **Light:** a light page with dark text and a crisp dark focus. Nothing in Light is a dark frosted block except focus.
  Text on art keeps a scrim and white text in every colour.
- **OLED:** true black panels with fine edges.
- **Contrast:** body text at least 4.5:1, large text and icons 3:1, in every look, focused and not. **(checked:
  `tools/ui-audit/contrast.js` lists texts to look at; each one is either fixed or confirmed by eye)**
- **Status colours:** green for on this device, done and chosen ticks (`.tick-ok`); amber for an update; red for
  danger and errors; gold for ratings. Never decoration.

## 6. Focus and choice

- **Focus is the brightest thing on screen:** a full fill (`--focus`, white in the Cartridge colour, dark in Light) on
  buttons, rows, tabs and menu items, with `--on-focus` text; a ring with a lift on cards and tiles; Glass uses lit
  glass. **(checked: `tools/ui-audit/focus.js`, a focused thing must look different from itself unfocused, six looks)**
- **Chosen is never focus.** Chosen is a softer fill (`--sel`, or brighter glass `--lg-sel`) or a green tick. A chosen
  row that's focused looks focused. A page's own chosen style must not beat the focus style (0.9.49: RomM's chosen row).
- **Focus stays as it is (owner, 0.9.61: "I loved the old selection method").** 0.9.60's glow focus and tinted chosen
  with a bar were tried and taken back: focus is the ring with a lift on cards and tiles and the fill elsewhere, chosen a
  thin ring in the highlight colour. Don't change either without asking.
- **Focus never falls off the page.** If the focused thing disappears, focus goes to the nearest thing on the page
  (`keepFocus`). After a button opens another page, the button that continues the flow keeps focus (the tour).
- **Pointer and touch never show rings;** the controller and keyboard always do.

## 7. Plain and Glass (owner: "never forget this point")

- **Two separate modes, one Style setting.** Plain is solid and matte (edges and light from above, `body.style-plain`,
  `--pl-*`). Glass is see-through (frosted panels, Liquid Glass on controls, the Dock and pop-ups, `body.elements-glass`,
  `--lg-*`). A rule written for one never applies to the other. **(checked: `test/styleModes.test.js`)**
- **Glass is for controls and navigation, never content.** Text-heavy panels stay readable (a tinted sheet), the art
  stays sharp.
- **Every new element is designed twice** and isn't finished until it looks right in both, and in Light and OLED.

## 8. Motion (full rules: `docs/cae.md`)

- **Heavy, not bouncy:** critically damped springs; only presses, toggle knobs and sliding pills get a hint of give.
- **Short distances:** 8 to 24 px. Never across the screen.
- **Nothing moves the whole screen on its own.** No zoom, pan or rotation of a full-screen layer (background art, page
  art, the header picture beyond a small sideways drift). A whole screen slowly zooming reads as moving yourself and
  makes people feel sick (0.9.49). **(checked: no scale change in the background and header drift keyframes)**
- **Idle slows down, it never steps.** Decoration eases to a stop when nobody is using Cartridge; it never drops to a
  visible low frame rate.
- **Spinning and turning is rare and slow:** the disc widget turns once a minute; nothing spins on focus.
- **Reduced motion** turns movement into fades or nothing, everywhere.
- **Transform and opacity only,** one frame loop, interruptible, closing quicker than opening.

## 9. Icons and logos (full rules: `docs/logos.md`)

- **Console wordmarks are sized optically** (`OPTICAL`): the letters line up across consoles, between 1 and 1.8 times
  the box, never past it. **(checked: `test/logos.test.js`)**
- **Maker marks** are the real marks (HVR88, Simple Icons), complete, never a single letter. **(checked)**
- **Sony:** SONY over the PlayStation logo on PS1, PS2, PS3 and PSP; not on PS4 and PS5. RomM's parody marks are
  replaced, RomM's art is never shipped. **(checked)**
- **On a focused row** a logo turns dark on a light focus and white on a dark one.
- **Interface icons** are Material Design Icons at 18 to 24 px beside text, one weight; a section title has none.
- **Emulator icons** come from the emulator itself (Flatpak export, AppImage, its own site), else a neutral gamepad.

## 10. Controls

- **Buttons don't change** without the owner: LT/RT tabs, LB/RB sections, A select, B back, X download or page
  action, Y search or More, Start Quick Menu, Select Downloads.
- **Every slider, list and grid works with the D-pad.** A slider changes with left and right while it has focus.
- **Hints show the buttons of the controller you hold,** only in controller mode; never a key and a button together.
- **Hold A** expands a trailing text; B folds it back first.

## 10b. Speed (owner, 0.9.60: "the whole app feels slower")

- **Nothing heavy on Electron's main thread.** It answers the controller's window, every call and gamescope; a picture
  shrunk there held it 25 to 120 ms (measured), and hundreds of them froze the app. Pictures are shrunk, probed and
  converted in the window's image worker (`src/imageWorker.js`); games' IDs are read in the background a game at a time
  (`gameId` lazy, `ready()`); never `execSync`/`execFileSync` in code that runs on its own (0.9.55).
  **(checked: `test/designRules.test.js` pins the only places left that decode pictures there)**
- **Pictures at the size they're drawn:** covers through `cover(rom)`, other pictures with a width (`img(p, w)`), never
  full size in a card.
- The log says how long the main thread was held up (`main thread: longest stall`), and the Performance overlay shows it.

## 11. A new screen is finished when

1. It follows the sections above in Plain and Glass, in the Cartridge colour, Light and OLED.
2. It works at 1280x800, 1920x1080 and 3840x2160 with a controller, touch and a mouse.
3. `npm test` and `npm run audit:ui` pass (0 focus problems, 0 cut texts, contrast notes looked at).
4. Its words follow section 3.
