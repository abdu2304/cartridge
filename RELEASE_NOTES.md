## Cartridge 0.9.64 · Forks and Links

### New
- **Forks belong to the emulator they come from.** In Settings → Emulators an emulator's row says how many forks it has, and its sheet has **Forks**, listing each one with its version and whether it has an update. Forks Cartridge finds on its own (the shadPS4 GR2 fork, PrimeHack and others) are listed too, not only ones installed through it.
- **Link to Its Project.** A fork that wasn't installed through Cartridge can be linked to its GitHub project. From then on it updates from that project, in place, where it already is.
- **Versions, kept side by side.** When an emulator or fork from a GitHub link updates, the release it replaces is kept. Its sheet's **Versions** switches back (or forward) and removes kept ones. The copy in use never moves, so Steam shortcuts keep working, and only the release's own files are swapped: a fork's own folders (its saves and settings) are never touched.
- **Search GitHub instead of typing a link.** A few words ("shadps4 gr2") list matching projects, most-starred first, with their description and last update.
- **Send a link from your phone.** Cartridge shows a QR code. Scan it on the same Wi-Fi, paste the link on the page that opens, press Send, and it appears in Cartridge. Nothing leaves your home network, and the page only answers its own secret address and closes after one link or ten minutes.
- **Check It before installing.** A link first shows the project, its stars, its newest release and the exact file it would install. Nothing downloads until you press Install.
- **Windows builds through Proton.** A project with no Linux build at all installs its Windows build and runs it through Proton. Linux always comes first, and Android, macOS, ARM and source code are never picked.

### Changed
- **A game set to a fork uses the fork's own settings and patches.** Gravity Rush 2 with the GR2 fork gets Game Settings and patches in the fork's own folder, and those screens say "shadPS4 (GR2fork)" so it's clear which copy they change.
- **Windows shortcuts use Steam's own default Proton** (Steam's Settings → Compatibility), unless you picked one in Cartridge.

### Fixed
- **A fork could be offered the emulator it comes from's update.** A fork now only ever updates from its own project, after it's linked to it.
