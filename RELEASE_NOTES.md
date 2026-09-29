## Cartridge 0.8.2 · Fixes

### Fixed
- **Launch options are back where they were.** Target holds the emulator, and Launch options hold its settings and the game, with no `%command%` in front. `%command%` only appears after something that has to run first, like `vblank_mode=0`. Games already added show **Update** on their console page in Settings → Steam. With Steam reachable, Update changes them in place, so play time and collections stay.
- **LT and RT work straight away.** A trigger could read as half pressed until it was first used, so the first press did nothing. Triggers now go by how far they're pulled.
- **The highlight is back on Home and Library.** With reduced effects (Game Mode on a handheld), a selected game lost its accent ring.
- **Touch scrolls like a phone.** Swipes use the system's own scrolling, which follows your finger and glides smoothly. Touches that Game Mode sends as mouse clicks also scroll with momentum, and a swipe never opens a game by accident.
- **Snappier controls.** The controller is read every 8 ms instead of once per frame, scrolling after a press takes about 120 ms instead of about 320 ms, holding a direction repeats sooner and speeds up, the highlight appears instantly, and moving up and down keeps to your column.
- **Sharper backgrounds from SteamGridDB.** Full-size backgrounds (3840×1240 or 1920×620) are picked first, and the picker sorts by size and shows each image's size.

### New
- **Recently played across devices.** Your Steam play time is shared with RomM as play sessions from this device, and games played on your other devices show up in Recently played with that device's name (for example "Living Room PC"). Older RomM servers only get "last played".
- **Trophy filters.** On the Trophies page, Show picks a console, Sort orders by latest unlock, most or least complete, or name. **Hide from totals** (a game's More menu) takes a game out of your trophy counts, gamerscore and latest unlocks. Hidden brings them back.
- **Controller test.** Settings → About shows live button, trigger and stick values, and how touches arrive.

### Changed
- **This device's name moved to Settings → About.** It's used for trophies and for Recently played on your other devices, and it renames the device in RomM too.
- **QR pairing asks RomM for device access,** for Recently played across devices. If you paired before 0.8.2, pair again to use it.
