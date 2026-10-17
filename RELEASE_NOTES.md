## Cartridge 0.9.70 · Cartridge Verified

### New
- **Cartridge Verified PC ports.** Recomps are now a short list Cartridge checks one game at a time, starting with five PS4 ports: Bloodborne, Uncharted: The Nathan Drake Collection, God of War III Remastered, inFAMOUS Second Son and P.T. For each one Cartridge installs the port, takes your own copy of the game from your library (or a folder you pick), writes the port's settings and starts it. Linux and Windows builds work the same way: Windows builds run through umu-launcher or Steam's own Proton, without Steam having to be open.
- **One state, one button.** Each port shows where it stands (Install, Your Copy, Set Up, Ready to Play, An Update Is Out, Repair) with the one thing to do next. Uncharted gets a Play button and a Steam shortcut for each of its three games.
- **Port settings in Cartridge.** Every setting from each port's own launcher (frame rate, resolution, upscaling, effects and more) is in Game Settings, saved where the port reads it, so starting from Steam uses them too.
- **inFAMOUS update put in place for you.** When update 1.07 is on your device, Cartridge lays it over the 1.00 game without copying or changing your files.
- **GSAP Motion (Test)** in Settings → Help and About: runs the cover's flight to the game page, Start's tiles while you arrange them and the welcome's opening on GSAP, to compare with Cartridge's own engine. Off by default.

### Changed
- **The researched list of 96 recomps is gone,** and so is the daily search for new ones. Recomps you installed from it stay, marked Unverified. Ports from a GitHub link still install as before, also marked Unverified.
- **New verified ports arrive without an update:** Cartridge reads the list once a day.

### Fixed
- Counts of one read in the plural in many places ("1 games", "Found 1 emulators", "1 minutes ago").
- A console card cut off its game count under a long console name; long names ran off game cards with no cover.
- A game whose screenshot and cover both failed to load showed a broken-picture icon across its page.
- Find a Setting: the "Steam + X" tip broke apart into columns.
- Settings → Games Folders: a folder's path ran into its free space.
- Screenshots on the game page, the game cover in the library and two pictures in Settings now have names for screen readers.
