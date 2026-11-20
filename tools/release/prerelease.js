#!/usr/bin/env node
'use strict';
// Beta and Nightly builds (0.9.71, rewritten in 0.9.92: the first copy sat under .gitignore's release/ and never reached
// the repository, so every nightly failed here). Run by .github/workflows/prerelease.yml only, in CI, never committed:
// stamps package.json with the next patch plus the channel (0.9.93-nightly.20261120.34, 0.9.93-beta.5), its name as
// Settings shows it, and publishes as a GitHub pre-release on that channel (electron-updater reads <channel>-linux.yml).
// Nightly notes are the commits since the last stable tag; beta keeps RELEASE_NOTES.md.
//   node tools/release/prerelease.js <beta|nightly> <run number>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const UC = require('../../electron/updateChannels');

const [channel, run] = process.argv.slice(2);
if (!['beta', 'nightly'].includes(channel) || !/^\d+$/.test(run || '')) { console.error('usage: prerelease.js <beta|nightly> <run number>'); process.exit(1); }
const root = path.join(__dirname, '../..'), file = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const version = UC.nextVersion(pkg.version, channel, run);
const name = UC.nameOf('v' + version);
pkg.version = version;
pkg.versionName = name;
pkg.build.releaseInfo = { ...(pkg.build.releaseInfo || {}), releaseName: `Cartridge ${name}` };
pkg.build.publish = (pkg.build.publish || []).map((p) => ({ ...p, releaseType: 'prerelease', channel }));
if (channel === 'nightly') {
  const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  const last = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]', '--exclude', '*-*');
  const log = git('log', '--no-merges', '--format=- %s', last ? `${last}..HEAD` : '-30').split('\n').filter(Boolean).slice(0, 60);
  const notes = `## Cartridge ${name}\n\nBuilt from the newest work. It can be broken; Settings → Downloads and Updates → Choose a Version goes back.\n\n### Since ${last ? last.slice(1) : 'the last release'}\n${log.join('\n') || '- No changes listed.'}\n`;
  fs.writeFileSync(path.join(root, 'release-notes-nightly.md'), notes);
  pkg.build.releaseInfo.releaseNotesFile = 'release-notes-nightly.md';
}
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log(`${channel}: ${version} (${name})`);
