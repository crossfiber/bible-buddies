// Tiny screen router. Shows exactly one <section.screen> at a time and notifies the screen
// it became active (so e.g. the gallery can lazy-build on first view). No framework needed.

const Screens = (function () {
  'use strict';

  const handlers = {};      // screen name -> function(payload) called when it opens
  let current = null;
  let navLocked = 0;        // debounce window guard against toddler double-taps on nav

  function register(name, onEnter) {
    handlers[name] = onEnter;
  }

  function show(name, payload) {
    const sections = document.querySelectorAll('.screen');
    let found = false;
    sections.forEach((sec) => {
      const isTarget = sec.dataset.screen === name;
      sec.hidden = !isTarget;
      if (isTarget) found = true;
    });
    if (!found) return; // unknown screen name -> do nothing rather than blank the app
    current = name;
    if (typeof handlers[name] === 'function') handlers[name](payload);
  }

  // Debounced navigation: ignores repeat calls inside 300ms so a mash can't bounce screens.
  function go(name, payload) {
    const now = performance.now();
    if (now < navLocked) return;
    navLocked = now + 300;
    if (window.Sound) Sound.play('nav');
    show(name, payload);
  }

  // Wire every [data-nav] button once. pointerdown for snappy response under fast taps.
  function wireNavButtons() {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        go(btn.dataset.nav);
      });
    });
  }

  return { register, go, show, wireNavButtons, get current() { return current; } };
})();
