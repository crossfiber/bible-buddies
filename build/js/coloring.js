// Coloring screen — opens whatever page the gallery hands it and lets a child flood-fill it.
// Survives chaotic toddler input, stays smooth on a low-end tablet, and is fed pages by id
// (nothing hardcoded to one picture).

const ColoringScreen = (function () {
  'use strict';

  const cfg = ColoringConfig;

  // grabbed once on first entry
  let canvas, ctx, rack, stage, recentEl;
  let wired = false;
  let wheelHue = 0, wheelSat = 1, wheelVal = 1; // colour-wheel state
  let recentColors = [];                        // up to 12 most-recently-used colours

  // per-session drawing state
  let currentRGB = hexToRgb(cfg.crayons[0].hex);
  let undoStack = [];
  let outlineMask = null;    // fixed boundary mask for the current page (built on load)
  let pageRegions = null;    // {label, sizes}: per-page regions, used only for tap-snap
  let busy = false;          // true while a fill runs — drops re-entrant taps
  let pageToken = 0;         // bumped on each load to void stale image callbacks
  let currentPage = null;    // the page now open, so "start over" can reload it clean

  // zoom + pan: lets a child (or parent) magnify to reach small parts of a scene
  const MAX_ZOOM = cfg.maxZoom || 6;
  let z = 1, tx = 0, ty = 0;       // scale + pan offset (CSS px)
  const pointers = new Map();      // active pointers on the canvas
  let pinch = null;                // two-finger pinch state
  let multiTouchUsed = false;      // a 2-finger gesture happened -> the lift must not paint

  // --- one-time setup ----------------------------------------------------
  function ensureWired() {
    if (wired) return;
    wired = true;
    canvas = document.getElementById('paper');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    rack = document.getElementById('rack');
    recentEl = document.getElementById('recent');
    stage = document.getElementById('stage');

    buildRack();
    renderRecent();
    setCurrentColor(cfg.crayons[0].hex);
    setupWheel();
    bindTap('btn-undo', undo);
    bindTap('btn-clear', askStartOver);                 // start-over asks first (see confirm)
    bindTap('confirm-no', hideStartOver);
    bindTap('confirm-yes', () => { hideStartOver(); clearPage(); });
    bindTap('btn-zoom-in', () => zoomBy(1.6));
    bindTap('btn-zoom-out', () => zoomBy(1 / 1.6));
    bindTap('btn-wheel', openWheel);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // --- crayon rack + recent colours --------------------------------------
  function buildRack() {
    const frag = document.createDocumentFragment();
    cfg.crayons.forEach((crayon, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crayon';
      btn.dataset.hex = crayon.hex.toUpperCase();
      btn.style.setProperty('--crayon', crayon.hex);
      btn.setAttribute('aria-label', crayon.name);
      btn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); pickColour(crayon.hex); });
      frag.appendChild(btn);
    });
    rack.appendChild(frag);
  }
  // Set the active colour + highlight the matching crayon. Does NOT touch the recent strip,
  // so selecting a recent swatch never reshuffles the strip under the child's finger.
  function applyColour(hex) {
    hex = hex.toUpperCase();
    currentRGB = hexToRgb(hex);
    for (const el of rack.children) el.setAttribute('aria-pressed', el.dataset.hex === hex ? 'true' : 'false');
    setCurrentColor(hex);
  }
  function setCurrentColor(css) {
    const c = document.getElementById('current-color');
    if (!c) return;
    c.style.background = css;
    c.classList.remove('pick'); void c.offsetWidth; c.classList.add('pick');   // retrigger the bounce
  }
  // Pick a NEW colour (crayon or wheel): apply it and remember it at the front of recents.
  function pickColour(hex) {
    applyColour(hex); addRecent(hex);
    const el = [...rack.children].find((c) => c.dataset.hex === hex.toUpperCase());
    if (el) { el.classList.remove('justpicked'); void el.offsetWidth; el.classList.add('justpicked'); }
  }
  function addRecent(hex) {
    hex = hex.toUpperCase();
    recentColors = recentColors.filter((c) => c !== hex);
    recentColors.unshift(hex);
    if (recentColors.length > 12) recentColors.length = 12;
    renderRecent();
  }
  function renderRecent() {
    if (!recentEl) return;
    recentEl.textContent = '';
    recentColors.forEach((hex) => {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'swatch';
      s.style.setProperty('--crayon', hex);
      s.setAttribute('aria-label', 'recent colour');
      // Selecting a recent colour just applies it — no reorder, so positions stay put.
      s.addEventListener('pointerdown', (e) => { e.preventDefault(); applyColour(hex); });
      recentEl.appendChild(s);
    });
  }
  function rgbToHex(rgb) {
    const h = (n) => n.toString(16).padStart(2, '0');
    return ('#' + h(rgb.r) + h(rgb.g) + h(rgb.b)).toUpperCase();
  }

  // --- colour wheel (custom colours for older users) ---------------------
  function setupWheel() {
    const wc = document.getElementById('wheel-canvas');
    drawWheel(wc, wheelVal);
    wc.addEventListener('pointerdown', (e) => { e.preventDefault(); pickFromWheel(e, wc); });
    wc.addEventListener('pointermove', (e) => { if (e.buttons) pickFromWheel(e, wc); });
    const bright = document.getElementById('wheel-bright');
    bright.addEventListener('input', () => {
      wheelVal = bright.value / 100;
      drawWheel(wc, wheelVal);
      applyWheelColour();
    });
    bindTap('btn-wheel-done', closeWheel);
  }
  function openWheel() { document.getElementById('wheel-overlay').hidden = false; }
  function closeWheel() {
    addRecent(rgbToHex(currentRGB)); // remember the colour the wheel landed on
    document.getElementById('wheel-overlay').hidden = true;
  }

  function drawWheel(wc, val) {
    const c = wc.getContext('2d');
    const s = wc.width, r = s / 2;
    const img = c.createImageData(s, s), d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = x - r, dy = y - r, dist = Math.sqrt(dx * dx + dy * dy), i = (y * s + x) * 4;
        if (dist > r) { d[i + 3] = 0; continue; }
        let h = Math.atan2(dy, dx) * 180 / Math.PI; if (h < 0) h += 360;
        const rgb = hsvToRgb(h, Math.min(1, dist / r), val);
        d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b; d[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  }
  function pickFromWheel(e, wc) {
    const rect = wc.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * wc.width;
    const y = (e.clientY - rect.top) / rect.height * wc.height;
    const r = wc.width / 2, dx = x - r, dy = y - r, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > r) return;
    wheelHue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    wheelSat = Math.min(1, dist / r);
    applyWheelColour();
  }
  function applyWheelColour() {
    currentRGB = hsvToRgb(wheelHue, wheelSat, wheelVal);
    for (const el of rack.children) el.setAttribute('aria-pressed', 'false'); // custom colour active
    const prev = document.getElementById('wheel-preview');
    prev.style.background = 'rgb(' + currentRGB.r + ',' + currentRGB.g + ',' + currentRGB.b + ')';
    setCurrentColor('rgb(' + currentRGB.r + ',' + currentRGB.g + ',' + currentRGB.b + ')');
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  // --- page loading ------------------------------------------------------
  // page: a manifest entry { id, title, file, thumb }.
  function openPage(page) {
    ensureWired();
    if (!page || !page.file) return;
    currentPage = page;
    const token = ++pageToken;
    // Prefer the inlined data URI (works even on file://). Fall back to the file on disk.
    const src = (window.ColoringPages && window.ColoringPages[page.file])
      ? window.ColoringPages[page.file]
      : cfg.assetBase + page.file;

    const img = new Image();
    img.onload = () => {
      if (token !== pageToken) return;
      canvas.width = img.naturalWidth;   // canvas pixels == picture pixels
      canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FFFFFF';         // composite any transparency onto solid white
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      outlineMask = buildOutlineMask();
      // Region labels + sizes let a near-miss tap snap to the smallest nearby shape (thin stems).
      try {
        pageRegions = outlineMask ? FloodFill.buildRegions(outlineMask, canvas.width, canvas.height) : null;
      } catch (_) { pageRegions = null; }
      undoStack = [];
      busy = false;
      resetZoom();            // every new page starts fully zoomed out
    };
    img.onerror = () => {
      if (token !== pageToken) return;
      canvas.width = img.naturalWidth || 1024;
      canvas.height = img.naturalHeight || 1024;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    img.src = src;
  }

  // --- filling -----------------------------------------------------------
  // Build the fixed boundary mask from the freshly-drawn clean page: 1 where a black line is.
  function buildOutlineMask() {
    try {
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = new Uint32Array(id.data.buffer);
      const m = new Uint8Array(src.length);
      const t = cfg.outlineLuma;
      for (let i = 0; i < src.length; i++) {
        const c = src[i];
        const r = c & 0xff, g = (c >> 8) & 0xff, b = (c >> 16) & 0xff;
        m[i] = (r * 299 + g * 587 + b * 114) / 1000 < t ? 1 : 0;
      }
      return m;
    } catch (_) {
      return null; // tainted canvas -> fill falls back to live luma test
    }
  }

  function fillBurst(clientX, clientY) {
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const b = document.createElement('span');
    b.className = 'fill-burst';
    b.style.left = (clientX - r.left) + 'px';
    b.style.top = (clientY - r.top) + 'px';
    stage.appendChild(b);
    setTimeout(function () { b.remove(); }, 460);
  }

  function fillAt(clientX, clientY) {
    const pt = clientToImage(clientX, clientY);
    if (!pt) return; // outside the picture — ignore (mis-tap guard)

    busy = true;
    try {
      const before = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const work = new ImageData(new Uint8ClampedArray(before.data), canvas.width, canvas.height);
      const changed = FloodFill.floodFill(work, pt.x, pt.y, currentRGB, {
        outlineLuma: cfg.outlineLuma,
        mask: outlineMask,
        label: pageRegions && pageRegions.label,
        sizes: pageRegions && pageRegions.sizes,
      });
      if (changed) { pushUndo(before); ctx.putImageData(work, 0, 0); fillBurst(clientX, clientY); }
    } catch (err) {
      // Expected only if the canvas is tainted (file:// without inlined pages).
      console.warn('Coloring fill skipped: could not read canvas pixels. ' +
        'Run build/tools/build-content.py, or serve over http://. See build/README.md.', err);
    } finally {
      busy = false; // always release so one failure never freezes the screen
    }
  }

  // Map a screen tap to a picture pixel using the live rendered box — correct at any
  // screen size or device pixel ratio.
  function clientToImage(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right ||
        clientY < rect.top || clientY > rect.bottom) return null;
    const x = Math.floor((clientX - rect.left) / rect.width * canvas.width);
    const y = Math.floor((clientY - rect.top) / rect.height * canvas.height);
    return {
      x: Math.max(0, Math.min(canvas.width - 1, x)),
      y: Math.max(0, Math.min(canvas.height - 1, y)),
    };
  }

  // --- undo / start-over -------------------------------------------------
  function pushUndo(imageData) {
    undoStack.push(imageData);
    if (undoStack.length > cfg.maxUndo) undoStack.shift();
  }
  function undo() {
    if (busy || !undoStack.length) return;
    ctx.putImageData(undoStack.pop(), 0, 0);
  }
  // "Start over" is destructive, so it asks for confirmation first (next to undo).
  function askStartOver() {
    if (busy || !undoStack.length) return; // nothing coloured yet -> no need to ask
    document.getElementById('confirm-overlay').hidden = false;
  }
  function hideStartOver() { document.getElementById('confirm-overlay').hidden = true; }
  function clearPage() {
    if (busy) return;
    openPage(currentPage); // reload the clean line art (also resets undo)
  }

  // --- zoom + pan --------------------------------------------------------
  function applyTransform() {
    canvas.style.transformOrigin = 'center center';
    canvas.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + z + ')';
  }
  // Keep the picture from being dragged off-screen: clamp pan to the zoomed overflow.
  function clampPan() {
    const maxX = Math.max(0, (canvas.offsetWidth * z - stage.clientWidth) / 2);
    const maxY = Math.max(0, (canvas.offsetHeight * z - stage.clientHeight) / 2);
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }
  function zoomBy(factor) {
    z = Math.max(1, Math.min(MAX_ZOOM, z * factor));
    if (z <= 1.001) { z = 1; tx = 0; ty = 0; } // snap back to a clean fit
    clampPan();
    applyTransform();
  }
  function resetZoom() {
    z = 1; tx = 0; ty = 0; pinch = null; multiTouchUsed = false;
    pointers.clear();
    applyTransform();
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // --- input: tap = fill, drag = pan (when zoomed), two fingers = pinch-zoom ----
  const TAP_SLOP = 10; // px of movement allowed before a tap counts as a drag, not a fill
  function onPointerDown(e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
    if (pointers.size >= 2) {
      multiTouchUsed = true;
      const p = [...pointers.values()];
      pinch = { d0: dist(p[0], p[1]), z0: z, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 };
    }
  }
  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.abs(e.clientX - p.sx) > TAP_SLOP || Math.abs(e.clientY - p.sy) > TAP_SLOP) p.moved = true;

    if (pointers.size >= 2 && pinch) {
      const q = [...pointers.values()];
      const d = dist(q[0], q[1]);
      const mx = (q[0].x + q[1].x) / 2, my = (q[0].y + q[1].y) / 2;
      tx += mx - pinch.mx; ty += my - pinch.my;   // follow the pinch midpoint
      pinch.mx = mx; pinch.my = my;
      z = Math.max(1, Math.min(MAX_ZOOM, pinch.z0 * (d / pinch.d0)));
      if (z <= 1.001) { z = 1; tx = 0; ty = 0; }
      clampPan(); applyTransform();
    } else if (pointers.size === 1 && z > 1) {
      tx += dx; ty += dy; clampPan(); applyTransform();   // one-finger pan when zoomed
    }
  }
  function onPointerUp(e) {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (pointers.size < 2) pinch = null;
    // a clean tap (no drag, not part of a pinch, last finger up) paints
    if (p && !p.moved && !multiTouchUsed && pointers.size === 0) {
      fillAt(e.clientX, e.clientY);
    }
    if (pointers.size === 0) multiTouchUsed = false;
  }
  function onPointerCancel(e) {
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) multiTouchUsed = false;
  }

  // Debounced tap for tool buttons so a mash can't double-fire one action.
  function bindTap(id, fn) {
    const el = document.getElementById(id);
    let lockedUntil = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      lockedUntil = now + 250;
      fn();
    });
  }

  // --- helpers -----------------------------------------------------------
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  function onEnter(page) { openPage(page); }

  return { register() { Screens.register('color', onEnter); } };
})();
