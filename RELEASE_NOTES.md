## Cartridge 0.9.62 · Every Game's Settings

### New
- **Game Settings for every emulator that has settings of a game's own.** As with PPSSPP and Dolphin in 0.9.61, each list is read from the emulator's own source code: only the settings the emulator really takes for one game, with its own names, choices, descriptions and defaults, in tabs.
  - **Now covered:** Eden (Switch), Ryujinx (Switch), Azahar (3DS), Cemu (Wii U), Vita3K (PS Vita), Xenia Canary (Xbox 360), Flycast (Dreamcast and Naomi), MAME, Supermodel (Model 3) and RetroArch.
  - **RetroArch:** the game's own RetroArch settings and its core's own options together, for 62 cores (Snes9x, Genesis Plus GX, Beetle PSX, SwanStation, Mupen64Plus-Next, Flycast, mGBA and more).
  - **Fuller lists:** RPCS3, PCSX2, DuckStation and shadPS4 now show every setting they take per game, not just a few.
- **Advanced tab.** Each emulator's debug, logging and expert settings are kept in one Advanced tab at the end, with a note that some of them can stop a game starting.
- **Type any number.** A setting that takes a number lets you type it, within the emulator's own range ("100 to 300"); a number outside it is refused with the range.
- **What a setting does.** Each setting's description shows when you pick it, and when you hold A on its row.
- **Game Settings on every installed game.** The game page offers it for every installed game. It uses the emulator the game launches with (a PS1 game in a RetroArch core gets the core's settings), and says plainly when that emulator has no settings of a game's own.
- **Xbox 360 title IDs** are read from the game itself (its disc image, default.xex or Games on Demand package), and Dreamcast product numbers from the disc.

### Changed
- **One tab order for every emulator:** Graphics first, Advanced last, Cartridge's own Steam tab just before it.
- **Every emulator Cartridge writes to is checked first.** Nothing is written while the game's emulator is open (it would save over the change when it closes).

### Fixed
- **Cemu's graphic packs and settings could be changed while Cemu was open.** It's now refused like the others.
