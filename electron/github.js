// A GitHub project's newest release and its files (0.9.17). The API allows 60 requests an hour per
// address without an account and then answers 403, which users saw as "GitHub answered 403". When the
// API refuses, the release pages are read instead: /releases/latest redirects to /releases/tag/<tag>,
// and /releases/expanded_assets/<tag> lists the files as /<repo>/releases/download/<tag>/<name> links.
const webFetch = require('./webFetch');
const UA = { 'User-Agent': 'Cartridge', Accept: 'application/vnd.github+json' };

// -> { tag, date, assets: [{ name, url, size }] } (size 0 when only the page was read)
async function release(repo, { tag, pre, fetchImpl = webFetch } = {}) {
  const api = `https://api.github.com/repos/${repo}/releases${tag ? `/tags/${tag}` : pre ? '?per_page=5' : '/latest'}`;
  const r = await fetchImpl(api, { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (r && r.ok) {
    let j = await r.json();
    if (Array.isArray(j)) j = j.find((x) => !x.draft) || null;
    if (!j) return null;
    return { tag: j.tag_name, date: j.published_at || j.created_at || '', assets: (j.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size || 0, date: a.updated_at })) };
  }
  if (r && r.status === 404) return null;
  return fromPages(repo, tag, fetchImpl, pre);
}
async function fromPages(repo, tag, fetchImpl = webFetch, pre = false) {
  const H = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Cartridge' };
  // pre-releases count (0.9.37): the newest one listed on the releases page, which "latest" never names
  if (!tag && pre) {
    const r = await fetchImpl(`https://github.com/${repo}/releases`, { headers: H, signal: AbortSignal.timeout(20000) });
    if (r.ok) tag = decodeURIComponent((/\/releases\/tag\/([^"/?#]+)/.exec(await r.text()) || [])[1] || '');
  }
  if (!tag) {
    const r = await fetchImpl(`https://github.com/${repo}/releases/latest`, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}. Try again in a while.`);
    tag = decodeURIComponent((/\/releases\/tag\/([^/?#]+)/.exec(r.url || '') || [])[1] || '');
    if (!tag) { const html = await r.text(); tag = decodeURIComponent((/\/releases\/tag\/([^"/?#]+)/.exec(html) || [])[1] || ''); }
    if (!tag) throw new Error('GitHub didn’t say which release is the newest. Try again in a while.');
  }
  const p = await fetchImpl(`https://github.com/${repo}/releases/expanded_assets/${encodeURIComponent(tag)}`, { headers: H, signal: AbortSignal.timeout(20000) });
  if (!p.ok) throw new Error(`GitHub answered ${p.status}. Try again in a while.`);
  return { tag, date: '', assets: parseAssets(await p.text(), repo) };
}
function parseAssets(html, repo) {
  const out = [], seen = new Set();
  const re = new RegExp(`href="(/${repo.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/releases/download/[^"]+)"`, 'gi');
  for (const m of String(html).matchAll(re)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (seen.has(href)) continue; seen.add(href);
    out.push({ name: decodeURIComponent(href.split('/').pop()), url: 'https://github.com' + href, size: 0 });
  }
  return out;
}
// Search GitHub for projects (0.9.64, owner: typing a whole GitHub link on a controller is a pain): a few words,
// most-starred first. The API's search allows 10 requests a minute without an account; when it refuses, the search
// page's own data is read. -> [{ repo, description, stars, updated }]
async function search(q, { fetchImpl = webFetch } = {}) {
  const words = String(q || '').trim().slice(0, 120);
  if (!words) return [];
  const r = await fetchImpl(`https://api.github.com/search/repositories?q=${encodeURIComponent(words)}&sort=stars&order=desc&per_page=12`, { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (r && r.ok) { const j = await r.json(); return (j.items || []).map((x) => ({ repo: x.full_name, description: x.description || '', stars: x.stargazers_count || 0, updated: x.pushed_at || x.updated_at || '', fork: !!x.fork })); }
  const p = await fetchImpl(`https://github.com/search?q=${encodeURIComponent(words)}&type=repositories&s=stars&o=desc`, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Cartridge', Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  if (!p.ok) throw new Error(`GitHub answered ${p.status}. Try again in a minute.`);
  return parseSearch(await p.text());
}
// the search page carries its results as JSON ("results":[{ "hl_name", "hl_trimmed_description", "followers", "repo": { "repository": { "owner_login", "name", "updated_at" } } }])
function parseSearch(html) {
  const out = [], seen = new Set();
  const m = /<script type="application\/json" data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/.exec(String(html));
  let results = [];
  try { results = JSON.parse(m[1]).payload.results || []; } catch {}
  for (const x of results) {
    const r = x.repo?.repository, repo = r ? `${r.owner_login}/${r.name}` : String(x.hl_name || '').replace(/<[^>]+>/g, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || seen.has(repo)) continue; seen.add(repo);
    out.push({ repo, description: String(x.hl_trimmed_description || '').replace(/<[^>]+>/g, ''), stars: x.followers || 0, updated: r?.updated_at || '', fork: false });
  }
  return out;
}
module.exports = { release, fromPages, parseAssets, search, parseSearch };
