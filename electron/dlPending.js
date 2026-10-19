'use strict';
// Downloads not finished yet, kept across a restart (0.9.86): which queue items, and which of their fields. A re-download
// (redo) is left out: its old copy waits under another name until redownload() itself finishes. Tested in
// test/dlPending.test.js.
const KEYS = ['romId', 'name', 'size', 'platformName', 'platformSlug', 'only', 'more', 'into', 'root', 'target', 'cover', 'addedAt'];
const pick = (queue) => queue.filter((q) => (q.status === 'queued' || q.status === 'downloading') && !q.redo && q.romId != null)
  .map((q) => Object.fromEntries(KEYS.filter((k) => q[k] !== undefined).map((k) => [k, q[k]])));
module.exports = { pick, KEYS };
