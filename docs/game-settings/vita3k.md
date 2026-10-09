# Vita3K (PS Vita): a game's own settings

Reader: `tools/game-settings/readers/vita3k.js`. Vita3K calls them custom configs. Source: `vita3k/config/src/settings.cpp` (`get_custom_config_path`, `load_custom_config`, `save_custom_config`, `set_current_config`), `vita3k/config/include/config/config.h` (`CONFIG_INDIVIDUAL`/`CONFIG_VECTOR`: each setting's `config.yml` key and default), `vita3k/config/include/config/state.h` (`CurrentConfig`), `vita3k/app/src/app_init.cpp` (paths) and the Qt dialog `vita3k/gui-qt/src/settings_dialog.cpp`, `settings_dialog.ui`, `settings_dialog_tooltips.cpp` (names, tips, tabs, choices).

## Where the file lives

`<config path>/config/config_<TITLE ID>.xml`

The **config path** is not the **pref path**. The pref path (`pref-path` in `config.yml`) is the emulated Vita storage (`ux0/`, `vs0/`...); the custom configs live under the config path, next to `config.yml`.

| Install | Config path |
| --- | --- |
| Normal (AppImage, EmuDeck, program) | `$XDG_CONFIG_HOME/Vita3K`, else `~/.config/Vita3K` |
| Portable | a folder named `portable` next to the program (for an AppImage, next to the `.AppImage` file, `$APPIMAGE`) |

From `init_paths` in `app_init.cpp`: with `portable/` everything (config, `fs/`, cache) is in it; otherwise the Linux branch sets the config path from `XDG_CONFIG_HOME` or `~/.config` plus `Vita3K`. The default pref path is SDL's `~/.local/share/Vita3K/Vita3K/` unless `config.yml` sets `pref-path`. There is no Flathub Vita3K.

The main settings file is `<config path>/config.yml` (YAML, keys from `config.h`). Each entry's `base` is its key there.

## The file name

`config_<app path>.xml`, where the app path is the game's folder name in `ux0/app/`: the title ID, for example `config_PCSE00000.xml`.

## Format and the full skeleton

pugixml, tab indent. `save_custom_config` always writes the whole `CurrentConfig`, in this order:

```xml
<?xml version="1.0" encoding="utf-8"?>
<config>
	<core modules-mode="0">
		<lle-modules>
			<module>libfoo</module>
		</lle-modules>
	</core>
	<cpu cpu-opt="true" />
	<gpu backend-renderer="Vulkan" gpu-idx="0" high-accuracy="false" resolution-multiplier="1" disable-surface-sync="true" screen-filter="Bilinear" memory-mapping="double-buffer" v-sync="true" anisotropic-filtering="1" async-pipeline-compilation="true" import-textures="false" export-textures="false" export-as-png="true" fps-hack="false" shader-cache="true" spirv-shader="false" texture-cache="true" />
	<audio audio-backend="SDL" audio-volume="100" enable-ngs="true" />
	<system pstv-mode="false" sys-button="1" sys-lang="1" sys-date-format="2" sys-time-format="0">
		<ime-langs>
			<lang>4</lang>
		</ime-langs>
	</system>
	<emulator file-loading-delay="0" stretch-the-display-area="false" fullscreen-hd-res-pixel-perfect="false" />
	<debug log-active-shaders="false" log-uniforms="false" color-surface-debug="false" validation-layer="true" />
	<network psn-signed-in="false" />
</config>
```

An empty list is written as `<lle-modules />`. Attribute order within each element is as above. Values: booleans `true`/`false`; numbers plain; `resolution-multiplier` as pugixml writes a float (`%.9g`: `1`, `1.25`, `0.5`); strings as is. Android builds also write `custom-driver-name` on `<gpu>` (not on Linux).

Where each attribute's value comes from in `config.yml` (the `base` field): the same name for all but these:

| XML attribute | config.yml key |
| --- | --- |
| `enable-ngs` | `ngs-enable` |
| `stretch-the-display-area` | `stretch_the_display_area` |
| `fullscreen-hd-res-pixel-perfect` | `fullscreen_hd_res_pixel_perfect` |
| `psn-signed-in` | `psn-signed-in` (an int in config.yml; written `true`/`false` here) |
| `<lle-modules><module>` | `lle-modules` (YAML list of module names, one `<module>` each) |
| `<ime-langs><lang>` | `ime-langs` (YAML list of numbers, one `<lang>` each; empty means `[4]`, English US) |

`gpu-idx` (`gpu-idx` in config.yml) is the graphics device; the reader leaves it out of the list but the file must still carry it: copy it from `config.yml`.

## Full copy, not overrides

`set_current_config` copies the global values into `CurrentConfig`, then `load_custom_config` reads the file. A **missing element** keeps the global values, but inside a present element a **missing attribute reads as false or 0** (`as_bool()`, `as_int()`, empty string), except `shader-cache`, `texture-cache`, `validation-layer` (default true) and the `sys-*` ones (Vita3K's defaults). `<core>` present without `<lle-modules>` clears the module list. So Cartridge writes the whole file as above, every attribute it doesn't change copied from `config.yml`. A file that won't parse, or has no `<config>`, is deleted by Vita3K.

Choices worth knowing (from the dialog): `backend-renderer` OpenGL or Vulkan; `screen-filter` Nearest, Bilinear, Bicubic, FXAA, and FSR on Vulkan; `memory-mapping` disabled, double-buffer, external-host, page-table, native-buffer (the dialog lists only those the GPU supports); `resolution-multiplier` 0.5 to 8 in steps of 0.25; `anisotropic-filtering` 1, 2, 4, 8, 16; `export-as-png` true = PNG, false = DDS; `sys-button` 1 Cross, 0 Circle; `sys-lang` the index into the dialog's list (0 Japanese, 1 English US, ...); `modules-mode` 0 Automatic, 1 Auto and Manual, 2 Manual.

## What makes Vita3K use it

Nothing to turn on. When a game starts, `set_current_config(emuenv, title_id)` loads the file if it exists (`has_custom_config`). Settings Vita3K marks restart-required (CPU optimisations, renderer, device, accuracy, resolution, memory mapping, audio backend, validation layer) take effect on the next start of the game.
