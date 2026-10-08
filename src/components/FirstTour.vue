<template>
  <div class="tour-root" :class="{ ready }">
    <!-- the spotlight: a hole over the real interface, the rest dimmed; it glides from one thing to the next -->
    <div class="spot" :class="{ none: !box }" :style="spotStyle" />
    <div class="bubble dialog" ref="el" :style="bubbleStyle" :class="{ center: !box }">
      <div class="t-top"><span class="t-step">{{ i + 1 }} of {{ steps.length }}</span><button class="t-skip" data-focus @click="done">Skip Tour</button></div>
      <h2>{{ s.title }}</h2>
      <!-- buttons in the text are drawn for what's in your hands (0.9.38, owner: "A" was just a letter): the
           controller's own glyph, or the key on a keyboard -->
      <p class="muted"><template v-for="(x, n) in parts(s.text)" :key="n"><template v-if="!x.b">{{ x.t }}</template><kbd v-else-if="input.mode === 'mouse' || input.keys">{{ KEYS[x.b] || x.b }}</kbd><Btn v-else :b="x.b" class="t-inl" /></template></p>
      <!-- what to do, for what's in your hands: a button, a key, a click or a tap -->
      <div v-if="s.task" class="t-task" :class="{ ok: did }">
        <span class="t-do"><template v-if="did"><Icon name="mdiCheckCircle" :size="20" />Done</template><template v-else>
          <!-- 0.9.38 (owner): only what's in your hands, the controller's button or the keyboard's key, never both -->
          <template v-if="input.mode === 'pad' && input.keys && s.task.key">Press <kbd>{{ s.task.key }}</kbd></template>
          <template v-else-if="input.mode === 'pad'">Press <Btn v-for="k in s.task.pad" :key="k" :b="k" /></template>
          <template v-else-if="input.mode === 'touch'">{{ s.task.touch }}</template>
          <template v-else-if="s.task.mouse">{{ s.task.mouse }}<template v-if="s.task.key"> or press <kbd>{{ s.task.key }}</kbd></template></template>
          <template v-else>Press <kbd>{{ s.task.key }}</kbd></template>
        </template></span>
      </div>
      <div class="row t-act">
        <button v-if="i" class="btn" data-focus @click="go(i - 1)"><Icon name="mdiArrowLeft" />Back</button>
        <span style="flex: 1" />
        <button class="btn" :class="{ primary: !s.task || did }" data-focus data-autofocus @click="next">{{ i === steps.length - 1 ? 'Start Playing' : s.task && !did ? 'Skip This Step' : 'Continue' }}<Icon name="mdiArrowRight" /></button>
      </div>
    </div>
  </div>
</template>

<script setup>
// The first-start tour (0.9.37, owner: "much more interactive, not a series of cards"). It points at the real
// interface and asks you to do each thing yourself: the tour's layer hands those presses to the app (nav.js
// below()), and a step is done when the app's state says so, whatever you used: controller, keys, mouse or touch.
// It lives outside the one pop-up slot (store.tour), so the search keyboard and the Quick Menu open over it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { pushLayer, focusFirst, input } from '../nav.js';
import { store, closeTour, activeTabs, tab } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';

const props = defineProps({ start: Boolean, only: Boolean });
const tabSel = (name) => `.statusbar .tab[data-tab="${name}"]`;
// {A}, {LB}... in a step's text become the button's glyph (or its key on a keyboard)
const KEYS = { A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', LB: 'Q', RB: 'E', LT: 'Page Up', RT: 'Page Down', START: 'M', SELECT: 'Ctrl+J', RS: ', .' };
const parts = (t) => String(t).split(/(\{[A-Z]+\})/).filter(Boolean).map((x) => (/^\{[A-Z]+\}$/.test(x) ? { b: x.slice(1, -1) } : { t: x }));
const START = [
  { title: 'This Is Start', text: 'Your own page of widgets: what you were playing, new games, trophies, a clock and more. Cartridge opens here.', at: 'main.main' },
  { title: 'Make It Yours', text: 'Hold {A} on a widget (or press and hold it) to arrange Start: move, resize, add widgets, pictures and your own pages.', at: '.st-tile' },
  { title: 'Step Through', text: 'On a widget with several games, {LB} and {RB} move between them. Flick {RS}, or swipe, for the next page.', at: '.st-tile' },
];
// 0.9.38 (owner: the tour only showed Start): it visits the other pages too, each with what it's for
const PAGES = [
  { title: 'Home', go: 'home', text: 'Your library at a glance: Continue Playing, what’s new, recommendations and your latest trophies. {A} opens a game, {X} downloads it.', at: 'main.main' },
  { title: 'Library', go: 'library', text: 'Every game on your server, with filters and sorting at the top. Pick a few at once to download them or add them to Steam together.', at: 'main.main' },
  { title: 'Consoles', go: 'consoles', text: 'Each console with its games. Its More ({Y}) holds the emulator it uses and how its games go into Steam.', at: 'main.main' },
  { title: 'Scroll With the Right Stick', go: 'home', text: 'Push {RS} up or down to scroll any page, list or pop-up without moving the highlight. It works everywhere, the manuals too.', at: 'main.main' },
  { title: 'Achievements', go: 'achievements', text: 'RetroAchievements and your emulators’ trophies on one page: your latest unlocks, then every game you’ve played, as a grid or a stack.', at: 'main.main' },
];
const BASE0 = [
  { title: 'Your Tabs', text: 'The Dock holds every part of Cartridge. Move to the next tab now.', at: '.statusbar nav.tabs',
    task: { pad: ['RT'], key: 'Page Down', mouse: 'Click another tab', touch: 'Tap another tab' }, pass: ['lt', 'rt'], doneWhen: (s0) => store.route.name !== s0.route },
  { title: 'Find Anything', text: 'Search finds games by name from anywhere. Open it now; {B} closes it again.', at: '.top-search',
    task: { pad: ['Y'], key: '/', mouse: 'Click the magnifier', touch: 'Tap the magnifier' }, pass: ['y', 'search'], doneWhen: () => store.modal?.type === 'keyboard' || store.route.name === 'search' },
  { title: 'Close It Again', text: '{B} always goes back: out of a pop-up, a page or a menu.', at: null, when: () => store.modal?.type === 'keyboard' || store.route.name === 'search',
    task: { pad: ['B'], key: 'Escape', mouse: 'Click outside it', touch: 'Tap outside it' }, pass: ['back'], doneWhen: () => !store.modal && store.route.name !== 'search' },
  { title: 'Your Downloads', text: 'Downloads, installs and updates all show here, and carry on while you do other things. Jump there now.', at: tabSel('downloads'),
    task: { pad: ['SELECT'], key: 'Ctrl+J', mouse: 'Click Downloads', touch: 'Tap Downloads' }, pass: ['select'], doneWhen: () => store.route.name === 'downloads' },
  { title: 'The Quick Menu', text: '{START} opens the Quick Menu from anywhere: refresh the library, Settings, and more. Open it, then press {START} again to close it.', at: null,
    task: { pad: ['START'], key: 'M', mouse: '', touch: 'Skip this one on touch' }, pass: ['start'], doneWhen: (s0, seen) => seen.quick && !store.quickMenu },
  { title: 'Games and Steam', text: 'On a game’s page, More ({Y}) adds it to Steam with the emulator picked for its console, plus its add-ons, patches and settings.', at: tabSel('library') },
  { title: 'Settings', go: 'settings', text: 'Emulators (get and update them, BIOS, add-ons), Steam (add all your games at once), Syncthing for saves, and Look & Feel.', at: 'main.main' },
  { title: 'You’re Set', text: 'Everything works with a controller, the keyboard, a mouse or touch. F1 lists every key; right-click a game for its quick actions. This tour is in Settings → About whenever you want it again.', at: null },
];
const BASE = [BASE0[0], ...PAGES, ...BASE0.slice(1)];
const steps = (props.only ? START : props.start ? [...START, ...BASE] : BASE).filter((s) => (!s.go || activeTabs().includes(s.go)) && (!s.at || !s.at.startsWith('.statusbar .tab[') || activeTabs().includes(s.at.match(/data-tab="([^"]+)"/)[1])));
const i = ref(0), did = ref(false), box = ref(null), ready = ref(false), el = ref(null);
const s = computed(() => steps[i.value]);
let s0 = {}, seen = {};
const done = () => closeTour(true);
async function go(n) {
  if (n < 0) return;
  if (n >= steps.length) return done();
  if (steps[n].go && store.route.name !== steps[n].go) tab(steps[n].go); // the page it talks about
  i.value = n; did.value = false; s0 = { route: store.route.name }; seen = {};
  await nextTick(); place(); setTimeout(place, 380); // again once the page it points at has arrived
  focusFirst(el.value, '[data-autofocus]');
  // 0.9.49 (owner: after Continue, A did nothing until right was pressed): a step that opens a page lets that page focus
  // its first item a moment later, which took the focus off the card; it comes back to Continue once the page is there
  for (const t of [120, 420, 800]) setTimeout(() => { if (store.tour && !store.modal && !store.quickMenu && el.value && !el.value.contains(document.activeElement)) focusFirst(el.value, '[data-autofocus]'); }, t);
}
const next = () => go(i.value + 1);
// where the spotlight goes: the step's element, padded; none centres the card
function place() {
  const t = s.value.at ? document.querySelector(s.value.at) : null; // null, never false or '' (used with ?.)
  const r = t?.getBoundingClientRect();
  // kept inside the window (0.9.49, owner: on a whole page the outline ran off the screen and only its bottom showed)
  if (!r || !r.width) { box.value = null; return; }
  const m = 6, x = Math.max(m, r.left - 8), y = Math.max(m, r.top - 8);
  box.value = { x, y, w: Math.min(innerWidth - m, r.right + 8) - x, h: Math.min(innerHeight - m, r.bottom + 8) - y };
}
const spotStyle = computed(() => (box.value ? { transform: `translate(${box.value.x}px, ${box.value.y}px)`, width: box.value.w + 'px', height: box.value.h + 'px' } : {}));
// the card sits beside what it points at: below it, else above, kept on screen
const bubbleStyle = computed(() => {
  const b = box.value; if (!b) return {};
  const W = Math.min(520, innerWidth - 32), H = 260, below = b.y + b.h + 16 + H < innerHeight;
  const big = b.h > innerHeight * 0.5; // a whole page: the card goes in its corner
  const x = Math.max(16, Math.min(innerWidth - W - 16, big ? b.x + b.w - W - 24 : b.x + b.w / 2 - W / 2));
  const y = big ? Math.max(16, b.y + 24) : below ? b.y + b.h + 16 : Math.max(16, b.y - H - 16);
  return { transform: `translate(${x}px, ${y}px)`, width: W + 'px' };
});
// a step is done when the app's state says so (any input); a short pause, then on to the next
let tick = 0;
function check() {
  const st = s.value;
  if (store.quickMenu) seen.quick = true;
  if (st.when && !st.when() && i.value) { /* nothing to close any more: skip it */ go(i.value + 1); return; }
  if (st.doneWhen && !did.value && st.doneWhen(s0, seen)) { did.value = true; setTimeout(() => { if (did.value && s.value === st) next(); }, 650); }
}
let layer;
onMounted(() => {
  // as: what the press does underneath. Y is search here whatever page the tour is on (0.9.51: on Achievements, where
  // the page's own Y is Sort, the search step never saw search open and every step after it was stuck)
  const pass = (a, as = a) => () => { if (s.value.pass?.includes(a)) { layer.below(as); setTimeout(check, 60); } };
  layer = pushLayer(el.value, { back: () => (s.value.pass?.includes('back') ? pass('back')() : done()), start: pass('start'), lt: pass('lt'), rt: pass('rt'), y: pass('y', 'search'), search: pass('search'), select: pass('select'), lb() {}, rb() {}, x() {} });
  // its first steps are about Start: go there when it's opened from elsewhere (Settings → About)
  if (steps[0]?.at === 'main.main' && store.route.name !== 'start' && activeTabs().includes('start')) tab('start');
  tick = setInterval(() => { check(); if (s.value.at) place(); }, 250);
  addEventListener('resize', place);
  go(0);
  requestAnimationFrame(() => (ready.value = true));
});
watch(() => [store.route.name, store.modal?.type, store.quickMenu], () => setTimeout(check, 30));
onBeforeUnmount(() => { layer?.pop(); clearInterval(tick); removeEventListener('resize', place); });
</script>

<style scoped>
/* never in the way of the app: only the card takes clicks, so the thing pointed at can be clicked or tapped */
.tour-root { position: fixed; inset: 0; z-index: 44; /* under pop-ups (50) and the Quick Menu (45), which it teaches */ pointer-events: none; opacity: 0; transition: opacity var(--fade-slow); }
.tour-root.ready { opacity: 1; }
.spot { position: absolute; left: 0; top: 0; border-radius: var(--r-lg); box-shadow: 0 0 0 200vmax rgba(3, 4, 7, 0.72), 0 0 18px 2px rgba(255, 255, 255, 0.28); /* 0.9.60: a soft glow, no white line */
  transition: transform var(--spring-soft-d) var(--spring-soft), width var(--spring-soft-d) var(--spring-soft), height var(--spring-soft-d) var(--spring-soft), opacity var(--fade-in); }
.spot.none { width: 0; height: 0; transform: translate(50vw, 50vh); box-shadow: 0 0 0 200vmax rgba(3, 4, 7, 0.72); }
.bubble { position: absolute; left: 0; top: 0; pointer-events: auto; min-width: 0; gap: var(--s-3); animation: none;
  transition: transform var(--spring-d) var(--spring); }
.bubble.center { width: min(560px, calc(100vw - 32px)); transform: translate(calc(50vw - 50%), calc(50vh - 50%)); }
.t-top { display: flex; align-items: center; justify-content: space-between; }
.t-step { font-size: var(--t-sm); font-weight: 600; color: var(--dim); }
.t-skip { font-size: var(--t-sm); color: var(--muted); padding: 6px 10px; border-radius: var(--r-sm); }
.t-skip:focus { background: var(--focus); color: var(--on-focus); }
.bubble h2 { font-size: var(--t-xl); margin: 0; }
.bubble p { margin: 0; line-height: 1.55; font-size: var(--t-md); }
.t-task { display: flex; align-items: center; padding: 12px 14px; border-radius: var(--r-md); background: var(--s2); font-weight: 600; }
.t-task.ok { background: rgba(63, 185, 80, 0.16); color: var(--green-l); }
.t-do { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.t-do :deep(.pb) { transform: scale(1.25); margin: 0 4px; }
.bubble p :deep(.pb.t-inl) { margin: 0 2px; }
.bubble p kbd { margin: 0 2px; }
kbd { font: inherit; font-size: var(--t-sm); padding: 2px 8px; border-radius: 6px; background: var(--s3); box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.35); }
.t-act { gap: var(--s-2); }
:global(body.light-fx .tour-root .spot) { transition-duration: 0ms; }
</style>
