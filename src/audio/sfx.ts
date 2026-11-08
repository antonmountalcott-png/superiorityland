/** Procedural sound: no audio files to download. The browser only allows it after a user gesture. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private lastTick = 0;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, cutoff: number): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(90, t + dur);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  click(): void { this.tone(520, 0.07, 'triangle', 0.35, 0, 760); }
  send(): void { this.tone(240, 0.14, 'square', 0.16, 0, 520); this.noise(0.1, 0.12, 2200); }
  /** A soft patter while your land grows; rate limited so it never becomes a buzz. */
  capture(): void {
    const now = performance.now();
    if (now - this.lastTick < 90) return;
    this.lastTick = now;
    this.tone(640 + Math.random() * 240, 0.045, 'triangle', 0.07);
  }
  coin(): void { this.tone(880, 0.09, 'square', 0.14); this.tone(1320, 0.16, 'square', 0.14, 0.07); }
  build(): void { this.tone(170, 0.09, 'square', 0.22); this.tone(230, 0.09, 'square', 0.2, 0.09); }
  boom(): void { this.noise(0.8, 0.9, 1600); this.tone(120, 0.6, 'sawtooth', 0.4, 0, 34); }
  whoosh(): void { this.noise(0.4, 0.22, 3400); }
  card(): void { [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.24, i * 0.06)); }
  alarm(): void { this.tone(330, 0.14, 'square', 0.14); this.tone(262, 0.2, 'square', 0.14, 0.13); }
  error(): void { this.tone(150, 0.13, 'square', 0.16); }
  win(): void { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.24, 'triangle', 0.3, i * 0.13)); }
  lose(): void { [392, 349, 311, 233].forEach((f, i) => this.tone(f, 0.38, 'sawtooth', 0.16, i * 0.27)); }
}
