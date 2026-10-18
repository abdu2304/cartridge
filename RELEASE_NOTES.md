## Cartridge 0.9.83 · Windows Ports on Any Drive

### Fixed
- **Windows ports on an external drive couldn't be set up ("Proton couldn't make … Windows folder").** Each Windows port gets its own Proton folder, called a prefix, which is full of symbolic links. Drives formatted for Windows (exFAT or NTFS, as most external drives are) can't hold those, the same reason Steam won't run Proton games from them. Cartridge now checks the drive first. When it can't hold links, the prefix goes on your internal drive instead, and the port's settings and its Steam start follow it. The port itself stays where it is.
- **The message no longer tells you to start a Windows game in Steam**, which didn't help. If Proton still can't make the folder, the message says where it tried and why.

### Changed
- **The first Proton setup gets more time.** umu-launcher downloads Steam's runtime the first time it runs, which can take minutes. Cartridge now waits up to 15 minutes, and the sheet says the first time can be slow.
