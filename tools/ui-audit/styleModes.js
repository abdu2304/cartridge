// The Plain/Glass rule as a check (0.9.48, owner: "Plain and Glass are two separate modes, never merged"). Reads every
// style rule in src/styles.css, src/tokens.css and the components' <style> blocks and reports:
// - a Liquid Glass token (var(--lg-...)) used by a selector that isn't limited to Glass (body.elements-glass, .lg-*,
//   .dock-glass), which would put glass into Plain;
// - a Plain token (var(--pl-...)) used outside body.style-plain;
// - see-through (a backdrop-filter other than none) on a selector that isn't limited to Glass: Plain is solid.
// Run by npm test (test/styleModes.test.js); EXCEPTIONS are the reviewed cases, each with its reason.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const EXCEPTIONS = {
  'body.bar-pill .tabs': 'the pill Dock with no colour class; Plain always sets dock-black/white/accent (backdrop-filter none), Glass sets dock-glass',
};
// a selector list split at its top-level commas (not the ones inside :is(), :not() ...)
function parts(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
const GLASS = /elements-glass|\.lg-|dock-glass/;
function check(file, css) {
  const out = [];
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim(), body = m[2];
    if (!sel || /^(:root|@|from\b|to\b|\d+%)/.test(sel)) continue;
    const lg = /var\(--lg-/.test(body), pl = /var\(--pl-/.test(body), blur = /backdrop-filter\s*:\s*(?!none\b|var\(--[\w-]+,\s*none\))[^;\s]/.test(body); // var(--x, none) is a token a Glass rule fills in
    for (const p of parts(sel)) {
      if (EXCEPTIONS[p]) continue;
      if (lg && !GLASS.test(p)) out.push(`${file}: Glass token outside Glass: ${p}`);
      if (pl && !/style-plain/.test(p)) out.push(`${file}: Plain token outside Plain: ${p}`);
      if (blur && !GLASS.test(p) && !/style-plain/.test(p)) out.push(`${file}: see-through in Plain too: ${p}`);
    }
  }
  return out;
}
function run() {
  const files = ['src/styles.css', 'src/tokens.css', ...['src/components', 'src/views'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.vue')).map((f) => `${d}/${f}`))];
  const out = [];
  for (const f of files) {
    let css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (f.endsWith('.vue')) css = [...css.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((x) => x[1]).join('\n');
    out.push(...check(f, css));
  }
  return out;
}
module.exports = { run, check, parts };
if (require.main === module) { const r = run(); console.log(r.length ? r.join('\n') : 'Plain and Glass are kept apart.'); process.exitCode = r.length ? 1 : 0; }
