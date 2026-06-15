// Scanline flood fill over an ImageData buffer.
//
// Fills the WHOLE enclosed region the tap lands in — every connected pixel that isn't a dark
// outline — and stops at the bold black outlines. This is what makes "tap the beak, the whole
// beak fills" work: it paints right up to the lines, including faint anti-aliased edge pixels,
// instead of only matching the exact tapped color. Works on any raster line-art page.
//
// Returns true if anything was painted, false if the tap should be ignored (on an outline,
// or on a region already that exact color).

(function (global) {
  'use strict';

  function luma(r, g, b) {
    // Rec. 601 luma — good enough to tell "dark outline" from "any crayon".
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  function floodFill(imageData, startX, startY, fillRGB, opts) {
    const width = imageData.width;
    const height = imageData.height;
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return false;

    // View the RGBA bytes as 32-bit pixels for fast compare/write (little-endian: 0xAABBGGRR).
    const buf = new Uint32Array(imageData.data.buffer);
    const outlineLuma = opts.outlineLuma;
    // Preferred: a fixed outline mask from the ORIGINAL line art (1 = a black boundary line).
    // Boundaries never change as the child paints, so any fill colour — even black — can be
    // re-coloured later. Falls back to a live luma test when no mask is supplied (e.g. tests).
    const mask = opts.mask || null;
    function isOutline(idx) {
      if (mask) return mask[idx] === 1;
      const c = buf[idx];
      return luma(c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff) < outlineLuma;
    }

    const startIdx = startY * width + startX;
    const target = buf[startIdx];

    // Ignore taps on the linework itself, so the outlines stay intact.
    if (isOutline(startIdx)) return false;

    const fR = fillRGB.r, fG = fillRGB.g, fB = fillRGB.b;
    const fillPacked = ((255 << 24) | (fB << 16) | (fG << 8) | fR) >>> 0;
    if (target === fillPacked) return false; // already this color — nothing to do.

    // A pixel is fillable if it isn't a boundary and isn't already painted this pass.
    // This fills the whole region up to the lines, regardless of its current colour.
    function matches(idx) {
      if (buf[idx] === fillPacked) return false;
      return !isOutline(idx);
    }

    // Classic scanline stack fill: fill a horizontal run, seeding the rows above and below.
    const stack = [startX, startY];
    while (stack.length) {
      const y = stack.pop();
      let x = stack.pop();
      let idx = y * width + x;

      // walk left to the start of the run
      while (x >= 0 && matches(idx)) { x--; idx--; }
      x++; idx++;

      let reachUp = false;
      let reachDown = false;
      while (x < width && matches(idx)) {
        buf[idx] = fillPacked;

        if (y > 0) {
          if (matches(idx - width)) {
            if (!reachUp) { stack.push(x, y - 1); reachUp = true; }
          } else { reachUp = false; }
        }
        if (y < height - 1) {
          if (matches(idx + width)) {
            if (!reachDown) { stack.push(x, y + 1); reachDown = true; }
          } else { reachDown = false; }
        }
        x++; idx++;
      }
    }
    return true;
  }

  // Expose for the browser app and for the Node test harness.
  const api = { floodFill, luma };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.FloodFill = api;
})(typeof window !== 'undefined' ? window : globalThis);
