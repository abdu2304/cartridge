'use strict';
// The environment Cartridge hands a program it starts (0.9.86). Always without Steam's overlay and runtime libraries
// (LD_PRELOAD, LD_LIBRARY_PATH) and the AppImage's own variables. Also without what belongs to the launch Steam made of
// Cartridge itself (STEAM_COMPAT_*, PRESSURE_VESSEL_*, STEAM_RUNTIME*): a Proton or a Steam runtime started by Cartridge
// would read them as its own (Heroic and Lutris clear them too). SteamGameId and SteamAppId stay: in Game Mode Proton
// tags the game's window with them, and gamescope keeps it in front. Tested in test/recipes.test.js.
const DROP = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD'];
const STEAM_LAUNCH = /^(STEAM_COMPAT_|PRESSURE_VESSEL_|STEAM_RUNTIME)/;
function clean(extra = {}, base = process.env) {
  const env = {};
  for (const [k, v] of Object.entries(base)) if (!DROP.includes(k) && !STEAM_LAUNCH.test(k)) env[k] = v;
  return Object.assign(env, extra);
}
// the same for a start script run by Steam (a port's .cartridge/play.sh): unset what Steam's launch of it carried
const SHELL_UNSET = 'for v in $(env | sed -n \'s/^\\(STEAM_COMPAT_[A-Z0-9_]*\\|PRESSURE_VESSEL_[A-Z0-9_]*\\|STEAM_RUNTIME[A-Z0-9_]*\\)=.*/\\1/p\'); do unset "$v"; done; unset LD_LIBRARY_PATH';
module.exports = { clean, SHELL_UNSET, STEAM_LAUNCH };
