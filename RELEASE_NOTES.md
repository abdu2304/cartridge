## Cartridge 0.9.77 · Every Button Pressed

The whole app was pressed through, button by button, with emulators set up four ways (AppImages only, Flatpaks only, EmuDeck, nothing installed): every tab, every Settings section and page, every emulator's sheet and what it opens, and a game's page and its More sheet for twelve consoles. This is what it found.

### Fixed
- **Home → Show all for consoles, collections and genres** switched tabs, so B didn't bring you back to Home. They open like every other Show all now, and B returns to the row you were on.
- **Emulators → Where They Go** was offered when emulators were already set up, and then every drive it listed was refused. It's shown only when Cartridge is setting emulators up from scratch.
- **Change Cover, Logo or Background without a SteamGridDB key** showed a red error pointing to the wrong place. It now says where the free key goes: Settings → Look & Feel → Metadata.

### Changed
- **New checks before every release:** the button-by-button sweep (`test/e2e/crawl.js`); a game from each of sixteen consoles downloaded and added to Steam in each emulator setup, with every shortcut read back to make sure it starts its emulator with its own file (`test/e2e/steam.js`); and Add to Favourites against a test RomM.
