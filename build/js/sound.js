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
  // A calm music-box melody in C major, scheduled a little ahead of time with a
  // lookahead clock so it stays smooth regardless of frame timing.
  const MUSIC_LEVEL = 0.16;
  const BEAT = 0.5;                                  // slow, soothing tempo
  const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, C5: 523.25, G3: 196.0 };
  const MELODY = [
    [N.C4, 1], [N.E4, 1], [N.G4, 1], [N.E4, 1],
    [N.F4, 1], [N.A4, 1], [N.G4, 2],
    [N.E4, 1], [N.G4, 1], [N.C5, 1], [N.G4, 1],
    [N.F4, 1], [N.D4, 1], [N.C4, 2]
  ];
  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;

  function scheduleNote(freq, beats, when) {
    tone(musicGain, freq, when, Math.min(beats * BEAT * 0.95, 1.4), 0.5, 'triangle');
    tone(musicGain, freq * 2, when, Math.min(beats * BEAT * 0.6, 0.7), 0.16, 'sine');
    // a soft low root under the first beat of each phrase for warmth
    if (step === 0 || step === 7) tone(musicGain, N.G3, when, beats * BEAT, 0.3, 'sine');
  }

  function scheduler() {
    // queue any notes due within the next 200ms, then sleep
    while (nextNoteTime < ctx.currentTime + 0.2) {
      const pair = MELODY[step];
      scheduleNote(pair[0], pair[1], nextNoteTime);
      nextNoteTime += pair[1] * BEAT;
      step = (step + 1) % MELODY.length;
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
