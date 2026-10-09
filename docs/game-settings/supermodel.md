# Supermodel (Sega Model 3): a game's own settings

Reader: `tools/game-settings/readers/supermodel.js`. Source: `Src/OSD/SDL/Main.cpp` (`DefaultConfig()`: every setting, default, group, range and allowed values; `Help()` and the command-line tables for descriptions; the merge order in `main`), `Src/Util/ConfigBuilders.cpp` (`FromINIFile`, `MergeINISections`, `WriteINIFile`), `Src/Util/GenericValue.h` (`ParseBool`), `Src/OSD/Unix/FileSystemPath.cpp` (folders), `Src/OSD/SDL/Gui.cpp` (tabs), `Src/Inputs/InputSystem.h` (sensitivity defaults), `Docs/README.txt` section 10 and 12.

## Where the file lives

One file, `Supermodel.ini`, holds the global settings and every game's settings.

| Install | File |
| --- | --- |
| Portable (a `Config` folder in the folder Supermodel runs from) | `Config/Supermodel.ini` |
| `~/.supermodel` exists | `~/.supermodel/Config/Supermodel.ini` |
| Otherwise (newer builds) | `~/.config/supermodel/Config/Supermodel.ini` (or `$XDG_CONFIG_HOME/supermodel/Config/Supermodel.ini` when `~/.config/supermodel` doesn't exist) |
| Flatpak (`com.supermodel3.Supermodel`) | the same rules inside the sandbox; with no `~/.config/supermodel` it ends at `$XDG_CONFIG_HOME`, so `~/.var/app/com.supermodel3.Supermodel/config/supermodel/Config/Supermodel.ini` (not checked on a device) |

The checks are in that order (`FileSystemPath::GetPath`). EmuDeck runs Supermodel from its own folder, so look for a `Config` folder next to the program first.

## The game's name (the section name)

The MAME-style ROM set name in lower case, for example `scud`, `lostwsga`, `daytona2` (`supermodel -print-games` lists them).

## Format

```ini
[ Global ]
XResolution = 1280
YResolution = 960
WideScreen = 0

[ scud ]
XResolution = 1920
YResolution = 1080
WideScreen = 1
MusicVolume = 200
```

- `Name = Value`, `;` starts a comment (outside quotes). Spaces around names and values are trimmed; a value may be in double quotes.
- `[ name ]`: spaces inside the brackets are ignored. A header can list several games: `[ scud, scudp ]` applies to each. Settings before any header and `[ ]` belong to Global.
- Booleans: `0`/`1` (the README's form); `true`/`false`, `on`/`off`, `yes`/`no` are read too.
- Names are case sensitive.

## How it layers

`main`: `DefaultConfig()`, then the `[ Global ]` section, then the command line, then the game's section, then the command line again (`MergeINISections`). So a key missing from the game's section falls back to Global, and Global to the built-in default. The reader's entries carry `base: 'Global|<key>'`.

## Writing safely

Supermodel rewrites the whole file (comments lost) when inputs are configured (`-config-inputs`) or settings are saved from its GUI (`WriteINIFile`). Never write while Supermodel runs. Change only the game's section and keep the others as they are.

## What the list leaves out

Input mappings (`Input*` controls), the input system, file paths and shaders, full screen and window position, network ports and addresses, `Outputs*` (the README: Global only), logging. Debug dumps, the frame rate display, the legacy texture and sound options are under Advanced.
