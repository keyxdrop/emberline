// Procedural sound, WebAudio only — no audio files, no network. Every effect is
// a short synth: filtered noise for gunfire and explosions, short sine blips for
// UI, plant beeps and round stingers. The context starts on the first user
// gesture; calls before that are dropped silently.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(duration, filterType, frequency, gainValue, when = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const source = c.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone(frequency, duration, gainValue, type = 'sine', when = 0, slideTo = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  const SHOTS = {
    pistol: { noise: 0.09, freq: 2400, gain: 0.5, tone: 190, slide: 70 },
    smg: { noise: 0.07, freq: 3000, gain: 0.42, tone: 220, slide: 80 },
    rifle: { noise: 0.12, freq: 1800, gain: 0.55, tone: 150, slide: 55 },
    shotgun: { noise: 0.2, freq: 1200, gain: 0.7, tone: 110, slide: 45 },
    sniper: { noise: 0.22, freq: 1500, gain: 0.7, tone: 130, slide: 40 },
    distant: { noise: 0.1, freq: 900, gain: 0.16, tone: 120, slide: 60 },
  };

  return {
    unlock() {
      ensure();
    },
    shot(kind = 'rifle', distant = false) {
      const s = SHOTS[distant ? 'distant' : kind] || SHOTS.rifle;
      noise(s.noise, 'lowpass', s.freq, s.gain);
      tone(s.tone, s.noise + 0.05, s.gain * 0.6, 'triangle', 0, s.slide);
    },
    dry() {
      tone(1400, 0.03, 0.12, 'square');
    },
    reload() {
      tone(700, 0.04, 0.14, 'square', 0);
      tone(500, 0.04, 0.14, 'square', 0.12);
      tone(900, 0.05, 0.16, 'square', 0.55);
    },
    hit() {
      tone(1900, 0.05, 0.2, 'sine');
    },
    kill() {
      tone(880, 0.09, 0.22, 'sine', 0);
      tone(1320, 0.12, 0.2, 'sine', 0.07);
    },
    hurt() {
      noise(0.12, 'lowpass', 500, 0.3);
      tone(90, 0.14, 0.3, 'sawtooth', 0, 55);
    },
    beep(final = false) {
      tone(final ? 1560 : 1180, 0.09, 0.2, 'sine');
    },
    plant() {
      tone(1180, 0.1, 0.2, 'sine', 0);
      tone(1180, 0.1, 0.2, 'sine', 0.18);
      tone(1560, 0.16, 0.22, 'sine', 0.36);
    },
    defuse() {
      tone(1560, 0.1, 0.2, 'sine', 0);
      tone(1560, 0.1, 0.2, 'sine', 0.18);
      tone(2093, 0.2, 0.22, 'sine', 0.36);
    },
    explosion() {
      noise(0.7, 'lowpass', 420, 0.9);
      tone(70, 0.6, 0.6, 'sine', 0, 28);
      noise(0.25, 'highpass', 2500, 0.25, 0.02);
    },
    flash() {
      noise(0.08, 'highpass', 3000, 0.5);
      tone(5200, 0.7, 0.06, 'sine', 0.02);
    },
    buy() {
      tone(660, 0.06, 0.18, 'sine', 0);
      tone(990, 0.08, 0.18, 'sine', 0.06);
    },
    denied() {
      tone(220, 0.12, 0.2, 'square', 0, 160);
    },
    roundWin() {
      tone(523, 0.14, 0.22, 'triangle', 0);
      tone(659, 0.14, 0.22, 'triangle', 0.13);
      tone(784, 0.28, 0.24, 'triangle', 0.26);
    },
    roundLose() {
      tone(392, 0.16, 0.22, 'triangle', 0);
      tone(330, 0.16, 0.22, 'triangle', 0.15);
      tone(262, 0.32, 0.24, 'triangle', 0.3);
    },
  };
}
