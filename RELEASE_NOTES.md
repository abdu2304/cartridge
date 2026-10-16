## Cartridge 0.9.69 · Recomps, Finished

### New
- **Save backups you can put back.** A recomp's page now lists the save backups Cartridge made before each update, version switch and removal (**Save Backups**). Pick one to put back. The saves there now are backed up first, so you can change your mind. Files made since stay where they are. It never runs while the recomp is open.
- **Check It for recomp links.** Paste a GitHub or GitLab link and Cartridge shows the project, its stars, whether it's a fork, its newest release and the build it would install, before anything is added or downloaded. It also says plainly when there's nothing it can install.
- **Your copy is checked before installing.** When a recomp lists the version it needs, the copy in your library is checked before the download. If it doesn't match, Cartridge says so and you choose whether to install anyway.
- **Check for New Recomps Every Day can be turned off.** It's on the Recomps page. Check for New still works when it's off.

### Changed
- **Recomps from a link have a setup step.** They no longer count as ready the moment they're installed. Open one, follow its own steps, then press It's Set Up. Recomps found automatically work the same way.
- **Recomps from a link back up their saves.** Before an update or removal, Cartridge backs up what the recomp wrote beside itself and its folders in ~/.config and ~/.local/share. It leaves out the release's own files and anything over 256 MB. These guessed folders are only backed up, never sent to Save Sync.
- **Only usable recomps are found automatically.** A project found on PCGamingWiki is only added when its newest release has a Linux or Windows build and it isn't a fork.
- **Flatpak recomps are started once after an update,** like Linux builds. If one can't start, Cartridge says so. Flatpak keeps no earlier version to go back to.

### Fixed
- Small clean-ups: unused code removed, nothing you'll see.
