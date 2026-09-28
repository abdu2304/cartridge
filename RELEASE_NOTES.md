## Cartridge 0.7.11 · Launch Fix

### Fixed
- **RetroArch and Xbox games should now start.** Games kept in a folder (multi-disc PS1, Dreamcast, cue/bin and m3u sets) were handed to the emulator as a folder, which RetroArch and xemu can't open. Cartridge now points the shortcut at the game file inside: the .m3u playlist, the .cue or .gdi, or the console's game file.
- **Shortcuts are written the way Steam ROM Manager writes them.** The emulator and its arguments go in Target, and Launch options stay empty, exactly like EmuDeck's own shortcuts (for example `"xemu-emu.sh" -full-screen -dvd_path "Sonic Riders.iso"`). Launch options are only used when something has to wrap the command. Games you already added show an **Update** button on their console page in Settings → Steam; press it to rewrite them.
- **PS3 games you added to Steam yourself are recognised.** RPCS3 shortcuts that start a game by its serial (`%RPCS3_GAMEID%:BCUS...`) now count as In Steam, and names match even when punctuation or ™ differ.

### New
- **Missing from Steam list.** Settings → Steam shows "N missing from Steam". It opens a list of every downloaded game with no shortcut, grouped by console. A adds one, X adds all.
- **PS Vita games installed in Vita3K.** Vita games must be installed inside Vita3K first (File → Install .pkg or .vpk). Once installed, Cartridge adds them to Steam and Vita3K starts them by title ID. Games not installed yet say so instead of making a shortcut that won't work.
- **Series show a picture** in their header, taken from their games.

### Changed
- **Tidier library toolbar.** Show and Sort are each one button with a menu. Surprise me, Select games and Get all are together under More.
- A highlighted game in a collection or series no longer covers the console heading above it.
