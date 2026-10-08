// Game-name suggestions while typing a search (0.9.17 on Cartridge's keyboard; 0.9.61 shared with the plain text box,
// owner: "you removed smart search", typing with Steam's or a real keyboard showed none). Whole titles that hold every
// word typed so far, then the word being typed completed, ranked by how many titles use it.
import { store, allRoms } from './store.js';

export const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
let index = null, built = -1;
function buildIndex() {
  const titles = [...new Set(allRoms().map((r) => r.name).filter(Boolean))].map((n) => ({ n, k: norm(n) }));
  const words = new Map();
  for (const t of titles) for (const w of new Set(t.k.split(' '))) if (w.length > 2) words.set(w, (words.get(w) || 0) + 1);
  return { titles, wordList: [...words.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w) };
}
export function suggest(text, { titles: nT = 4, words: nW = 4 } = {}) {
  const q = norm(text);
  if (!q) return [];
  if (!index || built !== store.libVersion) { index = buildIndex(); built = store.libVersion; } // the library changed
  const parts = q.split(' '), last = parts[parts.length - 1], done = parts.slice(0, -1);
  const hit = (k) => { const ws = k.split(' '); return done.every((p) => ws.includes(p)) && ws.some((w) => w.startsWith(last)); };
  const titles = index.titles.filter((t) => hit(t.k)).sort((a, b) => (b.k.startsWith(q) - a.k.startsWith(q)) || a.n.length - b.n.length).slice(0, nT);
  const words = nW ? index.wordList.filter((w) => w.startsWith(last) && w !== last).slice(0, nW) : [];
  return [...titles.map((t) => ({ kind: 'title', v: t.n })), ...words.map((w) => ({ kind: 'word', v: w }))];
}
// what picking one does to the text: a title replaces it, a word completes the one being typed
export const applySuggestion = (text, g) => (g.kind === 'title' ? g.v : text.replace(/\S*$/, '') + g.v + ' ');
