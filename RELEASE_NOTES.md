## Cartridge 0.9.75 · Found by What's Inside

### Fixed
- **PS4 and PS5 games unpacked by hand didn't show as on this device** unless their folder had the same name as RomM's file or held the title ID (P.T. in a folder called "CUSA01127" or "P.T" looked not downloaded, so its PC port couldn't use it either). Cartridge now also reads each folder's own game information (sce_sys/param.sfo), at the top or one folder down, and recognises the game by its title ID or its title, whatever the folder is called.
