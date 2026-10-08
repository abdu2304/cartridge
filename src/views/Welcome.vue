<template>
  <div class="welcome" :class="{ 'w-out': leaving, 'w-intro-on': intro }" ref="el">
    <!-- 0.9.52: the opening, rebuilt on CAE (WelcomeIntro.vue); any press skips it -->
    <WelcomeIntro v-if="intro" @done="intro = false" />
    <div class="w-top">
      <!-- 0.9.17: going back is always visible: an arrow to tap, and B on a controller (hint below) -->
      <button v-if="at > 0 && !only" class="w-back" data-focus aria-label="Back" @click="handlers.back()"><Icon name="mdiArrowLeft" :size="22" /></button>
      <Logo :size="34" />
      <div class="w-steps" :class="{ hidden: only }" role="progressbar" :aria-valuenow="at + 1" :aria-valuemax="STEPS_C.length"><i :style="{ transform: `scaleX(${STEPS_C.length > 1 ? at / (STEPS_C.length - 1) : 0})` }" /></div>
      <button class="btn small" data-focus @click="leave"><Icon name="mdiClose" :size="18" />{{ only ? 'Close' : replay ? 'Leave' : 'Skip Setup' }}</button>
    </div>

    <!-- every step is one centred card over the background (owner, 0.9.16) -->
    <div class="w-stage">
    <Transition :name="dir > 0 ? 'w-next' : 'w-prev'" mode="out-in">
      <section :key="step" class="w-step glass" :class="['w-' + step, step === 'look' && 'w-look-step']" data-scroll>
        <!-- 1 -->
        <template v-if="step === 'hello'">
          <Logo :size="96" class="w-logo" />
          <h1 class="w-big">Welcome to Cartridge</h1>
          <p class="w-lead">Your RomM library on the couch: find a game, download it, play it from Steam and keep track of it, all with a controller.</p>
          <div class="w-act"><button class="btn primary xl" data-focus @click="next()">Get started<Icon name="mdiArrowRight" /></button></div>
        </template>

        <!-- 0.9.52 (owner): the very first launch, on the desktop: Cartridge is made for Game Mode. Add to Steam closes and
             reopens Steam, waits until Steam has it, says goodbye and closes; the setup then starts in Game Mode. Never
             again after this first time (ui.gameModeAsked), nor in Game Mode, from Steam, or when the setup is run again. -->
        <template v-else-if="step === 'gamemode'">
          <div class="w-gm-icon" :class="{ ok: gm === 'done' }"><Icon :name="gm === 'done' ? 'mdiCheckCircle' : 'mdiSteam'" :size="64" /></div>
          <template v-if="gm === 'done'">
            <h1 class="w-big">Added to Steam</h1>
            <p class="w-lead">See you in Game Mode. Open Cartridge from your library there and the setup carries on with your controller.</p>
          </template>
          <template v-else>
            <h1 class="w-big">Cartridge Is Made for Game Mode</h1>
            <p class="w-lead">Add it to Steam, then open it from Game Mode to set it up with your controller.</p>
            <p v-if="gm === 'adding'" class="w-gm-busy"><Icon name="mdiSync" :size="18" class="spin" />{{ gmText }}</p>
            <p v-else-if="st.inSteam" class="muted small">Cartridge is already in your Steam library.</p>
            <p v-else-if="!st.appimage" class="muted small">Adding to Steam works from the AppImage. You can also add it in Steam yourself: Add a Game, then Add a Non-Steam Game.</p>
          </template>
          <div v-if="gm !== 'done'" class="w-act">
            <button class="btn" data-focus :disabled="gm === 'adding'" @click="next()">Set Up Here Instead</button>
            <button v-if="st.inSteam" class="btn primary" data-focus @click="call('app:quit')"><Icon name="mdiSteam" />Close and Open From Game Mode</button>
            <button v-else-if="st.appimage" class="btn primary" data-focus :disabled="gm === 'adding'" @click="gmAdd"><Icon name="mdiSteam" />{{ gm === 'adding' ? 'Adding…' : 'Add to Steam' }}</button>
          </div>
        </template>

        <!-- 2b (0.9.47, owner): make it yours early: Style, colour and background, the same settings as Look & Feel -->
        <template v-else-if="step === 'look'">
          <h1>Make It Yours</h1>
          <p class="w-lead">Your name, and how Cartridge looks. Everything here can be changed later in Settings.</p>
          <div class="w-box stack w-look">
            <!-- 0.9.52: the name lives here now (a hello when Cartridge starts, and this device's name in RomM) -->
            <TextField v-model="name" label="Your name" placeholder="Sam" icon="mdiAccount" />
            <span v-if="name.trim()" class="muted small">This device will be called <b>{{ deviceName }}</b> in RomM.</span>
            <span class="muted small">Style</span>
            <div class="seg"><button v-for="(v, k) in STYLES" :key="k" data-focus :class="{ on: styleOf(store.config.ui) === k }" @click="pickStyle(k)">{{ v.label }}</button></div>
            <span class="muted small w-look-sub">{{ STYLES[styleOf(store.config.ui)].sub }}</span>
            <span class="muted small">Colour</span>
            <div class="w-swatches"><button v-for="(t, k) in THEMES" :key="k" class="w-swatch" data-focus :class="{ on: (store.config.ui.theme || 'cartridge') === k, ink: t.light }" :style="{ background: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[2]} 60%, ${t.grad[4]})` }" @click="pickTheme(k)"><i :style="{ background: t.accent[0] }" /><span>{{ t.label }}</span></button></div>
            <span class="muted small">Background</span>
            <div class="w-bgs"><button v-for="b in LOOK_BGS" :key="b.v" class="w-bg" data-focus :class="{ on: lookBg === b.v }" @click="pickBg(b.v)"><img v-if="bgPics[b.v]" :src="bgPics[b.v]" alt="" /><span>{{ b.l }}</span></button></div>
          </div>
          <div class="w-act">
            <button class="btn" data-focus @click="prev"><Icon name="mdiArrowLeft" />Back</button>
            <button class="btn primary" data-focus @click="saveName">Continue<Icon name="mdiArrowRight" /></button>
          </div>
        </template>

        <!-- 3 -->

        <!-- 4 -->
        <template v-else-if="step === 'pad'">
          <!-- 0.9.17: what's actually in use (the controller Linux sees, or keyboard, touch, mouse), and its button labels -->
          <h1>Your Controls</h1>
          <div class="w-pad" :class="{ ok: padOk }">
            <Icon :name="padOk ? 'mdiCheckCircle' : using === 'pad' ? USING_ICON[padKind] || USING_ICON.pad : USING_ICON[using]" :size="72" />
            <b>{{ padOk ? 'Your controller works' : usingText }}</b>
            <span v-if="using === 'pad' && !padOk" class="muted small">Press <Btn b="A" /> to check it.</span>
            <!-- 0.9.49 (owner: an underrated feature nobody is told about) -->
            <span v-if="using === 'pad'" class="muted small">Push <Btn b="RS" /> up or down to scroll any page or list without moving the highlight.</span>
            <span v-else-if="!padOk" class="muted small">Everything works with {{ using === 'touch' ? 'touch' : using === 'keys' ? 'a keyboard' : 'a mouse' }} too. A controller is picked up as soon as you use one.</span>
          </div>
          <div class="w-box stack" style="align-items: center">
            <span class="muted small">Button labels</span>
            <div class="seg"><button v-for="o in LABELS" :key="o.v" data-focus :class="{ on: (store.config.ui.buttons || 'auto') === o.v }" @click="saveConfig({ ui: { buttons: o.v } })">{{ o.l }}</button></div>
          </div>
          <div class="w-act">
            <button class="btn" data-focus @click="prev"><Icon name="mdiArrowLeft" />Back</button>
            <button class="btn primary" data-focus @click="padPress">{{ padOk || using !== 'pad' ? 'Continue' : 'Press A' }}<Icon name="mdiArrowRight" /></button>
          </div>
        </template>

        <!-- 5 -->
        <template v-else-if="step === 'steam'">
          <h1>Instant Steam Changes</h1>
          <template v-if="!st.steam"><p class="w-lead">Steam wasn't found on this device. Games can go into Steam later, once it's installed and signed in.</p></template>
          <template v-else-if="st.live.flag || liveDone">
            <div class="w-good"><Icon name="mdiCheckCircle" :size="28" /><span>Instant Steam changes are on</span></div>
            <p class="w-lead">Games you add show up in Steam straight away{{ st.live.on ? '' : ' after Steam restarts once' }}.</p>
          </template>
          <template v-else>
            <p class="w-lead">Cartridge can add games, artwork and collections to Steam while it's running, without closing Steam each time. It turns on Steam's own developer switch for this (the one Decky uses); no plugins are installed.</p>
            <p class="muted small">Steam has to restart once before it works.</p>
          </template>
          <div class="w-act">
            <button class="btn" data-focus @click="prev"><Icon name="mdiArrowLeft" />Back</button>
            <template v-if="st.steam && !st.live.flag && !liveDone">
              <button class="btn" data-focus @click="next()">Not now</button>
              <button class="btn primary" data-focus @click="liveOn"><Icon name="mdiFlash" />Turn on</button>
            </template>
            <button v-else class="btn primary" data-focus @click="next()">Continue<Icon name="mdiArrowRight" /></button>
          </div>
          <!-- 0.9.52: Cartridge itself in Steam, on the same step (it was a step of its own) -->
          <div v-if="st.steam && !st.gamescope" class="w-box w-self">
            <Icon :name="st.inSteam || selfDone ? 'mdiCheckCircle' : 'mdiSteam'" :size="26" />
            <div class="l-mid"><b>{{ st.inSteam || selfDone ? 'Cartridge is in Steam' : 'Add Cartridge to Steam' }}</b><span class="l-sub">{{ st.inSteam || selfDone ? 'Open it from Game Mode, with its own artwork.' : st.appimage ? 'So you can open it from Game Mode. Steam closes and reopens once.' : 'This works from the AppImage build. You can do it later in Settings → Steam.' }}</span></div>
            <button v-if="!st.inSteam && !selfDone && st.appimage" class="btn" data-focus :disabled="busy" @click="addSelf"><Icon name="mdiSteam" />{{ busy ? 'Adding…' : 'Add' }}</button>
          </div>
        </template>

        <!-- 6 -->
        <template v-else-if="step === 'emus'">
          <!-- 0.9.17: pick your own, by console; 0.9.24 the Cartridge Installer (also in Settings → Emulators) -->
          <template v-if="picking">
            <h1>Cartridge Installer</h1>
            <div class="w-box"><EmuGet flow @phase="(p) => (egPhase = p)" /></div>
            <!-- 0.9.37: Continue only once installing has started (it used to take focus while Location loaded) -->
            <div class="w-act">
              <button class="btn" data-focus @click="picking = false"><Icon name="mdiArrowLeft" />Back</button>
              <button v-if="egPhase === 'where' || egPhase === 'pick'" class="btn" data-focus @click="recheck">Skip for Now</button>
              <button v-else class="btn primary" data-focus @click="recheck">Continue<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else-if="st.emudeck || st.retrodeck">
            <h1>Emulators</h1>
            <div class="w-good"><Icon name="mdiCheckCircle" :size="28" /><span>Good news, you already have {{ st.emudeck && st.retrodeck ? 'EmuDeck and RetroDECK' : st.emudeck ? 'EmuDeck' : 'RetroDECK' }}</span></div>
            <p class="w-lead">Cartridge uses the emulators it set up. The system scan in a moment finds every other one too.</p>
            <div class="w-act">
              <button class="btn" data-focus @click="prev"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn" data-focus @click="picking = true"><Icon name="mdiPackageDown" />Cartridge Installer</button>
              <button class="btn primary" data-focus @click="next()">Continue<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else>
            <h1>Get Your Emulators</h1>
            <p class="w-lead">Cartridge starts games with the emulators on this device. If you don't have any yet, one of these sets them up for you.</p>
            <div v-if="getting" class="w-box glass w-prog">
              <b>{{ getting === 'emudeck' ? 'Downloading EmuDeck' : getting === 'flatpak' ? 'Installing Flatpak' : 'Installing RetroDECK' }}</b>
              <div class="bar live"><i :style="{ width: (progress ?? 0) + '%' }" /></div>
              <span class="muted small">{{ progress != null ? progress + '%' : 'Starting…' }}</span>
            </div>
            <!-- 0.9.17: no Flatpak on this system: say so, and offer to install it, then RetroDECK, in the background -->
            <div v-else-if="needFlatpak" class="w-box glass w-prog" style="text-align: left">
              <b>RetroDECK needs Flatpak</b>
              <span class="muted small">RetroDECK only comes as a Flatpak, and Flatpak isn't installed on this system. Cartridge can install Flatpak with your system's own installer, then RetroDECK, while you wait. It needs your device password once; it isn't saved.</span>
              <TextField v-model="devPass" label="Device password" placeholder="Your password for this device" password icon="mdiLock" />
              <div class="row" style="gap: 10px; justify-content: flex-end">
                <button class="btn" data-focus @click="needFlatpak = false">Not now</button>
                <button class="btn primary" data-focus :disabled="!devPass" @click="flatpakThenRetroDeck"><Icon name="mdiPackageDown" />Install Flatpak and RetroDECK</button>
              </div>
            </div>
            <div v-else-if="opened" class="w-box glass w-prog">
              <b>{{ opened === 'emudeck' ? 'EmuDeck is open' : 'RetroDECK is open' }}</b>
              <span class="muted">Pick your emulators there. When it's finished, come back here and press Continue: Cartridge looks again.</span>
            </div>
            <div v-else class="w-box stack">
              <button class="lrow" data-focus @click="getEmuDeck">
                <Icon name="mdiDownload" :size="26" />
                <div class="l-mid"><b>EmuDeck <span class="status ok">Recommended</span></b><span class="l-sub">Cartridge downloads EmuDeck's official app and opens it. You pick emulators there and EmuDeck installs them.</span></div>
              </button>
              <button class="lrow" data-focus @click="getRetroDeck">
                <Icon name="mdiPackageDown" :size="26" />
                <div class="l-mid"><b>RetroDECK</b><span class="l-sub">Installed from Flathub with a progress bar (works in Game Mode), then opened for its own setup.</span></div>
              </button>
              <button class="lrow" data-focus @click="picking = true">
                <Icon name="mdiPackageDown" :size="26" />
                <div class="l-mid"><b>Cartridge Installer</b><span class="l-sub">Cartridge sets it up for you: an Emulation folder on the drive you pick, then the emulators you tick, each from its own releases, with saves and textures linked in like EmuDeck.</span></div>
              </button>
              <button class="lrow" data-focus @click="next()">
                <Icon name="mdiHandBackRight" :size="26" />
                <div class="l-mid"><b>I'll set up emulators myself</b><span class="l-sub">The system scan finds whatever is installed.</span></div>
              </button>
            </div>
            <div class="w-act">
              <button class="btn" data-focus :disabled="!!getting" @click="prev"><Icon name="mdiArrowLeft" />Back</button>
              <button v-if="opened" class="btn primary" data-focus @click="recheck">Continue<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
        </template>

        <!-- 7 -->
        <template v-else-if="step === 'romm'">
          <template v-if="romm === 'signin'">
            <h1>Sign In to RomM</h1>
            <Setup embedded @done="next()" @back="romm = ''" />
          </template>
          <template v-else-if="romm === 'local'">
            <RommLocal @done="only ? close() : next()" @back="only ? close() : (romm = 'what')" />
          </template>
          <template v-else-if="store.config.configured && !store.config.localOnly && romm !== 'change'">
            <h1>RomM</h1>
            <div class="w-good"><Icon name="mdiCheckCircle" :size="28" /><span>Connected to {{ serverName }}</span></div>
            <div class="w-act">
              <button class="btn" data-focus @click="prev"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn" data-focus @click="romm = 'signin'">Change</button>
              <button class="btn primary" data-focus @click="next()">Continue<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else-if="romm === 'what'">
            <h1>What Is RomM?</h1>
            <p class="w-lead">RomM is a free server for your game collection. It keeps your games in one place, finds their covers and details, and lets Cartridge, your browser and other devices download them. Cartridge is built around it and works best with one.</p>
            <div class="w-box stack">
              <button class="lrow" data-focus @click="romm = 'local'">
                <Icon name="mdiServer" :size="26" />
                <div class="l-mid"><b>Set up RomM on this device</b><span class="l-sub">Cartridge does it for you in the background. You choose your own RomM username and password.</span></div>
              </button>
              <button class="lrow" data-focus @click="romm = 'other'">
                <Icon name="mdiMonitor" :size="26" />
                <div class="l-mid"><b>Set it up on another computer</b><span class="l-sub">A home server or an always-on PC. Scan a QR code for RomM's guide.</span></div>
              </button>
              <button class="lrow" data-focus @click="romm = 'without'">
                <Icon name="mdiFolderPlayOutline" :size="26" />
                <div class="l-mid"><b>Use Cartridge without RomM</b><span class="l-sub">Play the games already on this device. Many features need RomM.</span></div>
              </button>
            </div>
            <div class="w-act"><button class="btn" data-focus @click="romm = ''"><Icon name="mdiArrowLeft" />Back</button></div>
          </template>
          <!-- 0.9.17 (owner): RomM isn't required, but Cartridge works best with it, and this says what's missing -->
          <template v-else-if="romm === 'without'">
            <h1>Without RomM</h1>
            <div class="w-warn"><Icon name="mdiAlertOutline" :size="24" /><span>Cartridge works best with RomM. Without it you miss a lot.</span></div>
            <ul class="w-miss">
              <li><b>No downloads:</b> only games already in your console folders show up</li>
              <li><b>No covers, details or ratings,</b> no recommendations, series or collections</li>
              <li><b>No syncing</b> of trophies, play time or favourites with your other devices</li>
              <li><b>No RetroAchievements links</b> from RomM's game matches</li>
            </ul>
            <p class="w-lead">Steam shortcuts, emulator setup, patches, add-ons and achievements on this device still work. You can connect RomM any time in Settings → RomM.</p>
            <p class="muted small">Games folder: {{ store.config.romsRoot ? short(store.config.romsRoot) : 'not set yet' }}</p>
            <div class="w-act">
              <button class="btn" data-focus @click="romm = 'what'"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn" data-focus @click="pickGamesFolder">{{ store.config.romsRoot ? 'Change games folder' : 'Pick games folder' }}</button>
              <button class="btn primary" data-focus :disabled="!store.config.romsRoot" @click="goLocal">Continue without RomM<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else-if="romm === 'other'">
            <h1>RomM on Another Computer</h1>
            <div class="w-qr glass">
              <div class="qr-img" v-html="guideQr" />
              <div class="stack">
                <b>Scan with your phone</b>
                <p class="muted small">RomM's guide explains the setup step by step. When the server is running, come back and pick "Yes, Sign In".</p>
                <p class="small mono">{{ ROMM_GUIDE }}</p>
              </div>
            </div>
            <div class="w-act">
              <button class="btn" data-focus @click="romm = 'what'"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn" data-focus @click="next()">Later</button>
              <button class="btn primary" data-focus @click="romm = 'signin'">Yes, Sign In</button>
            </div>
          </template>
          <template v-else>
            <h1>Do You Have a RomM Server?</h1>
            <p class="w-lead">Your games, covers and progress come from RomM.</p>
            <div class="w-act w-act-c">
              <button class="btn" data-focus @click="prev"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn" data-focus @click="romm = 'what'">No</button>
              <button class="btn primary" data-focus @click="romm = 'signin'">Yes, Sign In</button>
            </div>
          </template>
        </template>

        <!-- 8 -->
        <template v-else-if="step === 'scan'">
          <p class="w-lead w-scan-lead">Let us scan your system. Everything here can be changed later in Settings → Emulators.</p>
          <!-- your games and console folders, games already in Steam, anything that needs a look (0.9.16) -->
          <div class="w-scan-extra">
            <button v-if="store.config.configured" class="lrow" data-focus @click="consoleFolders">
              <Icon name="mdiFolderMultipleOutline" :size="24" />
              <div class="l-mid"><b>Games and console folders</b><span class="l-sub">{{ store.config.romsRoot ? short(store.config.romsRoot) : 'No games folder yet' }}<template v-if="folders.total"> · {{ folders.found }} of {{ folders.total }} console folders found</template></span></div>
              <span class="l-end">Fix a match</span>
            </button>
            <button v-if="theirs.total" class="lrow" data-focus :disabled="busy" @click="takeOverAll">
              <Icon name="mdiSteam" :size="24" />
              <div class="l-mid"><b>Already in Steam: {{ theirs.total }} game{{ theirs.total === 1 ? '' : 's' }} you added yourself</b><span class="l-sub">Bring them under Cartridge so they start the same way as the rest (play time, collections and artwork stay), or leave them as they are.</span></div>
              <span class="l-end">{{ busy ? 'Working…' : 'Bring them under Cartridge' }}</span>
            </button>
            <div v-if="issues.length" class="lrow">
              <Icon name="mdiAlertCircleOutline" :size="24" />
              <div class="l-mid"><b>{{ issues.length }} thing{{ issues.length === 1 ? '' : 's' }} to look at</b><span class="l-sub">{{ issues.slice(0, 2).map((i) => i.text).join(' · ') }}. All of them are in Settings → Emulators → Issues.</span></div>
            </div>
          </div>
          <EmuSetup welcome @done="next()" @back="prev" class="w-emu" />
        </template>

        <!-- 9 -->
        <template v-else-if="step === 'extras'">
          <h1>Optional Extras</h1>
          <p class="w-lead">All of these can be added later in Settings.</p>
          <div class="w-box stack">
            <div class="subh">SteamGridDB</div>
            <p class="muted small">A free key from steamgriddb.com (Preferences → API) gives every game its logo and better Steam artwork.</p>
            <div v-if="store.config.sgdbKey" class="w-good"><Icon name="mdiCheckCircle" :size="22" /><span>Key saved</span></div>
            <TextField v-else v-model="sgdb" label="SteamGridDB API key" placeholder="Paste your key" password icon="mdiKeyVariant" />
            <div class="subh" style="margin-top: 10px">Nexus Mods</div>
            <p class="muted small">Mods from Nexus Mods show without a key. A Premium account’s personal API key (nexusmods.com → your profile → API Keys) downloads them in one press.</p>
            <div v-if="store.config.nexusKey" class="w-good"><Icon name="mdiCheckCircle" :size="22" /><span>Key saved</span></div>
            <TextField v-else v-model="nexus" label="Nexus Mods API key" placeholder="Paste your key" password icon="mdiKeyVariant" />
            <div class="subh" style="margin-top: 10px">RetroAchievements</div>
            <div v-if="store.config.ra?.user" class="w-good"><Icon name="mdiCheckCircle" :size="22" /><span>Signed in as {{ store.config.ra.user }}</span></div>
            <template v-else>
              <p class="muted small">Your username and the web API key from retroachievements.org → Settings → Authentication. Your password isn't needed.</p>
              <div class="grid2">
                <TextField v-model="raUser" label="Username" placeholder="Your username" icon="mdiAccount" />
                <TextField v-model="raKey" label="Web API key" placeholder="Paste your key" password icon="mdiKeyVariant" />
              </div>
            </template>
          </div>
          <div class="w-act">
            <button class="btn" data-focus @click="prev"><Icon name="mdiArrowLeft" />Back</button>
            <button class="btn primary" data-focus :disabled="busy" @click="saveExtras">{{ sgdb || nexus || (raUser && raKey) || store.config.sgdbKey || store.config.nexusKey || store.config.ra?.user ? 'Next' : 'Skip' }}<Icon name="mdiArrowRight" /></button>
          </div>
        </template>

        <!-- 0.9.24 (owner): Syncthing, after the extras. Main server first, then this device, then the folder -->
        <template v-else-if="step === 'sync'">
          <!-- 0.9.49 (owner): first how to sync. Cartridge Save Sync (saves on your RomM, built in 0.9.51) or Syncthing -->
          <template v-if="sy === ''">
            <h1>Sync Your Saves</h1>
            <p class="w-lead">Keep your saves the same on every device you play on. Choose how.</p>
            <div class="w-box stack">
              <button class="lrow" data-focus :aria-pressed="store.config.saveSync === 'cartridge'" @click="pickCartSync">
                <Icon name="mdiCloudSyncOutline" :size="26" />
                <div class="l-mid"><b>Cartridge Save Sync</b><span class="l-sub">Your saves on your own RomM server, checked before every game and saved after it, like Steam Cloud. Nothing else to install.</span></div>
                <span v-if="store.config.saveSync === 'cartridge'" class="tick-ok" title="Chosen"><Icon name="mdiCheck" :size="14" /></span>
              </button>
              <button class="lrow" data-focus @click="sy = 'st'">
                <Icon name="mdiSyncCircle" :size="26" />
                <div class="l-mid"><b>Syncthing</b><span class="l-sub">Syncs folders straight between your devices, no server or account. Cartridge can install and set it up, or read the one you already use.</span></div>
              </button>
            </div>
            <div class="w-act">
              <button class="btn" data-focus @click="prev"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn primary" data-focus @click="next()">{{ store.config.saveSync === 'cartridge' ? 'Continue' : 'Skip' }}<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else-if="sy === 'st'">
            <h1>Sync With Syncthing</h1>
            <p class="w-lead">Syncthing keeps your saves the same on all your devices. It runs on your own devices, with no cloud account. Cartridge finds every game's saves and shows what's synced.</p>
            <div class="w-box stack">
              <!-- 0.9.29 (owner): setting Syncthing up for saves is only for a new Syncthing, said plainly here -->
              <button class="lrow" data-focus @click="syWant = 'saves'; syncDevice()">
                <Icon name="mdiContentSaveMoveOutline" :size="26" />
                <div class="l-mid"><b>Sync My Saves Between My Devices</b><span class="l-sub">Cartridge installs Syncthing if needed and sets it up for your saves. Only for a new Syncthing: one you already use is never changed.</span></div>
              </button>
              <button class="lrow" data-focus @click="syWant = ''; sy = 'have'">
                <Icon name="mdiSyncCircle" :size="26" />
                <div class="l-mid"><b>I Already Use Syncthing</b><span class="l-sub">Cartridge reads it to show which games are synced, and changes nothing</span></div>
              </button>
            </div>
            <div class="w-act">
              <button class="btn" data-focus @click="sy = ''"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn primary" data-focus @click="next()">Skip<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else-if="sy === 'have'">
            <h1>Your Syncthing</h1>
            <p class="w-lead">Cartridge only reads it. Nothing in your setup is changed.</p>
            <div class="w-box stack">
              <p class="muted small" style="margin: 0">Do you have a main Syncthing server, like a PC or NAS that keeps everything?</p>
              <button class="lrow" data-focus @click="sy = 'server'">
                <Icon name="mdiServerNetwork" :size="26" />
                <div class="l-mid"><b>Yes, connect to it</b><span class="l-sub">Its address and API key, from its web page (Actions → Settings → General)</span></div>
              </button>
              <button class="lrow" data-focus @click="syncDevice">
                <Icon name="mdiCellphoneLink" :size="26" />
                <div class="l-mid"><b>No, just this device</b><span class="l-sub">Cartridge checks for Syncthing here</span></div>
              </button>
            </div>
            <div class="w-act">
              <button class="btn" data-focus @click="sy = 'st'"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn primary" data-focus @click="next()">Skip<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else-if="sy === 'saves'">
            <h1>Your Saves, Everywhere</h1>
            <p class="w-lead">Make this your main device, or join the one you set up first. Your saves stay in each emulator's own folder; Syncthing keeps them the same.</p>
            <div class="w-box stack"><SaveSync /></div>
            <div class="w-act">
              <button class="btn" data-focus @click="sy = 'st'"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn primary" data-focus @click="next()">Continue<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else-if="sy === 'server'">
            <h1>Your Main Server</h1>
            <p class="w-lead">Cartridge reads it to show what's synced across your devices. Nothing on it is changed.</p>
            <div class="w-box stack">
              <TextField v-model="srv.address" label="Address" placeholder="192.168.1.20:8384" icon="mdiServerNetwork" />
              <TextField v-model="srv.apikey" label="API key" placeholder="Paste its key" password icon="mdiKeyVariant" />
            </div>
            <div class="w-act">
              <button class="btn" data-focus @click="sy = 'st'"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn primary" data-focus :disabled="busy || !srv.address || !srv.apikey" @click="saveServer">{{ busy ? 'Checking…' : 'Connect' }}<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
          <template v-else-if="sy === 'device'">
            <h1>Syncthing on This Device</h1>
            <div v-if="!syst" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking for Syncthing…</div>
            <template v-else-if="syst.running">
              <div class="w-good"><Icon name="mdiCheckCircle" :size="28" /><span>Syncthing is running here</span></div>
              <p class="w-lead">Next, the folder it keeps in sync.</p>
            </template>
            <template v-else-if="syst.installed">
              <p class="w-lead">{{ syst.why }}</p>
              <TextField v-if="syst.needsKey" v-model="syKey" label="Syncthing API key" placeholder="Paste its key" password icon="mdiKeyVariant" />
            </template>
            <template v-else>
              <p class="w-lead">Syncthing isn't on this device yet. Cartridge can install it for you from Flathub, for your user only (no password). It sits in the tray and starts with your desktop.</p>
              <div v-if="syPct !== null" class="w-box glass w-prog"><div class="bar live"><i :style="{ width: syPct + '%' }" /></div><span class="muted small">{{ syPct }}%</span></div>
            </template>
            <div class="w-act">
              <button class="btn" data-focus @click="sy = 'st'"><Icon name="mdiArrowLeft" />Back</button>
              <button v-if="syst && syst.running && syWant === 'saves'" class="btn primary" data-focus @click="sy = 'saves'">Continue<Icon name="mdiArrowRight" /></button>
              <button v-else-if="syst && syst.running" class="btn primary" data-focus @click="syncFolders">Choose a Folder<Icon name="mdiArrowRight" /></button>
              <button v-else-if="syst && syst.installed" class="btn primary" data-focus :disabled="busy" @click="syKey ? saveSyKey() : syncDevice()">{{ syKey ? 'Use This Key' : 'Check Again' }}</button>
              <template v-else-if="syst">
                <button class="btn" data-focus @click="next()">Skip</button>
                <button class="btn primary" data-focus :disabled="busy" @click="installSync"><Icon name="mdiDownload" />{{ busy ? 'Installing…' : 'Install Syncthing' }}</button>
              </template>
            </div>
          </template>
          <template v-else-if="sy === 'folder'">
            <h1>Choose the Folder</h1>
            <p class="w-lead">This folder is shared in Syncthing on this device. Share it with your other devices from Syncthing afterwards.</p>
            <div class="w-box stack">
              <button v-for="(f, i) in syFolders" :key="f.path" class="lrow" data-focus @click="useFolder(f.path, f.label)">
                <Icon :name="i === 0 ? 'mdiStar' : 'mdiFolderOutline'" :size="26" />
                <div class="l-mid"><b>{{ f.label }}{{ i === 0 ? ' (recommended)' : '' }}</b><span class="l-sub">{{ f.sub }} · {{ f.path }}</span></div>
              </button>
              <button class="lrow" data-focus @click="customFolder">
                <Icon name="mdiFolderSearchOutline" :size="26" />
                <div class="l-mid"><b>Another folder</b><span class="l-sub">Pick any folder on this device</span></div>
              </button>
            </div>
            <div class="w-act">
              <button class="btn" data-focus @click="sy = 'device'"><Icon name="mdiArrowLeft" />Back</button>
              <button class="btn primary" data-focus @click="next()">Skip<Icon name="mdiArrowRight" /></button>
            </div>
          </template>
        </template>

        <!-- 11 -->
        <template v-else-if="step === 'done'">
          <div class="w-good w-done"><Icon name="mdiCheckCircle" :size="72" /></div>
          <h1 class="w-big">{{ name.trim() ? `You're All Set, ${name.trim()}` : "You're All Set" }}</h1>
          <p class="w-lead">{{ store.config.configured ? 'Your library is on its way.' : 'Connect to RomM when you\'re ready and your library comes in.' }}</p>
          <div class="w-act"><button class="btn primary xl" data-focus @click="finish">Start<Icon name="mdiArrowRight" /></button></div>
        </template>
      </section>
    </Transition>
    </div>
    <div v-if="input.mode === 'pad' && !intro" class="w-hints"><span><Btn b="A" />Select</span><span v-if="at > 0 && !only"><Btn b="B" />Back</span></div>
  </div>
</template>

<script setup>
// The welcome (0.9.15, plan section 0): new installs, and Settings → About → Run the welcome again.
// A replay starts from the current settings: done steps show a green check, nothing is reset, and
// leaving halfway keeps everything as it was.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { store, call, saveConfig, toast, tab, confirm, openModal, choose, pickFolder, loadLibrary , activeTabs, openTour } from '../store.js';
import { focusFirst, input } from '../nav.js';
import { useView } from '../useView.js';
import Logo from '../components/Logo.vue';
import WelcomeIntro from '../components/WelcomeIntro.vue';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import TextField from '../components/TextField.vue';
import SaveSync from '../components/SaveSync.vue';
import Setup from './Setup.vue';
import EmuSetup from './EmuSetup.vue';
import EmuGet from '../components/EmuGet.vue';
import RommLocal from '../components/RommLocal.vue';
import { padInfo, detectPad, padKind } from '../pad.js';
import { THEMES, STYLES, styleOf, paletteOf, autoColors } from '../themes.js';
import { BACKGROUNDS, RENDERERS, bgPreview } from '../bgRenderers.js';

// 0.9.52 (owner): RomM first (the rest needs it), your name with the look, Controls only with a controller of your own,
// Cartridge in Steam on the Steam step, and the Game Mode screen on the very first desktop launch only. The plan is fixed
// once at the start (pad and Steam are read first), so a step never shifts under you.
const ALL_STEPS = ['hello', 'gamemode', 'romm', 'look', 'pad', 'emus', 'scan', 'steam', 'sync', 'extras', 'done'];
const plan = ref({ gamemode: false, pad: true });
const STEPS_C = computed(() => ALL_STEPS.filter((s) => (s !== 'gamemode' || plan.value.gamemode) && (s !== 'pad' || plan.value.pad)));
const ROMM_GUIDE = 'https://docs.romm.app/latest/getting-started/quick-start/'; // RomM's setup guide (owner: not the docs home)
const el = ref(null);
const at = ref(0), dir = ref(1);
const step = computed(() => STEPS_C.value[at.value]);
const replay = !!store.config.welcomed;
// Settings → RomM → Set up RomM on this device opens just that step, on the same background
const only = store.welcoming === 'romm-local';
function close() { store.welcoming = false; }
const st = ref({ steam: false, live: { on: false, flag: false }, emudeck: false, retrodeck: false, inSteam: false, appimage: false, gamescope: false, host: '', device: '' });
const name = ref(store.config.ui.name || '');
const padOk = ref(false), liveDone = ref(false), selfDone = ref(false), busy = ref(false);
const getting = ref(''), opened = ref(''), progress = ref(null);
const romm = ref('');
const sgdb = ref(''), nexus = ref(''), raUser = ref(''), raKey = ref('');
const guideQr = ref('');

const deviceName = computed(() => `${name.value.trim()}'s ${st.value.device || 'device'}`);
// RomM has no server name of its own, so the name picked for RomM on this device is Cartridge's label for it
const serverName = computed(() => { const s = store.config.server || {}; if (store.config.rommLocal?.name && s.localUrl && s.localUrl.includes(':' + store.config.rommLocal.port)) return store.config.rommLocal.name; try { return new URL(s.localUrl || s.remoteUrl).host; } catch { return 'your RomM server'; } });

function go(i, d) { dir.value = d; at.value = Math.max(0, Math.min(STEPS_C.value.length - 1, i)); }
function next() { romm.value = ''; sy.value = ''; picking.value = false; go(at.value + 1, 1); }
function prev() { romm.value = ''; sy.value = ''; picking.value = false; go(at.value - 1, -1); }

// the Look step: the same writes as Settings' pickStyle/pickTheme, so both stay in step
function pickStyle(k) { saveConfig({ ui: { style: k, surface: k === 'glass' ? 'glass' : 'solid', elements: k } }); }
function pickTheme(k) {
  const ui = store.config.ui, light = !!THEMES[k]?.light, dock = ui.dockColor;
  const dockColor = light && dock === 'black' ? 'white' : !light && dock === 'white' && THEMES[ui.theme]?.light ? 'black' : undefined;
  saveConfig({ ui: { theme: k, gameTheme: null, ...(dockColor ? { dockColor } : {}), ...autoColors(k, ui) } }); // Light: black parts, OLED: white (0.9.56)
}
// the animated ones and Still (game artwork and wallpapers need a library or a file, so they stay in Settings)
const LOOK_BGS = BACKGROUNDS.filter((b) => b.group === 'Theme' || b.v === 'solid');
const lookBg = computed(() => (store.welcomeBg ? store.config.ui.bgStyle : 'ribbons') || 'ribbons');
const bgPics = computed(() => { const pal = paletteOf(store.config.ui), o = {}; if (step.value !== 'look') return o; for (const b of LOOK_BGS) if (RENDERERS[b.v]) o[b.v] = bgPreview(b.v, pal, 192, 108); return o; });
// the welcome shows Ribbons until a background is picked here (Background.vue reads store.welcomeBg)
async function pickBg(v) { store.welcomeBg = true; await saveConfig({ ui: { bgStyle: v } }); }

async function saveName() {
  const n = name.value.trim().slice(0, 40);
  const patch = { ui: { name: n } };
  if (n && !(store.config.trophies?.device || '').trim()) patch.trophies = { device: deviceName.value };
  await saveConfig(patch);
  next();
}
// what's in use right now: the controller Linux reports (pad.js reads /proc/bus/input/devices), or
// the keyboard, touch or mouse, from the last thing pressed (0.9.17)
const using = ref(input.mode === 'pad' ? 'pad' : 'mouse');
const USING_ICON = { pad: 'mdiController', xbox: 'mdiMicrosoftXboxController', playstation: 'mdiSonyPlaystation', nintendo: 'mdiNintendoSwitch', steam: 'mdiSteam', keys: 'mdiKeyboardOutline', touch: 'mdiGestureTap', mouse: 'mdiMouse' };
const LABELS = [{ v: 'auto', l: 'Auto' }, { v: 'xbox', l: 'Xbox' }, { v: 'playstation', l: 'PlayStation' }, { v: 'nintendo', l: 'Nintendo' }, { v: 'steam', l: 'Steam' }];
const usingText = computed(() => {
  if (using.value === 'keys') return 'Using a keyboard';
  if (using.value === 'touch') return 'Using touch';
  if (using.value === 'mouse') return 'Using a mouse';
  const n = padInfo.value?.name;
  return n ? `${n} found` : input.padName ? 'Controller found' : 'Waiting for a controller…';
});
watch(() => input.mode, (m) => { if (m === 'pad') using.value = 'pad'; });
const onKeyUse = (e) => { if (e.isTrusted && !/^(Gamepad|Unidentified)/.test(e.key)) using.value = 'keys'; };
const onPointerUse = (e) => { using.value = e.pointerType === 'touch' ? 'touch' : 'mouse'; };
// A from a controller counts; touch, mouse and keyboard just go on
let padT = null;
function padPress() {
  if (padOk.value || input.mode !== 'pad' || !input.padName) return next();
  padOk.value = true; padT = setTimeout(next, 700);
}
async function liveOn() {
  try { await call('steam:liveEnable'); liveDone.value = true; toast('Instant Steam changes are on. They work after Steam restarts once.', 'ok', 4500, 'mdiSteam'); }
  catch (e) { toast(e.message, 'error'); }
}
let off = null;
async function getEmuDeck() {
  if (st.value.gamescope) return toast("EmuDeck's app opens as a desktop window: switch to Desktop Mode for this step, then open Cartridge there. It picks up where you left off.", 'info', 7000, 'mdiMonitor');
  getting.value = 'emudeck'; progress.value = null;
  try { await call('welcome:emudeck'); opened.value = 'emudeck'; }
  catch (e) { toast(e.message, 'error', 6000); }
  getting.value = '';
}
const needFlatpak = ref(false), devPass = ref('');
async function getRetroDeck() {
  getting.value = 'retrodeck'; progress.value = null;
  try { await call('welcome:retrodeck'); opened.value = 'retrodeck'; }
  catch (e) { if (/Flatpak isn't installed/i.test(e.message)) needFlatpak.value = true; else toast(e.message, 'error', 6000); }
  getting.value = '';
}
async function flatpakThenRetroDeck() {
  getting.value = 'flatpak'; progress.value = null;
  try { await call('welcome:flatpak', { password: devPass.value }); needFlatpak.value = false; devPass.value = ''; toast('Flatpak is installed. Now RetroDECK…', 'ok', 3000, 'mdiPackageDown'); }
  catch (e) { devPass.value = ''; getting.value = ''; return toast(e.message, 'error', 7000); }
  await getRetroDeck();
}
const picking = ref(false), egPhase = ref('');
// without RomM: the games folder (a folder per console), then a library built from it
async function pickGamesFolder() {
  const dir = await pickFolder({ title: 'Your games folder (the one with a folder per console)', start: store.config.romsRoot || store.info?.home });
  if (dir) await saveConfig({ romsRoot: dir });
}
async function goLocal() {
  await saveConfig({ localOnly: true, configured: true });
  try { const r = await call('library:sync'); await loadLibrary(); toast(`${r?.total || 0} games found on this device`, 'ok', 3000, 'mdiFolderPlayOutline'); } catch (e) { toast(e.message, 'error', 5000); }
  next();
}
const intro = ref(false);
async function recheck() { await load(); opened.value = ''; picking.value = false; next(); }
async function saveExtras() {
  busy.value = true;
  try {
    if (sgdb.value.trim()) await saveConfig({ sgdbKey: sgdb.value.trim() });
    if (nexus.value.trim()) { await call('nexus:check', { key: nexus.value.trim() }); await saveConfig({ nexusKey: nexus.value.trim() }); }
    if (raUser.value.trim() && raKey.value.trim()) {
      const r = await call('ra:signin', { user: raUser.value.trim(), key: raKey.value.trim() });
      store.config = await call('config:get');
      toast(`Signed in to RetroAchievements as ${r.user}`, 'ok', 2600, 'mdiTrophy');
    }
    next();
  } catch (e) { toast(e.message, 'error', 5000); }
  busy.value = false;
}
// Syncthing (0.9.24): main server, this device (install when missing), then the folder it shares
const sy = ref(''), syWant = ref(''), syst = ref(null), syKey = ref(''), syPct = ref(null), syFolders = ref([]);
const srv = ref({ address: store.config.syncthing?.server?.address || '', apikey: '' });
async function saveServer() {
  busy.value = true;
  try { await call('sync:setServer', { address: srv.value.address.trim(), apikey: srv.value.apikey.trim() }); toast('Connected to your main server', 'ok', 3000, 'mdiServerNetwork'); syncDevice(); }
  catch (e) { toast(e.message, 'error', 5000); }
  busy.value = false;
}
async function syncDevice() {
  sy.value = 'device'; syst.value = null;
  syst.value = await call('sync:status').catch((e) => ({ installed: false, why: e.message }));
  setTimeout(() => focusFirst(el.value?.querySelector('.w-step') || el.value, '.w-act .btn.primary'), 320); // after the step's own focus: the answer brings the button to press
}
async function saveSyKey() {
  busy.value = true;
  try { syst.value = await call('sync:setKey', { key: syKey.value }); syKey.value = ''; } catch (e) { toast(e.message, 'error', 5000); }
  busy.value = false;
}
async function installSync() {
  busy.value = true; syPct.value = 0;
  const off = window.cart.on('sync-install', (d) => { syPct.value = d.pct; });
  try {
    syst.value = await call('sync:install');
    // keep it running in Game Mode too (0.9.28)
    await call('sync:service', { enable: true }).catch(() => {});
    if (!syst.value.running) toast('Syncthing is installed. It may take a moment to start.', 'info', 5000);
  }
  catch (e) { toast(e.message, 'error', 6000); }
  off?.(); busy.value = false; syPct.value = null;
}
async function pickCartSync() {
  try { await call('savesync:set', { on: store.config.saveSync !== 'cartridge' }); store.config = await call('config:get'); }
  catch (e) { toast(e.message, 'error', 6000); } // Syncthing already syncs this device's saves: one or the other
}
async function syncFolders() { syFolders.value = await call('sync:suggest').catch(() => []); sy.value = 'folder'; }
async function useFolder(dir, label) {
  try { const r = await call('sync:addFolder', { dir, label }); toast(r.existed ? 'Syncthing already shares that folder' : `Syncthing now shares ${dir}`, 'ok', 3500, 'mdiFolderSyncOutline'); next(); }
  catch (e) { toast(e.message, 'error', 5000); }
}
async function customFolder() { const d = await pickFolder({ title: 'The folder Syncthing keeps in sync', start: store.info?.home }); if (d) useFolder(d); }
// the first desktop launch (0.9.52): add to Steam, wait until Steam is back and has Cartridge, then close
const gm = ref(''), gmText = ref('');
async function gmAdd() {
  try {
    const s0 = await call('steam:status');
    gm.value = 'adding'; gmText.value = s0.running ? 'Adding to Steam. Steam closes and opens again…' : 'Adding to Steam…';
    await call('steam:add', { restartSteam: true });
    if (s0.running) {
      gmText.value = 'Waiting for Steam to open again…';
      for (let i = 0; i < 90; i++) { const s = await call('steam:status').catch(() => ({})); if (s.running && s.added) break; await new Promise((r) => setTimeout(r, 1000)); }
    }
    gm.value = 'done';
    await saveConfig({ ui: { welcomeStep: '' } }); // the setup starts from the top in Game Mode
    setTimeout(() => call('app:quit'), 3200);
  } catch (e) { gm.value = ''; toast(e.message, 'error', 7000); }
}
async function addSelf() {
  try {
    const s = await call('steam:status');
    if (s.running && !(await confirm('Close and reopen Steam?', 'Steam has to restart to pick up the new shortcut. Anything open in Steam will close.', 'Restart Steam and add'))) return;
    busy.value = true;
    await call('steam:add', { restartSteam: true });
    selfDone.value = true;
    toast('Cartridge is in Steam', 'ok', 3500, 'mdiSteam');
  } catch (e) { toast(e.message, 'error', 6000); }
  busy.value = false;
}
// Done: the card lifts away, then the main page fades in under it (0.9.16)
const leaving = ref(false);
async function finish() {
  leaving.value = true;
  // no RomM picked, but a games folder: open on the games already here instead of an empty app (0.9.17)
  if (!store.config.configured && store.config.romsRoot) { await saveConfig({ localOnly: true, configured: true }); call('library:sync').then(() => loadLibrary()).catch(() => {}); }
  await saveConfig({ welcomed: Date.now(), ui: { welcomeStep: '' } });
  await new Promise((r) => setTimeout(r, 420));
  store.welcoming = false;
  // 0.9.24 (owner): onboarding ends on Start, with a short tour of it
  if (store.config.configured) tab(activeTabs().includes('start') ? 'start' : 'home');
  if (!store.config.ui.toured) { await openTour({ start: activeTabs().includes('start') }); saveConfig({ ui: { toured: true, startTips: 1 } }); }
}
async function leave() {
  if (only) return close();
  if (!replay && !(await confirm('Skip the setup?', 'You can run it again any time from Settings → About.', 'Skip'))) return;
  if (!replay) await saveConfig({ welcomed: 'skipped', ui: { welcomeStep: '' } });
  store.welcoming = false;
  if (store.config.configured) tab(replay ? 'settings' : 'home');
}
async function load() { try { st.value = await call('welcome:state'); } catch {} }
// scan step extras
const theirs = ref({ total: 0, consoles: [] }), issues = ref([]);
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
const folders = computed(() => { const ps = (store.lib?.platforms || []).filter((p) => p.rom_count); return { total: ps.length, found: ps.filter((p) => p.target?.exists).length }; });
async function loadScanExtras() {
  theirs.value = await call('setup:steamTheirs').catch(() => ({ total: 0, consoles: [] }));
  issues.value = await call('issues:list').catch(() => []);
}
async function consoleFolders() {
  const ps = (store.lib?.platforms || []).filter((p) => p.rom_count).sort((a, b) => (a.target?.exists ? 1 : 0) - (b.target?.exists ? 1 : 0) || String(a.display_name).localeCompare(String(b.display_name)));
  const v = await choose({ sheet: true, title: 'Console Folders', message: `Matched inside ${short(store.config.romsRoot) || 'your games folder'} by their usual names.`, options: [
    { label: 'Change the games folder', sub: short(store.config.romsRoot) || 'Not set', value: '__root', icon: 'mdiFolderOpen' },
    ...ps.map((p) => ({ label: p.display_name, sub: `${p.target?.path ? short(p.target.path) : 'No folder'} · ${p.target?.source === 'custom' ? 'Yours' : p.target?.exists ? 'Found' : 'Will be made'}`, value: p.slug, icon: p.target?.exists ? 'mdiFolderCheckOutline' : 'mdiFolderAlertOutline', raw: true })),
  ] });
  if (!v) return;
  if (v === '__root') {
    const dir = await pickFolder({ title: 'Your games folder (the one with a folder per console)', start: store.config.romsRoot || store.info?.home });
    if (dir) await saveConfig({ romsRoot: dir });
  } else {
    const p = ps.find((x) => x.slug === v);
    const dir = await pickFolder({ title: `Folder for ${p.display_name}`, start: p.target?.exists ? p.target.path : store.config.romsRoot || undefined });
    if (!dir) return consoleFolders();
    store.config = await call('config:setPath', { slug: p.slug, path: dir });
  }
  await loadLibrary(); call('installed:rescan').catch(() => {});
  return consoleFolders();
}
async function takeOverAll() {
  if (!(await confirm('Bring them under Cartridge?', `${theirs.value.total} game${theirs.value.total === 1 ? '' : 's'} you added to Steam yourself will start the way Cartridge starts the rest, with the emulator picked for their console. Play time, collections and artwork stay.`, 'Bring them under Cartridge'))) return;
  busy.value = true;
  let done = 0;
  for (const c of theirs.value.consoles) { try { done += (await call('steam:takeOver', { key: c.key }))?.count || 0; } catch (e) { toast(e.message, 'error', 4000); } }
  busy.value = false;
  toast(done ? `${done} game${done === 1 ? '' : 's'} now start through Cartridge` : 'Nothing changed', done ? 'ok' : 'info', 3500, 'mdiSteam');
  await loadScanExtras();
}

const handlers = { back: () => { if (step.value === 'emus' && picking.value) { picking.value = false; return; } /* 0.9.28: Back leaves the installer, not the step */ if (step.value === 'romm' && romm.value) { romm.value = romm.value === 'other' || romm.value === 'local' || romm.value === 'without' ? 'what' : ''; return; } if (step.value === 'sync' && sy.value) { sy.value = sy.value === 'folder' ? 'device' : sy.value === 'st' ? '' : 'st'; return; } if (at.value > 0) prev(); } };
useView(handlers, [{ b: 'A', label: 'Select' }, { b: 'B', label: 'Back' }]);
// Setup and the scan bring their own buttons; the welcome's come back after them
watch(step, (v) => { if (!replay && !only && v !== 'done') saveConfig({ ui: { welcomeStep: v } }); });
// the installer focuses itself once its drives or list are there; leaving it focuses the step's first choice
watch(picking, async (v) => { await nextTick(); if (!v) setTimeout(() => focusFirst(el.value?.querySelector('.w-step') || el.value, '.w-step [data-focus]'), 120); else setTimeout(() => { const eg = el.value?.querySelector('.eg'); if (eg && !eg.contains(document.activeElement)) focusFirst(eg); }, 120); });
watch(step, async (v) => {
  if (v === 'sync' && store.config.configured && !store.config.localOnly && !store.config.saveSync && !store.config.syncthing?.role) { try { await call('savesync:set', { on: true }); store.config = await call('config:get'); } catch {} }
});
watch([step, romm, sy], async () => {
  if (step.value === 'steam' && st.value.inSteam === false) await load();
  if (step.value === 'scan') loadScanExtras();
  await nextTick(); await nextTick();
  if (!(step.value === 'scan' || (step.value === 'romm' && (romm.value === 'signin' || romm.value === 'local')))) store.viewHandlers = handlers;
  // smart focus (0.9.28, owner: it always landed on Back): the step's main button, else its first choice
  setTimeout(() => { const root = el.value?.querySelector('.w-step') || el.value; if (!root) return; focusFirst(root, root.querySelector('.w-act .btn.primary:not([disabled])') ? '.w-act .btn.primary:not([disabled])' : root.querySelector('.lrow[data-focus], .w-box [data-focus]') ? '.lrow[data-focus], .w-box [data-focus]' : '[data-focus]'); }, 280);
  if (step.value === 'romm' && romm.value === 'other' && !guideQr.value) {
    const QRCode = (await import('qrcode')).default;
    guideQr.value = await QRCode.toString(ROMM_GUIDE, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  }
});
onMounted(async () => {
  // the plan first (0.9.52): the Game Mode screen on the very first desktop launch only; Controls with a controller of
  // your own (not a Steam Deck's built-in one, and not keyboard and mouse alone)
  await Promise.all([load(), detectPad()]);
  const pi = padInfo.value;
  plan.value = {
    gamemode: !replay && !only && !store.config.ui.gameModeAsked && !st.value.gamescope && !st.value.fromSteam,
    pad: !!(pi?.kind ? pi.kind !== 'steam' || /pro|dual|xbox|8bitdo|wireless/i.test(pi.name || '') : input.padName && !/steam deck|28de/i.test(input.padName)),
  };
  if (plan.value.gamemode) saveConfig({ ui: { gameModeAsked: true } }); // asked once, whatever is picked
  if (only) { at.value = STEPS_C.value.indexOf('romm'); romm.value = 'local'; }
  // picks up where it was left (closed halfway, or off to Desktop Mode for EmuDeck), 0.9.16
  else if (!replay && STEPS_C.value.includes(store.config.ui.welcomeStep)) at.value = STEPS_C.value.indexOf(store.config.ui.welcomeStep);
  store.welcoming ||= true;
  if (step.value === 'hello' && !only && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    intro.value = true; // WelcomeIntro ends itself (about 2.8 s)
    const skip = () => { intro.value = false; };
    window.addEventListener('keydown', skip, { once: true, capture: true });
  }
  off = window.cart.on('welcome-progress', (p) => { if (p.percent != null) progress.value = p.percent; });
  window.addEventListener('keydown', onKeyUse, true); window.addEventListener('pointerdown', onPointerUse, true);
  await nextTick(); focusFirst(el.value, '.w-act .btn.primary');
});
onBeforeUnmount(() => { off?.(); clearTimeout(padT); window.removeEventListener('keydown', onKeyUse, true); window.removeEventListener('pointerdown', onPointerUse, true); });
</script>

<style scoped>
.welcome { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.w-top { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-4) var(--s-5); flex: none; }
.w-steps { flex: 1; max-width: 360px; height: 4px; margin: 0 auto; border-radius: 2px; background: rgba(255, 255, 255, 0.14); overflow: hidden; }
.w-steps.hidden { visibility: hidden; }
.w-steps i { display: block; height: 100%; border-radius: inherit; background: #fff; transform-origin: left; transition: transform var(--spring-soft-d) var(--spring-soft); }
/* 0.9.52: the Game Mode screen (first desktop launch) and Cartridge in Steam on the Steam step */
.w-step > .w-gm-icon { width: 112px; }
.w-gm-icon { display: grid; place-items: center; width: 112px; height: 112px; margin: 0 auto 8px; border-radius: 30px; background: rgba(255, 255, 255, 0.06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1); }
.w-gm-icon.ok { color: var(--green-l, #7ee787); }
.w-gm-busy { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--muted); }
.w-self { display: flex; align-items: center; gap: var(--s-3); margin-top: var(--s-4); text-align: left; }
.w-self .l-mid { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.w-self .l-sub { font-size: var(--t-sm); color: var(--muted); }
.w-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0 var(--s-5) calc(var(--s-6) + 28px); } /* room for the A/B hints */
.w-step { width: min(960px, 100%); max-height: 100%; overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: var(--s-4); padding: var(--s-6) var(--s-6) var(--s-6); text-align: center; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45); }
.w-step > * { max-width: 820px; width: 100%; flex: none; }
.w-hello, .w-done { padding-block: calc(var(--s-6) * 1.6); }
.w-step.w-scan, .w-step.w-emus { width: min(1240px, 100%); }
.w-step.w-emus > * { max-width: 1180px; }
/* rows sit one step lighter than the card, as rows do on the page */
.w-step :deep(.lrow:not(:focus):not(.sel)) { background: var(--s2); }
.w-step h1 { font-size: var(--t-2xl); font-weight: 800; letter-spacing: -0.02em; margin: 0; }
.w-big { font-size: calc(var(--t-2xl) * 1.35) !important; }
.w-logo { width: auto !important; margin-bottom: var(--s-2); }
.w-lead { color: var(--muted); font-size: var(--t-md); line-height: 1.55; margin: 0; }
.w-box { text-align: left; }
.w-look { align-items: center; gap: var(--s-2); }
.w-look > .muted:not(.w-look-sub) { margin-top: var(--s-1); }
.w-step.w-look-step { gap: var(--s-3); }
.w-look-sub { text-align: center; }
.w-swatches, .w-bgs { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.w-swatch { position: relative; width: 64px; height: 42px; border-radius: var(--r-md); display: flex; align-items: flex-end; padding: 4px 6px; font-size: 11px; font-weight: 600; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.6); box-shadow: inset 0 0 0 1px rgba(255,255,255,.15); }
.w-swatch i { position: absolute; top: 5px; right: 5px; width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7); }
.w-swatch.ink { color: #1d1e22; text-shadow: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12); }
.w-bg { position: relative; width: 108px; aspect-ratio: 16 / 9; border-radius: var(--r-md); overflow: hidden; background: var(--s2); display: flex; align-items: flex-end; padding: 6px 8px; font-size: var(--t-xs); font-weight: 600; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.7); box-shadow: inset 0 0 0 1px var(--line, rgba(255,255,255,.15)); }
.w-bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.w-bg span { position: relative; }
/* chosen = a light outer ring; focus keeps the app's own white focus (owner: chosen and focused never look alike) */
.w-swatch.on, .w-bg.on { box-shadow: 0 0 0 3px var(--s0), 0 0 0 5px rgba(255, 255, 255, 0.45); }
.pad-mode .w-swatch:focus, .w-swatch:focus-visible, .pad-mode .w-bg:focus, .w-bg:focus-visible { box-shadow: 0 0 0 3px var(--s0), 0 0 0 6px var(--focus); }
:global(body.theme-light .w-bg) { color: #1d1e22; text-shadow: 0 0 6px rgba(255, 255, 255, 0.9); }
:global(body.theme-light .w-swatch.on), :global(body.theme-light .w-bg.on) { box-shadow: 0 0 0 3px var(--s0), 0 0 0 5px rgba(0, 0, 0, 0.35); }
.w-act { display: flex; justify-content: center; gap: var(--s-3); flex-wrap: wrap; margin-top: var(--s-3); }
.w-good { display: flex; align-items: center; justify-content: center; gap: var(--s-2); color: #7ee787; font-weight: 600; font-size: var(--t-md); }
.w-done { color: #7ee787; }
.w-pad { display: flex; flex-direction: column; align-items: center; gap: var(--s-2); padding: var(--s-5); color: var(--muted); transition: color var(--d-2, 0.2s); }
.w-pad.ok { color: #7ee787; }
.w-prog { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-4) var(--s-5); }
.w-qr { display: flex; gap: 20px; align-items: center; padding: 16px; text-align: left; }
.qr-img { width: 190px; height: 190px; flex: none; background: #fff; border-radius: var(--r-md); padding: 8px; }
.qr-img :deep(svg) { width: 100%; height: 100%; display: block; }
.stack { display: flex; flex-direction: column; gap: var(--s-2); }
.grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
.small { font-size: var(--t-sm); margin: 0; line-height: 1.5; }
.mono { font-family: ui-monospace, monospace; word-break: break-all; }
.lrow .status { margin-left: 8px; vertical-align: middle; }
.lrow.sel { background: var(--sel-bg); box-shadow: var(--sel-ring); color: var(--on-sel); }
.w-scan { text-align: left; align-items: stretch; }
.w-scan-extra { display: flex; flex-direction: column; gap: var(--s-2); max-width: 1180px !important; text-align: left; }
.w-scan-extra .l-end { color: var(--muted); font-size: var(--t-sm); white-space: nowrap; }
.w-scan-extra .lrow:focus-visible .l-end, .pad-mode .w-scan-extra .lrow:focus .l-end { color: var(--on-focus-dim, inherit); }
.w-scan-lead { text-align: center; max-width: 1180px !important; }
.w-emu { position: relative !important; inset: auto !important; height: auto !important; overflow: visible !important; padding: 0 !important; text-align: left; max-width: 1180px !important; animation: none !important; }
/* the first screen arrives in a short sequence: the mark, the title, then the rest (0.9.16) */
.w-hello > * { animation: wIn var(--spring-soft-d) var(--spring-soft) both; }
.w-hello > .w-logo { animation-name: wLogo; animation-duration: var(--d-move-slow); }
.w-hello > :nth-child(2) { animation-delay: 0.18s; }
.w-hello > :nth-child(3) { animation-delay: 0.32s; }
.w-hello > :nth-child(4) { animation-delay: 0.46s; }
@keyframes wIn { from { opacity: 0; transform: translateY(18px); } }
@keyframes wLogo { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: none; } } /* CAE: arrives and stops, no wobble (0.9.52) */
.welcome.w-out .w-stage, .welcome.w-out .w-top { transition: opacity var(--fade-slow), transform var(--spring-d) var(--spring); opacity: 0; transform: translateY(-24px) scale(0.97); }
.w-next-enter-active, .w-next-leave-active, .w-prev-enter-active, .w-prev-leave-active { transition: opacity var(--fade-in), transform var(--spring-d) var(--spring); }
.w-next-enter-from, .w-prev-leave-to { opacity: 0; transform: translateX(40px); }
.w-next-leave-to, .w-prev-enter-from { opacity: 0; transform: translateX(-40px); }
@media (prefers-reduced-motion: reduce) { .w-next-enter-active, .w-next-leave-active, .w-prev-enter-active, .w-prev-leave-active { transition: opacity var(--fade-in); transform: none !important; } }
.w-back { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.08); color: inherit; border: 0; flex: none; }
.w-back:focus, .w-back:hover { background: var(--focus); color: var(--on-focus); outline: none; }
.w-hints { position: absolute; left: 0; right: 0; bottom: 14px; display: flex; justify-content: center; gap: 22px; color: var(--muted); font-size: var(--t-sm); pointer-events: none; }
.w-hints > span { display: inline-flex; align-items: center; gap: 8px; line-height: 1; text-box: trim-both cap alphabetic; } /* the word centred on its button, not on its descenders (0.9.24) */
/* the opening (0.9.17): the mark comes into focus inside two rings of light, a glint crosses it, the
   name follows letter by letter, then everything lifts away to the first card */
.welcome.w-intro-on .w-top, .welcome.w-intro-on .w-stage { opacity: 0; }
.welcome:not(.w-intro-on) .w-top, .welcome:not(.w-intro-on) .w-stage { transition: opacity var(--fade-cross); }
.w-warn { display: flex; align-items: center; justify-content: center; gap: 10px; color: #ffd978; font-weight: 600; }
.w-miss { text-align: left; margin: 0 auto; padding-left: 1.2em; display: flex; flex-direction: column; gap: 6px; max-width: 640px !important; color: var(--muted); line-height: 1.45; }
.w-miss b { color: var(--text, #fff); }
</style>
