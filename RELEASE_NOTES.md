## Cartridge 0.9.59 · Every Save, Found

### New
- **The save locator.** Cartridge now reads where each emulator keeps saves from the emulator's own settings, the same way the emulator reads them, instead of a fixed list of folders. It covers every layout each one has used:
  - **shadPS4:** current builds (`home/<user>/savedata`, or `home_dir` in config.json) and older builds (`savedata/<user>`, or `saveDataPath` in config.toml), portable copies and the Flatpak.
  - **Eden and the yuzu family:** `save_directory` and `nand_directory`, and portable `user` folders.
  - **RPCS3:** where `dev_hdd0` is set in vfs.yml.
  - **PCSX2 and DuckStation:** their memory card folder settings.
  - **Dolphin:** the Wii NAND folder, GCI folders and memory card files.
  - **Cemu:** the `mlc_path` folder.
  - **Azahar and Citra:** custom SD card storage.
  - **Vita3K:** its `pref-path`.
  - Save Sync and Syncthing both use it.
- **Where Your Saves Are** (Saves and Sync → Cartridge Save Sync): every place each emulator keeps saves, how many are there and how new, and why Cartridge looks there.
  - **In Use** folders are synced.
  - **Old Copy** folders (a layout the emulator no longer reads) are shown and left alone. Press **Move Into Use** to bring them over: when the save already in use is newer it stays, the save a copy replaces is backed up first, and the old copy is kept, renamed, never deleted.
- **Search for Saves** looks through your home folder and your other drives (microSD included) for save folders in unusual places, such as a portable emulator or a copy on another drive. It runs once by itself a few minutes after start, then whenever you press it. For a folder it finds, choose **Use This Folder** (that emulator really keeps saves there) or **Move Into Use**. It never syncs a found copy on its own.

### Fixed
- **PS4 saves weren't matched to their games.** shadPS4 names a save after the game's code (CUSA…), and Cartridge only knew a PS4 game's code when it was in the RomM file name. It now reads the code from the downloaded game itself (its `param.sfo`, or the header of a `.pkg`).
- **Saves matched by name only** now try a looser match when nothing else fits: "Bloodborne" finds "Bloodborne: The Old Hunters Edition". It only matches on the save's own console, and only when exactly one game fits.
- **Saves moved to another drive and linked back weren't found.** Cartridge treated a linked folder as "not a folder" when listing, so saves behind a link were skipped, on every emulator. Links are followed now, and a save behind a link is written where it really is, so the link stays.
- **A save matched a game of the same name on another console** (a PS4 save could land on a PS3 game). Names now match on the save's own console.
- **Two copies of one save** (a Flatpak and an AppImage of the same emulator): the newest is synced, and the game's save sheet names the other copy.
