## Cartridge 0.9.56 · Quick and Clear

### New
- **Save Sync's counts open up.** Sent to RomM, Brought Here, Up to Date and Not Matched in Settings → Saves and Sync are buttons now. Each shows the saves behind it. A save that matched no game says why in plain words (its game ID isn't in your library, no game has that name, or a memory card with no game of its console to keep it with) and what fixes it, with Copy the ID and Sync Now. Press Sync Now once after updating to fill the lists.
- **Update All.** Settings → Emulators has an Update All button beside Download All, Where They Go and Check for Updates. It updates every emulator with an update ready, one after another, after one question. The four buttons sit in one even row.
- **Choose whose saves to share.** In Linked Folders, pressing a fork and its emulator now asks which saves both should use, showing how many items each folder has and when it last changed. The next step says exactly what happens: the main one keeps its saves, the other one's are set aside (never deleted), and games only it has can be copied over first. Either way round works. Your links now say who uses whose saves.
- **Mods under a shorter name.** When a site has no game under the full title, Cartridge looks for a shorter one: "Nexus Mods has no game called Bloodborne Game of the Year Edition", then "Found on Nexus Mods: Bloodborne". Press it to see those mods. They install by the same rules as always. Works for Nexus Mods and GameBanana.
- **Pure Black.** Look & Feel → Theme → Advanced has a Pure Black button for Highlights, Buttons and Progress Bars.

### Changed
- **Snappier motion everywhere.** Movement starts at full speed instead of easing in, and settles about a third sooner. Page changes, going back, opening a game, pop-ups and scrolling all feel quicker, and nothing overshoots.
- **Start's page turns are quick again.** The new page shows in about 175 ms instead of 410 ms, and is complete in about 840 ms instead of 1.4 s. Tiles come in closer together.
- **The background keeps moving.** It no longer slows to a stop when you leave Cartridge alone. It only stops while a game or another app is in front, and carries on as soon as you're back.
- **Light and OLED set your colours.** Picking Light makes Highlights, Buttons and Progress Bars black; picking OLED makes them white. Picking another colour puts them back to the theme's own.
- **Cards stand out in Light.** White cards on a slightly deeper page, with a firmer edge and shadow.
- **Background menu:** just Your Theme Colours, Their Own Colours and Other. The console and game picture backgrounds left the menu (one you already use keeps working).
- **Nexus Mods key** moved to Settings → Emulators → Game Add-ons, with the mods.

### Fixed
- **Glass no longer has white shapes moving around.** In dark Glass the edge light turned to follow whatever was focused, a white glow surrounded focus, and a white band swept across buttons when pressed. The light now stays put (from the top left), the glow and the sweep are gone in dark Glass, and the bend at glass edges is gentler. Light Glass keeps its shine.
- **"The folder to share doesn't exist"** in Linked Folders, for a folder that was there. When an emulator's save folder is itself a link (as EmuDeck sets them up), Cartridge looked at the link instead of where it leads.
- **Less waiting on the system.** Checking emulators for updates, installing Vita games and adding Flathub for RetroDECK no longer hold Cartridge still while they ask the system.
