## Cartridge 0.9.61 · The Old Highlight

### Changed
- **Focus and chosen look as they did in 0.9.59.** The glow round focused cards and the tinted chosen states with a bar from 0.9.60 are gone: focused cards and tiles have their ring again, buttons and rows their fill, and chosen things their thin ring in your highlight colour.

### New
- **Dots on Console Spotlight,** the same as on Continue Playing, so you can see L1/R1 step through the console's games. With more than five games the lit dot walks round them.

### Fixed
- **Game names suggested as you type, everywhere.** When Cartridge's own keyboard isn't the one you type with (Steam's keyboard or a real one), the search box showed no suggestions. It now lists your game names as you type, the same way Cartridge's keyboard does; A on one fills it in.
- **PPSSPP game settings were wrong and in one long list.** Cartridge listed every key in PPSSPP's settings file, including ones PPSSPP ignores in a game's own file (like the graphics backend), all in one tab. It now lists only the settings PPSSPP really takes per game, with PPSSPP's own names and choices, in tabs: Graphics, CPU, Audio, Controls, System and General.
- **Dolphin game settings were missing most settings.** Dolphin's files only keep what you've changed, so Cartridge saw few of them. Every setting Dolphin takes per game is now listed, with Dolphin's own default beside each, in tabs: Graphics, Enhancements, Hacks, Core, Audio, Stereo 3D and Colour.
