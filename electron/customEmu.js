'use strict';
// An emulator or fork from a GitHub link (0.9.24, owner: the last card on Settings → Emulators → Emulators:
// paste a GitHub link, say which console it's for or what it's a fork of, and Cartridge installs it where
// its other emulators live). Only the project's own newest release, only a Linux x86_64 AppImage.
// No imports beyond Node, so the picking can be tested (test/customEmu.test.js).

// "https://github.com/owner/repo/releases/tag/v1" or "owner/repo" -> "owner/repo"
function repoOf(link) {
  const s = String(link || '').trim().replace(/\.git$/i, '');
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i.exec(s) || /^([\w.-]+)\/([\w.-]+)$/.exec(s);
  return m && !/^(releases|orgs|topics)$/i.test(m[1]) ? `${m[1]}/${m[2]}` : null;
}
// the release's Linux AppImage for this machine: x86_64 (or no arch named), never ARM; the plainest name first
function pickAsset(assets) {
  const ok = (assets || []).filter((a) => /\.appimage$/i.test(a.name) && !/(aarch64|arm64|armhf|armv7|\.zsync$)/i.test(a.name));
  const score = (n) => (/(x86_64|amd64|x64)/i.test(n) ? 0 : 1) + (/(debug|symbols|test)/i.test(n) ? 5 : 0) + n.length / 1000;
  return ok.sort((a, b) => score(a.name) - score(b.name))[0] || null;
}
// 0.9.32 (owner: a GR2 fork with only a Linux .zip): no AppImage, so a Linux archive for x86_64, never Windows,
// macOS, Android, ARM or the source code; one that names Linux and x86_64 first
const ARCHIVE = /\.(zip|tar\.(gz|xz|zst|bz2)|tgz|txz|7z)$/i;
const NOT_LINUX = /\b(win(32|64|dows)?|msvc|mingw|mac(os)?|osx|darwin|apple|android|apk|ios|aarch64|arm64|armhf|armv7|source|src|symbols|pdb)\b/i;
function pickArchive(assets) {
  const ok = (assets || []).filter((a) => ARCHIVE.test(a.name) && !NOT_LINUX.test(a.name.replace(/[-_.]+/g, ' ')));
  const score = (n) => (/linux/i.test(n) ? 0 : 2) + (/(x86_64|amd64|x64)/i.test(n) ? 0 : 1) + (/appimage/i.test(n) ? -1 : 0) + n.length / 1000;
  return ok.sort((a, b) => score(a.name) - score(b.name))[0] || null;
}
// 0.9.64 (owner: "always default to a Linux build; if there absolutely isn't one, Windows, then nothing else"): a Windows
// x64 build, run through Proton: a lone .exe or an archive holding one. Never Android, macOS, ARM, debug symbols or source.
const NOT_WIN = /\b(android|apk|ios|mac(os)?|osx|darwin|apple|aarch64|arm64|armhf|armv7|arm|x86_32|i[3-6]86|win32|source|src|symbols|pdb|debug)\b/i;
function pickWindows(assets) {
  const ok = (assets || []).filter((a) => (/\.exe$/i.test(a.name) || /\.(zip|7z)$/i.test(a.name)) && !NOT_WIN.test(a.name.replace(/[-_.]+/g, ' ')) && !/setup|installer|uninstall|vc_?redist/i.test(a.name));
  const score = (n) => (/(win(dows)?|msvc|mingw)/i.test(n) ? 0 : 2) + (/(x86_64|x64|amd64|win64)/i.test(n) ? 0 : 1) + (/\.exe$/i.test(n) ? 1 : 0) + n.length / 1000;
  return ok.filter((a) => /(win(dows)?|msvc|mingw|\.exe$)/i.test(a.name)).sort((a, b) => score(a.name) - score(b.name))[0] || null;
}
// the Windows program in an unpacked folder: .exe files that aren't helpers, the shallowest and biggest first
function windowsProgramsIn(files) {
  return files.filter((f) => /\.exe$/i.test(f.rel) && !/(unins|setup|install|update|crash|helper|vc_?redist|dxsetup|7z)/i.test(f.rel.split('/').pop()))
    .sort((a, b) => a.rel.split('/').length - b.rel.split('/').length || b.size - a.size);
}
// what in an unpacked folder could be the emulator: AppImages first, else programs; libraries, helpers and
// updaters left out. files: [{ rel, size, appimage, elf }]
function programsIn(files) {
  const skip = (r) => /\.(so(\.\d+)*|a|o|py|sh|txt|md|json|ini|png|svg|desktop)$/i.test(r) || /(^|\/)(lib|plugins?|platforms|share)\//i.test(r) || /(updater|crash|helper|uninstall|daemon|launcher-?update)/i.test(r.split('/').pop());
  const apps = files.filter((f) => f.appimage && !skip(f.rel));
  const pick = apps.length ? apps : files.filter((f) => f.elf && !skip(f.rel) && f.size > 512 * 1024);
  return pick.sort((a, b) => a.rel.split('/').length - b.rel.split('/').length || b.size - a.size);
}
// file name it's saved under: the repo's name, so updates and other tools find it the same way each time
function fileName(repo, asset) {
  const base = repo.split('/')[1].replace(/[^\w.-]+/g, '');
  return /\.appimage$/i.test(base) ? base : `${base}.AppImage`;
}
module.exports = { repoOf, pickAsset, pickArchive, pickWindows, windowsProgramsIn, programsIn, fileName };
