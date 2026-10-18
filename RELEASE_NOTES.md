## Cartridge 0.9.84 · shadPS4 as a Flatpak

### Fixed
- **Game Settings and patches for PS4 games now work with the shadPS4 Flatpak.** Cartridge only looked for shadPS4's folder where the AppImage keeps it. With only the Flatpak installed, a PS4 game's Game Settings and Patches said "shadPS4 hasn't been started on this device yet", even after you'd started it. Cartridge now also finds the Flatpak's own folder.

### Changed
- **Three more checks run before every release.** They cover game settings for 14 emulators (each changed, read back and put back), add-ons installed into each emulator's own folders (and refused when they don't fit, and removed cleanly), and Linked Folders with a fork (PrimeHack and a shadPS4 fork), with the real app against a test server.
