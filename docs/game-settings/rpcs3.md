# RPCS3 (PS3): a game's own settings

Reader: `tools/game-settings/readers/rpcs3.js`. Source: `rpcs3/Emu/system_config.h` (every node and its range), `Emu/System.cpp` (`BootGame` loads the game's file over `config.yml`), `system_config_types.cpp` (value spellings), the Qt settings dialog (`emu_settings_type.cpp`, `settings_dialog.cpp`/`.ui`, `emu_settings.cpp`, `tooltips.h`) for names, choices, help and tabs.

## Where the file lives

`<RPCS3 config>/config/custom_configs/config_<SERIAL>.yml`, beside `config/config.yml` (Cartridge finds the folder the game's RPCS3 uses: Flatpak `net.rpcs3.RPCS3`, `~/.config/rpcs3`, or a portable folder).

## Format

YAML with sections and nested sections, only the keys that differ from `config.yml`:

```yaml
Video:
  Renderer: Vulkan
  Vulkan:
    Asynchronous Texture Streaming: true
```

A section such as `Video/Vulkan` in the reader is a path: `Vulkan` under `Video`. Values are spelled as RPCS3 writes them (`Recompiler (LLVM)`, `true`). Taking a key out of the file puts the game back on `config.yml`'s value; an empty section is removed with it.
