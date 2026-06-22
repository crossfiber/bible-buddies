// Sound: all audio is synthesized at runtime with the Web Audio API — no audio files, no
// network, nothing to load. Two layers: short UI sound effects, and a gentle music-box
// lullaby that loops under everything. Stays silent until the child's first touch (browser
// autoplay rule) and can be muted from the home screen; the choice is remembered.

const Sound = (function () {
  'use strict';

  const MUTE_KEY = 'littlelights.muted';
  let ctx = null;          // created on first gesture so autoplay policy is satisfied
  let master = null;       // everything funnels through here -> compressor -> speakers
  let sfxGain = null;      // effects bus
  let musicGain = null;    // lullaby bus (ducks briefly when an effect plays)
  let muted = readMuted(); // persisted preference
  let armed = false;       // has a gesture started the engine yet?
  let lastSfxAt = 0;       // floods of taps can't spawn unlimited voices

  // --- engine bring-up ----------------------------------------------------
  // Build the graph once, lazily, the first time the child touches the screen.
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    // A limiter on the master bus keeps a toddler mashing the screen from ever
    // clipping into a harsh, distorted wall of sound.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 24;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;

    master = ctx.createGain();
    master.gain.value = 0.9;
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.55;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0; // faded up when the lullaby starts

    sfxGain.connect(master);
    musicGain.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    return true;
  }

  // First real gesture starts the audio context and (if not muted) the lullaby.
  function arm() {
    if (armed) return;
    if (!ensure()) return;
    armed = true;
    if (ctx.state === 'suspended') ctx.resume();
    if (!muted) startMusic();
  }

  // --- one synthesized note ----------------------------------------------
  // A short bell/music-box tone: an oscillator with a fast attack and a smooth
  // exponential tail. Used to build both the effects and the melody.
  function tone(bus, freq, when, dur, peak, type) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    osc.connect(g); g.connect(bus);
    const t = when;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // A pitch glide on one oscillator — used for the "swish".
  function glide(bus, f0, f1, dur, peak, type) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    osc.connect(g); g.connect(bus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Briefly dip the music so an effect reads clearly over it, then restore.
  function duckMusic() {
    if (!musicGain || muted) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL * 0.45, t + 0.04);
    musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL, t + 0.5);
  }

  // Gate every effect: needs a live, un-muted engine, and refuses to fire more
  // than once per ~40ms so rapid mashing can't stack into noise.
  function canPlay() {
    if (muted || !ensure()) return false;
    if (!armed) arm();
    const now = performance.now();
    if (now - lastSfxAt < 40) return false;
    lastSfxAt = now;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // --- the effects --------------------------------------------------------
  const FX = {
    // bright two-note sparkle when a region gets filled
    fill: function () {
      const t = ctx.currentTime;
      tone(sfxGain, 740, t, 0.16, 0.5, 'triangle');
      tone(sfxGain, 1108, t + 0.05, 0.18, 0.4, 'triangle');
      duckMusic();
    },
    // soft tick when a crayon colour is chosen
    pick: function () {
      tone(sfxGain, 560, ctx.currentTime, 0.09, 0.35, 'triangle');
    },
    // happy little rising chime on a successful save
    save: function () {
      const t = ctx.currentTime;
      [523, 659, 784, 1047].forEach(function (f, i) { tone(sfxGain, f, t + i * 0.1, 0.32, 0.42, 'triangle'); });
      duckMusic();
    },
    // gentle page-turn swish on navigation
    nav: function () {
      glide(sfxGain, 620, 360, 0.16, 0.22, 'sine');
    },
    // playful "nope" wobble when a locked tile is tapped
    locked: function () {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(196, t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(260, t + 0.24);
      osc.connect(g); g.connect(sfxGain);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.start(t); osc.stop(t + 0.3);
      duckMusic();
    }
  };

  function play(name) {
    if (!canPlay()) return;
    const fn = FX[name];
    if (fn) { try { fn(); } catch (e) { /* never let audio break the app */ } }
  }

  // --- the lullaby --------------------------------------------------------
  // Not a single looping riff — a small musical arc so it actually goes somewhere:
  //   A   calm opening (melody alone)
  //   A'  a rising answer, a little fuller (shimmer joins)
  //   B   a brief swell to a high point, warm bass underneath  <- the build-up / payoff
  //   A'' a falling line that lands and rests on a long tonic, then breathes, before it loops
  // Each note carries a loudness "lvl" so the piece grows and settles instead of droning,
  // and layers (octave shimmer, a sustained root) come in as it builds.
  const MUSIC_LEVEL = 0.18;        // music-bus level; effect ducking still rides on this
  const BEAT = 0.52;               // gentle, unhurried tempo
  const N = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, C3: 130.81, F3: 174.61
  };

  // Build a phrase: rows of [freq, beats] at a shared loudness, optional octave shimmer,
  // and an optional sustained bass root struck on the phrase's first beat.
  function phrase(rows, lvl, shim, bassRoot) {
    return rows.map(function (r, i) {
      return { f: r[0], b: r[1], lvl: lvl, shim: !!shim, bass: (i === 0 ? (bassRoot || 0) : 0) };
    });
  }
  const SONG = [].concat(
    phrase([[N.C4,1],[N.E4,1],[N.G4,1],[N.E4,1],[N.F4,1],[N.A4,1],[N.G4,2]],            0.58, false, 0),
    phrase([[N.E4,1],[N.G4,1],[N.C5,1],[N.G4,1],[N.A4,1],[N.F4,1],[N.E4,1],[N.D4,1]],   0.78, true,  0),
    phrase([[N.F4,1],[N.A4,1],[N.C5,1],[N.A4,1],[N.G4,1],[N.B4,1],[N.D5,2]],            1.00, true,  N.F3),
    phrase([[N.C5,1],[N.B4,1],[N.A4,1],[N.G4,1],[N.E4,1],[N.F4,1],[N.C4,4]],            0.64, true,  N.C3)
  );

  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;

  function scheduleNote(note, when) {
    const peak = 0.5 * note.lvl;
    tone(musicGain, note.f, when, Math.min(note.b * BEAT * 0.95, 1.6), peak, 'triangle');
    if (note.shim) tone(musicGain, note.f * 2, when, Math.min(note.b * BEAT * 0.6, 0.7), 0.14 * note.lvl, 'sine');
    if (note.bass) tone(musicGain, note.bass, when, 8 * BEAT * 0.9, 0.28, 'sine'); // soft sustained root
  }

  function scheduler() {
    // queue any notes due within the next 250ms, then sleep
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const note = SONG[step];
      scheduleNote(note, nextNoteTime);
      nextNoteTime += note.b * BEAT;
      step = (step + 1) % SONG.length;
    }
  }

  function startMusic() {
    if (!ensure() || muted) return;
    if (musicTimer) return;            // already playing
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(0.0001, t);
    musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL, t + 1.5); // ease in
    nextNoteTime = t + 0.15;
    step = 0;
    scheduler();
    musicTimer = setInterval(scheduler, 60);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (musicGain && ctx) {
      const t = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setValueAtTime(musicGain.gain.value, t);
      musicGain.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    }
  }

  // --- mute preference ----------------------------------------------------
  function readMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function writeMuted(v) {
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (e) { /* private mode: ignore */ }
  }
  function setMuted(v) {
    muted = !!v;
    writeMuted(muted);
    if (muted) stopMusic();
    else { if (!armed) arm(); else startMusic(); }
    return muted;
  }
  function toggle() { return setMuted(!muted); }
  function isMuted() { return muted; }

  // Arm on the very first pointer/touch anywhere — guarantees the engine is
  // ready the instant any sound is requested, without an explicit "start" tap.
  function listenForFirstGesture() {
    const onFirst = function () { arm(); };
    window.addEventListener('pointerdown', onFirst, { once: true, capture: true });
    window.addEventListener('touchstart', onFirst, { once: true, capture: true });
  }
  listenForFirstGesture();

  return { play: play, toggle: toggle, setMuted: setMuted, isMuted: isMuted, arm: arm };
})();

// top-level const stays lexical (not a window property), so publish it explicitly
// for the `window.Sound` guards used across the other modules.
window.Sound = Sound;
