# Xenia Canary (Xbox 360): a game's own settings

Reader: `tools/game-settings/readers/xenia.js`. Source (branch `canary_experimental`): `src/xenia/config.cc` (`LoadGameConfig`, `ReadGameConfig`, `SaveConfig`, `config_name`, `game_config_suffix`), `src/xenia/emulator.cc` (the title ID), `src/xenia/app/xenia_main.cc` (storage root), `src/xenia/base/filesystem_posix.cc` / `filesystem_win.cc` (`GetUserFolder`), `src/xenia/base/cvar.h` (the `DEFINE_*` macros) and every `DEFINE_bool/int32/uint32/uint64/int64/double/string(name, default, description, category)` in `src/` (the reader's `files` list; regenerate it with `grep -rlE '^\s*DEFINE_(bool|int32|uint32|uint64|int64|double|string)\(' src` on a sparse clone when Xenia adds a file).

## Where the file lives

`<storage root>/config/<TITLE ID>.config.toml`

| Install | Storage root |
| --- | --- |
| Linux build (AppImage, program) | `$XDG_DATA_HOME/Xenia`, else `~/.local/share/Xenia` |
| Windows build through Proton | the program's folder: the Windows build is portable by default (`DEFINE_transient_bool(portable, true, ...)` under `XE_PLATFORM_WIN32`) |
| Linux build, portable | the program's folder, when `portable.txt` is next to it or with `--portable` |
| Windows build run with `--portable=false` | `Documents/Xenia` (in the Proton prefix: `<prefix>/drive_c/users/steamuser/Documents/Xenia`) |

From `xenia_main.cc`: `storage_root` (a cvar, usually empty), else the program's folder if `portable` is true (default on Windows, false on Linux) or `portable.txt` exists, else `GetUserFolder()/Xenia`. So for `xenia_canary.exe` look next to the program first.

The main settings file is `<storage root>/xenia-canary.config.toml` (`config_name`; a `--config` path overrides it). Its tables and keys are the same as a game file's, so no `base` field is needed: a key's global value is the same `[Category]` and key in the main file.

## The file name

`fmt::format("{:08X}", title_id)`: 8 hex digits, upper case, then `.config.toml`. Example: `4D5307E6.config.toml`.

## Format

TOML. Each setting is `<category>.<name>`: a table per category, the cvar's name as the key. A category with a dot is a nested table:

```toml
[GPU]
draw_resolution_scale_x = 2
draw_resolution_scale_y = 2
readback_resolve = "fast"
render_target_path_vulkan = "fsi"

[GPU.Debug]
store_shaders = true

[Display]
postprocess_antialiasing = "fxaa"

[Kernel]
apply_title_update = true
```

Use `[GPU.Debug]` (a table `Debug` inside `GPU`): `ReadGameConfig` looks up `toml::path("GPU.Debug.store_shaders")`, which walks GPU, then Debug. Values: booleans `true`/`false`; integers plain; doubles with a decimal point (`1.0`); strings in double quotes. Entries with `str: true` came from `DEFINE_string` and must be written quoted, also when they are `enum`. `d` is the default as the code sets it (strings without quotes; `null` when computed). An entry with `os: 'windows'` only exists in the Windows build (Direct3D 12).

## Full copy or overrides

Overrides. `ReadGameConfig` walks every cvar and loads only those present in the file (`config.at_path(...)`); everything else keeps the main file's value. Cartridge writes only the keys it changes. Xenia never writes a game file itself.

Left out of the list: paths and storage (`Storage`, `Other`), the window and frontend (`UI`, `Win32`, `fullscreen`, `discord`...), profiles, devices (`vulkan_device`, `d3d12_adapter`, `keyboard_user_index`), `apu`/`gpu`/`hid` (chosen when the emulator starts, before a game file loads), `cpu` (does nothing) and ARM64 settings. Developer, logging and debugging settings are in Advanced.

## What makes Xenia use it

Nothing to turn on. `Emulator` calls `config::LoadGameConfig(title_id)` when the game's module loads, then runs the game config callbacks. Settings that only apply when a system is created at start-up are not changed by a game file.
