# Playtest on a real PC (owner's brief, 18 Oct 2026)

For the session that runs on the owner's own Linux PC (Claude Code in a terminal, teleported from the cloud session or
started fresh). Read this after CLAUDE.md and the newest entry in docs/SESSION-LOG.md.

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
