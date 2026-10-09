/* ============================================================
 * 31_settings.js —— 设置模块
 * 音量（主 / 音效 / 音乐）· 画质（低/中/高/4K）· 手机内存自适应
 * 帧率（15/30/60/120/无上限）· UI 布局调整（拖动 / 拉伸 / 缩小，可保存与还原）
 * 所有配置写入 localStorage，重启后自动生效
 * ==========================================================*/
'use strict';

/* ---------- 音频：WebAudio 程序化音效（无外部音频文件） ---------- */
const Snd = {
  ctx: null, master: null, sfx: null, music: null, musicNodes: null, amb: null,
  vol: { master: 70, sfx: 70, music: 25, amb: 55 },
  ensure() {
    if (this.ctx) return this.ctx;
    try {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol.master / 100;
      this.master.connect(this.ctx.destination);
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
  /** 环境音乐：两枚轻微失谐的正弦 + 低通，音量随「音乐」滑块 */
  updateMusic() {
    if (!this.ctx || !this.music) return;
    const v = this.vol.music / 100;
    if (v <= 0.001) {
      if (this.musicNodes) { try { this.musicNodes.forEach(n => n.stop()); } catch (e) { } this.musicNodes = null; }
      this.music.gain.value = 0;
      return;
    }
    this.music.gain.value = v * 0.12;
    if (this.musicNodes) return;
    try {
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.connect(this.music);
      const a = this.ctx.createOscillator(); a.type = 'sine'; a.frequency.value = 110;
      const b = this.ctx.createOscillator(); b.type = 'sine'; b.frequency.value = 164.8;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.08;
      const lg = this.ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(lp.gain);
      a.connect(lp); b.connect(lp); a.start(); b.start(); lfo.start();
      this.musicNodes = [a, b, lfo];
    } catch (e) { }
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
  play(name) {
    if (this.vol.master <= 0) return;
    switch (name) {
      case 'click': this.tone(720, 0.06, 'square', 0.10); break;
      case 'ok': this.tone(620, 0.09, 'triangle', 0.12); this.tone(930, 0.10, 'triangle', 0.08); break;
      case 'err': this.tone(200, 0.14, 'sawtooth', 0.08); break;
      case 'level': this.tone(523, 0.10, 'triangle', 0.12); this.tone(659, 0.12, 'triangle', 0.10); this.tone(784, 0.18, 'triangle', 0.09); break;
      default: this.tone(660, 0.06, 'square', 0.08);
    }
  }
};

const Settings = {
  KEY: 'sf_settings_v1',
  /* 画质：渲染分辨率倍率（画布像素 = CSS 尺寸 × 倍率，CSS 再拉伸铺满） */
  QUALITY: [['low', '低分辨率', 0.6], ['mid', '中分辨率', 0.8], ['high', '高分辨率', 1], ['4k', '4K', 1.6]],
  FPS: [[15, '15 fps'], [30, '30 fps'], [60, '60 fps'], [120, '120 fps'], [0, '无上限']],
  ZOOMS: [[0.6, '×0.6'], [0.8, '×0.8'], [1, '×1.0 标准'], [1.5, '×1.5'], [2, '×2.0']],
  data: { master: 70, sfx: 70, music: 25, amb: 55, quality: 'high', fps: 60, auto: 1, zoom: 1, weather: 1, ambient: 1, ui: {} },
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
      this.data = { master: 70, sfx: 70, music: 25, amb: 55, quality: 'high', fps: 60, auto: 1, zoom: 1, weather: 1, ambient: 1, ui: {} };
      this.save(); this.applyAll(); Snd.play('ok'); this.open();
    };
    bottom.appendChild(bAll);
    pan.body.appendChild(bottom);
  }
};

if (typeof window !== 'undefined') window.Settings = Settings;
Settings.init();
