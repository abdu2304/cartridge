// Xenia Canary's per-game settings: src/xenia/config.cc (ReadGameConfig: <storage root>/config/<TITLE ID>.config.toml,
// every cvar read as <category>.<name>, so a game file takes any setting the main xenia-canary.config.toml has, under
// the same table and key) and every DEFINE_bool/int32/uint32/uint64/int64/double/string(name, default, description,
// category) in src/. Xenia has no settings window: names come from the key, descriptions from the cvar's own text.
// Docs: docs/game-settings/xenia.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/xenia-canary/xenia-canary/canary_experimental/';
// the .cc files that define cvars (a sparse clone of src/: grep -rlE '^\s*DEFINE_(bool|int32|uint32|uint64|int64|double|string)\(' src)
const FILES = `app/emulator_window.cc app/xenia_main.cc apu/audio_media_player.cc apu/xma_decoder.cc base/clock.cc base/logging.cc
base/memory.cc base/memory_posix.cc base/platform_amd64.cc config.cc cpu/backend/x64/x64_backend.cc cpu/backend/x64/x64_emitter.cc
cpu/backend/x64/x64_seq_memory.cc cpu/backend/x64/x64_seq_vector.cc cpu/backend/x64/x64_sequences.cc
cpu/compiler/passes/constant_propagation_pass.cc cpu/compiler/passes/context_promotion_pass.cc cpu/cpu_flags.cc
cpu/ppc/ppc_emit_control.cc cpu/ppc/ppc_emit_memory.cc cpu/ppc/ppc_hir_builder.cc cpu/ppc/ppc_translator.cc cpu/processor.cc
cpu/xex_module.cc emulator.cc gpu/command_processor.cc gpu/d3d12/d3d12_command_processor.cc gpu/d3d12/d3d12_render_target_cache.cc
gpu/d3d12/pipeline_cache.cc gpu/draw_extent_estimator.cc gpu/draw_util.cc gpu/dxbc_shader_translator.cc
gpu/dxbc_shader_translator_om.cc gpu/gpu_flags.cc gpu/graphics_system.cc gpu/primitive_processor.cc gpu/render_target_cache.cc
gpu/spirv_shader_translator.cc gpu/texture_cache.cc gpu/texture_dump.cc gpu/vulkan/vulkan_pipeline_cache.cc
gpu/vulkan/vulkan_render_target_cache.cc gpu/vulkan/vulkan_shared_memory.cc hid/hid_flags.cc hid/input_system.cc
hid/sdl/sdl_input_driver.cc kernel/kernel_flags.cc kernel/kernel_state.cc kernel/xam/achievement_manager.cc
kernel/xam/profile_manager.cc kernel/xam/xam_avatar.cc kernel/xam/xam_content.cc kernel/xam/xam_info.cc kernel/xam/xam_ui.cc
kernel/xam/xam_video.cc kernel/xbdm/xbdm_misc.cc kernel/xboxkrnl/xboxkrnl_memory.cc kernel/xboxkrnl/xboxkrnl_misc.cc
kernel/xboxkrnl/xboxkrnl_module.cc kernel/xboxkrnl/xboxkrnl_strings.cc kernel/xboxkrnl/xboxkrnl_video.cc kernel/xthread.cc
memory.cc patcher/patch_db.cc patcher/plugin_loader.cc ui/d3d12/d3d12_presenter.cc ui/d3d12/d3d12_provider.cc ui/imgui_drawer.cc
ui/imgui_guest_notification.cc ui/presenter.cc ui/vulkan/vulkan_instance.cc ui/vulkan/vulkan_presenter.cc ui/vulkan/vulkan_provider.cc
ui/window.cc`.split(/\s+/).map((f) => 'src/xenia/' + f);

// categories that are paths, the window, the frontend or other machines, never per game
const DROP_CAT = /^(UI|Win32|Linux|a64|Storage|Other|Config|Profiles|SDL)$/;
// settings that are devices, the window, read only at start (before the game file loads) or do nothing
const DROP = new Set(['apu', 'gpu', 'hid', 'cpu', 'fullscreen', 'discord', 'd3d12_adapter', 'vulkan_device', 'keyboard_user_index',
  'recent_titles_entry_amount', 'notification_sound_path', 'disable_doubleclick_fullscreen', 'log_to_logcat', 'enable_console',
  'load_module_map', 'host_present_from_non_ui_thread', 'priority_class', 'controller_hotkeys', 'cvar_name']);
const TAB = { General: 'General', CPU: 'CPU', GPU: 'Graphics', D3D12: 'Graphics', Vulkan: 'Graphics', Display: 'Display', APU: 'Audio',
  HID: 'Controls', Kernel: 'System', Memory: 'System', Content: 'System', Video: 'Display' };
// developer and debugging settings go in Advanced
const ADV_CAT = /^(Logging|GPU\.Debug|x64|Debug)$/;
const ADV = /break|debug|trace|dump|disasm|disassembl|validat|log|instrument|annotation|store_all_context|scribble|protect_|xop_|full_optimization|no_round|no_reserved|infocache|pvr|cl$|kernel_(cert|pix|build)|staging_mode|console_type|allow_game_relative|stack_size|wireframe|force_convert|downlevel|submit_on|queue_priority|pipeline_creation_threads|present_mode|semaphore|allow_incompatible|ignore_undefined|precompilation|mmio|elide|prefetch|fast_dot|float_constant|clock_|inline_loadclock|writable_|sparse|tiled_|context_promotion|ffmpeg|use_dedicated_xma|occlusion_query_fake|depth_float24|spirv_|dxbc|native_stencil|snorm16|gamma_render|primitive_processor|texture_cache_memory|half_pixel|cube_map|aliased|mrt_|depth_transfer|execute_unclipped|max_stackpoints|align_all|extension_mask|delay_via|host_guest|roundingmode|rmw_|avatar|mic_init|achievements_backend/i;
const ADV_DESC = /^(Not for users|For developer|For host graphics API downlevel|Only does anything in debug)/;

const unq = (s) => s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
const label = (k) => k.replace(/^(d3d12|vulkan)_/, (x) => x.slice(0, -1).toUpperCase().replace('VULKAN', 'Vulkan') + ' ').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  .replace(/\b(gpu|cpu|vsync|fps|mmio|hir|xma|xmp|ffx|fsr|fxaa|cas|af|pm4|pvr|edram|msaa|rov|rtv|fbo|fsi|vram)\b/gi, (w) => w.toUpperCase());

function read(dir) {
  const re = /^\s*DEFINE_(bool|int32|uint32|uint64|int64|double|string)\(\s*(\w+)\s*,\s*([\s\S]*?)\);/gm;
  const seen = new Set(), out = [];
  for (const f of FILES) {
    let t; try { t = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    // macros a description is built from (xenia_main.cc: "Use: " GPU_OPTIONS), the Linux spelling where #ifdef'd
    const macros = {}; for (const m of t.matchAll(/#define (\w+) ("[^"]*")/g)) macros[m[1]] = m[2];
    for (const m of t.matchAll(re)) {
      const [, type, k] = m; if (seen.has(k)) continue;
      // args: default, "description" pieces (and macro names), "category"
      const args = m[3];
      let cut = 0, q = false; for (; cut < args.length; cut++) { const c = args[cut]; if (c === '"' && args[cut - 1] !== '\\') q = !q; else if (c === ',' && !q) break; }
      const def0 = args.slice(0, cut).trim();
      const rest = args.slice(cut + 1).replace(/\b([A-Z_]{4,})\b/g, (x) => macros[x] || x);
      const strs = [...rest.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
      const cat = strs.pop(); if (!cat || DROP_CAT.test(cat) || DROP.has(k)) continue;
      seen.add(k);
      const descFull = unq(strs.join(''));
      const t2 = { bool: 'bool', double: 'float', string: 'text' }[type] || 'int';
      const e = { s: cat, k, t: t2, d: null, str: type === 'string' || undefined };
      // default as TOML writes it (strings without their quotes; Cartridge quotes text values)
      let d = def0.replace(/LL$|ULL$|u$|U$/, '');
      if (type === 'bool') e.d = /^(true|1)$/.test(d) ? 'true' : /^(false|0)$/.test(d) ? 'false' : null;
      else if (type === 'string') e.d = /^"(.*)"$/.test(d) ? d.slice(1, -1) : null;
      else if (/^-?0x[\da-f]+$/i.test(d)) e.d = String(parseInt(d, 16));
      else e.d = /^-?\d+(\.\d+)?$/.test(d) ? d : null; // computed (constants, other cvars)
      // choices the description lists: "Use: [a, b, c]" for strings; " 0 = text" lines for numbers
      const use = /\[([\w\s,-]+)\]/.exec(descFull);
      const named = [...descFull.matchAll(/^ ([\w-]+)(?: \(or any value not listed here\))?:/gm)].map((x) => x[1]);
      if (type === 'string' && ((use && /Use|Possible|options/i.test(descFull)) || named.length > 1)) {
        let vals = use ? use[1].split(',').map((x) => x.trim()).filter(Boolean) : named;
        if (vals.length > 1) {
          e.t = 'enum';
          // '' (the default for some) means what 'any' or the first listed value means
          const blank = e.d === '' ? [['', vals.includes('any') ? 'Automatic' : 'Default (' + vals[0] + ')']] : [];
          if (blank.length) vals = vals.filter((v) => v !== 'any');
          e.o = [...blank, ...vals.map((v) => [v, v === 'any' ? 'Automatic' : label(v)])];
        }
      } else if (t2 === 'int') {
        const lines = [...descFull.matchAll(/^\s*(-?\d+)(?: or 0x[\dA-F]+)?\s*(?:=|-)\s*(.+?)\s*$/gim)].map((x) => [x[1], x[2].replace(/\..*$/, '')]);
        if (lines.length >= 2 && !/extension_mask|log_mask/.test(k) && (e.d == null || lines.some((x) => x[0] === e.d))) { e.t = 'enum'; e.o = lines; }
      }
      const rng = /range[:\s]*\[?\s*(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*\]?/i.exec(descFull) || /from (-?[\d.]+) to (-?[\d.]+)/.exec(descFull);
      if (rng && (e.t === 'int' || e.t === 'float')) { e.min = Number(rng[1]); e.max = Number(rng[2]); }
      if (e.t === 'bool') e.o = [['true', 'On'], ['false', 'Off']];
      e.l = label(k);
      e.desc = descFull.split('\n')[0].trim() || undefined;
      const adv = ADV_CAT.test(cat) || ADV.test(k) || ADV_DESC.test(descFull);
      e.tab = adv ? 'Advanced' : TAB[cat] || 'System'; if (adv) e.adv = true;
      if (/\/d3d12\/|_win\.cc$/.test(f) || /^d3d12_/.test(k)) e.os = 'windows'; // only in the Windows build (run through Proton)
      out.push(e);
    }
  }
  const x = out.find((e) => e.k === 'draw_resolution_scale_x'), y = out.find((e) => e.k === 'draw_resolution_scale_y');
  if (x && y && x.min != null) { y.min = x.min; y.max = x.max; } // "See draw_resolution_scale_x"
  const order = ['General', 'CPU', 'Graphics', 'Display', 'Audio', 'Controls', 'System', 'Advanced'];
  return out.sort((a, b) => order.indexOf(a.tab) - order.indexOf(b.tab) || a.s.localeCompare(b.s) || a.k.localeCompare(b.k))
    .map(({ str, ...x }) => (str ? { ...x, str: true } : x));
}

module.exports = { id: 'xenia', files: FILES.map((f) => ({ url: RAW + f, as: f })), read };
