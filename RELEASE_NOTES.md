## Cartridge 0.9.89 · Ports in Steam

### New
- **A Steam tab in a PC port's More.** Add to a Steam Collection, Frame Generation for that port's shortcut, and Remove from Steam (the port stays installed). Nothing from the console's emulator is in it.

### Changed
- **One Steam shortcut per PC port.** Uncharted made a shortcut for each of its three games; now it has one, named after the collection, and it starts the game you picked last in Cartridge (the first one until you pick). Ports that already have one shortcut per game are tidied up on their own: the single shortcut goes in and the old ones come out.

### Fixed
- **A PC port that Steam doesn't start is started anyway.** Since 0.9.88 a port in Steam starts through its Steam shortcut. If Steam takes the request and nothing starts within 25 seconds (an old shortcut, Steam busy), Cartridge starts the port itself and writes why in its log. This is the likely cause of Bloodborne not starting; if it still doesn't, Report a Problem sends the log that says why.
