## Cartridge 0.9.82 · Out of the Way

### Fixed
- **SteamOS could get slow while a game started from Cartridge was running.** Cartridge is meant to go quiet while a game is in front: no animations, no background drawing, no controller input. In the real app, an animated background uses about a fifth of a CPU core plus graphics time when Cartridge is in front, and almost nothing once it’s quiet. But in Game Mode it only went quiet when it could read which app gamescope had in front. Now a game Cartridge started always counts, and so does any game Steam launches when gamescope can’t be read. On the desktop, Cartridge goes quiet while its game runs and Cartridge’s window isn’t focused.
- **Watching for the game to end no longer holds Cartridge’s main thread.** It used to read every running process’s details in one go, every 2 seconds, for as long as the game ran. Now it reads them in small batches without blocking.

### Changed
- **While a game is in front, Cartridge lets go of the pictures it has cached** so the game has that memory.
- **Setting up a port shows its speed and time left** while its installer copies your game, for example “1.2 GB of 2.6 GB copied · 40 MB/s · about 1 min left”. Cartridge’s log notes how long the installer took before it started copying, the copy speed, and whether the game and the port are on the same drive.
