'use strict';
const fs = require('fs');
const path = require('path');
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

// ---- RPCS3 (RPCS3/rpcs3 ce10778: Emu/NP/rpcn_config.cpp, rpcs3qt/rpcn_settings_dialog.cpp derive_password,
// Emu/system_config.h Net). On Linux both files sit in the config folder's root (Utilities/File.cpp:2604-2610).
const RPCN_SALT = 'No matter where you go, everybody\'s connected.';
// npid rules from rpcn_settings_dialog.cpp:266-269 (3 to 16 of a-z A-Z 0-9 - _), the password derived as RPCS3 does
const npidCheck = (v) => (/^[A-Za-z0-9_-]{3,16}$/.test(v) ? null : 'A username is 3 to 16 letters, digits, - or _.');
const rpcnHash = async (ctx, pw) => String(await ctx.pbkdf2(pw, RPCN_SALT, 200000, 32)).toUpperCase();
const rpcs3 = {
  emu: 'rpcs3', label: 'RPCS3', proc: /rpcs3/i,
  dirs: ['.config/rpcs3', '.var/app/net.rpcs3.RPCS3/config/rpcs3'],
  files: { main: ['config.yml', 'yaml'], rpcn: ['rpcn.yml', 'yaml', 'Version: 2\nHost: np.rpcs3.net\n'] },
  // EmuDeck's old "Resolution Scale: = N" leaves config.yml unreadable to RPCS3 (0.9.63): Repair comes first
  precheck: ({ dir }) => require('./patches').rpcs3ConfigCheck({ cfg: dir }),
  repair: ({ dir }) => require('./patches').rpcs3ConfigRepair({ cfg: dir }),
  kinds: [{
    id: 'rpcn', name: 'RPCN',
    what: 'RPCS3’s stand-in for PSN: online matchmaking, rooms, friends and scores with other RPCS3 players.',
    note: 'No account yet? Make one here: RPCN emails you a token to type in.',
    on: [[['main', ['Net', 'Internet enabled']], 'Connected'], [['main', ['Net', 'PSN status']], 'RPCN']],
    off: [[['main', ['Net', 'PSN status']], 'Disconnected']],
    fieldsAlways: true, // the account comes first: made or signed in before RPCN is switched on
    fields: [
      { key: 'npid', label: 'Username', icon: 'mdiAccountOutline', required: true, at: ['rpcn', ['NPID']], check: npidCheck },
      // stored as RPCS3 stores it: PBKDF2-SHA3-256 of what you type, 200,000 rounds, upper-case hex (never the password)
      { key: 'password', label: 'Password', icon: 'mdiLockOutline', required: true, secret: true, at: ['rpcn', ['Password']],
        write: async ({ value, put, get, ctx }) => {
          if (!value) throw new Error('Type your RPCN password.');
          const hex = await rpcnHash(ctx, value);
          put(['rpcn', ['Version']], '2'); if (!get(['rpcn', ['Host']])) put(['rpcn', ['Host']], 'np.rpcs3.net');
          put(['rpcn', ['Password']], hex);
        } },
      { key: 'token', label: 'Token', icon: 'mdiKeyOutline', required: true, at: ['rpcn', ['Token']], check: (v) => (/^[0-9A-Z]{16}$/.test(v) ? null : 'The token RPCN emailed you is 16 capital letters and digits.'), help: 'The 16-character token RPCN emailed you when you made the account.' },
    ],
    actions: [
      // the account made the way RPCS3's own dialog makes it (rpcn_settings_dialog.cpp:264-330), then saved for RPCS3
      { id: 'create', label: 'Make an RPCN Account', sub: 'RPCN emails you a token to finish', icon: 'mdiAccountPlusOutline', then: 'token',
        asks: [
          { key: 'npid', label: 'Pick a Username', help: '3 to 16 letters, digits, - or _. Capitals count.' },
          { key: 'password', label: 'Pick a Password', secret: true },
          { key: 'email', label: 'Your Email', help: 'RPCN sends the token that finishes the account here, and nothing else.' },
        ],
        run: async ({ input, ready, get, save, ctx }) => {
          ready();
          const why = npidCheck(input.npid || '') || (!input.password ? 'Pick a password.' : null) || (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email || '') ? 'That isn’t an email address.' : null);
          if (why) throw new Error(why);
          const hash = await rpcnHash(ctx, input.password), host = get(['rpcn', ['Host']]) || 'np.rpcs3.net';
          await (ctx.rpcn || require('./rpcnClient')).create({ host, npid: input.npid, hash, email: input.email, connect: ctx.rpcnConnect });
          save([[['rpcn', ['Version']], '2'], [['rpcn', ['Host']], host], [['rpcn', ['NPID']], input.npid], [['rpcn', ['Password']], hash]]);
          return { message: 'Account made. RPCN emailed you a token: type it next.' };
        } },
      { id: 'resend', label: 'Email the Token Again', sub: 'For the username and password saved here', icon: 'mdiEmailOutline',
        run: async ({ ready, get, ctx }) => {
          ready();
          const npid = get(['rpcn', ['NPID']]), hash = get(['rpcn', ['Password']]), host = get(['rpcn', ['Host']]) || 'np.rpcs3.net';
          if (!npid || !hash) throw new Error('Set your username and password first.');
          await (ctx.rpcn || require('./rpcnClient')).sendToken({ host, npid, hash, connect: ctx.rpcnConnect });
          return { message: 'RPCN emailed the token again.' };
        } },
    ],
  }],
};

// ---- shadPS4 (shadps4-emu/shadPS4 23c4133: src/core/emulator_settings.cpp Network section, src/core/user_settings.cpp,
// src/shadnet/client.cpp). Settings moved from General to Network (MigrateNetworkKeys): Network is written. The
// account is per user in users.json (Users.user[]); the password is stored and sent as typed (client.cpp:200-212).
const shadUser = (g) => { const list = g(['users', ['Users', 'user']]); if (!Array.isArray(list) || !list.length) return 0; const i = list.findIndex((u) => Number(u?.user_id) === 1000); return i >= 0 ? i : 0; };
const shadps4 = {
  emu: 'shadps4', label: 'shadPS4', proc: /shadps4/i,
  dirs: ['.local/share/shadPS4', '.var/app/net.shadps4.shadPS4/data/shadPS4'],
  files: { main: ['config.json', 'json'], users: ['users.json', 'json'] },
  kinds: [{
    id: 'shadnet', name: 'ShadNet',
    what: 'shadPS4’s stand-in for PSN, for the few PS4 games that already work online. Early testing.',
    note: 'No account yet? Make one on shadps4.net from here: ShadNet’s own client has no way to make one.',
    on: (g) => [[['main', ['Network', 'connected_to_network']], true], [['main', ['Network', 'shad_net_enabled']], true], [['users', ['Users', 'user', shadUser(g), 'shadnet_enabled']], true]],
    off: [[['main', ['Network', 'shad_net_enabled']], false]],
    isOn: (g) => g(['main', ['Network', 'shad_net_enabled']]) === true && g(['main', ['Network', 'connected_to_network']]) === true,
    fieldsAlways: true,
    fields: [
      { key: 'npid', label: 'Username', icon: 'mdiAccountOutline', required: true, read: (g) => g(['users', ['Users', 'user', shadUser(g), 'shadnet_npid']]) || '', write: ({ value, put, get, has }) => { if (!has('users')) throw new Error('Open shadPS4 once first, so it makes its user list.'); put(['users', ['Users', 'user', shadUser(get), 'shadnet_npid']], value); } },
      { key: 'password', label: 'Password', icon: 'mdiLockOutline', required: true, secret: true, read: (g) => (g(['users', ['Users', 'user', shadUser(g), 'shadnet_password']]) ? '•' : ''), write: ({ value, put, get, has }) => { if (!has('users')) throw new Error('Open shadPS4 once first, so it makes its user list.'); put(['users', ['Users', 'user', shadUser(get), 'shadnet_password']], value); } },
    ],
    actions: [{ id: 'register', label: 'Make a ShadNet Account', sub: 'Opens shadps4.net’s sign-up page here', icon: 'mdiAccountPlusOutline', url: 'https://www.shadps4.net/shadnet/register/', then: 'signin' }],
  }],
};

// ---- Ryujinx (Ryubing a82350b, read from the zff.dev archive mirror: src/Ryujinx/Systems/Configuration/
// ConfigurationFileFormat.cs:457,467,472,477, Common/Configuration/Multiplayer/MultiplayerMode.cs, SharedConstants.cs:5-7).
// Config.json top-level snake_case keys; multiplayer_mode is a number (0 off, 1 RyuLDN, 2 ldn_mitm). No account.
const ryujinx = {
  emu: 'ryujinx', label: 'Ryujinx', proc: /ryujinx/i,
  dirs: ['.config/Ryujinx', '.var/app/io.github.ryubing.Ryujinx/config/Ryujinx', '.var/app/org.ryujinx.Ryujinx/config/Ryujinx'],
  files: { main: ['Config.json', 'json'] },
  kinds: [{
    id: 'ldn', name: 'Local Wireless Over the Internet',
    what: 'Games’ local wireless play works with other Ryujinx players anywhere, through the Ryujinx LDN server. No account needed.',
    note: 'Then start the game and pick its local wireless or local play mode.',
    on: [[['main', ['multiplayer_mode']], 1]], off: [[['main', ['multiplayer_mode']], 0]],
    isOn: (g) => Number(g(['main', ['multiplayer_mode']])) === 1,
    fields: [
      { key: 'server', label: 'LDN Server', icon: 'mdiServerNetwork', at: ['main', ['ldn_server']], free: true, choices: [{ value: '', label: 'Ryujinx’s Own', sub: 'ldn.ryujinx.app' }], read: (g) => g(['main', ['ldn_server']]) || 'Ryujinx’s Own', check: (v) => (!v || /^[\w.-]+$/.test(v) ? null : 'A server is a host name or IP address.') },
      { key: 'pass', label: 'Private Group', icon: 'mdiLockOutline', at: ['main', ['multiplayer_ldn_passphrase']], placeholder: 'Ryujinx-1a2b3c4d', help: 'Players with the same passphrase only see each other. Leave empty to play with everyone.', check: (v) => (!v || /^Ryujinx-[0-9a-f]{8}$/.test(v) ? null : 'A passphrase is Ryujinx- and 8 characters from 0-9 and a-f.'), read: (g) => g(['main', ['multiplayer_ldn_passphrase']]) || '' },
    ],
  }],
};

// ---- Eden (eden-emu 218c670: src/qt_common/config/uisettings.h:183, src/common/settings.h:936-944,
// src/frontend_common/config.cpp:396-399,743). qt-config.ini: a value counts only with "key\default=false" beside it.
// Rooms are joined in Eden (Multiplayer); there is no setting or command to join one.
const eden = {
  emu: 'eden', label: 'Eden', proc: /^eden/i,
  dirs: ['.config/eden', '.var/app/dev.eden_emu.eden/config/eden'],
  files: { main: ['qt-config.ini', 'qt'] },
  kinds: [{
    id: 'rooms', name: 'Multiplayer Rooms',
    what: 'Games’ local wireless play works with other Eden players through rooms. Join one in Eden: Multiplayer, Browse Public Game Lobby.',
    note: 'Turning this on switches off Eden’s airplane mode, which Switch games check before playing over local wireless.',
    on: [[['main', ['Services', 'airplane_mode']], 'false']], off: [[['main', ['Services', 'airplane_mode']], 'true']],
    // missing or "\default=true" means Eden's default (true: airplane mode on)
    isOn: (g) => g(['main', ['Services', 'airplane_mode']]) === 'false' && g(['main', ['Services', 'airplane_mode\\default']]) === 'false',
    fieldsAlways: true,
    fields: [
      { key: 'nick', label: 'Nickname', icon: 'mdiAccountOutline', required: true, at: ['main', ['UI', 'Multiplayer\\nickname']], check: (v) => (/^.{1,32}$/.test(v) ? null : 'A nickname is 1 to 32 characters.'), help: 'What other players see in rooms.', read: (g) => (g(['main', ['UI', 'Multiplayer\\nickname\\default']]) === 'false' ? g(['main', ['UI', 'Multiplayer\\nickname']]) || '' : '') },
      { key: 'user', label: 'Web Service Username', icon: 'mdiAccountNetworkOutline', at: ['main', ['WebService', 'eden_username']], check: (v) => (/^.{4,20}$/.test(v) ? null : 'A username is 4 to 20 characters.'), note: 'For public rooms that check who joins', read: (g) => (g(['main', ['WebService', 'eden_username\\default']]) === 'false' ? g(['main', ['WebService', 'eden_username']]) || '' : '') },
    ],
  }],
};

// ---- Azahar (azahar-emu 73ed0e9: src/citra_qt/configuration/config.cpp:608-625,923-928, src/common/settings.h:666-667,
// src/core/hw/unique_data.cpp:235-249). The nickname in rooms is the emulated 3DS's username (System settings, saved
// in its NAND), not a setting Cartridge can write; the source ships no lobby server (web_api_url empty).
const azaharData = (dir, home) => (dir && /\.var\/app\/[^/]+\/config\//.test(dir) ? dir.replace(/\/config\/([^/]+)$/, '/data/$1') : dir && /\/user\/config$/.test(dir) ? path.dirname(dir) : path.join(home, '.local/share/azahar-emu'));
const azahar = {
  emu: 'azahar', label: 'Azahar', proc: /azahar/i,
  dirs: ['.config/azahar-emu', '.var/app/org.azahar_emu.Azahar/config/azahar-emu'],
  files: { main: ['qt-config.ini', 'qt'] },
  kinds: [
    {
      id: 'rooms', name: 'Multiplayer Rooms', info: true,
      what: 'Local wireless play and Download Play with other Azahar players. Join a room in Azahar: Multiplayer, Direct Connect, with the address the host gives you.',
      note: 'Your name in rooms is the 3DS username in Azahar’s System settings.',
      fields: [
        { key: 'lobby', label: 'Lobby Server', icon: 'mdiServerNetwork', at: ['main', ['WebService', 'web_api_url']], placeholder: 'https://', help: 'A server that lists public rooms, if your community runs one. Azahar comes without one.', check: (v) => (!v || /^https?:\/\/\S+$/.test(v) ? null : 'A lobby server is an address starting with http:// or https://.') },
      ],
    },
    {
      id: 'pretendo', name: 'Pretendo Network', info: true,
      what: 'Online play for 3DS games through Pretendo, the fan-run Nintendo Network. It needs the system files dumped from your own 3DS, with a Pretendo account on it.',
      status: ({ dir, home, exists }) => {
        const d = azaharData(dir, home), need = [['sysdata/otp.bin', 'otp.bin'], ['nand/rw/sys/SecureInfo_A', 'SecureInfo_A'], ['nand/rw/sys/LocalFriendCodeSeed_B', 'LocalFriendCodeSeed_B'], ['nand/private/movable.sed', 'movable.sed']];
        const miss = need.filter(([f]) => !exists(path.join(d, f))).map(([, n]) => n);
        return miss.length ? { ready: false, note: `Missing from Azahar: ${miss.join(', ')}. Dump them from your 3DS and import them in Azahar’s System settings.` } : { ready: true, note: 'Your 3DS’s system files are in Azahar. Online games use the account on them.' };
      },
      actions: [{ id: 'guide', label: 'Pretendo’s Azahar Guide', sub: 'pretendo.network', icon: 'mdiOpenInNew', url: 'https://pretendo.network/docs/install/' }],
    },
  ],
};

// ---- Dolphin (dolphin-emu 8d2ad1a: Source/Core/Core/Config/NetplaySettings.cpp:14-35, MainSettings.cpp:137-161,287,
// HW/EXI/EXI_Device.h:25-45). Dolphin.ini; sessions are started or joined in Dolphin (Tools, NetPlay).
const dolphin = {
  emu: 'dolphin', label: 'Dolphin', proc: /dolphin-emu/i,
  dirs: ['.config/dolphin-emu', '.dolphin-emu/Config', '.var/app/org.DolphinEmu.dolphin-emu/config/dolphin-emu'],
  files: { main: ['Dolphin.ini', 'ini'] },
  kinds: [
    {
      id: 'netplay', name: 'NetPlay by Host Code',
      what: 'Play GameCube and Wii games together. With this on, players join with the host’s short code instead of an IP address. Start or join in Dolphin: Tools, NetPlay.',
      on: [[['main', ['NetPlay', 'TraversalChoice']], 'traversal']], off: [[['main', ['NetPlay', 'TraversalChoice']], 'direct']],
      fieldsAlways: true,
      fields: [{ key: 'nick', label: 'Nickname', icon: 'mdiAccountOutline', at: ['main', ['NetPlay', 'Nickname']], check: (v) => (/^.{1,32}$/.test(v) ? null : 'A nickname is 1 to 32 characters.'), read: (g) => g(['main', ['NetPlay', 'Nickname']]) || 'Player' }],
    },
    {
      id: 'wiilink', name: 'WiiLink Channels',
      what: 'Brings back Wii channels such as Forecast and News through WiiLink’s servers.',
      on: [[['main', ['Core', 'EnableWiiLink']], 'True']], off: [[['main', ['Core', 'EnableWiiLink']], 'False']],
    },
    {
      id: 'bba', name: 'GameCube Broadband Adapter',
      what: 'Online for GameCube network games, such as Phantasy Star Online on community servers.',
      note: 'Uses Dolphin’s built-in adapter in Serial Port 1. The DNS server comes from the game’s community.',
      on: [[['main', ['Core', 'SerialPort1']], '12']], off: [[['main', ['Core', 'SerialPort1']], '255']],
      fields: [{ key: 'dns', label: 'DNS Server', icon: 'mdiDns', at: ['main', ['Core', 'BBA_BUILTIN_DNS']], check: (v) => (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? null : 'That isn’t an IPv4 address (four numbers with dots).'), read: (g) => g(['main', ['Core', 'BBA_BUILTIN_DNS']]) || '3.18.217.27', note: 'Dolphin’s default is a Phantasy Star Online server' }],
    },
    {
      id: 'wiimmfi', name: 'Wii Online (Wiimmfi)', info: true,
      what: 'Wii games that used Nintendo Wi-Fi Connection play online through Wiimmfi. Dolphin has no setting for it: each game has to be patched with Wiimmfi’s patcher first.',
      actions: [{ id: 'wiimmfi', label: 'Wiimmfi’s Patcher', sub: 'wiimmfi.de', icon: 'mdiOpenInNew', url: 'https://wiimmfi.de/patcher' }],
    },
  ],
};

// ---- Cemu (cemu-project/Cemu 2c212b5: src/config/NetworkSettings.h, ActiveSettings.cpp:162-170,
// Cafe/IOSU/legacy/iosu_crypto.cpp:622-653). Online needs files dumped from your own Wii U; Cemu greys out the
// service choice until they're valid and then keeps it per account itself, so Cartridge only reports what's there.
const cemuData = (dir, home) => (dir && /\.var\/app\/[^/]+\/config\//.test(dir) ? dir.replace(/\/config\/([^/]+)$/, '/data/$1') : dir && /\/portable$/.test(dir) ? dir : path.join(home, '.local/share/Cemu'));
const sizeOf = (f) => { try { return fs.statSync(f).size; } catch { return -1; } };
const cemu = {
  emu: 'cemu', label: 'Cemu', proc: /^cemu/i,
  dirs: ['.config/Cemu', '.var/app/info.cemu.Cemu/config/Cemu'],
  files: { main: ['settings.xml', 'xml'] },
  kinds: [{
    id: 'pretendo', name: 'Pretendo Network', info: true,
    what: 'Online play for Wii U games through Pretendo, the fan-run Nintendo Network. It needs files dumped from your own Wii U and a Pretendo account linked on it. Then pick Pretendo in Cemu: Options, General Settings, Account.',
    status: ({ dir, home }) => {
      const d = cemuData(dir, home), miss = [];
      if (sizeOf(path.join(d, 'otp.bin')) !== 1024) miss.push('otp.bin');
      if (sizeOf(path.join(d, 'seeprom.bin')) !== 512) miss.push('seeprom.bin');
      return miss.length ? { ready: false, note: `Missing from Cemu: ${miss.join(', ')}, dumped from your Wii U (with its certificates and account).` } : { ready: true, note: 'Your Wii U’s keys are in Cemu. Choose Pretendo for your account in Cemu’s settings.' };
    },
    actions: [{ id: 'guide', label: 'Cemu’s Online Guide', sub: 'cemu.info', icon: 'mdiOpenInNew', url: 'https://cemu.info/online-guide' }],
  }],
};

module.exports = [ppsspp, pcsx2, retroarch, rpcs3, shadps4, eden, ryujinx, azahar, dolphin, cemu];
