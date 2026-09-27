import { reactive, markRaw } from 'vue';

const rd = window.cart;
export const call = (ch, arg) => rd.call(ch, arg ? JSON.parse(JSON.stringify(arg)) : arg);

export const store = reactive({
  config: null,
  info: {},
  connection: { base: '', route: '' },
  lib: null, // markRaw({ platforms, roms: {pid: []}, firstSeen, syncedAt, lastNew })
  libVersion: 0,
  installed: {},
  sync: { state: 'idle' },
  downloads: [],
  bg: '',
  route: { name: 'home', params: {} },
  history: [],
  hints: [],
  viewHandlers: {},
  toasts: [],
  modal: null,
  quickMenu: false,
  lastSearch: '',
  manualSync: false,
  update: { state: 'idle' },
});

// ---------------- routing
export function go(name, params = {}) {
  store.history.push({ ...store.route, focusKey: document.activeElement?.dataset?.key || null });
  store.route = { name, params };
}
export function back() {
  if (!store.history.length) return false;
  store.route = store.history.pop();
  return true;
}
export function tab(name) {
  store.history = [];
  store.route = { name, params: {} };
}

// ---------------- toasts
let tid = 1;
export function toast(msg, kind = 'info', ms = 3400, icon) {
  const t = { id: tid++, msg, kind, icon: icon || { ok: 'mdiCheck', error: 'mdiAlertCircleOutline', info: 'mdiInformationVariant' }[kind] };
  store.toasts.push(t);
  if (store.toasts.length > 4) store.toasts.shift();
  setTimeout(() => { const i = store.toasts.indexOf(t); if (i >= 0) store.toasts.splice(i, 1); }, ms);
}

// ---------------- modals
export function openModal(type, props = {}) {
  return new Promise((resolve) => { store.modal = { type, props, resolve }; });
}
export function closeModal(value) {
  const m = store.modal;
  store.modal = null;
  m?.resolve(value);
}
export const askText = (props) => openModal('keyboard', props);
export const pickFolder = (props) => openModal('folder', props);
export const choose = (props) => openModal('menu', props);
export const confirm = (title, message, okLabel = 'Confirm', danger = false) =>
  openModal('menu', { title, message, options: [{ label: okLabel, value: true, danger, icon: danger ? 'mdiAlertOutline' : 'mdiCheck' }, { label: 'Cancel', value: false, icon: 'mdiClose' }] });

// ---------------- config
export async function loadConfig() {
  store.config = await call('config:get');
  store.info = await call('app:info');
}
export async function saveConfig(patch) {
  store.config = await call('config:set', patch);
}

// ---------------- library
let romIndex = new Map();
function setLib(lib) {
  if (!lib) { store.lib = null; romIndex = new Map(); store.libVersion++; return; }
  romIndex = new Map();
  for (const list of Object.values(lib.roms)) for (const r of list) romIndex.set(r.id, r);
  lib.platforms.sort((a, b) => a.display_name.localeCompare(b.display_name));
  store.lib = markRaw(lib);
  store.libVersion++;
}
export async function loadLibrary() {
  setLib(await call('library:get'));
  store.installed = await call('installed:get');
}
export const romById = (id) => (store.libVersion, romIndex.get(Number(id)));
export const platformById = (id) => (store.libVersion, store.lib?.platforms.find((p) => p.id === Number(id)));
export function visiblePlatforms() {
  if (!store.lib) return [];
  return store.lib.platforms.filter((p) => !store.config.ui.hideEmpty || p.rom_count > 0);
}
export function romsOf(pid) { return (store.libVersion, store.lib?.roms[pid] || []); }
export function allRoms() { return (store.libVersion, [...romIndex.values()]); }
const NEW_WINDOW = 5 * 24 * 3600e3;
export function isNew(rom) {
  const t = store.lib?.firstSeen?.[rom.id];
  return !!t && t > 1 && Date.now() - t < NEW_WINDOW;
}

export async function resync() {
  store.manualSync = true;
  try { return await call('library:sync'); }
  catch (e) { toast(e.message, 'error'); return null; }
}
export async function scanServer() {
  toast('Asking RomM to scan for new files…', 'info', 3000, 'mdiRadar');
  try {
    store.manualSync = true;
    await call('library:scan');
  } catch (e) { toast(e.message, 'error', 6000); }
}

// ---------------- images / backgrounds
export function img(p) {
  if (!p) return '';
  return 'romimg://img/?u=' + encodeURIComponent(p);
}
export function cover(rom, large = false) {
  const p = (large ? rom.path_cover_large || rom.path_cover_small : rom.path_cover_small || rom.path_cover_large) || rom.url_cover;
  return img(p);
}
export function backdropOf(rom) {
  if (!rom) return '';
  if (rom.shot) return { src: img(rom.shot), blur: false };
  const c = cover(rom, true);
  return c ? { src: c, blur: true } : '';
}
let bgTimer;
export function setBg(b) {
  clearTimeout(bgTimer);
  bgTimer = setTimeout(() => { store.bg = b || ''; }, 140);
}

// ---------------- downloads
export function downloadFor(romId) {
  for (let i = store.downloads.length - 1; i >= 0; i--) if (store.downloads[i].romId === romId) return store.downloads[i];
  return null;
}
export async function download(rom) {
  const p = platformById(rom.platform_id);
  if (p && !p.target?.path) { toast(`Set a folder for ${p.display_name} first`, 'error'); return false; }
  await call('dl:add', { romId: rom.id, name: rom.name, platformSlug: rom.platform_slug, platformName: rom.platform_display_name, size: rom.fs_size_bytes, cover: rom.path_cover_small || rom.url_cover });
  toast(`Downloading ${rom.name}`, 'info', 2000, 'mdiDownload');
  return true;
}

// ---------------- formatting
export function bytes(n) {
  if (!n && n !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export function year(ts) {
  if (!ts) return '';
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  return isNaN(d) ? '' : String(d.getFullYear());
}
export function ago(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export function rating(r) { return r ? (r <= 10 ? `${r.toFixed(1)}` : `${Math.round(r)}%`) : ''; }

// ---------------- live events
rd.on('downloads', (list) => { store.downloads = list; });
rd.on('connection', (c) => { store.connection = c; });
rd.on('library', (lib) => setLib(lib));
rd.on('installed', (m) => { store.installed = m; });
rd.on('sync', (s) => { store.sync = s; });
rd.on('update', (u) => {
  if (u.state === 'ready' && store.update.state !== 'ready') toast(`Cartridge ${u.version} is ready. Restart from the Quick Menu to update.`, 'ok', 6000, 'mdiUpdate');
  store.update = u;
});
call('update:get').then((u) => { store.update = u; }).catch(() => {});
rd.on('installed-changed', ({ romId, path }) => {
  if (path) store.installed[romId] = path;
  else delete store.installed[romId];
});
call('dl:list').then((l) => { store.downloads = l; });

// ---------------- collections
export function collections() { return (store.libVersion, store.lib?.collections || []); }
export function collectionById(id) { return collections().find((c) => c.id === id); }
export function romsOfCollection(id) {
  const c = collectionById(id);
  return c ? c.rom_ids.map((rid) => romIndex.get(rid)).filter(Boolean) : [];
}
