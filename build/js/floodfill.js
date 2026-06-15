// Scanline flood fill with tap-snap, for the coloring pages.
//
// Tap inside a shape -> that whole enclosed region fills, up to the bold outlines.
// Tap ON a line (a near-miss on a thin stem, a finger gap, etc.) -> the fill SNAPS to a nearby
// fillable pixel, preferring the SMALLEST region in reach, so a near-miss colours the thin piece
// you were aiming at instead of doing nothing. It never merges regions: exactly one enclosed
// region fills, bounded by the lines.
//
// Returns true if anything was painted, false if the tap should be ignored.

(function (global) {
  'use strict';

  function luma(r, g, b) {
    return (r * 299 + g * 587 + b * 114) / 1000;   // Rec. 601: "dark outline" vs "any crayon"
  }

  // Label every connected run of fillable pixels (4-connected) and record each region's size.
  // Used only to pick the best snap target (smallest region wins). Built once per page; never
  // changes as the child paints, so any colour can be re-coloured later.
  function buildRegions(mask, width, height) {
    const N = width * height;
    const label = new Int32Array(N);
    const stack = new Int32Array(N);
    const sizes = [0];
    let next = 0;
    for (let s = 0; s < N; s++) {
      if (mask[s] === 1 || label[s] !== 0) continue;
      next++;
      let sp = 0, cnt = 0;
      stack[sp++] = s; label[s] = next;
      while (sp > 0) {
        const p = stack[--sp]; cnt++;
        const x = p % width;
        if (x > 0)         { const q = p - 1;     if (mask[q] === 0 && label[q] === 0) { label[q] = next; stack[sp++] = q; } }
        if (x < width - 1) { const q = p + 1;     if (mask[q] === 0 && label[q] === 0) { label[q] = next; stack[sp++] = q; } }
        if (p >= width)    { const q = p - width; if (mask[q] === 0 && label[q] === 0) { label[q] = next; stack[sp++] = q; } }
        if (p < N - width) { const q = p + width; if (mask[q] === 0 && label[q] === 0) { label[q] = next; stack[sp++] = q; } }
      }
      sizes[next] = cnt;
    }
    return { label, sizes: Int32Array.from(sizes), count: next };
  }

  function floodFill(imageData, startX, startY, fillRGB, opts) {
    const width = imageData.width;
    const height = imageData.height;
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return false;

    const buf = new Uint32Array(imageData.data.buffer);   // little-endian 0xAABBGGRR
    const outlineLuma = opts.outlineLuma;
    const mask = opts.mask || null;
    function isOutline(idx) {
      if (mask) return mask[idx] === 1;
      const c = buf[idx];
      return luma(c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff) < outlineLuma;
    }

    let sx = startX, sy = startY, si = startY * width + startX;

    // --- tap-snap: only when the tap lands on the linework -------------------------------------
    // Look in a small radius for fillable pixels and snap to the one in the SMALLEST region, so a
    // near-miss on a thin stem/finger fills the thin piece rather than the big shape behind it.
    if (isOutline(si)) {
      const label = opts.label || null, sizes = opts.sizes || null;
      const R = opts.snapRadius || 10;
      const R2 = R * R;
      const FLOOR = opts.snapFloor || 12;   // ignore noise specks (sun-ray tips etc.) as targets
      const cx = sx, cy = sy;               // FIXED search centre (the tap) — never mutate mid-loop
      let best = -1, bestScore = Infinity, bx = sx, by = sy;
      for (let dy = -R; dy <= R; dy++) {
        const yy = cy + dy; if (yy < 0 || yy >= height) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = cx + dx; if (xx < 0 || xx >= width) continue;
          const dist = dx * dx + dy * dy; if (dist > R2) continue;
          const ii = yy * width + xx; if (isOutline(ii)) continue;
          let score = dist;
          if (label && sizes) {
            const sz = sizes[label[ii]];
            if (sz < FLOOR) continue;        // a speck is not a real target
            score = sz * 1e6 + dist;         // smallest REAL region wins; distance tie-breaks
          }
          if (score < bestScore) { bestScore = score; best = ii; bx = xx; by = yy; }
        }
      }
      if (best < 0) return false;   // tapped a line with nothing fillable nearby
      sx = bx; sy = by; si = best;
    }

    const target = buf[si];
    const fR = fillRGB.r, fG = fillRGB.g, fB = fillRGB.b;
    const fillPacked = ((255 << 24) | (fB << 16) | (fG << 8) | fR) >>> 0;
    if (target === fillPacked) return false;

    function matches(idx) { return buf[idx] !== fillPacked && !isOutline(idx); }

    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop();
      let x = stack.pop();
      let idx = y * width + x;
      while (x >= 0 && matches(idx)) { x--; idx--; }
      x++; idx++;
      let reachUp = false, reachDown = false;
      while (x < width && matches(idx)) {
        buf[idx] = fillPacked;
        if (y > 0)          { if (matches(idx - width)) { if (!reachUp)   { stack.push(x, y - 1); reachUp = true; } } else reachUp = false; }
        if (y < height - 1) { if (matches(idx + width)) { if (!reachDown) { stack.push(x, y + 1); reachDown = true; } } else reachDown = false; }
        x++; idx++;
      }
    }
    return true;
  }

  const api = { floodFill, buildRegions, luma };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.FloodFill = api;
})(typeof window !== 'undefined' ? window : globalThis);
