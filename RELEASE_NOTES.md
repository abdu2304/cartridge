## Cartridge 0.9.68 · Set Up Right

### Changed
- **Recomps with their own setup set themselves up.** Recomps that ask for your game in their own menu or setup wizard (Zelda 64: Recompiled and most N64 recomps) no longer have a Set Up With Your Game step in Cartridge. Open starts them, and you follow their own steps the first time. Cartridge sees when they're set up, or you press It's Set Up for the ones it can't see.
- **The Steam card's controller is drawn like the console pictures.** On the Steam card in Consoles, the Steam Controller is now a lit, shaded drawing on Steam blue, like the other consoles' pictures. It used to be a dark outline.

### Fixed
- **No more dimming about 30 seconds after start.** Cartridge read every game's ID (Switch files, PS2 discs) and matched Steam games on its main thread. On a large library this froze it for seconds. In Game Mode, Steam then dimmed the window and took the controller.
  - Game IDs are now read in the background, and what was read is saved every 2 seconds, so a closed app doesn't start over.
  - Steam matching remembers where each game really is.
  - Emulator lookups are kept for a few seconds instead of being checked on disk again for every console.
  - If the app still stalls for over 2 seconds in Game Mode, it brings the controller back afterwards, as it does after a game.
- **Ship of Harkinian and other recomps that need your copy put in place.** Cartridge linked your copy under a file named after its own setup note ("the ROM in the same folder as soh.appimage ..."), so the recomp never found it. Your copy now goes exactly where each recomp looks:
  - beside the program;
  - into its data folder in your home;
  - under the name it expects (Perfect Dark's data/pd.ntsc-final.z64, REDRIVER2's two discs);
  - for a disc image, a .cue file brings its tracks with it, and a folder of game files goes in by its contents.

  Recomps set up before this update are put right by themselves. The few that Cartridge can't place (a patcher, a mod inside another game) say what to do and have an It's Set Up button.
- **Recomps start with their own options.** Open left out the options a recomp's project says it needs, such as PGR4's graphics options and WiiCompiled's normal start. Setup steps that should run once (Doom64EX making its game file, WiiCompiled installing your game) now run once, instead of every time you played.
- **Recomp updates are checked the way they're played.** The quick start after an update now uses the same options as playing.
- **Recomp page.** It says when Cartridge couldn't check for a newer release, instead of "Checking its newest release" for good.
- **Game files quoted once.** Recomp options that already quoted the game's file got doubled quotes, and Windows builds got "Z:" twice.
