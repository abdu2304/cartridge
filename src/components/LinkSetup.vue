<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog ls">
      <div class="eyebrow">Share Saves · {{ s.label }}</div>
      <h2>{{ s.fork }} and {{ s.ofName }}</h2>
      <Transition :name="step === 2 ? 'ls-fwd' : 'ls-back'" mode="out-in" @after-enter="landed">
        <!-- step 1: which folder is the main one -->
        <div v-if="step === 1" key="pick" class="ls-step">
          <p class="ls-q">Which saves should both of them use?</p>
          <div class="ls-picks">
            <button v-for="o in sides" :key="o.key" class="ls-pick" :class="{ off: !o.ok }" data-focus :data-key="'ls-' + o.key" @click="pick(o)">
              <span class="ls-role">{{ o.role }}<span v-if="o.key === best" class="ls-rec">Recommended</span></span>
              <b class="ls-name">{{ o.name }}’s Saves</b>
              <span class="ls-facts">
                <span class="ls-big">{{ o.info?.there ? o.info.count : 0 }}</span><span>{{ o.info?.there ? (o.info.count === 1 ? 'item' : 'items') : 'no folder yet' }}</span>
              </span>
              <span class="ls-sub">{{ o.ok ? (o.info?.newest ? 'Last changed ' + ago(o.info.newest) : 'Empty') : o.why }}</span>
              <span class="ls-path mono">{{ short(o.path) }}</span>
            </button>
          </div>
          <p class="muted small ls-hint">The other one stops using its own folder and uses this one. Nothing is deleted.</p>
        </div>
        <!-- step 2: exactly what happens -->
        <div v-else key="sure" class="ls-step">
          <div class="ls-flow" aria-hidden="true">
            <span class="ls-node main"><b>{{ main.name }}</b><small>Keeps its saves</small></span>
            <span class="ls-line"><i v-for="n in 3" :key="n" :style="{ '--k': n }" /></span>
            <span class="ls-node"><b>{{ other.name }}</b><small>Uses {{ main.name }}’s</small></span>
          </div>
          <p class="ls-say"><b>{{ other.name }}</b> will use <b>{{ main.name }}’s</b> saves.</p>
          <ul class="ls-list">
            <li><Icon name="mdiCheck" :size="18" class="tick-ok" /><span>{{ main.name }}’s saves stay exactly where they are.</span></li>
            <li v-if="other.info?.count"><Icon name="mdiArchiveOutline" :size="18" /><span>{{ other.name }}’s own {{ other.info.count }} {{ other.info.count === 1 ? 'item is' : 'items are' }} set aside as <span class="mono">{{ keptName }}</span>, not deleted. They come back if you remove the link.</span></li>
            <li v-else><Icon name="mdiArchiveOutline" :size="18" /><span>{{ other.name }} has no saves of its own yet, so nothing is set aside.</span></li>
            <li><Icon name="mdiAlertOutline" :size="18" /><span>Close both emulators first.</span></li>
          </ul>
          <Toggle v-if="other.info?.count" v-model="merge" :label="`Bring Over What Only ${other.name} Has`" :desc="`Games it has saves for and ${main.name} doesn’t are copied into ${main.name}’s folder first. Nothing is overwritten.`" />
          <div class="row ls-acts">
            <button class="btn" data-focus @click="back"><Icon name="mdiArrowLeft" :size="18" />Choose Again</button>
            <button class="btn primary" data-focus data-autofocus @click="done"><Icon name="mdiLinkVariant" :size="18" />Share Saves</button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
// Linked Folders setup (0.9.56, owner: "GR2 launcher → shadPS4: is it moving GR2's files into shadPS4 or the other way
// round? It should ask me which is the master folder"). Step 1: which emulator's saves both use, with what each holds.
// Step 2: in plain words what happens, then Share Saves. Answers { main: 'original' | 'fork', merge }.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal, ago, store } from '../store.js';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';

const props = defineProps({ s: Object });
const s = props.s;
const el = ref(null), step = ref(1), chosen = ref('original'), merge = ref(true);
const short = (p) => (p ? String(p).replace(store.info?.home || '\u0000', '~') : '');
const sides = computed(() => [
  { key: 'original', role: 'The Emulator', name: s.ofName, path: s.to, info: s.toInfo, ok: !!s.toInfo?.there, why: `${s.ofName} hasn’t made its folder yet` },
  // the emulator's folder can only become a link when it's a real folder (EmuDeck's are links into Emulation/saves)
  { key: 'fork', role: 'The Fork', name: s.fork, path: s.from, info: s.fromInfo, ok: !!s.fromInfo?.there && !s.toInfo?.link, why: s.toInfo?.link ? `${s.ofName}’s saves folder is already a link (EmuDeck’s), so ${s.ofName}’s stay the main ones` : `${s.fork} hasn’t made its folder yet` },
]);
// the usual choice is the emulator's own folder; the fork's when only it has saves
const best = computed(() => (!s.toInfo?.count && s.fromInfo?.count ? 'fork' : 'original'));
const main = computed(() => sides.value.find((o) => o.key === chosen.value));
const other = computed(() => sides.value.find((o) => o.key !== chosen.value));
const keptName = computed(() => (String(other.value.path || '').split('/').filter(Boolean).pop() || 'folder') + '.cartridge-kept');
function pick(o) {
  if (!o.ok) return;
  chosen.value = o.key; merge.value = true; step.value = 2;
}
const back = () => { step.value = 1; };
// focus lands once the new step has slid in (out-in: before that the old step is still leaving)
const landed = () => focusFirst(el.value, step.value === 2 ? '[data-autofocus]' : `[data-key="ls-${chosen.value}"]`);
const done = () => closeModal({ main: chosen.value, merge: merge.value && !!other.value.info?.count });
let layer;
onMounted(async () => {
  layer = pushLayer(el.value, { back: () => (step.value === 2 ? back() : closeModal(null)), start: () => closeModal(null), lb() {}, rb() {}, x() {}, y() {}, select() {}, lt() {}, rt() {} });
  await nextTick();
  focusFirst(el.value, `[data-key="ls-${best.value}"]`);
});
onBeforeUnmount(() => layer?.pop());
</script>

<style scoped>
.ls { width: min(760px, 94vw); max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s-2); }
.ls h2 { margin: 2px 0 var(--s-2); font-size: var(--t-xl); line-height: 1.15; overflow-wrap: anywhere; }
.ls-step { display: flex; flex-direction: column; gap: var(--s-3); }
.ls-q { margin: 0; font-size: var(--t-md); font-weight: 600; }
.ls-picks { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.ls-pick { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: var(--s-4); border-radius: var(--r-lg); background: var(--s2); text-align: left; min-width: 0; transition: transform var(--spring-snappy-d) var(--spring-snappy), background var(--tint); }
.ls-pick:focus { background: var(--focus); color: var(--on-focus); }
.ls-pick:focus :is(.ls-sub, .ls-path, .ls-role) { color: var(--on-focus-dim); }
.ls-pick.off { opacity: 0.55; }
.ls-role { display: flex; align-items: center; gap: 8px; font-size: var(--t-xs); color: var(--muted); font-weight: 600; letter-spacing: 0.02em; }
.ls-rec { padding: 2px 8px; border-radius: 99px; background: var(--green); color: #fff; font-size: 11px; }
.ls-name { font-family: var(--display); font-size: var(--t-lg); overflow-wrap: anywhere; }
.ls-facts { display: flex; align-items: baseline; gap: 6px; font-size: var(--t-sm); }
.ls-big { font-family: var(--display); font-size: var(--t-xl); font-weight: 700; font-variant-numeric: tabular-nums; }
.ls-sub { font-size: var(--t-sm); color: var(--muted); }
.ls-path { font-size: var(--t-xs); color: var(--muted); overflow-wrap: anywhere; }
.ls-hint { margin: 0; }
/* the two of them, with saves flowing from the main one to the other */
.ls-flow { display: grid; grid-template-columns: minmax(0, 1fr) 120px minmax(0, 1fr); align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-lg); background: var(--s2); }
.ls-node { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ls-node:last-child { text-align: right; }
.ls-node b { font-family: var(--display); font-size: var(--t-md); overflow-wrap: anywhere; }
.ls-node small { color: var(--muted); font-size: var(--t-xs); }
.ls-node.main b { color: var(--text); }
.ls-line { position: relative; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--text) 18%, transparent); overflow: hidden; }
.ls-line i { position: absolute; top: 0; left: 0; width: 18px; height: 4px; border-radius: 2px; background: var(--text); opacity: 0; animation: ls-flow 2.4s linear infinite; animation-delay: calc(var(--k) * 0.8s - 0.8s); /* a slow scenery loop (docs/cae.md allows 2 s and more as written) */ }
@keyframes ls-flow { 0% { transform: translateX(-18px); opacity: 0; } 20% { opacity: 0.9; } 80% { opacity: 0.9; } 100% { transform: translateX(120px); opacity: 0; } }
.ls-say { margin: 0; font-size: var(--t-lg); }
.ls-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ls-list li { display: flex; gap: 10px; align-items: flex-start; color: var(--text-2, var(--text)); }
.ls-list li :deep(svg) { flex: none; margin-top: 2px; }
.ls-list li > span { min-width: 0; overflow-wrap: anywhere; }
.ls-acts { justify-content: flex-end; gap: var(--s-2); margin-top: var(--s-2); }
/* the steps slide on (CAE: short, on the settle spring; back goes the other way) */
.ls-fwd-enter-active, .ls-back-enter-active { transition: opacity var(--fade-in), transform var(--spring-d) var(--spring); }
.ls-fwd-leave-active, .ls-back-leave-active { transition: opacity var(--fade-out), transform var(--fade-out); }
.ls-fwd-enter-from { opacity: 0; transform: translateX(20px); }
.ls-fwd-leave-to { opacity: 0; transform: translateX(-12px); }
.ls-back-enter-from { opacity: 0; transform: translateX(-20px); }
.ls-back-leave-to { opacity: 0; transform: translateX(12px); }
:global(body.motion-reduce .ls-line i) { animation: none; opacity: 0.9; transform: translateX(51px); }
@media (prefers-reduced-motion: reduce) { .ls-line i { animation: none; opacity: 0.9; transform: translateX(51px); } }
/* Glass: the choices sit on the sheet as hairline glass (no grey blocks), lit when focused; Plain keeps solid tiles */
:global(body.elements-glass .ls-pick:not(:focus)), :global(body.elements-glass .ls-flow) { background: rgba(255, 255, 255, 0.035); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07); }
:global(body.elements-glass.theme-light .ls-pick:not(:focus)), :global(body.elements-glass.theme-light .ls-flow) { background: rgba(255, 255, 255, 0.5); box-shadow: inset 0 0 0 1px rgba(30, 30, 45, 0.08); }
:global(body.elements-glass .ls-pick:focus) { background: var(--lg-lit); color: var(--lg-on-lit); box-shadow: var(--lg-bevel), var(--lg-lit-glow); }
:global(body.style-plain:not(.theme-light):not(.theme-oled) .ls-pick:not(:focus)) { box-shadow: var(--pl-top), var(--pl-edge); }
@media (max-width: 700px) { .ls-picks { grid-template-columns: 1fr; } }
</style>
