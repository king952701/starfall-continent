/* ============================================================
 * 33_ambience.js —— 环境背景音（WebAudio 程序化合成，无外部音频文件）
 * · 流水：白噪声经带通 / 高低通塑形，缓慢起伏 + 随机咕嘟（远处的哗啦啦）
 * · 鸟鸣：正弦快速扫频的短促啁啾，成串出现，随机声像（树上的叽叽喳喳）
 * · 牛羊：牛「哞」低频下滑颤音、羊「咩」高频快颤音，偶尔叫一声
 * 三层音量随 大区 / 昼夜 / 天气 自动调整（海边水声大、森林鸟多、夜里安静）
 * ==========================================================*/
'use strict';

const Ambience = {
  on: 1,
  started: false,
  bus: null, layers: null, noiseBuf: null,
  _tBird: null, _tFarm: null, _tBabble: null,
  _acc: 0,
  /* 各层目标音量（0~1），由场景计算后平滑过渡 */
  target: { water: 0.3, bird: 0.7, farm: 0.4 },
  _fail: false,

  /* ---------- 启动 / 停止 ---------- */
  tryStart() {
    if (this._fail || this.started) { this.resume(); return this.started; }
    if (!Snd.ensure()) { this._fail = true; return false; }
    const c = Snd.ctx;
    if (!c) { this._fail = true; return false; }
    try {
      this.bus = c.createGain(); this.bus.gain.value = 1;
      this.bus.connect(Snd.amb || Snd.master || c.destination);
      const mkLayer = () => { const g = c.createGain(); g.gain.value = 0.0001; g.connect(this.bus); return g; };
      this.layers = { water: mkLayer(), bird: mkLayer(), farm: mkLayer() };
      this.noiseBuf = this.makeNoise(c, 2.4);
      this.buildWater(c);
      this.started = true;
      this.resume();
      this.scheduleBirds();
      this.scheduleFarm();
      this.applyLayers(0.1);
      return true;
    } catch (e) { this._fail = true; this.started = false; return false; }
  },
  resume() {
    try { const c = Snd.ctx; if (c && c.state === 'suspended') c.resume(); } catch (e) { }
  },
  setEnabled(on) {
    this.on = on ? 1 : 0;
    if (!this.on) { try { if (this.bus && Snd.ctx) this.bus.gain.setTargetAtTime(0, Snd.ctx.currentTime, 0.2); } catch (e) { } }
    else { try { if (this.bus && Snd.ctx) this.bus.gain.setTargetAtTime(1, Snd.ctx.currentTime, 0.2); } catch (e) { } }
  },
  stop() {
    if (this._tBird) { clearTimeout(this._tBird); this._tBird = null; }
    if (this._tFarm) { clearTimeout(this._tFarm); this._tFarm = null; }
    if (this._tBabble) { clearInterval(this._tBabble); this._tBabble = null; }
    this.started = false;
  },

  /* ---------- 噪声源 ---------- */
  makeNoise(c, sec) {
    const len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;             // 轻微低通，避免过于刺耳
      d[i] = w * 0.7 + last * 1.6;
    }
    return b;
  },
  loopNoise(c) {
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.start();
    return s;
  },

  /* ---------- 流水层：远处的哗啦啦 ---------- */
  buildWater(c) {
    const out = this.layers.water;
    /* 1) 主体水花：中高频带通 + 缓慢扫动（哗——啦——的起伏） */
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 430;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1450; bp.Q.value = 0.75;
    const g1 = c.createGain(); g1.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11;
    const lg = c.createGain(); lg.gain.value = 560; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    const lfo2 = c.createOscillator(); lfo2.type = 'triangle'; lfo2.frequency.value = 0.31;
    const lg2 = c.createGain(); lg2.gain.value = 0.16; lfo2.connect(lg2); lg2.connect(g1.gain); lfo2.start();
    this.loopNoise(c).connect(hp); hp.connect(bp); bp.connect(g1); g1.connect(out);
    /* 2) 低频水声：远处的轰鸣底噪 */
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
    const g2 = c.createGain(); g2.gain.value = 0.55;
    this.loopNoise(c).connect(lp); lp.connect(g2); g2.connect(out);
    /* 3) 细碎咕嘟：窄带通，频率随机跳变（水流过石头的颗粒感） */
    const bp3 = c.createBiquadFilter(); bp3.type = 'bandpass'; bp3.frequency.value = 2400; bp3.Q.value = 5;
    const g3 = c.createGain(); g3.gain.value = 0.16;
    this.loopNoise(c).connect(bp3); bp3.connect(g3); g3.connect(out);
    this._tBabble = setInterval(() => {
      try { bp3.frequency.setTargetAtTime(1500 + Math.random() * 2000, c.currentTime, 0.5); } catch (e) { }
    }, 1900);
  },

  /* ---------- 鸟鸣：一声啁啾 ---------- */
  chirp(when) {
    const c = Snd.ctx; if (!c) return;
    try {
      const t0 = when || c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.8;
      const g = c.createGain();
      const f0 = 1800 + Math.random() * 1800;               // 不同鸟的音高
      bp.frequency.value = f0 * 1.15;
      const up = Math.random() < 0.62;                      // 上扬 / 下抑两种语调
      const f1 = Math.max(700, f0 * (up ? 1.32 + Math.random() * 0.35 : 0.70));
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + 0.065);
      o.frequency.exponentialRampToValueAtTime(f0 * (up ? 0.92 : 1.18), t0 + 0.13);
      /* 轻微颤音，更像真鸟 */
      const vib = c.createOscillator(); vib.frequency.value = 28 + Math.random() * 22;
      const vg = c.createGain(); vg.gain.value = f0 * 0.035; vib.connect(vg); vg.connect(o.frequency);
      vib.start(t0); vib.stop(t0 + 0.2);
      const amp = 0.07 + Math.random() * 0.05;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      o.connect(bp); bp.connect(g);
      /* 随机声像：鸟在不同方向的树上 */
      if (c.createStereoPanner) {
        const pan = c.createStereoPanner(); pan.pan.value = Math.random() * 1.7 - 0.85;
        g.connect(pan); pan.connect(this.layers.bird);
      } else g.connect(this.layers.bird);
      o.start(t0); o.stop(t0 + 0.2);
    } catch (e) { }
  },
  scheduleBirds() {
    const c = Snd.ctx; if (!c) return;
    const gap = 1800 + Math.random() * 6000;                // 每 2~8 秒来一串
    this._tBird = setTimeout(() => {
      if (!this.started) return;
      try {
        if (this.on && this.target.bird > 0.12 && (Snd.vol.amb || 0) > 0) {
          const n = 2 + Math.floor(Math.random() * 4);      // 一串 2~5 声
          let t = c.currentTime + 0.02;
          for (let i = 0; i < n; i++) { this.chirp(t); t += 0.07 + Math.random() * 0.13; }
        }
      } catch (e) { }
      this.scheduleBirds();
    }, gap);
  },

  /* ---------- 牛：哞——（低频下滑 + 颤音） ---------- */
  cow(t0) {
    const c = Snd.ctx; if (!c) return;
    try {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 3.2;
      const g = c.createGain();
      const f = 138 + Math.random() * 34;
      o.frequency.setValueAtTime(f, t0);
      o.frequency.linearRampToValueAtTime(f * 1.09, t0 + 0.2);
      o.frequency.linearRampToValueAtTime(f * 0.74, t0 + 1.05);
      const vib = c.createOscillator(); vib.frequency.value = 5.2;
      const vg = c.createGain(); vg.gain.value = 7; vib.connect(vg); vg.connect(o.frequency);
      vib.start(t0); vib.stop(t0 + 1.3);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.14);
      g.gain.setValueAtTime(0.15, t0 + 0.62);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
      o.connect(bp); bp.connect(g); g.connect(this.layers.farm);
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.4 - 0.7; g.connect(p); p.connect(this.layers.farm); }
      o.start(t0); o.stop(t0 + 1.3);
    } catch (e) { }
  },
  /* ---------- 羊：咩咩（高频快颤） ---------- */
  sheep(t0) {
    const c = Snd.ctx; if (!c) return;
    try {
      const bleats = 1 + Math.floor(Math.random() * 2);     // 咩 / 咩咩
      const f = 430 + Math.random() * 150;
      for (let i = 0; i < bleats; i++) {
        const st = t0 + i * (0.34 + Math.random() * 0.16);
        const o = c.createOscillator(); o.type = 'sawtooth';
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1350; bp.Q.value = 4.5;
        const g = c.createGain();
        o.frequency.setValueAtTime(f * 0.92, st);
        o.frequency.linearRampToValueAtTime(f, st + 0.08);
        o.frequency.linearRampToValueAtTime(f * 0.8, st + 0.5);
        const vib = c.createOscillator(); vib.frequency.value = 15 + Math.random() * 6;   // 咩的颤动
        const vg = c.createGain(); vg.gain.value = 34; vib.connect(vg); vg.connect(o.frequency);
        vib.start(st); vib.stop(st + 0.62);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.11, st + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.56);
        o.connect(bp); bp.connect(g); g.connect(this.layers.farm);
        if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.4 - 0.7; g.connect(p); p.connect(this.layers.farm); }
        o.start(st); o.stop(st + 0.62);
      }
    } catch (e) { }
  },
  scheduleFarm() {
    const c = Snd.ctx; if (!c) return;
    const gap = 16000 + Math.random() * 42000;              // 偶尔才叫一声（16~58 秒）
    this._tFarm = setTimeout(() => {
      if (!this.started) return;
      try {
        if (this.on && this.target.farm > 0.12 && (Snd.vol.amb || 0) > 0) {
          if (Math.random() < 0.55) this.cow(c.currentTime + 0.05);
          else this.sheep(c.currentTime + 0.05);
        }
      } catch (e) { }
      this.scheduleFarm();
    }, gap);
  },

  /* ---------- 场景自适应：按大区 / 昼夜 / 天气调整三层音量 ---------- */
  applyLayers(tc) {
    if (!this.started || !this.layers || !Snd.ctx) return;
    const t = Snd.ctx.currentTime, tau = tc || 1.2;
    const base = { water: 0.34, bird: 0.62, farm: 0.55 };
    try {
      for (const k in this.layers) this.layers[k].gain.setTargetAtTime(Math.max(0.0001, base[k] * this.target[k]), t, tau);
    } catch (e) { }
  },
  /** 由主循环低频调用：重新计算各层目标音量 */
  tick(game, dt) {
    if (!game) return;
    this._acc += (dt || 0);
    if (this._acc < 1.2) return;
    this._acc = 0;
    if (!this.started) { this.tryStart(); if (!this.started) return; }
    /* 大区 */
    const r = game.inHome ? null : regionAtTile(Math.floor(game.player.x / TILE_PX), Math.floor(game.player.y / TILE_PX));
    const key = (r && r.key) || 'plain';
    const W = {
      sea: { water: 0.95, bird: 0.3, farm: 0.12 },
      forest: { water: 0.42, bird: 1.0, farm: 0.35 },
      plain: { water: 0.28, bird: 0.72, farm: (r && r.hasVillage) ? 0.9 : 0.5 },
      snow: { water: 0.18, bird: 0.22, farm: 0.3 },
      desert: { water: 0.05, bird: 0.14, farm: 0.25 },
      waste: { water: 0.06, bird: 0.12, farm: 0.2 },
      abyss: { water: 0.25, bird: 0.1, farm: 0.15 },
      ruin: { water: 0.22, bird: 0.26, farm: 0.25 }
    }[key] || { water: 0.28, bird: 0.7, farm: 0.4 };
    /* 昼夜：清晨鸟叫最欢，夜里安静 */
    const DAY = 480, ph = ((game.timeSec % DAY) + DAY) % DAY / DAY;
    const night = clamp(1 - Math.abs(ph - 0.75) / 0.22, 0, 1);
    const dawn = clamp(1 - Math.min(Math.abs(ph - 0.02), Math.abs(ph - 0.98)) / 0.10, 0, 1);
    const dayBird = (1 - night) * (1 + dawn * 0.35) + 0.06;
    const dayFarm = 0.15 + (1 - night) * 0.95;
    /* 天气：下雨/打雷鸟躲起来，水声更大；下雪安静 */
    let wBird = 1, wWater = 1;
    if (typeof Weather !== 'undefined' && Weather.enabled) {
      const k = Weather.cur, I = Weather.inten;
      if (k === 'rain') { wBird = lerp(1, 0.3, I); wWater = lerp(1, 1.5, I); }
      else if (k === 'thunder') { wBird = lerp(1, 0.12, I); wWater = lerp(1, 1.7, I); }
      else if (k === 'snow') { wBird = lerp(1, 0.45, I); wWater = lerp(1, 0.7, I); }
      else if (k === 'wind') { wBird = lerp(1, 0.75, I); }
    }
    this.target.water = clamp(W.water * wWater, 0, 1.3);
    this.target.bird = clamp(W.bird * dayBird * wBird, 0, 1.2);
    this.target.farm = clamp(W.farm * dayFarm, 0, 1.1);
    this.applyLayers(1.6);
  }
};
