// RetroArch netplay from Cartridge (0.9.80): hosting or joining is a per-session choice RetroArch takes on its command
// line (retroarch.c long options: "host" -H, "connect" -C <address>, "port" <n>; the default port is 55435,
// config.def.h RARCH_DEFAULT_PORT). The game starts with the same command its Steam shortcut runs, with
// the flags put before the core (-L), so EmuDeck's retroarch.sh and Flatpak's `run org.libretro.RetroArch` pass them on.
const DEFAULT_PORT = 55435;

const hostOk = (v) => /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(v) || /^\[?[0-9a-f:]+\]?$/i.test(v);
function checkJoin(host, port) {
  const h = String(host || '').trim(), p = port == null || port === '' ? DEFAULT_PORT : Number(port);
  if (!h) return { why: 'Type the address your friend gave you.' };
  if (!hostOk(h)) return { why: 'That isn’t an address: use numbers with dots (like 203.0.113.7) or a name.' };
  if (!Number.isInteger(p) || p < 1 || p > 65535) return { why: 'A port is a number from 1 to 65535.' };
  return { host: h.replace(/^\[|\]$/g, ''), port: p };
}
const isRetroArch = (cmd) => !!cmd && (/retroarch/i.test(cmd.exe + ' ' + cmd.args) || /(^|\s)-L\s/.test(cmd.args || ''));
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
// the shell line: env pairs from `pre` (vblank_mode=0), the program, the flags, then the shortcut's own arguments
function commandLine(cmd, mode, join = {}) {
  const flags = mode === 'host' ? ['--host'] : ['--connect', shq(join.host), '--port', String(join.port || DEFAULT_PORT)];
  const env = (cmd.pre || []).filter((x) => /^[A-Za-z_]\w*=\S*$/.test(x));
  const args = String(cmd.args || ''), at = args.search(/(^|\s)-L\s/);
  const rest = at < 0 ? `${flags.join(' ')} ${args}` : `${args.slice(0, at)} ${flags.join(' ')} ${args.slice(at)}`;
  return `${env.length ? env.join(' ') + ' ' : ''}exec ${shq(cmd.exe)} ${rest.replace(/\s+/g, ' ').trim()}`;
}

module.exports = { DEFAULT_PORT, checkJoin, isRetroArch, commandLine };
