<template>
  <div class="set-view" ref="el">
    <nav class="rail">
      <div class="eyebrow" style="padding: 0 14px 10px">Settings</div>
      <button class="rail-item rail-find" data-focus @click="searchSettings"><Icon name="mdiMagnify" :size="20" />Find a Setting</button>
      <button v-for="s in sections" :key="s.id" class="rail-item" :class="{ on: sec === s.id }" data-focus :data-key="'sec-' + s.id" :data-autofocus="sec === s.id ? '' : undefined" @focus="sec = s.id" @click="(e) => pick(s.id, e)">
        <SyncthingLogo v-if="s.id === 'syncthing'" :size="20" mono class="rail-st" /><Icon v-else :name="s.icon" :size="20" />{{ s.label }}
      </button>
    </nav>
    <section class="pane" data-scroll data-zone ref="paneEl">
      <!-- the old page goes at once, so a quick press to the right always lands on the new one (A13) -->
      <Transition name="fadeup">
        <div :key="sec" class="pane-in">
          <!-- every section opens the same way (0.9.49): its name, one short line, then its pages if it has them -->
          <header class="sec-head"><h1>{{ sections.find((x) => x.id === sec)?.label }}</h1><p v-if="lead" class="sec-lead">{{ lead }}</p></header>
          <div v-if="sec === 'library'" class="lookpages"><Btn b="LB" /><div class="seg"><button v-for="p in LIB_PAGES" :key="p.v" data-focus :data-key="'lib-' + p.v" :class="{ on: libPage === p.v }" @click="libPage = p.v">{{ p.l }}</button></div><Btn b="RB" /></div>
          <div v-if="sec === 'dlup'" class="lookpages"><Btn b="LB" /><div class="seg"><button v-for="p in DLUP_PAGES" :key="p.v" data-focus :data-key="'dlup-' + p.v" :class="{ on: dlupPage === p.v }" @click="dlupPage = p.v">{{ p.l }}</button></div><Btn b="RB" /></div>
          <!-- one RomM tab (0.9.3 G1): connection, library and sync, upload -->
          <template v-if="sec === 'library' && libPage === 'server'">
            <!-- 0.9.17: using Cartridge without RomM: one press to connect -->
            <div v-if="store.config.localOnly" class="card-s glass local-card">
              <Icon name="mdiFolderPlayOutline" :size="28" />
              <div class="l-mid"><b>Using Cartridge without RomM</b><span class="muted small">Only games already in your console folders show up, with no covers, details, collections or syncing. Connect a RomM server for all of it.</span></div>
              <button class="btn primary" data-focus @click="go('setup')"><Icon name="mdiServerNetwork" />Connect to RomM</button>
            </div>
            <div class="subh"><Icon name="mdiServerNetwork" :size="20" />Connection</div>
            <div class="card-s glass">
              <div class="kv"><span>Local</span><span class="mono">{{ srv.localUrl || 'Not set' }}</span></div>
              <div class="kv"><span>Remote</span><span class="mono">{{ srv.remoteUrl || 'Not set' }}</span></div>
              <div class="kv"><span>Using now</span><span class="row" style="gap: 8px"><span class="dot" :class="store.connection.route === 'local' ? 'ok' : 'remote'" />{{ store.connection.base || 'Not connected' }}</span></div>
              <div class="kv"><span>Signed in</span><span>{{ srv.auth === 'token' ? 'API token' : srv.username }}</span></div>
            </div>
            <div class="row"><span class="lbl">Route</span><div class="seg"><button v-for="m in modes" :key="m.v" data-focus :class="{ on: srv.mode === m.v }" @click="setMode(m.v)">{{ m.l }}</button></div></div>
            <div class="row wrap">
              <button class="btn" data-focus @click="go('setup')"><Icon name="mdiPencil" />Edit connection</button>
              <button class="btn" data-focus @click="reconnect"><Icon name="mdiLanConnect" />Reconnect</button>
              <button class="btn danger" data-focus @click="signOut"><Icon name="mdiLogout" />Sign out</button>
            </div>

            <div class="subh" style="margin-top: 14px"><Icon name="mdiSync" :size="20" />Library &amp; Sync</div>
            <div class="card-s glass">
              <div class="kv"><span>Last sync</span><span>{{ ago(store.lib?.syncedAt) }}</span></div>
              <div class="kv"><span>Library</span><span>{{ total }} games · {{ store.lib?.platforms.filter((p) => p.rom_count).length || 0 }} systems</span></div>
              <div v-if="busy" class="kv"><span>Status</span><span class="row" style="gap: 8px"><Icon name="mdiSync" :size="16" class="spin" />{{ store.sync.label }}</span></div>
            </div>
            <div class="row wrap">
              <button class="btn primary" data-focus :disabled="busy" @click="resync()"><Icon name="mdiSync" />Resync now</button>
              <button class="btn" data-focus :disabled="busy" @click="scanServer()"><Icon name="mdiRadar" />Scan server for new ROMs</button>
              <button class="btn" data-focus @click="rescan"><Icon name="mdiHarddisk" />Rescan this device</button>
            </div>
            <Toggle :model-value="store.config.sync.onLaunch" label="Resync when Cartridge starts" desc="Picks up games you added to RomM since last time" @update:model-value="(v) => saveConfig({ sync: { onLaunch: v } })" />
            <div class="row"><span class="lbl">Auto resync</span><div class="seg"><button v-for="m in every" :key="m.v" data-focus :class="{ on: store.config.sync.everyMinutes === m.v }" @click="saveConfig({ sync: { everyMinutes: m.v } })">{{ m.l }}</button></div></div>
            <p class="muted small">“Scan server” asks RomM to look through its own folders for files you copied in, then resyncs. It needs username &amp; password sign-in.</p>
            <div class="subh" style="margin-top: 14px"><Icon name="mdiServer" :size="20" />RomM on This Device</div>
            <template v-if="store.config.rommLocal?.port">
              <div class="card-s glass">
                <div class="kv"><span>Server</span><span>{{ store.config.rommLocal.name || 'RomM' }} · port {{ store.config.rommLocal.port }}</span></div>
                <div class="kv"><span>Games folder</span><span class="mono">{{ store.config.rommLocal.library }}</span></div>
              </div>
              <div class="row wrap"><button class="btn" data-focus :disabled="rlBusy" @click="rommLocalUpdate"><Icon name="mdiUpdate" />{{ rlBusy ? 'Updating…' : 'Update RomM' }}</button></div>
              <p class="muted small">Reachable while this device is on and online. Update RomM gets the newest version; your games, database and account stay.</p>
            </template>
              <template v-else>
              <p class="muted small">No server? Cartridge can run RomM here in the background with Podman. It's only reachable while this device is on and online.</p>
              <div class="row"><button class="btn" data-focus @click="store.welcoming = 'romm-local'"><Icon name="mdiServerPlus" />Set Up RomM on This Device</button></div>
            </template>
            <div style="margin-top: 14px"><RommUpload /></div>
          </template>
          <template v-else-if="sec === 'library' && libPage === 'folders'">
            <!-- 0.9.49 (owner): every games folder on one card, named after its drive; new games by drive name; Always Ask -->
            <div class="subh">Games Folders</div>
            <p class="muted small" style="margin-top: -6px">Cartridge finds your games in every one of these, and your emulators are told about each.</p>
            <div class="gf-list">
              <div v-for="r in rootsShown" :key="r.path" class="gf glass">
                <Icon :name="r.main ? 'mdiHarddisk' : 'mdiSdCard'" :size="26" class="gf-ico" />
                <div class="l-mid">
                  <b class="gf-name">{{ r.drive }}<span v-if="r.main" class="status">Main Folder</span></b>
                  <span class="mono small gf-path">{{ short(r.path) }}</span>
                  <span v-if="r.here && r.total" class="bar gf-bar"><i :style="{ width: Math.round((1 - r.free / r.total) * 100) + '%' }" /></span>
                  <span class="muted small">{{ r.here ? `${bytes(r.free)} free of ${bytes(r.total)}` : 'Not plugged in' }}</span>
                </div>
                <button v-if="r.main" class="btn small" data-focus @click="browseRoot"><Icon name="mdiFolderOpen" :size="18" />Change</button>
                <button v-else class="btn small" data-focus @click="removeRoot(r)"><Icon name="mdiClose" :size="16" />Remove</button>
              </div>
            </div>
            <div class="row wrap">
              <button class="btn" data-focus @click="addRoot"><Icon name="mdiHarddiskPlus" :size="18" />Add a Drive</button>
              <button class="btn" data-focus @click="detect"><Icon name="mdiAutoFix" :size="18" />Find Games Folders</button>
            </div>
            <template v-if="allRoots.length > 1">
              <div class="subh">New Games Go To</div>
              <div class="seg wrap-seg"><button data-focus :class="{ on: rootTo === 'most' }" @click="setRootTo('most')">Most Free Space</button><button v-for="r in allRoots" :key="r.path" data-focus :class="{ on: rootTo === r.path }" @click="setRootTo(r.path)">{{ r.drive }}</button></div>
              <Toggle :model-value="!!dls.askWhere" label="Always Ask" desc="Each download asks which drive it goes to" @update:model-value="(v) => saveConfig({ downloads: { askWhere: v } })" />
            </template>
            <div class="subh">BIOS Folder</div>
            <div class="pathrow glass">
              <div style="min-width: 0"><div class="mono">{{ store.config.biosPath ? short(store.config.biosPath) : 'Not set' }}</div><div class="muted small">BIOS and firmware files your emulators need</div></div>
              <button class="btn small" data-focus @click="browseBios"><Icon name="mdiFolderOpen" :size="18" />Change</button>
            </div>
            <StorageManager :key="storageKey" />
            <LibraryCheck />
          </template>

          <!-- Syncthing (its own tab in 0.9.21; renamed with its logo in 0.9.23, owner) -->
          <template v-else-if="sec === 'syncthing'">
            <!-- 0.9.51: Cartridge Save Sync (RomM) or Syncthing; a device uses one, never both (owner) -->
            <!-- 0.9.58 (owner): two tabs, Cartridge Save Sync and Syncthing; Syncthing's parts are cards that open, and the
                 choice of which one this device uses sits at the end of both tabs (it was a third tab, Advanced) -->
            <div class="lookpages"><Btn b="LB" /><div class="seg"><button v-for="p in SYNC_PAGES" :key="p.v" data-focus :data-key="'sync-' + p.v" :class="{ on: syncPage === p.v }" @click="syncPage = p.v">{{ p.l }}</button></div><Btn b="RB" /></div>
            <SaveSyncCard v-if="syncPage === 'saves'" @advanced="toChoice" />
            <template v-else-if="!stView">
              <div class="st-hub-head"><SyncthingLogo :size="44" /><div><h2>Syncthing</h2><p class="muted small">Keeps folders the same on all your devices. Cartridge reads what it shares, and only sets it up when you ask.</p></div></div>
              <p v-if="ssMode === 'cartridge'" class="muted small sync-lock"><Icon name="mdiLockOutline" :size="16" />This device syncs saves with Cartridge Save Sync, so Syncthing isn't used for saves here. Syncthing still shows what else it keeps in step.</p>
              <div class="st-hub">
                <button v-for="c in ST_CARDS" :key="c.v" class="st-hub-card glass" data-focus :data-key="'sth-' + c.v" @click="openSt(c.v)">
                  <Icon :name="c.icon" :size="30" />
                  <b>{{ c.l }}</b>
                  <span class="muted small">{{ c.sub }}</span>
                  <Icon name="mdiChevronRight" :size="20" class="st-hub-go" />
                </button>
              </div>
            </template>
            <template v-else>
              <button class="lrow st-back" data-focus data-key="st-back" @click="closeSt"><Icon name="mdiArrowLeft" :size="22" /><div class="l-mid"><b>Syncthing</b><span class="l-sub">{{ ST_CARDS.find((c) => c.v === stView)?.l }} · B goes back</span></div></button>
              <SyncCard ref="syncRef" :page="stView" />
            </template>
            <template v-if="syncPage === 'saves' || !stView">
              <div data-key="ss-choice" tabindex="-1" class="ss-choice-anchor" />
              <div class="subh">How This Device Syncs Saves</div>
              <p class="muted small">One way per device: two ways moving the same saves would fight each other.</p>
              <div class="stack">
                <button class="lrow" data-focus :aria-disabled="ssLocked" @click="setSaveSync('cartridge')">
                  <Icon name="mdiCloudSyncOutline" :size="26" />
                  <div class="l-mid"><b>Cartridge Save Sync</b><span class="l-sub">{{ ssLocked ? 'Locked while Syncthing syncs this device’s saves. Stop using Syncthing for saves below first.' : 'Saves on your own RomM server, synced before and after you play, with older versions kept.' }}</span></div>
                  <Icon v-if="ssLocked" name="mdiLockOutline" :size="20" class="muted" /><span v-else-if="ssMode === 'cartridge'" class="tick-ok" title="Chosen"><Icon name="mdiCheck" :size="14" /></span>
                </button>
                <button class="lrow" data-focus @click="setSaveSync('syncthing')">
                  <SyncthingLogo :size="26" mono />
                  <div class="l-mid"><b>Syncthing</b><span class="l-sub">Save folders copied straight between your devices, set up on the Syncthing page.</span></div>
                  <span v-if="ssMode === 'syncthing'" class="tick-ok" title="Chosen"><Icon name="mdiCheck" :size="14" /></span>
                </button>
                <button class="lrow" data-focus @click="setSaveSync(null)">
                  <Icon name="mdiCloudOffOutline" :size="26" />
                  <div class="l-mid"><b>Don't Sync Saves</b><span class="l-sub">Saves stay on this device.</span></div>
                  <span v-if="!ssMode" class="tick-ok" title="Chosen"><Icon name="mdiCheck" :size="14" /></span>
                </button>
              </div>
              <template v-if="ssLocked">
                <div class="subh">Stop Using Syncthing for Saves</div>
                <p class="muted small">Cartridge stops managing Syncthing for saves on this device. Syncthing itself and its folders stay as they are: remove the save folders in Syncthing if you don't want them any more.</p>
                <div class="row"><button class="btn" data-focus @click="leaveSyncthing"><Icon name="mdiLinkOff" />Stop Using Syncthing for Saves</button></div>
              </template>
            </template>
          </template>

          <template v-else-if="sec === 'emu'">
            <!-- pages like Look & Feel (0.9.16, owner): LB/RB move between them -->
            <div class="lookpages"><Btn b="LB" /><div class="seg"><button v-for="p in EMU_PAGES" :key="p.v" data-focus :data-key="'emup-' + p.v" :class="{ on: emuPage === p.v }" @click="setEmuPage(p.v)">{{ p.l }}<span v-if="p.v === 'addons' && ps3UpCount" class="count-dot">{{ ps3UpCount }}</span></button></div><Btn b="RB" /></div>
            <template v-if="emuPage === 'overview'">
            <!-- what needs you, in one place (0.9.3: replaces the pop-ups at start) -->
            <div class="subh">Issues</div>
            <div v-if="!issues" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Checking…</div>
            <div v-else-if="!issues.length" class="status ok" style="align-self: flex-start"><Icon name="mdiCheck" :size="14" />Nothing needs your attention</div>
            <div v-else class="stack">
              <button v-for="(i, n) in issues" :key="n" class="lrow" data-focus @click="fixIssue(i)">
                <Icon :name="ISSUE_ICON[i.kind] || 'mdiAlertCircleOutline'" :size="24" style="color: #ffd978" />
                <div class="l-mid"><b>{{ i.text }}</b><span v-if="i.sub" class="l-sub">{{ i.sub }}</span></div>
                <span class="l-end"><Btn b="A" />{{ { collections: 'See them', health: 'Shortcut health', setup: 'Emulator setup', romm: 'RomM settings', fpsteam: 'Allow', rpcs3cfg: 'Repair' }[i.fix] }}</span>
              </button>
            </div>
            <!-- 0.9.37 (owner: BIOS and firmware put where each emulator reads it, by itself): each console that needs some -->
            <div class="subh">BIOS and Firmware</div>
            <div v-if="!biosSt" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Checking…</div>
            <template v-else>
              <p class="muted small" style="margin: 0">Cartridge puts these in place for every emulator by itself, after installs and downloads. Nothing is ever replaced.</p>
              <div class="stack">
                <div v-for="b in biosSt.list" :key="b.key" class="lrow" data-focus tabindex="0">
                  <Icon :name="b.ok ? 'mdiCheckCircleOutline' : 'mdiChip'" :size="24" :style="{ color: b.ok ? '#7fe0a0' : b.optional ? 'var(--muted)' : '#ffd978' }" />
                  <div class="l-mid"><b>{{ b.console }} · {{ b.label }}</b><span class="l-sub">{{ b.ok ? 'In place: ' + shortHome(b.where) : b.optional ? 'Optional: most emulators run without it' : b.hint || ('Not where its emulators read it' + (b.names?.length ? ` (${b.names.slice(0, 3).join(', ')})` : '')) }}</span></div>
                  <span class="status" :class="b.ok ? 'ok' : b.optional ? '' : 'warn'">{{ b.ok ? 'Ready' : b.optional ? 'Optional' : 'Missing' }}</span>
                </div>
              </div>
              <div class="row wrap">
                <button class="btn primary" data-focus :disabled="!!biosBusy" @click="biosPlace"><Icon :name="biosBusy === 'place' ? 'mdiSync' : 'mdiFolderArrowRightOutline'" :class="{ spin: biosBusy === 'place' }" />{{ biosBusy === 'place' ? 'Putting Them in Place…' : 'Put Everything in Place' }}</button>
                <button class="btn" data-focus :disabled="!!biosBusy" @click="biosGet"><Icon :name="biosBusy === 'get' ? 'mdiSync' : 'mdiDownload'" :class="{ spin: biosBusy === 'get' }" />{{ biosBusy === 'get' ? 'Getting Them from RomM…' : 'Get Them from RomM' }}</button>
              </div>
            </template>
            <div class="stack">
              <button class="lrow" data-focus @click="openModal('installer')"><Icon name="mdiPackageDown" :size="24" /><div class="l-mid"><b>Cartridge Installer</b><span class="l-sub">An Emulation folder on the drive you pick, then the emulators you tick, set up like EmuDeck</span></div><Icon name="mdiChevronRight" :size="22" class="muted" /></button>
              <button class="lrow" data-focus @click="go('emu-setup')"><Icon name="mdiRadar" :size="24" /><div class="l-mid"><b>Emulator setup</b><span class="l-sub">Find emulators wherever they are, pick one per console, check BIOS and access</span></div><Icon name="mdiChevronRight" :size="22" /></button>
              <button class="lrow" data-focus @click="go('steam-health')"><Icon name="mdiStethoscope" :size="24" /><div class="l-mid"><b>Shortcut health</b><span class="l-sub">Steam shortcuts that would fail, and fixes for them</span></div><Icon name="mdiChevronRight" :size="22" /></button>
            </div>
            </template>
            <template v-else-if="emuPage === 'emus'">
              <!-- 0.9.21 (owner): Get Emulators and emulator updates in one list; installed ones show Up to date or their update -->
              <p class="muted small" style="margin-top: -6px">Every console’s emulators. Updates go where the old copy was, so Steam shortcuts keep working.</p>
              <EmuGet updates />
            </template>
            <template v-else-if="emuPage === 'addons'">
              <!-- 0.9.21 (owner): game updates, patches and add-ons in one page; a game opens Game Add-ons with a tab for each -->
              <p class="muted small" style="margin-top: -6px">Mods, texture packs, patches and game updates for the games on this device, from each emulator's own lists, GameBanana and the EmuCoreX catalog. The same as Game Add-ons in a game's More menu.</p>
              <TextField v-model="gaFind" placeholder="Find a game" icon="mdiMagnify" mode="game" fkey="ga-find" />
              <!-- one console at a time (0.9.24, owner: too long to scroll from Nintendo 3DS to PS4): pick it here, or LB/RB -->
              <div v-if="gaAll.length > 1 && !gaFind" class="ga-cons" data-hscroll>
                <button v-for="grp in gaAll" :key="grp.slug" class="ga-con" :class="{ on: gaCon === grp.slug }" data-focus @click="gaCon = grp.slug"><PIcon :p="grp.p" :size="26" /><span>{{ grp.name }}</span><em>{{ grp.games.length }}</em></button>
              </div>
              <section v-for="grp in gaGroups" :key="grp.slug" class="con-sec">
                <div class="con-head"><PIcon :p="grp.p" :size="34" /><b>{{ grp.name }}</b><span class="count">{{ grp.games.length }}</span><span v-if="grp.emu" class="con-emu"><EmuIcon :id="grp.id" :size="22" fallback="mdiPuzzleOutline" />{{ grp.emu }}</span></div>
                <div class="stack">
                  <button v-for="r in grp.games" :key="r.id" class="lrow" data-focus @click="openGameAddons(r)">
                    <img v-if="coverSmall(r.id)" class="up-cover" :src="coverSmall(r.id)" loading="lazy" /><Icon v-else name="mdiPuzzleOutline" :size="24" />
                    <div class="l-mid"><b>{{ r.name }}</b><span class="l-sub">{{ gaSub(r) }}</span></div>
                    <span v-if="ps3Todo(r.id)" class="status warn"><Icon name="mdiUpdate" :size="14" />{{ ps3Todo(r.id) }} update{{ ps3Todo(r.id) === 1 ? '' : 's' }}</span>
                    <span v-else-if="addonsHere[r.id]" class="status ok"><Icon name="mdiCheck" :size="14" />{{ addonsHere[r.id].some((x) => !x.mods) ? 'Texture pack' : 'Mods' }}</span>
                    <Icon name="mdiChevronRight" :size="22" />
                  </button>
                </div>
              </section>
              <p v-if="!gaGroups.length" class="muted">{{ gaFind ? `No game here matches “${gaFind}”.` : 'No games on this device for consoles with add-ons, patches or game updates yet.' }}</p>
              <template v-if="addonsMine.length">
                <div class="subh">Installed by Cartridge</div>
                <div class="stack">
                  <button v-for="a in addonsMine" :key="a.key" class="lrow" data-focus @click="removeAddon(a)">
                    <EmuIcon :id="a.emu" :size="24" fallback="mdiPuzzleOutline" />
                    <div class="l-mid"><b>{{ a.name }}</b><span class="l-sub">{{ a.game }} · {{ a.emuName }} · {{ bytes(a.bytes) }}</span></div>
                    <span class="l-end">Remove</span>
                  </button>
                </div>
              </template>
              <div class="subh">Emulator folders</div>
              <p class="muted small" style="margin-top: -6px">Where each emulator looks for texture packs and mods, read from its own settings. Turn custom textures on here, or in the emulator.</p>
              <div class="stack">
                <button v-for="e in texEmus" :key="e.root" class="lrow" data-focus @click="flipTextures(e)">
                  <EmuIcon :id="e.id" :size="24" fallback="mdiTextureBox" />
                  <div class="l-mid"><b>{{ e.name }}{{ e.flatpak ? ' (Flatpak)' : '' }}</b><span class="l-sub mono">{{ e.textures.replace(store.info.home, '~') }}</span></div>
                  <span v-if="e.mods" class="status">Mods</span><span v-else class="status" :class="e.on ? 'ok' : 'warn'"><Icon v-if="e.on" name="mdiCheck" :size="14" />{{ e.on ? 'Textures on' : 'Textures off' }}</span>
                  <span class="l-end">{{ e.mods ? '' : !e.on ? 'Turn on' : e.mine ? 'Turn off' : '' }}</span>
                </button>
              </div>
            <p v-if="!texEmus.length" class="muted">None of the emulators that take texture packs or mods (PCSX2, DuckStation, Dolphin, PPSSPP, Azahar, Cemu, Eden, Citron, Yuzu, Ryujinx) are set up here yet.</p>
              <!-- 0.9.52: Nexus Mods lists mods without a key; Premium members' key makes their downloads one press. 0.9.56 (owner): here
                   with the mods, not in Look & Feel -->
              <div class="subh">Nexus Mods</div>
              <p class="muted small" style="margin-top: -6px">Mods from Nexus Mods show in a game’s Mods without a key. With a Premium account, your personal API key (nexusmods.com → your profile → API Keys) downloads them in one press. {{ store.config.nexusKey ? (nexusWho ? 'Key saved: ' + nexusWho + '.' : 'Key saved.') : '' }}</p>
              <div class="row" style="align-items: flex-end; gap: 12px">
                <TextField v-model="nexusKey" label="Nexus Mods API key" placeholder="Paste your key" password icon="mdiKeyVariant" style="flex: 1" />
                <button class="btn" data-focus :disabled="nexusBusy" @click="saveNexus"><Icon name="mdiCheck" :size="18" />{{ nexusBusy ? 'Checking…' : 'Save key' }}</button>
              </div>
            </template>
            <LinkedFolders v-else-if="emuPage === 'links'" />
            <template v-else-if="emuPage === 'folders'">
            <div class="row" style="justify-content: space-between">
              <p class="muted small" style="margin: 0; max-width: 520px">Matched inside your ROMs folder using ES-DE folder names. Pick any system to point it somewhere else.</p>
              <div class="seg">
                <button data-focus :class="{ on: !showAll }" @click="showAll = false">On server</button>
                <button data-focus :class="{ on: showAll }" @click="loadAll">All supported</button>
              </div>
            </div>
            <div class="plist">
              <button v-for="p in folderList" :key="p.slug" class="prow" data-focus :data-key="'pf-' + p.slug" @click="editPath(p)">
                <PIcon :p="p" :size="30" />
                <div class="pn">{{ p.display_name || p.name }}<span v-if="p.rom_count && !showAll" class="muted small"> · {{ p.rom_count }}</span></div>
                <div class="mono pp">{{ p.target?.path || 'Not set' }}</div>
                <span class="chip" :class="p.target?.source === 'custom' ? 'primary' : p.target?.exists ? 'green' : ''">{{ p.target?.source === 'custom' ? 'Custom' : p.target?.exists ? 'Found' : p.target?.path ? 'Will create' : 'Not set' }}</span>
              </button>
            </div>
            </template>
          </template>

          <template v-else-if="sec === 'dlup' && dlupPage === 'downloads'">
            <div class="row"><span class="lbl">At once</span><div class="seg"><button v-for="n in [1, 2, 3, 4]" :key="n" data-focus :class="{ on: dls.concurrency === n }" @click="saveConfig({ downloads: { concurrency: n } })">{{ n }}</button></div></div>
            <div class="row"><span class="lbl">Speed limit</span><div class="seg"><button v-for="n in [0, 5, 10, 25, 50]" :key="n" data-focus :class="{ on: (dls.limitMBs || 0) === n }" @click="saveConfig({ downloads: { limitMBs: n } })">{{ n ? n + ' MB/s' : 'Off' }}</button></div></div>
            <Toggle :model-value="dls.esdeM3uFolders" label="ES-DE multi-disc folders" desc="Save multi-disc games as “Game.m3u/” so ES-DE shows one entry" @update:model-value="(v) => saveConfig({ downloads: { esdeM3uFolders: v } })" />
            <Toggle :model-value="dls.flattenSingleFile" label="Flatten single-file folders" desc="If a game is a folder with one file on the server, save just the file" @update:model-value="(v) => saveConfig({ downloads: { flattenSingleFile: v } })" />
          </template>

          <template v-else-if="sec === 'ui'">
            <!-- four short pages (0.9.3 K, G4; Background folded into Theme in 0.9.21): LB/RB move between them; rarely used options under Advanced -->
            <div class="lookpages"><Btn b="LB" /><div class="seg"><button v-for="p in LOOK_PAGES" :key="p.v" data-focus :data-key="'look-' + p.v" :class="{ on: lookPage === p.v }" @click="setLookPage(p.v)">{{ p.l }}</button></div><Btn b="RB" /></div>

            <template v-if="lookPage === 'theme'">
            <div class="subh"><Icon name="mdiBookmarkOutline" :size="20" />Presets</div>
            <div class="presets">
              <button v-for="(p, i) in presets" :key="i" class="preset" data-focus @click="presetMenu(p, i)">
                <span class="preset-sw" :style="presetStyle(p)"><i :style="{ background: themeOf(p.ui).accent[0] }" /></span>
                <b>{{ p.name }}</b>
              </button>
              <button v-if="presets.length < 5" class="preset add" data-focus @click="savePreset"><span class="preset-sw"><Icon name="mdiPlus" :size="22" /></span><b>Save this look</b></button>
            </div>
            <p class="muted small" style="margin-top: -6px">Saves colour, background, fonts, cards, motion and sounds together, up to 5 looks. Interface size and controller settings stay as they are.</p>


            <div class="subh"><Icon name="mdiPaletteOutline" :size="20" />Colour</div>
            <div class="swatches">
              <button v-for="(t, k) in THEMES" :key="k" class="swatch" data-focus :class="{ on: (ui.theme || 'cartridge') === k, ink: t.light }" :style="{ background: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[2]} 60%, ${t.grad[4]})` }" :title="t.label" @click="pickTheme(k)"><i :style="{ background: t.accent[0] }" /><span>{{ t.label }}</span></button>
              <button class="swatch custom" data-focus :class="{ on: ui.theme === 'custom' }" :style="ui.customColor ? { background: `linear-gradient(135deg, ${customT.grad[0]}, ${customT.grad[2]} 60%, ${customT.grad[4]})` } : {}" @click="pickColor"><Icon name="mdiEyedropperVariant" :size="18" /><span>Custom</span></button>
            </div>
            <!-- 0.9.45 (owner): one Style, Plain or Glass, for the page, the cards and the controls together; up here, not in Advanced -->
            <div class="subh"><Icon name="mdiLayersOutline" :size="20" />Style</div>
            <div class="seg style-seg"><button v-for="(v, k) in STYLES" :key="k" data-focus :class="{ on: styleOf(ui) === k }" @click="pickStyle(k)">{{ v.label }}</button></div>
            <p class="muted small" style="margin: 6px 0 0">{{ STYLES[styleOf(ui)].sub }}</p>
            <!-- the background is part of the theme (owner, 0.9.21: one page, not two) -->
            <div class="subh"><Icon name="mdiWallpaper" :size="20" />Background</div>
            <!-- one row: what's on now, and a menu with every background (theme ones, consoles, other) -->
            <button class="bgnow glass" data-focus @click="pickBg">
              <span class="bgnow-ic"><Icon name="mdiWallpaper" :size="22" /></span>
              <span class="bgnow-t"><b>{{ bgNow.l }}</b><small>{{ bgNow.sub }}</small></span>
              <span class="bgnow-c">Change<Icon name="mdiChevronRight" :size="18" /></span>
            </button>
            <div v-if="ui.bgStyle === 'wallpaper'" class="row wrap" style="gap: 12px">
              <button class="btn" data-focus @click="chooseWallpaper"><Icon name="mdiImageSearchOutline" :size="18" />{{ ui.wallpaper ? 'Change image' : 'Choose image' }}</button>
              <div class="seg"><button v-for="d in dims" :key="d.v" data-focus :class="{ on: (ui.wallDim || 'medium') === d.v }" @click="saveConfig({ ui: { wallDim: d.v } })">{{ d.l }}</button></div>
              <button v-if="ui.wallpaper" class="btn" data-focus @click="clearWallpaper"><Icon name="mdiClose" :size="18" />Remove</button>
            </div>
            <button class="lrow adv-tg" data-focus @click="lookAdv = !lookAdv"><Icon name="mdiTuneVariant" :size="22" /><div class="l-mid"><b>Advanced</b></div><Icon :name="lookAdv ? 'mdiChevronUp' : 'mdiChevronDown'" :size="22" /></button>
            <template v-if="lookAdv">
            <div class="finetune">
              <button v-for="f in fineTune" :key="f.k" class="ft" data-focus @click="pickPart(f)">
                <span class="ft-sw" :style="{ background: (ui.colors || {})[f.k] || f.def() }"><Icon v-if="!(ui.colors || {})[f.k]" name="mdiPaletteOutline" :size="14" /></span>
                <span class="ft-t"><b>{{ f.l }}</b><small>{{ (ui.colors || {})[f.k] ? 'Custom' : 'From theme' }}</small></span>
              </button>
              <!-- 0.9.56 (owner): Highlights, Buttons and Progress Bars in pure black in one press -->
              <button class="btn small" data-focus :class="{ on: pureBlack }" @click="setPureBlack"><Icon name="mdiCircle" :size="16" />Pure Black</button>
              <button v-if="Object.values(ui.colors || {}).some(Boolean)" class="btn small" data-focus @click="saveConfig({ ui: { colors: { highlight: '', buttons: '', bars: '', background: '' }, colorsAuto: '' } })"><Icon name="mdiRestore" :size="16" />Use Theme Colours</button>
            </div>
            <div class="row"><span class="lbl">Text</span><div class="seg"><button v-for="(v, k) in TEXTS" :key="k" data-focus :class="{ on: (ui.text || 'normal') === k }" @click="saveConfig({ ui: { text: k } })">{{ v.label }}</button></div></div>

            </template>
            <div class="row"><button class="btn" data-focus @click="resetLook"><Icon name="mdiRestore" />Reset Look &amp; Feel</button></div>
            </template>
            <template v-else-if="lookPage === 'cards'">
            <div class="subh"><Icon name="mdiFormatFont" :size="20" />Text &amp; Size</div>
            <div class="fonts">
              <button v-for="(f, k) in FONTS" :key="k" class="fonttile" data-focus :class="{ on: (ui.font || 'cartridge') === k }" :style="{ fontFamily: f.display }" @click="saveConfig({ ui: { font: k } })"><b>Aa</b><span>{{ f.label }}</span></button>
            </div>
            <div class="row"><span class="lbl">Interface size</span><div class="seg"><button v-for="z in scales" :key="z.v" data-focus :class="{ on: String(ui.scale || 'auto') === z.v }" @click="setScale(z.v)">{{ z.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">{{ scaleNote }}</p>


            <!-- 0.9.28 (owner): "top bar" is no longer always at the top, so it's the Dock -->
            <div class="subh">Dock</div>
            <div class="row"><span class="lbl">Placement</span><div class="seg"><button v-for="m in BAR_POS" :key="m.v" data-focus :class="{ on: (ui.barPos || 'bottom') === m.v }" @click="saveConfig({ ui: { barPos: m.v } })">{{ m.l }}</button></div></div>
            <div class="row"><span class="lbl">Tabs</span><div class="seg"><button v-for="m in BAR_ALIGN" :key="m.v" data-focus :class="{ on: (ui.barAlign || 'center') === m.v }" @click="saveConfig({ ui: { barAlign: m.v } })">{{ m.l }}</button></div></div>
            <div class="row"><span class="lbl">Style</span><div class="seg"><button v-for="m in BAR_STYLE" :key="m.v" data-focus :class="{ on: (ui.barStyle || 'pill') === m.v }" @click="saveConfig({ ui: { barStyle: m.v } })">{{ m.l }}</button></div></div>
            <div v-if="(ui.barStyle || 'pill') === 'pill' && styleOf(ui) === 'plain'" class="row"><span class="lbl">Colour</span><div class="seg"><button v-for="m in DOCK_COLOR" :key="m.v" data-focus :class="{ on: dockOf(ui) === m.v }" @click="saveConfig({ ui: { dockColor: m.v } })">{{ m.l }}</button></div></div>
            <Toggle :model-value="ui.hints === true" label="Button hints" desc="A strip along the bottom with what each button does on this page (A Open, Y Search…)" @update:model-value="(v) => saveConfig({ ui: { hints: v } })" />
            <div class="subh"><Icon name="mdiViewGridOutline" :size="20" />Games &amp; Cards</div>
            <div class="row"><span class="lbl">Box art size</span><div class="seg"><button v-for="(v, k) in CARD_SIZES" :key="k" data-focus :class="{ on: (ui.gridSize || 'md') === k }" @click="saveConfig({ ui: { gridSize: k } })">{{ v.label }}</button></div></div>
            <Toggle :model-value="ui.cardTitles !== false" label="Game names under box art" desc="Turn off for a clean wall of covers" @update:model-value="(v) => saveConfig({ ui: { cardTitles: v } })" />
            <Toggle :model-value="ui.mediaBar !== false" label="Media bar" desc="Show artwork of the highlighted game at the top of Home" @update:model-value="(v) => saveConfig({ ui: { mediaBar: v } })" />
            <div v-if="ui.mediaBar !== false" class="row"><span class="lbl">Media bar size</span><div class="seg"><button v-for="m in mediaSizes" :key="m.v" data-focus :class="{ on: ((ui.mediaSize === 'spacious' ? 'large' : ui.mediaSize) || 'large') === m.v }" @click="saveConfig({ ui: { mediaSize: m.v } })">{{ m.l }}</button></div></div>
            <button class="lrow adv-tg" data-focus @click="lookAdv = !lookAdv"><Icon name="mdiTuneVariant" :size="22" /><div class="l-mid"><b>Advanced</b></div><Icon :name="lookAdv ? 'mdiChevronUp' : 'mdiChevronDown'" :size="22" /></button>
            <template v-if="lookAdv">
            <div class="row"><span class="lbl">Card corners</span><div class="seg"><button v-for="(v, k) in CARD_SHAPES" :key="k" data-focus :class="{ on: (ui.cardShape || 'rounded') === k }" @click="saveConfig({ ui: { cardShape: k } })">{{ v.label }}</button></div></div>
            <div class="row"><span class="lbl">Spacing</span><div class="seg"><button v-for="(v, k) in DENSITIES" :key="k" data-focus :class="{ on: (ui.density || 'normal') === k }" @click="saveConfig({ ui: { density: k } })">{{ v.label }}</button></div></div>
            <Toggle :model-value="ui.hideEmpty" label="Hide empty systems" @update:model-value="(v) => saveConfig({ ui: { hideEmpty: v } })" />

            </template>
            </template>
            <!-- Metadata (0.9.24, owner: its own tab): SteamGridDB, and fetching art ahead of time -->
            <template v-else-if="lookPage === 'meta'">
              <div class="subh">SteamGridDB</div>
              <p class="muted small" style="margin-top: -6px">Logos come from your RomM server when it has them (ScreenScraper "logo" media). For everything else, add a free key from steamgriddb.com → Preferences → API. {{ store.config.sgdbKey ? 'Key saved.' : '' }}</p>
              <div class="row" style="align-items: flex-end; gap: 12px">
                <TextField v-model="sgdbKey" label="SteamGridDB API key" placeholder="Paste your key" password icon="mdiKeyVariant" style="flex: 1" />
                <button class="btn" data-focus :disabled="sgdbBusy" @click="saveSgdb"><Icon name="mdiCheck" :size="18" />{{ sgdbBusy ? 'Checking…' : 'Save key' }}</button>
              </div>
              <div class="subh">Fetch Ahead of Time</div>
              <p class="muted small" style="margin-top: -6px">Gets art now, instead of as you browse, so pages open with everything in place.</p>
              <div v-if="logoJob" class="row" style="gap: 12px; align-items: center">
                <div class="logo-prog"><div class="bar live"><i :style="{ width: (logoJob.total ? (logoJob.done / logoJob.total) * 100 : 0) + '%' }" /></div><span class="muted small">{{ logoJob.done }} / {{ logoJob.total }} games · {{ logoJob.found }} logos</span></div>
                <button class="btn" data-focus @click="call('logo:stopAll')"><Icon name="mdiStop" :size="18" />Stop</button>
              </div>
              <template v-else>
                <button class="lrow" data-focus @click="fetchAll()"><Icon name="mdiDownloadMultiple" :size="22" /><span class="l-mid"><b>Fetch All Metadata</b><span class="l-sub">Logos, backgrounds, covers and screenshots for every game</span></span></button>
                <button class="lrow" data-focus @click="fetchAll(['logos'])"><Icon name="mdiAlphaLBoxOutline" :size="22" /><span class="l-mid"><b>Fetch Logos</b><span class="l-sub">Each game’s logo, from RomM or SteamGridDB</span></span></button>
                <button class="lrow" data-focus :disabled="!store.config.sgdbKey" @click="fetchAll(['heroes'])"><Icon name="mdiPanorama" :size="22" /><span class="l-mid"><b>Fetch Backgrounds</b><span class="l-sub">SteamGridDB’s heroes, the sharpest that fit your screen{{ store.config.sgdbKey ? '' : ' (needs a key)' }}</span></span></button>
                <button class="lrow" data-focus @click="fetchAll(['covers'])"><Icon name="mdiImageMultipleOutline" :size="22" /><span class="l-mid"><b>Fetch Covers and Screenshots</b><span class="l-sub">From your RomM server, kept on this device</span></span></button>
              </template>
              <div class="subh">On Screen</div>
              <Toggle :model-value="ui.logos !== false" label="Game logos" desc="Show the game's logo instead of its name on Home and game pages" @update:model-value="(v) => saveConfig({ ui: { logos: v } })" />
              <p class="muted small">Steam’s own artwork for your games is in Settings → Steam → Refresh artwork.</p>
            </template>
            <template v-else-if="lookPage === 'motion'">
            <div class="subh"><Icon name="mdiAnimationPlayOutline" :size="20" />Motion &amp; Sound</div>
            <div class="row"><span class="lbl">Idle screen</span><div class="seg"><button v-for="m in idles" :key="m.v" data-focus :class="{ on: (ui.idle ?? '5') === m.v }" @click="saveConfig({ ui: { idle: m.v } })">{{ m.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">After this long without input, your games' artwork drifts by with the clock. Any button wakes it.</p>
            <div class="row"><span class="lbl">Animations</span><div class="seg"><button v-for="m in motions" :key="m.v" data-focus :class="{ on: (ui.motion || 'normal') === m.v }" @click="saveConfig({ ui: { motion: m.v } })">{{ m.l }}</button></div></div>
            <Toggle :model-value="ui.sounds !== false" label="UI sounds" desc="Soft clicks when you move and select" @update:model-value="setSounds" />
            <template v-if="ui.sounds !== false">
              <div class="row"><span class="lbl">Sound style</span><div class="seg"><button v-for="p in SOUND_PACKS" :key="p.v" data-focus :class="{ on: (ui.soundPack || 'soft') === p.v }" @click="setPack(p.v)">{{ p.l }}</button></div></div>
              <div class="row"><span class="lbl">Volume</span><div class="seg"><button v-for="v in volumes" :key="v.v" data-focus :class="{ on: (ui.volume || 'medium') === v.v }" @click="setVolume(v.v)">{{ v.l }}</button></div></div>
            </template>
            <div class="row"><span class="lbl">Rumble</span><div class="seg"><button v-for="v in rumbles" :key="v.v" data-focus :class="{ on: (ui.rumble || 'none') === v.v }" @click="setRumbleLevel(v.v)">{{ v.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">A light buzz on the controller when you move and select. In Game Mode, Steam's own controller rumble must be on.</p>

            <button class="lrow adv-tg" data-focus @click="lookAdv = !lookAdv"><Icon name="mdiTuneVariant" :size="22" /><div class="l-mid"><b>Advanced</b></div><Icon :name="lookAdv ? 'mdiChevronUp' : 'mdiChevronDown'" :size="22" /></button>
            <template v-if="lookAdv">
            <div class="row"><span class="lbl">Effects</span><div class="seg"><button v-for="m in effectsOpts" :key="m.v" data-focus :class="{ on: (ui.effects || 'auto') === m.v }" @click="saveConfig({ ui: { effects: m.v } })">{{ m.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Reduced stops movement; Light draws the background more simply. {{ store.info.gpu === false ? 'The GPU is off right now, so Auto uses Light.' : '' }}</p>
            </template>
            </template>
          </template>

          <template v-else-if="sec === 'dlup' && dlupPage === 'updates'">
            <div class="about glass">
              <Logo :size="64" />
              <div style="display: flex; flex-direction: column; gap: 6px; flex: 1">
                <div style="font-family: var(--display); font-size: 22px; font-weight: 700">Cartridge {{ store.info.version }}</div>
                <div class="muted small">{{ updText }}</div>
                <div v-if="store.update.state === 'downloading'" class="bar live" style="max-width: 360px"><i :style="{ width: (store.update.percent || 0) + '%' }" /></div>
              </div>
            </div>
            <div class="row wrap">
              <button v-if="store.update.state === 'ready'" class="btn primary" data-focus @click="call('update:install')"><Icon name="mdiRestart" />Restart and update to {{ store.update.version }}</button>
              <button class="btn" :class="{ primary: store.update.state !== 'ready' }" data-focus :disabled="['checking', 'downloading'].includes(store.update.state)" @click="checkUpdates"><Icon name="mdiCloudDownloadOutline" />Check for updates</button>
            </div>
            <p class="muted small">New versions come from the GitHub Releases page. They download in the background and replace this AppImage in place, so your Steam shortcut and settings stay as they are.</p>
            <button class="lrow" data-focus @click="openModal('whatsnew')"><Icon name="mdiNewspaperVariantOutline" :size="22" /><span class="l-mid"><b>What’s New</b><span class="l-sub">Every version’s changes, newest first</span></span><span class="l-end"><Icon name="mdiChevronRight" :size="20" /></span></button>
            <ChangelogCard />
            <div class="subh">Roll back</div>
            <p class="muted small" style="margin-top: -6px">Go back to an earlier version if this one gives you trouble. Your settings stay. Automatic updates pause until you press Check for updates.</p>
            <div class="row"><button class="btn" data-focus :disabled="rollBusy" @click="rollBack"><Icon name="mdiHistory" :class="{ spin: rollBusy }" />{{ rollBusy ? 'Working…' : 'Choose an earlier version' }}</button></div>
          </template>

          <template v-else-if="sec === 'ra'">
            <div class="row"><span class="lbl">On Home</span><div class="seg"><button v-for="m in homeAchOpts" :key="m.v" data-focus :class="{ on: homeAch === m.v }" @click="saveConfig({ ui: { homeAch: m.v } })">{{ m.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">A row of your newest achievements and trophies on Home, newest first.</p>
            <div class="subh"><img src="../assets/ra-logo.png" class="ra-mk" />RetroAchievements</div>
            <template v-if="!store.config.ra?.user">
              <p class="muted">Sign in to RetroAchievements to see your unlocks in the Achievements tab and on every game that supports them.</p>
              <div class="row" style="gap: 16px; align-items: flex-end">
                <TextField v-model="raUser" label="Username" placeholder="Your RetroAchievements username" icon="mdiAccount" style="flex: 1" />
                <TextField v-model="raKey" label="Web API key" placeholder="Paste your web API key" password icon="mdiKeyVariant" style="flex: 1" />
              </div>
              <p class="muted small">Find the web API key on retroachievements.org → Settings → Authentication. It only lets Cartridge read your profile. Your password is never needed.</p>
              <div class="row"><button class="btn primary" data-focus :disabled="raBusy || !raUser || !raKey" @click="raSignIn"><Icon name="mdiLogin" />{{ raBusy ? 'Checking…' : 'Sign in' }}</button></div>
            </template>
            <template v-else>
              <div class="about glass" style="align-items: center">
                <div style="display: flex; flex-direction: column; gap: 6px; flex: 1">
                  <div class="eyebrow">Signed in to RetroAchievements</div>
                  <div style="font-family: var(--display); font-size: 22px; font-weight: 700">{{ store.config.ra.user }}</div>
                </div>
                <button class="btn" data-focus @click="tab('achievements')"><Icon name="mdiTrophyOutline" />Open Achievements</button>
                <button class="btn" data-focus @click="raSignOut"><Icon name="mdiLogout" />Sign out</button>
              </div>
              <!-- 0.9.21 (owner: it kept saying "Sign in" after signing in): says who's signed in, opens a list -->
              <button class="lrow" data-focus :disabled="raBusy" @click="raEmus">
                <Icon name="mdiGamepadVariantOutline" :size="24" />
                <div class="l-mid"><b>Sign In to Emulators</b><span class="l-sub">PCSX2, DuckStation, Dolphin, PPSSPP, RetroArch and the rest, with your account. Your password goes to RetroAchievements once and is never saved.</span></div>
                <span v-if="raTargets === null" class="status none">Checking</span>
                <span v-else-if="!raTargets.length" class="status none">None set up</span>
                <span v-else-if="raSignedCount === raTargets.length" class="status ok"><Icon name="mdiCheck" :size="14" />All signed in</span>
                <span v-else class="status warn">{{ raSignedCount }} of {{ raTargets.length }} signed in</span>
                <Icon name="mdiChevronRight" :size="22" />
              </button>
              <Toggle :model-value="ui.raOnGames !== false" label="Achievements on game pages" desc="Show progress and badges on games that have RetroAchievements (PS3, PS4, Switch and other unsupported consoles never show them)" @update:model-value="(v) => saveConfig({ ui: { raOnGames: v } })" />
            </template>

            <div class="subh" style="margin-top: 14px"><Grade g="P" :size="22" />Trophies &amp; Gamerscore</div>
            <p class="muted small" style="margin-top: -8px">Trophies your emulators keep on this device. Cartridge only reads them.</p>
            <div class="srcs">
              <div v-for="s in trophySrc" :key="s.id" class="src glass">
                <div class="src-top">
                  <div><b>{{ s.name }}</b> <span class="muted small">{{ s.platform }}</span></div>
                  <span class="chip" :class="[s.state, s.note]">{{ { found: 'Found', missing: 'Not found', off: 'Off' }[s.state] }}<template v-if="s.state === 'found'"> · {{ s.note === 'nokey' ? 'no trophy key' : s.note === 'empty' ? 'no trophies yet' : s.games + (s.games === 1 ? ' game' : ' games') }}</template></span>
                  <div class="spacer" />
                  <button class="btn small" data-focus @click="chooseSrc(s)"><Icon name="mdiFolderOpen" :size="18" />Choose folder</button>
                  <Toggle :model-value="s.enabled" compact @update:model-value="(v) => toggleSrc(s, v)" />
                </div>
                <p v-if="s.note === 'nokey'" class="muted small src-note">shadPS4 has no trophy key set, so it can't record trophies yet. Add the key in shadPS4's settings, then play a game: trophies show up here by themselves.</p>
                <div v-for="f in s.found" :key="f.dir" class="src-path">
                  <span class="how">{{ { config: 'From settings', known: 'Known place', scan: 'Found by scan', chosen: 'Chosen by you' }[f.how] || f.how }}</span>
                  <span class="mono">{{ (f.watch && f.watch.length && s.id === 'shadps4') ? f.watch.join('  ·  ') : f.dir }}</span>
                  <button v-if="f.how === 'chosen' || f.how === 'scan'" class="btn small ghost" data-focus @click="removeDir(s, f.dir)"><Icon name="mdiClose" :size="16" /></button>
                </div>
              </div>
            </div>
            <div class="row wrap">
              <button class="btn" data-focus :disabled="!!store.trophyScan" @click="scanTrophies"><Icon name="mdiRadar" />{{ store.trophyScan ? `Scanning… ${store.trophyScan.visited || ''}` : 'Scan again' }}</button>
              <button class="btn" data-focus @click="openOthers"><Icon name="mdiTrophyOutline" />Open Achievements</button>
            </div>
            <Toggle :model-value="tcfg.sync !== false" label="Sync across devices" desc="Keeps trophies from every device together, stored as private notes on your RomM games. Uses your RomM login, no extra account. Only adds unlocks, never removes them." @update:model-value="(v) => setT({ sync: v })" />
            <p v-if="tcfg.sync !== false" class="muted small" style="margin-top: -6px">{{ syncLine }}</p>
            <p v-if="tcfg.sync !== false" class="muted small" style="margin-top: -6px">This device's name is in Settings → About.</p>
            <Toggle v-if="tcfg.sync !== false" :model-value="tcfg.syncIcons !== false" label="Sync trophy pictures" desc="Stores small copies of trophy pictures in RomM too (about 150 to 300 KB per game), so every device shows them, not just the one that played" @update:model-value="(v) => setT({ syncIcons: v })" />
            <Toggle :model-value="tcfg.popups !== false" label="Trophy pop-ups" desc="Shows a pop-up when a trophy unlocks while Cartridge is open" @update:model-value="(v) => setT({ popups: v })" />
            <Toggle :model-value="ui.trophyOnGames !== false" label="Trophies on game pages" desc="PS3, PS4, Xbox 360 and PS Vita games show their trophies" @update:model-value="(v) => saveConfig({ ui: { trophyOnGames: v } })" />
            <template v-if="hiddenGames.length">
              <div class="subh" style="margin-top: 14px"><Icon name="mdiEyeOffOutline" :size="20" />Hidden Games</div>
              <p class="muted small" style="margin-top: -8px">Left out of your totals and latest unlocks. Unhide one to count it again.</p>
              <div class="stack">
                <button v-for="h in hiddenGames" :key="h.key" class="lrow" data-focus @click="unhideGame(h)">
                  <Icon name="mdiTrophyOutline" :size="22" />
                  <div class="l-mid"><b>{{ h.title }}</b><span class="l-sub">{{ h.sub }}</span></div>
                  <span class="l-end"><Btn b="A" />Unhide</span>
                </button>
              </div>
            </template>
          </template>

          <template v-else-if="sec === 'steam'">
            <!-- not in Steam yet: adding Cartridge comes first; once added it moves to the bottom (0.9.3 L) -->
            <div v-if="selfAdded === false && steamReady" class="about glass">
              <img src="../../steam-art/grid.png" class="steam-grid" />
              <div style="display: flex; flex-direction: column; gap: 10px">
                <div style="font-family: var(--display); font-size: 22px; font-weight: 700">Add Cartridge to Game Mode</div>
                <div class="muted small">Creates a Steam shortcut for this AppImage with the Cartridge cover, banner, logo and icon, so it sits in your library like any other game. Steam closes and reopens to pick it up, so do this from Desktop Mode.</div>
                <div class="row wrap">
                  <button class="btn primary" data-focus @click="addToSteam"><Icon name="mdiSteam" />Add to Steam</button>
                </div>
              </div>
            </div>
            <SteamSettings ref="steamRef" @ready="steamReady = true" />
            <template v-if="selfAdded && steamReady">
            <div class="subh" style="margin-top: 10px">Cartridge</div>
            <div class="about glass">
              <img src="../../steam-art/grid.png" class="steam-grid" />
              <div style="display: flex; flex-direction: column; gap: 10px">
                <div style="font-family: var(--display); font-size: 22px; font-weight: 700">Cartridge is in Steam</div>
                <span class="status ok" style="align-self: flex-start"><Icon name="mdiCheck" :size="14" />Added to Steam</span>
                <div class="row wrap">
                  <button class="btn" data-focus @click="addToSteam"><Icon name="mdiSteam" />Add Again</button>
                  <button class="btn" data-focus @click="applyArt"><Icon name="mdiImageFrame" />Refresh Artwork Only</button>
                </div>
              </div>
            </div>
            <p class="muted small">Moved the AppImage? Press Add Again so Steam starts it from where it is now.</p>
            </template>
          </template>

          <template v-else-if="sec === 'controls'">
            <div class="subh"><Icon name="mdiGamepadVariantOutline" :size="20" />Controls &amp; Display</div>
            <div class="row"><span class="lbl">Touch &amp; mouse</span><div class="seg"><button v-for="p in pointers" :key="p.v" data-focus :class="{ on: (ui.pointer || 'auto') === p.v }" @click="setPointer(p.v)">{{ p.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Auto hides the cursor when you tap the screen and shows it when a mouse moves. Touch never shows a cursor.</p>
            <div class="row"><span class="lbl">Touch scrolling</span><div class="seg"><button v-for="t in TOUCH_SCROLL" :key="t.v" data-focus :class="{ on: (ui.touchScroll || 'own') === t.v }" @click="saveConfig({ ui: { touchScroll: t.v } })">{{ t.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Swipe in from the left edge to go back. Use the browser's only if Cartridge's feels wrong on your device.</p>
            <div class="row"><span class="lbl">Button icons</span><div class="seg"><button v-for="k in buttonOpts" :key="k.v" data-focus :class="{ on: (ui.buttons || 'auto') === k.v }" @click="saveConfig({ ui: { buttons: k.v } })">{{ k.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Auto draws the buttons of the controller you're holding{{ padInfo?.name ? ` (right now: ${padInfo.name})` : '' }}, even when Steam presents it as an Xbox pad. <span class="btn-demo"><Btn b="A" /><Btn b="B" /><Btn b="X" /><Btn b="Y" /><Btn b="LB" /><Btn b="RT" /><Btn b="START" /><Btn b="SELECT" /></span></p>
            <div class="row"><span class="lbl">On-screen keyboard</span><div class="seg"><button v-for="k in keyboards" :key="k.v" data-focus :class="{ on: (ui.keyboard || 'auto') === k.v }" @click="saveConfig({ ui: { keyboard: k.v } })">{{ k.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Auto uses the built-in keyboard in Game Mode and your real keyboard on the desktop. Steam leaves typing to the Steam keyboard (Steam + X).</p>

            <div class="subh"><Icon name="mdiDockTop" :size="20" />Top Bar</div>
            <div class="row"><span class="lbl">Open on</span><div class="seg"><button v-for="t in tabsOn.filter((n) => n !== 'settings')" :key="t" data-focus :class="{ on: (ui.openOn || 'start') === t }" @click="saveConfig({ ui: { openOn: t } })">{{ TAB_DEFS[t].label }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">The menu Cartridge shows when it starts.</p>
            <p class="muted small" style="margin-top: -6px">Pick which tabs show at the top and their order. LT and RT move through them in this order. Settings always stays.</p>
            <div class="tabs-edit">
              <div v-for="(t, i) in tabRows" :key="t.name" class="tab-row" :class="{ off: !t.on }">
                <Icon :name="t.icon" :size="20" /><span class="tab-lbl">{{ t.label }}</span>
                <button class="btn small" data-focus :disabled="!t.on || i === 0" :aria-label="'Move ' + t.label + ' up'" @click="moveTab(t.name, -1)"><Icon name="mdiChevronUp" :size="18" /></button>
                <button class="btn small" data-focus :disabled="!t.on || i >= tabsOn.length - 1" :aria-label="'Move ' + t.label + ' down'" @click="moveTab(t.name, 1)"><Icon name="mdiChevronDown" :size="18" /></button>
                <button class="btn small tab-tg" data-focus :class="{ primary: t.on }" :disabled="t.name === 'settings'" @click="toggleTab(t.name)">{{ t.on ? 'Shown' : 'Hidden' }}</button>
              </div>
            </div>
            <button class="btn small" data-focus style="align-self: flex-start" @click="saveConfig({ ui: { tabs: null } })"><Icon name="mdiRestore" :size="18" />Default tabs</button>

            <button class="lrow adv-tg" data-focus @click="lookAdv = !lookAdv"><Icon name="mdiTuneVariant" :size="22" /><div class="l-mid"><b>Advanced</b></div><Icon :name="lookAdv ? 'mdiChevronUp' : 'mdiChevronDown'" :size="22" /></button>
            <template v-if="lookAdv">
            <!-- 0.9.41 (owner): no Rendering choice any more, Cartridge always uses the GPU -->
            <div class="row"><button class="btn" data-focus @click="call('app:fullscreen')"><Icon name="mdiFullscreen" />Toggle fullscreen</button><button class="btn" data-focus @click="clearCache"><Icon name="mdiImageRemove" />Clear image cache</button></div>
            </template>
            <ControllerTest />
          </template>

          <template v-else>
            <div class="about glass">
              <Logo :size="64" />
              <div><div style="font-family: var(--display); font-size: 26px; font-weight: 700">Cartridge</div><div class="muted">Version {{ store.info.version }} · a RomM client for the couch</div></div>
            </div>
            <!-- the name other devices see: on trophies and on games played here (Recently played) -->
            <div class="card-s glass">
              <div class="row" style="align-items: flex-end; gap: 12px">
                <TextField v-model="deviceName" label="This device's name" :placeholder="store.info.hostname || 'Steam Deck'" icon="mdiDevices" style="flex: 1" />
                <button class="btn" data-focus @click="saveDevice"><Icon name="mdiCheck" :size="18" />Save name</button>
              </div>
              <p class="muted small" style="margin: 0">Shown on your other devices next to games you played here and trophies you unlocked here, for example "Steam Deck" or "Living Room PC".</p>
            </div>
            <div class="row"><button class="btn" data-focus @click="store.welcoming = true"><Icon name="mdiHandWave" />Run the Welcome Again</button><span class="muted small">Starts from your current settings. Nothing is reset.</span></div>
            <div class="row"><button class="btn" data-focus @click="openTour({ start: activeTabs().includes('start') })"><Icon name="mdiGestureTapButton" />Take the Tour</button><span class="muted small">Try each control yourself, a step at a time.</span></div>
            <ServerStatus />
            <Toggle :model-value="ui.perfOverlay === true" label="Performance Overlay" desc="Frame rate, slowest frame, CPU and memory in a corner of the screen, to see how Cartridge runs on this device" @update:model-value="(v) => saveConfig({ ui: { perfOverlay: v } })" />
            <ReportProblem />
            <div class="card-s glass">
              <div class="kv"><span>Game Mode</span><span>{{ store.info.gamescope ? 'Yes (gamescope)' : 'No (desktop)' }}</span></div>
              <div class="kv"><span>Controller</span><span>{{ padInfo?.name || input.padName || 'Press any button' }}</span></div>
              <div class="kv"><span>Data</span><span class="mono">{{ store.info.userData }}</span></div>
            </div>
            <button class="lrow" data-focus @click="openModal('licenses')"><Icon name="mdiScaleBalance" :size="22" /><span class="l-mid"><b>Licences and Acknowledgements</b><span class="l-sub">The open source projects, emulators and services Cartridge is built on, and their licences</span></span><span class="l-end"><Icon name="mdiChevronRight" :size="20" /></span></button>
            <div class="row"><button class="btn danger" data-focus @click="call('app:quit')"><Icon name="mdiPower" />Quit Cartridge</button></div>
          </template>
        </div>
      </Transition>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { store, call, go, tab, saveConfig, pickFolder, choose, confirm, toast, openModal, bytes, ago, resync, scanServer, allRoms, romById, cover, resetLogos, askText, activeTabs, TAB_DEFS, consoleName, openTour } from '../store.js';
import { useView } from '../useView.js';
import { input, focusFirst, setPointerPref, setRumble, rumble, stopScroll } from '../nav.js';
import { THEMES, STYLES, styleOf, dockOf, TEXTS, FONTS, CARD_SHAPES, CARD_SIZES, DENSITIES, themeFrom, themeOf, paletteOf, autoColors } from '../themes.js';
import { BACKGROUNDS, RENDERERS, LEGACY_ART, bgPreview } from '../bgRenderers.js';
import { setSoundEnabled, setSoundStyle, previewSound, SOUND_PACKS } from '../sfx.js';
import Icon from '../components/Icon.vue';
import Logo from '../components/Logo.vue';
import Toggle from '../components/Toggle.vue';
import TextField from '../components/TextField.vue';
import PIcon from '../components/PIcon.vue';
import Grade from '../components/Grade.vue';
import Btn from '../components/Btn.vue';
import SteamSettings from '../components/SteamSettings.vue';
import StorageManager from '../components/StorageManager.vue';
import LibraryCheck from '../components/LibraryCheck.vue';
import SyncCard from '../components/SyncCard.vue';
import SaveSyncCard from '../components/SaveSyncCard.vue';
import SyncthingLogo from '../components/SyncthingLogo.vue';
import RommUpload from '../components/RommUpload.vue';
import EmuIcon from '../components/EmuIcon.vue';
import EmuGet from '../components/EmuGet.vue';
import LinkedFolders from '../components/LinkedFolders.vue';
import ChangelogCard from '../components/ChangelogCard.vue';
import ServerStatus from '../components/ServerStatus.vue';
import ControllerTest from '../components/ControllerTest.vue';
import ReportProblem from '../components/ReportProblem.vue';
import { padInfo } from '../pad.js';

const el = ref(null);
const paneEl = ref(null), syncRef = ref(null), steamRef = ref(null);
// 0.9.49 Settings refresh (owner: "cluttered, difficult to figure out what's what; do what you think is best"): fewer
// sections, each about one thing, with pages (LB/RB) where a section holds more than one screen. Old names still open
// the right place (other screens ask for 'storage', 'romm', 'dl'...).
const OLD_SEC = { folders: ['emu'], conn: ['library', 'server'], sync: ['library', 'server'], romm: ['library', 'server'], storage: ['library', 'folders'], dl: ['dlup', 'downloads'], updates: ['dlup', 'updates'] };
const startSec = OLD_SEC[store.settingsSection] || [store.settingsSection || 'library'];
const sec = ref(startSec[0]);
const sections = [
  { id: 'library', label: 'Library', icon: 'mdiBookshelf', lead: 'Your RomM server, your games folders and the space they use.' },
  { id: 'emu', label: 'Emulators', icon: 'mdiGamepadVariantOutline', lead: 'Get, update and set up emulators, and add-ons for your games.' },
  { id: 'steam', label: 'Steam', icon: 'mdiSteam', lead: 'Your games in Steam, with their artwork and collections.' },
  { id: 'ra', label: 'Achievements', icon: 'mdiTrophyOutline', lead: 'RetroAchievements and the trophies your emulators keep.' },
  { id: 'syncthing', label: 'Saves and Sync', icon: 'mdiSync', lead: 'Keep saves and more in step between your devices.' },
  { id: 'ui', label: 'Look & Feel', icon: 'mdiPaletteOutline', lead: 'Colour, style, background, text and motion.' },
  { id: 'controls', label: 'Controls', icon: 'mdiGamepadVariant', lead: 'Controller, touch, keyboard and the Dock.' },
  { id: 'dlup', label: 'Downloads and Updates', icon: 'mdiTrayArrowDown', lead: 'How games download, and Cartridge’s own updates.' },
  { id: 'about', label: 'Help and About', icon: 'mdiInformationOutline', lead: 'The tour, the welcome, reporting a problem, and this device.' },
];
const lead = computed(() => sections.find((x) => x.id === sec.value)?.lead || '');
// pages in Library and Downloads and Updates
const LIB_PAGES = [{ v: 'folders', l: 'Games and Storage' }, { v: 'server', l: 'RomM Server' }]; // 0.9.60 (owner): games first
const DLUP_PAGES = [{ v: 'downloads', l: 'Downloads' }, { v: 'updates', l: 'Cartridge Updates' }];
// Saves and Sync (0.9.51): Cartridge Save Sync, Syncthing, and Advanced (which one this device uses)
// Saves and Sync (0.9.58, owner): two tabs; Syncthing's parts are cards that open in place (stView), B goes back to them
const SYNC_PAGES = [{ v: 'saves', l: 'Cartridge Save Sync' }, { v: 'syncthing', l: 'Syncthing' }];
const stView = ref('');
const ST_CARDS = computed(() => [
  { v: 'games', l: 'Games', icon: 'mdiGamepadVariantOutline', sub: 'Which games’ saves, textures and more Syncthing keeps in step' },
  ...(store.config.syncthing?.role === 'main' ? [{ v: 'here', l: 'This Device · Main Server', icon: 'mdiServerOutline', sub: 'This device keeps everyone’s saves: its folders and devices' }]
    : [{ v: 'here', l: 'This Device', icon: 'mdiLaptop', sub: 'Syncthing on this device: running, folders, devices' }, { v: 'server', l: 'Main Server', icon: 'mdiServerOutline', sub: 'The device that keeps everyone’s saves' }]),
]);
function openSt(v) { stView.value = v; nextTick(() => focusFirst(paneEl.value, '[data-key="st-back"]')); }
function closeSt() { const v = stView.value; stView.value = ''; nextTick(() => focusFirst(paneEl.value, `[data-key="sth-${v}"]`)); }
function toChoice() { nextTick(() => { const a = paneEl.value?.querySelector('[data-key="ss-choice"]'); a?.scrollIntoView({ block: 'start' }); focusFirst(a?.parentElement || paneEl.value, '.ss-choice-anchor ~ .stack .lrow'); }); }
const ssLocked = computed(() => !!store.config.syncthing?.role);
const ssMode = computed(() => (store.config.syncthing?.role ? 'syncthing' : store.config.saveSync === 'cartridge' ? 'cartridge' : store.config.saveSync === 'syncthing' ? 'syncthing' : null));
const syncPage = ref(ssMode.value === 'syncthing' ? 'syncthing' : 'saves');
async function setSaveSync(v) {
  if (v === 'cartridge' && ssLocked.value) { toast('Stop using Syncthing for saves first: a device uses one or the other.', 'info', 4500, 'mdiLockOutline'); return; }
  if (v === 'syncthing' && store.config.saveSync === 'cartridge' && !(await confirm('Use Syncthing for Saves?', 'Cartridge Save Sync turns off on this device. Your saves in RomM stay there.', 'Use Syncthing'))) return;
  try {
    if (v === 'cartridge') await call('savesync:set', { on: true });
    else { await call('savesync:set', { on: false }); await saveConfig({ saveSync: v }); }
    store.config = await call('config:get');
    if (v === 'syncthing') { syncPage.value = 'syncthing'; stView.value = ''; } else if (v === 'cartridge') syncPage.value = 'saves';
  } catch (e) { toast(e.message, 'error', 6000); }
}
async function leaveSyncthing() {
  if (!(await confirm('Stop Using Syncthing for Saves?', 'Cartridge stops managing Syncthing for saves on this device. Syncthing and its folders are left as they are.', 'Stop'))) return;
  await call('savesync:leaveSyncthing'); store.config = await call('config:get');
  toast('Syncthing no longer syncs saves here. You can turn on Cartridge Save Sync now.', 'ok', 4000, 'mdiLinkOff');
}
const libPage = ref(startSec[0] === 'library' && startSec[1] ? startSec[1] : 'folders');
const dlupPage = ref(startSec[0] === 'dlup' && startSec[1] ? startSec[1] : 'downloads');
// Settings search (0.9.49, owner's Settings refresh): Y lists every setting by name; picking one opens its section and
// page and puts the highlight on it. [what, where it is, section, page]
const SEARCH = [
  ['RomM server address', 'Library · RomM Server', 'library', 'server'], ['Sign out of RomM', 'Library · RomM Server', 'library', 'server'],
  ['Resync library', 'Library · RomM Server', 'library', 'server'], ['Scan server for new ROMs', 'Library · RomM Server', 'library', 'server'],
  ['Auto resync', 'Library · RomM Server', 'library', 'server'], ['RomM on this device', 'Library · RomM Server', 'library', 'server'], ['Upload games to RomM', 'Library · RomM Server', 'library', 'server'],
  ['Games folders and drives', 'Library · Games and Storage', 'library', 'folders'], ['Add a drive', 'Library · Games and Storage', 'library', 'folders'],
  ['New games go to', 'Library · Games and Storage', 'library', 'folders'], ['Always ask where downloads go', 'Library · Games and Storage', 'library', 'folders'],
  ['BIOS folder', 'Library · Games and Storage', 'library', 'folders'], ['Free up space, storage manager', 'Library · Games and Storage', 'library', 'folders'], ['Check downloaded games', 'Library · Games and Storage', 'library', 'folders'],
  ['Get and update emulators', 'Emulators', 'emu', 'emus'], ['Vita3K, RPCS3, shadPS4, Dolphin, PCSX2...', 'Emulators', 'emu', 'emus'],
  ['Game add-ons, mods, texture packs, patches', 'Emulators · Game Add-ons', 'emu', 'addons'], ['Nexus Mods API key', 'Emulators · Game Add-ons', 'emu', 'addons'], ['BIOS and firmware', 'Emulators · Setup and Health', 'emu', 'overview'],
  ['Shortcut health, issues', 'Emulators · Setup and Health', 'emu', 'overview'], ['Console folders', 'Emulators · Console Folders', 'emu', 'folders'], ['Linked folders, share saves with a fork', 'Emulators · Linked Folders', 'emu', 'links'],
  ['Add games to Steam', 'Steam', 'steam'], ['Steam collections', 'Steam', 'steam'], ['Add Cartridge to Steam', 'Steam', 'steam'], ['Frame generation', 'Steam', 'steam'],
  ['RetroAchievements sign in', 'Achievements', 'ra'], ['Sign in to emulators', 'Achievements', 'ra'], ['Trophy folders', 'Achievements', 'ra'], ['Hidden games', 'Achievements', 'ra'], ['Trophy sync', 'Achievements', 'ra'],
  ['Syncthing', 'Saves and Sync', 'syncthing'], ['Save sync', 'Saves and Sync', 'syncthing'], ['Where your saves are, search for saves', 'Saves and Sync', 'syncthing'],
  ['Colour, theme', 'Look & Feel · Theme', 'ui', 'theme'], ['Plain or Glass style', 'Look & Feel · Theme', 'ui', 'theme'], ['Background', 'Look & Feel · Theme', 'ui', 'theme'], ['Light, OLED', 'Look & Feel · Theme', 'ui', 'theme'],
  ['Font, text size', 'Look & Feel · Text and Cards', 'ui', 'cards'], ['Interface size, scale', 'Look & Feel · Text and Cards', 'ui', 'cards'], ['Card shape and size', 'Look & Feel · Text and Cards', 'ui', 'cards'],
  ['Logos, SteamGridDB key', 'Look & Feel · Metadata', 'ui', 'meta'], ['Idle screen', 'Look & Feel · Motion and Sound', 'ui', 'motion'], ['Sounds', 'Look & Feel · Motion and Sound', 'ui', 'motion'], ['Rumble', 'Look & Feel · Motion and Sound', 'ui', 'motion'], ['Reduced motion, effects', 'Look & Feel · Motion and Sound', 'ui', 'motion'],
  ['Button icons, controller', 'Controls', 'controls'], ['Touch and mouse', 'Controls', 'controls'], ['On-screen keyboard', 'Controls', 'controls'], ['Tabs in the Dock, open on', 'Controls', 'controls'], ['Controller test', 'Controls', 'controls'],
  ['Downloads at once, speed limit', 'Downloads and Updates', 'dlup', 'downloads'], ['Multi-disc folders', 'Downloads and Updates', 'dlup', 'downloads'],
  ['Check for updates', 'Downloads and Updates · Cartridge Updates', 'dlup', 'updates'], ['Roll back to an earlier version', 'Downloads and Updates · Cartridge Updates', 'dlup', 'updates'], ['What’s New', 'Downloads and Updates · Cartridge Updates', 'dlup', 'updates'],
  ['Device name', 'Help and About', 'about'], ['Take the tour', 'Help and About', 'about'], ['Run the welcome again', 'Help and About', 'about'], ['Report a problem', 'Help and About', 'about'], ['Performance overlay', 'Help and About', 'about'], ['Licences', 'Help and About', 'about'], ['Quit Cartridge', 'Help and About', 'about'],
];
async function searchSettings() {
  const q = await askText({ title: 'Find a Setting', placeholder: 'Drive, rumble, Vita3K, colour...' });
  if (!q) return;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = SEARCH.filter(([w, where]) => words.every((x) => (w + ' ' + where).toLowerCase().includes(x)));
  if (!hits.length) return toast(`No setting matches “${q}”`, 'info', 3000);
  const pick = hits.length === 1 ? hits[0] : await choose({ sheet: true, title: `Settings for “${q}”`, options: hits.map((h, i) => ({ label: h[0], sub: h[1], value: i, icon: sections.find((x) => x.id === h[2])?.icon, raw: true })) }).then((i) => (i == null ? null : hits[i]));
  if (!pick) return;
  const [w, , id, page] = pick;
  sec.value = id;
  await nextTick();
  if (page) { if (id === 'library') libPage.value = page; else if (id === 'dlup') dlupPage.value = page; else if (id === 'emu') setEmuPage(page); else if (id === 'ui') setLookPage(page); }
  await nextTick(); await new Promise((r) => setTimeout(r, 120));
  // the row whose words are closest: a button or row naming it, else the page's first control
  const first = w.split(/[,(]/)[0].trim().toLowerCase().split(' ').slice(0, 2).join(' ');
  const cands = [...(paneEl.value?.querySelectorAll('[data-focus], .row, .subh') || [])];
  const hit = cands.find((e) => e.textContent.toLowerCase().includes(first));
  const target = hit?.matches('[data-focus]') ? hit : hit?.querySelector('[data-focus]') || hit?.parentElement?.querySelector('[data-focus]');
  if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'center' }); target.classList.add('found'); setTimeout(() => target.classList.remove('found'), 1600); }
  else focusFirst(paneEl.value);
}
function stepPages(list, r, key, d) { const i = list.findIndex((p) => p.v === r.value), n = list[(i + d + list.length) % list.length].v; r.value = n; nextTick(() => focusFirst(paneEl.value, `[data-key="${key}-${n}"]`)); }
const showAll = ref(false);
const supported = ref([]);
const space = ref(null);
const srv = computed(() => store.config.server);
const dls = computed(() => store.config.downloads);
const ui = computed(() => store.config.ui);
const scales = [{ v: 'auto', l: 'Auto' }, ...[1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((z) => ({ v: String(z), l: Math.round(z * 100) + '%' }))];
const scaleInfo = ref(null);
const refreshScale = () => call('app:scale').then((r) => (scaleInfo.value = r)).catch(() => {});
refreshScale();
const scaleNote = computed(() => {
  const r = scaleInfo.value;
  if (!r) return 'Auto sizes the interface for your screen every time Cartridge starts.';
  const scr = r.display?.w ? ` on your ${r.display.w}×${r.display.h} display` : '';
  return `Auto sizes the interface for your screen every time Cartridge starts. Right now that is ${Math.round(r.auto * 100)}% for a ${r.w}×${r.h} window${scr}. 100% is sized for a 1080p handheld.`;
});
async function setScale(v) { await saveConfig({ ui: { scale: v } }); setTimeout(refreshScale, 300); }
const sgdbKey = ref(store.config.sgdbKey || '');
const nexusKey = ref(store.config.nexusKey || ''), nexusBusy = ref(false), nexusWho = ref('');
const sgdbBusy = ref(false);
// Fetch all logos: progress lives in the store (one listener for the whole app)
const logoJob = computed(() => store.logoJob);
async function fetchAll(kinds = null) {
  store.logoJob = { done: 0, total: 0, found: 0 };
  call('logo:fetchAll', { kinds }).catch((e) => { store.logoJob = null; toast(e.message, 'error', 4000); });
}
// RetroAchievements account
const raUser = ref(store.config.ra?.user || '');
const raKey = ref('');
const raBusy = ref(false);
async function raSignIn() {
  raBusy.value = true;
  try { const r = await call('ra:signin', { user: raUser.value, key: raKey.value }); store.config = await call('config:get'); raKey.value = ''; toast(`Signed in as ${r.user}`, 'ok', 2600, 'mdiTrophy'); }
  catch (e) { toast(e.message, 'error', 5000); }
  raBusy.value = false;
}
// Emulator sign-in (F14): list what changes, ask the password once, never keep it. 0.9.21: who's signed
// in shows on the row; the list lets you sign in all of them or just one
const raTargets = ref(null);
const isMe = (t) => !!t.user && t.user.toLowerCase() === String(store.config.ra?.user || '').toLowerCase();
const raSignedCount = computed(() => (raTargets.value || []).filter(isMe).length);
const loadRaTargets = () => call('ra:emuTargets').then((l) => { raTargets.value = l || []; }).catch(() => { raTargets.value = []; });
watch(sec, (v) => { if (v === 'ra' && store.config.ra?.user) loadRaTargets(); }, { immediate: true });
async function raEmus() {
  const all = await call('ra:emuTargets').catch(() => []);
  raTargets.value = all;
  if (!all.length) return toast('No emulators with RetroAchievements set up yet. Open the emulator once, then try again.', 'info', 4200);
  const user = store.config.ra.user;
  const todoAll = all.filter((t) => !isMe(t));
  const pick = await choose({ sheet: true, title: 'Sign In to Emulators', options: [
    ...(todoAll.length ? [{ label: todoAll.length === all.length ? 'Sign In to All' : `Sign In to the Other ${todoAll.length}`, sub: todoAll.map((t) => t.name).join(', '), value: '*', icon: 'mdiAccountMultipleCheck' }] : []),
    ...all.map((t) => ({ label: t.name + (t.flatpak ? ' (Flatpak)' : ''), sub: isMe(t) ? `Signed in as ${t.user}` : t.user ? `Signed in as ${t.user}, not ${user}` : 'Not signed in', value: t.id, icon: isMe(t) ? 'mdiCheckCircle' : 'mdiAccountOutline', raw: true })),
  ] });
  if (!pick) return;
  const list = pick === '*' ? todoAll : all.filter((t) => t.id === pick);
  const lines = list.map((t) => `${t.name}${t.flatpak ? ' (Flatpak)' : ''}${t.user ? `, now signed in as ${t.user}` : ''}: ${t.files.join(', ')}`).join('\n');
  const ok = await confirm(`Sign in ${list.length} emulator${list.length === 1 ? '' : 's'} as ${user}`, `Cartridge turns achievements on and writes your login token here:\n${lines}\n\nClose these emulators first. Your password is sent to RetroAchievements once and never saved.`, 'Continue');
  if (!ok) return;
  const password = await askText({ title: `RetroAchievements password for ${user}`, password: true });
  if (!password) return;
  raBusy.value = true;
  try {
    const res = await call('ra:emuSignin', { user, password, ids: list.map((t) => t.id) });
    const bad = res.filter((r) => !r.ok);
    if (!bad.length) toast(`Signed in: ${res.map((r) => r.name).join(', ')}`, 'ok', 3600, 'mdiTrophy');
    else toast(`${bad.map((r) => `${r.name}: ${r.error}`).join(' · ')}`, 'error', 6000);
  } catch (e) { toast(e.message, 'error', 4200); }
  raBusy.value = false;
  loadRaTargets();
}
const rlBusy = ref(false);
async function rommLocalUpdate() {
  rlBusy.value = true;
  try { await call('romm:localUpdate'); toast('RomM is up to date and restarting', 'ok', 4000, 'mdiServer'); } catch (e) { toast(e.message, 'error', 6000); }
  rlBusy.value = false;
}
async function raSignOut() { await call('ra:signout'); store.config = await call('config:get'); toast('Signed out of RetroAchievements', 'info', 2200); }
async function saveNexus() {
  const key = nexusKey.value.trim();
  nexusBusy.value = true;
  try {
    let me = null;
    if (key) { try { me = await call('nexus:check', { key }); } catch (e) { return toast(e.message, 'error', 5000); } }
    await saveConfig({ nexusKey: key });
    nexusWho.value = me ? `${me.name}${me.premium ? ', Premium' : ''}` : '';
    toast(!key ? 'Nexus Mods key removed' : me?.premium ? 'Nexus Mods key saved: downloads are one press' : 'Nexus Mods key saved. Without Premium, mods download on their page in Cartridge.', 'ok', 4200, 'mdiCheck');
  } finally { nexusBusy.value = false; }
}
async function saveSgdb() {
  const key = sgdbKey.value.trim();
  sgdbBusy.value = true;
  try {
    if (key) {
      const r = await call('logo:test', { key }).catch(() => ({ ok: false, status: 0 }));
      if (!r.ok) { toast(r.status === 401 || r.status === 403 ? 'SteamGridDB rejected that key' : "Couldn't reach SteamGridDB", 'error', 4200); return; }
    }
    await saveConfig({ sgdbKey: key });
    resetLogos();
    toast(key ? 'SteamGridDB key saved. Logos will appear as you browse.' : 'SteamGridDB key removed', 'ok', 3400, 'mdiCheck');
  } finally { sgdbBusy.value = false; }
}
const busy = computed(() => ['running', 'scanning'].includes(store.sync.state));
const total = computed(() => allRoms().length);
const modes = [{ v: 'auto', l: 'Auto' }, { v: 'local', l: 'Local' }, { v: 'remote', l: 'Remote' }];
const sizes = [{ v: 'sm', l: 'Small' }, { v: 'md', l: 'Medium' }, { v: 'lg', l: 'Large' }];
const dims = [{ v: 'low', l: 'Bright' }, { v: 'medium', l: 'Dimmed' }, { v: 'high', l: 'Dark' }];
const idles = [{ v: 'off', l: 'Off' }, { v: '3', l: '3 min' }, { v: '5', l: '5 min' }, { v: '10', l: '10 min' }, { v: '15', l: '15 min' }];
const motions = [{ v: 'normal', l: 'Normal' }, { v: 'fast', l: 'Fast' }, { v: 'reduce', l: 'Reduced' }];
const effectsOpts = [{ v: 'auto', l: 'Auto' }, { v: 'full', l: 'Full' }, { v: 'light', l: 'Light' }];
const volumes = [{ v: 'low', l: 'Low' }, { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }];
const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fineTune = [
  { k: 'highlight', l: 'Highlights', sub: 'Focus, tabs, switches', def: () => cssVar('--primary') },
  { k: 'buttons', l: 'Buttons', sub: 'Main action buttons', def: () => cssVar('--primary-l') },
  { k: 'bars', l: 'Progress bars', sub: 'Downloads, trophies', def: () => cssVar('--primary') },
  { k: 'background', l: 'Background', sub: 'Waves and gradients', def: () => cssVar('--g2') },
];
const pureBlack = computed(() => ['highlight', 'buttons', 'bars'].every((k) => String((ui.value.colors || {})[k] || '').toLowerCase() === '#000000'));
function setPureBlack() { saveConfig({ ui: { colors: { highlight: '#000000', buttons: '#000000', bars: '#000000' }, colorsAuto: '' } }); }
async function pickPart(f) {
  const c = await openModal('color', { value: (ui.value.colors || {})[f.k] || f.def(), title: f.l, note: f.sub, allowReset: !!(ui.value.colors || {})[f.k] });
  if (c === '__theme') await saveConfig({ ui: { colors: { [f.k]: '' } } });
  else if (c) await saveConfig({ ui: { colors: { [f.k]: c } } });
}
const customT = computed(() => themeFrom(ui.value.customColor || '#8b74e8'));
async function pickColor() {
  const c = await openModal('color', { value: ui.value.customColor || THEMES[ui.value.theme]?.accent?.[0] || '#8b74e8' });
  if (c) await saveConfig({ ui: { theme: 'custom', customColor: c, gameTheme: null, ...autoColors('custom', ui.value) } });
}
async function setBg(v) {
  if (v === 'wallpaper' && !ui.value.wallpaper) { await chooseWallpaper(); return; }
  await saveConfig({ ui: { bgStyle: v } });
}
async function chooseWallpaper() {
  const file = await pickFolder({ title: 'Choose a wallpaper', subtitle: 'PNG, JPG or WebP', start: store.info.home, files: ['png', 'jpg', 'jpeg', 'webp'] });
  if (!file) return;
  try { store.config = await call('wallpaper:set', { file }); toast('Wallpaper set', 'ok', 2000, 'mdiWallpaper'); } catch (e) { toast(e.message, 'error', 4000); }
}
// A (0.9.15): each console with enough covers in your library can be the background
const artBgs = computed(() => (store.lib?.platforms || []).filter((p) => p.rom_count >= 6).map((p) => ({ v: 'art:' + p.slug, l: consoleName(p), sub: 'Your games, slowly panning', group: 'Art' })).sort((a, b) => a.l.localeCompare(b.l)));
// 0.9.56 (owner): the menu is your theme's colours, the scenes' own colours and the rest; the console and game art
// backgrounds left the menu (a background already set to one keeps working and shows as the current one)
const allBgs = computed(() => ['Theme', 'Scenes', 'Other'].flatMap((g) => BACKGROUNDS.filter((b) => b.group === g)));
const bgNow = computed(() => { const v = ui.value.bgStyle || 'solid'; const m = LEGACY_ART[v] ? 'art:' + LEGACY_ART[v] : v; return allBgs.value.find((b) => b.v === m) || artBgs.value.find((b) => b.v === m) || BACKGROUNDS[0]; });
const BG_ICON = { Theme: 'mdiWaves', Scenes: 'mdiWaves', Top: 'mdiStarOutline', Consoles: 'mdiGamepadVariantOutline', Art: 'mdiImageMultipleOutline', Other: 'mdiImageOutline' };
async function pickBg() {
  let last = '';
  const pal = paletteOf(ui.value);
  // a picture of each animated one (0.9.3 L); still, artwork and wallpaper keep their icon
  const options = allBgs.value.map((b) => { const o = { label: b.l, sub: b.sub, value: b.v, icon: BG_ICON[b.group], img: RENDERERS[b.v] ? bgPreview(b.v, pal) : '', selected: bgNow.value.v === b.v, heading: b.group !== last ? { Theme: 'Your Theme Colours', Scenes: 'Their Own Colours', Other: 'Other' }[b.group] : '' }; last = b.group; return o; });
  const v = await choose({ title: 'Background', options });
  if (v) await setBg(v);
}
async function clearWallpaper() { store.config = await call('wallpaper:clear'); await saveConfig({ ui: { bgStyle: 'solid' } }); }
async function setPack(v) { await saveConfig({ ui: { soundPack: v } }); setSoundStyle(v, ui.value.volume); previewSound(); }
async function setVolume(v) { await saveConfig({ ui: { volume: v } }); setSoundStyle(ui.value.soundPack, v); previewSound(); }
// Look presets: the look settings saved under a name (not interface size, pointer, keyboard or
// button icons, which belong to the device and controller rather than to a look)
// Top bar tabs: shown ones in their order, then the hidden ones
const tabsOn = computed(() => activeTabs());
const tabRows = computed(() => [...tabsOn.value, ...Object.keys(TAB_DEFS).filter((n) => !tabsOn.value.includes(n))].map((name) => ({ name, ...TAB_DEFS[name], on: tabsOn.value.includes(name) })));
function toggleTab(n) {
  const l = tabsOn.value.includes(n) ? tabsOn.value.filter((x) => x !== n) : [...tabsOn.value.filter((x) => x !== 'settings'), n, 'settings'];
  saveConfig({ ui: { tabs: l } });
}
function moveTab(n, d) {
  const l = [...tabsOn.value], i = l.indexOf(n), j = i + d;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  saveConfig({ ui: { tabs: l } });
}
const LOOK_KEYS = ['theme', 'customColor', 'colors', 'colorsAuto', 'idle', 'style', 'surface', 'elements', 'text', 'font', 'bgStyle', 'wallDim', 'cardShape', 'density', 'gridSize', 'cardTitles', 'mediaBar', 'mediaSize', 'logos', 'motion', 'effects', 'sounds', 'soundPack', 'volume', 'rumble'];
const presets = computed(() => store.config.lookPresets || []);
const presetStyle = (p) => { const g = themeOf(p.ui).grad; return { background: `linear-gradient(135deg, ${g[0]}, ${g[2]} 60%, ${g[4]})` }; };
function lookNow() { const o = {}; for (const k of LOOK_KEYS) if (ui.value[k] !== undefined) o[k] = JSON.parse(JSON.stringify(ui.value[k])); return o; }
async function savePreset() {
  const name = await askText({ title: 'Name this look', placeholder: 'TV night' });
  if (!name || !name.trim()) return;
  await saveConfig({ lookPresets: [...presets.value, { name: name.trim().slice(0, 30), ui: lookNow() }] });
  toast(`Saved "${name.trim().slice(0, 30)}"`, 'ok', 2200, 'mdiBookmarkOutline');
}
async function applyPreset(p) {
  const u = { ...p.ui };
  if (u.bgStyle === 'wallpaper' && !ui.value.wallpaper) u.bgStyle = 'solid'; // the wallpaper image isn't part of a preset
  await saveConfig({ ui: u });
  setSoundEnabled(ui.value.sounds !== false);
  setSoundStyle(ui.value.soundPack, ui.value.volume);
  toast(`"${p.name}" applied`, 'ok', 2000, 'mdiBookmarkOutline');
}
async function presetMenu(p, i) {
  const v = await choose({ title: p.name, options: [
    { label: 'Use this look', value: 'apply', icon: 'mdiCheck' },
    { label: 'Save the current look here', sub: 'Replaces what this preset had', value: 'update', icon: 'mdiContentSave' },
    { label: 'Rename', value: 'rename', icon: 'mdiPencil' },
    { label: 'Delete', value: 'delete', icon: 'mdiDeleteOutline', danger: true },
  ] });
  const list = [...presets.value];
  if (v === 'apply') return applyPreset(p);
  if (v === 'update') { list[i] = { ...p, ui: lookNow() }; await saveConfig({ lookPresets: list }); toast(`"${p.name}" updated`, 'ok', 2000, 'mdiContentSave'); }
  if (v === 'rename') { const n = await askText({ title: 'Rename look', value: p.name }); if (n && n.trim()) { list[i] = { ...p, name: n.trim().slice(0, 30) }; await saveConfig({ lookPresets: list }); } }
  if (v === 'delete' && (await confirm(`Delete "${p.name}"?`, 'Only the preset goes. Your current look stays as it is.', 'Delete', true))) { list.splice(i, 1); await saveConfig({ lookPresets: list }); }
}
async function resetLook() {
  if (!(await confirm('Reset Look & Feel?', 'Colour, background, fonts, cards, motion and sounds go back to the defaults.', 'Reset'))) return;
  await saveConfig({ ui: { colors: { highlight: '', buttons: '', bars: '', background: '' }, theme: 'cartridge', customColor: '', style: 'plain', surface: 'solid', elements: 'plain', text: 'normal', font: 'cartridge', cardShape: 'rounded', density: 'normal', cardTitles: true, gridSize: 'md', bgStyle: 'solid', motion: 'normal', effects: 'auto', soundPack: 'soft', volume: 'medium', rumble: 'none' } });
}
const pointers = [{ v: 'auto', l: 'Auto' }, { v: 'touch', l: 'Touch' }, { v: 'mouse', l: 'Mouse' }];
const homeAchOpts = [{ v: 'all', l: 'All' }, { v: 'ra', l: 'RetroAchievements' }, { v: 'trophies', l: 'Trophies' }, { v: 'off', l: 'Off' }];
const homeAch = computed(() => ui.value.homeAch || (ui.value.raOnHome === false ? 'trophies' : 'all'));
const buttonOpts = [{ v: 'auto', l: 'Auto' }, { v: 'xbox', l: 'Xbox' }, { v: 'playstation', l: 'PlayStation' }, { v: 'nintendo', l: 'Nintendo' }, { v: 'steam', l: 'Steam' }];
const keyboards = [{ v: 'auto', l: 'Auto' }, { v: 'builtin', l: 'Built-in' }, { v: 'steam', l: 'Steam' }];
// Emulator trophies (Settings → Achievements → Other sources)
const trophySrc = ref([]);
const tcfg = computed(() => store.config.trophies || {});
const deviceName = ref(store.config.trophies?.device || '');
const loadSrc = () => { call('trophies:sources').then((r) => (trophySrc.value = r)).catch(() => {}); loadHidden(); };
// trophy games hidden from the totals (0.9.3 E4): named from the trophies overview
const hiddenGames = ref([]);
async function loadHidden() {
  const keys = store.config.trophies?.hidden || [];
  if (!keys.length) { hiddenGames.value = []; return; }
  const ov = await call('trophies:overview').catch(() => null);
  const byKey = new Map((ov?.games || []).map((g) => [g.key, g]));
  hiddenGames.value = keys.map((k) => { const g = byKey.get(k); return { key: k, title: g?.title || k, sub: g ? `${g.total ? `${g.earned || 0} of ${g.total} trophies` : ''}` : 'Not on this device right now' }; });
}
async function unhideGame(h) {
  const list = await call('trophies:hide', { key: h.key, hidden: false });
  store.config.trophies = { ...(store.config.trophies || {}), hidden: list };
  toast(`${h.title} counts in your totals again`, 'ok', 2600, 'mdiEyeOutline');
  loadHidden();
}
watch(() => store.trophyVer, loadSrc);
loadSrc();
async function saveDevice() {
  const name = deviceName.value.trim();
  await saveConfig({ trophies: { device: name } });
  call('trophies:sync').catch(() => {});
  call('play:device', { name }).catch(() => {}); // renames this device in RomM when it's registered there
  toast('Device name saved', 'ok', 2000);
}
async function setT(patch) { await saveConfig({ trophies: patch }); if ('sync' in patch || 'device' in patch) { call('trophies:sync').catch(() => {}); if ('device' in patch) toast('Device name saved', 'ok', 2000); } }
async function toggleSrc(s, v) { trophySrc.value = await call('trophies:toggle', { src: s.id, enabled: v }); store.config = await call('config:get'); }
async function chooseSrc(s) {
  const dir = await pickFolder({ title: `Folder with ${s.name} data`, subtitle: 'Pick the emulator folder (or its user or trophy folder). Hidden folders are shown.', start: store.info.home, hidden: true });
  if (!dir) return;
  try { trophySrc.value = await call('trophies:choose', { src: s.id, dir }); store.config = await call('config:get'); toast(`${s.name} trophies found`, 'ok', 2600, 'mdiCheck'); }
  catch (e) { toast(e.message, 'error', 4500); }
}
async function removeDir(s, dir) { trophySrc.value = await call('trophies:removeDir', { src: s.id, dir }); store.config = await call('config:get'); }
async function scanTrophies() { trophySrc.value = await call('trophies:scan').catch((e) => (toast(e.message, 'error'), trophySrc.value)); store.config = await call('config:get'); }
function openOthers() { tab('achievements'); }
const syncLine = computed(() => {
  const s = store.trophySync;
  if (s.state === 'ok') return `Last synced ${ago(s.at)}.`;
  if (s.state === 'error') return 'Sync problem: ' + s.error;
  if (s.state === 'running') return 'Syncing now…';
  return 'Syncs when Cartridge starts and after each new unlock.';
});
const every = [{ v: 0, l: 'Off' }, { v: 30, l: '30 min' }, { v: 60, l: '1 h' }, { v: 180, l: '3 h' }];
const folderList = computed(() => (store.libVersion, showAll.value ? supported.value : store.lib?.platforms || []));

// D-pad (0.9.23, owner): right from the list of sections goes to the first item on the right; left at the
// left edge of the right side goes back to its section in the list (not the top of the list)
function railRight() { if (!document.activeElement?.closest('.rail')) return false; enter(); }
function paneLeft() {
  const cur = document.activeElement;
  if (!cur?.closest('.pane') || !paneEl.value) return false;
  const c = cur.getBoundingClientRect();
  const more = [...paneEl.value.querySelectorAll('[data-focus]')].some((e) => { if (e === cur || e.disabled) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.right <= c.left + 4 && r.bottom > c.top && r.top < c.bottom; });
  if (more) return false;
  focusFirst(el.value, `[data-key="sec-${sec.value}"]`);
}
function stepSync(d) { stView.value = ''; stepPages(SYNC_PAGES, syncPage, 'sync', d); }
useView({ right: railRight, left: paneLeft, back: () => { if (sec.value === 'syncthing' && syncPage.value === 'syncthing' && stView.value && !document.activeElement?.closest('.rail')) { closeSt(); return; } if (!document.activeElement?.closest('.rail')) { focusFirst(el.value, `[data-key="sec-${sec.value}"]`); return; } return false; }, lb: () => (sec.value === 'emu' ? stepEmu(-1) : sec.value === 'library' ? stepPages(LIB_PAGES, libPage, 'lib', -1) : sec.value === 'dlup' ? stepPages(DLUP_PAGES, dlupPage, 'dlup', -1) : sec.value === 'syncthing' ? stepSync(-1) : sec.value === 'steam' ? steamRef.value?.step(-1) : stepLook(-1)), rb: () => (sec.value === 'emu' ? stepEmu(1) : sec.value === 'library' ? stepPages(LIB_PAGES, libPage, 'lib', 1) : sec.value === 'dlup' ? stepPages(DLUP_PAGES, dlupPage, 'dlup', 1) : sec.value === 'syncthing' ? stepSync(1) : sec.value === 'steam' ? steamRef.value?.step(1) : stepLook(1)), y: () => searchSettings() },
  [{ b: 'A', label: 'Select' }, { b: 'B', label: 'Back' }, { b: 'Y', label: 'Find a Setting' }, { b: 'LT+RT', label: 'Tabs' }]);
// Settings → Emulators → Issues
const issues = ref(null);
const ISSUE_ICON = { collections: 'mdiFolderSyncOutline', moved: 'mdiLinkVariantOff', game: 'mdiFileHidden', core: 'mdiPuzzleRemoveOutline', setup: 'mdiRadar', bios: 'mdiChip', romm: 'mdiServerOutline', fpsteam: 'mdiSteam', rpcs3cfg: 'mdiFileAlertOutline' };
async function loadIssues() { issues.value = await call('issues:list').catch(() => []); store.issues = issues.value.length; texEmus.value = (await call('addons:emulators').catch(() => null)) || []; }
const texEmus = ref([]);
// Add-ons page (0.9.17): installed games of consoles with add-ons, by console, and what Cartridge installed
const ADDON_SLUGS = /^(ps2|psx|ngc|gamecube|wii|psp|3ds|n3ds|switch|wiiu|ps4)$/i;
const addonGames = computed(() => {
  const by = new Map();
  for (const r of allRoms()) {
    if (!store.installed[r.id] || !ADDON_SLUGS.test(r.platform_slug || '')) continue;
    if (!by.has(r.platform_slug)) by.set(r.platform_slug, { slug: r.platform_slug, name: consoleName({ romId: r.id, slug: r.platform_slug }), roms: [] });
    by.get(r.platform_slug).roms.push(r);
  }
  for (const g of by.values()) g.roms.sort((a, b) => a.name.localeCompare(b.name));
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
});
const addonsMine = ref([]);
const addonCount = (romId) => addonsMine.value.filter((a) => a.romId === romId).length;
async function loadAddons() {
  addonsMine.value = (await call('addons:installed').catch(() => null)) || [];
  addonsHere.value = (await call('addons:present', { romIds: addonGames.value.flatMap((g) => g.roms.map((r) => r.id)) }).catch(() => null)) || {};
}
// what is already in each game's folder (0.9.19): a texture pack or mods, put in by Cartridge or not
const addonsHere = ref({});
const BY_TEXT = { cartridge: 'installed by Cartridge', other: 'added outside Cartridge', both: 'some installed by Cartridge' };
function presentText(id) {
  const f = addonsHere.value[id];
  if (!f) return '';
  return f.map((x) => `${x.mods ? 'Mods' : 'Texture pack'} in ${x.name}, ${BY_TEXT[x.by]}${!x.mods && !x.on ? ' (textures are off there)' : ''}`).join(' · ');
}
async function removeAddon(a) {
  if (!(await confirm('Delete this add-on?', `${a.name} (${a.game})\n\nOnly the ${a.count} files Cartridge put in ${a.emuName}’s folder are deleted.`, 'Delete', true))) return;
  try { await call('addons:remove', { key: a.key }); toast('Add-on removed', 'ok', 2500); } catch (e) { toast(e.message, 'error', 5000); }
  loadAddons();
}
// custom textures on in the emulator itself (0.9.16); off again only where Cartridge turned them on
async function flipTextures(e) {
  if (e.mods) return toast(e.how, 'info', 5000);
  if (e.on && !e.mine) return toast(`Custom textures were turned on in ${e.name}. Turn them off there if you want to.`, 'info', 4500);
  try { await call('addons:setTextures', { root: e.root, on: !e.on }); toast(e.on ? `Custom textures off in ${e.name}` : `Custom textures on in ${e.name}`, 'ok', 3000, 'mdiTextureBox'); texEmus.value = await call('addons:emulators'); }
  catch (err) { toast(err.message, 'error', 5000); }
}
// BIOS and firmware (0.9.37)
const biosSt = ref(null), biosBusy = ref('');
const shortHome = (p) => String(p || '').replace(store.info?.home || '\u0000', '~');
async function loadBios() { biosSt.value = await call('bios:status').catch(() => ({ list: [] })); }
async function biosPlace() {
  biosBusy.value = 'place';
  try {
    const r = await call('bios:setup', { install: true });
    const done = r.list.filter((x) => x.copied || x.installed);
    toast(done.length ? `Put in place: ${done.map((x) => x.label).join(', ')}` : r.list.some((x) => !x.ok && !x.optional) ? 'Nothing new to put in place: get the missing ones from RomM' : 'Everything is already in place', done.length ? 'ok' : 'info', 5000, 'mdiChip');
  } catch (e) { toast(e.message, 'error', 6000); }
  biosBusy.value = ''; loadBios();
}
async function biosGet() {
  biosBusy.value = 'get';
  toast('Getting BIOS and firmware from RomM. PS3 and Vita firmware takes a minute to install.', 'info', 5000, 'mdiChip');
  try { const r = await call('bios:all'); const bad = r.filter((x) => x.error); toast(!r.length ? 'Your RomM server has no BIOS or firmware files.' : `${r.length - bad.length} console${r.length - bad.length === 1 ? '' : 's'} done${bad.length ? `. Not done: ${bad.map((x) => `${x.name} (${x.error})`).join(', ')}` : ''}`, bad.length ? 'info' : 'ok', 7000, 'mdiChip'); }
  catch (e) { toast(e.message, 'error', 6000); }
  biosBusy.value = ''; loadBios();
}
async function fixIssue(i) {
  if (i.fix === 'health') return go('steam-health');
  if (i.fix === 'setup') return go('emu-setup');
  if (i.fix === 'romm') { sec.value = 'romm'; return; }
  if (!i.fix) return;
  if (i.fix === 'rpcs3cfg') {
    if (!(await confirm('Repair RPCS3’s Settings File?', 'Cartridge keeps a copy of the file as it is now, then removes only the text an older EmuDeck left behind. If the file still can’t be read afterwards, the copy goes back and nothing changes.', 'Repair'))) return;
    try { const r = await call('rpcs3:repairConfig', { root: i.root }); toast(r.already ? 'It reads fine already' : 'Repaired. RPCS3 can load its settings again.', 'ok', 3500, 'mdiCheck'); loadIssues(); } catch (e) { toast(e.message, 'error', 8000); }
    return;
  }
  if (i.fix === 'fpsteam') {
    if (!(await confirm('Allow Flatpak Steam?', 'Runs: flatpak override --user --talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam\n\nSteam can then start your emulators from its shortcuts. Restart Steam afterwards.', 'Allow'))) return;
    try { await call('setup:steamFlatpakAllow'); toast('Allowed. Restart Steam to use it.', 'ok', 3500, 'mdiCheck'); loadIssues(); } catch (e) { toast(e.message, 'error', 6000); }
    return;
  }
  // which games first, then put them back (0.9.3 L): the list, with the action on top
  const v = await choose({ sheet: true, title: i.text, message: 'Straight into Steam when Cartridge can reach its interface, otherwise Steam closes for a moment while its collections are written.', options: [
    { label: 'Put Them In', value: 'fix', icon: 'mdiFolderSyncOutline' },
    ...(i.items || []).map((g) => ({ label: g.name, sub: g.collection, value: null, icon: 'mdiGamepadVariantOutline', raw: true })),
  ] });
  if (v !== 'fix') return;
  try { const r = await call('steam:fixCollections'); toast(r.live ? `${r.fixed} put in their collections` : 'Putting them in their collections: Steam restarts for a moment', 'ok', 3500, 'mdiSteam'); loadIssues(); } catch (e) { toast(e.message, 'error'); }
}
watch(sec, (v) => { store.settingsSection = v; if (v === 'emu') { loadIssues(); loadBios(); } }, { immediate: true });


function enter() { focusFirst(paneEl.value); }
// a press on a section: with a controller or keys it was already focused (and chosen), so A goes in; a tap or click
// chooses it (0.9.49, owner: tapping the left list did nothing; a touch never moves focus, so @focus never ran)
// a tap or click also moves focus there (0.9.51, owner: touch didn't light the list like the controller does): the
// white stays on what you picked, never on the last thing the controller was on
function pick(id, e) {
  if (input.mode !== 'pad') e?.currentTarget?.focus?.({ preventScroll: true });
  if (sec.value !== id) { sec.value = id; if (input.mode === 'pad') nextTick(enter); return; }
  enter();
}
async function setMode(mode) { await saveConfig({ server: { mode } }); reconnect(); }
async function reconnect() {
  try { const r = await call('server:reconnect'); toast(`Connected · ${r.base}`, 'ok', 2600, 'mdiLanConnect'); } catch (e) { toast(e.message, 'error'); }
}
async function signOut() {
  if (!(await confirm('Sign out?', 'Games on this device stay where they are.', 'Sign out', true))) return;
  await call('library:reset');
  await saveConfig({ server: { password: '', token: '' }, configured: false });
}
async function rescan() { await call('installed:rescan'); toast('Device rescanned', 'ok', 2000, 'mdiHarddisk'); }
const storageKey = ref(0); // remeasure after the ROMs folder changes
async function afterPath() {
  storageKey.value++;
  if (showAll.value) await loadAll();
  space.value = await call('fs:space', store.config.romsRoot);
  await call('installed:rescan');
}
async function detect() {
  const d = await call('fs:detect');
  if (!d.roots.length) { toast('No EmuDeck / ES-DE roms folder found', 'error'); return; }
  // 0.9.49: what each is, in plain words: its drive, what's in it, and who said it's a games folder
  const pick = await choose({ sheet: true, title: 'Games Folders Found', message: 'Pick the one Cartridge should use as its main games folder. Your others can be added with Add a Drive.', options: d.roots.map((r) => ({ label: `${r.drive || 'Folder'} · ${short(r.path)}`, raw: true, sub: `${r.consoles} console folder${r.consoles === 1 ? '' : 's'}, ${r.games} game${r.games === 1 ? '' : 's'} · from ${r.source}`, value: r.path, icon: /main/i.test(r.drive) ? 'mdiHarddisk' : 'mdiSdCard', selected: r.real === store.config.romsRoot || r.path === store.config.romsRoot })) });
  if (!pick) return;
  const patch = { romsRoot: pick };
  if (!store.config.biosPath && d.bios) patch.biosPath = d.bios;
  await saveConfig(patch);
  await afterPath();
}
async function browseRoot() {
  const p = await pickFolder({ title: 'Choose your ROMs folder', start: store.config.romsRoot || undefined });
  if (!p) return;
  await saveConfig({ romsRoot: p });
  await afterPath();
}
// games on more than one drive (0.9.38)
const allRoots = ref([]), rootTo = ref('most');
const rootsShown = computed(() => (allRoots.value.length ? allRoots.value : store.config.romsRoot ? [{ path: store.config.romsRoot, main: true, drive: 'Games Folder', here: true, free: 0, total: 0 }] : []));
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~'); // paths with ~ for home
// a drive's name from its folder: /run/media/deck/SD/Emulation/roms -> SD
const rootLabel = (p) => { const parts = p.split('/').filter(Boolean); while (parts.length > 1 && /^(roms|emulation)$/i.test(parts[parts.length - 1])) parts.pop(); return parts[parts.length - 1] || p; };
const xroots = computed(() => allRoots.value.filter((r) => !r.main));
async function loadRoots() { const r = await call('roots:list').catch(() => null); if (r) { allRoots.value = r.roots; rootTo.value = r.to; } }
async function addRoot() {
  const dir = await pickFolder({ title: 'Choose a drive (or a folder on it)', subtitle: 'An Emulation/roms folder is made there, with a folder per console', start: '/run/media' });
  if (!dir) return;
  try {
    const r = await call('roots:add', { dir });
    toast(`Games folder ready: ${r.root}${r.lists.length ? `. Added to ${r.lists.join(', ')}` : ''}`, 'ok', 5000, 'mdiHarddiskPlus');
  } catch (e) { toast(e.message, 'error', 5000); }
  await loadRoots(); storageKey.value++;
}
async function removeRoot(r) {
  if (!(await confirm('Stop using this folder?', `${r.path}\n\nNothing is deleted: its games stay on the drive, and Cartridge stops looking there.`, 'Stop Using'))) return;
  await call('roots:remove', { dir: r.path }); await loadRoots(); storageKey.value++;
}
async function setRootTo(v) { await call('roots:to', { to: v }); rootTo.value = v; }
watch([sec, libPage], ([v, p]) => { if (v === 'library' && p === 'folders') loadRoots(); }, { immediate: true });
// 0.9.38 (owner: Look & Feel opened at the depth Achievements was scrolled to): every section shares the one .pane
// scroll box and only its contents change, so a new section starts at the top
watch(sec, () => { const el = paneEl.value; if (el) { stopScroll(el); el.scrollTop = 0; } });
async function browseBios() {
  const p = await pickFolder({ title: 'Choose your BIOS folder', start: store.config.biosPath || undefined });
  if (p) await saveConfig({ biosPath: p });
}
async function editPath(p) {
  const choice = await choose({
    title: p.display_name || p.name, message: p.target?.path || 'No folder',
    options: [
      { label: 'Browse for a folder…', value: 'browse', icon: 'mdiFolderOpen' },
      { label: 'Use automatic match', value: 'auto', icon: 'mdiAutoFix', selected: p.target?.source !== 'custom' },
      { label: 'Cancel', value: null, icon: 'mdiClose' },
    ],
  });
  if (choice === 'browse') {
    const dir = await pickFolder({ title: `Folder for ${p.display_name || p.name}`, start: p.target?.exists ? p.target.path : store.config.romsRoot || undefined });
    if (!dir) return;
    store.config = await call('config:setPath', { slug: p.slug, path: dir });
  } else if (choice === 'auto') store.config = await call('config:setPath', { slug: p.slug, path: null });
  else return;
  await afterPath();
}
async function loadAll() {
  showAll.value = true;
  const list = await call('platforms:supported');
  supported.value = list.map((p) => ({ ...p, display_name: p.display_name || p.name })).sort((a, b) => a.display_name.localeCompare(b.display_name));
}
// 0.9.60 (owner): today's Large is Medium, a new bigger Large; 'large' keeps its value so saved choices look the same,
// Spacious (58%) shows as Medium
const mediaSizes = [{ v: 'compact', l: 'Compact' }, { v: 'large', l: 'Medium' }, { v: 'xl', l: 'Large' }];
// Emulators pages (0.9.16)
// 0.9.28 (owner: the flow felt confusing): what you have first, then add-ons, then setup and health checks, then folders
const EMU_PAGES = [{ v: 'emus', l: 'Emulators' }, { v: 'addons', l: 'Game Add-ons' }, { v: 'overview', l: 'Setup and Health' }, { v: 'folders', l: 'Console Folders' }, { v: 'links', l: 'Linked Folders' }];
// a fork's Manage sheet asks for Linked Folders (0.9.33)
watch(() => store.emuPageWant, (v) => { if (!v) return; store.emuPageWant = null; setEmuPage(v); nextTick(() => focusFirst(paneEl.value, `[data-key="emup-${v}"]`)); });
// 0.9.44 (owner: Emulators opened on Setup and Health): every section opens on its first page; coming back from a
// screen opened here returns to the page it was opened from (store.settingsSpot.page)
const backTo = store.settingsSpot?.sec === sec.value ? store.settingsSpot.page : null;
const emuPage = ref(sec.value === 'emu' && backTo ? backTo : 'emus');
// installed games whose emulator has patches (0.9.16), by console then name
const PATCH_EMU = [[/ps3/i, 'RPCS3', 'rpcs3'], [/ps4/i, 'shadPS4', 'shadps4'], [/\bps2\b/i, 'PCSX2', 'pcsx2'], [/\b(ngc|gamecube|gc|wii)\b/i, 'Dolphin', 'dolphin'], [/\bpsp\b/i, 'PPSSPP', 'ppsspp']];
// Game Add-ons page (0.9.21): every installed game with add-ons, patches or game updates, by console, with a search
const gaFind = ref('');
const gaCon = ref('');
// with nothing searched, one console's games at a time; searching looks through all of them
const gaGroups = computed(() => (gaFind.value.trim() || gaAll.value.length < 2 ? gaAll.value : gaAll.value.filter((g) => g.slug === (gaCon.value || gaAll.value[0]?.slug))));
function stepGaCon(d) { const l = gaAll.value; if (l.length < 2) return; const i = Math.max(0, l.findIndex((g) => g.slug === gaCon.value)); gaCon.value = l[(i + d + l.length) % l.length].slug; }
const gaAll = computed(() => {
  const q = gaFind.value.trim().toLowerCase(), by = new Map();
  for (const r of allRoms()) {
    if (!store.installed[r.id] || (q && !r.name.toLowerCase().includes(q))) continue;
    const s = `${r.platform_slug} ${r.platform_fs_slug}`, pe = PATCH_EMU.find(([re]) => re.test(s));
    if (!pe && !ADDON_SLUGS.test(r.platform_slug || '')) continue;
    if (!by.has(r.platform_slug)) {
      // the emulator: the one with patches, else the one set up here that takes this console's add-ons
      const te = !pe && texEmus.value.find((e) => (e.for || []).includes(r.platform_slug));
      by.set(r.platform_slug, { slug: r.platform_slug, p: { slug: r.platform_slug, fs_slug: r.platform_fs_slug }, name: consoleName({ romId: r.id, slug: r.platform_slug }), emu: pe?.[1] || te?.name || '', id: pe?.[2] || te?.id || '', games: [] });
    }
    by.get(r.platform_slug).games.push(r);
  }
  for (const g of by.values()) g.games.sort((a, b) => a.name.localeCompare(b.name));
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
});
const ps3Todo = (id) => (ps3Ups.value || []).find((g) => g.romId === id)?.todo.length || 0;
function gaSub(r) {
  const s = `${r.platform_slug} ${r.platform_fs_slug}`, pe = PATCH_EMU.find(([re]) => re.test(s));
  const parts = [ADDON_SLUGS.test(r.platform_slug || '') && (/^(switch|wiiu)$/i.test(r.platform_slug) ? 'Mods' : 'Mods and texture packs'), pe && (pe[1] === 'PPSSPP' ? 'Cheats' : pe[1] === 'Dolphin' ? 'Patches and codes' : 'Patches'), /ps3/i.test(s) && 'Game updates'].filter(Boolean);
  return presentText(r.id) || (addonCount(r.id) ? `${addonCount(r.id)} installed by Cartridge` : parts.join(' · '));
}
async function openGameAddons(r) { await openModal('gameaddons', { romId: r.id, name: r.name }); loadAddons(); loadPs3Updates(); }
onMounted(() => { if (emuPage.value === 'addons') setEmuPage('addons'); }); // back on Game Add-ons: load it again
function setEmuPage(v) { emuPage.value = v; if (v === 'addons') { loadAddons(); if (ps3Ups.value === null) loadPs3Updates(); } }
function stepEmu(d) {
  const i = EMU_PAGES.findIndex((p) => p.v === emuPage.value), n = EMU_PAGES[(i + d + EMU_PAGES.length) % EMU_PAGES.length].v;
  setEmuPage(n); nextTick(() => focusFirst(paneEl.value, `[data-key="emup-${n}"]`));
}
const ps3Ups = ref(null);
const coverSmall = (romId) => { const r = romById(romId); return r ? cover(r) : ''; };
const ps3UpCount = computed(() => (ps3Ups.value || []).filter((g) => g.todo.length).length);
async function loadPs3Updates(fresh = false) { ps3Ups.value = await call('ps3up:list', { fresh }).catch(() => []); }
const TOUCH_SCROLL = [{ v: 'own', l: 'Cartridge’s' }, { v: 'browser', l: 'The Browser’s' }];
const BAR_POS = [{ v: 'top', l: 'Top' }, { v: 'bottom', l: 'Bottom' }, { v: 'left', l: 'Left' }];
// 0.9.32 (owner): black is the Dock's colour unless you pick another; Glass is its own choice now
// 0.9.44 (owner: going to Light kept a black Dock): a black Dock turns white with Light and back to black when you leave
// it; a Dock colour picked as glass or the accent stays as it is
// the old keys follow the Style too, for anything that still reads them
function pickStyle(k) { saveConfig({ ui: { style: k, surface: k === 'glass' ? 'glass' : 'solid', elements: k } }); }
function pickTheme(k) {
  const light = !!THEMES[k]?.light, dock = ui.value.dockColor;
  const dockColor = light && dock === 'black' ? 'white' : !light && dock === 'white' && THEMES[ui.value.theme]?.light ? 'black' : undefined;
  saveConfig({ ui: { theme: k, gameTheme: null, ...(dockColor ? { dockColor } : {}), ...autoColors(k, ui.value) } }); // Light: black parts, OLED: white (0.9.56)
}
const DOCK_COLOR = [{ v: 'black', l: 'Black' }, { v: 'white', l: 'White' }, { v: 'accent', l: 'Accent' }]; // Plain only: in Glass the Dock is glass (0.9.45)
const BAR_ALIGN = [{ v: 'start', l: 'Aligned' }, { v: 'center', l: 'Centred' }];
const BAR_STYLE = [{ v: 'plain', l: 'Plain' }, { v: 'pill', l: 'Floating Pill' }, { v: 'circle', l: 'Circles' }];
const LOOK_PAGES = [{ v: 'theme', l: 'Theme' }, { v: 'cards', l: 'Text and Cards' }, { v: 'meta', l: 'Metadata' }, { v: 'motion', l: 'Motion and Sound' }]; // Controls is its own section (0.9.49)
const lookPage = ref(sec.value === 'ui' && backTo ? backTo : 'theme'), lookAdv = ref(false);
watch(sec, (v, was) => { if (was && v !== was) { emuPage.value = 'emus'; lookPage.value = 'theme'; lookAdv.value = false; libPage.value = 'folders'; dlupPage.value = 'downloads'; } }); // a section always opens on its first page
watch([sec, emuPage, lookPage, libPage, dlupPage], () => { store.settingsPage = sec.value === 'emu' ? emuPage.value : sec.value === 'ui' ? lookPage.value : sec.value === 'library' ? libPage.value : sec.value === 'dlup' ? dlupPage.value : null; }, { immediate: true });
function setLookPage(v) { lookPage.value = v; lookAdv.value = false; }
function stepLook(d) {
  if (sec.value !== 'ui') return false;
  const i = LOOK_PAGES.findIndex((p) => p.v === lookPage.value), n = LOOK_PAGES[(i + d + LOOK_PAGES.length) % LOOK_PAGES.length].v;
  setLookPage(n); nextTick(() => focusFirst(paneEl.value, `[data-key="look-${n}"]`));
}
const rumbles = [{ v: 'none', l: 'None' }, { v: 'low', l: 'Low' }, { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }];
async function setRumbleLevel(v) { await saveConfig({ ui: { rumble: v } }); setRumble(v); rumble(true); }
async function setSounds(v) { await saveConfig({ ui: { sounds: v } }); setSoundEnabled(v); }
async function addToSteam() {
  try {
    const st = await call('steam:status');
    if (st.gamescope) { toast('Switch to Desktop Mode first: Steam has to restart to add the shortcut.', 'info', 5000, 'mdiSteam'); return; }
    if (!st.appimage) { toast('Adding to Steam only works from the AppImage.', 'info', 4000); return; }
    if (st.running && !(await confirm('Close and reopen Steam?', 'Steam has to restart to pick up the new shortcut. Anything open in Steam will close.', 'Restart Steam and add'))) return;
    toast(st.running ? 'Closing Steam…' : 'Adding to Steam…', 'info', 3000, 'mdiSteam');
    const r = await call('steam:add', { restartSteam: true });
    toast(`Added to Steam${r.added.length > 1 ? ` for ${r.added.length} accounts` : ''} with artwork${r.restarted ? '. Steam is reopening.' : '. Open Steam to see it.'}`, 'ok', 6000, 'mdiSteam');
    loadSelf();
  } catch (e) { toast(e.message, 'error', 6000); }
}
const updText = computed(() => {
  const u = store.update;
  if (!store.update.supported && store.update.state === 'idle') return 'Updates work in the AppImage build.';
  return { checking: 'Checking GitHub for a new version…', downloading: `Downloading ${u.version} · ${u.percent || 0}%`, ready: `Version ${u.version} is downloaded and ready.`, current: 'You have the latest version.', error: `Could not check for updates: ${u.error || ''}` }[u.state] || 'Checks automatically when Cartridge starts.';
});
const rollBusy = ref(false);
async function rollBack() {
  rollBusy.value = true;
  let list = [];
  try { list = await call('update:releases'); } catch (e) { rollBusy.value = false; return toast(e.message, 'error', 5000); }
  rollBusy.value = false;
  const older = list.filter((x) => !x.current).slice(0, 12);
  if (!older.length) return toast('No earlier versions were found.', 'info', 3000);
  const tag = await choose({ sheet: true, title: 'Roll back to', options: older.map((x) => ({ label: x.name, sub: x.date ? new Date(x.date).toLocaleDateString() : x.tag, value: x.tag, icon: 'mdiHistory', raw: true })) });
  if (!tag) return;
  if (!(await confirm(`Roll back to ${tag.slice(1)}?`, 'Cartridge downloads that version, puts it in place of this one and restarts. Your settings and games stay.', 'Roll back'))) return;
  rollBusy.value = true;
  try { await call('update:rollback', { tag }); toast('Restarting…', 'ok', 3000, 'mdiHistory'); } catch (e) { toast(e.message, 'error', 6000); rollBusy.value = false; }
}
async function checkUpdates() { try { await call('update:check'); } catch (e) { toast(e.message, 'info', 4000); } }
async function setPointer(v) { await saveConfig({ ui: { pointer: v } }); setPointerPref(v === 'auto' && store.info?.gamescope ? 'touch' : v); }
// is Cartridge itself in Steam (null until known)
const selfAdded = ref(null);
// the Cartridge cards wait for the rest of the Steam page, so it all appears at once (0.9.32)
const steamReady = ref(!!store.steamOv);
async function loadSelf() { try { selfAdded.value = !!(await call('steam:status')).added; } catch { selfAdded.value = false; } }
watch(sec, (v) => { if (v === 'steam') loadSelf(); }, { immediate: true });
async function applyArt() {
  try { const r = await call('steam:applyArt'); toast(`Artwork applied to ${r.length} Steam shortcut${r.length > 1 ? 's' : ''}. Restart Steam to see it.`, 'ok', 5000, 'mdiImageFrame'); }
  catch (e) { toast(e.message, 'error', 5000); }
}
async function clearCache() { await call('app:clearCache'); toast('Image cache cleared', 'ok', 2000); }

onMounted(async () => { space.value = await call('fs:space', store.config.romsRoot); });
// Back from a screen opened here (Emulator setup, Shortcut health...) lands on the row you opened it
// from (store.go remembers it), not the section in the left list (0.9.3 L). The row is found again by
// its text, as lists above it (Issues) load later and move it.
onMounted(() => {
  const spot = store.settingsSpot;
  if (!spot || spot.sec !== sec.value) return;
  store.settingsSpot = null;
  for (const t of [0, 200, 600]) setTimeout(() => {
    const hit = [...(paneEl.value?.querySelectorAll('[data-focus]') || [])].find((x) => (x.textContent || '').trim().slice(0, 60) === spot.text);
    if (hit && document.activeElement !== hit) { hit.focus({ preventScroll: true }); hit.scrollIntoView({ block: 'nearest' }); }
  }, t);
});
</script>

<style scoped>
.style-seg { align-self: flex-start; } /* two choices: as wide as they are, not the whole page */
.set-view { position: absolute; inset: 0; display: grid; grid-template-columns: 270px 1fr; gap: 10px; padding: 16px 36px 0; animation: viewIn var(--fade-in); }
.rail { display: flex; flex-direction: column; gap: 4px; padding-top: 10px; }
.rail-item { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-radius: var(--r-md); color: var(--muted); font-weight: 500; transition: background var(--tint), color var(--tint); }
/* the page follows the list as you move, so the current section only needs brighter text, no box */
.sync-lock { display: flex; align-items: center; gap: 8px; margin: 0 0 var(--s-2); }
/* Syncthing's parts as cards (0.9.58) */
.st-hub-head { display: flex; align-items: center; gap: var(--s-3); margin-bottom: var(--s-3); }
.st-hub-head h2 { margin: 0 0 2px; font-size: var(--t-xl); }
.st-hub-head p { margin: 0; }
.st-hub { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--s-3); }
.st-hub-card { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: var(--s-4) var(--s-5) var(--s-4) var(--s-4); border-radius: var(--r-lg); text-align: left; min-height: 132px; transition: transform var(--spring-snappy-d) var(--spring-snappy), background var(--tint); }
.st-hub-card b { font-family: var(--display); font-size: var(--t-lg); }
.st-hub-card .small { overflow-wrap: anywhere; }
.st-hub-go { position: absolute; top: var(--s-4); right: var(--s-3); color: var(--muted); }
.st-hub-card:is(:focus-visible), .pad-mode .st-hub-card:focus { background: var(--focus); color: var(--on-focus); }
.st-hub-card:is(:focus-visible, :focus) :is(.muted, .st-hub-go) { color: var(--on-focus-dim); }
.st-back { margin-bottom: var(--s-3); }
.ss-choice-anchor { height: 0; outline: none; }
.rail-item.on { color: var(--on-sel); background: var(--sel-bg); box-shadow: var(--sel-ring); } /* the open section: chosen, the softer fill (docs/design-rules.md 6) */
.rail-item:focus { background: var(--focus); color: var(--on-focus); box-shadow: none; }
.pane { overflow-y: auto; padding: 6px 12px 60px 24px; }
.ga-cons { display: flex; gap: 8px; overflow-x: auto; padding: 8px 6px 10px; margin: 0 -6px; scrollbar-width: none; } /* room for a selected chip (0.9.28: it was cut off) */
.ga-con { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: var(--s1); box-shadow: var(--weight-edge); font-weight: 600; font-size: var(--t-sm); }
.ga-con em { font-style: normal; color: var(--muted); font-weight: 500; }
.ga-con.on { background: var(--sel-bg); box-shadow: var(--sel-ring); color: var(--on-sel); }
.ga-con:focus-visible, .pad-mode .ga-con:focus { background: var(--focus); color: var(--on-focus); box-shadow: none; outline: none; } /* the standard highlight: white fill, dark text, no ring */
.pad-mode .ga-con:focus em { color: var(--on-focus-dim); }
.rail-st { color: inherit !important; }
.pane-in { display: flex; flex-direction: column; gap: 16px; max-width: 860px; }
.pane h1 { font-size: var(--t-2xl); font-weight: 700; margin: 4px 0 6px; }
.card-s { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.kv { display: flex; gap: 16px; font-size: var(--t-sm); min-width: 0; }
.kv > span:first-child { width: 110px; color: var(--muted); flex: none; }
.lbl { width: 130px; color: var(--muted); font-size: var(--t-sm); flex: none; }
.lbl2 { font-size: var(--t-xs); color: var(--muted); margin-bottom: 4px; font-weight: 600; }
.small { font-size: var(--t-xs); }
.wrap { flex-wrap: wrap; }
.xroot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
.pathrow { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; }
.plist { display: flex; flex-direction: column; gap: 6px; }
.prow { display: grid; grid-template-columns: 30px 210px 1fr auto; align-items: center; gap: 14px; padding: 10px 14px; border-radius: var(--r-md); background: var(--s2); }
.prow:focus { background: var(--focus); color: var(--on-focus); box-shadow: none; }
.prow:focus .pp, .prow:focus .muted { color: var(--on-focus-dim); }
.pn {  overflow-wrap: anywhere; }
.pp { color: var(--muted); }
.about { display: flex; align-items: center; gap: 22px; padding: 22px; }
.swatches { display: flex; flex-wrap: wrap; gap: 10px; }
.swatch { width: 74px; height: 50px; border-radius: var(--r-md); display: flex; align-items: flex-end; padding: 6px 8px; font-size: var(--t-xs); font-weight: 600; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.6); box-shadow: inset 0 0 0 1px rgba(255,255,255,.15); }
/* a colour can't take the grey fill: chosen is a soft ring, focus the full white one */
.swatch.on { box-shadow: 0 0 0 3px var(--s0), 0 0 0 5px rgba(255, 255, 255, 0.45); }
/* focus is the full focus colour, wider than the chosen ring, so a focused chosen colour still shows it moved (0.9.47: the audit found the two identical) */
.pad-mode .swatch:focus, .swatch:focus-visible { box-shadow: 0 0 0 3px var(--s0), 0 0 0 6px var(--focus); }
.swatch { position: relative; }
.swatch i { position: absolute; top: 6px; right: 6px; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7); }
.swatch.ink { color: #1d1e22; text-shadow: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12); } /* Light's swatch (0.9.38) */
.swatch.custom { background: conic-gradient(from 90deg, #f55, #fd5, #5f8, #5df, #85f, #f5c, #f55); flex-direction: column; justify-content: space-between; align-items: flex-start; }
.btn-demo { display: inline-flex; gap: 4px; vertical-align: middle; margin-left: 6px; }
.finetune { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.presets { display: flex; flex-wrap: wrap; gap: 10px; }
.preset { display: flex; flex-direction: column; gap: 6px; width: 120px; padding: 8px; border-radius: var(--r-md); background: var(--s2); text-align: left; }
.preset b { font-size: var(--t-xs); font-weight: 600;  overflow-wrap: anywhere; }
.preset-sw { position: relative; height: 44px; border-radius: var(--r-sm); display: grid; place-items: center; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15); }
.preset-sw i { position: absolute; top: 6px; right: 6px; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7); }
.preset.add .preset-sw { background: rgba(255, 255, 255, 0.06); color: var(--muted); border: 1px dashed var(--line-2); box-shadow: none; }
.ft { display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 8px; border-radius: var(--r-md); background: var(--s2); }
.ft-sw { width: 34px; height: 34px; border-radius: var(--r-md); display: grid; place-items: center; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25); color: #fff; }
.ft-t { display: flex; flex-direction: column; text-align: left; }
.ft-t b { font-size: var(--t-sm); font-weight: 600; }
.ft-t small { font-size: var(--t-xs); color: var(--muted); }
.bgs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.bgnow { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: var(--r-md); text-align: left; width: 100%; max-width: 560px; }
.bgnow:focus { box-shadow: var(--ring); }
.bgnow-ic { width: 40px; height: 40px; border-radius: var(--r-md); display: grid; place-items: center; background: rgba(var(--primary-rgb), 0.22); color: var(--primary-t); flex: none; }
.bgnow-t { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bgnow-t b { font-size: var(--t-md); }
.bgnow-t small { font-size: var(--t-xs); color: var(--muted); }
.bgnow-c { display: inline-flex; align-items: center; gap: 2px; font-size: var(--t-sm); font-weight: 600; color: var(--primary-t); }
.bgtile { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: var(--r-md); background: var(--s2); text-align: left; }
.bgtile.on { background: var(--sel-bg); box-shadow: var(--sel-ring); color: var(--on-sel); }
.bgtile b { font-size: var(--t-sm); font-weight: 600; margin-top: 6px; }
.bgtile small { font-size: var(--t-xs); color: var(--muted); }
.bgp { position: relative; height: 54px; border-radius: var(--r-sm); overflow: hidden; background: var(--xmb); }
.bgp i { position: absolute; display: block; }
.bgp-waves .bgp i { left: -10%; right: -10%; height: 14px; border-radius: 50%; border-top: 1.5px solid rgba(255, 255, 255, 0.5); background: rgba(255, 255, 255, 0.08); }
.bgp-waves .bgp i:nth-child(1) { top: 26px; transform: rotate(-6deg); } .bgp-waves .bgp i:nth-child(2) { top: 30px; transform: rotate(4deg); } .bgp-waves .bgp i:nth-child(3) { top: 34px; transform: rotate(-2deg); }
.bgp-ribbons .bgp i { left: -10%; right: -10%; height: 30px; border-radius: 50%; border-top: 1px solid rgba(255, 255, 255, 0.45); }
.bgp-ribbons .bgp i:nth-child(1) { top: 20px; } .bgp-ribbons .bgp i:nth-child(2) { top: 24px; transform: rotate(3deg); } .bgp-ribbons .bgp i:nth-child(3) { top: 28px; transform: rotate(-3deg); }
.bgp-bokeh .bgp { background: linear-gradient(170deg, var(--g3), var(--g4)); } .bgp-bokeh .bgp i { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle, rgba(255, 255, 255, 0.55), transparent 70%); }
.bgp-bokeh .bgp i:nth-child(1) { left: 14%; top: 10px; } .bgp-bokeh .bgp i:nth-child(2) { left: 55%; top: 24px; width: 34px; height: 34px; } .bgp-bokeh .bgp i:nth-child(3) { left: 78%; top: 4px; width: 14px; height: 14px; }
.bgp-blades .bgp { background: linear-gradient(170deg, var(--g3), var(--g4)); } .bgp-blades .bgp i { top: -10px; bottom: -10px; width: 26px; transform: skewX(-25deg); background: linear-gradient(90deg, transparent, rgba(var(--primary-l-rgb), 0.35), transparent); }
.bgp-blades .bgp i:nth-child(1) { left: 16%; } .bgp-blades .bgp i:nth-child(2) { left: 46%; width: 40px; } .bgp-blades .bgp i:nth-child(3) { left: 80%; }
.bgp-dots .bgp { background: radial-gradient(circle, rgba(255, 255, 255, 0.35) 1.4px, transparent 1.8px) 0 0 / 10px 10px, linear-gradient(170deg, var(--g2), var(--g4)); } .bgp-dots .bgp i { display: none; }
.bgp-glow .bgp { background: radial-gradient(60% 80% at 25% 30%, rgba(var(--primary-rgb), 0.6), transparent), radial-gradient(60% 80% at 80% 80%, var(--peach), transparent 70%), linear-gradient(170deg, var(--g3), var(--g4)); } .bgp-glow .bgp i { display: none; }
.bgp-solid .bgp i, .bgp-art .bgp i, .bgp-wallpaper .bgp i { display: none; }
.bgp-art .bgp { background: linear-gradient(90deg, rgba(0, 0, 0, 0.7), transparent), repeating-linear-gradient(45deg, #3a3f50 0 8px, #2a2e3b 8px 16px); }
.bgp-wallpaper .bgp { background: linear-gradient(135deg, #3a4b6b, #6b4b3a); }
.fonts { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.fonttile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 8px; border-radius: var(--r-md); background: var(--s2); }
.fonttile b { font-size: var(--t-xl); font-weight: 600; line-height: 1.1; }
.fonttile span { font-size: var(--t-xs); color: var(--muted); }
.fonttile.on { background: var(--sel-bg); box-shadow: var(--sel-ring); color: var(--on-sel); }
.steam-grid { width: 130px; border-radius: var(--r-sm); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5); flex: none; }
.fadeup-enter-active { transition: opacity var(--fade-in), transform var(--spring-d) var(--spring); }
.fadeup-enter-from { opacity: 0; transform: translateX(10px); }
.fadeup-leave-active { display: none; }
.tabs-edit { display: flex; flex-direction: column; gap: 6px; }
.tab-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 14px; border-radius: var(--r-md); background: var(--s2); }
.tab-row.off { opacity: 0.6; }
.tab-lbl { flex: 1; min-width: 0; }
.tab-tg { min-width: 92px; justify-content: center; }
.subh { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-size: var(--t-lg); font-weight: 700; margin-top: 4px; }
/* LB, the pages and RB always on one row (owner: RB fell to a second row on Emulators' seven pages);
   the pages scroll sideways when they don't fit */
/* a setting found with Y: a moment of light on it */
.pane :deep(.found) { animation: found var(--move-ambient); }
@keyframes found { 0%, 40% { box-shadow: 0 0 0 3px var(--focus); } 100% { box-shadow: 0 0 0 3px transparent; } }
.rail-find { color: var(--text-2, var(--muted)); margin-bottom: 6px; }
.sec-head { display: flex; flex-direction: column; gap: 4px; margin: 0 0 var(--s-3); }
.sec-head h1 { margin: 0; }
.sec-lead { margin: 0; color: var(--text-2, var(--muted)); font-size: var(--t-sm); }
.gf-list { display: flex; flex-direction: column; gap: var(--s-2); }
.gf { display: flex; align-items: center; gap: var(--s-3); padding: 14px 16px; border-radius: var(--r-md); }
.gf-ico { flex: none; color: var(--text-2, var(--muted)); }
.gf-name { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-size: var(--t-md); }
.gf-path { overflow-wrap: anywhere; color: var(--text-2, var(--muted)); }
.gf-bar { display: block; height: 5px; max-width: 320px; margin: 6px 0 2px; }
.wrap-seg { flex-wrap: wrap; align-self: flex-start; }
.lookpages { display: flex; align-items: center; gap: var(--s-2); flex-wrap: nowrap; min-width: 0; }
.lookpages > * { flex: none; }
.lookpages .seg { flex: 0 1 auto; flex-wrap: nowrap; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.lookpages .seg button { flex: none; white-space: nowrap; }
.adv-tg { margin-top: var(--s-2); }
.ra-mk { height: 20px; }
.srcs { display: flex; flex-direction: column; gap: 10px; }
.src { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.src-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.src-path { display: flex; align-items: center; gap: 12px; font-size: var(--t-xs); min-width: 0; }
.src-path .how { color: var(--muted); width: 110px; flex: none; }
.src-path .mono { min-width: 0; flex: 1;  overflow-wrap: anywhere; }
.chip.found { background: rgba(80, 200, 120, 0.18); color: #9be8b4; }
.chip.found.nokey { background: rgba(245, 197, 66, 0.18); color: #ffd978; }
.src-note { margin: 0; }
.chip.missing { background: rgba(255, 255, 255, 0.08); color: var(--muted); }
.chip.off { background: rgba(255, 90, 90, 0.14); color: #ffaaaa; }
.logo-prog { flex: 1; display: flex; flex-direction: column; gap: 6px; max-width: 360px; }
.up-row { position: relative; overflow: hidden; }
/* the download along the row: a track and a fill that read on the row and on a selected one (0.9.21) */
.up-row::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: transparent; }
.up-row.busy::after { background: rgba(255, 255, 255, 0.12); }
.up-bar { position: absolute; left: 0; bottom: 0; z-index: 1; height: 4px; background: var(--text); border-radius: 0 2px 2px 0; transition: width var(--progress), background var(--tint); }
.pad-mode .up-row:focus .up-bar, .up-row:focus-visible .up-bar { background: var(--on-focus); }
.pad-mode .up-row.busy:focus::after, .up-row.busy:focus-visible::after { background: color-mix(in srgb, var(--on-focus) 15%, transparent); }
.up-bar.live { animation: upLive var(--loop-pulse) infinite; transform-origin: left; }
@keyframes upLive { 0% { transform: scaleX(0.05); opacity: 0.4; } 50% { transform: scaleX(0.6); opacity: 0.9; } 100% { transform: scaleX(1); opacity: 0.2; } }
.up-cover { width: 30px; height: 40px; object-fit: cover; border-radius: var(--r-sm); flex: none; }
.ps3-head { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-4); border-radius: var(--r-lg); background: linear-gradient(120deg, rgba(0, 59, 160, 0.35), rgba(0, 0, 0, 0) 70%), var(--s1); margin-bottom: var(--s-3); }
/* title over its line of text (0.9.21, owner: they ran together on one line) */
.ps3-head .l-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ps3-head b { font-family: var(--display); font-size: var(--t-lg); line-height: 1.2; }
.ps3-head .l-sub { font-size: var(--t-sm); color: var(--muted); line-height: 1.4; max-width: 70ch; }
.con-sec { margin-bottom: var(--s-4); }
.con-head { display: flex; align-items: center; gap: var(--s-3); margin: var(--s-4) 0 var(--s-2); }
.con-head b { font-size: var(--t-lg); font-family: var(--display); }
.con-head .count { color: var(--muted); font-size: var(--t-sm); }
.con-emu { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: var(--t-sm); }
.local-card { display: flex; align-items: center; gap: var(--s-4); margin-bottom: var(--s-4); }
.local-card .l-mid { flex: 1; display: flex; flex-direction: column; gap: 4px; }
</style>
