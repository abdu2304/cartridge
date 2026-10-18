## Cartridge 0.9.78 · Saves on a New Device

### Fixed
- **RetroArch saves didn't come down to a device that had never saved in RetroArch.** RetroArch makes its saves and states folders only at its first save, so Cartridge Save Sync left those saves waiting as "no folder". When RetroArch is set up, its folders are now made and the saves put in place.

### Changed
- **Two more checks before every release:** every Online Play feature of ten emulators switched on and off with their real settings files (refusals checked, every file read back in its own format), and saves carried from one device to another through Save Sync, byte for byte.
