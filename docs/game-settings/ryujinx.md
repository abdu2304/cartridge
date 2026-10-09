# Ryujinx (Switch): a game's own settings

Reader: `tools/game-settings/readers/ryujinx.js`. Ryujinx (Ryubing) has per-game settings: right-click a game, "Edit game configuration" (`GameSpecificSettingsWindow`). Source (Ryubing, upstream git.ryujinx.app `ryubing/ryujinx`; the reader fetches the GitHub mirror `Leuconoe/Ryubing` because the forge refuses the container): `src/Ryujinx/Program.cs` (`GetDirGameUserConfig`, `ReloadConfig`), `src/Ryujinx/UI/ViewModels/MainWindowViewModel.cs` (`InitializeUserConfig`, `EditGameConfiguration`), `src/Ryujinx/UI/ViewModels/SettingsViewModel.cs` (`SaveSettings`, `DeleteConfigGame`), `src/Ryujinx/Systems/Configuration/ConfigurationFileFormat.cs` (keys and descriptions), `ConfigurationState.cs` (`ToFileFormat`, `LoadDefault`), `ConfigurationState.Model.cs`, `src/Ryujinx.Common/Utilities/JsonHelper.cs` (snake_case), `src/Ryujinx.Common/Configuration/AppDataManager.cs` (folders), `src/Ryujinx/Systems/AppLibrary/ApplicationData.cs` (`IdBaseString`), the enum files.

## Where the file lives

`<data dir>/games/<title ID>/Config.json`.

| Install | Data dir |
| --- | --- |
| Normal (AppImage, EmuDeck) | `$XDG_CONFIG_HOME/Ryujinx`, usually `~/.config/Ryujinx` (`ApplicationData` folder + `Ryujinx`) |
| Flatpak (`io.github.ryubing.Ryujinx`) | `~/.var/app/io.github.ryubing.Ryujinx/config/Ryujinx` |
| Portable | a `portable` folder next to the program |
| A data folder given on the command line (`AppDataManager.Initialize(baseDirPath)`) | that folder |

The global settings are `<data dir>/Config.json` (or a `Config.json` next to the program, which wins).

## The title ID

`IdBaseString`: the base title ID (ID & ~0x1FFF) as 16 lower-case hex digits, for example `01007ef00011e000`. The same folder holds the game's PPTC and shader caches.

## Format

**The game's file is a complete Config.json, not a list of changes.** When a game starts and `games/<ID>/Config.json` loads, Ryujinx uses it instead of the global file (`InitializeUserConfig`: `ConfigurationState.Instance.Load(...)`); the global file is only read in addition for input when `use_input_global_config` is true. Nothing falls back key by key. When the game's window saves, it writes the whole configuration (`ToFileFormat().SaveConfig`).

So to give a game its own settings, Cartridge must copy the global `Config.json` to `games/<ID>/Config.json` and change keys in the copy. To change one later, edit that file. Deleting it (what "Remove" in Ryujinx does) goes back to the global settings. A missing key is filled by Ryujinx's migration code or C#'s default, not the global value, so never write a partial file.

JSON as written by `JsonHelper`: indented, property names in snake_case (`ResScale` -> `res_scale`, `EnableMacroHLE` -> `enable_macro_hle`).

```json
{
  "version": 73,
  "res_scale": 2,
  "aspect_ratio": "Fixed16x9",
  "anti_aliasing": "SmaaHigh",
  "vsync_mode": 0,
  "docked_mode": true,
  "dram_size": 0,
  ...
}
```

Values:
- Booleans `true`/`false`, numbers as JSON numbers.
- Enums with `JsonStringEnumConverter` by name (`aspect_ratio`, `anti_aliasing`, `scaling_filter`, `backend_threading`, `graphics_backend`, `memory_manager_mode`, `audio_backend`, `system_language`, `system_region`); `vsync_mode` (0 Switch, 1 Unbounded, 2 Custom) and `dram_size` (0 4 GiB, 1 6 GiB, 2 8 GiB, 3 12 GiB, 4 to 6 dev layouts) as numbers.
- `res_scale`: 1 to 4, or -1 for `res_scale_custom`. `max_anisotropy`: -1 (game decides) or 2 to 16.

The "own value" Cartridge shows is the same key in the global `Config.json` (no `base` needed: same key, other file).

## Writing safely

Ryujinx rewrites the file it has loaded when settings are saved. Don't write the game's file while Ryujinx runs that game.

## What the list leaves out

Paths, game folders, the UI, hotkeys and controller mappings, multiplayer servers and passphrases, the GDB stub, dirty hacks (a nested object) and macOS-only options (hypervisor). Logging, FS checks and the tick scalar are under Advanced.
