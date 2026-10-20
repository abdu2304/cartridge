# Cartridge Verified recipes

Since 0.9.70 recomps and PC ports are a curated list. Each game Cartridge looks after fully is one recipe file in
`electron/recipes/<id>.json`, checked against the schema in `electron/recipes.js` (`validate`). The owner sends a link,
a session reads the project (its launcher's source, its settings file, where it keeps saves, what game files it wants),
writes the recipe, runs a real install, and commits it. Anything else is added From a GitHub Link and shown as
Unverified: Cartridge installs it and keeps versions, the port sets itself up by its own steps.

## What a recipe holds

| Part | What it says |
|---|---|
| `game` | Console, title, the IDs the project names (CUSA...), what the dump folder must hold (`has`), the version it wants (`want`, `soft` = runs on others, `update` = Cartridge lays the update over the base game) |
| `builds` | One per OS: the release file (`asset` regex), the program, its arguments, an `installer` when the project ships one (P.T.), and the launcher's own settings files (`files.app` JSON, `files.ini` flat or sectioned) |
| `app` | Values Cartridge always writes into the launcher's settings (the game folder, close on play) |
| `play` | More than one start (Uncharted 1, 2 and 3): one Steam shortcut each |
| `settings` | Every setting of the port's launcher, read from its source: `id`, `tab`, `label`, `type` choice/bool/number/text, `def`, `options`, `at` (`['app', key]` or `['ini', [section, key]]`), `desc`, `os` |
| `saves` | Where saves live, for backups and Save Sync |
| `verified` | Date, the release checked, whether the owner has played it |
| `known` | The keys the port's own settings files held when the recipe was written (`app`: JSON keys, `ini`: `key` or `section/key`). A key the port writes beyond these (a setting an update added) shows in Game Settings under More, typed by its value; a recipe setting the port stops writing for a release is hidden (0.9.90, `recipes.settingsNow`). Record it from a real install after the port has run once. Without it no extras show. |

Paths take `{dir}` (the install folder), `{game}`, `{home}`, `{config}`, `{data}`, `{appdata}` (the Proton prefix's
AppData for Windows builds) and `{result}`.

## More kinds of port (0.9.91)

The first ports were all PS4 dump folders. Since 0.9.91 a recipe can also say:

| Field | What it does | First used by |
|---|---|---|
| `game.kind: 'file'`, `ext`, `sha1`, `soft` | The game is one file (a ROM, a disc image) or a folder holding one, picked by ending; `sha1` lists the copies the project accepts (checked for files up to 128 MB; `soft` only notes a mismatch) | Ship of Harkinian, Dusklight |
| `game.kind: 'none'` | No game files: Set Up writes the settings and start | (none yet) |
| `game.alsoOn` | More consoles the game can come from (library matching) | Dusklight (GameCube and Wii) |
| `game.unpack: 'xiso'`, `keep` | An Xbox disc image is unpacked once into `.cartridge/disc` with Cartridge's own reader (`electron/xiso.js`); an unpacked folder is used as it is; `keep` folders survive unpacking again | JSRF Unleashed (its saves are in UDATA) |
| `builds[].first: { unless, args }` | Arguments for the first start only, until `unless` exists | Ship of Harkinian (the ROM, until oot.o2r is made) |
| `builds[].prepare: { cmd, done }` | A step the port's own release runs with your copy during Set Up (through Proton for a Windows build); again when the copy or release changes or `done` is gone | Wind Waker HD (setup.py builds the game) |
| `builds[].run` | The program to start when it isn't the one downloaded (a setup that installs the game's launcher); none of the shipped recipes uses it yet | (tested with Nebula, see below) |
| `builds[].files.app.nested`, `sparse` | JSON settings inside objects (a key is a list of names); `sparse` writes only what you changed in Cartridge and takes it out when set back, so the port's defaults hold | Ship of Harkinian |
| `builds[].files.ini.sparse` | The same for a flat ini | Wind Waker HD, Strikers |
| `builds[].files.list` (`format: 'lines'`) | A file of lines, each one thing turned on: a toggle is its line, a choice is one of its options' lines | DriveClub's patches_enabled.txt |
| `ini` | Values written into the ini every time, like `app` for JSON | DriveClub (`update=`, `base=`), Strikers (`data=`) |
| settings `at: ['env', NAME]` | A setting the port reads from its environment: a toggle exports 1 when on | JSRF Unleashed's RECOMP_FULLSCREEN |
| settings `int`, `word`, `quote` | A JSON toggle as 1/0 (libultraship CVars); an ini toggle as true/false (TOML); an ini text in quotes | Ship of Harkinian, Unleashed |
| `look: [{ var, files, dirs }]` | Files of the player's own looked for where other programs keep them; the folder becomes `{var}` | Shadow of the Colossus (sound modules from shadPS4's sys_modules) |
| `setup: { by: 'port', done, say }` | The port's own window finishes the setup the first time (Cartridge has done its part; the sheet says what to do); ready when any `done` file exists | Unleashed (its installer), SMS Launcher (its build) |
| `achievements.format: 'keyed'` / `'hedge'` | A JSON `{ key: { unlocked } }` with names from `list`; Unleashed's ACH-DATA | Dusklight, Unleashed |
| `achievements.files` with `*` | Every file the name matches | DriveClub (a log per start) |
| `{gameDir}`, `{winDir}`, `{localappdata}` | The game's folder, the install folder as Windows sees it, %LOCALAPPDATA% in the prefix | |

Ports in 0.9.91: Dusklight, Ship of Harkinian, 2 Ship 2 Harkinian, Shadow of the Colossus, DriveClub, Wind Waker HD,
JSRF Unleashed, Super Mario Strikers, Unleashed Recompiled, SMS Launcher. Not Verified, and why (20 Oct 2026):
- Project Reignition: its releases after 0.4.2 are on GameJolt, not GitHub (owner: leave it out).
- Nebula (Super Mario Galaxy): its unattended setup works through Proton (`Nebula-Setup.exe --unattended --input
  <iso> --root <dir> --accept-build-tools-license`, about 30 minutes, the game built in `<root>/versions/<v>/`, and
  `{localappdata}/Nebula/settings.json` with `settingsVersion` 4 skips its welcome page), but the game stops 2 s in:
  "native NAND root preflight failed with ISFS result -102". Its save folder keeps the Wii's file information in NTFS
  alternate data streams, which Wine and Proton don't have. Look again if it gets a Linux build or drops the streams.

## How a game starts

Cartridge writes `.cartridge/play.sh` (or `play-<start>.sh`) in the install folder: it copies the staged settings to
where the launcher reads them, sets the environment, then runs the Linux program directly or the Windows one through
umu-run, Steam's Proton in its runtime (sniper), or Proton by itself (`electron/protonRunner.js`). Steam shortcuts point
at that script, so a game started from Steam gets the same settings.

## Adding one

0. `node tools/recipes/draft.js <github link> [id]` writes a draft: name, licence, about, the release and which file is
   the Linux and Windows build. Everything it can't know is `TODO` with a `todo` list, and `validate` refuses the file
   until both are gone, so a draft never reaches users.
1. Read the project: release files, the launcher's settings code, save folder, the game files it checks.
2. Write `electron/recipes/<id>.json`, then `node tools/recipes/index.js` (bundles every recipe into `index.json`).
3. `npm test` (`test/recipes.test.js` validates every recipe and checks the bundle).
4. Install it for real: `node tools/recipes/install-test.js <id>` downloads its newest release, installs it through
   the app's own code, sets it up against a fake dump shaped like the real one (`SHAPES`) and checks the program, the
   start scripts and a setting read back. `RECIPES_ASSETS=<folder>` uses files already downloaded.
5. Commit. Users get it the next day without a release (the app reads `index.json` from `main` daily, a newer `rev` wins).

`tools/recipes/check.js` runs every night in CI (`.github/workflows/recipes-check.yml`) and opens an issue labelled
`recipes` when a project's newest release no longer has a file for one of its builds, or no longer installs and sets
up (install-test.js). Release files are checked against GitHub's SHA-256 (`digest`) after every download. None of the
projects publishes hashes of good dumps, so the dump check stays title ID, version and the files it needs.

## Trophies (0.9.71)

`achievements` in a recipe: `files` the port writes unlocks to (Bloodborne's `{dir}/user/trophies.log`, "id time"
lines), `output: true` when it prints "trophy N unlocked" (the start script then tees its output to
`.cartridge/output.log`, trimmed past 5 MB), `list` names when the dump has none. Names come from the dump's own
`sce_sys/trophy/trophy00.trp` when a shadPS4 trophy key is found, else the list, else "Trophy N"
(`recompAchievements.js`, `trophies.portTrophyDefs`).

## The first five (17 Oct 2026)

Bloodborne (Supermedo/bloodborne_pc, Windows), Uncharted: The Nathan Drake Collection (Supermedo/uncharted_pc,
Windows, three starts), God of War III Remastered (FelipePrado0/gow3_pc, Linux AppImage and Windows), inFAMOUS Second
Son (HayatoG/iss_pc, Linux and Windows, needs update 1.07) and P.T. (LoreanXavier/pt-pc, Linux, its own installer).
