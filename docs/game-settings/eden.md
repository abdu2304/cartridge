# Eden (Switch): a game's own settings

Reader: `tools/game-settings/readers/eden.js`. The same file format is used by Citron and yuzu (all three share yuzu's `frontend_common/config.cpp`); see "Citron and yuzu" below.

## Where the file lives

`<config dir>/custom/<TITLE ID>.ini`

| Install | Config dir |
| --- | --- |
| Normal (distro package, AppImage, EmuDeck) | `$XDG_CONFIG_HOME/eden`, usually `~/.config/eden` |
| Flatpak (`dev.eden_emu.eden`) | `~/.var/app/dev.eden_emu.eden/config/eden` |
| Portable | `user/config` when a folder named `user` exists in Eden's **current working directory** (not the program's folder) at start |

Portable is decided in `common/fs/path_util.cpp` (`GetCurrentDir() / PORTABLE_DIR`, `PORTABLE_DIR` = "user"). For an AppImage that means the Start in folder of the shortcut, so check `<Start in>/user/config` before `~/.config/eden`.

The main config, to read the current global values, is `qt-config.ini` in the same config dir (`QtConfig` default name). Same sections and keys as below, every key with `\default`.

## The file name

`fmt::format("{:016X}", title_id)` (`yuzu/configuration/configure_per_game.cpp`, `yuzu/main_window.cpp`): 16 hex digits, upper case, zero padded, then `.ini`. Example: `0100F2C0115B6000.ini`. It is the program ID the loader reads (`ReadProgramId`), so the base game's ID, not an update's. Only when the ID is 0 is the game's file name used instead.

## Format

SimpleIni (not QSettings). Sections are the setting's category name (`Settings::TranslateCategory`): `[Audio]`, `[Core]`, `[Cpu]`, `[Renderer]`, `[System]`, `[LibraryApplet]`, `[Controls]`, `[Debugging]`, and Network settings are written under `[Services]`. Keys are the setting's label; a nested key separator is a backslash, and spaces would be `%20` (`Config::AdjustKey`; no per-game key has one).

Each switchable setting has up to three lines (`Config::WriteSettingGeneric`):

```ini
[Renderer]
resolution_setup\use_global=true
use_vsync\use_global=false
use_vsync\default=false
use_vsync=1
```

`resolution_setup` follows the global value. `use_vsync` is set for this game to 1 (Mailbox).

Values: booleans `true`/`false`; enums as their number (`std::to_string` of the underlying value, see each entry's `o`); integers as numbers; floats with six decimals (`fmt "{:f}"`); text as is.

## Setting a value for the game

In the setting's section write:

- `<key>\use_global=false`
- `<key>\default=false` (or `true` when the value equals the setting's default; any `true` makes Eden ignore the value and use the default: `ReadSettingGeneric` calls `LoadString("")`)
- `<key>=<value>`

Safest is always `\default=false` with the value, since a value equal to the default then still reads back correctly.

## Back to global

Write `<key>\use_global=true` and remove `<key>\default` and `<key>`. Removing all three lines also works: `use_global` defaults to true when missing (`ReadBooleanSetting(..., true)`).

## How Eden loads it

- At game start, `MainWindow` creates `QtConfig per_game_config(<ID>, PerGameConfig)` (`yuzu/main_window.cpp`). `Config::Initialize` -> `Reload()` = `ReadValues()` then `SaveValues()`, so Eden reads the file and then rewrites it in full: every switchable setting gets a `\use_global` line. Cartridge's lines survive (they are read first), but key order and spacing change.
- `Config::ReadValues` with `global == false` skips Data Storage, Disabled Add-ons, Services, Web Service and Miscellaneous; in Debugging it reads only `program_args` and `debug_knobs`.
- `ReadSettingGeneric` skips non-switchable settings and settings with `save = false` in a game's file. Only `SwitchableSetting` members of `common/settings.h` are in the reader's list.
- The values stay until the game stops: `Settings::RestoreGlobalState`.
- Eden must not be running while Cartridge writes (it rewrites the file when the per-game dialog closes).

## What the reader leaves out

Paths, audio devices, the Vulkan device, program arguments, `cpu_backend` and the `nce_*` settings (NCE exists only on arm64; an x86-64 build has only Dynarmic), Android, overlay and GPU driver categories (not read on desktop), UI settings (`UISettings` is never read from a game's file), and player/input profiles (`player_<n>_profile_name` in `[Controls]`, written by the per-game Input Profiles tab, are input).

Settings with no name in Eden's UI (`use_speed_limit`, `custom_rtc_enabled`, frame generation and a few more) are named from their key. Debug settings and the background colour are in Advanced.

## Citron and yuzu

- Same file format, `use_global` / `default` flags, title ID spelling and `custom/` folder. Config dirs: Citron `~/.config/citron`, yuzu `~/.config/yuzu` (Flatpak `org.yuzu_emu.yuzu`: `~/.var/app/org.yuzu_emu.yuzu/config/yuzu`). Portable `user` folder rule is the same.
- yuzu builds before early 2024 used QSettings for this file; the lines look the same (`key\use_global=false`), strings may be quoted.
- **Enum numbers are not shared.** Eden changed several enums: for example `GpuAccuracy` is `Low, High` in Eden but `Normal, High, Extreme` in yuzu, and `ResolutionSetup` starts with `Res1_4X` in Eden. Eden also added settings yuzu and Citron don't know (`fast_cpu_time`, `dma_accuracy`, GPU unswizzle, `frame_pacing_mode` and more). An unknown key is ignored by the other emulators, but a number must come from that emulator's own `settings_enums.h`. Do not apply Eden's list to Citron or yuzu without a reader for their source.
- Eden migrates Citron, Sudachi, yuzu and suyu folders on first start (`LEGACY_PATH` in path_util.cpp), so an old `custom/` may have been copied into Eden's.
