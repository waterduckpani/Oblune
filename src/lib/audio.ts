/**
 * The sound of the site, synthesised in Web Audio, so it costs nothing to download.
 *
 * - A pad: five voices that glide to a new chord for each part of the page, and sink at night.
 * - Glass notes when the line passes a step, drawn from the chord that is playing.
 * - A plucked string (Karplus-Strong) when you strum the orbit line.
 * - Small sounds for touch: a tick on hover, a tap on press, a bloop when the metal gives.
 *
 * Sound is on unless you turn it off (and that choice is remembered). Browsers only let audio
 * start after a click, tap or key press, so the engine is armed on arrival and begins with your
 * first touch of the page. Pages are swapped in place, so once it plays it never stops between them.
 */

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const n = (name: string) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name)!;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  return hz(base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12);
};

/** One chord per scene. Five notes, low to high. */
export const CHORDS: Record<string, number[]> = {
  hero: ['C3', 'G3', 'B3', 'D4', 'E4'].map(n),
  index: ['A2', 'E3', 'B3', 'C4', 'E4'].map(n),
  stocky: ['A2', 'E3', 'G3', 'B3', 'C4'].map(n),
  haqdar: ['F2', 'C3', 'E3', 'A3', 'B3'].map(n),
  bite: ['G2', 'D3', 'E3', 'B3', 'D4'].map(n),
  mull: ['E2', 'B2', 'D3', 'F#3', 'G3'].map(n),
  article: ['D3', 'A3', 'E4', 'F#4', 'A4'].map(n),
  alfard: ['G2', 'D3', 'E3', 'A3', 'B3'].map(n),
  'viraj-mahajan': ['D2', 'A2', 'F#3', 'C#4', 'E4'].map(n),
  'power-policy': ['E2', 'B2', 'G#3', 'D#4', 'F#4'].map(n),
  practice: ['C3', 'G3', 'B3', 'D4', 'E4'].map(n),
  night: ['C2', 'G2', 'D3', 'F#3', 'B3'].map(n),
};

class Sound {
  ctx: AudioContext | null = null;
  on = false;
  private master!: GainNode;
  private wet!: GainNode;
  private padBus!: GainNode;
  private padFilter!: BiquadFilterNode;
  private voices: { a: OscillatorNode; b: OscillatorNode }[] = [];
  private chord = CHORDS.hero;
  private analyser!: AnalyserNode;
  private bins = new Uint8Array(32);
  private lastTick = 0;
  private plucks = new Map<number, AudioBuffer>();
  private listeners = new Set<(on: boolean) => void>();

  get remembered() {
    try { return localStorage.getItem('oblune:sound'); } catch { return null; }
  }
  /** Playing, not just wanted: the browser has let the audio start. */
  get running() { return this.on && !!this.ctx && this.ctx.state === 'running'; }

  /**
   * Sound on arrival: unless it was turned off, start as soon as the browser allows. Coming from
   * this site (a reload, or a link), Chrome lets it start at once; otherwise the first gesture does.
   */
  arm() {
    if (this.remembered === '0') return;
    this.on = true;
    this.listeners.forEach((f) => f(true));
    const nav = navigator as Navigator & { getAutoplayPolicy?: (t: string) => string };
    let allowed = false;
    try { allowed = nav.getAutoplayPolicy?.('audiocontext') === 'allowed'; } catch { /* not supported */ }
    const fromHere = (() => { try { return !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { return false; } })();
    if (allowed || fromHere) this.start();
    const go = () => {
      if (!this.on) return off();
      this.start();
      if (this.ctx?.state === 'running') off();
    };
    const kinds = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
    const off = () => kinds.forEach((k) => removeEventListener(k, go, true));
    kinds.forEach((k) => addEventListener(k, go, true));
  }

  /** Wanted unless it was turned off before. */
  get wanted() { return this.remembered !== '0'; }

  /**
   * Whether the browser lets sound play right now, without a gesture. Chrome and Safari keep a new
   * AudioContext suspended until a click, tap or key press, and its resume() stays pending until
   * then, so if it is not running shortly after arming, the visit needs a moment to enter by.
   */
  async probe(): Promise<boolean> {
    if (!this.wanted) return true;
    if (!this.ctx) this.start();
    const c = this.ctx!;
    if (c.state === 'running') return true;
    return new Promise<boolean>((r) => {
      const t = setTimeout(() => r(c.state === 'running'), 320);
      c.resume().then(() => { clearTimeout(t); r(c.state === 'running'); }, () => {});
    });
  }

  private start() {
    if (!this.ctx) this.build();
    const c = this.ctx!;
    const rise = () => {
      if (!this.on || c.state !== 'running') return;
      this.master.gain.cancelScheduledValues(c.currentTime);
      this.master.gain.setTargetAtTime(0.9, c.currentTime, 0.8);
      this.listeners.forEach((f) => f(true));
    };
    c.resume().then(rise, () => {});
  }

  /** Must be called from a user gesture. */
  enable() {
    this.on = true;
    this.start();
    this.remember();
  }

  disable() {
    this.on = false;
    if (this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
    this.remember();
  }

  toggle() { if (this.on) this.disable(); else this.enable(); }
  onChange(f: (on: boolean) => void) { this.listeners.add(f); }
  private remember() {
    try { localStorage.setItem('oblune:sound', this.on ? '1' : '0'); } catch { /* private mode */ }
    this.listeners.forEach((f) => f(this.on));
  }

  private build() {
    const c = (this.ctx = new AudioContext({ latencyHint: 'interactive' }));
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 64;
    this.master.connect(comp).connect(this.analyser).connect(c.destination);

    // a generated hall, so notes have somewhere to go
    const verb = c.createConvolver();
    const len = c.sampleRate * 3.2;
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    this.wet = c.createGain();
    this.wet.gain.value = 0.55;
    this.wet.connect(verb).connect(this.master);

    // the pad
    this.padFilter = c.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.4;
    this.padBus = c.createGain();
    this.padBus.gain.value = 0.5;
    this.padBus.connect(this.padFilter);
    this.padFilter.connect(this.master);
    this.padFilter.connect(this.wet);
    const lfo = c.createOscillator();
    const lfoAmt = c.createGain();
    lfo.frequency.value = 0.06; lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(this.padFilter.frequency);
    lfo.start();
    this.chord.forEach((f, i) => {
      const g = c.createGain();
      g.gain.value = 0.05 / (1 + i * 0.25);
      const a = c.createOscillator(), b = c.createOscillator();
      a.type = 'sine'; b.type = 'triangle';
      a.frequency.value = f; b.frequency.value = f; b.detune.value = 5 + i;
      const bg = c.createGain(); bg.gain.value = 0.35;
      a.connect(g); b.connect(bg).connect(g);
      g.connect(this.padBus);
      a.start(); b.start();
      this.voices.push({ a, b });
    });

    c.addEventListener('statechange', () => this.listeners.forEach((f) => f(this.on)));
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (this.on) this.ctx.resume();
    });
  }

  /** Glide the pad to a scene's chord. */
  scene(key: string) {
    const ch = CHORDS[key];
    if (!ch || ch === this.chord) return;
    this.chord = ch;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      v.a.frequency.setTargetAtTime(ch[i], t, 0.9);
      v.b.frequency.setTargetAtTime(ch[i], t, 0.9);
    });
  }

  /** 0 by day, 1 at night: the pad closes and sinks. */
  night(v: number) {
    if (!this.ctx) return;
    this.padFilter.frequency.setTargetAtTime(900 - v * 480, this.ctx.currentTime, 0.4);
  }

  private get live() { return this.on && this.ctx && this.ctx.state === 'running'; }

  private env(g: GainNode, peak: number, attack: number, decay: number) {
    const t = this.ctx!.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** A tiny tick, for hovering things you can press. */
  tick() {
    if (!this.live) return;
    const now = performance.now();
    if (now - this.lastTick < 45) return;
    this.lastTick = now;
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.value = 2600 + Math.random() * 300;
    o.connect(g).connect(this.master);
    this.env(g, 0.035, 0.002, 0.04);
    o.start(); o.stop(c.currentTime + 0.08);
  }

  /** A soft bell, for pressing. */
  tap() {
    if (!this.live) return;
    this.note(this.chord[3] * 2, 0.5, 0.8);
  }

  /** A glass note. `i` picks a tone from the chord; `oct` lifts it. */
  chime(i: number, vel = 0.6, oct = 2) {
    if (!this.live) return;
    const f = this.chord[((i % this.chord.length) + this.chord.length) % this.chord.length] * oct;
    this.note(f, vel, 1.8);
  }

  private note(f: number, vel: number, decay: number) {
    const c = this.ctx!;
    const g = c.createGain();
    // a sine and an inharmonic partial, like struck glass
    [[1, 1], [2.76, 0.28], [5.4, 0.08]].forEach(([mul, amp]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = f * mul;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(); o.stop(c.currentTime + decay + 0.1);
    });
    g.connect(this.master); g.connect(this.wet);
    this.env(g, 0.09 * vel, 0.004, decay);
  }

  /** A plucked string at a tone of the current chord. */
  pluck(i: number, vel = 0.6) {
    if (!this.live) return;
    const c = this.ctx!;
    const f = this.chord[((i % 5) + 5) % 5] * (i >= 5 ? 4 : 2);
    const key = Math.round(f);
    let buf = this.plucks.get(key);
    if (!buf) {
      // Karplus-Strong: a burst of noise in a short delay line, averaged as it loops
      const len = Math.floor(c.sampleRate * 1.6);
      buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      const P = Math.max(2, Math.round(c.sampleRate / f));
      for (let k = 0; k < P; k++) d[k] = Math.random() * 2 - 1;
      for (let k = P; k < len; k++) d[k] = 0.4985 * (d[k - P] + d[k - P + 1]);
      this.plucks.set(key, buf);
    }
    const s = c.createBufferSource(), g = c.createGain(), lp = c.createBiquadFilter();
    s.buffer = buf;
    lp.type = 'lowpass'; lp.frequency.value = 1800 + vel * 2600;
    g.gain.value = 0.16 * vel;
    s.connect(lp).connect(g);
    g.connect(this.master); g.connect(this.wet);
    s.start();
  }

  /** The sound of liquid metal letting go. */
  bloop(vel = 0.6) {
    if (!this.live) return;
    const c = this.ctx!, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(980, t + 0.12);
    o.connect(g); g.connect(this.master); g.connect(this.wet);
    this.env(g, 0.08 * vel, 0.01, 0.2);
    o.start(); o.stop(t + 0.3);
  }

  /** Air moving, for things that open and close. */
  whoosh(up = true) {
    if (!this.live) return;
    const c = this.ctx!, t = c.currentTime;
    const len = c.sampleRate * 0.5;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(up ? 400 : 2200, t);
    f.frequency.exponentialRampToValueAtTime(up ? 2200 : 400, t + 0.35);
    s.connect(f).connect(g).connect(this.master);
    this.env(g, 0.05, 0.08, 0.3);
    s.start();
  }

  /** Up the chord and back: for the moon's full cycle, and for a message sent. */
  arpeggio(up = true) {
    if (!this.live) return;
    [0, 1, 2, 3, 4, 5].forEach((k) => setTimeout(() => this.chime(up ? k : 5 - k, 0.5, k >= 5 ? 4 : 2), k * 110));
  }

  /** 0..1 loudness bands, for the waveform in the nav. */
  levels(out: number[]) {
    if (!this.ctx || !this.on) { out.fill(0); return out; }
    this.analyser.getByteFrequencyData(this.bins);
    // the pad lives low, so the bars read bands spaced toward the bottom of the spectrum
    const at = [1, 2, 3, 5, 8];
    for (let i = 0; i < out.length; i++) out[i] = (this.bins[at[i] ?? i] / 255) * (1 + i * 0.35);
    return out;
  }
}

export const sound = new Sound();
