// Reads games' IDs from their files off Electron's main thread (0.9.68, fileIds.js createReader)
const { parentPort } = require('worker_threads');
const { read } = require('./fileIds');
parentPort.on('message', ({ n, job }) => {
  try { parentPort.postMessage({ n, ids: (read(job) || []).filter(Boolean) }); } catch (e) { parentPort.postMessage({ n, error: e.message }); }
});
