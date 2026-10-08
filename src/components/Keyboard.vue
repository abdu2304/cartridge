<template>
  <div class="scrim" ref="el">
    <div class="dialog kb" ref="dlg" :class="{ sleek: store.welcoming, grow: !!from }" :style="growStyle" data-grid>
      <h2>{{ title }}</h2>
      <div class="kb-display" :class="{ empty: !text }">
        <template v-if="text"><span>{{ shown.slice(0, pos) }}</span><i class="caret" /><span>{{ shown.slice(pos) }}</span></template><template v-else><i class="caret" /><span class="ph">{{ placeholder }}</span></template>
        <button v-if="password" class="reveal" data-focus @click="reveal = !reveal"><Icon :name="reveal ? 'mdiEyeOff' : 'mdiEye'" /></button>
      </div>
      <!-- game names: whole titles that match, then the word being typed, completed -->
      <div v-if="mode === 'game'" class="kb-row sugg">
        <button v-for="(g, i) in suggestions" :key="g.kind + g.v" class="key small sg" :class="g.kind" data-focus :data-key="'sg-' + i" @click="pick(g)"><Icon v-if="g.kind === 'title'" name="mdiGamepadVariantOutline" :size="15" />{{ g.v }}</button>
        <span v-if="!suggestions.length" class="sg-empty">Game names show up here as you type</span>
      </div>
      <div v-if="quick.length" class="kb-row quick">
        <button v-for="q in quick" :key="q" class="key small" data-focus @click="type(q)">{{ q }}</button>
      </div>
      <div class="kb-rows">
        <div v-for="(row, ri) in rows" :key="ri" class="kb-row">
          <button v-for="k in row" :key="k" class="key" data-focus :data-autofocus="k === autofocusKey ? '' : undefined" @click="type(k)">{{ k }}</button>
        </div>
        <div class="kb-row">
          <button class="key wide" :class="{ on: caps }" data-focus @click="caps = !caps; shift = false"><Icon name="mdiAppleKeyboardCaps" /> Caps</button>
          <button class="key wide" :class="{ on: shift }" data-focus @click="shift = !shift"><Icon name="mdiAppleKeyboardShift" /> Shift</button>
          <button class="key wide" :class="{ on: sym }" data-focus @click="sym = !sym">{{ sym ? 'ABC' : '#+=' }}</button>
          <button class="key space" data-focus @click="type(' ')">Space</button>
          <button class="key wide" data-focus @click="paste"><Icon name="mdiContentPaste" /> Paste</button>
          <button class="key wide" data-focus @click="del"><Icon name="mdiBackspaceOutline" /></button>
          <button class="key wide done" data-focus @click="done"><Icon name="mdiCheck" /> Done</button>
        </div>
      </div>
      <div class="kb-hints">
        <span class="hint"><Btn b="LB+RB" />Move</span><span class="hint"><Btn b="X" />Delete</span><span class="hint"><Btn b="Y" />Space</span>
        <span class="hint"><Btn b="LT" />Shift, twice: Caps</span><span class="hint"><Btn b="RT" />Symbols</span><span class="hint"><Btn b="START" />Done</span><span class="hint"><Btn b="B" />Cancel</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// Built-in on-screen keyboard for controllers (Settings → Look & Feel → On-screen keyboard)
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { store, closeModal, call, allRoms } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';

const props = defineProps({
  title: { type: String, default: 'Enter text' },
  value: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  password: Boolean,
  mode: { type: String, default: 'text' }, // text | url | game (suggests your game names)
  from: Object, // { x, y }: where it was opened from (the search box): it grows out of there (0.9.24)
});
const el = ref(null), dlg = ref(null), growStyle = ref(null);
const text = ref(props.value || '');
const shift = ref(false);
const sym = ref(false);
const reveal = ref(false);
// 0.9.17 (owner): a cursor moved with LB/RB (or the arrow keys), so a typo is fixed where it is; Caps stays on
const caps = ref(false);
const pos = ref(text.value.length);
const upper = computed(() => shift.value !== caps.value);
const autofocusKey = computed(() => (sym.value ? '1' : upper.value ? 'Q' : 'q'));

const base = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '/', '@'],
];
const symbols = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['!', '#', '$', '%', '^', '&', '*', '(', ')', '_'],
  ['=', '+', '[', ']', '{', '}', '\\', '|', ';', ':'],
  ["'", '"', ',', '<', '>', '?', '`', '~', '.', '/'],
];
const rows = computed(() => (sym.value ? symbols : base.map((r) => r.map((k) => (upper.value ? k.toUpperCase() : k)))));
const quick = computed(() => (props.mode === 'url' ? ['http://', 'https://', '192.168.', ':8080', '.xyz', '.com', ':', 'localhost'] : []));
const shown = computed(() => (props.password && !reveal.value ? '•'.repeat(text.value.length) : text.value));

// Suggestions from your library's game names (mode 'game'). Words are ranked by how many titles use them.
const norm = (t) => t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
let index = null;
function buildIndex() {
  const titles = [...new Set(allRoms().map((r) => r.name).filter(Boolean))].map((n) => ({ n, k: norm(n) }));
  const words = new Map();
  for (const t of titles) for (const w of new Set(t.k.split(' '))) if (w.length > 2) words.set(w, (words.get(w) || 0) + 1);
  const wordList = [...words.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  return { titles, wordList };
}
const suggestions = computed(() => {
  if (props.mode !== 'game') return [];
  const q = norm(text.value);
  if (!q) return [];
  index ||= buildIndex();
  const parts = q.split(' '), last = parts[parts.length - 1];
  const done = parts.slice(0, -1);
  const hit = (k) => { const ws = k.split(' '); return done.every((p) => ws.includes(p)) && ws.some((w) => w.startsWith(last)); };
  const titles = index.titles.filter((t) => hit(t.k)).sort((a, b) => (b.k.startsWith(q) - a.k.startsWith(q)) || a.n.length - b.n.length).slice(0, 4);
  const words = last.length >= 1 ? index.wordList.filter((w) => w.startsWith(last) && w !== last).slice(0, 4) : [];
  return [...titles.map((t) => ({ kind: 'title', v: t.n })), ...words.map((w) => ({ kind: 'word', v: w }))];
});
function pick(g) {
  if (g.kind === 'title') text.value = g.v;
  else text.value = text.value.replace(/\S*$/, '') + g.v + ' ';
  pos.value = text.value.length;
}
function insert(k) { text.value = text.value.slice(0, pos.value) + k + text.value.slice(pos.value); pos.value += k.length; }
function type(k) {
  insert(k);
  if (shift.value && k.length === 1) shift.value = false;
}
async function paste() { try { const t = await call('clip:read'); if (t) insert(t); } catch {} }
function del() { if (!pos.value) return; text.value = text.value.slice(0, pos.value - 1) + text.value.slice(pos.value); pos.value--; }
const move = (d) => { pos.value = Math.max(0, Math.min(text.value.length, pos.value + d)); };
function done() { closeModal(text.value); }

function onKey(ev) {
  if (ev.ctrlKey && ev.key.toLowerCase() === 'v') {
    ev.preventDefault(); ev.stopImmediatePropagation();
    paste();
    return;
  }
  if (ev.key === 'Enter' && !ev.repeat && ev.isTrusted) { ev.preventDefault(); ev.stopImmediatePropagation(); done(); return; }
  if (ev.key === 'Backspace') { ev.preventDefault(); ev.stopImmediatePropagation(); del(); return; }
  if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && ev.isTrusted && !ev.altKey && document.activeElement?.closest?.('.kb-display')) { ev.preventDefault(); ev.stopImmediatePropagation(); move(ev.key === 'ArrowLeft' ? -1 : 1); return; }
  if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && ev.key !== ' ') { ev.preventDefault(); ev.stopImmediatePropagation(); insert(ev.key); return; }
  if (ev.key === ' ') { ev.preventDefault(); ev.stopImmediatePropagation(); insert(' '); }
}

let layer, lastLt = 0;
onMounted(() => {
  window.addEventListener('keydown', onKey, true);
  layer = pushLayer(el.value, {
    back: () => closeModal(null),
    x: del,
    y: () => type(' '),
    // LT is Shift; two quick presses are Caps (0.9.24, owner), as on a phone
    lt: () => { const now = performance.now(); if (now - lastLt < 380) { caps.value = !caps.value; shift.value = false; lastLt = 0; return; } lastLt = now; shift.value = !shift.value; },
    rt: () => (sym.value = !sym.value),
    start: done,
    lb: () => move(-1), rb: () => move(1), select: () => {},
  });
  focusFirst(el.value, '[data-autofocus]');
  if (props.from && dlg.value) { const r = dlg.value.getBoundingClientRect(); growStyle.value = { '--gx': `${props.from.x - (r.left + r.width / 2)}px`, '--gy': `${props.from.y - (r.top + r.height / 2)}px` }; }
});
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey, true); layer.pop(); });
</script>

<style scoped>
.kb { width: min(860px, 94vw); }
/* opened from the search box: it unfolds from there, quick and soft, then the keys settle row by row */
.kb.grow { animation: kb-grow var(--spring-d) var(--spring) both; }
@keyframes kb-grow { from { opacity: 0; transform: translate(var(--gx, 0), var(--gy, 0)) scale(0.18); border-radius: 999px; } 60% { opacity: 1; } }
.kb.grow .kb-row { animation: kb-row var(--spring-d) var(--spring) both; }
.kb.grow .kb-row:nth-child(2) { animation-delay: 30ms; } .kb.grow .kb-row:nth-child(3) { animation-delay: 60ms; } .kb.grow .kb-row:nth-child(4) { animation-delay: 90ms; } .kb.grow .kb-row:nth-child(5) { animation-delay: calc(var(--stagger) * 3); }
@keyframes kb-row { from { opacity: 0; transform: translateY(8px); } }
:global(body.motion-reduce .kb.grow), :global(body.motion-reduce .kb.grow .kb-row), :global(body.light-fx .kb.grow .kb-row) { animation: none; }
:global(body.light-fx .kb.grow) { animation: kb-fade var(--fade-in) both; }
@keyframes kb-fade { from { opacity: 0; } }
.kb-display { position: relative; display: flex; align-items: center; min-height: 56px; padding: 0 16px; border-radius: var(--r-md); background: var(--bg); border: 1px solid var(--primary); font-size: var(--t-lg); overflow: hidden; white-space: nowrap; }
.kb-display .ph { color: var(--dim); }
.caret { display: inline-block; width: 2px; height: 26px; background: var(--primary-l); margin-left: 2px; animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.reveal { margin-left: auto; padding: 6px; border-radius: var(--r-md); color: var(--muted); }
.reveal:focus { box-shadow: var(--ring); }
.kb-rows { display: flex; flex-direction: column; gap: 8px; }
.kb-row { display: flex; gap: 8px; justify-content: center; }
.key { flex: 1; height: 52px; border-radius: var(--r-md); background: rgba(255,255,255,.07); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; gap: 6px; font-size: var(--t-lg); transition: transform var(--spring-snappy-d) var(--spring-snappy); }
.key.small { height: 38px; font-size: var(--t-sm); flex: none; padding: 0 12px; }
.key.wide { flex: 1.6; font-size: var(--t-sm); }
.key.space { flex: 4; font-size: var(--t-sm); }
.key.on { background: var(--sel-bg); box-shadow: var(--sel-under); color: var(--on-sel); }
.key.done { background: var(--btn, var(--grad)); border: 0; color: var(--on-btn, var(--on-primary)); font-weight: 700; }
.key:focus { background: var(--focus); color: var(--on-focus); border-color: transparent; box-shadow: none; transform: scale(1.04); z-index: 1; } /* 0.9.60 (owner): a fill, never a white outline */
.key:hover { background: rgba(255,255,255,.12); }
.sugg { justify-content: flex-start; flex-wrap: nowrap; overflow: hidden; min-height: 38px; padding: 6px; margin: -6px; } /* 0.9.60: room for a focused key to grow inside the row (it was cut, owner's photo) */
.key.sg { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; gap: 6px; }
.sg-empty { color: var(--dim); font-size: var(--t-sm); align-self: center; padding-left: 4px; }
.key.sg.title { background: rgba(var(--primary-rgb), 0.18); border-color: rgba(var(--primary-rgb), 0.45); }
.kb-hints { display: flex; gap: 18px; justify-content: center; color: var(--muted); font-size: var(--t-xs); }
.hint { display: flex; align-items: center; gap: 6px; }
/* the welcome's keyboard (0.9.17): glass like the welcome card, quiet keys, the white focus box */
.kb.sleek { background: var(--kb-sleek-bg, rgba(14, 16, 22, 0.96)); backdrop-filter: var(--kb-sleek-blur, none); /* frosted only in Glass (0.9.48) */ border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55); }
.kb.sleek h2 { font-weight: 600; letter-spacing: -0.01em; }
.kb.sleek .kb-display { background: rgba(255, 255, 255, 0.06); border: 0; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1); }
.kb.sleek .caret { background: #fff; }
.kb.sleek .key { background: rgba(255, 255, 255, 0.06); border: 0; border-radius: var(--r-md); font-weight: 500; transition: background var(--d-1, 0.12s), transform var(--d-1, 0.12s); }
.kb.sleek .key.on { background: rgba(255, 255, 255, 0.18); }
.kb.sleek .key:focus { background: var(--focus, #fff); color: var(--on-focus, #000); box-shadow: none; transform: scale(1.04); }
.kb.sleek .key.done { background: #fff; color: #000; }
</style>
