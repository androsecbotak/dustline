// audio.js — synthesized sound effects for DUSTLINE (threejs-fps-02).
// WebAudio only: no audio files, no network. Every sound is built from
// oscillators and one shared noise buffer, shaped by gain envelopes.
// The AudioContext is created lazily on first use, because browsers block
// audio before a user gesture. Every method is a no-op when audio is
// unavailable (no AudioContext) or muted, so the game never crashes on
// missing audio. Master gain is kept modest so sounds never clip.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = typeof window !== 'undefined'
      && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      // One shared 1-second white-noise buffer, reused by every
      // noise-based sound so no buffer is allocated per call.
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
      return null;
    }
    return ctx;
  }

  // Short oscillator blip. opts: {freq, freqEnd, type, dur, vol, delay}
  function tone(opts) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  // Filtered noise burst. opts: {dur, vol, freq, freqEnd, type, q, delay}
  function noise(opts) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type || 'lowpass';
    filter.frequency.setValueAtTime(opts.freq || 1200, t0);
    if (opts.freqEnd) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + opts.dur);
    }
    filter.Q.value = opts.q || 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.vol, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  }

  // A gunshot: filtered noise crack + low sine thump.
  function shot(noiseVol, noiseDur, noiseFreq, thumpFreq, thumpVol, thumpDur) {
    noise({ dur: noiseDur, vol: noiseVol, freq: noiseFreq, freqEnd: 300 });
    tone({ freq: thumpFreq, freqEnd: 45, type: 'sine', dur: thumpDur, vol: thumpVol });
  }

  return {
    setMuted(m) { muted = !!m; },

    // Call on a user gesture (click / keydown) to unlock audio.
    resume() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    shoot(kind) {
      if (!ensure() || muted) return;
      if (kind === 'sniper') shot(0.9, 0.35, 900, 90, 0.9, 0.3); // deep, loud
      else if (kind === 'smg') shot(0.45, 0.09, 2400, 170, 0.4, 0.08); // short, high
      else if (kind === 'pistol') shot(0.6, 0.16, 1600, 130, 0.55, 0.12);
      else shot(0.7, 0.2, 1400, 120, 0.65, 0.15); // rifle (default)
    },

    // Dull click: the magazine is empty.
    dryFire() {
      tone({ freq: 1800, type: 'square', dur: 0.03, vol: 0.12 });
    },

    // Hit-marker tick: short high click.
    hit() {
      tone({ freq: 2400, type: 'sine', dur: 0.05, vol: 0.25 });
    },

    // Kill confirmation: two-note chime.
    kill() {
      tone({ freq: 660, type: 'sine', dur: 0.09, vol: 0.3 });
      tone({ freq: 990, type: 'sine', dur: 0.14, vol: 0.3, delay: 0.09 });
    },

    // Player took damage: low thud.
    hurt() {
      tone({ freq: 110, freqEnd: 55, type: 'sine', dur: 0.18, vol: 0.5 });
      noise({ dur: 0.1, vol: 0.15, freq: 400 });
    },

    // Two soft clicks spaced ~0.3s apart.
    reload() {
      tone({ freq: 900, type: 'square', dur: 0.03, vol: 0.15 });
      tone({ freq: 700, type: 'square', dur: 0.03, vol: 0.15, delay: 0.3 });
    },

    // Very soft short noise tap.
    footstep() {
      noise({ dur: 0.06, vol: 0.06, freq: 500 });
    },

    // Filtered noise sweep upward.
    grenadeThrow() {
      noise({ dur: 0.25, vol: 0.2, freq: 600, freqEnd: 2400, type: 'bandpass', q: 1.5 });
    },

    // Dull thock when the grenade hits the ground.
    grenadeBounce() {
      tone({ freq: 220, freqEnd: 120, type: 'sine', dur: 0.07, vol: 0.3 });
      noise({ dur: 0.04, vol: 0.12, freq: 800 });
    },

    // Big noise burst with a low sine drop (0.8s).
    explosion() {
      noise({ dur: 0.8, vol: 0.9, freq: 3000, freqEnd: 120 });
      tone({ freq: 120, freqEnd: 30, type: 'sine', dur: 0.8, vol: 0.9 });
    },

    // Short horn: two sawtooth notes.
    roundStart() {
      tone({ freq: 220, type: 'sawtooth', dur: 0.18, vol: 0.2 });
      tone({ freq: 330, type: 'sawtooth', dur: 0.3, vol: 0.2, delay: 0.18 });
    },

    // Rising three-note stinger.
    roundWin() {
      tone({ freq: 523, type: 'sine', dur: 0.12, vol: 0.3 });
      tone({ freq: 659, type: 'sine', dur: 0.12, vol: 0.3, delay: 0.12 });
      tone({ freq: 784, type: 'sine', dur: 0.25, vol: 0.3, delay: 0.24 });
    },

    // Falling two-note stinger.
    roundLose() {
      tone({ freq: 392, type: 'sine', dur: 0.18, vol: 0.3 });
      tone({ freq: 311, type: 'sine', dur: 0.35, vol: 0.3, delay: 0.18 });
    },

    // Series of short beeps while the bomb is being planted.
    bombPlant() {
      for (let i = 0; i < 4; i++) {
        tone({ freq: 1200, type: 'square', dur: 0.06, vol: 0.2, delay: i * 0.15 });
      }
    },

    // Single short high beep: planted-bomb ticker.
    bombBeep() {
      tone({ freq: 1600, type: 'square', dur: 0.08, vol: 0.22 });
    },

    // Rising beep sequence while defusing.
    bombDefuse() {
      tone({ freq: 800, type: 'sine', dur: 0.08, vol: 0.25 });
      tone({ freq: 1100, type: 'sine', dur: 0.08, vol: 0.25, delay: 0.1 });
      tone({ freq: 1500, type: 'sine', dur: 0.16, vol: 0.25, delay: 0.2 });
    },

    // Cash-register-ish blip: two quick high notes.
    buy() {
      tone({ freq: 1320, type: 'sine', dur: 0.07, vol: 0.25 });
      tone({ freq: 1760, type: 'sine', dur: 0.12, vol: 0.25, delay: 0.07 });
    },

    // Plain UI click.
    click() {
      tone({ freq: 2000, type: 'sine', dur: 0.03, vol: 0.15 });
    },
  };
}
