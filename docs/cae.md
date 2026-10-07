# CAE, the Cartridge Animation Engine

CAE is how everything in Cartridge moves. It grew out of `src/motion.js` (0.9.37, 0.9.38) and was rebuilt in 0.9.47
when the owner asked for motion that is "smooth and fluid but heavy, so it feels like something for a handheld or a
PC, not a phone app", with performance first and no new bugs. It is our own code: no animation library is loaded
(the owner had trouble with library bugs before, and every library we looked at, anime.js included, adds a second
frame loop and its own timing).

Code: `src/motion.js` (engine), `src/styles.css` (the CSS motion values), `src/nav.js` (scrolling and presses),
`src/glassEngine.js` (Glass light, see `docs/glass-engine.md`).

## The rule set

These are the rules every new motion must follow. If something can't follow them, ask the owner first.

1. **Heavy, not bouncy.** Movement is critically damped (damping 1): it arrives and stops. Only a press let go, a
   toggle's knob and a pill reaching its choice get a hint of give (`spring-pop`, damping 0.86, about 1% overshoot).
   Nothing wobbles, nothing overshoots more than that.
2. **Short distances.** Things move 8 to 24 px, never across the screen. Pages slide 24 px (12 px with a 0.985 scale
   when going deeper, back the other way), toasts 16 px, page content settles 10 px.
3. **Big is slower than small.** Sheets use the heavy curve, pages and everyday movement the settle curve (0.9.56: the
   heavy one made every page change feel slow), going back, presses,
   rings, chips and focus the snap curve. Never a big surface faster than a small one.
4. **Closing is quicker than opening.** Pop-ups open on `--spring` (sheets `--spring-soft`) and leave in 150 ms.
5. **Interruptible.** Every move starts from where the thing is now, with its speed kept. Presses in a row blend;
   nothing snaps back to a start position. Any new input finishes a picture still flying (`skipMorph`).
6. **Transform and opacity only.** No animating width, height, top, left, filters or shadows. A shadow that must
   change fades on a pseudo-element.
7. **One frame loop.** Anything moved by script registers with `frame(fn)`. There is at most one
   `requestAnimationFrame`, it sleeps when nothing moves, and it uses real elapsed time (dt, capped at 50 ms), so a
   slow frame never makes things jump or speed up.
8. **Respect the person.** Reduced motion (the setting or the system's) turns movement into fades or nothing. Light
   effects (no GPU) keep pages to a 160 ms fade, because a moving full page doubled slow frames there (measured).
9. **Plain and Glass are separate.** A motion made for Glass (the liquid morph of pop-ups, the light on the rim)
   never leaks into Plain, and the other way round.
10. **Felt, not just seen.** With Rumble on, a soft tap on the heavy motor when something comes to rest: a Start tile settling into place, a cover landing on its page, the first push against the end of a list (`rumble('settle')`, at most one every 250 ms). Never a buzz while a direction is held.
11. **Quiet while a game runs.** The governor (below) stops nearly everything while a game or another app is in
    front, and everything carries on the moment Cartridge is back. Being idle never stops what you can see (0.9.56).

## The parts

### 0. The ticker
`frame(fn)` runs `fn(now, dt)` every frame until it returns `false`; it returns a stop function. One loop for
everything: the scroll glide, shared-element flights, the Glass light, the Glass frame sampler.

### 1. Spring curves for CSS
`springCurve({ damping, response })` integrates the spring `x'' = -k (x - 1) - c x'` (k = (2π / response)²,
c = 4π ζ / response) and turns it into a CSS `linear()` easing with its natural duration. Since 0.9.56 the critically
damped ones start at their natural speed (v0 = ω, so x = 1 - e^(-ωt)): at full speed from the first frame, never past
the target. Started from rest they eased in, and the owner felt every move as sluggish. `springTo` and the card flight
do the same; springs with give (`spring-pop`, `spring-bounce`) still start from rest. `installSprings()` writes
them as custom properties at start, so CSS uses springs without any script per frame:

| Token | Damping | Response | Used for |
|---|---|---|---|
| `--spring-snappy` | 1 | 0.22 s (276 ms) | presses, focus rings, chips, small things, going back |
| `--spring` | 1 | 0.34 s (392 ms) | most movement, pages, pop-ups opening |
| `--spring-soft` | 1 | 0.46 s (500 ms) | sheets, big surfaces |
| `--spring-pop` | 0.86 | 0.36 s | a press let go, toggle knobs, sliding pills |
| `--spring-bounce` | 0.86 | 0.36 s | after momentum only (a flick) |

Each has a matching `-d` duration token. Engines without `linear()` keep the older cubic curves.

### 1b. Named timings (0.9.52)
Everything that isn't a spring move uses a named timing from `styles.css :root`, so no stylesheet writes its own curve
or duration (the owner asked for every animation to be on CAE; `test/cae.test.js` checks it on every build):

| Token | Value | Used for |
|---|---|---|
| `--fade-in` | 160 ms, ease-out | something appearing, a scrim dimming |
| `--fade-out` | 120 ms, ease-in | something going (closing is quicker than opening) |
| `--fade-slow` | 320 ms, ease-out | a bigger surface appearing |
| `--fade-cross` | 520 ms, ease-in-out | one picture becoming another |
| `--fade-ambient` | 1600 ms, ease-in-out | slow scenery: the idle screen, the clock's sky |
| `--tint` | 140 ms, ease-out | colour, background or shadow changing |
| `--progress` | 300 ms, ease-out | a bar filling |
| `--move-slow` | 900 ms, ease-out | a slow, deliberate move: a gauge needle, a picture settling |
| `--move-ambient` | 1600 ms, ease-out | scenery moving: the sun crossing the clock |
| `--loop-spin` | 1.1 s, linear | things that turn: spinners, rings |
| `--loop-pulse` | 1.2 s, ease-in-out | things that breathe: live bars, a picked handle |
| `--press` | 90 ms | how fast a press goes down (back up on `--spring-pop`) |
| `--stagger` | 40 ms | one row after another |

Allowed as written, with reasons: delays (choreography), scenery loops of 2 s or more and the caret's stepped blink,
0 durations, and the Reduce and Fast motion overrides (settings). Script animations ask `timing('fade-slow')` from
`motion.js`, which reads the same tokens.

### 2. Springs for script
`springTo(state, target, { response, damping, apply, done })` moves a value by script on the ticker, keeping its
velocity when the target changes mid-way. nav.js uses it for scrolling (`glideBy`): holding a direction retargets
the same spring, so the list keeps its speed instead of stopping and starting. `stopSpring` ends one.

### 3. Shared element flights
`morph(fromEl, change, toSel)` flies a picture from where it is (a cover in a grid) to where it lands (the game
page's cover) and back. It reads the target every frame, so it lands where the target really is even while the new
page settles in or a list scrolls (measured: 0 to 4 px off, it was 39 to 52 px before 0.9.45).

### 4. Sliding pills
`slidingPills()` gives every segmented control one fill that slides to the chosen option on `--spring-pop`.

### 5. The governor
Three states, set from input and from main's `background` event:

| State | When | What runs |
|---|---|---|
| active | you're using Cartridge | everything; controller read every 8 ms |
| idle | nothing pressed for 60 s | controller read every 16 ms; nothing on screen stops (0.9.56, owner: the background must keep moving and only stop while a game runs) |
| away | a game or another app is in front, or the window is hidden | CSS animations paused (`body.away`), the background stops drawing, the controller is read 4 times a second |

The animated background also halves its own frame rate when drawing a frame starts costing more than 8 ms (a slow device or a 4K screen). Any input wakes it at once.

A stand-in game (one hashing process per CPU core, 10 s runs, six interleaved pairs) ran 0.5% slower with Cartridge behind it than with Cartridge frozen, inside the runs' own spread (about 4%). Pausing pages under full-screen sheets and dropping image caches while a game runs were left out: there was nothing left to win, and dropped caches would make coming back stutter.

Measured in the real app (software rendering, Aurora, Glass): about 6.7% of one CPU core in use with nothing pressed, 3.3% idle, 2.1% with a game in front; about 550 MB across all of Electron's processes. In the main process, the Game Mode focus watcher checks every 1.5 s instead of 0.6 s
while another app is in front, and the trophy service skips 3 of every 4 checks while a game runs.

### The scheduler's game rule
Since 0.9.48 the library sync, the Steam collections check, the BIOS check and the picture cache trim run on
`electron/scheduler.js`: anything due while a game runs waits and runs once the game has ended. Downloads are not
on it and keep going (owner).

## Checking a change

- `npm run audit:ui` (focus and contrast in Plain and Glass, three colours; see `tools/ui-audit/README.md`).
- Watch the move in Plain and Glass, with and without light effects, and with reduced motion.
- With the CPU throttled (Chromium DevTools, 4x), no frame should take longer than before the change.
