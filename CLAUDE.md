# Cartridge

A controller-first RomM client for SteamOS and Bazzite, shipped as one AppImage. It is added to Steam and used mostly in Game Mode, on a 1080p handheld and a 4K TV.

**Coming back after 0.9.2 (the first account)?** Read `docs/HANDOVER-0.9.3-to-0.9.21.md` first: everything the second account did from 0.9.3 to 0.9.21, the owner's decisions, what broke and how it was fixed, and what is still open.

**Coming back after 0.9.64 (another account)?** Read `docs/HANDOVER-0.9.55-to-0.9.64.md` first (it now runs to 0.9.78): everything from 0.9.55 on (freezes found and fixed, Save Sync and the save locator, Game Settings from every emulator's source and per release, RPCS3 paths, Xenia patches, forks with versions, GitHub links from search or the phone, recomps, Online Play), the owner's decisions, and in Part 9 what was agreed but isn't done yet. The owner wants it updated after every update: Parts 1, 4, 5, 6 and 9 as well as a new Part.

**Coming back after 0.9.54 (another account)?** Read `docs/HANDOVER-0.9.38-to-0.9.54.md` first: everything from 0.9.38 to 0.9.54 (multi-drive, Glass rebuilt three times, CAE and the engines, Save Sync, CIDE, mods engine and rule book, offline, the new welcome, brand B and the README, obsidian dark Glass), the owner's decisions and what is still open. Then the two older handovers below.

**Coming back after 0.9.37 (another account)?** Read `docs/HANDOVER-0.9.22-to-0.9.37.md` first: everything from 0.9.22 to 0.9.37 (Syncthing saves, Switch reading, Steam collections, controller after a game, Cemu, BIOS placement, Linked Folders and more), the owner's decisions, how the real app was run and tested in the container, what broke and how it was fixed, and what is still open. Then the older handover above for the history before.

**Running on the owner's own PC (a local Claude Code session)?** Read `docs/PLAYTEST-ON-A-REAL-PC.md` first: the owner's brief (test everything yourself as a playtester, fix for every setup), starting with why Windows PC ports don't set up or launch.

This file is the short version every session needs. The full handoff (history, every decision, the reasons behind odd-looking code, test notes) is in **`docs/HANDOFF.md`**. Read the parts that relate to your task before changing code. The Steam manager test scripts are in `docs/steam-tests.md`.

## Stack and layout
- Electron main process (`electron/`) plus a Vue 3 UI (`src/`). No router, no Pinia, no UI kit.
- The UI talks to main only through `window.cart.call(channel, arg)` (wrapped as `call()` in `src/store.js`). Every handler returns `{ ok, data | error }`. Live events come back through `broadcast()` and `window.cart.on()`.
- `electron/main.js`: config, RomM API, library mirror (`library.json`), downloads, `romimg://` images, logos, SteamGridDB, RetroAchievements, updater, rendering choice, single instance, IPC.
- `electron/steamManager.js` + `electron/steamHelper.js`: adding games to Steam (0.6). `electron/steamArt.js`: adding Cartridge itself to Steam.
- `electron/trophies.js` + `electron/trophyService.js`: read-only emulator trophies and RomM notes sync.
- `src/nav.js`: controller focus engine. `src/themes.js`, `src/bgRenderers.js`, `src/sfx.js`: look and feel.
- User data lives in `~/.config/Cartridge/` (list in HANDOFF E4).

## How to work in this repo
- Work on the session's branch, never directly on `main`. **Standing instruction from the owner:** when an update is finished, built and launch-checked, open the PR and merge it to `main` to release it without asking again. Problems get fixed together afterwards.
- **Never change `version` in `package.json` unless the owner asks for a release.** A version change on `main` builds and publishes a release to every user automatically.
- Check every change builds: `npm ci --ignore-scripts && npx vite build` (the cloud container can't download Electron, so the full `npm run dist` may not work here).
- `npm test` runs the detection tests in `test/` (CI runs it before every release build). Everything else is checked by hand: say plainly what was checked and what the owner must test on a device (controller, Game Mode, Steam, TV size).
- Keep changes minimal and match the surrounding code: dense, short comments that explain why.
- Before committing, grep the diff for private info (usernames, IPs, domains, emails, local paths). The repo is public.

## The owner's rules
- Never use em dashes anywhere: UI text, notes, commits, messages. Use commas, colons, full stops, or "·" in titles.
- Plain, direct, not AI-sounding writing. British spelling in feature names ("Colour", "Customisation").
- **No UI overhauls or visual changes beyond what was asked.** Ask first. When a design change is wanted, offer options.
- The design skills in `.claude/skills/` (animate, apple-design, emil-design-eng, taste-skill with redesign/soft/minimalist, img2threejs and the rest) are used only when the owner asks for them. taste-skill and img2threejs are third-party (MIT, Apache 2.0), kept as published. Since 17 Oct 2026 the folder also holds the rest of the owner's skill list (GSAP, Expo, Figma, Vercel, Anthropic design, genjutsu, founder-skills and more): sources, licences and the dev-only libraries (GSAP, three.js, Lenis, Vanta, p5, Anime.js) are in `docs/skills.md`. Same rule: only when the owner asks.
- **Plain and Glass are two separate modes, never merged (owner, 6 Oct 2026, "never forget this point").** There is one Style setting (Look & Feel → Theme → Style: Plain or Glass, `ui.style`, `themes.styleOf`) for the whole app. Every element is designed twice, once for each: Glass is see-through (frosted panels, Liquid Glass controls, `body.elements-glass`); Plain is solid and matte (edges and light from above, `body.style-plain`). A change made for one mode must never leak into the other, and a new element is not finished until it looks right in both (and in Light and OLED). Keep options few and plainly named; don't add settings that split Style up again.
- `image-to-code` (Leonxlnx/taste-skill, MIT, added in 0.9.44): the owner asked for it to rebuild Glass from reference pictures. Its image-generation steps don't apply here (the owner supplies the pictures); its analysis and faithful-implementation rules do.
- `liquid-glass` (haider-nawaz/liquid-glass-skill, MIT, added in 0.9.41): the owner wants it used for Glass mode (Elements → Glass) and only there, starting the update after 0.9.41. It is written for SwiftUI: take its design rules (glass for controls and navigation only, never content; grouped glass; tint; reduced transparency) and build them in CSS.
- **Nothing clips (owner, 0.9.49: "always look for things that are clipping").** Text wraps instead of being cut (no ellipsis outside single-line controls), focus rings and shadows fit inside their scroller, pictures and logos shrink to their box instead of being cut, and nothing slides under the Dock or a sheet's edge unseen. `npm run audit:ui` runs the clipping audit (`tools/ui-audit/clipping.js`: every page, Settings section and Start widget at 1280x800 and 1920x1080 with long real-world text) after focus and contrast; it must report 0 cut texts before a release. Logo sizes and marks: `docs/logos.md`, pinned in `test/logos.test.js`. All the design rules: `docs/design-rules.md`.
- When the owner says "don't build yet" or "just answer", don't change code.
- Test that it launches before anything is released. Release notes say exactly what changed.
- Nothing private in the repo or releases.
- Cartridge never touches saves, never downloads or launches emulators itself, and never modifies emulator files. Owner's exceptions: Linked Folders (on request) and Cartridge Save Sync (0.9.51, only when turned on, with its guard rails always on: never while the emulator runs, never guesses a conflict, backups before every write).
- **Cartridge is for everyone, not the owner's setup.** Users run SteamOS, Bazzite, other image-based systems and ordinary desktop distros, with emulators from EmuDeck, Flatpak, AppImages, distro packages or Steam (RetroArch), in any mix and any version. Never hard-code the owner's paths, emulators or choices. Detect what is installed, prefer what the user already uses (their Steam shortcuts), let them pick, and fail with a clear message rather than a wrong guess. Test Steam and emulator changes against several setups (EmuDeck, Flatpak only, distro packages, AppImages, nothing installed), not one.
- Paths: home can be a symlink (/home to /var/home on Bazzite and Fedora Atomic), and sandboxed (Flatpak) apps may not follow it. Hand emulators real paths, or names they resolve themselves (RetroArch cores).

## Controls (don't change without asking)
LT/RT switch top tabs. LB/RB only switch sections inside a page. A select, B back, X download or page action, Y search or More, Start Quick Menu, Select Downloads. Every screen must work with a controller, touch and mouse, at 1280x800, 1920x1080 and 3840x2160, with nothing clipped.

## Do not change (full table with reasons: HANDOFF D5)
- Never append `no-sandbox` at runtime (renderer crash 133). `--no-sandbox` only on the `steam-launch.sh` exec line and LAST in the Steam helper argv.
- Rendering rules in `main.js`: since 0.9.41 always the GPU (`useGpu = !forceSoftware`; software only with `--disable-gpu` or `CARTRIDGE_SAFE_GPU`), and a GPU crash at start-up relaunches once with `--disable-gpu`.
- `steam-launch.sh` (unsets `LD_PRELOAD`/`LD_LIBRARY_PATH`, sets `CARTRIDGE_FROM_STEAM=1`), rewritten on every start.
- The artifact name `Cartridge-x86_64.AppImage`, the `CARTRIDGE_SMOKE` launch check, and `APPIMAGE_EXTRACT_AND_RUN=1` in CI.
- Steam must be closed before `shortcuts.vdf` is written. The helper is copied out of the AppImage and run through `systemd-run --user ... KillMode=process`. Steam's appid formula with quotes around the exe. Existing shortcuts are kept exactly.
- Shortcut learning: keep Target, Start in and Launch options, strip frame generation wrappers (mako-run, lsfg), keep `vblank_mode`, keep quoting, first `/roms/` in a path, replace `/tmp/.mount_` Start In, `styled()` path aliases.
- Trophies: read only; unlocks only added, earliest wins; notes title prefix `'Cartridge troph'`; picture notes under 44,000 characters; folders de-duplicated by device:inode; icons served by token only.
- Touch (rebuilt again in 0.9.26, the touch update, owner: "touch never worked, only taps"): `html, body { touch-action: none }` and the engine in `nav.js` scrolls every touch, pen and mouse-style drag (once per frame, momentum, eats the ending click). `ui.touchScroll: 'browser'` (`html.touch-native`) gives Chromium's own touch scrolling back, and the engine then steps back on pointercancel or a native scroll. Gestures: left-edge swipe = Back, swipe on the top bar's tabs = LT/RT (`dispatch(a, { keepMode: true })`). `[data-nodrag]` keeps the engine out (Start while arranging). The app starts in pad mode; instant scroll while a direction is held.
- Delete refuses the ROMs root and console folders; a mark never touches files.
- Single modal slot: nested dialogs save `store.modal.resolve` and reopen themselves (see FolderPicker, SteamCollections, SteamEmu).
- Square-only game icons (`iconOpaque`), `sgScore` match ranking.

## Known issues (details: HANDOFF Part B, "Other bugs" list, and F4)
- The Steam manager has never run against a real Steam client. Treat real-device reports about it as expected beta issues. The least tested parts are listed in HANDOFF F6.
- `steam-games.json` is written before the helper finishes (F4); since 0.9.19 `reconcile()` drops what isn't in shortcuts.vdf at the next start.

## Version notes
Every version's notes (what it added, where the code is, why odd-looking code is that way) are in **`docs/VERSIONS.md`**, newest last. Search it for the area you touch before changing code (`grep -n "steamLive\|saveSync" docs/VERSIONS.md`). Add the new version's notes there, not here.

## Releases (full steps: HANDOFF D8)
Only when the owner asks. Bump `version` and `build.releaseInfo.releaseName` ("Cartridge X.Y.Z") in `package.json`, and set `versionName` (what Settings → About and update messages show). **0.9.3 is shipped in parts (owner, 1 Oct 2026):** the number goes up as usual (0.9.4, 0.9.5...) but `versionName` and the release title are "0.9.3 B", "0.9.3 C"... until the 0.9.3 plan is done; notes heading `## Cartridge 0.9.3 B · Title`. Then put only this version's notes in `RELEASE_NOTES.md` (heading `## Cartridge X.Y.Z · Title`), add them to the top of `CHANGELOG.md`, grouped as New / Changed / Fixed with bold lead-ins. CI builds, launch-checks and publishes.
