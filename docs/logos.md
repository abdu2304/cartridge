# Logos: the rules

Console wordmarks, maker marks and Sony's platform pictures, as the owner signed them off. The values are pinned in
`test/logos.test.js` (and `test/sonyArt.test.js` for the drawing), so a change shows up as a failing test. Change a
value only when the owner asks, then update the test with it.

## Where they come from

- **Console wordmarks** (`ConsoleMark`, `SysTile`, `ConsoleCard`, Start widgets): RomM's platform pictures and logos.
  RomM's art is never shipped in the repo.
- **Maker marks** (`src/makers.js`): HVR88's Monochrome Gaming Logos for Nintendo, Sega and Microsoft (every path of
  the file, `paths`; `evenodd` where the file uses it), Simple Icons (CC0) for the rest.
- **Sony's platform pictures** (`electron/sonyArt.js`): RomM's pictures for PS1, PS2, PS3, PS4, PS5 and PSP carry
  parody marks. Cartridge removes those paths (matched by the sha1 of their `d`, all must match or the file is left
  alone) and draws the SONY wordmark and the PlayStation logo in the measured boxes, in the picture's own colours.

## Size: optical, not measured

Every wordmark gets the same box height, but many carry a symbol or a second line, so their letters come out small.
`OPTICAL` in `src/consoleOptical.js` scales each one until its letters match the others:

| Console | Factor | Why |
| --- | --- | --- |
| PlayStation (psx, ps, ps1, playstation) | 1.6 | the symbol takes the height; the word is about 40% of it (0.9.47) |
| Switch | 1.7 | owner: PS4 looked bigger (0.9.42) |
| GameCube, Dreamcast | 1.45 | the cube and the swirl take most of the height |
| Steam (a PC port's mark, 0.9.86) | 1.45 | the round mark takes the whole height |
| NES, Game Boy Advance | 1.35 | |
| Wii, Wii U, Genesis, Famicom, Game Boy Color, Virtual Boy | 1.3 | |
| Master System, Game Gear, Sega CD, 32X | 1.25 | |
| SNES, Super Famicom, Saturn, DS | 1.2 | |
| N64, 3DS | 1.15 | |
| Xbox 360, Xbox One, Game Boy | 1.1 | |
| Xbox | 1.05 | |
| anything else | 1 | |

Rules:
- A factor is between 1 and 1.8. A logo is never drawn smaller than its box.
- The page sets the height with `--cm-h`; the optical factor goes on top as `--opt`. A fixed height must never cancel it
  (that is how Switch came out as small as before in 0.9.42).
- Maker marks have their own size by maker: `.m-sega` 1.3em, `.m-microsoft` 1.05em (0.9.47).
- PIcon trims a drawing's empty margins (up to 1.8 times) and lets wide drawings run 118% wide, never past its box.

## Sony

- SONY sits above the PlayStation logo on **PS1, PS2, PS3 and PSP** (owner, 0.9.49: "why did you remove Sony" about
  PS3). **PS4 and PS5** have no SONY, as on the real boxes.
- Colours come from the picture: the grey `#7d7f82` on PS1 to PS3, `#bcbcbc` on PSP.

## On focus

A logo on a focused row turns dark on a light focus (`focus-light`) and white on a dark one (`.cmark` rules at the end
of `styles.css`), so it always reads.

## Clipping

A logo's box clips nothing: a glyph with a shadow gets padding inside its box (`--gp` on `.systile .glyph`, 0.9.30),
and a mark that would touch an edge is made smaller, never cut. The clipping audit (`tools/ui-audit/clipping.js`)
checks text; logos are checked by eye on Start, the consoles page and Achievements in every look before a release.
