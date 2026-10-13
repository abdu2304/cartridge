## Cartridge 0.9.66 · Loose Ends

### New
- **Make an RPCN account in Cartridge.** Settings → Online Play → RPCS3 → **Make an RPCN Account** asks for a username, a password and your email, makes the account the way RPCS3's own window does, and saves it for RPCS3. RPCN then emails you a token, which Cartridge asks for straight away. **Email the Token Again** sends it again. Your password is never sent or stored as typed: only the scrambled form RPCS3 itself uses.
- **Make a ShadNet account without leaving Cartridge.** ShadNet accounts can only be made on shadps4.net, so **Make a ShadNet Account** opens its sign-up page in Cartridge's own window. When you close it, Cartridge asks for the new username and password and saves them for shadPS4.
- **Online Play on each emulator's own page.** Settings → Emulators → an emulator now shows its Online Play status (what's on and off), and opens the Online Play section.
- **More about each recomp.** A recomp's page shows its project's stars, its newest version and date, the first picture from its project page, and its release notes (under **Release Notes**).
- **From a Link guesses for you.** Paste a recomp's GitHub or GitLab link and Cartridge guesses the console and the game from the project's name and description, matched against your library. Check both, then Add.
- **Recomp updates are tried before they're kept.** After an update, the new version is started once for a few seconds and closed again. If it can't run on your system (missing libraries, or it crashes at once), Cartridge goes back to the version that worked and says why. Your saves stay as they were. Steam's shortcut only moves to a version that started.

### Changed
- **RPCS3's damaged settings file is repaired first.** If RPCS3's settings file has the leftover text an older EmuDeck wrote, Online Play shows **Repair RPCS3's Settings** first and won't write anything until it's fixed. Repair keeps a backup.
- **RPCN and ShadNet account rows are always shown**, so you can sign in or make an account before switching them on.
- **Pages for Online Play open inside Cartridge** (sign-up pages and guides), with a **Back to Cartridge** button.
