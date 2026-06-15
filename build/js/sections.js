// Section picker: tapping Color lands here. Each section opens its own gallery of pages.
// Cards show a Higgsfield illustration; a section is "ready" if the manifest has pages tagged
// with its id, otherwise it shows a friendly "Soon" until we generate that art.

const SectionsScreen = (function () {
  'use strict';

  let built = false;

  function build() {
    if (built) return;
    built = true;
    const wrap = document.getElementById('sections-grid');
    const pages = Array.isArray(window.ColoringManifest) ? window.ColoringManifest : [];
    const artBase = ColoringConfig.sectionArtBase;
    const frag = document.createDocumentFragment();

    (ColoringConfig.sections || []).forEach((sec) => {
      const count = pages.filter((p) => p.section === sec.id).length;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'section-card' + (count ? '' : ' is-soon');
      card.style.setProperty('--sec', sec.color);
      card.setAttribute('aria-label', sec.title + (count ? '' : ' (coming soon)'));
      card.innerHTML =
        '<span class="section-card__art"><img alt="" draggable="false" src="' + artBase + sec.art + '"></span>' +
        '<span class="section-card__label">' + escapeHtml(sec.title) + '</span>' +
        (count ? '' : '<span class="section-card__soon">Soon</span>');
      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!count) { bounce(card); return; }   // not populated yet -> just wiggle
        Screens.go('gallery', sec);
      });
      frag.appendChild(card);
    });

    wrap.appendChild(frag);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function bounce(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }

  function onEnter() { build(); }
  return { register() { Screens.register('sections', onEnter); } };
})();
