## Cartridge 0.9.67 · Follow Through

### New
- **See a recomp set itself up.** Many recomps build their own files from your copy of the game the first time they start (Ship of Harkinian makes its game file, others copy your ROM in). When you open one that isn't set up yet, Cartridge now shows **Setting itself up** with how much it has written, on the recomp's page and under Downloads → In the Background. It marks the recomp as set up as soon as its finished file appears. If the recomp closes before then, Cartridge says so, and opening it again carries on.
- **Checking your copy runs in the background.** Checking a large game file against the version a recomp needs now carries on under Downloads if you leave the page.

### Changed
- **Online Play spots renamed settings after an emulator update.** When an update renames or moves a setting Online Play uses, Cartridge now says so in Online Play instead of writing the old name back. This covers PPSSPP, PCSX2, RetroArch, RPCS3, shadPS4, Ryujinx and Eden, which rewrite their whole settings file.
- **Online Play checks every file before and after changing it.** RPCS3's and shadPS4's settings must still read correctly after Cartridge's change before anything is written. After writing, Cartridge reads them back and checks again that RPCS3 can load its settings. If anything is wrong, every file goes back exactly as it was and Cartridge says why.
