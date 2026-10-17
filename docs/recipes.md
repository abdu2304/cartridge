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

Paths take `{dir}` (the install folder), `{game}`, `{home}`, `{config}`, `{data}`, `{appdata}` (the Proton prefix's
AppData for Windows builds) and `{result}`.

## How a game starts

Cartridge writes `.cartridge/play.sh` (or `play-<start>.sh`) in the install folder: it copies the staged settings to
where the launcher reads them, sets the environment, then runs the Linux program directly or the Windows one through
umu-run, Steam's Proton in its runtime (sniper), or Proton by itself (`electron/protonRunner.js`). Steam shortcuts point
at that script, so a game started from Steam gets the same settings.

## Adding one

1. Read the project: release files, the launcher's settings code, save folder, the game files it checks.
2. Write `electron/recipes/<id>.json`, then `node tools/recipes/index.js` (bundles every recipe into `index.json`).
3. `npm test` (`test/recipes.test.js` validates every recipe and checks the bundle).
4. Install it for real with its newest release and a dump folder shaped like the real one.
5. Commit. Users get it the next day without a release (the app reads `index.json` from `main` daily, a newer `rev` wins).

`tools/recipes/check.js` runs every night in CI (`.github/workflows/recipes-check.yml`) and opens an issue labelled
`recipes` when a project's newest release no longer has a file for one of its builds.

## The first five (17 Oct 2026)

Bloodborne (Supermedo/bloodborne_pc, Windows), Uncharted: The Nathan Drake Collection (Supermedo/uncharted_pc,
Windows, three starts), God of War III Remastered (FelipePrado0/gow3_pc, Linux AppImage and Windows), inFAMOUS Second
Son (HayatoG/iss_pc, Linux and Windows, needs update 1.07) and P.T. (LoreanXavier/pt-pc, Linux, its own installer).
