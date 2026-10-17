## Cartridge 0.9.74 · Unpacked Again

### Fixed
- **PS4 games stored in RomM as a folder weren't unpacked.** A game whose zip sits in its own folder on the server, or a game and its update as two zips, came down still zipped. Each zip is now unpacked after the download: one zip into the game's folder, several each into a folder named after it.
- **PS3, PS2 and other disc-era games came down still zipped.** Games for consoles whose emulators can't play from an archive (PS3, PS2, PSP, PS1, Wii U, Wii, GameCube, Switch, Xbox, Xbox 360, 3DS, Dreamcast, Saturn, Sega CD) are now unpacked after the download too, from zip, 7z or rar. A zip holding a single file (an ISO, an NSP) becomes that file beside your other games; a zip holding a folder becomes that folder. The archive is deleted once everything is out, and kept if unpacking fails.
- Cartridge-based consoles and arcade games stay zipped: RetroArch and MAME read those archives themselves.
