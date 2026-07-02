// All sound is synthesized with WebAudio -- no asset files.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // shared white-noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbience();
  }

  get t() { return this.ctx.currentTime; }

  // volume falloff for events away from the listener
  distGain(dist) {
    if (dist == null) return 1;
    return Math.min(1, 400 / Math.max(80, dist));
  }

  noise(dur, { freq = 1000, q = 1, gain = 0.5, type = 'lowpass', decay = true } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    if (decay) g.gain.exponentialRampToValueAtTime(0.001, this.t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start();
    src.stop(this.t + dur);
    return { src, filt, g };
  }

  tone(dur, { freq = 440, endFreq = null, type = 'sawtooth', gain = 0.3 } = {}) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.t);
    if (endFreq != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), this.t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.001, this.t + dur);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(this.t + dur);
    return { osc, g };
  }

  // ---------------- weapon sounds ----------------

  machinegun() {
    if (!this.ctx) return;
    this.noise(0.09, { freq: 2500, gain: 0.35, q: 0.8 });
    this.tone(0.06, { freq: 220, endFreq: 60, type: 'square', gain: 0.18 });
  }

  shotgun() {
    if (!this.ctx) return;
    this.noise(0.35, { freq: 900, gain: 0.7, q: 0.5 });
    this.noise(0.15, { freq: 4000, gain: 0.35, type: 'highpass' });
    this.tone(0.25, { freq: 120, endFreq: 40, type: 'square', gain: 0.35 });
  }

  rocketFire() {
    if (!this.ctx) return;
    this.noise(0.5, { freq: 700, gain: 0.5 });
    this.tone(0.5, { freq: 300, endFreq: 90, type: 'sawtooth', gain: 0.25 });
  }

  railgun() {
    if (!this.ctx) return;
    this.tone(0.7, { freq: 2400, endFreq: 200, type: 'sawtooth', gain: 0.3 });
    this.tone(0.4, { freq: 1200, endFreq: 3600, type: 'sine', gain: 0.2 });
    this.noise(0.3, { freq: 5000, gain: 0.25, type: 'highpass' });
  }

  lightning() {
    if (!this.ctx) return;
    this.noise(0.07, { freq: 3800, gain: 0.22, type: 'bandpass', q: 2 });
    this.tone(0.07, { freq: 80 + Math.random() * 60, type: 'sawtooth', gain: 0.12 });
  }

  plasma() {
    if (!this.ctx) return;
    this.tone(0.15, { freq: 900, endFreq: 300, type: 'square', gain: 0.15 });
    this.noise(0.08, { freq: 2000, gain: 0.12, type: 'bandpass', q: 3 });
  }

  gauntlet() {
    if (!this.ctx) return;
    this.tone(0.1, { freq: 150, endFreq: 400, type: 'sawtooth', gain: 0.15 });
  }

  // ---------------- world sounds ----------------

  explosion(dist) {
    if (!this.ctx) return;
    const v = this.distGain(dist);
    this.noise(0.9, { freq: 400, gain: 0.9 * v });
    this.noise(0.4, { freq: 2000, gain: 0.4 * v });
    this.tone(0.8, { freq: 90, endFreq: 25, type: 'triangle', gain: 0.6 * v });
  }

  jump() {
    if (!this.ctx) return;
    this.tone(0.15, { freq: 180, endFreq: 320, type: 'sine', gain: 0.15 });
  }

  land() {
    if (!this.ctx) return;
    this.noise(0.1, { freq: 500, gain: 0.2 });
  }

  hurt() {
    if (!this.ctx) return;
    this.tone(0.25, { freq: 300, endFreq: 120, type: 'sawtooth', gain: 0.3 });
    this.noise(0.15, { freq: 800, gain: 0.2 });
  }

  burn() {
    if (!this.ctx) return;
    this.noise(0.4, { freq: 1200, gain: 0.35, q: 0.6 });
    this.tone(0.3, { freq: 200, endFreq: 90, type: 'sawtooth', gain: 0.2 });
  }

  die() {
    if (!this.ctx) return;
    this.tone(1.2, { freq: 260, endFreq: 40, type: 'sawtooth', gain: 0.4 });
    this.noise(1.0, { freq: 600, gain: 0.5 });
  }

  pickup(big = false) {
    if (!this.ctx) return;
    if (big) {
      this.tone(0.12, { freq: 440, type: 'square', gain: 0.15 });
      setTimeout(() => this.tone(0.25, { freq: 660, type: 'square', gain: 0.15 }), 90);
    } else {
      this.tone(0.15, { freq: 520, endFreq: 780, type: 'triangle', gain: 0.18 });
    }
  }

  weaponPickup() {
    if (!this.ctx) return;
    this.tone(0.1, { freq: 330, type: 'square', gain: 0.14 });
    setTimeout(() => this.tone(0.1, { freq: 494, type: 'square', gain: 0.14 }), 80);
    setTimeout(() => this.tone(0.2, { freq: 659, type: 'square', gain: 0.14 }), 160);
  }

  jumppad() {
    if (!this.ctx) return;
    this.tone(0.35, { freq: 200, endFreq: 700, type: 'sine', gain: 0.3 });
    this.noise(0.2, { freq: 1500, gain: 0.15 });
  }

  teleport() {
    if (!this.ctx) return;
    this.tone(0.5, { freq: 1400, endFreq: 100, type: 'sawtooth', gain: 0.25 });
    this.tone(0.5, { freq: 100, endFreq: 1400, type: 'sine', gain: 0.2 });
  }

  enemyDie(dist) {
    if (!this.ctx) return;
    const v = this.distGain(dist);
    this.tone(0.5, { freq: 400 + Math.random() * 200, endFreq: 60, type: 'sawtooth', gain: 0.35 * v });
    this.noise(0.5, { freq: 900, gain: 0.4 * v });
  }

  enemyPain(dist) {
    if (!this.ctx) return;
    const v = this.distGain(dist);
    this.tone(0.15, { freq: 500 + Math.random() * 300, endFreq: 200, type: 'square', gain: 0.12 * v });
  }

  enemySpawn(dist) {
    if (!this.ctx) return;
    const v = this.distGain(dist);
    this.tone(0.6, { freq: 60, endFreq: 300, type: 'sawtooth', gain: 0.2 * v });
    this.noise(0.5, { freq: 500, gain: 0.2 * v });
  }

  fireball(dist) {
    if (!this.ctx) return;
    const v = this.distGain(dist);
    this.noise(0.3, { freq: 900, gain: 0.25 * v });
    this.tone(0.3, { freq: 400, endFreq: 150, type: 'sawtooth', gain: 0.12 * v });
  }

  // Low hellish drone + slow lava rumble, loops forever.
  startAmbience() {
    const t = this.t;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.14, t + 4);
    g.connect(this.master);

    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 38;
    const droneFilt = this.ctx.createBiquadFilter();
    droneFilt.type = 'lowpass';
    droneFilt.frequency.value = 120;
    drone.connect(droneFilt).connect(g);
    drone.start();

    const drone2 = this.ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 57; // dissonant fifth-ish
    drone2.connect(g);
    drone2.start();

    // slowly wobble the drone for unease
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain).connect(drone.frequency);
    lfo.start();

    // continuous filtered-noise rumble (the lava)
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const rumbleFilt = this.ctx.createBiquadFilter();
    rumbleFilt.type = 'lowpass';
    rumbleFilt.frequency.value = 90;
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.value = 0.5;
    src.connect(rumbleFilt).connect(rumbleGain).connect(g);
    src.start();
  }
}
