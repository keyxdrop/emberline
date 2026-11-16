// audio.js — a pocket synthesiser. Every sound in EMBERLINE is oscillators and
// filtered noise made on the spot: no audio files, nothing to fetch, and the
// whole band fits in this one file. The context wakes on the first click or
// keypress, as browsers require, and stays silent until then.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.6;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1800, q = 0.8, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  shot(kind) {
    if (kind === 'Scattergun') { this.noise(0.16, 0.5, 700, 0.5); this.tone(120, 0.12, 'triangle', 0.3, 50); }
    else if (kind === 'DMR') { this.noise(0.13, 0.42, 1100, 0.7); this.tone(190, 0.14, 'sawtooth', 0.2, 60); }
    else if (kind === 'LMG' || kind === 'SMG') { this.noise(0.07, 0.3, 2100, 0.9); this.tone(300, 0.05, 'square', 0.1, 140); }
    else { this.noise(0.09, 0.34, 1600, 0.8); this.tone(240, 0.07, 'square', 0.12, 110); }
  }

  dryFire() { this.tone(1200, 0.03, 'square', 0.08); }
  reload() { this.tone(500, 0.05, 'square', 0.1); this.tone(340, 0.05, 'square', 0.1, null, 0.09); this.tone(700, 0.05, 'square', 0.12, null, 0.2); }
  hit() { this.tone(1900, 0.045, 'sine', 0.16); }
  kill() { this.tone(880, 0.09, 'sine', 0.2); this.tone(1318, 0.14, 'sine', 0.18, null, 0.07); }
  hurt() { this.tone(140, 0.12, 'sawtooth', 0.16, 80); this.noise(0.08, 0.12, 500, 0.6); }
  buy() { this.tone(990, 0.06, 'sine', 0.16); this.tone(1480, 0.09, 'sine', 0.14, null, 0.05); }
  denied() { this.tone(180, 0.12, 'square', 0.14, 120); }
  flashPop() { this.noise(0.2, 0.4, 3200, 0.4); this.tone(2400, 0.16, 'sine', 0.1, 300); }
  grenade() { this.noise(0.5, 0.55, 300, 0.4); this.tone(70, 0.45, 'sine', 0.4, 34); }
  plantBeep(final = false) { this.tone(final ? 1560 : 1040, final ? 0.22 : 0.07, 'sine', 0.2); }
  defuseDone() { this.tone(760, 0.1, 'sine', 0.18); this.tone(520, 0.16, 'sine', 0.16, null, 0.09); }
  explosion() {
    this.noise(1.1, 0.7, 200, 0.3);
    this.tone(58, 0.9, 'sine', 0.5, 26);
    this.noise(0.4, 0.3, 900, 0.5, 0.05);
  }
  sting(win) {
    if (win) { this.tone(523, 0.14, 'triangle', 0.2); this.tone(659, 0.14, 'triangle', 0.2, null, 0.12); this.tone(784, 0.3, 'triangle', 0.22, null, 0.24); }
    else { this.tone(392, 0.16, 'triangle', 0.18); this.tone(330, 0.16, 'triangle', 0.18, null, 0.13); this.tone(262, 0.32, 'triangle', 0.18, null, 0.26); }
  }
  horn() { this.tone(196, 0.5, 'sawtooth', 0.12); this.tone(294, 0.5, 'sawtooth', 0.1, null, 0.02); }
}
