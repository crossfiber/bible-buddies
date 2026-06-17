// Section picker: tapping Color lands here. Free packs open their gallery; premium packs show a
// crown badge and a "peek inside" preview, then a parental gate (the actual purchase is wired at
// the native-app stage — for now it lands on a friendly "coming soon").
const SectionsScreen = (function () {
  'use strict';
  let built = false;

  function bindTap(id, fn) {
    const el = document.getElementById(id); if (!el) return;
    let lock = 0;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); const n = performance.now(); if (n < lock) return; lock = n + 350; fn(e); });
  }

  function build() {
    if (built) return; built = true;
    const wrap = document.getElementById('sections-grid');
    const pages = Array.isArray(window.ColoringManifest) ? window.ColoringManifest : [];
    const artBase = ColoringConfig.sectionArtBase;
    const crown = '<span class="section-card__crown" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 37 L8 17 L17 25 L24 11 L31 25 L40 17 L40 37 Z"/><rect x="8" y="37" width="32" height="5"/></svg></span>';
    const frag = document.createDocumentFragment();

    (ColoringConfig.sections || []).forEach((sec) => {
      const count = pages.filter((p) => p.section === sec.id).length;
      const locked = !!sec.locked;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'section-card' + (locked ? ' is-locked' : (count ? '' : ' is-soon'));
      card.style.setProperty('--sec', sec.color);
      card.setAttribute('aria-label', sec.title + (locked ? ' (premium pack)' : (count ? '' : ' (coming soon)')));
      const badge = locked ? crown : (count ? '' : '<span class="section-card__soon">Soon</span>');
      card.innerHTML =
        '<span class="section-card__art"><img alt="" draggable="false" src="' + artBase + sec.art + '"></span>' +
        '<span class="section-card__label">' + escapeHtml(sec.title) + '</span>' + badge;
      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (locked) { openPack(sec); return; }
        if (!count) { bounce(card); return; }   // empty + not premium -> just wiggle
        Screens.go('gallery', sec);
      });
      frag.appendChild(card);
    });
    wrap.appendChild(frag);
    wirePack();
  }

  // --- premium pack preview + parental gate ---
  let packWired = false;
  function wirePack() {
    if (packWired) return; packWired = true;
    bindTap('pack-close', closePack);
    bindTap('pack-soon-done', closePack);
    bindTap('pack-unlock', () => step('pack-step-hold'));
    bindTap('pack-hold-cancel', () => step('pack-step-preview'));
    const hold = document.getElementById('pack-hold');
    let timer = null;
    const start = (e) => { e.preventDefault(); hold.classList.add('is-holding'); timer = setTimeout(() => { hold.classList.remove('is-holding'); step('pack-step-soon'); }, 1500); };
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } hold.classList.remove('is-holding'); };
    hold.addEventListener('pointerdown', start);
    hold.addEventListener('pointerup', cancel);
    hold.addEventListener('pointerleave', cancel);
    hold.addEventListener('pointercancel', cancel);
  }
  function step(id) {
    ['pack-step-preview', 'pack-step-hold', 'pack-step-soon'].forEach((s) => { const el = document.getElementById(s); if (el) el.hidden = (s !== id); });
  }
  function openPack(sec) {
    document.getElementById('pack-title').textContent = sec.title;
    const wrap = document.getElementById('pack-samples'); wrap.textContent = '';
    (sec.samples || []).forEach((s) => {
      const f = document.createElement('span'); f.className = 'pack-sample';
      const img = document.createElement('img'); img.src = ColoringConfig.sectionArtBase + s; img.alt = ''; img.draggable = false;
      f.appendChild(img); wrap.appendChild(f);
    });
    step('pack-step-preview');
    document.getElementById('pack-overlay').hidden = false;
  }
  function closePack() { document.getElementById('pack-overlay').hidden = true; }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function bounce(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }

  function onEnter() { build(); }
  return { register() { Screens.register('sections', onEnter); } };
})();
