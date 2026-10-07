<template>
  <div class="start" :class="{ editing, dragging: !!drag, sizing: !!sizing || mode === 'size' }" :data-nodrag="editing || undefined" ref="el"><!-- arranging: fingers move tiles, not the page (0.9.26) -->
    <div v-if="editing" class="st-edit-bar">
      <b>Arrange Start</b>
      <span class="muted">{{ barText }}</span>
      <div class="spacer" />
      <button class="btn small" data-focus data-key="st-page-add" @click="addPage"><Icon name="mdiBookPlusOutline" :size="18" />Add Page</button>
      <button v-if="pages.length > 1" class="btn small" data-focus data-key="st-page-del" @click="removePage"><Icon name="mdiBookRemoveOutline" :size="18" />Remove Page</button>
      <button class="btn small" data-focus data-key="st-reset" @click="resetLayout"><Icon name="mdiRestore" :size="18" />Reset</button>
      <button class="btn small primary" data-focus data-key="st-done" @click="stopEdit"><Icon name="mdiCheck" :size="18" />Done</button>
    </div>
    <div class="st-scroll" data-scroll ref="scroller" @pointerdown="swipeDown">
      <Transition :name="'st-pg-' + pageDir" mode="out-in" @after-enter="afterPage">
      <div class="st-board" :key="page" :data-pg="page" :style="{ height: boardH + 'px' }" @transitionend="tileSettled">
        <!-- arranging: the grid's empty cells show, and where the held tile will land -->
        <div v-if="editing" class="st-slots" aria-hidden="true"><i v-for="c in slots" :key="c.k" :style="c.s" /></div>
        <div v-if="ghost" class="st-ghost" :style="ghost" aria-hidden="true" />

        <button v-for="(t, n) in tiles" :key="t.id" class="st-tile" :class="['t-' + t.type, { picked: mode === 'move' && focusedId === t.id, held: drag?.id === t.id, resized: sizing?.id === t.id || (mode === 'size' && focusedId === t.id), art: isArt(t), leaving: leaving === t.id }]"
          :style="tileStyle(t, n)" data-focus :data-key="'tile-' + t.id" :data-id="t.id" :data-hold="editing ? null : ''"
          @click="openTile(t, $event)" @focus="focusTile(t)" @cart-hold="startEdit(t)" @pointerdown="pDown(t, $event)" @contextmenu.prevent>
          <div class="st-face">

          <!-- Continue playing: the game you played last, its art, logo and when -->
          <template v-if="t.type === 'continue'">
            <template v-if="cur">
              <div class="st-art" :style="{ backgroundImage: bgUrl(artOf(cur)) }" />
              <div class="st-scrim" />
              <div class="st-label on-art">Continue playing</div>
              <div class="st-cp">
                <GameLogo :logo="store.config.ui.logos !== false ? logoOf(cur) : null" :name="cur.name" cls="st-cp-name" :area="Math.min(30000, box(t).pw * box(t).ph * 0.11)" :max-w="Math.min(420, box(t).pw * 0.72)" :max-h="Math.min(120, box(t).ph * 0.3)" />
                <span class="st-cp-when">{{ whenText(cur) }}</span>
                <span v-if="box(t).ph >= 230 && box(t).pw >= 200" class="st-cp-go"><Btn b="A" />{{ store.installed[cur.id] ? 'Continue' : 'Open' }}</span>
              </div>
              <div v-if="playing.length > 1 && box(t).pw >= 280" class="st-dots"><i v-for="(g, i) in playing.slice(0, 5)" :key="g.id" :class="{ on: i === cpIndex }" /></div>
            </template>
            <div v-else class="st-empty"><Icon name="mdiPlayCircleOutline" :size="30" /><b>Nothing played yet</b><span>Games you play show here</span></div>
          </template>

          <!-- Clock: a scene for the time of day -->
          <StartClock v-else-if="t.type === 'clock'" :time="now.time" :ampm="now.ampm" :day="now.dayLine" :hour="now.hour" />

          <!-- Storage: free space on the drive the games live on, and a gauge of how much is left -->
          <template v-else-if="t.type === 'storage'">
            <div class="st-store">
              <div class="st-store-text">
                <div class="st-label">Free Space</div>
                <div class="st-num"><span class="st-big tnum">{{ space ? sizeNum(space.free) : '–' }}</span><span class="st-unit">{{ space ? sizeUnit(space.free) : '' }}</span></div>
                <div class="st-sub">{{ space ? `of ${bytes(space.total)}` : 'Looking…' }}</div>
                <!-- 0.9.24 (owner: empty space when big): what each console's games take up on this device -->
                <div v-if="byCon.length" class="st-store-cons">
                  <!-- 0.9.28 (owner): the console's small icon, its name only where it fits, and only the rows that fit -->
                  <div v-for="c in byCon.slice(0, storeRows(t))" :key="c.name" class="st-store-con"><span class="st-sc-n"><PIcon :p="c.p" :size="16" /><span class="st-sc-name">{{ c.name }}</span></span><i><b :style="{ width: (c.size / byCon[0].size) * 100 + '%' }" /></i><em class="tnum">{{ bytes(c.size) }}</em></div>
                </div>
              </div>
              <div class="st-gauge" :class="{ low: freePct < 10 }">
                <svg viewBox="0 0 100 100" aria-hidden="true"><line v-for="k in GAUGE" :key="k.i" :x1="k.x1" :y1="k.y1" :x2="k.x2" :y2="k.y2" :class="{ on: space && k.i < freePct / 100 * GAUGE.length }" :style="{ '--i': k.i }" /></svg>
                <span class="tnum">{{ space ? Math.round(freePct) : '' }}<small v-if="space">%</small></span>
              </div>
            </div>
          </template>

          <!-- This week: the total, the day you played most, and a bar for each day (today in white) -->
          <template v-else-if="t.type === 'week'">
            <!-- 0.9.32 (owner: "extremely empty at 1x1"): the game you played last, soft behind a small tile -->
            <img v-if="weekArt" class="st-week-bg" :src="weekArt" alt="" />
            <div class="st-week">
              <div class="st-week-text">
                <div class="st-label">Played This Week</div>
                <div class="st-num">
                  <template v-if="weekMin >= 60"><span class="st-big tnum">{{ Math.floor(weekMin / 60) }}</span><span class="st-unit">h</span><template v-if="weekMin % 60"><span class="st-big tnum">{{ weekMin % 60 }}</span><span class="st-unit">m</span></template></template>
                  <template v-else><span class="st-big tnum">{{ weekMin }}</span><span class="st-unit">min</span></template>
                </div>
                <div class="st-sub">{{ weekNote }}</div>
              </div>
              <div class="st-bars">
                <div v-for="(d, i) in week" :key="d.day" class="st-bar" :class="{ today: i === week.length - 1, none: !d.min }" :style="{ '--i': i }">
                  <div class="st-col">
                    <i :style="{ height: d.min ? barH(d.min) + '%' : null }" />
                    <em v-if="i === week.length - 1 && d.min" :style="{ bottom: barH(d.min) + '%' }">{{ shortMin(d.min) }}</em>
                  </div>
                  <span>{{ DOW[d.dow] }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- Consoles: the same cards as the Consoles page, as many as fit -->
          <template v-else-if="t.type === 'consoles'">
            <div class="st-label">Consoles</div>
            <div class="st-cards" :style="cardsGrid(t)">
              <ConsoleCard v-for="p in consoles.slice(0, cardsFor(t).n)" :key="p.id" :p="p" :compact="cardsFor(t).compact" />
            </div>
          </template>

          <!-- Rows of games (0.9.23, owner: redesign how games show in New, Recently played...): the first
               game in front with its art, logo and a line about it; the next ones fanned out beside it -->
          <template v-else-if="COVER_ROWS[t.type]">
            <template v-if="listOf(t).length">
              <Transition name="st-xf"><div :key="rowView(t)[0].id" class="st-row-art" :style="{ backgroundImage: bgUrl(artOf(rowView(t)[0]) || cover(rowView(t)[0], true)) }" /></Transition>
              <div class="st-row-fade" />
              <div class="st-row" :class="{ tall: t.h > 1, narrow: t.w <= 2 }">
                <div class="st-row-info">
                  <div class="st-label"><span class="st-lname">{{ rowName(t) }}</span><span class="st-count">{{ (sel[t.id] || 0) + 1 }} / {{ listOf(t).length }}</span></div>
                  <div class="st-lead-wrap" :style="t.h > 1 ? { height: Math.round(Math.min(56, box(t).ph * 0.16) + 30) + 'px' } : null"><Transition name="st-lead">
                    <div :key="rowView(t)[0].id" class="st-row-lead">
                      <GameLogo :logo="store.config.ui.logos !== false ? logoOf(rowView(t)[0]) : null" :name="rowView(t)[0].name" cls="st-row-name" :area="Math.min(16000, box(t).pw * box(t).ph * 0.07)" :max-w="Math.min(300, box(t).pw * (t.h > 1 ? 0.5 : 0.36))" :max-h="t.h > 1 ? Math.min(56, box(t).ph * 0.16) : Math.min(64, box(t).ph * 0.3)" />
                      <span class="st-sub">{{ firstLine(t.type, rowView(t)[0]) }}</span>
                    </div>
                  </Transition></div>
                </div>
                <TransitionGroup tag="div" name="st-fan" class="st-fan" :style="{ '--n': Math.min(fanN(t), rowView(t).length) }">
                  <img v-for="(r, i) in rowView(t).slice(0, fanN(t))" :key="r.id" class="st-fan-c" :src="cover(r) || BLANK" :style="{ '--i': i }" loading="lazy" alt="" @error="noImg" />
                </TransitionGroup>
              </div>
            </template>
            <template v-else>
              <div class="st-label">{{ rowName(t) }}</div>
              <div class="st-empty small"><span>{{ COVER_ROWS[t.type].empty }}</span></div>
            </template>
          </template>

          <!-- Trophies (0.9.23, owner: a full rework; pin one console's): the newest unlock large, the
               ones before it as a strip of badges, and how many came this week -->
          <template v-else-if="t.type === 'trophies'">
            <div class="st-label"><span class="st-lname">{{ t.console ? consoleFull(t.console) + ' Trophies' : 'Latest Trophies' }}</span><span v-if="achOf(t).week" class="st-count">{{ achOf(t).week }} this week</span></div>
            <template v-if="achOf(t).list.length">
              <!-- 0.9.24 (owner: too much empty space when big): as many unlocks as the tile holds, in columns when wide -->
              <div class="st-tro" :class="{ one: troFor(t).n === 1, feat: troFor(t).feat, across: troFor(t).across, solo: achOf(t).list.length > 1 && troFor(t).n === 1 }">
                <!-- 0.9.28 (owner: big trophy tiles were mostly empty): the newest unlock as a feature card, the rest beside it -->
                <div v-if="troFor(t).feat" class="st-tro-feat">
                  <img v-if="troArt(t)" class="st-tro-fbg" :src="troArt(t)" alt="" />
                  <span class="st-tro-fbadge"><img v-if="achView(t)[0].badge" :src="achView(t)[0].badge" alt="" /><Grade v-else :g="achView(t)[0].grade" :size="54" /></span>
                  <b>{{ achView(t)[0].title }}</b>
                  <span v-if="achView(t)[0].desc" class="st-tro-fd">{{ achView(t)[0].desc }}</span>
                  <span class="st-tro-fg">{{ achView(t)[0].game }}<template v-if="achView(t)[0].t"> · {{ agoShort(achView(t)[0].t) }}</template></span>
                </div>
                <!-- 0.9.32: beside or under it, your games' progress for this console, then more unlocks if there's room -->
                <div v-if="troFor(t).feat" class="st-tro-side">
                  <div v-for="(g, i) in troGamesOf(t).slice(0, troFor(t).side)" :key="g.key" class="st-tro-game" :style="{ '--i': i }">
                    <span class="st-tro-gart"><img v-if="g.art" :src="g.art" alt="" /></span>
                    <span class="st-tro-gt"><b>{{ g.title }}</b><span class="st-tro-bar"><i :style="{ width: Math.round((g.earned / Math.max(1, g.total)) * 100) + '%' }" /></span></span>
                    <span class="st-tro-gn">{{ g.earned }}<small>/{{ g.total }}</small></span>
                  </div>
                  <!-- room left: the unlocks before the newest, by name, then as badges -->
                  <div v-for="(a, i) in achView(t).slice(1, 1 + Math.max(0, troFor(t).side - troGamesOf(t).length - 1))" :key="a.key" class="st-tro-main" :style="{ '--i': i + 2 }">
                    <span class="st-tro-badge"><img v-if="a.badge" :src="a.badge" alt="" /><Grade v-else :g="a.grade" :size="26" /></span>
                    <span class="st-tro-t"><b>{{ a.title }}</b><span>{{ a.game }}<template v-if="a.t"> · {{ agoShort(a.t) }}</template></span></span>
                  </div>
                  <div v-if="achOf(t).list.length > troFor(t).side - troGamesOf(t).length" class="st-tro-mosaic">
                    <span v-for="(a, i) in achView(t).slice(Math.max(1, troFor(t).side - troGamesOf(t).length), Math.max(1, troFor(t).side - troGamesOf(t).length) + 12)" :key="a.key" class="st-tro-mini" :style="{ '--i': i }" :title="a.title"><img v-if="a.badge" :src="a.badge" alt="" /><Grade v-else :g="a.grade" :size="16" /></span>
                  </div>
                </div>
                <div v-else class="st-tro-list" :style="{ gridTemplateColumns: `repeat(${troFor(t).cols}, minmax(0, 1fr))` }">
                  <div v-for="(a, i) in achView(t).slice(troFor(t).feat ? 1 : 0, troFor(t).n + (troFor(t).feat ? 1 : 0))" :key="a.key" class="st-tro-main" :style="{ '--i': i }">
                    <span class="st-tro-badge"><img v-if="a.badge" :src="a.badge" alt="" /><Grade v-else :g="a.grade" :size="26" /></span>
                    <span class="st-tro-t"><b>{{ a.title }}</b><span>{{ a.game }}<template v-if="a.t"> · {{ agoShort(a.t) }}</template></span></span>
                  </div>
                </div>
                <div v-if="achOf(t).list.length > troFor(t).n" class="st-tro-strip">
                  <span v-for="(a, i) in achView(t).slice(troFor(t).n, troFor(t).n + stripN(t))" :key="a.key" class="st-tro-mini" :style="{ '--i': i }" :title="a.title"><img v-if="a.badge" :src="a.badge" alt="" /><Grade v-else :g="a.grade" :size="16" /></span>
                </div>
              </div>
            </template>
            <div v-else class="st-empty small"><span>{{ t.console ? 'No trophies for this system yet' : 'Unlocks from your emulators and RetroAchievements show here' }}</span></div>
          </template>

          <!-- Downloads -->
          <template v-else-if="t.type === 'downloads'">
            <div class="st-label">Downloads</div>
            <template v-if="activeDl.length">
              <div class="st-num"><span class="st-big tnum">{{ dlPct }}</span><span class="st-unit">%</span></div>
              <div class="st-meter"><i :style="{ width: dlPct + '%' }" /></div>
              <div class="st-sub">{{ activeDl.length === 1 ? activeDl[0].name : `${activeDl.length} games` }}</div>
            </template>
            <div v-else class="st-sub st-quiet">Nothing downloading</div>
          </template>

          <!-- Surprise me -->
          <!-- 0.9.23 (owner: redesign Surprise me): three games fanned like cards; reaching the tile deals
               again, and A opens the one in front -->
          <template v-else-if="t.type === 'surprise'">
            <div class="st-deal" :key="dealt">
              <img v-for="(r, i) in deck" :key="r.id" class="st-deal-c" :src="cover(r) || BLANK" :style="{ '--i': i }" alt="" @error="noImg" />
            </div>
            <div class="st-deal-t"><Icon name="mdiDiceMultipleOutline" :size="18" class="st-dice" /><b>Surprise Me</b><span v-if="deck[0] && box(t).pw > 260" class="st-sub">{{ deck[0].name }}</span></div>
          </template>

          <!-- 0.9.23 new widgets: your library in numbers, a game for today, a picture, your own HTML -->
          <template v-else-if="t.type === 'stats'">
            <div class="st-label">Your Library</div>
            <div v-if="t.h >= 2" class="st-band"><img v-for="r in bandOf(t)" :key="r.id" :src="cover(r, true)" alt="" loading="lazy" /></div>
            <div class="st-stats">
              <div><b class="tnum">{{ stats.games }}</b><span>Games</span></div>
              <div><b class="tnum">{{ stats.hours }}</b><span>Hours Played</span></div>
              <div><b class="tnum">{{ stats.device }}</b><span>On This Device</span></div>
              <div><b class="tnum">{{ stats.consoles }}</b><span>Consoles</span></div>
            </div>
          </template>
          <!-- Console Spotlight (0.9.28): a console's games take turns, with their art -->
          <template v-else-if="t.type === 'spotlight'">
            <template v-if="spotOf(t)">
              <Transition name="st-spot"><div :key="spotOf(t).id" class="st-art" :style="{ backgroundImage: bgUrl(t.h > t.w ? cover(spotOf(t), true) : artOf(spotOf(t)) || cover(spotOf(t), true)) }" /></Transition>
              <div class="st-scrim" />
              <div class="st-label on-art">{{ platformById(t.platformId)?.display_name }} Spotlight</div>
              <div class="st-pin">
                <GameLogo :key="spotOf(t).id" :logo="store.config.ui.logos !== false ? logoOf(spotOf(t)) : null" :name="spotOf(t).name" cls="st-pin-name" :area="Math.min(22000, box(t).pw * box(t).ph * 0.12)" :max-w="box(t).pw * 0.7" :max-h="Math.min(110, box(t).ph * 0.32)" />
                <span class="st-mark">{{ store.play[spotOf(t).id]?.min ? playtimeText(store.play[spotOf(t).id].min) + ' played' : '' }}<i v-if="store.installed[spotOf(t).id]" class="st-dev-tick" title="On this device"><Icon name="mdiCheckBold" :size="13" /></i></span>
              </div>
            </template>
            <div v-else class="st-empty small"><span>No games for this console yet</span></div>
          </template>
          <!-- Game Disc or Cartridge (0.9.32): the game as it came, a disc spinning with its cover printed on it, or a
               cartridge with its cover as the label; LB/RB to the next game, A opens it -->
          <template v-else-if="t.type === 'media'">
            <template v-if="mediaOf(t)">
              <div class="st-label"><span class="st-lname">{{ platformById(t.platformId)?.display_name }}</span><span class="st-count">{{ (sel[t.id] || 0) + 1 }} / {{ conList(t.platformId).length }}</span></div>
              <Transition name="st-xf"><div :key="mediaOf(t).id" class="st-media-bg" :class="{ tall: box(t).pw <= box(t).ph * 1.4 }" :style="{ backgroundImage: bgUrl(artOf(mediaOf(t)) || cover(mediaOf(t), true)) }" /></Transition>
              <div class="st-media" :class="[isDisc(t) ? 'disc' : 'cart', { wide: box(t).pw > box(t).ph * 1.4 }]">
                <div class="st-media-stage" @click="ejectMedia($event, t)"><Transition name="st-media"><div :key="mediaOf(t).id" class="st-media-obj" :class="{ dev: store.installed[mediaOf(t).id] }">
                  <div v-if="isDisc(t)" class="st-disc-boost"><div class="st-disc" :style="{ backgroundImage: bgUrl(cover(mediaOf(t), true)) }"><i class="st-disc-sheen" /><i class="st-disc-hub" /></div></div>
                  <div v-else class="st-cart" :style="cartTint(t)"><i class="st-cart-grip" /><div class="st-cart-label" :style="{ backgroundImage: bgUrl(cover(mediaOf(t), true)) }" /></div>
                </div></Transition></div>
                <div class="st-media-t"><b>{{ mediaOf(t).name }}</b><span>{{ store.play[mediaOf(t).id]?.min ? playtimeText(store.play[mediaOf(t).id].min) + ' played' : 'In your library' }}<i v-if="store.installed[mediaOf(t).id]" class="st-dev-tick" title="On this device"><Icon name="mdiCheckBold" :size="11" /></i></span></div>
              </div>
            </template>
            <div v-else class="st-empty small"><span>No games for this console yet</span></div>
          </template>
          <!-- Game Shelf (0.9.42, owner asked for a redesign; option B, a display case): the console's games as cases on a
               lit shelf, spines out with the console's coloured band; the picked one turns out to show its cover -->
          <template v-else-if="t.type === 'shelf'">
            <template v-if="conList(t.platformId).length">
              <div v-if="mediaOf(t)" class="st-shelf-amb" :style="{ backgroundImage: `url(&quot;${cover(mediaOf(t), true)}&quot;)` }" />
              <div class="st-label st-shelf-head">
                <span class="st-lname st-shelf-mark"><ConsoleMark :slug="platformById(t.platformId)?.slug" :label="platformById(t.platformId)?.display_name" /></span><span class="st-count">{{ (sel[t.id] || 0) + 1 }} / {{ conList(t.platformId).length }}</span>
                <span v-if="mediaOf(t)" class="st-shelf-t"><b>{{ mediaOf(t).name }}</b><span>{{ store.play[mediaOf(t).id]?.min ? playtimeText(store.play[mediaOf(t).id].min) + ' played' : 'Not started' }}<i v-if="store.installed[mediaOf(t).id]" class="st-dev-tick" title="On this device"><Icon name="mdiCheckBold" :size="11" /></i></span></span>
              </div>
              <div class="st-shelf" :style="{ '--case': caseOf(t.platformId) }">
                <i class="st-shelf-spot" />
                <div v-for="r in shelfOf(t)" :key="r.id" class="st-spine" :class="{ out: r.id === mediaOf(t)?.id }" @click="pickSpine($event, t, r)">
                  <img class="st-spine-art" :src="cover(r, true) || BLANK" alt="" loading="lazy" @error="noImg" />
                  <span class="st-spine-t">{{ r.name }}</span>
                </div>
                <i class="st-shelf-board" />
              </div>
            </template>
            <div v-else class="st-empty small"><span>No games for this console yet</span></div>
          </template>
          <!-- An Emulator (0.9.28): A opens it -->
          <template v-else-if="t.type === 'emulator'">
            <!-- 0.9.29 (owner: the 1x1 card wasn't scaled): small tiles stack the icon over the name, with the update
                 state as a dot; bigger ones keep the row with version and status -->
            <div v-if="t.emu" class="st-emu" :class="{ small: emuSmall(t) }">
              <span class="st-emu-ic"><EmuIcon :id="t.emu.id" :size="emuIcon(t)" fallback="mdiGamepadVariantOutline" /></span>
              <div class="st-emu-t">
                <b>{{ t.emu.label }}</b>
                <span v-if="!emuSmall(t)">{{ emuOf(t)?.version ? 'Version ' + emuOf(t).version : t.emu.kind === 'flatpak' ? 'Flatpak' : '' }}</span>
                <template v-if="!emuSmall(t)"><span v-if="emuOf(t)?.update" class="status warn">Update ready</span><span v-else-if="emuOf(t)" class="status ok">Up to date</span></template>
              </div>
              <span v-if="emuSmall(t) && emuOf(t)" class="st-emu-dot" :class="emuOf(t).update ? 'warn' : 'ok'" :title="emuOf(t).update ? 'Update ready' : 'Up to date'" />
            </div>
            <div v-else class="st-empty small"><span>Pick an emulator in Arrange (Select)</span></div>
          </template>
          <template v-else-if="t.type === 'cstats'">
            <template v-if="platformById(t.platformId)">
              <div class="st-cs-mark"><ConsoleMark :slug="platformById(t.platformId).slug" :label="platformById(t.platformId).display_name" /></div>
              <div v-if="t.h >= 2" class="st-band fit" :style="{ '--n': bandOf(t).length }"><img v-for="r in bandOf(t)" :key="r.id" :src="cover(r, true)" alt="" loading="lazy" /></div>
              <div class="st-stats cs">
                <div><b class="tnum">{{ cstats(t).games }}</b><span>Games</span></div>
                <div><b class="tnum">{{ cstats(t).hours }}</b><span>Hours Played</span></div>
                <div><b class="tnum">{{ cstats(t).device }}</b><span>On This Device</span></div>
                <div><b class="tnum">{{ cstats(t).unlocks }}</b><span>Unlocks</span></div>
              </div>
            </template>
            <div v-else class="st-empty small"><span>This console isn't in your library any more</span></div>
          </template>
          <template v-else-if="t.type === 'daily'">
            <template v-if="daily">
              <div class="st-art" :style="{ backgroundImage: bgUrl(t.h > t.w ? cover(daily, true) : artOf(daily) || cover(daily, true)) }" />
              <div class="st-scrim" />
              <div class="st-label on-art">Game of the Day</div>
              <div class="st-pin">
                <GameLogo :logo="store.config.ui.logos !== false ? logoOf(daily) : null" :name="daily.name" cls="st-pin-name" :area="Math.min(22000, box(t).pw * box(t).ph * 0.12)" :max-w="box(t).pw * 0.8" :max-h="Math.min(110, box(t).ph * 0.32)" />
                <span class="st-mark"><ConsoleMark :slug="daily.platform_slug" :label="daily.platform_display_name" /><i v-if="store.installed[daily.id]" class="st-dev-tick" title="On this device"><Icon name="mdiCheckBold" :size="13" /></i></span>
              </div>
            </template>
            <div v-else class="st-empty small"><span>Your games show here, one a day</span></div>
          </template>
          <template v-else-if="t.type === 'image'">
            <img v-if="t.src" class="st-img" :src="t.src" alt="" />
            <div v-else class="st-empty small"><Icon name="mdiImagePlus" :size="28" /><span>Choose a picture in Arrange</span></div>
          </template>
          <template v-else-if="t.type === 'html'">
            <iframe v-if="t.src" class="st-html" :src="t.src" sandbox="allow-scripts" tabindex="-1" loading="lazy" title="Your widget" />
            <div v-else class="st-empty small"><Icon name="mdiCodeTags" :size="28" /><span>Add your HTML in Arrange</span></div>
          </template>

          <!-- One game, pinned -->
          <template v-else-if="t.type === 'game'">
            <template v-if="romById(t.romId)">
              <div class="st-art" :style="{ backgroundImage: bgUrl(t.h > t.w ? cover(romById(t.romId), true) : artOf(romById(t.romId))) }" />
              <div class="st-scrim" />
              <!-- 0.9.23 (owner): its logo, not its name in text -->
              <div class="st-pin">
                <GameLogo :logo="store.config.ui.logos !== false ? logoOf(romById(t.romId)) : null" :name="romById(t.romId).name" cls="st-pin-name" :area="Math.min(22000, box(t).pw * box(t).ph * 0.12)" :max-w="box(t).pw * 0.8" :max-h="Math.min(110, box(t).ph * 0.32)" />
                <span class="st-mark"><ConsoleMark :slug="romById(t.romId).platform_slug" :label="romById(t.romId).platform_display_name" /></span>
              </div>
            </template>
            <div v-else class="st-empty small"><span>This game isn't in your library any more</span></div>
          </template>

          <!-- One console, pinned -->
          <template v-else-if="t.type === 'console'">
            <ConsoleCard v-if="platformById(t.platformId)" class="st-fill" :p="platformById(t.platformId)" />
            <div v-else class="st-empty small"><span>This console isn't in your library any more</span></div>
          </template>
          </div>

          <!-- arranging: its size, its edges to drag, and buttons for mouse and touch -->
          <template v-if="editing">
            <span v-if="focusedId === t.id || drag?.id === t.id || sizing?.id === t.id" class="st-size tnum">{{ t.w }} × {{ t.h }}</span>
            <span v-for="e in EDGES" :key="e" class="st-handle" :class="['h-' + e, { on: mode === 'size' && focusedId === t.id && corner.includes(e) && e.length === 2 }]" data-nodrag @pointerdown.stop="hDown(t, e, $event)" />
            <span class="st-ctl" data-nodrag>
              <span v-if="CONFIG[t.type]" class="st-ctl-b" title="Change" @click.stop="configure(t)" @pointerdown.stop><Icon name="mdiPencil" :size="16" /></span>
              <span class="st-ctl-b" title="Remove" @click.stop="removeTile(t)" @pointerdown.stop><Icon name="mdiClose" :size="16" /></span>
            </span>
          </template>
        </button>
        <!-- 0.9.23 (owner: rework the add button): a quiet slot that says what it adds -->
        <button v-if="editing" key="add" class="st-tile st-add" :style="addStyle" data-focus data-key="st-add" @click="addTile">
          <span class="st-add-plus"><Icon name="mdiPlus" :size="22" /></span>
          <span class="st-add-t"><b>Add a Widget</b><span>Games, clocks, pictures and your own</span></span>
        </button>
        <button v-if="!tiles.length && !editing" class="st-blank" data-focus data-key="st-blank" @click="startEdit()"><Icon name="mdiViewGridPlusOutline" :size="34" /><b>An Empty Page</b><span>Select to add widgets to it</span></button>
      </div>
      </Transition>
    </div>
    <!-- the pages at a glance (0.9.24; 0.9.28: L1/R1 in Arrange): A picks a page up, left and right move it -->
    <div v-if="ov" class="st-ov" ref="ovEl">
      <div class="st-ov-head"><b>Pages</b><span class="muted">{{ ov.moving != null ? 'The D-pad moves it, any way. A puts it down.' : 'A picks a page up to move it. B goes back to arranging.' }}</span></div>
      <!-- 0.9.28 (owner): each page in miniature with its real tiles (covers, the clock, pictures, names), and the page
           you carry lifts while the others slide out of its way -->
      <TransitionGroup tag="div" :name="ovJump ? 'st-ovj' : 'st-ovm'" class="st-ov-list">
        <button v-for="(pg, i) in pages" :key="pgKey(pg, i)" class="st-ov-page" :class="{ on: i === page, moving: ov.moving === i, dim: ov.moving != null && ov.moving !== i }" data-focus :data-key="'pg-' + i" @click="ovPick(i)">
          <span class="st-ov-map">
            <!-- 0.9.29 (owner: "it doesn't show the whole actual widgets"): a still copy of the page itself, taken when
                 the overview opens or the page was last left; a page not seen yet keeps the map below -->
            <span v-if="snapOf(pg)" class="st-ov-snap" inert :style="{ width: snapOf(pg).w + 'px', height: snapOf(pg).h + 'px', transform: `scale(${ovW / snapOf(pg).w})` }" v-html="snapOf(pg).html" />
            <template v-else><i v-for="x in pg" :key="x.id" :class="{ pic: !!ovThumb(x).pic }" :style="{ left: (x.x / COLS) * 100 + '%', top: (x.y / ovRows(pg)) * 100 + '%', width: (x.w / COLS) * 100 + '%', height: (x.h / ovRows(pg)) * 100 + '%', backgroundImage: ovThumb(x).pic ? `url('${ovThumb(x).pic}')` : undefined }">
              <span v-if="x.type === 'clock'" class="st-ov-clock">{{ clockShort }}</span>
              <span v-else-if="!ovThumb(x).pic" class="st-ov-tag"><Icon :name="ovThumb(x).icon" :size="14" /><em>{{ ovThumb(x).name }}</em></span>
            </i></template>
          </span>
          <span class="st-ov-n">Page {{ i + 1 }}<em>{{ pg.length }} {{ pg.length === 1 ? 'widget' : 'widgets' }}</em></span>
          <!-- 0.9.49 (owner): four arrows, as a page moves up, down, left and right -->
          <span v-if="ov.moving === i" class="st-ov-carry"><Icon name="mdiArrowAll" :size="16" />Moving</span>
        </button>
        <!-- 0.9.49 (owner): a card after the last page adds one, from here too -->
        <button v-if="ov.moving == null" key="st-ov-add" class="st-ov-page st-ov-addpg" data-focus data-key="pg-add" @click="ovAdd">
          <span class="st-ov-map st-ov-addmap"><span class="st-ov-plus"><Icon name="mdiPlus" :size="30" /></span></span>
          <span class="st-ov-n">Add Page<em>An empty page to fill</em></span>
        </button>
      </TransitionGroup>
    </div>
    <!-- pages (0.9.23, owner: more than one page, switched with the right stick) -->
    <div v-if="pages.length > 1 || editing" class="st-pages" aria-hidden="true">
      <i v-for="(pg, i) in pages" :key="i" :class="{ on: i === page }" @click="goPage(i)" />
    </div>
  </div>
</template>

<script setup>
import { timing } from '../motion.js';
// Start (0.9.19): a menu of tiles the user arranges (owner: inspired by a frontend on someone's device;
// its widget look wasn't wanted, these follow docs/design.md). 0.9.21 (owner: drag to any size, resize
// per edge, smooth weighted motion, more character): tiles sit on an 8-column board at their own place
// (startLayout.js), drawn absolutely so moves and resizes glide; each tile redraws itself for its size.
// Hold A (or press and hold) to arrange. Controller: A picks a tile up and the D-pad moves it, X resizes
// (the D-pad moves a corner, LB/RB pick the corner), Y removes, B is done. Touch and mouse: drag a tile
// to move it, drag an edge or a corner to resize. Saved in config.ui.start.
import { computed, ref, reactive, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { store, heroArt, call, go, tab, openModal, img, cover, logoOf, allRoms, visible, visiblePlatforms, romById, isNew, collections, setBg, backdropOf, wantSharp, bytes, saveConfig, choose, confirm, askText, pickFolder, playtimeText, loadPlay, toast, openTour } from '../store.js';
import { useView } from '../useView.js';
import { recommend } from '../recs.js';
import { ensureFocus, input, pushLayer, focusFirst, rumble } from '../nav.js';
import { sfx } from '../sfx.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import Grade from '../components/Grade.vue';
import GameLogo from '../components/GameLogo.vue';
import ConsoleCard from '../components/ConsoleCard.vue';
import EmuIcon from '../components/EmuIcon.vue';
import PIcon from '../components/PIcon.vue';
import ConsoleMark from '../components/ConsoleMark.vue';
import StartClock from '../components/StartClock.vue';
import { consoleColors } from '../consoleColors.js';
import { TILES, GROUPS, MANY, DEFAULT, valid, COLS, MAX_H, pack, settle, bottom } from '../startTiles.js';

const ROWS = 4; // rows that fill the screen; more scroll
const STEPS = new Set(['fresh', 'recent', 'favs', 'recs', 'cgames', 'trophies', 'surprise', 'media', 'shelf']);
const COVER_ROWS = {
  fresh: { empty: 'Games added to RomM show here' },
  recent: { empty: 'Games you play show here' },
  favs: { empty: 'Mark games as favourites in RomM or on their page' },
  recs: { empty: 'Play a few games and Cartridge suggests more' },
  cgames: { empty: 'No games for this console yet' },
};
// Pages (0.9.23, owner: more than one page, switched with the right stick). The first page stays in
// ui.start.tiles (pinning from a game's page adds there), the others in ui.start.more.
const savedPages = [store.config.ui.start?.tiles || [], ...(store.config.ui.start?.more || [])].map((l) => (Array.isArray(l) ? l : []).filter(valid));
const pages = ref(savedPages.map((l, i) => (l.length ? pack(l.map((t) => ({ ...t }))) : i === 0 ? DEFAULT() : [])));
const page = ref(Math.max(0, Math.min(store.startPage || 0, pages.value.length - 1)));
const tiles = computed({ get: () => pages.value[page.value] || [], set: (v) => { pages.value[page.value] = v; } });
let saveT = 0;
// 0.9.41 (owner: the emulator widget emptied after the emulator closed): the picked emulator (emu) is saved too; it
// lived only in memory, so Start coming back (after a game or an emulator) found the tile without it
const ser = (list) => list.map(({ id, type, x, y, w, h, romId, platformId, src, console: con, emu }) => ({ id, type, x, y, w, h, ...(romId ? { romId } : {}), ...(platformId ? { platformId } : {}), ...(src ? { src } : {}), ...(con ? { console: con } : {}), ...(emu ? { emu } : {}) }));
function save() { clearTimeout(saveT); saveT = setTimeout(() => saveConfig({ ui: { start: { tiles: ser(pages.value[0] || []), more: pages.value.slice(1).map(ser) } } }), 400); }

const el = ref(null), scroller = ref(null);
const editing = ref(false), focusedId = ref(null);
// arranging needs its buttons spelled out, even with the hints strip off (0.9.28)
watch(editing, (v) => { store.forceHints = v; });
const mode = ref(''); // while arranging with a controller: '' | 'move' (picked up) | 'size'
const corner = ref('se'); // which corner the D-pad moves while resizing
const CORNERS = ['se', 'sw', 'nw', 'ne'];
const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const leaving = ref(null);
const isArt = (t) => t.type === 'continue' ? !!cur.value : (t.type === 'spotlight' && !!spotOf(t)) || t.type === 'game' || (t.type === 'daily' && !!daily.value) || (t.type === 'image' && !!t.src);
// a cover that can't be loaded shows the card's own colour instead of a broken picture
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const noImg = (e) => { if (e.target.src !== BLANK) e.target.src = BLANK; };
const bgUrl = (u) => (u ? `url("${String(u).replace(/"/g, '%22')}")` : 'none');
const artOf = (r) => heroArt(r)?.src || ''; // SteamGridDB's hero only, no RomM picture first (0.9.21)
const platformById = (id) => store.lib?.platforms.find((p) => p.id === id) || null;

// ---- the board: cell size from the screen (8 columns, 4 rows fill it), tiles placed in pixels
const geo = reactive({ cw: 120, ch: 150, gap: 16 });
function measure() {
  const s = scroller.value; if (!s) return;
  const cs = getComputedStyle(s);
  const W = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const H = s.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  geo.gap = Math.round(Math.max(10, Math.min(20, window.innerWidth * 0.011)));
  geo.cw = Math.max(40, (W - (COLS - 1) * geo.gap) / COLS);
  geo.ch = Math.max(80, (H - (ROWS - 1) * geo.gap) / ROWS);
}
const px = (t) => ({ x: t.x * (geo.cw + geo.gap), y: t.y * (geo.ch + geo.gap), w: t.w * geo.cw + (t.w - 1) * geo.gap, h: t.h * geo.ch + (t.h - 1) * geo.gap });
const box = (t) => { const r = px(t); return { pw: r.w, ph: r.h }; };
const boardRows = computed(() => bottom(tiles.value) + (editing.value ? 2 : 0));
const boardH = computed(() => Math.max(1, boardRows.value) * (geo.ch + geo.gap) - geo.gap);
function tileStyle(t, n) {
  const r = px(t), d = drag.value?.id === t.id ? drag.value : null;
  return { width: r.w + 'px', height: r.h + 'px', transform: d ? `translate3d(${d.vx}px, ${d.vy}px, 0)` : `translate3d(${r.x}px, ${r.y}px, 0)`, '--n': n };
}
const addStyle = computed(() => { const r = px({ x: 0, y: bottom(tiles.value), w: 2, h: 1 }); return { width: r.w + 'px', height: r.h + 'px', transform: `translate3d(${r.x}px, ${r.y}px, 0)` }; });
const slots = computed(() => {
  const out = [];
  for (let y = 0; y < boardRows.value; y++) for (let x = 0; x < COLS; x++) { const r = px({ x, y, w: 1, h: 1 }); out.push({ k: x + ',' + y, s: { width: r.w + 'px', height: r.h + 'px', transform: `translate(${r.x}px, ${r.y}px)` } }); }
  return out;
});
// where the held or resized tile will land
const ghost = computed(() => {
  const id = drag.value?.id || sizing.value?.id; if (!id) return null;
  const t = tiles.value.find((x) => x.id === id); if (!t) return null;
  const r = px(t); return { width: r.w + 'px', height: r.h + 'px', transform: `translate(${r.x}px, ${r.y}px)` };
});
// how much fits in a tile of this size
// console cards stay near square however the tile is shaped (0.9.24, owner: several consoles looked
// stretched); the grid that gives the biggest cards for the consoles there are wins
function cardsFor(t) {
  const { pw, ph } = box(t), gap = 10, h = ph - 40, want = Math.max(1, consoles.value.length);
  let best = { cols: 1, rows: 1, n: 1, size: 0 };
  for (let rws = 1; rws <= 4; rws++) {
    const ch = (h - gap * (rws - 1)) / rws; if (ch < 70) break;
    const cols = Math.max(1, Math.floor((pw - 40 + gap) / (ch * 1.25 + gap)));
    const n = Math.min(want, cols * rws), cw = Math.min(ch * 1.25, (pw - 40 - gap * (cols - 1)) / cols), size = n * Math.min(cw, ch * 1.25) * ch;
    if (size > best.size) best = { cols, rows: Math.ceil(n / cols), n, size, cw: Math.floor(cw) };
  }
  return { cols: best.cols, rows: best.rows, n: Math.min(24, best.n), cw: best.cw, compact: h / best.rows < 110 };
}
const cardsGrid = (t) => { const c = cardsFor(t); return { gridTemplateColumns: `repeat(${c.cols}, ${c.cw ? c.cw + 'px' : 'minmax(0, 1fr)'})`, gridTemplateRows: `repeat(${c.rows}, minmax(0, 1fr))` }; };
function coversFor(t) { const { pw, ph } = box(t); const area = Math.max(40, ph - 74), rws = Math.max(1, Math.round(area / 190)), coverW = (area / rws) * 0.75 + 10; return { rows: rws, n: Math.min(40, rws * Math.ceil(pw / coverW) + rws) }; }
// how many covers fan out in a row of games: each shows half of itself past the one before
function fanN(t) {
  const { pw, ph } = box(t), pad = Math.min(22, ph * 0.09);
  const h = t.h > 1 ? ph * 0.55 : ph - pad * 2, cw = h * 0.75, fw = t.w <= 2 ? pw - pad * 2 : pw * 0.58;
  return Math.max(1, Math.min(9, Math.floor((fw - cw) / (cw * 0.5)) + 1));
}
// trophies: rows of about 60 px and columns of about 300 px, leaving room for the label and the badge strip
function troFor(t) {
  const { pw, ph } = box(t), pad = Math.min(22, ph * 0.09), h = ph - pad * 2 - 26 - (ph > 200 ? 46 : 0);
  // big tiles (0.9.28): a feature card and a list beside it. 0.9.32 (owner: "look at all this wasted real estate"):
  // any big tile, wide or tall, gets the newest unlock as a card and your games' progress filling the rest
  const feat = achOf(t).list.length > 0 && ((pw >= 560 && ph >= 230) || (pw >= 300 && ph >= 300));
  const across = feat && pw / ph >= 1.25, lw = across ? pw * 0.56 : pw;
  const sideH = across ? h : h - Math.min(ph * 0.42, 210);
  const cols = Math.max(1, Math.min(4, Math.floor(lw / 300))), rows = Math.max(1, Math.floor((feat ? sideH : h) / 62));
  return { cols, rows, n: Math.max(1, cols * rows), feat, across, side: Math.max(1, Math.floor(Math.max(sideH, 60) / 58)) };
}
// the games of a trophy tile with their progress (0.9.32), latest unlock first
const troGames = ref([]);
const troGamesOf = (t) => (t.console ? troGames.value.filter((g) => sameConsole(g.console, t.console)) : troGames.value);
// the newest unlock's game art, behind its card (its cover from the library, else the trophy set's icon, else the badge)
const troArt = (t) => { const a = achView(t)[0]; if (!a) return ''; const g = troGames.value.find((x) => x.title === a.game); return (g && g.art) || a.badge || ''; };
// Console Spotlight (0.9.28): the console's games take turns, a new one every 12 seconds
const spotTick = ref(0);
const spotOf = (t) => { const l = conList(t.platformId); return l.length ? l[(spotTick.value + (t.id.length % 7)) % l.length] : null; };
// An Emulator (0.9.28): its version and whether an update is out, from Settings → Emulators' list
const emuInfo = ref({});
call('emuup:list', {}).then((l) => { const m = {}; for (const u of l || []) m[u.path || u.fp] = u; emuInfo.value = m; }).catch(() => {});
const emuOf = (t) => (t.emu ? emuInfo.value[t.emu.path || t.emu.fp] || null : null);
// a row of covers in tall library tiles (0.9.28, owner: empty space): the console's or library's games, played first
function bandOf(t) {
  const list = (t.type === 'cstats' ? conList(t.platformId) : [...playing.value, ...rowOf('fresh')]).filter((r) => cover(r, true));
  // 0.9.41 (owner: room for more at 2x2, the second cut off at 1x2): as many covers as fit side by side at the size the
  // tile gives them (about 45% of its height, 2:3), never fewer than fit whole, never one cut off
  // the row's height: the tile less its padding, the logo and the stats under it (two lines of two, or one line of four)
  const { pw, ph } = box(t), statsH = pw < 460 ? 120 : 70, markH = Math.min(40, Math.max(18, ph * 0.14)) + 12;
  const h = Math.min(260, Math.max(60, ph - 44 - markH - statsH)), w = h * (2 / 3) + 10;
  const n = pw < 200 ? 1 : Math.max(1, Math.min(12, Math.ceil((pw - 24) / w - 0.25))); // one more, smaller, rather than a quarter of the row empty; one-column tiles show one
  return [...new Map(list.map((r) => [r.id, r])).values()].slice(0, n);
}
const stripN = (t) => Math.max(0, Math.min(12, Math.floor((box(t).pw - 36) / 40)));

// ---- data
const played = ref({});
call('steam:played').then((m) => { played.value = m || {}; }).catch(() => {});
loadPlay();
const lastPlay = (r) => Math.max(played.value[r.id] || 0, store.play[r.id]?.last || 0, r.user?.played || 0);
const roms = computed(() => allRoms().filter(visible));
const playing = computed(() => roms.value.filter((r) => lastPlay(r) || r.user?.playing).sort((a, b) => lastPlay(b) - lastPlay(a)));
const cpIndex = ref(0);
const cur = computed(() => playing.value[Math.min(cpIndex.value, playing.value.length - 1)] || null);
function whenText(r) {
  const t = lastPlay(r);
  const mins = store.play[r.id]?.min || 0;
  if (!t) return mins ? playtimeText(mins) + ' played' : 'Not started';
  const m = Math.round((Date.now() - t) / 6e4);
  const ago = m < 1 ? 'just now' : m < 60 ? `${m} minutes ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : m < 2880 ? 'yesterday' : `${Math.round(m / 1440)} days ago`;
  return `Played ${ago}${mins ? ' · ' + playtimeText(mins) : ''}`;
}
const rows = computed(() => ({
  fresh: [...roms.value].sort((a, b) => (isNew(b) - isNew(a)) || (b.created_at || '').localeCompare(a.created_at || '')),
  recent: playing.value,
  favs: (() => { const f = collections().find((c) => c.favorite && c.mine && !c.smart); return f ? f.rom_ids.map((id) => romById(id)).filter((r) => r && visible(r)) : []; })(),
  recs: recommend(roms.value, { minsOf: (r) => store.play[r.id]?.min || 0, lastPlay }).map((x) => x.rom),
}));
const rowOf = (type) => rows.value[type] || [];
// L1/R1 on a widget with several games or unlocks steps through them (0.9.24, owner: like Continue playing)
const sel = reactive({});
const conList = (pid) => roms.value.filter((r) => r.platform_id === pid).sort((a, b) => (lastPlay(b) - lastPlay(a)) || a.name.localeCompare(b.name));
const listOf = (t) => (t.type === 'cgames' ? conList(t.platformId) : rowOf(t.type));
// Disc or Cartridge (0.9.32): consoles whose games came on discs spin; the rest are cartridges
const DISC = /^(psx|ps|ps2|ps3|ps4|ps5|psp|ngc|gamecube|gc|wii|wiiu|dc|dreamcast|saturn|segacd|sega-cd|xbox|xbox360|xboxone|3do|pc-fx|pcfx|neo-geo-cd|neogeocd|turbografx-cd|tg-cd|pce-cd|cdi|jaguar-cd)$/i;
// the cartridge shell takes the console's own colour (consoleColors), like the Consoles page cards
const cartTint = (t) => { const c = consoleColors(platformById(t.platformId) || {}); return c ? { '--sys-a': c[0] } : null; };
const isDisc = (t) => { const p = platformById(t.platformId); return DISC.test(p?.slug || '') || DISC.test(p?.fs_slug || ''); };
const mediaOf = (t) => { const l = conList(t.platformId); return l[(sel[t.id] || 0) % Math.max(1, l.length)] || null; };
// the shelf shows the spines that fit, with the chosen one in view
// 0.9.42: cases 36px + 5px apart, the turned-out one as wide as its cover at the shelf's height
const shelfOf = (t) => {
  const { pw, ph } = box(t), l = conList(t.platformId), outW = Math.min(pw * 0.36, Math.max(60, ph - 96) * 0.7);
  const n = Math.max(3, Math.floor((pw - 48 - outW) / 41) + 1), i = (sel[t.id] || 0) % Math.max(1, l.length), from = Math.max(0, Math.min(i - Math.floor(n / 3), l.length - n));
  return l.slice(from, from + n);
};
// the band at the top of a case, as the real ones (PS4 blue, PS5 white, Switch red, Xbox green); else the console's colour
const CASE = { ps4: '#1667d8', ps5: '#eef1f5', ps3: '#15171b', ps2: '#15171b', psvita: '#1b56b8', switch: '#e60012', xbox: '#2a8f2a', xbox360: '#6cc72b', xboxone: '#1c8a1c', wii: '#f2f3f5', wiiu: '#0e94d0', '3ds': '#e8eaee', n3ds: '#e8eaee', nds: '#e8eaee', ngc: '#15171b', gc: '#15171b' };
const caseOf = (pid) => { const p = platformById(pid); return CASE[p?.slug] || CASE[p?.fs_slug] || consoleColors(p)?.[0] || '#3a3f47'; };
// the page overview's picture of a tile: a game's cover where the tile shows games, a picture tile's picture,
// else its icon and name (0.9.28)
function ovThumb(x) {
  const T = TILES[x.type] || {};
  let r = null, pic = '';
  try {
    if (x.type === 'game') r = romById(x.romId);
    else if (x.type === 'continue') r = playing.value[0];
    else if (x.type === 'daily') r = daily.value;
    else if (COVER_ROWS[x.type] || x.type === 'cgames') r = listOf(x)[0];
    if (r) pic = cover(r, true) || '';
    if (x.type === 'image' && x.src) pic = x.src;
  } catch {}
  return { pic, icon: T.icon || 'mdiViewDashboardOutline', name: x.type === 'cgames' ? rowName(x) : T.name || '' };
}
const clockShort = computed(() => now.time);
const rowName = (t) => (t.type === 'cgames' ? `${platformById(t.platformId)?.display_name || 'Console'} Games` : TILES[t.type].name);
const rowView = (t) => listOf(t).slice(sel[t.id] || 0);
const achView = (t) => achOf(t).list.slice(sel[t.id] || 0);
// 0.9.33 (owner: console widgets fun and interactive): tap the disc or cartridge and it goes out and the next
// one comes in; tap a spine on the shelf and it slides out, tap it again to open the game. Arranging ignores both.
function ejectMedia(e, t) { if (editing.value) return; e.stopPropagation(); stepTile(t, 1); }
function pickSpine(e, t, r) {
  if (editing.value) return;
  e.stopPropagation();
  const l = conList(t.platformId), i = l.findIndex((x) => x.id === r.id);
  if (i === (sel[t.id] || 0)) return go('game', { romId: r.id });
  sel[t.id] = i; stepped[t.id] = Date.now(); due[t.id] = Date.now() + ROLL_HOLD; sfx.move?.(); focusTile(t);
}
function stepTile(t, d) {
  const n = COVER_ROWS[t.type] ? listOf(t).length : t.type === 'trophies' ? achOf(t).list.length : t.type === 'media' || t.type === 'shelf' ? conList(t.platformId).length : 0;
  if (t.type === 'surprise') { deal(); sfx.move?.(); focusTile(t); return true; }
  if (n < 2) return false;
  sel[t.id] = ((sel[t.id] || 0) + d + n) % n; stepped[t.id] = Date.now(); due[t.id] = Date.now() + ROLL_HOLD; sfx.move?.(); focusTile(t); return true;
}
// Rows of games move on to their next game by themselves (0.9.28, owner: "as if I'm pressing R1", slowly and
// not jarring). One row at a time every ROLL_TICK, each row at most every ROLL_MS, so the screen never
// changes in several places at once. A row you stepped through yourself waits ROLL_HOLD before moving again.
// Still while arranging, while another app is in front, in a pop-up, or with reduced motion.
const ROLL_MS = 20000, ROLL_TICK = 6000, ROLL_HOLD = 45000;
// 0.9.29 (owner: "sometimes it happens, sometimes it doesn't"): each row has its own next time (rows took turns
// from a list that changed under them, so one could wait for minutes); pauses only push the times back
const due = {}, stepped = {};
const startedAt = Date.now();
let rollAt = 0;
function roll() {
  if (store.away || editing.value || drag.value || sizing.value || store.modal || document.hidden || ov.value) { rollAt = Date.now(); return; }
  if (store.route.name !== 'start' || document.body.classList.contains('motion-reduce')) return;
  const now = Date.now();
  if (now - rollAt < ROLL_TICK) return;
  const rows = tiles.value.filter((t) => COVER_ROWS[t.type] && listOf(t).length > 1);
  rows.forEach((t, i) => { if (!due[t.id]) due[t.id] = Math.max(startedAt + ROLL_MS, now) + i * ROLL_TICK; }); // first moves staggered
  const t = rows.filter((x) => now >= due[x.id]).sort((a, b) => due[a.id] - due[b.id])[0];
  if (!t) return;
  sel[t.id] = ((sel[t.id] || 0) + 1) % listOf(t).length;
  due[t.id] = now + ROLL_MS;
  rollAt = now;
}
function firstLine(type, r = rowOf(type)[0]) {
  if (!r) return '';
  // the line under the first game's logo says something about it, not its name again (0.9.23)
  if (type === 'recent') return whenText(r);
  if (type === 'fresh' && r.created_at) { const d = Math.round((Date.now() - Date.parse(r.created_at)) / 864e5); return `${r.platform_display_name} · added ${d < 1 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'}`; }
  if (type === 'recs') return `Try it next · ${r.platform_display_name}`;
  return r.platform_display_name || '';
}
const consoles = computed(() => {
  const mins = {}, inst = {};
  for (const r of roms.value) { mins[r.platform_id] = (mins[r.platform_id] || 0) + (store.play[r.id]?.min || 0); if (store.installed[r.id]) inst[r.platform_id] = (inst[r.platform_id] || 0) + 1; }
  return [...visiblePlatforms()].sort((a, b) => (mins[b.id] || 0) - (mins[a.id] || 0) || (inst[b.id] || 0) - (inst[a.id] || 0) || b.rom_count - a.rom_count);
});
// menus list consoles A to Z (0.9.29, owner); the tiles keep the most played first
const consolesAZ = computed(() => [...consoles.value].sort((a, b) => a.display_name.localeCompare(b.display_name)));

// clock
const now = reactive({ time: '', ampm: '', date: '', day: '', dayLine: '', hour: 12 });
function tick() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatToParts(d);
  now.time = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  now.ampm = parts.find((p) => p.type === 'dayPeriod')?.value || '';
  now.day = d.toLocaleDateString(undefined, { weekday: 'long' });
  now.date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  now.dayLine = `${now.day} ${now.date}`;
  now.hour = d.getHours() + d.getMinutes() / 60;
}
tick();
// storage: the drive your games are on
const space = ref(null);
const loadSpace = () => call('fs:space', store.config.romsRoot || store.info?.home || '/').then((s) => { space.value = s; }).catch(() => {});
const sizeNum = (b) => { const s = bytes(b).split(' '); return s[0]; };
const sizeUnit = (b) => { const s = bytes(b).split(' '); return s[1] || ''; };
// how many console rows fit (0.9.32, owner: the last one sat on the edge): in a tall tile the gauge is above them
const storeRows = (t) => { const { pw, ph } = box(t), tall = pw / ph < 1.2, used = tall ? Math.min(pw, ph * 0.6) + 150 : 160; return Math.max(1, Math.min(8, Math.floor((ph - used) / 28))); };
const byCon = computed(() => {
  const m = {};
  for (const r of roms.value) if (store.installed[r.id]) { const k = r.platform_display_name || r.platform_slug; m[k] ||= { name: k, size: 0, p: { slug: r.platform_slug, fs_slug: r.platform_fs_slug } }; m[k].size += r.fs_size_bytes || 0; }
  return Object.values(m).filter((c) => c.size > 0).sort((a, b) => b.size - a.size);
});
const freePct = computed(() => space.value?.total ? (space.value.free / space.value.total) * 100 : 0);
// the gauge: 36 ticks round a 270 degree arc, open at the bottom
const GAUGE = Array.from({ length: 36 }, (_, i) => {
  const a = (135 + (i / 35) * 270) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { i, x1: 50 + c * 38, y1: 50 + s * 38, x2: 50 + c * 46, y2: 50 + s * 46 };
});
// this week
const week = ref([]);
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const weekMin = computed(() => week.value.reduce((s, d) => s + d.min, 0));
const weekMax = computed(() => Math.max(30, ...week.value.map((d) => d.min)));
// bars leave room above for today's minutes
const barH = (m) => Math.max(8, (m / weekMax.value) * 82);
const shortMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`);
const weekNote = computed(() => {
  const w = week.value, top = w.reduce((b, d, i) => (d.min > (w[b]?.min || 0) ? i : b), -1);
  if (top < 0) return 'Nothing played yet';
  if (top === w.length - 1) return 'Most of it today';
  return 'Most on ' + new Date(2026, 0, 4 + w[top].dow).toLocaleDateString(undefined, { weekday: 'long' });
});
const weekArt = computed(() => { const r = playing.value[0]; return r ? cover(r, true) : ''; });
const loadWeek = () => call('play:week').then((w) => { week.value = w || []; }).catch(() => {});
// latest trophies and achievements
const ach = ref([]);
const raDate = (d) => { const t = new Date(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? '' : 'Z')).getTime(); return isNaN(t) ? 0 : t; };
async function loadAch() {
  const out = [];
  await Promise.all([
    store.config.ra?.user ? call('ra:overview').then((o) => { for (const a of o.recent || []) out.push({ key: 'ra' + a.id + a.date, t: raDate(a.date), badge: img(a.badge), title: a.title, desc: a.description || '', game: a.game, console: a.console || '', open: () => go('ra-game', { gameId: a.gameId }) }); }).catch(() => {}) : null,
    call('trophies:overview').then((o) => { troGames.value = (o.games || []).filter((g) => g.earned && !g.hidden).sort((a, b) => b.last - a.last).map((g) => ({ key: g.key, title: g.title, console: consoleFull(g.short || ''), earned: g.earned, total: g.total, art: g.cover ? img(g.cover) : g.icon, last: g.last, open: () => go('trophy-game', { tkey: g.key }) })); for (const x of o.recent || []) out.push({ key: 'tr' + x.key + x.id, t: x.time || 0, badge: x.icon, grade: x.grade, title: x.name, desc: x.detail || x.desc || '', game: x.game, console: consoleFull(x.short || ''), open: () => go('trophy-game', { tkey: x.key }) }); }).catch(() => {}),
  ]);
  ach.value = out.sort((a, b) => b.t - a.t).slice(0, 60);
}
// one tile's trophies: all, or one console's (0.9.23, owner: pin achievements per console)
// full console names (0.9.29, owner: "PS3" should read PlayStation 3); old saved tiles used the short ones
const FULL = { PS3: 'PlayStation 3', PS4: 'PlayStation 4', Vita: 'PlayStation Vita', X360: 'Xbox 360' };
const consoleFull = (c) => FULL[c] || c;
// RetroAchievements names consoles its own way ("SNES/Super Famicom"): any of its parts matching counts
const conKey = (c) => String(c || '').toLowerCase().replace(/[^a-z0-9/]+/g, '');
const sameConsole = (a, b) => { const x = conKey(consoleFull(a)), y = conKey(consoleFull(b)); return !!x && !!y && (x === y || x.split('/').includes(y) || y.split('/').includes(x)); };
function achOf(t) {
  const list = t.console ? ach.value.filter((a) => sameConsole(a.console, t.console)) : ach.value;
  const wk = Date.now() - 7 * 864e5;
  return { list, week: list.filter((a) => a.t > wk).length };
}
const agoShort = (t) => { const m = Math.round((Date.now() - t) / 6e4); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
// Surprise me: three games dealt like cards, dealt again each time you reach the tile
const deck = ref([]), dealt = ref(0);
function deal() {
  const pool = roms.value; if (!pool.length) { deck.value = []; return; }
  const pick = new Set(), n = Math.min(3, pool.length);
  for (let i = 0; pick.size < n && i < 50; i++) pick.add(pool[Math.floor(Math.random() * pool.length)]);
  deck.value = [...pick]; dealt.value++;
}
watch(() => roms.value.length, (n, was) => { if (n && !was) deal(); }, { immediate: true });
// Game of the day: the same game all day, a new one tomorrow (games with a cover first)
const daily = computed(() => {
  const withArt = roms.value.filter((r) => r.path_cover_small || r.path_cover_large || r.url_cover), list = withArt.length ? withArt : roms.value;
  if (!list.length) return null;
  const d = new Date(), h = Math.imul(d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(), 2654435761) >>> 0;
  return list[h % list.length];
});
function cstats(t) {
  const p = platformById(t.platformId), list = roms.value.filter((r) => r.platform_id === t.platformId);
  const names = new Set(list.map((r) => r.name.toLowerCase()));
  return { games: list.length, device: list.filter((r) => store.installed[r.id]).length, hours: Math.round(list.reduce((n, r) => n + (store.play[r.id]?.min || 0), 0) / 60),
    unlocks: ach.value.filter((a) => names.has(String(a.game || '').toLowerCase()) || (p && a.console && p.display_name.toLowerCase().includes(String(a.console).toLowerCase()))).length };
}
const stats = computed(() => ({
  games: roms.value.length, consoles: visiblePlatforms().length,
  device: roms.value.filter((r) => store.installed[r.id]).length,
  hours: Math.round(Object.values(store.play || {}).reduce((n, p) => n + (p?.min || 0), 0) / 60),
}));
// downloads
const activeDl = computed(() => store.downloads.filter((d) => d.status === 'downloading' || d.status === 'queued'));
const dlPct = computed(() => { const t = activeDl.value.reduce((s, d) => s + (d.total || 0), 0), r = activeDl.value.reduce((s, d) => s + (d.received || 0), 0); return t ? Math.floor((r / t) * 100) : 0; });

// ---- what each tile does
function openTile(t, ev) {
  if (suppressClick) { suppressClick = false; ev?.preventDefault(); return; }
  if (editing.value) return; // arranging: A (accept) and the mouse handle tiles themselves
  const T = t.type;
  if (T === 'continue') return cur.value ? go('game', { romId: cur.value.id }) : tab('library');
  if (T === 'clock') return;
  if (T === 'week') {
    const most = roms.value.filter((r) => store.play[r.id]?.min).sort((a, b) => store.play[b.id].min - store.play[a.id].min);
    if (!most.length) return;
    store.homeLists = { ...(store.homeLists || {}), 'start-most': { id: 'start-most', name: 'Most Played', icon: 'mdiChartBar', rom_ids: most.map((r) => r.id), auto: true, ordered: true, description: 'From Start' } };
    return go('collection', { collectionId: 'start-most' });
  }
  if (T === 'storage') { store.settingsSection = 'storage'; return go('settings'); }
  if (T === 'consoles') return tab('consoles');
  if (T === 'trophies') { const a = achView(t)[0]; return a ? a.open() : tab('achievements'); }
  if (T === 'downloads') return tab('downloads');
  if (T === 'surprise') { const r = deck.value[0]; if (r) go('game', { romId: r.id }); return; }
  if (T === 'daily') return daily.value && go('game', { romId: daily.value.id });
  if (T === 'stats') return tab('library');
  if (T === 'cstats') return platformById(t.platformId) && go('platform', { platformId: t.platformId });
  if (T === 'spotlight') { const r = spotOf(t); return r && go('game', { romId: r.id }); }
  if (T === 'media' || T === 'shelf') { const r = mediaOf(t); return r && go('game', { romId: r.id }); }
  if (T === 'emulator') { if (!t.emu) return; call('emuget:open', t.emu).then(() => toast(`${t.emu.label} is opening`, 'ok', 2500, 'mdiOpenInApp'), (e) => toast(e.message, 'error', 5000)); return; }
  if (T === 'image' || T === 'html') return;
  if (T === 'game') return romById(t.romId) && go('game', { romId: t.romId });
  if (T === 'console') return platformById(t.platformId) && go('platform', { platformId: t.platformId });
  if (COVER_ROWS[T] && sel[t.id]) return go('game', { romId: rowView(t)[0].id }); // stepped to a game: that one
  if (COVER_ROWS[T]) {
    const list = listOf(t);
    if (!list.length) return;
    store.homeLists = { ...(store.homeLists || {}), ['start-' + T]: { id: 'start-' + T, name: rowName(t), icon: TILES[T].icon, rom_ids: list.map((r) => r.id), auto: true, ordered: true, description: 'From Start' } };
    go('collection', { collectionId: 'start-' + T });
  }
}
// the backdrop follows the tile you're on: its game's art, or the last played game's
function focusTile(t) {
  focusedId.value = t.id;
  if (t.type === 'surprise' && !editing.value) deal();
  const r = t.type === 'game' ? romById(t.romId) : t.type === 'continue' ? cur.value : t.type === 'daily' ? daily.value : t.type === 'surprise' ? deck.value[0] : COVER_ROWS[t.type] ? rowView(t)[0] : null;
  if (r) { setBg(backdropOf(r)); wantSharp(r); } else if (cur.value) setBg(backdropOf(cur.value));
  store.hints = hints();
}

// ---- arranging
// 0.9.23 (owner: moving a tile past another and back pushed tiles away and ruined the layout): while a
// tile is held, moved or resized, every other tile is laid out again from where it was when you picked
// it up, so taking a tile back where it was puts everything back as it was.
// CAE (0.9.47, owner): a soft rumble when a tile you moved or resized comes to rest in its place (once per settle)
function tileSettled(e) { if (editing.value && e.target.classList?.contains('st-tile') && e.propertyName === 'transform' && !e.pseudoElement) rumble('settle'); }
let base = null;
function snap() { base = new Map(tiles.value.map((t) => [t.id, { x: t.x, y: t.y, w: t.w, h: t.h }])); }
function relayout(fixedId) {
  if (!base) snap();
  for (const t of tiles.value) if (t.id !== fixedId && base.has(t.id)) Object.assign(t, base.get(t.id));
  settle(tiles.value, fixedId);
}
const barText = computed(() => mode.value === 'move' ? 'Move it with the D-pad. A puts it down.'
  : mode.value === 'size' ? 'The D-pad moves the lit corner. LB and RB pick another corner. A when done.'
  : input.mode === 'pad' ? 'A picks a tile up · X resizes · Y removes' : 'Drag a tile to move it, drag its edges to resize');
function startEdit(t) {
  if (editing.value) return;
  editing.value = true; mode.value = '';
  sfx.accept?.();
  store.hints = hints();
  nextTick(() => focusKey(t ? 'tile-' + t.id : 'st-add'));
}
function stopEdit() {
  if (ov.value) closeOv();
  editing.value = false; mode.value = ''; base = null; settle(tiles.value); save();
  store.hints = hints();
  nextTick(() => ensureFocus(el.value));
}
function setMode(m) { mode.value = mode.value === m ? '' : m; if (mode.value === 'size') corner.value = 'se'; base = null; settle(tiles.value); if (mode.value) snap(); save(); store.hints = hints(); sfx.accept?.(); }
function removeTile(t) {
  const i = tiles.value.indexOf(t);
  leaving.value = t.id; mode.value = '';
  setTimeout(() => {
    tiles.value = tiles.value.filter((x) => x.id !== t.id); leaving.value = null;
    if (t.type === 'image' && t.src) call('start:imageRemove', { url: t.src }).catch(() => {});
    if (t.type === 'html') call('start:html', { id: t.id, html: null }).catch(() => {});
    settle(tiles.value); save();
    toast(`${TILES[t.type].name} removed`, 'info', 2000, 'mdiClose');
    nextTick(() => { const next = tiles.value[Math.min(i, tiles.value.length - 1)]; focusKey(next ? 'tile-' + next.id : 'st-add'); });
  }, 200);
}
async function resetLayout() {
  tiles.value = page.value === 0 ? DEFAULT() : []; mode.value = ''; base = null; save();
  nextTick(() => focusKey('tile-continue'));
}
async function pickGame() {
  for (;;) {
    const from = await choose({ sheet: true, title: 'Pin a Game', options: [
      ...(playing.value.length ? [{ heading: 'Recently Played', label: 'Recently Played', value: '__recent', icon: 'mdiHistory', sub: `${Math.min(30, playing.value.length)} games` }] : []),
      ...consolesAZ.value.map((p, i) => ({ heading: i === 0 ? 'Consoles' : undefined, label: p.display_name, value: p.id, sub: `${p.rom_count} games`, raw: true })),
    ] });
    if (!from) return null;
    const list = from === '__recent' ? playing.value.slice(0, 30) : roms.value.filter((r) => r.platform_id === from).sort((a, b) => a.name.localeCompare(b.name));
    const id = await choose({ sheet: true, title: from === '__recent' ? 'Recently Played' : platformById(from)?.display_name || 'Games', options: [{ label: 'Back', value: '__back', icon: 'mdiArrowLeft' }, ...list.map((r) => ({ label: r.name, value: r.id, img: cover(r), sub: from === '__recent' ? r.platform_display_name : '', raw: true }))] });
    if (id !== '__back') return id;
  }
}
const SUBS = { game: 'Pin one game', console: 'Pin one console', trophies: 'All, or one console’s', image: 'Search 4K wallpapers or GIFs, or use your own', spotlight: 'One console’s games taking turns, with their art', media: 'A console’s game as its disc, spinning, or its cartridge', shelf: 'A console’s games standing on a shelf, spines out', emulator: 'Open an emulator straight from Start', cgames: 'One console’s games in a row', cstats: 'One console in numbers', html: 'Paste HTML, or start from a note or a countdown', daily: 'A new game from your library every day', stats: 'Games, consoles and hours in numbers' };
async function addTile() {
  const have = new Set(tiles.value.map((t) => t.type));
  const tabsOf = GROUPS.map(([label, keys]) => ({ label, options: keys.filter((k) => MANY.has(k) || !have.has(k)).map((k) => ({ label: TILES[k].name, value: k, icon: TILES[k].icon, sub: SUBS[k] || '' })) })).filter((g) => g.options.length);
  const type = await choose({ title: 'Add a Widget', tabs: tabsOf });
  if (!type) return nextTick(() => focusKey('st-add'));
  const [w, h] = TILES[type].size;
  const t = { id: type + '-' + Date.now().toString(36), type, w, h, x: 0, y: bottom(tiles.value) };
  if (type === 'game') {
    // 0.9.24 (owner): Recently Played first, then each console; a console lists its games A to Z
    const id = await pickGame();
    if (!id) return nextTick(() => focusKey('st-add'));
    t.romId = id;
  } else if (type === 'console') {
    const id = await choose({ sheet: true, title: 'Pin a console', options: consolesAZ.value.map((p) => ({ label: p.display_name, value: p.id, sub: `${p.rom_count} games`, raw: true })) });
    if (!id) return nextTick(() => focusKey('st-add'));
    t.platformId = id;
  } else if (CONFIG[type] && !(await configure(t))) return nextTick(() => focusKey('st-add'));
  tiles.value.push(t); settle(tiles.value); save();
  nextTick(() => { focusKey('tile-' + t.id); keepInView(t.id); });
}
// widgets you set up: a picture, your own HTML, or which console's trophies. Returns false when left.
const HTML_NOTE = (text) => `<div style="height:100%;display:flex;align-items:center;padding:6% 8%;box-sizing:border-box;font:600 clamp(14px,9vh,40px)/1.25 Inter,system-ui,sans-serif;letter-spacing:-.01em">${text.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</div>`;
const HTML_COUNT = (title, date) => `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:6% 8%;box-sizing:border-box;font-family:Inter,system-ui,sans-serif"><div style="font-size:clamp(11px,8vh,16px);opacity:.7;font-weight:600">${title.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</div><div id="n" style="font-size:clamp(22px,34vh,96px);font-weight:800;letter-spacing:-.03em;line-height:1"></div></div><script>const t=new Date(${JSON.stringify(date)}+'T00:00:00');function u(){const d=Math.ceil((t-new Date())/864e5);document.getElementById('n').textContent=d>1?d+' days':d===1?'Tomorrow':d===0?'Today':Math.abs(d)+' days ago'}u();setInterval(u,6e4)<\/script>`;
const CONFIG = {
  async image(t) {
    // 0.9.28 (owner): search 4K wallpapers or GIFs right here, or pick a file
    const src = await choose({ sheet: true, title: 'A Picture', options: [
      { label: 'Search 4K Wallpapers', value: 'image', icon: 'mdiImageSearchOutline', sub: 'From Wallhaven, safe for work, 3840 by 2160 or bigger' },
      { label: 'Search GIFs', value: 'gif', icon: 'mdiFilmstrip', sub: 'Moving pictures from Openverse, openly licensed, the biggest first' },
      { label: 'From This Device', value: 'file', icon: 'mdiFolderImage', sub: 'PNG, JPG, WebP, AVIF or GIF' },
    ] });
    if (!src) return false;
    let url = null;
    if (src === 'file') {
      const file = await pickFolder({ title: 'Choose a picture', subtitle: 'PNG, JPG, WebP, AVIF or GIF', start: store.info?.home, files: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] });
      if (!file) return false;
      try { url = await call('start:image', { file }); } catch (e) { toast(e.message, 'error', 5000); return false; }
    } else {
      const q = await askText({ title: src === 'gif' ? 'Search GIFs' : 'Search 4K Wallpapers', placeholder: src === 'gif' ? 'Pixel art rain' : 'Hyrule at night' });
      if (!q) return false;
      const pick = await openModal('imgsearch', { q, kind: src });
      if (!pick) return false;
      try { toast('Getting the picture…', 'info', 2500, 'mdiDownload'); url = await call('start:imageUrl', { url: pick }); } catch (e) { toast(e.message, 'error', 5000); return false; }
    }
    const old = t.src; t.src = url; if (old) call('start:imageRemove', { url: old }).catch(() => {});
    return true;
  },
  async html(t) {
    const kind = await choose({ sheet: true, title: 'Your Own Widget', message: 'It runs on its own, apart from Cartridge, and can’t reach your library or settings.', options: [
      { label: 'Write or Paste HTML', value: 'html', icon: 'mdiCodeTags', sub: 'Any HTML, CSS and JavaScript' },
      { label: 'A Note', value: 'note', icon: 'mdiNoteTextOutline', sub: 'A line of text' },
      { label: 'A Countdown', value: 'count', icon: 'mdiTimerSand', sub: 'Days left until a date' },
    ] });
    if (!kind) return false;
    let html = null;
    if (kind === 'html') html = await askText({ title: 'Your HTML', value: (await call('start:htmlGet', { id: t.id }).catch(() => '')) || '', placeholder: '<h1>Hello</h1>' });
    else if (kind === 'note') { const v = await askText({ title: 'Your note', placeholder: 'Finish Okami this month' }); html = v ? HTML_NOTE(v) : null; }
    else {
      const title = await askText({ title: 'Counting down to', placeholder: 'Holiday' }); if (title == null) return false;
      const date = await askText({ title: 'The date (year-month-day)', placeholder: '2026-12-24' });
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) { if (date != null) toast('Write the date as year-month-day, like 2026-12-24', 'error', 4000); return false; }
      html = HTML_COUNT(title || 'Countdown', date.trim());
    }
    if (!html) return false;
    try { t.src = await call('start:html', { id: t.id, html }); return true; } catch (e) { toast(e.message, 'error', 5000); return false; }
  },
  async cgames(t) { return pickConsole(t); },
  async spotlight(t) { return pickConsole(t); },
  async media(t) { return pickConsole(t); },
  async shelf(t) { return pickConsole(t); },
  // an emulator found on this device, opened from Start (0.9.28)
  async emulator(t) {
    const list = (await call('emuup:list', {}).catch(() => [])).filter((u) => u.kind !== 'windows');
    if (!list.length) { toast('No emulators found on this device yet', 'info', 3500); return false; }
    list.sort((a, b) => a.label.localeCompare(b.label));
    const v = await choose({ sheet: true, title: 'Which Emulator', options: list.map((u, i) => ({ label: u.label, value: String(i), sub: [u.version ? 'Version ' + u.version : '', u.kind === 'flatpak' ? 'Flatpak' : ''].filter(Boolean).join(' · '), raw: true })) });
    if (v == null) return false;
    const u = list[Number(v)];
    t.emu = { id: u.id, label: u.label, kind: u.kind, fp: u.fp || null, path: u.path || null };
    return true;
  },
  async cstats(t) { return pickConsole(t); },
  async trophies(t) {
    // every system with achievements: the trophy consoles, your library's consoles RetroAchievements covers, and any
    // with unlocks; ones without any yet are fine (the tile says so), A to Z (0.9.29, owner)
    const ra = store.config.ra?.user ? await Promise.all((store.lib?.platforms || []).map((p) => call('ra:supported', { slug: p.slug, fs_slug: p.fs_slug }).then((ok) => (ok ? p.display_name : null)).catch(() => null))) : [];
    const names = [...new Set([...Object.values(FULL), ...ra.filter(Boolean), ...ach.value.map((a) => a.console).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const v = await choose({ sheet: true, title: 'Which Trophies', options: [{ label: 'All Consoles', value: '__all', icon: 'mdiTrophyOutline', selected: !t.console }, ...names.map((n) => ({ label: n, value: n, raw: true, selected: t.console === n }))] });
    if (!v) return false;
    if (v === '__all') delete t.console; else t.console = v;
    return true;
  },
};
async function pickConsole(t) {
  const id = await choose({ sheet: true, title: 'Which Console', options: consolesAZ.value.map((p) => ({ label: p.display_name, value: p.id, sub: `${p.rom_count} games`, raw: true, selected: t.platformId === p.id })) });
  if (!id) return false;
  t.platformId = id; delete sel[t.id];
  return true;
}
async function configure(t) {
  const ok = await CONFIG[t.type]?.(t);
  if (ok && tiles.value.includes(t)) save();
  nextTick(() => focusKey('tile-' + t.id));
  return ok;
}
// ---- pages
const pageDir = ref('next');
// still copies of pages for the overview (0.9.29): the board's own elements, cloned without focus targets,
// handles or animations, kept per page layout (a moved or resized tile makes a new copy necessary)
const snaps = reactive(new Map()), ovW = ref(300);
const pageSig = (pg) => pg.map((x) => `${x.id}:${x.x},${x.y},${x.w},${x.h}:${x.src || x.platformId || x.romId || ''}`).sort().join('|');
const snapOf = (pg) => snaps.get(pageSig(pg)) || null;
// the page's own board, settled: not the old page still sliding out, not one of the overview's copies
const boardReady = (i) => { const b = scroller.value?.querySelector(`:scope > .st-board[data-pg="${i}"]`); return b && !/-(enter|leave)-/.test(b.className) ? b : null; };
function snapPage() {
  // 0.9.44 (owner: two pages in the overview showed the same picture): only the board of the page being saved, and not
  // while it slides. A quick second page turn landed during the first one's slide out (out-in), when the only board on
  // screen was still the old page, and its picture was kept under the new page's layout
  const b = boardReady(page.value), pg = pages.value[page.value];
  if (!b || !pg?.length) return;
  const c = b.cloneNode(true);
  // 0.9.49 (owner's photo: "Add widget" bars in some pages' pictures): everything that belongs to arranging comes out,
  // the add-a-widget button, sizes and the edit buttons too, so a page's picture is the page as you use it
  c.querySelectorAll('.st-handle, .st-slot, .st-ghost, .st-slots, .st-add, .st-size, .st-ctl').forEach((n) => n.remove());
  c.querySelectorAll('[data-focus], [tabindex], [data-key], [data-hold]').forEach((n) => { n.removeAttribute('data-focus'); n.removeAttribute('tabindex'); n.removeAttribute('data-key'); n.removeAttribute('data-hold'); });
  c.style.height = '';
  snaps.set(pageSig(pg), { html: c.outerHTML, w: b.offsetWidth, h: Math.max(b.offsetHeight, 1) });
}
const emuSmall = (t) => box(t).pw < 300 || box(t).ph < 150;
const emuIcon = (t) => Math.round(Math.max(28, Math.min(96, emuSmall(t) ? Math.min(box(t).pw, box(t).ph) * 0.42 : box(t).ph * 0.5)));
function goPage(i) {
  if (i === page.value || i < 0 || i >= pages.value.length) return;
  snapPage();
  if (mode.value) setMode('');
  pageDir.value = i > page.value ? 'next' : 'prev';
  page.value = i; store.startPage = i;
  sfx.tab?.(); rumble('tab'); // a page turn is felt, as a tab change is (0.9.24)
}
function afterPage() { if (filling || ov.value) return; afterPageNow(); } // the overview covers the board: focus stays in it
function afterPageNow() { const f = el.value?.querySelector(editing.value && !tiles.value.length ? '[data-key="st-add"]' : '.st-board [data-focus]'); f?.focus({ preventScroll: true }); if (f) focusTile(tiles.value.find((t) => t.id === f.dataset.id) || {}); }
function addPage() { pages.value.push([]); save(); goPage(pages.value.length - 1); }
async function removePage() {
  if (pages.value.length < 2) return;
  if (tiles.value.length && !(await confirm('Remove this page?', `Its ${tiles.value.length} ${tiles.value.length === 1 ? 'widget goes' : 'widgets go'} with it.`, 'Remove', true))) return nextTick(() => focusKey('st-page-del'));
  const i = page.value;
  pageDir.value = 'prev';
  pages.value.splice(i, 1);
  page.value = Math.max(0, i - 1); store.startPage = page.value; save();
}
// the pages overview
const ov = ref(null), ovEl = ref(null);
let ovLayer = null;
// a page's key follows its tiles, not its place, so a page that moves slides there instead of being drawn twice (0.9.28)
const pgKey = (pg, i) => (pg.length ? pg.map((x) => x.id).sort().join('|') : 'empty-' + i);
const ovRows = (pg) => Math.max(4, bottom(pg));
// L1 and R1 pressed together (0.9.29, owner: "sometimes it works, sometimes it doesn't"): one opened the
// overview and the other closed it at once. A press within OV_GUARD of opening or closing counts as the same one.
const OV_GUARD = 250;
let ovAt = 0;
function openOv() {
  if (performance.now() - ovAt < OV_GUARD) return;
  ovAt = performance.now();
  if (ov.value) return closeOv();
  if (mode.value) setMode('');
  snapPage();
  ov.value = { moving: null };
  const here = page.value; // fillSnaps shows other pages behind the overview for a moment
  fillSnaps();
  nextTick(() => {
    const m = ovEl.value?.querySelector('.st-ov-map'); if (m) ovW.value = m.clientWidth;
    ovLayer = pushLayer(ovEl.value, {
      back: () => (ov.value.moving != null ? (ov.value.moving = null) : closeOv()),
      lt() {}, rt() {}, start: closeOv, select() {}, x() {}, y() {}, lb: ovShoulder, rb: ovShoulder,
      left: () => (ov.value.moving != null ? ovMove(-1) : false), right: () => (ov.value.moving != null ? ovMove(1) : false),
      // 0.9.41 (owner): pages on more than one row move up and down too, a whole row at a time
      up: () => (ov.value.moving != null ? ovMove(-ovPerRow()) : false), down: () => (ov.value.moving != null ? ovMove(ovPerRow()) : false),
    });
    focusFirst(ovEl.value, `[data-key="pg-${here}"]`);
  });
}
// 0.9.41 (owner: page 1 showed the placeholder while the others showed their widgets): a page gets its picture when it
// is on screen, so pages not shown since Cartridge started had none. Opening the overview now shows each of those
// pages once, behind it (no animation, focus left alone), and takes its picture
let filling = false;
async function fillSnaps() {
  if (filling) return;
  const want = pages.value.map((pg, i) => (pg.length && !snapOf(pg) ? i : -1)).filter((i) => i >= 0);
  if (!want.length) return;
  filling = true;
  const back = page.value, dir = pageDir.value;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    pageDir.value = 'none';
    for (const i of want) {
      if (!ov.value) break;
      page.value = i;
      // the old board leaves first (out-in, the board's own height transition), so wait for this page's own board
      for (let t = 0; t < 90 && !boardReady(i); t++) await frame();
      await new Promise((r) => setTimeout(r, 140)); // covers already loaded come from the cache
      snapPage();
    }
  } finally {
    const keep = document.activeElement?.dataset?.key; // wherever you have moved to in the overview meanwhile
    page.value = back; await nextTick(); await frame(); pageDir.value = dir;
    filling = false;
    if (ov.value && keep && document.activeElement?.dataset?.key !== keep) focusKey(keep);
  }
}
function ovShoulder() { if (performance.now() - ovAt >= OV_GUARD) { ovAt = performance.now(); closeOv(); } }
function closeOv() {
  ovLayer?.pop(); ovLayer = null; ov.value = null;
  nextTick(() => focusKey(tiles.value[0] ? 'tile-' + tiles.value[0].id : 'st-add'));
}
function ovPick(i) {
  if (ov.value.moving == null) { ov.value.moving = i; sfx.accept?.(); return; }
  ov.value.moving = null; page.value = Math.min(page.value, pages.value.length - 1); save(); sfx.accept?.();
  nextTick(() => focusKey('pg-' + i));
}
// how many page cards sit on one row of the overview (they wrap)
function ovPerRow() { const c = [...(ovEl.value?.querySelectorAll('.st-ov-page:not(.st-ov-addpg)') || [])]; const top = c[0]?.offsetTop; const n = c.filter((x) => x.offsetTop === top).length; return Math.max(1, n); }
// 0.9.49 (owner: with five pages or more, moving a page into another row looked awful): within a row the pages glide
// aside; across rows they trade places with a short fade instead of every card in between flying diagonally
const ovJump = ref(false);
let ovJumpT = 0;
function ovAdd() { pages.value.push([]); save(); sfx.accept?.(); nextTick(() => focusKey('pg-' + (pages.value.length - 1))); }
function ovMove(d) {
  const i = ov.value.moving, j = Math.max(0, Math.min(pages.value.length - 1, i + d));
  if (j === i) { sfx.error?.(); return; }
  const per = ovPerRow();
  ovJump.value = Math.floor(i / per) !== Math.floor(j / per);
  clearTimeout(ovJumpT);
  if (ovJump.value) {
    ovJumpT = setTimeout(() => (ovJump.value = false), 320);
    nextTick(() => { for (const c of ovEl.value?.querySelectorAll('.st-ov-page:not(.st-ov-addpg)') || []) c.animate([{ opacity: 0.35 }, { opacity: 1 }], timing('fade-slow')); });
  }
  const cur = pages.value[page.value];
  // up/down carry the page a row (the ones between shift along by one); left/right swap neighbours
  const list = [...pages.value]; const [m] = list.splice(i, 1); list.splice(j, 0, m); pages.value = list;
  page.value = list.indexOf(cur); ov.value.moving = j; store.startPage = page.value; sfx.move?.();
  nextTick(() => focusKey('pg-' + j));
}
// a sideways swipe on touch turns the page
let sw = null;
function swipeDown(e) {
  if (editing.value || pages.value.length < 2) return;
  sw = { x: e.clientX, y: e.clientY, t: performance.now() };
  window.addEventListener('pointerup', swipeUp, { once: true });
}
function swipeUp(e) {
  if (!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y, quick = performance.now() - sw.t < 700; sw = null;
  if (!quick || Math.abs(dx) < 90 || Math.abs(dy) > Math.abs(dx) * 0.5) return;
  clearTimeout(pressT); suppressClick = true; setTimeout(() => (suppressClick = false), 80);
  goPage(page.value + (dx < 0 ? 1 : -1));
}
// D-pad while a tile is picked up: it trades places with the tile that way, or moves one cell into empty space
function moveTile(dir) {
  const t = tiles.value.find((x) => x.id === focusedId.value); if (!t) return;
  const dx = dir === 'right' ? 1 : dir === 'left' ? -1 : 0, dy = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
  const me = el.value.querySelector(`[data-id="${CSS.escape(t.id)}"]`), a = me.getBoundingClientRect();
  let other = null, score = Infinity;
  for (const n of el.value.querySelectorAll('.st-tile[data-id]')) {
    if (n === me) continue;
    const r = n.getBoundingClientRect();
    const p = dx > 0 ? r.left - a.right : dx < 0 ? a.left - r.right : dy > 0 ? r.top - a.bottom : a.top - r.bottom;
    const across = dx ? Math.max(0, Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top)) : Math.max(0, Math.min(a.right, r.right) - Math.max(a.left, r.left));
    if (p < -4 || p > geo.gap + 4 || across <= 0) continue; // only a tile right next to it
    if (p - across < score) { score = p - across; other = tiles.value.find((x) => x.id === n.dataset.id); }
  }
  if (!base) snap();
  // trading places: the other tile's resting place becomes where this one was
  if (other) { const ox = other.x, oy = other.y; base.set(other.id, { ...base.get(other.id), x: t.x, y: t.y }); t.x = ox; t.y = oy; }
  else { t.x = Math.max(0, Math.min(COLS - t.w, t.x + dx)); t.y = Math.max(0, t.y + dy); }
  relayout(t.id); save();
  sfx.move?.();
  nextTick(() => keepInView(t.id));
}
// D-pad while resizing: the lit corner's edges move that way (one cell)
function sizeTile(dir) {
  const t = tiles.value.find((x) => x.id === focusedId.value); if (!t) return;
  const c = corner.value, before = `${t.x},${t.y},${t.w},${t.h}`;
  if (dir === 'left' || dir === 'right') {
    const d = dir === 'right' ? 1 : -1;
    if (c.includes('e')) t.w = Math.max(1, Math.min(COLS - t.x, t.w + d));
    else { const nx = Math.max(0, Math.min(t.x + t.w - 1, t.x + d)); t.w += t.x - nx; t.x = nx; }
  } else {
    const d = dir === 'down' ? 1 : -1;
    if (c.includes('s')) t.h = Math.max(1, Math.min(MAX_H, t.h + d));
    else { const ny = Math.max(0, Math.min(t.y + t.h - 1, t.y + d)); const nh = t.h + t.y - ny; if (nh <= MAX_H) { t.h = nh; t.y = ny; } }
  }
  if (`${t.x},${t.y},${t.w},${t.h}` === before) { sfx.error?.(); return; }
  relayout(t.id); save();
  sfx.move?.();
  nextTick(() => keepInView(t.id));
}
function focusKey(k) { const n = el.value?.querySelector(`[data-key="${CSS.escape(k)}"]`); if (n) n.focus({ preventScroll: true }); }
function keepInView(id) { el.value?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

// touch and mouse: press and hold a tile to arrange; while arranging, drag a tile to move it and its
// edges to resize it. The tile follows the finger exactly; the others make room as it goes.
let pressT = 0, suppressClick = false;
const drag = ref(null), sizing = ref(null);
function edgeScroll(y) { const s = scroller.value, r = s.getBoundingClientRect(); if (y > r.bottom - 60) s.scrollTop += 14; else if (y < r.top + 60) s.scrollTop -= 14; }
function pDown(t, e) {
  if (e.button && e.button !== 0) return;
  const sx = e.clientX, sy = e.clientY;
  if (!editing.value) {
    clearTimeout(pressT);
    pressT = setTimeout(() => { suppressClick = true; startEdit(t); }, 520);
    const cancel = (ev) => { if (ev.type !== 'pointermove' || Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) { clearTimeout(pressT); off(); } };
    const off = () => { window.removeEventListener('pointermove', cancel); window.removeEventListener('pointerup', cancel); window.removeEventListener('pointercancel', cancel); };
    window.addEventListener('pointermove', cancel, { passive: true }); window.addEventListener('pointerup', cancel); window.addEventListener('pointercancel', cancel);
    return;
  }
  const r0 = px(t), st0 = scroller.value.scrollTop;
  const move = (ev) => {
    if (!drag.value) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return; drag.value = { id: t.id, vx: r0.x, vy: r0.y }; mode.value = ''; snap(); }
    const vx = r0.x + ev.clientX - sx, vy = r0.y + ev.clientY - sy + scroller.value.scrollTop - st0;
    drag.value = { id: t.id, vx, vy };
    const nx = Math.max(0, Math.min(COLS - t.w, Math.round(vx / (geo.cw + geo.gap)))), ny = Math.max(0, Math.round(vy / (geo.ch + geo.gap)));
    if (nx !== t.x || ny !== t.y) { t.x = nx; t.y = ny; relayout(t.id); }
    edgeScroll(ev.clientY);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    if (drag.value) { suppressClick = true; setTimeout(() => (suppressClick = false), 60); drag.value = null; base = null; settle(tiles.value); save(); }
  };
  window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
function hDown(t, edge, e) {
  if (e.button && e.button !== 0) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, g0 = { x: t.x, y: t.y, w: t.w, h: t.h };
  sizing.value = { id: t.id }; mode.value = ''; snap();
  const move = (ev) => {
    const dc = Math.round((ev.clientX - sx) / (geo.cw + geo.gap)), dr = Math.round((ev.clientY - sy) / (geo.ch + geo.gap));
    let { x, y, w, h } = g0;
    if (edge.includes('e')) w = Math.max(1, Math.min(COLS - x, g0.w + dc));
    if (edge.includes('w')) { x = Math.max(0, Math.min(g0.x + g0.w - 1, g0.x + dc)); w = g0.w + g0.x - x; }
    if (edge.includes('s')) h = Math.max(1, Math.min(MAX_H, g0.h + dr));
    if (edge.includes('n')) { y = Math.max(0, Math.max(g0.y + g0.h - MAX_H, Math.min(g0.y + g0.h - 1, g0.y + dr))); h = g0.h + g0.y - y; }
    if (x !== t.x || y !== t.y || w !== t.w || h !== t.h) { Object.assign(t, { x, y, w, h }); relayout(t.id); sfx.move?.(); }
    edgeScroll(ev.clientY);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    sizing.value = null; base = null; suppressClick = true; setTimeout(() => (suppressClick = false), 60); settle(tiles.value); save();
  };
  window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

// ---- controller
const hints = () => editing.value
  ? (mode.value === 'move' ? [{ b: 'A', label: 'Put Down' }, { b: 'B', label: 'Put Down' }]
    : mode.value === 'size' ? [{ b: 'LB+RB', label: 'Corner' }, { b: 'A', label: 'Done' }, { b: 'B', label: 'Done' }]
    : [{ b: 'A', label: 'Pick Up' }, { b: 'X', label: 'Resize' }, ...(CONFIG[focusedTile()?.type] ? [{ b: 'SELECT', label: 'Change' }] : []), { b: 'Y', label: 'Remove' }, { b: 'RS', label: 'Pages' }, { b: 'LB+RB', label: 'All Pages' }, { b: 'B', label: 'Done' }])
  : [{ b: 'A', label: 'Open' }, { b: 'A', label: 'Hold: Arrange' }, ...(pages.value.length > 1 ? [{ b: 'RS', label: 'Pages' }] : []), ...((focusedId.value === 'continue' && playing.value.length > 1) || STEPS.has(tiles.value.find((x) => x.id === focusedId.value)?.type) ? [{ b: 'LB+RB', label: focusedId.value && tiles.value.find((x) => x.id === focusedId.value)?.type === 'trophies' ? 'Unlock' : 'Game' }] : []), { b: 'Y', label: 'Search' }];
const focusedTile = () => tiles.value.find((t) => t.id === document.activeElement?.dataset?.id);
const dirH = (dir) => () => {
  if (!editing.value || !focusedTile()) return false;
  if (mode.value === 'move') { moveTile(dir); return true; }
  if (mode.value === 'size') { sizeTile(dir); return true; }
  return false;
};
const stepCorner = (d) => { corner.value = CORNERS[(CORNERS.indexOf(corner.value) + d + CORNERS.length) % CORNERS.length]; sfx.move?.(); };
const stepGame = (d) => { const n = Math.min(5, playing.value.length); cpIndex.value = (cpIndex.value + d + n) % n; focusTile(focusedTile()); };
useView({
  accept: () => {
    const t = focusedTile();
    if (!editing.value || !t) return false;
    setMode(mode.value ? '' : 'move'); return true;
  },
  hold: () => { const t = focusedTile(); if (t && !editing.value) { startEdit(t); return true; } return false; },
  up: dirH('up'), down: dirH('down'), left: dirH('left'), right: dirH('right'),
  x: () => { const t = focusedTile(); if (editing.value && t) { setMode('size'); return true; } return false; },
  y: () => { if (!editing.value) return false; const t = focusedTile(); if (t) removeTile(t); return true; },
  back: () => { if (!editing.value) return false; if (mode.value) setMode(''); else stopEdit(); return true; },
  // arranging (0.9.28, owner): L1/R1 opens the pages overview; in resize mode it still picks the corner
  lb: () => { if (mode.value === 'size') return stepCorner(-1), true; if (editing.value) return openOv(), true; const t = focusedTile(); if (t?.type === 'continue' && playing.value.length > 1) stepGame(-1); else if (t && !editing.value) stepTile(t, -1); },
  rb: () => { if (mode.value === 'size') return stepCorner(1), true; if (editing.value) return openOv(), true; const t = focusedTile(); if (t?.type === 'continue' && playing.value.length > 1) stepGame(1); else if (t && !editing.value) stepTile(t, 1); },
  rsleft: () => goPage(page.value - 1), rsright: () => goPage(page.value + 1),
  lt: () => (editing.value ? true : false), rt: () => (editing.value ? true : false), // arranging: the tabs stay put
  select: () => { const t = focusedTile(); if (!editing.value || !t || !CONFIG[t.type]) return false; configure(t); return true; },
}, hints);

let clockT = 0, spaceT = 0, ro = null;
let spotT = 0, rollT = 0;
onMounted(async () => {
  clockT = setInterval(tick, 5000);
  spotT = setInterval(() => { if (!store.away) spotTick.value++; }, 12000);
  rollT = setInterval(roll, 1000);
  // 0.9.28 (owner: hints are hidden now, so first-timers get Start's tips once, in a short tour)
  if (store.config.ui.toured && !store.config.ui.startTips) setTimeout(async () => { if (store.modal || store.route.name !== 'start') return; saveConfig({ ui: { startTips: 1 } }); await openTour({ start: true, only: true }); }, 900);
  loadSpace(); spaceT = setInterval(loadSpace, 60000);
  loadWeek(); loadAch();
  measure();
  ro = new ResizeObserver(measure); ro.observe(scroller.value);
  await nextTick();
  ensureFocus(el.value);
});
onBeforeUnmount(() => { store.forceHints = false; clearInterval(clockT); clearInterval(spotT); clearInterval(rollT); clearInterval(spaceT); clearTimeout(pressT); ro?.disconnect(); if (editing.value) { settle(tiles.value); save(); } });
watch(() => store.trophyVer, loadAch);
watch(() => store.play, loadWeek);
</script>

<style scoped>
.start { position: absolute; inset: 0; display: flex; flex-direction: column; animation: viewIn var(--d-slow) var(--ease); }
.st-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: var(--s-4) var(--s-7) var(--s-6); }
.start:has(.st-pages) .st-scroll { padding-bottom: var(--s-3); }
@media (max-width: 1400px) { .st-scroll { padding-left: 36px; padding-right: 36px; } }
/* the board: tiles placed in pixels from their cell (startLayout.js), so moves and resizes glide */
.st-board { position: relative; transition: height var(--spring-soft-d) var(--spring-soft); }
.st-tile { --glide: var(--spring-soft-d) var(--spring-soft); position: absolute; left: 0; top: 0; padding: 0; background: none; border-radius: var(--r-lg); color: var(--text); text-align: left; will-change: transform;
  transition: transform var(--glide), width var(--glide), height var(--glide), opacity var(--fade-in); }
.st-tile:focus-visible, .pad-mode .st-tile:focus { box-shadow: none; }
/* the face carries the look, so the tile itself only moves */
.st-face { position: absolute; inset: 0; display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: clamp(10px, min(9cqh, 7cqw), 22px); border-radius: inherit; background: var(--s1); overflow: hidden; isolation: isolate; container-type: size;
  box-shadow: var(--weight-edge), var(--weight);
  transition: transform var(--spring-d) var(--spring), box-shadow var(--tint), opacity var(--fade-in);
  animation: st-in var(--spring-soft-d) var(--spring-soft) both; animation-delay: calc(min(var(--n, 0), 6) * 30ms); }
/* tiles arrive one after another, rising and settling (0.9.56: 30 ms apart, the last within 180 ms, so a page is whole sooner) */
@keyframes st-in { from { opacity: 0; transform: translateY(18px) scale(0.97); } }
:global(body.motion-reduce .st-face) { animation: none; }
/* focus (0.9.29, owner: choppy on handhelds): the ring and lift shadow sit on the tile's ::before and fade in
   by opacity, and the face lifts on its own layer; animating the face's box-shadow repainted the whole
   tile on every frame without the GPU. Same look, same timing. */
.st-tile::before { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: var(--ring), 0 0 0 8px rgba(0, 0, 0, 0.32), 0 26px 50px -24px rgba(0, 0, 0, 0.85); opacity: 0; transform: translateY(0); transition: opacity var(--fade-in), transform var(--spring-d) var(--spring); pointer-events: none; }
.st-tile:focus-visible::before, .pad-mode .st-tile:focus::before { opacity: 1; transform: translateY(-3px); }
:global(body.theme-light .st-tile::before) { box-shadow: var(--ring), 0 12px 22px -12px rgba(0, 0, 0, 0.45); }
/* 0.9.49 (owner's photos: shadows cut off hard in Light, the Spotlight card and a cover tile): a shadow made for the
   dark colours (long and dark) ran past the board's scrolling edge and the tile's own edge, and on a light page the cut
   shows. Light keeps them short and soft: they end before any edge. */
:global(body.theme-light .st-face :is(.st-band img, .st-cover, .st-deal-c, .st-fan-c, .st-tro-badge, .st-tro-fbadge, .st-tro-gart, .st-disc, .st-cart)) { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12), 0 6px 12px -6px rgba(0, 0, 0, 0.3); }
:global(body.theme-light .st-tile.held .st-face), :global(body.theme-light .st-tile.picked .st-face) { box-shadow: var(--ring), 0 14px 28px -12px rgba(0, 0, 0, 0.35); } /* a white ring vanished on the clock's day sky: a dark edge outside it (dark colours only) */
.editing .st-tile::before { display: none; } /* arranging keeps its own ring on the face */
.st-tile:focus-visible .st-face, .pad-mode .st-tile:focus .st-face { transform: translateY(-3px); }
.st-tile:focus-within .st-face, .st-tile:focus .st-face { will-change: transform; }
/* a soft light passes over a tile when it's reached */
.st-face::after { content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none; background: linear-gradient(var(--glint-a, 110deg), transparent 38%, rgba(255, 255, 255, 0.08) 50%, transparent 62%); transform: translateX(-110%); }
/* the light that passes over a tile you reach comes from a slightly different angle and pace from tile to
   tile, so it never looks stamped (0.9.24) */
.st-tile:nth-child(3n + 1) .st-face::after { --glint-a: 104deg; }
.st-tile:nth-child(3n + 2) .st-face::after { --glint-a: 118deg; animation-duration: 1050ms !important; }
.st-tile:nth-child(3n) .st-face::after { --glint-a: 96deg; animation-duration: 820ms !important; }
.pad-mode .st-tile:focus .st-face::after, .st-tile:focus-visible .st-face::after { animation: st-glint var(--move-slow); }
@keyframes st-glint { to { transform: translateX(110%); } }
:global(body.light-fx .st-face::after) { display: none; }
:global(body.light-fx .st-face) { animation-name: st-fadein !important; }
@keyframes st-fadein { from { opacity: 0; } }
:global(body.motion-reduce .st-face::after) { animation: none !important; }
.st-tile:active .st-face { transform: scale(0.985); transition-duration: var(--press); }
.st-tile.leaving { opacity: 0; }
.st-tile.leaving .st-face { transform: scale(0.9); }

/* arranging: the grid shows, every tile shows its edge; a held tile lifts and follows the finger */
.st-slots i { position: absolute; left: 0; top: 0; border-radius: var(--r-md); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06); background: rgba(255, 255, 255, 0.015); animation: st-fade var(--spring-d) var(--spring) both; }
@keyframes st-fade { from { opacity: 0; } }
.st-ghost { position: absolute; left: 0; top: 0; border-radius: var(--r-lg); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.45); background: rgba(255, 255, 255, 0.05); transition: transform var(--spring-d) var(--spring), width var(--spring-d) var(--spring), height var(--spring-d) var(--spring); pointer-events: none; }
.editing .st-face { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12); }
.editing .st-tile:not(.held):not(.picked) .st-face { transform: scale(0.975); }
.editing .st-tile:focus .st-face, .editing .st-tile:focus-visible .st-face { box-shadow: var(--ring); transform: none; }
.st-tile.held { z-index: 5; transition: width var(--glide), height var(--glide); }
.st-tile.held .st-face, .st-tile.picked .st-face { transform: scale(1.035) rotate(-0.6deg); box-shadow: var(--ring), 0 30px 70px rgba(0, 0, 0, 0.6); }
.st-tile.picked { z-index: 5; }
.st-tile.resized { z-index: 4; }
.editing .st-tile[data-id] { touch-action: none; }
.dragging .st-tile:not(.held) .st-face { opacity: 0.9; }

.st-edit-bar { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-3) var(--s-7) 0; font-size: var(--t-sm); }
.st-edit-bar b { font-family: var(--display); font-size: var(--t-lg); font-weight: 700; }
.st-edit-bar .spacer { flex: 1; }
@media (max-width: 1400px) { .st-edit-bar { padding-left: 36px; padding-right: 36px; } }
/* 0.9.49 (owner's photo: "2 × 2" covered the card's "32 games"): the size sits on the tile's top edge, like a tab,
   over the ring and never over what the tile shows */
.st-size { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); z-index: 6; padding: 3px 10px; border-radius: 999px; background: var(--focus, #fff); color: var(--on-focus, #0c0d10); font-size: var(--t-xs); font-weight: 700; line-height: 16px; white-space: nowrap; pointer-events: none; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
.st-ctl { position: absolute; top: 10px; right: 10px; z-index: 6; display: flex; gap: 6px; }
.pad-mode .st-ctl { display: none; }
.st-ctl-b { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: rgba(12, 13, 16, 0.82); color: #fff; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18); }
/* edges and corners to drag (mouse and touch); with a controller only the lit corner shows */
.st-handle { position: absolute; z-index: 6; touch-action: none; }
.st-handle::before { content: ''; position: absolute; inset: -10px; } /* a bigger target for fingers */
.st-handle::after { content: ''; position: absolute; inset: 0; border-radius: 999px; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); opacity: 0.85; transition: transform var(--spring-snappy-d) var(--spring-snappy), opacity var(--fade-in); }
.st-handle:hover::after { transform: scale(1.25); opacity: 1; }
.h-n, .h-s { left: calc(50% - 18px); width: 36px; height: 6px; cursor: ns-resize; }
.h-n { top: -3px; } .h-s { bottom: -3px; }
.h-e, .h-w { top: calc(50% - 18px); width: 6px; height: 36px; cursor: ew-resize; }
.h-e { right: -3px; } .h-w { left: -3px; }
.h-ne, .h-nw, .h-se, .h-sw { width: 14px; height: 14px; }
.h-ne { top: -5px; right: -5px; cursor: nesw-resize; } .h-sw { bottom: -5px; left: -5px; cursor: nesw-resize; }
.h-nw { top: -5px; left: -5px; cursor: nwse-resize; } .h-se { bottom: -5px; right: -5px; cursor: nwse-resize; }
.st-tile:not(:hover):not(:focus):not(.held):not(.resized) .st-handle { opacity: 0; pointer-events: none; }
.st-handle { transition: opacity var(--fade-in); }
.pad-mode .st-handle { display: none; }
.pad-mode .st-handle.on { display: block; }
.st-handle.on::after { background: var(--focus); box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.25), 0 2px 10px rgba(0, 0, 0, 0.6); transform: scale(1.5); animation: st-pulse var(--loop-pulse) infinite; }
@keyframes st-pulse { 50% { transform: scale(1.15); } }
:global(body.light-fx .st-handle.on::after) { animation: none; }
.st-add { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 0 18px; border-radius: var(--r-lg); color: var(--muted); background: transparent; border: 1.5px dashed rgba(255, 255, 255, 0.14); box-shadow: none !important; transition: background var(--tint), color var(--tint), border-color var(--tint); } /* a quiet slot, not another card (0.9.24) */
.st-add-plus { width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.06); color: var(--text); transition: transform var(--spring-d) var(--spring), background var(--tint); }
.st-add-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.st-add-t b { color: var(--text); font-family: var(--display); font-size: var(--t-md); }
.st-add-t span { font-size: var(--t-xs);  overflow-wrap: anywhere; }
.st-add:focus { color: var(--text); background: rgba(255, 255, 255, 0.04); border-color: transparent; box-shadow: var(--ring) !important; }
.st-add:focus .st-add-plus { background: var(--focus); color: var(--on-focus); transform: rotate(90deg); }

/* the parts every tile shares; sizes follow the tile (container units) */
/* 0.9.32 (owner: "no trailing anywhere, a new line is fine"): a tile's name wraps instead of ending in … */
.st-label { font-size: clamp(11px, min(10cqh, 6cqw), 15px); font-weight: 600; color: var(--muted); letter-spacing: -0.005em; position: relative; z-index: 1; flex: none; line-height: 1.2; text-wrap: balance; overflow-wrap: anywhere; }
.st-label.on-art { color: rgba(255, 255, 255, 0.92); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45); }
.st-num { display: flex; align-items: baseline; gap: 4px; margin-top: auto; line-height: 1; }
.st-big { font-family: var(--display); font-stretch: var(--display-stretch); font-weight: 800; font-size: clamp(22px, min(32cqh, 20cqw), 104px); letter-spacing: -0.02em; }
.st-unit { font-family: var(--display); font-weight: 700; font-size: clamp(12px, min(11cqh, 7cqw), 24px); color: var(--muted); margin-right: 6px; }
.st-sub { margin-top: 6px; font-size: clamp(11px, min(9cqh, 6cqw), 15px); color: var(--muted); white-space: normal; text-wrap: balance; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; flex: none; }
.st-quiet { margin-top: auto; }
.tnum { font-variant-numeric: tabular-nums; }
.st-meter { height: 4px; margin-top: 10px; border-radius: 2px; background: rgba(255, 255, 255, 0.1); overflow: hidden; flex: none; }
.st-meter i { display: block; height: 100%; border-radius: inherit; background: var(--text); transition: width var(--spring-soft-d) var(--spring-soft); }
.st-empty { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; color: var(--muted); }
.st-empty b { color: var(--text); font-family: var(--display); }
.st-empty.small { font-size: var(--t-sm); padding: 0 var(--s-3); }
.st-center { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; font-family: var(--display); font-weight: 700; }
.st-tile:focus .st-dice { animation: st-roll var(--spring-soft-d) var(--spring-soft); }
@keyframes st-roll { 40% { transform: rotate(-20deg) scale(1.12); } 70% { transform: rotate(8deg); } }
@container (max-height: 110px) and (max-width: 200px) { .st-label { display: none; } .st-center b { display: none; } }
@container (max-height: 90px) { .st-sub { display: none; } }

/* art tiles: the picture fills the tile, a scrim keeps the words readable */
.st-art { position: absolute; inset: 0; z-index: -2; background-size: cover; background-position: center 30%; transition: transform var(--spring-soft-d) var(--spring-soft); }
.st-tile.art:focus .st-art { transform: scale(1.04); }
/* 0.9.52: a soft band at the top too, so the tile's label reads on a bright cover */
.st-scrim { position: absolute; inset: 0; z-index: -1; background: linear-gradient(to bottom, rgba(8, 9, 12, 0.6) 0%, rgba(8, 9, 12, 0.25) 16%, transparent 32%), linear-gradient(to top, rgba(8, 9, 12, 0.92) 0%, rgba(8, 9, 12, 0.55) 38%, rgba(8, 9, 12, 0.08) 72%), linear-gradient(to right, rgba(8, 9, 12, 0.5), transparent 60%); }
.st-cp { margin-top: auto; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; max-width: 100%; }
.st-cp :deep(.game-logo) { margin: 0 0 4px; filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.55)); }
.st-cp :deep(.st-cp-name) { margin: 0; font-family: var(--display); font-stretch: var(--display-stretch); font-weight: 800; font-size: clamp(16px, min(14cqh, 9cqw), 44px); line-height: 1.05; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.st-cp-when { font-size: clamp(11px, min(8cqh, 5cqw), 15px); font-weight: 500; color: rgba(255, 255, 255, 0.86); }
.st-cp-go { display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; padding: 8px 18px 8px 10px; border-radius: 999px; background: #fff; color: #0c0d10; font-weight: 700; font-size: var(--t-sm); }
@container (max-height: 140px) { .st-cp-when { display: none; } }
.st-dots { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; }
.st-dots i { width: 6px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.4); transition: width var(--d-med) var(--ease), background var(--d-med); }
.st-dots i.on { width: 18px; background: #fff; }
.st-pin { margin-top: auto; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.st-pin b { font-family: var(--display); font-weight: 700; font-size: clamp(13px, min(12cqh, 8cqw), 22px); line-height: 1.15; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.st-pin span { font-size: var(--t-xs); color: rgba(255, 255, 255, 0.75); }
.st-cs-mark { font-size: clamp(18px, 14cqh, 40px); line-height: 1; }
.st-mark { display: inline-flex; align-items: center; gap: 6px; font-size: clamp(14px, 6cqh, 22px) !important; } /* the console's wordmark, not its name (0.9.24) */
.st-pin :deep(.game-logo) { margin: 0 0 6px; filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.55)); }
.st-pin :deep(.st-pin-name) { margin: 0 0 2px; font-family: var(--display); font-stretch: var(--display-stretch); font-weight: 800; font-size: clamp(14px, min(13cqh, 9cqw), 30px); line-height: 1.08; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* ---- 0.9.23 Start overhaul (owner: more and better widgets, styled like the clock, a calm Tailwind-like
   feel inside the design language). Every info widget gets its own quiet light from one corner and a
   hairline edge, so the board reads as a set of objects rather than flat boxes. */
.t-week .st-face, .t-storage .st-face, .t-downloads .st-face, .t-trophies .st-face, .t-stats .st-face, .t-surprise .st-face, .t-consoles .st-face, .t-html .st-face {
  background: radial-gradient(120% 100% at 100% 0%, var(--glow, rgba(255, 255, 255, 0.06)), transparent 62%), linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 40%), var(--s1);
  box-shadow: var(--weight-edge), var(--weight); }
.t-week { --glow: rgba(120, 150, 255, 0.16); }
.t-storage { --glow: rgba(80, 210, 190, 0.14); }
.t-downloads { --glow: rgba(90, 170, 255, 0.16); }
.t-trophies { --glow: rgba(255, 196, 80, 0.16); }
.t-stats { --glow: rgba(186, 140, 255, 0.16); }
.t-surprise { --glow: rgba(255, 120, 190, 0.16); }
.st-count { margin-left: 8px; padding: 1px 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); color: var(--muted); font-size: 0.85em; font-weight: 600; flex: none; white-space: nowrap; }
/* 0.9.29 (owner: "1 / …" cut off): the name gives way, never the count */
.st-label:has(.st-lname) { display: flex; align-items: center; min-width: 0; }
.st-lname { min-width: 0; text-wrap: balance; }

/* pages: the board slides a little and settles, its tiles arriving as they do on opening */
/* 0.9.56 (owner: page turns slower than they used to be): out-in waits for the old page to leave, so it goes as fast as it
   did before 0.9.52 (the snappy spring made that wait 344 ms); the new page then starts at full speed */
.st-pg-next-leave-active, .st-pg-prev-leave-active { transition: opacity var(--fade-out), transform var(--fade-out); }
.st-pg-next-leave-to { opacity: 0; transform: translateX(-3%); }
.st-pg-prev-leave-to { opacity: 0; transform: translateX(3%); }
.st-pg-next-enter-active, .st-pg-prev-enter-active { transition: opacity var(--fade-in), transform var(--spring-d) var(--spring); }
.st-pg-next-enter-from { opacity: 0; transform: translateX(4%); }
.st-pg-prev-enter-from { opacity: 0; transform: translateX(-4%); }
:global(body.motion-reduce .st-board) { transition: none !important; transform: none !important; }
/* 0.9.41 (owner: moving pages across rows went laggy): no blur of the whole board behind (it was redrawn every frame of
   a move), a nearly solid page instead */
.st-ov { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column; gap: var(--s-5); padding: var(--s-6) var(--s-7); background: color-mix(in srgb, var(--s0) 96%, transparent); animation: viewIn var(--fade-in); }
.st-ov-head { display: flex; align-items: baseline; gap: var(--s-4); }
.st-ov-head b { font-family: var(--display); font-size: var(--t-xl); }
.st-ov-list { display: flex; gap: var(--s-4); flex-wrap: wrap; align-content: flex-start; }
.st-ov-page { width: clamp(200px, 22vw, 360px); display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--r-lg); background: var(--s1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06); transition: transform var(--spring-d) var(--spring), box-shadow var(--tint); }
.st-ov-page.on { box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35); }
.st-ov-page:focus { box-shadow: var(--ring); }
/* the lift uses translate/scale, not transform: the slide to a new place (TransitionGroup) writes transform, and the
   two used to overwrite each other every frame, worst on long moves between rows */
.st-ov-page.moving { translate: 0 -8px; scale: 1.04; box-shadow: var(--ring), 0 24px 50px rgba(0, 0, 0, 0.55); }
.st-ov-map { position: relative; aspect-ratio: 16 / 9; border-radius: var(--r-md); background: rgba(255, 255, 255, 0.03); overflow: hidden; contain: layout paint; } /* a page's copy never relayouts the others */
.st-ov-map i { position: absolute; box-sizing: border-box; border: 2px solid transparent; background: rgba(255, 255, 255, 0.12); border-radius: 6px; background-clip: padding-box; background-size: cover; background-position: center 30%; overflow: hidden; display: flex; align-items: flex-end; padding: 4px; }
.st-ov-map i.pic { background-color: #111; }
.st-ov-snap { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; }
.st-ov-snap :deep(*) { animation: none !important; transition: none !important; }
.st-ov-snap :deep(.st-board) { position: relative; inset: auto; }
.st-ov-tag { display: flex; align-items: center; gap: 4px; min-width: 0; color: rgba(255, 255, 255, 0.8); font-size: 10px; font-weight: 600; }
.st-ov-tag em { font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-ov-clock { align-self: center; margin: auto; font-family: var(--display); font-weight: 800; font-size: clamp(12px, 1.4vw, 22px); color: #fff; }
.st-ov-page { position: relative; transition: translate var(--spring-pop-d, 300ms) var(--spring-pop, ease-out), scale var(--spring-pop-d, 300ms) var(--spring-pop, ease-out), box-shadow var(--fade-slow), opacity var(--fade-in); }
.st-ov-page.dim { opacity: 0.55; }
.st-ov-carry { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--focus); color: var(--on-focus); font-size: var(--t-xs); font-weight: 700; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45); }
.st-ovj-move { transition: none; }
.st-ov-addpg { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.14); background: transparent; }
.st-ov-addmap { display: grid; place-items: center; }
.st-ov-plus { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: var(--s2); color: var(--text); box-shadow: var(--weight-edge, inset 0 0 0 1px rgba(255, 255, 255, 0.08)); }
.st-ov-addpg:focus .st-ov-plus { background: var(--focus); color: var(--on-focus); }
.st-ovm-move { transition: transform var(--spring-d, 420ms) var(--spring, cubic-bezier(0.32, 0.72, 0, 1)); }
.st-ov-n { display: flex; justify-content: space-between; font-weight: 700; font-family: var(--display); }
.st-ov-n em { font-style: normal; font-weight: 500; color: var(--muted); font-family: var(--body); font-size: var(--t-sm); }
.st-pages { flex: none; align-self: center; display: flex; align-items: center; gap: 8px; padding: 6px 0 10px; } /* its own row under the board: never over a tile (0.9.24) */
.st-pages i { width: 7px; height: 7px; border-radius: 4px; background: rgba(255, 255, 255, 0.35); cursor: pointer; transition: width var(--d-med) var(--ease-out), background var(--d-med); }
.st-pages i.on { width: 22px; background: #fff; }
.st-blank { position: absolute; left: 0; right: 0; top: 0; height: min(320px, 60vh); margin: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border-radius: var(--r-lg); color: var(--muted); text-align: center; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08); }
.st-blank b { color: var(--text); font-family: var(--display); font-size: var(--t-lg); }
.st-blank:focus { box-shadow: var(--ring); color: var(--text); }

/* rows of games: the first one in front, with its art behind the words; the rest fanned beside it */
.st-row-art { position: absolute; inset: 0; z-index: -2; background-size: cover; background-position: center 30%; opacity: 0.5; transition: transform var(--spring-soft-d) var(--spring-soft), opacity var(--fade-slow); will-change: transform; } /* 0.9.29: its own layer, so the focus zoom isn't a repaint per frame */
.st-tile:focus .st-row-art { transform: scale(1.03); opacity: 0.6; }
.st-row-fade { position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, var(--s1) 22%, color-mix(in srgb, var(--s1) 70%, transparent) 48%, color-mix(in srgb, var(--s1) 35%, transparent)), linear-gradient(0deg, color-mix(in srgb, var(--s1) 70%, transparent), transparent 50%); }
.st-row { flex: 1; min-height: 0; display: flex; gap: clamp(10px, 3cqw, 24px); }
.st-row-info { flex: 0 0 38%; min-width: 0; display: flex; flex-direction: column; gap: clamp(8px, 5cqh, 22px); } /* 0.9.28: the row's name never sits on the game's logo */
.st-row-lead { margin-top: auto; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.st-row-lead :deep(.game-logo) { margin: 0 0 2px; filter: drop-shadow(0 3px 10px rgba(0, 0, 0, 0.5)); }
.st-row-lead :deep(.st-row-name) { margin: 0; font-family: var(--display); font-stretch: var(--display-stretch); font-weight: 800; font-size: clamp(14px, min(15cqh, 6cqw), 28px); line-height: 1.08; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.st-row-lead .st-sub { margin-top: 0; max-width: 100%; }
.st-fan { position: relative; flex: 1; min-width: 0; container-type: size; }
.st-fan-c { position: absolute; top: 0; height: 100cqh; width: auto; aspect-ratio: 3 / 4; object-fit: cover; border-radius: var(--r-md); background: var(--s2);
  left: calc(var(--i) * 37.5cqh); z-index: calc(20 - var(--i)); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.07);
  transform: scale(calc(1 - var(--i) * 0.035)); transform-origin: left center; filter: brightness(calc(1 - var(--i) * 0.07));
  transition: transform var(--spring-d) var(--spring); transition-delay: calc(var(--i) * 18ms); }
/* the covers spread on focus by transform, not `left` (0.9.29: moving `left` laid out and repainted the
   tile on every frame; the same spread, now the compositor's work) */
.st-tile:focus .st-fan-c { transform: translateX(calc(var(--i) * 4.5cqh)) scale(calc(1 - var(--i) * 0.035)); }
.st-tile:focus .st-fan-c:first-child { transform: translateY(-2%); }
/* a row moving to its next game (0.9.28): the art crossfades, the name slides in, the covers glide along */
.st-row-art.st-xf-enter-active, .st-row-art.st-xf-leave-active { transition: opacity var(--fade-cross); }
.st-row-art.st-xf-enter-from, .st-row-art.st-xf-leave-to { opacity: 0; }
/* the old name and the new one share the spot and cross over (no empty moment between them) */
.st-lead-wrap { margin-top: auto; display: grid; min-width: 0; }
.st-lead-wrap > .st-row-lead { grid-area: 1 / 1; margin-top: 0; justify-content: flex-end; }
.st-lead-leave-active { transition: opacity var(--fade-slow), transform var(--spring-soft-d) var(--spring-soft); }
.st-lead-enter-active { transition: opacity var(--fade-cross) 120ms, transform var(--spring-soft-d) var(--spring-soft) 60ms; }
.st-lead-leave-to { opacity: 0; transform: translateX(-12px); }
.st-lead-enter-from { opacity: 0; transform: translateX(16px); }
.st-fan-c.st-fan-leave-active { transition: opacity var(--fade-slow), transform var(--spring-d) var(--spring); z-index: 21; }
.st-fan-c.st-fan-leave-to { opacity: 0; transform: translateX(-18%) scale(0.96); }
.st-fan-c.st-fan-enter-active { transition: opacity var(--fade-cross) 180ms; }
.st-fan-c.st-fan-enter-from { opacity: 0; }
:global(body.motion-reduce .st-tile *) { transition-duration: 0s !important; }
.st-row.narrow .st-row-info { display: none; }
.st-row.narrow { flex-direction: column; }
.st-row.tall { flex-direction: column-reverse; }
.st-row.tall .st-row-info { flex: none; }
.st-row.tall .st-fan { flex: 1; }
@container (max-height: 120px) { .st-row-lead .st-sub { display: none; } }

/* trophies: the newest large, the ones before it as small badges */
.st-tro { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: clamp(6px, 4cqh, 14px); margin-top: 6px; }
.st-tro-list { display: grid; gap: 10px 18px; align-content: end; }
.st-tro-main { display: flex; align-items: center; gap: 12px; min-width: 0; animation: st-in var(--spring-soft-d) var(--spring-soft) both; animation-delay: calc(var(--i) * 35ms + 120ms); }
.st-tro-badge { width: 48px; aspect-ratio: 1; flex: none; border-radius: var(--r-md); overflow: hidden; display: grid; place-items: center; background: var(--s2); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 210, 120, 0.28); }
.st-tro.one .st-tro-badge { width: clamp(36px, 34cqh, 64px); }
.st-tro-badge img { width: 100%; height: 100%; object-fit: cover; }
.st-tro-t { display: flex; flex-direction: column; min-width: 0; }
.st-tro-t b { font-family: var(--display); font-weight: 700; font-size: clamp(12px, 3.4cqh, 18px); white-space: normal; text-wrap: balance; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.st-tro.one .st-tro-t b { font-size: clamp(12px, 12cqh, 18px); }
.st-tro-t span { font-size: var(--t-xs); color: var(--muted); white-space: normal; text-wrap: balance; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.st-tro-strip { display: flex; gap: 6px; overflow: hidden; }
.st-tro.feat { flex-direction: column; align-items: stretch; justify-content: flex-start; gap: clamp(10px, 3cqh, 20px); }
.st-tro.feat.across { flex-direction: row; gap: clamp(14px, 3cqw, 28px); }
/* the card takes whatever the list doesn't need, so a tile with few unlocks is never half empty (0.9.32) */
.st-tro.feat .st-tro-feat { flex: 1 1 0; min-height: 0; justify-content: center; position: relative; overflow: hidden; isolation: isolate; }
.st-tro-fbg { position: absolute; inset: -10%; width: 120%; height: 120%; object-fit: cover; filter: blur(22px) saturate(1.2); opacity: 0.38; z-index: -1; -webkit-mask-image: linear-gradient(100deg, transparent 10%, #000 70%); mask-image: linear-gradient(100deg, transparent 10%, #000 70%); }
:global(body.light-fx .st-tro-fbg) { filter: none; opacity: 0.18; }
.st-tro.feat:not(.across) .st-tro-side { flex: none; }
.st-tro.feat.across .st-tro-feat { flex: 1 1 0; }
.st-tro.feat.across .st-tro-side { flex: 1 1 0; }
.st-tro.feat .st-tro-fbadge { width: clamp(64px, 30cqmin, 150px); }
.st-tro.feat .st-tro-feat b { font-size: clamp(18px, 6cqmin, 40px); }
.st-tro.feat .st-tro-fd { font-size: clamp(13px, 2.4cqmin, 17px); }
.st-tro-side { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
.st-tro-game { display: flex; align-items: center; gap: 12px; min-width: 0; animation: st-in var(--spring-soft-d) var(--spring-soft) both; animation-delay: calc(var(--i) * 35ms + 160ms); }
.st-tro-gart { width: 44px; height: 44px; flex: none; border-radius: var(--r-sm); overflow: hidden; background: var(--s2); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35); }
.st-tro-gart img { width: 100%; height: 100%; object-fit: cover; }
.st-tro-gt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.st-tro-gt b { font-family: var(--display); font-weight: 700; font-size: var(--t-sm); line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.st-tro-bar { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.st-tro-bar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #ffd27a, #ffb347); }
.st-tro-gn { flex: none; font-family: var(--display); font-weight: 800; font-size: var(--t-md); font-variant-numeric: tabular-nums; }
.st-tro-gn small { font-weight: 600; font-size: var(--t-xs); color: var(--muted); }
.st-tro-mosaic { display: flex; flex-wrap: wrap; gap: 8px; }
.st-tro-mosaic .st-tro-mini { width: clamp(36px, 7cqmin, 54px); height: clamp(36px, 7cqmin, 54px); opacity: 1; }
/* a medium tile with one unlock shown large (0.9.32, owner: make the newest bigger) */
.st-tro.solo .st-tro-badge { width: clamp(56px, 38cqh, 84px); }
.st-tro.solo .st-tro-t b { font-size: clamp(14px, 9cqh, 22px); white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.st-tro.feat .st-tro-list { flex: 1; align-content: center; }
.st-tro.feat .st-tro-strip { display: none; }
.st-tro-feat { flex: 0 0 40%; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: clamp(12px, 4cqh, 22px); border-radius: var(--r-lg); background: radial-gradient(120% 90% at 20% 10%, rgba(255, 210, 120, 0.12), transparent 60%), rgba(255, 255, 255, 0.04); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06); animation: st-in var(--spring-soft-d) var(--spring-soft) both; }
.st-tro-fbadge { width: clamp(56px, 30cqh, 96px); aspect-ratio: 1; border-radius: var(--r-lg); overflow: hidden; display: grid; place-items: center; background: var(--s2); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 210, 120, 0.25); margin-bottom: 6px; }
.st-tro-fbadge img { width: 100%; height: 100%; object-fit: cover; }
.st-tro-feat b { font-family: var(--display); font-weight: 800; font-size: clamp(16px, 7cqh, 28px); line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.st-tro-fd { color: var(--text); opacity: 0.8; font-size: var(--t-sm); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.st-tro-fg { color: var(--muted); font-size: var(--t-xs); }
.st-emu { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; gap: clamp(10px, 4cqw, 22px); }
.st-emu-ic { flex: none; display: grid; place-items: center; padding: clamp(6px, 4cqmin, 14px); border-radius: 50%; background: radial-gradient(closest-side, rgba(255, 255, 255, 0.10), transparent); }
.st-emu.small { flex-direction: column; justify-content: center; text-align: center; gap: clamp(4px, 4cqh, 10px); }
.st-emu.small .st-emu-t { align-items: center; max-width: 100%; }
.st-emu.small .st-emu-t b { font-size: clamp(12px, 11cqmin, 18px); max-width: 100%; }
.st-emu-dot { position: absolute; top: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; background: #5bd28a; box-shadow: 0 0 0 3px color-mix(in srgb, var(--s1) 80%, transparent); }
.st-emu-dot.warn { background: #f5c542; }
.st-emu-t { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.st-emu-t b { font-family: var(--display); font-weight: 800; font-size: clamp(15px, 14cqh, 28px);  overflow-wrap: anywhere; }
.st-emu-t > span:not(.status) { color: var(--muted); font-size: var(--t-xs); }
.st-emu-t .status { align-self: flex-start; }
.st-spot-enter-active, .st-spot-leave-active { transition: opacity var(--fade-cross); }
.st-spot-enter-from, .st-spot-leave-to { opacity: 0; }
.st-band { flex: 1; min-height: 0; display: flex; gap: 10px; align-items: center; margin: 10px 0 4px; overflow: hidden; mask-image: linear-gradient(90deg, #000 80%, transparent); }
.st-band img { height: min(100%, 220px); aspect-ratio: 2 / 3; object-fit: cover; border-radius: var(--r-md); box-shadow: var(--weight-edge), var(--weight); animation: st-in var(--spring-soft-d) var(--spring-soft) both; }
.st-band:empty { display: none; }
/* 0.9.41 (owner): "On this device" is the same green tick the game cards carry */
.st-dev-tick { display: inline-grid; place-items: center; width: 22px; height: 22px; margin-left: 10px; border-radius: 50%; background: var(--green); color: #fff; vertical-align: middle; box-shadow: 0 0 0 2px rgba(6, 7, 11, 0.55); }
/* 0.9.41: in Console at a Glance the covers share the row exactly (--n of them), so none is cut and none is missing;
   the stats under them take only the room they need */
.st-band.fit { mask-image: none; justify-content: space-between; container-type: size; align-self: stretch; }
/* each cover: its share of the row, or as wide as the row's height allows at 2:3, whichever is smaller */
.st-band.fit img { flex: none; width: min(calc((100cqw - (var(--n) - 1) * 10px) / var(--n)), 66.6cqh); height: auto; aspect-ratio: 2 / 3; }
.st-stats.cs { flex: none; }
.st-cs-mark :deep(.cmark) { max-width: 100%; }
@container (max-width: 220px) { .st-cs-mark { text-align: center; } .st-band.fit { justify-content: center; } }
/* a one-column tile: two numbers, one per line, whole words */
@container (max-width: 200px) { .st-stats.cs { grid-template-columns: 1fr; text-align: center; } .st-stats.cs > div { align-items: center; } .st-stats.cs > div:nth-child(n+3) { display: none; } .st-stats.cs span { overflow-wrap: normal; } }
.st-tro-mini { width: 34px; height: 34px; flex: none; border-radius: var(--r-sm); overflow: hidden; display: grid; place-items: center; background: var(--s2); opacity: calc(1 - var(--i) * 0.06); animation: st-in var(--spring-d) var(--spring) both; animation-delay: calc(var(--i) * 30ms + 200ms); }
.st-tro-mini img { width: 100%; height: 100%; object-fit: cover; }
@container (max-height: 84px) { .st-tro-strip { display: none; } }
@container (max-width: 200px) { .st-tro-t { display: none; } .st-tro-main:not(:first-child) { display: none; } .st-tro-main { justify-content: center; flex: 1; } .st-tro-badge { width: min(64cqw, 60cqh); } }
:global(body.motion-reduce .st-tro-main), :global(body.motion-reduce .st-tro-mini) { animation: none; }

/* Surprise me: three cards fanned, dealt again each time */
.st-deal { position: absolute; right: 8%; top: 12%; bottom: 12%; width: 50%; container-type: size; }
.st-deal-c { position: absolute; top: 0; right: 0; height: 100cqh; aspect-ratio: 3 / 4; object-fit: cover; border-radius: var(--r-md); background: var(--s2); box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
  z-index: calc(5 - var(--i)); transform-origin: 50% 110%; animation: st-deal var(--spring-soft-d) var(--spring-soft) both; animation-delay: calc(var(--i) * 70ms); transform: rotate(calc(var(--i) * -9deg)) translateX(calc(var(--i) * -16%)); }
@keyframes st-deal { from { opacity: 0; transform: translateY(18%) rotate(0deg) scale(0.92); } }
.st-deal-t { margin-top: auto; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; position: relative; z-index: 6; max-width: 48%; }
.st-deal-t b { font-family: var(--display); font-weight: 700; font-size: clamp(13px, 13cqh, 20px); }
.st-deal-t .st-sub { margin-top: 0; max-width: 100%; }
@container (max-width: 200px) { .st-deal { left: 12%; right: 12%; width: auto; top: 8%; bottom: 30%; } .st-deal-c { right: 20%; } .st-deal-t { max-width: none; } }
:global(body.motion-reduce .st-deal-c) { animation: none; }

/* your library in numbers */
.st-stats { flex: 1; min-height: 0; margin-top: 8px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: end; gap: 10px; }
.st-stats > div { display: flex; flex-direction: column; min-width: 0; }
.st-stats b { font-family: var(--display); font-stretch: var(--display-stretch); font-weight: 800; font-size: clamp(18px, min(26cqh, 9cqw), 56px); line-height: 1; letter-spacing: -0.02em; }
.st-stats span { margin-top: 6px; font-size: clamp(10px, 8cqh, 13px); color: var(--muted); font-weight: 600; white-space: normal; text-wrap: balance; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
@container (max-width: 420px) { .st-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: end; } }
@container (max-width: 420px) and (max-height: 150px) { .st-stats > div:nth-child(n+3) { display: none; } }
@container (max-width: 200px) and (max-height: 200px) { .st-stats { grid-template-columns: 1fr; } .st-stats > div:not(:first-child) { display: none; } .st-stats b { font-size: clamp(22px, 34cqh, 64px); } }

/* a picture, and your own widget */
.t-image .st-face { padding: 0; background: var(--s2); }
.st-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
/* 0.9.29 (owner: a picture that isn't just still, soft and gentle): it drifts and zooms very slowly, 40 s each
   way. Without the GPU an endless animation keeps the CPU busy, so there it only leans in a little on focus. */
.st-img { animation: st-drift 40s ease-in-out infinite alternate; transform-origin: 60% 40%; will-change: transform; }
@keyframes st-drift { from { transform: scale(1.02) translate(0, 0); } to { transform: scale(1.09) translate(-1.5%, 1%); } }
:global(body.light-fx .st-img), :global(body.motion-reduce .st-img) { animation: none; will-change: auto; transition: transform var(--move-ambient); }
:global(body.light-fx .st-tile:focus .st-img) { transform: scale(1.04); }
.t-html .st-face { padding: 0; }
.st-html { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; pointer-events: none; }
.editing .st-html { opacity: 0.85; }
.t-clock .st-face { padding: 0; background: #0e1736; }

/* storage: wide, the number and a gauge side by side; tall, the gauge on top; small, only the gauge */
.st-store { flex: 1; min-height: 0; display: flex; align-items: stretch; gap: var(--s-3); }
.st-store-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.st-gauge { position: relative; flex: none; height: 100%; aspect-ratio: 1; max-width: 50%; display: grid; place-items: center; container-type: inline-size; }
.st-gauge svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.st-gauge line { stroke: color-mix(in srgb, var(--text) 12%, transparent); /* 0.9.44: the text colour, so Light gets dark ticks */ stroke-width: 2.6; stroke-linecap: round; transition: stroke var(--fade-slow); transition-delay: calc(var(--i) * 16ms + 200ms); }
.st-gauge line.on { stroke: var(--text); }
.st-gauge.low line.on { stroke: #ffb547; }
.st-gauge > span { font-family: var(--display); font-weight: 700; font-size: clamp(13px, 22cqw, 40px); letter-spacing: -0.02em; }
.st-gauge small { font-size: 0.62em; color: var(--muted); margin-left: 1px; }
:global(body.motion-reduce .st-gauge line) { transition: none; }
/* tall: the gauge large in the middle, the numbers and each console's share under it (0.9.24) */
@container (aspect-ratio < 1.2) { .st-store { flex-direction: column-reverse; justify-content: flex-end; } .st-gauge { height: auto; width: min(100%, 60cqh); max-width: none; aspect-ratio: 1; flex: none; margin: auto; container-type: inline-size; } .st-gauge > span { font-size: clamp(14px, 20cqw, 44px); } .st-store-text .st-num { margin-top: 0; } .st-store-text { flex: none; } }
@container (max-width: 190px) and (max-height: 190px) { .st-store-text { display: none; } .st-gauge { max-width: none; width: 100%; height: 100%; } }
.st-store-cons { display: none; flex-direction: column; gap: 7px; margin-top: 14px; padding-bottom: 6px; }
.st-store-con { display: grid; grid-template-columns: minmax(0, 1fr) 2fr auto; align-items: center; gap: 10px; font-size: var(--t-xs); color: var(--muted); }
.st-store-con span { white-space: nowrap; overflow: hidden; text-overflow: clip; }
.st-sc-n { display: flex; align-items: center; gap: 6px; min-width: 0; }
.st-sc-n :deep(.picon), .st-sc-n :deep(svg), .st-sc-n :deep(img) { flex: none; }
@container (max-width: 560px) { .st-sc-name { display: none; } .st-store-con { grid-template-columns: auto 1fr auto; } } /* no room for names: icons only (0.9.29: only the name; PIcon is a span too and hid with it) */
.st-store-con i { height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--text) 10%, transparent); overflow: hidden; }
.st-store-con b { display: block; height: 100%; border-radius: inherit; background: color-mix(in srgb, var(--text) 55%, transparent); } /* 0.9.44: the text colour, dark on Light */
.st-store-con em { font-style: normal; color: var(--text); font-weight: 600; }
@container (min-height: 300px) { .st-store-cons { display: flex; } }
@container (min-width: 520px) and (min-height: 200px) { .st-store-cons { display: flex; } .st-store-text .st-num { margin-top: 0; } .st-store-text { justify-content: center; } }

/* this week: wide, the total beside the bars; tall, the bars under it; small, the total only */
.st-week { flex: 1; min-height: 0; display: flex; align-items: stretch; gap: var(--s-5); }
.st-week-text { flex: none; min-width: 0; max-width: 46%; display: flex; flex-direction: column; }
.st-bars { flex: 1; min-width: 0; display: flex; align-items: stretch; justify-content: space-between; gap: clamp(4px, 2cqw, 14px); padding-top: 14px; }
.st-bar { flex: 1; max-width: 34px; display: flex; flex-direction: column; align-items: center; gap: 7px; min-height: 0; }
.st-col { flex: 1; min-height: 0; width: 100%; position: relative; }
.st-bar i { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 6px; background: linear-gradient(to top, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.24)); transform-origin: bottom; animation: st-rise var(--move-slow) both; animation-delay: calc(var(--i) * 55ms + 180ms); transition: height var(--progress); }
.st-bar.today i { background: linear-gradient(to top, rgba(255, 255, 255, 0.78), #fff); }
.st-bar.none i { height: 7%; min-height: 4px; background: rgba(255, 255, 255, 0.1); } /* a day without play is a low bar, so the chart reads as one (0.9.24) */
.st-bar em { position: absolute; left: 50%; transform: translate(-50%, -6px); font-style: normal; font-size: 11px; font-weight: 700; color: var(--text); white-space: nowrap; font-variant-numeric: tabular-nums; }
.st-bar span { font-size: 11px; font-weight: 600; color: var(--dim); }
.st-bar.today span { color: var(--text); }
@keyframes st-rise { from { transform: scaleY(0); } }
:global(body.motion-reduce .st-bar i) { animation: none; }
@container (aspect-ratio < 1.5) { .st-week { flex-direction: column; gap: var(--s-2); } .st-week-text { max-width: none; } .st-week-text .st-num { margin-top: 6px; } }
/* 0.9.23 (owner: the bars at 1x1 too): a small tile keeps the bars and the total, without the words */
@container (max-height: 160px) and (max-width: 240px) { .st-week { flex-direction: column; gap: 4px; } .st-week-text { max-width: none; flex: none; } .st-week-text .st-label { font-size: var(--t-xs); } .st-week-text .st-sub { font-size: var(--t-xs); white-space: normal; } .st-week-text .st-num { margin-top: 0; } .st-week .st-big { font-size: clamp(20px, 24cqh, 40px); } .st-bars { padding-top: 4px; gap: 3px; } .st-bar span, .st-bar em { display: none; } }
/* the last game's art: only on small and square tiles, where the bars leave room (0.9.32) */
.st-week-bg { display: none; position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; object-fit: cover; opacity: 0.22; filter: blur(10px) saturate(1.2); -webkit-mask-image: linear-gradient(200deg, #000 10%, transparent 75%); mask-image: linear-gradient(200deg, #000 10%, transparent 75%); pointer-events: none; }
@container (aspect-ratio < 1.5) { .st-week-bg { display: block; } }
:global(body.light-fx .st-week-bg) { filter: none; opacity: 0.12; }

/* consoles: the same cards as the Consoles page */
.st-cards { flex: 1; min-height: 0; margin-top: 10px; display: grid; gap: clamp(6px, 2cqw, 12px); }
.st-cards :deep(.systile.static) { border-radius: var(--r-md); }
@container (max-height: 120px) and (max-width: 220px) { .st-cards { margin-top: 0; } }
.st-fill { position: absolute; inset: 0; border-radius: inherit; }

/* rows of covers, the newest first, fading out at the edge; more rows in taller tiles */
.st-covers { flex: 1; min-height: 0; display: grid; grid-auto-flow: column; grid-auto-columns: max-content; gap: clamp(6px, 1.4cqw, 12px); margin-top: 10px; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, #000 80%, transparent); mask-image: linear-gradient(90deg, #000 80%, transparent); }
.st-ambient { position: absolute; inset: -40px; z-index: -1; background-size: cover; background-position: center; filter: blur(38px) saturate(1.2); opacity: 0.34; }
.st-ambient::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10, 11, 14, 0.2), rgba(10, 11, 14, 0.75)); }
.st-cover { height: 100%; width: auto; aspect-ratio: 3 / 4; object-fit: cover; border-radius: var(--r-sm); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06); transition: transform var(--spring-d) var(--spring); transition-delay: calc(var(--i) * 18ms); background: var(--s2); }
.st-tile:focus .st-cover { transform: translateY(-3px); }
.st-first { margin-top: 8px; color: var(--text); font-weight: 600; }
@container (max-height: 150px) { .st-first { display: none; } }
@container (max-height: 110px) { .st-covers { margin-top: 0; } }

/* trophies: as many as fit, smaller; a narrow tile shows the newest badge alone */
.st-ach { flex: 1; min-height: 0; display: grid; align-content: start; gap: 10px 16px; margin-top: 8px; }
.st-ach-row { display: flex; align-items: center; gap: 10px; min-width: 0; animation: st-in var(--spring-soft-d) var(--spring-soft) both; animation-delay: calc(var(--i) * 40ms + 120ms); }
.st-ach-img { width: 44px; height: 44px; flex: none; border-radius: var(--r-sm); object-fit: cover; display: grid; place-items: center; background: var(--s2); }
.st-ach-t { display: flex; flex-direction: column; min-width: 0; }
.st-ach-t b { font-family: var(--display); font-weight: 700; font-size: var(--t-sm); white-space: normal; text-wrap: balance; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.st-ach-t span { font-size: var(--t-xs); color: var(--muted); white-space: normal; text-wrap: balance; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
@container (max-width: 200px) { .st-ach { place-items: center; align-content: center; margin-top: 4px; } .st-ach-t { display: none; } .st-ach-row:not(:first-child) { display: none; } .st-ach-img { width: min(62cqw, 56cqh); height: min(62cqw, 56cqh); border-radius: var(--r-md); } }
:global(body.motion-reduce .st-ach-row) { animation: none; }

/* Game Disc or Cartridge (0.9.32) */
.st-media { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; gap: clamp(6px, 3cqh, 14px); margin-top: 6px; }
.st-media.wide { flex-direction: row; align-items: center; }
.st-media-stage { flex: 1; min-height: 0; min-width: 0; width: 100%; display: grid; place-items: center; }
.st-media.wide .st-media-stage { width: auto; height: 100%; aspect-ratio: 1; flex: none; }
.st-media-obj { grid-area: 1 / 1; height: 100%; max-width: 100%; display: grid; place-items: center; aspect-ratio: 1; }
.st-disc { position: relative; height: 92%; aspect-ratio: 1; border-radius: 50%; background-size: cover; background-position: center; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55), 0 0 0 2px rgba(255, 255, 255, 0.08); -webkit-mask-image: radial-gradient(circle, transparent 0 7.5%, #000 8%); mask-image: radial-gradient(circle, transparent 0 7.5%, #000 8%); animation: st-spin 60s linear infinite; } /* 0.9.39 (owner: the spin made them feel sick): one slow, even turn a minute */
.st-disc-sheen { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 20deg, rgba(255, 255, 255, 0) 0deg, rgba(255, 255, 255, 0.28) 30deg, rgba(160, 220, 255, 0.10) 60deg, rgba(255, 255, 255, 0) 100deg, rgba(255, 255, 255, 0) 200deg, rgba(255, 210, 255, 0.22) 230deg, rgba(255, 255, 255, 0) 270deg); mix-blend-mode: screen; }
.st-disc-hub { position: absolute; inset: 31%; border-radius: 50%; background: radial-gradient(circle, rgba(255, 255, 255, 0) 0 24%, rgba(230, 236, 245, 0.55) 25% 40%, rgba(255, 255, 255, 0.12) 41% 100%); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25); }
@keyframes st-spin { to { transform: rotate(360deg); } }
.st-cart { position: relative; height: 92%; aspect-ratio: 0.86; border-radius: 10% 10% 6% 6% / 8% 8% 5% 5%; background: linear-gradient(180deg, color-mix(in srgb, var(--sys-a, #5b5f6b) 40%, #2b2e36), color-mix(in srgb, var(--sys-a, #5b5f6b) 25%, #17191f)); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55), inset 0 2px 0 rgba(255, 255, 255, 0.18), inset 0 -3px 0 rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; align-items: center; padding: 8% 9% 11%; animation: st-float 6s ease-in-out infinite; }
.st-cart-grip { width: 70%; height: 9%; flex: none; margin-bottom: 7%; background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.35) 0 3px, rgba(255, 255, 255, 0.06) 3px 7px); border-radius: 3px; }
.st-cart-label { flex: 1; width: 100%; border-radius: 6px; background-size: cover; background-position: center; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18), 0 2px 6px rgba(0, 0, 0, 0.4); }
@keyframes st-float { 50% { transform: translateY(-3%) rotate(-1.5deg); } }
.st-media-t { flex: none; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; min-width: 0; max-width: 100%; }
.st-media.wide .st-media-t { align-items: flex-start; text-align: left; flex: 1; gap: 6px; }
.st-media.wide .st-media-t b { font-size: clamp(18px, 14cqh, 34px); }
.st-media.wide .st-media-t span { font-size: var(--t-sm); }
.st-media-bg { position: absolute; inset: 0; z-index: -1; background-size: cover; background-position: center; opacity: 0.5; -webkit-mask-image: linear-gradient(90deg, transparent 25%, #000 85%); mask-image: linear-gradient(90deg, transparent 25%, #000 85%); }
/* 0.9.39 (owner: the picture should show at every size): square and tall tiles fade it down behind the title */
.st-media-bg.tall { opacity: 0.42; -webkit-mask-image: linear-gradient(180deg, #000 10%, transparent 92%); mask-image: linear-gradient(180deg, #000 10%, transparent 92%); }
.st-media-t b { font-family: var(--display); font-weight: 800; font-size: clamp(14px, 7cqmin, 24px); line-height: 1.15; text-wrap: balance; }
.st-media-t span { color: var(--muted); font-size: var(--t-xs); }
@container (max-height: 200px) { .st-media:not(.wide) .st-media-t { display: none; } }
.st-media-enter-active, .st-media-leave-active { transition: opacity var(--fade-slow), transform var(--spring-soft-d) var(--spring-soft); }
.st-media-enter-from { opacity: 0; transform: translateX(18%) scale(0.92); }
.st-media-leave-to { opacity: 0; transform: translateX(-18%) scale(0.92); }
:global(body.light-fx .st-disc), :global(body.motion-reduce .st-disc), :global(body.light-fx .st-cart), :global(body.motion-reduce .st-cart) { animation: none; }
.st-shelf-mark :deep(.cmark) { --cm-h: 1.15em; } /* 0.9.39 (owner): the console's logo, not "PlayStation 4 Shelf" */
/* Game Shelf (0.9.42, option B): cases on a lit shelf. Each case is a spine with the console's band on top and its
   cover showing faintly through; the picked one turns out (rotateY, spring) to show its whole cover. The spot and
   the blurred cover behind light it. Springs, not keyframes, so a quick L1/R1 run retargets smoothly. */
.st-shelf-amb { position: absolute; inset: -40px; z-index: -1; background-size: cover; background-position: center; filter: blur(40px) saturate(1.3); opacity: 0.34; transition: background-image var(--fade-slow); pointer-events: none; }
.st-shelf-head { display: flex; align-items: center; gap: 0; }
.st-shelf-t { margin-left: auto; padding-left: 12px; text-align: right; min-width: 0; display: flex; flex-direction: column; align-items: flex-end; }
.st-shelf-t b { font-family: var(--display); font-weight: 800; font-size: clamp(13px, 1.4em, 19px); color: var(--text); line-height: 1.15; overflow-wrap: anywhere; text-wrap: balance; }
.st-shelf-t span { display: inline-flex; align-items: center; font-size: 0.85em; font-weight: 500; color: var(--muted); margin-top: 2px; }
.st-shelf-t .st-dev-tick { width: 18px; height: 18px; margin-left: 8px; }
@container (max-width: 380px) { .st-shelf-t { display: none; } }
.st-shelf { position: relative; flex: 1; min-height: 0; display: flex; align-items: flex-end; gap: 5px; padding: 8px 10px 16px; margin-top: 6px; perspective: 900px; overflow: hidden; }
.st-shelf-spot { position: absolute; left: 0; top: -30%; width: 60%; height: 130%; background: radial-gradient(55% 55% at 35% 0, rgba(255, 255, 255, 0.14), transparent 70%); pointer-events: none; }
.st-spine { position: relative; flex: none; width: 36px; height: 90%; border-radius: 3px; overflow: hidden; cursor: pointer; background: #1c1d22; transform-origin: right center;
  box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.18), inset -8px 0 12px rgba(0, 0, 0, 0.5), 0 6px 10px rgba(0, 0, 0, 0.4);
  transition: width var(--spring-soft-d) var(--spring-soft), height var(--spring-soft-d) var(--spring-soft), transform var(--spring-soft-d) var(--spring-soft), margin var(--spring-soft-d) var(--spring-soft), box-shadow var(--fade-slow); }
.st-spine::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: clamp(14px, 9%, 24px); background: linear-gradient(color-mix(in srgb, var(--case) 100%, #fff 12%), var(--case)); box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.22), 0 1px 0 rgba(0, 0, 0, 0.35); z-index: 2; }
.st-spine-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: left center; opacity: 0.5; filter: blur(1px); transition: opacity var(--fade-slow), filter var(--fade-slow); }
.st-spine-t { position: absolute; inset: clamp(22px, 13%, 32px) 0 8px; z-index: 1; writing-mode: vertical-rl; transform: rotate(180deg); display: block; text-overflow: ellipsis; font-family: var(--display); font-weight: 700; font-size: 12px; color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9); overflow: hidden; white-space: nowrap; line-height: 36px; }
.st-spine.out { width: min(36%, calc((100cqh - 96px) * 0.7)); min-width: 60px; height: 100%; margin: 0 12px 0 6px; transform: rotateY(-12deg); border-radius: 4px;
  box-shadow: 0 24px 40px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.2); }
.st-spine.out .st-spine-art { opacity: 1; filter: none; object-position: center; }
.st-spine.out .st-spine-t { opacity: 0; }
.st-spine:not(.out):hover, .st-tile:focus .st-spine:not(.out):hover { transform: translateY(-8px); }
.st-tile:focus .st-spine.out { transform: rotateY(-6deg) translateY(-4px); }
.st-shelf-board { position: absolute; left: 0; right: 0; bottom: 4px; height: 12px; border-radius: 4px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.06)); box-shadow: 0 14px 24px rgba(0, 0, 0, 0.55); }
:global(body.light-fx .st-shelf-amb) { display: none; }
:global(body.light-fx .st-spine-art) { filter: none; }
:global(body.motion-reduce .st-spine) { transition: none; }
:global(body.theme-light .st-shelf-board) { background: linear-gradient(180deg, #fff, #d6d6dc); box-shadow: 0 10px 18px rgba(30, 30, 40, 0.22); }
:global(body.theme-light .st-shelf-spot) { display: none; }
:global(body.theme-light .st-shelf-amb) { opacity: 0.2; }
.st-media-stage { cursor: pointer; }
/* focused: the disc spins faster (a second turn on top, so it never jumps) and lifts; the cartridge rises as if
   pulled from the slot; a game on this device has a soft green glow */
.st-media-obj { transition: transform var(--spring-d) var(--spring); }
.st-tile:focus .st-media-obj, .st-tile:hover .st-media-obj { transform: translateY(-3%) scale(1.04); }
.st-media-obj.dev .st-disc-boost, .st-media-obj.dev .st-cart { box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55), 0 0 0 2px rgba(127, 224, 160, 0.35), 0 0 24px rgba(127, 224, 160, 0.18); }
.st-disc-boost { height: 92%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; } /* 0.9.39: no faster spin on focus any more */
.st-disc-boost > .st-disc { height: 100%; }
:global(body.motion-reduce .st-disc) { animation: none; }
/* Light (0.9.44, owner: the storage ring didn't show on Light): the faint white tracks, pills and dots that sit on a
   plain tile or the board are drawn in the text colour instead (tiles over art keep their white) */
:global(body.theme-light .st-meter), :global(body.theme-light .st-tro-bar), :global(body.theme-light .st-bar.none i) { background: rgba(28, 28, 30, 0.1); }
:global(body.theme-light .st-count) { background: rgba(28, 28, 30, 0.07); }
:global(body.theme-light .st-face:has(.st-scrim) .st-count), :global(body.theme-light .st-face:has(.st-art) .st-count) { background: rgba(255, 255, 255, 0.16); }
:global(body.theme-light .st-pages i) { background: rgba(28, 28, 30, 0.28); }
:global(body.theme-light .st-pages i.on) { background: #1c1c1e; }
:global(body.theme-light .st-add-plus) { background: rgba(28, 28, 30, 0.07); }
:global(body.theme-light .st-ov-map) { background: rgba(28, 28, 30, 0.04); }
:global(body.theme-light .st-ov-map i) { background: rgba(28, 28, 30, 0.12); }
:global(body.theme-light .st-slots i) { box-shadow: inset 0 0 0 1px rgba(28, 28, 30, 0.12); }
:global(body.theme-light .st-ghost) { box-shadow: inset 0 0 0 2px rgba(28, 28, 30, 0.4); }
</style>
