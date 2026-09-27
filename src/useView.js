import { onMounted, onBeforeUnmount } from 'vue';
import { store } from './store.js';

// Register per-view controller handlers + hint bar entries.
export function useView(handlers = {}, hints = []) {
  onMounted(() => {
    store.viewHandlers = handlers;
    store.hints = typeof hints === 'function' ? hints() : hints;
  });
  onBeforeUnmount(() => {
    if (store.viewHandlers === handlers) store.viewHandlers = {};
  });
  return {
    setHints: (h) => { store.hints = h; },
  };
}
