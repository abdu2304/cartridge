# DuckStation (PS1): a game's own settings

Reader: `tools/game-settings/readers/duckstation.js`. Source: `core/system.cpp` (`UpdateGameSettingsLayer`), `core/settings.cpp` (`Settings::Load`, enum spellings in its `s_*_names`), `core/fullscreenui_settings.cpp` (the per-game pages: names, help, choices; anything behind `if (!game_settings)` is global only).

## Where the file lives

`<DuckStation data folder>/gamesettings/<SERIAL>.ini` (for example `SLUS-00594.ini`), next to `settings.ini`.

## Format

An ini with DuckStation's sections (`[GPU]`, `[Display]`, `[CPU]`, `[Console]`...), only the keys that differ:

```ini
[GPU]
ResolutionScale = 4
```

Enums are DuckStation's names (`Auto`, `NTSC-U`...). Removing a key follows `settings.ini` again.
