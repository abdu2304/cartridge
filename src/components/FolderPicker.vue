<template>
  <div class="scrim" ref="el">
    <div class="dialog picker">
      <div class="row" style="justify-content: space-between">
        <h2>{{ title }}</h2>
        <span class="muted" style="font-size: 13px">{{ subtitle }}</span>
      </div>
      <div class="places">
        <button v-for="p in places" :key="p.path" class="btn small" data-focus @click="open(p.path)"><Icon name="mdiFolderStar" :size="16" />{{ p.label }}</button>
      </div>
      <div class="crumb"><Icon name="mdiFolderOpen" :size="18" /><span>{{ cur.path }}</span></div>
      <div class="list" data-scroll>
        <button class="menu-item" data-focus data-autofocus @click="open(cur.parent)" v-if="cur.path !== '/'"><Icon name="mdiArrowUp" />..</button>
        <button v-for="d in cur.dirs" :key="d" class="menu-item" data-focus @click="open(join(cur.path, d))"><Icon name="mdiFolder" style="color: var(--primary-l)" />{{ d }}</button>
        <div v-if="!cur.dirs.length" class="muted" style="padding: 12px">No subfolders</div>
      </div>
      <div class="row" style="justify-content: flex-end">
        <button class="btn" data-focus @click="newFolder"><Icon name="mdiFolderPlus" />New folder</button>
        <button class="btn" data-focus @click="closeModal(null)">Cancel</button>
        <button class="btn primary" data-focus @click="closeModal(cur.path)"><Icon name="mdiCheck" />Use this folder</button>
      </div>
      <div class="kb-hints muted"><span class="hint"><Btn b="A" />Open</span><span class="hint"><Btn b="X" />Up a level</span><span class="hint"><Btn b="START" />Use this folder</span><span class="hint"><Btn b="B" />Cancel</span></div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, reactive, nextTick } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal, call, askText, store, toast } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';

const props = defineProps({ title: { type: String, default: 'Choose a folder' }, subtitle: String, start: String });
const el = ref(null);
const cur = reactive({ path: '', parent: '', dirs: [] });
const places = ref([]);
const join = (a, b) => (a.endsWith('/') ? a + b : `${a}/${b}`);

async function open(p) {
  const r = await call('fs:list', p);
  Object.assign(cur, r);
  await nextTick();
  el.value?.querySelector('.list')?.scrollTo({ top: 0 });
  focusFirst(el.value, '.list [data-focus]');
}
async function newFolder() {
  // Keyboard modal replaces this one; reopen afterwards at the same place.
  const here = cur.path;
  const resolveOuter = store.modal.resolve;
  const name = await askText({ title: 'New folder name' });
  if (name) {
    try { await call('fs:mkdir', join(here, name)); } catch (e) { toast(e.message, 'error'); }
  }
  store.modal = { type: 'folder', props: { ...props, start: name ? join(here, name) : here }, resolve: resolveOuter };
}

let layer;
onMounted(async () => {
  layer = pushLayer(el.value, {
    back: () => closeModal(null),
    x: () => cur.path !== '/' && open(cur.parent),
    start: () => closeModal(cur.path),
    lb() {}, rb() {}, y() {}, select() {}, lt() {}, rt() {},
  });
  places.value = await call('fs:places');
  await open(props.start || places.value[1]?.path || places.value[0]?.path);
});
onBeforeUnmount(() => layer.pop());
</script>

<style scoped>
.picker { width: min(820px, 94vw); height: 82vh; }
.places { display: flex; gap: 8px; flex-wrap: wrap; }
.crumb { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: var(--bg); border-radius: 10px; font-family: ui-monospace, monospace; font-size: 13px; color: var(--muted); overflow: hidden; white-space: nowrap; }
.list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding: 4px; }
.kb-hints { display: flex; gap: 18px; justify-content: center; font-size: 12px; }
.hint { display: flex; align-items: center; gap: 6px; }
</style>
