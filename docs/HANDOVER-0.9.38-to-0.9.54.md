> **Read first (owner, 6 Oct 2026):** Plain and Glass are two separate modes, never merged. One Style setting (Plain or Glass) covers the whole app; design every element for both, and never let a change for one leak into the other. Details in CLAUDE.md.

# Handover: everything from 0.9.38 to 0.9.54

To the Claude on the next account, from the Claude on this one.

Two handovers come before this one: `docs/HANDOVER-0.9.3-to-0.9.21.md` and `docs/HANDOVER-0.9.22-to-0.9.37.md`. Everything in them about the owner, the process and the do-not-break rules still holds unless this document says otherwise. This one picks up at 0.9.38 (5 October 2026) and runs to 0.9.54 (7 October 2026): **17 releases** (0.9.41 was built but its release never ran; it shipped inside 0.9.42). It tells you what changed, why, what broke and how it was fixed, how the owner worked with me, how I tested without a device, and what is still open.

Read in this order:
1. This document, once, top to bottom.
2. `CLAUDE.md`: its sections "0.9.38" to "0.9.54" are the short technical notes per version, with function names. They are the index into the code.
3. `docs/SESSION-LOG.md`, newest entry first: the per-update diary with the owner's words and what they must test.
4. `docs/design-rules.md` before any UI change, `docs/cae.md` before any motion change, `docs/glass-engine.md` before any Glass change, `docs/architecture.md` for the engine map.
5. `CHANGELOG.md` for the exact user-facing wording.

The repo is public. Nothing private is in this document. Keep it that way.

---

## Part 1. Where things stand right now

- **Latest release:** v0.9.54 "Cartridge 0.9.54 · Obsidian Glass" (7 Oct 2026). PR #70 was 0.9.53; 0.9.54 is the PR after it.
- **Branch:** all work on `claude/relaxed-fermat-30pigp`, merged into `main` by PR for every release. Before new work, bring the branch level with `main` (`git fetch origin main && git merge origin/main`, or reset it to `main` if it carries nothing unmerged).
- **package.json:** `version` = `versionName` = 0.9.54, `releaseName` "Cartridge 0.9.54". The lockfile's version field is stale (0.9.6) and always was; leave it.
- **Tests:** 258 pass (`npm test`). New test files in this stretch include cideSteam (with a golden fixture), web, modEngine, modRules, romPatch, firmware, cae, designRules, styleModes, gameId, scheduler, emuProfiles, cee, logos, saveSync, cide, rommLocal, flatpak, gifSearch.
- **Audits before every release:** `npm run audit:ui` (focus, contrast, clipping, the tour in both keyboard modes). All zero at 0.9.54.
- **Launch check:** `CARTRIDGE_SMOKE=1 xvfb-run -a node_modules/electron/dist/electron . --no-sandbox` printed `SMOKE OK` in this container every time.

The owner's last requests and their state:
1. **Dark Glass looked like milky grey plastic:** rebuilt as smoked obsidian in 0.9.54 (Part 6.9). The owner saw before/after pictures and asked for "a tiny bit darker without losing the glass look"; that is what shipped. Light Glass was not touched (the owner likes it).
2. **This handover.** The owner is moving back to the other account.
3. **Waiting on the owner (do these when they ask or confirm):** set `docs/social-preview.png` as the GitHub social preview by hand (Settings → General → Social preview); press Settings → Steam → Add to Steam once so Cartridge's own Steam entry gets the new artwork.

---

## Part 2. The owner: how they worked with me (additions)

Everything in the earlier handovers still applies (dictation, photos, short messages, "don't build yet" means answer only, release when finished). New in this stretch:

- **"Read everything I sent in between and put it in this update."** Messages arrive while you build. Fold every one into the current update unless it says otherwise. Several updates (0.9.47, 0.9.49, 0.9.52) are "one update for everything sent".
- **Design choices are the owner's.** Show 2 or 3 options as pictures (boards rendered in Chromium and sent with SendUserFile), let them pick, then build. They picked: Game Shelf B (Display case), brand B (Marquee), README layout Showcase. When they say "do what you recommend", build the recommendation and say what you chose.
- **Design skills only when asked, and then really use them.** The brand round 1 was rejected as "AI slop"; round 2 was made with impeccable (it needs `PRODUCT.md`, now in the repo, and its `concept-seed` script) plus taste-skill. Say which skill you used.
- **Credentials.** The owner shared their RomM login, SteamGridDB key, RetroAchievements key and Nexus key in chat for the README pictures and tests. The rule they set: nothing traceable in GitHub or the code. I kept them only in the session's scratch folder, used a read-only RomM token that expires in 30 minutes, swapped every private detail out of pictures (server shown as `romm.local`, user "player", no avatar, no name in the greeting), deleted everything afterwards, and grepped every diff for their server name, username and key fragments before pushing. Do the same if they share again; never write them to the repo, tests, logs or engines.
- **Turned down for good (don't offer again):** Ryujinx saves, PSN sign-in, pausing Syncthing while playing, more languages, PS3 mods, 2.5D tilt, squash and stretch, end-of-list bounce. Plugins ponytail, graphify, rtk: not wanted.
- **Confirmed working on device by the owner:** the clock speed-up fix, PS3 serial reading, controller after a game, Steam collection renames.
- **Wants honest answers.** "Does this prompt make sense or is it gibberish?" deserves a real assessment with what you'd change, not agreement.

---

## Part 3. Process and tooling

- **Electron runs in the container** (as in the previous stretch): the launch check and Playwright's `_electron` work.
- **UI audits are in the repo** (`tools/ui-audit/`, `npm run audit:ui`): focus (pixel diff in six looks), contrast (reads `color(srgb ...)`; skips text over pictures, which means you must eyeball text on art yourself: it missed dark console names in Light until 0.9.53), clipping (every page, Settings section and Start widget at 1280x800 and 1920x1080 with long real-world text), the tour. `npm run audit:visual` compares 10 screens x 6 looks with the last release.
- **The harness** (`tools/ui-audit/harness.js`) stubs `window.cart`. `open()` takes `theme, style, bg, width, height, ui, long, touch, freeze, dist` and, since 0.9.52, `extra` (top-level config), `lib` (a real library), `answers` (channel answers), `routes` (serve pictures from disk), `init` (a page script before the app). The README pictures used all of them; Part 6.10.
- **Brand assets** come from `tools/brand/gen.js` (needs `npx vite build` first for the font). Never hand-edit the PNGs.
- **Tests that pin behaviour you must not change silently:** `cideSteam` (Steam shortcut output byte for byte), `emuProfiles` (each emulator's facts, update EXPECT on purpose), `cae` (no hand-written timings), `designRules` (no em dashes, no ellipsis outside the allowed list), `styleModes` (Glass tokens only under Glass, Plain only under Plain).
- **GitHub:** create the PR and merge it with the GitHub MCP tools; CI builds, launch-checks and publishes on a version change.

---

## Part 4. Every release in this stretch

| Version | Title | In one line |
|---|---|---|
| 0.9.38 | More Drives, Clearer Glass | games on several drives, Flatpak install fixes, BIOS after downloads, OLED and Light colours, FLIP card morph, tour glyphs |
| 0.9.39 | Easy on the Eyes | Start disc widget turns once a minute (it made the owner feel sick) |
| 0.9.40 | Pictures That Load | GIF picker previews through romimg://, Commons beside Openverse |
| 0.9.41 | Light, Rebuilt | built, never published (CI had no runners); shipped in 0.9.42 |
| 0.9.42 | Glass | Game Shelf B, first Liquid Glass pass (liquid-glass skill) |
| 0.9.43 | Steady Home | Home header no longer jumps with long titles |
| 0.9.44 | Real Glass | Glass rebuilt from the owner's reference pictures; the `go()` bug that broke every non-game page since 0.9.38 |
| 0.9.45 | Plain and Glass | one Style setting, Plain designed on its own; morph lands where the target is |
| 0.9.46 | Every Setting | All Settings tab per emulator in Game Settings |
| 0.9.47 | The Engine Update | CAE and its governor, Glass engine (refraction), backgrounds rebuilt, audits in the repo, glibc checks |
| 0.9.48 | Under the Hood | game identity, emulator profiles, scheduler, image pipeline, performance overlay |
| 0.9.49 | Every Corner | Vita3K start checks, CEE, one trophies page, drives named, Settings refresh, Quick Menu, colour picker, clipping audit |
| 0.9.50 | The Rule Book | `docs/design-rules.md` and its test |
| 0.9.51 | Cartridge Save Sync | saves on the owner's RomM, CIDE (the ID engine) |
| 0.9.52 | Mods, Offline and a New Welcome | web engine, mods engine and rule book, ROM hacks, Nexus, offline saves and covers, Tenor GIFs, every animation on CAE, CIDE for Steam, new welcome |
| 0.9.53 | A New Look | brand B (Marquee), README rebuilt with a real library, console names in Light |
| 0.9.54 | Obsidian Glass | dark Glass smoked black instead of milky grey; Glass engine tones per theme |

---

## Part 5. Map of new code (where to look)

- **Engines** (all in `docs/architecture.md`): CAE `src/motion.js`; Glass engine `src/glassEngine.js`; game identity `electron/gameId.js`; CIDE `electron/cide.js` (+ `cide.steam`); CEE `electron/cee.js`; emulator start check `electron/emuStart.js`; emulator profiles `electron/emuProfiles.js`; scheduler `electron/scheduler.js`; web engine `electron/web.js`; mods engine `electron/modEngine.js` + rule book `electron/modRules.js`; ROM patches `electron/romPatch.js`; Save Sync `electron/saveSync.js`.
- **Brand:** `src/brand.js` (the one mark), `src/components/Logo.vue`, `src/components/WelcomeIntro.vue`, `tools/brand/gen.js`, `steam-art/*`, `build/icon.png`, `docs/social-preview.png`.
- **README pictures:** `docs/readme/` (JPEGs, `header.gif`, `logo-dark.png`, `logo-light.png`).
- **Product record for the impeccable skill:** `PRODUCT.md`.

---

## Part 6. Subsystems: what they do now and why

### 6.1 Motion (CAE)
One frame loop (`frame()`), springs as CSS `linear()` tokens, named timings for everything else (`--fade-*`, `--tint`, `--progress`, `--move-*`, `--loop-*`, `--press`, `--stagger`), `timing(name)` for script animations. `test/cae.test.js` fails on any hand-written duration or curve in `src/`. The governor quiets decoration when idle and nearly everything while a game runs. Owner's motion rules: heavy not bouncy, short distances, nothing that makes them feel sick (the disc widget in 0.9.39, the idle background in 0.9.49).

### 6.2 Looks
One Style: Plain or Glass (`ui.style`). Colours include OLED (black) and Light. Light Glass is the owner's favourite; dark Glass was rebuilt in 0.9.54 (6.9). Every element designed twice; `styleModes` test guards the split.

### 6.3 Saves
Cartridge Save Sync (0.9.51) keeps saves on the owner's RomM: per-emulator units, RomM's own content hash, a ledger deciding up/down/conflict, conflicts always asked, backups before every write, never while the emulator runs. Save Sync or Syncthing, never both. **Away from the server (0.9.52):** when RomM can't be reached the games played are held (`save-sync.json` `held`), RomM is probed every minute outside games, and held saves go up when it answers; two-device changes become a conflict. **Not tested on a device yet.**

### 6.4 IDs (CIDE)
Every console's game ID format and readers in one place. In 0.9.52 the Steam manager's ID rules moved into `cide.steam` with a golden test proving identical shortcuts. Keep launchers untouched unless the golden test still passes byte for byte.

### 6.5 Mods
Sources as providers: GameBanana, EmuCoreX (PS2 textures), Nexus Mods (owner's key, non-Premium opens the file page in Cartridge's window which catches the download), ROM hacks (Beta, Romhacking.net behind Cloudflare, untested). **The rule book** (`modRules.js`, owner: "it's supposed to know where each emulator installs them, not download the Fugazi"): where each emulator keeps mods, what an archive must hold, what must be switched on, with the emulator source each path comes from. Mod sites are only offered when an installed emulator takes mods; anything that doesn't match is refused, not unpacked. RetroArch: ROM hacks only (soft-patching beside the game). PS3 mods: scrapped. Nexus asks public apps to register (support@nexusmods.com); the owner hasn't done it.

### 6.6 Offline library (0.9.52)
`libraryArt()` keeps every cover at 360 px (about 25 KB each, 250 MB cap) in `imgcache-library/`, served when RomM can't be reached. Download errors to an unreachable server say so plainly.

### 6.7 Welcome (0.9.52)
New opening on CAE (the mark draws, fills, blooms; the name rises). The Game Mode screen shows once ever, on the first desktop launch outside Steam and gamescope: Add to Steam waits for Steam's restart, says "See you in Game Mode" and quits; Set Up Here Instead carries on. Order: hello, gamemode, RomM, look (with name), pad (only with a pad), emulators, scan, Steam, sync (Save Sync default with RomM), extras (Nexus key), done. **First-launch screen not tested on a fresh desktop install.**

### 6.8 Brand (0.9.53)
Marquee: a panel with the C cut out, lit orange from behind, with grain. Flat in the app (orange panel, C open), lit in the icon and Steam art. Regenerate with `tools/brand/gen.js`.

### 6.9 Dark Glass (0.9.54)
The owner's diagnosis was right: the dark fill was white at 5.5% and the backdrop was brightened, so glass over dark became a grey film. Now: `--lg-ob` is near-black with 9% of the chosen colour (under 10% lightness), fill 72%, sheets 80%; backdrop `blur(28px) saturate(1.45) contrast(1.05)` with no brightening; the rim light (still following focus and pointer) fades to a dark refraction line on the far side; hairline bevel light top-left, dark bottom-right; a faint top-down sheen; contact shadow on buttons, contact plus deep shadow on floating pieces (`--lg-drop-deep`: Dock, search, pop-ups, toasts). The Glass engine's SVG filter now has a dark and a light tone (saturate 1.45 + contrast 1.05 vs 1.6), keyed per theme so a theme change rebuilds the filters. Light Glass values are separate and unchanged. The owner hasn't seen it on the device yet.

### 6.10 README pictures (0.9.53) and how to redo them
Shot with the harness from a slimmed copy of the owner's library (fetched with a read-only token), SteamGridDB logos (trimmed and measured in a page canvas) and heroes, RomM console pictures (with `sonyArt.fix` applied), RetroAchievements overview (user "player"). An init script rewrites `romimg://` to served files and answers `logo:get`/`art:sharpHero` per game. The header GIF was recorded with CDP screencast at 0.4x speed (CDP `Animation.setPlaybackRate` plus a scaled `performance.now`/rAF/`Date.now`) and sped back up, about 33 fps, still background (the animated one tripled the size). All data was deleted afterwards; to redo, ask the owner for credentials again and follow the same rules.

### 6.11 GIF search (0.9.52)
Tenor first (its search page carries the results as JSON in `store-cache`, about 50 per search, safe search, no key), then Openverse and Commons.

### 6.12 Firmware (0.9.52)
Tested for real: RPCS3 with Sony's PS3 4.93 and Vita3K build 4111 with Vita 3.74. RPCS3 exits with 143 or hangs after a successful install, so success is read from RPCS3.log or new dev_flash modules, and RPCS3 is closed. RPCS3 refuses to run from /tmp paths. The newest Vita3K needs glibc 2.43; build 4111 is the fallback.

---

## Part 7. Things that broke and how they were fixed (learn from these)

- **`store.go()` threw for every non-game page from 0.9.38 to 0.9.43** (`card = name === 'game' && …` then `card?.querySelector` on `false`). Found by clicking through a real build. Lesson: crawl the app after any store change.
- **Glass lens picture not drawn** in some backdrop filters, shifting everything: fixed with a neutral flood under the lens (0.9.49).
- **Start overview pictures saved under the wrong page** (snapshot taken while the old page was leaving): `boardReady` gate (0.9.44).
- **Home header jumped 70 px** with long titles: fixed row height (0.9.43).
- **Contrast audit blind spot:** it skips text over pictures, so dark console names in Light passed (fixed in 0.9.53 by keeping `.systile` text white). Look at every look yourself.
- **0.9.41 never published:** CI had no runners; ship the next update in the same PR.
- **My own slip:** `pkill -f` with a pattern that matched my own shell killed the command. Don't pkill by loose patterns.

---

## Part 8. Do-not-break additions

- Launchers and Steam shortcut output: `test/cideSteam.test.js` must stay green; never regenerate its golden fixture to make a change pass.
- `modRules.js`: never add a fallback that unpacks an archive somewhere without a rule.
- `test/cae.test.js`: new motion uses CAE tokens; don't add exceptions to silence it.
- Dark and Light Glass are tuned separately; a dark change goes in the dark block only (`body.elements-glass`), Light in `body.elements-glass.theme-light`. Plain never sees `--lg-*`.
- `src/brand.js` is the only place the mark is drawn; assets come from `tools/brand/gen.js`.
- README pictures carry no private detail; check by eye before committing.

---

## Part 9. Open items, unverified work and what to ask the owner

Not tested on a device (ask the owner):
- Cartridge Save Sync, including going away from home with RomM unreachable and coming back.
- Vita3K Repair; the add-on site window; a Nexus download (page flow); a ROM hack with RetroArch and as a patched copy.
- The first-launch Game Mode screen on a fresh desktop install.
- GIF search in the app; dark Glass on the Deck and the TV (with the GPU, and with light effects).

Owner's to-dos: set the GitHub social preview; Add to Steam again for the new artwork; register the Nexus app if they want Nexus out of testing.

Known gaps: Romhacking.net parsing untested (Cloudflare); Supermodel and Citron facts are thin; PPSSPP folders move via `movePsp` only.

---

## Part 10. How I'd work in your place

Read the newest SESSION-LOG entry and CLAUDE.md first. Answer questions plainly and check the code before saying yes. For anything visual, render it in Chromium, look at it, and send the picture before shipping. Run `npm test`, `npx vite build`, `npm run audit:ui` and the launch check before every release, grep the diff for private details, then open and merge the PR. Write the SESSION-LOG entry and the CLAUDE.md section as you go, not at the end.
