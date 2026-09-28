// Live Steam changes, the way Decky plugins (SteamGridDB and others) do them: Steam's own UI runs
// in CEF, and when the file .cef-enable-remote-debugging is in Steam's folder (Decky Loader creates
// it) that UI can be reached on 127.0.0.1:8080. Its "SharedJSContext" page has SteamClient, so
// shortcuts, artwork and a restart happen inside the running Steam. Nothing waits for Steam to close,
// and Steam can't write an old shortcuts file over ours when it exits (the Game Mode problem).
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.CARTRIDGE_CEF_PORT || 8080);
const FLAG = '.cef-enable-remote-debugging';

module.exports = function steamLive({ log = () => {} } = {}) {
  const flagOn = (root) => !!root && fs.existsSync(path.join(root, FLAG));
  async function target() {
    const r = await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(2500) });
    const list = await r.json();
    return list.find((t) => t.title === 'SharedJSContext' && t.webSocketDebuggerUrl) || null;
  }
  // Is live mode possible right now? (flag present and Steam's UI answering)
  async function available(root) {
    if (!process.env.CARTRIDGE_CEF_PORT && !flagOn(root)) return false;
    try { return !!(await target()); } catch { return false; }
  }
  // Run an expression in Steam's UI and get its (awaited) value back
  async function run(expr, ms = 20000) {
    const t = await target();
    if (!t) throw new Error("Steam's interface isn't reachable");
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('Steam did not answer')); }, ms);
      ws.onerror = () => { clearTimeout(timer); reject(new Error("Couldn't talk to Steam")); };
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
      ws.onmessage = (m) => {
        let d; try { d = JSON.parse(String(m.data)); } catch { return; }
        if (d.id !== 1) return;
        clearTimeout(timer); try { ws.close(); } catch {}
        const res = d.result || {};
        if (res.exceptionDetails) reject(new Error(res.exceptionDetails.exception?.description?.split('\n')[0] || 'Steam refused the change'));
        else resolve(res.result?.value);
      };
    });
  }
  const J = (v) => JSON.stringify(v);
  // ELibraryAssetType: 0 capsule (portrait grid), 1 hero, 2 logo, 3 header (wide)
  const ASSETS = [['p', 0], ['_hero', 1], ['_logo', 2], ['', 3]];

  // Add one shortcut; returns Steam's appid for it. art: { dir, id } where files are <id>p.png etc.
  async function addShortcut({ name, exe, start, lo, art, proton, collections }) {
    const appid = await run(`(async () => {
      // created with the program alone, then the full Target (program plus arguments) is set
      const id = await SteamClient.Apps.AddShortcut(${J(name)}, ${J((String(exe).match(/^"[^"]*"|^\S+/) || [exe])[0])}, ${J(start)}, ${J(lo)});
      // AddShortcut can name the shortcut after the exe; set everything explicitly
      SteamClient.Apps.SetShortcutName(id, ${J(name)});
      SteamClient.Apps.SetShortcutExe(id, ${J(exe)});
      SteamClient.Apps.SetShortcutStartDir(id, ${J(start)});
      SteamClient.Apps.SetShortcutLaunchOptions(id, ${J(lo)});
      return id;
    })()`);
    if (!appid) throw new Error('Steam did not create the shortcut');
    await settle(appid, exe, lo);
    if (proton) await run(`SteamClient.Apps.SpecifyCompatTool(${appid}, ${J(proton)})`).catch((e) => log('steam live proton', e.message));
    await setArtwork(appid, art);
    if (collections?.length) await addToCollections(appid, collections).catch((e) => log('steam live collections', e.message));
    return appid >>> 0;
  }
  // cover, background, logo, wide banner and icon for a shortcut: art = { dir, id } where files are <id>p.png etc.
  async function setArtwork(appid, art) {
    for (const [suffix, type] of ASSETS) {
      const f = art && path.join(art.dir, `${art.id}${suffix}.png`);
      if (!f || !fs.existsSync(f)) continue;
      const b64 = fs.readFileSync(f).toString('base64');
      await run(`SteamClient.Apps.SetCustomArtworkForApp(${appid}, ${J(b64)}, 'png', ${type})`, 30000).catch((e) => log('steam live art', suffix, e.message));
      // a shortcut's logo stays blank until it has a position: SteamGridDB's plugin saves one too
      if (type === 2) await run(`(async () => {
        let ov = window.appStore?.GetAppOverviewByAppID(${appid});
        for (let i = 0; !ov && i < 20; i++) { await new Promise((r) => setTimeout(r, 250)); ov = window.appStore?.GetAppOverviewByAppID(${appid}); }
        if (!ov || !window.appDetailsStore?.SaveCustomLogoPosition) return false;
        await window.appDetailsStore.SaveCustomLogoPosition(ov, { pinnedPosition: 'BottomLeft', nWidthPct: 50, nHeightPct: 50 });
        return true;
      })()`).catch((e) => log('steam live logo position', e.message));
    }
    // icon: Steam keeps a path to it, so it gets its own copy named after Steam's appid
    const icon = art && path.join(art.dir, `${art.id}_icon.png`);
    if (icon && fs.existsSync(icon)) {
      const mine = path.join(art.dir, `${appid >>> 0}_icon.png`);
      try { if (mine !== icon) fs.copyFileSync(icon, mine); await run(`SteamClient.Apps.SetShortcutIcon(${appid}, ${J(mine)}), true`); } catch (e) { log('steam live icon', e.message); }
    }
  }
  // Steam's collection store lives in the same page (used by Decky plugins such as TabMaster)
  async function addToCollections(appid, names) {
    return run(`(async () => {
      const cs = window.collectionStore, as = window.appStore;
      if (!cs || !as) return false;
      let ov = as.GetAppOverviewByAppID(${appid});
      for (let i = 0; !ov && i < 20; i++) { await new Promise((r) => setTimeout(r, 250)); ov = as.GetAppOverviewByAppID(${appid}); }
      if (!ov) return false;
      for (const name of ${J(names)}) {
        let c = cs.userCollections.find((x) => x.displayName === name);
        if (!c) { c = cs.NewUnsavedCollection(name, undefined, []); await c.Save(); }
        c.AsDragDropCollection().AddApps([ov]);
        await c.Save();
      }
      return true;
    })()`);
  }
  // Steam can fill in "%command%" on a new shortcut after we set empty Launch options, and with the
  // arguments in Target that stops the game starting. Read back what Steam kept and set it again
  // until it sticks. Also used to repair shortcuts that already have it.
  async function settle(appid, exe, lo) {
    return run(`(async () => {
      const id = ${appid >>> 0}, want = ${J(lo)}, exe = ${J(exe)};
      const read = () => new Promise((res) => {
        let reg = null; const t = setTimeout(() => { try { reg?.unregister(); } catch {} res(window.appDetailsStore?.GetAppDetails?.(id) || null); }, 1500);
        try { reg = SteamClient.Apps.RegisterForAppDetails(id, (d) => { clearTimeout(t); try { reg?.unregister(); } catch {} res(d); }); } catch { clearTimeout(t); res(window.appDetailsStore?.GetAppDetails?.(id) || null); }
      });
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const d = await read();
        const got = d ? (d.strShortcutLaunchOptions ?? d.strLaunchOptions) : undefined;
        if (got === undefined) { SteamClient.Apps.SetShortcutLaunchOptions(id, want); return 'unknown'; }
        if (got === want && (d.strShortcutExe === undefined || d.strShortcutExe === exe)) return 'ok';
        if (d.strShortcutExe !== undefined && d.strShortcutExe !== exe) SteamClient.Apps.SetShortcutExe(id, exe);
        SteamClient.Apps.SetShortcutLaunchOptions(id, want);
      }
      return 'retried';
    })()`, 20000).then((r) => { if (r !== 'ok') log('steam live launch options', appid >>> 0, r); return r; }).catch((e) => log('steam live settle', e.message));
  }
  const removeShortcut = (appid) => run(`SteamClient.Apps.RemoveShortcut(${appid >>> 0}), true`);
  // What SteamGridDB's Decky plugin does after changing artwork
  const restart = () => run('SteamClient.User.StartRestart(false), true', 5000);
  return { available, addShortcut, removeShortcut, settle, setArtwork, restart, flagOn, FLAG };
};
