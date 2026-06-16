// "My Pictures" — a view-only gallery of the child's saved pictures (from IndexedDB).
// Tapping a picture opens a full-screen viewer; deleting is hold-to-confirm (toddler-resistant).
const SavedScreen = (function () {
  'use strict';
  let built = false, grid, viewer, viewerImg, currentId = null, holdTimer = null;
  const urls = [];   // object URLs to revoke when the grid re-renders

  function bindTap(id, fn) {
    const el = document.getElementById(id); if (!el) return;
    let lock = 0;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); const n = performance.now(); if (n < lock) return; lock = n + 350; fn(e); });
  }

  function ensure() {
    if (built) return; built = true;
    grid = document.getElementById('saved-grid');
    viewer = document.getElementById('viewer-overlay');
    viewerImg = document.getElementById('viewer-img');
    bindTap('viewer-close', closeViewer);
    const del = document.getElementById('viewer-delete');
    const start = (e) => { e.preventDefault(); del.classList.add('is-holding'); holdTimer = setTimeout(doDelete, 1200); };
    const cancel = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } del.classList.remove('is-holding'); };
    del.addEventListener('pointerdown', start);
    del.addEventListener('pointerup', cancel);
    del.addEventListener('pointerleave', cancel);
    del.addEventListener('pointercancel', cancel);
  }

  function freeUrls() { while (urls.length) URL.revokeObjectURL(urls.pop()); }

  function render() {
    freeUrls();
    grid.textContent = '';
    Gallery.all().then((items) => {
      if (!items.length) {
        const e = document.createElement('p'); e.className = 'gallery-empty'; e.textContent = 'No saved pictures yet'; grid.appendChild(e); return;
      }
      const frag = document.createDocumentFragment();
      items.forEach((rec) => {
        const url = URL.createObjectURL(rec.thumb); urls.push(url);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'card'; btn.setAttribute('aria-label', rec.title || 'Saved picture');
        const img = document.createElement('img'); img.src = url; img.alt = ''; img.draggable = false;
        btn.appendChild(img);
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); openViewer(rec.id); });
        frag.appendChild(btn);
      });
      grid.appendChild(frag);
    });
  }

  function openViewer(id) {
    currentId = id;
    Gallery.get(id).then((rec) => {
      if (!rec) return;
      const url = URL.createObjectURL(rec.full); urls.push(url);
      viewerImg.src = url; viewer.hidden = false;
    });
  }
  function closeViewer() { viewer.hidden = true; viewerImg.removeAttribute('src'); }
  function doDelete() {
    const del = document.getElementById('viewer-delete'); del.classList.remove('is-holding');
    if (!currentId) return;
    Gallery.remove(currentId).then(() => { currentId = null; closeViewer(); render(); });
  }

  function onEnter() { ensure(); render(); }
  return { register() { Screens.register('saved', onEnter); } };
})();
