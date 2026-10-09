# MAME (arcade): a game's own settings

Reader: `tools/game-settings/readers/mame.js`. Source: `src/emu/emuopts.cpp` and `emuopts.h` (core options and names), `src/osd/modules/lib/osdobj_common.cpp` and `.h` (OSD options), `src/osd/sdl/sdlopts.cpp` and `.h` (SDL options, `INI_PATH`), `src/frontend/mame/mameopts.cpp` (`parse_standard_inis`, `parse_one_ini`).

## Where the file lives

`<ini path>/<system>.ini`, for example `ini/sf2.ini`. MAME looks in every folder of its `inipath` option.

| Install | Folder |
| --- | --- |
| Distro package | usually `~/.mame/ini` (packages set `INI_PATH` to `$HOME/.mame;.;ini`); the global file is `~/.mame/mame.ini` |
| Flatpak (`org.mamedev.MAME`) | `~/.var/app/org.mamedev.MAME/.mame/ini` (its home is the sandbox data folder) |
| Self-built or portable | `ini/` next to where MAME runs (default `inipath` is `.;ini;ini/presets`) |

`mame.ini` itself may change `inipath`; read it first and use the first folder listed that exists. `mame -showconfig` prints the values in force.

## The game's name

The MAME short name of the system (the ROM set name without `.zip`), for example `sf2`, `mvsc`, `galaga`. Lower case.

## Format

Plain text, one option per line: the name, spaces, the value. `#` starts a comment. Booleans are `0`/`1`. Strings with spaces may be quoted.

```
# sf2.ini
keepaspect               1
waitvsync                1
joystick_deadzone        0.2
bgfx_screen_chains       crt-geom
```

Only options that differ need to be in the game's file. Unknown options are reported and skipped.

## How it layers

`mameopts.cpp` reads, each over the one before: `mame.ini`, `debug.ini` (with `-debug`), `vertical.ini` or `horizont.ini` (screen orientation), `<screen type>.ini` (for example `vector.ini`, `raster.ini`, `lcd.ini`), `source/<driver source>.ini`, the grandparent's and the parent's `<name>.ini`, then the system's own `<system>.ini`; the command line last. So the "own value" Cartridge shows is the same key in `mame.ini` (the reader's entries have no `base`: same key, other file), unless a closer ini sets it.

MAME only writes `<system>.ini` itself when `writeconfig` is on (on exit). If it is on, a game's ini is rewritten in full when the game exits; Cartridge should not write while that game runs.

## What the list leaves out

Paths and directories, file names for recording and playback, window and UI options, input providers and device mapping, networking, scripting, plugins and the HTTP server, and per-screen options (`screen0`, `resolution0` and so on). Logging, debugger and DRC options are under Advanced.
