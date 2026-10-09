'use strict';
// What Cartridge keeps of a RomM game (the library mirror, library.json). RomM changes between
// versions: fields come and go, lists can be missing or null, and older servers lack whole blocks
// (igdb_metadata, hltb_metadata, rom_user). So every field is read defensively: a missing or odd
// one becomes an empty value, never an error that stops a sync (0.9.3 H2, test/romm.test.js).
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function logoPath(r) {
  const p = obj(r.ss_metadata).logo_path || obj(r.gamelist_metadata).marquee_path || null;
  if (!p || typeof p !== 'string') return null;
  return /^(https?:)?\/\//.test(p) || p.startsWith('/assets/') ? p : '/assets/romm/resources/' + p.replace(/^\//, '');
}
// HowLongToBeat keeps times in seconds
const hltbHours = (v) => (v > 0 ? Math.round((v > 1000 ? v / 3600 : v) * 10) / 10 : null);
// the signed-in user's own fields for a game in RomM (play status, backlog, playing now, hidden)
function userOf(u) {
  if (!u || typeof u !== 'object') return null;
  const o = { status: u.status || null, backlog: !!u.backlogged, playing: !!u.now_playing, hidden: !!u.hidden, played: u.last_played ? Date.parse(u.last_played) || null : null };
  return o.status || o.backlog || o.playing || o.hidden || o.played ? o : null;
}
// The developer (0.9.3 L): RomM keeps developers and publishers apart (metadatum and each source's
// block); older servers only have one "companies" list, whose first entry can be the publisher, so
// that is the last resort
function developerOf(r) {
  r = obj(r);
  for (const b of [r.metadatum, r.igdb_metadata, r.ss_metadata, r.launchbox_metadata, r.moby_metadata, r.gamelist_metadata]) {
    // co-developed games list both studios (Tokyo Jungle: Crispy's! and Japan Studio), at most two
    const d = [...new Set(arr(obj(b).developers).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))].slice(0, 2);
    if (d.length) return d.join(', ');
  }
  return str(arr(obj(r.metadatum).companies)[0] || '');
}
function slimRom(r) {
  r = obj(r);
  const md = obj(r.metadatum), ig = obj(r.igdb_metadata), hl = obj(r.hltb_metadata);
  return {
    id: r.id, name: r.name || r.fs_name_no_ext || r.fs_name || '', fs_name: r.fs_name, fs_name_no_ext: r.fs_name_no_ext,
    platform_id: r.platform_id, platform_slug: r.platform_slug, platform_fs_slug: r.platform_fs_slug,
    platform_display_name: r.platform_display_name, fs_size_bytes: Number(r.fs_size_bytes) || 0,
    path_cover_small: r.path_cover_small, path_cover_large: r.path_cover_large, url_cover: r.url_cover,
    shot: arr(r.merged_screenshots)[0] || null,
    logo: logoPath(r),
    ra_id: r.ra_id || null,
    has_notes: !!(r.has_notes || arr(r.all_user_notes).length || obj(r.rom_user).note_raw_markdown),
    summary: str(r.summary).slice(0, 400),
    regions: arr(r.regions).map(str), files: arr(r.files).filter(Boolean).map((f) => (f.file_size_bytes != null || (f.full_path && r.full_path) ? { file_name: f.file_name, size: Number(f.file_size_bytes) || 0, nested: !!(f.full_path && r.full_path && f.full_path.slice(String(r.full_path).length + 1).includes('/')) } : { file_name: f.file_name })), // 0.9.63: sizes and nesting for the file picker
    year: md.first_release_date || null, genres: arr(md.genres).slice(0, 3),
    developer: developerOf(r), rating: md.average_rating || null,
    created_at: r.created_at, has_file_on_disk: r.has_file_on_disk !== false,
    // 0.7: series, modes, popularity and length for the automatic collections and filters
    igdb_id: r.igdb_id || null, series: [...new Set(arr(md.franchises))].slice(0, 3), modes: arr(md.game_modes), players: md.player_count || '',
    votes: ig.total_rating_count || 0, hours: hltbHours(hl.main_story),
    similar: arr(ig.similar_games).slice(0, 12).map((g) => (g && typeof g === 'object' ? g.id : g)).filter((x) => x != null),
    user: userOf(r.rom_user),
  };
}

// RomM's version from /api/heartbeat (0.9.3 K, plan H2). Cartridge reads RomM 3 and 4; an older
// server still syncs, but collections, play status and uploads may be missing, so the Issues list
// says so once instead of features failing one by one. Dev builds and odd strings count as fine.
const ROMM_MIN = [3, 0];
function rommTooOld(v) {
  const m = /^v?(\d+)\.(\d+)/.exec(str(v).trim());
  if (!m) return false;
  const [a, b] = [+m[1], +m[2]];
  return a < ROMM_MIN[0] || (a === ROMM_MIN[0] && b < ROMM_MIN[1]);
}

module.exports = { developerOf, slimRom, userOf, logoPath, hltbHours, rommTooOld, ROMM_MIN };
