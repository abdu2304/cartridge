import { createApp } from 'vue';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource-variable/outfit';
import '@fontsource-variable/inter';
import '@fontsource-variable/nunito';
import '@fontsource-variable/rubik';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/lexend';
import '@fontsource-variable/archivo/wdth.css';
import './styles.css';
import './tokens.css'; // Plain and Glass tokens, made from src/tokens.js (0.9.70)
import App from './App.vue';
import { installSprings, slidingPills, startGovernor } from './motion.js';
import { startGlass } from './glassEngine.js';
import { startImageWorker } from './imageWorker.js';
import { openModal, closeModal, go, store, startingGame } from './store.js';
installSprings();
startImageWorker(); // 0.9.60: picture shrinking and logo trimming off Electron's main thread
window.__cartStore = { openModal, closeModal, go, startingGame, get route() { return store.route; }, get starting() { return store.starting; } }; // the UI audits open pop-ups and pages with it (tools/ui-audit)
startGovernor(); // CAE: idle and away states (motion.js) // spring easings as CSS tokens (0.9.37), before the first paint
createApp(App).mount('#app');
startGlass(); // Glass engine: refraction in Glass mode only (glassEngine.js)
const repill = slidingPills(); // the chosen option's pill glides between choices (0.9.38)
document.fonts?.ready.then(repill); // measured again once the fonts are in
