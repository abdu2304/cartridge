# Recomp catalogue

Built 2026-10-09 by `tools/recomps/build.js` from the researched entries. Source list: PCGamingWiki's "List of unofficial ports", console sections only (owner's choice), status notes ignored (owner). Each project was checked from its own repository: tags, release files (a download answering 302), CI, README and source. Entries are shipped in `electron/recomps.json` without the notes below.

## Arcade

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

### Zelda 64: Recompiled

- Games: The Legend of Zelda: Majora's Mask
- Project: github:Zelda64Recomp/Zelda64Recomp
- Builds: Linux build, newest checked v1.2.2 (Zelda64Recompiled-v1.2.2-Linux-X64.zip, Zelda64Recompiled-v1.2.2-Windows.zip, Zelda64Recompiled-v1.2.2-Linux-ARM64.zip, Zelda64Recompiled-v1.2.2-macOS.zip)
- Needs: The North American (US 1.0) version of Majora's Mask as an N64 ROM (other formats are converted to .z64)
- Setup: picker. Asks for the ROM in its main menu and copies it as mm.n64.us.1.0.z64 into its config folder. portable.txt beside the program keeps saves, config and mods beside it. Ocarina of Time support is announced but not released.
- Saves: ~/.config/Zelda64Recompiled/saves
- Sources: README.md:2 (Majora's Mask, and soon Ocarina of Time); README.md:51,127 (US version only); README.md:122-124 (saves); README.md:135 (portable.txt); include/zelda_config.h:10 (program_id); src/main/main.cpp:355 (game_id mm.n64.us.1.0); curl -I 302: releases/download/v1.2.2/Zelda64Recompiled-v1.2.2-Linux-X64.zip
- Not certain: The source rows point at Mr-Wiseguy/Zelda64Recomp, now Zelda64Recomp/Zelda64Recomp; The Ocarina of Time row is merged here but Ocarina of Time is not playable in any release yet (README:102 lists it as planned); add it to games when it ships; GitHub matches asset case-insensitively, so Linux-X64 vs Linux-x64 is unconfirmed

## Left out

Rows on the list with no project or download found anywhere:

- Silent Hill: The Arcade (Silent Hill: The Arcade): No open project or official download found: the only 'port' is the arcade's own Windows software run from a dump (loaders such as TeknoParrot/DemulShooter), so nothing for Cartridge to download; origin has no good value: it is the original PC build, not a recomp or reimplementation; Consider dropping this row
- Harvest Moon 64 (MoonShip): No repository or site found; origin 'decomp' is a guess from the Ship-style name (HarbourMasters naming) and may be wrong; Possibly unreleased or private; Harvest Moon 64: Recompiled (harvestmoon64recomp) is the playable port

