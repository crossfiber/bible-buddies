// On-device saved-picture gallery. Everything lives in IndexedDB on this device only —
// nothing is uploaded, no account, no network. Records: { id, title, ts, full(Blob), thumb(Blob) }.
const Gallery = (function () {
  'use strict';
  const DB = 'little-lights', STORE = 'pictures', VER = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB, VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }
  function store(mode) { return open().then((db) => db.transaction(STORE, mode).objectStore(STORE)); }
  function wrap(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

  function add(rec) { return store('readwrite').then((os) => wrap(os.add(rec))); }
  function all() { return store('readonly').then((os) => wrap(os.getAll())).then((r) => (r || []).sort((a, b) => b.ts - a.ts)); }
  function get(id) { return store('readonly').then((os) => wrap(os.get(id))); }
  function remove(id) { return store('readwrite').then((os) => wrap(os.delete(id))); }
  // Ask the browser to keep our storage so saved pictures aren't evicted under disk pressure.
  function persist() { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); }

  return { add, all, get, remove, persist };
})();
