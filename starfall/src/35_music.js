/* ============================================================
 * 35_music.js —— 程序化 BGM（WebAudio 实时合成，无任何音频文件）
 * · 8 大区各一套调式 / 根音 / BPM / 音色，切区域自动换调
 * · 四层：和弦垫（每 2 拍） / 低音（每小节） / 旋律（8 拍动机） / 鼓组（仅战斗）
 * · 战斗强度 3 档（0 探索 / 1 战斗 / 2 精英·BOSS）、夜间降速减层、家园温暖变体
 * · 所有切换走 2 秒交叉淡入（setTargetAtTime），不硬切
 * 音量沿用 Snd 的 music 总线与「音乐」滑块；浏览器自动播放解锁复用 Snd.ensure()
 * ==========================================================*/
'use strict';

const Music = {
  on: 1,
  started: false,
  bus: null, layers: null,
  _timer: null, _next: 0, _beat: 0, _look: 0.28, _syncAcc: 0,
  scene: { region: 'plain', night: 0, intensity: 0, home: false },

  /* 8 大区调式：音阶（半音相对根音） / 根音（MIDI） / BPM / 音色 */
  MODES: {
    plain: { scale: [0, 2, 4, 7, 9], root: 62, bpm: 96, pad: 'triangle', lead: 'triangle' },           // 大调五声：明亮
    forest: { scale: [0, 2, 4, 6, 7, 9, 11], root: 62, bpm: 88, pad: 'triangle', lead: 'sine' },      // 利底亚
    desert: { scale: [0, 1, 4, 5, 7, 8, 10], root: 60, bpm: 104, pad: 'sawtooth', lead: 'square' },   // 弗里几亚暗示
    snow: { scale: [0, 2, 3, 5, 7, 8, 10], root: 57, bpm: 72, pad: 'sine', lead: 'sine' },            // 爱奥利：稀疏
    abyss: { scale: [0, 1, 3, 5, 6, 8, 10], root: 55, bpm: 68, pad: 'sawtooth', lead: 'triangle' },   // 洛克里亚：压抑
    ruin: { scale: [0, 2, 3, 5, 7, 9, 10], root: 60, bpm: 80, pad: 'triangle', lead: 'sine' },        // 多利亚：空灵
    waste: { scale: [0, 2, 3, 5, 7, 8, 10], root: 59, bpm: 92, pad: 'sawtooth', lead: 'square' },
    sea: { scale: [0, 2, 4, 7, 9], root: 64, bpm: 84, pad: 'sine', lead: 'triangle' }
  },
  PROG: [0, 4, 5, 3],                     // 和弦进行（音阶级数，每 2 拍一个）
  MOTIF: [0, 2, 4, 2, 5, 4, 2, 0],        // 8 拍旋律动机（音阶级索引）

  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  mode() { return this.MODES[this.scene.region] || this.MODES.plain; },
  bpm() {
    let b = this.mode().bpm;
    if (this.scene.night > 0.5) b *= 0.8;             // 夜间降速
    if (this.scene.intensity >= 1) b *= 1.08;         // 战斗略快
    if (this.scene.home) b *= 0.9;
    return b;
  },
  /** 音阶级 → MIDI（支持跨八度） */
  degNote(m, d) {
    const sc = m.scale, n = sc.length, i = ((d % n) + n) % n;
    return m.root + sc[i] + 12 * Math.floor(d / n);
  },

  /* ---------- 启动 / 停止 ---------- */
  ensure() {
    if (this.bus || typeof Snd === 'undefined') return this.bus;
    const c = Snd.ensure(); if (!c) return null;
    try {
      this.bus = c.createGain(); this.bus.gain.value = 0;
      this.bus.connect(Snd.music || Snd.master || c.destination);
      const mk = v => { const g = c.createGain(); g.gain.value = v; g.connect(this.bus); return g; };
      this.layers = { pad: mk(0.5), bass: mk(0.5), lead: mk(0.45), drum: mk(0) };
      return this.bus;
    } catch (e) { this.bus = null; return null; }
  },
  setEnabled(on) { this.on = on ? 1 : 0; if (!this.on) this.stop(); else this.applyVol(); },
  applyVol() {
    if (!this.bus || typeof Snd === 'undefined' || !Snd.ctx) return;
    const v = (Snd.vol.music || 0) / 100;
    const target = (this.on && v > 0.001) ? v * 0.9 : 0;
    try { this.bus.gain.setTargetAtTime(target, Snd.ctx.currentTime, 0.6); } catch (e) { }
  },
  start() {
    if (this.started || !this.on) return;
    if (!this.ensure()) return;
    this.applyVol();
    const c = Snd.ctx;
    this._next = (c.currentTime || 0) + 0.12;
    this._beat = 0;
    this.started = true;
    const tick = () => {
      if (!this.started) return;
      try { this.schedule(); } catch (e) { }
      this._timer = setTimeout(tick, 90);
    };
    tick();
  },
  stop() {
    this.started = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.bus && typeof Snd !== 'undefined' && Snd.ctx) {
      try { this.bus.gain.setTargetAtTime(0, Snd.ctx.currentTime, 0.3); } catch (e) { }
    }
  },

  /* ---------- 排程：预排窗口 0.28s，避免 setTimeout 抖动 ---------- */
  schedule() {
    const c = Snd.ctx; if (!c) return;
    const now = c.currentTime;
    let guard = 0;
    while (this._next < now + this._look && guard++ < 64) {
      this.playBeat(this._beat, this._next);
      this._next += 60 / this.bpm();
      this._beat++;
    }
  },
  playBeat(b, t) {
    const c = Snd.ctx, m = this.mode(), L = this.layers;
    if (!c || !L) return;
    const beat = 60 / this.bpm();
    const delay = Math.max(0, t - c.currentTime);
    const deg = this.PROG[(b >> 1) % this.PROG.length];

    /* 和弦垫：每 2 拍一次，三音长音 */
    if (b % 2 === 0) {
      const dur = beat * 2 * 0.95;
      [0, 2, 4].forEach((iv, i) => {
        const f = this.mtof(this.degNote(m, deg + iv) - 12);
        Snd.osc(f, f, dur, m.pad, 0.045 - i * 0.006, L.pad, delay);
      });
    }
    /* 低音：每小节第 1 拍 */
    if (b % 4 === 0) {
      const f = this.mtof(this.degNote(m, deg) - 24);
      Snd.osc(f, f, beat * 1.6, 'triangle', 0.075, L.bass, delay);
    }
    /* 旋律：8 拍动机；战斗时减半密度（只走偶数拍） */
    const step = this.MOTIF[b % 8];
    const playLead = this.scene.intensity >= 1 ? (b % 2 === 0) : true;
    if (step >= 0 && playLead && Math.random() < 0.85) {
      const f = this.mtof(this.degNote(m, step) + (this.scene.night > 0.5 ? -12 : 0));
      const dur = beat * (Math.random() < 0.3 ? 1.6 : 0.8);
      Snd.osc(f, f, dur, m.lead, 0.05, L.lead, delay);
    }
    /* 鼓组：仅战斗（intensity ≥ 1），BOSS/精英加八分音符 hihat */
    if (this.scene.intensity >= 1) {
      if (b % 2 === 0) this.kick(t, L.drum);
      const hits = this.scene.intensity >= 2 ? [0, 0.5] : [0];
      for (const off of hits) this.hat(t + off * beat, L.drum);
    }
  },
  kick(t, dest) {
    const c = Snd.ctx; if (!c) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.2);
    } catch (e) { }
  },
  hat(t, dest) {
    const c = Snd.ctx; if (!c) return;
    try {
      const s = c.createBufferSource(); s.buffer = Snd._noiseBuf(); s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t); s.stop(t + 0.07);
    } catch (e) { }
  },

  /* ---------- 场景同步（由 game.update 每帧调用，内部 0.5s 节流） ---------- */
  syncFromGame(game, dt) {
    if (!game) return;
    this._syncAcc += (dt || 0);
    if (this._syncAcc < 0.5) return;
    this._syncAcc = 0;
    let region = 'plain', night = 0, intensity = 0;
    try {
      const p = game.player;
      if (p && game.world && !game.inHome) {
        const tx = Math.floor(p.x / TILE_PX), ty = Math.floor(p.y / TILE_PX);
        const reg = (typeof regionAtTile === 'function') ? regionAtTile(tx, ty) : null;
        region = (reg && reg.key) || 'plain';
      }
      const s = (typeof game.sun === 'function') ? game.sun() : null;
      night = s ? (s.elev < 0.12 ? 1 : 0) : 0;
      let near = false, big = false;
      if (p && game.monsters && !game.inHome) {
        for (const mn of game.monsters) {
          if (mn.dead) continue;
          if (dist(mn.x, mn.y, p.x, p.y) < 7 * TILE_PX) {
            near = true;
            if (mn.tier === 'boss' || mn.tier === 'elite' || mn.isBoss || mn.isElite) big = true;
          }
        }
      }
      intensity = big ? 2 : near ? 1 : 0;
    } catch (e) { }
    this.setScene({ region: region, night: night, intensity: intensity, home: !!game.inHome });
  },
  /** 场景变化：2 秒交叉淡入（鼓组随强度、旋律随昼夜） */
  setScene(s) {
    Object.assign(this.scene, s || {});
    if (!this.layers || typeof Snd === 'undefined' || !Snd.ctx) return;
    const c = Snd.ctx, t = c.currentTime;
    try {
      const drumV = this.scene.intensity >= 1 ? (this.scene.intensity >= 2 ? 1 : 0.7) : 0;
      this.layers.drum.gain.setTargetAtTime(drumV, t, 0.8);
      this.layers.lead.gain.setTargetAtTime(this.scene.night > 0.5 ? 0.28 : 0.45, t, 0.8);
      this.layers.pad.gain.setTargetAtTime(this.scene.home ? 0.62 : 0.5, t, 0.8);
    } catch (e) { }
    if (this.on && (Snd.vol.music || 0) > 0) this.start();
  }
};
