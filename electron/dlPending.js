'use strict';
// Downloads not finished yet, kept across a restart (0.9.86): which queue items, and which of their fields. A re-download
// (redo) is left out: its old copy waits under another name until redownload() itself finishes. Tested in
// test/dlPending.test.js.
const KEYS = ['romId', 'name', 'size', 'platformName', 'platformSlug', 'only', 'more', 'into', 'root', 'target', 'cover', 'addedAt'];
// 0.9.92: paused ('cancelled' in the queue) and failed downloads are kept too, as `held`: they come back as they were
// (Paused or Failed in Downloads, with Resume or Retry), never started on their own. Before, pausing a big game and
// closing Cartridge lost it from the list and left its .part behind.
const HELD = { cancelled: 'cancelled', error: 'error' };
const pick = (queue) => queue.filter((q) => (q.status === 'queued' || q.status === 'downloading' || HELD[q.status]) && !q.redo && q.romId != null)
  .map((q) => ({ ...Object.fromEntries(KEYS.filter((k) => q[k] !== undefined).map((k) => [k, q[k]])), ...(HELD[q.status] ? { held: HELD[q.status], ...(q.status === 'error' && q.error ? { error: String(q.error).slice(0, 300) } : {}), ...(q.received ? { received: q.received } : {}) } : {}) }));
module.exports = { pick, KEYS };
