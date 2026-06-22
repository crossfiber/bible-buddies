// App configuration. The one place to tune content and palette without touching engine code.

const ColoringConfig = {
  // App identity. The logo image carries the wordmark; the tagline is for grown-ups.
  appName: 'Little Lights',
  tagline: 'Coloring & learning for children of God',

  // Where line-art pages and their thumbs live, relative to /build.
  assetBase: '../assets/coloring-pages/',
  // Where UI art (button tiles) lives.
  uiBase: '../assets/ui/',
  // Where section illustrations live.
  sectionArtBase: '../assets/branding/sections/',

  // Home screen activities. Color opens the section picker (sections below).
  activities: [
    { id: 'color', label: 'Color', tile: 'cup.png', screen: 'sections', enabled: true },
    { id: 'saved', label: 'My Pictures', tile: 'tile-saved.png', screen: 'saved', enabled: true },
  ],

  // Picture sections. A page belongs to a section via its `section` field in the manifest
  // (set by the source/<section>/ folder it lives in). Empty sections show "Soon".
  // art = a Higgsfield illustration shown on the card; color = the card fill.
  sections: [
    { id: 'bible-stories', title: 'Bible Stories', art: 'icon-bible.png',   color: '#E8402C' },
    { id: 'animals',       title: 'Land Animals',  art: 'icon-animals.png', color: '#5BB749' },
    { id: 'space',         title: 'Space',         art: 'icon-space.png',   color: '#8E5BC4' },
    { id: 'weather',       title: 'Weather',       art: 'icon-weather.png', color: '#3DA7DC' },
    { id: 'ocean',    title: 'Ocean Animals',  art: 'pack-ocean-1.png',    color: '#20B2AA', locked: true,
      samples: ['pack-ocean-1.png', 'pack-ocean-2.png', 'pack-ocean-3.png'] },
    { id: 'vehicles', title: 'Things That Go', art: 'pack-vehicles-1.png', color: '#F7941E', locked: true,
      samples: ['pack-vehicles-1.png', 'pack-vehicles-2.png', 'pack-vehicles-3.png'] },
  ],

  // The crayon rack. A broad, kid-friendly spread of hues + shades, grounded in the house
  // palette (spec/ART-STYLE-BIBLE.md §5) but widened for more variety. Order = rack order,
  // grouped by hue so it reads like a box of crayons. The colour wheel adds anything else.
  crayons: [
    { name: 'red',        hex: '#E8402C' },
    { name: 'crimson',    hex: '#B5271B' },
    { name: 'rose',       hex: '#E86BA0' },
    { name: 'pink',       hex: '#F4A7B9' },
    { name: 'orange',     hex: '#F7941E' },
    { name: 'amber',      hex: '#FFB02E' },
    { name: 'yellow',     hex: '#FFD23F' },
    { name: 'lemon',      hex: '#FBE773' },
    { name: 'lime',       hex: '#A5D64C' },
    { name: 'green',      hex: '#5BB749' },
    { name: 'forest',     hex: '#2F8F4E' },
    { name: 'teal',       hex: '#20B2AA' },
    { name: 'sky',        hex: '#3DA7DC' },
    { name: 'blue',       hex: '#2C6FB5' },
    { name: 'navy',       hex: '#21407F' },
    { name: 'purple',     hex: '#8E5BC4' },
    { name: 'lavender',   hex: '#C9A6E8' },
    { name: 'brown',      hex: '#8A5A2B' },
    { name: 'tan',        hex: '#C98A5E' },
    { name: 'skin-light', hex: '#F8D5B0' },
    { name: 'skin-deep',  hex: '#9C6239' },
    { name: 'gray',       hex: '#9AA0A6' },
    { name: 'black',      hex: '#222222' },
    { name: 'white',      hex: '#FFFFFF' },
  ],

  // Flood-fill tuning (see floodfill.js).
  outlineLuma: 64,     // luma below this in the ORIGINAL art = a boundary line (mask is built once)
  maxUndo: 8,          // undo depth, capped for low-end-tablet memory
  maxZoom: 6,          // how far a child can magnify to reach small spots
};
