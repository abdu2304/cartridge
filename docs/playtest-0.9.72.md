# Playtest, 0.9.72

Run on 0.9.71 with the real app (Electron, main process and all) in a fake home, against the fake RomM
(`test/e2e/mockRomm.js`, which can now serve the five PS4 games), with each port's real release file served from a
local copy of its GitHub release. The fake home held PS4 dumps for the five Cartridge Verified games (built with their
own `param.sfo`), Flatpak installations of RPCS3, Dolphin, RetroArch, PPSSPP, Eden and Cemu with their settings files,
and a Steam root with one account and a stand-in Proton 9.0 plus Steam's runtime that logs what it was asked to run.
Eight playtesters, one area each; the recomps one went through every port twice, from Install to Play.

What this can't cover: a real GPU running a port, a real Steam client and Proton, a real pad's feel and Game Mode's
overlays. Those need the Deck.

## The playtesters

| Playtester | What they did |
|---|---|
| UI | Every page and Settings section in Glass and Plain, the port sheet, Online Play |
| UX | Each flow from the first press: port install, Set Up, Play, Add to Steam, the update a game needs |
| Recomps | All five ports from Get to Play: Bloodborne (Windows, through Proton), Uncharted (three games), God of War III (Linux), inFAMOUS (needs update 1.07), P.T. (its own installer) |
| Online Play | Each emulator's features on and off, with and without a nickname or account |
| Saves | Save Sync on, a run, a save with no game in the library |
| Emulator setup | Get Emulators with Flatpaks installed, the installed state per console |
| Steam | Queue, Apply, the shortcuts written, ports in Steam |
| Smoothness | Logs, stalls and script errors through all of the above |

## What held up

- Every port installed from its real release file and reached its expected state: Bloodborne, Uncharted (three
  starts, LB/RB picker) and God of War III Ready to Play, your library's copy found by itself each time.
- Bloodborne's Play went through Proton exactly as written (`proton waitforexitandrun .../Bloodborne.exe --play`), with
  Cartridge's own prefix set up first.
- Online Play refuses clearly when something is missing ("Set Nickname first.").
- Save Sync turned on and ran; a PSP save without its game is reported as unmatched, with the reason.
- No script errors and no main-thread stalls in any run. (The certificate errors in the log come from the container's
  proxy, not the app.)

## Fixed in this update

| What a playtester hit | Fix |
|---|---|
| inFAMOUS needs update 1.07: the sheet said "pick the game again" and kept offering Set Up, which failed the same way; there was no way to pick the update | A Needs Update 1.07 step with Pick the Update’s Folder; the folder you pick is tried first and laid over your copy as links (`recomps:prepare` takes `update`) |
| Ports never reached Steam on their own, even with Steam's automatic adding on; nothing on the sheet said whether a port was in Steam | With automatic adding on, Set Up queues the port's shortcuts (one per game for Uncharted) and applies them as a download does; the sheet has a Steam row: in Steam, waiting for Apply, or not yet |
| Install then Set Up gave two toasts in a row ("is installed", then "is ready") | One toast: "is ready" (and "on its way to Steam" when it is) |
| Play and Check for Updates said nothing | "Starting <game>"; the update check says what it found |
| P.T.'s installer refused the copy ("No P.T. game data was found here"), and the sheet still said "Your copy is picked" with Set Up again | That Copy Didn’t Work, with Pick Another Copy and Try Again |
| The port list called an uninstalled port "Your Game" | "Get · You Have the Game" |
| Steam: "1 change waiting" for a game not on this device, and Apply only said "Nothing to apply", forever | Apply takes what can't be added off the list and says why |
| Get Emulators showed the RetroArch Flatpak as not installed (no cores yet), with a Download button | RetroArch counts when it's here in any form, cores or not |
| Settings, Online Play: focus stayed on All Settings (the rows load a moment later) | Settings waits for a section's rows before falling back to All Settings |

## For the owner (not changed: your call)

- God of War III's copy in the test was 01.03; the recipe says "tested with 01.00 and 01.02". The sheet shows that
  under Needs, but no note on Your Copy. A recipe field for tested versions would let the sheet say it plainly.
- P.T.'s recipe has no files to check in the copy (its game data is checked by its own installer). If you know where
  chunk1.psarc and texture.qar sit in a dump, listing them lets Cartridge say so before installing.
- Settings → Steam has no section for PC ports; they're managed from each port's sheet.
