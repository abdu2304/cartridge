<template>
  <div class="set-view" ref="el">
    <nav class="rail">
      <div class="eyebrow" style="padding: 0 14px 10px">Settings</div>
      <button v-for="s in sections" :key="s.id" class="rail-item" :class="{ on: sec === s.id }" data-focus :data-key="'sec-' + s.id" @focus="sec = s.id" @click="enter">
        <Icon :name="s.icon" :size="20" />{{ s.label }}
      </button>
    </nav>
    <section class="pane" data-scroll ref="paneEl">
      <Transition name="fadeup" mode="out-in">
        <div :key="sec" class="pane-in">
          <template v-if="sec === 'conn'">
            <h1>Connection</h1>
            <div class="card-s glass">
              <div class="kv"><span>Local</span><span class="mono">{{ srv.localUrl || '—' }}</span></div>
              <div class="kv"><span>Remote</span><span class="mono">{{ srv.remoteUrl || '—' }}</span></div>
              <div class="kv"><span>Using now</span><span class="row" style="gap: 8px"><span class="dot" :class="store.connection.route === 'local' ? 'ok' : 'remote'" />{{ store.connection.base || 'Not connected' }}</span></div>
              <div class="kv"><span>Signed in</span><span>{{ srv.auth === 'token' ? 'API token' : srv.username }}</span></div>
            </div>
            <div class="row"><span class="lbl">Route</span><div class="seg"><button v-for="m in modes" :key="m.v" data-focus :class="{ on: srv.mode === m.v }" @click="setMode(m.v)">{{ m.l }}</button></div></div>
            <div class="row wrap">
              <button class="btn" data-focus @click="go('setup')"><Icon name="mdiPencil" />Edit connection</button>
              <button class="btn" data-focus @click="reconnect"><Icon name="mdiLanConnect" />Reconnect</button>
              <button class="btn danger" data-focus @click="signOut"><Icon name="mdiLogout" />Sign out</button>
            </div>
          </template>

          <template v-else-if="sec === 'sync'">
            <h1>Library &amp; Sync</h1>
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
          </template>

          <template v-else-if="sec === 'romm'">
            <h1>RomM</h1>
            <RommUpload />
          </template>
          <template v-else-if="sec === 'storage'">
            <h1>Storage</h1>
            <div class="pathrow glass">
              <div style="min-width: 0"><div class="lbl2">ROMs folder</div><div class="mono">{{ store.config.romsRoot || 'Not set' }}</div><div v-if="space" class="muted small">{{ bytes(space.free) }} free of {{ bytes(space.total) }}</div></div>
              <div class="row">
                <button class="btn small" data-focus @click="detect"><Icon name="mdiAutoFix" :size="18" />Auto-detect</button>
                <button class="btn small" data-focus @click="browseRoot"><Icon name="mdiFolderOpen" :size="18" />Browse</button>
              </div>
            </div>
            <div class="pathrow glass">
              <div style="min-width: 0"><div class="lbl2">BIOS folder</div><div class="mono">{{ store.config.biosPath || 'Not set' }}</div></div>
              <button class="btn small" data-focus @click="browseBios"><Icon name="mdiFolderOpen" :size="18" />Browse</button>
            </div>
            <StorageManager :key="storageKey" />
          </template>

          <template v-else-if="sec === 'folders'">
            <h1>Console Folders</h1>
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
                <div class="mono pp">{{ p.target?.path || '—' }}</div>
                <span class="chip" :class="p.target?.source === 'custom' ? 'primary' : p.target?.exists ? 'green' : ''">{{ p.target?.source === 'custom' ? 'Custom' : p.target?.exists ? 'Found' : p.target?.path ? 'Will create' : 'Not set' }}</span>
              </button>
            </div>
          </template>

          <template v-else-if="sec === 'dl'">
            <h1>Downloads</h1>
            <div class="row"><span class="lbl">At once</span><div class="seg"><button v-for="n in [1, 2, 3, 4]" :key="n" data-focus :class="{ on: dls.concurrency === n }" @click="saveConfig({ downloads: { concurrency: n } })">{{ n }}</button></div></div>
            <div class="row"><span class="lbl">Speed limit</span><div class="seg"><button v-for="n in [0, 5, 10, 25, 50]" :key="n" data-focus :class="{ on: (dls.limitMBs || 0) === n }" @click="saveConfig({ downloads: { limitMBs: n } })">{{ n ? n + ' MB/s' : 'Off' }}</button></div></div>
            <Toggle :model-value="dls.esdeM3uFolders" label="ES-DE multi-disc folders" desc="Save multi-disc games as “Game.m3u/” so ES-DE shows one entry" @update:model-value="(v) => saveConfig({ downloads: { esdeM3uFolders: v } })" />
            <Toggle :model-value="dls.flattenSingleFile" label="Flatten single-file folders" desc="If a game is a folder with one file on the server, save just the file" @update:model-value="(v) => saveConfig({ downloads: { flattenSingleFile: v } })" />
          </template>

          <template v-else-if="sec === 'ui'">
            <h1>Look &amp; Feel</h1>

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
              <button v-for="(t, k) in THEMES" :key="k" class="swatch" data-focus :class="{ on: (ui.theme || 'purple') === k }" :style="{ background: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[2]} 60%, ${t.grad[4]})` }" :title="t.label" @click="saveConfig({ ui: { theme: k, gameTheme: null } })"><i :style="{ background: t.accent[0] }" /><span>{{ t.label }}</span></button>
              <button class="swatch custom" data-focus :class="{ on: ui.theme === 'custom' }" :style="ui.customColor ? { background: `linear-gradient(135deg, ${customT.grad[0]}, ${customT.grad[2]} 60%, ${customT.grad[4]})` } : {}" @click="pickColor"><Icon name="mdiEyedropperVariant" :size="18" /><span>Custom</span></button>
            </div>
            <div class="finetune">
              <button v-for="f in fineTune" :key="f.k" class="ft" data-focus @click="pickPart(f)">
                <span class="ft-sw" :style="{ background: (ui.colors || {})[f.k] || f.def() }"><Icon v-if="!(ui.colors || {})[f.k]" name="mdiPaletteOutline" :size="14" /></span>
                <span class="ft-t"><b>{{ f.l }}</b><small>{{ (ui.colors || {})[f.k] ? 'Custom' : 'From theme' }}</small></span>
              </button>
              <button v-if="Object.values(ui.colors || {}).some(Boolean)" class="btn small" data-focus @click="saveConfig({ ui: { colors: { highlight: '', buttons: '', bars: '', background: '' } } })"><Icon name="mdiRestore" :size="16" />Use theme colours</button>
            </div>
            <div class="row"><span class="lbl">Panels</span><div class="seg"><button v-for="(v, k) in SURFACES" :key="k" data-focus :class="{ on: (ui.surface || 'glass') === k }" @click="saveConfig({ ui: { surface: k } })">{{ v.label }}</button></div></div>
            <div class="row"><span class="lbl">Text</span><div class="seg"><button v-for="(v, k) in TEXTS" :key="k" data-focus :class="{ on: (ui.text || 'normal') === k }" @click="saveConfig({ ui: { text: k } })">{{ v.label }}</button></div></div>

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

            <div class="subh"><Icon name="mdiFormatFont" :size="20" />Text &amp; Size</div>
            <div class="fonts">
              <button v-for="(f, k) in FONTS" :key="k" class="fonttile" data-focus :class="{ on: (ui.font || 'outfit') === k }" :style="{ fontFamily: f.display }" @click="saveConfig({ ui: { font: k } })"><b>Aa</b><span>{{ f.label }}</span></button>
            </div>
            <div class="row"><span class="lbl">Interface size</span><div class="seg"><button v-for="z in scales" :key="z.v" data-focus :class="{ on: String(ui.scale || 'auto') === z.v }" @click="setScale(z.v)">{{ z.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">{{ scaleNote }}</p>

            <div class="subh"><Icon name="mdiViewGridOutline" :size="20" />Games &amp; Cards</div>
            <div class="row"><span class="lbl">Box art size</span><div class="seg"><button v-for="(v, k) in CARD_SIZES" :key="k" data-focus :class="{ on: (ui.gridSize || 'md') === k }" @click="saveConfig({ ui: { gridSize: k } })">{{ v.label }}</button></div></div>
            <div class="row"><span class="lbl">Card corners</span><div class="seg"><button v-for="(v, k) in CARD_SHAPES" :key="k" data-focus :class="{ on: (ui.cardShape || 'rounded') === k }" @click="saveConfig({ ui: { cardShape: k } })">{{ v.label }}</button></div></div>
            <div class="row"><span class="lbl">Spacing</span><div class="seg"><button v-for="(v, k) in DENSITIES" :key="k" data-focus :class="{ on: (ui.density || 'normal') === k }" @click="saveConfig({ ui: { density: k } })">{{ v.label }}</button></div></div>
            <Toggle :model-value="ui.cardTitles !== false" label="Game names under box art" desc="Turn off for a clean wall of covers" @update:model-value="(v) => saveConfig({ ui: { cardTitles: v } })" />
            <Toggle :model-value="ui.mediaBar !== false" label="Media bar" desc="Show artwork of the highlighted game at the top of Home" @update:model-value="(v) => saveConfig({ ui: { mediaBar: v } })" />
            <Toggle :model-value="ui.logos !== false" label="Game logos" desc="Show the game's logo instead of its name on Home and game pages" @update:model-value="(v) => saveConfig({ ui: { logos: v } })" />
            <template v-if="ui.logos !== false">
              <div class="row" style="align-items: flex-end; gap: 12px">
                <TextField v-model="sgdbKey" label="SteamGridDB API key" placeholder="Paste your key" password icon="mdiKeyVariant" style="flex: 1" />
                <button class="btn" data-focus :disabled="sgdbBusy" @click="saveSgdb"><Icon name="mdiCheck" :size="18" />{{ sgdbBusy ? 'Checking…' : 'Save key' }}</button>
              </div>
              <div class="row" style="gap: 12px; align-items: center">
                <button v-if="!logoJob" class="btn" data-focus @click="fetchAll"><Icon name="mdiDownloadMultiple" :size="18" />Fetch all logos</button>
                <button v-else class="btn" data-focus @click="call('logo:stopAll')"><Icon name="mdiStop" :size="18" />Stop</button>
                <div v-if="logoJob" class="logo-prog"><div class="bar live"><i :style="{ width: (logoJob.total ? (logoJob.done / logoJob.total) * 100 : 0) + '%' }" /></div><span class="muted small">{{ logoJob.done }} / {{ logoJob.total }} games · {{ logoJob.found }} logos</span></div>
                <span v-else class="muted small">Gets the logo for every game now, instead of as you browse.</span>
              </div>
              <p class="muted small" style="margin-top: -6px">Logos come from your RomM server when it has them (ScreenScraper "logo" media). For everything else, add a free key from steamgriddb.com → Preferences → API. {{ store.config.sgdbKey ? 'Key saved.' : '' }}</p>
            </template>
            <Toggle :model-value="ui.hideEmpty" label="Hide empty systems" @update:model-value="(v) => saveConfig({ ui: { hideEmpty: v } })" />

            <div class="subh"><Icon name="mdiDockTop" :size="20" />Top bar</div>
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

            <div class="subh"><Icon name="mdiAnimationPlayOutline" :size="20" />Motion &amp; Sound</div>
            <div class="row"><span class="lbl">Idle screen</span><div class="seg"><button v-for="m in idles" :key="m.v" data-focus :class="{ on: (ui.idle ?? '5') === m.v }" @click="saveConfig({ ui: { idle: m.v } })">{{ m.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">After this long without input, your games' artwork drifts by with the clock. Any button wakes it.</p>
            <div class="row"><span class="lbl">Animations</span><div class="seg"><button v-for="m in motions" :key="m.v" data-focus :class="{ on: (ui.motion || 'normal') === m.v }" @click="saveConfig({ ui: { motion: m.v } })">{{ m.l }}</button></div></div>
            <div class="row"><span class="lbl">Effects</span><div class="seg"><button v-for="m in effectsOpts" :key="m.v" data-focus :class="{ on: (ui.effects || 'auto') === m.v }" @click="saveConfig({ ui: { effects: m.v } })">{{ m.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Reduced turns off movement, including the animated background, which then shows a still frame. Light effects draw backgrounds at a lower resolution and frame rate and skip blur. Auto uses light effects when the GPU is off (software rendering), so it stays smooth everywhere. {{ store.info.gpu === false ? 'The GPU is off right now, so Auto is using light effects.' : '' }}</p>
            <Toggle :model-value="ui.sounds !== false" label="UI sounds" desc="Soft clicks when you move and select" @update:model-value="setSounds" />
            <template v-if="ui.sounds !== false">
              <div class="row"><span class="lbl">Sound style</span><div class="seg"><button v-for="p in SOUND_PACKS" :key="p.v" data-focus :class="{ on: (ui.soundPack || 'soft') === p.v }" @click="setPack(p.v)">{{ p.l }}</button></div></div>
              <div class="row"><span class="lbl">Volume</span><div class="seg"><button v-for="v in volumes" :key="v.v" data-focus :class="{ on: (ui.volume || 'medium') === v.v }" @click="setVolume(v.v)">{{ v.l }}</button></div></div>
            </template>

            <div class="subh"><Icon name="mdiGamepadVariantOutline" :size="20" />Controls &amp; Display</div>
            <div class="row"><span class="lbl">Touch &amp; mouse</span><div class="seg"><button v-for="p in pointers" :key="p.v" data-focus :class="{ on: (ui.pointer || 'auto') === p.v }" @click="setPointer(p.v)">{{ p.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Auto hides the cursor when you tap the screen and shows it when a mouse moves. Touch never shows a cursor.</p>
            <div class="row"><span class="lbl">Button icons</span><div class="seg"><button v-for="k in buttonOpts" :key="k.v" data-focus :class="{ on: (ui.buttons || 'auto') === k.v }" @click="saveConfig({ ui: { buttons: k.v } })">{{ k.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Auto draws the buttons of the controller you're holding{{ padInfo?.name ? ` (right now: ${padInfo.name})` : '' }}, even when Steam presents it as an Xbox pad. <span class="btn-demo"><Btn b="A" /><Btn b="B" /><Btn b="X" /><Btn b="Y" /><Btn b="LB" /><Btn b="RT" /><Btn b="START" /><Btn b="SELECT" /></span></p>
            <div class="row"><span class="lbl">On-screen keyboard</span><div class="seg"><button v-for="k in keyboards" :key="k.v" data-focus :class="{ on: (ui.keyboard || 'auto') === k.v }" @click="saveConfig({ ui: { keyboard: k.v } })">{{ k.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Auto uses the built-in keyboard in Game Mode and your real keyboard on the desktop. Steam leaves typing to the Steam keyboard (Steam + X).</p>
            <div class="row"><span class="lbl">Rendering</span><div class="seg"><button v-for="g in gfx" :key="g.v" data-focus :class="{ on: (store.config.graphics || 'auto') === g.v }" @click="setGraphics(g.v)">{{ g.l }}</button></div></div>
            <p class="muted small" style="margin-top: -6px">Auto uses the GPU from the app menu and on big screens like TVs. On handheld-size screens launched from Steam or Game Mode it uses software rendering, which is proven there. If the GPU ever fails, Cartridge switches to Compatible by itself. Compatible never uses the GPU.</p>
            <div class="row"><button class="btn" data-focus @click="call('app:fullscreen')"><Icon name="mdiFullscreen" />Toggle fullscreen</button><button class="btn" data-focus @click="clearCache"><Icon name="mdiImageRemove" />Clear image cache</button><button class="btn" data-focus @click="resetLook"><Icon name="mdiRestore" />Reset Look &amp; Feel</button></div>
          </template>

          <template v-else-if="sec === 'updates'">
            <h1>Updates</h1>
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
          </template>

          <template v-else-if="sec === 'ra'">
            <h1>Achievements</h1>
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
              <Toggle :model-value="ui.raOnGames !== false" label="Achievements on game pages" desc="Show progress and badges on games that have RetroAchievements (PS3, PS4, Switch and other unsupported consoles never show them)" @update:model-value="(v) => saveConfig({ ui: { raOnGames: v } })" />
            </template>

            <div class="subh" style="margin-top: 14px"><Grade g="P" :size="22" />Trophies &amp; Gamerscore</div>
            <p class="muted small" style="margin-top: -8px">Trophies and achievements that emulators keep on this device. Cartridge reads each emulator's own settings first, then looks through your home, emulation and SD card folders. Nothing is ever written to the emulators' files.</p>
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
              <button class="btn" data-focus @click="openOthers"><Icon name="mdiTrophyOutline" />Open Trophies &amp; Gamerscore</button>
            </div>
            <Toggle :model-value="tcfg.sync !== false" label="Sync across devices" desc="Keeps trophies from every device together, stored as private notes on your RomM games. Uses your RomM login, no extra account. Only adds unlocks, never removes them." @update:model-value="(v) => setT({ sync: v })" />
            <p v-if="tcfg.sync !== false" class="muted small" style="margin-top: -6px">{{ syncLine }}</p>
            <div v-if="tcfg.sync !== false" class="row" style="align-items: flex-end; gap: 12px">
              <TextField v-model="deviceName" label="This device's name" :placeholder="store.info.hostname || 'Steam Deck'" icon="mdiDevices" style="flex: 1" />
              <button class="btn" data-focus @click="setT({ device: deviceName.trim() })"><Icon name="mdiCheck" :size="18" />Save name</button>
            </div>
            <Toggle v-if="tcfg.sync !== false" :model-value="tcfg.syncIcons !== false" label="Sync trophy pictures" desc="Stores small copies of trophy pictures in RomM too (about 150 to 300 KB per game), so every device shows them, not just the one that played" @update:model-value="(v) => setT({ syncIcons: v })" />
            <Toggle :model-value="tcfg.popups !== false" label="Trophy pop-ups" desc="Shows a pop-up when a trophy unlocks while Cartridge is open" @update:model-value="(v) => setT({ popups: v })" />
            <Toggle :model-value="ui.trophyOnGames !== false" label="Trophies on game pages" desc="PS3, PS4, Xbox 360 and PS Vita games show their trophies" @update:model-value="(v) => saveConfig({ ui: { trophyOnGames: v } })" />
          </template>

          <template v-else-if="sec === 'steam'">
            <h1>Steam</h1>
            <SteamSettings />
            <div class="subh" style="margin-top: 10px"><Icon name="mdiApplicationOutline" :size="20" />Cartridge itself</div>
            <div class="about glass">
              <img src="../../steam-art/grid.png" class="steam-grid" />
              <div style="display: flex; flex-direction: column; gap: 10px">
                <div style="font-family: var(--display); font-size: 22px; font-weight: 700">Add Cartridge to Game Mode</div>
                <div class="muted small">Creates a Steam shortcut for this AppImage with the Cartridge cover, banner, logo and icon, so it sits in your library like any other game. Steam closes and reopens to pick it up, so do this from Desktop Mode.</div>
                <div class="row wrap">
                  <button class="btn primary" data-focus @click="addToSteam"><Icon name="mdiSteam" />Add to Steam</button>
                  <button class="btn" data-focus @click="applyArt"><Icon name="mdiImageFrame" />Refresh artwork only</button>
                </div>
              </div>
            </div>
            <p class="muted small">Added before 0.2.1? Press Add to Steam once more: Steam now starts Cartridge through a launch script that makes it open reliably, and logs each launch to ~/.config/Cartridge/steam-launch.log. Keep the AppImage where it is; if you move it, add it again.</p>
          </template>

          <template v-else>
            <h1>About</h1>
            <div class="about glass">
              <Logo :size="64" />
              <div><div style="font-family: var(--display); font-size: 26px; font-weight: 700">Cartridge</div><div class="muted">Version {{ store.info.version }} · a RomM client for the couch</div></div>
            </div>
            <ServerStatus />
            <div class="card-s glass">
              <div class="kv"><span>Game Mode</span><span>{{ store.info.gamescope ? 'Yes (gamescope)' : 'No (desktop)' }}</span></div>
              <div class="kv"><span>Controller</span><span>{{ padInfo?.name || input.padName || 'Press any button' }}</span></div>
              <div class="kv"><span>Data</span><span class="mono">{{ store.info.userData }}</span></div>
            </div>
            <div class="row"><button class="btn danger" data-focus @click="call('app:quit')"><Icon name="mdiPower" />Quit Cartridge</button></div>
          </template>
        </div>
      </Transition>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { store, call, go, tab, saveConfig, pickFolder, choose, confirm, toast, openModal, bytes, ago, resync, scanServer, allRoms, resetLogos, askText, activeTabs, TAB_DEFS } from '../store.js';
import { useView } from '../useView.js';
import { input, focusFirst, setPointerPref } from '../nav.js';
import { THEMES, SURFACES, TEXTS, FONTS, CARD_SHAPES, CARD_SIZES, DENSITIES, themeFrom, themeOf } from '../themes.js';
import { BACKGROUNDS } from '../bgRenderers.js';
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
import RommUpload from '../components/RommUpload.vue';
import ServerStatus from '../components/ServerStatus.vue';
import { padInfo } from '../pad.js';

const el = ref(null);
const paneEl = ref(null);
const sec = ref(store.settingsSection || 'conn');
const sections = [
  { id: 'conn', label: 'Connection', icon: 'mdiServerNetwork' },
  { id: 'sync', label: 'Library & Sync', icon: 'mdiSync' },
  { id: 'romm', label: 'RomM', icon: 'mdiCloudUploadOutline' },
  { id: 'storage', label: 'Storage', icon: 'mdiHarddisk' },
  { id: 'folders', label: 'Console Folders', icon: 'mdiFolderMultipleOutline' },
  { id: 'dl', label: 'Downloads', icon: 'mdiTrayArrowDown' },
  { id: 'ui', label: 'Look & Feel', icon: 'mdiPaletteOutline' },
  { id: 'ra', label: 'Achievements', icon: 'mdiTrophyOutline' },
  { id: 'steam', label: 'Steam', icon: 'mdiSteam' },
  { id: 'updates', label: 'Updates', icon: 'mdiUpdate' },
  { id: 'about', label: 'About', icon: 'mdiInformationOutline' },
];
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
const sgdbBusy = ref(false);
// Fetch all logos: progress lives in the store (one listener for the whole app)
const logoJob = computed(() => store.logoJob);
async function fetchAll() {
  store.logoJob = { done: 0, total: 0, found: 0 };
  call('logo:fetchAll').catch((e) => { store.logoJob = null; toast(e.message, 'error', 4000); });
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
async function raSignOut() { await call('ra:signout'); store.config = await call('config:get'); toast('Signed out of RetroAchievements', 'info', 2200); }
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
async function pickPart(f) {
  const c = await openModal('color', { value: (ui.value.colors || {})[f.k] || f.def(), title: f.l, note: f.sub, allowReset: !!(ui.value.colors || {})[f.k] });
  if (c === '__theme') await saveConfig({ ui: { colors: { [f.k]: '' } } });
  else if (c) await saveConfig({ ui: { colors: { [f.k]: c } } });
}
const customT = computed(() => themeFrom(ui.value.customColor || '#8b74e8'));
async function pickColor() {
  const c = await openModal('color', { value: ui.value.customColor || THEMES[ui.value.theme]?.accent?.[0] || '#8b74e8' });
  if (c) await saveConfig({ ui: { theme: 'custom', customColor: c, gameTheme: null } });
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
const bgNow = computed(() => BACKGROUNDS.find((b) => b.v === (ui.value.bgStyle || 'waves')) || BACKGROUNDS[0]);
const BG_ICON = { Theme: 'mdiWaves', Consoles: 'mdiGamepadVariantOutline', Other: 'mdiImageOutline' };
async function pickBg() {
  let last = '';
  const options = BACKGROUNDS.map((b) => { const o = { label: b.l, sub: b.sub, value: b.v, icon: BG_ICON[b.group], selected: bgNow.value.v === b.v, heading: b.group !== last ? { Theme: 'Your theme colours', Consoles: 'Consoles', Other: 'Other' }[b.group] : '' }; last = b.group; return o; });
  const v = await choose({ title: 'Background', options });
  if (v) await setBg(v);
}
async function clearWallpaper() { store.config = await call('wallpaper:clear'); await saveConfig({ ui: { bgStyle: 'waves' } }); }
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
const LOOK_KEYS = ['theme', 'customColor', 'colors', 'idle', 'surface', 'text', 'font', 'bgStyle', 'wallDim', 'cardShape', 'density', 'gridSize', 'cardTitles', 'mediaBar', 'logos', 'motion', 'effects', 'sounds', 'soundPack', 'volume'];
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
  if (u.bgStyle === 'wallpaper' && !ui.value.wallpaper) u.bgStyle = 'waves'; // the wallpaper image isn't part of a preset
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
  await saveConfig({ ui: { colors: { highlight: '', buttons: '', bars: '', background: '' }, theme: 'purple', customColor: '', surface: 'glass', text: 'normal', font: 'outfit', cardShape: 'rounded', density: 'normal', cardTitles: true, gridSize: 'md', bgStyle: 'waves', motion: 'normal', effects: 'auto', soundPack: 'soft', volume: 'medium' } });
}
const gfx = [{ v: 'auto', l: 'Auto (GPU)' }, { v: 'software', l: 'Compatible' }];
const pointers = [{ v: 'auto', l: 'Auto' }, { v: 'touch', l: 'Touch' }, { v: 'mouse', l: 'Mouse' }];
const homeAchOpts = [{ v: 'all', l: 'All' }, { v: 'ra', l: 'RetroAchievements' }, { v: 'trophies', l: 'Trophies' }, { v: 'off', l: 'Off' }];
const homeAch = computed(() => ui.value.homeAch || (ui.value.raOnHome === false ? 'trophies' : 'all'));
const buttonOpts = [{ v: 'auto', l: 'Auto' }, { v: 'xbox', l: 'Xbox' }, { v: 'playstation', l: 'PlayStation' }, { v: 'nintendo', l: 'Nintendo' }, { v: 'steam', l: 'Steam' }];
const keyboards = [{ v: 'auto', l: 'Auto' }, { v: 'builtin', l: 'Built-in' }, { v: 'steam', l: 'Steam' }];
// Emulator trophies (Settings → Achievements → Other sources)
const trophySrc = ref([]);
const tcfg = computed(() => store.config.trophies || {});
const deviceName = ref(store.config.trophies?.device || '');
const loadSrc = () => call('trophies:sources').then((r) => (trophySrc.value = r)).catch(() => {});
watch(() => store.trophyVer, loadSrc);
loadSrc();
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
function openOthers() { store.achTab = 'others'; tab('achievements'); }
const syncLine = computed(() => {
  const s = store.trophySync;
  if (s.state === 'ok') return `Last synced ${ago(s.at)}.`;
  if (s.state === 'error') return 'Sync problem: ' + s.error;
  if (s.state === 'running') return 'Syncing now…';
  return 'Syncs when Cartridge starts and after each new unlock.';
});
const every = [{ v: 0, l: 'Off' }, { v: 30, l: '30 min' }, { v: 60, l: '1 h' }, { v: 180, l: '3 h' }];
const folderList = computed(() => (store.libVersion, showAll.value ? supported.value : store.lib?.platforms || []));

useView({ back: () => { if (!document.activeElement?.closest('.rail')) { focusFirst(el.value, `[data-key="sec-${sec.value}"]`); return; } return false; } },
  [{ b: 'A', label: 'Select' }, { b: 'B', label: 'Back' }, { b: 'LT+RT', label: 'Tabs' }]);
watch(sec, (v) => { store.settingsSection = v; });

function enter() { focusFirst(paneEl.value); }
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
  const pick = await choose({ title: 'Detected ROM folders', options: d.roots.map((r) => ({ label: r.path, sub: r.source, value: r.path, icon: 'mdiFolderSearchOutline', selected: r.path === store.config.romsRoot })) });
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
  } catch (e) { toast(e.message, 'error', 6000); }
}
const updText = computed(() => {
  const u = store.update;
  if (!store.update.supported && store.update.state === 'idle') return 'Updates work in the AppImage build.';
  return { checking: 'Checking GitHub for a new version…', downloading: `Downloading ${u.version} · ${u.percent || 0}%`, ready: `Version ${u.version} is downloaded and ready.`, current: 'You have the latest version.', error: `Could not check for updates: ${u.error || ''}` }[u.state] || 'Checks automatically when Cartridge starts.';
});
async function checkUpdates() { try { await call('update:check'); } catch (e) { toast(e.message, 'info', 4000); } }
async function setPointer(v) { await saveConfig({ ui: { pointer: v } }); setPointerPref(v); }
async function setGraphics(v) {
  if ((store.config.graphics || 'auto') === v) return;
  await saveConfig({ graphics: v });
  if (await confirm('Restart Cartridge?', 'The rendering change takes effect after a restart.', 'Restart now')) call('app:relaunch');
}
async function applyArt() {
  try { const r = await call('steam:applyArt'); toast(`Artwork applied to ${r.length} Steam shortcut${r.length > 1 ? 's' : ''}. Restart Steam to see it.`, 'ok', 5000, 'mdiImageFrame'); }
  catch (e) { toast(e.message, 'error', 5000); }
}
async function clearCache() { await call('app:clearCache'); toast('Image cache cleared', 'ok', 2000); }

onMounted(async () => { space.value = await call('fs:space', store.config.romsRoot); });
</script>

<style scoped>
.set-view { position: absolute; inset: 0; display: grid; grid-template-columns: 270px 1fr; gap: 10px; padding: 16px 36px 0; animation: viewIn 0.16s ease-out; }
.rail { display: flex; flex-direction: column; gap: 4px; padding-top: 10px; }
.rail-item { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-radius: 8px; color: var(--muted); font-weight: 500; transition: background 0.15s, color 0.15s; }
.rail-item.on { color: #fff; background: rgba(255, 255, 255, 0.06); }
.rail-item:focus { background: rgba(var(--primary-rgb), 0.25); color: #fff; }
.pane { overflow-y: auto; padding: 6px 12px 60px 24px; }
.pane-in { display: flex; flex-direction: column; gap: 16px; max-width: 860px; }
.pane h1 { font-size: 34px; font-weight: 700; margin: 4px 0 6px; }
.card-s { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.kv { display: flex; gap: 16px; font-size: 14px; min-width: 0; }
.kv > span:first-child { width: 110px; color: var(--muted); flex: none; }
.lbl { width: 130px; color: var(--muted); font-size: 13.5px; flex: none; }
.lbl2 { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px; font-weight: 600; }
.small { font-size: 12.5px; }
.wrap { flex-wrap: wrap; }
.pathrow { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; }
.plist { display: flex; flex-direction: column; gap: 6px; }
.prow { display: grid; grid-template-columns: 30px 210px 1fr auto; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.045); }
.prow:focus { background: rgba(var(--primary-rgb), 0.2); }
.pn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp { color: var(--muted); }
.about { display: flex; align-items: center; gap: 22px; padding: 22px; }
.swatches { display: flex; flex-wrap: wrap; gap: 10px; }
.swatch { width: 74px; height: 50px; border-radius: 8px; display: flex; align-items: flex-end; padding: 6px 8px; font-size: 11px; font-weight: 600; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.6); box-shadow: inset 0 0 0 1px rgba(255,255,255,.15); }
.swatch.on { box-shadow: 0 0 0 2px #fff, 0 0 0 5px var(--primary); }
.swatch { position: relative; }
.swatch i { position: absolute; top: 6px; right: 6px; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7); }
.swatch.custom { background: conic-gradient(from 90deg, #f55, #fd5, #5f8, #5df, #85f, #f5c, #f55); flex-direction: column; justify-content: space-between; align-items: flex-start; }
.btn-demo { display: inline-flex; gap: 4px; vertical-align: middle; margin-left: 6px; }
.finetune { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.presets { display: flex; flex-wrap: wrap; gap: 10px; }
.preset { display: flex; flex-direction: column; gap: 6px; width: 120px; padding: 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.045); border: 1px solid var(--line); text-align: left; }
.preset b { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preset-sw { position: relative; height: 44px; border-radius: 7px; display: grid; place-items: center; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15); }
.preset-sw i { position: absolute; top: 6px; right: 6px; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7); }
.preset.add .preset-sw { background: rgba(255, 255, 255, 0.06); color: var(--muted); border: 1px dashed var(--line-2); box-shadow: none; }
.ft { display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.045); border: 1px solid var(--line); }
.ft-sw { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25); color: #fff; }
.ft-t { display: flex; flex-direction: column; text-align: left; }
.ft-t b { font-size: 13px; font-weight: 600; }
.ft-t small { font-size: 11px; color: var(--muted); }
.bgs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.bgnow { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 12px; text-align: left; width: 100%; max-width: 560px; }
.bgnow:focus { box-shadow: var(--ring); }
.bgnow-ic { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: rgba(var(--primary-rgb), 0.22); color: var(--primary-t); flex: none; }
.bgnow-t { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bgnow-t b { font-size: 15px; }
.bgnow-t small { font-size: 12px; color: var(--muted); }
.bgnow-c { display: inline-flex; align-items: center; gap: 2px; font-size: 13px; font-weight: 600; color: var(--primary-t); }
.bgtile { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.045); border: 1px solid var(--line); text-align: left; }
.bgtile.on { border-color: var(--primary-l); background: rgba(var(--primary-rgb), 0.18); }
.bgtile b { font-size: 13.5px; font-weight: 600; margin-top: 6px; }
.bgtile small { font-size: 11px; color: var(--muted); }
.bgp { position: relative; height: 54px; border-radius: 7px; overflow: hidden; background: var(--xmb); }
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
.fonttile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.045); border: 1px solid var(--line); }
.fonttile b { font-size: 28px; font-weight: 600; line-height: 1.1; }
.fonttile span { font-size: 12px; color: var(--muted); }
.fonttile.on { border-color: var(--primary-l); background: rgba(var(--primary-rgb), 0.18); }
.steam-grid { width: 130px; border-radius: 7px; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5); flex: none; }
.fadeup-enter-active, .fadeup-leave-active { transition: opacity 0.15s, transform 0.2s var(--ease); }
.fadeup-enter-from { opacity: 0; transform: translateX(10px); }
.fadeup-leave-to { opacity: 0; }
.tabs-edit { display: flex; flex-direction: column; gap: 6px; }
.tab-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 14px; border-radius: 9px; background: rgba(255, 255, 255, 0.045); }
.tab-row.off { opacity: 0.6; }
.tab-lbl { flex: 1; min-width: 0; }
.tab-tg { min-width: 92px; justify-content: center; }
.subh { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-size: 19px; font-weight: 700; margin-top: 4px; }
.ra-mk { height: 20px; }
.srcs { display: flex; flex-direction: column; gap: 10px; }
.src { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.src-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.src-path { display: flex; align-items: center; gap: 12px; font-size: 12.5px; min-width: 0; }
.src-path .how { color: var(--muted); width: 110px; flex: none; }
.src-path .mono { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.chip.found { background: rgba(80, 200, 120, 0.18); color: #9be8b4; }
.chip.found.nokey { background: rgba(245, 197, 66, 0.18); color: #ffd978; }
.src-note { margin: 0; }
.chip.missing { background: rgba(255, 255, 255, 0.08); color: var(--muted); }
.chip.off { background: rgba(255, 90, 90, 0.14); color: #ffaaaa; }
.logo-prog { flex: 1; display: flex; flex-direction: column; gap: 6px; max-width: 360px; }
</style>
