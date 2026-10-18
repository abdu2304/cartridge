## Cartridge 0.9.80 · Loose Ends, Tied

### New
- **Host or join RetroArch games online from the game page.** For a game RetroArch runs on this device, More → Emulator has Host This Game Online and Join a Friend’s Game. Cartridge starts the game in RetroArch with its own hosting or joining option, using the same command its Steam shortcut runs. Joining asks for your friend’s address (and a port, after a colon, if theirs isn’t 55435).
- **Pretendo for Cemu, switched on in Cartridge.** Once your Wii U’s otp.bin and seeprom.bin are in Cemu, Online Play has a real switch for Pretendo Network. It sets Cemu’s current account to Pretendo, and off sets it back to offline. Without those files it says what’s missing and changes nothing.
- **Save Sync for recomps added from a link.** Their sheet has Saves for Save Sync: tick the folders that hold its saves, from what Cartridge found or one you pick. Only those go to RomM. Nothing is synced until you tick it.
- **Recomps whose builds come only from GitHub Actions.** When a project publishes no release with a build, Cartridge finds its newest build from GitHub Actions. GitHub needs you signed in to download one, so Cartridge opens the build’s page in its own window. Sign in, pick the build, and it installs by itself, with updates checked the same way.

### Changed
- **A recomp’s update checks its setup.** If the update takes away what its setup made, the sheet says to set it up again. A file of yours, such as a config, is never replaced by the release’s copy: yours stays, and the release’s goes beside it, ending .cartridge-release.
- **Recomps started from Steam are watched while they set up**, as they already were when opened from Cartridge.
- **Windows builds from a link are tried after an update too.** Cartridge makes its own Proton prefix for the trial start, once. Steam keeps its own prefix for playing.
- **A word before frame generation goes on for Vita games.** A Vita game froze on a Steam Deck with frame generation on. It may not have been the cause, so Cartridge says so and leaves the choice to you.
