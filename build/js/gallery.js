// Gallery screen: a scrollable, lazy-loaded grid of the pages in the chosen section.
// Rebuilt each time a section opens. Remembers the active section so backing out of a
// coloured page (nav -> gallery with no payload) returns to the SAME section, not all pages.

const GalleryScreen = (function () {
  'use strict';

  const TAP_SLOP = 12;       // px a finger may move and still count as a tap, not a scroll
  let observer = null;
  let lastSection = null;    // the section currently being browsed

  function render(section) {
    const grid = document.getElementById('gallery-grid');
    const titleEl = document.getElementById('gallery-title');
    grid.textContent = '';                                   // clear the previous section
    if (observer) { observer.disconnect(); observer = null; }
    if (titleEl) titleEl.textContent = section ? section.title : 'Pictures';

    const base = ColoringConfig.assetBase;
    const all = Array.isArray(window.ColoringManifest) ? window.ColoringManifest : [];
    const pages = section ? all.filter((p) => p.section === section.id) : all;

    observer = ('IntersectionObserver' in window)
      ? new IntersectionObserver(onIntersect, { root: grid, rootMargin: '300px' })
      : null;

    const frag = document.createDocumentFragment();
    pages.forEach((page) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.setAttribute('aria-label', page.title);

      const img = document.createElement('img');
      img.className = 'card__img';
      img.alt = '';
      img.draggable = false;
      const src = base + page.thumb;
      if (observer) { img.dataset.src = src; } else { img.src = src; }
      card.appendChild(img);

      // Open ONLY on a real tap — a finger that moves is a scroll, not an open.
      let downX = 0, downY = 0, tap = false;
      card.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; tap = true; });
      card.addEventListener('pointermove', (e) => {
        if (tap && (Math.abs(e.clientX - downX) > TAP_SLOP || Math.abs(e.clientY - downY) > TAP_SLOP)) tap = false;
      });
      card.addEventListener('pointerup', (e) => {
        if (tap && Math.abs(e.clientX - downX) <= TAP_SLOP && Math.abs(e.clientY - downY) <= TAP_SLOP) {
          Screens.go('color', page);
        }
        tap = false;
      });
      card.addEventListener('pointercancel', () => { tap = false; });

      frag.appendChild(card);
      if (observer) observer.observe(img);
    });

    grid.appendChild(frag);

    if (!pages.length) {
      const empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent = 'Pictures coming soon';
      grid.appendChild(empty);
    }
  }

  function onIntersect(entries) {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      observer.unobserve(img);
    });
  }

  // section is passed when opened from the section picker; absent when returning from a page.
  function onEnter(section) {
    if (section) lastSection = section;
    render(lastSection);
  }

  return { register() { Screens.register('gallery', onEnter); } };
})();
