// What this RomM server can do (0.9.79, owner: "yes" to switching features off on an older RomM). RomM is FastAPI and
// serves its own API description at /openapi.json (nginx passes it through), so each feature is judged by the
// endpoints it needs being there, never by a guessed version number. No description = everything stays on, as before.
const FEATURES = {
  collections: { label: 'Collections', need: [['get', '/api/collections']] },
  // Save Sync writes slots and RomM's content hash (RomM saves.py add_save); older save APIs had neither
  saves: { label: 'Cartridge Save Sync', need: [['post', '/api/saves', ['slot', 'content_hash']]] },
  playSessions: { label: 'Play Time From Other Devices', need: [['post', '/api/play-sessions'], ['get', '/api/devices']] },
  notes: { label: 'Trophy Sync', need: [['get', '/api/roms/{}/notes']] },
  qr: { label: 'Sign In With a QR Code', need: [['post', '/api/auth/device/init']] },
  upload: { label: 'Upload to RomM', need: [['post', '/api/roms/upload/start']], or: [['post', '/api/roms']] },
};

const norm = (p) => String(p || '').replace(/\{[^}]*\}/g, '{}').replace(/\/+$/, '');
const paramsOf = (op) => new Set((op?.parameters || []).map((x) => x?.name).filter(Boolean));

function has(paths, [method, path, params]) {
  const op = paths.get(norm(path))?.[method];
  if (!op) return false;
  if (!params) return true;
  const got = paramsOf(op);
  return params.every((n) => got.has(n));
}

// doc = RomM's openapi.json; returns { known, on: { feature: bool }, off: [labels] }
function fromOpenApi(doc) {
  const raw = doc && typeof doc === 'object' ? doc.paths : null;
  if (!raw || typeof raw !== 'object') return { known: false, on: Object.fromEntries(Object.keys(FEATURES).map((k) => [k, true])), off: [] };
  const paths = new Map(Object.entries(raw).map(([p, v]) => [norm(p), v || {}]));
  const on = {};
  for (const [k, f] of Object.entries(FEATURES)) on[k] = f.need.every((n) => has(paths, n)) || !!(f.or && f.or.every((n) => has(paths, n)));
  return { known: true, on, off: Object.keys(FEATURES).filter((k) => !on[k]).map((k) => FEATURES[k].label) };
}

module.exports = { FEATURES, fromOpenApi, norm };
