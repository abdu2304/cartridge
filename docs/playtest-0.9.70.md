# Controller playtest, 0.9.70

Run after the 0.9.70 update, with the controller's buttons only, as five kinds of player. Driven by
`tools/ui-audit/playtest.js` (about 900 presses a run, every press checked) plus screenshots of each journey in Glass
at 1280x800, read by hand. The same checks can be run again with `node tools/ui-audit/playtest.js`.

What this can't cover: a real pad's feel (stick dead zones, rumble, trigger travel), Game Mode's own overlays, and a
real Steam client. Those need the Deck.

## The players

| Player | What they did |
|---|---|
| First-timer | LT/RT through every tab and back, D-pad round each page |
| Browser | Library, Consoles and Home: open a game, its More sheet, every tab of it, back out with B |
| Tinkerer | Every Settings section, its pages with LB/RB, open a row, close it with B |
| Arranger | Start: hold A, move a tile, size it (X), leave with B |
| Port player | Consoles, Steam card, Recomps, a Cartridge Verified sheet, the port's settings, back out |

## What held up

- Focus never fell to the page (nothing highlighted) in about 900 presses.
- No dead ends: every highlighted thing could be left with the D-pad.
- LT/RT reached every tab; B always got back to a main page within a few presses; every pop-up closed with B.
- Nothing highlighted ended up off screen or under the Dock.
- The Verified sheet and the port settings are fully reachable: Play per game, Settings, More, the tabs with LB/RB.

## Fixed in this update

| What a player hit | Fix |
|---|---|
| A game whose screenshot and cover both fail to load showed the browser's broken-picture icon across the top of its page | The picture hides itself on the second failure (Game.vue) |
| Find a Setting: "Steam + X" broke out of its sentence into a column of its own | The tip is one line of text again (TextPrompt.vue) |
| Settings, Games Folders: the path ran straight into "0 B free of 0 B" | The path has its own line (Settings.vue) |
| "Browse library" on Downloads broke the Title Case rule for buttons | "Browse Library" |
| Verified sheet showed the checked date as 10/17/2026 | Written month in your own language's order ("17 October 2026") |
| Counts of one in the plural ("1 games", "Found 1 emulators", "1 minutes ago") | `plural()` in store.js, used everywhere a count is shown |
| A console card's count was cut off under a long console name; long names spilled off cards with no cover | Card grows to fit; names wrap inside the card |

## What players would like (not changed: your call)

1. **Coverless games show their name twice**, once on the card and once under it. Hide the one under the card when
   there's no cover?
2. **Verified ports use a plain controller icon** on the Recomps page and their sheet. They could show the game's
   cover from your library (they know its IDs) or the project's own picture.
3. **Uncharted's sheet has five buttons in its first row** (three games, Settings, More). One Play button with the game
   chosen by LB/RB would be calmer.
4. **Recomps are three steps deep** (Consoles, Steam card, Recomps). A Start widget or a Library filter "PC Ports" would
   help people find them; the game page already offers "PC Port: <name>".
5. **Quick Menu has a large empty gap** between its actions and Quit on a 1280x800 screen.
6. **Settings' rail is long** on a handheld: see the Settings layouts on the option board.

## Checks run alongside

- `npm run audit:ui` (focus and contrast in all six looks, clipping at 1280x800 and 1920x1080, the tour) and, each on
  its own, `worst.js` (the worst-case library) and `a11y.js`: all clean.
- `node tools/ui-audit/motionBench.js`: CAE against the GSAP test switch.
