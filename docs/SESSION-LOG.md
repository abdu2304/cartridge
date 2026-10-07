# Session log

A running record for whichever Claude session works on Cartridge next, on any account. Newest entry first. Each entry says what was done, what the owner decided in chat (with reasons), what is half done, what the owner must test on a device, and what's next. Read the newest entry first, then `CLAUDE.md`, then the plan for the version being built.

The branch for 0.9.3 work is `claude/relaxed-fermat-30pigp`. Pull it before starting (`git pull`): another account may have pushed to it.

---

## 7 Oct 2026 · 0.9.57 Seamless
- Owner's list (photos from the TV) discussed first, then "start building". Picks: highlight B (your colour, solid), Start "whatever looks best" (a slow pan, no zoom), Syncthing flattened into the section's row, Vita3K zips/VPKs must install without its window ("we nailed this with PS3"). Added mid-build: redesign the Cloud Sync screen, and a game sheet in Cartridge Save Sync (poster, where the save is, history, Go to Game Page).
- Vita3K root cause, found by running build 4111 in the container: CLI11 Windows-style options swallow "/..." arguments (the owner's "13.zip" was the half after the space), and killing the AppImage left the real Vita3K running. Both fixed and tested end to end (no window, ~0.6 s).
- shadPS4's save path checked against its source (save_instance.cpp, path_util.cpp): the owner was right.
- Names for codes: PCSX2/DuckStation databases; RomM has no serials, so nothing to read there.
- Checked: npm test, vite build, launch check, `npm run audit:ui`, screenshots of the new screens in Plain, Glass and Light.
- Owner to test on a device: a Vita zip install (Unit 13), Glass on OLED, the chosen colours in Settings, Start's pan on the TV and the handheld, the Save Sync game sheet, Syncthing games after the first name download, shadPS4 saves and Linked Folders with a shadPS4 fork.

---

## 7 Oct 2026 · 0.9.56 Quick and Clear (new account session)
- Owner moved back to this account; read every handover, CLAUDE.md, the session log and the engine docs first, and confirmed the codebase back. Container note: Electron's own download fails through the proxy; fetch `electron-v44.4.5-linux-x64.zip` from GitHub with curl into `node_modules/electron/dist` (and `path.txt` = `electron`). Playwright is global (`NODE_PATH=$(npm root -g)`).
- Owner's list (15 items) with answers: colour boxes and Update All layout "you recommend"; the "freeze" item was the background stopping (the real freeze was fixed in 0.9.55); Glass "weird white shadows that move around the card" in dark mode; Linked Folders "build your best version".
- Built (details in CLAUDE.md 0.9.56): background never stops when idle; dark Glass light fixed in place, no focus halo, no press sweep, gentler edge bend; springs start at full speed (the cause of "sluggish": a critically damped spring from rest eases in); page turns and pages quicker (measured); Save Sync counts open their saves, unmatched ones say why and the fix; Update All; Linked Folders setup (choose whose saves) and the EmuDeck link bug ("folder to share doesn't exist": lstat on a link); smart mod names; Nexus key moved; Pure Black, Light/OLED colour boxes; Light cards stand out; background menu trimmed; blocking ldd/flatpak calls made async.
- Not reproduced: Glass to Plain switching back. Pressing Plain works in the stub and in the real app with both the controller and the mouse. Ask the owner exactly where (Settings or the welcome's Look step, which colour) and what they see.
- Checked: npm test (263), vite build, launch check, `npm run audit:ui`, screenshots of every changed screen in Plain/Glass and dark/Light, Start page-turn and navigation timings against 0.9.55.
- Owner to test on a device: motion feel (handheld with light effects and the TV with the GPU), dark Glass while moving down a page, Linked Folders with GR2 and shadPS4 (both directions, EmuDeck links), Save Sync's lists after Sync Now, Update All with two updates, Nexus suggestion for Bloodborne GOTY, the background after a minute idle and after a game.

---

## 7 Oct 2026 · 0.9.55 Steady: Home dims a second after coming back from a game, freeze after start (released)
- Owner: open a game from Home, go back, and about a second later the screen dims and comes back up.
- Cause: `store.back()` added `morph-back` (page arrival animations off while the cover flies back) and took it off 900 ms later. Taking `animation: none` away re-applied `settle`/`viewBack` to the page already showing, so Home faded in from opacity 0 a second time. Reproduced in Chromium (Home opacity 1 → 0 → 1 at 900 ms after back).
- Fix: `calm()` in store.js takes `morph-back` off just before the next page change (`goNow`, `back`, `tab`); no timer. Checked: Home stays at opacity 1 going back after 0.3, 1 and 3 s; the next game page still arrives with `viewDeeper` and a tab with `viewFromR`. Other classes that gate animations checked: `modal-in` stays on (the same bug in pop-ups, fixed in 0.9.44), `rows-measure` doesn't touch animations, `cae-idle` pauses rather than removes.
- Owner: a few seconds after start Cartridge stops responding, the screen dims for a few seconds, comes back, and the controls are gone. Found by running the real app in the container in simulated Game Mode (fake xprop, `SteamGamepadUI`, a fake `flatpak` that takes 1.5 s) with a `--require` hook logging main-thread stalls over 200 ms and every blocking process call: about 11 s in, `steamManager.flatpakApps()` ran `flatpak list` with execFileSync and held the main thread for as long as Flatpak took (seconds on a Deck), so gamescope/Steam dimmed the window as not responding; a login shell (`bash -lc`, up to 3 s) was asked the same way. Likely chain to the dead pad (not confirmed without a device log): Steam took focus while Cartridge hung, `watchGamescopeFocus` saw another app in front and switched pad input off.
- Fix: `detect.flatpakApps(home)` reads installed apps from Flatpak's folders (`<installation>/app/<id>/current/active`, user, system and /etc/flatpak/installations.d), same list as `flatpak list --app`; steamManager and syncthing use it and only run `flatpak list` when no installation folder exists. `detect.warmLoginPath()` asks the login shell in the background (started in `whenReady`); `extraBinDirs` uses it once known and steamManager keeps its bin list only then. `flatpak override` calls (Flatpak access buttons, PPSSPP folder, adding a games drive) run through `flatpakAsync` instead of execFileSync (up to 15 s each). Checked: 3.5 minutes in the same simulated Game Mode with Deck-like Flatpak folders, every scheduled job run, no stall over 200 ms (before: 1.5 to 1.6 s). Tests 258/258, build, launch check.
- Owner to test on the Deck: leave Cartridge open on Home for a few minutes in Game Mode; it should never dim, and the controller should keep working. If the controls still go, send the log lines that start with "gamescope focus".
- README pictures and header GIF reshot with the obsidian dark Glass (PR #72). GitHub About text suggested to the owner (no tool here can edit repo settings).

---

## 7 Oct 2026 · 0.9.54 Obsidian Glass · handover written
- Owner: dark Glass looked like milky grey plastic; sent a prompt for obsidian glass and asked if it made sense. Answered (it did, with changes: keep saturation near 1.45 not lower, tint with the chosen colour, keep the moving rim light, blur 28 not 40, deep shadow only on floating pieces, update the engine's own filter and the no-GPU values). Built, showed before/after over Solar Flare; owner: "a tiny bit darker without losing the glass look" (fill 66 to 72%, sheets 74 to 80%, base blacker). Light untouched.
- Handover for the move back to the other account: docs/HANDOVER-0.9.38-to-0.9.54.md, pointer at the top of CLAUDE.md.
- Owner to test on a device: dark Glass on the Deck (GPU and light effects) and the TV.

---

## 7 Oct 2026 · 0.9.53: brand B and the new README
- Owner picked brand B (Marquee) and the README Showcase layout, asked for logos and metadata in the pictures (SteamGridDB key given), real console pictures instead of placeholders, an Achievements screen (RA key given), private details hidden, and a fluid header GIF.
- Done: logos for 154 games and heroes from SteamGridDB, RomM console pictures (Sony fix applied), RA overview with the user shown as "player"; all 32 shots in four looks plus achievements; GIF at about 33 fps; brand assets from tools/brand/gen.js; README rewritten. Found and fixed: console card names dark in Light.
- Credentials (RomM, SteamGridDB, RetroAchievements, Nexus) were used only in the session's scratch folder and deleted afterwards with every downloaded file; none are in the repo.
- Owner to do: set docs/social-preview.png as the repo's social preview (GitHub → Settings → General → Social preview); Add to Steam again for the new Cartridge artwork.

---

## 7 Oct 2026 · 0.9.52: mods engine + rule book, web engine, CIDE for Steam, CAE timings, new welcome, offline
- Built (owner: "start building everything we discussed"): CIDE for Steam (golden-tested, shortcuts identical), web engine, mods engine (GameBanana, EmuCoreX, Nexus Mods, ROM hacks beta; right stick and chips switch sources), every animation on CAE tokens, contrast audit fixes + Start label shade, firmware installs tested for real, onboarding rebuild (CAE intro, first-launch Game Mode screen, 8-step order the owner approved).
- Owner's mid-build messages, all in this update: GIF search was poor (Tenor added, ~50 results); mods must only be offered where Cartridge knows the emulator's install rules (modRules.js rule book with sources; mismatches refused; no mod sites without an emulator that takes mods); away from a local-only RomM: library browsable offline with small cached covers, saves held and pushed on reconnect (rules: the emulator keeps writing locally, playing again overwrites locally, held games noted, RomM probed each minute outside games, three-way ledger decides, two-device changes are a conflict the owner chooses).
- Owner's answers: v2.3.1 tag deleted (was already gone); clock, PS3 serial, controller after a game and Steam collection renames confirmed working. Turned down and removed: Ryujinx saves, PSN sign-in, pausing Syncthing, more languages, PS3 mods.
- Brand: owner hated round 1 marks, liked B's colour (orange darkening right) with more grain, asked for the design skills. Round 2 board made with impeccable (PRODUCT.md, concept-seed roll) and taste-skill: A Save Blocks (assigned), B Marquee (impeccable's pick), C Album (competitive). README: three layouts (Showcase, Walkthrough, Compact) and a header GIF draft from the owner's real library. Waiting for both picks; apply brand.js MARK, Logo, steam-art/*, build/icon.png, GitHub preview and README after.
- Security: the owner's RomM and Nexus credentials were used only in the session shell and scratchpad (read-only 30-minute token), never in the repo; the screenshots show romm.local and user "player". Delete scratchpad rl/ when the README is done.
- Device tests for the owner: Save Sync (and going away from home with RomM unreachable, then back), Vita3K Repair, the add-on site window, a Nexus download (non-Premium opens the page), a ROM hack with RetroArch and with a patched copy, the first-launch Game Mode screen on a fresh desktop install, GIF search.

---

## 7 Oct 2026 · 0.9.51 released: fixes + Cartridge Save Sync (RomM) + CIDE
- Done and pushed (commit "Fixes: Home rows..."): Home row heights remembered and measured on open (jump 120-160 px -> 2-3 px), glyph centring (vertical-align middle + top -0.16em, measured 0.0 px for letters and sticks), tour Y -> search (tools/ui-audit/tour.js runs the whole tour, in audit:ui), Achievements GameIcon (Change Icon), Settings rail `.on` chosen fill + focus on tap.
- Owner's Save Sync answers: whole memory cards; RetroArch save-state folders per core included; Switch = Eden only (no Ryujinx, no other forks); guard rails always; a Steam-Cloud-like "Cartridge Cloud Sync" animation before a game starts; Cartridge Save Sync XOR Syncthing (with Syncthing in use the Cartridge option is locked until Syncthing is removed), the choice in a new Advanced page under Saves and Sync. Owner has the latest RomM.
- RomM API (read from rommapp/romm master, backend/endpoints/saves.py): POST /api/saves?rom_id&emulator&slot&device_id&content_hash&autocleanup&autocleanup_limit (multipart saveFile; slot uploads get a datetime tag and versions; 409 when another device saved the slot since this device's last sync, unless overwrite); GET /api/saves?rom_id&slot&device_id (device_syncs with is_current); GET /api/saves/{id}/content?device_id; POST /api/saves/{id}/downloaded {device_id, content_hash}. content_hash: md5 of a plain file, or for a zip md5 of the sorted "name:md5" lines of its entries (handler/filesystem/assets_handler.py hash_zip_contents). Cartridge's device: rommDevice() in main.js. QR pairing must add assets.write.
- Plan: electron/saveSync.js (units from saves.scan + RetroArch states, RomM-style hash without zipping, ledger save-sync.json, decide(local, base, remote), zip writer, safe replace with backups in USER_DATA/save-backups, emulator-running guard), main handlers savesync:*, CloudSync overlay before play, Settings Saves and Sync Advanced page, game More saves actions. Tests: test/saveSync.test.js with a fake RomM.
- Built as planned: engine hash checked against RomM's own Python hash_zip_contents; HTTP client tested against a fake RomM (multipart, 409, auth). UI screenshotted in Plain, Glass and Light. Steam-launched games sync after the game (Cartridge can't run before Steam starts them).
- CIDE (owner asked): electron/cide.js puts every console's ID rules in one place (kinds, readers, consoles with no ID and why). Detection untouched: parse is syncthing.serialsIn; test/cide.test.js pins it. `cide:map` for diagnostics.
- Not tested on a device: two devices against a real RomM, Eden, PCSX2 cards, RetroArch states, Cloud Sync screen in Game Mode.

## 6 Oct 2026 · 0.9.50 The Rule Book
- Owner, after 0.9.49: "Continue building and read everything I sent in between and package this to the update as well". Read every message since the credits ran out again: all were in 0.9.49; the design rule set (asked to confirm first) is taken as approved by "continue building" and built here.
- `docs/design-rules.md` + `test/designRules.test.js` (see CLAUDE.md 0.9.50). The move-to-drive report ("chose This Device, it went to the SD card") is the 0.9.49 drive-naming fix; `New Games Go To` now lists drives by name.
- Checked: npm test, vite build, launch check. Owner: read the rules and say what to change; anything there that you don't agree with is a one-line edit.

## 6 Oct 2026 · 0.9.49 Every Corner (one update, owner: package everything sent since the credits ran out)
- Everything the owner sent after 0.9.48 in one update: Part 1 (tour glyphs and spotlight, top vignette, trophies as one page, Light/Glass looks, Arrange ring, clipping), Part 2 (Vita3K rebuilt, PS3 SONY, page overview, manual RS hint, Settings touch, masonry D-pad, green tick, storage drives and Always Ask, colour picker, Home line, flicker and back stutter, onboarding RS), unnamed PS4 names, CEE with Supermodel/Citron/PPSSPP, the notes 500, the Settings refresh (owner: "do what you think is best"), then the later list: RomM on this device (linked state, folders multi-select), the SD card download bug, Quick Menu, the greeting in the Dock, tour A, saves choice, Missing from Steam search, page overview Add Page, the idle background ("like vomit").
- Causes found: the main games folder was labelled This Device wherever it was (owner's is on the microSD); RomM rom_notes are unique per (rom, user, title) and the carrier ROM got several games under one title; the glass lens picture isn't drawn in some backdrop filters, so the displacement shifted everything and the page showed through as bands (the keyboard photo); the whole-screen art zoom (12 s after a page settled) plus an 8 fps idle background; Vita3K copies that pass ldd but die on a Qt symbol (EmuDeck's Qt 6 zip build on a Qt 6 system); RommLocal's chosen-row fill beat the focus fill by load order (grey with dark text).
- Decisions I made where the owner said "do what's best": Settings sections as listed in CLAUDE.md 0.9.49; colour picker as preview plus three sliders; Light Glass primary buttons as bright glass; Cartridge Save Sync shown as Coming Soon and remembered (`config.saveSync`).
- Checked: npm test (all pass, new: rommLocal, logos, cee), vite build, launch check, `npm run audit:ui` (0 focus problems in six looks, 0 cut texts; contrast notes left are the audit missing Start's scrim and a mid-transition sample in the More sheet, checked by hand), screenshots of the Quick Menu, greeting, keyboard, colour picker, game page, Get Emulators in Plain/Glass and dark/Light.
- Owner to test on a device: Vita3K on Bazzite and SteamOS (Repair, a game that closes at once says why); RomM on this device with two games folders (both show after a library scan in RomM); Always Ask downloads to the SD card and the internal drive; the greeting on the TV and the handheld (falls back to a toast when the gap is too small); the idle background on the TV; Glass keyboard and sheets with the GPU in Game Mode; trophy names for unnamed PS4 games on a second device; Supermodel and Citron.
- Next (owner): confirm the design rule set (clipping, how things look and feel, console icons) before building it; then plan the next update. Remind: README pictures. Parked: mods overhaul.

## 6 Oct 2026 · 0.9.48 Under the Hood
- Owner picked from my engine suggestions: game identity, emulator profiles, background job scheduler, image pipeline, visual regression checks, performance overlay, plus "library sync and Steam collections wait until the game ends" (downloads keep going). "Make sure this doesn't break anything, like launchers or backend."
- Built additively: the identity engine reuses the exact readers the features had (and adds PS2, GameCube/Wii, 3DS to saves); launchers (steamManager matching and plan) not touched. Profiles are a view over the existing tables, with a pinned test; the only rule moved out of main.js is the add-on layout (same output).
- Checked: npm test (all pass, new: gameId, scheduler, emuProfiles, styleModes), vite build, launch check, real app against the mock RomM (15 backend channels answer, no errors in the log; a 1200x1800 cover served at 360x540 for cards and full size when asked; the overlay shows fps, worst frame, CPU, memory), focus audit in six looks, visual check (0 of 60 screens changed against 0.9.47; 17 of 60 against the build before 0.9.47, as expected).
- Found by the new checks, not fixed (need the owner or a device): Supermodel can be installed from Get Emulators but has no launch arguments in emulators.js; Citron has no update source; PPSSPP's folders can't be changed in Cartridge.
- Owner to test on a device: Performance Overlay on the Deck and the TV, covers still sharp on cards and big on the game page, a library sync arriving after a game ends (log line "job waits for the game to end"), trophies for a PS3 game whose ROM name has no serial.

## 6 Oct 2026 · After 0.9.47: owner's decisions (nothing built)
- Resources (measured, real app): ~6.7% of a core in use, 3.3% idle, 2.1% behind a game, ~550 MB; a CPU-bound stand-in game ran 0.5% slower with Cartridge behind it (noise). Owner agreed for the next update: hold the hourly library sync and the auto Steam console collections check while a game runs (`gameFocus.away || runOn`), run them when it ends. Downloads keep running during games (owner: no pause).
- Saves: full save sync comes in a later update; the user picks RomM's save upload or Syncthing. Not now: pausing Syncthing while playing, PSN sign-in for PS4 names, Ryujinx saves. BIOS and keys need no sync (they are in RomM).
- Plugins ponytail, graphify, rtk: not wanted for now.
- Mods overhaul (curated GitHub list, ROM hacks, PS3 file mods, Nexus): parked, owner wants more study first. Options are in the 0.9.47 chat and docs/plan-0.9.39.md.
- Remind the owner: README pictures and layout (owner: "we will do pictures later, remind me").

## 6 Oct 2026 · 0.9.47 The Engine Update (one update, owner: "package them as one update not individually")
- Carries the unpublished masonry change (owner's photo of Settings → Emulators).
- Owner: menus don't open (Dreamcast in Consoles, collections), highlights gone (latest unlocks, trophies). Not reproduced in a clean real app (mock RomM) or the stub; most likely an older build (0.9.38 to 0.9.43 had the `go()` bug fixed in 0.9.44; a rollback sets `updateHold`, which pauses updates). Added `keepFocus` in nav.js so focus that falls off the page comes back; the real-app crawl found one such case (Settings → Updates busy button). Ask the owner for their version in About if it persists.
- Highlights: a pixel audit found Light/OLED shadow rules beating the focus ring, Glass chosen = focused in switch rows, the chosen swatch identical focused, the clock tile ring on a day sky. Fixed. The audits are now in the repo (`tools/ui-audit`, `npm run audit:ui`) so they run before every release: the owner's "how can you mitigate these issues".
- Achievements: no ring on rows (fill only), console logo dark/white on the focused row; PlayStation logo 1.6 optical (owner: smaller than NES), SEGA/Microsoft maker logos on console cards, PS3 card SONY clipped (removed from the picture).
- Trophies: every game pushed to RomM notes, unmatched ones on the console's oldest ROM (carrier); fresh install lists all (tested with a fake notes API).
- Vita3K: builds after 2026-10-03 need glibc 2.43 (Vita3K CI on Ubuntu 26.04); falls back to Vita3K-builds 4111. Owner to test: Vita3K install/update on SteamOS.
- CAE (docs/cae.md), the governor, Glass engine (docs/glass-engine.md, liquid-glass-design skill), Welcome Look step, background rebuild (Aurora, Contours, Drift, Tide; Waves/Ribbons untouched), README and docs/architecture.md.
- Skills: impeccable, transitions-dev/polish, web-design-guidelines, liquid-glass-design added; improve-animations, taste-skill, img2threejs, liquid-glass, image-to-code were already there. kokonutui, react-bits (React components), anime.js (a JS library) and awesome-design-md (DESIGN.md collection) are not skills; not added to the app.
- Owner's picks on the missing engine items: no 2.5D tilt; yes to a slight rumble when springs settle (tiles, cover landing, list end); five scene backgrounds yes; no squash/stretch or bounce. Asked whether Cartridge slows a running game: interleaved CPU benchmark with Cartridge in the background vs frozen: -0.5%, inside noise; so no page pausing or cache dropping.
- Mods/Nexus: discussed only, nothing built (owner: discuss first). Recommendation given in chat.
- Checked: npm test, vite build, launch check, focus and contrast audits in six looks, real-app Settings crawl in Plain and Glass, Welcome Look step in Plain/Glass × dark/Light/OLED, backgrounds rendered standalone with frame times.
- Owner to test on a device: Glass refraction smoothness on the Deck and a TV (it should step down to frost by itself if slow), motion feel, controller after a game (governor away), the Look step, backgrounds, PlayStation/SEGA logo sizes.

## 6 Oct 2026 · 0.9.46 Every Setting
- Owner: typed settings (shadPS4 DMEM in Advanced) missing from Game Settings, "place every setting advanced or not"; back from Window Width went to the Steam tab; hold A on a row that fits needed B twice; Show File Location's toast clipped.
- Done: All Settings tab from the emulator's own file (six emulators), return to tab and row, expand only when it reveals more, toast text wraps. Checked in Chromium with a stub (tab and row after typing, one B after hold A) and a text-clipping audit of every tab, every Settings section and its pages, the game page and each More tab (nothing cut). Test added to test/gameSettings.test.js.
- Owner to test on a device: All Settings for a real shadPS4/RPCS3/PCSX2 game, values written are picked up by the emulator.

## 6 Oct 2026 · 0.9.45 Plain and Glass
- Owner: Plain and Glass are two different modes, don't merge them; fewer, clearer options; design every element for both; "add it to your memories and any handovers, never forget this point". Done: one Style setting, Plain designed on its own, the rule in CLAUDE.md (owner's rules), the 0.9.22-0.9.37 handover and docs/design.md.
- Owner: opening a game from a card lands offset, then snaps (both ways). Measured 39/52 px; morph now tracks its target every frame (0 to 4 px). Dock pill checked too.

## 6 Oct 2026 · 0.9.44 Real Glass
- Owner: "Glass mode looks like absolute shit, really cheap", with three reference pictures and the image-to-code skill to install (now in `.claude/skills/image-to-code`, MIT). What the references have that 0.9.42 lacked: a near-clear fill instead of a tint, a light-catching rim with hotspots, thickness, a hard-edged reflection, grain on big panes, a wide soft shadow. Rebuilt in CSS (details in CLAUDE.md 0.9.44); menu rows in sheets no longer grey blocks. Screenshots checked in dark and Light.
- Owner's photo: two pages in Start's overview with the same picture (different widget counts). Reproduced in Chromium and fixed (CLAUDE.md 0.9.44).
- Owner (photos of 0.9.37 and 0.9.34 Emulators): Glass panels near black since 0.9.42; see-through panels restored. "Inaccessible menus": the go() bug (0.9.38 to 0.9.43, fixed in this update); a D-pad reachability walk of every Settings page found nothing else.
- Owner's list: More sheet dims twice, Steam console cards and Missing do nothing, Dock stays black in Light, storage ring invisible in Light, Emulators opens on Setup and Health, false "72 games not in their Steam collection", and a full bug check. All found and fixed (CLAUDE.md 0.9.44); the go() bug broke every non-game page since 0.9.38.
- Owner: "also use the liquid ui skill". Added what the reference build lacked from it: shimmer on press, clear glass over media, concentric corners, reduced motion for the shimmer.

## 5 Oct 2026 · 0.9.43 Steady Home
- Owner: the screen shakes scrolling games on Home fast. Measured in Chromium (shelves' top per frame while pressing right/left every 70 ms, games with long titles and summaries): it jumped 70 px for ~5 frames on long ones. Cause and fix in CLAUDE.md 0.9.43. After: one position for every frame at 1280x800 and 1920x1080; the header keeps its old height (300 / 367 px); a long text title fits in two lines.
- GitHub had no runners for about an hour (billing was fine, the owner checked: public repo, 0 of 2,000 minutes); 0.9.42 was merged so its release ran as soon as they came back.

## 5 Oct 2026 · 0.9.42 Glass (built; carries 0.9.41)
- 0.9.41 was never published: the Test build sat queued 15 min without a runner and GitHub cancelled it, twice (no step ran; likely Actions minutes or a spending limit on the account). PR #59 stays open and 0.9.42 goes in it, with 0.9.41's notes inside 0.9.42's release notes.
- Owner: "build the next update based on everything so far" and asked what I recommend for the Game Shelf. Recommended B (Display case): the only one that is a shelf, it scales to every tile size by adding cases, and A's 3D strip and reflection read badly on small tiles while C repeats the cover rows and Spotlight. Built B with A's turn-out (rotateY on a spring).
- Glass mode with the liquid-glass skill (owner: only that skill for glass): glass only on the navigation and control layer, content solid (`ELEMENTS.glass.glassA` 1), one material (`--lg-*`), containers don't blur again, prominent glass for focused and primary, pressed glow, reduced transparency/contrast/light effects. Dock glass by default with Glass elements (`themes.dockOf`). Edge refraction (SVG displacement in backdrop-filter) tried and left out: it shifted the whole area, not the rim.
- Checked in Chromium: the shelf at 5x2, 3x2 and 8x2 in Cartridge and Light; Glass on Start, Home, Settings, the game page and its More sheet in Cartridge and Light.

## 5 Oct 2026 · 0.9.41 Light, Rebuilt (built; never published, see 0.9.42)
- Owner's photos and list: emulator widget emptied after closing shadPS4 (`ser` dropped `emu`); page overview page 1 placeholder (snapshots only of shown pages), lag across rows (transform fight + full-board blur), up/down; Console at a Glance empty space and 1x2 clipping; tick instead of "On this device"; Light glitch with Glass/OLED Black background (OLED Black removed from Background, into the OLED colour); OLED looked like Cartridge; Light "looks off" (rebuilt: raised near-white cards); What's New see-through and no right-stick scroll; More sheet popping twice (keyframe after the transition, measured: sheet-up started at 274 ms); GPU always (owner: GPU Always cured the handheld's sluggishness).
- Liquid glass skill installed in `.claude/skills/liquid-glass` for the next update, Glass mode only (owner).
- Checked in Chromium: overview with 6 pages (all snapshotted, focus kept, up/down, 0 slow frames), Console at a Glance at 1x2/2x2/2x3/3x2 (no cover cut, stats never overlap), Light and OLED on every main page, right-stick scroll in What's New (0 to 855 px and back), the sheet's animation timeline before and after, focus-ring clipping audit (none real).
- Still waiting on the owner: the Game Shelf redesign pick (A Cover Flow, B Display case, C Fan).

## 5 Oct 2026 · 0.9.40 Pictures That Load (built and released)
- Owner's photo of the GIF picker: previews not loading, the focus outline clipped, "PS4" finding nothing. Previews now go through romimg:// (fetched in main with webFetch), Commons added beside Openverse, short names spelled out, ring drawn inside. Openverse and Commons are blocked from the container: tested with fakes only, the owner must try a search on the device.
- Game Shelf: console logo in the label now. The owner asked for a full redesign; three mockups (Cover Flow, Display case, Fan) sent, waiting for a pick before building.

## 5 Oct 2026 · 0.9.39 Easy on the Eyes (built and released)
- Owner's photos of the disc widget: the picture behind the disc only on wide tiles, and the spin (a 3 s turn on focus on top of the slow one) made them feel sick. One slow turn a minute, no focus spin, picture at every size. Checked in Chromium with three disc tiles (wide, big, small square).

## 5 Oct 2026 · 0.9.38 More Drives, Clearer Glass (built and released)
- Owner's answers on the pending list, plus a new list with photos. Built: multi-drive (item 17, owner: only if confident; tested in the app with two roots, folder creation and PCSX2.ini), BIOS from RomM by itself after a download (item 7: the code only placed files already on the device), shadPS4/SharpEmu sheets and icons, Flatpak hang (async remote-add, sudo -S with a password typed in Cartridge, time limits; tested with a fake sudo), tour glyphs and pages, sync ring, Elements Plain/Glass with tinted liquid glass (apple-design skill, owner asked), shadPS4 mods (`<game>-mods` overlay read from shadPS4's fs.cpp).
- Checked in code, no change: add-on site downloads (item 11: caught, page closed, extracted and placed per emulator by content), GPU Always (item 12: trial with confirm, reverts after 25 s).
- LT/RT at launch: worked in the app about 100 ms after start every time (even with 30,000 games). Base layer now pushed before config loads; a "triggers at start" log line added. Ask the owner for it.
- Controller dead after a game: no device; ask for the "gamescope focus" and "after the game" log lines.
- Answers for the owner: Syncthing should keep running while playing (it waits for files to settle); PSN isn't needed for PS4 names (they come from the other device's RomM notes).
- Added on request before the merge: Settings sections opened at the previous section's scroll depth (one shared `.pane`); reset on section change. Reproduced in Chromium with the built app (Achievements scrolled, then Look & Feel at 73 px before, 0 after).
- Owner's photo before the merge: shadPS4's Emulators row squeezed to one letter per line by the Update pill (tag `shadPS4QtLauncher-<date>-<commit>`, nowrap). Short version in the pill, width caps, focused-row pill colours; checked in Chromium at 1280x800 and 1920x1080 with that tag.
- Owner's photo before the merge: the tour's Quick Menu step showed the Start glyph plus "· M on a keyboard". Now one or the other (`input.keys`); the step texts' Start and B are tokens too. Checked in Chromium with a fake pad: pad press shows the glyph only, a key press shows M only, a pad press brings the glyph back.
- Owner (photo of Look & Feel) before the merge: two new colours, OLED and Light (off-white, dark text, backgrounds inverted to dark lines). Checked in Chromium on Start, Home, Library, Consoles, Achievements, Downloads, Settings and a game page, with a script that lists pale text on a light page (only text over game pictures remains, as intended); OLED and the default Cartridge theme re-checked unchanged.
- Owner before the merge: the motion felt minimal; make it more prominent, not jarring, no performance cost (asked for the apple-design skill; it can only be started by the owner with /apple-design, so the work followed the owner's four points). Cause found: 0.9.37's morph and most movement were GPU only, and handhelds in Game Mode use light effects. Built FLIP morph, sliding pills, spring-pop presses and pop-ups (details in CLAUDE.md). Measured in Chromium with light effects against 0.9.37 (frames over 20 ms in 1.5 s windows, 4 to 5 runs each): opening a game and going back the same as before once whole-page moves were kept to the GPU path; pills 0. Also: game More → About moved to the Game tab under Pin to Start.
- Plans, not built: RPCS3 mods, Nexus Mods, two-device link via RomM and Syncthing: `docs/plan-0.9.39.md`.
- Owner to test: Add a Drive on an SD card, games found and downloaded there, emulators seeing it; glass and plain with a coloured highlight; the tour on the device; Flatpak install on a distro without it; BIOS toast after downloading a game for a console without its BIOS; sync ring; shadPS4/SharpEmu sheets; a shadPS4 mod from GameBanana.

## 5 Oct 2026 · 0.9.37 Set Up for You (built and released, one update with the second list) · handover written
- First list (owner's photo of a game's About and more): row focus without the clipped ring; Cemu groups (symlinked home, region-only packs, checked against the real community packs); BIOS and firmware put in place automatically plus a Setup and Health section; add-on site downloads close the page and open Downloads; mod layouts per emulator (Azahar mods, Switch patches). Download Latest Patches retracted by the owner (it was there).
- Second list, same release (owner: "release it all as one update"; the photos arrived in a later message and changed the shadPS4 fix):
  - Installer skipping to the next welcome step after Location: reproduced in the app; the drive lost focus while its folder was made and a press landed on the welcome's Continue. Fixed (focus kept, Continue only once installing).
  - Flatpak missing: installed first through pkexec and the package manager, in the background; without a password prompt the exact command is shown. shadPS4 (the photo, which arrived later: "No Linux build in shadps4-qtlauncher's newest release"): its builds are all pre-releases and Cartridge asked for the latest full release; now pre-releases, plus the newest shadPS4 as the launcher's default version.
  - Emulator updates slow and not live: parallel checks, cached first, 10-minute reuse; RPCS3's build number (the reason "up to date" was wrong), and RPCS3's log for what really runs.
  - PS5: SharpEmu and KytyPS5 from their own sources (arguments read from SharpEmu.CLI/Program.cs and KytyPS5 src/main.cpp), folder builds, icons; KytyPS5 trophies (package format from its trophies.cpp).
  - Linked Folders: Find and Link Saves (copies what only the fork has, then links).
  - Trophies "truly cloud synced": the system already synced PS3, PS4, Xbox 360 and Vita through RomM notes; the gap was other devices reading only 80 games the library knew had notes. Now every trophy-console game every 30 minutes and on Sync; PS5 added.
  - Look: Background vs Elements, glass highlight, Title Case; slow drift on game pictures (GPU only).
  - Motion engine with the apple-design skill (owner asked for it): spring tokens, velocity-keeping scroll spring, anchored interruptible pop-ups, card-to-game morph (GPU only).
  - Tour rebuilt as an interactive, spotlighted walk-through; keyboard and mouse overhaul (Tab now steps focus; Downloads moved from Tab to Ctrl+J).
  - Mid-way addition: delete installed mods and texture packs, including ones added outside Cartridge (to the Trash).
- Checked here: npm test (all pass), vite build, launch check; in the app: installer focus with repeated presses, Find and Link Saves end to end, the tour end to end with keys, every new key and the right-click menu, the glass highlight variables, the card morph (forced GPU path) and modal origins, the spring scroll settling.
- Not checkable here (owner to test): Flatpak install on a distro without it (pkexec prompt); a real shadPS4 install; SharpEmu/KytyPS5 downloads and games (GitHub was blocked from the container for their releases); RPCS3 update detection on the device; KytyPS5 trophies with a real game; the morph and drift with the GPU in Game Mode and on a TV; delete-to-Trash in Game Mode.
- Owner is switching accounts for a few days: `docs/HANDOVER-0.9.22-to-0.9.37.md` (updated for the second list), linked from the top of CLAUDE.md.

## 5 Oct 2026 · 0.9.36 Collections, Checked Properly (built and released)
- Owner's photo: Issues said 129 games were missing from a long list of old collection names (RomM plain names, SRM's "Nintendo DS - melonDS (Standalone)"). The check read Cartridge's memory (reg[].collections), not Steam. Rewritten to the same rules as the console collection fill; SRM names matched to consoles. Tested in npm test.

## 5 Oct 2026 · 0.9.35 Steady Pictures (built and released)
- Owner: console ("system") icons glitch on Settings → Emulators while an emulator updates, again; and the collections request again (already in 0.9.34). Icons: PIcon reset its fit on every redraw (reproduced in the app with bg-job progress events, 30/30 before, 0/30 after). Collections: two more ways a deleted collection came back (kept name, start-up check Fix), fixed and tested.

## 5 Oct 2026 · 0.9.34 Back in Control (built and released)
- Owner: the controller is seen but does nothing after a game started from Cartridge closes; and console collections: open one, see its games, add them, plus the bug where games already in Steam had to be added by hand to the new "Sony PlayStation 3".
- Controller: no device to reproduce on. Read Chromium 152's gamepad code (visibility gates data, not focus). Found and fixed: a closed game's id kept as gamescope's focused app kept the pad off; main's refocus blur cleared `returned` on the desktop. Added Steam "back to running app" when gamescope doesn't name Cartridge, and logging so the next report shows where it stops. Simulated Game Mode with a fake xprop and a fake game process.
- Collections: the bug was reg[].collections (Cartridge's memory) treated as truth, and only Cartridge's own shortcuts considered. Rewritten to compare with Steam's real collections for every matched shortcut. Tested in npm test and in the app with a fake Steam (helper path).
- Owner to test: a game started from Cartridge in Game Mode, then closed (and send the log lines "gamescope focus" and "after the game" if the pad is still dead); collections with Decky/live on.

## 5 Oct 2026 · 0.9.33 Linked Folders (built and released)
- Owner's asks: Download Latest for RPCS3 and shadPS4 like Cemu's; a save-link editor for forks (owner picked: a page in Settings → Emulators, fork's saves kept aside as .cartridge-kept); and the three left from 0.9.32 (no "…" anywhere, console logos checked on every console, interactive console widgets).
- Checked: npm test, vite build, launch check; Linked Folders end to end in the app (fake home with shadPS4 and a portable GR2: suggested, linked, fork saves set aside); 40 consoles with real logos measured for overlaps on the Consoles page and Start (1280x800, 1920x1080); taps on disc and shelf.
- Owner to test: Linked Folders with a real fork (does the fork read the linked saves; Flatpak emulators may not see a link outside their sandbox), and Download Latest Patches with the real RPCS3 and shadPS4.

## 5 Oct 2026 · 0.9.32 In the Background (built and released)
- One update for everything the owner sent after 0.9.31 (owner: ship it all as one, read every message back first). Items: Vita3K shown after Delete, background jobs, GitHub .zip releases (GR2 fork), Steam settings flash, Syncthing chips and header, Home first-card clip, Cemu categories and Mega Cheats, black Dock for everyone, Settings dot, X360/Latest Trophies tile, no trailing text, Recently Played cover size, storage and week tiles, console widgets, console card overlap, Steam logo rotation, mods sorting and header, downloads caught from add-on sites, a game About, Steam collections rebuilt.
- Owner's question, answered in the report: texture pack archives Cartridge downloads are deleted once installed (and on failure); a file picked with Install a Download is left where it was.
- To test on a device: the add-on browser window in Game Mode (does it show in front, does Back to Cartridge return), Steam collections with live changes on and off, and a collection deleted in Steam.

## 4 Oct 2026 · 0.9.31 Sony's Own Marks (built and released)

Owner (photo of the PS3 card): "make it say Sony like the actual controller ... the PlayStation icon is wrong ... check PS2, PS1 and PS4". Found in RomM's frontend/assets/platforms: ROMMY on psx/ps2/ps3/psp, an R logo on all six Sony pictures, "Rommstation" on psx/ps2. Fixed at load time in sonyArt.js (path hashes, measured boxes), RomM's art not copied into the repo. Checked: renders of all six before and after, the PlayStation card in the app against the mock RomM serving RomM's own SVG, npm test, vite build, launch check. Owner to test: the Consoles page and Start console cards for every Sony console on the TV.

## 4 Oct 2026 · 0.9.30 Switch, Read Properly (built and released)

Owner: heavy focus on Switch IDs ("Eden reads the game ID and its version, figure out how from its Git"), and console card controllers looking cut out (photo). Found: Electron has no AES-XTS, so Cartridge's NCA header read always threw inside the app (tests run in plain Node, which has it). Rewrote the reader from Eden's source (mirror github.com/eden-emulator/mirror): CNMT for ID, type and version, NACP for the version string and name, tickets/title.keys for title-key NCAs, NCZ bodies, Eden NAND updates. Console cards: the glyph's drop-shadow was clipped by its own mask box. Checked: npm test (155), the reader inside Electron 44 on an OpenSSL-encrypted NSP with keys in Eden's folder, vite build, launch check, before/after render of the card. Owner to test: a game's Add-ons version line for NSP, XCI, NSZ games and an update installed in Eden; console cards on the TV.

## 4 Oct 2026 · 0.9.29 The Syncthing Update (built and released)

Owner: "take everything we discussed and start building this update", plus optimisation so it feels fluid anywhere (choppy on the ROG Ally), and Settings → Syncthing tabs Games, Main Server, This Device, merged when this device is the main server. Built everything in docs/plan-0.9.29.md.

Decisions taken without the owner (said in the release message): the saves rule stays for Cartridge itself (it never writes a save); Syncthing changes saves only in folders the user made Cartridge set up, versioning always on; restore and Make Two-Way only on the user's choice. Existing Syncthing setups: the main-device option isn't offered at all. Push behaviour: Syncthing's normal always-on syncing for now (pause while playing is still the owner's to decide). PSN sign-in for PS4 names not built (owner to decide). Ryujinx left out of syncing (its save index differs per device). Optional folders (states, BIOS, keys) not offered.

Found: the Ally runs Game Mode at 1080p, so the existing rules draw in software; GPU Always is opt-in with an automatic revert. Start's clock clouds kept animating without the GPU because of a specificity bug (half a core while idle).

Checked here: npm test (147), vite build, launch check, Playwright on the mock RomM and a fake Syncthing REST server (main-device setup, pairing a waiting device, merged tab, Games tab with matched and unmatched saves, overview copies), CPU per focus move measured before and after. Owner to test on devices: two devices with Syncthing (blank on one, join from the other, a save syncing, Make Two-Way, Older Versions), GPU Always on the Ally, controls after closing a game started from Cartridge (send the log if it still needs a tap), Recently Launched, Xbox 360 names, Switch saves matched.

Then the owner sent four photos and a list for the same update: emulator widget at 1x1, 4K picture search stacked, Steam pill moving the bar (now a ring round the Steam logo), clipped counts, shadPS4 typed numbers, hold A to expand trailing text with B to close, trophies widget names and every system, Openverse 401, menus A to Z, gentler row rolling, picture motion, Cemu packs missing, Steam collections listing every system and updating live, Rename/Keep Mine and Apply, Syncthing textures called saves and main server folders not openable, PS3 updates twice, controls dead after a game on a desktop PC. All built. Causes: Openverse allows 20 per page without an account; Cartridge never downloaded Cemu's community graphic packs (Cemu does it from its own menu); collection renames weren't shown until Steam saved its file; on the desktop the pad waited for window focus that Steam kept after the game. Checked: npm test (149), vite build, launch check, hold A expand in Playwright. Owner to test: collections apply with real Steam, Cemu packs on a Wii U game, controls after a game on the PC, ring while adding games.

## 4 Oct 2026 · Plan for 0.9.29 The Syncthing Update (not built)

Owner after 0.9.28 shipped: next update is "The Syncthing Update", saves first (find every save on the device, know which game it belongs to, Syncthing set up by Cartridge only on a blank Syncthing, the onboarding says so plainly). Multi-language is scrapped for now: remove the Language step, never say more languages are coming. Also next: trophy codes to names, Switch title IDs like Eden. "Don't build anything yet": only docs/plan-0.9.29.md was written, after reading Syncthing's docs and Eden's source. Open decisions for the owner are marked "Owner decides" in the plan (the saves rule exception, extra folders, PSN sign-in, how syncing is pushed).

## 4 Oct 2026 · 0.9.28 The Dock

Owner asked for this as 0.9.27; 0.9.27 (collection names) had already been published, so it ships as 0.9.28. Owner's list (with photos): Dock at the bottom clipping pages and the media bar, Dreamcast logo clipped, page overview as real pages with movement, Recently Played spacing, Emulators flow, console chip clipping, edge clipping in rows; Title Case, touch only working on Start, choppy on handhelds, widget spacing, Syncthing server files, onboarding Back trapped in the installer and smart focus, Syncthing in Game Mode (Decky plugin), Cemu pack choices, GitHub fork updates, Home flash before Start, clock speeding up when the bar moves, storage widget names, hints off by default, Dock colour, bottom as default, widget rework with console widgets and picture/GIF search, Start tips, L1/R1 for pages, add-on downloads on Downloads.

Done: all of it except the two below (details in CLAUDE.md 0.9.28). Causes found:
- Touch: Start's page swipe compared only down and up points, so on that device moves never reached the engine; it now takes moves from every event type and scrolls move-less swipes on release.
- Sideways pages: scrollIntoView scrolled overflow-hidden boxes (Home, rows); they are reset now.
- Syncthing: one shared 20,000-file limit and only this device's folders.

Not done, said plainly: the clock speeding up after moving the bar could not be reproduced here (its position stayed still across bar changes); owner to say which clock and where. The Decky Syncthing plugin isn't installed (Decky's plugins folder is root's, so it needs a password); a systemd user service keeps Syncthing running in Game Mode instead. The Wallhaven and Openverse searches couldn't be reached from the build container (host allowlist), so they are written to their documented APIs and untested.

Added after the first build (owner, same day): Start's rows of games move to their next game by themselves (20 s per row, one row at a time, 45 s pause after you step one yourself; crossfade for the art, slide for the name, the covers glide). Go to Game Page first in the achievements/trophies More. Unnamed PS4 games: shadPS4 keeps a game's name only with the installed game (its param.sfo and decrypted trophy list), so a device with only the synced user folder has just NPWR codes; the name now comes from the other device's RomM trophy note (same set key), and is remembered in titles.json. Needs the game played with Cartridge open on the device that has it installed, linked to a RomM game, with at least one trophy, so the note exists. Owner to test on device: two devices, PS4 game installed on one only.

Checked here: npm test (135), vite build, launch check, Playwright on the mock RomM: touch paths (real touch, down/up only, other-pointer moves, mouse drag, edge swipe, top bar swipe, tap), Dock at the bottom at 1920x1080 and 1280x800, page overview moving a page, big widgets, new widgets.

Owner to test on the device: touch scrolling everywhere (Settings → About → Touch check if not), the Dock on the TV and handheld, the page overview, picture search, Cemu resolution pack choice, frame generation from a game's More, a GitHub-link emulator update, Syncthing in Game Mode, the Games tab with a main server, handheld smoothness.

---

## 4 Oct 2026 · 0.9.27 Collection Names

Owner: Steam console collections should be maker then console (Nintendo Wii, Sony PlayStation 3 and 4, Sega Dreamcast, Microsoft Xbox), and the shadPS4 version toggle belongs on the PlayStation 4 page, not Steam's main page (photo). Done. Checked here: npm test (new name tests), the Collections review on the fake Steam ("PlayStation" now proposes "Sony PlayStation"), vite build, launch check. Owner to test on the device: Settings → Steam → Collections renames, a new download going into the existing collection, the toggle on the PlayStation 4 page.

0.9.26 was published (v0.9.26).

---

## 4 Oct 2026 · 0.9.26 The Touch Update

Owner: touch never worked anywhere (Game Mode or desktop): taps work, but no swiping, scrolling or gestures; other apps on SteamOS scroll fine. Asked for an update only about touch.

Found: driving Chromium with real touch input (CDP touch events) and with mouse-style drags, every page scrolled, so the pages themselves were never the problem: on the device the browser isn't turning touches into scrolling. Rather than depend on that, Cartridge now scrolls every touch itself (`touch-action: none`, the nav.js engine), whichever way the touch arrives. Checked here: real touches (Cartridge scrolls, no double scroll with the browser), touches the browser ignores, mouse-style drags, a tap opens a game, edge swipe goes back, top bar swipe changes tab, touch mode kept (no focus rings), npm test, vite build, launch check.

Owner to test on the device, Game Mode and desktop: scrolling Home, Library, Settings and a menu; flicks glide; a swipe doesn't open a game; left-edge swipe back; top bar swipe; Start arranging by touch. If anything still fails: Settings → About, the Touch check line (it says how touches arrive and who scrolled), and try Look & Feel → Controls → Touch scrolling → The Browser's.

0.9.25 was published (v0.9.25).

---

## 4 Oct 2026 · 0.9.25 Open Emulators

Owner: "Build 0.9.25 just with this: open emulator from Cartridge, Settings, Emulators, Emulators." Done: Open at the top of each emulator's menu. Checked here: npm test, vite build, the handler in the app (a program starts; missing file, Windows build and a file without the exec bit each give a clear message), launch check. Owner to test on the device: Open for an AppImage, a Flatpak and an EmuDeck launcher, in Desktop Mode and in Game Mode (the emulator shows in front, the controller doesn't move Cartridge underneath, and Cartridge answers the controller again after the emulator closes).

0.9.24 was published (v0.9.24, Cartridge-x86_64.AppImage).

---

## 4 Oct 2026 · 0.9.24 Set Up Your Way

Owner's list (with photos): console glyph clipped, page dots (no RS, below the tiles), trophies/storage/week too empty when big, L1/R1 through games on row cards; emulator folders editable, shadPS4 version proof; Start add button, page overview on LT/RT, console widgets, square console cards, logos, any orientation; controls dead after a game, touch, double LT Caps, right to a pop-up's buttons; icon flicker, reinstall relink, Vita3K, Switch icon; Syncthing key and L1/R1; shadPS4 advanced settings in tabs, per-game frame generation; Cemu packs, HenrikoMagnifico, add-on size/author, add-on detail page, Switch IDs and version, add-on downloads on Downloads, Game Add-ons less cluttered, Patches row gone; What's New; onboarding A/B, EmuDeck folders, end on Start with a tour; auto add applies; No internet pill. Extras: weaker-device animations, card weight, frame gen updates shortcuts, Pin a Game picker, varied shine, keyboard from search, page-turn haptics, idle logos, multi-drive plan, Steam collections rework, Cartridge Installer, top bar placement, Metadata page, Licences, Syncthing icon/smarter/onboarding.

Done: all of it (details in CLAUDE.md 0.9.24). Notes:
- A/B hints in the welcome were off centre because `.w-hints span` also matched the button glyphs (now `.w-hints > span`).
- EmuDeck in the background: EmuDeck's setup only runs through its own app (no supported headless mode), so the Cartridge Installer does the same job itself: ES-DE/EmuDeck folders, AppImages in ~/Applications, saves and storage linked in, its own launch options.
- Steam collection rename live uses Steam's collection object (`m_strName`, or `SetName` when a build has it) and reads the name back; if it didn't stick, the helper renames it in the cloud-storage file while Steam is closed. Never run against a real Steam client yet.
- Multi-drive: planning only, `docs/plan-multidrive.md`.
- Owner, after the first push: the installer's folders and links only on a fresh setup (nothing found), so existing setups aren't touched; RS on Start round like a thumbstick.
- Owner, later: emulators and forks from a GitHub link (last card on the Emulators page); the shadPS4 version line behind a Settings → Steam toggle, off by default.
- CI: every push since emuPaths' test failed: it moved folders to /mnt/..., which `setPath` creates; fine as root here, EACCES on CI. Now inside the test's temp home.

Answered: RPCS3 patches already follow the installed game version. Gemini's GTK4 idea isn't possible in Electron. HenrikoMagnifico's site can't be reached from the build container; the app reads it live on the device (7-day cache) with a built-in list as fallback.

Checked here: `npm test` (132), vite build, Playwright on the mock RomM: Start tiles at 1280x800 and 1920x1080, top bar placements, Steam Collections review and rename through the helper (fake Steam), welcome Syncthing step, Cartridge Installer location and pick steps (Emulation folder made).

Owner to test on the device: Steam Collections rename with live changes on and off; the console collection toggle after review; Cartridge Installer on internal and on an SD card (links in Emulation/saves and storage); Syncthing install from the welcome and a folder share; emulator Folders change for RPCS3 and Eden; Cemu graphic packs; controls after closing a game in Game Mode; touch in Game Mode; top bar at the bottom and left on the TV; Start L1/R1 and page overview.

Still blocked: installing Graphify and the skills (the environment's safety check).

---

## 4 Oct 2026 · 0.9.23 Make It Yours

Owner's list (after reading the other account's handover): Vita3K update bricked the AppImage and installs still failed; Emulators delete/redownload, stable vs nightly, page link, Flatpak updates too slow, shadPS4 versions; add-ons install per emulator automatically, more texture pack sources (not PS2), shadPS4 and GoldHEN patches as tabs, Switch IDs and version, RPCS3 patches follow the game version; per-game emulator settings; instant Home hero, wider backgrounds, Switch icon size, media bar bugs; calmer animations like Start; a Start overhaul (pages on the right stick, widgets, custom HTML and pictures, tile-move bug, rows, Surprise me, trophies per console, console cards, 1x1 play time, wording, add button, Start by default); keyboard rows, Settings left/right, touch cursor, onboarding wording; Syncthing integration; Cartridge closing in Game Mode when another game closes.

Done: all of it (details in CLAUDE.md 0.9.23). Causes found:
- Vita3K: its Linux zip is a Qt 6 build; SteamOS has no Qt 6, so the zip update made Vita3K unopenable. Installs: Vita3K's `init_apps_list` exits when `ux0/app` is missing.
- Tile-move bug: `settle` changed every tile for good on each step of a drag; a tile pushed down never came back.
- Keyboard rows: `pickRow` only kept the column inside one parent element; each key row is its own element.
- Game Mode closing: most likely a SIGTERM/SIGHUP reaching Cartridge as Steam ends the other game; logged as "got SIGTERM while another app was in front". Owner to confirm on the device; if it still closes, the log line says which signal.

Answered: RPCS3 patches already follow the installed game version (0.9.21, `rpcs3List`). Texture catalogs: no machine-readable source for HenrikoMagnifico and others (their sites can't be reached from here), so they are Featured links plus Install a Download. Gemini's GTK4/libadwaita idea isn't possible in Electron; touch is fixed in nav.js instead.

Checked here: `npm test` (122), vite build, Playwright on the mock RomM: Settings left/right, keyboard columns, Syncthing page, Start (opens on Start, arrange, drag away and back, add widgets, pages, right stick, HTML widget runs and can't reach Cartridge), screenshots at 1280x800 and 1920x1080.

Owner to test on the device: Vita3K Repair then a Vita install; a Flatpak update; shadPS4 Versions add and per-game pick; Game Settings for a PS3 and a PS2 game; a PCSX2 patch mod and a Dolphin graphics mod; Switch Add-ons version; leaving Cartridge, running another game and closing it (Game Mode); touch in Game Mode; Start pages with the right stick, widgets, a GIF, a countdown; Syncthing with a main server; Home header speed.

Still blocked: installing Graphify and the skills (the environment's safety check). Slow downloads: still need the log's MB/s line and a browser comparison.

---

## 3 Oct 2026 · 0.9.22 Home Fix

Owner: Home showed, then after down twice or right once everything disappeared, and no headers showed. Cause: a name clash in Home.vue (`heroArt` the computed vs the store function, not imported), a TypeError in render from 0.9.21. Checked with the stub harness: 0.9.21 code ends with 0 rows and no hero after the same moves, 0.9.22 keeps both. Owner to test on the device: Home with SteamGridDB headers, moving through rows.

---

## 3 Oct 2026 · Handover back to the first account

The owner is going back to the first account. The full handover for it is `docs/HANDOVER-0.9.3-to-0.9.21.md` (linked from the top of CLAUDE.md). 0.9.21 is released (PR #37). Open first: the Vita3K Steam shortcut that disappeared, the slow-download question (folder game or one file, LAN or Tunnel), and Vita3K's own install error.

---

## 3 Oct 2026 · 0.9.21 Start, Your Way (read this first)

Owner, after 0.9.20: hide a console page's path; Syncthing view only in its own Settings tab; LT/RT still dead at launch; lag on SteamOS still happens; Start looks AI generated and too snappy: drag to size, any size even a square, resize per edge (touch, D-pad, controller), cool animations, consoles as the Consoles page's boxes, several smaller trophies, a clock scene by time of day; Consoles glyphs clipped; Sega was an S, Microsoft wrong, Nintendo too small; Nintendo, Dreamcast, GameCube, Wii logos small next to Sony and Xbox (never bigger than PS3); Emulators LB/RB on two rows; merge Theme and Background. "Package them into 0.9.21 and just build it."

Done (details in CLAUDE.md 0.9.21): Start board rebuilt on x/y/w/h with tests; arranging by controller (move, corner resize) and by touch/mouse (drag, edge and corner handles); clock scenes; console cards; trophy grid; HVR88 logos with every path; optical sizes for console wordmarks; glyph inset; Sync tab; Theme page; LB/RB row; path hidden.

Causes found:
- LT/RT: Chromium hides a pad until its first press. A trigger pulled first was never "seen at rest", so it was ignored until it was let go. Now the pad's first 400 ms count as at rest.
- Lag: in Game Mode the window keeps focus with Steam or a game in front, so the animated background kept drawing (blur never fires). The `background` event from `watchGamescopeFocus` now stops it and pauses CSS animations. Quitting already ends everything within 3 s (0.9.3); if the owner still sees Cartridge alive after Exit, the next step is a process list from the Ally.
- Sega and Microsoft: 0.9.17 copied only the first path of each HVR88 file.

Added before release (owner): RPCS3 patches for other game versions are left out when the copy's version (APP_VER, update in dev_hdd0 first) is known, unless already on (`rpcs3List`, test in patches.test.js).

Vita3K (owner, photo: Unit 13.zip, "Vita3K didn't install it", "make this a priority"): read Vita3K master main.cpp, interface.cpp, pkg.cpp, app_init.cpp, config.cpp, logging.cpp. A NoNpDrm zip on the command line goes through install_archive -> install_archive_content (extract, then is_nonpdrm -> decrypt_install_nonpdrm with work.bin, native F00D, no outside keys) into cfg.get_vita_fs_path(); "[ID] installed successfully!" then "Content installed, will auto-boot". Its storage: portable/fs next to the AppImage or program, else config.yml pref-path ($XDG_CONFIG_HOME or ~/.config/Vita3K; portable ignores pref-path), else SDL pref path ~/.local/share/Vita3K/Vita3K. Cartridge only searched ux0 folders that existed before, and the error dropped Vita3K's words unless a line said error/failed. Now `vita3kFsPaths` (tested), "Extracting"/"Decrypt layer" lines say where it went, `vita3kWhy` quotes Vita3K (output or vita3k.log), the full output is logged. Not known yet: the exact reason on the owner's Ally; the next failure message will say it.

Also before release (owner): game updates on the game page (always offered for installed PS3 games); Emulators → Updates contrast (status pills and progress bar on a selected row); Eden "couldn't check" (Cartridge asked git.eden-emu.org; the server is git.eden-emu.dev) and no logo (fallback icon URLs on Eden's Forgejo, not verifiable from this container: its network can't reach git.eden-emu.dev or GitHub's API); Xenia "updates in the app" (now from xenia-canary/xenia-canary-releases: Linux .tar.gz or Windows .zip, asset names not verifiable here either). Owner to test: Eden and Xenia Check now and Update.

Then (owner, while it built): RPCS3 update order (answered: all newer updates are downloaded first, then installed one after another, oldest first, each through rpcs3 --headless --installpkg); SteamGridDB heroes only (heroArt); Ready to play starts the Steam shortcut; search closed look; Sign In to Emulators status and list; Get Emulators icons (checked URLs; Ryujinx's and Eden's not checkable from the container) and Xenia Canary; Dolphin tabs, graphics mods (read in Dolphin's GraphicsModGroup/GraphicsMod/HiresTextures source) and the user-folder choice; Vita3K update breaking Steam shortcuts (EmuDeck's zip build overwritten by the AppImage; now same-kind updates). Owner to test: Vita3K Update (should restore the zip build), a Vita game from Steam after it, Dolphin codes and a graphics mod, Ready to play, heroes on Home and game pages.

Last (owner, photo of Add-ons): add-on pictures didn't show (the page's CSP only allowed romimg:/data:, GameBanana previews are https; now `img-src ... https:`). Game Updates, Patches and Add-ons merged into Game Add-ons (search, by console with the emulator, a game opens `GameAddons.vue` with Mods, Texture Packs, Patches, Game Updates tabs; texture info on its tab). Get Emulators and Updates merged into Emulators (Up to date with the green check, or the update). Owner to test: Game Add-ons on a PS2, GameCube, Switch and PS3 game; a GameBanana install and remove (the sheet reopens on the same tab); Apply on Dolphin's tabs; an emulator update from the Emulators page.

Then (owner): GameBanana is mods, keep texture packs apart (Texture Packs = EmuCoreX only, with its pictures); downloads slow again (cause found: one worker and one TLS connection per file, so folder games crawled; local test 1000 small files 1.4 s with one worker, about 89 ms per file the old way); Vita3K gone after its update and "not on Steam" (the update put back the zip build, a plain program, and `installedEmulators` listed AppImages only; folder builds listed now). Not explained yet: the owner's own Steam shortcut for Vita3K being gone. Cartridge never removes a shortcut it didn't add except through Shortcut health's Remove; need the shortcut's old target and Cartridge's log (About → Report a problem) to say more.

**Owner's list, amended (3 Oct 2026):**
1. Console page path: done in 0.9.21.
2. Multi-language: later (1.0 or after).
3. Syncthing saves, view only, own Settings tab: done in 0.9.21 (devices, folders, newest files). Nothing is ever written.
4. Critic score: IGDB's, agreed (RomM has no Metacritic).
5. The empty "structured technical summary" item: ignored (owner).
6. LT/RT at launch: fix in 0.9.21, owner to test.
7. Touch: owner hasn't tested yet.
8. Lag on SteamOS in the background: fix in 0.9.21, owner to test.
9. shadPS4 first launch: fixed (owner).
10. Remove from Steam twice: fixed (owner).
11. Launching from Game Mode bringing Cartridge up first: owner hasn't checked.
12. Slower downloads: fixed (owner).
13. Sony 403: owner hasn't checked.
14. Vita3K installs and booting: owner hasn't checked.

**Owner must test on a device:** Start arranging with the controller (A move, X corner resize, LB/RB corners), touch (hold, drag, edges) and the mouse; tile sizes from 1 by 1 up; the clock at different times of day; LT/RT right after launch; Game Mode lag with a game in front; the console logos on Consoles, game cards and Achievements; Settings → Sync with Syncthing running; Game Add-ons and the merged Emulators page.

---

## 3 Oct 2026 · 0.9.20 Start, Refined

Owner installed the taste skill by asking ("install them now"), then "Go build 0.9.20" after being told the 0.9.19 top bar used only part of the taste skill and Start used none of it. Skills copied into `.claude/skills` (taste-skill, redesign-skill, soft-skill, minimalist-skill, img2threejs; third-party text kept as published).

Redesign audit findings (Start and top bar), fixed in 0.9.20: every tile carried an icon plus muted label (the templated "eyebrow on every section" rhythm); counts in tile corners; cover rows half empty; every tile the same flat grey (no background diversity); everything mounted at once; the Y glyph in the search pill even without a controller; search pill unbalanced. Kept: the icon-tab pattern from the owner's photos, one accent line, the 8 by 4 grid.

Bug found while checking at 1920: `:global(body.pad-mode) .x` in a scoped style compiles to `body.pad-mode { ... }`. Three motion-reduce rules in 0.9.19 had the same form (harmless but never applied); all fixed.

Owner after seeing the build: "I don't like the white underline I like what we had before with the white highlight and contrasting colour but redone, use taste skill". Done before merging: the underline became a white pill behind the current tab (dark text, soft top light, shadow tinted to the bar, 380 ms glide on transform and width, a ResizeObserver keeps it hugging the opening name); keyboard/pad focus is now a white ring so it can't be confused with the current tab; a tab badge inverts on the pill.

Then: "the start menu widgets look very bad like clock played this week free space redesign them using the taste skill". Clock: sky light from the sun or moon's place on a 6 to 18 path (no location, so round numbers), light-weight time. Free space: tick gauge, amber when low. This week: day played most, today's minutes over its bar, dots for empty days, staggered rise.

**Owner must test on a device:** the Start clock, free space and week tiles in each size (X cycles them), the tab pill gliding with LT/RT in Game Mode, Start's new look and entry animation in Game Mode (software rendering: the blurred backdrops are static, check scrolling stays smooth), search button with mouse and with a controller.

---

## 3 Oct 2026 · 0.9.19 Start (read this first)

Everything in `docs/plan-0.9.19.md`, built as the owner asked ("don't ask me any questions"). Decisions made without asking, per that instruction:
- Start's name is "Start"; its tile look follows docs/design.md, not the photographed frontend's widgets (owner disliked those). Default layout: Continue playing 4 by 2, Clock, Storage, This week, Consoles, New, Recently played, Latest trophies. Open on stays Home by default.
- Top bar follows the photographed frontend's pattern (icon tabs, the current one with its name), read through the taste skill: one accent line, no wordmark, search folded.
- The taste and img2threejs skills could not be copied into `.claude/skills` (the session's permission check refused writing there): the owner needs to add them, or allow it. The taste skill was read from a local copy and applied.
- Console scenes removed; four style backgrounds added. Picked scenes fall back to that console's games panning.
- Vita: only NoNpDrm dumps still need Vita3K (it alone can decrypt them); unencrypted ones never start it.
- Ryujinx/Eden: their own Forgejo servers first, then GitHub, then Flatpak. Asset names could not be checked live (the container can't reach GitHub's API or those servers); patterns follow EmuDeck's install scripts.
- 403s: the hosts are blocked from the container, so the hidden-window pass is untested against the real sites.
- PS3 "serial not found": two more fallbacks in 0.9.18; still waiting on the owner's folder layout if it persists. Remind about the v2.3.1 tag.

**Owner must test on a device:** Start (hold A, sizes, moving, touch drag, Pin to Start, Open on), the new top bar at 1280x800 and 4K, page transitions in Game Mode (software rendering), the four backgrounds (speed with light effects), a Vita .vpk install and a NoNpDrm one, RPCS3 patches list, RA/GameBanana/Sony without 403s, Get Emulators for Eden, Ryujinx, shadPS4, Xenia Edge, an .xci's mod folder, Settings → Storage → Sync with Syncthing running.

---

## 2 Oct 2026 · 0.9.18 (read this first)

Owner sent the Vita3K error ("no Qt platform plugin could be initialized", installing Unit 13): Cartridge ran Vita3K with `QT_QPA_PLATFORM=offscreen` and that build has no offscreen plugin. Now retried on the normal display. Texture packs per game with the right paths (owner's ask): layouts per emulator in `addonInstall.plan`. PS3 serials: two more fallbacks, still unconfirmed on the owner's games (needs a folder layout or log if it still fails). Remind the owner about the v2.3.1 tag later (owner asked). The owner asked for a list of everything not yet built before more building starts: given in chat, wait for their pick.

**Owner must test on a device:** a Vita .vpk/.zip install and Vita firmware; a texture pack each in PCSX2, DuckStation, PPSSPP, Dolphin, Azahar, a Cemu graphic pack, a Switch mod; the PS3 games that said "serial not found".

---

## 2 Oct 2026 · 0.9.17 second list built (read this first)

The owner added 22 items to 0.9.17 (plan section 10) and wanted them all in this update. All built; see CLAUDE.md 0.9.17 and RELEASE_NOTES.md.

**Decisions and notes:**
- Top bar: the owner asked for the design skills ("taste" skill isn't in `.claude/skills`; apple-design and emil-design-eng were used). Words-only tabs with a sliding underline, LT/RT only with a controller.
- Vita3K install error: the owner said "Getting this error" but no text came through. Ask for the message.
- Sony, GameBanana and metadata.ppsspp are blocked from the container: the 403 fixes (net.fetch, HTTPS for Sony) must be checked on a device.

**Owner must test on a device:** the welcome (animation, controller step, keyboard, Flatpak offer, Download emulators flow, without RomM), Roll back, Steam keyboard in Game Mode, emulator updates (RPCS3 sticking), Gecko codes in Dolphin, RPCS3 patches list, the top bar at 1280x800 and 4K, press feedback with a controller.

---

## 2 Oct 2026 · 0.9.17 built and released (read this first)

Everything in `docs/plan-0.9.17.md`. Remind the owner: check the PS3 games that said "serial not found", and the stray v2.3.1 tag.

**Decisions and notes:**
- Add-ons button: the owner said add-ons now live in the emulator settings; the game page keeps More → Emulator → Add-ons (same sheet).
- GameBanana is still blocked from the container: its API is built from public client code (apiv11) and must be checked on a device. The PS2 catalog (EmuCoreX) was read live: 769 packs parse.
- Podman: SteamOS 3.5+ ships it; what's missing is /etc/subuid ranges (sudo once, password never kept). podman-launcher when there's no Podman at all.
- Emulator downloads: GitHub AppImages (asset patterns not checked live for eden, ryujinx, shadps4 launcher, flycast); Flatpak for Dolphin, PPSSPP, melonDS, RetroArch. Citron has no GitHub releases, so it isn't offered.
- Moved to 0.9.18: more console scenes, the small cleanups.

**Owner must test on a device:** Frame Generation with lsfg-vk and MAKO; shadPS4 version per game; multi-disc playlists in DuckStation/PCSX2/Dolphin; PS2 texture pack install; a GameBanana mod; Podman setup on SteamOS (password step) and Bazzite; Get Emulators downloads; BIOS from RomM into emulators; game folders in PCSX2, DuckStation, Dolphin; CHD/CSO/GCZ/PBP games show their serials.

---

## 2 Oct 2026 · 0.9.17 started

Owner's list for 0.9.17 is `docs/plan-0.9.17.md`. Research done before building:
- ARMSX2's texture catalogs: dl.ps2ktxpak.net (ASTC, phone only) and sashkinbro/EmuCoreX-Textures `textures.json` (PNG/DDS, serials, SHA-256, parts). Cartridge uses EmuCoreX.
- gamebanana.com is blocked from the container (curl and fetch); its API is built from public client code.
- SteamOS 3.5+ ships Podman; it needs /etc/subuid ranges (sudo once). podman-launcher for systems without.
- lsfg-vk: Decky LSFG-VK writes `~/lsfg` (and `~/.lsfg`); MAKO: `~/.local/bin/mako-run %command%`.
- shadPS4 Qt launcher: `-e <name|path>`, versions in `<XDG_DATA_HOME or ~/.local/share>/shadPS4QtLauncher/versions.json`.
Owner said shadPS4 now works. Remind the owner to check the PS3 "serial not found" games.

---

## 2 Oct 2026 · 0.9.16 built and released

Everything in `docs/plan-0.9.16.md` sections 1 to 8, as one update "0.9.16 · Your Emulators". Remind the owner about the stray v2.3.1 tag.

**Decisions and notes:**
- Game page header holds only Ready to play and More (owner, list 2 item 11), so the planned Add-ons button (section 2) was not added: Patches and Texture packs live in More → Emulator, and Settings → Emulators has Patches and Texture Packs pages.
- Add-ons downloads (section 1): GameBanana and libretro's buildbot are still blocked from the cloud container, so no texture pack or mod downloads. What was built uses each emulator's own source: RPCS3's patch API, PPSSPP's cheat list (metadata.ppsspp.org/cheats.json, fallback the CWCheat Database Plus it lists), Dolphin's shipped GameSettings. Texture pack downloads need the owner to paste GameBanana responses.
- Podman (section 4): a user-level copy isn't possible without the system (newuidmap/newgidmap setuid and /etc/subuid). The clear message stays. RomM has no server name setting: the name is Cartridge's label (Settings → RomM, welcome).
- Backgrounds (section 5): the picker lists your five most played consoles first; only PS2, GameCube, Wii, Xbox 360 and Switch have scenes, the rest use their games' art.
- Nintendo has no maker logo (Simple Icons has only an "N"); it stays text.

**Owner must test on a device:** download speed (worker threads); controller movement everywhere; PS3/Vita firmware from RomM; PS3 game updates (Sony's list is plain HTTP); emulator updates (AppImage asset names per emulator are from their release pages, not checked live); textures on; Dolphin and PPSSPP cheats in game; RetroAchievements sign-in; Switch/Cemu mod folders; RVZ/WBFS IDs.

---

## 2 Oct 2026 · 0.9.15 released, 0.9.16 listed

0.9.15 merged (PR #31). The owner moved everything left over from 0.9.15 into 0.9.16, with the Add-ons downloads: `docs/plan-0.9.16.md`. Not started; build when the owner says so. Remind the owner about the v2.3.1 tag.

---

## 2 Oct 2026 · 0.9.15 built

The owner merged 0.9.3 M into the 0.9.4 plan and asked for one update called **0.9.15** (version, versionName and release title all "0.9.15"). Plan: `docs/plan-0.9.4.md`. Built: all of section F, section 0 (welcome), section 1 (RomM on this device), and the checkable part of section 2 (Add-ons).

**Owner's picks in chat:**
- F15 console backgrounds: **A + B for the top five** (from live mockups). Scenes (B) for PS2, GameCube, Wii, Xbox 360, Switch; every other console uses its own game art (A, `art:<slug>`). Retired styles wiiu, ds, n3ds, xbox map to their console's art (`LEGACY_ART`).
- Add-ons: **build what can be checked.** GameBanana, libretro's buildbot and the GitHub API are blocked from the cloud container, so no download sources were built. Done: texture folders and on/off per emulator from their settings (`electron/addons.js`), the game's folder (game More → Texture packs), Settings → Emulators → Texture Packs. Pack, cheat and mod downloads are the next update (0.9.16), once sources can be checked.

**Where things are:**
- `electron/raLogin.js` (Sign In to Emulators): PCSX2 `inis/PCSX2.ini` + `inis/secrets.ini`, DuckStation encrypted token (SHA256 of /etc/machine-id + username, 100 rounds, AES-128-CBC, checked against openssl), Dolphin `RetroAchievements.ini`, PPSSPP `ppsspp.ini` + `ppsspp_retroachievements.dat`, RetroArch `cheevos_token`. RA `dorequest.php r=login2`. Skips running emulators. Tests: `test/raLogin.test.js`.
- F11: `watchGamescopeFocus` in main.js hides the window when a new `reaper SteamLaunch AppId=` for another app appears, shows it (inactive) when focus moves to it (not 769, Steam's UI) or after 45 s.
- Welcome: `src/views/Welcome.vue` (`store.welcoming`, `config.welcomed`, `ui.name`, `ui.welcomeNotice`), embeds `Setup.vue` (`embedded`) and `EmuSetup.vue` (`welcome`). `electron/welcome.js`: EmuDeck app as its install.sh does it, RetroDECK via `flatpak install --user`. `welcome:state`, `deviceKind()` (DMI product name).
- RomM on this device: `electron/rommLocal.js` (Podman pod `cartridge-romm`, MariaDB 11 + rommapp/romm, `label=disable`, port from 8095, `romm-local.env` mode 600, `podman-restart.service`), `src/components/RommLocal.vue`, `config.rommLocal`. First admin through `POST /api/users`.
- Backgrounds: `bgRenderers.js` (`gc`, `artPan`, `LEGACY_ART`), `Background.vue` (`rendererOf`, `art:<slug>`), Settings picker group "Your games".

**Owner must test on a device:** shadPS4 after Update on the PS4 page; launching a Steam game while Cartridge is open in Game Mode (F11); Sign In to Emulators per emulator (DuckStation especially: Flatpak and AppImage); the welcome in Game Mode and Desktop Mode; EmuDeck download and RetroDECK install; RomM on this device on Bazzite (Podman) and what SteamOS says without Podman; the new backgrounds on the Deck in software mode and on the TV.

**Next:** Add-ons downloads (0.9.16) once sources are checked; remind the owner about the stray v2.3.1 tag.

---

## 2 Oct 2026 · 0.9.3 L released, M listed

0.9.3 L merged (PR #30) as version 0.9.14. The owner listed 0.9.3 M in `docs/plan-0.9.3.md` ("0.9.3 M") and said **don't start building yet** (out of credits). Start M only when the owner says so. Remind the owner about the v2.3.1 tag in the next update.

---

## 2 Oct 2026 · 0.9.3 L built (read this first)

Version 0.9.14, versionName "0.9.3 L". Everything in the plan's "0.9.3 L" list except 6 (RetroAchievements sign-in for emulators, owner said yes as a button) and F1 backgrounds: both moved to M. Owner's picks in chat: Trophies All option A (one list); RPCS3 database settings yes.

**Findings worth keeping:**
- shadPS4's own Steam shortcuts (qtlauncher create_steam_shortcut.cpp) write StartDir = the launcher's own folder, which for an AppImage is its temporary mount: gone when Steam starts the game. Cartridge now writes a Start in that never exists (`/tmp/.mount_shadPS4/usr/bin`) for shadPS4 AppImages. Owner to confirm on the Deck.
- EmuDeck's vita3k.sh always runs `Vita3K -Fr <args>`: that broke both Vita installs and Steam launches.
- RPCS3's config database is real: api.rpcs3.net/config/?api=v1.

**Owner to test:** PS4 from Steam after Update on the PS4 console page; Vita install and launch (Update on the Vita page); a PS3 download gets a custom config in RPCS3; pad ignored while Steam's menu is in front (needs xprop on the system); the trophies page; Settings → Steam with and without Cartridge added.

**Next (M):** RetroAchievements sign-in for emulators (read RetroArch, PCSX2, DuckStation, PPSSPP, Dolphin login settings from their source, RA login API with the password once), F1 console backgrounds (mockups first). Remind the owner about the v2.3.1 tag.

---

## 2 Oct 2026 · Owner's list for 0.9.3 L

The owner added 14 fixes for 0.9.3 L (listed in `docs/plan-0.9.3.md`, section "0.9.3 L"), plus F1 backgrounds carried from K. Two of them were questions, answered in chat:
- **Sign in to RetroAchievements in every emulator:** technically possible for RetroArch, PCSX2, DuckStation, PPSSPP and Dolphin (each keeps an RA user and login token in its own settings), but Cartridge only has the Web API key, which can't log an emulator in: it would need the user's RA password once, and it means writing emulator settings (a third exception to "never modifies emulator files"). Owner to decide.
- **PS3 settings from a database at download:** RPCS3 reads per-game settings from `config/custom_configs/config_<SERIAL>.yml`, so writing one is possible. But there is no machine-readable database of recommended settings (the RPCS3 wiki has them as prose per game), and it is again writing emulator files. Owner to decide.

---

## 2 Oct 2026 · 0.9.3 K built (read this first)

Everything that needed no decision, plus the owner's picks (entry below), in one update: version 0.9.13, `versionName` "0.9.3 K". Details per feature are in `CLAUDE.md` (0.9.3 K section) and `RELEASE_NOTES.md`.

**Built:** E2 one trophy home; H1 recommendations with reasons (IGDB optional); B3 rumble; F6 quiet connection icon; G4 A (Look & Feel pages + Advanced) and G4 B (one bottom sheet with tabs); shadPS4 core launch choice (A10 test); E6 shadPS4 trophy lists decrypted into Cartridge's cache; E1 names for code-only trophy games; D7 PCSX2 patches; F2 bigger, edgeless headers; F3 sharpest SteamGridDB heroes (headers, idle); H2 RomM version check in Issues; K1 Xenia Windows build through Proton; K2 Flatpak Steam through flatpak-spawn --host; B1 stick hysteresis and dominant axis; J13 tests (Shortcut health, Flatpak Steam, recs, TRP, PCSX2); J14 HANDOFF.md updated.

**Checked here:** `npm test` (all pass), `vite build`, screenshots at 1280x800 and 1920x1080 of Achievements All, the sheets, Look & Feel pages, Home.

**Not done, with reasons:**
- F5 company logos: needs artwork; drawing Sony, Nintendo or Sega logos would copy their trademarks. Needs the owner's call on a source.
- BigPEmu (K1): closed source, so its launch line can't be read from source (the rule for new emulators).
- E1's built-in list of trophy codes to names: no reliable public source to copy; names come from RomM notes and the library instead.
- J6 performance: can't be measured meaningfully in the cloud container (no real art, no device GPU). J11 screen review: only the screens above were reviewed.
- G4 A "hide empty rows everywhere in Settings": not audited row by row.

**Owner to test on a device:**
- PS4: pick "shadPS4 core · without the launcher" on the PS4 console page, Update the shortcut, start a game from Steam; then send shadPS4's log: `~/.local/share/shadPS4/log/shadps4.log` (current builds; the old name was shad_log.txt).
- PS4 trophies show names for games played before the key was set.
- PCSX2: Patches on a PS2 game that PCSX2 has in its game list; check PCSX2 shows it on.
- Rumble in Game Mode (Steam's controller rumble must be on). Stick feel.
- Flatpak Steam (if anyone has it): the Issues entry, then a game starts.
- Sharp headers need a SteamGridDB key.
- Reminder for the owner: the stray `v2.3.1` tag (asked to be reminded in this update).

---

## 2 Oct 2026 · Owner's picks for 0.9.3 K (decided in chat)

The owner asked for everything not yet built that needs no decision, plus the Discuss items, to ship together as **0.9.3 K** (version 0.9.13). Picks:
- **E2 Trophies:** A, one trophy home (RetroAchievements and Trophies & Gamerscore in one page, latest unlocks from both, games by console, LB/RB filter by source).
- **F1 Console backgrounds:** moved to **0.9.3 L**, not in K.
- **F6 Connection pill:** A, quiet icon next to the clock (house LAN, globe Tunnel, white), colour only when offline.
- **G4 Clutter:** C, both: Look & Feel split into short pages with an Advanced group and no empty rows, and one shared bottom sheet for secondary menus.
- **H1 Recommendations:** IGDB's similar games when the server has them, but it must work without IGDB: genres, series, developer from whatever metadata RomM has, weighted by play history, with a short reason on each card.
- **I1 Syncthing:** moved to 1.0, not built.
- **shadPS4 A10:** add a way to launch the shadPS4 core directly (not the Qt launcher); the owner tests it from K and sends `shad_log.txt`.
- **v2.3.1 tag:** remind the owner again in the next update.

---

## 2 Oct 2026 · Morning summary of the night run

**Released overnight**, each after npm test, vite build, screenshots and a green branch test build (PRs #22 to #28):
- **0.9.3 D** Vita games through Vita3K; PS3 `.rap` licences found in the download or RomM, no install without; package games wait for the install before Steam; shorter grouped More menu.
- **0.9.3 E** PS3 patches (RPCS3's own list, saved in RPCS3's patch settings).
- **0.9.3 F** PS4 patches (shadPS4's own patch files).
- **0.9.3 G** Refresh Library, title case, plain Trophies tab, Hide and Hidden Games, RetroAchievements filter and sort.
- **0.9.3 H** One RomM tab in Settings, Report a problem, full device names, shadPS4 trophy key guide.
- **0.9.3 I** Score and age rating badges, logos on the idle screen.
- **0.9.3 J** RomM data read defensively (contract test), per-game emulator test, CLAUDE.md 0.9.3 summary.

**Needs the owner**
- Pick options for the Discuss items: `docs/options-0.9.3.md` (E2, F1, F6, G4, H1, I1).
- shadPS4 first-launch: the direct core test or the `shad_log.txt` tail (see the evening entry).
- Device tests: Install in RPCS3 with a `.rap` from RomM, Get licence on Tokyo Jungle, Vita installs, Patches on a PS3 and a PS4 game, Report a problem QR, Refresh Library.
- The stray release branches `claude/relaxed-fermat-30pigp-release-g` and `-release-i` can be deleted (each holds an exact tested commit that was merged).

**Not done** (reasons in the entries below): PCSX2 patches, E1, E6, F2, F3, F5, K1, K2, J6, J11, HANDOFF.md rewrite, H2's start-up RomM version check.

---

## 2 Oct 2026 (night run) · 0.9.3 J (plan H2, J13, CLAUDE.md)

- **H2** `electron/romm.js`: `slimRom`, `userOf`, `logoPath`, `hltbHours` moved out of main.js and hardened (`arr`/`str`/`obj` guards). `test/romm.test.js`: a RomM 4 game, an old server's bare game, null and odd values. Not done from H2: a RomM version check at start that turns features off cleanly.
- **J13** `test/detect.test.js`: emulator for one game beats the console pick and falls back when gone (`_templateFor`, `_templateForGame` exported for tests).
- **CLAUDE.md**: a 0.9.3 section summarising everything shipped in parts A to I.
- 43 tests pass. K1 (Xenia Windows build through Wine, BigPEmu) not done: BigPEmu is closed source, so its launch options can't be confirmed from source (the rule for new emulators).

---

## 2 Oct 2026 (night run) · 0.9.3 H released, 0.9.3 I (plan F8, F4) and the Discuss options

- **H** merged (PR #26).
- **Options for every Discuss item** (E2 trophies overhaul, F1 console backgrounds, F6 connection pills, G4 clutter, H1 recommendations, I1 Syncthing) are in `docs/options-0.9.3.md`, with a recommendation each. Nothing built for them: the owner picks first.
- **F8** Game.vue info box: `score` (igdb_metadata.aggregated_rating, else metadatum.average_rating, shown on 100, coloured) and `age` (igdb_metadata.age_ratings[].rating_cover_url image, else a text badge, PEGI white or ESRB black); the text "Rating" row hides when the badge shows. Field names are read defensively: verify against a real RomM response.
- **F4** IdleScreen.vue: `GameLogo` and `ConsoleMark` in the caption (text when there is no logo).
- Checked: `npm test` 39 pass, `vite build`, screenshots (info box badges at 1920x1080, idle screen at both sizes).
- Not started tonight (need research or the owner): PCSX2 patches, E1, E6 (decrypting trophy00.trp), F2, F3, F5 (company logos need artwork), H2, K1, K2, J6, J11, J13, J14.

---

## 2 Oct 2026 (night run) · 0.9.3 G released, 0.9.3 H (plan G1, K3, F7, E7)

- **G** merged (PR #25) from `claude/relaxed-fermat-30pigp-release-g`, a branch holding exactly the commit G's test build passed on (newer local commits were not in that build). That branch can be deleted.
- **G1** Settings: Connection, Library & Sync and RomM are one `romm` section (`OLD_SEC` maps old `conn`/`sync`/`folders` values).
- **K3** `src/components/ReportProblem.vue` in About: `setup:report` (already scrubbed), Copy, GitHub new-issue link with the report (cut at 6000 chars), QR code (first 1200 chars).
- **F7** GameCard: `extra` (device name, play time) on its own wrapping line (`.card .sub.extra`).
- **E7** TrophyPanel: `shadNoKey` from the sources' `note === 'nokey'`, a short guide.
- Checked: `npm test` 39 pass, `vite build`, screenshots (RomM tab, Report a problem with QR, Recently played) at 1280x800 and 1920x1080.

---

## 2 Oct 2026 (night run) · 0.9.3 F released, 0.9.3 G (plan G2, G3, E3, E4, E5)

- **F** merged (PR #24) after a green test build; E's release passed.
- **PCSX2 patches: not built yet.** PCSX2's CRC is a 32-bit XOR of the game's ELF (`Elfheader.cpp` GetCRC), but most PS2 games are CHD, and PCSX2's own patch database lives in `patches.zip` inside its install (AppImage). Needs: reading the ELF from CHD/ISO (or PCSX2's game list cache), and reading `patches.zip`; switching on is per game in `gamesettings/<SERIAL>_<CRC>.ini` `[Patches] Enable = <name>`. Researched, not started.
- **G3** Quick Menu: one Refresh Library (`library:refresh` in main.js: scan when allowed, then sync; `refreshLibrary` in store.js).
- **G2** title case: Quick Menu items, Settings headings Top Bar, Undo & Clean Up, Storage Manager, Check Downloaded Games.
- **E3** Achievements tab switch: plain "Trophies & Gamerscore", marks both 20 px; the duplicated CSS in Achievements.vue (a known cleanup) removed.
- **E4** "Hide"/"Unhide" on a trophy game; Settings → Achievements → Hidden Games (`loadHidden`, names from `trophies:overview`).
- **E5** RetroAchievements tab: console filter and sort for Recently played (`played` computed in RaPanel.vue).
- Checked: `npm test` 39 pass, `vite build`, screenshots of the Achievements tab and Settings → Achievements at 1280x800 and 1920x1080.

---

## 2 Oct 2026 (night run) · 0.9.3 E released, 0.9.3 F (PS4 patches)

- **E** merged (PR #23) after a green test build; D's release passed.
- **F: shadPS4 patches** (read from the Qt launcher's `common/memory_patcher.cpp` and `qt_gui/cheats_patches.cpp`): `shadDirs` (`$XDG_DATA_HOME/shadPS4` or `~/.local/share/shadPS4`, with `patches/`), `ps4Version` (APP_VER from `<game>-UPDATE`, `<game>-patch`, else the game's `sce_sys/param.sfo`), `shadList` (each repository's `files.json` maps XML files to serials; `<Metadata>` with AppVer equal to the game's, or `mask` = any version), `shadSet` (only the `isEnabled` attribute of the matching tags changes, the rest of the file stays byte for byte; one-time `.cartridge-backup` next to it). main.js: `ps4PatchState`, `EMU_PATCH` table (rpcs3, shadps4) behind `patches:list`/`patches:apply`; `patchMine` keeps one record per emulator. Game page: Patches for PS3 and PS4 games.
- Tests: shadPS4 list by version and mask, only isEnabled changes, never turns off the user's. 39 pass.
- **PCSX2 next**: its patches are `.pnach` files named by the game's CRC (computed by PCSX2 from the game's ELF), switched on per game in `gamesettings/<SERIAL>_<CRC>.ini` `[Patches] Enable = <name>`. Needs reading the ISO's SYSTEM.CNF and ELF to get the CRC: read PCSX2's source for exactly how before building.

---

## 2 Oct 2026 (night run) · 0.9.3 D released, 0.9.3 E (PS3 patches)

- **0.9.3 D** merged (PR #22) at the start of the night run; its test build had passed.
- **E: RPCS3 patches** (`electron/patches.js`, read from RPCS3's `Utilities/bin_patch.cpp`): `rpcs3Dirs` (`~/.config/rpcs3` or the Flatpak's; `patches/` holds patch.yml, imported_patch.yml, `<serial>_patch.yml`; switches in `config/patch_config.yml`, older RPCS3 next to `patches/`), `parseSfo`, `ps3Version` (APP_VER, an installed update in dev_hdd0 wins), `rpcs3List(dir, serial, version, mine)` (matches Games > title > serial > [versions or All]), `rpcs3Set` (hash > description > title > serial > version > `Enabled: true`; turning off only what is in Cartridge's record; prunes empty maps; backup `patch_config.yml.cartridge-backup` once). YAML is read and written with js-yaml's FAILSAFE schema so `01.00` stays text (now a direct dependency). Record of what Cartridge turned on: `patches.json` (`patchMine.rpcs3`).
- `main.js`: `patchState`, `ps3Serial`, handlers `patches:list`, `patches:apply`. UI: `src/components/PatchesSheet.vue` (modal `patches`: ticks, Apply, "On in RPCS3" rows can't be turned off), game page More → Steam and emulator → Patches (PS3 games on this device).
- Tests: `test/patches.test.js` (SFO, version from an update, list by version, on/off keeps the user's entries, never turns off the user's). 37 pass.
- Next: shadPS4 and PCSX2 patches (F), each from its own source.

---

## 1 Oct 2026 (evening) · Decisions before the night run

- **PS4 .pkg (D4): dropped** by the owner. Don't build it.
- **shadPS4**: `-i` (no IPC) before `-d` did NOT help: still a black screen for a while, then it closes. So the IPC handshake is not the cause. Next step, asked of the owner: start the shadPS4 core directly (the version the Qt launcher selected, `versionSelected` in the launcher's settings under `~/.local/share/shadPS4QtLauncher`) with `-g "<eboot.bin>" -f true`, and send the tail of `~/.local/share/shadPS4/log/shad_log.txt` after a failed launch. Don't change PS4 shortcuts in code until there is a log or that test result.
- **Night run**: the owner is in Dubai (UTC+4) and runs out of credits until 1:30 a.m. there (21:30 UTC). A scheduled wake at 21:31 UTC continues the work unattended: first make sure 0.9.3 D (commit after 02f8039) is merged and released, then build patches (D7: RPCS3 first, then shadPS4, PCSX2), releasing each finished, tested part as the next letter (0.9.3 E, F...) by the usual rule (test build green, then PR and merge). Log every part here.

---

## 1 Oct 2026 · 0.9.3 D, with fixes from the owner's first PS3 package test

**Owner reported** (photo): an installed PS3 package game (NPUA80523) failed to boot from Steam with "Failed to decrypt content", and the game didn't appear on the PS3 console page in Steam settings (had to add it from the game page). Asked that D (Vita) be checked for the same before release; D's automatic merge was cancelled until then.

**Cause and fix**
- Licence: PSN packages (PKG metadata DRM type 1 or 2) need `<content ID>.rap` in RPCS3's `dev_hdd0/home/<user>/exdata`. RPCS3 copies a .rap under the file's own name, so a missing or differently named .rap means "Failed to decrypt content". `pkgInfo` reads the DRM type; `licencePlan` picks the licence (download under its right name, the only loose .rap renamed, one you picked, or already in RPCS3); `stageLicences` copies renamed ones into a temp folder under the right name before RPCS3 installs them. The install record keeps `needs` (content IDs). `installedLicences` (main.js) says what an installed game still lacks (`npdOf` reads the content ID from EBOOT.BIN's NPD header for games installed before this). UI: asks for the .rap before installing (or install without), "Add licence (.rap)" button and More item (`pkg:addLicence`, 16-byte .rap only).
- Steam: `gameRef` returns `missing` for a PS3 game with packages that isn't installed yet, so the console page shows it blocked with the reason and plans skip it; the automatic add at download is held back for these (`it.notice === 'pkg'`); `afterInstall` updates the game's own shortcut (`refreshGame(romId, { force: true })`) or adds it when Add automatically is on. Not 100% sure this was the owner's console page case: re-check on device.
- Vita (same check for D): Vita games were already blocked until installed; added `vitaLicenced` (work.bin in the game or a .rif in ux0/license) and a clear message when an install has no licence.
- Tests: licence plan cases, NPD header, Steam waits for install, Vita licence. 32 pass.

**Then the owner asked** (photo of the long More menu): group More into sub menus; and .rap files live in RomM: never ask, find the .rap and install it with the .pkg, refuse with "RAP file not found" when it isn't anywhere, and say before installing that a .rap is needed. Done: `rapsFromRomm` (the game's own RomM files, then RomM entries named after the content ID or title ID; downloaded to a temp folder), `installPkg` throws "RAP file not found" when still missing, `pkg:addLicence` finds it the same way (no picker), button "Get licence (.rap)". More is now 7 items: favourites, play status, collection, timeline, Steam and emulator (list), Details and artwork (list), hide; B in a list returns to the first one (loop around `choose`).

**shadPS4**: owner described the failure: black screen about 30 s, then it closes; works once after launching from shadPS4's own window. The core waits for the launcher's START over IPC with no time limit (`ipc.cpp` WaitForStart), so the leading theory is the headless launcher not sending it. Asked the owner to try `-i` (launcher's no-IPC switch) before `-d` in Steam launch options. Not changed in code yet.

**PS4 .pkg (D4)**: recommended leaving it out (needs fake-PKG keys in a public MIT repo); waiting on the owner.

---

## 1 Oct 2026 · 0.9.3 D (Vita games through Vita3K)

**Owner said**: shadPS4 PS4 games still don't start the first time (after 0.9.3). Asked them for: whether they pressed Update on the PS4 console page, what a failed launch looks like, and `ls` of `~/Documents/Apps`, `~/.local/share/shadPS4`, `~/.local/share/shadPS4QtLauncher` plus the tail of `shad_log.txt`. Read the Qt launcher again (`src/main.cpp`, `qt_gui/main_window.cpp`, `ipc/ipc_client.cpp`): `-d` reads `vm_versionSelected` from the launcher's settings in its launcher dir (`<cwd>/launcher` if present, else `~/.local/share/shadPS4QtLauncher`); the core is started with the launcher's working folder and IPC (`SHADPS4_ENABLE_IPC`, `#IPC_END` then `RUN`/`START`); a RESTART request restarts it from the core's own folder. No cause proven yet: waiting on the owner's answers. Note: if the `user` folder next to the AppImage is the only shadPS4 data, `startOf` leaves Start in unchanged.

**Built**
- `pkgInstall.js`: `vitaPrefs` (config.yml pref-path, defaults, EmuDeck storage), `vitaContent` (Vita .pkg by header platform 2, else .vpk/.zip title ID from `sce_sys/param.sfo` via yauzl; zRIF from a small text file, `KO5i...`), `installVita` (Vita3K main.cpp: `--pkg <f> --zrif <k>` installs headless and quits; a .vpk/.zip installs then opens and boots, so Cartridge waits for it to close). `safeToRemove` is now per emulator (`RULES`: RPCS3 dev_hdd0/game + PARAM.SFO, Vita3K ux0/app + sce_sys/param.sfo). Vita3K's `--deleted-id` is never used (it deletes savedata).
- `main.js`: `installPkg` hands Vita games to `installVitaGame`; `pkg:check` is async and says `emu`, `emuName`, `needsZrif`, `opens`; `emuRoots(emu)`; delete and `pkg:dropDownload` work for both emulators. `steamManager`: `emuCommand(key, re)`, `vita3kCommand`, recorded Vita games start by title ID.
- UI: Game page says Install in Vita3K, asks for a zRIF when none came with the game, "Close Vita3K to finish" while it is open.
- Tests: Vita title ID from a .vpk (a small stored zip built in the test), zRIF from a text file, install through a stand-in Vita3K, delete refusals including savedata. 28 pass.

**Release**: version 0.9.6, "0.9.3 D".

**Owner to test**: a Vita .vpk and a .pkg (with and without a zRIF text file), Install in Vita3K in Game Mode, play from Steam, delete both ways.

**Next**: shadPS4 once the owner answers; D4 PS4 .pkg; D7 patches.

---

## 1 Oct 2026 · 0.9.3 C (PS3 packages through RPCS3)

**Owner's decisions in chat**: skip Redream, Mednafen and torzu. 0.9.3 B was released before this.

**Built**
- `electron/pkgInstall.js`: `pkgInfo` reads the PKG header the way RPCS3 does (Crypto/unpkg.h: magic, platform, metadata content type and patch flag, content ID; the install folder is content ID chars 7 to 15). `packagesIn` orders licences, game, DLC, then updates by name. `rpcs3Hdds` finds dev_hdd0 like trophies.js (vfs.yml, config folder, EmuDeck storage). `install` runs `<rpcs3> --headless --installpkg <file>` per file (rpcs3.cpp: headless installs with no window and always exits 0) with Cartridge's AppImage variables removed, then reads back which game folder appeared. `safeToRemove` holds every D3 check.
- `main.js`: `installs.json` (`installs`, `installRecord` for steamManager), `installPkg`, handlers `pkg:check`, `pkg:install`, `pkg:cancel`, `pkg:dropDownload` (deletes the download, the manifest then points into RPCS3 with `installedIn: 'rpcs3'`), `roms:delete` takes `alsoEmu` and routes RPCS3 copies through `safeToRemove`, Library check skips games living in RPCS3. Finished downloads holding PS3 packages get `notice: 'pkg'`.
- `steamManager.js`: `rpcs3Command()` (the PS3 setup's RPCS3 and what goes before its options), `gameRef` starts recorded games with `%RPCS3_GAMEID%:<serial>`.
- UI: Game page Install in RPCS3 (progress, cancel), offer to delete the package, More "Install again in RPCS3", Delete asks download only or download and RPCS3 copy. Downloads and the finish toast point to it.
- Tests: `test/pkg.test.js` (header, order, install through a stand-in RPCS3, vfs.yml, every delete refusal), serial launch in `test/steam.test.js`. 25 pass.

**Release**: version 0.9.5, "0.9.3 C".

**Owner to test**: a PS3 game from RomM as .pkg (with a .rap if it needs one, and an update if you have one): Install in RPCS3 in Game Mode, then play it from Steam; delete the package when offered; Delete from the game page afterwards.

**Next**: D2 Vita through Vita3K, D4 PS4 .pkg, D7 patches.

---

## 1 Oct 2026 · 0.9.3 B (more emulators)

**Built** (`emulators.js`, each launch line read from the emulator's own argument parser, cloned into the scratchpad, not the repo):
- DeSmuME `desmume "<game>"` (commandline.cpp: one positional; fullscreen is a setting), Flatpak `org.desmume.DeSmuME`.
- Mupen64Plus `mupen64plus --fullscreen "<game>"` (ui-console main.c: game is the last argument).
- Snes9x `snes9x-gtk "<game>"` (gtk_s9x.cpp), Flatpak `com.snes9x.Snes9x`.
- Mesen 2 `Mesen --fullscreen "<game>"` (CommandLineHelper.cs), AppImage `Mesen.AppImage`, every system it emulates.
- Play! `--fullscreen --disc "<game>"` (ui_qt/main.cpp), Flatpak `org.purei.Play`, AppImage `Play!-<hash>-x86_64.AppImage`.
- Kronos `kronos -a -f -i "<game>"` (port/qt/Arguments.cpp).
- PrimeHack: Dolphin's `-b -e` (its CommandLineParse.cpp is Dolphin's), `vblank_mode=0`; EmuDeck's `primehack.sh` wraps Flatpak `io.github.shiiion.primehack`. New `forkOf` in `EMU`: such an emulator goes to the forks list (never the default).
- Xenia Edge (has207/xenia-edge, the native build EmuDeck installs as `~/Applications/Xenia.AppImage` behind `xenia-emu.sh`): `--fullscreen=true "<game>"` (xenia_main.cc positional `target`, cvar `fullscreen`). The old `xenia` entry (Canary under Proton, `xenia.sh`, `Z:` path) is unchanged.
- **Not added** (rule: launch options confirmed from source or not at all): Redream (closed source; SRM's `-b -e` preset looks copied from Dolphin), Mednafen (mednafen.github.io blocked here), torzu (its hosts blocked here). Try again from a session that can reach them.
- Test: one launch line per emulator in `test/detect.test.js` (19 pass).

**Release**: version 0.9.4, `versionName` "0.9.3 B", release "Cartridge 0.9.3 B".

**Owner to test**: any of these you have installed shows in Settings → Emulators for its console, and a game added to Steam with it starts.

**Next**: 0.9.3 C, section D (installing PS3/Vita/PS4 packages, RPCS3 updates) and D7 patches.

---

## 1 Oct 2026 · Release naming for the rest of 0.9.3

**Owner's decision in chat**: release each finished part of 0.9.3 straight to `main`, named "0.9.3 B", "0.9.3 C"... until the 0.9.3 plan is done, so their copy updates each time.

**Done**: updates only install a higher number, so the number keeps going up (0.9.3 B is version 0.9.4, C is 0.9.5...) and the name is separate: `versionName` in `package.json` is what Settings → About, the Quick Menu and update messages show (`versionName()`/`nameOf()` in `main.js`; an update's name comes from its release title "Cartridge 0.9.3 B"). RomM, RetroAchievements and the log still get the number. Test builds set `versionName` to their test version. Rule written into `CLAUDE.md` → Releases. The 0.9.4 plan keeps its name; its number will be whatever comes next.

**D7 patches**: owner chose option 1: patches come into 0.9.3, and Cartridge may turn on the patches it installed in each emulator's own patch settings (nothing else). Plan D7 and the 0.9.4 plan updated.

**Owner asked about**: Cartridge staying running in SteamOS after closing. That is A14, fixed in 0.9.3 (see the stage 1 entry); needs checking on the Ally.

---

## 1 Oct 2026 · 0.9.3 released (sections A, B4, B5, C)

**Owner's decision in chat**: release now as 0.9.3 on `main` (overrides "nothing to main until tested"); problems get fixed by whichever account picks them up. Each later section should update 0.9.3 again.

**Done**: version 0.9.3, release name "Cartridge 0.9.3", notes "Cartridge 0.9.3 · Emulators" in `RELEASE_NOTES.md` and `CHANGELOG.md`. Test build 3 of the same code passed tests and the launch check before merging.

**Open question for the owner**: installed copies only update when the version number goes up (electron-updater compares versions, and electron-builder won't re-upload to a published release), so "update 0.9.3 again" can't reach people who already have 0.9.3. Each later section needs its own number (0.9.4, 0.9.5…, with the 0.9.4 plan renamed), or the release could be replaced for new downloads only. Ask before the next section ships.

---

## 1 Oct 2026 · 0.9.3 stage 2 (section C)

**Owner's decisions in chat**: "start building the next best thing", so section C after stage 1. Nothing goes to `main` or releases until the owner has tried a test build.

**Built**
- **C3 + A8 forks.** "Which One?" on an AppImage Cartridge couldn't name (Settings → Emulators → Emulator setup) is now three steps: Not an Emulator, It's a Fork (pick which emulator, then its name, the file name by default), It's an Emulator (the full list A to Z). B on a later step goes back a step. A console's menu also has "One of these is a fork…" for a copy that was found as the emulator itself. Saved in `config.steam.forks[path] = { of, name }` (`markFork`, `setup:fork`). Known forks are recognised by name: `FORKS` in `emulators.js` (shadPS4 GR2, BB Launcher, PrimeHack, Slippi). A fork starts with its emulator's launch options, is listed by its own name last ("BB Launcher · fork of shadPS4"), and is never the default.
- **C4 + C5 order.** A console's default is the first non-fork candidate: EmuDeck, then RetroDECK (only when there's no EmuDeck), then AppImage, Flatpak, installed program. The way your own Steam shortcuts start games is a second choice, used by default only when nothing else is found (`templateFor`).
- **RetroDECK** (read from its `run_game.sh`): `flatpak run net.retrodeck.retrodeck -s <console> "<game>"`, RetroDECK picks its own emulator for that console. Not offered for consoles whose games are folders (RetroDECK reads a folder as `Game/Game`). Labelled "RetroDECK" everywhere.
- **C6.** Steam ROM Manager setups are no longer a choice; the emulators they point at are still found, and they still count in the setup report.
- **C7 Take over.** Console page (Settings → Steam → a console) More: "Take over your own shortcuts (N)" for games in Steam that Cartridge didn't add. With the live connection they're changed in place (same appid, play time and collections kept) and registered as Cartridge's (`takenOver: true`); otherwise removed and added again. Asks first; existing shortcuts are still kept exactly until you pick it.
- **C2.** Emulator setup lists consoles that need something first and Ready ones (with a check mark) at the bottom.
- **C8** Steam settings text now describes the order above, about the user's own system. **C9** "Cartridge itself" is "Cartridge".
- **C10 real names.** What is installed is shown by its own name: a Citra or Lime3DS install isn't called Azahar, Sudachi/suyu/torzu aren't yuzu, Ryubing isn't Ryujinx (`REAL_NAMES`, `realName`).

**Checked here**: `npm test` (18 pass: new tests for forks, real names, RetroDECK and SRM), `vite build`, screenshots with fake data at 1280x800 and 1920x1080 (Emulator setup, Which One?, B going back a step).

**Owner to test on a device**
- Name an unknown AppImage as a fork (for example BB Launcher as shadPS4): it shows as "BB Launcher · fork of shadPS4" in the PS4 list, and PS4 games still default to shadPS4.
- Take over on a console with games you added yourself, with and without the live connection; check play time stays (live) and the games start.
- If you have RetroDECK (without EmuDeck): pick RetroDECK for a console and start a game from Steam.

**Not done yet / next**
- C10's new emulators (DeSmuME, Redream, Mednafen, mupen64plus, Snes9x, Mesen, Play!, Kronos, torzu standalone entry, PrimeHack and Slippi as full entries, Xenia Edge): each needs its launch options read from its own source first, with a launch-line test.
- Then D, E, F (Discuss items: options shown first), G, H, K, J.

---

## 1 Oct 2026 · 0.9.3 stage 1 (section A, B4, B5, test builds)

**Owner's decisions in chat**
- Start building 0.9.3; Claude decides the design details, using the design references the owner picked. Nothing goes to `main` or releases until the owner has tried it.
- Plugins: install ponytail, graphify, rtk, taste-skill, impeccable, img2threejs and the awesome-design-md references; not caveman. All were cloned and read (nothing harmful; rtk's checksum matched), but writing them into `.claude/` was blocked by the environment's safety check (it treats `.claude/` as Claude's own settings). Waiting for the owner to allow edits to `.claude/` in the permissions, or to add them from their own computer. One change planned for rtk: its hook auto-approves the commands it rewrites; ours would only rewrite.

**Built**
- **A10 update (owner's photos of shadPS4's own shortcuts, 1 Oct).** Target and Launch options (`-d -g "<game>/eboot.bin"`) match what Cartridge writes; only Start in differs. shadPS4's own shortcuts get Start in `/tmp/.mount_<random>/usr/bin` because the launcher saves the folder it is running from (`QCoreApplication::applicationFilePath()` in `create_steam_shortcut.cpp`), which for an AppImage is its temporary mount; that folder is gone once the launcher closes. So the rule is now unconditional: shadPS4 never starts next to its AppImage, unless a `user` folder there is the only shadPS4 data.
- **A10 shadPS4 (the main one).** Read in the source: shadPS4 (`common/path_util.cpp`) and its Qt launcher use a folder named `user` in the folder they start in, else `~/.local/share/shadPS4`; the launcher starts the emulator in its own working folder (`QDir::currentPath()`), and its own Steam shortcuts start inside the AppImage's mount, where there is never a `user` folder. Cartridge started it next to the AppImage, so a stray `user` folder there gave a different set of settings, keys, chosen version and patches. Now `startOf()` in `steamManager.js` picks a Start in with no `user` folder (the launcher's data folder, shadPS4's, or home), unless that portable folder is the only shadPS4 data. The start folder is part of shadPS4 shortcuts' signature, so existing ones show **Update** on their console page. Tests: `test/steam.test.js`.
- **A14 lag and quitting.** The window can slow down in the background again (`backgroundThrottling` back to Chromium's default); the controller is read every 8 ms only while Cartridge is in front (250 ms otherwise); the animated background stops drawing when Cartridge isn't in front. Quit (and SIGTERM/SIGINT/SIGHUP, which Steam's Exit game sends) stops trophy polling, downloads, uploads and the library check, then exits within 3 s whatever is pending.
- **A5 + C1.** New Settings → **Emulators** (replaces Console Folders in the list): an Issues list (`issues:list` in `main.js`: games missing from Steam collections, shortcuts that would fail, setups pointing at a missing emulator, missing BIOS), Emulator setup and Shortcut health (moved here from Settings → Steam), then Console Folders. No more pop-ups at start; a yellow dot on the Settings tab when something is waiting.
- **A7.** Shortcuts removed live are hidden until Steam saves its file (`steam-live-removed.json`, `shortcutsOf()`), so a game no longer shows "Remove from Steam" again. With live changes on, adding or removing doesn't ask "Apply now or later".
- **A4/A13.** Settings focuses the current section's list item (not the first), the old page leaves at once, and when a focused button disappears the D-pad stays in the part of the screen it was in (`lastZone` in `nav.js`).
- **A3.** Up and down stay inside a scrolling list while it has more that way (`nav.js`), so the toolbar above the Library grid isn't reached early.
- **A1** current top tab is a full white box. **A9** consoles and emulator lists A to Z (the one from your shortcuts first; which emulator is used by default is unchanged). **A11** High contrast and Soft text are clearly different. **A12** game page buttons on one row (icon only under 1100 px wide).
- **A6.** Shortcuts or setups pointing inside `/tmp/.mount_...` are never learned from and show in Shortcut health and Issues.
- **B4.** Deleting a game deletes file by file (`removeWithProgress`, links never followed) and shows a progress ring on its card and the Delete button (`Ring.vue`).
- **B5.** Home rows show 15; a **Show all** card opens the whole row in the Library view in the row's own order ("As on Home"); collections, genres and consoles rows open their tabs.
- **Test builds.** `.github/workflows/test-build.yml`: every push to `claude/...` builds the AppImage as version `<next>-test.<run>` (for example 0.9.3-test.4), runs the tests and the launch check, and attaches it to the run. Nothing is published; `release.yml` is untouched.

**Checked here**: `npm test` (15 pass), `vite build`, syntax of every back-end file, and screenshots with fake data at 1280x800 and 1920x1080 (Home with Show all, the Show all page, Settings → Emulators). Not checked here: anything needing a device, Steam, or a controller.

**Owner to test on a device** (with the test AppImage)
- A10: re-add or Update a PS4 game, start it from Steam several times in a row in Game Mode. Also tell Claude whether `~/Documents/Apps/user` (a folder named `user` next to the shadPS4 AppImage) exists: that is the cause this fix assumes.
- A14: on the Ally, CPU while a game runs with Cartridge open, and `ps -ef | grep -i cartridge` a few seconds after Quit and after Steam's Exit game.
- A2: does the first LT/RT press work right after launch?
- The rest: tabs, Settings focus, Library scrolling up, Remove from Steam, deleting a big game, Home rows at 1280x800 and on the TV.

**Not done yet / next**
- A2 needs a device first. A8 comes with C3 (forks).
- Next stage: the rest of C (forks, standard emulator per console, launch option order, more emulators), then D, E, F (Discuss items: options shown first), G, H, K, J.

---

## 1 Oct 2026 · Second account, first session

**Context.** The owner is working from a second Claude account for about a week, then going back to the first. Nothing carries between accounts except the repo, so this log is the handover. Every update made here gets an entry. Before switching back, a "Start here" summary goes at the top.

**What was done**
- Read the whole project: back end, every view and component, tests, CI, HANDOFF, all plans, design system, recent changelog.
- Added the owner's new 0.9.3 items to `docs/plan-0.9.3.md`: A10 (shadPS4 shortcuts, with the owner's finding and the leads below), A14 (lag on the ROG Ally), B4 (delete animation), B5 (Home rows stop at 15 with a Show all card), D6 (RPCS3 game updates), D7 (patches that stick, Discuss).
- Fixed the `CLAUDE.md` line that pointed at the old 0.9.2 notes.

**Decided in chat**
- The 0.9.3 plan on this branch is the right one (`main` still has the old 11-line version; the branch is not merged).
- Work continues on this branch. Building 0.9.3 has not started; the owner says when.

**Found while reading (not fixed yet, to confirm when building)**
- A4/A13 (Settings jumps to Connection, quick right press loses focus): the left list switches the page on focus (`@focus="sec = s.id"` in `Settings.vue`). When the focused button disappears (Fetch all logos becomes Stop) or you come back from a sub-screen, focus falls to the first list item, which is Connection. The page's fade (`mode="out-in"`) likely explains the lost focus on a quick right press.
- A5: the start-up pop-ups are `steamReport()` (`steam.js`) and `checkMoved()` (`App.vue`).
- A7: Remove from Steam asks "Apply now", then the preview asks again.
- A11: the three Text options differ by a few shades only (`TEXTS` in `themes.js`).
- A12: `.g-actions` wraps.
- A14: `backgroundThrottling: false` on the window, and the 8 ms controller poll never stops.
- A10: Cartridge deliberately replaces a `/tmp/.mount_` Start in with the AppImage's folder; shadPS4 may choose its user folder from the working folder. Check the source.
- Not in the plan: the game page's Re-download still deletes first, then downloads (only Library check keeps the old copy until the new one passes).
- HANDOFF's "the Steam manager never ran against a real Steam" is out of date (0.7.12 came from real use). HANDOFF update is J14.

**Waiting on the owner**
- D7: patches in 0.9.3 or 0.9.4, and whether Cartridge may turn on patches it installed.
- The plugins the owner asked to install (ponytail, caveman, graphify, rtk, taste-skill, impeccable, img2threejs, and awesome-design-md issue 90) were not installed: the environment's safety check blocked cloning third-party code into the repo. Needs the owner's go-ahead in the permission settings, or a different way.
- The stray `v2.3.1` tag: ask again when 0.9.3 is being built.

**Next**
- The owner says when to start building 0.9.3, starting with section A.
