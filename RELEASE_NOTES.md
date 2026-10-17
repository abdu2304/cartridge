## Cartridge 0.9.72 · Played and Fixed

Eight playtesters went through 0.9.71 in the real app, one area each, with PC ports first. This update fixes what they found. The full report is in docs/playtest-0.9.72.md.

### Changed
- **Ports go into Steam by themselves.** With Steam's automatic adding on, a Cartridge Verified port's shortcuts (one per game for Uncharted) are added once it's set up, as a downloaded game's are. The port's sheet has a Steam row saying whether it's in Steam, waiting for Apply, or not yet.
- **One toast after install and set-up,** instead of "is installed" then "is ready". Play says "Starting …", and Check for Updates says what it found.
- **The port list says "Get · You Have the Game"** for a port you haven't installed whose game is in your library (it said "Your Game").

### Fixed
- **A port that needs a game update** (inFAMOUS needs 1.07) said "pick the game again" and offered Set Up, which failed the same way. It now shows Needs Update with Pick the Update’s Folder, and lays the update over your copy as links.
- **When a port refused your copy** (P.T.'s installer finding no game data), the sheet still said your copy was picked. It now says That Copy Didn’t Work, with Pick Another Copy and Try Again.
- **Steam showed "1 change waiting" forever** for a game no longer on this device, and Apply only said "Nothing to apply". Apply now takes it off the list and says why.
- **Get Emulators showed RetroArch as not installed** when its Flatpak had no cores yet.
- **Settings → Online Play left focus on All Settings** with the controller; it now waits for the section's rows.
