// Tüm ses efektleri Web Audio API ile sentezlenir; harici dosya gerektirmez.
// Sahaya özel: top vuruşu, pas, orta, gol, ağa çarpma, hakem düdüğü,
// taraftar uğultusu (sürekli), gol tezahüratı, direk, ayak temas vb.

class SfxEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.muted = false;
    this.crowdNodes = null;
    this._inited = false;
  }

  init() {
    if (this._inited) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.0;
    this.crowdGain.connect(this.master);

    this._buildCrowd();
    this._inited = true;
  }

  // İlk kullanıcı etkileşiminden sonra çağrılır (tarayıcı autoplay kuralı)
  resume() {
    if (!this._inited) this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.85;
  }

  // ---------- TARAFTAR ATMOSFERİ ----------
  _buildCrowd() {
    const ctx = this.ctx;
    // Pembe gürültü tabanı + bant geçiren filtre = uzaktan kalabalık homurtusu
    const bufSize = 2 * ctx.sampleRate;
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      // basit pembe gürültü (Paul Kellet)
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
    }
    noise.buffer = buf;
    noise.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 480;
    bp.Q.value = 0.6;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;

    // hafif yavaş modülasyon (kalabalığın dalgalanması)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.18;
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(this.crowdGain.gain);
    lfo.start();

    noise.connect(bp).connect(lp).connect(this.crowdGain);
    noise.start();
    this.crowdNodes = { noise, bp, lp, lfo };
  }

  setCrowdLevel(level, fade = 0.5) {
    if (!this._inited || !this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
    this.crowdGain.gain.linearRampToValueAtTime(level, t + fade);
  }

  // Patlama tarzı kısa tezahürat
  cheer(intensity = 1) {
    if (!this._inited) return;
    const ctx = this.ctx;
    const bufSize = 0.9 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.min(1, t * 8) * Math.exp(-t * 1.6);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.55 * intensity;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 1.0);

    // ek bir "hooo" katmanı
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(280, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.7);
    og.gain.setValueAtTime(0.0001, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.18 * intensity, ctx.currentTime + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    o.connect(og).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 1.0);
  }

  // ---------- TEMEL VURUŞ ----------
  _kick(power = 1, low = true) {
    if (!this._inited) return;
    const ctx = this.ctx;
    const dur = 0.18;

    // alt frekans patlaması (gövde)
    const o = ctx.createOscillator();
    o.type = "sine";
    const og = ctx.createGain();
    const f0 = low ? 220 : 320;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + dur);
    og.gain.setValueAtTime(0.0001, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.7 * power, ctx.currentTime + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(og).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);

    // gürültü tıkırtısı (deri/iplik)
    const bufSize = 0.06 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / bufSize;
      d[i] = (Math.random() * 2 - 1) * (1 - t);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.value = 1500;
    const ng = ctx.createGain();
    ng.gain.value = 0.35 * power;
    src.connect(bp).connect(ng).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.07);
  }

  shoot(power = 1) { this._kick(1.0 * power, true); }
  pass()  { this._kick(0.55, false); }
  cross() { this._kick(0.75, true); }

  // Topun zemine veya bir oyuncuya değme tıkırtısı
  bounce(power = 0.5) {
    if (!this._inited) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "triangle";
    const g = ctx.createGain();
    o.frequency.setValueAtTime(420 + Math.random() * 80, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18 * power, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    o.connect(g).connect(this.master);
    o.start(); o.stop(ctx.currentTime + 0.12);
  }

  // Direk/kale demirine çarpma
  post() {
    if (!this._inited) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "square";
    const g = ctx.createGain();
    o.frequency.setValueAtTime(1100, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.4);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2400;
    o.connect(lp).connect(g).connect(this.master);
    o.start(); o.stop(ctx.currentTime + 0.6);
  }

  // Ağa çarpma — kısa fışırtı
  net() {
    if (!this._inited) return;
    const ctx = this.ctx;
    const dur = 0.45;
    const buf = ctx.createBuffer(1, dur * ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5000; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(bp).connect(g).connect(this.master);
    src.start(); src.stop(ctx.currentTime + dur);
  }

  whistle(long = false) {
    if (!this._inited) return;
    const ctx = this.ctx;
    const dur = long ? 1.4 : 0.3;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 2400;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 5;
    const o2g = ctx.createGain();
    o2g.gain.value = 60;
    o2.connect(o2g).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.04);
    g.gain.setValueAtTime(0.35, ctx.currentTime + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start(); o2.start();
    o.stop(ctx.currentTime + dur); o2.stop(ctx.currentTime + dur);
  }

  // UI tıklama
  click() {
    if (!this._inited) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "square";
    const g = ctx.createGain();
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.06);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    o.connect(g).connect(this.master);
    o.start(); o.stop(ctx.currentTime + 0.1);
  }

  // GOL — büyük tezahürat + ek "GOOOL" enstrümantal
  goal() {
    this.cheer(1.4);
    if (!this._inited) return;
    const ctx = this.ctx;
    // Yükselen synth fanfar
    const notes = [392, 523, 659, 784];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const g = ctx.createGain();
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      const lp = ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=2200;
      o.connect(lp).connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.45);
    });
  }
}

export const Sfx = new SfxEngine();
