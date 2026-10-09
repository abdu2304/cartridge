<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog lic">
      <div>
        <div class="eyebrow">About</div>
        <h2>Licences and Acknowledgements</h2>
        <p class="muted small">Cartridge stands on the work of many people. Thank you to everyone below.</p>
      </div>
      <div class="lic-tabs"><Btn b="LB" /><div class="seg strip"><button v-for="(g, i) in GROUPS" :key="g.t" tabindex="-1" :class="{ on: i === cur }" @click="cur = i">{{ g.t }}</button></div><Btn b="RB" /></div>
      <div class="lic-list" data-scroll :key="cur">
        <p class="muted small">{{ GROUPS[cur].note }}</p>
        <div v-for="x in GROUPS[cur].items" :key="x[0]" class="lrow" data-focus tabindex="0">
          <span class="l-mid"><b>{{ x[0] }}</b><span class="l-sub">{{ x[1] }}</span></span>
          <span v-if="x[2]" class="l-end"><span class="status">{{ x[2] }}</span></span>
        </div>
      </div>
      <div class="row" style="justify-content: flex-end"><button class="btn primary" data-focus @click="closeModal(null)">Done</button></div>
    </div>
  </div>
</template>
<script setup>
// Settings → About → Licences and Acknowledgements (0.9.24, owner: everything we used, everyone credited).
// Libraries are what Cartridge ships with (package.json); the rest is whose work it reads, follows or links to.
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal } from '../store.js';
import Btn from './Btn.vue';
const GROUPS = [
  { t: 'Libraries', note: 'Open source code built into Cartridge, with its licence.', items: [
    ['Electron', 'The app shell (Chromium and Node.js)', 'MIT'], ['Vue', 'The interface', 'MIT'], ['Vite', 'Builds the interface', 'MIT'],
    ['electron-builder and electron-updater', 'The AppImage and its updates', 'MIT'], ['Material Design Icons (@mdi/js)', 'The icons', 'Apache 2.0'],
    ['PDF.js', 'Game manuals', 'Apache 2.0'], ['js-yaml', 'Reads and writes emulator YAML files', 'MIT'], ['yauzl', 'Unpacks zip files', 'MIT'],
    ['qrcode', 'The pairing QR code', 'MIT'], ['socket.io-client', 'Live updates from RomM', 'MIT'],
    ['Archivo, Inter, Lexend, Nunito, Outfit, Rubik, Space Grotesk, Roboto (Fontsource)', 'The fonts', 'OFL 1.1'],
  ] },
  { t: 'Projects', note: 'Projects Cartridge works with. It reads their settings and formats as their own source code describes them.', items: [
    ['RomM', 'Your game library, its covers, saves of play and devices'], ['Steam and Steam ROM Manager', 'Shortcuts, collections and artwork; SRM’s emulator presets'],
    ['EmuDeck', 'Its emulator launch arguments and folder layout, followed so Cartridge fits beside it'], ['ES-DE', 'The Emulation folder structure'], ['RetroDECK', 'Recognised when it’s installed'],
    ['Decky Loader and decky-steamgriddb', 'How live Steam changes and shortcut logos are made'], ['Syncthing', 'Read through its own API'],
    ['lsfg-vk and mako-run', 'Frame generation wrappers'], ['HVR88 Monochrome Gaming Logos', 'Console maker wordmarks'],
  ] },
  { t: 'Emulators', note: 'Cartridge starts games through these emulators and reads their settings, patches and trophies from their own files. Each one is its authors’ work under its own licence.', items: [
    ['RetroArch (libretro)', 'GPL 3'], ['PCSX2', 'GPL 3'], ['RPCS3', 'GPL 2'], ['shadPS4', 'GPL 2'], ['DuckStation', 'CC BY-NC-ND 4.0'], ['PPSSPP', 'GPL 2'], ['Vita3K', 'GPL 2'],
    ['Dolphin', 'GPL 2'], ['Cemu', 'MPL 2.0'], ['Eden, Citron and the yuzu family', 'GPL 3'], ['Ryujinx (Ryubing)', 'MIT'], ['Azahar and Citra', 'GPL 2'], ['melonDS', 'GPL 3'],
    ['xemu', 'GPL 2'], ['Xenia', 'BSD'], ['Flycast, mGBA, Mesen, Snes9x, ares, MAME, ScummVM and the rest', 'Each under its own licence'],
  ].map(([a, b]) => [a, 'Emulator', b]) },
  { t: 'Data', note: 'Services and lists Cartridge reads, each credited to its makers.', items: [
    ['SteamGridDB', 'Artwork, logos and heroes, made by its community'], ['RetroAchievements', 'Achievements'], ['HowLongToBeat', 'How long games take'], ['IGDB', 'Game details, through RomM'],
    ['GameBanana', 'Mods, made by its community'], ['EmuCoreX texture catalog', 'PS2 texture packs, each credited to its creator'], ['HenrikoMagnifico', 'GameCube, Wii and 3DS texture packs'],
    ['rapka/dolphin-textures', 'The Dolphin texture pack list'], ['shadPS4 ps4_cheats and GoldHEN patches', 'PS4 patches'], ['RPCS3 patches', 'PS3 patches'], ['PCSX2 patches and Dolphin, PPSSPP cheat lists', 'Patches and cheats'],
    ['codes.rc24.xyz', 'Gecko codes'], ['Sony update servers', 'PS3 game update lists'],
  ] },
];
const el = ref(null), cur = ref(0);
let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), lb: () => { cur.value = (cur.value + GROUPS.length - 1) % GROUPS.length; }, rb: () => { cur.value = (cur.value + 1) % GROUPS.length; }, x() {}, y() {}, select() {}, lt() {}, rt() {} });
  focusFirst(el.value);
});
onBeforeUnmount(() => layer?.pop());
</script>
<style scoped>
.lic { width: min(820px, 94vw); max-height: 88vh; display: flex; flex-direction: column; gap: var(--s-3); }
.lic h2 { margin: 2px 0 6px; font-size: var(--t-xl); }
.lic p { margin: 0; }
.lic-tabs { display: flex; align-items: center; gap: 10px; align-self: flex-start; max-width: 100%; min-width: 0; }
.lic-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 4px; }
.lic-list > * { flex: none; }
</style>
