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
import App from './App.vue';
import { installSprings, slidingPills, startGovernor } from './motion.js';
import { startGlass } from './glassEngine.js';
import { startImageWorker } from './imageWorker.js';
import { openModal, closeModal } from './store.js';
installSprings();
startImageWorker(); // 0.9.60: picture shrinking and logo trimming off Electron's main thread
window.__cartStore = { openModal, closeModal }; // the UI audits open pop-ups with it (tools/ui-audit)
startGovernor(); // CAE: idle and away states (motion.js) // spring easings as CSS tokens (0.9.37), before the first paint
createApp(App).mount('#app');
startGlass(); // Glass engine: refraction in Glass mode only (glassEngine.js)
const repill = slidingPills(); // the chosen option's pill glides between choices (0.9.38)
document.fonts?.ready.then(repill); // measured again once the fonts are in
