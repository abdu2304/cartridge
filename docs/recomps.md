# Recomp catalogue

Built 2026-10-10 by `tools/recomps/build.js` from the researched entries. Source list: PCGamingWiki's "List of unofficial ports", console sections only (owner's choice), status notes ignored (owner). Each project was checked from its own repository: tags, release files (a download answering 302), CI, README and source. Entries are shipped in `electron/recomps.json` without the notes below.

## Arcade

### Cannonball

- Games: Out Run
- Project: github:djyt/cannonball
- Builds: Windows build (Proton), newest checked v0.34 (cannonball-v034-w64.zip)
- Needs: The OutRun arcade ROM set, revision B (the MAME outrun set's files, unzipped); Japanese ROMs optional for the Japanese tracks
- Setup: place (roms/ beside the program (the OutRun revision B files, e.g. epr-10187.88, mpr-10371.9 ...)). Paths to the roms and res folders are set in config.xml and default to the working directory. Only a Windows build is released (maintained by the author); Linux users build it themselves.
- Saves: hiscores.xml and the other hiscores_*.xml in data.savepath (default the working directory)
- Sources: README.md:4 (requires the original ROMs), :10 (author maintains the Windows build only), :53-54 (config.xml paths, revision B romset in roms); roms/roms.txt (file list for revision B); src/main/frontend/config.cpp:92-100 (save path and hiscore files); https://github.com/djyt/cannonball/releases (via WebFetch: v0.34 newest) and expanded_assets/v0.34 (cannonball-v034-w64.zip); curl -I cannonball-v034-w64.zip 302
- Not certain: Program name inside the Windows zip not confirmed; Licence is the author's own non-commercial licence (docs/license.txt), not an SPDX licence; A Flatpak or distro package may exist for Linux; not checked; Tags v0.181 and v0.191 are older version numbers, not newer releases

### ProjectR

- Games: San Francisco Rush: The Rock, San Francisco Rush 2049
- Project: https://t3hd0gg.com/project-r/
- Builds: From its own site, newest checked 0.7.1 (project-r-0.7.1-linux-x86_64.AppImage, project-r-0.7.1-windows-x86_64.exe)
- Needs: Arcade dumps: for The Rock an sfrushrk CHD or raw hard drive dump plus the four audio ROMs (audio.u62, u61, u53, u49, a ZIP of them is accepted); for Rush 2049 an sf2049se, sf2049te or sf2049tea image
- Setup: picker (--rtr starts The Rock, --2049 starts Rush 2049 (main menu if not set up)). Each game is set up from the main menu's setup option. Needs Vulkan 1.2 and an x86-64-v2 CPU. Controller or wheel, no keyboard and mouse.
- Sources: https://t3hd0gg.com/project-r/ (downloads v0.7.1 dated 2025-07-15, file names, required files, --rtr/--2049); https://www.timeextension.com/news/2025/05/one-of-the-best-non-sega-arcade-racers-just-got-a-recompiled-pc-port
- Not certain: Asset names read from the site via a summariser, not checked by download; Where it keeps saves on Linux is not stated; Source is not public; origin 'recomp' is from press wording (reverse-engineered port); The site lists v0.7.1; a newer version may exist

## NES

### Metroid Planets

- Games: Metroid
- Project: https://forum.metroidconstruction.com/index.php/topic,4952.0.html
- Builds: From its own site, newest checked 1.33
- Setup: none. A stand-alone Windows fan remake (no ROM needed); on Linux it runs through Wine or Proton.
- Sources: https://lutris.net/games/metroid-planets/ (Windows only, v1.33, download from the developer's Dropbox linked in the forum post)
- Not certain: Download is a Dropbox link in the forum thread, not a release host; version 1.33 from Lutris; Program name and save folder unknown; Not checked whether the forum thread still links a working download

### Super Mario Bros. Remastered

- Games: Super Mario Bros.
- Project: github:JHDev2006/Super-Mario-Bros.-Remastered-Public
- Builds: Linux build, newest checked 1.1-stable (Linux.zip, Windows.zip)
- Needs: An original Super Mario Bros. NES ROM (.nes), checked against the project's own hashes
- Setup: picker (-rom {FILE}). Takes -rom <path>, else the first .nes beside the program, else asks (file dialog or drop). The ROM is copied to baserom.nes in its config folder, then assets are extracted to resource_packs/BaseAssets. Portable mode: portable.txt beside the program puts everything in config/ there.
- Saves: ~/.local/share/SMB1R/saves
- Achievements: ~/.local/share/SMB1R/achievements.sav: a text string of 0/1 characters, one per achievement
- Sources: Scripts/UI/RomVerifier.gd:15-25 (-rom argument), 45-53 (local .nes), 79-80 (copy to ROM_PATH); Scripts/Classes/Singletons/Global.gd:54-56 (baserom.nes, resource_packs/BaseAssets); Scripts/Classes/Singletons/SaveManager.gd:3 (saves/<campaign>.sav), 192-205 (achievements.sav); project.godot:18-20 (config/name SMB1R, use_custom_user_dir); release 1.1-stable Linux.zip listing (SMB1R.x86_64, SMB1R.pck); LICENSE (GPL-3.0)
- Not certain: Godot user folder assumed ~/.local/share/SMB1R (custom user dir, no custom name); Asset names are plain Linux.zip / Windows.zip; weekly snapshot tags (1.1-26wNNx) also exist, possibly pre-releases; The hash check is SHA-256 over base64 of the PRG data, not a plain file hash, so not listed

### SuperMarioBros-C

- Games: Super Mario Bros.
- Project: github:MitchellSternke/SuperMarioBros-C
- Builds: Build it yourself
- Needs: An unmodified Super Mario Bros. (JU) (PRG0) [!].nes ROM
- Setup: place (Super Mario Bros. (JU) (PRG0) [!].nes). Looked for in the working folder; another path can be set as rom_file in smbc.conf (INI) in the working folder.
- Sources: README.md:33 (executable smbc); README.md:38,71-74 (ROM name, rom_file in smbc.conf); README.md:112 (statically recompiled); README.md:116-119 (License: TODO); git ls-remote: no tags
- Not certain: No licence (README says TODO); No save files: the original game has none; Region: the (JU) ROM is the US/Japan release

### ZQuest Classic

- Games: The Legend of Zelda
- Project: github:ZQuestClassic/ZQuestClassic
- Builds: Linux build, newest checked 2.55.17 (2.55.17-linux.tar.gz, 2.55.17-windows-x64.zip, 3.0.0-prerelease.227+2026-10-06-linux.tar.gz)
- Setup: none. Formerly Zelda Classic. Ships its own recreation of the original quest plus an editor (zeditor) and player (zplayer). Stable tags are 2.55.x; 3.0.0 prereleases and nightlies are also published.
- Saves: saves (relative to the program folder, config key [zeldadx] save_folder)
- Sources: README.md:17 (Windows, macOS, Linux); ci.py:628-635 (<version>-windows-<arch>.zip, <version>-linux.tar.gz); curl -I 302 for 2.55.17-linux.tar.gz and 2.55.17-windows-x64.zip; src/zc/saves.cpp:69 (save_folder default 'saves'); LICENSE (GPL-3.0)
- Not certain: Program names inside the Linux tarball (zlauncher, zplayer) not confirmed by listing; Whether 'saves' resolves beside the program or in a user data folder on Linux not confirmed; Tags sort oddly: 3.0.0-prerelease.N and nightly-* tags are newer than 2.55.17

## SNES

### sm

- Games: Super Metroid
- Project: github:snesrev/sm
- Builds: Build it yourself
- Needs: Super Metroid as a ROM named sm.smc (hashes listed by the project)
- Setup: place (sm.smc) (sm {FILE}). Reads sm.smc from the working folder, or the first argument. Early version, build it yourself.
- Saves: saves/sm.srm
- Sources: README.md:9 (sm.smc and its sha1); src/main.c:378 (argument else sm.smc); src/sm_rtl.c:715 (saves/sm.srm); git ls-remote: no tags; LICENSE.txt (MIT)
- Not certain: Region of the hashed ROM not stated (likely the US/EU combined release)

### smw

- Games: Super Mario World
- Project: github:snesrev/smw
- Builds: Windows build (Proton), newest checked v0.1 (smw_0.1.zip)
- Needs: The US version of Super Mario World as an unheadered ROM named smw.sfc (hashes listed by the project)
- Setup: place (smw.sfc). The release zip holds smw.exe, SDL2.dll, smw.ini and smw_assets.bps, applied to smw.sfc at start. README says to self-build; Linux needs a self-build.
- Saves: saves/smw.srm
- Sources: src/main.c:900-926 (smw_assets.dat or smw_assets.bps + smw.sfc, unheadered); assets/util.py:14 (US SHA1); src/common_rtl.c:792-810 (saves/<title>.srm); release zip listing of smw_0.1.zip; LICENSE.txt (MIT)
- Not certain: Save file name is saves/<g_rtl_game_info->title>.srm; title assumed 'smw'; Only one old v0.1 release; README says 'You must self-build for now'

### zelda3

- Games: The Legend of Zelda: A Link to the Past
- Project: github:snesrev/zelda3
- Builds: Windows build (Proton), newest checked v0.3 (zelda3_v0.3.zip)
- Needs: The US version of A Link to the Past as an unheadered .sfc ROM named zelda3.sfc (hashes listed by the project)
- Setup: place (zelda3.sfc). The release zip holds zelda3.exe, SDL2.dll, zelda3.ini and zelda3_assets.bps; at each start the patch is applied to zelda3.sfc beside it (or zelda3_assets.dat is used if present). Linux needs a self-build (make).
- Saves: saves/sram.dat
- Sources: src/main.c:813-826 (zelda3_assets.dat, else zelda3_assets.bps + zelda3.sfc); assets/util.py:15 (US SHA1); src/zelda_rtl.c:872-883 (saves/sram.dat); release zip listing of zelda3_v0.3.zip (302 and range read); LICENSE.txt (MIT)
- Not certain: Saves are relative to the working directory, so Start in must be the program folder; Other language ROMs listed in assets/util.py work only when building assets yourself

## Nintendo 64

### 2 Ship 2 Harkinian

- Games: The Legend of Zelda: Majora's Mask
- Project: github:2ship2harkinian/2ship2harkinian
- Builds: Linux build, newest checked 5.0.1 (2Ship-Battler-Bravo-Linux.zip, 2Ship-Battler-Bravo-Win64.zip, 2Ship-Battler-Bravo-Mac.zip)
- Needs: A supported Majora's Mask ROM: the US N64 1.0 version or the US GameCube Collector's Edition version (hashes listed by the project)
- Setup: place (the ROM in the same folder as 2ship.appimage). On first run it extracts the ROM into mm.o2r in its data folder (2ship.o2r holds its own assets). On Linux the data folder is the working directory unless SHIP_HOME is set. The release zip is named after the release (e.g. Battler Bravo), so match by -Linux.zip.
- Saves: saves (in the working directory, or $SHIP_HOME/saves)
- Sources: README.md:17 (sha1 list docs/supportedHashes.json); README.md:26-28 (Linux: ROM beside the appimage); docs/supportedHashes.json (NTSC-U 1.0, NTSC-U GC); CMakeLists.txt:8,14 (5.0.1, Battler Bravo); mm/2s2h/BenPort.h:36 (appShortName 2ship); mm/2s2h/SaveManager/SaveManager.cpp:33 (saves folder in app directory); libultraship src/ship/core/Context.cpp:346-363 (SHIP_HOME, else '.'); .github/workflows/main.yml:203-212 (2ship.appimage + readme.txt); curl -I 302: github.com/2ship2harkinian/2ship2harkinian/releases/download/5.0.1/2Ship-Battler-Bravo-Linux.zip
- Not certain: The source row points at HarbourMasters/2ship2harkinian, which now redirects to the 2ship2harkinian organisation; Contents of the Linux zip assumed from the CI artifact (2ship.appimage, readme.txt); Whether the Linux build defines NON_PORTABLE (which would move data to ~/.local/share/2ship) was not found in CMake; assumed portable

### Banjo: Recompiled

- Games: Banjo-Kazooie
- Project: github:BanjoRecomp/BanjoRecomp
- Builds: Linux build, newest checked v1.0.2 (BanjoRecompiled-v1.0.2-Linux-X64.tar.gz, BanjoRecompiled-v1.0.2-Linux-ARM64.tar.gz, BanjoRecompiled-v1.0.2-Windows.zip, BanjoRecompiled-v1.0.2-macOS.zip)
- Needs: The North American 1.0 version of Banjo-Kazooie as an N64 ROM (.z64; .n64/.v64 are converted)
- Setup: picker. Pick the ROM from the main menu the first time; it is checked by hash and stored as bk.n64.us.1.0.z64 in the config folder. portable.txt beside the program keeps saves, config and mods beside it. Needs Vulkan 1.2 and SSE4.1.
- Saves: ~/.config/BanjoRecompiled/saves
- Sources: README.md:50 (provide the NA 1.0 version in the main menu); README.md:106-117 (saves ~/.config/BanjoRecompiled/saves, portable.txt); README.md:91-93 (Linux binary and Flatpak); src/main/main.cpp:376-380 (game_id bk.n64.us.1.0); include program_id BanjoRecompiled; Windows zip listing (BanjoRecompiled.exe); COPYING (GPL-3.0); N64ModernRuntime librecomp/src/recomp.cpp:64,197-238 (ROM stored as <game_id>.z64 in the config folder)
- Not certain: GitHub answers 302 for both Linux-X64 and Linux-x64 (case-insensitive), so the exact case is not known; A Flatpak is also published; its asset name was not found; Linux program name inside the tarball assumed BanjoRecompiled (README line 93)

### Bomberman 64: Recompiled

- Games: Bomberman 64
- Project: github:RevoSucks/BM64Recomp
- Builds: Linux build, newest checked v1.0.0 (BM64Recompiled-Linux-X64-Release.zip, BM64Recompiled-AppImage-X64-Release.zip, BM64Recompiled-Flatpak-X64-Release.zip, BM64Recompiled-Windows-RelWithDebInfo.zip)
- Needs: The North American 1.0 version of Bomberman 64 as an N64 ROM
- Setup: picker. Pick the ROM from the main menu the first time; it is checked by hash and stored as bm64_us.z64 in the config folder. portable.txt beside the program keeps saves, config and mods beside it. Needs Vulkan 1.2 and SSE4.1. The AppImage zip holds BM64Recompiled-x86_64.AppImage.
- Saves: ~/.config/BM64Recompiled/saves
- Sources: README.md:39 (NA 1.0 in the main menu); README.md:83-85 (saves); src game_id bm64_us, program_id BM64Recompiled; AppImage zip holds BM64Recompiled-x86_64.AppImage; Linux zip holds BM64Recompiled.tar.gz; COPYING (GPL-3.0); N64ModernRuntime librecomp/src/recomp.cpp:64,197-238 (ROM stored as <game_id>.z64 in the config folder)
- Not certain: Asset names are case-insensitive on GitHub; exact case not seen

### Bomberman Hero: Recompiled

- Games: Bomberman Hero
- Project: github:RevoSucks/BMHeroRecomp
- Builds: Linux build, newest checked v0.7.1 (BMHeroRecompiled-Linux-X64-Release.zip, BMHeroRecompiled-AppImage-X64-Release.zip)
- Needs: The North American 1.0 version of Bomberman Hero as an N64 ROM
- Setup: picker. Pick the ROM from the main menu the first time; it is checked by hash and stored as bmhero.z64 in the config folder. portable.txt beside the program keeps saves, config and mods beside it. Needs Vulkan 1.2 and SSE4.1. The AppImage zip holds BMHeroRecompiled-x86_64.AppImage.
- Saves: ~/.config/BMHeroRecompiled/saves
- Sources: README.md:39 (NA 1.0); README.md:83-85 (saves); game_id bmhero, program_id BMHeroRecompiled; AppImage zip listing; COPYING (GPL-3.0); N64ModernRuntime librecomp/src/recomp.cpp:64,197-238 (ROM stored as <game_id>.z64 in the config folder)
- Not certain: Windows asset name not found (probably BMHeroRecompiled-Windows-RelWithDebInfo.zip as in BM64Recomp, not checked); Still 0.x

### Castlevania 64: Recompiled

- Games: Castlevania
- Project: github:RevoSucks/CV64Recomp
- Builds: Linux build, newest checked v0.5.0 (CV64Recompiled-Linux-X64-Release.zip, CV64Recompiled-AppImage-X64-Release.zip)
- Needs: The US 1.0 version of Castlevania (N64) as a ROM
- Setup: picker. Pick the ROM from the main menu the first time; it is checked by hash and stored as cv64.us.1.0.z64 in the config folder. portable.txt beside the program keeps saves, config and mods beside it. Needs Vulkan 1.2 and SSE4.1. The AppImage zip holds CV64Recompiled-x86_64.AppImage.
- Saves: ~/.config/CV64Recompiled/saves
- Sources: src game_id cv64.us.1.0, internal_name CASTLEVANIA, program_id CV64Recompiled; AppImage zip listing; COPYING (GPL-3.0); N64ModernRuntime librecomp/src/recomp.cpp:64,197-238 (ROM stored as <game_id>.z64 in the config folder)
- Not certain: README still says 'WIP recomp which doesn't build' although v0.5.0 has builds; Region from game_id cv64.us.1.0, not stated in README; Saves path follows the N64ModernRuntime pattern, not stated in README; Windows asset not found

### Chameleon Twist: Recompiled

- Games: Chameleon Twist
- Project: github:Rainchus/ChameleonTwist1-JP-Recomp
- Builds: Build it yourself, newest checked v0.1
- Needs: The Japanese version of Chameleon Twist as an N64 ROM
- Setup: picker. Pick the ROM from the main menu the first time; it is checked by hash and stored as ChameleonTwistJP.z64 in the config folder. portable.txt beside the program keeps saves, config and mods beside it. Needs Vulkan 1.2 and SSE4.1.
- Saves: ~/.config/ChameleonTwistRecompiled/saves
- Sources: README.md:89-93 (saves, only the JP ROM); include program_id ChameleonTwistRecompiled, game_id ChameleonTwistJP; git ls-remote: tag v0.1; COPYING (GPL-3.0); N64ModernRuntime librecomp/src/recomp.cpp:64,197-238 (ROM stored as <game_id>.z64 in the config folder)
- Not certain: Tag v0.1 exists but no release asset name could be confirmed (many guesses 404); builds may exist; Program name taken from CMake project(ChameleonTwistJPRecompiled); README still names Zelda64Recompiled in places; A second program_id 'Zelda64Recompiled' appears in a leftover file

### Dinosaur Planet: Recompiled

- Games: Dinosaur Planet
- Project: github:DinosaurPlanetRecomp/dino-recomp
- Builds: Linux build, newest checked v0.3.0 (DinosaurPlanetRecompiled-v0.3.0-Linux-x64.AppImage, DinosaurPlanetRecompiled-v0.3.0-Linux-x64.tar.gz, DinosaurPlanetRecompiled-v0.3.0-Windows-x64.zip)
- Needs: The December 2000 Dinosaur Planet prototype ROM released by Forest of Illusion (unpatched)
- Setup: picker. Pick the ROM from the main menu the first time; it is checked by hash and stored as dino.z64 in the config folder. portable.txt beside the program keeps saves, config and mods beside it. Needs Vulkan 1.2 and SSE4.1.
- Saves: ~/.config/DinoPlanetRecompiled/saves
- Sources: README.md:50-52 (only the Dec 2000 prototype, no patched ROMs); README.md:46-55 (saves, portable.txt); build.yml:61-65,95 (tar.gz and AppImage names); Windows zip listing (DinosaurPlanetRecompiled.exe); COPYING (GPL-3.0); Repo moved from Francessco121/dino-recomp (301); N64ModernRuntime librecomp/src/recomp.cpp:64,197-238 (ROM stored as <game_id>.z64 in the config folder)
- Not certain: Still 0.x; the README calls it a work in progress

### DK64 Rekongpiled

- Games: Donkey Kong 64
- Project: github:Rainchus/Donkey-Kong-64-Recompiled
- Builds: Linux build, newest checked v1.0.3
- Needs: The US version of Donkey Kong 64 as an N64 ROM
- Setup: picker. Select the ROM in the program the first time; stored as DK64.z64 in the config folder. Linux builds: an x64 binary zip and a Flatpak zip.
- Saves: ~/.config/DK64Recompiled/saves
- Sources: https://dk64recomp.com/ (US ROM only, GitHub releases, Linux x64 and Flatpak zips); README.md:89-90 (saves); src game_id DK64, program_id DK64Recompiled; validate.yml:106,243 (artifact names DK64Recompiled-<os>-X64-<type>, DK64Recompiled-Flatpak-X64-<type>); git ls-remote tags 1.0.0, 1.0.1, 1.0.2, v1.0.3; LICENSE (GPL-3.0)
- Not certain: No release asset name could be confirmed: dozens of guessed names (DK64Recompiled-*-Linux-X64*.zip etc.) answered 404; the regexes are guesses; Tag naming changed from 1.0.2 to v1.0.3

### Doom64EX

- Games: Doom 64
- Project: github:svkaiser/Doom64EX
- Builds: Build it yourself
- Needs: A Doom 64 N64 ROM, turned into doom64.wad and doomsnd.sf2 by the program's -wadgen option
- Setup: path (doom64ex -wadgen {FILE}). -wadgen generates doom64.wad and doomsnd.sf2 and places them where Doom64EX finds them (current folder, program folder, ~/.local/share/doom64ex and system folders). doom64ex.pk3 comes with the build.
- Saves: ~/.local/share/doom64ex
- Sources: README.md:3-4 (reverse-engineering project); README.md:12-13 (no official binary builds; older versions on doom64ex.wordpress.com); README.md:152-176 (data files, -wadgen, search folders); src/engine/App.cc:99 (SDL_GetPrefPath doom64ex); src/engine/wadgen/rom.cc:100-130 (ROM check is an MD5 of header fields, not a file hash); LICENSE (GPL-2.0); git ls-remote: no release tags
- Not certain: Original project is inactive with no binary builds; the maintained fork Doom64EX-Plus (github:atsb/Doom64EX-Plus) publishes builds and may be the better catalogue target; Region: wadgen accepts ten ROM header digests (several regions/revisions), exact list not mapped; Where -wadgen writes doom64.wad not confirmed in code (README: 'somewhere where Doom64EX can find them')

### Dr. Mario 64 Recompiled

- Games: Dr. Mario 64
- Project: github:theboy181/drmario64_recomp_plus
- Builds: Windows build (Proton), newest checked 1.0.0 (Dr.Mario.64.Recompiled-v1.0.0-Windows.zip)
- Needs: A clean US Dr. Mario 64 ROM
- Setup: picker. Pick the ROM from the main menu the first time; it is checked by hash and stored as drmario64.us.z64 in the config folder. portable.txt beside the program keeps saves, config and mods beside it. Needs Vulkan 1.2 and SSE4.1.
- Saves: ~/.config/drmario64_recomp/saves
- Sources: README.md:20-21 (clean US ROM); README.md:33 (Linux: build from source); include program_id drmario64_recomp, game_id drmario64.us; Windows zip listing: 'Dr. Mario 64 Recompiled x64-Release/drmario64_recomp.exe'; https://lutris.net/games/install/39756/view (asset name); COPYING (GPL-3.0); N64ModernRuntime librecomp/src/recomp.cpp:64,197-238 (ROM stored as <game_id>.z64 in the config folder)
- Not certain: Program sits inside a 'Dr. Mario 64 Recompiled x64-Release/' folder in the zip; No Linux build found; Saves path follows the N64ModernRuntime pattern, not stated in README

### Duke Nukem Zero Hour: Recompiled

- Games: Duke Nukem: Zero Hour
- Project: gitlab:sonicdcer/DNZHRecomp
- Builds: Linux build, newest checked 0.0.3 (DNZHRecompiled-0.0.3-Linux-X64-Release, DNZHRecompiled-0.0.3-Flatpak-X64-Release, DNZHRecompiled-0.0.3-Linux-ARM64-Release, DNZHRecompiled-0.0.3-macOS-Release, DNZHRecompiled-0.0.3-Windows-RelWithDebInfo)
- Needs: The US version of Duke Nukem: Zero Hour as an N64 ROM (.z64; other formats converted)
- Setup: picker. Pick the ROM from the main menu the first time; stored as dnzh.us.z64 in the config folder. Release links have no extension: the Linux one downloads DNZHRecompiled-0.0.3-Linux-X64-Release.zip holding DNZHRecompiled.tar.gz. GitLab package_files links.
- Saves: ~/.config/DNZHRecompiled/saves
- Sources: GitLab API releases: 0.0.3 (2025-11-01) asset links; Content-Disposition of the Linux link: DNZHRecompiled-0.0.3-Linux-X64-Release.zip; zip holds DNZHRecompiled.tar.gz; README.md:46,94 (US ROM only, main menu); README.md:89-91 (saves); src/main/main.cpp:355-357 (game_id dnzh.us); LICENSE (GPL-3.0)
- Not certain: Asset link names have no file extension; match on link name; Program name inside the tarball assumed DNZHRecompiled (README line 73); Version 0.0.x, early

### Extreme-G: Recompiled

- Games: Extreme-G
- Project: gitlab:sonicdcer/ExtremeGRecomp
- Builds: Linux build, newest checked v1.0.0 (ExtremeGRecompiled-v1.0.0-Linux-X64-Release, ExtremeGRecompiled-v1.0.0-Windows-RelWithDebInfo, ExtremeGRecompiled-v1.0.0-Flatpak-X64-Release, ExtremeGRecompiled-v1.0.0-Linux-ARM64-Release, ExtremeGRecompiled-v1.0.0-macOS-Release)
- Needs: The North American 1.0 version of Extreme-G as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and copies it as eg.n64.us.z64 into its config folder. The Linux zip (a GitLab package file named without extension) holds ExtremeGRecompiled.tar.gz with the program, assets/ and recompcontrollerdb.txt. portable.txt beside the program keeps saves and config beside it.
- Saves: ~/.config/ExtremeGRecompiled/saves
- Sources: README.md:47 (North American 1.0, provide in main menu); README.md:90-92 (save paths); README.md:100-101 (portable.txt); include/banjo_config.h:11 (program_id ExtremeGRecompiled); src/main/main.cpp:393 (game_id eg.n64.us); N64ModernRuntime librecomp/src/recomp.cpp:63-64 (stored ROM is <game_id>.z64 in config path); GitLab API releases: v1.0.0 links; zip listing shows ExtremeGRecompiled.tar.gz; .github/workflows/validate.yml:100 (tar contents)
- Not certain: GitLab asset links have no .zip in their names; the downloaded file is <name>.zip with a .tar.gz inside; Stored ROM file name taken from N64ModernRuntime main branch, the submodule version may differ

### Ghostship

- Games: Super Mario 64
- Project: github:HarbourMasters/Ghostship
- Builds: Linux build, newest checked 3.0.0 (Nautilus-Alfa-Linux.zip, Nautilus-Alfa-Win64.zip, Nautilus-Alfa-Mac.zip, Mary-Celeste-Alfa-Linux.zip (2.0.0))
- Needs: The US or Japanese version of Super Mario 64 as a .z64 ROM (hashes listed by the project)
- Setup: picker (a .z64 ROM in the working directory is found automatically). On first run it looks for supported .z64 ROMs in the program folder and its data folder, else opens a file dialog, then builds sm64.o2r. Data folder is the working directory unless SHIP_HOME is set (portable build). The Linux zip holds ghostship.appimage, config.yml, readme.txt, gamecontrollerdb.txt and a .tcc folder. Zips are named after the release codename (Nautilus Alfa), with no Ghostship prefix.
- Saves: saves/ in its data folder (working directory, or $SHIP_HOME), default.sav (older single save, migrated)
- Sources: README.md Quick Start (SHA-1 for US and JP, extract and run Ghostship.appimage); config.yml:4,42 (supported ROM SHA-1s); src/port/GameExtractor.cpp:114 (file dialog), FindSupportedRoms; src/port/data/Saves.cpp:18 (saves folder), :85-101 (default.sav); libultraship Context.cpp GetAppDirectoryPath (SHIP_HOME, else '.'); .github/workflows/main.yml:436-450 (Linux artifact contents); curl -I 3.0.0/Nautilus-Alfa-Linux.zip 302, Nautilus-Alfa-Win64.zip 302; zls.py listing of Nautilus-Alfa-Linux.zip; LICENSE.md (MIT)
- Not certain: Asset regex -Linux\.zip$ has no project prefix because the zips are codename-only; NON_PORTABLE not set in its CMakeLists, so data is assumed to be the working directory

### Goemon 64: Recompiled

- Games: Mystical Ninja Starring Goemon
- Project: github:klorfmorf/Goemon64Recomp
- Builds: Linux build, newest checked v0.2.0-dev (Goemon64Recompiled-Linux-X64-Release.zip, Goemon64Recompiled-AppImage-X64-Release.zip, Goemon64Recompiled-Windows-RelWithDebInfo.zip)
- Needs: The North American version of Mystical Ninja Starring Goemon as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and copies it as mnsg.us.z64 into its config folder. Linux zip holds Goemon64Recompiled.tar.gz; an AppImage zip is also offered. portable.txt beside the program keeps data beside it.
- Saves: ~/.config/Goemon64Recompiled/saves
- Sources: README.md:40,102 (US version only); README.md:97-98 (saves); README.md:107 (portable.txt); include/goemon_config.h:10 (program_id); src/main/main.cpp:357 (game_id mnsg.us); .github/workflows/validate.yml:81-93 (tar and AppImage artifacts); curl -I 302: releases/download/v0.2.0-dev/Goemon64Recompiled-Linux-X64-Release.zip
- Not certain: All tags end in -dev; treated as pre-releases; Asset names carry no version number

### GoldenRecomp

- Games: GoldenEye 007
- Project: github:kholdfuzion/GoldenRecomp
- Builds: Build it yourself
- Needs: A special TLB-free, uncompressed GoldenEye 007 ROM and ELF built from a branch of the decompilation (ge007.tlbfree.z64 and ge007.tlbfree.elf), used at build time
- Setup: none. Work in progress with no releases. Building needs the TBLFREE_NOCOMPRESSION branch of kholdfuzion/goldeneye_src, a forked N64Recomp and Visual Studio. The decomp itself checks the US ROM against sha1 abe01e4aeb033b6c0836819f549c791b26cfde83, but that is the stock ROM, not what this port takes.
- Sources: README.md:11-21 (state before an eventual release); README.md:26-29 (build a TLBFREE ROM, place the elf and z64 in the repo root); git ls-remote --tags: no tags; no .github/workflows; gitlab kholdfuzion/goldeneye_src ge007.u.sha1
- Not certain: Port name taken from the repository name; the README gives no title; The GitLab link in the source row is the decompilation (goldeneye_src), not a separate port

### Harvest Moon 64: Recompiled

- Games: Harvest Moon 64
- Project: github:HarvestMoon64Recomp/HarvestMoon64Recomp
- Builds: Linux build, newest checked v1.2.2 (HarvestMoon64Recompiled-v1.2.2-Linux-X64.zip, HarvestMoon64Recompiled-v1.2.2-Windows.zip, HarvestMoon64Recompiled-v1.2.2-Linux-ARM64.zip, HarvestMoon64Recompiled-v1.2.2-macOS.zip)
- Needs: The North American version of Harvest Moon 64 as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and copies it as harvest_moon_64.z64 into its config folder. The Linux zip holds HarvestMoon64Recompiled.tar.gz (program, assets/, recompcontrollerdb.txt). Thunderstore mods are downloaded by hand. portable.txt beside the program keeps saves beside it.
- Saves: ~/.config/HarvestMoon64Recompiled/saves
- Sources: README.md:43 (North American version, main menu); README.md:80-82 (saves); README.md:85 (portable.txt); include/harvestmoon64_config.h:8 (program_id); src/main/main.cpp:376 (game_id harvest_moon_64); .github/workflows/validate.yml:99 (tar contents); curl -I 302: releases/download/v1.2.2/HarvestMoon64Recompiled-v1.2.2-Linux-X64.zip
- Not certain: GitHub answered 302 for both Linux-X64 and Linux-x64 (case-insensitive), so the exact case is unconfirmed; the regex should be case-insensitive; Assumed the zip holds a tar.gz as the workflow builds and as the sonicdcer ports do

### Lighthouse

- Games: Banjo-Kazooie
- Project: github:HarbourMasters/Lighthouse
- Builds: Linux build, newest checked 1.1.0 (Lighthouse-Hatteras-Alfa-Linux.zip, Lighthouse-Hatteras-Alfa-Win64.zip)
- Needs: A Banjo-Kazooie N64 ROM in .z64 format: US 1.0, US 1.1, Japanese or PAL (hashes listed by the project)
- Setup: picker. Asks for the ROM on first start and generates bk.o2r. Other regions can be added later as language packs. SHIP_HOME sets the data folder; a folder beside the AppImage holding lighthouse.cfg.json or bk.o2r is used instead.
- Saves: ~/.local/share/lighthouse
- Sources: README.md:22-28 (supported ROMs and SHA-1); README.md:43-46 (Linux AppImage, ROM prompt, ~/.local/share/lighthouse, SHIP_HOME); release.yml:31-33 (<prefix>-Win64.zip, lighthouse.appimage); 1.1.0 Linux zip listing (lighthouse.appimage, readme.txt, gamecontrollerdb.txt); CMakeLists.txt:31 (build name Hatteras <word>); LICENSE.md (CC0)
- Not certain: 1.1.0 ships Lighthouse-Hatteras-Alfa-Linux.zip; the current release workflow uploads a bare lighthouse.appimage instead, so both forms are matched; Exact save file names inside ~/.local/share/lighthouse not checked

### MarioKart 64: Recompiled

- Games: Mario Kart 64
- Project: gitlab:sonicdcer/MarioKart64Recomp
- Builds: Linux build, newest checked v0.9.2 (MarioKart64Recompiled-v0.9.2-Linux-X64-Release, MarioKart64Recompiled-v0.9.2-Windows-RelWithDebInfo, MarioKart64Recompiled-v0.9.2-Flatpak-X64-Release, MarioKart64Recompiled-v0.9.2-Linux-ARM64-Release, MarioKart64Recompiled-v0.9.2-macOS-Release)
- Needs: The North American version of Mario Kart 64 as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and copies it as mk64.us.z64 into its config folder. The Linux zip holds MarioKart64Recompiled.tar.gz. portable.txt beside the program keeps saves and config beside it.
- Saves: ~/.config/MarioKart64Recompiled/saves
- Sources: README.md:42 (North American version, main menu); README.md:90-92 (saves); README.md:99-100 (portable.txt); include/zelda_config.h:10 (program_id); src/main/main.cpp:357 (game_id mk64.us); GitLab API releases v0.9.2; zip listing shows MarioKart64Recompiled.tar.gz
- Not certain: Version 0.9.2 is below 1.0; may count as early; Stored ROM name from N64ModernRuntime main branch

### MegaMan64Recompiled

- Games: Mega Man 64
- Project: github:MegaMan64Recomp/MegaMan64Recompiled
- Builds: Linux build, newest checked v0.9.1 (MegaMan64Recompiled-v0.9.1-Linux-X64.zip, MegaMan64Recompiled-v0.9.1-Windows.zip, MegaMan64Recompiled-v0.9.1-Flatpak-X64.zip, MegaMan64Recompiled-v0.9.1-Linux-ARM64.zip, MegaMan64Recompiled-v0.9.1-macOS.zip)
- Needs: The US version of Mega Man 64 as an N64 ROM in .z64 format
- Setup: picker. Asks for the ROM in its main menu and copies it as megaman.n64.us.1.0.z64 into its config folder. portable.txt beside the program keeps data beside it (N64: Recompiled template).
- Saves: ~/.config/MegaMan64Recompiled/saves
- Sources: include/zelda_config.h:10 (program_id); src/game/config.cpp:183 (~/.config/<program_id>); N64ModernRuntime librecomp/src/pi.cpp:99 (saves folder); src/main/main.cpp:348-351 (MEGA MAN 64, game_id megaman.n64.us.1.0, flashram); curl -I 302: releases/download/v0.9.1/MegaMan64Recompiled-v0.9.1-Linux-X64.zip; Lutris installer 39867 (v0.9.1 Linux x64, .z64 ROM); techeblog.com Mega Man 64 native PC port (US ROM)
- Not certain: The repository README is two lines; US region comes from game_id and a news article, not the project's own text; The cloned main branch (April 2026) may be behind the v0.9.1 release; Assumed the zip holds a tar.gz like other N64: Recompiled ports

### PaperBoat

- Games: Paper Mario
- Project: github:HarbourMasters/PaperBoat
- Builds: Linux build, newest checked 1.0.2 (Paperboat-Mulberry-Charlie-Linux.zip, Paperboat-Mulberry-Charlie-Win64.zip)
- Needs: The US version of Paper Mario as an N64 ROM (hashes listed by the project)
- Setup: place (the ROM in the same folder as Paperboat.AppImage). Extracts the ROM into pm64.o2r in its data folder on first run (it also looks for baserom.us.z64 there). Data folder is the working directory unless SHIP_HOME is set. The Linux zip holds Paperboat.AppImage, readme.txt and gamecontrollerdb.txt; zips are named after the release (Mulberry Charlie).
- Saves: saves/ in its data folder (working directory, or $SHIP_HOME)
- Sources: README.md:22 (US SHA1); README.md:32-34 (Linux: ROM beside the appimage); src/port/Engine.cpp:201 (app name boat), 597 (pm64.o2r); src/port/extractor/GameExtractor.cpp:128 (baserom.us.z64); src/port/save/SaveManager.cpp:474-490 (saves/); .github/workflows/release.yml:30-32 (Paperboat-<build name>-Linux.zip); .github/workflows/build.yml:118-121 (zip contents); curl -I 302: releases/download/1.0.2/Paperboat-Mulberry-Charlie-Linux.zip; gamingonlinux.com 2026/09 Harbour Masters release PaperBoat
- Not certain: Source row had no link; repository found by search and git ls-remote; README calls the program paperboat.appimage but CI names it Paperboat.AppImage; Data folder assumed portable (libultraship returns '.' without NON_PORTABLE)

### Perfect Dark PC port

- Games: Perfect Dark
- Project: github:perfect-dark-pc-port/perfect_dark
- Builds: Linux build, newest checked ci-dev-build (pd-x86_64-linux.tar.gz, pd-x86_64-windows.zip)
- Needs: The Perfect Dark US V1.1 (ntsc-final) ROM, recommended; US V1.0 also works. PAL and JPN need their own executables (hashes listed by the project)
- Setup: place (data/pd.ntsc-final.z64). Put the ROM in a data folder next to pd.x86_64 (or ~/.local/share/perfectdark/data). Optional data/pd.gbc (Perfect Dark GBC ROM) emulates the Transfer Pak. Options --portable, --basedir and --savedir. A rolling ci-dev-build tag is the only release.
- Saves: eeprom.bin in the working directory when pd.ini is there, else ~/.local/share/perfectdark/
- Sources: README.md:5-16 (ROM versions and md5); README.md:46-50 (ci-dev-build downloads); README.md:60-71 (data folder, ROM name, ~/.local/share/perfectdark); port/src/romdata.c:26 (pd.<romid>.z64); port/src/fs.c:102-174 (save dir rules); port/src/libultra.c:17-18 (eeprom.bin in save dir); port/src/system.c:254 (SDL_GetPrefPath perfectdark); .github/workflows/c-cpp.yml (gh release upload ci-dev-build); curl -I 302: github.com/perfect-dark-pc-port/perfect_dark/releases/download/ci-dev-build/pd-x86_64-linux.tar.gz
- Not certain: The source row's fgsfdsfgs/perfect_dark redirects to perfect-dark-pc-port/perfect_dark; Only md5s for the US ROMs are listed in needs; JPN 538d2b75945eae069b29c46193e74790 and PAL d9b5cd305d228424891ce38e71bc9213 need separately built executables (pd.pal / pd.jpn); Save folder logic from fs.c: Linux uses the working directory only when pd.ini exists there

### Pilotwings 64: Recompiled

- Games: Pilotwings 64
- Project: github:gcsmith/Pilotwings64Recomp
- Builds: Build it yourself
- Needs: The US 1.0 version of Pilotwings 64 as an N64 ROM
- Setup: picker. No prebuilt binaries yet (README: likely not until a 1.0 release). When built, it follows the N64: Recompiled template: asks for the ROM in its main menu and stores it as pilotwings64.n64.us.1.0.z64 in its config folder.
- Saves: ~/.config/Pilotwings64Recompiled/saves
- Sources: README.md:6 (latest release link struck through, coming soon); README.md:38 (prebuilt binaries not available until a future 1.0); include/pilotwings64_config.h:9 (program_id); src/main/main.cpp:374 (game_id pilotwings64.n64.us.1.0); git ls-remote --tags: none
- Not certain: Save and done paths are the N64: Recompiled template defaults, not stated in this README

### Quest 64: Recompiled

- Games: Quest 64
- Project: github:Rainchus/Quest64-Recomp
- Builds: Windows build (Proton), newest checked v0.1 (Quest64Recompiledv0.1.zip)
- Needs: The North American 1.0 version of Quest 64 as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and stores it as quest64_us.z64 in its data folder. Only a Windows zip (Quest64Recompiled.exe with DLLs) is released, so it runs through Proton; under Proton the data folder is in the prefix's %LOCALAPPDATA%\Quest64Recompiled. portable.txt beside the exe keeps saves beside it.
- Saves: %LOCALAPPDATA%\Quest64Recompiled\saves inside the Proton prefix, saves beside the exe with portable.txt
- Sources: README.md:41,96 (1.0 North American); README.md:91-93 (saves); README.md:101 (portable.txt); include/zelda_config.h:10 (program_id Quest64Recompiled); src/main/main.cpp:355 (game_id quest64_us); curl -I 302 and zip listing: releases/download/v0.1/Quest64Recompiledv0.1.zip (Quest64Recompiled.exe, SDL2.dll, dxil.dll, dxcompiler.dll); Lutris installer 39755 (Windows zip through Wine)
- Not certain: CI builds Linux artifacts, but the v0.1 release only carries a Windows zip; later releases may add Linux; One news report claimed a Japanese ROM is needed; the README and game_id say US

### Render96ex

- Games: Super Mario 64
- Project: github:Render96/Render96ex
- Builds: Build it yourself
- Needs: A Super Mario 64 ROM named baserom.<version>.z64, used at build time (hashes listed by the project)
- Setup: none (baserom.us.z64 in the source folder before building). Source only. After building, the Render96 model pack goes in build/us_pc/dynos/packs and the HD texture pack in build/us_pc/res/gfx.
- Saves: ~/.local/share/sm64ex/sm64_save_file.bin
- Sources: README.md:1-23 (fork of sm64ex, model pack and texture pack steps); src/pc/platform.c:117-121 (SDL_GetPrefPath sm64ex); src/pc/fs/fs.h:23; git ls-remote --tags: none
- Not certain: Shares sm64ex's save folder name

### Ship of Harkinian

- Games: The Legend of Zelda: Ocarina of Time
- Project: github:HarbourMasters/Shipwright
- Builds: Linux build, newest checked 9.2.3 (SoH-Ackbar-Delta-Linux.zip, SoH-Ackbar-Delta-Win64.zip, SoH-Ackbar-Delta-Mac.zip)
- Needs: A supported Ocarina of Time ROM: any of the N64 NTSC or PAL versions, the GameCube versions or Master Quest listed by the project (hashes listed by the project)
- Setup: place (the ROM in the same folder as soh.appimage (9.2.3); newer builds ask with a file picker). Extracts the ROM into oot.o2r (oot-mq.o2r for Master Quest) on first run; soh.o2r ships with it. In 9.2.3 the data folder is the working directory unless SHIP_HOME is set; the develop branch (9.3.0) moves it to ~/.local/share/soh/ unless the launch folder already holds shipofharkinian.json or oot.o2r. Custom assets go in mods/. Release zips are named after the release (Ackbar Delta), so match -Linux.zip.
- Saves: Save (in the data folder: the working directory or $SHIP_HOME in 9.2.3), ~/.local/share/soh/Save (from 9.3.0)
- Sources: README.md:14 and docs/supportedHashes.json (sha1 list); raw README.md at tag 9.2.3 lines 27-29 (ROM beside the appimage); README.md:23-26 on develop (picker, ~/.local/share/soh/, SHIP_HOME); soh/soh/SaveManager.cpp:127 (Save folder in the app directory); raw CMakeLists.txt at 9.2.3:41 (Ackbar build name); curl -I 302: releases/download/9.2.3/SoH-Ackbar-Delta-Linux.zip; .github/workflows/generate-builds.yml:168-176 (soh.appimage)
- Not certain: Tag 9.3.0 (Dewey Alfa) exists but SoH-Dewey-Alfa-Linux.zip returned 404; the release may not be published yet; No licence file found in the repository; Folder for ~/.local/share/soh taken from the develop README, not checked in libultraship code for the release build

### sm64-port

- Games: Super Mario 64
- Project: github:sm64-port/sm64-port
- Builds: Build it yourself
- Needs: A Super Mario 64 ROM (US, JP or EU) named baserom.<version>.z64, used at build time for asset extraction (hashes listed by the project)
- Setup: none (baserom.us.z64 in the source folder before building). Source only: build with make (VERSION=us|jp|eu); the program lands in build/<version>_pc/. Assets are baked into the build, so nothing is needed at run time.
- Saves: sm64_save_file.bin in the working directory
- Sources: README.md:16-18 (baserom.<VERSION>.z64, build output); sm64.us.sha1, sm64.eu.sha1, sm64.jp.sha1 (sha1 of the matching ROMs); src/pc/ultra_reimplementation.c:149,179 (sm64_save_file.bin); git ls-remote --tags: only irix/irix2 (decomp tags, no builds)
- Not certain: The sha1 files are of the decomp's rebuilt ROMs, which match the retail ROMs; sm64.sh.sha1 (Shindou, 3f319ae697533a255a1003d09202379d78d5a2e0) left out as the port's README lists only us, jp, eu; No licence file; the decomp has none

### sm64coopdx

- Games: Super Mario 64
- Project: github:coop-deluxe/sm64coopdx
- Builds: Linux build, newest checked v1.5.1 (sm64coopdx_Linux.zip, sm64coopdx_SteamOS.zip, sm64coopdx_Windows.zip)
- Needs: The US version of Super Mario 64 as a .z64 ROM (hashes listed by the project)
- Setup: place (any .z64 file in ~/.local/share/sm64coopdx or next to the program (or drag and drop it on the window)). On first start it scans its data folder and then the program folder for a .z64 whose md5 matches the US ROM and copies it to baserom.us.z64 in the data folder. --savepath overrides the data folder.
- Saves: ~/.local/share/sm64coopdx/sm64_save_file.bin
- Sources: src/pc/rom_checker.cpp:35 (US md5), :62 (baserom.<region>.z64 copy), :96-97 (scans write path then exe folder); sm64.us.sha1; src/pc/platform.c:303 (SDL_GetPrefPath sm64coopdx); src/pc/fs/fs.h:11 SAVE_FILENAME; src/pc/loading.c:190 drag and drop message; .github/workflows/build-coop.yaml:35,67,115 zip names; curl -I releases/download/v1.5.1/sm64coopdx_Linux.zip 302
- Not certain: SDL_GetPrefPath may fall back to an existing ~/.local/share/sm64ex-coop folder for older installs; sm64coopdx_SteamOS.zip and _Linux.zip are both Linux builds; SteamOS one presumably built against older libraries; No licence file in the repo

### sm64ex

- Games: Super Mario 64
- Project: github:sm64pc/sm64ex
- Builds: Build it yourself
- Needs: A Super Mario 64 ROM named baserom.<version>.z64, used at build time (hashes listed by the project)
- Setup: none (baserom.us.z64 in the source folder before building). Source only (building is described on its wiki). --savepath sets where saves and config go ('.' working directory, '!' program folder).
- Saves: ~/.local/share/sm64ex/sm64_save_file.bin
- Sources: README.md:23-25 (save path ~/.local/share/sm64ex, --savepath); src/pc/platform.c:124-128 (SDL_GetPrefPath sm64ex); src/pc/fs/fs.h:23 (sm64_save_file.bin); sm64.*.sha1; git ls-remote --tags: none
- Not certain: Default branch is nightly; the master branch saved in the working directory; sm64pc.info is the community's site (SM64PC Port Central), not a separate port; Program name depends on build options

### Snapshot

- Games: Pokémon Snap
- Project: github:ExpansionPak/Snapshot
- Builds: Build it yourself
- Needs: The US version of Pokémon Snap as an N64 ROM
- Setup: picker. Very unfinished and without releases. It still uses the Zelda 64: Recompiled template's program id, so a build would keep its data in ~/.config/Zelda64Recompiled and store the ROM there as snap.n64.us.1.0.z64.
- Saves: ~/.config/Zelda64Recompiled/saves
- Sources: README.md:2-5 (very unfinished, not recommended); README.md:137 (US ROM only); include/zelda_config.h:10 (program_id still Zelda64Recompiled); src/main/main.cpp:351 (game_id snap.n64.us.1.0); git ls-remote --tags: none
- Not certain: The README's release link and save paths still point at Zelda64Recomp (template leftovers); the shared ~/.config/Zelda64Recompiled folder would clash with Zelda 64: Recompiled; A different, released Pokémon Snap recomp exists: JackandBeans/Snap64Recomp (v1.1.1 per newreleases.io); it may be the better catalogue choice

### Snowboard Kids 2: Recompiled

- Games: Snowboard Kids 2
- Project: github:cdlewis/snowboardkids2-recomp
- Builds: Linux build, newest checked v1.0.5 (SnowboardKids2Recompiled-Linux-X64-Release.tar.gz, SnowboardKids2Recompiled-Windows-RelWithDebInfo.zip)
- Needs: The North American version of Snowboard Kids 2 as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and stores it as snowboardkids2.n64.us.z64 in its config folder. The Linux asset is a plain .tar.gz (program, assets/, recompcontrollerdb.txt). portable.txt beside the program keeps data beside it.
- Saves: ~/.config/SnowboardKids2Recompiled/saves
- Sources: README.md:46,113 (US version only); README.md:107-109 (saves); README.md:119 (portable.txt); include/zelda_config.h:9 (program_id); src/main/main.cpp:451 (game_id); .github/workflows/release.yml:59-78 (single-file artifacts keep their extension); curl -I 302: releases/download/v1.0.5/SnowboardKids2Recompiled-Linux-X64-Release.tar.gz
- Not certain: Tags v2.0.0+alpha1..3 exist with the same asset names; v1.0.5 taken as the latest stable

### SpaghettiKart

- Games: Mario Kart 64
- Project: github:HarbourMasters/SpaghettiKart
- Builds: Linux build, newest checked 1.0.0 (Spaghetti-Linux.zip, Spaghetti-Windows.zip)
- Needs: The US version of Mario Kart 64 as a .z64 ROM (big-endian; .n64 must be converted first) (hashes listed by the project)
- Setup: picker (a .z64 ROM in the working directory is found automatically). On start it scans the working directory for .z64 files with the right SHA-1, else opens a file dialog, then builds mk64.o2r beside the program. spaghetti.o2r is its own asset archive. The Linux zip holds spaghetti.appimage and gamecontrollerdb.txt. Custom assets go in mods/.
- Saves: default.sav (EEPROM) in its data folder (working directory, or $SHIP_HOME), controllerPak_header.sav and controllerPak_file_<n>.sav in the same folder
- Sources: README.md:16 (US only, SHA-1 579C48E2...); README.md:20 (.z64 format); README.md:35-39 (run spaghetti.appimage, select ROM, mk64.o2r beside it); src/port/GameExtractor.cpp:29-31 (hash list), 74-87 (file dialog), 140-160 (scans '.'); src/port/pak.cpp:26-30 (save files); src/port/Engine.cpp:86 (app name spaghettify); curl -I 302 and zip listing: releases/download/1.0.0/Spaghetti-Linux.zip; libultraship src/libultraship/libultra/os_eeprom.cpp:13 (EEPROM saved as default.sav in the app directory)
- Not certain: No licence file in the repository; Release name is Bolognese Alfa (per a news site); asset names do not carry it; default.sav comes from libultraship's EEPROM code; assumed SpaghettiKart uses it

### Starfox 64: Recompiled

- Games: Star Fox 64
- Project: gitlab:sonicdcer/Starfox64Recomp
- Builds: Linux build, newest checked v1.0.3 (Starfox64Recompiled-v1.0.3-Linux-X64-Release, Starfox64Recompiled-v1.0.3-Windows-RelWithDebInfo, Starfox64Recompiled-v1.0.3-Flatpak-X64-Release, Starfox64Recompiled-v1.0.3-Linux-ARM64-Release, Starfox64Recompiled-v1.0.3-macOS-Release)
- Needs: The North American 1.1 (Rev A) version of Star Fox 64 as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and copies it as sf64.n64.us.1.1.z64 into its config folder. The Linux zip holds Starfox64Recompiled.tar.gz. Mods from Thunderstore go in its mods folder. portable.txt beside the program keeps saves beside it.
- Saves: ~/.config/Starfox64Recompiled/saves
- Sources: README.md:57 (1.1 Rev A North American); include/zelda_config.h:10 (program_id Starfox64Recompiled); src/game/config.cpp:183 (~/.config/<program_id>); src/main/main.cpp:361 (game_id sf64.n64.us.1.1); GitLab API releases v1.0.3; zip listing shows Starfox64Recompiled.tar.gz
- Not certain: README.md:110 says ~/.config/StarfoxRecompiled/saves on Linux, but the source uses program_id Starfox64Recompiled; the source path is used here

### Starship

- Games: Star Fox 64
- Project: github:HarbourMasters/Starship
- Builds: Linux build, newest checked v2.0.0 (Starship-Barnard-Alfa-Linux.zip, Starship-Barnard-Alfa-Windows.zip)
- Needs: The US 1.0 or US 1.1 (Rev A) version of Star Fox 64 as a .z64 ROM; an EU or JP ROM can add its voice language (hashes listed by the project)
- Setup: picker. On first run asks for the ROM and builds sf64.o2r beside the program. The Linux zip holds starship.appimage, config.yml, gamecontrollerdb.txt, readme.txt and an empty mods/. Zips are named after the release (Barnard Alfa).
- Saves: default.sav in its data folder (working directory, or $SHIP_HOME)
- Sources: README.md:21-24 (US 1.0 and 1.1 SHA-1); README.md:26-28 (EU/JP voices); README.md:41-49 (Linux, sf64.o2r beside the appimage); src/port/Engine.cpp:67,75 (app ship, sf64.o2r); libultraship os_eeprom.cpp:13 (default.sav); CMakeLists.txt:4,20 (2.0.0, Barnard); curl -I 302 and zip listing: releases/download/v2.0.0/Starship-Barnard-Alfa-Linux.zip
- Not certain: README says the program asks for the ROM on Windows/macOS; on Linux it only says to run the appimage, so it may also pick up a ROM in its folder; default.sav location assumed from libultraship's portable default

### Super Mario 64 Plus

- Games: Super Mario 64
- Project: github:MorsGames/sm64plus
- Builds: From its own site
- Needs: A Super Mario 64 ROM in .z64 format, which its launcher uses to build the game (hashes listed by the project)
- Setup: picker. Distributed as a launcher (MorsGames/sm64plus-launcher, v3.0.0) from MFGG that builds the game from the ROM on the user's machine. Linux launcher builds are only offered on the project's Discord.
- Sources: README.md:14 (download the launcher from MFGG); README.md:16 (Linux launcher builds on Discord); README.md:28 (launcher source repository); VERSION (v4.0.0); git ls-remote MorsGames/sm64plus-launcher: tag v3.0.0; Lutris installer 37793 (builds from source with a US base ROM)
- Not certain: Launcher asset names on GitHub not confirmed (guesses returned 404); Region US inferred from the Lutris build steps (baserom.us.z64); Save location not checked

### Superman 64: Recompiled

- Games: Superman: The New Superman Adventures
- Project: github:gcsmith/Superman64Recomp
- Builds: Build it yourself
- Needs: The US version of Superman: The New Superman Adventures as a .z64 ROM
- Setup: picker. N64: Recompiled launcher: select the ROM from its own menu the first time. Early development; must be built from source (the ROM is also needed at build time as baserom.us.z64).
- Saves: ~/.config/Superman64Recompiled/saves
- Sources: README.md (Prebuilt binaries are not currently available; release link marked coming soon); git ls-remote --tags: no tags; include/superman64_config.h:11 program_id Superman64Recompiled; src/main/main.cpp:371 rom_hash, game_id superman64.n64.us.1.0, save_type None; BUILDING.md:42 baserom.us.z64; LICENSE (GPL-3.0)
- Not certain: Save folder assumed from the N64ModernRuntime convention (~/.config/<program_id>/saves); the game's save_type is None; Program name assumed from program_id

### Zelda 64: Recompiled

- Games: The Legend of Zelda: Majora's Mask
- Project: github:Zelda64Recomp/Zelda64Recomp
- Builds: Linux build, newest checked v1.2.2 (Zelda64Recompiled-v1.2.2-Linux-X64.zip, Zelda64Recompiled-v1.2.2-Windows.zip, Zelda64Recompiled-v1.2.2-Linux-ARM64.zip, Zelda64Recompiled-v1.2.2-macOS.zip)
- Needs: The North American (US 1.0) version of Majora's Mask as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and copies it as mm.n64.us.1.0.z64 into its config folder. portable.txt beside the program keeps saves, config and mods beside it. Ocarina of Time support is announced but not released.
- Saves: ~/.config/Zelda64Recompiled/saves
- Sources: README.md:2 (Majora's Mask, and soon Ocarina of Time); README.md:51,127 (US version only); README.md:122-124 (saves); README.md:135 (portable.txt); include/zelda_config.h:10 (program_id); src/main/main.cpp:355 (game_id mm.n64.us.1.0); curl -I 302: releases/download/v1.2.2/Zelda64Recompiled-v1.2.2-Linux-X64.zip
- Not certain: The source rows point at Mr-Wiseguy/Zelda64Recomp, now Zelda64Recomp/Zelda64Recomp; The Ocarina of Time row is merged here but Ocarina of Time is not playable in any release yet (README:102 lists it as planned); add it to games when it ships; GitHub matches asset case-insensitively, so Linux-X64 vs Linux-x64 is unconfirmed

## Game Boy Color

### suiCune

- Games: Pokémon Crystal Version
- Project: github:DanZC/suiCune
- Builds: Build it yourself
- Setup: none. Game data comes from the repository's own files (pokecrystal disassembly assets), packed beside the program (base_assets.zip, crystal_ue_11.zip, crystal_ue_10.zip) by its dist script; no ROM is read (USE_ROM_FILE 0). Must be built from source. In development and may crash. Restores the Japanese Mobile Adapter online features through custom servers.
- Saves: baserom.sav and baserom.sav2 in the working directory
- Sources: README.md (in development PC port, build instructions only); git ls-remote --tags: no tags; .github/workflows/build.yml (test builds only, no uploads); tools/emu/peanut_sdl.c:16 USE_ROM_FILE 0, :83 rom_file_name baserom.gbc used to name the save, :3588-3598 PhysFS mounts; tools/create_dist.py (asset packing)
- Not certain: Whether the dist zips are needed at run time or the loose files in the working directory suffice (PHYSFS mounts '.' first); No licence file found

### The Legend of Zelda: Link's Awakening DX HD (Updated)

- Games: The Legend of Zelda: Link's Awakening DX
- Project: gitlab:bighead.0/ladxhd_updated
- Builds: Linux build, newest checked v2.0.9 (LADXHD.Patcher.v2.0.9-Linux-x64 (pixeldrain.com link), LADXHD.Patcher.v2.0.9-Windows (pixeldrain.com link), LADXHD.Patcher.Lite-Linux-x64 (GitLab package file), LADXHD.Patcher.Lite-Windows (GitLab package file))
- Needs: The folder of the original v1.0.0 PC release of Link's Awakening DX HD (the fan remake once on itch.io), whose Content and Data the patcher updates
- Setup: place (the patcher in the root folder of the v1.0.0 (or v1.1.4+) release, then run it) (LADXHD.Patcher --headless --platform=linux-x86 --graphics=opengl). The releases are patchers, not the game: run in the v1.0.0 folder they turn it into the latest version and write the Linux binaries "Link's Awakening DX HD" and Launcher (keep them together). Exit code 1 means the game executable was not found. Later updates can be done from the Launcher. A portable.txt beside the program keeps data in the program folder.
- Saves: ~/.local/share/Zelda_LA/SaveFiles, SaveFiles beside the program when portable.txt exists
- Sources: README.md:12 (requires assets from the original v1.0.0 release), :49-90 (patcher steps, headless options and exit codes); LINUX.md (patcher runs natively, choose Linux and OpenGL, binaries "Link's Awakening DX HD" and Launcher); GitLab API releases v2.0.9 (2026-10-09) asset links; ladxhd_game_source_code/ProjectZ.Core/PlatformServices.cs:225-239 (portable.txt, LocalApplicationData/Zelda_LA, SaveFiles)
- Not certain: The full patcher downloads are pixeldrain.com links, not GitLab files; only the Lite patchers are GitLab package files; The GitHub link in the row (BigheadSMZ/Zelda-LA-DX-HD-Updated) no longer answers; the project lives on GitLab; Asset names have no file extension in the GitLab link list; the downloaded file's real name and form (single binary or archive) were not checked; Patcher --platform value for x86_64 Linux is written linux-x86 in the README; No licence stated

## Game Boy Advance

### pokeemerald-multiplatform

- Games: Pokémon Emerald Version
- Project: github:gradenGnostic/pokeemerald-multiplatform
- Builds: Linux build, newest checked v1 (pokeemerald-linux.zip, pokeemerald-windows.zip)
- Setup: none. Runs the decompiled game code directly; no ROM is needed. The Linux build is a 32-bit executable (the game data uses 32-bit pointers). The Linux zip holds pokeemerald plus BG.png, BG1.png and Border.png for the frame. --voxel starts an experimental 2.5D renderer. Native Linux uses keyboard input only.
- Saves: pokeemerald.sav in the working directory
- Sources: README.md (platform table, 32-bit Linux, saving section, --voxel, Legal); git ls-remote --tags: v1; curl -I releases/download/v1/pokeemerald-linux.zip 302, pokeemerald-windows.zip 302; zls.py listing of pokeemerald-linux.zip
- Not certain: The Linux binary is 32-bit; it may need 32-bit SDL2 and SDL2_image libraries on the system; README says native Linux has keyboard input only, so a controller may need Steam Input mapping; Only one release (v1); prerelease state not seen

### pokeemerald-sdl2pc

- Games: Pokémon Emerald Version
- Project: github:NTx86/pokeemerald-sdl2pc
- Builds: Build it yourself
- Setup: none. Built from the pret decompilation's own source and assets with 'make linux'; no ROM is read at run time. No prebuilt downloads.
- Saves: pokeemerald.sav in the working directory
- Sources: README.md (PC port based on pret decompilation, Windows and Linux); INSTALL_PC.md (make linux gives pokeemerald64 or pokeemerald32); git ls-remote --tags: no tags; .github/workflows/build.yml (build checks only, no release upload); src/platform/sdl2.c:70,243 pokeemerald.sav
- Not certain: Program name pokeemerald64 is from INSTALL_PC.md for 64-bit builds; No licence file seen

### Project Picori

- Games: The Legend of Zelda: The Minish Cap
- Project: github:999sian/tmc
- Builds: Linux build, newest checked v0.9.5 (tmc-multi-linux-x86_64-v0.9.5.tar.gz, tmc-multi-windows-x86_64-v0.9.5.tar.gz, tmc-multi-linux-arm64-v0.9.5.tar.gz, tmc-multi-android-v0.9.5.apk)
- Needs: The Minish Cap GBA ROM (USA, Europe or Japan), named baserom.gba, baserom_eu.gba or baserom_jp.gba (hashes listed by the project)
- Setup: place (baserom.gba (USA), baserom_eu.gba or baserom_jp.gba next to tmc_pc). One multi-region binary checks the ROM by SHA-1. On first launch it extracts the asset cache into assets/<region>/ beside the program (a few seconds). Resolves the ROM, sounds.json and assets relative to its own location. Older releases (0.1.x) shipped a separate asset_extractor to run once.
- Saves: tmc.sav in the working directory (mGBA/VBA-M byte order; tmc.sav.bak kept when migrated)
- Sources: 999sian/tmc README.md:18-22 (ROM names and SHA-1), :28-60 (release tarballs, setup, first launch extraction), :86-90 (tmc.sav), :233-236 (GPL-3.0); .github/workflows/_build.yaml:50 (linux x86_64 region multi), :697-701 (tmc-<region>-<os>-<arch>-<tag>.tar.gz); .github/workflows/release.yaml:87-91 (uploads *.tar.gz); git ls-remote --tags: newest v1.3.1, also v1.3-E* experimental tags; https://lutris.net/games/install/40002/view (tmc-multi-linux-x86_64-v0.9.2.tar.gz); MatheoVignaud/tmc README ('this fork', older tmc-usa-<os>-<tag> archives); https://github.com/999sian/tmc/releases (via WebFetch: only release v0.9.5, Latest, 28 Sep) and releases/expanded_assets/v0.9.5 (asset names)
- Not certain: Tags v1.3.x and v1.3-E* exist in git but the only published release is v0.9.5; use the latest release, not the highest tag; The row linked MatheoVignaud/tmc, a contributor's fork; the original project is 999sian/tmc (Project Picori); Whether the save is next to the binary or in the working directory: README says working directory; done path assumes the USA ROM

### Sonic Advance Trilogy (sa2)

- Games: Sonic Advance 2
- Project: github:SAT-R/sa2
- Builds: Build it yourself
- Setup: none. Decompilation that also builds a widescreen (426x240) SDL port with 'make sdl'; graphics, music and tilemaps are extracted into the repository, so no ROM is read at run time. Work in progress, no prebuilt downloads.
- Saves: sa2.sav in the working directory
- Sources: README.md (builds sa2.sdl with make sdl, sa2.sdl_win32.exe, widescreen 426x240, not completed); git ls-remote --tags: no tags; .github/workflows/build.yml (CI only); src/platform/pret_sdl/sdl2.c:154 sa2.sav
- Not certain: Whether the SDL port can be built without a base ROM was not confirmed from INSTALL.md; No licence file found

## GameCube

### Dusklight

- Games: The Legend of Zelda: Twilight Princess, The Legend of Zelda: Twilight Princess
- Project: github:TwilitRealm/dusklight
- Builds: Linux build, newest checked v2.0.3 (Dusklight-v2.0.3-linux-x86_64.AppImage, Dusklight-v2.0.3-linux-arm64.AppImage, Dusklight-v2.0.3-win32-x86_64.zip, Dusklight-v2.0.3-macos-x86_64.zip, Dusklight-v2.0.3-android-arm64.apk)
- Needs: A Twilight Princess disc image, GameCube or Wii (any commercial disc except the Korean Wii release)
- Setup: picker. A pre-launch screen asks for the disc image with a file dialog, verifies it and remembers the path in its settings (backend.isoPath). With a Wii disc the GameCube version's layout is presented. Needs D3D12, Vulkan 1.1+ or Metal.
- Saves: GCI files in its memory card folder (exact Linux location not confirmed)
- Sources: README.md (setup, supported discs, official site); https://github.com/TwilitRealm/dusklight/releases/expanded_assets/v2.0.3 (asset names, via WebFetch); curl -I Dusklight-v2.0.3-linux-x86_64.AppImage 302; https://twilitrealm.dev/install/ (x86_64 AppImage works on Steam Deck); src/dusk/ui/prelaunch.cpp:88 (disc filters), :267-272 (isoPath saved), :795 (file dialog); src/dusk/save_manager.cpp (GCI saves); .github/workflows/build.yml:73-81 (AppImage); LICENSE (CC0 1.0)
- Not certain: Settings and save folder on Linux not confirmed; Whether a disc path can be passed on the command line was not checked

### forest

- Games: Animal Crossing
- Project: github:ACreTeam/forest
- Builds: Build it yourself
- Needs: The US Animal Crossing disc image (GAFE01, revision 0)
- Setup: none. Work-in-progress PC port; must be built from source, with the disc image copied to orig/GAFE01_00 at build time. No releases or tags.
- Sources: README.md (work-in-progress PC port, supported GAFE01_00, disc in orig/GAFE01_00, build steps); git ls-remote --tags: none; no .github folder; LICENSE (CC0 1.0)
- Not certain: How the built port loads game data at run time and where it saves were not found; README build steps still clone Prakxo/ac-decomp

### Foxhollow

- Games: Star Fox Adventures
- Project: github:JackPriceBurns/foxhollow
- Builds: From its own site, newest checked v1.0.22 (https://cdn.foxhollow.dev/launcher/latest/Foxhollow-x86_64.AppImage (200), https://cdn.foxhollow.dev/launcher/latest/Foxhollow-arm64.dmg (linked from the site))
- Needs: A Star Fox Adventures GameCube disc image (any copy)
- Setup: picker ({FILE}). Players use the official launcher (Linux launcher AppImage on cdn.foxhollow.dev), which downloads and updates the game, manages memory cards and offers mods. The game program itself (foxhollow, published per release to the CDN as foxhollow-<tag>-linux.tar.gz) takes the disc path as its first argument or FOXHOLLOW_DISC. FOXHOLLOW_MEMORY_CARD and FOXHOLLOW_USER_DIR set the save and user folders.
- Saves: memory cards managed by the launcher (FOXHOLLOW_MEMORY_CARD path; default location not confirmed)
- Sources: README.md (use the launcher from foxhollow.dev; ./foxhollow path/to/disc.iso; any copy of the game); src/main.c:81-85 (disc from argv[1] or FOXHOLLOW_DISC); port/src/foxhollow_config.c:126-129 (FOXHOLLOW_MEMORY_CARD, _AUTOSAVE, _USER_DIR, _CACHE_DIR); .github/workflows/publish.yml:101-117 (foxhollow-<tag>-windows.zip, foxhollow-<tag>-linux.tar.gz), :149-163 (uploaded to the project's CDN, not GitHub); curl https://foxhollow.dev (launcher link Foxhollow-arm64.dmg); curl -I cdn.foxhollow.dev/launcher/latest/Foxhollow-x86_64.AppImage 200; git ls-remote --tags: newest v1.0.22; LICENSE (CC0 1.0)
- Not certain: The Linux launcher URL was found by guessing (200), it is not linked on the site; the site lists Linux as supported; Game tarball CDN URLs are returned by the CDN API at publish time and were not found; Whether the launcher shows a disc picker was not confirmed (the site lists v0.2.0 for the launcher); Release workflow marks some tags as prereleases (channel flags); usual channel not checked

### Metaforce

- Games: Metroid Prime
- Project: github:AxioDL/metaforce
- Builds: Build it yourself
- Needs: A Metroid Prime GameCube disc image
- Setup: path ({FILE}). Takes the disc image as its first positional argument; without it a file dialog asks for the image at every start. Builds are currently unavailable while the rewrite on the matching decompilation stabilises; CI builds a Metaforce-*.AppImage for Linux. The only GitHub release (p12) is an outdated HECL prototype extractor, not the game.
- Sources: README.md (rewritten on the decompilation; builds currently unavailable; Linux runs Metaforce-*.AppImage; CLI options); src/Metaforce/Runtime.cpp:300-346 (disc picker filters, positional dvd argument), :462 (picker when no argument); .github/workflows/build.yml:78-84 (AppImage artifact); https://github.com/AxioDL/metaforce/releases (via WebFetch: only p12, outdated HECL prototype, pre-release); git ls-remote tags v0.1.1 to v0.1.3 have no GitHub release; LICENSE (MIT)
- Not certain: Which disc revisions the runtime accepts is not stated (the decomp knows GM8E 0-00/0-01/0-02, PAL and JP); Save location not found; it emulates Memory Card A; Older engine builds were on releases.axiodl.com; not checked

### Party Board

- Games: Mario Party 4
- Project: github:mariopartyrd/marioparty4
- Builds: Windows build (Proton), newest checked partyboard_0.2.0 (partyboard_alpha_0.2.0_x64.zip, partyboard_alpha_0.2.0_x86.zip, partyboard_alpha_0.2.0_android_arm64-v8a.zip)
- Needs: The US Mario Party 4 disc image (GMPE01, revision 0) as .iso or .rvz
- Setup: place (the disc image renamed to GMPE01_00 in the program folder). If the image is not in the folder it asks to browse for it at every start. Alpha builds; a controller is required; the x64 build may crash in more places than x86. Releases before 0.1.1 needed the disc's files extracted with Dolphin into GMPE01_00/files.
- Saves: %APPDATA%/Party Board (inside the Proton prefix: drive_c/users/steamuser/AppData/Roaming/Party Board); Dolphin-compatible save from 0.2.0
- Sources: https://github.com/mariopartyrd/marioparty4/releases (via WebFetch: all partyboard tags are pre-releases; 0.2.0 setup and save notes); https://github.com/mariopartyrd/marioparty4/releases/expanded_assets/partyboard_0.2.0 (asset names); curl -I partyboard_alpha_0.2.0_x64.zip; README.md supported versions GMPE01_00, GMPE01_01; src/port/dvd.c (tag partyboard_0.2.0: chdir GMPE01_00/files)
- Not certain: Revision: release notes say GMPE01 v1.0; press says Rev 0 and Rev 1 USA both work; No Linux build; runs through Proton; Releases are drafted by hand (no release workflow), so asset names may change

## Nintendo DS

### Pokémon Platinum PC Port

- Games: Pokémon Platinum Version
- Project: github:cybervisi0n/pokeplatinum
- Builds: Linux build, newest checked v0.1.11 (release_linux.zip, release_win64.zip)
- Needs: The US Pokémon Platinum DS ROM (CPUE01) as an .nds file (hashes listed by the project)
- Setup: picker. On first launch a dialog asks for the .nds ROM and its contents are extracted into the program folder; after that the game starts directly. The Linux zip holds pokeplatinum.AppImage, main, firmware.bin and header.bin. Swapping msgdata/msg.narc, msgdata/pl_msg.narc and msgdata/scenario/scr_msg.narc from another language changes most text. Tilde opens settings and debug tools.
- Sources: README.md (setup guide: US ROM CPUE01, first-launch extraction dialog, files extracted beside main, language files); platinum.us/rom_rev0.sha1, rom_rev1.sha1 (ROM SHA-1, revisions 0 and 1); https://github.com/cybervisi0n/pokeplatinum/releases/expanded_assets/v0.1.11 (via WebFetch); curl -I release_linux.zip 302; zls.py listing; tools/scripts/package_artifacts_linux.sh
- Not certain: Save location not found; done file assumes extraction writes msgdata/ beside the program; Whether both ROM revisions are accepted by the port is not stated; README only says US (CPUE01); Which of main and pokeplatinum.AppImage to run on Linux: both ship; AppImage assumed

## Wii

### Kirby Wii Recomp

- Games: Kirby's Return to Dream Land
- Project: github:ExpansionPak/ModernGekko
- Builds: Linux build, newest checked kirby (KirbyWiiRecomp-Linux-x86_64.zip, KirbyWiiRecomp-Windows-x86_64.zip)
- Needs: The North American Kirby's Return to Dream Land disc image (SUKE01) as WBFS or ISO
- Setup: picker. KirbyWiiRecomp is a launcher: pick the disc image in it and it extracts the game into its data folder, sets up a sideways Wii Remote profile for a connected controller, chooses an audio backend and starts KirbyRecomp. The disc image is not modified. The Linux zip has one top folder KirbyWiiRecomp/ with bundled libraries in lib/. Built on the ModernGekko GameCube/Wii recomp runtime (Dolphin based).
- Saves: kirby-wii-recomp data folder (%LOCALAPPDATA%\kirby-wii-recomp on Windows; Linux location not confirmed, probably ~/.local/share/kirby-wii-recomp)
- Sources: https://github.com/ExpansionPak/ModernGekko/releases/tag/kirby (via WebFetch: KirbyWii recomp, Latest, notes about the Linux build); releases/expanded_assets/kirby (asset names); zls.py listing of KirbyWiiRecomp-Linux-x86_64.zip (KirbyWiiRecomp, KirbyRecomp, gSUKE01_recomp.so, lib/, Sys/); README.md and LICENSE inside the zip (SUKE01 only, launcher extracts the game, saves and config in kirby-wii-recomp); ModernGekko README.md (runtime for GameCube/Wii recomps)
- Not certain: The release notes say it will move to its own Kirby Wii repository once public; the tag 'kirby' may not be updated in place; Linux data and save folder not confirmed (README inside the zip describes Windows); Linux audio fixed for non-Debian systems per release notes; untested

### WiiCompiled

- Games: Mario Kart Wii
- Project: github:patchzyy/wiicompiled
- Builds: Linux build, newest checked v0.2.34 (WiiCompiled-Setup-x86_64.AppImage, WiiCompiled-Setup.exe, WiiCompiled-Setup.pkg)
- Needs: A clean, unmodified PAL Mario Kart Wii disc image (RMCP01); other regions and patched executables are rejected
- Setup: path (WiiCompiled-Setup-x86_64.AppImage install --game {FILE}). The release is a command-line setup tool, not the game: it verifies and extracts the disc, then statically recompiles and builds the native game on this machine (about 20 GB free during install, about 5 GB after; it takes a long time). Default install folder ~/.local/share/WiiCompiled/Install/Base (Retro Rewind: Install/RetroRewind with --retro-dir). Start it with 'launch-base' or 'launch-retro'. Wheel Wizard is the official front end.
- Saves: ~/.local/share/WiiCompiled (runtime user state: Config.toml, NAND)
- Sources: README.md (PAL RMCP01 only, accepted formats, 20 GB, Wheel Wizard, setup translates locally); .github/workflows/package.yml:217-280 (release assets WiiCompiled-Setup.exe, -x86_64.AppImage, -aarch64.AppImage, .pkg; full non-prerelease v<semver> releases); curl -I v0.2.34 WiiCompiled-Setup-x86_64.AppImage 302; Launcher/WiiCompiled.Setup.Linux/Program.cs:12-58 (commands install, launch-base, launch-retro), :312-314 (default install dir), :351-364 (usage); Launcher/WiiCompiled.Setup.Linux/Models.cs:25 (~/.local/share/WiiCompiled/install-state.json); Launcher/WiiCompiled.Setup.Common/RuntimeConfiguration.cs:26-29 (LocalApplicationData/WiiCompiled/Config.toml); LICENSE (GPL-3.0)
- Not certain: Install needs a compiler toolchain path on Linux (options --cc, --cxx, --cmake, --ninja); whether the AppImage bundles them was not confirmed; done path is the setup's state file, which may exist before a successful build; Exact game program name inside the install folder not found

## Genesis

### Streets of Rage 2 New Era

- Games: Streets of Rage 2
- Project: https://www.sor2newera.com/
- Builds: From its own site, newest checked 3.1.0
- Needs: A Streets of Rage 2 Mega Drive ROM (the developers suggest the one from the Steam release)
- Setup: picker. On first launch it asks for the ROM path and a mods folder. Downloads are a zip per platform from its own site (Linux build named like 'SOR2 NE 3.1.0 Linux.zip'). Unity game, no emulation; adds 4-player local and online co-op, widescreen and a 30th Anniversary mode.
- Achievements: Has its own in-game achievements (format and file not known)
- Sources: https://lutris.net/games/install/39811/view (SOR2 NE 3.1.0 Linux.zip from sor2newera.com, SOR2 New Era.x86_64, ROM copied into the game folder, ROM path set on first launch); https://www.timeextension.com/news/2022/11/fan-made-streets-of-rage-2-update-adds-online-co-op-widescreen-support-and-more (needs the original ROM, download at sor2newera.com); segabits.com 2022 article via search (Unity, achievements, Classic and 30th Anniversary modes)
- Not certain: sor2newera.com did not resolve from the container; whether the site and downloads still exist is unknown; Version 3.1.0 is from a 2022 Lutris installer; a newer version may exist; ROM extensions and any checksum not confirmed; save location (Unity persistentDataPath) unknown; No source repository found; closed-source fan project; Achievements format unknown

## PlayStation

### Crash Bandicoot: Recompiled

- Games: Crash Bandicoot
- Project: github:Matteo842/CrashBandicoot-Launcher
- Builds: Linux build, newest checked 2.1 (CrashBandicoot-Linux, CrashBandicoot.exe)
- Needs: The NTSC-U PlayStation disc of Crash Bandicoot (SCUS-94900) as a .chd or a .cue with one MODE2/2352 .bin track
- Setup: picker (--run "{FILE}"). The launcher's Select disc button picks the image (a disc in the program's folder is found on its own). The first start recompiles the game from the disc into game/ beside the program, which takes a minute or two. The image must stay in place: levels and audio stream from it. --prepare builds without playing. The download is a single file; chmod +x is needed.
- Saves: save/ (beside the program), settings.json (beside the program)
- Sources: README.md:41-67 (downloads CrashBandicoot.exe and CrashBandicoot-Linux, Select disc, --run); README.md:89-97 (NTSC-U single MODE2/2352 track, image must stay, --prepare/--run, settings.json); README.md:106-111 (game/ built locally, save/ and settings.json beside the exe); CrashBandicoot.Launcher/Recomp/DiscValidator.cs:21-22 (SCUS-94900, SCUS_949.00); curl -I releases/download/2.1/CrashBandicoot-Linux 302; LICENSE (MIT)
- Not certain: The batch row had no port name; this project was found by search (most visible Crash 1 PC port); Whether the Linux file is a self-contained .NET build (no runtime needed) not checked; settings.json as the done marker exists after the first run even before a disc is set; a file inside game/ would be a better marker but was not identified; Android .apk also published

### CTR Native

- Games: Crash Team Racing
- Project: github:CTR-tools/ctr-native
- Builds: Linux build, newest checked beta-7.1 (ctr-native-beta-7.1-linux-x86.tar.gz, ctr-native-beta-7_1-windows-x86.zip)
- Needs: The NTSC-U PlayStation disc of Crash Team Racing as a single-track raw .bin (MODE2/2352, data track from byte 0); a cooked .iso will not do
- Setup: place (assets/ctr-u.bin). Reads the game straight from the image; extracted files in assets/ override it for modding. Single static 32-bit executable with SDL3 built in.
- Saves: memcards/ (relative to the working folder)
- Sources: README.md:105-122 (release needs ctr_native and assets/ctr-u.bin), :124 (raw MODE2/2352 bin, not .iso); package-linux.sh:9,83 (ctr-native-<version>-linux-x86.tar.gz); CMakeLists.txt:7-12 (32-bit target only); platform/native_memcard.c:22 (memcards default root); github.com/CTR-tools/ctr-native/releases/expanded_assets/beta-7.1 (asset list); curl -I releases/download/beta-7.1/ctr-native-beta-7.1-linux-x86.tar.gz 302
- Not certain: The batch row had no port name; this project was found by search; Linux build is 32-bit x86; static, but needs 32-bit GL/graphics libraries from the system (SteamOS has them through Steam's runtime, plain distros may not); Windows asset uses an underscore version (beta-7_1) while the Linux one uses a dot; All tags are 'beta-N'; whether GitHub marks them pre-release unknown; memcards/ location assumed relative to the working folder (default root name only)

### LSD: Revamped

- Games: LSD: Dream Emulator
- Project: github:Figglewatts/LSDRevamped
- Builds: From its own site, newest checked 0.3.0 (lsdr-0.3.0-linux.zip, lsdr-0.3.0-windows.zip, lsdr-0.3.0-mac.zip)
- Setup: none. Downloads are on itch.io only (no GitHub releases). Unzip into one folder and run LSDR.x86_64.
- Saves: ~/.config/unity3d/Figglewatts/LSDR/saves, ~/.config/unity3d/Figglewatts/LSDR/settings.json
- Sources: https://figglewatts.itch.io/lsd-revamped (lsdr-0.3.0-linux.zip, LSDR.x86_64, Player.log path, In development); LSDR/ProjectSettings/ProjectSettings.asset (companyName Figglewatts, productName LSDR, bundleVersion 0.3.0-pre.5); LSDR/Assets/Scripts/Game/GameSaveSystem.cs:35 (persistentDataPath/saves); LSDR/Assets/Scripts/Game/SettingsSystem.cs:71; git ls-remote: only tag 0.3.0-pre.1
- Not certain: itch.io downloads may need the itch app or a browser; no direct URL; No sign in the source or the itch page that original game files are needed; treated as needing none; Still in development (pre-release versions)

### PsyDoom

- Games: Doom (1993), Final Doom
- Project: github:BodbDearg/PsyDoom
- Builds: Linux build, newest checked releases/1.1.1 (PsyDoom_1.1.1_Linux_x86_64.AppImage, PsyDoom_1.1.1_Windows_x86_64.zip, PsyDoom_1.1.1_Linux_AArch64.AppImage, PsyDoom_1.1.1_MacOS_x86_64_Arm64.zip)
- Needs: A PlayStation disc of Doom or Final Doom (any region or edition, also the demo disc or GEC Master Edition beta 3/4) as a .cue with its .bin
- Setup: path (-cue "{FILE}"). The disc can also be picked in its built-in launcher window or set as CueFilePath in game_cfg.ini; relative paths are relative to the working folder. Linux sound needs PulseAudio.
- Saves: ~/.local/share/com.codelobster/PsyDoom/ (Save1.sav to Save3.sav, Quick.sav, Auto.sav with a per-game prefix, plus the .ini config files)
- Sources: README.md:37-42 (download, .cue, supported discs); game/PsyDoom/ProgArgs.cpp:73-74 (-cue); game/PsyDoom/Config/ConfigSerialization_Game.cpp:23-37 (CueFilePath); game/PsyDoom/Utils.cpp:32-33,86 (SDL_GetPrefPath com.codelobster/PsyDoom); game/PsyDoom/SaveAndLoad.cpp:676-693 (save file names in user data folder); github.com/BodbDearg/PsyDoom/releases/expanded_assets/releases/1.1.1 (asset list, Latest, not pre-release); curl -I releases/download/releases/1.1.1/PsyDoom_1.1.1_Linux_x86_64.AppImage 302
- Not certain: Tags are named releases/<version>, so the download URL path has a slash in the tag; Final Doom added as a second game; batch row named only Doom; Exact save file prefix per game not checked (Game::gConstants.saveFilePrefix)

### ReChan

- Games: Jackie Chan Stuntmaster
- Project: github:SilverwireGames/ReChan
- Builds: Linux build, newest checked v1.0.1 (rechan-linux64.tar.gz, rechan-win64.zip)
- Needs: The NTSC-U PlayStation disc of Jackie Chan Stuntmaster (SLUS-00684) as a .bin or .iso image
- Setup: place (discimage/<any name>.bin or .iso (only one image in the folder)). On first launch it checks the disc's boot file is SLUS-00684 and extracts the assets beside the program (folders xc, fe, tim and license.tim); the disc image can be deleted afterwards.
- Saves: userfiles/jcsSAVE<n>.sav and userfiles/jcsAUTOSAVE.sav (relative to the program folder)
- Sources: README.md:54-67 (discimage folder, one image, built-in extractor); README.md FAQ (NTSC-U SLUS-00684 only); src/pc/apppaths.h (userfiles saves, game.ini, discimage); src/extra/psxdiscextractor.cpp:15-18 (assets present check), :291 (expected serial); scripts/pack-linux64.sh:10, scripts/pack-win64.ps1:8 (archive names); curl -I releases/download/v1.0.1/rechan-linux64.tar.gz 302
- Not certain: Paths are relative to the working folder, so Start in must be the program folder; Whether a cue/bin with several tracks is accepted not checked (README says .bin or .iso)

### REDRIVER2

- Games: Driver 2
- Project: github:OpenDriver2/REDRIVER2
- Builds: Linux build, newest checked 8.0 (REDRIVER2_Linux_Release.tar.gz, REDRIVER2_Linux_Release_dev.tar.gz, REDRIVER2_Win32_Release.zip, REDRIVER2_Win32_Release_dev.zip)
- Needs: Both discs of the PAL English (SLES-02993/SLES-12993) or NTSC US (SLUS-01161/SLUS-01318) PlayStation version of Driver 2, each as a single .bin image
- Setup: place (install/Driver2CD1.bin and install/Driver2CD2.bin). config.ini [cdfs] image=install/Driver2CD1.bin reads the game from disc 1. Movies and audio must then be extracted once with _convert_cd_fmv_xa.sh, which runs jpsxdec and needs Java. Needs SDL2 and OpenAL from the system.
- Saves: ~/.driver2/progress.dat, ~/.driver2/config.dat
- Sources: README.md:17-19 (translated from MIPS to C); github.com/OpenDriver2/REDRIVER2/wiki/Installation-instructions (discs, install/ names, Linux steps, Java); data/config.ini:75-77 ([cdfs] image); data/_convert_cd_fmv_xa.sh (CD1/CD2 paths, Java check); src_rebuild/Game/C/loadsave.c:89-98,274-276 ($HOME/.driver2, progress.dat); appveyor.yml:47-54 (artifacts); curl -I releases/download/8.0/REDRIVER2_Linux_Release.tar.gz 302
- Not certain: Which file proves the movie conversion finished is not known (jpsxdec output names not read); Java is required only for the one-time conversion; Cartridge would have to run the script or explain it; A separate Java Launcher with a setup wizard exists (Windows instructions); not checked for Linux; Region: both PAL English and NTSC US are supported

### Severed Chains

- Games: The Legend of Dragoon
- Project: github:Legend-of-Dragoon-Modding/Severed-Chains
- Builds: Linux build, newest checked recommended-build-2.1 (Severed_Chains_Linux.tar.gz, Severed_Chains_Steam_Deck.tar.gz, Severed_Chains_Windows.zip)
- Needs: All four discs of the North American PlayStation version of The Legend of Dragoon (SCUS-94491, 94584, 94585, 94586) as .iso or .bin images
- Setup: place (isos/ (any file names, one image per disc)). On first start it reads each image's disc ID (PAL and Japanese discs are refused) and unpacks the assets into files/. The launch script downloads a Java 25 runtime into jdk25/ the first time (Steam Deck build opens it in Konsole). Java cannot start from a path containing a colon.
- Saves: saves/ (*.dsav, relative to the program folder)
- Sources: .github/workflows/publish-release.yml:75-123,160-168 (archive names, prerelease false); .github/workflows/publish.yml:69-70 (isos help file), 167-169 (devbuild tag); build.gradle:225-234 (launch-linux or launch-steamdeck renamed to launch); launch-steamdeck (jdk25 download, colon check); src/main/java/legend/game/unpacker/Unpacker.java:47-48 (disc IDs), 61 (files/), 311 (files/version), 379 (isos); src/main/java/legend/game/saves/SaveManager.java:79-80 (saves/*.dsav); README.md:62,86; curl -I releases/download/recommended-build-2.1/Severed_Chains_Linux.tar.gz 302
- Not certain: There is also a rolling 'devbuild' release with the same asset names; recommended-build-2.1 picked as the stable one by name; Steam Deck archive differs only in the launch script (Konsole for the Java download); Whether all four discs are required before unpacking starts was not read in detail

### SymphonyRecomp

- Games: Castlevania: Symphony of the Night
- Project: github:BlackLabelHQ/SymphonyRecomp
- Builds: Linux build, newest checked v0.5.1b (SymphonyRecomp-v0.5.1b-linux-x64.tar.gz, SymphonyRecomp-v0.5.1b-windows-x64.zip)
- Needs: The North American (NTSC-U, SLUS-00067) PlayStation disc of Castlevania: Symphony of the Night as a .cue with its .bin tracks, or a .chd
- Setup: picker. On first start a disc picker pop-up asks for the .cue or .chd; the path is saved as CdPath in settings.json in the working folder and checked for SLUS_000.67. run.sh installs the .NET 10 runtime into ~/.dotnet if missing, then starts the sotn program.
- Saves: carda.sav and cardb.sav (memory cards) in the working folder
- Sources: .github/workflows/release.yml:57-60,98-126 (linux-x64 tar.gz with run.sh and sotn); curl -I releases/download/v0.5.1b/SymphonyRecomp-v0.5.1b-linux-x64.tar.gz 302; README.md:41-47 (NA disc, bin/cue or CHD); misc/DiscCheck.cs:12,40 (SLUS_000.67 check); RecompOne.Runtime/Host/Window/HostWindow.cs:423-441 (DiscPickerPopup, waits for valid CdPath); RecompOne.Runtime/Config/ConfigManager.cs:25 (settings.json, relative); RecompOne.Runtime/Config/GameConfig.cs:86-88 (carda.sav, cardb.sav)
- Not certain: Beta (tags end in b); unclear whether GitHub marks them pre-release; settings.json and memory cards are relative to the working folder, so Start in must be the program folder; Needs the .NET 10 runtime; run.sh downloads it into ~/.dotnet on first run (network needed)

### WipeOut Phantom Edition

- Games: Wipeout
- Project: github:wipeout-phantom-edition/wipeout-phantom-edition
- Builds: Windows build (Proton), newest checked v1.2.256 (wipeout-x64-release.zip)
- Needs: The USA PlayStation disc of Wipeout as a .cue with its nine .bin tracks (or the 517 game files copied from the disc)
- Setup: place (wipeout/diskimages/ (the .cue and all .bin tracks)). On start it extracts missing data files and the music from the image (a slow hash-based search on machines with under 8 cores). Loose files can go in wipeout/wipeoutgame and music in wipeout/music. The image can be removed once the main menu has loaded once. Runs through Proton (Proton Experimental suggested).
- Sources: README.md:4,31-71 (USA data, diskimages, 9 bin + cue, wipeoutgame, music); github.com/wipeout-phantom-edition/wipeout-phantom-edition/releases/expanded_assets/v1.2.256 (only wipeout-x64-release.zip); curl -I releases/download/v1.2.256/wipeout-x64-release.zip 302; https://www.timeextension.com/guides/how-to-install-wipeout-phantom-edition-on-steam-deck (Proton Experimental, exe in the wipeout folder); zip listing: wipeout/wipeout.exe, wipeout/diskimages/, wipeout/wipeoutgame/, wipeout/phantom/gamedatamanifest
- Not certain: Program confirmed as wipeout/wipeout.exe by listing the zip (range reads); Save location unknown; Source code is not in the repo (README and releases only); licence unknown; All tags point at the same commit; newest by version is v1.2.256

### wipEout Rewrite

- Games: Wipeout
- Project: github:phoboslab/wipeout-rewrite
- Builds: Build it yourself
- Needs: The game data of the NTSC PlayStation Wipeout (files from the disc, not the image) plus some menu models from the PC version; music as .qoa and the intro as MPEG1 are optional
- Setup: place (wipeout/ beside the program (wipeout/textures/, wipeout/music/track01.qoa ...)). Assets are read from SDL_GetBasePath (the program folder) unless built with PATH_ASSETS. Analogue sticks must be bound in Options.
- Saves: ~/.local/share/phoboslab/wipeout/save.dat
- Sources: README.md:235-247 (assets not included, NTSC data plus PC menu models, folder layout); src/platform_sdl.c:369-385 (SDL_GetBasePath assets, SDL_GetPrefPath phoboslab/wipeout userdata); src/wipeout/game.c:844 (save.dat); git ls-remote: no tags; no .github/workflows
- Not certain: No releases: Build It Yourself; A browser version is playable on the project's site; not useful to Cartridge; The game data is a folder of extracted files, not a disc image; Cartridge cannot prepare it from a .bin

## PlayStation 2

### 3SX

- Games: Street Fighter III: 3rd Strike
- Project: github:crowded-street/3sx
- Builds: Linux build, newest checked rolling-pre-release (3SX-d6a54f7-linux-x86_64.tar.gz, 3SX-d6a54f7-linux-arm64.tar.gz, 3SX-d6a54f7-windows.zip, 3SX-d6a54f7-macos.dmg)
- Needs: The PlayStation 2 disc of Street Fighter III: 3rd Strike or Street Fighter Anniversary Collection as an .iso (only THIRD/SF33RD.AFS is used)
- Setup: picker (~/.local/share/CrowdedStreet/3SX/resources/SF33RD.AFS). The start-up wizard opens a file dialog for the .iso and copies THIRD/SF33RD.AFS into the resources folder; it can also be copied there by hand. The AFS is checked by SHA-256 f9fa50f3a124ec9fa9465aa9c8546c2d867887eb39f711a070762a0324ba5604.
- Saves: ~/.local/share/CrowdedStreet/3SX/saves, ~/.local/share/CrowdedStreet/3SX/config
- Sources: README.md:35-44 (PS2 copy, startup wizard, SF33RD.AFS); docs/resources.md, docs/config.md (Linux folders); src/port/resources.c:14 (expected AFS SHA-256), :201-202 (iso file dialog); src/port/paths.c:5-36 (CrowdedStreet/3SX pref path and user storage); src/sf33rd/Source/PS2/mc/savesub.c:26 (saves folder); .github/workflows/release.yml (3SX-<sha7>-linux-x86_64.tar.gz, rolling-pre-release tag, --prerelease); curl -I releases/download/rolling-pre-release/3SX-d6a54f7-linux-x86_64.tar.gz 302
- Not certain: Asset names carry the commit's short SHA and change with every rolling build; Program path inside the tar not seen: CPack TGZ likely puts it under a top folder then bin/3sx; Save files go through SDL_OpenUserStorage, assumed to be the same pref path on Linux; Region of the PS2 disc not restricted in what was read; only the AFS hash matters (a hash, not md5/sha1, so not in needs)

### Grand Theft Auto: Vice City Stories PC Edition

- Games: Grand Theft Auto: Vice City Stories
- Project: https://www.moddb.com/
- Builds: From its own site
- Needs: A clean, unmodded PC install of Grand Theft Auto: San Andreas (the mod is a total conversion of it, not built from the console game)
- Setup: picker. Total-conversion mod for the PC version of GTA: San Andreas (codename Blue Hesper), distributed on ModDB as an installer of about 768 MB; the team suggests installing into a new folder rather than the San Andreas one. Windows only, through Proton.
- Sources: https://pcgamer.com/grand-theft-auto-vice-city-stories-gets-a-pc-mod (San Andreas mod, clean install); dsogaming.com/?p=51534 via search (ModDB download, ~768 MB, new folder, beta)
- Not certain: Not a port of the console game: it needs GTA San Andreas for PC, which Cartridge cannot provide from a PS2 disc; Exact ModDB page, current version and program name not found; Coverage describes a beta (first chapter); availability today not confirmed; Probably out of scope for the recomp catalogue

### Half-Life: Decay

- Games: Half-Life: Decay
- Project: https://modstalgia.com/half-life/mods/half-life-decay
- Builds: From its own site
- Needs: A PC copy of Half-Life (Steam or otherwise) to run the mod in; the PS2 game itself is not used
- Setup: place (the decay folder in the Half-Life root folder (next to valve/)) (-game decay). A GoldSrc mod: pick it under Change Game in Half-Life, or restart Steam so it shows as its own entry. Fan PC ports since 2008; Decay: Singularity (decay_single, single player with saves) and Solo Mission (decaysolodemo) are other versions.
- Sources: https://modstalgia.com/half-life/mods/half-life-decay (PC port of the PS2 expansion, decay folder in the game root, Change Game); wiki.sourceruns.org/CategoryDecay.html and runthinkshootlive.com via search (2008 port, 7z, Steam install notes)
- Not certain: Not a port that reads the PS2 disc: it needs Half-Life for PC, so it may not fit the recomp catalogue; Whether its client/server libraries include Linux builds (Steam's native Half-Life) or need Proton is unknown; Several competing ports exist; which one PCGamingWiki means was not confirmed; '-game decay' is the standard GoldSrc mod switch, not seen on the mod's own page

### OpenGOAL

- Games: Jak and Daxter: The Precursor Legacy, Jak II, Jak 3
- Project: github:open-goal/launcher
- Builds: Linux build, newest checked v2.11.2 (OpenGOAL-Launcher_2.11.2_amd64.AppImage, OpenGOAL-Launcher_2.11.2_amd64.deb, OpenGOAL-Launcher_2.11.2_x64_en-US.msi)
- Needs: Your own PlayStation 2 disc of each Jak game as an .iso (or its extracted folder)
- Setup: picker. The launcher downloads the OpenGOAL game release (open-goal/jak-project) itself, then asks for the .iso per game and runs its extractor, which validates, decompiles and compiles the game. The game program gk is started by the launcher.
- Saves: ~/.config/OpenGOAL/jak1/saves, ~/.config/OpenGOAL/jak2/saves, ~/.config/OpenGOAL/jak3/saves, ~/.config/OpenGOAL/<game>/settings
- Sources: open-goal/launcher README.md:5 (distributes OpenGOAL releases); github.com/open-goal/launcher/releases/expanded_assets/v2.11.2 (asset list); curl -I releases/download/v2.11.2/OpenGOAL-Launcher_2.11.2_amd64.AppImage 302; src-tauri/src/commands/binaries.rs:133-177 (extractor with --folder/--game), 471-492 (gk -boot --game); jak-project common/util/FileUtil.cpp:68-104 (XDG_CONFIG_HOME/OpenGOAL/<game>/saves and settings); jak-project LICENSE (ISC), README.md:61 (Jak 3 has a good amount of work left)
- Not certain: Jak II and Jak 3 support status in the current release not checked (Jak 3 was newer); The launcher's own install folder (where it puts game versions and extracted data) is chosen by the user in the launcher and not recorded here; jak-project's own releases also carry a Linux tar of gk/goalc/extractor, an alternative to the launcher (names not checked)

### reLCS

- Games: Grand Theft Auto: Liberty City Stories
- Project: https://gitea.com/initdream/relcs
- Builds: Build it yourself
- Needs: The original game files of Grand Theft Auto: Liberty City Stories (the folder holding MODELS/GTA3.IMG and the rest)
- Setup: place (the reLCS program goes inside the GTA LCS game folder and runs from there). Optional extras from the repo's gamefiles/ folder (controller mappings, button icons) are copied into the game folder too. Build with CMake (GLFW or SDL2).
- Saves: userfiles/GTAVCsf<n>.b (relative to the game folder, on Linux)
- Sources: gitea.com/initdream/relcs README.md (requires original assets, move the executable into the LCS folder, release binary mention); BUILDING.md:160-166 (running, gamefiles extras); src/skel/glfw/glfw.cpp:125-162 (userfiles folder off Windows); src/save/PCSave.cpp:25,34 (GTAVCsf<n>.b); src/core/Game.cpp:471 (MODELS\GTA3.IMG); git ls-remote: mirror has only branch lcs, no tags
- Not certain: Only a mirror (gitea.com/initdream/relcs) was found; the original GitHub repo appears gone, so no releases and repo null; PCGamingWiki row is 'Grand Theft Auto Re: Liberty City Stories'; assumed to be this reLCS project; Whether the PS2 or PSP game files are needed is not stated in what was read; Save file prefix GTAVCsf left over from reVC code

## PlayStation 4

### PT for PC

- Games: P.T.
- Project: https://gamejolt.com/
- Builds: From its own site
- Setup: none. Free fan remake of the P.T. demo (about 1.6 GB) distributed on GameJolt; Windows only, so it would run through Proton.
- Sources: https://cinemablend.com/games/2444440/you-can-play-a-fan-remake-of-pt-for-free (called PT For PC, on GameJolt, free, about 1.6 GB)
- Not certain: Several fan remakes of P.T. exist (Unreal PT on itch.io, Artur Laczkowski's PT Emulation, LLL's port at lowlevellemmy.itch.io/pt); which one PCGamingWiki's 'PT for PC' page means was not confirmed; Exact GameJolt page, version, program name and Linux support not found; No source repository; needs no original files

## Xbox 360

### AC6 Recomp

- Games: Ace Combat 6: Fires of Liberation
- Project: github:sal063/AC6_recomp
- Builds: Windows build (Proton), newest checked v1.0.0-beta.2 (ac6recomp-1.0.0-beta.2.zip)
- Needs: The US Xbox 360 disc of Ace Combat 6 as an .iso (or its files extracted into an assets folder)
- Setup: place (the .iso (any name) or an assets/ folder next to ac6recomp.exe; optional extracted DLC in dlc/). The image is picked by the game's title ID 4E4D07D1, so a wrong or damaged image is refused with a message. First run creates ac6recomp.toml beside the program. Needs AVX2 and Direct3D 12 (through Proton on Linux).
- Saves: Documents/ac6recomp inside the Proton prefix (ReXGlue user data folder: Windows Documents/<app name>)
- Sources: README.md:4 (work in progress), 47-64 (Windows 10/11, AVX2, D3D12, US only, iso or assets/ beside exe, dlc/, ac6recomp.toml); src/ac6recomp_app.h:44-46 (title ID 0x4E4D07D1); rexglue-sdk src/ui/rex_app.cpp:116-121 and src/core/filesystem_win.cpp:55-58 (user data in Documents/<name>); github.com/sal063/AC6_recomp/releases/expanded_assets/v1.0.0-beta.2 (ac6recomp-1.0.0-beta.2.zip); curl -I releases/download/v1.0.0-beta.2/ac6recomp-1.0.0-beta.2.zip 302; LICENSE (BSD 3-Clause); zip listing: only ac6recomp.exe at the top level
- Not certain: The batch row points at the dev-test branch; tag v1.0.0-beta.1 is on dev-test, beta.2 is the newest tag; Save location assumed from the ReXGlue SDK default; the game's saves may sit in a content subfolder of it; Built on ReXGlue but no achievements.toml in the repo, so achievements left null; The project's display name is not stated; 'AC6 Recomp' taken from the repo and program name

## Left out

Rows on the list with no project or download found anywhere:

- Silent Hill: The Arcade (Silent Hill: The Arcade): No open project or official download found: the only 'port' is the arcade's own Windows software run from a dump (loaders such as TeknoParrot/DemulShooter), so nothing for Cartridge to download; origin has no good value: it is the original PC build, not a recomp or reimplementation; Consider dropping this row
- Harvest Moon 64 (MoonShip): No repository or site found; origin 'decomp' is a guess from the Ship-style name (HarbourMasters naming) and may be wrong; Possibly unreleased or private; Harvest Moon 64: Recompiled (harvestmoon64recomp) is the playable port
- Animal Crossing (Township): No project called Township found; the row had no links; The best-known Animal Crossing PC port is github:flyngmt/ACGC-PC-Port (built on ac-decomp; Windows only: AnimalCrossing.exe; latest tag v0.9.3-playtest, asset ACGC-PC-Port0.9.3.zip seen via releases/expanded_assets; disc image in rom/; saves as GCI in save/); it may be what this row means, but nothing ties it to the name Township
- The Legend of Zelda: Twilight Princess (Courage Reborn): No repository or download found; may be released later, probably under HarbourMasters on GitHub

