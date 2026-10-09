# RetroArch: a game's own settings and core options

Readers: `tools/game-settings/readers/retroarch.js` (overrides) and `retroarchCores.js` (core options).

## Overrides

`<config dir>/config/<core name>/<content name>.cfg`, `key = "value"` lines over `retroarch.cfg` (and the core's own `<core name>/<core name>.cfg`). Source: `configuration.c` (`config_load_override`; the setting tables and defaults from `config.def.h`), `intl/msg_hash_us.h` (names and descriptions), `menu/menu_setting.c` (ranges and choice names). Only settings that make sense for one game: no paths, drivers, accounts, menu looks or binds.

The config dir is the one the game's RetroArch uses: a `retroarch.cfg` beside the program (portable or Steam's RetroArch), the Flatpak's `~/.var/app/org.libretro.RetroArch/config/retroarch`, else `~/.config/retroarch`.

The core name is the core's `library_name` (its libretro `.info` file's `corename`, for example `Snes9x`, `Beetle PSX HW`). The content name is the file RetroArch is given, without its extension (a disc list or descriptor in a folder first).

## Core options

`<config dir>/config/<core name>/<content name>.opt`, `key = "value"` lines (`runloop.c`, game-specific options), over the core's `<core name>/<core name>.opt` and the global `retroarch-core-options.cfg` (or `core_options_path`). The options are read from each core's own source: v2 definitions (`retro_core_option_v2_definition`: key, name, help, category, values, default; categories become tabs), v1 definitions, or the old `{"key", "Name; a|b|c"}` form (first value the default). 62 cores are covered. Not covered: cores that build their list at run time (FinalBurn Neo, MAME 2003-Plus) and a few with no options in their source (Opera, Mesen-S, NeoCD, melonDS DS, GW, Arduous, Beetle bsnes).

## What RetroArch needs

Nothing to turn on by default: `auto_overrides_enable` and `game_specific_options` are on unless you turned them off. Don't write while the game runs: RetroArch can save over the files when you leave it.
