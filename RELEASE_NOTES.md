## Cartridge 0.9.91 · More Ports

### New
- **Ten more Cartridge Verified PC ports.** Cartridge installs each one, takes your own copy from your library, writes the port's settings and starts it, as it does for Bloodborne:
  - **Dusklight** (Twilight Princess, from your GameCube or Wii disc), with its achievements.
  - **Ship of Harkinian** (Ocarina of Time) and **2 Ship 2 Harkinian** (Majora's Mask), from your N64 ROM. The first start builds the game's data from the ROM in a few seconds and asks once to start; after that it starts straight in.
  - **Shadow of the Colossus** (PS4). Its sound needs two modules from your own console, which Cartridge finds in shadPS4's sys_modules.
  - **DriveClub** (PS4 1.28), with its community patches, set in Cartridge.
  - **Wind Waker HD Recomp** (Wii U, from a Cemu archive or a disc image). The first setup builds the game on your PC, which takes a few minutes.
  - **JSRF Unleashed** (Jet Set Radio Future, Xbox). Cartridge unpacks your disc image itself, once.
  - **Super Mario Strikers** (GameCube).
  - **Unleashed Recompiled** (Sonic Unleashed, Xbox 360) and **SMS Launcher** (Super Mario Sunshine): their own window finishes the setup the first time, and Cartridge says what to do there. After that, Cartridge starts the game straight away.
- **GameCube and Wii copies kept as RVZ.** For ports that read ISO only (Strikers, SMS Launcher), Cartridge converts your copy once with Dolphin's own tool when Dolphin is installed.
- **Cloud saves for every PC port.** Saves already sync to RomM with the port's game; now port save folders are also shared through Syncthing, so a port whose game isn't in RomM keeps its saves in step too.

### Fixed
- **No "Allow Vita3K to check for updates?" question from Cartridge.** Vita3K's newest AppImage asks that from its second start on, and Cartridge's check that it starts made it ask out of nowhere. Programs Cartridge starts now have that question turned off (Cartridge updates your emulators itself).
- **Beta and Nightly builds are made again.** The script that stamps their version was never added, so no nightly has been built since 17 October and the Beta and Nightly update channels had nothing new.

### Not added
- **Project Reignition**: its releases after 0.4.2 aren't on GitHub.
- **Nebula** (Super Mario Galaxy): it installs through Proton, but the game needs a Windows file system feature Proton doesn't have.
