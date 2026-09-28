# Cartridge

A controller-first RomM client for SteamOS and Bazzite, shipped as one AppImage. It is added to Steam and used mostly in Game Mode, on a 1080p handheld and a 4K TV.

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
- There are no automated tests in the repo. Say plainly what was checked and what the owner must test on a device (controller, Game Mode, Steam, TV size).
- Keep changes minimal and match the surrounding code: dense, short comments that explain why.
- Before committing, grep the diff for private info (usernames, IPs, domains, emails, local paths). The repo is public.

## The owner's rules
- Never use em dashes anywhere: UI text, notes, commits, messages. Use commas, colons, full stops, or "·" in titles.
- Plain, direct, not AI-sounding writing. British spelling in feature names ("Colour", "Customisation").
- **No UI overhauls or visual changes beyond what was asked.** Ask first. When a design change is wanted, offer options.
- The design skills in `.claude/skills/` (animate, apple-design, emil-design-eng and the rest) are used only when the owner asks for them.
- When the owner says "don't build yet" or "just answer", don't change code.
- Test that it launches before anything is released. Release notes say exactly what changed.
- Nothing private in the repo or releases.
- Cartridge never touches saves, never downloads or launches emulators itself, and never modifies emulator files.
- **Cartridge is for everyone, not the owner's setup.** Users run SteamOS, Bazzite, other image-based systems and ordinary desktop distros, with emulators from EmuDeck, Flatpak, AppImages, distro packages or Steam (RetroArch), in any mix and any version. Never hard-code the owner's paths, emulators or choices. Detect what is installed, prefer what the user already uses (their Steam shortcuts), let them pick, and fail with a clear message rather than a wrong guess. Test Steam and emulator changes against several setups (EmuDeck, Flatpak only, distro packages, AppImages, nothing installed), not one.
- Paths: home can be a symlink (/home to /var/home on Bazzite and Fedora Atomic), and sandboxed (Flatpak) apps may not follow it. Hand emulators real paths, or names they resolve themselves (RetroArch cores).

## Controls (don't change without asking)
LT/RT switch top tabs. LB/RB only switch sections inside a page. A select, B back, X download or page action, Y search or More, Start Quick Menu, Select Downloads. Every screen must work with a controller, touch and mouse, at 1280x800, 1920x1080 and 3840x2160, with nothing clipped.

## Do not change (full table with reasons: HANDOFF D5)
- Never append `no-sandbox` at runtime (renderer crash 133). `--no-sandbox` only on the `steam-launch.sh` exec line and LAST in the Steam helper argv.
- Rendering rules in `main.js`: software in Game Mode or under Steam on small screens, GPU on big screens, the GPU-crash fallback and the big-window GPU relaunch.
- `steam-launch.sh` (unsets `LD_PRELOAD`/`LD_LIBRARY_PATH`, sets `CARTRIDGE_FROM_STEAM=1`), rewritten on every start.
- The artifact name `Cartridge-x86_64.AppImage`, the `CARTRIDGE_SMOKE` launch check, and `APPIMAGE_EXTRACT_AND_RUN=1` in CI.
- Steam must be closed before `shortcuts.vdf` is written. The helper is copied out of the AppImage and run through `systemd-run --user ... KillMode=process`. Steam's appid formula with quotes around the exe. Existing shortcuts are kept exactly.
- Shortcut learning: keep Target, Start in and Launch options, strip frame generation wrappers (mako-run, lsfg), keep `vblank_mode`, keep quoting, first `/roms/` in a path, replace `/tmp/.mount_` Start In, `styled()` path aliases.
- Trophies: read only; unlocks only added, earliest wins; notes title prefix `'Cartridge troph'`; picture notes under 44,000 characters; folders de-duplicated by device:inode; icons served by token only.
- Touch: `touch-action: none` plus the pointer-based drag in `nav.js`. The app starts in pad mode; instant scroll while a direction is held.
- Delete refuses the ROMs root and console folders; a mark never touches files.
- Single modal slot: nested dialogs save `store.modal.resolve` and reopen themselves (see FolderPicker, SteamCollections, SteamEmu).
- Square-only game icons (`iconOpaque`), `sgScore` match ranking.

## Known issues (details: HANDOFF Part B, "Other bugs" list, and F4)
- The Steam manager has never run against a real Steam client. Treat real-device reports about it as expected beta issues. The least tested parts are listed in HANDOFF F6.
- `steam-games.json` is written before the helper finishes (F4).
- Small cleanups: duplicate CSS in `Achievements.vue`, unused `.padbtn` rules, the out-of-date graphics comment at the top of `main.js`, the two migration lines.

## Since the handoff (0.6.1)
- Fixed: helper backup overwrite (per-job lock in `steamHelper.js`, backups never replaced), `addToSteam` key gap, Y on Search, Steam apply progress (`steam-progress` broadcast, top bar pill).
- Download checksums in `main.js` (`checkFile`/`checkFiles`): size for every file, md5/sha1 except zip/7z/rar/chd (RomM hashes their contents). Damaged files are deleted; an identical repeat means RomM's checksum is stale and the file is kept (`notice: 'stale'`).
- Storage manager: `storage:overview` in `main.js`, `src/components/StorageManager.vue`; space check before downloads in `store.download` (`roomFor`).
- Look presets: `config.lookPresets` (up to 5, `LOOK_KEYS` in `Settings.vue`).
- QR pairing: RomM's device flow `/api/auth/device/init` and `/token` (`server:qrStart`, `server:qrPoll`), `config.deviceId`, the `qrcode` package in `Setup.vue`.
- A mock RomM and Playwright checks for these were used in the session; they are not in the repo.

## 0.7.0 (The Library Update)
- slimRom adds `igdb_id`, `series`, `modes`, `players`, `votes`, `hours` (HLTB), `similar`, `user` (RomM `rom_user`: status, backlog, playing, hidden, played).
- Collections: `col:*`, `fav:set`, `rom:user` in `main.js` (`colHandlers`, `apiForm` multipart). Automatic lists, series and genres are built in `store.js` (`autoCollections`, `genres`). QR pairing asks for `collections.write`.
- Top bar tabs: `config.ui.tabs`, `TAB_DEFS`/`activeTabs()` in `store.js`; Settings always shown.
- PS4/PS5 zips: `unzipGame` (yauzl) after `checkFiles`; unpacks to `<name>.partial`, flattens one top folder, then deletes the zip.
- Queue: `dl:move`, `dl:pauseAll`, `dl:resumeAll`, `config.downloads.limitMBs` (`rateWait`). `it.running` stops a resumed item starting a second run before the stopped one ends.
- Recently played: `steam:played` (shortcuts LastPlayTime). Select many: Gallery `selecting`, `addGames` in `steam.js`.

## 0.7.5
- Settings → Steam: console cards open `src/views/SteamConsole.vue` (route `steam-console`, param `ckey`); the old emulator menu lives in its More.
- HLTB: `electron/hltb.js` (RomM's wire contract, search URL read from RomM's repo, cache `hltb.json`, `CARTRIDGE_HLTB_BASE` for tests); the game page prefers RomM's `hltb_metadata`.
- `nav.js`: focusing the first item in a `[data-scroll]` scrolls it to the top. Scrolling lists need `data-scroll` and `flex: none` rows (Menu, SteamCollections).
- `CollTile` `wide` for collections and series; SysTile clips its strip and glyph in `.sys-clip`.

## 0.7.6
- Live Steam changes: `electron/steamLive.js` talks to Steam's CEF port 127.0.0.1:8080 (open when `.cef-enable-remote-debugging` is in the Steam root, which Decky creates) and runs `SteamClient.Apps.AddShortcut` etc. in `SharedJSContext`. `apply()` uses it when available, else the helper. Steam picks the appid, so the registry moves to it; `reg[id].live` counts it as in Steam before Steam saves shortcuts.vdf. `restartSteam` uses `SteamClient.User.StartRestart(false)`. `CARTRIDGE_CEF_PORT` for tests.
- After a live logo, `appDetailsStore.SaveCustomLogoPosition` (as decky-steamgriddb does), or shortcut logos stay blank.
- Helper in Game Mode polls every 100 ms and writes at once (Game Mode restarts Steam immediately).
- Game page More: artwork options grouped under "Change metadata".

## 0.7.8
- Emulators per console: `EMUS` (standalone, args copied from EmuDeck's SRM parsers) and `CORES` in `steamManager.js`; `candidates(key)` lists what is installed. RetroArch cores go by name (`-L snes9x_libretro.so`), never a full path (Flatpak RetroArch on /var/home can't see /home paths). Xbox: `xemu-emu.sh -full-screen -dvd_path`. Xbox 360: `"Z:{ROM}"`.
- `templateFor`: yours > picked (`config.steam.emus[key]`) > learned > first candidate. Shortcuts store `sig`; `outdated` counts ours with another sig; `steam:refresh` re-adds them.
- `readShortcuts` splits args out of Exe (SRM `appendArgsToExecutable`) into `%command% <args>`; `Z:` paths understood.
- Icons: `<appid>_icon.png` in grid (SGDB icon via `gameIconPng`, else cover cropped); live `SetShortcutIcon`, helper sets `icon`.
- Library: series merged by word subset (`STOP` words), games de-duplicated; Gallery `groups` splits collection/genre by console; `GenreTile.vue`.

## 0.7.9
- Emulator detection covers every install kind: `EMU` (per emulator: EmuDeck `scripts`, AppImage `app` pattern, Flatpak ids `fp`, program names `bin`, `args`) and `EMUS` (console -> emulator ids). `candidates()` lists each copy found (first keeps the plain id, others `id@src`). RetroArch from EmuDeck, Flatpak, AppImage, distro package or Steam, each with its own cores; only the sandboxed ones get cores by name.
- `styled()` returns the real path when no learned path style applies.
- The session tested detection with fake homes for EmuDeck, Flatpak-only, distro packages, AppImages + Steam RetroArch, and nothing installed (not in the repo).

## 0.7.10
- `electron/emulators.js` is the emulator database (all known, from EmuDeck's SRM parsers and SRM's `files/presets`): `EMU` (sources, args, `argsBy` per install kind, ares `system` names, `for` consoles), `CORES`, `RA_FIRST`. Only installed ones are offered. Add emulators there, not in steamManager.
- An EmuDeck launcher that runs a Flatpak or an AppImage in ~/Applications hides that copy (the script text is read). RetroArch's Flatpak is hidden when EmuDeck's retroarch.sh wraps it.
- Launch placeholders: `{ROM}`, `{SERIAL}`, `{DIR}` (game folder), `{NAME}` (file name without extension, for MAME).

## 0.7.11
- Shortcuts are SRM style: `plan()` puts `"exe" args` in Target (`entry.target`, used for the appid, the helper `Exe` and live `SetShortcutExe`) and leaves Launch options empty. `%command%` form only with `pre` (env vars, wrappers) or `%RPCS3_GAMEID%`. `sigOf` starts with `v2`, so older shortcuts show Update.
- Folder games: `gameRef` hands the emulator the file inside (`playableFile`: `DISC_FIRST` m3u/cue/gdi..., then `GAME_EXT[key]`, else the biggest file) unless the console takes folders (`DIR_GAMES`).
- In Steam matching: `nameKey` (letters and digits, & = and, no ™), `gameSerial` reads PS3/PSP/Vita serials from the game when the name lacks one.
- Vita: `vita3k` kind `vitaid`: `-F -r <title ID>` only when `ux0/app/<id>` exists (Vita3K pref path); otherwise `missing`, shown as `blocked` in the overview and skipped in `plan()`.
- `src/views/SteamMissing.vue` (route `steam-missing`) replaces "Add N missing". Gallery toolbar: Show/Sort menus, More (Surprise me, Select, Get all); series header uses a game cover (`headArt`).

## 0.7.12
- Real Steam put "%command%" into a live-added shortcut's empty Launch options, which broke launching (args are in Target). `steamLive.settle()` reads the shortcut back (`RegisterForAppDetails`, `strShortcutLaunchOptions`) and sets it again until it sticks. Overview `badLo` (ours, args in Exe, Launch options exactly `%command%`) counts as outdated; `steam:refresh` clears it in place (`reg[id].loFixed`), else re-adds.
- Smoothness (measured without the GPU): scroll containers `will-change: scroll-position` (`.view`, `.shelf`, `.shelves`, `.menu-list`, `[data-scroll]`, `[data-hscroll]`), so scrolling doesn't repaint the one full-screen `.shell` layer. The vignette is painted as `.shell`'s background (`body:has(.xmb-vignette)`), one full-screen layer fewer. Light effects draw the canvas at full size below 4K (stretching it cost the software compositor more). Light effects animate only the card lift, not the shadow.

## Releases (full steps: HANDOFF D8)
Only when the owner asks. Bump `version` and `build.releaseInfo.releaseName` ("Cartridge X.Y.Z") in `package.json`, put only this version's notes in `RELEASE_NOTES.md` (heading `## Cartridge X.Y.Z · Title`), add them to the top of `CHANGELOG.md`, grouped as New / Changed / Fixed with bold lead-ins. CI builds, launch-checks and publishes.
