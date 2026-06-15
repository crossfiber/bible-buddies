// Region-aware flood fill for the coloring pages.
//
// Two modes:
//  1. REGION mode (preferred): we precompute, once per page, which fillable region every
//     pixel belongs to, and merge any sliver too small for a toddler to tap (a finger gap,
//     a leaf notch) into the big shape it sits against. A tap then paints that whole merged
//     group — so tapping the hand also fills the little gaps between the fingers — while the
//     black outlines (and any genuinely separate shape, like a coat stripe) stay intact.
//  2. SCANLINE mode (fallback): a classic flood fill bounded by the outline mask. Used when
//     region data couldn't be built (e.g. a tainted canvas in the Node test harness).
//
// floodFill returns true if anything was painted, false if the tap should be ignored
// (on an outline, or on a region already that exact colour).

(function (global) {
  'use strict';

  function luma(r, g, b) {
    // Rec. 601 luma — good enough to tell "dark outline" from "any crayon".
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  // Build the per-page region data from the fixed outline mask (1 = a black boundary line).
  // Returns { label, group, count } where:
  //   label[idx]  = region id for a fillable pixel, 0 for an outline pixel
  //   group[id]   = the id this region fills as (slivers point at the big shape they merged into)
  // Done once on page load; the result never changes as the child paints.
  function buildRegions(mask, width, height) {
    const N = width * height;
    const label = new Int32Array(N);      // 0 = outline / unlabelled
    const stack = new Int32Array(N);      // reused flood stack (worst case = whole image)
    const sizes = [0];                    // sizes[id] = pixel count
    let next = 0;

    // 1) Label every connected run of fillable (non-outline) pixels, 4-connected.
    for (let s = 0; s < N; s++) {
      if (mask[s] === 1 || label[s] !== 0) continue;
      next++;
      let sp = 0, cnt = 0;
      stack[sp++] = s; label[s] = next;
      while (sp > 0) {
        const p = stack[--sp]; cnt++;
        const x = p % width;
        if (x > 0)          { const q = p - 1;     if (mask[q] === 0 && label[q] === 0) { label[q] = next; stack[sp++] = q; } }
        if (x < width - 1)  { const q = p + 1;     if (mask[q] === 0 && label[q] === 0) { label[q] = next; stack[sp++] = q; } }
        if (p >= width)     { const q = p - width; if (mask[q] === 0 && label[q] === 0) { label[q] = next; stack[sp++] = q; } }
        if (p < N - width)  { const q = p + width; if (mask[q] === 0 && label[q] === 0) { label[q] = next; stack[sp++] = q; } }
      }
      sizes[next] = cnt;
    }

    // 2) Union-find so a sliver can merge into the big shape it touches.
    const parent = new Int32Array(next + 1);
    for (let i = 0; i <= next; i++) parent[i] = i;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }

    // A region is a "sliver" if it's smaller than a fingertip — scaled to the page size, with a
    // floor so it behaves the same on any resolution. Tuned so finger/leaf gaps merge but real
    // shapes (eyes, coat stripes) do not.
    const MIN_REGION = Math.max(120, Math.round(N * 0.0003));
    const REACH = 10;                     // px to step across a bold outline to find the neighbour

    // Collect the pixels of each sliver region (slivers are small, so this stays cheap).
    const buckets = new Map();
    for (let p = 0; p < N; p++) {
      const L = label[p];
      if (L !== 0 && sizes[L] < MIN_REGION) {
        let arr = buckets.get(L); if (!arr) { arr = []; buckets.set(L, arr); }
        arr.push(p);
      }
    }

    const DIRS = [1, -1, width, -width];
    const DX   = [1, -1, 0, 0];
    buckets.forEach((pixels, L) => {
      // Step outward in 4 directions, across the outline, to tally which region each side touches.
      const tally = new Map();
      const stride = Math.max(1, (pixels.length / 400) | 0);   // sample big-ish slivers for speed
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
            if (M !== 0) { tally.set(M, (tally.get(M) || 0) + 1); break; }
            // outline pixel: keep stepping to cross the bold line
          }
        }
      }
      // Merge the sliver into the LARGEST neighbour it touches (never into another sliver if a
      // bigger option exists).
      let best = -1, bestSize = -1;
      tally.forEach((_cnt, M) => { const sz = sizes[find(M)]; if (sz > bestSize) { bestSize = sz; best = M; } });
      if (best > 0) { const ra = find(L), rb = find(best); if (ra !== rb) parent[ra] = rb; }
    });

    const group = new Int32Array(next + 1);
    for (let i = 1; i <= next; i++) group[i] = find(i);
    return { label, group, count: next };
  }

  function floodFill(imageData, startX, startY, fillRGB, opts) {
    const width = imageData.width;
    const height = imageData.height;
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return false;

    // View the RGBA bytes as 32-bit pixels for fast compare/write (little-endian: 0xAABBGGRR).
    const buf = new Uint32Array(imageData.data.buffer);
    const fR = fillRGB.r, fG = fillRGB.g, fB = fillRGB.b;
    const fillPacked = ((255 << 24) | (fB << 16) | (fG << 8) | fR) >>> 0;
    const startIdx = startY * width + startX;

    // --- REGION mode: paint the whole merged group the tap landed in ----------------------
    if (opts.label && opts.group) {
      const label = opts.label, group = opts.group;
      const tapLabel = label[startIdx];
      if (tapLabel === 0) return false;            // tapped the linework — leave it alone
      const g = group[tapLabel];
      let changed = false;
      for (let i = 0; i < buf.length; i++) {
        const L = label[i];
        if (L !== 0 && group[L] === g && buf[i] !== fillPacked) { buf[i] = fillPacked; changed = true; }
      }
      return changed;
    }

    // --- SCANLINE fallback: flood the enclosed region up to the outlines ------------------
    const outlineLuma = opts.outlineLuma;
    const mask = opts.mask || null;
    function isOutline(idx) {
      if (mask) return mask[idx] === 1;
      const c = buf[idx];
      return luma(c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff) < outlineLuma;
    }
    if (isOutline(startIdx)) return false;
    if (buf[startIdx] === fillPacked) return false;

    function matches(idx) {
      if (buf[idx] === fillPacked) return false;
      return !isOutline(idx);
    }

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
        if (y > 0) {
          if (matches(idx - width)) { if (!reachUp) { stack.push(x, y - 1); reachUp = true; } }
          else reachUp = false;
        }
        if (y < height - 1) {
          if (matches(idx + width)) { if (!reachDown) { stack.push(x, y + 1); reachDown = true; } }
          else reachDown = false;
        }
        x++; idx++;
      }
    }
    return true;
  }

  const api = { floodFill, buildRegions, luma };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.FloodFill = api;
})(typeof window !== 'undefined' ? window : globalThis);
