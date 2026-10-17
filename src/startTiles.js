// Start's tiles (0.9.19): what each one is, its first size, the first layout, and pinning a game or
// console from its own page. 0.9.21 (owner: drag to any size, even a square, resize per edge): every
// tile has a place on the 8-column grid (x, y) and any size from 1 by 1 up to 8 by MAX_H; the board
// keeps tiles from overlapping and lets them fall up into gaps (settle).
import { store, saveConfig, toast } from './store.js';
import { pack, settle, bottom } from './startLayout.js';
export { COLS, MAX_H, collide, pack, settle, bottom } from './startLayout.js';

export const TILES = {
  continue: { name: 'Continue Playing', icon: 'mdiPlayCircleOutline', size: [4, 2] },
  clock: { name: 'Clock', icon: 'mdiClockOutline', size: [2, 1] },
  storage: { name: 'Storage', icon: 'mdiHarddisk', size: [2, 1] },
  week: { name: 'This Week', icon: 'mdiCalendarWeekOutline', size: [4, 1] },
  consoles: { name: 'Consoles', icon: 'mdiGamepadSquareOutline', size: [4, 1] },
  fresh: { name: 'New in Your Library', icon: 'mdiCreation', size: [4, 1] },
  recent: { name: 'Recently Played', icon: 'mdiHistory', size: [4, 1] },
  trophies: { name: 'Latest Trophies', icon: 'mdiTrophyOutline', size: [4, 1] },
  downloads: { name: 'Downloads', icon: 'mdiTrayArrowDown', size: [2, 1] },
  favs: { name: 'Favourites', icon: 'mdiHeartOutline', size: [4, 1] },
  recs: { name: 'Recommended for You', icon: 'mdiThumbUpOutline', size: [4, 1] },
  surprise: { name: 'Surprise Me', icon: 'mdiDiceMultipleOutline', size: [2, 1] },
  game: { name: 'A Game', icon: 'mdiGamepadVariantOutline', size: [2, 2] },
  console: { name: 'A Console', icon: 'mdiGamepadSquareOutline', size: [2, 1] },
  // 0.9.23 (owner: more and better widgets, custom HTML and pictures)
  stats: { name: 'Your Library', icon: 'mdiChartBoxOutline', size: [2, 1] },
  daily: { name: 'Game of the Day', icon: 'mdiWhiteBalanceSunny', size: [2, 2] },
  image: { name: 'A Picture', icon: 'mdiImageOutline', size: [2, 2] },
  html: { name: 'Your Own Widget', icon: 'mdiCodeTags', size: [2, 1] },
  // 0.9.24 (owner: console pages, like a PS3 page): one console's games, one console at a glance
  cgames: { name: 'A Console’s Games', icon: 'mdiGamepadVariantOutline', size: [4, 1] },
  cstats: { name: 'A Console at a Glance', icon: 'mdiChartBoxOutline', size: [2, 1] },
  // 0.9.28 (owner: more console widgets, something with the emulator): an emulator you open from Start, and
  // one console's games taking turns with their art
  emulator: { name: 'An Emulator', icon: 'mdiGamepadVariant', size: [2, 1] },
  spotlight: { name: 'Console Spotlight', icon: 'mdiSpotlightBeam', size: [4, 2] },
  // 0.9.32 (owner: "cooler, fun console widgets"): a console's game as its disc or cartridge, and its games on a shelf
  media: { name: 'Game Disc or Cartridge', icon: 'mdiDisc', size: [2, 2] },
  shelf: { name: 'Game Shelf', icon: 'mdiBookshelf', size: [4, 2] },
  // 0.9.71 (plan-0.9.29 2.1): your saves at a glance: last synced, anything waiting on you
  saves: { name: 'Saves', icon: 'mdiContentSaveOutline', size: [2, 1] },
};
// the add-a-widget sheet, grouped; these can be added more than once (each with its own game, console,
// picture, page or trophies of one console)
// 0.9.28 (owner: not one long scroll): tabs in the sheet, LB/RB between them
export const GROUPS = [
  ['Games', ['continue', 'recent', 'fresh', 'favs', 'recs', 'game']],
  ['Consoles', ['consoles', 'console', 'cgames', 'cstats', 'spotlight', 'media', 'shelf', 'emulator']],
  ['At a Glance', ['clock', 'week', 'stats', 'storage', 'downloads', 'saves', 'trophies']],
  ['Pictures and Fun', ['image', 'surprise', 'daily', 'html']],
];
export const MANY = new Set(['game', 'console', 'image', 'html', 'trophies', 'cgames', 'cstats', 'emulator', 'spotlight', 'media', 'shelf']);

const DEF = [['continue', 4, 2], ['clock', 2, 1], ['storage', 2, 1], ['week', 4, 1], ['consoles', 4, 1], ['fresh', 4, 1], ['recent', 4, 1], ['trophies', 4, 1]];
export const DEFAULT = () => pack(DEF.map(([type, w, h]) => ({ id: type, type, w, h })));

export const valid = (t) => !!(t && TILES[t.type] && Number.isFinite(t.w) && Number.isFinite(t.h));

export function pinToStart(p) {
  const cur = (store.config.ui.start?.tiles || []).filter(valid);
  const tiles = cur.length ? pack(cur) : DEFAULT();
  if (tiles.some((t) => t.type === p.type && (p.romId ? t.romId === p.romId : t.platformId === p.platformId))) return toast('Already on Start', 'info', 2000, 'mdiPin');
  const [w, h] = TILES[p.type].size;
  const t = { id: p.type + '-' + Date.now().toString(36), type: p.type, w, h, x: 0, y: bottom(tiles), ...(p.romId ? { romId: p.romId } : { platformId: p.platformId }) };
  saveConfig({ ui: { start: { tiles: settle([...tiles, t]) } } });
  toast('Pinned to Start', 'ok', 2200, 'mdiPin');
}
