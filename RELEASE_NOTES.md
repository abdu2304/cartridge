## Cartridge 0.9.87 · Starting Up

### New
- **A starting screen while a game opens.** Press Play and Cartridge shows the game's cover, its name and a running line until the game is on screen, so a slow start (a PC port like Uncharted can take a minute, longer the first time) never looks like nothing happened. After 45 seconds it says it's still on its way. If the game closes before it ever opened, it says so. B hides it; the game keeps starting.

### Fixed
- **The controller works in Cartridge again after a PC port closes.** 0.9.86 changed how Cartridge follows a port it starts, and stopped telling the controller code the port had ended, so Cartridge didn't take the pad back. In Game Mode it also stayed awake behind the port. Both are back to how they were before 0.9.86.
