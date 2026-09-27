const { contextBridge, ipcRenderer } = require('electron');

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
