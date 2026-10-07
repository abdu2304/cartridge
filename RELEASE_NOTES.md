## Cartridge 0.9.57 · Seamless

### New
- **A page for each game's saves.** In Settings → Saves and Sync, Cartridge Save Sync lists Your Games, and any game in the counts' lists opens its own sheet: its cover and whether it's in sync, every save of it on this device with where it is (copy the location, open the folder), its size, when it last changed and last synced, the backups kept here, its sync history (sent to RomM, brought here, changed on two devices, an older version put back), RomM's versions with Put Back, and Go to Game Page.
- **Games named from their codes, without the game on this device.** Saves, memory cards and Syncthing folders are named by a game's code (SLUS-20946). Cartridge now reads every code's name from the emulators' own game databases (PCSX2's and DuckStation's, the copy on this device first, else downloaded once) and finds the game in your library by name. PS2 textures and PS1/PS2 games on memory cards show under their games, and Syncthing lists every game, not only the ones downloaded here.
- **Change Icon for RetroAchievements games**, as trophies and gamerscore have it (the game's More).
- **Start moves a little.** Continue Playing and big pinned games drift slowly sideways, a gentle camera pan with no zoom. It stops with light effects, Reduce Motion, while arranging and during a game.

### Changed
- **Cloud Sync before a game, redesigned.** Your game on one side, your RomM server on the other, and the save travelling between them the way it's really going. When it's done the line fills and a tick lands in the middle (a break when RomM can't be reached, a fork when two devices changed the save).
- **No more grey highlights.** In the dark looks, primary buttons (Update All and the rest) and everything chosen (the open Settings section, the chosen tab, chips) are your highlight colour, solid, with matching text. See-through white over a dark panel read as grey.
- **Dark Glass is dark.** Near-black smoked glass, more solid panels and no white grain, so Glass on OLED reads black, not grey. Light Glass is unchanged.
- **One L1/R1 row in Saves and Sync.** Syncthing's Games, Main Server and This Device are pages in the section's own row (they had their own L1/R1 row inside, which fought it). The Everything / Saves / Textures / Patches row always shows, whichever console is chosen. How It Works is a card.
- **Two saves of one game say what they are.** RPCS3 and PPSSPP saves show their own subtitle and folder (a game's progress and its system data are separate saves of very different sizes).
- **Nexus Mods says why its page opens.** Nexus only lets Premium accounts download with an API key; free accounts press Slow Download on its site. Cartridge remembers the site's sign-in, so it asks you to sign in only the first time.
- **Downloads:** emulator updates and installs show the emulator's icon instead of an empty poster.

### Fixed
- **Vita3K installs without opening.** "Failed to load archive file in path: 13.zip" and Vita3K's window opening: Vita3K's command line reads any argument starting with "/" as an option, so a game's path was dropped (all of it, or everything before a space) and Vita3K skipped the install and opened its window. Cartridge now hands it the file from the file's own folder, stops Vita3K the moment its install ends (before its window is made), and stops the real Vita3K inside the AppImage too. Tested with Vita3K build 4111: installed in under a second, no window. Zips and VPKs that aren't encrypted are still installed by Cartridge itself, with no Vita3K at all.
- **shadPS4 saves.** Current shadPS4 keeps saves in `~/.local/share/shadPS4/home/<user ID>/savedata` (its home folder setting is followed too), not `user/savedata`. Saves, Save Sync, the installer's links and Linked Folders' suggestions for shadPS4 forks now use it; older layouts are still read.
- **X clears everything finished in Downloads**: games, add-ons, texture packs, emulator updates and installs.
- **Light card shadows were cut** at the bottom of rows. They're as firm, just tighter, so they fit.
- **Recently Played on Start** went see-through, then more see-through, when it changed game. The new picture now fades in over the old one.
- **PSP save names** ended in junk ("Size Matters™��ENTR").
- **SwanStation.srm** is a PS1 memory card (SwanStation's shared card): the games on it are read and matched.
