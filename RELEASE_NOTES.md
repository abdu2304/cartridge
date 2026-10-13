## Cartridge 0.9.65 · Recomps and Online Play

### New
- **Recomps.** Native PC versions of console games, made by recompiling or rebuilding the game's code: Zelda 64: Recompiled, Ship of Harkinian, Star Fox 64 Recompiled, Unleashed Recompiled, Skate 3 Recomp and many more. Each one runs as its own program, with no emulator, and uses your own copy of the game.
- **96 recomps to start with**, from arcade and NES to Xbox 360, each checked from its own project: where its builds are, what copy of the game it needs, how it takes the game, and where it keeps saves.
- **A Steam card in Consoles.** It has Steam's logo, Valve's name and a Steam Controller, in Steam's colours. Inside, recomps are grouped by the console each game came from. They're also in Settings → Emulators → **Recomps**, which is kept out of Update All.
- **The list comes from PCGamingWiki's "List of unofficial ports".** Every project on it was checked, along with the projects behind entries that had no link. Once a day, quietly, Cartridge fetches the newest list and adds anything new that appears on PCGamingWiki. **Check for New** does the same straight away.
- **Linux first.** A recomp installs its Linux build. A Windows build is used only when there is no Linux one, and it runs through Proton. Android and macOS builds are never picked. Projects that publish no builds are marked **Build It Yourself**, and their page explains how. Projects that publish on their own site are marked **On Its Own Site**.
- **Your copy of the game, checked.** Set Up With Your Game offers your copy from your library, if it's on this device, or any file you pick. Where a project lists the exact version it needs, Cartridge checks your copy first. If it doesn't fit, Cartridge says plainly what the recomp needs, and you can still use it anyway. N64 ROMs in any byte order are recognised. Depending on the recomp, Cartridge links the file where it looks for it, starts it with your file, or opens its own picker with the exact path to give it.
- **Its own Steam shortcut.** Add to Steam makes a shortcut separate from the emulated game's, in a **Recomps** collection. Each recomp is added with its art from SteamGridDB. Windows recomps run through Steam's default Proton, unless you picked another.
- **Updates you choose.** Cartridge checks for updates but never installs one by itself. Before an update, your saves are backed up. Afterwards they're checked, and anything missing is put back. The version it replaces is kept, so **Roll Back** brings it back. Each recomp can follow its stable releases or pre-releases.
- **Saves and achievements.** Cartridge Save Sync includes recomps' saves. Recomps that record their own achievements show them in Achievements: Unleashed Recompiled and Marathon Recompiled (also as Flatpaks), and the Xbox 360 recomps built with ReXGlue, such as re:Blue (per profile).
- **From a link.** A recomp that isn't in the list can be added from its GitHub or GitLab link: typed, found with Search GitHub, or sent from your phone.
- **A recomp folder in every Emulation folder.** Each Emulation folder gets `recomp/<console>`, on every drive.
- **Recomps packaged as Flatpaks** (Unleashed Recompiled's Linux build is one) install as a Flatpak for your user, and Remove uninstalls it.
- **Online Play, a new Settings section.** Every emulator on this device that plays online, what it offers, whether it's on, and its account, nickname or server:
  - **RPCS3: RPCN.** Your username, password and token. The password is stored the way RPCS3 stores it (never as typed), and RPCN is switched on in RPCS3's settings.
  - **shadPS4: ShadNet.** Your shadps4.net account for the PS4 games that already work online. Still early testing.
  - **PPSSPP:** ad hoc play through a server you pick from PPSSPP's own list, your nickname, and the username for games with revived official servers.
  - **PCSX2:** the network adapter (Sockets, no special rights needed), with the revival server's DNS if its community gives one.
  - **RetroArch:** your netplay nickname and a relay server, so friends can join even when their routers block it.
  - **Ryujinx:** local wireless over the internet through the Ryujinx LDN server, with no account, and an optional private group.
  - **Eden:** your nickname for multiplayer rooms, with airplane mode switched off so games' local wireless works.
  - **Dolphin:** NetPlay by host code, your nickname, WiiLink channels, and the GameCube broadband adapter with its DNS. For Wiimmfi, each game has to be patched first, and Cartridge says so.
  - **Azahar and Cemu:** what Pretendo Network needs from your own console, and which of those files are still missing. Azahar can also use a lobby server, if your community runs one.
- **Online Play stays set after updates.** After every emulator update or install, Cartridge checks the online settings again and puts back anything the update reset. If the settings file moved, it says so instead of guessing.
- **Only those settings are touched.** Cartridge keeps a backup of the file first and never writes while the emulator is open. Passwords are never stored by Cartridge.
- **The game page shows Online Play** for the game's emulators under More → Emulator, and opens the section.
- **Download More Files.** For a game RomM keeps as several separate files, Game More → Options → Download More Files lists them all. The ones already on this device are ticked and greyed out. Tick the others to download them into the same folder.

### Changed
- **KytyPS5 is offered only when it has a Linux build.** Its newest releases have had no Linux build, so Get Emulators leaves it out until one appears again. A copy you already have stays, and updates skip releases without a Linux build.
- **Emulator updates skip broken releases.** When an emulator's newest release has no Linux build, Cartridge offers the newest one that does.
