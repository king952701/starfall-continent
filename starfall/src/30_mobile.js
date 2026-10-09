/* ============================================================
 * 30_mobile.js —— 安卓 / 移动端适配层
 * 虚拟摇杆（与键盘 WASD 同一套输入）、触屏动作按钮、面板快捷菜单、
 * 画布触摸桥接（点击攻击 / 采集 / 长按锁定怪物）、横竖屏自适应
 * 桌面端自动跳过，完全不影响 PC 玩法
 * ==========================================================*/
'use strict';

const Mobile = {
  on: false,
  game: null,
  joy: null, knob: null,
  joyId: null,
  dx: 0, dy: 0,
  menuOpen: false,

  init(game) {
    this.game = game;
    this.detect();                                        // 已在脚本加载期执行过也无妨（幂等）
    if (!this.on) return false;
    this.buildJoystick();
    this.buildActions();
    this.buildMenu();
    this.bindCanvas();
    if (UI.refresh) UI.refresh();
    if (typeof Settings !== 'undefined') Settings.applyUI();   // 应用玩家保存过的 UI 布局
    return true;
  },

  /** 尽早检测移动环境：脚本加载即执行，标题 / 角色选择界面也能套用手机样式 */
  detect() {
    const touch = ('ontouchstart' in window) ||
      (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0);
    const small = window.innerWidth < 900 || window.innerHeight < 620;
    const ua = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    this.on = !!((touch && small) || (touch && ua) || (ua && small));
    if (!this.on) return false;
    if (document.body) {
      document.body.classList.add('mobile');
      const portrait = window.innerHeight > window.innerWidth;
      document.body.classList.toggle('portrait', portrait);
      document.body.classList.toggle('landscape', !portrait);
    }
    if (!this._resizeBound) {
      this._resizeBound = true;
      this.bindResize();
    }
    return true;
  },

  /* ---------- 虚拟摇杆 ---------- */
  buildJoystick() {
    const hud = $('hud'); if (!hud) return;
    this.joy = el('div', 'joy');
    this.joy.innerHTML = '<div class="joyBg"></div><div class="joyKnob"></div>';
    hud.appendChild(this.joy);
    this.knob = this.joy.querySelector('.joyKnob');
    const R = 44, C = 52;                                  // 摇杆半径 / 中心偏移
    const setKnob = (x, y) => {
      if (!this.knob) return;
      this.knob.style.left = (C + x - 24) + 'px';
      this.knob.style.top = (C + y - 24) + 'px';
    };
    const move = t => {
      const r = this.joy.getBoundingClientRect();
      let x = t.clientX - (r.left + C), y = t.clientY - (r.top + C);
      const len = Math.hypot(x, y);
      if (len > R) { x = x / len * R; y = y / len * R; }
      setKnob(x, y);
      this.dx = x / R; this.dy = y / R;
      this.applyKeys();
    };
    const reset = () => { this.joyId = null; this.dx = this.dy = 0; setKnob(0, 0); this.applyKeys(); };
    this._resetJoy = reset;
    const onTouch = e => {
      for (const t of e.changedTouches) {
        if (e.type === 'touchstart' && this.joyId === null) this.joyId = t.identifier;
        if (t.identifier === this.joyId) {
          if (e.type === 'touchend' || e.type === 'touchcancel') reset(); else move(t);
        }
      }
      e.preventDefault(); e.stopPropagation();
    };
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(ev =>
      this.joy.addEventListener(ev, onTouch, { passive: false }));
    // 桌面 / 模拟器调试时也能用鼠标拖摇杆
    if (typeof window.PointerEvent !== 'undefined') {
      this.joy.addEventListener('mousedown', () => { this.joyId = 'mouse'; });
      window.addEventListener('mousemove', e => { if (this.joyId === 'mouse') move(e); });
      window.addEventListener('mouseup', () => { if (this.joyId === 'mouse') reset(); });
    }
    setKnob(0, 0);
  },
  /** 摇杆 → 键位（与键盘 WASD 同源） */
  applyKeys() {
    if (!this.game) return;
    const k = this.game.keys;
    k['w'] = this.dy < -0.33;
    k['s'] = this.dy > 0.33;
    k['a'] = this.dx < -0.33;
    k['d'] = this.dx > 0.33;
  },

  /* ---------- 右下角动作按钮 ---------- */
  buildActions() {
    const hud = $('hud'); if (!hud) return;
    const wrap = el('div', 'mActs');
    const add = (label, cls, fn) => {
      const b = el('div', 'mbtn ' + (cls || ''), label);
      b.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 130);
        fn();
      }, { passive: false });
      b.addEventListener('click', e => e.preventDefault());
      wrap.appendChild(b);
      return b;
    };
    const g = this.game;
    /* 横屏中部（水平居中）：采集 / 交互 —— 各机型按比例定位，不遮挡摇杆与攻击键 */
    const mid = el('div', 'mMid');
    const addMid = (label, cls, fn) => {
      const b = el('div', 'mbtn ' + (cls || ''), label);
      b.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 130);
        fn();
      }, { passive: false });
      b.addEventListener('click', e => e.preventDefault());
      mid.appendChild(b);
      return b;
    };
    addMid('采集', 'mid', () => {
      const nd = this.nearestNode(3.6);
      if (nd) UI.openNode(nd); else UI.toast('附近没有资源点', '#ff9a9a');
    });
    addMid('交互', 'mid', () => g.tryInteract());
    hud.appendChild(mid);
    this.mid = mid;

    add('攻击', 'big', () => { if (g.player.dead) return; g.player.basicAttack(g); g.clickTarget(); });
    add('翻滚', '', () => { if (!g.player.dead) g.player.roll(g); });
    add('药水', 'mid', () => g.quickPotion());
    hud.appendChild(wrap);
    this.acts = wrap;
  },
  /** 找最近的资源点（复用大地图对象网格，和鼠标点击判定同源） */
  nearestNode(rangeTiles) {
    const g = this.game, p = g.player;
    if (!g.world || !g.world.objectsNear) return null;
    const tx = Math.floor(p.x / TILE_PX), ty = Math.floor(p.y / TILE_PX);
    const R = Math.max(1, Math.ceil(rangeTiles)), limit = rangeTiles * TILE_PX;
    let best = null, bd = 1e9;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const list = g.world.objectsNear(tx + dx, ty + dy, 1) || [];
        for (const it of list) {
          if (!it.o || !it.o.node) continue;
          const d = dist(p.x, p.y, it.tx * TILE_PX + 16, it.ty * TILE_PX + 16);
          if (d <= limit && d < bd) { bd = d; best = it.o.node; }
        }
      }
    }
    return best;
  },

  /* ---------- 面板快捷菜单 ---------- */
  buildMenu() {
    const hud = $('hud'); if (!hud) return;
    const wrap = el('div', 'mMenu');
    const items = [
      ['背包', () => UI.toggle('bag', () => UI.openBag())],
      ['角色', () => UI.toggle('char', () => UI.openChar())],
      ['制作', () => UI.toggle('craft', () => UI.openCraft())],
      ['天赋', () => UI.toggle('talent', () => UI.openTalent())],
      ['技能', () => UI.toggle('skills', () => UI.openSkills())],
      ['地图', () => UI.toggle('map', () => UI.openMap())],
      ['成就', () => UI.toggle('ach', () => UI.openAch())],
      ['图鉴', () => UI.toggle('codex', () => UI.openCodex())],
      ['排行', () => UI.toggle('rank', () => UI.openRank())],
      ['挂机', () => UI.toggle('idle', () => UI.openIdle())],
      ['拍卖', () => UI.toggle('market', () => UI.openMarket())],
      ['导航', () => UI.toggleOverview()],
      ['频道', () => UI.focusChat()],
      ['设置', () => { if (typeof Settings !== 'undefined') Settings.open(); }],
      ['存档', () => { this.game.save(true); UI.toast('已存档', '#ffd76a'); }]
    ];
    const list = el('div', 'mMenuList');
    items.forEach(it => {
      const b = el('div', 'mMenuBtn', it[0]);
      b.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 130);
        it[1]();
      }, { passive: false });
      list.appendChild(b);
    });
    const toggle = el('div', 'mMenuToggle', '菜单');
    toggle.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      this.menuOpen = !this.menuOpen;
      list.classList.toggle('open', this.menuOpen);
    }, { passive: false });
    wrap.appendChild(list); wrap.appendChild(toggle);
    hud.appendChild(wrap);
    this.menu = wrap;
  },

  /* ---------- 画布触摸桥接 ---------- */
  bindCanvas() {
    const g = this.game, cv = g.cv;
    const pos = t => {
      const r = cv.getBoundingClientRect();
      g.mouse.x = t.clientX - r.left; g.mouse.y = t.clientY - r.top;
      g.mouse.cx = t.clientX; g.mouse.cy = t.clientY; g.mouse.overCanvas = true;
    };
    let longT = null, moved = false, startX = 0, startY = 0;
    /* 双指缩放：记录起始指间距与缩放值，移动时按比例调整（瓦片地图与相机跟随一起缩放） */
    let pinch = false, pDist = 0, pZoom = 1, pZoom0 = 1;
    const twoDist = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
    const pinchAnchor = ts => {
      const r = cv.getBoundingClientRect();
      return { x: (ts[0].clientX + ts[1].clientX) / 2 - r.left, y: (ts[0].clientY + ts[1].clientY) / 2 - r.top };
    };
    cv.addEventListener('touchstart', e => {
      if (e.touches.length >= 2 && g.setZoom) {                   // 双指落下 → 进入缩放
        pinch = true; moved = true; g.mouse.down = false;
        if (longT) { clearTimeout(longT); longT = null; }
        pDist = twoDist(e.touches); pZoom = pZoom0 = g.cam.zoom || 1;
        e.preventDefault(); e.stopPropagation();
        return;
      }
      const t = e.changedTouches[0]; if (!t) return;
      pos(t); moved = false; startX = t.clientX; startY = t.clientY;
      longT = setTimeout(() => {                                  // 长按 = 锁定怪物（等价鼠标右键）
        const m = g.monsterAtMouse();
        if (m) { g.targetMonster = m; UI.toast('锁定 ' + m.name, '#ff9a9a'); }
      }, 420);
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchmove', e => {
      if (pinch && e.touches.length >= 2 && g.setZoom) {
        const d = twoDist(e.touches), a = pinchAnchor(e.touches);
        if (pDist > 10 && d > 10) { pZoom = g.setZoom(pZoom0 * (d / pDist), a.x, a.y); }
        e.preventDefault(); e.stopPropagation();
        return;
      }
      const t = e.changedTouches[0]; if (!t) return;
      pos(t); g.mouse.down = true;                                // 按住拖动 = 持续普通攻击
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > 12) {
        moved = true; if (longT) { clearTimeout(longT); longT = null; }
      }
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchend', e => {
      if (pinch) {
        if (e.touches.length < 2) {                               // 双指全部抬起 → 结束缩放
          pinch = false; g.mouse.down = false;
          if (Math.abs((g.cam.zoom || 1) - 1) > 0.04) UI.toast('视野 ×' + (g.cam.zoom || 1).toFixed(2), '#9fe8b8');
        }
        e.preventDefault(); e.stopPropagation();
        return;
      }
      const t = e.changedTouches[0]; if (!t) return;
      pos(t); g.mouse.down = false;
      if (longT) { clearTimeout(longT); longT = null; }
      if (!moved) {
        if (!g.clickNode() && !g.player.dead) { g.player.basicAttack(g); g.clickTarget(); }
      }
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchcancel', () => { g.mouse.down = false; }, { passive: false });
  },

  /* ---------- 尺寸 / 朝向自适应 ---------- */
  bindResize() {
    const handler = () => this.layout();
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', () => setTimeout(handler, 300));
  },
  layout() {
    const portrait = window.innerHeight > window.innerWidth;
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('landscape', !portrait);
    if (this.game && this.game.clampCam) this.game.clampCam();   // 旋转 / 尺寸变化后重新收敛相机边界
    this.fitPanels();
  },
  /** 把所有面板缩放到可视区内并居中（手机竖屏 / 小屏也能看完面板） */
  fitPanels() {
    if (UI && UI.fitPanels) UI.fitPanels();
  }
};

/* 脚本加载即检测（body 此时已存在：脚本位于 </body> 前），
   让标题界面 / 角色选择界面立即套用手机端样式 */
try { Mobile.detect(); } catch (e) { /* 忽略极早期异常 */ }
