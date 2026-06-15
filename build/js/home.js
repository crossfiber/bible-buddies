// Home screen: mascot guide, big tile activity buttons, and a bottom "For Grown-Ups" gate.
// Buttons come from ColoringConfig.activities; their faces are Higgsfield-made tile images.

const HomeScreen = (function () {
  'use strict';

  let built = false;

  function build() {
    if (built) return;
    built = true;

    setText('home-name', ColoringConfig.appName);
    setText('home-tag', ColoringConfig.tagline);

    const wrap = document.getElementById('home-buttons');
    const frag = document.createDocumentFragment();
    ColoringConfig.activities.forEach((act) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'home-btn home-btn--' + act.id + (act.enabled ? '' : ' is-locked');
      btn.setAttribute('aria-label', act.label + (act.enabled ? '' : ' (coming soon)'));
      btn.innerHTML =
        '<span class="home-btn__face"><img class="home-btn__img" alt="" draggable="false" src="' +
        ColoringConfig.uiBase + act.tile + '"></span>' +
        '<span class="home-btn__label">' + escapeHtml(act.label) + '</span>';
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!act.enabled) { bounce(btn); return; }
        Screens.go(act.screen);
      });
      frag.appendChild(btn);
    });
    wrap.appendChild(frag);

    wireGate();
  }

  // --- parent gate (child-resistant press-and-hold) ----------------------
  function wireGate() {
    const overlay = document.getElementById('gate-overlay');
    const stepHold = document.getElementById('gate-step-hold');
    const stepPanel = document.getElementById('gate-step-panel');
    const holdBtn = document.getElementById('gate-hold');
    const HOLD_MS = 1500;
    let timer = null;

    function open() {
      stepHold.hidden = false;
      stepPanel.hidden = true;
      overlay.hidden = false;
    }
    function close() { cancelHold(); overlay.hidden = true; }
    function startHold(e) {
      e.preventDefault();
      holdBtn.classList.add('is-holding');
      timer = setTimeout(() => {
        holdBtn.classList.remove('is-holding');
        stepHold.hidden = true;     // passed the gate
        stepPanel.hidden = false;
      }, HOLD_MS);
    }
    function cancelHold() {
      if (timer) { clearTimeout(timer); timer = null; }
      holdBtn.classList.remove('is-holding');
    }

    document.getElementById('grownups-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); open(); });
    holdBtn.addEventListener('pointerdown', startHold);
    holdBtn.addEventListener('pointerup', cancelHold);
    holdBtn.addEventListener('pointerleave', cancelHold);
    holdBtn.addEventListener('pointercancel', cancelHold);
    document.getElementById('gate-cancel').addEventListener('pointerdown', (e) => { e.preventDefault(); close(); });
    document.getElementById('gate-panel-close').addEventListener('pointerdown', (e) => { e.preventDefault(); close(); });
  }

  // --- helpers -----------------------------------------------------------
  function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ''; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function bounce(el) {
    el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle');
  }

  function onEnter() { build(); }
  return { register() { Screens.register('home', onEnter); } };
})();
