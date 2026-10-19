# Playtest on a real PC (owner's brief, 18 Oct 2026)

For the session that runs on the owner's own Linux PC (Claude Code in a terminal, teleported from the cloud session or
started fresh). Read this after CLAUDE.md and the newest entry in docs/SESSION-LOG.md.

## Handoff after 0.9.87 (owner, 19 Oct 2026)

**Done in 0.9.88 (handover Part 35, which says what was and wasn't tested on the machine).** Still open from this list: the real controller in Desktop Mode, rumble on a uinput pad, the exFAT prefix and the lowercase `.appimage` (handover Part 9).

0.9.87 (a starting screen, and the controller after a PC port) was built in the cloud session; `git pull origin main`
before anything else. The cloud session has stopped building: everything below is this session's.

**The owner was unhappy with how 0.9.86 was done.** It shipped regressions found by the owner, not by us: the
controller dead in Cartridge after a PC port (childRun sent no game-run ended and lost to gamescope's focus), the
Emulators pages very slow, ports shown twice. So from now on, for every change, **triple check**:
1. Reproduce the problem on this machine first (the real AppImage and the owner's real setup, not only fake homes),
   and write down the cause before changing code.
2. After the fix, check it on this machine the way the owner uses it: Game Mode on the TV as well as the desktop,
   with the controller, launching from Cartridge and from Steam.
3. Before any release, go back over every change made since 0.9.85 and check each still works on this machine:
   the 0.9.86 list (Proton in its runtime, childEnv, downloads picked up at start, auto add retries, dumps found by
   param.sfo, ports shown as ports, ambient steps, zoom, emuCfg, Wii U / Xbox 360 IDs, Save Sync on RomM 5.3) and
   0.9.87. Read the whole diff adversarially. `npm test`, every `test/e2e/*.js`, `npm run audit:ui` and the controller
   playtest (`tools/ui-audit/playtest.js`) must pass; the "Controller playtest" CI step has been red on every PR since
   0.9.80: find out why and fix it, never merge past a red check again.
4. Say plainly in the notes what was tested on this machine and what wasn't.

**Reported by the owner, to fix:**
- **Uncharted (PC port): the controller isn't detected in the game, and changes in its game settings don't take
  effect.** Find where the port reads its pad (Proton/SDL, Steam Input in Game Mode vs desktop, the start script's
  environment since childEnv and SHELL_UNSET, a Steam shortcut vs Cartridge's own start) and where its settings file
  really is (the prefix in use: `recipes.prefixOf`, `rec.prefix`, the runtime-launched Proton's prefix vs the one
  settings are written to, `varsFor` appdata). Check every Windows port the same way, and Linux ports too.
- **Ports and emulators are separate. Stop mixing them.** No "Play With" for ports, no console emulator rows, Game
  Settings, add-ons or Steam emulator options anywhere a port is shown. A port opened from the PC Ports page shows
  that port only (it opened the port picked in Play With or played last: the second P.T. card opened the first one).
  The older copies installed from a link ("P.T. (From a Link)", "God of War III (From a Link)") must be clearly
  named on their cards, and Remove must be easy to reach for a port.
- **Settings → Emulators, PC Ports and Game Add-ons took very long to open after 0.9.86** ("infinite load"). Not
  found in the cloud (every fake setup lists emulators in under 5 s). Read cartridge.log here (`main thread
  stalled`, `longest stall`, `downloads: picking up`) and the timings of `emuup:list`, `recomps:list` and the add-on
  lists on this machine. Suspect: a big download picked up at start (0.9.86 restorePending).
- **The controller in Cartridge after a game:** 0.9.87 fixed it for ports Cartridge starts; check it on this
  machine after a port and after an emulator game, from Cartridge and from Steam, in Game Mode and on the desktop.

**Still open from before:** the real controller in Desktop Mode (Chromium sees no pads here), rumble checked on a
uinput pad, the internal-drive prefix on an exFAT drive (`truncate` + `mkfs.exfat` image), the renamed lowercase
`.appimage` (updates, Add to Steam, steam-launch.sh), and CLAUDE.md over Claude Code's size limit (keep the rules and
layout, move the per-version notes to docs/VERSIONS.md and link it).

## What the owner asked for, in their words

- "You would fix the bugs for me, but it would also be an understanding of how you would fix these bugs across the
  board." The PC is a real user's machine with real files: a sample of what users meet, never the target. Every fix
  works for every setup (CLAUDE.md: Cartridge is for everyone), with a test so it stays fixed.
- "I don't want to be involved myself. You will do everything yourself": launching, quitting, input, rumble, all of it.
  Desktop Mode only; no Game Mode. Ask the owner only for a sudo password.
- "Absolutely everything in Cartridge", not only controller input, rumble and PC ports.
- Loop: test as a playtester, find a bug, find its cause, fix it, test again, until nothing is left. Release as usual
  (standing instruction in CLAUDE.md).

## First job: why Windows PC ports don't set up or launch

The owner thinks it affects every Windows-only port, not just Uncharted. What is known (handover Parts 30 and 32, and
the chat after 0.9.85):

- The first photo: Uncharted (Windows build, umu-launcher + Proton 11.0) installed on a drive named "Expansion" under
  `/run/media/<user>/`, Set Up failed with "Proton couldn't make … Windows folder (its prefix)". A Proton prefix is
  full of symbolic links (dosdevices, the Windows system folders); exFAT and NTFS drives can't hold them. 0.9.83 probes
  a symlink in `<install>/.cartridge` and puts the prefix in `~/.local/share/cartridge/proton/<id>` when links fail
  (`prefixFor` in recomps.js, `recipes.prefixOf`). Never confirmed on a device. The owner's second photo still showed
  the old message, so it came from an older version.
- Other likely causes, for all Windows ports (unproven; check each on the real machine):
  1. Steam's launch variables leak into Proton. When Cartridge is started from Steam, its environment carries Steam's
     own settings (SteamAppId, SteamGameId, STEAM_COMPAT_*, pressure-vessel and runtime variables), and
     `recompsIpc.runProgram` passes them all to Proton/umu (it only removes LD_PRELOAD, LD_LIBRARY_PATH and the AppImage
     ones). Heroic and Lutris clear these. Compare starting Cartridge from Steam against starting it directly.
  2. umu-launcher's first run downloads Steam's runtime (hundreds of MB); no network or a slow link = no prefix.
  3. The Proton picked: `protonRunner.find` takes the newest numbered Proton (Proton 11.0 in the photo). Try wineboot
     with it by hand, and with Experimental and GE.
  4. The log keeps only Proton's last line (`verified prefix`, `verified run`). Log the runner kind, Proton name,
     prefix path and the full output tail on failure.
- Also check the start scripts (`recipes.script`: umu `WINEPREFIX=<prefix>/pfx`, Proton
  `STEAM_COMPAT_DATA_PATH=<prefix>`), launching from Cartridge and from Steam, ports on an external drive and on the
  internal one, and every Windows port in electron/recipes, not only Uncharted.

## Everything else, all of it

- Welcome and setup, RomM sign-in, library sync and search
- Start (widgets, arranging, pages), Home, Library, Consoles, game pages and every More option
- Downloads: every console, archives, multi-file games, updates, pause and resume
- Steam: adding, launching, artwork, collections, play time, shortcut health
- Emulators: detection, Get Emulators, updates, forks and versions, Open, BIOS and firmware, folders, Linked Folders
- Game Settings for every emulator; add-ons, mods, patches, cheats, texture packs, game updates
- PC Ports: Cartridge Verified and from a link, installers, Windows ports through Proton, setup, updates, saves, Steam,
  Continue Playing (0.9.85)
- Saves: the locator, Save Sync and Syncthing, on copies only, never the owner's live saves
- Achievements and trophies, Online Play, storage and multi-drive
- Look & Feel: Plain and Glass, every theme, background and size; the Dock, Quick Menu, idle screen
- Controller input on every screen through a virtual pad on /dev/uinput (udev rule below), rumble checked as it
  arrives (uinput force-feedback uploads: motor, strength, length), touch and mouse
- Smoothness and CPU, above all while a game runs (the 0.9.82 lag report)
- Updates and safe start

## PC ports are their own thing, not console games (owner, 19 Oct 2026; build on the PC session, not before)

"Consider the games that are in console libraries completely different from recomps." Keep it in mind and build it
during the PC session, checking each step there:

- **Game page More for a port** shows only what fits a PC port: no Steam emulator rows, no emulator Game Settings, no
  add-ons for the console's emulator. It gets its own options (the port's settings, version and updates, set up again,
  save backups, its folder, Steam shortcut, remove) and its own icon.
- **Continue Playing and other rows:** a port played last shows its name and the Steam mark (SteamTile's Steam logo),
  nothing else. Not "P.T. · PS4" with "Steam Machine · PC Port" under it; just "P.T." and the Steam mark. The mark must
  sit at the same size as the other console marks in that row (check against ConsoleMark's sizes and docs/logos.md).
- The same split anywhere else a port shows as its console game (cards, search, Start tiles): find them on the PC.

## Find what the owner wouldn't

The owner also asked for the things they would never have found themselves: odd setups, rare paths, races, slow
drives, half-finished installs, things that only break the second time or after an update. Look for those too, not
only what the brief lists.

## How to work there

- Launch and quit everything yourself: the AppImage or a build from source, emulators, games, ports, Steam (use its
  debug port for Steam actions rather than clicking its window).
- Every bug: what about this setup causes it, a fix for every setup, a test (unit or test/e2e), `npm test`, the audits,
  then release as usual. Never commit anything private from this machine: scrub paths, user names, addresses.
- Write each round's findings into docs/SESSION-LOG.md and the handover (Parts 1, 4, 5, 6, 9 and a new Part).
- Ask the owner only for a sudo password.

## Machine setup (done by the owner once)

1. `curl -fsSL https://claude.ai/install.sh | bash`, new terminal, `claude --version`
2. Node 20 or newer (`node --version`; else nvm: `nvm install 22`)
3. `git clone https://github.com/abdu2304/cartridge.git ~/cartridge && cd ~/cartridge && npm ci`
4. Virtual controller access (`passwd` first if no sudo password is set):
   `echo 'KERNEL=="uinput", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"' | sudo tee /etc/udev/rules.d/60-cartridge-uinput.rules`,
   `sudo usermod -aG input $USER`, `sudo udevadm control --reload-rules && sudo udevadm trigger`, then log out and in.
5. `cd ~/cartridge && claude` (or `claude --teleport` to bring the cloud session over).
