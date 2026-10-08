## Cartridge 0.9.60 · Smooth

### Fixed
- **The app froze and pictures were slow.** Shrinking a picture to card size ran on the same thread that answers the controller, every button and Game Mode. A cover held it for 25 to 50 ms, a wide hero picture for about 120 ms, and a page of collections asks for hundreds. Picture work now runs on a worker thread of its own. With the same 60 covers, the longest wait for the app to answer went from 336 ms to 39 ms. New SteamGridDB heroes were also being re-made as huge PNGs on that thread; they're now kept as they came.
- **No controller for the first seconds after an update.** Cartridge re-read every downloaded game's ID at once (decrypting Switch files, opening PS2 CHDs). It now reads them in the background, one game at a time, pausing while a game runs.
- **Saves of games on more than one console.** A save only ever matches, goes under and shows for a game of its own console. A PSP save of Ratchet & Clank: Size Matters is no longer shown on the PS2 game of the same name, and a save filed under the wrong console's game in RomM is filed again under the right one the next time it syncs (nothing in RomM is deleted).
- **Wii and GameCube saves weren't matched** when the game's ID came from a folder or its file name rather than a disc image.
- **Collections loaded slowly and Favorites had empty cards.** Collection cards ask for pictures at card size, use your library's own covers first, and leave out a picture that fails to load.
- **Recently Played on Start just cut** between games. The next game's picture now loads first and crossfades, and the slow pan carries on in step.
- **Text on the game page could run together** when the game's folder path was long. It wraps now.
- **Search stayed open** after you'd found a game. It clears when you go to another tab.
- **In pop-ups, moving down could jump to Close** when the next item was still out of view (Where Your Saves Are and other lists).
- **Pale text in Light** on a game's trophy page (trophy counts and the Gold and Silver labels) and on RetroAchievements game pages.
- **The keyboard's suggestion was cut off** when focused.
- **Where Your Saves Are** no longer lists shadPS4's version folders as places in use.
- **Media Bar Size** did nothing since 0.9.42. It works again.

### Changed
- **Never a white outline.**
  - **Focus:** cards and pictures lift with a soft glow in your highlight colour; buttons, rows and keys fill.
  - **Chosen:** a soft tint with a slim bar, on the left in lists and underneath in tabs, chips and colours.
- **Not Synced** replaces Not Matched and Needs Attention in Cartridge Save Sync. It opens on two tabs:
  - **Not in Your Library:** saves of games your RomM doesn't have.
  - **In Your Library:** saves of your games that didn't sync, with why and what fixes it. When Cartridge isn't sure which game a save is for, it says "Probably …" and you pick; it remembers your choice.
- **Media Bar sizes:** Compact, Medium (the size you had) and a bigger Large.
- **Settings → Library** opens on Games and Storage, with RomM Server second.
- **Open Folder** for saves shows the folder in Cartridge (files, sizes, dates, folders inside) instead of another app.

### New
- **Install progress for RPCS3 and Vita3K.** Installing a PS3 or Vita package shows how far it is, measured from the game's folder growing towards what the package unpacks to. It runs in the background, and Downloads shows it too.
- **L1/R1 on Console Spotlight** steps through the console's games, like the other rows.
