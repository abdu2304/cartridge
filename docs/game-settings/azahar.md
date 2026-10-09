# Azahar (3DS): a game's own settings

Reader: `tools/game-settings/readers/azahar.js`. The same format is used by Lime3DS and Citra (Azahar is their successor and kept `citra_qt/configuration/config.cpp`); see "Citra and Lime3DS" below.

## Where the file lives

`<config dir>/custom/<TITLE ID>.ini`

| Install | Config dir |
| --- | --- |
| Normal (distro package, AppImage, EmuDeck) | `$XDG_CONFIG_HOME/azahar-emu`, usually `~/.config/azahar-emu` |
| Flatpak (`org.azahar_emu.Azahar`) | `~/.var/app/org.azahar_emu.Azahar/config/azahar-emu` |
| Portable | `user/config` when a folder named `user` exists in Azahar's **current working directory** at start |

From `common/file_util.cpp` (`SetUserPath`, Linux branch: `GetCurrentDir() + USERDATA_DIR`, else XDG with `EMU_DATA_DIR` "azahar-emu"). For an AppImage the portable folder is in the shortcut's Start in folder.

The main config, to read the current global values, is `qt-config.ini` in the same dir (`QtConfig` default name in `config.h`).

## The file name

`fmt::format("{:016X}", title_id)` (`citra_qt/citra_qt.cpp` at boot, `configure_per_game.cpp` in the dialog): 16 hex digits, upper case, then `.ini`. Example: `00040000001B5000.ini`. When the title ID is 0 (homebrew) the game's file name is used.

## Format

QSettings IniFormat. Sections are the `beginGroup` names in `QtConfig::Read*Values`: `[Core]`, `[Renderer]`, `[Layout]`, `[Audio]`, `[System]`, `[Utility]`. QSettings writes a key's `/` as `\`:

```ini
[Renderer]
resolution_factor\use_global=true
use_vsync\use_global=false
use_vsync=false
```

`resolution_factor` follows the global value. `use_vsync` is off for this game.

Values: booleans `true`/`false`; enums as numbers (the reader's `o`); integers as numbers; floats/doubles as Qt prints them (`100`, `0.5`, not `100.000000`); text as is (QSettings quotes it only when needed). `frame_limit` and `turbo_limit` are percentages, `0` means unlimited; `volume` is 0 to 1; `region_value` -1 is Auto-select.

## Setting a value for the game

In the setting's section write:

- `<key>\use_global=false`
- `<key>=<value>`

and remove `<key>\default` if it is there. A game's file is written without `\default` (`WriteBasicSetting` writes it only for the global file), but `ReadBasicSetting` honours it: `\default=true` would make Azahar ignore the value.

## Back to global

Write `<key>\use_global=true` and remove `<key>`. Removing both lines also works: `use_global` defaults to true.

## How Azahar loads it

- At boot `GMainWindow::BootGame` creates `QtConfig per_game_config(<ID>, PerGameConfig)` after the loader reads the title ID (`citra_qt.cpp`). `Initialize` -> `Reload()` = `ReadValues()` then `SaveValues()`, so the file is read and then rewritten in full (every per-game setting gets its `\use_global` line).
- `QtConfig::ReadValues` with `global == false` skips Controls, Camera, Data Storage, Miscellaneous, Debugging, Web Service and Video Dumping, and inside the other groups everything under `if (global)`. Only `ReadGlobalSetting` calls outside those blocks are per-game, and those are what the reader lists.
- `ReadGlobalSetting`: reads `<key>/use_global` (default true); only when false does it read the value.
- Azahar must not be running while Cartridge writes.

## What the reader leaves out

`UI\Paths\screenshot_path` (a path), `layouts_to_cycle` (a list, written as a QStringList), `render_3d_which_display` (Android only). The background colour (`bg_red/green/blue`, floats 0 to 1) has no control in the dialog and is in Advanced. CPU clock speed is on the Debug tab, so it is in Advanced too. `physical_device` is an index into the Vulkan devices found at run time.

## Citra and Lime3DS

- Same `custom/<TITLE ID>.ini`, same QSettings format and `use_global` lines. Config dirs: Lime3DS `~/.config/lime3ds-emu`, Citra `~/.config/citra-emu` (Flatpak `org.citra_emu.citra`: `~/.var/app/org.citra_emu.citra/config/citra-emu`). These names come from their own `common_paths.h`, not checked against every old build. Azahar looks for the old Citra and Lime3DS folders (`LegacyCitraConfigDir`, `LegacyLime3DSConfigDir`) to move them over.
- Older Citra and Lime3DS builds have fewer per-game settings (Azahar added some, for example `turbo_limit`, `simulate_3ds_gpu_timings`, texture sampling and the online LLE modules toggle). Not checked against their source: read their `config.cpp` before offering this list for them. An unknown key is ignored, so an Azahar-only key in Citra's file does nothing.
