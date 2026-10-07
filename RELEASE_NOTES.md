## Cartridge 0.9.55 · Steady

### Fixed
- **Cartridge no longer freezes a few seconds after it starts.** It waited on Flatpak for the list of installed apps, and the whole app stood still while Flatpak worked, so in Game Mode Steam dimmed it as not responding and the controller could stop working afterwards. Installed Flatpaks are now read straight from Flatpak's folders, the other lookup that could hold the app is done in the background, and the Flatpak access buttons no longer freeze it either.
- **Home no longer dims a second after you come back from a game.** Going back, Home faded in a second time about a second later. It now stays as it is.
