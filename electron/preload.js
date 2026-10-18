const { contextBridge, ipcRenderer, webFrame } = require('electron');

// 0.9.82: while a game is in front, the page's decoded pictures and other caches are let go, so the game has that memory
ipcRenderer.on('background', (_e, b) => { if (b?.away) setTimeout(() => { try { webFrame.clearCache(); } catch {} }, 1500); });

async function call(ch, arg) {
  const r = await ipcRenderer.invoke(ch, arg);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

contextBridge.exposeInMainWorld('cart', {
  call,
  on: (ch, fn) => {
    const h = (_e, d) => fn(d);
    ipcRenderer.on(ch, h);
    return () => ipcRenderer.removeListener(ch, h);
  },
});
