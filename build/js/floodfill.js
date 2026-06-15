// Region-aware flood fill for the coloring pages.
//
// Two modes:
//  1. REGION mode (preferred): once per page we map every pixel to a fillable region and note,
//     for each region, the tiny "sliver" regions touching it (a finger gap, a leaf notch — too
//     small for a toddler to tap). A tap fills the tapped region PLUS any slivers chained off it,
//     but never spreads into a normal-sized neighbour. So tapping the hand also fills the fingers
//     gripping the palm, while tapping a finger (or the shirt) never floods the whole shirt.
//  2. SCANLINE mode (fallback): a classic flood fill bounded by the outline mask. Used when
//     region data couldn't be built (e.g. a tainted canvas in the Node test harness).
//
// floodFill returns true if anything was painted, false if the tap should be ignored
// (on an outline, or on a region already that exact colour).

(function (global) {
  'use strict';

  function luma(r, g, b) {
    return (r * 299 + g * 587 + b * 114) / 1000;   // Rec. 601: tells "dark outline" from "any crayon"
  }

  // Build per-page region data from the fixed outline mask (1 = a black boundary line).
  // Returns { label, slivNeighbors, count }:
  //   label[idx]        = region id for a fillable pixel, 0 for an outline pixel
  //   slivNeighbors[id] = array of SLIVER region ids that touch region `id` (or undefined)
  // A tap on region R fills R plus the slivers reachable from R through slivNeighbors — i.e. the
  // tiny parts attached to it — and stops at every normal-sized region.
  function buildRegions(mask, width, height) {
    const N = width * height;
    const label = new Int32Array(N);      // 0 = outline / unlabelled
    const stack = new Int32Array(N);      // reused flood stack
    const sizes = [0];
    let next = 0;

    // 1) Label connected runs of fillable pixels, 4-connected.
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

    // A region is a "sliver" if it's smaller than a fingertip — scaled to the page, with a floor.
    const MIN_REGION = Math.max(120, Math.round(N * 0.0003));
    const REACH = 10;                     // px to step across a bold outline to find the neighbour

    // Collect sliver pixels (slivers are small, so this stays cheap).
    const buckets = new Map();
    for (let p = 0; p < N; p++) {
      const L = label[p];
      if (L !== 0 && sizes[L] < MIN_REGION) {
        let arr = buckets.get(L); if (!arr) { arr = []; buckets.set(L, arr); }
        arr.push(p);
      }
    }

    // For every sliver, find the regions it touches, and record the sliver against each of them.
    const slivNeighbors = new Array(next + 1);
    const DIRS = [1, -1, width, -width];
    const DX   = [1, -1, 0, 0];
    buckets.forEach((pixels, L) => {
      const neigh = new Set();
      const stride = Math.max(1, (pixels.length / 400) | 0);
      for (let k = 0; k < pixels.length; k += stride) {
        const p = pixels[k];
        const x = p % width;
        for (let d = 0; d < 4; d++) {
          let q = p, qx = x;
          for (let step = 1; step <= REACH; step++) {
            q += DIRS[d]; qx += DX[d];
            if (q < 0 || q >= N) break;
            if (DX[d] !== 0 && (qx < 0 || qx >= width)) break;   // don't wrap across rows
            const M = label[q];
            if (M === L) continue;
            if (M !== 0) { neigh.add(M); break; }
            // outline: keep stepping to cross the bold line
          }
        }
      }
      neigh.forEach((M) => {
        let arr = slivNeighbors[M]; if (!arr) { arr = []; slivNeighbors[M] = arr; }
        arr.push(L);
      });
    });

    return { label, slivNeighbors, count: next };
  }

  function floodFill(imageData, startX, startY, fillRGB, opts) {
    const width = imageData.width;
    const height = imageData.height;
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return false;

    const buf = new Uint32Array(imageData.data.buffer);   // little-endian 0xAABBGGRR
    const fR = fillRGB.r, fG = fillRGB.g, fB = fillRGB.b;
    const fillPacked = ((255 << 24) | (fB << 16) | (fG << 8) | fR) >>> 0;
    const startIdx = startY * width + startX;

    // --- REGION mode: fill the tapped region + the slivers chained off it ------------------
    if (opts.label && opts.slivNeighbors) {
      const label = opts.label, slivN = opts.slivNeighbors;
      const tapLabel = label[startIdx];
      if (tapLabel === 0) return false;             // tapped the linework — leave it alone
      const inSet = new Uint8Array(slivN.length);
      const queue = [tapLabel]; inSet[tapLabel] = 1;
      while (queue.length) {
        const X = queue.pop();
        const nb = slivN[X];
        if (nb) for (let j = 0; j < nb.length; j++) { const Y = nb[j]; if (!inSet[Y]) { inSet[Y] = 1; queue.push(Y); } }
      }
      let changed = false;
      for (let i = 0; i < buf.length; i++) {
        const L = label[i];
        if (L !== 0 && inSet[L] && buf[i] !== fillPacked) { buf[i] = fillPacked; changed = true; }
      }
      return changed;
    }

    // --- SCANLINE fallback -----------------------------------------------------------------
    const outlineLuma = opts.outlineLuma;
    const mask = opts.mask || null;
    function isOutline(idx) {
      if (mask) return mask[idx] === 1;
      const c = buf[idx];
      return luma(c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff) < outlineLuma;
    }
    if (isOutline(startIdx)) return false;
    if (buf[startIdx] === fillPacked) return false;
    function matches(idx) { return buf[idx] !== fillPacked && !isOutline(idx); }
    const stack = [startX, startY];
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
