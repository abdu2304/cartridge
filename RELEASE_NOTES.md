## Cartridge 0.9.81 · Setting Up, Shown

### Fixed
- **Setting up a Cartridge Verified port could sit on "Working" with nothing to show (P.T.).** P.T.’s own installer copies your game without saying anything, so the sheet couldn’t tell a slow copy from a stuck one. Each step is now named (Checking your copy, Running its installer, Writing its settings). While the installer runs, the sheet shows how much it has copied, for example “1.2 GB of 2.6 GB”. If it writes nothing for 5 minutes, Cartridge stops it and says so, so you can press Set Up again instead of waiting forever.
