## Cartridge 0.9.79 · Your Answers

### New
- **PC Ports in Settings → Steam.** A third page beside Games and Collections lists every installed port with whether it's in Steam, waiting for Apply, or not yet. Press A to open its sheet. Add to Steam puts in every port that isn't there yet.
- **PS4 updates where shadPS4 looks for them.** A game downloaded with its update now has the update's folder placed beside the game as "<game folder>-UPDATE", read from each folder's own param.sfo. Nothing already there is replaced.

### Changed
- **An older RomM switches off what it can't do, and says so.** Cartridge reads the list of features your RomM publishes. If a server has no save slots, Cartridge Save Sync stays off and tells you to update RomM, instead of failing on every run. Trophy Sync does the same without game notes. Settings → Emulators → Issues lists what's off. A RomM that doesn't publish the list works exactly as before.
- **Ports check your copy's version.** A copy outside the versions a port was tested with gets a plain note on its sheet (God of War III: tested with 01.00 and 01.02).
- **P.T. checks your copy before installing.** It looks for chunk1.psarc and texture.qar beside eboot.bin, or in a folder inside the one you pick, the same way the port does.
- **Update, patch and mods folders are never taken for the game.** Finding PS4 games on your drive and making their Steam shortcuts both skip them.
