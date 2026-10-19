'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../electron/dlPending');

test('downloads not finished are kept for the next start, without what only this run needs', () => {
  const q = [
    { id: 1, romId: 476, name: 'God of War III', status: 'downloading', received: 5, speed: 9, abort: {}, dlw: {}, target: '/r/ps4', platformSlug: 'ps4' },
    { id: 2, romId: 7, status: 'queued', only: ['a.bin'] },
    { id: 3, romId: 8, status: 'done' },
    { id: 4, romId: 9, status: 'cancelled' },
    { id: 5, romId: 10, status: 'downloading', redo: true },
  ];
  assert.deepStrictEqual(P.pick(q), [{ romId: 476, name: 'God of War III', platformSlug: 'ps4', target: '/r/ps4' }, { romId: 7, only: ['a.bin'] }]);
});
