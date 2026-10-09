# Cemu (Wii U): a game's own settings

Reader: `tools/game-settings/readers/cemu.js`. Cemu calls them game profiles. Source: `src/Cafe/GameProfile/GameProfile.cpp` (`GameProfile::Load`, `GameProfile::Save`), `src/Cafe/GameProfile/GameProfile.h`, `src/config/CemuConfig.h` (enum spellings), `src/gui/wxgui/GameProfileWindow.cpp` (names, tips), `src/gui/wxgui/CemuApp.cpp` (`DeterminePaths`), `src/config/ActiveSettings.cpp`.

## Where the file lives

`<config dir>/gameProfiles/<title ID>.ini` (`ActiveSettings::GetConfigPath("gameProfiles/{:016x}.ini", title_id)`).

| Install | Config dir |
| --- | --- |
| Normal (distro package, AppImage, EmuDeck) | `$XDG_CONFIG_HOME/Cemu`, usually `~/.config/Cemu` |
| Flatpak (`info.cemu.Cemu`) | `~/.var/app/info.cemu.Cemu/config/Cemu` |
| Portable | a folder named `portable` next to the program; for an AppImage, next to the `.AppImage` file (`$APPIMAGE`), only in builds made with `CEMU_ALLOW_PORTABLE` |

The main settings file, to read current global values, is `settings.xml` in the same config dir.

Cemu also ships community profiles in its data dir: `<data dir>/gameProfiles/default/<title ID>.ini` (for an AppImage this is inside the image; for a distro package usually `/usr/share/Cemu`). **Load reads the user file if it exists and the shipped one only when it doesn't.** The two are not merged: once a user profile exists, the shipped profile is ignored completely. So when Cartridge creates a game's file it should start from the shipped profile if there is one, then change keys.

## The file name

`{:016x}`: the title ID as 16 hex digits, **lower case**. Example: `00050000101c9500.ini`. Use the base game's title ID (the foreground title, `CafeSystem::GetForegroundTitleId()`).

## Format

A plain ini read by Cemu's own `IniParser`. Section names compare case-insensitively. An optional first line `# <game name>` is read as the game's name and written back. Save writes:

```ini
# The Legend of Zelda: Breath of the Wild

[General]
loadSharedLibraries = true
startWithPadView = false

[CPU]
cpuMode = Multi-core recompiler
threadQuantum = 45000

[Graphics]
accurateShaderMul = true
graphics_api = 1

[Controller]
controller1 = MyProfile
```

Values:
- Booleans: `true`/`false` (Load also takes `1`/`0`, any case).
- `cpuMode`: the names from `fmt::formatter<CPUMode>`: `Single-core interpreter`, `Single-core recompiler`, `Multi-core recompiler`, `Auto` (Load also takes the number 0, 1, 3, 4 and the old names). The global settings have no CPU mode; unset means Auto (4 or more cores: multi-core).
- `threadQuantum`: 1000 to 536870912; the window offers 20000, 45000, 60000, 80000, 100000; default 45000.
- `graphics_api`: `0` OpenGL, `1` Vulkan (Load accepts only 0..1). Unset means the global `settings.xml` value `<content><Graphic><api>` (entry `base: 'Graphic.api'`).
- `accurateShaderMul`: `true`/`false`, default true.
- `controllerN`: the name of a controller profile in `<config dir>/controllerProfiles/` (file name without `.xml`).

## Full copy or overrides

Overrides, with two catches. Keys missing from the file use the global value (`graphics_api`, `cpuMode`) or the built-in default (the rest). But Cemu's own Save always writes `startWithPadView`, `threadQuantum` and `accurateShaderMul`, so saving from Cemu's window pins them. Cartridge can write only the keys it changes.

Left out on purpose: `disableAudio` (read but never used: `IsAudioDisabled` has no caller), `precompiledShaders` (read, but `ActiveSettings::GetPrecompiledShadersOption` always returns Auto), and the Metal options (`shaderFastMath`, `metalBufferCacheMode2`, `positionInvariance2`, macOS only).

## What makes Cemu use it

Nothing to turn on. `gameProfile_load()` runs when a game boots and reads the file for that title ID.
