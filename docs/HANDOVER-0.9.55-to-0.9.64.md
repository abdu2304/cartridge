> **Read first (owner, 6 Oct 2026):** Plain and Glass are two separate modes, never merged. One Style setting (Plain or Glass) covers the whole app; design every element for both, and never let a change for one leak into the other. Details in CLAUDE.md.

# Handover: everything from 0.9.55 to 0.9.70

To the Claude on the next account, from the Claude on this one.

Three handovers come before this one: `docs/HANDOVER-0.9.3-to-0.9.21.md`, `docs/HANDOVER-0.9.22-to-0.9.37.md` and `docs/HANDOVER-0.9.38-to-0.9.54.md`. Everything in them about the owner, the process and the do-not-break rules still holds unless this document says otherwise. This one picks up at 0.9.55 (7 October 2026) and runs to 0.9.69 (16 October 2026): **15 releases**. 0.9.68 and 0.9.69 were made on another account after a catch-up (Parts 15 and 16). The file keeps its old name so links to it still work. Part 7 holds the plans the owner agreed for recomps and Online Play, with every decision and the reason behind it; both shipped (Parts 11, 12 and 13), and what is still missing from those plans is listed in Part 9.

**The owner asked for this document to be kept up to date after every update from now on.** When you finish an update, add a Part for it at the end, add it to Part 4 (releases), Part 5 (code map) and Part 6 (subsystems), add what broke to Part 8, move what's done out of Part 9 and add what's new there, and update Part 1. Then read the whole file once more, top to bottom, against the session: in 0.9.65 and 0.9.66 only new Parts were added at the end and Parts 1 to 9 went stale until the owner asked (Part 8). Keep the same level of detail: what changed, why, what was found, how it was checked, what the owner must test.

Read in this order:
1. This document, once, top to bottom.
2. `CLAUDE.md`: its sections "0.9.55" to "0.9.67" are the short technical notes per version, with function names: the index into the code.
3. `docs/SESSION-LOG.md`, newest entry first: the per-update diary with the owner's words and what they must test.
4. `docs/design-rules.md` before any UI change (section 6: focus and chosen are frozen, see Part 2), `docs/cae.md` before motion, `docs/glass-engine.md` before Glass, `docs/architecture.md` for the engine map, `docs/game-settings/<emu>.md` before touching an emulator's Game Settings.
5. `CHANGELOG.md` for the exact user-facing wording.
6. For recomps: `docs/recomps.md` (every catalogue entry with its sources and doubts). For Online Play: the comments at the top of each adapter in `electron/onlineAdapters.js` (repository, commit and file:line for every setting).

The repo is public. Nothing private is in this document. Keep it that way.

---

## Part 1. Where things stand right now

- **Latest release:** v0.9.88 "Cartridge 0.9.88 · Smooth Again" (19 Oct 2026; Part 35): the second session on the owner's PC. Save Sync no longer freezes Cartridge on a port's caches, ports start through Steam so Steam Input gives them the controller, ports and console games kept apart, GSAP the one motion engine, the controller playtest green again, CLAUDE.md split into docs/VERSIONS.md. Before it: v0.9.87 (Part 34) and v0.9.86 (Part 33).
- **Branch:** `claude/relaxed-fermat-30pigp`, merged into `main` by a PR for every release (merge commit, not squash). After a merge, reset the branch to `main` (`git fetch origin main && git checkout -B claude/relaxed-fermat-30pigp origin/main`) before new work.
- **package.json:** `version` = `versionName` = 0.9.88, `releaseName` "Cartridge 0.9.88". Betas and nightlies are stamped by `tools/release/prerelease.js` in CI only; never commit their versions. The lockfile's version field is stale and always was; leave it.
- **Tests:** 382 pass at 0.9.71 (updateChannels, recovery, cheatDbs, forks added; e2e is separate: `xvfb-run -a node test/e2e/run.js`, 18 checks), 365 pass at 0.9.70 (recipes and tokens added; the catalogue tests went with the catalogue), 356 at 0.9.69, 354 at 0.9.68 (347 at 0.9.67, 343 at 0.9.66; fileIds added and recomps grown in 0.9.68) (`npm test`; recomps and onlinePlay added in 0.9.65 and grown in 0.9.66). Test files added in this stretch: saveLocator, titleDb, vitaInstall, gameSettingsAll, rpcs3Paths, wua (with `test/fixtures/mario-tennis.wua`), xeniaPatches, forkVersions, phoneLink, recomps, onlinePlay (fake RPCN server inside); saveSync and gameSettings grew a lot.
- **Before every release:** `npm test`, `npx vite build`, the launch check (`CARTRIDGE_SMOKE=1 HOME=$(mktemp -d) xvfb-run -a node_modules/electron/dist/electron . --no-sandbox` must print `SMOKE OK`), `npm run audit:ui` (focus and contrast in six looks, clipping, the tour twice; all zero at 0.9.63 to 0.9.67; it takes about 15 minutes, so run it in the background). Never rebuild `dist` while the audit runs: it reads `dist` and crashes mid-run.
- **Standing instruction:** when an update is finished, built and launch-checked, open the PR and merge it without asking. A version change on `main` publishes the release to every user.

- **Verified recipes update without a release (0.9.70):** every Cartridge fetches `electron/recipes/index.json` from `main` once a day (`recipesUrl` in main.js) and uses it when its `rev` is newer. (Until 0.9.69 it was the catalogue `electron/recomps.json`, now removed.) Old note: and uses it when its `updated` date is newer than the shipped one. So a catalogue fix merged to `main` reaches every user within a day, with no version bump, but only if `updated` moves on (`node tools/recomps/build.js <batch files> --updated <date>`). A broken catalogue on `main` also reaches everyone: run `npm test` (test/recomps.test.js) before merging one.

**What comes next (agreed with the owner, in this order):**
1. ~~0.9.65 · Recomps~~ and ~~0.9.66 · Online Play~~: both shipped together as 0.9.65 (Parts 11 and 12).
2. ~~The six things agreed but not done in 0.9.65~~: shipped as 0.9.66 (Part 13).
3. ~~The three Part 7 items left after 0.9.66~~: shipped as 0.9.67 with two bug fixes (Part 14). Everything still not done, checked three times, is in Part 9.
4. ~~A full debugging pass~~ (owner, on another account after a catch-up): shipped as 0.9.68 (Part 15).
5. ~~Recomps, Finished~~ (Part 9 items 1, 2, 4, 5, 6, 9, 10 and 13): shipped as 0.9.69 (Part 16).
6. ~~One update with everything from the skills review and verified recomps~~: shipped as 0.9.70 (Part 17).
6b. ~~Everything still promised plus my eight recommendations~~: shipped as 0.9.71 (Part 18), with my picks from the option board since the owner hadn't picked.
6h. ~~A playtest on the owner's own PC, everything, fixed for every setup~~ (owner's brief, docs/PLAYTEST-ON-A-REAL-PC.md): shipped as 0.9.86 (Part 33); the controller over real Desktop Mode input is still open (Part 9).
6g. ~~Vita3K's sheet, and testing every setup~~ (owner): 0.9.76 (Part 23); the full sweep loop continues (Part 23).
6f. ~~P.T. unpacked by hand not found~~ (owner): shipped as 0.9.75 (Part 22).
6e. ~~Zip extraction for PS4 and other systems~~ (owner): shipped as 0.9.74 (Part 21).
6d. ~~Settings back to the list of sections, polished~~ (owner, photo of the cards on the handheld): shipped as 0.9.73 (Part 20).
6c. ~~A playtest with eight playtesters, recomps first, and fixing what they found~~: shipped as 0.9.72 (Part 19; report in docs/playtest-0.9.72.md).
7. Owner device tests (end of Parts 11 to 17), then whatever the owner picks from Part 9's list. The owner said on 14 Oct they were sending more bugs; none had arrived by 0.9.68.
8. Keep this handover updated after each.

**Waiting on the owner:** a PS4 game with an update zip and a PS3/PS2 zip downloaded on the device (0.9.74), the 0.9.73 Settings check on the handheld and TV, the 0.9.72 device tests (end of Part 19), the 0.9.71 device tests (end of Part 18) and a first beta from Actions; whether the option-board picks I took (A, D, B) are the ones they want; two Cartridge devices (plan-0.9.39 §4); the 0.9.68 tests (end of Part 15: Place recomps, Zelda 64's own wizard, Game Mode start with no dimming); device tests listed in Part 9 (from 0.9.63 to 0.9.66); KytyPS5 log after 0.9.63 if it still fails; the Unit 13 freeze test with frame generation off; which of Part 9's not-done items to build next (they built items 1 to 3 of the old list as 0.9.67 and asked for a triple check of the rest).

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
- **Credits decide the pace (0.9.65 to 0.9.66).** They work on prepaid credits and say so: "Can wrap up quickly cause I'm almost out of credits", "I added 5$ credits please finish with 5$", then "I'm stocked up on credits again. No need to build in batches. Just build the rest of this update and the next one all in one go." When credits are short: commit and push working checkpoints often, keep the handover current at every push, and finish the smallest complete piece. When they're stocked up, they want whole updates in one go.
- **"If I run out of credits mid session please start the project again in 5 hours from now UAE time ... because I will be sleeping."** (13 Oct 2026; they are in the UAE, UTC+4). Done with `send_later` (claude-code-remote) 300 minutes ahead, the message saying exactly what to finish and to re-arm itself, and cancelled (`delete_trigger`) once the release merged. It fired once while the audit was running; the session carried on and re-armed, then cancelled after the merge. Use the same pattern if they ask again; never leave one armed after the work is merged.
- **They check for loose ends.** After a release they ask "Is there anything we said we'd do but didn't?" and "Did you publish everything to handover?", then "Make sure the handover leaves no stones unturned". Before calling an update finished, go through Part 7 (and any plan in chat) item by item against the code and say plainly what is missing. That check found six gaps after 0.9.65 (built as 0.9.66) and four more after 0.9.66 (Part 9).
- **"Don't completely delete X, just remove it from the download list until ..."** (KytyPS5, 0.9.65): hide, don't remove; keep the user's copy and its updates working, and bring it back on its own when the condition changes (`gate` in emuGet).
- **Attachments:** an HTML file they attach can arrive as plain text with the links lost; a zip of the saved page worked (the PCGamingWiki page for the catalogue).
- **They confirm before building big things.** For recomps they said "confirm before building, I will tell you when to build", answered the questions, then "Okay start".

---

## Part 3. Process, tooling and the container

- **Electron runs in the container** (launch check and Playwright work). If `node_modules/electron/dist` is missing after `npm ci`, fetch `electron-v44.4.5-linux-x64.zip` from GitHub with curl into `node_modules/electron/dist` and write `path.txt` = `electron`.
- **GitHub access from the container:** the GitHub API is scoped to this repository only (other repos' API answers "sessions are bound to their configured repositories"). `git clone --depth 1` of any public repo works through the proxy, and `raw.githubusercontent.com` files work. So: read other projects' sources by raw URL or a shallow clone, never by the API. `git ls-remote --tags <repo>` works and is how release tags are read.
- **Other sites:** PCGamingWiki answers with a Cloudflare block from the container (relevant for 0.9.65). git.eden-emu.dev (Forgejo) API and raw files work. The shadPS4 wiki raw pages work.
- **The UI harness** (`tools/ui-audit/harness.js`): `open({ style, width, height, ui, answers, ... })` stubs `window.cart`. `window.__cartStore.openModal(type, props)` opens any pop-up; don't `await` it inside `page.evaluate` (it resolves only when the pop-up closes). Navigate with `page.click('[data-tab="settings"]')` and `[data-key="sec-<id>"]` (sections: library, emu, steam, ra, syncthing, online, ui, controls, dlup, about). EmuGet needs `emuget:state: []` and `jobs:list: []` in answers or it throws. Stub answers live inside a JavaScript template string in harness.js: a `\n` written there becomes a real line break inside a quoted string, the stub script fails, the app never loads and every `page.click` times out (0.9.66). Keep stub texts on one line. The stub has samples for `online:list` (PPSSPP on, RPCS3 with a damaged file, Azahar Pretendo), `recomps:details` and `recomps:guess`, so the audits cover them.
- **Game Settings data** is generated: `tools/game-settings/gen.js --fetch <dir>` downloads every reader's source files (and, since 0.9.63, each emulator's last four release tags into `<dir>/<id>@<tag>`), then `gen.js <dir>` writes `electron/emuSettingsDb.json`. `--tags-only` fetches only the releases. The sources used for 0.9.63 were master as of 8 Oct 2026 plus tags listed in Part 6.3. Before regenerating, check the output is identical for unchanged sources (it was, byte for byte).
- **Building a real tool to make test fixtures** worked well: ZArchive's own tool was compiled in the container (`g++` with zstd headers fetched from facebook/zstd and the system libzstd) to make a real `.wua`. Prefer this to fixtures you write by hand from your reading of a format.
- **Research with subagents (0.9.65, 0.9.66).** The recomp catalogue and the Online Play facts were researched by subagents (Agent tool), each given a brief file (the schema, "cite file:line", "read the project's own source", "save after each entry") and told to write JSON into the scratchpad. They clone sources with `git clone --depth 1` into the scratchpad and read them there. Two lessons: agents hit usage limits on big batches (split into batches of about 10 entries and save after each), and the scratchpad is gone when the session ends, so everything worth keeping must end up in the repo (the catalogue in `electron/recomps.json` + `docs/recomps.md`, the online facts as comments in `electron/onlineAdapters.js`). The research JSON itself was not kept.
- **Adding or fixing recomps:** write entries as JSON in the shape `tools/recomps/build.js` takes (fields shipped: its `SHIP` list: id, name, games, origin, repo, site, builds, linuxAsset, windowsAsset, prerelease, program, args, needs, setup, done, saves, achievements, license, description; plus `sources` and `uncertain` for docs/recomps.md), then `node tools/recomps/build.js <batch files...> --updated <date>`, which writes both `electron/recomps.json` and `docs/recomps.md`. To change one entry without the old batch files, edit both outputs by hand in the same shape and move `updated` on. A "place" setup without a place becomes "picker"; entries with no repo or site are left out (listed under "Left out").
- **The session can restart mid-work** ("This session's worker process was restarted"). Files on disk survived; nothing else did. Commit and push a WIP checkpoint after each finished piece.
- **Tools from outside the repo:** the GitHub tools (`mcp__github__*`) load through ToolSearch and sometimes disconnect for a while; PRs were made and merged with them (`create_pull_request`, `merge_pull_request` with `merge_method: merge`). Reminders: `mcp__claude-code-remote__send_later` / `delete_trigger`.
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
| 0.9.65 | Recomps and Online Play | 96 recomps (Steam card, install, updates with saves kept, Roll Back, own Steam shortcuts, Save Sync, achievements), Online Play for ten emulators with a re-check after every emulator update, KytyPS5 hidden without a Linux build, Download More Files (Parts 11 and 12) |
| 0.9.67 | Follow Through | recomp setup watched as a background job with a measured bar, Online Play reports settings an update renamed, files parsed before and read back after every Online Play write; fixed: recomp save notes read as real paths (Proton, Flatpak), It's Set Up shown when needed (Part 14) |
| 0.9.69 | Recomps, Finished | recomp save backups with Put Back, Check It and It's Set Up for link recomps, guessed save backups, copy checked before install, automatic finds vetted, daily switch, Flatpak update start, clean-up (Part 16) |
| 0.9.68 | Set Up Right | freeze about 30 s after start (game IDs in a worker, memoised lookups), recomp Place setup by real paths (`setup.to`), recomp launch and one-off setup arguments, picker recomps set themselves up, the Steam card's controller (Part 15) |
| 0.9.70 | Cartridge Verified | recomps as a curated list of verified ports (Bloodborne, Uncharted, God of War III, inFAMOUS Second Son, P.T.), port settings, Proton without Steam, nightly recipe watchdog, worst-case and accessibility audits, one token table, GSAP test switch, controller playtest |
| 0.9.71 | Every Promise Kept | update channels and Choose a Version, safe start and settings backups, end-to-end tests in CI with budgets, Settings cards, Aurora Veil and Horizon Grid, Play With, port trophies, checked downloads, cheats (libretro, Switch), multi-drive finished, Saves widget, forks list from the repo, Online Play extras, Windows trial start, rows audit (Part 18) |
| 0.9.72 | Played and Fixed | eight-playtester run in the real app: update picker for ports, ports into Steam, copy refused, stale Steam queue, RetroArch without cores, Settings focus |
| 0.9.73 | Settings, As Before | the rail of sections back (owner), with a status line under each section |
| 0.9.74 | Unpacked Again | archives unpacked for PS4 folder games and every console whose emulators can't read them |
| 0.9.75 | Found by What's Inside | PS4/PS5 folders unpacked by hand recognised by their param.sfo |
| 0.9.76 | Every Emulator Opens | Vita3K, RetroArch and EmuDeck-launcher sheets open; setups sweep in CI |
| 0.9.77 | Every Button Pressed | crawl of every page, sheet and game More in four setups; Show all back, Where They Go, SteamGridDB notice |
| 0.9.78 | Saves on a New Device | Online Play and two-device save sweeps; RetroArch saves placed before its first save |
| 0.9.85 | PC Ports | the Steam card's page is game cards of installed ports opening their game pages; port play time counts for its game (Continue Playing); installer in Settings → Emulators → PC Ports (Part 32) |
| 0.9.84 | shadPS4 as a Flatpak | sweeps for game settings (14 emulators), add-ons (11 layouts) and Linked Folders with forks; shadPS4's Flatpak folder found for Game Settings and patches (Part 31) |
| 0.9.88 | Smooth Again | Save Sync freeze on a port's caches, ports start through Steam (controller), ports apart from emulators, GSAP the engine, controller playtest green, CLAUDE.md split (Part 35) |
| 0.9.87 | Starting Up | a starting screen while a game opens; the controller back after a PC port (Part 34) |
| 0.9.86 | Played on a Real PC | Proton in its own Steam runtime (umu can't run Proton 11), Save Sync on RomM 5.3, downloads survive a restart, ports shown as ports, CPU at 4K, Wii U/360 save matching, and more from the owner's PC (Part 33) |
| 0.9.85 | PC Ports | recomps as PC Ports, laid out like a console, in Continue Playing (Part 32) |
| 0.9.84 | shadPS4 as a Flatpak | sweep rounds 7 to 9, the shadPS4 Flatpak folder (Part 31) |
| 0.9.83 | Windows Ports on Any Drive | prefix on the internal drive when the port's drive can't hold links; honest prefix error; 15 min for umu's first run (Part 30) |
| 0.9.82 | Out of the Way | quiet whenever its game runs, async game watch, picture cache freed, setup speed and time left (Part 29) |
| 0.9.81 | Setting Up, Shown | verified setup steps named, installer progress in bytes, stalled installer stopped (Part 28) |
| 0.9.80 | Loose Ends, Tied | link recomps finished, Cemu Pretendo, RetroArch host/join, Vita frame generation warning (Part 27) |
| 0.9.79 | Your Answers | RomM features judged from its /openapi.json, recipe `tested` and `find`, PC Ports page, PS4 `-UPDATE` folders (Part 26) |
| 0.9.66 | Loose Ends | RPCN accounts made in Cartridge, ShadNet sign-up in its own window, RPCS3 Repair before Online Play writes, Online Play on emulator pages, recomp project details, link guesses, recomp updates started once before they're kept (Part 13) |

---

## Part 5. Map of new code (where to look)

- **Saves:** `electron/saves.js` (the locator: `WHERE`, `places`, `scan`, `match`, `likely`), `electron/saveSearch.js` (budgeted async search), `electron/saveSync.js` (units, slots per family, `syncUnit`, `hashUnitAsync`, `rommRpc` with the 413 fallback), `electron/titleDb.js` (PS1/PS2 names from PCSX2 and DuckStation databases), `src/components/SaveSyncCard.vue`, `SaveGame.vue`, `SaveLocations.vue`, `CloudSync.vue`, `FolderView.vue`.
- **Game Settings:** `electron/gameSettings.js` (formats, `describe`/`apply`, `pickRelease`/`listFor`), `electron/emuSettingsDb.json` (generated), `tools/game-settings/gen.js` and `readers/<emu>.js`, `electron/x360Id.js`, `electron/wua.js`, `src/components/GameSettings.vue`, `docs/game-settings/<emu>.md`.
- **Patches and add-ons:** `electron/patches.js` (RPCS3 incl. `rpcs3CfgDir`, `rpcs3Relocate`, `rpcs3ConfigCheck/Repair`; shadPS4; PCSX2), `electron/xeniaPatches.js`, `electron/cemuPacks.js`, `src/components/GameAddons.vue`, `PatchesSheet.vue`.
- **Emulators and forks:** `electron/customEmu.js` (link picking incl. `pickWindows`), `electron/forkVersions.js`, `electron/github.js` (`release`, `search`), `electron/phoneLink.js`, `electron/emuUpdates.js` (`ENDED`, `dated`), `src/components/EmuGet.vue`, `LinkInput.vue`.
- **Downloads:** `src/components/FilePick.vue`, `store.download(rom, { pick })`, main `dl:add` `only`.
- **Speed and diagnostics:** `src/imageWorker.js` (pictures in a window worker), main `imgWork`, `healthLine`, `slowSteps`, `keepEmuLog`, `SHARED` (in-flight answers shared), `progRunning`.
- **Shared UI bits:** `.seg.strip` (styles.css + `strip()` in `src/motion.js`), `src/gameSuggest.js`.
- **Recomps (0.9.65 to 0.9.67):** `electron/recomps.js` (engine, `details`, `guessFromText`, `readmePicture`, `plainNotes`, `watchSetup`, `savePaths`/`saveDirs`), `electron/recomps.json` (catalogue) built by `tools/recomps/build.js` (record in `docs/recomps.md`), `electron/recompAchievements.js`, main `recomps:*` and `trialRun`, steamManager recomp shortcuts, `src/components/SteamTile.vue`, `Recomps.vue`, `RecompSheet.vue`, `src/views/RecompsView.vue`.
- **Game IDs off the main thread (0.9.68):** `electron/fileIds.js` (readers with nothing from main's state, `createReader`), `electron/idWorker.js`; `gameId` `extractAsync`; `steamManager.warmSerials`. Memos in `steamManager` (`candMemo`, `binMemo`) and `trophies.emulationRoots` (`rootsMemo`).
- **Cartridge Verified (0.9.70):** `electron/recipes/*.json` + `index.json`, `electron/recipes.js` (pure), `electron/protonRunner.js`, verified parts of `electron/recomps.js`, `src/components/VerifiedSheet.vue`, `tools/recipes/{index,check}.js`; docs/recipes.md.
- **Design tooling (0.9.70):** `src/tokens.js` → `src/tokens.css` (`tools/tokens/gen.js`), `src/gsapEngine.js`, `tools/ui-audit/{worst,a11y,playtest,motionBench}.js`.
- **0.9.88:** `saveSync.notSave`/`sizeOf`/`SAVE_MAX`, recompsIpc `openVerified` through Steam (`watchGameRun(romId, { needles })` in MAIN), Game.vue `isPortPage`, store `goPlayed`/`playedPort`, `src/gsapEngine.js` (GSAP for good), `docs/VERSIONS.md` (the per-version notes from CLAUDE.md).
- **0.9.86:** `electron/protonRunner.js` (rewritten: `needs`, `runtimeDir`, `umuRuntimes`), `electron/childEnv.js`, `electron/zoom.js`, `electron/dlPending.js`, `electron/emuCfg.js` (moved out of main.js), `src/ambient.js` (`v-ambient`), `src/steamLogo.js`; main `childRun`, `savePending`/`restorePending`, `manifestMoved`; steamManager `pendingOnStart`, duplicate check in `health()`; recompsIpc `dumpsHere`/`steamOf`; recomps `matchDumps`; fileIds `wiiuTitle` (+ Xbox 360 through x360Id); Game.vue `portRows`/`portAction`; tests zoom, dlPending, emuCfg, and additions in recipes, recomps, steam, gameId, logos, rommFeatures, detect.
- **0.9.85:** `src/views/RecompsView.vue` (PC Ports page), steamManager `playtime()` port entries (`port`), Game.vue `port` prop and `portLabel`, SteamTile `ready`; test in `test/steam.test.js`.
- **0.9.84:** `test/e2e/gamesettings.js`, `addons.js`, `links.js` (in e2e.yml), `test/e2e/discs.js` (hand-made ISO 9660, GameCube, Dreamcast, STFS and 3DS headers), `homes.launch({ prep })`; `patches.shadDirs` and main `ps4PatchState` look in the Flatpak's folder.
- **0.9.80:** `electron/raNetplay.js` (+ main `online:raInfo`/`online:raPlay`, steamManager `directCommand`), onlineFormats xml attribute steps, recomps.js `ciBuildOf`/`saveChoices`/`setSyncSaves`/`pendingSetup` and `install({ local })`, recompsIpc `recomps:ciGet`/`watchFromSteam`, steam.js `vitaFgOk`; tests raNetplay, onlinePlay (Cemu), recomps (four), e2e online/saves.
- **0.9.79:** `electron/rommFeatures.js` (+ main `rommFeatures`/`rommLacks`, `server:features`), `electron/ps4Layout.js` (+ main `ps4Updates`), recipes `game.tested`/`game.find` (`findDir` in recipes.js), SteamSettings page `ports`; tests `rommFeatures`, `ps4Layout`, e2e saves (older RomM) and run (Update Pair).
- **0.9.72:** VerifiedSheet steps `needUpd`/`copyBad` + Steam row, `recomps:prepare { update }` and its auto Steam add, `steamManager.recompQueued`/`retroarchHere`, `apply()` dropping what can't be added; the playtest rig (scratchpad only) and `mockRomm` `extra.ps4`.
- **0.9.71:** `electron/updateChannels.js`, `electron/recovery.js`, `electron/recompsIpc.js` (first area out of main.js), `electron/raCheats.js` + `electron/chtIndex.json.gz` (`tools/cheats/index.js`), `electron/switchCheats.js`, `electron/forks.json`, `test/e2e/` (mockRomm, run, budgets), `tools/recipes/install-test.js`, `tools/recipes/draft.js`, `tools/ui-audit/rows.js`, `tools/release/prerelease.js`, workflows `prerelease.yml` and `e2e.yml`; shaders in `src/bgRenderers.js` (`SHADERS`, `shader()`), the hub in Settings.vue (`hub`, `statusOf`).
- **Online Play (0.9.65, 0.9.66):** `electron/onlinePlay.js` (engine), `electron/onlineAdapters.js` (one adapter per emulator, with its source), `electron/onlineFormats.js` (one-key writers), `electron/sha3.js` (pure SHA3/PBKDF2), `electron/rpcnClient.js` (RPCN accounts), main `online:*`, `src/components/OnlinePlay.vue`, the Online Play rows in Game.vue and EmuGet.vue.

---

## Part 6. Subsystems: what they do now and why

- **Update channels (0.9.71):** electron-updater's channel picks the file (`latest`, `beta`, `nightly`-linux.yml). `UC.apply` sets `allowPrerelease`/`channel` and keeps `allowDowngrade` off except once after a switch (`config.updateSwitched`), so moving from Nightly back to Stable can go down a version and normal updates never do.
- **Recovery (0.9.71):** a start counts as clean 15 s after the UI loads or at quit; two unclean starts in a row give a safe start overlaid in `shownConfig()` only, so nothing of yours is overwritten. The marker starts after the single-instance lock, so a second launch isn't counted.
- **Game archives (0.9.74):** `unpackGame` for `UNPACK_SYSTEMS` on both download paths. Kept zipped on purpose: cartridge consoles and arcade (RetroArch and MAME read zips; MAME needs them), PS Vita (Vita3K installs the archive). A lone file inside goes beside the other games so frontends see it like any ISO.
- **Port sheet steps (0.9.72):** the step comes from the port's state plus what the last Set Up said: `needsUpdate` gives Needs Update (pick the update's folder, sent as `update`, tried before the folders beside the game); any other failure that leaves the copy recorded (state `setup`) gives That Copy Didn't Work. With `steam.autoAdd` on, a successful Set Up queues every start's shortcut and calls `applySoon` (live only; otherwise it waits for Apply, and the Steam row says so).
- **Cheat databases (0.9.71):** RetroArch's game file is the only place Cartridge writes for RetroArch cheats, plus `apply_cheats_after_load` once; Switch cheats live only in Cartridge's own mod folder, removed when none are on.

### 6.1 Speed and freezes
Rule (docs/design-rules.md 10b, pinned in test/designRules.test.js): nothing heavy on Electron's main thread. Found and fixed in this stretch:
- **0.9.55:** `flatpak list` with execFileSync held the main thread for seconds in Game Mode; gamescope dimmed the window and the controller went. Now Flatpak's folders are read directly (`detect.flatpakApps`), the login shell's PATH is read in the background.
- **0.9.60:** picture shrinking (nativeImage) on the main thread took 25 to 120 ms each: moved to a Worker in the window (`src/imageWorker.js`, `imgWork`). Game IDs read lazily (`gameId` `lazy`, `warm`).
- **0.9.63 (from the owner's log):** Save Sync blocked ~18 s every 30 minutes. Cause: `syncUnit` with `opts.remotes` never really awaited, so every save of every emulator was read and md5'd in one synchronous loop. Fix: `hashUnitAsync` with an md5 cache keyed by path, size and date (`save-hashes.json`), files read with `fs.promises`, and `breathe()` (setImmediate) between saves. Measured on 400 saves: one 0.9 s block before (far longer on the owner's external drive), longest block 10 ms after, later runs 0.15 s total. Also a ~600 ms stall every minute: the trophy watcher stat'd every trophy file every 8 s synchronously; now `pollSigAsync`.
- **0.9.68 (owner: "after like 30 seconds ish the app dims ... if it comes back I lose controller support"):** game IDs were read on the main thread a game at a time (a Switch NSP or PS2 CHD can take seconds); the ID cache never saved during a read-through; Steam matching asked the disk for every game's real path and read up to 1 MB of every PS3/PSP/Vita game on each call; recomp trophies were re-read 25 s after every start. Then the debugging pass found that `candidates()` (every emulator for a console), `findBin` and `emulationRoots` checked dozens of paths on disk on every ask, and `forksAll` asks for about 60 consoles at once: memoised (4 s / 10 s / 10 s). Measured with a main-process CPU profile in a fake Game Mode home: stalls over 200 ms went from 4 (worst 510 ms) to 2 (worst 230 ms); the 14 Oct work had taken the worst from about 2,500 ms to about 300 ms. A watchdog logs `main thread stalled N ms` and brings the pad back in Game Mode. Not confirmed on a device yet.
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

- **shadPS4's folder (0.9.84):** the user folder for patches and Game Settings is the game's fork's own `user/`, else one with `patches/` (`shadDirs`: XDG data, ~/.local/share, the Flatpak's `~/.var/app/net.shadps4.shadPS4/data/shadPS4`), else the first of the AppImage's and the Flatpak's folders that exists.

- **PC Ports (0.9.85):** the Steam card opens `RecompsView` (installed ports only, owner's pick); a card opens `go('game', { romId, port })`. Game.vue's port: your Play With choice, else the `port` param, else `store.play[romId].port` (the port was played last). `steamManager.playtime()` adds each recomp shortcut's minutes to its `artRomId` and sets `port` when it was the newest play. Ports with no library game open their sheet. Steam's collection is still named Recomps (renaming would make a second collection).

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

### 6.7b RomM features and PS4 updates (0.9.79)
- **RomM features** are judged from the server's own API description (`/openapi.json`, which RomM's nginx passes through), never from a version number: Save Sync needs POST /api/saves with `slot` and `content_hash`, Trophy Sync needs game notes, and so on (`FEATURES` in rommFeatures.js). No description = everything on, as before. Cached 10 minutes per server and version.
- **PS4 updates** go beside their game as `<game folder>-UPDATE` after a download unpacks them (shadPS4 core/file_sys/fs.cpp reads `-UPDATE` or `-patch` beside the game). Judged by param.sfo CATEGORY gd/gp and TITLE_ID; newest update wins; never over a folder already there. Game detection (`sfoIndex`) and `findEboot` skip `-UPDATE`, `-patch` and `-mods` folders.

### 6.7c Link recomps, netplay (0.9.80)
- **Link recomps' saves:** never guessed into Save Sync; the sheet's Saves for Save Sync lists what `guessSaves` found and you tick folders (inside home, not home itself, not the install folder). `saveDirs(id)` returns those for link entries.
- **After an update:** names at the install folder's top that weren't the old release's own are yours (setup output, saves, configs): a release file with the same name goes beside as `<name>.cartridge-release` and is listed as the release's file. A done file there before and gone after = set up again (`setupDone` false, `setupAgain`).
- **GitHub Actions builds:** when no release has a usable build, `ciBuildOf` reads the public artifacts API (not expired, main/master first, Linux else Windows names). Downloads need a signed-in GitHub account, so `recomps:ciGet` opens the run page in a `persist:github` window and installs the downloaded zip through `install({ local })`.
- **RetroArch netplay:** started directly (not through Steam) with the game's own Steam command plus `--host` or `--connect <host> --port <n>` before `-L` (retroarch.c long options; port 55435 from config.def.h). Windows RetroArch refused.

- **Windows ports and Proton (0.9.86):** each Proton's `toolmanifest.vdf` names the Steam runtime it needs (`require_tool_appid`: 1628350 sniper for Proton 8 to 10, 4183110 SteamLinuxRuntime_4 for Proton 11, Experimental and Hotfix). `protonRunner.find` takes the best Proton whose runtime is installed (found by the library's `appmanifest_<id>.acf`) and starts it as Steam does: `<runtime>/_v2-entry-point --verb=... -- <proton> ...` (kind `runtime`; old records say `sniper`, still read). umu only when no runtime is installed, and only with a Proton whose runtime umu knows (read from umu's `__init__.py`); none known = umu's own Proton. Everything Cartridge starts loses Steam's launch variables (`childEnv.clean`), and Windows start scripts unset them too (`SHELL_UNSET`); SteamGameId stays so Proton tags the window for gamescope.
- **Save Sync and port saves (0.9.88):** a port's save folder is often its data folder; caches, textures, logs and dumps are left out of its unit and its backups (`saveSync.notSave`), and any unit over `SAVE_MAX` (512 MB, by stat) is refused before it is read. Never zip or hash something that size on the main thread.
- **Ports and Steam Input (0.9.88):** a controller Steam Input holds reaches only games Steam started, so a port in Steam starts through its own shortcut when Steam runs (`openVerified`); a direct start is the fallback.
- **Motion (0.9.88):** GSAP is the engine for everything script moves, on one ticker (`motion.js frame()` = GSAP's ticker); CSS springs stay for focus, presses and page arrivals (compositor).
- **Ambient motion (0.9.86):** slow decorative drifts (Home's header, Start's big-tile pans, the clock's clouds) are moved a few times a second by one timer (`src/ambient.js`), not as CSS loops: on a 4K TV at 120 Hz a CSS loop made Chromium compose every frame (measured: Home 55% to 11%, Start 91% to 25% of a core). Spinners turn in 33 steps a second (`--loop-spin`). New slow decorations should use `v-ambient`, not an infinite CSS animation.

### 6.8 Recomps and 6.9 Online Play
How they work, what was decided and what wasn't verified: Parts 11 (recomps), 12 (Online Play), 13 (the 0.9.66 follow-ups) and 14 (0.9.67) at the end of this file.

---

## Part 7. The agreed plans for recomps and Online Play (both shipped: 0.9.65 and 0.9.66; what is still missing is in Part 9)

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
- **Electron has no SHA3 (0.9.65):** RPCN's password needs PBKDF2 with SHA3-256, and Electron's BoringSSL has none (the XTS trap of 0.9.30 again). Written in pure JS (`electron/sha3.js`), checked against Node's own SHA3, and run in a worker because 200,000 rounds take about 5 s.
- **One-key writers must copy the file's own style (0.9.65):** the ini writer added `key=value` to an empty section in a file written `key = value`, and the XML writer lost the closing tag's indent. Both fixed and tested; a writer that changes one setting must leave the rest of the file looking as the emulator wrote it.
- **A failing test hung the whole run (0.9.66):** a test with a fake server stopped at its first failed assert and never closed the server, so `node --test` waited forever with no output. Close servers in `finally`. Run one test file with `timeout 60` when it goes quiet.
- **The fake RPCS3 damage didn't match the real one (0.9.66):** `Resolution Scale: = 100` on its own line is valid YAML; the real damage joins two lines (`Write Depth Buffer: falseResolution Scale: = 150`). Copy real damage from the owner's log into tests.
- **A null answer broke the game page in the audit (0.9.65):** `for (const o of ops)` with the stub's null (`f is not iterable`, minified). Guard every list from `call()` with `|| []`. The audit's "page errors" line is the place to look.
- **Matching keys must match the data (0.9.66):** the link guesser used `ngc` for GameCube while the catalogue's console key is `gamecube`; caught by trying it. Try new helpers on real values before writing tests.
- **The handover went stale (0.9.65, 0.9.66):** I added Parts 11 to 13 at the end but didn't update Parts 1 to 9; Part 9 still said recomps and Online Play were "not started". The owner had to ask. Update every Part each time (the header says which).
- **`pkill -f <pattern>` matched my own shell** and killed the command; kill by PID.
- **Free text in a data file used as a path (0.9.65, found 0.9.67):** the recomp catalogue's `saves` were research notes ("X in the working directory", "Documents/Y inside the Proton prefix"), and `expandPath` joined the whole sentence onto the recomp folder. Backups found nothing; Save Sync listed folders named like sentences. Found only by the third audit. When a data file holds text written by people (or research agents), parse it with a reader that rejects anything that isn't a path, and test the reader against every value in the file (test/recomps.test.js does now).
- **A button whose condition was the state it was meant to create (0.9.65, found 0.9.67):** "It's Set Up" showed only when the recomp was already set up. Check every button's `v-if` against the state it changes.
- **The same mistake twice (found in 0.9.68):** 0.9.67 fixed recomp save notes read as paths, but the same catalogue's `setup.place` notes were still joined onto the folder as a file name (Ship of Harkinian's copy was linked as "the ROM in the same folder as soh.appimage ..."). When one field of a data file turns out to be prose, check every other field of that file the same way (0.9.68 checked `place`, `done`, `arg`, `args`, `program`: two more bugs, a one-off setup command kept as launch arguments and the program's own name passed as its first argument).
- **Arguments: one source.** Open, the Steam shortcut and the update trial each built a recomp's command line differently (Open left the catalogue's own `args` out). Since 0.9.68 all three use `launchArgs(id)`.
- **"Done" checks need several independent passes:** after 0.9.65 my own check found six gaps, after 0.9.66 four; the 0.9.67 audit by two separate read-only agents (one sweeping every plan, handover and log, one trying to prove each item wrong) found about twenty more, including the two bugs above. Do the same before calling a stretch finished.

---

## Part 9. Open items, unverified work and what to ask the owner

**From the second PC session (0.9.88, Part 35):**
- Cartridge's own controller on the desktop with a Steam Controller: Steam made no virtual pad for it (started from Steam or not, Wayland or X11). Ask the owner whether a button press makes it appear; if not, Steam's per-game controller setting for Cartridge's shortcut is the next thing to look at.
- Buttons pressed in a port started through Steam (detected, not pressed), and Cartridge's pad after such a port, desktop and Game Mode.
- `checkFile` hashes big downloads on the main thread in 1 MB steps: hash in `dlWorker` while writing instead.
- Uncharted offers FSR 4.1.1 on GPUs that can't run it (the game falls back to FSR 3.1 by itself): a note per GPU would need the port's own capability check (`bb-gpu-capabilities.exe`).

**From the PC playtest (0.9.86, Part 33):**
- Chromium saw no gamepad at all in the owner's Desktop Mode session (a bare Electron window too, Steam's virtual pad included); in Game Mode, launched from Steam, pads work (the owner's logs). With Steam running, Steam Input also grabs any pad and turns it into keyboard and mouse in Desktop Mode. Controller behaviour was tested through a scripted pad inside the page; real Desktop Mode pad input is unverified. Ask the owner whether a pad works when Cartridge is started outside Steam on the desktop.
- inFAMOUS Second Son's port boots to black with the owner's EU dump (CUSA00004); its README asks for the US CUSA00223. Cartridge notes the other ID; consider a stronger warning per recipe (`ids` strict) if the owner agrees.
- ~~Two older link copies listed again as "(From a Link)"~~: the owner removed them (19 Oct); link copies now say "From a Link" on their cards (0.9.88).
- The inFAMOUS Second Son shortcut points at a game removed from RomM: Shortcut health offers removal; left to the owner.
- Ribbons (the owner's background) still costs about 30% of a core at 4K (30 fps on a half-size canvas, by design).


**Owner to test on a device (from 0.9.63 and 0.9.64):**
- Save Sync with no freezes (log lines `main thread` and `health`); the PSP save that failed with 413.
- Infamous's settings taking effect in RPCS3; Repair in Settings → Emulators → Issues.
- Eden 0.2.0's GPU Mode; Mario Tennis Ultra Smash's Game Settings and Add-ons tabs; the tab row on the TV; PCSX2 settings speed.
- P.T.'s file picker; Xenia patches on an Xbox 360 game.
- KytyPS5 install again (then send the log: the reason is now written there).
- Unit 13 in Vita3K with frame generation off (the freeze: picture and input stopped, audio continued, Steam button dead: gamescope/driver, likely lsfg-vk on a swapchain change when the game's settings opened). If confirmed, warn when turning frame generation on for Vita games.
- The GR2 fork under shadPS4's Forks, Link to Its Project, an update, switching versions back; Game Settings and patches for Gravity Rush 2 naming the fork.
- GitHub search, sending a link from the phone, Check It, a Windows-only project through Proton.

**Owner to test on a device (from 0.9.65 and 0.9.66):** the lists at the end of Parts 11, 12 and 13 (recomp installs of each kind, Set Up With Your Game, Add to Steam, an update with saves kept and its trial start, Roll Back, RPCN account and sign-in, ShadNet, PPSSPP ad hoc, Ryujinx LDN, Dolphin host code, PCSX2 DEV9, Online Play still on after an emulator update).

**Everything promised and not done yet (14 Oct 2026, checked three times: my pass through Part 7, a read-only agent sweeping every handover, plan, options file, CLAUDE.md and the session log, and a second agent trying to prove each item wrong; file:line evidence was in their reports).**

*Recomps (Part 7.1):* since 0.9.70 the catalogue is gone (recipes), so items 1 to 13 apply only to recomps added from a link.

0. **Fixed in 0.9.68 (Part 15):** Place setup, launch and setup arguments, Quest 64's done note. The picker items below still stand; picker recomps now set themselves up with no Set Up step (owner, 14 Oct), so item 3 (copy the path) only matters for recomps whose own picker Cartridge opens.
1. ~~**No off switch for the daily catalogue refresh (7.1 #5).**~~ Done in 0.9.69 (Check for New Recomps Every Day). The plan said it "runs on by default", which implies one. It's always scheduled (main.js `recomps-refresh`). Only a manual Check for New exists.
2. ~~**Automatic finds aren't checked enough (7.1 #6).**~~ Done in 0.9.69 (`vet`: not a fork, a usable build; "not a fork unless the original is gone" still isn't handled). `addFound` checks forks and stars only on the GitHub-search path, never that the project has a release with a Linux or Windows build. PCGamingWiki rows that already link a project are added with no checks at all. "Not a fork unless the original is gone" isn't handled.
3. **Picker path not copied (7.1 #8).** Mostly moot since 0.9.68: picker recomps set themselves up with no step from Cartridge. The path is shown in a confirm box "ready to paste", but it isn't put on the clipboard. `clip:write` exists; RecompSheet doesn't call it.
4. **The copy check comes after installing, and can't name missing files (7.1 #9).** Since 0.9.69 the library copy is checked before installing; naming missing files of several-file games is still not done. `checkGame` runs at Set Up, not before Install. `needs` is free text for games of several files (Unleashed: title update, DLC), so missing files can't be named.
5. ~~**Recomps from a link have no setup step (7.1 #11).**~~ Done in 0.9.69. `addLink` sets `needs: null`, so they count as ready at once, with no Set Up With Your Game and no Done before Add to Steam.
6. ~~**Recomps from a link or found automatically have no saves (7.1 #13, #14).**~~ Done in 0.9.80 (Save Sync takes the folders you tick: `saveChoices`/`setSyncSaves`, `rec.syncSaves`). Backups done in 0.9.69 (`guessSaves`); Save Sync deliberately not (guessed folders are never uploaded). They get `saves: []`, so updates back up nothing and Save Sync skips them. The plan said "its folder except program files plus data folders named after it".
7. ~~**Setup isn't redone after an update (7.1 #13).**~~ Done in 0.9.80 (the done file checked before and after; release files never over yours, `.cartridge-release`). Things survive implicitly (`rec.game`, args, a link inside the folder), but nothing checks whether the new release needs setting up again.
8. ~~**No "Updates on Their Own Site" for builds published only as CI artifacts (7.1 #13).**~~ Done in 0.9.80 (`ciBuildOf`: GitHub Actions artifacts; the run page opens in Cartridge's window, `recomps:ciGet`, `install({ local })`). Only `site` and `none` exist. openmbu, for one, has Linux builds only as artifacts and is filed as Windows.
9. ~~**No "Check It" preview for recomp links (7.1 #16).**~~ Done in 0.9.69. Typed links, GitHub search, the phone and the 0.9.66 guess exist. `recomps:addLink` checks only the link's shape, not that a release exists.
10. ~~**Start-once after an update:**~~ Done in 0.9.80 for Windows builds without a prefix (Cartridge makes its own with wineboot for the trial). Windows done in 0.9.71 for ports with their own prefix. Earlier note: covers Linux builds only (7.1 #13).** Flatpak added in 0.9.69 (reported, no roll back); Windows (Proton) still not: it only runs through Steam. Windows (Proton) and Flatpak updates aren't started before they're kept.
11. ~~**The setup watch starts only from Cartridge's Open (7.1 #10).**~~ Done in 0.9.80 (scheduler `recomp-setup-steam`, `pendingSetup`, `watchFromSteam`; entries without a done file still have no bar). A first start from Steam isn't watched. 33 entries with `needs` have no `done` file, so there's no watch and no bar for them. No entry has `doneSize`, so the bar shows MB written, not a percentage. Both need catalogue data, from real installs.
12. **Doubtful catalogue facts.** docs/recomps.md has **98** "Not certain" lines, not the 5 named before: asset names, program names, save folders, Linux locations "not confirmed". They need checking against real downloads. Save notes that name no real place (Kirby Wii's "Linux location not confirmed", Foxhollow's memory cards, Marble Blast's prefs.cs, the 9 Windows recomps whose saves sit in a Proton prefix until they're in Steam) give no paths since 0.9.67.

13. ~~**Recomp save backups can't be seen or restored from Cartridge (found while writing Part 14).**~~ Done in 0.9.69 (Save Backups). Backups are made before every update, Roll Back and removal (`recomp-backups/<id>/`, 10 kept), and `recomps:backups` lists them, but no screen calls it and there is no restore. A missing save is put back automatically only right after an update (`checkSaves`).

*Online Play (Part 7.2 and Part 12):*

14. ~~**Researched settings not offered**~~ Done: 0.9.71, and in 0.9.80 Cemu's Pretendo choice (CemuConfig.cpp's per-account SelectedService) and RetroArch hosting or joining from the game page (`raNetplay.js`). (listed in Part 12 "Found in research but not offered"): Eden's lobby server and token, network interface and per-game airplane mode; Azahar's room token; Ryujinx's relay, LAN interface and internet access; Dolphin's lobby listing; Cemu's choice of Pretendo; RetroArch hosting or joining from Cartridge. These were never agreed, only found.

*From older plans and handovers (all confirmed not done by both agents):*

15. ~~**Multi-drive leftovers~~ Done in 0.9.71 (Emulator Storage lists sizes and opens each emulator's Folders sheet; moving those folders stays there). (docs/plan-multidrive.md, built in 0.9.38 as `extraRoots`):**
    - a drive chosen per console;
    - moving a game between drives with its Steam shortcut following;
    - games on an unplugged drive shown as "not inserted" (they are just skipped);
    - emulator storage folders (RPCS3 `dev_hdd0` and others) as Storage entries with Move.
16. ~~**A Saves widget on Start**~~ Done in 0.9.71. (plan-0.9.29 §2.1: last synced, conflicts). Not in `TILES`.
17. ~~**More cheat sources**~~ Done in 0.9.71 (libretro database, switch-cheats-db). (plan-0.9.4 §2, plan-0.9.16 §1): the libretro cheat database and a Switch cheat source. `cheats.js` has Dolphin Gecko and PPSSPP CWCheat (plus Cemu's packs) only.
18. ~~**A forks list fetched from the repo**~~ Done in 0.9.71 (forks.json). (plan-0.9.md), like the recomp catalogue. Forks are fixed in `emulators.js` `FORKS`; adding by link is the escape hatch.
19. ~~**A row-by-row check of empty or unclear Settings rows**~~ Done in 0.9.71 (tools/ui-audit/rows.js). (0.9.3 G4, plan-0.9.19 §5): deferred, "not audited row by row".
20. ~~**RomM version check turning features off**~~ Done in 0.9.79 (owner: yes). Features are judged from RomM's /openapi.json, not its version (Part 26).
21. ~~**A frame generation warning for Vita games**~~ Done in 0.9.80 (owner: build it; `vitaFgOk` in steam.js, said before it's turned on, never refused).
22. **Housekeeping:** the remote branches `claude/relaxed-fermat-30pigp-release-g` and `-release-i` still exist. The owner said to clean up (16 Oct); both are fully merged, but a session can't delete them (the proxy allows only the session branch, the API refuses writes). The owner deletes them on GitHub (Branches).
23. ~~**Tested versions in recipes**~~ Done in 0.9.79 (owner: yes; `game.tested`, God of War III 01.00 and 01.02). (0.9.72 playtest): God of War III's recipe says "tested with 01.00 and 01.02" only in prose; a field for tested versions would let the sheet note a copy outside them (the test copy was 01.03). Not invented: needs the owner's word on what is tested.
24. ~~**P.T.'s files to check**~~ Done in 0.9.79 (owner: beside eboot.bin; `game.find` searches as the port's first_run.cpp does). (0.9.72 playtest): its recipe checks nothing in the copy (its installer does). Where chunk1.psarc and texture.qar sit in a dump is needed before `has` can list them; ask the owner or read the port's installer source.
25. ~~**PC ports in Settings → Steam**~~ Done in 0.9.79 (owner: yes; Settings → Steam → PC Ports). (0.9.72 playtest): ports are managed from their sheets only; ask whether the owner wants them on the Steam page too.

*Not to re-add (settled):* Redream, Mednafen and torzu (owner, 1 Oct: "not needed"; the old session-log list is stale); E2's "C's game page later" (the owner picked A only); console-scene backgrounds; multi-language; PS3 mods; PSN sign-in; pausing Syncthing; Ryujinx saves in Save Sync; PS4 .pkg; BigPEmu; Citron offered by default; the plugins the owner said they don't want (ponytail, graphify, rtk).

*Settled (18 Oct, owner):* the shadPS4 "only starts after opening shadPS4 once" note is no longer true; it is closed. PS4 update folders are named `<game>-UPDATE` (built in 0.9.79). *Ask the owner:* impeccable was added as a skill in 0.9.47 and awesome-design-md was judged a collection, not a skill (CLAUDE.md 0.9.47), so the older handovers' question about them is settled, and what to do with plan-0.9.39 §4 ("two Cartridge devices", never decided).

**Sweep loop (owner, 17 Oct):** rounds 1 to 9 done (Parts 23 to 25, 31): setups, crawl, Steam, Online Play, saves on two devices, game settings, add-ons, Linked Folders with forks. Nothing left on the list; the scheduled resume stops once a round comes back clean with nothing new to cover.

**Known gaps:** GitHub's search page fallback untested (no access from the container); Romhacking.net untested (Cloudflare); KytyPS5's failure reason unknown until the next log; RPCN and ShadNet servers, PCGamingWiki and real recomp trial starts couldn't be reached or run from the container.

**Earlier stretches' open items** (still open): see Part 9 of HANDOVER-0.9.38-to-0.9.54.md.

---

## Part 10. How I'd work in your place

Read the newest SESSION-LOG entry, CLAUDE.md and this file first. When the owner sends photos or a log with "don't build yet", investigate read-only and reply per item with cause, fix and options, then one numbered list of questions with your recommendation for each. When they say Start, make a task list, build in commits you push as you go (the test build runs on every push), check everything (tests, build, launch check, audit, screenshots in Plain and Glass), write the SESSION-LOG entry, the CLAUDE.md section and **this handover**, then open and merge the PR. Read every emulator's own source before writing to its files, and every external project's real release layout before installing from it. Before saying an update is finished, check it item by item against its plan (Part 7 for recomps and Online Play) and against everything promised in chat, and list what's missing plainly; the owner will ask.


---

## Part 11. 0.9.65 · Recomps (10 to 13 Oct 2026)

**What shipped** (code map in CLAUDE.md's 0.9.65 section; catalogue record in docs/recomps.md):
- Engine `electron/recomps.js`, catalogue `electron/recomps.json` built by `tools/recomps/build.js` from researched entries (repo, builds, asset patterns, game needed, setup kind, done file, saves, achievements). Entries with no project or site are left out and listed in docs/recomps.md.
- Install to `<Emulation>/recomp/<console>/<name>`, Linux first, Windows through Proton only without Linux. Download kind read from bytes (GitLab links have no ending); archives inside archives unpacked. Verified with real Star Fox 64 Recompiled and Zelda 64: Recompiled installs.
- Updates never automatic; saves backed up first (`recomp-backups/`, 10 kept) and checked after; replaced release kept (last two) for Roll Back; stable or pre-release per recomp.
- Setup: library copy or picked file, checked (extension, project-listed hashes, N64 byte orders); place = symlink, path = launch argument, picker = its own window with the path shown. Windows setup opens through Steam so Proton uses the play prefix.
- Steam: own shortcut per recomp (never replaces the emulated game's), collection "Recomps", art by the game's name. Save Sync slot `cartridge:recomp:<kind>:<id>`. Achievements: hedge format (Unleashed, Marathon) and ReXGlue (`[unlocked.<id>]` + shipped achievements.toml), read only.
- Steam card in Consoles (SteamTile.vue), Recomps page, Settings → Emulators → Recomps (out of Update All), game More → "Recomp: <name>". Also KytyPS5 only offered while its newest release has a Linux build; Download More Files.

**Owner's decisions in this stretch:** catalogue from PCGamingWiki console sections only (the owner sent the saved page as a zip; its links were read from the HTML); search GitHub for entries without links (most-starred); KytyPS5 hidden, not deleted, until a Linux build returns; Download More Files under Game More → Options with present files ticked and greyed.

**Finished later (13 Oct 2026, same release):** the remaining rows were researched in smaller batches (the agents had hit usage limits), including the Xbox 360 set (batch 5). The catalogue is 96 entries (51 Linux builds, 12 Windows only, 9 on their own site, 24 build it yourself); rows with no project or site are under "Left out" in docs/recomps.md. Two duplicate ids (pokeplatinum-pc, ac6recomp) appear in two batch files; the builder keeps the first and says so. Unleashed Recompiled's Linux build is a Flatpak bundle, so `.flatpak` downloads now install with `flatpak install --user --bundle` (record `kind: 'flatpak'`, launched `flatpak run <id>`, Remove uninstalls it, Roll Back refused). Achievement readers also look in Flatpak sandbox folders (`~/.var/app/<id>/config/<user>/save/`) and ReXGlue's per-profile `profiles/*/achievements/*.toml` (re:Blue).

**Files Cartridge keeps for recomps (user data folder):** `recomp-installs.json` (what's installed, where, which release, the game set up), `recomp-latest.json` (newest release seen per recomp), `recomp-details.json` (0.9.66 project details, daily), `recomps.json` (the catalogue fetched from `main`), `recomps-found.json` (rows PCGamingWiki added since), `recomps-mine.json` (added from a link), `recomp-backups/<id>/` (save backups, 10 kept). Kept releases sit beside the install in `.cartridge-versions/` (forkVersions.js).

**Still open:**
1. Doubtful entries: 98 "Not certain" lines in docs/recomps.md (Part 9 item 12; the five named here first were only examples).
2. Owner device tests: install a Linux recomp, a Windows-only one (Proton) and Unleashed (Flatpak bundle), Set Up With Your Game (place, path, picker), Add to Steam (live and with Steam closed), an update with saves kept, Roll Back, Save Sync of a recomp save, Unleashed achievements, the Steam card at 1280x800 and on the TV, Download More Files, KytyPS5 hidden.

## Part 12. Online Play (built into 0.9.65, 13 Oct 2026)

The owner said: "No need to build in batches. Just build the rest of this update and the next one all in one go." So the planned 0.9.66 shipped inside 0.9.65 ("Recomps and Online Play"). The next update number is free for whatever the owner picks next.

**How it works:**
- `electron/onlinePlay.js` is the engine, and `electron/onlineAdapters.js` is plain data, one adapter per emulator, citing the source commit and file:line.
- An adapter names its settings `files` (`{ key: [path in the settings folder, format, text for a new file] }`), the `dirs` to look in (portable first through `ctx.portable`, then XDG and Flatpak), and `kinds` (one online feature each).
- A kind has `on`/`off` pairs, which may be a function of the getter for shadPS4's per-user list. It can also have `isOn`, `fields` (`at`, or `read`/`write` hooks; `check`; `required`; `secret`; `choices`/`free`), `actions` (a url, or `asks` + `run` since 0.9.66), `info` (no switch) and `status` (a report like `{ ready, note }`).
- `electron/onlineFormats.js` changes one key and keeps every other line: ini; Qt (writes `key\default=false` beside each value, which Eden needs); RetroArch cfg; JSON (the same indent, and refuses damaged files); RPCS3's two-level YAML; XML text.
- Rules:
  - Never write while the emulator runs (`raLogin.running`).
  - Back up the file once a day per file into `online-backups/<emu>/`, then write atomically.
  - Record in `online-play.json` what was turned on and the non-secret fields. Never store passwords.
  - `recheck(emu)` runs 1.5 s after `emuup:run`, `emuget:install` and `shadv:install`. It puts back what an update reset, and it reports, rather than guessing, when the file is gone.
- RPCN's password is stored the way RPCS3 stores it: PBKDF2 with SHA3-256 of what was typed, using RPCS3's salt, 200,000 rounds, as upper-case hex.
  - Electron's BoringSSL has no SHA3, so `electron/sha3.js` is pure JS, checked against Node's own (the test vector "test" gives 3FDD0D3D...).
  - It takes about 5 s, so main runs it in a worker thread.
- UI:
  - `OnlinePlay.vue` is the Settings section `online`, after Saves and Sync, and it is in Find a Setting.
  - Turning a feature on asks first for its required fields.
  - The game page (More → Emulator) shows "Online Play: <emulator>" rows from `online:forConsole` and opens the section.

**Per emulator (research by subagents reading each emulator's source; full notes were in the session scratchpad):**

| Emulator | What it does |
| --- | --- |
| PPSSPP | `PSP/SYSTEM/ppsspp.ini` `[Network] EnableWlan`, NickName (not "PPSSPP"), proAdhocServer (the list from PPSSPP's adhoc-servers.json), InfrastructureUsername. |
| PCSX2 | `inis/PCSX2.ini` `[DEV9/Eth]` EthEnable/EthApi=Sockets/EthDevice=Auto. DNS1 with ModeDNS1 Manual (PCSX2 reads DNS1 only). |
| RetroArch | `netplay_use_mitm_server`, `netplay_nickname`, `netplay_mitm_server` (nyc, madrid, saopaulo, singapore). Hosting and joining happen in RetroArch. |
| RPCS3 | `config.yml` Net `Internet enabled: Connected`, `PSN status: RPCN`; `rpcn.yml` NPID, Password (hashed), Token, Version 2, Host np.rpcs3.net. Accounts are made in Cartridge since 0.9.66 (Part 13); before that, in RPCS3. |
| shadPS4 | `config.json` Network (moved from General in shadPS4's MigrateNetworkKeys, so Part 7.2's General keys are old) `connected_to_network`, `shad_net_enabled`. `users.json` `Users.user[]` (id 1000, else the first) `shadnet_enabled`, `shadnet_npid`, `shadnet_password` (plain, as shadPS4 sends it). Register at shadps4.net. |
| Ryujinx | `Config.json` `multiplayer_mode` 1 (a number), `ldn_server` (empty = ldn.ryujinx.app:30456), `multiplayer_ldn_passphrase` (`Ryujinx-` + 8 hex). No account. |
| Eden | `qt-config.ini` `[Services] airplane_mode=false`, `[UI] Multiplayer\nickname`, `[WebService] eden_username`, each with `\default=false`. Rooms are joined in Eden only (no command line for it). |
| Dolphin | `Dolphin.ini` `[NetPlay] TraversalChoice` traversal/direct, Nickname; `[Core] EnableWiiLink`; `[Core] SerialPort1 = 12` (built-in BBA) plus `BBA_BUILTIN_DNS`. |
| Azahar | Lobby server `[WebService] web_api_url` (the source ships none). The nickname is the emulated 3DS username in NAND (not written). Pretendo: reports otp.bin, SecureInfo_A, LocalFriendCodeSeed_B, movable.sed in its data folder. |
| Cemu | Pretendo report only: otp.bin (1024 B) and seeprom.bin (512 B) in its data folder. Cemu greys out the service choice until the files are valid and keeps it per account itself. |

Wiimmfi has no setting in current Dolphin: games must be patched first, and Cartridge says so and links the patcher.

**Found in research but not offered (each a possible next step, with what's known):**
- Eden: `[WebService] web_api_url` (default `api.ynet-fun.xyz`) and `eden_token` (48 letters Eden makes itself, plain text); `[Services] network_interface`; per-game `custom/<TID>.ini` can override airplane_mode.
- Azahar: `[WebService] network_token` (for verified rooms); the room nickname is the emulated 3DS's username, kept in the NAND config save (binary), so not written.
- Ryujinx: `multiplayer_disable_p2p` (relay instead of UPnP), `multiplayer_lan_interface_id`, `enable_internet_access` (some games and homebrew). A per-game `games/<TID>/Config.json` is a whole config and can leave multiplayer off for that game.
- Dolphin: `[NetPlay] IndexServer` (lobby.dolphin-emu.org) / `UseIndex` (list a hosted session), traversal server and ports.
- Cemu: choosing Pretendo is `<AccountService><SelectedService PersistentId=".." Service="2"/>` per account in settings.xml; not written because the attribute format wasn't confirmed and Cemu rewrites it itself once the online files are valid.
- RetroArch: hosting or joining from Cartridge (RetroArch's own `--host`/`--connect` command-line options were not looked at).

**Files Cartridge keeps for Online Play (user data folder):** `online-play.json` (features turned on and non-secret fields per emulator, issues found after updates), `online-backups/<emu>/<date>-<file>` (the emulator's file before Cartridge's first change that day).

**Unverified (ask the owner or check on a device):**
1. Ryujinx was read from an archive mirror (git.ryujinx.app was unreachable). It is the Ryubing line; the Flatpak folders used (io.github.ryubing.Ryujinx, org.ryujinx.Ryujinx) are the ids emulators.js already knows, not checked on Flathub.
2. Eden's and Azahar's Flatpak ids come from their desktop files.
3. Whether every Switch game needs airplane_mode off for local wireless.
4. Cemu's per-account `SelectedService` attribute format wasn't confirmed, which is why Cartridge doesn't write it.
5. RPCN sign-in with a real account; ShadNet with a real account (early testing upstream).
6. That a real emulator update which resets a setting gets it back.

**Owner device tests:**
1. RPCN sign in, then a game's online menu.
2. PPSSPP ad hoc between two devices.
3. Ryujinx LDN.
4. Dolphin host code.
5. PCSX2 DEV9 with a revival DNS.
6. The section at 1280x800 and on the TV, in Plain and Glass.
7. An emulator update, then Online Play still on.



## Part 13. 0.9.66 · Loose Ends (13 Oct 2026)

After 0.9.65 the owner asked whether anything agreed had not been done. Six things were found by checking the code against Part 7, and the owner said to build them as the next update: "Okay do the 6 and push it as a next update, update handover". The owner also asked for a check-in 5 hours after any stop (they were asleep), which was set with `send_later` and cancelled once the release merged.

**What was done:**
1. **Recomp project details (7.1 #12).**
   - `recomps.details(id)` reads the project's API: stars and description.
   - It also reads the newest release: tag, date, and notes made plain by `plainNotes`.
   - It takes the README's first picture (`readmePicture`): relative paths are resolved, GitHub `blob` links become raw links, and badges are skipped.
   - Results are cached for a day in `recomp-details.json`. When nothing answers, the old details stay.
   - Shown on RecompSheet. Release notes are in a `<details>` that opens with A.
2. **From a Link guesses (7.1 #16).**
   - `guessFromText` looks for console words in the project's name, description and topics (`CON_WORDS`), limited to the catalogue's consoles.
   - It then picks the longest library title, or the part after its colon, whose words all appear there.
   - Recomps.vue asks `recomps:guess` 700 ms after a link is pasted. It fills only empty choices and says they were guessed.
3. **Start once after an update (7.1 #13).**
   - `install` calls `ctx.trialRun` for Linux updates; first installs and Flatpak/Windows builds are not tried.
   - main spawns the program detached for 6 s, then kills its process group, with Game Mode's background/refocus around it.
   - It fails only on these signs: `error while loading shared libraries`, exit 126/127, SIGSEGV/ABRT/ILL/BUS/FPE, or a non-zero exit when the recomp is already set up.
   - A failure runs `useVersion(prev.tag)` and returns `rolledBack`. The Steam repoint only happens on `programMoved`, which a rolled-back result doesn't carry.
   - It is skipped while a game runs.
4. **Accounts in Cartridge (7.2).**
   - **RPCN:** `electron/rpcnClient.js` speaks RPCN's own protocol, read from RPCS3's source (details in CLAUDE.md 0.9.66). The account is made, then saved to rpcn.yml (NPID, the derived Password hash, Version 2, Host), then the token is asked for.
   - **ShadNet:** its client (shadPS4 src/shadnet) never creates accounts, so its sign-up page opens in Cartridge's own window (`online:browse`).
5. **Online status on emulator pages (7.2).** The EmuGet manage sheet has an Online Play row with each feature's state, and opens the section.
6. **RPCS3 Repair first (7.2).**
   - The adapter's `precheck`/`repair` use the 0.9.63 `rpcs3ConfigCheck`/`rpcs3ConfigRepair`.
   - A damaged file locks RPCN, shows Repair, makes `prep` refuse every write, and makes `recheck` report instead of writing.

**Checked:**
- `npm test`: 343 pass. This includes a fake RPCN server that checks the packet sizes and fields, that the hash (not the password) is sent and saved, and Repair before writes. It also covers start-once with a broken update rolled back, and the README picture, notes and link guess.
- `npx vite build`, the launch check and `npm run audit:ui`.
- Screenshots of Online Play (a damaged RPCS3) and a recomp page with details, in Plain and Glass.

**Not verified (ask the owner):**
- A real RPCN account creation against np.rpcs3.net (no network to it here). If RPCN's protocol version moves past 32, Cartridge says so and points to RPCS3.
- shadps4.net's sign-up page in the window.
- A real recomp update's trial start in Game Mode: a window appears for a few seconds.
- GitHub's API rate limit (60 an hour without an account) can leave details empty for a while; they fill in on a later open.

**Owner device tests:**
1. Make an RPCN account in Cartridge, type the emailed token, turn RPCN on, play a PS3 game online.
2. Make a ShadNet account from Cartridge.
3. Open an emulator's sheet and check its Online Play row.
4. Paste a recomp link (for example Zelda64Recomp) and check the guess.
5. Open a recomp page and check the stars, picture and release notes.
6. Update a recomp and watch it start once.
7. If you have an EmuDeck RPCS3 with the old leftover text, Repair from Online Play.

## Part 14. 0.9.67 · Follow Through (14 Oct 2026)

The owner: "Okay do updates 1-3 but please make sure to triple Check everything we didn't do yet and reflect it in the handover". Items 1 to 3 were the old Part 9 list (recomp setup progress, renamed settings after updates, parse before and after). The triple check produced the full list now in Part 9 and found two bugs in 0.9.65, fixed here.

**What was done:**
1. **Recomp setup progress (7.1 #10).**
   - `recomps.watchSetup` adds up the bytes in the recomp's folder and in its done file's folder (async, budgeted, skipping `.cartridge-versions`), against `doneSize` when the catalogue has it (no entry does yet).
   - It marks the recomp set up when the done file appears. It ends after three looks with the program closed, or after 45 minutes.
   - main `recompSetupWatch` starts it 4 s after Cartridge's Open when the recomp isn't ready. It runs as bg job `recompsetup:<id>`, with "N MB written" under Downloads and on the recomp's page.
   - Only entries with a done file are watched; the other 33 keep the Done button.
   - Checking your copy (`recomps:setGame`) is a background job too (`recompset:<id>`).
2. **Renamed settings after an update (7.2).** Adapters marked `full: true` are PPSSPP, PCSX2, RetroArch, RPCS3, shadPS4, Ryujinx and Eden: each rewrites its whole settings file.
   - Applies when the emulator has rewritten its file since Cartridge's last write (`wroteAt`), and a key Cartridge turned on, or a field it set, is gone.
   - Then `recheck` reports it ("the update renamed or moved it") and doesn't write the old name back.
   - Dolphin isn't `full`: it writes only changed values, so a missing key there means "default".
3. **Parse before and after (7.2).**
   - JSON and YAML files must still parse after the change before anything is written.
   - After writing, every file is read back and the adapter's `precheck` runs again (RPCS3 must still load config.yml).
   - Any failure puts every file back as it was and says why. `recheck` reports a failed write instead of throwing.
4. **Fixed, recomp save notes (found by the third check).**
   - `savePaths` reads real paths out of the catalogue's save notes:
     - `~/` and `$XDG_` paths anywhere in the note;
     - a leading file or folder name relative to the recomp folder, and a second one after "and";
     - `<install folder>` as the recomp folder.
   - Windows notes (Documents/, %APPDATA%, %LOCALAPPDATA%, "inside the Proton prefix") resolve into the Steam shortcut's own prefix: `compatdata/<appid>/pfx/drive_c/users/steamuser`, under any of three Steam roots. They resolve only for Windows builds already in Steam.
   - Placeholders (`<n>`, `<game>`, `*`) give their folder for relative names, and nothing for home paths: OpenGOAL's `<game>` would have taken every game's folder.
   - Flatpak recomps' `~/.config` and `~/.local/share` map to their sandbox.
   - Before, the whole sentence was joined onto the recomp folder.
   - Slot keys for recomp saves are still `<id>` and `<id>-<n>` in the order of the paths found, so an entry whose paths changed gets new keys. Nothing had been uploaded from the old paths, because they never existed.
5. **Fixed: It's Set Up.** It shows when a picker recomp without a done file has been given its game and isn't marked set up. Before, it showed only once already set up.

**Checked:**
- `npm test`: 347 pass. New tests cover the setup watch, no watch without a done file, renamed settings, files put back on a failed read-back, the YAML/JSON checks, and the save-note reader against every note in the catalogue.
- Build, launch check, `npm run audit:ui`.

**Not verified:**
- A real recomp building its files (Ship of Harkinian making `mm.o2r`) with the bar running.
- A real emulator update that renames a setting.
- Proton-prefix saves of a real Windows recomp in Steam.
- Unleashed's saves in its Flatpak sandbox.

**Owner device tests:**
1. Open a recomp that isn't set up from Cartridge and watch Setting itself up.
2. A picker recomp: set it up, then press It's Set Up.
3. Update a recomp with saves; afterwards the save is still there (backups go to Cartridge's `recomp-backups/<id>/`, which no screen shows yet: Part 9 item 13).
4. Save Sync with a recomp save.
5. Online Play after an emulator update.

## Part 15. 0.9.68 · Set Up Right (16 Oct 2026)

Made on another account. The owner had worked on 0.9.38 to 0.9.67 elsewhere, asked for a full catch-up, then: "Can you do full debugging of what we have so far and patch it in an update". It ships the three commits of 14 Oct that were never released (the freeze fix, the Steam card, picker recomps setting themselves up; SESSION-LOG 14 Oct) with what the debugging found.

**Found and fixed:**
1. **Recomp Place setup linked your copy under a sentence.** 21 of the 27 Place entries had research notes in `setup.place`; `setGame` joined the whole note onto the recomp folder. Reproduced: Ship of Harkinian's copy became a link named "the ROM in the same folder as soh.appimage (9.2.3); newer builds ask with a file picker". Fix:
   - `setup.to` written as paths for 24 entries (`file`: exact name or `x/` folder keeping the name; `dir`: the folder a picked folder's contents go into; `names`: disc files in order). Paths are relative to the program's folder (its working directory), `~/` in home.
   - `placePlan`/`linkCopy`/`unlinkCopy`: never over a file, a .cue or .m3u brings the files it names, the previous copy's links go first and come back if the new copy can't be placed.
   - The three with no rule (LADX HD's patcher, Half-Life: Decay, reLCS) are `how: 'manual'`: the page says what to do; It's Set Up where there's no done file.
   - `repairOld()`: links made by 0.9.65 to 0.9.67 are removed (only links to your copy) and your copy placed by the rule, once per install.
   - `checkGame` takes a file or a folder as the rule says; RecompSheet offers Pick a File and/or Pick a Folder.
   - `tools/recomps/build.js` refuses `to` and `done` values that aren't paths; `test/recomps.test.js` plans every Place entry in the catalogue.
2. **Open left out the catalogue's own arguments** (PGR4's GPU options, WiiCompiled's `launch-base`), and a list of arguments became "-game,decay" in the Steam shortcut. Fix: `argString`, `launchArgs(id)` used by Open (`startRecomp` in main.js), the Steam shortcut spec and the update trial.
3. **One-off setup commands were kept as launch arguments** (WiiCompiled ran its installer on every start) and passed the program's own name as their first argument (Doom64EX, WiiCompiled). Fix: `setupTpl` drops the name; a path setup with a `done` file is a run started once (`run`, main starts it and the setup watch), never stored.
4. **Done files:** relative ones are looked for beside the program too (`doneAt`); Quest 64's done note (a sentence) removed, so it uses It's Set Up.
5. **Stalls:** `candidates()` 4 s memo (key: the scan's time and the Steam settings), `findBin` and `emulationRoots` 10 s (Part 6.1).
6. **Recomp page:** a failed release check no longer says "Checking its newest release" for good; a manual recomp with a done file doesn't ask for It's Set Up.

**Checked and found fine:** Zelda 64's done file (v1.2.2 ships no portable.txt; config.cpp uses ~/.config/Zelda64Recompiled); every `call()` channel, pop-up type and page exists; ESLint `no-undef` over electron/ and src/ finds nothing (one harmless prop and ref both named `tab` in GameAddons.vue; 41 unused names, dead code); nothing blocking left in code that runs on its own (the remaining execFileSync calls are `command -v` checks or fallbacks); 36 handlers called in the real app on a fake home all answer; the worker's modules don't need Electron.

**How it was tested in the container** (scripts in the session scratchpad, not in the repo):
- The real app through Playwright `_electron` in a fake Deck home: EmuDeck layout, a Steam account, `XDG_CURRENT_DESKTOP=gamescope` and `SteamGameId` with a fake `xprop`, against a fake RomM (earlier sessions' mock with N64 games added so recomps match). Crawl of every tab and Settings section, recomp pages opened, handlers called.
- A main-process hook passed with `electron -r hook.js .` (NODE_OPTIONS `--require` doesn't load): CPU profile for 60 s and, for each event-loop stall over 200 ms, the functions holding it.
- Real recomp installs (Ship of Harkinian 9.2.3, Zelda 64: Recompiled v1.2.2) through the engine in Node: the container's proxy blocks GitHub's API and release pages for other repositories (403/404), but `releases/download/` files and `git clone`/`ls-remote` work, so the release answer was stubbed with the real file names.
- `npm test` (354), `npx vite build`, `npm run audit:ui` (all zero), launch check.

**Not verified:** a recomp really finding its placed copy (needs a real ROM and a GPU); Doom64EX's and WiiCompiled's one-off runs (Doom64EX has no builds); the stall fix on a Deck.

**Owner device tests:**
1. Ship of Harkinian: Set Up With Your Game, then Open; it should make oot.o2r and show as set up.
2. Perfect Dark or Sonic 3 A.I.R.: the same.
3. Zelda 64: Recompiled: Open, follow its own wizard; it should show as set up once it has your ROM.
4. Start in Game Mode and wait a minute: no dimming. If it dims, send the log (`main thread stalled`, `main thread: longest stall`).
5. The Steam card in Consoles at 1280x800 and on the TV.

## Part 16. 0.9.69 · Recomps, Finished (16 Oct 2026)

The owner, after I offered the Part 9 recomp items as one update: "Okay go clean up and be iterative to make sure everything works and nothing is broken or breaks". Built in five commits; each one was tested, built and tried in the real app before the next (scratchpad `check.sh` runs `npm test` and the build and stops on any failure).

**What was done:**
1. **Clean-up.** Unused imports and helpers removed (ESLint no-unused-vars over electron/ and src/, every name grepped for other uses first: nine files' imports, `srmFor`, `findTemplate`, `safeLs`, `notesFor`, `rrect`, `rootLabel`, `xroots`, `stepGaCon`, `coversFor`, `t0`). GameAddons' shown tab renamed `curTab` (it shared a name with the `tab` prop). The two old release branches can't be deleted from a session (Part 9 item 22).
2. **Save Backups (Part 9 item 13).** `restoreBackup(id, stamp)`: never while the recomp runs; the saves there now are backed up first (`'before restore'`), with the chosen backup protected from the ten-backup trim (`keep`); backup files copied over, newer files kept. RecompSheet lists them with why and when.
3. **Link and found recomps (items 5, 6, 9).** `from` link/found entries get a default `needs` and `setup.how: 'picker'`, so It's Set Up shows. `guessSaves` for backups: top-level items in the recomp folder that aren't the release's own files (`rec.files`), and ~/.config and ~/.local/share folders named after the program, project or name, nothing over 256 MB. Save Sync doesn't use them. Check It: `recomps:preview` (project info, newest release, `pickBuild`, fork, already listed), shown under the link field.
4. **Before install (item 4).** `recomps:checkCopies` checks the library's copies with `checkGame` when the catalogue lists types or hashes; RecompSheet asks "Your Copy May Not Work" before a first install.
5. **Automatic finds (items 1, 2).** `vet(repo)` in `addFound`: GitHub project info says not a fork, and the newest release has a Linux or Windows build; six vetted per refresh, the rest wait. `config.recomps.daily` (Toggle on the Recomps page) turns the daily refresh off.
6. **Flatpak update start (item 10).** `ctx.trialRun` with `flatpak run <id>` after a Flatpak recomp's update; a failure is returned as `started: false` with the reason (Flatpak keeps no earlier version).

**Checked:** 356 tests; build; the real app in simulated Game Mode (crawl of every tab and Settings section, four pop-ups, 36 handlers: only `update:releases` fails, for GitHub's certificate in the container); main-process profile: one stall over 200 ms in the first minute, its samples idle; `npm run audit:ui`; launch check; each feature driven in the real app (restore, Check It, the copy warning, the switch).

**One slip, caught:** a test-file edit put the fake release's data file write inside a comment, two tests failed, and the commit went in because the command piped the test output through grep. Fixed in the next commit, and every commit after went through the check script.

**Not verified:** a real link recomp install (GitHub releases aren't reachable from the container); a Flatpak recomp update's start (Unleashed on a device).

**Owner device tests:**
1. A recomp that has updated: Save Backups, put one back, play.
2. Paste a recomp link: Check It, Add, Install, open it, It's Set Up.
3. Install a recomp whose listed version your copy doesn't match: the warning before the download.
4. Turn Check for New Recomps Every Day off and back on.


## Part 17. 0.9.70 · Cartridge Verified (17 Oct 2026)

**Asked:** "do all of these as one update": recomps rebuilt as a curated, per-game "Cartridge Verified" list starting with five links (pt-pc, uncharted_pc, gow3_pc, bloodborne_pc, iss_pc), install from a GitHub link kept; my skills recommendations; a controller playtest "like a real professional" after the update.

**What was done:**
1. **Recipes.** Each port's launcher source was read for its settings file, game folder rules, saves and start arguments, and turned into `electron/recipes/<id>.json`. Cartridge renders the launcher's settings, writes a start script per start, and runs Windows builds through umu-run or Steam's Proton in the sniper runtime with its own prefix. inFAMOUS needs 1.07: a symlink view lays the update over the base game. P.T. runs its own headless installer. How to add one: docs/recipes.md.
2. **Recomps UI.** Verified first, one state and one main button (VerifiedSheet), port settings through Game Settings, From a GitHub Link below (Unverified). The catalogue, PCGamingWiki finds and vetting were removed; old installs stay as Unverified.
3. **Watchdog.** Nightly `recipes-check.yml` opens an issue when a port's newest release lacks a file.
4. **Skills work.** Worst-case library audit (plural bugs, card clipping fixed), accessibility audit (names and alt text), the token table for Plain and Glass (computed values compared identical in six looks, with and without light effects), GSAP behind a test switch (bench: equal at normal speed, CAE better at 4x slowdown, so off by default), and an option board for shader backgrounds and Settings layouts (nothing built).
5. **Playtest.** `tools/ui-audit/playtest.js` as five players, about 900 presses: no lost focus, dead ends or B traps. Fixes from its screenshots; wishes left for the owner in docs/playtest-0.9.70.md.

**What broke and how it was caught:** moving the Glass tokens after styles.css would have let the base values beat the reduced-transparency and high-contrast overrides (same specificity, now later); caught by grepping every setter, the overrides became looks in the table. The playtest first reported every tab unreachable because `window.__cartStore` had no route (the worst-case audit's game pages had silently not opened for the same reason); both fixed.

**Not verified:** any port actually playing (no GPU or games in the container), Proton runs, GSAP on a Deck.

**Owner device tests:**
1. Install each port you own; for Uncharted, all three Play buttons and the three Steam shortcuts.
2. Change a port setting in Cartridge and see it in the game.
3. inFAMOUS with update 1.07 on the device.
4. GSAP Motion (Test) on and off with the Performance Overlay; say which feels better.
5. Pick from the option board.

---

## Part 18. 0.9.71 · Every Promise Kept (17 Oct 2026)

**Asked:** "Do all of these and allow users to switch beta channels and nightly versions via the update menu", with my recommendations first: everything still promised (this Part 9) plus my eight recommendations (beta channel, one Play button, recovery, end-to-end tests with budgets, big-library check, nightly recipe install test, splitting main.js, 4K checks). Option-board picks were unanswered, so my recommendations were taken: shader backgrounds A and D, Settings layout B, GSAP stays off.

**What was done:**
1. **Update channels** (`electron/updateChannels.js`, Settings → Downloads and Updates): Stable, Beta, Nightly with electron-updater channels; Choose a Version per channel. `.github/workflows/prerelease.yml` builds a nightly at 02:23 UTC from the newest of main and claude/* (skipped when nothing changed, 7 kept) and a beta on Run workflow with input `beta`; `tools/release/prerelease.js` stamps the version (`0.9.72-beta.N`, `0.9.72-nightly.YYYYMMDD.N`). **To publish a beta:** GitHub → Actions → Beta and nightly → Run workflow → channel beta.
2. **Recovery** (`electron/recovery.js`): start marker, safe start after two unclean starts (shown config only, never saved), settings backups (10), export/import without secrets, unexpected closes in Report a Problem.
3. **End to end in CI** (`test/e2e/`, `.github/workflows/e2e.yml`): the real app against a fake RomM in a fake home, normal and 20,000 games, budgets in budgets.json; UI audits, rows check and playtest on pull requests; a 4K clipping pass. Big libraries needed no change (only visible cards are drawn).
4. **Recipes:** nightly install test with the real releases (`tools/recipes/install-test.js`), draft tool (`tools/recipes/draft.js`, drafts are refused until filled in), trophies from ports, SHA-256 check of every download. No project publishes dump hashes, so none were added.
5. **main.js split** started: recomps handlers in `electron/recompsIpc.js` (pattern in docs/architecture.md).
6. **Look:** Aurora Veil and Horizon Grid (WebGL, 2D fallback, contexts released), Settings hub of cards (`hub`, `statusOf`, `store.settingsDirect` for screens that open a section).
7. **Playtest wishes:** one name on coverless cards, port pictures, one Play button with LB/RB for Uncharted, PC Ports filter and More entry, Quick Menu fits, Played mark.
8. **Part 9 items:** cheats (libretro .cht through RetroArch from its cheat_manager.c rules, `electron/chtIndex.json.gz` made by `tools/cheats/index.js`; switch-cheats-db into Eden's `load/<TID>/Cartridge Cheats/cheats/<BID>.txt` per patch_manager.cpp, Ryujinx's mods folder), forks list (`electron/forks.json`, daily refresh), multi-drive (drive per console, away games, Move to Another Drive, Emulator Storage), Saves widget, Settings rows audit (`tools/ui-audit/rows.js`), Online Play extras, Windows trial start through Proton.

**What broke and how it was caught:** the hub broke every audit that clicked section keys one after another (they now press All Settings first) and screens opening a section landed on the hub (`settingsDirect`). The playtest reported lost focus after Achievements settings: its Open Achievements button changes tab, the tool didn't go back (tool fixed). The libretro database writes `&quot;` in names (shown decoded, written back as they were). One end-to-end run failed once in five without a repeat; watch the CI runs.

**Not verified:** a real update across channels (needs a published prerelease), the shaders on a Deck GPU, cheats in a running emulator, a Windows port's trial start, Proton runs.

**Owner device tests:**
1. Switch to Beta, then back to Stable (Choose a Version too). After this merges, publish a beta once from Actions to try it.
2. Settings cards on the handheld and the TV; open a section from a game's More (it should skip the cards).
3. Aurora Veil and Horizon Grid in Plain, Glass and Light.
4. A Switch game's Cheats tab in Eden, and a SNES game through RetroArch.
5. Move a game to the SD card and start it from Steam; take the card out and look at the game page.
6. Bloodborne trophies after unlocking one.

## Part 19. 0.9.72 · Played and Fixed (17 Oct 2026)

**Asked:** host a playtest of the UI, UX and missing features with about ten playtesters (UI, UX, recomps, Online Play, saves, emulator setup, Steam, smoothness), with recomps the main focus, collect their points into a list of fixes, and fix them.

**How it was run:** the real app through playwright-core `_electron` with a `-r` hook, in a fake home: PS4 dumps for the five verified games (their own param.sfo), Flatpak installation folders for six emulators with settings files, a Steam root with an account and a stand-in Proton 9.0 plus sniper that log what they're asked. The fake RomM gained `extra.ps4` (rom ids 900 to 904, platform `ps4`). The hook answers `api.github.com/repos/<repo>/releases` from the recipes with each port's real release file served locally. Rig and scripts are in the scratchpad, not the repo. Report: `docs/playtest-0.9.72.md`.

**What was found and fixed:** see the report's table. In short: inFAMOUS had no way to pick update 1.07; ports never went into Steam on their own and the sheet didn't say whether they were in it; two toasts after install; silent Play and update check; P.T.'s installer refusing the copy left a misleading "Your copy is picked"; "Your Game" for an uninstalled port; a Steam queue item that could never apply; the RetroArch Flatpak without cores shown as not installed; Settings focus stuck on All Settings for sections that load.

**Checked after the fixes, in the same rig:** inFAMOUS shows Needs Update 01.07 with Pick the Update's Folder, and with the folder given it is Ready to Play with the update laid over as links; Bloodborne gives one toast ("is ready and on its way to Steam"), the Steam row says it's waiting, and Apply wrote both ports into shortcuts.vdf with their start scripts; Apply with a game not on the device says so and empties the queue; RetroArch shows installed. `npm test` 382 pass, build, launch check, `npm run audit:ui`.

**Not verified:** P.T.'s That Copy Didn't Work step after its real installer refused (logic only: the installer takes minutes and the refusal was seen before the fix); live Steam adding (no CEF here); a real port running.

**Owner device tests:**
1. A port you own with Steam's automatic adding on: after Set Up it should appear in Steam's Recomps collection.
2. inFAMOUS with 1.00 on the device and the 1.07 update somewhere else: Pick the Update's Folder.
3. Settings → Online Play from the cards with the controller: focus lands on the first emulator, not All Settings.

## Part 20. 0.9.73 · Settings, As Before (17 Oct 2026)

**Asked:** a photo of 0.9.71's Settings cards on the handheld, with "I would like to return to how the menus looked before but more polished".

**What was done:** the hub commit (b306905) taken back by hand in `src/views/Settings.vue`, keeping everything after it (the 0.9.72 focus wait, `statusOf`). The left list returns with its D-pad rules (Right into the page, Left at the page's left edge and B back to the section). Polish kept within the old design: each section's status line from the cards sits under its name, Emulators shows a count of issues, Find a Setting shows its Y button, the list scrolls on short screens and is a little wider (250 to 300 px). The open section keeps the chosen fill and outline; focus is the usual white. The audits' `.hub-back` clicks are null-safe and simply find nothing now.

**Checked:** screenshots in OLED Plain, dark Glass, Light Plain and Light Glass at 1280x800 (the real app in the playtest rig); `npm test`; `npm run audit:ui`; e2e.

**Owner device test:** Settings on the handheld and the TV: the list, a status line under each, Right into a page and B back.

## Part 21. 0.9.74 · Unpacked Again (17 Oct 2026)

**Asked:** "Auto zip extraction doesn't work for ps4 anymore, can you check for ps3 and other systems and make sure it works".

**Cause:** unpacking only ran on the single-file download path and only for PS4/PS5. RomM sends a game it keeps as a folder (one zip inside a folder, or the game and its update as two zips) down the multi-file path, which never unpacked. PS3, PS2 and the rest were never unpacked at all.

**Fix:** `unpackGame` (zip with progress via yauzl, 7z/rar via `unpackTo`) on both paths for `UNPACK_SYSTEMS`. One archive alone in a folder unpacks into it; several each into a folder named after it; a lone file inside goes beside the other games (outside PS4/PS5, whose games are folders). Installed detection and library verify follow.

**Checked:** e2e with six archive games in the fake RomM (PS4 single zip, PS4 game plus update, PS4 zip in a folder, PS3 folder dump, PS2 ISO in a zip, SNES left zipped): all pass; the old code failed four of them. `npm test`, launch check. 7z and rar weren't run here (no 7z or bsdtar in the container); they use the same unpacker as add-on installs.

**Open:** a PS4 game and its update unpack as two sibling folders inside the game's folder; shadPS4 looks for an update as `<game>-UPDATE` beside the game. Ask the owner whether to name it that way.

**Owner device test:** download a PS4 game with an update, a PS3 game and a PS2 game from RomM; each should be unpacked and start from Steam.

## Part 22. 0.9.75 · Found by What's Inside (17 Oct 2026)

**Asked:** a photo of P.T. on the game page showing Download after the owner unpacked its zip by hand on the microSD; "I think you broke something, what's the point of the beta testers then".

**Cause:** not 0.9.74's unpacking (that code path for PS4 detection was unchanged), but a gap that was always there: a PS4/PS5 folder was known only by RomM's file name (the zip's name without .zip) or by a title ID inside a name. A zip unpacked by hand is usually named after what's inside it ("CUSA01127", "P.T", an "-app" folder), so it matched nothing. The playtest rig named its dumps "Name [CUSA…]", so it never hit this; e2e now has both shapes.

**Fix:** `sfoIndex` reads each folder's `sce_sys/param.sfo` (top or one level down, cached by mtime) and `installedState` matches TITLE_ID or the title; the installed path is the folder holding sce_sys, which emulators and ports open.

**Checked:** e2e 26 of 26 (the two hand-unpacked cases fail on 0.9.74), `npm test`, launch check.

**If it still doesn't show for the owner:** ask for the folder's name and whether it has sce_sys/param.sfo inside (a fake PKG dump keeps it under the -app folder, found one level down; deeper isn't looked at). Game More → Mark as Installed is the fallback.

## Part 23. 0.9.76 · Every Emulator Opens (17 Oct 2026)

**Asked:** "vita 3k menu not opening in emulators section in settings, you've regressed"; then: have the playtesters test every nook and cranny and every setup, report, fix at once, and keep looping (resuming after five hours if credits run out) until nothing is left.

**Cause:** the sheet opens only for a row in `emuup:list`, built from `installedEmulators`. An AppImage straight in ~/Applications (how Get Emulators installs Vita3K) was listed only after the background detection scan had read it; Get Emulators finds it by name, so the card said "already on this device" and nothing opened. Not a new code change: a gap a fresh install or an update (a new file) exposes.

**Fix:** AppImages in APP_DIRS listed by name; RetroArch rows; a row for every emulator Get Emulators counts as installed from what starts it (EmuDeck launcher), with no update source and no Delete.

**New check:** `test/e2e/setups.js`, also in CI. First run found RetroArch (no sheet in Flatpak or EmuDeck setups) and EmuDeck-only Xenia; all 21 checks pass after.

**Sweep loop:** continues after this release (Part 24 and on as findings come in).

## Part 24. 0.9.77 · Every Button Pressed (18 Oct 2026)

**Sweep rounds 2 and 3** of the owner's loop. `test/e2e/crawl.js` in four fake homes (`test/e2e/homes.js`): every tab, Settings section and page, safe button, emulator sheet (one level in) and a game page with its More sheet (every tab and option that opens something) for twelve consoles. Round 2 found Where They Go refusing every drive when emulators were already set up; round 3 found Show all losing the way back and a misleading SteamGridDB notice. Everything else it lists is expected in a fake home (see CLAUDE.md 0.9.77). Crawler false alarms fixed on the way: route objects gain `focusKey` (compare name and params), look changes count as something happening, the Welcome and Tour are never pressed.

**Checked:** setups 21 of 21, e2e 27 of 27 (Favourites added), `npm test`, launch check, `npm run audit:ui`, controller playtest.

**Round 4, Steam (done):** `test/e2e/steam.js` (in CI): 16 consoles' games downloaded and applied with Steam closed in the AppImage, Flatpak and EmuDeck setups; shortcuts.vdf read back: 8, 15 and 16 games in Steam, each starting an existing program with its own file; every console left out says why. Clean.

**Next rounds (scheduled resume every 5 hours while work remains):** downloads for every console, saves found per emulator layout, recomps install per port, Online Play with configured emulators.

## Part 25. 0.9.78 · Saves on a New Device (18 Oct 2026)

**Sweep round 5, Online Play** (`test/e2e/online.js`): settings files for PPSSPP, PCSX2, RetroArch, RPCS3, shadPS4, Eden, Ryujinx, Azahar, Dolphin and Cemu as each writes them after a first start; every kind switched on and off. 37 checks, clean: refusals name the missing field and write nothing, every file still parses. (Test data had to match the app's own rules: RPCN tokens are 16 capital letters and digits; ShadNet needs shadPS4's users.json.)

**Sweep round 6, saves** (`test/e2e/saves.js`): two devices through the fake RomM's new saves API. Found a real bug: a device that had never saved in RetroArch has no saves/ folder (RetroArch makes it on the first save), so Save Sync left the save unplaced. Fixed in `placeFor`; 7 of 7 after.

**Covered earlier:** recomps (0.9.72 playtest, real release files), downloads per console (Steam round), archives (0.9.74).

**Checked:** npm test, e2e run, setups, steam, online, saves, launch check.

**Next round (scheduled resume):** game settings written for each emulator (GameSettings on and off per console), add-ons install into each emulator's layout, Linked Folders in a fork setup.

## Part 26. 0.9.79 · Your Answers (18 Oct 2026)

The owner answered the six questions from "What's left?": yes to switching RomM features off, yes to tested versions in recipes, P.T.'s chunk1.psarc and texture.qar sit beside eboot.bin, yes to PC ports in Settings → Steam, the shadPS4 note is no longer true, yes to `<game>-UPDATE` folders.

- **RomM features:** I didn't want to guess which RomM version added what, so `rommFeatures.js` reads RomM's `/openapi.json` (FastAPI's default, proxied by RomM's nginx: docker/nginx/templates/default.conf.template) and checks the endpoints each feature needs, from RomM's current routers (saves.py `add_save` has `slot` and `content_hash`). Save Sync refuses to turn on and stops running with the reason; Trophy Sync stops with a sentence; Issues lists what's off. QR pairing and play sessions already fell back on 404 and are only named. The old `rommTooOld` line stays.
- **Recipes:** `game.tested` (versions as NN.NN; a copy outside them gets a note, unless it already needs an update) and `game.find` (files the port finds itself, folder then two levels down, sce_sys/sce_module skipped, as P.T.'s first_run.cpp `FindGameFolder`). `rev` 3 on both, so users get them from main within a day.
- **PC Ports page:** Settings → Steam third page (LB/RB), every installed port with In Steam / Waiting / Not in Steam, A opens its sheet, Add N to Steam.
- **PS4 updates:** `ps4Layout.arrange` after a download's archives are unpacked (both paths). Hand-made layouts are never touched.
- **Checked:** npm test (390), e2e run (28, Update Pair new), saves (10, older RomM new), UI audits, launch check. On a device: a PS4 game with its update in RomM, then shadPS4 showing the update's version; Save Sync against an older RomM if one is around.

## Part 27. 0.9.80 · Loose Ends, Tied (18 Oct 2026)

The owner asked for items 2, 3 and 4 of the "What's left" answer.

- **Link recomps (item 2):** Save Sync for folders you tick (the old rule "nothing guessed is uploaded" holds: only what you pick goes up); setup checked after an update; builds from GitHub Actions (openmbu's case); a start from Steam watched for setup like Open; Windows link builds get Cartridge's own prefix (wineboot, once) so updates are tried through Proton. Tested in `test/recomps.test.js` (four new tests with a fake GitHub, artifacts API and runner).
- **Online Play (item 3):** Cemu Pretendo is a real switch now, gated on otp.bin and seeprom.bin (the Wii U's files), per account as CemuConfig.cpp writes it; RetroArch Host This Game Online / Join a Friend’s Game on the game page's Emulator tab, for games RetroArch runs here. Checked in the real app (e2e online 40, saves 13 with the netplay rows).
- **Vita frame generation (item 4):** a plain warning before frame generation goes on for Vita games, a Vita console or all games when there are Vita games; never refused. Unproven cause, said so.
- **Checked:** npm test (397), e2e online, saves, run, setups, steam, UI audits, launch check.
- **Device tests:** RetroArch hosting with a friend (port forwarding is theirs), Cemu Pretendo with real Wii U files, a GitHub Actions build download (sign-in in Cartridge's window), a link recomp update.

## Part 28. 0.9.81 · Setting Up, Shown (18 Oct 2026)

Owner's photo: P.T.'s sheet on Finish Setting Up with "Working" and no progress. The job text was empty, which means no step event had arrived: P.T.'s installer (`installer/Native/setup_linux.cpp`, `--install` mode) sets no report hook and prints nothing while it copies chunk1.psarc and texture.qar (gigabytes, from a microSD to a microSD here), so a slow copy and a stuck one looked the same. Not proven which it was on the device.

- `configure()` names every step (check, installer, write), measures the install folder every 2 s while the installer runs and shows "X of Y copied" (Y = the recipe's `find` files), and stops an installer that has written nothing for 5 minutes with a plain sentence. `runProgram` takes a `signal`.
- **Ask the owner:** press Set Up again on 0.9.81 and say what the sheet shows. If it stops with "wrote nothing", send cartridge.log (lines `verified run` and `verified installer stalled`).

## Part 29. 0.9.82 · Out of the Way (18 Oct 2026)

Owner: P.T.'s setup worked but took very long ("put a progress bar and see what makes it take this much time"); SteamOS gets very laggy while a game launched from Cartridge runs.

- **Why P.T.'s setup is slow:** its installer (setup_linux.cpp RunInstall) checks its own file, unpacks its runtime, then copies chunk1.psarc, texture.qar and pathid_list_ps4.bin byte for byte (CopyArchives, 4 MB blocks) from your copy into the port's folder. On the owner's Deck both are on the same microSD (Emulation/roms and Emulation/recomp), so every byte is read and written on the card. 0.9.81 added the bar; 0.9.82 adds speed and time left, and the log line `verified installer done` says how long the part before copying took, the MB/s, and whether both folders are on one drive. Not measured on the device yet: ask for that log line.
- **Lag:** measured in the real app: an animated background costs ~22% of a core plus GPU in front, ~0.1% once quiet. Quiet depended only on reading gamescope's focus with xprop (it needs SteamGameId and xprop working); now our own game, or any Steam launch when focus is unreadable, quiets it too. The game watch's synchronous /proc read every 2 s is async. Picture caches are freed when quiet.
- **Ask the owner:** after a laggy session, send cartridge.log: `health:` lines show Cartridge's own CPU and memory while playing and `| quiet`; `gamescope focus unreadable` means xprop isn't working there.

## Part 30. 0.9.83 · Windows Ports on Any Drive (18 Oct 2026)

Owner's photo: Uncharted: The Nathan Drake Collection (Windows build through umu-launcher and Proton 11.0) installed under `/run/media/<user>/Expansion/EmuDeck/Emulation/recomp/ps4/…` stopped at "Proton couldn't make … Windows folder (its prefix). Start a Windows game in Steam once". The prefix was made in `<install>/.cartridge/proton`, on a drive named like an external disk; Proton prefixes need symlinks (dosdevices, system32 links), which exFAT and NTFS can't hold. Not confirmed on the device which filesystem it is (ask for `recomp prefix on the internal drive` / `verified prefix` log lines).

- `prefixFor` probes a symlink once and moves the prefix to `~/.local/share/cartridge/proton/<id>` when it fails. The old advice was wrong and is gone; the error now says where and why. umu's first run can download Steam's runtime, so 15 minutes.
- **Device test:** press Set Up on Uncharted again; it should make the prefix on the internal drive and finish.

## Part 31. 0.9.84 · shadPS4 as a Flatpak (18 Oct 2026)

The scheduled sweep resume: rounds 7 to 9 from Part 25, plus every older e2e sweep again (run 28, setups 21, steam 15, online 40, saves 13, crawl in four setups: nothing new; the crawl now counts a plain message as something happening, since Add to Favourites only says so).

- **Round 7, game settings** (`test/e2e/gamesettings.js`): a game per console (PS3, PS1, PS2, PSP, GameCube, Switch, 3DS, Wii U, Vita, Xbox 360, Dreamcast, arcade, PS4, SNES in RetroArch) with each emulator's settings file as after a first start, mostly Flatpak folders; one setting changed, read back from the list and the file, listed again, put back, every file still parses. 99 checks. **Found:** the shadPS4 Flatpak (`~/.var/app/net.shadps4.shadPS4/data/shadPS4`) was never looked at by `patches.shadDirs` or `ps4PatchState`, so Game Settings and Patches said shadPS4 had never been started. Fixed; unit test in `test/patches.test.js`. The other first failures were test data (a PS2 program whose words XOR to 0, a PS3 folder not named like RomM's entry, names with IDs that real dumps don't carry): the sweep uses the real `mario-tennis.wua` fixture and an STFS header instead.
- **Round 8, add-ons** (`test/e2e/addons.js`): one pack per layout through Install a Download (PCSX2 textures and .pnach, DuckStation, Dolphin, PPSSPP, Azahar textures and mods, Eden, Ryujinx, Cemu, shadPS4 `-mods`): an archive that doesn't fit is refused with nothing written, the real one lands where the emulator loads it, textures are switched on, Remove takes back exactly what was put there, game folders untouched. 61 checks, clean.
- **Round 9, Linked Folders with forks** (`test/e2e/links.js`): PrimeHack (a fork Cartridge knows) and a shadPS4 fork marked by hand (`setup:fork`), each with its own saves: suggested, linked with Merge (the fork's save copied in, the original's untouched, the fork's folder kept aside), not suggested again, Find and Link has nothing left, Unlink puts the fork's folder back byte for byte, a folder outside home refused. 23 checks, clean.
- `test/e2e/discs.js` makes the small images the readers need; `homes.launch` takes `prep(home)` for files that must exist before the app starts. All three run in e2e.yml.
- **Device test:** a PS4 game with only the shadPS4 Flatpak installed: More → Game Settings and Add-ons → Patches should list, not say "hasn't been started".

## Part 32. 0.9.85 · PC Ports (18 Oct 2026)

Owner: recomps should show in Continue Playing and be laid out like a console, called something Steam or Valve, with the installer in Settings. I asked three questions; the owner said "do the recommended": the name PC Ports, installed ports only, a Set Up button on the game page.

- **PC Ports page** (`RecompsView.vue`): header like Consoles (ports, ready to play), Get and Manage (X) to Settings → Emulators → PC Ports (`settingsSpot` page `recomps`), a grid of `GameCard`s from each port's first library game, newest played first; a link port matching no game shows its project picture and opens its sheet. None installed: one sentence and Get PC Ports.
- **Game page:** `port` prop; `portLabel` (Play / Update / Set Up the PC Port; link ports by `installed.ready`); a ready link port starts with `recomps:open` instead of opening its sheet; Play With still overrides.
- **Continue Playing:** `steamManager.playtime()` reads the recomp shortcuts in the registry (`recomp`, `artRomId`), adds their minutes to the game, `port` when the port was played last. Home's Continue Playing says PC Port; Start's Continue tile and Home open the game page, which plays the port.
- **Renamed:** Settings → Emulators page Recomps → PC Ports (and its search lines), game More "Recomp:" → "PC Port:", Achievements console name, the Steam card's line.
- **Checked:** npm test (401, a new play time test), build, launch check, UI audits, screenshots of the page, the card and the game page in Plain and Glass with the stub. On a device: play a port through Steam, then Home's Continue Playing should show its game marked PC Port.

---

## Part 33. 0.9.86 · Played on a Real PC (19 Oct 2026)

The first session on the owner's own PC (Bazzite, KDE at 150% on a 4K TV at 120 Hz, Steam with Proton 10/11/Experimental/GE, umu-launcher 1.2.9, EmuDeck on an ext4 drive, RomM 5.3.1 on the LAN). The owner was at work and gave full permission; brief in docs/PLAYTEST-ON-A-REAL-PC.md. The real app was run from source (the owner's real user data), driven through a long-lived Playwright session, screenshots of the real screen, a virtual pad on /dev/uinput (see below) and CPU measured per process.

- **Windows ports never set up (every one):** the log said `ValueError: Failed to match '…/Proton 11.0' with a container runtime`. umu 1.2.9 knows sniper and soldier; Proton 11, Experimental and Hotfix need SteamLinuxRuntime_4. Proved by hand that Proton 11 in runtime 4 makes a prefix (49 s, exit 0), then rebuilt `protonRunner` (Part 6). Uncharted and Bloodborne set up and reach their title screens from Cartridge and from Steam (screenshots; Bloodborne at 120 FPS with FSR 4). The drive was ext4, so 0.9.83's internal-drive prefix wasn't needed here.
- **Steam's launch variables:** `childEnv.js` for every spawn in recompsIpc; start scripts unset STEAM_COMPAT_*, PRESSURE_VESSEL_*, STEAM_RUNTIME*; the prefix log keeps the runner and the last 12 lines of Proton's output.
- **Save Sync was off since 0.9.79:** RomM 5.3 dropped `content_hash` from the upload's parameters (it still lists it); `rommFeatures` now judges saves by `slot`. A dry run on the owner's saves showed 79 the same, 9 to send, none to fetch, no conflicts, before anything was allowed to run.
- **Downloads lost on quit:** the queue lived in memory; a 19.7 GB GoW3 download stopped when Game Mode closed Cartridge and was gone. `downloads-pending.json` (`dlPending.pick`), restored 8 s after start in the folder its `.part` is in. Checked: closed mid-download, reopened, it went on from the same byte, across several restarts; after the release the 38.7 GB GoW3 download finished, unpacked itself and its port set up and started at 120 FPS.
- **Auto add to Steam:** gave up when Steam's live port didn't answer within 4 s; now retries every minute for an hour and applies a queue left from before at start.
- **Hand-placed dumps:** a port only looked at library copies; `dumpsHere` reads param.sfo in every PS4/PS5 folder on every drive (`matchDumps`: title ID or title).
- **Ports as ports:** ConsoleMark `slug: 'steam'` (optical 1.45, docs/logos.md) on Continue Playing, Home's header ("PC Port"), Start and the PC Ports page; a port's More is a PC Port tab (Play, Port Settings, Manage the Port, Set Up Again, Show Its Folder, Steam, Play With) plus Game and Details; ports with several starts are played as `<id>:<start>`, which the page never matched.
- **Interface size:** the owner's 2.5 (picked for Game Mode) gave 1024x576 on the desktop; `zoom.js` keeps at least 1280x800.
- **CPU:** Start idled at ~100% of a core and Home ~85% (renderer + GPU) on the 4K TV; the ambient driver, stepped spinners and an off-screen marker that stops brought them to ~25% and ~11% with a still background. A port opened from Cartridge (`childRun`) now counts as our game: Cartridge from ~95% to 1% behind Bloodborne.
- **Smaller fixes:** Start labels with a count wrap the count, not the word ("Recommen / ded"); Shortcut health finds a second shortcut for the same game (P.T. was in Steam twice); "not in your RomM library" said as such; a moved game's saved path follows it; Wii U (.wua, meta.xml) and Xbox 360 game IDs read, so their saves match (New Super Mario Bros. U); Game Settings finds a Flatpak's folder behind EmuDeck's launcher (every RetroArch game said "not found"); ports installed from a link stay listed when their project becomes verified.
- **Tests on this machine:** six detect tests failed only on machines with system Flatpaks (Bazzite): tests set FLATPAK_SYSTEM_DIR, which Cartridge now honours; and `flatpakCanSee` no longer treats an uninstalled app as known from a global override.
- **Controller:** Chromium listed no pads in this Desktop session at all (a bare Electron window too); Steam Input grabs uinput pads and turns them into keyboard and mouse on the desktop. Controller paths were driven through a scripted standard pad inside the page (nav.js reads it like a real one; rumble calls recorded: A sends 26 to 32 ms light rumbles). Part 9 has the open question.
- **Checked:** `npm test` (all pass), build, launch check, `npm run audit:ui`, the real app on every tab and Settings section with the clipping scan (nothing cut), games launched through Steam (Chrono Trigger in RetroArch) and back, ports updated (P.T. 1.0.5 to 1.0.6, then started), Online Play and Game Settings read on ten and fourteen emulators.
- **Owner to test:** a Windows port in Game Mode (window in front, controller), Save Sync's first real run (it will send nine saves), a download interrupted by leaving Game Mode, the PC Ports page and a port's More on the TV.

## Part 34. 0.9.87 · Starting Up (19 Oct 2026)
Owner, after 0.9.86: the controller did nothing in Cartridge after a game; Settings → Emulators, PC Ports and Game Add-ons took very long to open; and a loading screen for games that take a while (the Uncharted port).
- Controller after a PC port: 0.9.86's `childRun` replaced the port's own `background` broadcast with `setAway('run')`, which gamescope's focus reading overrides (the port inherits Cartridge's SteamGameId, so gamescope names Cartridge as in front), and it sent no `game-run` ended, so nav.js `gameEnded()` never ran. Now `awayBy.child` wins in Game Mode and `game-run` starting/ended is sent. Not reproduced on a device yet: ask the owner whether it was a port or an emulator game, and for the log lines `game ended`, `after the game`, `quiet while`.
- Starting screen: CLAUDE.md 0.9.87. Checked in the real app with `test/e2e/starting.js` (8 checks) and `setups.js` (21), `npm test` 410.
- Slow Emulators pages: not found. Every setup in `setups.js` lists emulators in 0.5 to 4.4 s. Suspect: a big download picked up at start (0.9.86 `restorePending`; the owner's Dock showed one download) keeping the main process busy. Asked for the log (`picking up`, `stalled`, `longest stall`).
- Also open from this chat: the two older link copies (P.T., God of War III "(From a Link)") look like duplicates on the PC Ports page (GameCard shows the library game's name), opening the second card opens the port picked in Play With or played last, not that card, and Remove only exists in the port's sheet. The owner can remove them from Settings → Emulators → PC Ports. Not changed yet.

## Part 35. 0.9.88 · Smooth Again (19 Oct 2026)

Second session on the owner's PC (Bazzite, KDE at 150% on a 4K TV at 120 Hz, Steam Controller puck), after the cloud
session's handoff (docs/PLAYTEST-ON-A-REAL-PC.md, "Handoff after 0.9.87"). Every report was reproduced on this machine
first and its cause written down before code changed. Rig: the real app from source with the real home, driven over a
local control port (scratchpad, not in the repo); Game Mode reproduced with a nested gamescope at 3840x2160, zoom 2.5.

- **The freezes and "infinite load" (owner: Emulators, PC Ports, Game Add-ons slow after 0.9.86).** cartridge.log:
  `main thread stalled 160981 ms`, `health: cartridge 6290 MB`, `save sync: slow steps slowest save (pt) 165887 ms`,
  then RomM 413/502. P.T.'s recipe names `{dir}/game/data` as its save folder; that folder holds two 128-byte saves
  beside 1.9 GB of `enhanced-textures` and `pipeline-cache`, and `syncUnit` zipped it in memory on the main thread on
  every sync (and hashed new texture files with md5 there too, the likely cause of 60 to 80% idle CPU in Game Mode
  after games). `saveSync.notSave` leaves caches, textures, logs and dumps out of a port's unit (`entriesOf`, port units
  only: emulator save folders are exact) and out of `recomps.backupSaves` (cpSync filter); `SAVE_MAX` 512 MB refuses a
  unit from stat alone (`sizeOf`) before any read. P.T.'s unit went from 1.99 GB to 10.7 KB; a whole dry run takes
  0.84 s. The same guard explains the PSP save refused with 413 since 0.9.63: `ULES01372DAT` is Peace Walker's 0.8 GB
  install data in SAVEDATA. Not reproduced: the IPC calls behind those pages answer in 1 to 300 ms when nothing blocks.
- **Uncharted, controller (owner).** The owner's pad is a Steam Controller (puck, 28de:1304): a gamepad only through
  Steam Input, which serves apps Steam started. A port Cartridge spawned ran under Cartridge's Steam identity (Game
  Mode: worked, log "gamepad connected: XInput Controller #1") or none (desktop: Steam's mouse and keys). `openVerified`
  now starts a port through its own Steam shortcut (`recompShortcut('<id>:<start>')`, `runAppid`) when Steam is
  running, watched by its start script (`watchGameRun(romId, { needles })`); else directly as before. Checked: P.T.
  then runs as SteamAppId 2388672365 with `SDL_GAMECONTROLLERCONFIG`, Uncharted logs its pad. Not checked: buttons
  pressed (needs a person).
- **Uncharted, settings (owner).** The launcher's `--play` passes settings.json to the game as BB_* variables (checked
  in its source, uncharted_launcher.py `game_environment`), and the game's log showed them applied (FSR 4.1.1 asked,
  FSR 3.1 used: this GPU has no FSR 4; frame generation 2x). `show_fps` is read only from bbport.ini
  (bbport_settings.cpp, launcher `collect()`), and the recipe sent it to settings.json. Recipe rev 3, `['ini',
  'show_fps']`, pinned in test/recipes.test.js. inFAMOUS checked the same way: its runner reads show_fps from JSON.
- **Ports apart from emulators (owner).** Game.vue: `isPortPage` = opened with `port`; `usePort` is only that port (the
  `ui.playWith` choice won over the card, so the second P.T. card opened the first); no Play With anywhere; a port page
  has the Steam mark + "PC Port" (+ "From a Link"), its folder, its button only, More = PC Port tab with Remove the Port.
  A console page never plays a port; its More lists ports and opens an installed one as its page. `goPlayed`
  (store.js) opens Continue Playing and Start's Recently Played as the port played last; Home's header says PC Port only
  when focused there. ConsoleMark `steam` carries the word STEAM (owner). RecompsView names link copies.
- **GSAP (owner: commit to it).** `src/gsapEngine.js` imports GSAP and Flip; `motion.js frame()` runs on GSAP's ticker;
  morph, Start arranging (Flip) and WelcomeIntro (timeline, timeScale 10 with reduced motion) are GSAP only; the switch,
  `body.motion-gsap` and the Settings toggle are gone. GSAP stays a devDependency (Vite bundles it; electron-builder
  would pack a second copy). motionBench, 4x CPU slowdown, three runs: flight 138 to 156 slow frames of ~1290 (CAE
  143, old switch 123), arranging 4 to 11 of ~565.
- **Controller playtest CI (red since 0.9.80).** A Settings page changed with LB/RB kept the last page's scroll, so its
  tab row, where focus lands, was above the pane (timing-dependent). Pages now reset scroll like sections. Two clean
  runs locally.
- **CLAUDE.md** was 176 KB; per-version notes moved to docs/VERSIONS.md (13 KB left).
- **Found by the crawl and the e2e run here:** Start's Consoles/Downloads/Library/Achievements tiles used `tab()` (history cleared, B dead): now `go()`, as Settings' Open Achievements and AddonsSheet's jump to Downloads. `test/e2e/steam.js` failed 3 checks on a desktop with Steam open: `steamArt.steamRunning()` counted any Steam on the machine (another user's too); now `oursSteam(pid)` (same uid, HOME ours or inside it, Snap's ~/snap/steam/common included, paths resolved through /home -> /var/home), tested with real processes; `steamHelper.js` has its own `steamRunning()` (it runs alone, copied out of the AppImage), given the same rule inline. steam.js then 15 of 15 here with Steam open. The owner's real shortcuts.vdf was checked unchanged (204 shortcuts), and the owner's Steam was never restarted (running since before the tests). Run e2e locally with `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 ELECTRON_OZONE_PLATFORM_HINT=x11 xvfb-run -a …`, or the windows open on the desktop.
- **Renamed AppImages:** electron-updater keeps a name without a version (the owner's lowercase `.appimage`: checked in AppImageUpdater.doInstall) but gives a versioned one the release's name and deletes the old file, leaving steam-launch.sh pointing at nothing. Rewritten on `appimage-filename-updated`; the script falls back to the newest `*[Cc]artridge*.[Aa]pp[Ii]mage` beside the old path (checked in a shell).
- **exFAT, on a real drive:** a udisks loop mount of an exFAT image (fmask 0022: scripts and programs run; symlinks: EPERM). The 0.9.83 prefix test run against it: the port installed on exFAT, its prefix went to the internal drive, the start script used it.
- **Looked into and left:** Cartridge on the desktop sees no gamepad with a Steam Controller: Steam creates no virtual
  pad for it, started from Steam or not, Wayland or X11 (tried live with `--ozone-platform=x11` as launch options,
  then restored them). Steam may create it on the first button press; a "Reopen Through Steam" offer was built and taken
  out again because it couldn't be shown to help. Start-up stalls of 250 ms (source) to 700 ms (AppImage) are module
  loading. `checkFile` hashes big downloads on the main thread in 1 MB steps (no stalls, but CPU): hashing in
  `dlWorker` while writing would remove the second read.
- **Owner to test:** a Windows port with the controller from Cartridge on the desktop and in Game Mode (buttons, not
  only "connected"), Cartridge's own controller after a port that started through Steam, Show the FPS counter in
  Uncharted, the PC Ports page and a port's More on the TV, and Cartridge on the desktop with the Steam Controller
  (does pressing a button make the pad appear?).

## Part 36. 0.9.89 · Ports in Steam (20 Oct 2026)
Owner: a Steam tab in a port's More (collections, remove from Steam, frame generation); one Steam shortcut for Uncharted instead of three ("it doesn't matter, just one"); Bloodborne's port doesn't start.
- Built as in docs/VERSIONS.md 0.9.89. The one shortcut starts the game picked last in Cartridge (the owner was offered the port's own menu or the last pick; the last pick was built because whether `Uncharted.exe` without `--play` shows a game picker is unverified).
- Bloodborne: no log from the owner. 0.9.88 starts ports through their Steam shortcut; a request Steam takes but doesn't act on left nothing running. Now a direct start follows after 25 s. Ask the owner for `~/.config/Cartridge/emulator-runs/verified-bloodborne.log` and the `verified` lines of cartridge.log if it still doesn't start.
- Checked: `npm test` 413, `vite build`, `test/e2e/steam.js` 15, `setups.js` 21, `starting.js` 8, the play.sh dispatcher run with stand-in scripts (default, picked, unknown pick). Not checked on a device: the Steam tab with real Steam (collections need instant Steam changes), frame generation on a Proton port, the old three Uncharted shortcuts replaced in the owner's Steam.

## Part 37. 0.9.90 · Ports Start Again (20 Oct 2026)
Owner: inFAMOUS Second Son's and Bloodborne's ports don't launch; recomp and bios folders appear outside the Emulation folder as well as inside; keep SteamOS awake only while games download, unpack or install; read cartridge.log and the logs beside it and fix what's there; "make sure these issues cannot happen again for everyone".
- inFAMOUS, reproduced: `emulator-runs/verified-iss.log` said "Missing: eboot.bin". The game had been downloaded again from RomM as `InFamous Second Son` and the old `inFamous - Second Son` folder was gone, while `rec.game` and play.sh (`ISS_GAME_DIR`, settings `game_dir`) still named it. Fixed with `healGame` (VERSIONS 0.9.90). Checked on the PC: Cartridge from source set it up again by itself 25 s after start; through its Steam shortcut it compiled shaders (200 s, first start only), then played the intro at 59 FPS; started directly in a hidden gamescope it ran at 57 FPS. The first start through Steam right after the shader compile sat at 100% for 10 minutes and was stopped; the next start through Steam was fine. That hang is in the port (or Steam's Fossilize layer on its first compile), not in Cartridge; if the owner sees it again, closing and starting again gets past it.
- Bloodborne, not reproduced: on this PC it starts and plays through its Steam shortcut on the desktop (intro at 44 FPS), from play.sh, and in a hidden 4K gamescope with frame generation. Each start spends about 35 s preparing (eboot rebuilt and patched) with nothing on screen. Steam's gameprocess_log for the owner's Game Mode start (19 Oct 23:12) shows the game process starting 74 s in and every process ending together 6 s later, which looks like Exit Game during the silent preparation, not a crash. Offered to the owner: a line on the starting screen saying a port's first start can take minutes with nothing shown.
- Folders: EmuDeck's `emulationPath="/run/media/<user>/<drive>/EmuDeck"/Emulation` was read as `.../EmuDeck`, which then counted as an Emulation root (recomp/<console> folders by `ensureFolders`, a copy of every BIOS by `biosSetup` into `<root>/bios`). Fixed for everyone (shellValue, roms/ guard) and tidied once: 41 items on this PC (14 empty folders, 27 identical BIOS files), checked byte for byte before.
- Log review (cartridge.log since 27 Sep): the console TypeErrors and ReferenceErrors stopped in early October versions. New: a 14 s freeze on inFAMOUS's update (sync copy, fixed), "Close inFAMOUS Second Son first." after the update's trial start (fixed), a double start after Steam started a port that closed quickly (fixed), a night's sleep logged as a 27349884 ms stall (relabelled), P.T.'s 1.1 GB "save" refused by RomM with 413 (0.9.88 already filters textures; the recipe now names the save files). Still in the log, not Cartridge's: RomM 502 and unreachable server while away from home, Uncharted's old "Failed to match Proton 11.0 with a container runtime" (18 Oct, before 0.9.86's runtime fix).
- Sleep: `systemd-inhibit --list` shows the lock while held and not after. Not checked: an actual Game Mode idle sleep during a download (suspending the owner's PC to test was not done).
- Checked: `npm test`, `vite build`, every test/e2e/*.js (see the PR). Not checked on a device: Game Mode on the TV with the controller for both ports.
