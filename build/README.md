# /build — the app

Vanilla HTML/CSS/JS, no dependencies, no third-party scripts, no network calls. A single-page
app with three screens, built to the rules in `../spec/ART-STYLE-BIBLE.md` and structured so it
can be wrapped for the app stores later.

## Run it
Easiest: double-click `index.html` — pages are inlined, so coloring works offline.
For the full catalog (or to mirror production), serve from the **project root**:

```
python -m http.server 8000      # then open http://localhost:8000/build/
```

## Screens & flow
- **Home** — mascot guide + big chunky activity buttons. "Color" opens the gallery; "Games"
  is a left-room placeholder (locked, just wiggles). No reading required.
- **Gallery** — a scrollable, lazy-loaded grid of picture cards. Designed for a big, growing
  selection: cards show light thumbnails and images load as they scroll into view. Tap a card
  to color it.
- **Coloring** — tap a crayon, tap a region → flood-fill inside the lines. Undo, start-over,
  and back-to-pictures. **Zoom** with the +/- buttons or a two-finger pinch, and drag to pan
  when zoomed in, so little parts of the detailed scenes are reachable. Tapping still fills; a
  tap that moves becomes a pan (never an accidental fill). Zoom resets on each new page.

## Adding artwork (the important part)
1. Drop new Higgsfield line-art PNGs into `../assets/coloring-pages/source/`, named
   `color-page_<subject>_<NN>.png`. (`source/` holds the RAW art; the app never reads it
   directly.)
2. Run the content builder:
   ```
   python3 build/tools/build-content.py
   ```
   For each raw page it **cleans** the line art (binarizes to crisp black/white and seals
   tiny gaps so every region fills fully up to the lines), then writes the cleaned page to
   `assets/coloring-pages/`, a thumbnail to `thumbs/`, and regenerates the catalog
   (`js/manifest.js`) and inlined pages (`js/pages.js`). The gallery picks them up
   automatically — no code changes. Categories are auto-assigned by keyword (see the script).

## How it's organized
```
build/
  index.html            three <section> screens + custom (non-emoji) SVG icons
  css/coloring.css       workbook look: flat fills, thick outlines, rounded chunky shapes
  js/
    config.js            palette, fill tuning, home activities — content knobs
    manifest.js          AUTO-GENERATED catalog (id/title/category/thumb/file)
    pages.js             AUTO-GENERATED inlined pages (file:// pixel access)
    floodfill.js         scanline flood-fill engine (Node-testable)
    screens.js           tiny screen router (debounced navigation)
    home.js              renders Home activity buttons
    gallery.js           renders the lazy-loaded scrollable gallery
    coloring.js          canvas + crayons + input guards; opens a page on demand
    app.js               boot: registers screens, opens Home
  tools/build-content.py  regenerates manifest + thumbnails + inlined pages
```

## Toddler-proofing (the unhappy path)
- Locked viewport + `touch-action: none` → no pinch / double-tap zoom. The gallery is the only
  scrollable area (`touch-action: pan-y`).
- One fill at a time (`busy` guard); first finger owns the gesture, extra fingers ignored;
  2+ touches in the canvas are cancelled.
- Taps outside the picture ignored; tool buttons debounced (250 ms); screen navigation
  debounced (300 ms) so a mash can't bounce between screens.
- Fills fail safe (never freeze) if pixel reads are ever blocked.

## Performance for a big catalog
Thumbnails (~480 px) keep the gallery light; full-res only loads when a page is opened;
off-screen thumbnails load lazily via IntersectionObserver. Hundreds of pages stay smooth.

## Flagged for later
- **Font:** self-host Baloo 2 / Grandstander (`assets/fonts/`) and enable the `@font-face`.
- **Audio:** brief wants audio cues for non-readers — hook points ready, needs sound assets.
- **Save art, parent gate, categories UI, mini-games:** see the roadmap.
