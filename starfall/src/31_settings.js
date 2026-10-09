/* ============================================================
 * 31_settings.js —— 设置模块
 * 音量（主 / 音效 / 音乐）· 画质（低/中/高/4K）· 手机内存自适应
 * 帧率（15/30/60/120/无上限）· UI 布局调整（拖动 / 拉伸 / 缩小，可保存与还原）
 * 所有配置写入 localStorage，重启后自动生效
 * ==========================================================*/
'use strict';

/* ---------- 音频：WebAudio 程序化音效（无外部音频文件） ---------- */
const Snd = {
  ctx: null, master: null, sfx: null, music: null, musicNodes: null, amb: null, comp: null,
  vol: { master: 70, sfx: 70, music: 25, amb: 55 },
  /* 音效调度：并发上限 12、同名节流（ms，随「战斗音效密度」缩放）、统计（自测用） */
  _nb: null, _live: 0, _liveMax: 12, _last: {}, stats: {},
  density: 'std',                                  // rich 密集 / std 标准 / lean 精简
  DENSITY_MUL: { rich: 0.6, std: 1, lean: 2 },
  ensure() {
    if (this.ctx) return this.ctx;
    try {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      this.ctx = new AC();
      /* 限幅器：多音叠加（群战 / 连击）时不爆音 */
      let out = this.ctx.destination;
      try {
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -12; this.comp.knee.value = 12; this.comp.ratio.value = 4;
        this.comp.attack.value = 0.003; this.comp.release.value = 0.18;
        this.comp.connect(out); out = this.comp;
      } catch (e) { this.comp = null; }
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol.master / 100;
      this.master.connect(out);
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.vol.sfx / 100; this.sfx.connect(this.master);
      this.music = this.ctx.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      /* 环境音总线：流水 / 鸟鸣 / 牛羊（程序化合成，见 33_ambience.js） */
      this.amb = this.ctx.createGain(); this.amb.gain.value = this.vol.amb / 100 * 0.5;
      this.amb.connect(this.master);
      this.updateMusic();
      if (typeof Ambience !== 'undefined') Ambience.tryStart();
    } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  setVol(kind, v) {
    this.vol[kind] = clamp(v, 0, 100);
    if (!this.ctx) return;
    if (kind === 'master' && this.master) this.master.gain.value = this.vol.master / 100;
    if (kind === 'sfx' && this.sfx) this.sfx.gain.value = this.vol.sfx / 100;
    if (kind === 'amb' && this.amb) this.amb.gain.value = this.vol.amb / 100 * 0.5;
    if (kind === 'music') this.updateMusic();
  },
  /** 音乐总线：程序化编曲见 35_music.js（区域调式 / 战斗强度 / 昼夜变奏） */
  updateMusic() {
    if (!this.ctx || !this.music) return;
    const v = this.vol.music / 100;
    const M = (typeof Music !== 'undefined') ? Music : null;
    if (v <= 0.001 || (M && !M.on)) {
      if (M) M.stop();
      if (this.musicNodes) { try { this.musicNodes.forEach(n => n.stop()); } catch (e) { } this.musicNodes = null; }
      this.music.gain.value = 0;
      return;
    }
    this.music.gain.value = v * 0.9;
    if (M) { M.applyVol(); M.start(); }
  },
  tone(freq, dur, type, gain, dest) {
    const c = this.ensure(); if (!c) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(gain || 0.12, c.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(dest || this.sfx || this.master || c.destination);
      o.start(); o.stop(c.currentTime + dur + 0.02);
    } catch (e) { }
  },
  /* ---------- 调度：并发上限 / 节流 ---------- */
  /** 占用一个音源槽位（超出 _liveMax 直接丢弃，防高频事件音源爆炸） */
  _slot(dur) {
    if (this._live >= this._liveMax) return false;
    this._live++;
    setTimeout(() => { this._live = Math.max(0, this._live - 1); }, (dur + 0.08) * 1000);
    return true;
  },
  /** 同名最小间隔（ms）：基础间隔 × 密度倍率 */
  _gap(ms) { return Math.max(12, (ms || 40) * (this.DENSITY_MUL[this.density] || 1)); },
  setDensity(d) { if (this.DENSITY_MUL[d]) this.density = d; },

  /* ---------- 合成基元 ---------- */
  _noiseBuf() {
    const c = this.ctx; if (this._nb) return this._nb;
    const len = Math.floor(c.sampleRate * 1.2);
    const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._nb = b; return b;
  },
  /** 振荡器音：f0 → f1 扫频，快起 + 指数衰减；delay 用于琶音/叠音 */
  osc(f0, f1, dur, type, gain, dest, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx || this.master);
    o.start(t); o.stop(t + dur + 0.03);
    return o;
  },
  /** 噪声音：滤波扫频（bandpass / highpass / lowpass），用于挥砍、水花、雷声、沙沙 */
  noise(dur, gain, ftype, f0, f1, q, dest, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(); s.buffer = this._noiseBuf(); s.loop = true;
    const f = c.createBiquadFilter(); f.type = ftype || 'bandpass';
    f.frequency.setValueAtTime(Math.max(40, f0), t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    f.Q.value = q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.15));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx || this.master);
    s.start(t); s.stop(t + dur + 0.03);
    return s;
  },

  /* ---------- 音色表（全部程序化合成，无音频文件） ----------
   * dur：占槽时长（秒）  gap：同名最小间隔（ms）  fn(s, dest, opt)：合成实现
   * opt 支持 { pitch, gain, pan }（pitch 用于元素/品质变调） */
  defs: {
    /* — 原有 UI 音（保持听感不变） — */
    click: { dur: .06, gap: 30, fn: (s, d) => s.osc(720, 720, .06, 'square', .10, d) },
    ok: { dur: .10, gap: 60, fn: (s, d) => { s.osc(620, 620, .09, 'triangle', .12, d); s.osc(930, 930, .10, 'triangle', .08, d, .02); } },
    err: { dur: .14, gap: 80, fn: (s, d) => s.osc(200, 160, .14, 'sawtooth', .08, d) },
    level: { dur: .50, gap: 400, fn: (s, d) => { [523, 659, 784].forEach((f, i) => s.osc(f, f, .18, 'triangle', .11 - i * .015, d, i * .11)); } },
    /* — 战斗 — */
    swing: { dur: .10, gap: 45, fn: (s, d) => s.noise(.09, .30, 'bandpass', 800, 2500, 1.2, d) },
    hit: { dur: .09, gap: 45, fn: (s, d, o) => { const p = o.pitch || 1; s.osc(180 * p, 120 * p, .06, 'square', .22, d); s.noise(.05, .18, 'highpass', 2200, 2600, .7, d); } },
    crit: { dur: .16, gap: 60, fn: (s, d) => { s.osc(330, 880, .14, 'triangle', .20, d); s.osc(1500, 2400, .10, 'square', .06, d, .01); } },
    cast: { dur: .28, gap: 70, fn: (s, d, o) => { const p = o.pitch || 1; s.osc(220 * p, 660 * p, .26, 'sine', .16, d); s.noise(.12, .06, 'bandpass', 900 * p, 1800 * p, 2, d); } },
    die: { dur: .34, gap: 90, fn: (s, d) => { s.osc(300, 80, .32, 'sawtooth', .14, d); s.noise(.18, .10, 'lowpass', 900, 200, .8, d); } },
    /* — 采集与生活（材质区分） — */
    mine: { dur: .16, gap: 60, fn: (s, d) => { const p = .95 + Math.random() * .1; s.osc(1200 * p, 1100 * p, .12, 'triangle', .16, d); s.noise(.04, .12, 'highpass', 3000, 3000, .8, d); } },
    chop: { dur: .12, gap: 60, fn: (s, d) => { s.noise(.09, .26, 'lowpass', 500, 300, .8, d); s.osc(200, 150, .10, 'sine', .16, d); } },
    herb: { dur: .08, gap: 50, fn: (s, d) => s.noise(.06, .18, 'highpass', 3200, 3800, .7, d) },
    fish: { dur: .22, gap: 80, fn: (s, d) => { s.noise(.16, .20, 'lowpass', 4000, 600, .6, d); s.osc(90, 70, .12, 'sine', .18, d, .02); } },
    craft: { dur: .20, gap: 120, fn: (s, d) => { s.osc(440, 440, .09, 'triangle', .12, d); s.osc(660, 660, .14, 'triangle', .10, d, .09); } },
    pickup: { dur: .10, gap: 40, fn: (s, d) => s.osc(700, 1000, .07, 'sine', .12, d) },
    /* — UI 与交互 — */
    open: { dur: .12, gap: 60, fn: (s, d) => s.osc(520, 780, .10, 'triangle', .10, d) },
    close: { dur: .12, gap: 60, fn: (s, d) => s.osc(780, 520, .10, 'triangle', .10, d) },
    tab: { dur: .06, gap: 40, fn: (s, d) => s.osc(880, 880, .05, 'sine', .09, d) },
    buy: { dur: .16, gap: 80, fn: (s, d) => { s.osc(660, 660, .07, 'triangle', .11, d); s.osc(990, 990, .12, 'triangle', .09, d, .07); } },
    sell: { dur: .16, gap: 80, fn: (s, d) => { s.osc(990, 990, .07, 'triangle', .11, d); s.osc(660, 660, .12, 'triangle', .09, d, .07); } },
    equip: { dur: .16, gap: 80, fn: (s, d) => { s.noise(.05, .14, 'highpass', 2600, 2600, .8, d); s.osc(420, 520, .10, 'triangle', .10, d, .03); } },
    chest: { dur: .30, gap: 200, fn: (s, d) => { s.noise(.08, .16, 'bandpass', 600, 1400, 1, d); s.osc(523, 784, .22, 'triangle', .10, d, .06); } },
    portal: { dur: .50, gap: 300, fn: (s, d) => { s.osc(180, 720, .40, 'sine', .14, d); s.osc(360, 1440, .40, 'sine', .06, d, .02); } },
    board: { dur: .22, gap: 150, fn: (s, d) => { s.noise(.16, .18, 'lowpass', 3000, 500, .6, d); s.osc(120, 100, .14, 'sine', .16, d, .02); } },
    thunder: { dur: 1.3, gap: 600, fn: (s, d) => { s.noise(1.1, .30, 'lowpass', 700, 90, .5, d); s.noise(.25, .22, 'highpass', 1500, 400, .5, d); } },
    default: { dur: .06, gap: 40, fn: (s, d) => s.osc(660, 660, .06, 'square', .08, d) }
  },
  /** 播放：节流 → 占槽 → 合成。opt = { pitch, gain, pan } */
  play(name, opt) {
    if (!name || this.vol.master <= 0) return;
    const d = this.defs[name] || this.defs.default;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - (this._last[name] || -1e9) < this._gap(d.gap)) return;   // 同名节流
    this._last[name] = now;
    if (!this._slot(d.dur)) return;                                    // 并发上限
    const c = this.ensure(); if (!c) return;
    try { d.fn(this, this.sfx || this.master, opt || {}); } catch (e) { }
    this.stats[name] = (this.stats[name] || 0) + 1;                     // 自测统计
  }
};

const Settings = {
  KEY: 'sf_settings_v1',
  /* 画质：渲染分辨率倍率（画布像素 = CSS 尺寸 × 倍率，CSS 再拉伸铺满） */
  QUALITY: [['low', '低分辨率', 0.6], ['mid', '中分辨率', 0.8], ['high', '高分辨率', 1], ['4k', '4K', 1.6]],
  FPS: [[15, '15 fps'], [30, '30 fps'], [60, '60 fps'], [120, '120 fps'], [0, '无上限']],
  ZOOMS: [[0.6, '×0.6'], [0.8, '×0.8'], [1, '×1.0 标准'], [1.5, '×1.5'], [2, '×2.0']],
  data: { master: 70, sfx: 70, music: 25, amb: 55, quality: 'high', fps: 60, auto: 1, zoom: 1, weather: 1, ambient: 1,
    bgm: 1, sfxDensity: 'std', bloom: 2, tint: 0.08, dprCap: 2, ui: {} },
  editMode: false,
  _panel: null,

  init() {
    this.load();
    /* 首次运行：按设备内存自动推荐画质 / 帧率 */
    if (!this._loaded && this.data.auto) { const r = this.autoMemory(true); this.data.quality = r.quality; this.data.fps = r.fps; this.save(); }
    this.applyAll();
    /* 界面点击音效（按钮 / 标签 / 关闭键） */
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('pointerdown', e => {
        if (this.data.master <= 0 || this.data.sfx <= 0) return;
        const t = e.target && e.target.closest ? e.target.closest('.btn,.mbtn,.mMenuBtn,.tab,.pclose,.tbtn') : null;
        if (t) {
          Snd.ensure(); Snd.play('click');
          /* 首次交互后启动环境音（浏览器要求音频必须由用户手势触发） */
          if (typeof Ambience !== 'undefined') Ambience.tryStart();
        }
      }, true);
    }
    return this;
  },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { Object.assign(this.data, JSON.parse(raw)); this._loaded = true; }
    } catch (e) { }
    this.data.ui = this.data.ui || {};
    Snd.vol.master = this.data.master; Snd.vol.sfx = this.data.sfx; Snd.vol.music = this.data.music;
    Snd.vol.amb = (this.data.amb === undefined ? 55 : this.data.amb);
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { }
  },
  applyAll() { this.applyQuality(); this.applyFps(); this.applyVol(); this.applyUI(); },
  applyVol() {
    Snd.setVol('master', this.data.master); Snd.setVol('sfx', this.data.sfx); Snd.setVol('music', this.data.music);
    Snd.setVol('amb', this.data.amb === undefined ? 55 : this.data.amb);
    if (typeof Snd !== 'undefined' && Snd.setDensity) Snd.setDensity(this.data.sfxDensity || 'std');
    if (typeof Music !== 'undefined') Music.setEnabled(this.data.bgm === undefined ? 1 : this.data.bgm);
  },

  /* ---------- 画质 ---------- */
  qScale() {
    const q = this.QUALITY.find(x => x[0] === this.data.quality) || this.QUALITY[2];
    return q[2];
  },
  qName() { const q = this.QUALITY.find(x => x[0] === this.data.quality) || this.QUALITY[2]; return q[1]; },
  applyQuality() {
    const g = (typeof window !== 'undefined' && window.GAME) ? window.GAME : null;
    if (g && g.resize) g.resize();
    /* 世界区块按分辨率变化重新烘焙（贴图尺寸随画质档位缩放） */
    if (g && g.world && g.world.chunks) for (const ch of g.world.chunks.values()) { ch.canvas = null; }
  },
  /* ---------- 帧率 ---------- */
  frameMs() { return this.data.fps > 0 ? 1000 / this.data.fps : 0; },
  applyFps() { /* 帧率在 Game.loop 内读取，无需额外处理 */ },

  /* ---------- 手机内存 / 性能自适应 ---------- */
  deviceInfo() {
    const nav = (typeof navigator !== 'undefined') ? navigator : {};
    const mem = (typeof nav.deviceMemory === 'number') ? nav.deviceMemory : 0;                 // GB（Device Memory API）
    const heap = (typeof performance !== 'undefined' && performance.memory && performance.memory.jsHeapSizeLimit)
      ? Math.round(performance.memory.jsHeapSizeLimit / 1048576) : 0;                          // MB
    const cores = nav.hardwareConcurrency || 0;
    const px = (typeof window !== 'undefined') ? window.innerWidth * window.innerHeight : 0;
    return { mem: mem, heap: heap, cores: cores, px: px };
  },
  /** 按内存 / 核心数 / 屏幕像素推荐画质与帧率 */
  autoMemory(silent) {
    const d = this.deviceInfo();
    let score = 0;
    if (d.mem) score += d.mem >= 8 ? 3 : d.mem >= 6 ? 2 : d.mem >= 4 ? 1 : 0;
    if (d.heap) score += d.heap >= 512 ? 2 : d.heap >= 256 ? 1 : 0;
    if (d.cores) score += d.cores >= 8 ? 2 : d.cores >= 6 ? 1 : 0;
    if (d.px > 2400000) score -= 1;                       // 超高像素屏更吃 GPU
    const quality = score >= 5 ? '4k' : score >= 3 ? 'high' : score >= 1 ? 'mid' : 'low';
    const fps = score >= 5 ? 120 : score >= 3 ? 60 : score >= 1 ? 30 : 15;
    const res = { quality: quality, fps: fps, info: d, score: score };
    if (!silent && typeof UI !== 'undefined' && UI.toast) {
      UI.toast('已按设备自适应：' + (this.QUALITY.find(q => q[0] === quality) || [, ''])[1] + ' / ' + fps + ' fps', '#9fe8b8');
    }
    return res;
  },
  applyAuto() {
    const r = this.autoMemory(false);
    this.data.quality = r.quality; this.data.fps = r.fps;
    this.save(); this.applyQuality();
    if (this._panel) this.open();
  },

  /* ---------- UI 布局：拖动 / 拉伸 / 缩小 ---------- */
  uiTargets() {
    const list = [];
    ['topbar', 'mmwrap', 'bottom', 'log', 'chatWrap', 'progWrap', 'enemyBar'].forEach(id => {
      const e = document.getElementById(id); if (e) list.push([id, e]);
    });
    ['joy', 'mActs', 'mMid', 'mMenu'].forEach(cls => {
      const e = document.querySelector('.' + cls); if (e) list.push([cls, e]);
    });
    return list;
  },
  baseScale(e) {
    try {
      const t = (typeof getComputedStyle !== 'undefined') ? getComputedStyle(e).transform : '';
      const m = String(t).match(/matrix\(([^)]+)\)/);
      if (!m) return 1;
      return Math.abs(parseFloat(m[1].split(',')[0])) || 1;
    } catch (err) { return 1; }
  },
  applyUIEl(key, e) {
    if (!e) return;
    const s = this.data.ui[key];
    if (!s) { e.style.transform = ''; return; }
    const bs = this.baseScale(e) || 1;
    e.style.transform = 'translate(' + s.x + 'px,' + s.y + 'px) scale(' + (s.sx * bs).toFixed(3) + ',' + (s.sy * bs).toFixed(3) + ')';
  },
  applyUI() {
    if (typeof document === 'undefined') return;
    for (const it of this.uiTargets()) this.applyUIEl(it[0], it[1]);
  },
  resetUI() {
    this.data.ui = {}; this.save();
    for (const it of this.uiTargets()) { const e = it[1]; if (e) e.style.transform = ''; this.detachUI(it[0], it[1]); }
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('UI 布局已恢复初始', '#9fe8b8');
  },
  detachUI(key, e) {
    if (!e || !e._uiDrag) return;
    const h = e._uiDrag;
    if (h.handle && h.handle.parentNode) h.handle.parentNode.removeChild(h.handle);
    e.removeEventListener('pointerdown', h.down);
    e.classList.remove('uiEditing');
    delete e._uiDrag;
  },
  /** 进入 / 退出 UI 调整模式：元素可拖动，右下角手柄可拉伸与缩小 */
  toggleEdit(on) {
    on = (on === undefined) ? !this.editMode : !!on;
    this.editMode = on;
    if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('uiEdit', on);
    for (const it of this.uiTargets()) {
      const key = it[0], e = it[1];
      if (on) this.attachUI(key, e); else this.detachUI(key, e);
    }
    this.buildEditBar(on);
    if (!on && typeof UI !== 'undefined' && UI.toast) UI.toast('已退出 UI 调整模式', '#ffd76a');
  },
  attachUI(key, e) {
    if (!e || e._uiDrag) return;
    const s = this.data.ui[key] || (this.data.ui[key] = { x: 0, y: 0, sx: 1, sy: 1 });
    e.classList.add('uiEditing');
    e.setAttribute('data-uiedit', key);
    const handle = document.createElement('i');
    handle.className = 'uiHandle'; handle.textContent = '⇲';
    e.appendChild(handle);
    let mode = 0, px = 0, py = 0, base = null;
    const move = ev => {
      if (!mode) return;
      if (mode === 1) { s.x = base.x + (ev.clientX - px); s.y = base.y + (ev.clientY - py); }
      else {                                             // 手柄：横向拉伸 / 纵向缩放
        s.sx = clamp(base.sx + (ev.clientX - px) * 0.006, 0.4, 2.2);
        s.sy = clamp(base.sy + (ev.clientY - py) * 0.006, 0.4, 2.2);
      }
      this.applyUIEl(key, e);
    };
    const up = () => { if (!mode) return; mode = 0; this.save(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    const down = ev => {
      if (!this.editMode) return;
      if (ev.target && ev.target.classList && ev.target.classList.contains('uiHandle')) mode = 2; else mode = 1;
      px = ev.clientX; py = ev.clientY; base = { x: s.x, y: s.y, sx: s.sx, sy: s.sy };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      if (ev.pointerId !== undefined && e.setPointerCapture) { try { e.setPointerCapture(ev.pointerId); } catch (err) { } }
      ev.preventDefault(); ev.stopPropagation();
    };
    e.addEventListener('pointerdown', down);
    e._uiDrag = { handle: handle, down: down };
  },
  /** 调整模式工具条：保存 / 恢复初始 / 退出 */
  buildEditBar(on) {
    let bar = document.getElementById('uiEditBar');
    if (!on) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = document.createElement('div'); bar.id = 'uiEditBar';
    const mkBtn = (txt, cls, fn) => {
      const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = txt;
      b.onclick = () => { Snd.play('ok'); fn(); };
      bar.appendChild(b); return b;
    };
    bar.appendChild(Object.assign(document.createElement('span'), { className: 'mini', textContent: 'UI 调整：拖动元素移动，拖右下角 ⇲ 拉伸 / 缩小' }));
    mkBtn('保存', 'gold', () => { this.save(); if (typeof UI !== 'undefined') UI.toast('UI 布局已保存', '#9fe8b8'); });
    mkBtn('恢复初始 UI', '', () => { this.resetUI(); this.toggleEdit(true); });
    mkBtn('退出调整', '', () => this.toggleEdit(false));
    document.body.appendChild(bar);
  },

  /* ---------- 设置面板 ---------- */
  open() {
    if (typeof UI === 'undefined') return;
    const pan = UI.panel('settings', '设置 Settings', 560, 560);
    this._panel = pan;
    pan.body.innerHTML = '';
    UI.touch && UI.touch();

    const sec = t => { const d = el('div', 'setSec', t); pan.body.appendChild(d); return d; };
    const row = (label, hint) => {
      const r = el('div', 'setRow');
      r.appendChild(el('span', 'setLab', label));
      if (hint) r.appendChild(el('span', 'mini', hint));
      pan.body.appendChild(r); return r;
    };

    /* 1) 音量 */
    sec('音量 / Audio');
    [['master', '主音量'], ['sfx', '音效'], ['music', '音乐'], ['amb', '环境音']].forEach(v => {
      const r = row(v[1]);
      const inp = el('input', 'setRange');
      inp.type = 'range'; inp.min = 0; inp.max = 100; inp.step = 1; inp.value = this.data[v[0]];
      const val = el('span', 'setVal', this.data[v[0]] + '');
      inp.oninput = () => {
        this.data[v[0]] = +inp.value; val.textContent = inp.value;
        this.applyVol(); this.save();
        if (v[0] === 'sfx') Snd.play('click');
      };
      inp.onchange = () => Snd.play('ok');
      r.appendChild(inp); r.appendChild(val);
    });
    /* 环境音现场感：流水 / 鸟鸣 / 牛羊，可单独关闭 */
    const ambRow = row('环境音场景', '流水声 + 树上鸟叫 + 偶尔牛羊叫（随大区与昼夜自动变化）');
    const ambBox = el('div', 'setBtns');
    [['1', '开'], ['0', '关']].forEach(o => {
      const b = el('button', 'btn' + ((this.data.ambient === undefined ? 1 : this.data.ambient) === +o[0] ? ' gold' : ''), o[1]);
      b.onclick = () => {
        this.data.ambient = +o[0]; this.save(); Snd.play('ok');
        if (typeof Ambience !== 'undefined') { if (+o[0]) Ambience.tryStart(); Ambience.setEnabled(+o[0]); }
        this.open();
      };
      ambBox.appendChild(b);
    });
    ambRow.appendChild(ambBox);

    /* 背景音乐开关：程序化编曲（区域调式 / 战斗变奏），关掉后只留环境音 */
    const musRow = row('背景音乐', '八大区各一套调式，战斗自动加鼓组、夜间自动降速（实时合成，无音频文件）');
    const musBox = el('div', 'setBtns');
    [['1', '开'], ['0', '关']].forEach(o => {
      const b = el('button', 'btn' + ((this.data.bgm === undefined ? 1 : this.data.bgm) === +o[0] ? ' gold' : ''), o[1]);
      b.onclick = () => {
        this.data.bgm = +o[0]; this.save(); Snd.play('ok');
        if (typeof Music !== 'undefined') { Music.setEnabled(+o[0]); Snd.updateMusic(); }
        this.open();
      };
      musBox.appendChild(b);
    });
    musRow.appendChild(musBox);

    /* 战斗音效密度：群战 / 连击时不糊成一团 */
    const denRow = row('战斗音效密度', '密集 / 标准 / 精简（精简时同名音效间隔翻倍，适合挂机与群怪）');
    const denBox = el('div', 'setBtns');
    [['rich', '密集'], ['std', '标准'], ['lean', '精简']].forEach(o => {
      const b = el('button', 'btn' + ((this.data.sfxDensity || 'std') === o[0] ? ' gold' : ''), o[1]);
      b.onclick = () => {
        this.data.sfxDensity = o[0]; this.save(); Snd.setDensity(o[0]); Snd.play('ok'); this.open();
      };
      denBox.appendChild(b);
    });
    denRow.appendChild(denBox);

    /* 2) 画质 */
    sec('画质 / Quality');
    const qr = row('渲染分辨率', '当前 ' + this.qName() + '（×' + this.qScale() + '）');
    const qbox = el('div', 'setBtns');
    this.QUALITY.forEach(q => {
      const b = el('button', 'btn' + (this.data.quality === q[0] ? ' gold' : ''), q[1]);
      b.onclick = () => {
        this.data.quality = q[0]; this.save(); this.applyQuality(); Snd.play('ok'); this.open();
      };
      qbox.appendChild(b);
    });
    qr.appendChild(qbox);

    /* 泛光（Bloom）：夜灯 / 技能特效 / 水面高光会发光，低画质与移动端默认关 */
    const blRow = row('泛光 Bloom', '亮部溢出光晕；自动 = 桌面开、手机关（帧率优先）');
    const blBox = el('div', 'setBtns');
    [['0', '关'], ['2', '自动'], ['1', '开']].forEach(o => {
      const b = el('button', 'btn' + ((this.data.bloom === undefined ? 2 : this.data.bloom) === +o[0] ? ' gold' : ''), o[1]);
      b.onclick = () => { this.data.bloom = +o[0]; this.save(); Snd.play('ok'); this.open(); };
      blBox.appendChild(b);
    });
    blRow.appendChild(blBox);

    /* 区域色调映射：一层很薄的区域色罩（soft-light） */
    const ttRow = row('区域色调', '按大区罩一层极薄色（雪原偏冷蓝 / 沙漠偏暖黄），0 = 关闭');
    const ttBox = el('div', 'setBtns');
    [['0', '关'], ['0.08', '标准'], ['0.15', '浓']].forEach(o => {
      const b = el('button', 'btn' + (Math.abs((+this.data.tint || 0) - +o[0]) < 0.001 ? ' gold' : ''), o[1]);
      b.onclick = () => { this.data.tint = +o[0]; this.save(); Snd.play('ok'); this.open(); };
      ttBox.appendChild(b);
    });
    ttRow.appendChild(ttBox);

    /* 高 DPI 上限：控制高清屏清晰度与填充率（1 = 不吃 dpr，最省电） */
    const dpRow = row('高 DPI 上限', '设备像素比上限（×1 / ×1.5 / ×2），越高越清晰也越费 GPU');
    const dpBox = el('div', 'setBtns');
    [['1', '×1'], ['1.5', '×1.5'], ['2', '×2']].forEach(o => {
      const b = el('button', 'btn' + (Math.abs((+this.data.dprCap || 2) - +o[0]) < 0.001 ? ' gold' : ''), o[1]);
      b.onclick = () => {
        this.data.dprCap = +o[0]; this.save(); Snd.play('ok');
        const g = (typeof window !== 'undefined' && window.GAME) ? window.GAME : null;
        if (g && g.resize) g.resize();
        this.open();
      };
      dpBox.appendChild(b);
    });
    dpRow.appendChild(dpBox);

    /* 3) 内存自适应 */
    sec('性能自适应 / Auto');
    const d = this.deviceInfo();
    const ar = row('设备信息', '内存 ' + (d.mem ? d.mem + ' GB' : '未知') + '　堆上限 ' + (d.heap ? d.heap + ' MB' : '未知') +
      '　核心 ' + (d.cores || '未知') + '　屏幕 ' + Math.round(d.px / 1000) + 'K 像素');
    const abox = el('div', 'setBtns');
    const bAuto = el('button', 'btn gold', '按手机内存自动推荐');
    bAuto.onclick = () => { this.applyAuto(); Snd.play('ok'); };
    const bAutoOn = el('button', 'btn' + (this.data.auto ? ' gold' : ''), '每次启动自动调整：' + (this.data.auto ? '开' : '关'));
    bAutoOn.onclick = () => { this.data.auto = this.data.auto ? 0 : 1; this.save(); Snd.play('click'); this.open(); };
    abox.appendChild(bAuto); abox.appendChild(bAutoOn);
    ar.appendChild(abox);

    /* 4) 帧率 */
    sec('帧率 / FPS');
    const fr = row('帧率上限', this.data.fps ? this.data.fps + ' fps' : '无上限（跟随屏幕刷新率）');
    const fbox = el('div', 'setBtns');
    this.FPS.forEach(f => {
      const b = el('button', 'btn' + (this.data.fps === f[0] ? ' gold' : ''), f[1]);
      b.onclick = () => { this.data.fps = f[0]; this.save(); Snd.play('ok'); this.open(); };
      fbox.appendChild(b);
    });
    fr.appendChild(fbox);

    /* 5) UI 布局 */
    sec('界面布局 / UI Layout');
    const ur = row('UI 位置与大小', '可单独拖动、拉伸、缩小每个 UI 模块');
    const ubox = el('div', 'setBtns');
    const bEdit = el('button', 'btn' + (this.editMode ? ' gold' : ''), this.editMode ? '正在调整（点击结束）' : '调整 UI 布局');
    bEdit.onclick = () => { this.toggleEdit(!this.editMode); Snd.play('ok'); this.open(); };
    const bSave = el('button', 'btn', '保存布局'); bSave.onclick = () => { this.save(); Snd.play('ok'); if (typeof UI !== 'undefined') UI.toast('UI 布局已保存', '#9fe8b8'); };
    const bReset = el('button', 'btn', '恢复初始 UI'); bReset.onclick = () => { this.resetUI(); Snd.play('ok'); this.open(); };
    ubox.appendChild(bEdit); ubox.appendChild(bSave); ubox.appendChild(bReset);
    ur.appendChild(ubox);

    /* 6) 天气系统 */
    sec('天气 / Weather');
    const wtr = row('天气特效', '智能天气：晴 / 多云 / 刮风 / 下雨 / 雷暴 / 下雪（关闭可省电）');
    const wtbox = el('div', 'setBtns');
    [['1', '开'], ['0', '关']].forEach(o => {
      const b = el('button', 'btn' + ((this.data.weather === undefined ? 1 : this.data.weather) === +o[0] ? ' gold' : ''), o[1]);
      b.onclick = () => {
        this.data.weather = +o[0]; this.save(); Snd.play('ok');
        if (typeof Weather !== 'undefined') { Weather.setEnabled(+o[0]); Weather.enabled = +o[0]; }
        this.open();
      };
      wtbox.appendChild(b);
    });
    wtr.appendChild(wtbox);

    /* 7) 视野缩放（手机也可双指缩放） */
    sec('视野 / Camera Zoom');
    const zr = row('缩放倍率', '当前 ×' + (this.data.zoom || 1).toFixed(2) + '（手机：双指张合缩放）');
    const zbox = el('div', 'setBtns');
    this.ZOOMS.forEach(z => {
      const b = el('button', 'btn' + (Math.abs((this.data.zoom || 1) - z[0]) < 0.02 ? ' gold' : ''), z[1]);
      b.onclick = () => {
        this.data.zoom = z[0]; this.save(); Snd.play('ok');
        if (typeof window !== 'undefined' && window.GAME && window.GAME.setZoom) window.GAME.setZoom(z[0]);
        this.open();
      };
      zbox.appendChild(b);
    });
    zr.appendChild(zbox);

    /* 7) 全部重置 */
    const bottom = el('div', 'setBtns');
    const bAll = el('button', 'btn', '恢复全部默认设置');
    bAll.onclick = () => {
      this.data = { master: 70, sfx: 70, music: 25, amb: 55, quality: 'high', fps: 60, auto: 1, zoom: 1, weather: 1, ambient: 1,
        bgm: 1, sfxDensity: 'std', bloom: 2, tint: 0.08, dprCap: 2, ui: {} };
      this.save(); this.applyAll(); Snd.play('ok'); this.open();
    };
    bottom.appendChild(bAll);
    pan.body.appendChild(bottom);

    /* 数值调试：打开 BALANCE 总表面板（改完立刻生效，可一键复位） */
    const dbg = el('div', 'setRow');
    dbg.appendChild(el('span', 'setLab', '数值调试'));
    const db = el('button', 'btn', 'BALANCE 总表');
    db.onclick = () => { if (typeof BAL !== 'undefined' && UI.openBalance) UI.openBalance(); };
    dbg.appendChild(db);
    pan.body.appendChild(dbg);
  }
};

if (typeof window !== 'undefined') window.Settings = Settings;
Settings.init();
