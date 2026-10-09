# Flycast (Dreamcast, Naomi, Atomiswave): a game's own settings

Reader: `tools/game-settings/readers/flycast.js`. Source: `core/cfg/option.h` (`Option<T, PerGameOption>`, `load()`, `save()`, `Settings`), `core/cfg/option.cpp` (every option, its name, section and default), `core/cfg/cfg.cpp` (`open`, load/save helpers), `core/cfg/ini.cpp` and `core/cfg/ini.h` (file format, value spelling), `core/emulator.cpp` (`loadGameSpecificSettings`), `core/hw/naomi/naomi_cart.cpp` (arcade game IDs), `core/linux-dist/main.cpp` (folders), `core/nullDC.cpp` (`SaveSettings`), `core/ui/settings*.cpp` (names, help, choices, tabs), `core/types.h` (`RenderType`).

## Where the file lives

There is no separate file. **A game's settings are a section inside the main `emu.cfg`**, named after the game's ID.

| Install | File |
| --- | --- |
| Normal (distro package, AppImage, EmuDeck's AppImage) | `$XDG_CONFIG_HOME/flycast/emu.cfg`, usually `~/.config/flycast/emu.cfg` (`find_user_config_dir`) |
| Flatpak (`org.flycast.Flycast`, what EmuDeck installs by default) | `~/.var/app/org.flycast.Flycast/config/flycast/emu.cfg` |
| Portable | none on Linux: the Linux build always uses the XDG folder. Read-only fallbacks (`$XDG_CONFIG_DIRS/flycast`, `/etc/flycast`, `/etc/xdg/flycast`) are only read when the user file is missing. |

## The game's ID (the section name)

- Dreamcast discs: the product number from the disc's IP.BIN header (`ip_meta.product_number`), trailing spaces trimmed, cut at the first NUL (`loadGameSpecificSettings`). Examples: `T13008D 05`, `MK-51052`, `HDR-0076`. Spaces inside are kept.
- Naomi, Naomi 2, Atomiswave, System SP: the game title from the cartridge's boot ID (`bootId.gameTitle`, 32 characters, trailing spaces trimmed), for example `INITIAL D Ver.2`; a few have better names set in code (`SEGA DRIVING SIMULATOR`, `DRAGON TREASURE 2`). When there is no boot ID the ROM set name (`game->name`, for example `mvsc2`) is used.
- No ID: no per-game settings.

Cartridge can read the ID the same way (IP.BIN at the start of the disc's data track), or match an existing section name.

## Format

An ini (`IniFile`): `[section]`, `name = value`, `;` comments. Sections are kept in a sorted map, and `save()` writes every section and entry back sorted, so comments and order are not kept.

Each option has a section (default `config`) and a name that may itself contain dots. Its global value is `[<section>] <name>`; its per-game value is `[<game ID>] <section>.<name>` (`option.h`: `doLoad(settings.gameId, section + "." + name)`). So a reader entry has:

- `s`: the option's section (`config`, `audio`, `network`, `input`)
- `k`: the key as written in the game's section, for example `config.rend.Resolution`
- `base`: where the global value lives, `config|rend.Resolution` (section `config`, key `rend.Resolution`)

Example:

```ini
[config]
pvr.rend = 4
rend.Resolution = 480
rend.WideScreen = no

[audio]
VmuSound = no

[MK-51052]
config.rend.Resolution = 1440
config.rend.WideScreen = yes
audio.VmuSound = yes
```

Values (`ini.h` `set()`):
- Booleans are written `yes`/`no` (read also as `true`/`false`, `1`/`0`, any case).
- Integers with `std::to_string` (for example `536870912` for `rend.PixelBufferSize`).
- Floats with precision 7, classic locale (`1`, `0.5`).
- Enum options are integers. `pvr.rend`: `0` OpenGL, `3` OpenGL per pixel, `4` Vulkan, `5` Vulkan per pixel.

## How it layers

1. At start `Settings::load(false)` reads every option from its global place.
2. When a game loads, `loadSpecialSettings()` may force a few options for known games (these are "overridden" and only saved per game).
3. If `emu.cfg` has a section named after the game's ID, `Settings::load(true)` reads every per-game option from that section, falling back to the global value for keys that are missing (the global value is the default in `doLoad`).

Only options declared `Option<T>` (per game) are read from the game's section. `Option<T, false>` ones (paths, box art, UI scaling, theme, Discord) never are. When Flycast saves per-game settings it deletes any per-game key equal to the global value, and turning per-game settings off deletes the whole section.

## Writing safely

- Touch only the game's own section; leave every other section and key exactly as it is. Create the section if it isn't there (an empty `[<game ID>]` section already makes Flycast treat the game as having its own settings).
- **Flycast holds the whole file in memory and rewrites all of it** whenever it saves (`SaveSettings()`: leaving the settings screen, changing the save slot, first setup; each `set` also autosaves while autosave is on). A change Cartridge writes while Flycast is running is lost. Never write `emu.cfg` while Flycast runs.
- Write the value in Flycast's spelling (`yes`/`no` for booleans).

## What the list leaves out

Paths, controller devices and ports, the audio driver, network servers and accounts, RetroAchievements login, UI options, and Android-only options (virtual gamepad, frame pacing, auto latency). Debug and profiler options are under Advanced.
