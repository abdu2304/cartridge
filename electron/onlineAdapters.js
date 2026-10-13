'use strict';
// Each emulator's online settings, from its own source (0.9.66). Field refs are [file, path]: file is a key of
// `files` ({ name: [path inside the settings folder, format, text for a new file] }), path as onlineFormats.js reads it.
// A kind is one online feature: `on`/`off` are the settings that switch it, `isOn` how to tell (default: every `on`
// value matches), `fields` what the player fills in. Sources are noted per adapter (repository and file:line).

// ---- PPSSPP (hrydgard/ppsspp 18ed9ff: Core/Config.cpp, assets/adhoc-servers.json, assets/infra-dns.json)
const PPSSPP_SERVERS = [
  ['socom.cc', 'socom.cc', 'PPSSPP’s default, France'], ['psp.mgn.pub', 'Madness Gaming Network', 'Alaska'], ['eahub.eu', 'EA Nation Hub', 'Europe'],
  ['relay.arenaanywhere.site', 'Arena Anywhere', 'Relay'], ['relay-usa.arenaanywhere.site', 'Arena Anywhere USA', 'Relay'], ['relay-asia.arenaanywhere.site', 'Arena Anywhere Asia', 'Relay'],
  ['cat.wjg.jp', 'Neko PSP', 'Japan'], ['pspbrasil.duckdns.org', 'PSP Brasil', 'Brazil'],
].map(([value, label, sub]) => ({ value, label, sub }));
const ppssppNick = (v) => (!/^.{1,32}$/.test(v) ? 'A nickname is 1 to 32 characters.' : /^ppsspp$/i.test(v) ? 'Pick a nickname other than PPSSPP: every player needs their own.' : null);
const ppsspp = {
  emu: 'ppsspp', label: 'PPSSPP', proc: /ppsspp/i,
  dirs: ['.config/ppsspp', '.var/app/org.ppsspp.PPSSPP/config/ppsspp'],
  files: { main: ['PSP/SYSTEM/ppsspp.ini', 'ini'] },
  kinds: [
    {
      id: 'network', name: 'Ad Hoc and Online Servers',
      what: 'Play PSP games together over the internet through an ad hoc server, and the games whose official servers fans run again.',
      on: [[['main', ['Network', 'EnableWlan']], 'True']], off: [[['main', ['Network', 'EnableWlan']], 'False']],
      fields: [
        { key: 'nick', label: 'Nickname', icon: 'mdiAccountOutline', required: true, at: ['main', ['SystemParam', 'NickName']], check: ppssppNick, read: (g) => { const v = g(['main', ['SystemParam', 'NickName']]); return v && !/^ppsspp$/i.test(v) ? v : ''; }, help: 'What other players see. Each player needs a different one.' },
        { key: 'server', label: 'Ad Hoc Server', icon: 'mdiServerNetwork', at: ['main', ['Network', 'proAdhocServer']], choices: PPSSPP_SERVERS, free: true, help: 'Everyone in a game uses the same server.', read: (g) => g(['main', ['Network', 'proAdhocServer']]) || 'socom.cc' },
        { key: 'infra', label: 'Online Username', icon: 'mdiAccountNetworkOutline', at: ['main', ['Network', 'InfrastructureUsername']], check: (v) => (/^[\w-]{3,16}$/.test(v) ? null : 'A username is 3 to 16 letters, digits, - or _.'), note: 'For games with revived official servers (PS Rewired)' },
      ],
    },
  ],
};

// ---- PCSX2 (PCSX2/pcsx2 0f71e66: pcsx2/Pcsx2Config.cpp DEV9 options, pcsx2/DEV9/sockets). Sockets needs no root;
// PCAP needs network capabilities and doesn't work from a Flatpak or AppImage without them.
const ipv4 = (v) => (!v || /^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? null : 'That isn’t an IPv4 address (four numbers with dots).');
const pcsx2 = {
  emu: 'pcsx2', label: 'PCSX2', proc: /pcsx2/i,
  dirs: ['.config/PCSX2', '.var/app/net.pcsx2.PCSX2/config/PCSX2'],
  files: { main: ['inis/PCSX2.ini', 'ini'] },
  kinds: [{
    id: 'dev9', name: 'Network Adapter',
    what: 'The PS2’s network adapter, so online games can reach the fan-run servers that bring them back.',
    note: 'Uses Sockets, which needs no special rights. Each game still needs its network settings saved on its memory card, and the revival server’s DNS (from its community), either here or in the game.',
    on: [[['main', ['DEV9/Eth', 'EthEnable']], 'true'], [['main', ['DEV9/Eth', 'EthApi']], 'Sockets'], [['main', ['DEV9/Eth', 'EthDevice']], 'Auto']],
    off: [[['main', ['DEV9/Eth', 'EthEnable']], 'false']],
    isOn: (g) => /^true$/i.test(g(['main', ['DEV9/Eth', 'EthEnable']]) || '') && (g(['main', ['DEV9/Eth', 'EthApi']]) || '') !== 'Unset',
    fields: [{
      key: 'dns', label: 'DNS Server', icon: 'mdiDns', check: ipv4, help: 'The revival server’s DNS address from its community. Leave empty to use the one set inside the game.',
      read: (g) => (/^manual$/i.test(g(['main', ['DEV9/Eth', 'ModeDNS1']]) || '') ? g(['main', ['DEV9/Eth', 'DNS1']]) || '' : ''),
      // PCSX2 reads DNS1 only (Pcsx2Config.cpp:1369-1370 parses DNS1 twice), so one address
      write: ({ value, put }) => { if (value) { put(['main', ['DEV9/Eth', 'ModeDNS1']], 'Manual'); put(['main', ['DEV9/Eth', 'DNS1']], value); } else put(['main', ['DEV9/Eth', 'ModeDNS1']], 'Auto'); },
    }],
  }],
};

// ---- RetroArch (libretro/RetroArch 4709c07: configuration.c netplay keys, network/netplay/netplay_frontend.c:215-221
// relay handles). Hosting or joining is chosen per session in RetroArch; Cartridge sets the name and the relay.
const retroarch = {
  emu: 'retroarch', label: 'RetroArch', proc: /retroarch/i,
  dirs: ['.config/retroarch', '.var/app/org.libretro.RetroArch/config/retroarch'],
  files: { main: ['retroarch.cfg', 'cfg'] },
  kinds: [{
    id: 'netplay', name: 'Netplay Through a Relay',
    what: 'Play together over the internet; a relay server connects players even when their routers block it. Host or join a game from RetroArch’s Netplay menu.',
    on: [[['main', ['netplay_use_mitm_server']], 'true']], off: [[['main', ['netplay_use_mitm_server']], 'false']],
    fieldsAlways: true,
    fields: [
      { key: 'nick', label: 'Nickname', icon: 'mdiAccountOutline', required: true, at: ['main', ['netplay_nickname']], check: (v) => (/^.{1,32}$/.test(v) ? null : 'A nickname is 1 to 32 characters.') },
      { key: 'relay', label: 'Relay Server', icon: 'mdiServerNetwork', at: ['main', ['netplay_mitm_server']], choices: [['nyc', 'North America', 'New York'], ['madrid', 'Europe', 'Madrid'], ['saopaulo', 'South America', 'São Paulo'], ['singapore', 'Asia', 'Singapore']].map(([value, label, sub]) => ({ value, label, sub })), read: (g) => ({ nyc: 'North America', madrid: 'Europe', saopaulo: 'South America', singapore: 'Asia' })[g(['main', ['netplay_mitm_server']]) || 'nyc'] || g(['main', ['netplay_mitm_server']]) },
    ],
  }],
};

module.exports = [ppsspp, pcsx2, retroarch];
