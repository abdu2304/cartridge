# PCSX2 (PS2): a game's own settings

Reader: `tools/game-settings/readers/pcsx2.js`. Source: `pcsx2/VMManager.cpp` (`UpdateGameSettingsLayer`: the game's file is a layer over `PCSX2.ini`), `pcsx2/Pcsx2Config.cpp` (`LoadSave`: every key and default), the Qt pages its per-game window shows (`pcsx2-qt/Settings/*`: names, help, choices).

## Where the file lives

`<PCSX2 folder>/gamesettings/<SERIAL>_<CRC>.ini` (`<CRC>.ini` without a serial), next to `inis/PCSX2.ini`.

## Format

An ini with PCSX2's own sections (`[EmuCore/GS]`, `[EmuCore/Speedhacks]`, `[EmuCore/Gamefixes]`, `[SPU2/Output]`...), only the keys that differ:

```ini
[EmuCore/GS]
upscale_multiplier = 3
VsyncEnable = true
```

Booleans `true`/`false`, enums as PCSX2 spells them. Removing a key follows `PCSX2.ini` again.
