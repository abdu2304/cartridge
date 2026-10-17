'use strict';
// Update channels (0.9.71, owner: "allow users to switch beta channels and nightly versions via the update menu").
// Stable: GitHub's latest release, as before. Beta: stable and beta releases (v0.9.71-beta.2), whichever is newest.
// Nightly: the newest nightly build (v0.9.71-nightly.20261018.3), made every night from the newest work by
// .github/workflows/nightly.yml. Beta and nightly releases are GitHub pre-releases, so Stable never sees them.
// electron-updater's GitHub provider does the picking (GitHubProvider.getLatestVersion): with allowPrerelease and
// channel "beta" it takes the first stable-or-beta entry of the releases feed, with a custom channel ("nightly")
// only entries of that channel. Pure; tested in test/updateChannels.test.js.

const CHANNELS = {
  stable: { label: 'Stable', what: 'Finished releases. Recommended.' },
  beta: { label: 'Beta', what: 'The next release a few days early, to try before everyone else. Gets stable releases too.' },
  nightly: { label: 'Nightly', what: 'Built every night from the newest work. Can be broken; Roll Back is always there.' },
};
const TAG = /^v?(\d+\.\d+\.\d+)(?:-(beta|nightly)\.([\d.]+))?$/;

// 'stable' | 'beta' | 'nightly' | null for a version or tag
function channelOf(v) {
  const m = TAG.exec(String(v || '').trim());
  return m ? (m[2] || 'stable') : null;
}
const validTag = (t) => TAG.test(String(t || '')) && String(t).startsWith('v');
const pick = (c) => (CHANNELS[c] ? c : 'stable');

// set electron-updater up for a channel; `switched` lets it install a lower version once (Nightly to Stable)
function apply(updater, channel, { switched = false } = {}) {
  const c = pick(channel);
  if (c === 'stable') { updater.allowPrerelease = false; if (updater.channel != null) updater.channel = 'latest'; }
  else { updater.allowPrerelease = true; updater.channel = c; }
  updater.allowDowngrade = !!switched; // the channel setter turns it on; only a switch needs it
  return c;
}

// a release's name as people read it: "0.9.71 Beta 2", "Nightly 18 Oct 2026"
function nameOf(tag, title) {
  const m = TAG.exec(String(tag || ''));
  if (!m) return String(title || tag || '').replace(/^Cartridge\s+/i, '');
  if (!m[2]) return String(title || '').replace(/^Cartridge\s+/i, '').trim() || m[1];
  if (m[2] === 'beta') return `${m[1]} Beta ${m[3]}`;
  const d = /^(\d{4})(\d{2})(\d{2})/.exec(m[3]);
  const date = d ? new Date(`${d[1]}-${d[2]}-${d[3]}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : m[3];
  return `${m[1]} Nightly ${date}`;
}

// GitHub releases (API shape) to the version list in Settings, newest first, by channel
function list(releases, current) {
  return (releases || [])
    .filter((x) => !x.draft && validTag(x.tag_name) && (x.assets || []).some((a) => a.name === 'Cartridge-x86_64.AppImage'))
    .map((x) => ({ tag: x.tag_name, channel: channelOf(x.tag_name), name: nameOf(x.tag_name, x.name), date: x.published_at || '', current: x.tag_name === 'v' + current }));
}

// what CI stamps on a beta or nightly build: the next patch number with the channel after it
function nextVersion(version, channel, n, date = new Date()) {
  const [a, b, c] = String(version).split('-')[0].split('.').map(Number);
  const base = `${a}.${b}.${c + 1}`;
  if (channel === 'beta') return `${base}-beta.${n}`;
  if (channel === 'nightly') { const d = date.toISOString().slice(0, 10).replace(/-/g, ''); return `${base}-nightly.${d}.${n}`; }
  return String(version);
}

module.exports = { CHANNELS, channelOf, validTag, apply, nameOf, list, nextVersion, pick };
