## Cartridge 0.9.58 · Saves You Can Trust

### Fixed
- **Save Sync between devices.** Three things kept two devices from sharing a save:
  - **A save was looked up only under this device's RomM entry for the game.** If the other device matched the game to a different entry (the game on one, its update file on the other), each device kept its own copy and never saw the other's. Saves are now found by the save itself, under any game in your RomM, and an upload joins the entry that already holds the save, so both devices end up on one.
  - **A save's slot was named after the emulator.** Eden on one device and Citron (or any renamed build) on another never met. Slots are now one per game per console, and saves already in RomM from earlier versions are still found.
  - **"Is the emulator open?" was fooled by any mention of its name.** A file manager or editor open at an Eden folder, or a script naming one, made every Switch save count as "emulator open", and it was skipped every time without a word. Only the emulator's own program counts now.
  - Tested with two devices through a fake RomM and the real app: Zelda: Tears of the Kingdom matched to different RomM entries on each, saved on one, brought to the other, played there, and back.
- **Vita3K's sheet opens again.** EmuDeck keeps Vita3K as an AppImage named "Vita3K" in its own folder, which the Emulators list skipped, so the card only said "already on this device".
- **Vita3K installs are judged correctly.** Only what Vita3K says during this install counts (an old line in its log read as this install), and the game is found by Vita3K's own ID and the folders new since the install began, wherever Vita3K put it.
- **Update All no longer downloads again.** It runs in the background as one job, so leaving the Emulators page changes nothing. Each emulator updates once, even when two paths lead to the same file.
- **Sync Now keeps going when you leave the page.** It shows in Downloads, and Saves and Sync picks it back up when you return.
- **Recently Played on Start** no longer cuts halfway: the next game's picture fades in only once it has loaded.

### New
- **Needs Attention** in Cartridge Save Sync: every save that couldn't move this time is counted, with the reason and what fixes it (the emulator isn't set up here, hasn't made its save folder yet, was open, or a download failed its check). Nothing is silent any more.
- **Every game on a memory card is listed** under Your Games (PS2 and other memory cards), each opening its own sheet.
- **Switch saves from the whole Eden family** (Eden, Citron, yuzu, Sudachi, suyu, torzu) sync with each other.

### Changed
- **Chosen versus focused.** In the dark looks, something chosen (the open Settings section, the chosen tab, chips) is now a thin ring in your highlight colour; only where you are is the solid fill. Light keeps its soft grey.
- **Start moves.** Big art tiles (2 by 2 or larger: Continue Playing, pinned games, Spotlight, Game of the Day) pan slowly with a gentle zoom, light effects on or off. Reduce Motion stops it.
- **Saves and Sync has two tabs**, Cartridge Save Sync and Syncthing. Syncthing's Games, This Device and Main Server are cards that open in place (B goes back), and the choice of which one this device uses is at the end of both tabs.
- **Ready to Play** looks like the Download button, with a green tick.
- **Softer Light shadows** that fade out instead of ending sharply.
