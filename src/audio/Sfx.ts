/** Tiny synthesised sound effects, no asset files. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Browsers only allow audio after a user gesture; call this from a click/keydown. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx!.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx!.destination);
    }
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  play(k: string) {
    switch (k) {
      case 'step': this.tone(700 + Math.random() * 300, 1100, 0.06, 'sine', 0.08); break;
      case 'jump': this.tone(220, 660, 0.22, 'square', 0.18); break;
      case 'land': this.tone(140, 50, 0.18, 'sine', 0.6); this.noise(0.12, 0.25, 500); break;
      case 'grab': this.tone(500, 900, 0.09, 'triangle', 0.35); break;
      case 'drop': this.tone(600, 300, 0.1, 'triangle', 0.25); break;
      case 'miss': this.tone(300, 200, 0.08, 'sine', 0.15); break;
      case 'throw': this.noise(0.25, 0.3, 1800); this.tone(400, 1200, 0.2, 'sine', 0.2); break;
      case 'lever': this.tone(180, 90, 0.12, 'square', 0.3); this.tone(900, 900, 0.05, 'square', 0.15, 0.1); break;
      case 'plate': this.tone(800, 800, 0.05, 'square', 0.15); break;
      case 'bonk': this.tone(520, 80, 0.35, 'square', 0.35); this.noise(0.15, 0.4, 900); break;
      case 'star': this.tone(880, 880, 0.1, 'triangle', 0.3); this.tone(1320, 1320, 0.2, 'triangle', 0.3, 0.09); break;
      case 'target': [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, f, 0.15, 'triangle', 0.3, i * 0.08)); break;
      case 'checkpoint': this.tone(660, 660, 0.1, 'sine', 0.25); this.tone(990, 990, 0.18, 'sine', 0.25, 0.1); break;
      case 'fumble': this.tone(500, 60, 0.7, 'sawtooth', 0.25); break;
      case 'pop': this.tone(300, 900, 0.08, 'sine', 0.25); break;
      case 'rumble': this.noise(0.5, 0.25, 180); break;
      case 'chaos-warn': this.tone(300, 300, 0.12, 'square', 0.15); this.tone(300, 300, 0.12, 'square', 0.15, 0.25); break;
      case 'chaos': this.noise(0.4, 0.5, 2500); this.tone(900, 150, 0.4, 'sawtooth', 0.25); break;
      case 'hic': this.tone(400, 1000, 0.09, 'sine', 0.35); break;
      case 'roar': this.tone(160, 55, 0.7, 'sawtooth', 0.45); this.tone(230, 70, 0.6, 'square', 0.2); this.noise(0.6, 0.4, 700); break;
      case 'stomp': this.tone(110, 35, 0.3, 'sine', 0.8); this.noise(0.22, 0.5, 350); break;
      case 'smash': this.noise(0.7, 0.6, 1400); this.tone(200, 40, 0.5, 'square', 0.25); break;
      case 'button': this.tone(300, 150, 0.15, 'square', 0.3); this.tone(600, 900, 0.25, 'triangle', 0.3, 0.12); break;
      case 'finish': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.22, 'square', 0.2, i * 0.13)); break;
    }
  }
}
