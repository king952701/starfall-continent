/* ============================================================
 * 32_weather.js —— 天气系统
 * 1) 内置 AI：按大区气候 + 时段 + 天气演变链，智能切换天气（晴/多云/刮风/下雨/雷暴/下雪）
 * 2) 程序化美术：雨丝、雨点涟漪、雪花、阵风线条、云影、地面积雪、地面湿滑、闪电
 * 3) 强度渐变：切换天气先淡出再淡入，画面不会突变
 * ==========================================================*/
'use strict';

/* ---------- 天气定义 ----------
 * wind：风力基准（决定雨丝倾斜、阵风、云影漂移速度）
 * vis ：能见度系数（越小雾越重）  spawn：刷怪节奏系数  tint：整体色调 */
const WEATHERS = {
  clear:   { key: 'clear',   name: '晴朗', en: 'Clear',  col: '#ffd76a', tint: null,      wind: 0.12, vis: 1.00, spawn: 1.00, dur: [70, 150] },
  cloudy:  { key: 'cloudy',  name: '多云', en: 'Cloudy', col: '#c9d4ef', tint: '#8f9ab5', wind: 0.30, vis: 0.94, spawn: 1.00, dur: [50, 110] },
  wind:    { key: 'wind',    name: '刮风', en: 'Windy',  col: '#9fd0e8', tint: '#b9c8a6', wind: 1.00, vis: 0.97, spawn: 1.05, dur: [45, 95] },
  rain:    { key: 'rain',    name: '下雨', en: 'Rain',   col: '#8fc7ff', tint: '#4e6f96', wind: 0.45, vis: 0.80, spawn: 0.95, dur: [60, 130] },
  thunder: { key: 'thunder', name: '雷暴', en: 'Storm',  col: '#c7a8ff', tint: '#3f4a78', wind: 0.85, vis: 0.66, spawn: 1.30, dur: [40, 80] },
  snow:    { key: 'snow',    name: '下雪', en: 'Snow',   col: '#e8f4ff', tint: '#cfdcea', wind: 0.28, vis: 0.78, spawn: 0.95, dur: [70, 140] }
};

/* ---------- 大区气候权重（决定该大区容易出现什么天气） ---------- */
const CLIMATE = {
  plain:  { clear: 34, cloudy: 22, wind: 16, rain: 16, thunder: 6,  snow: 2 },
  forest: { clear: 26, cloudy: 24, wind: 10, rain: 28, thunder: 8,  snow: 2 },
  desert: { clear: 46, cloudy: 10, wind: 34, rain: 6,  thunder: 2,  snow: 0 },
  snow:   { clear: 16, cloudy: 16, wind: 12, rain: 4,  thunder: 1,  snow: 50 },
  abyss:  { clear: 14, cloudy: 20, wind: 10, rain: 20, thunder: 32, snow: 2 },
  ruin:   { clear: 20, cloudy: 22, wind: 18, rain: 16, thunder: 20, snow: 2 },
  waste:  { clear: 24, cloudy: 16, wind: 30, rain: 10, thunder: 18, snow: 0 },
  sea:    { clear: 22, cloudy: 20, wind: 22, rain: 26, thunder: 10, snow: 0 }
};

/* ---------- 天气演变链：从当前天气出发，下一个天气的倾向（真实天气的“锋面推进”） ---------- */
const WTRANS = {
  clear:   { cloudy: 1.8, wind: 1.5, rain: 0.7, thunder: 0.3, snow: 0.6 },
  cloudy:  { rain: 2.4, wind: 1.4, thunder: 1.0, clear: 1.0, snow: 1.2 },
  wind:    { clear: 1.6, cloudy: 1.3, rain: 0.9, thunder: 0.7, snow: 0.8 },
  rain:    { thunder: 1.9, cloudy: 1.4, clear: 1.2, wind: 0.8, snow: 0.7 },
  thunder: { rain: 2.2, cloudy: 1.7, wind: 1.0, clear: 0.8, snow: 0.4 },
  snow:    { cloudy: 1.6, clear: 1.2, wind: 1.1, rain: 0.5, thunder: 0.2 }
};
/* 夜间倾向：夜里更容易下雨/打雷，晴天变少 */
const NIGHT_MOD = { clear: 0.6, cloudy: 1.0, wind: 1.05, rain: 1.45, thunder: 1.7, snow: 1.15 };

/* ---------- 天气美术资源（全部程序化生成并缓存） ---------- */
const WArt = {
  _c: {},
  key(k, fn) { if (!this._c[k]) this._c[k] = fn(); return this._c[k]; },
  /* 雪花：柔和光点 + 三根冰晶轴 */
  flake(r) {
    return this.key('wfl' + r, () => {
      const s = r * 2 + 6, o = CV(s, s), x = o.x, c = s / 2;
      const g = x.createRadialGradient(c, c, 0, c, c, r + 2);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(0.45, 'rgba(226,240,255,.55)');
      g.addColorStop(1, 'rgba(226,240,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        x.beginPath();
        x.moveTo(c - Math.cos(a) * r, c - Math.sin(a) * r);
        x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
        x.stroke();
      }
      return o.c;
    });
  },
  /* 阵风线条：横向渐隐的细长气流 */
  gust(len) {
    return this.key('wgs' + len, () => {
      const o = CV(len, 4), x = o.x;
      const g = x.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(235,245,255,0)');
      g.addColorStop(0.35, 'rgba(235,245,255,.55)');
      g.addColorStop(0.75, 'rgba(215,232,255,.35)');
      g.addColorStop(1, 'rgba(215,232,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, len, 4);
      return o.c;
    });
  },
  /* 云影：柔和的暗色团（投影在地面上，随风漂移） */
  cloud(r) {
    return this.key('wcl' + r, () => {
      const s = r * 2, o = CV(s, s), x = o.x, c = s / 2;
      const g = x.createRadialGradient(c, c, r * 0.15, c, c, r);
      g.addColorStop(0, 'rgba(12,18,38,.34)');
      g.addColorStop(0.55, 'rgba(12,18,38,.18)');
      g.addColorStop(1, 'rgba(12,18,38,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      return o.c;
    });
  },
  /* 闪电：锯齿折线 + 外发光（3 个变体） */
  bolt(v) {
    return this.key('wbl' + v, () => {
      const W = 150, H = 320, o = CV(W, H), x = o.x;
      const rr = mulberry32(v * 977 + 13);
      const pts = []; let px = W * 0.5;
      for (let i = 0; i <= 9; i++) { pts.push({ x: px, y: H * (i / 9) }); px += (rr() - 0.5) * 46; px = clamp(px, 14, W - 14); }
      x.strokeStyle = 'rgba(180,205,255,.55)'; x.lineWidth = 9; x.lineJoin = 'round';   // 外发光
      x.beginPath(); x.moveTo(pts[0].x, pts[0].y); for (const p of pts) x.lineTo(p.x, p.y); x.stroke();
      x.strokeStyle = '#eaf2ff'; x.lineWidth = 3.2;
      x.beginPath(); x.moveTo(pts[0].x, pts[0].y); for (const p of pts) x.lineTo(p.x, p.y); x.stroke();
      x.strokeStyle = '#ffffff'; x.lineWidth = 1.3;
      x.beginPath(); x.moveTo(pts[0].x, pts[0].y); for (const p of pts) x.lineTo(p.x, p.y); x.stroke();
      /* 分叉 */
      if (pts.length > 5) {
        const b = pts[4];
        x.strokeStyle = 'rgba(230,240,255,.85)'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(b.x, b.y);
        x.lineTo(b.x + (rr() > 0.5 ? 30 : -30), b.y + 42);
        x.lineTo(b.x + (rr() > 0.5 ? 18 : -18), b.y + 78);
        x.stroke();
      }
      return o.c;
    });
  }
};

const Weather = {
  enabled: 1,
  /* 状态 */
  cur: 'clear', pending: null, fade: 'in', t: 90, inten: 1, time: 0,
  windS: 0.12, windPh: 0, windDir: 1, gustV: 0,
  snowCover: 0, wet: 0,
  flash: 0, dbl: -1, boltT: 6, boltSeed: 0, boltX: 0.5,
  drops: [], flakes: [], gusts: [], ripples: [], clouds: [], ripAcc: 0,
  _booted: false, _saveT: 0,

  /* ================= 初始化 / 存档 ================= */
  boot() {
    if (this._booted) return;
    this._booted = true;
    if (typeof Settings !== 'undefined' && Settings.data && Settings.data.weather !== undefined) this.enabled = Settings.data.weather ? 1 : 0;
    try {
      const raw = localStorage.getItem('sf_weather_v1');
      if (raw) {
        const d = JSON.parse(raw);
        if (d && WEATHERS[d.cur]) { this.cur = d.cur; this.inten = clamp(d.inten || 1, 0, 1); this.t = d.t || 60; }
        if (d && typeof d.snowCover === 'number') this.snowCover = clamp(d.snowCover, 0, 1);
      }
    } catch (e) { }
  },
  save() {
    try {
      localStorage.setItem('sf_weather_v1', JSON.stringify({ cur: this.cur, inten: this.inten, t: this.t, snowCover: this.snowCover }));
    } catch (e) { }
  },
  setEnabled(on) {
    this.enabled = on ? 1 : 0;
    if (!on) { this.cur = 'clear'; this.pending = null; this.fade = 'in'; this.snowCover = 0; this.wet = 0; }
  },
  /** 强制切换（调试 / 剧情用） */
  set(key) {
    if (!WEATHERS[key]) return;
    this.pending = key; this.fade = 'out'; this.t = 0;
  },

  /* ================= AI：选下一个天气 ================= */
  regionKey(game) {
    if (!game || game.inHome) return 'plain';
    const r = regionAtTile(Math.floor(game.player.x / TILE_PX), Math.floor(game.player.y / TILE_PX));
    return (r && r.key) || 'plain';
  },
  nightFactor(game) {
    if (!game) return 0;
    const DAY = 480;
    const ph = ((game.timeSec % DAY) + DAY) % DAY / DAY;
    return clamp(1 - Math.abs(ph - 0.75) / 0.22, 0, 1);
  },
  pick(game) {
    const base = CLIMATE[this.regionKey(game)] || CLIMATE.plain;
    const night = this.nightFactor(game);
    const tr = WTRANS[this.cur] || {};
    let sum = 0; const w = {};
    for (const k in base) {
      let v = base[k];
      if (!v) continue;
      if (k === this.cur) v *= 0.22;                       // 不易连续同一种天气
      v *= tr[k] || 1;                                     // 天气演变链
      v *= 1 + ((NIGHT_MOD[k] || 1) - 1) * night;          // 夜间倾向
      if (v <= 0) continue;
      w[k] = v; sum += v;
    }
    let r = Math.random() * sum;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'clear';
  },

  /* ================= 风向 / 风力 ================= */
  windX() { return this.windDir * (0.35 + this.gustV); },
  windY() { return Math.abs(this.windDir) * 0.18 + 0.05; },

  /* ================= 主更新 ================= */
  update(dt, game) {
    this.boot();
    if (!game || game.inHome) return;                      // 家园是独立空间，天气不参与
    this.time += dt;
    if (!this.enabled) {                                   // 关闭天气：淡出并清空粒子
      this.inten = Math.max(0, this.inten - dt * 0.6);
      this.snowCover = Math.max(0, this.snowCover - dt * 0.4);
      this.wet = Math.max(0, this.wet - dt * 0.5);
      if (this.inten <= 0) { this.drops.length = 0; this.flakes.length = 0; this.gusts.length = 0; this.ripples.length = 0; }
      return;
    }
    /* --- 强度渐变：淡出 → 换天气 → 淡入 --- */
    if (this.fade === 'out') {
      this.inten -= dt / 6;
      if (this.inten <= 0.02) {
        this.inten = 0;
        this.cur = this.pending || 'clear'; this.pending = null;
        this.fade = 'in';
        const d = WEATHERS[this.cur].dur; this.t = rnd(d[0], d[1]);
        this.onChange(game);
      }
    } else {
      this.inten = Math.min(1, this.inten + dt / 8);
      this.t -= dt;
      if (this.t <= 0) { this.pending = this.pick(game); this.fade = 'out'; }
    }
    /* --- 风：缓慢摆动 + 阵风 --- */
    const W = WEATHERS[this.cur];
    this.windS = lerp(this.windS, W.wind, clamp(dt * 0.4, 0, 1));
    this.windPh += dt * (0.22 + this.windS * 0.5);
    this.windDir = Math.sin(this.windPh) * 0.85 + Math.sin(this.windPh * 2.7) * 0.2;
    this.gustV = clamp(this.windS * (0.8 + Math.sin(this.time * 0.63) * 0.4), 0, 1.5);
    /* --- 地面积雪 / 湿滑 --- */
    const snowT = this.cur === 'snow' ? this.inten : 0;
    this.snowCover = lerp(this.snowCover, snowT, clamp(dt * (snowT > this.snowCover ? 0.055 : 0.13), 0, 1));
    const wetT = (this.cur === 'rain' || this.cur === 'thunder') ? this.inten : (this.cur === 'snow' ? this.inten * 0.3 : 0);
    this.wet = lerp(this.wet, wetT, clamp(dt * 0.18, 0, 1));
    /* --- 闪电 --- */
    if (this.cur === 'thunder') {
      this.boltT -= dt;
      if (this.inten > 0.45 && this.boltT <= 0) {
        this.flash = 1; this.dbl = 0.17; this.boltSeed = irnd(0, 2); this.boltX = rnd(0.12, 0.88);
        this.boltT = rnd(4.5, 15);
      }
    }
    if (this.dbl > 0) { this.dbl -= dt; if (this.dbl <= 0) { this.flash = Math.max(this.flash, 0.75); this.dbl = -1; } }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.7);
    /* --- 粒子 --- */
    this.syncParticles(dt, game);
    /* --- 存档（低频） --- */
    this._saveT -= dt;
    if (this._saveT <= 0) { this._saveT = 20; this.save(); }
  },
  onChange(game) {
    const W = WEATHERS[this.cur];
    if (typeof UI !== 'undefined' && UI.toast && this._lastShown !== this.cur) {
      UI.toast(this.strength() + ' · ' + W.en, W.col);
      UI.log('天气转为' + this.strength() + '（' + W.name + ' · ' + W.en + '）', W.col);
    }
    this._lastShown = this.cur;
    this.save();
    void game;
  },
  /** 强度文案：同一天气按强度分档，HUD / 播报用 */
  strength() {
    const I = this.inten, k = this.cur;
    if (k === 'rain') return I > 0.8 ? '暴雨' : I > 0.55 ? '大雨' : I > 0.3 ? '中雨' : '细雨';
    if (k === 'thunder') return I > 0.7 ? '雷暴' : '雷阵雨';
    if (k === 'snow') return I > 0.8 ? '暴雪' : I > 0.55 ? '大雪' : I > 0.3 ? '中雪' : '小雪';
    if (k === 'wind') return I > 0.75 ? '狂风' : I > 0.45 ? '强风' : I > 0.2 ? '和风' : '微风';
    if (k === 'cloudy') return I > 0.7 ? '阴天' : '多云';
    return I > 0.7 ? '晴空' : '晴朗';
  },
  hud() {
    const W = WEATHERS[this.cur] || WEATHERS.clear;
    return { t: this.strength() + ' · ' + W.en, c: W.col };
  },

  /* ================= 粒子 ================= */
  syncParticles(dt, game) {
    const cam = game.cam, w = cam.w, h = cam.h;
    const mob = (typeof Mobile !== 'undefined' && Mobile.on);
    const q = mob ? 0.55 : 1;
    const I = this.inten;
    const rainy = (this.cur === 'rain' || this.cur === 'thunder') ? I : 0;
    const snowy = (this.cur === 'snow') ? I : 0;
    const windy = Math.max(this.cur === 'wind' ? I : 0, I * this.windS * 0.55);
    const area = w * h;
    const fit = (v, n) => { while (v.length > n) v.pop(); while (v.length < n) v.push(null); return v; };
    void fit;

    /* --- 雨丝 --- */
    const wantRain = rainy > 0.02 ? Math.round(clamp(area / 5200, 40, 300) * q * rainy) : 0;
    while (this.drops.length > wantRain) this.drops.pop();
    while (this.drops.length < wantRain) this.drops.push({ x: rnd(0, w), y: rnd(-h, h), len: rnd(9, 22), sp: rnd(520, 880) });
    const wx = this.windX();
    for (const d of this.drops) {
      d.y += d.sp * dt; d.x += wx * d.sp * dt * 0.55;
      if (d.y > h + 20) { d.y = -20; d.x = rnd(-60, w + 60); }
      if (d.x > w + 60) d.x -= w + 120; else if (d.x < -60) d.x += w + 120;
    }
    /* --- 雪花 --- */
    const wantSnow = snowy > 0.02 ? Math.round(clamp(area / 9000, 30, 190) * q * snowy) : 0;
    while (this.flakes.length > wantSnow) this.flakes.pop();
    while (this.flakes.length < wantSnow) this.flakes.push({ x: rnd(0, w), y: rnd(-h, h), r: irnd(1, 3), sp: rnd(26, 72), ph: rnd(0, 6.28) });
    for (const f of this.flakes) {
      f.ph += dt * 1.4;
      f.y += f.sp * dt;
      f.x += (wx * 34 + Math.sin(f.ph) * 20) * dt;
      if (f.y > h + 8) { f.y = -8; f.x = rnd(-40, w + 40); }
      if (f.x > w + 20) f.x -= w + 40; else if (f.x < -20) f.x += w + 40;
    }
    /* --- 阵风线条 --- */
    const wantGust = windy > 0.15 ? Math.round(clamp(windy * (mob ? 10 : 18), 2, 22)) : 0;
    while (this.gusts.length > wantGust) this.gusts.pop();
    while (this.gusts.length < wantGust) this.gusts.push({ x: rnd(-200, w), y: rnd(0, h), len: irnd(6, 20) * 10, sp: rnd(320, 640), a: rnd(0.12, 0.36) });
    for (const g of this.gusts) {
      g.x += (this.windDir >= 0 ? 1 : -1) * g.sp * (0.5 + this.gustV) * dt;
      g.y += Math.sin(this.time + g.y) * 6 * dt;
      if (this.windDir >= 0 && g.x > w + 40) { g.x = -g.len - 20; g.y = rnd(0, h); }
      if (this.windDir < 0 && g.x < -g.len - 40) { g.x = w + 20; g.y = rnd(0, h); }
    }
    /* --- 雨点落地涟漪 --- */
    this.ripAcc += dt * (rainy * (mob ? 9 : 18));
    const capRip = mob ? 26 : 52;
    while (this.ripAcc >= 1) {
      this.ripAcc -= 1;
      if (this.ripples.length < capRip) this.ripples.push({ x: rnd(0, w), y: rnd(h * 0.25, h), t: 0, r: rnd(5, 12) });
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const q2 = this.ripples[i]; q2.t += dt;
      if (q2.t > 0.55) this.ripples.splice(i, 1);
    }
    /* --- 云影（世界坐标，随风漂移） --- */
    const v = game.camView();
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    if (!this.clouds.length) {
      for (let i = 0; i < 6; i++) this.clouds.push({ x: cx + rnd(-v.w, v.w), y: cy + rnd(-v.h, v.h), r: irnd(15, 34) * 10, a: rnd(0.35, 0.8) });
    }
    for (const c of this.clouds) {
      c.x += wx * 30 * dt; c.y += this.windY() * 12 * dt;
      const dx = c.x - cx, dy = c.y - cy;
      if (dx > v.w) c.x -= v.w * 2; else if (dx < -v.w) c.x += v.w * 2;
      if (dy > v.h) c.y -= v.h * 2; else if (dy < -v.h) c.y += v.h * 2;
    }
  },

  /* ================= 绘制：地面层（世界坐标，压在角色之下） ================= */
  drawGround(ctx, game) {
    if (!this.enabled || !game || game.inHome || this.inten <= 0.02) return;
    const v = game.camView();
    /* 云影：阴天/雨天/雷暴更明显 */
    const cover = { clear: 0.16, cloudy: 0.8, wind: 0.25, rain: 0.62, thunder: 0.85, snow: 0.5 }[this.cur] || 0.2;
    if (cover > 0.02) {
      ctx.save();
      ctx.globalAlpha = clamp(0.34 * cover * this.inten, 0, 0.5);
      for (const c of this.clouds) {
        const img = WArt.cloud(c.r);
        ctx.drawImage(img, c.x - c.r, c.y - c.r * 0.62, c.r * 2, c.r * 1.24);
      }
      ctx.restore();
    }
    /* 地面积雪：越下越厚，天晴后慢慢消融 */
    if (this.snowCover > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(0.40 * this.snowCover, 0, 0.5);
      ctx.fillStyle = '#f4f9ff';
      ctx.fillRect(v.x - 48, v.y - 48, v.w + 96, v.h + 96);
      ctx.globalAlpha = clamp(0.14 * this.snowCover, 0, 0.25);
      ctx.fillStyle = '#b9d2ec';
      ctx.fillRect(v.x - 48, v.y - 48, v.w + 96, v.h + 96);
      ctx.restore();
    }
    /* 地面湿滑：压暗 + 一层冷色反光 */
    if (this.wet > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(0.22 * this.wet, 0, 0.35);
      ctx.fillStyle = '#16243c';
      ctx.fillRect(v.x - 48, v.y - 48, v.w + 96, v.h + 96);
      ctx.globalAlpha = clamp(0.10 * this.wet, 0, 0.2);
      ctx.fillStyle = '#7fb4e0';
      ctx.fillRect(v.x - 48, v.y - 48, v.w + 96, v.h + 96);
      ctx.restore();
    }
  },

  /* ================= 绘制：天空层（屏幕坐标，压在最上层） ================= */
  drawSky(ctx, game) {
    if (!this.enabled || !game || game.inHome) return;
    const cam = game.cam, w = cam.w, h = cam.h, I = this.inten;
    if (I <= 0.02 && this.flash <= 0.01) return;
    const W = WEATHERS[this.cur];
    /* 整体色调 */
    if (W.tint && I > 0.02) {
      ctx.save(); ctx.globalAlpha = clamp(0.17 * I, 0, 0.3);
      ctx.fillStyle = W.tint; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    /* 雨点涟漪（落在地面） */
    if (this.ripples.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(215,235,255,.7)'; ctx.lineWidth = 1;
      for (const q of this.ripples) {
        const a = clamp(1 - q.t / 0.55, 0, 1);
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r * (0.35 + q.t * 2.2), q.r * (0.15 + q.t * 0.85), 0, 0, 6.28); ctx.stroke();
      }
      ctx.restore();
    }
    /* 雨丝 */
    if (this.drops.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(196,222,255,.72)'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      const wx = this.windX();
      for (const d of this.drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - wx * d.len * 0.5, d.y + d.len);
      }
      ctx.stroke();
      ctx.restore();
    }
    /* 雪花 */
    if (this.flakes.length) {
      ctx.save();
      for (const f of this.flakes) {
        const img = WArt.flake(f.r);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(img, f.x - img.width / 2, f.y - img.height / 2);
      }
      ctx.restore();
    }
    /* 阵风线条 */
    if (this.gusts.length) {
      ctx.save();
      for (const g of this.gusts) {
        const img = WArt.gust(g.len);
        ctx.globalAlpha = g.a * clamp(this.inten, 0, 1);
        if (this.windDir < 0) { ctx.save(); ctx.translate(g.x + g.len, g.y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); }
        else ctx.drawImage(img, g.x, g.y);
      }
      ctx.restore();
    }
    /* 闪电 + 全屏闪光 */
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(0.5 * this.flash, 0, 0.6);
      ctx.fillStyle = '#cfe0ff'; ctx.fillRect(0, 0, w, h);
      ctx.restore();
      const b = WArt.bolt(this.boltSeed);
      ctx.save();
      ctx.globalAlpha = clamp(this.flash * 1.15, 0, 1);
      ctx.drawImage(b, w * this.boltX - b.width / 2, -8);
      ctx.restore();
    }
  },

  /* ================= 对外：环境参数 ================= */
  visMul() { const W = WEATHERS[this.cur] || WEATHERS.clear; return lerp(1, W.vis, this.inten); },
  spawnMul() { const W = WEATHERS[this.cur] || WEATHERS.clear; return lerp(1, W.spawn, this.inten); },
  /** 大区环境粒子的倍率：刮风卷起更多落叶/沙尘，下雨时花瓣变少 */
  ambientMul() {
    const k = this.cur, I = this.inten;
    const m = { clear: 1, cloudy: 1, wind: 1.7, rain: 0.5, thunder: 0.4, snow: 1.5 }[k] || 1;
    return lerp(1, m, I);
  }
};
