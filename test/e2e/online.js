// Online Play for every emulator (0.9.78, sweep round 5): ten emulators' settings files as each writes them after a
// first start (Flatpak folders), then every feature switched on and off through Cartridge: required fields filled
// first, the switch read back from the list, every file still readable in its own format afterwards, and nothing
// written while a field is missing (the refusal is a clear sentence).
//   npx vite build && xvfb-run -a node test/e2e/online.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const mock = require('./mockRomm');
const { launch, put } = require('./homes');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CFG = {
  '.var/app/org.ppsspp.PPSSPP/config/ppsspp/PSP/SYSTEM/ppsspp.ini': '[General]\nFirstRun = False\n[Network]\nEnableWlan = False\n',
  '.var/app/net.pcsx2.PCSX2/config/PCSX2/inis/PCSX2.ini': '[UI]\nSettingsVersion = 1\n[DEV9/Eth]\nEthEnable = false\n',
  '.var/app/org.libretro.RetroArch/config/retroarch/retroarch.cfg': 'netplay_use_mitm_server = "false"\nnetplay_nickname = ""\n',
  '.var/app/net.rpcs3.RPCS3/config/rpcs3/config.yml': 'Core:\n  PPU Decoder: Recompiler (LLVM)\nNet:\n  Internet enabled: Disconnected\n  IP address: 0.0.0.0\n  PSN status: Disconnected\n',
  '.var/app/net.shadps4.shadPS4/data/shadPS4/config.json': '{"General":{"isPSNSignedIn":false}}',
  '.var/app/net.shadps4.shadPS4/data/shadPS4/users.json': '{"Users":{"user":[{"user_id":1000,"user_name":"shadPS4"}]}}',
  '.var/app/io.github.ryubing.Ryujinx/config/Ryujinx/Config.json': '{"version":67,"multiplayer":{"mode":0,"lan_interface_id":"0"}}',
  '.var/app/dev.eden_emu.eden/config/eden/qt-config.ini': '[System]\nairplane_mode\\default=true\nairplane_mode=false\n[WebService]\nweb_api_url\\default=true\nweb_api_url=https://api.ynet-fun.xyz\n',
  '.var/app/org.azahar_emu.Azahar/config/azahar-emu/qt-config.ini': '[WebService]\nweb_api_url\\default=true\n',
  '.var/app/org.DolphinEmu.dolphin-emu/config/dolphin-emu/Dolphin.ini': '[General]\nISOPaths = 0\n[Core]\nSerialPort1 = 255\n',
  '.var/app/info.cemu.Cemu/config/Cemu/settings.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<content>\n  <Account>\n    <PersistentId>2147483649</PersistentId>\n    <OnlineEnabled>false</OnlineEnabled>\n    <ActiveService>0</ActiveService>\n  </Account>\n  <AccountService/>\n</content>\n',
};

// each file must still read in its own format
const readable = (f, text) => {
  try {
    if (/\.json$/.test(f)) JSON.parse(text);
    else if (/\.ya?ml$/.test(f)) yaml.load(text);
    else if (/\.xml$/.test(f)) { if (!/^<\?xml[\s\S]*<content>[\s\S]*<\/content>\s*$/.test(text)) throw new Error('not one <content> element'); }
    else if (/\.(ini|cfg)$/.test(f)) { if (/\n\s*\[[^\]]*$/m.test(text)) throw new Error('broken section header'); }
    return null;
  } catch (e) { return e.message; }
};
const DUMMY = (fd) => (fd.choices?.length ? fd.choices[0].value : fd.secret ? 'Secret-123456' : /mail/i.test(fd.key + fd.label) ? 'player@example.com' : /token/i.test(fd.key) ? 'ABCDEF0123456789' : /dns|ip|address/i.test(fd.key + fd.label) ? '45.7.228.197' : 'Player1');

(async () => {
  const srv = await mock.start({ games: 5 });
  const t = await launch('flatpaks', srv);
  const { errors, home } = t;
  // a refusal comes back as { error } (window.cart.call rejects with it)
  const call = (ch, a) => t.call(ch, a).catch((e) => ({ error: String(e.message).split('\n')[0].replace(/^.*?Error: /, '') }));
  try {
    for (const [f, s] of Object.entries(CFG)) put(path.join(home, f), s);
    // Cemu's Pretendo needs the Wii U's own files (sizes as iosu_crypto.cpp checks them)
    put(path.join(home, '.var/app/info.cemu.Cemu/data/Cemu/otp.bin'), Buffer.alloc(1024, 1)); put(path.join(home, '.var/app/info.cemu.Cemu/data/Cemu/seeprom.bin'), Buffer.alloc(512, 2));
    await wait(2500);
    const files = () => Object.keys(CFG).map((f) => path.join(home, f)).concat(['.var/app/net.rpcs3.RPCS3/config/rpcs3/rpcn.yml'].map((f) => path.join(home, f)));
    let l = await call('online:list');
    check('every emulator with settings found', (l?.emus || []).filter((e) => e.dir && e.opened).length === 10, (l?.emus || []).map((e) => `${e.emu}:${e.opened ? 'here' : 'not opened'}`).join(' '));
    for (const e of l.emus) {
      for (const k of e.kinds.filter((x) => !x.info && !x.locked)) {
        const name = `${e.emu} · ${k.name}`;
        // on with a required field empty: refused with a sentence, nothing written
        const req = k.fields.filter((fd) => fd.required);
        if (req.length) {
          const before = files().map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null));
          const r = await call('online:set', { emu: e.emu, kind: k.id, on: true });
          const after = files().map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null));
          check(`${name}: refused without ${req.map((x) => x.label).join(', ')}`, r?.error && /\.$/.test(r.error) && JSON.stringify(before) === JSON.stringify(after), r?.error || 'it turned on');
        }
        for (const fd of k.fields.filter((x) => x.required || x.choices)) {
          const r = await call('online:field', { emu: e.emu, kind: k.id, key: fd.key, value: DUMMY(fd) });
          if (r?.error) check(`${name}: ${fd.label} accepted`, false, r.error);
        }
        const on = await call('online:set', { emu: e.emu, kind: k.id, on: true });
        l = await call('online:list');
        const nowOn = l.emus.find((x) => x.emu === e.emu).kinds.find((x) => x.id === k.id).on;
        check(`${name}: on`, !on?.error && nowOn, on?.error || '');
        const bad = files().filter((f) => fs.existsSync(f)).map((f) => [f, readable(f, fs.readFileSync(f, 'utf8'))]).filter(([, w]) => w);
        check(`${name}: files still readable`, !bad.length, bad.map(([f, w]) => `${path.basename(f)}: ${w}`).join(' | '));
        const off = await call('online:set', { emu: e.emu, kind: k.id, on: false });
        l = await call('online:list');
        const nowOff = !l.emus.find((x) => x.emu === e.emu).kinds.find((x) => x.id === k.id).on;
        check(`${name}: off`, !off?.error && nowOff, off?.error || '');
      }
    }
    check('no script errors', !errors.length, errors.slice(0, 3).join(' | '));
  } catch (e) { check('run finished', false, e.message); }
  await t.close(); await srv.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== online: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
