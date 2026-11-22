## Cartridge 0.9.99 · Triforce from Its Own Server

### Changed
- **Triforce comes from the Triforce project itself.** Cartridge now downloads Triforce from its official releases (v0.6.0 today), with its own Linux build, instead of an older unofficial copy on GitHub. Updates follow the official releases.
- **Triforce's saves are found where newer versions keep them.** Backups and Save Sync look in its new save folder, and in the old one for games built with an earlier version.

### New
- **PC ports from a project's own server.** Cartridge can now install and update ports from Forgejo servers that projects run themselves, not only GitHub and GitLab, including projects that only publish pre-releases.
