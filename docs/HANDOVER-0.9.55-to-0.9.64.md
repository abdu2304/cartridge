> **Read first (owner, 6 Oct 2026):** Plain and Glass are two separate modes, never merged. One Style setting (Plain or Glass) covers the whole app; design every element for both, and never let a change for one leak into the other. Details in CLAUDE.md.

# Handover: everything from 0.9.55 to 0.9.64

To the Claude on the next account, from the Claude on this one.

Three handovers come before this one: `docs/HANDOVER-0.9.3-to-0.9.21.md`, `docs/HANDOVER-0.9.22-to-0.9.37.md` and `docs/HANDOVER-0.9.38-to-0.9.54.md`. Everything in them about the owner, the process and the do-not-break rules still holds unless this document says otherwise. This one picks up at 0.9.55 (7 October 2026) and runs to 0.9.64 (9 October 2026): **10 releases**. It also holds the full plans the owner agreed for the next three updates (0.9.65 recomps, 0.9.66 Online Play), with every decision and the reason behind it, so you can build them without asking again.

**The owner asked for this document to be kept up to date after every update from now on.** When you finish an update, add it to Part 4 and Part 6, move what's done out of Part 9, and update Part 1. Keep the same level of detail: what changed, why, what was found, how it was checked, what the owner must test.

Read in this order:
1. This document, once, top to bottom.
2. `CLAUDE.md`: its sections "0.9.55" to "0.9.64" are the short technical notes per version, with function names: the index into the code.
3. `docs/SESSION-LOG.md`, newest entry first: the per-update diary with the owner's words and what they must test.
4. `docs/design-rules.md` before any UI change (section 6: focus and chosen are frozen, see Part 2), `docs/cae.md` before motion, `docs/glass-engine.md` before Glass, `docs/architecture.md` for the engine map, `docs/game-settings/<emu>.md` before touching an emulator's Game Settings.
5. `CHANGELOG.md` for the exact user-facing wording.

The repo is public. Nothing private is in this document. Keep it that way.

---

## Part 1. Where things stand right now

- **Latest release:** v0.9.64 "Cartridge 0.9.64 · Forks and Links" (9 Oct 2026). v0.9.63 "The Right Version" was PR #82. 0.9.64 is the PR after it.
- **Branch:** `claude/relaxed-fermat-30pigp`, merged into `main` by a PR for every release (merge commit, not squash). After a merge, reset the branch to `main` (`git fetch origin main && git checkout -B claude/relaxed-fermat-30pigp origin/main`) before new work.
- **package.json:** `version` = `versionName` = 0.9.64, `releaseName` "Cartridge 0.9.64". The lockfile's version field is stale and always was; leave it.
- **Tests:** 326 pass (`npm test`). Test files added in this stretch: saveLocator, titleDb, vitaInstall, gameSettingsAll, rpcs3Paths, wua (with `test/fixtures/mario-tennis.wua`), xeniaPatches, forkVersions, phoneLink; saveSync and gameSettings grew a lot.
- **Before every release:** `npm test`, `npx vite build`, the launch check (`CARTRIDGE_SMOKE=1 HOME=$(mktemp -d) xvfb-run -a node_modules/electron/dist/electron . --no-sandbox` must print `SMOKE OK`), `npm run audit:ui` (focus and contrast in six looks, clipping, the tour twice; all zero at 0.9.63 and 0.9.64). Never rebuild `dist` while the audit runs: it reads `dist` and crashes mid-run.
- **Standing instruction:** when an update is finished, built and launch-checked, open the PR and merge it without asking. A version change on `main` publishes the release to every user.

**What comes next (agreed with the owner, in this order):**
1. **0.9.65 · Recomps** (Part 7.1: the full plan and every decision).
2. **0.9.66 · Online Play** (Part 7.2: research done, decisions made).
3. Keep this handover updated after each.

**Waiting on the owner:** device tests listed in Part 9; KytyPS5 log after 0.9.63 if it still fails; the Unit 13 freeze test with frame generation off.

---

## Part 2. The owner: how they worked with me (additions)

Everything in the earlier handovers still applies. New in this stretch:

- **"Don't build yet, let's discuss" means discuss only.** Big batches of photos and notes came with that instruction. The pattern that worked: read-only investigation (code, sources, the log) to find real causes, then a numbered reply per item: cause, fix, options where a design choice is needed, then all the questions in one list with a recommendation each. The owner answers "yes to all" or only where they disagree, then says "Start".
- **They asked for all open questions in one list before building.** Keep every question you ask numbered and recommend an answer for each; they asked to see "all your questions from the beginning" once, so track them.
- **Focus and chosen styling are frozen.** 0.9.60 changed focus to a glow and chosen to a tint ("no white outline"); the owner: "I absolutely despise the new white highlights, I loved the old selection method". 0.9.61 put 0.9.59's exactly back (ring focus, thin chosen ring). `docs/design-rules.md` section 6 now says focus and chosen stay as they are unless the owner asks. Don't touch them.
- **They send their whole cartridge.log.** Read all of it, not just what they asked about (Part 6.1: the log showed an 18-second freeze nobody had reported). Group lines by pattern (`sed -E 's/[0-9]+/N/g' | sort | uniq -c`), filter by version (lines after `start 0.9.x`), and look for stalls, repeated errors, starts without a quit (crashes), duplicate work.
- **They want it to work for everyone.** "This isn't just for me, the app is meant for everyone": every path is detected (normal, Flatpak, portable, XDG overrides), never the owner's own.
- **Recomps are the owner's main interest now.** They believe recomps may overtake emulators. See Part 7.1.
- **Safety they care about:** never download and run something without showing what it is first (0.9.64 "Check It"); never touch saves except Save Sync, Linked Folders and (agreed for 0.9.65) recomp save backups during updates.
- **When they're unsure, they ask "what does this mean?"** Explain with their own example in plain terms (the Eden GPU Mode numbers explanation is a good model).

---

## Part 3. Process, tooling and the container

- **Electron runs in the container** (launch check and Playwright work). If `node_modules/electron/dist` is missing after `npm ci`, fetch `electron-v44.4.5-linux-x64.zip` from GitHub with curl into `node_modules/electron/dist` and write `path.txt` = `electron`.
- **GitHub access from the container:** the GitHub API is scoped to this repository only (other repos' API answers "sessions are bound to their configured repositories"). `git clone --depth 1` of any public repo works through the proxy, and `raw.githubusercontent.com` files work. So: read other projects' sources by raw URL or a shallow clone, never by the API. `git ls-remote --tags <repo>` works and is how release tags are read.
- **Other sites:** PCGamingWiki answers with a Cloudflare block from the container (relevant for 0.9.65). git.eden-emu.dev (Forgejo) API and raw files work. The shadPS4 wiki raw pages work.
- **The UI harness** (`tools/ui-audit/harness.js`): `open({ style, width, height, ui, answers, ... })` stubs `window.cart`. `window.__cartStore.openModal(type, props)` opens any pop-up; don't `await` it inside `page.evaluate` (it resolves only when the pop-up closes). Navigate with `page.click('[data-tab="settings"]')` and `[data-key="sec-<id>"]` (sections: library, emu, steam, ra, syncthing, ui, controls, dlup, about). EmuGet needs `emuget:state: []` and `jobs:list: []` in answers or it throws.
- **Game Settings data** is generated: `tools/game-settings/gen.js --fetch <dir>` downloads every reader's source files (and, since 0.9.63, each emulator's last four release tags into `<dir>/<id>@<tag>`), then `gen.js <dir>` writes `electron/emuSettingsDb.json`. `--tags-only` fetches only the releases. The sources used for 0.9.63 were master as of 8 Oct 2026 plus tags listed in Part 6.3. Before regenerating, check the output is identical for unchanged sources (it was, byte for byte).
- **Building a real tool to make test fixtures** worked well: ZArchive's own tool was compiled in the container (`g++` with zstd headers fetched from facebook/zstd and the system libzstd) to make a real `.wua`. Prefer this to fixtures you write by hand from your reading of a format.
- **Measure, don't guess:** `perf_hooks.monitorEventLoopDelay` for main-thread stalls; a Node benchmark of 400 fake saves showed the Save Sync fix (0.9 s block to 10 ms).

---

## Part 4. Every release in this stretch

| Version | Title | In one line |
|---|---|---|
| 0.9.55 | Steady | Home dimming a second after a game; the start-up freeze (`flatpak list` on the main thread) |
| 0.9.56 | Quick and Clear | background never idles off, springs start at full speed, dark Glass light fixed, Update All, Linked Folders setup, Pure Black |
| 0.9.57 | Seamless | Vita3K installs with no window, game names for codes, shadPS4 save path, new Cloud Sync screen, Save Sync game sheet |
| 0.9.58 | Saves You Can Trust | Save Sync slots per console family, found by key across RomM entries, every result shown; Update All as a background job |
| 0.9.59 | Every Save, Found | the save locator (rule cards per emulator), Search for Saves, Where Your Saves Are, PS4 reader |
| 0.9.60 | Smooth | picture work off the main thread, games on several consoles in Save Sync, Not Synced tabs; focus glow (reverted next) |
| 0.9.61 | The Old Highlight | focus and chosen back to 0.9.59, Spotlight dots, game-name suggestions in every text box, PPSSPP and Dolphin settings from source |
| 0.9.62 | Every Game's Settings | Game Settings for every emulator from its source, Advanced tab, typed numbers, 62 RetroArch cores, Xbox 360 and Dreamcast IDs |
| 0.9.63 | The Right Version | Save Sync freeze, RPCS3 paths and Repair, settings per emulator release, .wua title IDs, one-row tabs, file picker, Xenia patches, log fixes |
| 0.9.64 | Forks and Links | forks under their parent with versions, Link to Its Project, fork-aware settings and patches, GitHub search, send from phone, Windows builds through Proton |

---

## Part 5. Map of new code (where to look)

- **Saves:** `electron/saves.js` (the locator: `WHERE`, `places`, `scan`, `match`, `likely`), `electron/saveSearch.js` (budgeted async search), `electron/saveSync.js` (units, slots per family, `syncUnit`, `hashUnitAsync`, `rommRpc` with the 413 fallback), `electron/titleDb.js` (PS1/PS2 names from PCSX2 and DuckStation databases), `src/components/SaveSyncCard.vue`, `SaveGame.vue`, `SaveLocations.vue`, `CloudSync.vue`, `FolderView.vue`.
- **Game Settings:** `electron/gameSettings.js` (formats, `describe`/`apply`, `pickRelease`/`listFor`), `electron/emuSettingsDb.json` (generated), `tools/game-settings/gen.js` and `readers/<emu>.js`, `electron/x360Id.js`, `electron/wua.js`, `src/components/GameSettings.vue`, `docs/game-settings/<emu>.md`.
- **Patches and add-ons:** `electron/patches.js` (RPCS3 incl. `rpcs3CfgDir`, `rpcs3Relocate`, `rpcs3ConfigCheck/Repair`; shadPS4; PCSX2), `electron/xeniaPatches.js`, `electron/cemuPacks.js`, `src/components/GameAddons.vue`, `PatchesSheet.vue`.
- **Emulators and forks:** `electron/customEmu.js` (link picking incl. `pickWindows`), `electron/forkVersions.js`, `electron/github.js` (`release`, `search`), `electron/phoneLink.js`, `electron/emuUpdates.js` (`ENDED`, `dated`), `src/components/EmuGet.vue`, `LinkInput.vue`.
- **Downloads:** `src/components/FilePick.vue`, `store.download(rom, { pick })`, main `dl:add` `only`.
- **Speed and diagnostics:** `src/imageWorker.js` (pictures in a window worker), main `imgWork`, `healthLine`, `slowSteps`, `keepEmuLog`, `SHARED` (in-flight answers shared), `progRunning`.
- **Shared UI bits:** `.seg.strip` (styles.css + `strip()` in `src/motion.js`), `src/gameSuggest.js`.

---

## Part 6. Subsystems: what they do now and why

### 6.1 Speed and freezes
Rule (docs/design-rules.md 10b, pinned in test/designRules.test.js): nothing heavy on Electron's main thread. Found and fixed in this stretch:
- **0.9.55:** `flatpak list` with execFileSync held the main thread for seconds in Game Mode; gamescope dimmed the window and the controller went. Now Flatpak's folders are read directly (`detect.flatpakApps`), the login shell's PATH is read in the background.
- **0.9.60:** picture shrinking (nativeImage) on the main thread took 25 to 120 ms each: moved to a Worker in the window (`src/imageWorker.js`, `imgWork`). Game IDs read lazily (`gameId` `lazy`, `warm`).
- **0.9.63 (from the owner's log):** Save Sync blocked ~18 s every 30 minutes. Cause: `syncUnit` with `opts.remotes` never really awaited, so every save of every emulator was read and md5'd in one synchronous loop. Fix: `hashUnitAsync` with an md5 cache keyed by path, size and date (`save-hashes.json`), files read with `fs.promises`, and `breathe()` (setImmediate) between saves. Measured on 400 saves: one 0.9 s block before (far longer on the owner's external drive), longest block 10 ms after, later runs 0.15 s total. Also a ~600 ms stall every minute: the trophy watcher stat'd every trophy file every 8 s synchronously; now `pollSigAsync`.
- **Diagnostics added (0.9.63):** `health:` log lines (every 5 minutes, every minute while a game runs: Cartridge's memory and CPU, system free memory, load), `slow steps` lines naming any step over 250 ms, failed background jobs and emulator installs logged with their reason, network errors naming the host, Vita3K's log copied every 30 s while a Vita game runs (`emulator-runs/vita3k-last.log`).

### 6.2 Saves
- **Save Sync (0.9.51, reworked):** slots per console family (`cartridge:<family>:<kind>:<key>`), saves found by key across every RomM entry (two devices may match a game to different entries), uploads go to the entry already holding the save, a save under a game of the wrong console is filed again under the right one (`refiled`, nothing deleted), every result shown with its reason (Needs Attention merged into Not Synced, two tabs: Not in Your Library / In Your Library). `running()` judges the program (argv[0]), never text anywhere in a command line (my own shell once made Eden look open).
- **The save locator (0.9.59):** each emulator's save places read from its own settings the way its source reads them (Eden save/nand directory, RPCS3 vfs.yml, Vita3K pref-path, shadPS4's two layouts, PCSX2 MemoryCards, DuckStation, Dolphin NAND and GCI folders, Cemu mlc, Azahar sdmc), In Use vs Old Copy, links followed (readdir types called a link "not a folder": saves behind links were never found, for every emulator). Search for Saves (async, budgeted 45 s / 250k folders, stops when a game starts, dedupes by device and inode since 0.9.63). Where Your Saves Are: Move Into Use (verified copy, original renamed `.cartridge-moved`, never deleted), Use This Folder.
- **413 (0.9.63):** a save refused for its size is tried on the server's other address (home or away) and the one that takes it is remembered; refused everywhere, it says the web server or tunnel limits upload size (RomM's own nginx has no limit) and isn't retried until it changes or Sync Now.
- **Not tested on a device:** most of the above with two real devices; the owner tested parts (Zelda between PC and Ally).

### 6.3 Game Settings
- **From source, every emulator (0.9.61 to 0.9.62):** one reader per emulator in `tools/game-settings/readers/` reads only the settings the emulator takes for one game, with its own names, choices, descriptions and defaults: PPSSPP (`CfgFlag::PER_GAME` only), Dolphin, RPCS3, PCSX2, DuckStation, shadPS4, Eden, Azahar, Cemu, Vita3K, Xenia Canary, Flycast, MAME, Supermodel, Ryujinx, RetroArch and 62 cores' options. Tabs in each emulator's order, Advanced last, Steam tab before it, numbers typed within the emulator's range. Formats per emulator are in `gameSettings.js` and `docs/game-settings/<emu>.md`. Citron, yuzu and Citra are refused (their enum numbers differ from Eden's and Azahar's).
- **Per release (0.9.63):** the owner's Eden 0.2.0 has GPU Mode Fast/Balanced/Accurate (enum Low, Medium, High) where Eden's master has Fast/Accurate (Low, High), so Cartridge's "Accurate" (1) meant Balanced to their Eden. Now readers declare `versions: { git, tags }`; gen.js reads the last four release tags and keeps only what differs (`db.versions[emu] = { tags, diff }`). The app reads the installed version (`emuVersionFor`: shadPS4's chosen version, RPCS3's log, the version an update put in, the file name, Flatpak metainfo) and `pickRelease` picks the release: newer than all = newest source, within = the latest not newer, older than all or unknown = locked (settings that differ are shown but only changed in the emulator). Releases read: Eden v0.1.0 to v0.2.1 (31 to 42 differences), Azahar 2126.x, Cemu v2.3 to v2.5 (v2.6 skipped: the reader can't read it), Dolphin 2606 to 2609a (no differences), DuckStation four builds, Flycast v2.6/v2.7 (v2.4/2.5 skipped: files moved), MAME 0286 to 0289, PCSX2 v2.9.111 to 114 (none), PPSSPP v1.20.1 to 1.20.4, RPCS3 v0.0.41 to 43 (v0.0.40 skipped), shadPS4 v0.16 to v0.19. No numbered releases: Vita3K, Xenia Canary, Supermodel, Ryubing (newest source only).
- **RPCS3 (0.9.63, confirmed in RPCS3's Utilities/File.cpp):** `config/` under RPCS3's folder exists only on Windows. Cartridge had written per-game settings, database settings and patch switches to `config/` on Linux, where RPCS3 never reads them: the owner's Infamous settings "did nothing". Now `rpcs3CfgDir(root)` (Windows layout only if `config/config.yml` exists and `config.yml` doesn't), files moved across at start (`rpcs3Relocate`, never over RPCS3's own, records follow). The owner's "Failed to load global config ... line 277 illegal map value" was an older EmuDeck's resolution edit joining two lines (`Write Depth Buffer: falseResolution Scale: = 150`); Issues offers Repair for that pattern only (backup, EmuDeck's own sed, must parse after, else the backup goes back).
- **Speed:** PCSX2's serial and CRC cached per file (`ps2-ids.json`); matching against PCSX2's game list resolves only same-named entries.
- **Forks (0.9.64):** a game set to a fork uses the fork's portable `user/` folder for settings and patches, named "shadPS4 (GR2fork)".

### 6.4 Patches and add-ons
- **Xenia Canary (0.9.63):** github.com/xenia-canary/game-patches as Xenia reads it (src/xenia/patcher/patch_db.cc): `<storage root>/patches/<8 hex>*.patch.toml`, `[[patch]]` blocks with `is_enabled`, a file per game build (hash of default.xex: title updates have their own files), `apply_patches` (General) on by default. Storage root: beside the program with `portable.txt` (always for the Windows build), else `~/.local/share/Xenia`. Download: the repo's `latest` release zip, else the repo zip; only patch files laid in; files Cartridge didn't write are never replaced; an update keeps which patches were on. All 501 files (1,740 patches) parsed when checked. The repo has no licence, so tests use made-up files.
- **Cemu (0.9.63):** `.wua` title IDs from the ZArchive file tree (root folders `<TID>_v<N>`), so graphic packs and Game Settings work for .wua games. Game Add-ons reads Cemu packs on open and shows the tabs once, already counted (before, every group showed and the empty ones vanished on R1).

### 6.5 Downloads
- **File picker (0.9.63):** a RomM game of 2 to 60 side-by-side files (not nested) asks which to download; nothing ticked, Select All. Folder games come whole. Bulk downloads never ask.

### 6.6 Emulators, forks and links (0.9.64)
- **Forks under their parent:** `emuup:list` returns every fork (`steamManager.forksAll()` plus forks from a GitHub link) with `fork: true` and `forkOf`. The parent's sheet has Forks; a fork never takes its parent's update (guard in `emuup:run`).
- **Link to Its Project** (`emuget:adopt`): a fork Cartridge found is linked to its GitHub project, then updates in place where it lives.
- **Versions** (`forkVersions.js`): the copy in use never moves (Steam shortcuts stay valid); on update the replaced release's own files (its manifest) move to `<emulators folder>/.cartridge-versions/<name>/<tag>/`; switching moves files both ways; a fork's portable `user/` folder is never touched. A fork linked with no known version is kept as "as found".
- **GitHub search** (`github.search`): API search, most stars first; the search page's embedded JSON as a fallback (untested from the container).
- **Send from phone** (`phoneLink.js`): a page on the device's LAN address with a 32-hex secret path, QR code in Cartridge, one text up to 4 KB, closes after the first text or 10 minutes.
- **Check It:** project, stars, release, file and kind shown before downloading.
- **Windows builds:** `pickWindows` only when no Linux build exists (never Android, macOS, ARM, source, installers); a lone .exe goes in its own folder. Steam shortcuts for .exe use Cartridge's chosen Proton, else Steam's own default (config.vdf CompatToolMapping "0"), else Proton Experimental.
- **Lime3DS/Citra (0.9.63):** never updated to Azahar (`emuUpdates.ENDED`); the owner's `lime3ds-gui.AppImage` had been replaced with Azahar by an update before this.

### 6.7 UI pieces
- **One-row tabs (0.9.63):** `.seg.strip` scrolls, keeps the chosen tab in view, fades the edge where more continue. Used by Game Settings, Game Add-ons, More's tabs, the patch window, Licences, Syncthing.
- **Game-name suggestions (0.9.61):** `src/gameSuggest.js`, in Cartridge's keyboard and the plain text prompt.
- **Spotlight dots (0.9.61).**

---

## Part 7. The agreed plans for the next updates

### 7.1 0.9.65 · Recomps (the owner's main focus)

What a recomp is here: a native PC port of a console game (static recompilation or decompilation), e.g. Zelda 64: Recompiled, Ship of Harkinian, Unleashed Recompiled, a P.T. recomp, a Skate 3 recomp. They need the user's own copy of the game the first time.

**Decisions (owner, 9 Oct 2026):**
1. **Where they show:** a new **Steam** console card in Consoles: Steam's logo where a console logo goes, Valve where Sony or Sega goes, Steam's colour, the Steam Controller as its picture, Cartridge's normal font (the owner was clear there is no font question). Inside, recomps grouped by the original console (P.T. under PlayStation 4, Ship of Harkinian under Nintendo 64). For now the card holds only recomps; Steam library integration maybe later ("never say never").
2. **Emulators → Recomps tab:** its own tab, grouped by console, not in Update All.
3. **Folders:** `recomp/<console>/` (same console folder names as `roms/`) added to every Emulation folder Cartridge has set up, on every drive, and to new setups.
4. **Two shortcuts, never mixed:** a game you have both ways (Skate 3 in Xenia and as a recomp) gets two Steam shortcuts. The emulated one stays in its console collection; the recomp goes only into a new **Recomps** Steam collection.
5. **The database:** built from PCGamingWiki's List of unofficial ports (ignore its status notes: it called P.T. cancelled though it's on GitHub). Where it has a link, use it; where not, find it on GitHub (most-starred match that names the game and has a usable release). The other lists (awesome-* lists, ReadOnlyMemo) were rejected by the owner. Shipped as a checked catalogue in the repo that Cartridge downloads (so new recomps appear without an app update), plus a **daily background refresh** (at most once a day after launch, a second or two, only new entries looked up) that adds new finds **silently** (no pop-ups), marked as found automatically. The refresh runs on by default. Note: PCGamingWiki blocks automated reads from the container (Cloudflare); try Cartridge's hidden-window fetch (webFetch `viaWindow`) on a home connection, and expect to build the first catalogue by other means (a session with a browser, or the owner's help).
6. **Automatic-find safety:** only a PCGamingWiki link or the single well-starred repo naming the game, not a fork unless the original is gone, with a release that has a Linux or Windows build.
7. **Builds:** Linux first, Windows through Proton only if no Linux build exists, nothing else (never Android: the owner was explicit). The 0.9.64 `pickWindows`/`pickAsset`/`pickArchive` rules apply.
8. **Setup per recomp:** each catalogue entry records how it takes your game file: Path (written to its settings or command line, no window), Place (linked where it looks; no copy), or Picker (its own window opens with a note showing the path, ready to paste; for Proton builds the `Z:\` form). Windows recomps' setup must run through Proton too: add the Steam shortcut with Proton first and run setup through Steam, so it uses the same Proton prefix as play.
9. **Right version of the game:** the entry stores the region/version/checksum the recomp needs (Zelda's recomp needs the US N64 ROM; Unleashed needs the title update and DLC). Say plainly before installing when the user's copy doesn't fit, and which files are missing.
10. **Progress:** setup is a background job (B leaves the screen, it continues under Downloads → In the Background), with a real bar for downloads and handover and a measured bar (bytes written, against the finished size when the entry knows it) for the recomp's own building.
11. **Done detection:** each entry names the file that appears when setup finishes (Ship of Harkinian's asset file etc.). For recomps from a link (not in the catalogue) the user presses Done, Add to Steam.
12. **Metadata:** SteamGridDB artwork; the repo's description, latest version, stars, release notes and first README picture; the RomM game supplies the rest.
13. **Updates:** never automatic (a badge; the user chooses). Saves backed up first (the catalogue knows where each recomp saves; for link recomps, its folder except program files plus data folders named after it), new version side by side, setup redone if needed with the same file, saves put back and checked, started once, then the Steam shortcut switched. Keep previous versions for Roll Back (one button; I recommended keeping the last two and the owner didn't object; 0.9.64's `forkVersions.js` is the model). Stable or pre-release per recomp. Never while it runs. Builds only as GitHub Actions artifacts can't be downloaded without sign-in: show "Updates on Their Own Site".
14. **Saves:** backups during updates are a new, approved exception to "never touches saves"; recomps also join Save Sync.
15. **Trophies:** recomps have none by default (no console trophy service underneath; RetroAchievements hashes ROMs; Steam shortcuts can't have achievements). Where a recomp records its own achievements to a file (Unleashed Recompiled does), read them like emulator trophies: read only, in Achievements, synced to RomM notes. Check each recomp when building the catalogue.
16. **From a link:** recomps not in the catalogue use the same GitHub card as emulators (0.9.64: search, phone, Check It, Linux first then Windows). Cartridge guesses the console and game from the repo name and description against the library and the user confirms.
17. **First set:** the owner said "everything at once": build the whole catalogue, with repo, release and build checked for every entry; how each takes its file read from its README and source (Picker when unclear). End-to-end setup with real games can't run in the container (no game files, no GPU): give the owner a list to test.

### 7.2 0.9.66 · Online Play
- **A new Settings section, Online Play:** every installed emulator that plays online, sign in or create accounts, online status on game and emulator pages.
- **Tied to emulator updates:** after every emulator update, check its online settings still exist and in the format the new version reads; put back what an update reset; say plainly if the format changed.
- **RPCN (RPCS3), researched in RPCS3's source:** `rpcn.yml` in RPCS3's config folder (`fs::get_config_dir(true)`: the root on Linux) with Version, Host (np.rpcs3.net), NPID, Password, Token, Hosts, IPv6 option. The password is stored as PBKDF2 with SHA3-256 of the typed password, salt "No matter where you go, everybody's connected.", 200,000 rounds, 32 bytes, upper-case hex (`rpcn_settings_dialog.cpp derive_password`). Online on: config.yml `Net:` `Internet enabled: Connected` and `PSN status: RPCN` (system_config.h). Accounts are created over RPCN's protocol (TLS on port 31313): username, password, email, then a 16-character token (A-Z, 0-9) emailed to the user. Check Electron's crypto has SHA3 (BoringSSL may not, the same trap as XTS in 0.9.30); bundle a small SHA3 if not. Edit config.yml with the same care as the 0.9.63 Repair (only those two lines, backup, parse before and after, Repair offered first if damaged, never while RPCS3 runs). If creating accounts over the protocol is too risky, open RPCS3's own dialog for that and keep Sign In in Cartridge.
- **ShadNet (shadPS4), researched:** added in shadPS4 0.16, built on RPCN's design (same port 31313), early testing (scoreboards; no multiplayer yet). Accounts are made on shadPS4's website. The launcher can't turn it on yet; by hand: `config.json` General `shad_net_enabled: true`, `shadnet_server: "srv.shadps4.net:31313"`, `shadnet_webapi_server: "http://srv.shadps4.net:31315"`; `users.json` user (normally 1000) `shadnet_enabled`, `shadnet_npid`, `shadnet_password` (stored as typed). Say plainly it's early testing.
- **Others to research then:** Eden and Azahar multiplayer rooms, Dolphin netplay and Wiimmfi, PPSSPP ad hoc server, PCSX2 network adapter (PS2 revival servers), Cemu Pretendo Network, RetroArch netplay, Ryujinx local wireless.

---

## Part 8. Things that broke and how they were fixed (learn from these)

- **A "rule" I added broke the owner's taste:** 0.9.60's focus glow. Never change focus or chosen styling without asking.
- **RPCS3 config/ folder:** I had assumed RPCS3's Windows layout on Linux since 0.9.3. Read the emulator's own path code before writing to its folders.
- **Settings choices change between releases:** I read Eden master; the owner runs a release. Since 0.9.63, read releases too.
- **Synchronous work hidden in an async function:** `await` of a plain value doesn't yield to the event loop; Save Sync blocked for 18 s because of it. Yield with `setImmediate` between pieces of work and read files with `fs.promises`.
- **Lime3DS overwritten with Azahar:** family members listed under one emulator's entry (REAL_NAMES) must never take that emulator's updates.
- **A null `querySelector` after closing a pop-up while it loads:** after every `await` in a component, check the element still exists (scan done in 0.9.63).
- **Harness pitfalls:** awaiting `openModal` hangs the audit; rebuilding `dist` mid-audit crashes it.
- **My own slip in this stretch:** running `node -e "require('./electron/main.js')"` starts the app's main file (it never exits); use `node --check`.

---

## Part 9. Open items, unverified work and what to ask the owner

**Owner to test on a device (from 0.9.63 and 0.9.64):**
- Save Sync with no freezes (log lines `main thread` and `health`); the PSP save that failed with 413.
- Infamous's settings taking effect in RPCS3; Repair in Settings → Emulators → Issues.
- Eden 0.2.0's GPU Mode; Mario Tennis Ultra Smash's Game Settings and Add-ons tabs; the tab row on the TV; PCSX2 settings speed.
- P.T.'s file picker; Xenia patches on an Xbox 360 game.
- KytyPS5 install again (then send the log: the reason is now written there).
- Unit 13 in Vita3K with frame generation off (the freeze: picture and input stopped, audio continued, Steam button dead: gamescope/driver, likely lsfg-vk on a swapchain change when the game's settings opened). If confirmed, warn when turning frame generation on for Vita games.
- The GR2 fork under shadPS4's Forks, Link to Its Project, an update, switching versions back; Game Settings and patches for Gravity Rush 2 naming the fork.
- GitHub search, sending a link from the phone, Check It, a Windows-only project through Proton.

**Known gaps:** GitHub's search page fallback untested (no access from the container); Romhacking.net untested (Cloudflare); KytyPS5's failure reason unknown until the next log; recomps and Online Play not started.

**Earlier stretches' open items** (still open): see Part 9 of HANDOVER-0.9.38-to-0.9.54.md.

---

## Part 10. How I'd work in your place

Read the newest SESSION-LOG entry, CLAUDE.md and this file first. When the owner sends photos or a log with "don't build yet", investigate read-only and reply per item with cause, fix and options, then one numbered list of questions with your recommendation for each. When they say Start, make a task list, build in commits you push as you go (the test build runs on every push), check everything (tests, build, launch check, audit, screenshots in Plain and Glass), write the SESSION-LOG entry, the CLAUDE.md section and **this handover**, then open and merge the PR. Read every emulator's own source before writing to its files, and every external project's real release layout before installing from it.
