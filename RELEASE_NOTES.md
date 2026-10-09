## Cartridge 0.9.63 · The Right Version

### New
- **Choose which files to download.** A game made of several separate files in RomM (P.T.'s .pkg and .zip, a game and its update, discs) asks which you want before downloading. Nothing starts ticked, Select All picks everything, and each file shows what it is and its size. Folder games such as PS3 games always come whole.
- **Xenia Canary patches.** Xbox 360 games get a Patches tab in Game Add-ons, from xenia-canary/game-patches: the same system as RPCS3 and shadPS4. Patches download into Xenia's own patches folder, an update keeps the ones you had on, and files you put there yourself are never replaced. Each patch is listed under the build it's for (Base Game, Title Update 1 and so on).
- **Game Settings follow the version you have.** Each emulator's settings are now read from its last four releases too, not only its newest code, and Cartridge uses the release you have installed. Eden 0.2.0 now shows GPU Mode as Fast, Balanced and Accurate, as it does itself; before, picking Accurate set Balanced. When Cartridge can't tell which version you have, settings whose choices differ between versions are shown but locked, with a note to change them in the emulator.
- **Repair for RPCS3's settings file.** If RPCS3 says "Failed to load global config ... illegal map value", an older EmuDeck left two lines joined in its config.yml. Settings → Emulators → Issues shows it, and Repair removes only that text, after a backup. Any other damage is shown with where it is, never changed.

### Changed
- **One row of tabs.** Game Settings, Game Add-ons and the game page's More now keep their tabs on one row that scrolls. The chosen tab always stays in view, and the edge fades where more tabs continue.
- **Cemu's Game Add-ons tabs appear once, already counted.** Before, every group showed and then the empty ones vanished as soon as you pressed R1.
- **Cartridge records more about how it's doing.** Its log now has a line every few minutes (every minute while a game runs) with its memory, the system's free memory and load, and slow steps by name. Vita3K's log is copied every 30 seconds while a Vita game runs. A freeze that takes the whole system down now leaves a trail.
- **Every failed download or install says why in the log**, and network errors name the site that couldn't be reached.

### Fixed
- **Cartridge froze for about 18 seconds every half hour.** Save Sync re-read and fingerprinted every save on each sync, all at once on the part of Cartridge that draws the window. It now remembers each file's fingerprint and only reads what changed, a little at a time. In a test with 400 saves the longest pause went from about 0.9 seconds (far more on a slow external drive) to 10 ms.
- **A short stall every minute.** The trophy watcher checked every trophy file's date every 8 seconds in a way that blocked the window. It no longer blocks.
- **A save too big for your server was retried every 30 minutes forever** ("RomM error 413"). Cartridge now tries the server's other address (home or away), remembers the one that takes big saves, and otherwise says plainly that the web server or tunnel in front of RomM limits upload size. It doesn't try that save again until it changes, or until you press Sync Now.
- **RPCS3 game settings did nothing.** On Linux RPCS3 reads a game's settings beside its config.yml, but Cartridge saved them in a config/ folder only Windows uses. The same was true of RPCS3's recommended settings Cartridge adds after a download, and of the patch switches when RPCS3 hadn't made its own file yet. They're saved in the right place now, and files already saved in the wrong place are moved across, never over RPCS3's own.
- **Mario Tennis Ultra Smash and other .wua games: "couldn't read this game's title ID".** Cartridge now reads the title IDs inside a .wua file directly, so Game Settings and Cemu's graphic packs work for them.
- **PCSX2's Game Settings took long to open.** A disc's serial and CRC are read once and remembered, and matching against PCSX2's game list no longer looks up every game on disk.
- **Your Lime3DS copy could be overwritten with Azahar** by an emulator update. Lime3DS and Citra are their own programs, with their own settings and saves, and both projects have ended, so their copies are no longer updated. A copy Cartridge already replaced still has your Lime3DS settings and saves in their own folder.
- **Where Your Saves Are could list your saves twice.** Bazzite mounts the system drive a second time under /run/media/system, so the search found the same saves there. Folders are now told apart by the disk's own file number. The search also stops when a game starts.
- **KytyPS5 just said "Try again".** A short download is now fetched once more by itself, and the message says what happened (how much arrived, or what the download held).
- **Game Settings showed an error when closed while loading** (and two other windows could do the same).
- **The emulator update check, the PS1 and PS2 name lists and Linked Folders' check ran twice at the same moment.** Each now runs once.
- **DuckStation's version showed as "latest".** A rolling release with no number is named by its build date.
