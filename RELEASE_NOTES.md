## Cartridge 0.9.76 · Every Emulator Opens

### Fixed
- **Vita3K's sheet in Settings → Emulators didn't open** ("already on this device") when Vita3K was an AppImage in ~/Applications that Cartridge's background scan hadn't read yet, as after installing or updating it. Emulators in ~/Applications are now found by their name too, so the sheet opens straight away.
- **RetroArch's sheet never opened.** RetroArch (Flatpak or AppImage) now has its sheet like every other emulator: Open, Download Again, Online Play.
- **Emulators set up by EmuDeck that Cartridge only knew through their launcher** (Xenia, for example) had no sheet. They now open one with Open and their folders. Their updates and removal stay with EmuDeck, so Cartridge never offers to replace or delete its launcher.

### Changed
- **A new check before every release:** the app is started with emulators set up four ways (AppImages only, Flatpaks only, EmuDeck, nothing installed), and every emulator's card must open its sheet.
