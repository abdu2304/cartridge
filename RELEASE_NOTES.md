## Cartridge 0.9.86 · Played on a Real PC

### Fixed
- **Windows PC ports set up and start again.** Every Windows-only port (Uncharted, Bloodborne and the rest) failed at Set Up with "Proton couldn't make … Windows folder". Steam's newer Protons (Proton 11, Experimental, Hotfix) need a newer Steam runtime than the umu-launcher many systems ship can use. Cartridge now starts each Proton inside the Steam runtime it asks for, the way Steam does, so no download or network is needed. umu is only used when no Steam runtime is installed.
- **Cartridge Save Sync works with RomM 5.3.** RomM 5.3 changed how it takes saves, and Cartridge took that for an older RomM and quietly turned Save Sync off, while Settings still said it was on. It's back on.
- **Downloads carry on after Cartridge closes.** A download that was running when Cartridge closed (for example when leaving Game Mode) was forgotten, and its half-downloaded file was left behind. Unfinished downloads now start again the next time you open Cartridge, from where they stopped, on the same drive.
- **Games added to Steam automatically go in even when Steam was busy.** If Steam wasn't ready when a game or port was added, it waited for you to press Apply. Cartridge now tries again every minute, and at the next start.
- **PC ports find games you copied in yourself.** A PS4 game you put in a console folder by hand (not downloaded from RomM) is now offered to its port.
- **Game Settings for RetroArch games installed through EmuDeck.** Every RetroArch game said its settings weren't found, because EmuDeck's launcher runs the RetroArch Flatpak. The same fix covers Eden, Azahar, Cemu and Ryujinx Flatpaks behind EmuDeck's launchers.
- **Wii U and Xbox 360 saves are matched to their games**, so Save Sync and the save lists know which game a save belongs to.
- **Ports you added from a GitHub link before they became Cartridge Verified show up again** (for example "P.T. (From a Link)"), so you can update or remove them.
- **A big interface size no longer squeezes Cartridge.** A size picked for a TV in Game Mode left too little room in a desktop window, and Home's rows sat under the Dock. Cartridge now keeps at least the room it needs.
- **Shortcut Health finds a game that's in Steam twice**, and offers to remove the extra shortcut.
- **"Recommended for You" no longer breaks in the middle of a word** on Start.
- **A game moved to another folder keeps working with Re-download and package installs.**

### Changed
- **PC ports show as PC ports.** In Continue Playing, on Home, on Start and on the PC Ports page, a port has the Steam mark instead of its console's. Its game page's More has a PC Port tab with what fits a port (Play, Port Settings, versions and updates, Set Up Again, its folder, Steam, Play With) and nothing from the console's emulator.
- **Much less CPU on a 4K TV.** The slow drifts behind Home and Start, the clock's clouds and loading spinners made the whole screen redraw 120 times a second. They now move a few steps a second and look the same. Start and Home use about a quarter of what they did.
- **Cartridge goes quiet while a PC port runs**, as it does for other games, and comes back when it closes.
