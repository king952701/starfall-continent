/* ============================================================
 * 16_main.js —— 启动器：标题动画 / 序章过场 / 角色创建 / 进入游戏
 * ==========================================================*/
'use strict';

const TitleScreen = {
  stars: [], meteors: [],
  init() {
    const cv = $('titleCv'), ctx = cv.getContext('2d');
    const fit = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    fit(); addEventListener('resize', fit);
    for (let i = 0; i < 160; i++) this.stars.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, s: rnd(0.5, 2), v: rnd(4, 30) });
    const draw = () => {
      const w = cv.width, h = cv.height;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#050a1c'); g.addColorStop(.55, '#0b1230'); g.addColorStop(1, '#160f26');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (const s of this.stars) {
        s.y += s.v * 0.016; if (s.y > h) { s.y = -4; s.x = Math.random() * w; }
        ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + s.s / 3) + ')';
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      if (Math.random() < 0.012) this.meteors.push({ x: rnd(0, w * 0.8), y: rnd(0, h * 0.3), l: rnd(60, 180) });
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const m = this.meteors[i];
        m.x += 3; m.y += 2;
        const grd = ctx.createLinearGradient(m.x, m.y, m.x - m.l, m.y - m.l);
        grd.addColorStop(0, 'rgba(255,215,106,.9)'); grd.addColorStop(1, 'rgba(255,215,106,0)');
        ctx.strokeStyle = grd; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.l, m.y - m.l); ctx.stroke();
        if (m.y > h) this.meteors.splice(i, 1);
      }
      // 远景山丘
      ctx.fillStyle = '#0a0f22';
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 40) ctx.lineTo(x, h * 0.72 + Math.sin(x * 0.006) * 40 + Math.sin(x * 0.013) * 18);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      requestAnimationFrame(draw);
    };
    draw();
  }
};

/* ---------------- 序章过场动画 ---------------- */
const Intro = {
  lines: [
    '远古时代，繁星如沙，垂落于无垠大陆。',
    '直到那日，一颗陨星撕裂长空，坠入大地深处。',
    '星核碎片四散，万物获得灵性，也滋生了异变。',
    '千年之后，能感知星核的人被称为——「星痕者」。',
    '现在，轮到你睁眼了。'
  ],
  idx: 0, t: 0, running: false,
  show(onEnd) {
    this.onEnd = onEnd; this.idx = 0; this.t = 0; this.running = true;
    $('intro').classList.remove('hide');
    const cv = $('introCv'), ctx = cv.getContext('2d');
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    this.start = performance.now();
    const frame = ts => {
      if (!this.running) return;
      const w = cv.width, h = cv.height, el2 = (ts - this.start) / 1000;
      const local = el2 - this.idx * 3.4;
      ctx.clearRect(0, 0, w, h);
      this.drawScene(ctx, w, h, local, ts / 1000);
      // 文本打字机
      const txt = this.lines[this.idx] || '';
      const shown = txt.slice(0, Math.floor(clamp(local / 1.6, 0, 1) * txt.length));
      $('introTxt').textContent = shown;
      if (local > 3.4) { this.idx++; if (this.idx >= this.lines.length) return this.end(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    $('introSkip').onclick = () => this.end();
  },
  end() {
    this.running = false;
    $('intro').classList.add('hide');
    this.onEnd && this.onEnd();
  },
  drawScene(ctx, w, h, local, T) {
    // 星空背景
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05091c'); g.addColorStop(1, '#170f2a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const sx = (i * 137.5) % w, sy = (i * 311.3) % (h * 0.7);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.5 * Math.abs(Math.sin(T + i))) + ')';
      ctx.fillRect(sx, sy, 2, 2);
    }
    // 地面
    ctx.fillStyle = '#101a2e';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 30) ctx.lineTo(x, h * 0.78 + Math.sin(x * 0.005) * 30);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    const cx = w / 2, cy = h * 0.45;
    if (this.idx === 0) {
      ctx.strokeStyle = 'rgba(180,200,255,.25)';
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(cx, cy, 60 + i * 60, 0, 6.28); ctx.stroke(); }
    } else if (this.idx === 1) {
      const t2 = clamp(local / 3, 0, 1);
      const mx = lerp(-100, cx, t2), my = lerp(-80, cy, t2);
      const grd = ctx.createLinearGradient(mx, my, mx - 200, my - 260);
      grd.addColorStop(0, '#fff'); grd.addColorStop(.4, '#ffd76a'); grd.addColorStop(1, 'rgba(255,215,106,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(mx, my, 12, 0, 6.28); ctx.fill();
      ctx.strokeStyle = grd; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - 200 * (1 - t2), my - 260 * (1 - t2)); ctx.stroke();
    } else if (this.idx === 2) {
      const t2 = clamp(local / 3, 0, 1);
      const r = 40 + t2 * Math.max(w, h) * 0.7;
      ctx.globalAlpha = 1 - t2;
      ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#5cf0ff'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * 6.28, d = r * t2 * (0.6 + (i % 5) * 0.1);
        ctx.fillStyle = i % 3 ? '#5cf0ff' : '#ffd76a';
        ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4, 4);
      }
    } else if (this.idx === 3) {
      for (let i = 0; i < 6; i++) {
        const x = w * (0.15 + i * 0.13), y = h * 0.72 + Math.sin(T * 2 + i) * 6;
        ctx.fillStyle = i % 2 ? '#4a3a5a' : '#2f3f4a';
        ctx.beginPath(); ctx.ellipse(x, y, 26, 18, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#ff6a6a'; ctx.fillRect(x - 8 + (i % 2) * 12, y - 6, 4, 4);
      }
    } else {
      const t2 = clamp(local / 2.4, 0, 1);
      ctx.globalAlpha = t2;
      const scale = 6;
      const look = CLASSES.warrior.look;
      const tmp = CV(16 * scale, 24 * scale);
      Sprites.drawChar(tmp.x, look, 'down', 0, 'sword', scale);
      ctx.drawImage(tmp.c, cx - 8 * scale, cy - 4 * scale);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,215,106,' + (0.4 + 0.3 * Math.sin(T * 3)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy + 60, 90, 0, 6.28); ctx.stroke();
    }
  }
};

/* ---------------- 角色创建 ---------------- */
function buildClassCards() {
  const box = $('classList'); box.innerHTML = '';
  document.querySelectorAll('.clsCard').forEach(() => { });
  let sel = 'warrior';
  CLASS_KEYS.forEach(k => {
    const c = CLASSES[k];
    const card = el('div', 'clsCard' + (k === sel ? ' on' : ''));
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 144; cv.className = 'ic';
    cv.getContext('2d').drawImage(Sprites.portrait(k, 6), 0, 0, 96, 144);
    card.appendChild(cv);
    card.appendChild(el('div', 'cn3', c.name));
    card.appendChild(el('div', 'cd2', c.desc + '<br><span style="color:#ffd76a">' + c.tags.join(' / ') + '</span>'));
    card.onclick = () => {
      sel = k;
      box.querySelectorAll('.clsCard').forEach(x => x.classList.remove('on'));
      card.classList.add('on');
      card.dataset.sel = '1';
      box.dataset.sel = k;
    };
    card.dataset.k = k;
    box.appendChild(card);
  });
  $('nickInput').value = '星痕者';
}

function startNewGame() {
  const cls = $('classList').dataset.sel || 'warrior';
  let name = ($('nickInput').value || '星痕者').trim().slice(0, 8);
  if (!name) name = '星痕者';
  const p = new Player(name, cls);
  const g = new Game($('cv'), p);
  window.GAME = g;
  // 出生点：新手村附近的空地
  const home = g.world.homeEntry;
  let spot = null;
  for (let i = 0; i < 60; i++) {
    const s = g.world.randomFreeTile(Math.round(home.x + rnd(-6, 6)), Math.round(home.y + rnd(6, 14)), 6, 1);
    if (s) { spot = s; break; }
  }
  const tx = spot ? spot.x : Math.round(home.x), ty = spot ? spot.y : Math.round(home.y + 8);
  p.x = tx * TILE_PX + 16; p.y = ty * TILE_PX + 16;
  // 初始物资
  p.addInstance(newGear(cls === 'mage' ? 1103 : cls === 'archer' ? 1102 : cls === 'assassin' ? 1104 : 1101, 1, 3, 0));
  p.addInstance(newGear(1202, 1, 2, 0));
  p.addItem(3001, 5, 2); p.addItem(3003, 3, 2);
  p.addItem(5001, 1, 2); p.addItem(5011, 1, 2); p.addItem(5021, 1, 2); p.addItem(5031, 1, 2);
  p.addItem(7001, 5, 2); p.addItem(7003, 3, 2);
  p.addItem(4315, 10, 2); p.addItem(4330, 5, 2);
  p.addItem(4005, 10, 2);   // 开局给一组煤炭，保证第一炉能开起来
  p.recompute(); p.hp = p.maxHp; p.mp = p.maxMp;
  beginGame(g, true);
}

function continueGame() {
  const g = Game.load($('cv'));
  if (!g) { UI.toast('没有找到存档', '#ff9a9a'); return; }
  window.GAME = g;
  beginGame(g, false);
}

function beginGame(g, isNew) {
  $('screenRoot').classList.add('hide');
  $('create').classList.add('hide');
  $('hud').classList.remove('hide');
  const av = Sprites.portrait(g.player.clsKey, 4);
  const ac = $('avatarCv').getContext('2d');
  ac.clearRect(0, 0, 96, 96);
  ac.drawImage(av, 0, 0, 96, 96);
  /* 点击头像 → 角色 / 宠物信息面板（桌面 click + 移动 touchstart 双绑定） */
  const ab = $('avatarBox');
  if (ab && !ab._charBound) {
    ab._charBound = true;
    const openChar = e => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (typeof UI !== 'undefined' && UI.openChar) { Snd.play('click'); UI.toggle('char', () => UI.openChar()); }
    };
    ab.addEventListener('click', openChar);
    ab.addEventListener('touchstart', openChar, { passive: false });
    ab._openChar = openChar;
  }
  const _z = g.cam.zoom || 1;
  g.cam.x = g.player.x - g.cam.w / _z / 2; g.cam.y = g.player.y - g.cam.h / _z / 2;
  if (g.clampCam) g.clampCam();
  g.start();
  UI.log('欢迎来到《星落大陆》！', '#ffd76a');
  if (isNew) {
    UI.log('WASD 移动，左键攻击，1~6 释放技能，Shift 翻滚。', '#cfe86a');
    UI.log('按 E 与采集点/宝箱/制作台/传送门交互；B 打开背包。', '#cfe86a');
    UI.toast('旅程开始', '#ffd76a');
  }
  Ach.check(g);
  /* 首次进入游戏自动弹出「致谢」页（之后可在标题界面「致谢 / Credits」再次打开） */
  try {
    const seen = localStorage.getItem('sf_credits_seen');
    if (!seen) {
      localStorage.setItem('sf_credits_seen', '1');
      setTimeout(() => { if (typeof UI !== 'undefined' && UI.showCredits) UI.showCredits(); }, 600);
    }
  } catch (e) { /* 存储不可用时直接跳过 */ }
}

/* ---------------- 引导 ---------------- */
addEventListener('DOMContentLoaded', () => {
  // 预先加载开源瓦片素材（未完成也不阻塞，地形会回退程序化贴图）
  Assets.load(ok => {
    $('titleFoot').textContent = ok
      ? '地表瓦片为原创生成素材 ｜ 角色 / 图标 / 特效由系统程序化生成'
      : '贴图 / 立绘 / 特效 全部由系统程序化生成';
    // 若已有世界实例，让区块用新素材重新烘焙
    if (window.GAME) for (const ch of window.GAME.world.chunks.values()) ch.canvas = null;
  });
  TitleScreen.init();
  buildClassCards();
  $('btnStart').onclick = () => { $('titleMenu').style.display = 'none'; $('create').classList.remove('hide'); buildClassCards(); };
  $('btnIntro').onclick = () => { $('titleMenu').style.display = 'none'; Intro.show(() => { $('titleMenu').style.display = ''; }); };
  $('btnCredits').onclick = () => { if (typeof UI !== 'undefined' && UI.showCredits) UI.showCredits(); };
  $('btnContinue').onclick = continueGame;
  $('btnEnter').onclick = startNewGame;
  $('nickInput').addEventListener('keydown', e => { if (e.key === 'Enter') startNewGame(); });
  // 测试用快捷键：跳过标题直接进入
  addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('screenRoot').classList.contains('hide') && !$('create').classList.contains('hide')) startNewGame();
  });
});
