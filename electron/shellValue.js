// Values from a shell file of NAME=value lines (EmuDeck's ~/.config/EmuDeck/settings.sh), read as sh would.
// EmuDeck writes emulationPath="/run/media/x/Drive"/Emulation: a quoted part and an unquoted tail are one word.
// 0.9.89 (PC playtest: recomp/ and bios/ made beside Emulation on an SD card or external drive) read only the quoted
// part, so every Emulation folder on a drive picked in EmuDeck lost its last folder.
function word(s) {
  let out = '', i = 0;
  while (i < s.length && !/[\s;#]/.test(s[i])) {
    const c = s[i];
    if (c === '"' || c === "'") {
      const j = s.indexOf(c, i + 1);
      if (j < 0) { out += s.slice(i + 1); break; }
      out += s.slice(i + 1, j); i = j + 1;
    } else if (c === '\\' && i + 1 < s.length) { out += s[i + 1]; i += 2; } else { out += c; i++; }
  }
  return out;
}
// the last assignment of each wanted name wins, as in sh
function read(text, names) {
  const out = {}, want = new Set(names);
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)=(.*)$/);
    if (m && want.has(m[1])) out[m[1]] = word(m[2]).trim();
  }
  return out;
}
module.exports = { read, word };
