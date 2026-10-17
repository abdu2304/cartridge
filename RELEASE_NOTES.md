## Cartridge 0.9.71 · Every Promise Kept

### New
- **Update channels.** Settings → Downloads and Updates → Cartridge Updates has an Update Channel: Stable (the default), Beta (new things before they're released, every few days) or Nightly (built every night from the newest work, for testing). Choose a Version lists every release of each channel, so you can go back to any one.
- **Safe start and settings backups.** If Cartridge closes unexpectedly twice in a row as it starts, it opens once with plain looks and tells you, so you can keep them or go back to your own. Your settings are backed up before every update (ten kept): Help and About → Your Settings puts one back, saves your settings to a file or loads them from one (sign-ins and keys are left out of the file).
- **Settings as cards.** Settings opens on a card for each section, each saying where it stands (connected, updates waiting, Save Sync on, your style and colour, the update channel). A opens one across the whole screen; B comes back to the cards.
- **Two backgrounds drawn by the graphics chip:** Aurora Veil (curtains of light along the top edge) and Horizon Grid (a floor of lines rolling to a low sun), both in your theme colour. Without the graphics chip they fall back to Aurora and Tide.
- **Play With.** A game that has a Cartridge Verified PC port can be played either way: Play With on its page picks the emulator or the port, and the main button follows your choice.
- **Trophies from PC ports.** Bloodborne, Uncharted, God of War III and inFAMOUS show what you unlock in Achievements, named from your own copy of the game when Cartridge finds its trophy key, else from the port's list.
- **Cheats for more consoles.** Game Add-ons → Cheats for Switch games (Eden and its family, Ryujinx) from the Switch cheat database, and for older consoles played through RetroArch from the libretro cheat database. Pick the cheats you want; Cartridge writes them where the emulator reads them.
- **Games on several drives, finished.** A drive per console (Storage → Drive per Console), Move to Another Drive in a game's More → Options with its Steam shortcut following, games on an unplugged drive shown as "On <drive>, which isn't plugged in" instead of not downloaded, and Emulator Storage in Storage with how much each emulator's folders hold.
- **A Saves widget for Start:** how many saves are synced, when, and anything waiting on you.
- **More Online Play settings:** Eden's lobby server, web service token and network adapter; Azahar's room token; Ryujinx's connection through the server, network adapter and games' internet access; listing your Dolphin sessions in its lobby.
- **PC Ports in the Library:** a Has a PC Port filter in Show, and PC Ports in More.

### Changed
- **Cartridge Verified ports show the game's cover,** or the project's own picture when the game isn't in your library, instead of a controller icon. A port played through by Cartridge's author is marked Played.
- **Uncharted's sheet has one Play button;** LB/RB (or a tap on the game's name) picks which of the three games.
- **Games with no cover** show their name once, under the card.
- **The Quick Menu** is as tall as what it holds, with no gap above Quit.
- **Port downloads are checked** against the file GitHub publishes, and thrown away if they don't match.
- **Windows PC ports are started once after an update,** through Proton, before the update is kept (Linux builds already were).
- **The list of emulator forks** (PrimeHack, Slippi, BB Launcher and others) now comes from Cartridge's repository once a day, so new forks are known without an update.

### Fixed
- The show-password button in text fields had no name for screen readers.
- Help and About showed an empty Data folder before Cartridge had reported it.
