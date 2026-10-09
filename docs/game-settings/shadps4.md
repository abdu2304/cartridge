# shadPS4 (PS4): a game's own settings

Reader: `tools/game-settings/readers/shadps4.js`. Source: `core/emulator_settings.cpp` (`EmulatorSettingsImpl::Load(serial)`, `ApplyGroupOverrides`), `core/emulator_settings.h` (each group's `GetOverrideableFields()`, types and defaults), the Qt launcher's settings dialog (names, help, choices, tabs).

## Where the file lives

`<shadPS4 user folder>/custom_configs/<SERIAL>.json` (for example `CUSA00001.json`), beside `config.json`.

## Format

JSON, one object per group, only the keys that differ, with real JSON types:

```json
{
  "General": { "extra_dmem_in_mbytes": 3000 },
  "GPU": { "fsr_enabled": true }
}
```

Only the keys each group lists as overridable are read; the others are left out of the list. Removing a key follows `config.json` again; an empty group is removed with it.
