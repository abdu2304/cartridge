## Cartridge 0.9.92 · Quick on Its Feet

### New
- **Switch 2 has its own console folder.** The Emulation folder Cartridge makes on a drive now has a `switch2` folder next to `switch`, and Switch 2 games from RomM download into it instead of being mixed with Switch games. No emulator plays Switch 2 games yet, so Cartridge says so on the game instead of offering one.

### Fixed
- **Settings → Emulators opens at once.** Its list waited for an answer from GitHub every time it was opened, a second at best and far longer on a slow connection or when GitHub was refusing requests. The list now shows straight away from what Cartridge already knows, and the check runs in the background.
- **Saves on This Device works again in a game's More.** The row did nothing when pressed.
- **A paused or failed download is still there after Cartridge restarts.** Pausing a big game and closing Cartridge lost it from Downloads and left its half-downloaded file behind. It now comes back as Paused or Failed, with Resume or Retry.
- **Cartridge no longer gets stuck thinking a game is running.** Starting a second game before the first was seen to close, when the second never opened, left library sync and Save Sync waiting for good. Two PC ports open at once are also followed properly now.

### Changed
- **Checking a big download no longer keeps Cartridge busy.** The checksum of a finished download is worked out in the background, so the rest of the app stays quick while a 40 GB game is checked.
- **Steam and port lists are lighter.** Steam's shortcuts file is read once per change instead of once per game or port in a list, and the list of running programs once per screen.
