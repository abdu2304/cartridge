## Cartridge 0.7.12 · Smoother

### Fixed
- **Games added to Steam no longer get `%command%` in their Launch options.** When Cartridge added a game while Steam was running, Steam filled in `%command%` by itself, and with the emulator's settings in Target that stopped RetroArch, Xbox, Xbox 360, 3DS and Dreamcast games from starting. Cartridge now checks what Steam saved after adding a game and clears it again.
- **Games already affected are fixed with Update.** Their console page in Settings → Steam shows Update; pressing it clears `%command%` in place, so play time and the shortcut stay as they are.

### Changed
- **Smoother moving around, most of all in Game Mode.** Rows, shelves and lists now scroll without redrawing the whole screen, the background is drawn in a way that is cheaper to show, and focusing a game no longer redraws its shadow on every frame in reduced effects mode. In tests without the GPU this cut the drawing work while moving around by about a third. Nothing looks different.
