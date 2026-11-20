'use strict';
// A file's md5 or sha1 off Electron's main thread (0.9.92). A download's check read the whole file in the main
// process, 1 MB at a time: a 40 GB game kept it busy for minutes, and every page that asks main for something waited
// its turn. hashFile(file, algo, { signal }) -> hex; aborting ends the worker. Tested in test/hashWorker.test.js.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (!isMainThread && workerData?.hashWorker) {
  const fs = require('fs'), crypto = require('crypto');
  try {
    const h = crypto.createHash(workerData.algo), fd = fs.openSync(workerData.file, 'r'), buf = Buffer.allocUnsafe(4 << 20);
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(n === buf.length ? buf : buf.subarray(0, n));
    fs.closeSync(fd);
    parentPort.postMessage({ hex: h.digest('hex') });
  } catch (e) { parentPort.postMessage({ error: e.message }); }
}

function hashFile(file, algo, { signal } = {}) {
  return new Promise((ok, bad) => {
    if (signal?.aborted) return bad(new Error('aborted'));
    let w; try { w = new Worker(__filename, { workerData: { hashWorker: true, file, algo } }); } catch (e) { return bad(e); }
    const stop = () => { w.terminate(); bad(new Error('aborted')); };
    signal?.addEventListener?.('abort', stop, { once: true });
    const done = (fn) => (x) => { signal?.removeEventListener?.('abort', stop); fn(x); };
    w.once('message', done((m) => { w.terminate(); m.error ? bad(new Error(m.error)) : ok(m.hex); }));
    w.once('error', done(bad));
  });
}
module.exports = { hashFile };
