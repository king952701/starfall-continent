/* ============================================================
 * 15_game.js —— 游戏主循环：输入 / 摄像机 / 刷怪 / 交互 / 渲染 / 存档
 * ==========================================================*/
'use strict';

class Game {
  constructor(canvas, player) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.player = player; this.world = new World(20260810);
    this.monsters = []; this.fx = []; this.floats = [];
    this.keys = {}; this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false, overCanvas: false, cx: 0, cy: 0 };
    /* zoom：视野缩放（1 = 原始比例；>1 放大拉近，<1 缩小看更远）。双指 / 滚轮调节并存档 */
    this.cam = { x: 0, y: 0, w: canvas.width, h: canvas.height, zoom: 1 };
    this.cam.zoom = clamp((typeof Settings !== 'undefined' && Settings.data && Settings.data.zoom) || 1, 0.5, 2.5);
    this.inHome = false; this.targetMonster = null;
    this.gather = null; this.selectedBagIndex = -1;
    this.task = null; this.hover = null;   // 批量采集任务 / 当前悬停资源点
    this.route = null;                     // 自动导航目标
    this.spawnT = 0; this.saveT = 0; this.miniCached = false;
    this.timeSec = 0; this.last = performance.now();
    this.interactHint = '';
    this.home = player.home || new Home(player.name);
    player.home = this.home;
    this.resize();
    this.bindInput();
    UI.init(this);
    if (typeof Mobile !== 'undefined') Mobile.init(this);   // 安卓 / 触屏：摇杆 + 触屏按钮 + 面板自适应
    if (!Market.list.length) Market.refreshNpc(true);   // 拍卖行：初始 NPC 货源
    const _z = this.cam.zoom || 1;
    this.cam.x = player.x - canvas.width / _z / 2; this.cam.y = player.y - canvas.height / _z / 2;
    this.clampCam();
    if (typeof window !== 'undefined') window.GAME = this;   // 供设置模块实时调整画质 / 缩放
  }

  /* ================= 生命周期 ================= */
  resize() {
    const w = Math.min(window.innerWidth, 1920), h = Math.min(window.innerHeight, 1080);
    /* 画质档位：画布像素 = CSS 尺寸 × 倍率（低 0.6 / 中 0.8 / 高 1 / 4K 1.6），再由 CSS 拉伸铺满 */
    const s = (typeof Settings !== 'undefined' && Settings.qScale) ? Settings.qScale() : 1;
    this.cv.width = Math.max(320, Math.round(w * s));
    this.cv.height = Math.max(240, Math.round(h * s));
    this.cam.w = w; this.cam.h = h;
  }
  start() { requestAnimationFrame(t => this.loop(t)); }
  loop(ts) {
    /* 帧率上限（设置模块）：未到间隔直接跳过这一帧，只排队下一帧 */
    if (typeof Settings !== 'undefined' && Settings.frameMs) {
      const gap = Settings.frameMs();
      if (gap > 0 && ts - this.last < gap - 1.2) { requestAnimationFrame(t => this.loop(t)); return; }
    }
    const dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
    try { this.update(dt); this.render(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(t => this.loop(t));
  }

  /* ================= 输入 ================= */
  bindInput() {
    const stopKey = e => { const k = e.key.toLowerCase(); return ['tab', ' '].includes(k); };
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === ' ') e.preventDefault();
      if (e.repeat) return; // 按住不放时忽略系统自动重复，避免采集进度被反复重置
      if (k === 'escape') { if (document.activeElement === $('chatInput')) $('chatInput').blur(); UI.closeAll(); return; }
      // 在聊天输入框 / 下拉框中打字时，不触发任何游戏快捷键
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (k === 'enter') { UI.focusChat(); return; }
      if (k === 'tab') { e.preventDefault(); UI.toggleOverview(); return; }
      if (this.player.dead) return;
      if (k === 'e') this.tryInteract();
      if (k === 'b') UI.toggle('bag', () => UI.openBag());
      if (k === 'c') UI.toggle('char', () => UI.openChar());
      if (k === 'k') UI.toggle('craft', () => UI.openCraft());
      if (k === 't') UI.toggle('talent', () => UI.openTalent());
      if (k === 'v') UI.toggle('skills', () => UI.openSkills());
      if (k === 'm') UI.toggle('map', () => UI.openMap());
      if (k === 'j') UI.toggle('ach', () => UI.openAch());
      if (k === 'p') UI.toggle('codex', () => UI.openCodex());
      if (k === 'l') UI.toggle('rank', () => UI.openRank());
      if (k === 'o') UI.toggle('idle', () => UI.openIdle());
      if (k === 'y') UI.toggle('market', () => UI.openMarket());
      if (k === 'u') { if (typeof Settings !== 'undefined') Settings.open(); }
      if (k === 'q') this.quickPotion();
      if (k === ' ') this.player.roll(this);
      if (['1', '2', '3', '4', '5', '6'].includes(k)) this.player.castSkill(+k, this);
      if (k === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.save(true); }
    });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    this.cv.addEventListener('mouseenter', () => this.mouse.overCanvas = true);
    this.cv.addEventListener('mouseleave', () => {
      this.mouse.overCanvas = false;
      if (this.hover) { this.hover = null; UI.tipHide('node'); }
    });
    this.cv.addEventListener('mousemove', e => {
      const r = this.cv.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
      this.mouse.cx = e.clientX; this.mouse.cy = e.clientY;
      this.mouse.overCanvas = true;
    });
    this.cv.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this.mouse.down = true;
        if (this.clickNode()) return;          // 点到资源点 → 打开采集面板
        this.player.basicAttack(this); this.clickTarget();
      }
      if (e.button === 2) { const m = this.monsterAtMouse(); if (m) this.targetMonster = m; }
    });
    addEventListener('mouseup', () => this.mouse.down = false);
    this.cv.addEventListener('contextmenu', e => e.preventDefault());
    /* 滚轮缩放（桌面 / 模拟器调试用；手机走双指手势） */
    this.cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = this.cv.getBoundingClientRect();
      this.setZoom((this.cam.zoom || 1) * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    addEventListener('resize', () => this.resize());
  }
  quickPotion() {
    const p = this.player;
    const idx = p.bag.findIndex(it => it && (it.id === 3001 || it.id === 3002));
    if (idx < 0) { UI.toast('没有生命药水', '#ff9a9a'); return; }
    UI.useItem(idx);
  }
  monsterAtMouse() {
    let best = null, bd = 24;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = dist(m.x, m.y, this.mouse.worldX, this.mouse.worldY);
      if (d < Math.max(bd, this.sizeRadius(m)) && (!best || d < bd)) { best = m; bd = d; }
    }
    return best;
  }
  clickTarget() {
    const m = this.monsterAtMouse();
    if (m) this.targetMonster = m;
  }
  sizeRadius(m) { return (m.size ? m.size() : 1) * 22; }

  /* ================= 资源扫描 / 自动前往 ================= */
  /** 扫描以玩家为中心的真实资源点（读取世界实际生成的物件） */
  scanResources(radTiles) {
    const p = this.player;
    const tx = Math.floor(p.x / TILE_PX), ty = Math.floor(p.y / TILE_PX);
    const out = [];
    if (this.inHome) return out;
    const list = this.world.objectsNear(tx, ty, radTiles);
    for (const it of list) {
      const nd = it.o.node;
      if (!nd || nd.amount <= 0) continue;
      out.push({
        tx: it.tx, ty: it.ty, nd: nd, skill: nd.skill, req: nd.req || 1,
        amount: nd.amount, max: nd.max, name: this.nodeName(nd),
        d: Math.round(dist(p.x / TILE_PX, p.y / TILE_PX, it.tx, it.ty))
      });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }
  /** 设定自动前往目标（格坐标） */
  autoTravel(tx, ty, name) {
    if (this.inHome) { UI.toast('家园为独立空间，无法自动前往', '#ff9a9a'); return; }
    tx = clamp(Math.round(tx), 0, WORLD_SIZE - 1); ty = clamp(Math.round(ty), 0, WORLD_SIZE - 1);
    this.route = { tx: tx, ty: ty, name: name || null, t: 0, stuck: 0, side: 0, sideT: 0, lastSide: 0 };
    UI.toast('自动前往 ' + (name ? name + ' ' : '') + '(' + tx + ', ' + ty + ')', '#9fd06a');
    UI.log('自动前往中…移动（WASD）可取消导航', '#cfe86a');
  }
  cancelRoute(msg) {
    if (!this.route) return;
    this.route = null;
    if (msg) UI.toast(msg, '#ffdf94');
  }
  /** 自动寻路：直线推进 + 受阻挡时侧移绕行 */
  updateRoute(dt) {
    const r = this.route, p = this.player;
    if (!r || p.dead) return;
    if (p.isControlled()) return;
    r.t += dt;
    if (r.t > 180) return this.cancelRoute('自动前往超时');
    const gx = r.tx * TILE_PX + 16, gy = r.ty * TILE_PX + 16;
    const d = dist(p.x, p.y, gx, gy);
    if (d < 22) {
      UI.toast('已抵达 ' + (r.name || '目标'), '#9fd06a');
      this.route = null; return;
    }
    let ax = (gx - p.x) / d, ay = (gy - p.y) / d;
    if (r.sideT > 0) {                        // 绕行：沿垂直方向走一小段
      r.sideT -= dt;
      const nx = -ay * r.side, ny = ax * r.side;
      ax = nx; ay = ny;
    }
    const ox = p.x, oy = p.y;
    const sp = p.stats.moveSpd * TILE_PX * dt;
    p.moveWithCollision(this.world, ax * sp, ay * sp, 10);
    p.moving = true;
    p.animT += dt * Math.min(3, 1 + p.stats.moveSpd / 6);
    p.face = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
    const moved = dist(p.x, p.y, ox, oy);
    if (moved < sp * 0.35) {
      r.stuck += dt;
      if (r.sideT <= 0) {
        r.side = r.lastSide ? -r.lastSide : (Math.random() < 0.5 ? -1 : 1);
        r.lastSide = r.side;
        r.sideT = 0.8;
      }
      if (r.stuck > 4) return this.cancelRoute('前方地形阻挡，已停止导航');
    } else { r.stuck = 0; }
  }

  /* ================= 更新 ================= */
  update(dt) {
    const p = this.player;
    this.timeSec += dt;
    // 玩家有操作（移动 / 按住攻击 / 摇杆）→ 重置「10 秒无操作自动关闭面板」计时
    if (typeof UI !== 'undefined' && UI.touch) {
      const k = this.keys;
      const joyOn = (typeof Mobile !== 'undefined' && Mobile.on && (Mobile.dx || Mobile.dy));
      if (this.mouse.down || joyOn || k['w'] || k['a'] || k['s'] || k['d']) UI.touch();
    }
    const z = this.cam.zoom || 1;
    this.mouse.worldX = this.cam.x + this.mouse.x / z; this.mouse.worldY = this.cam.y + this.mouse.y / z;
    p.aimAngle = angleOf(p.x, p.y - 8, this.mouse.worldX, this.mouse.worldY);
    if (!p.dead) this.movePlayer(dt);
    p.update(dt, this);
    // 摄像机跟随（可视世界范围 = 屏幕尺寸 / 缩放，保证主角始终居中）
    const vw = this.cam.w / z, vh = this.cam.h / z;
    const cx = p.x - vw / 2, cy = p.y - vh / 2;
    this.cam.x = lerp(this.cam.x, cx, 0.14); this.cam.y = lerp(this.cam.y, cy, 0.14);
    this.clampCam();
    // 世界
    if (!this.inHome) {
      this.world.update(dt);
      this.spawnT -= dt;
      /* 天气影响刷怪节奏：雷暴时怪物更活跃 */
      const smul = (typeof Weather !== 'undefined' && Weather.spawnMul) ? Weather.spawnMul() : 1;
      if (this.spawnT <= 0) { this.spawnT = 1.2 / Math.max(0.2, smul); this.updateSpawns(); }
    } else {
      this.home.update(dt);
    }
    this.updateAmbient(dt);
    if (typeof Weather !== 'undefined') Weather.update(dt, this);   // 天气 AI + 天气粒子                        // 环境粒子（雪 / 沙 / 落叶 / 萤火）
    // 实体
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (!this.inHome) m.update(dt, this);
      if (m.dead) {
        if (Date.now() - m.deadT > 3000) this.monsters.splice(i, 1);
      } else if (!this.inHome && dist(m.x, m.y, p.x, p.y) > 64 * TILE_PX) this.monsters.splice(i, 1);
    }
    if (this.targetMonster && (this.targetMonster.dead || dist(this.targetMonster.x, this.targetMonster.y, p.x, p.y) > 24 * TILE_PX)) this.targetMonster = null;
    // 采集（手动进度条 + 批量任务）
    this.updateGather(dt);
    this.updateTask(dt);
    this.updateHoverNode();
    Idle.tick(dt);                                   // 离线挂机 + 世界频道消息
    Market.tick(dt);                                 // 拍卖行 NPC 补货 / 收购
    UI.tickOverview(dt);
    this._nodeTick = (this._nodeTick || 0) + dt;
    if (this._nodeTick > 0.25) { this._nodeTick = 0; if (UI._nodeNd) UI.refreshNode(); }
    // 特效 / 飘字
    for (let i = this.fx.length - 1; i >= 0; i--) { this.fx[i].ttl -= dt; if (this.fx[i].ttl <= 0) this.fx.splice(i, 1); }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t -= dt; f.y -= dt * 26; if (f.t <= 0) this.floats.splice(i, 1);
    }
    // 自动存档
    this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 30; this.save(); }
    UI.refresh();
    this.updateHint();
  }
  movePlayer(dt) {
    const p = this.player, k = this.keys;
    let dx = 0, dy = 0;
    if (k['w'] || k['arrowup']) dy--;
    if (k['s'] || k['arrowdown']) dy++;
    if (k['a'] || k['arrowleft']) dx--;
    if (k['d'] || k['arrowright']) dx++;
    if ((dx || dy) && this.task) this.stopTask('移动中断了自动采集');
    if (dx || dy) { if (this.route) this.cancelRoute('已取消导航'); }
    else if (this.route && !this.gather && !this.inHome) { this.updateRoute(dt); return; }
    if (this.gather) { dx = dy = 0; }
    if (dx || dy) {
      if (p.isControlled()) { return; }
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      const sp = p.stats.moveSpd * TILE_PX * dt;
      p.animT += dt * Math.min(3, 1 + p.stats.moveSpd / 6); p.moving = true;
      p.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (this.inHome) {
        const nx = p.x + dx * sp, ny = p.y + dy * sp;
        const chk = (tx, ty) => {
          const kk = this.home.tileKind(Math.floor(tx / TILE_PX), Math.floor(ty / TILE_PX));
          return kk === 'house' || kk === 'fence';
        };
        if (!chk(nx + Math.sign(dx) * 10, p.y)) p.x = nx;
        if (!chk(p.x, ny + Math.sign(dy) * 10)) p.y = ny;
        p.x = clamp(p.x, 20, HOME_SIZE * TILE_PX - 20); p.y = clamp(p.y, 20, HOME_SIZE * TILE_PX - 20);
      } else {
        p.moveWithCollision(this.world, dx * sp, dy * sp, 10);
      }
    } else { p.moving = false; p.animT = 0; }
  }

  /* ================= 刷怪 ================= */
  updateSpawns() {
    const p = this.player;
    const tileX = Math.floor(p.x / TILE_PX), tileY = Math.floor(p.y / TILE_PX);
    const reg = regionAtTile(tileX, tileY);
    if (!reg || reg.key === 'sea') return;
    const near = this.monsters.filter(m => !m.dead && dist(m.x, m.y, p.x, p.y) < 36 * TILE_PX);
    const density = reg.key === 'ruin' ? 3 : reg.key === 'abyss' ? 4 : 5;
    if (near.length >= density) return;
    // 不要在村落/营地 12 格内刷怪
    for (let tries = 0; tries < 6; tries++) {
      const spot = this.world.randomFreeTile(tileX, tileY, 22, 20);
      if (!spot) continue;
      if (dist(spot.x, spot.y, p.x / TILE_PX, p.y / TILE_PX) < 9) continue;
      let tooClose = false;
      for (const s of this.world.sites) if (Math.abs(s.tx - spot.x) < 14 && Math.abs(s.ty - spot.y) < 14) tooClose = true;
      if (tooClose) continue;
      const lv = clamp(regionLevelAt(reg, spot.x, spot.y), reg.lv[0], reg.lv[1]);
      const hasBossAlive = this.monsters.some(m => !m.dead && m.data.tier === 'boss');
      let tier = 'normal';
      const r = Math.random();
      if (r < 0.08) tier = 'elite';
      else if (r < 0.10 && !hasBossAlive && p.lv >= reg.lv[0]) tier = 'boss';
      const data = spawnMonsterData(reg.key, tier, lv);
      const m = new Monster(data, spot.x * TILE_PX + 16, spot.y * TILE_PX + 16);
      this.monsters.push(m);
      break;
    }
  }

  /* ================= 交互 ================= */
  tryInteract() {
    if (this.inHome) return this.tryInteractHome();
    const p = this.player;
    const tx = Math.floor(p.x / TILE_PX), ty = Math.floor(p.y / TILE_PX);
    // 优先采集点：打开资源点采集面板
    const nd = this.world.nearestNode(tx, ty, 2.6);
    if (nd) { UI.openNode(nd.node); return; }
    const objs = this.world.objectsNear(tx, ty, 2)
      .filter(o => ['chest', 'bench', 'portal', 'npc'].includes(o.o.kind))
      .sort((a, b) => dist(a.tx, a.ty, tx, ty) - dist(b.tx, b.ty, tx, ty));
    if (!objs.length) { UI.toast('附近没有可交互目标', '#ff9a9a'); return; }
    const o = objs[0].o;
    if (o.kind === 'chest') this.openChest(o, objs[0].tx, objs[0].ty);
    else if (o.kind === 'bench') { UI.openCraft(); UI._craftTab = o.data; UI.refreshCraft(); }
    else if (o.kind === 'portal') this.enterHome();
    else if (o.kind === 'npc') this.talkNpc(o);
  }
  talkNpc(o) {
    const lines = {
      guard: ['这片大陆不太平，出门记得带药水。', '往北越过森林就是更好的猎场。', '小心夜里出现的精英怪。'],
      merchant: ['多出来的材料别堆在包里，我这儿也能卖个好价钱。', '装备强化到 +5 之前都是稳赚的。', '想要更好的装备？去副本试试运气。'],
      elder: ['陨星落下那天，我看见了星核的光芒……', '孩子，力量来自每一次挥剑与每一次采集。', '传说集齐 50 枚星核碎片，能唤醒真正的星痕。']
    }[o.data] || ['……'];
    UI.toast('村民：' + choice(lines), '#cfe86a');
    UI.log('村民：' + lines[0], '#cfe86a');
  }
  openChest(o, tx, ty) {
    const now = Date.now();
    if (o.opened && now - o.opened < 120000) { UI.toast('宝箱已空', '#ff9a9a'); return; }
    o.opened = now;
    const ch = this.world.chunks.get((tx >> 4) + ',' + (ty >> 4));
    if (ch) ch.canvas = null;
    const p = this.player;
    const lv = clamp(regionLevelAt(regionAtTile(tx, ty), tx, ty), 1, 60);
    p.stat.chests++;
    const gold = irnd(lv * 20, lv * 60);
    p.addGold(gold);
    this.floatTextAt(tx * TILE_PX, ty * TILE_PX, '+' + fmt(gold) + ' 金币', '#ffdf94');
    if (chance(0.45)) {
      const g = rollEquipDrop(lv, 'chest');
      if (p.addInstance(g)) UI.log('获得装备：' + gearFullName(g), getQuality(g.q).color);
    }
    for (let i = 0; i < 3; i++) {
      if (chance(0.6)) {
        const pool = [4315, 4316, 3001, 3003, 4301, 4302, 4303, 4333, 4319, 4320];
        p.addItem(choice(pool), irnd(1, 3), irnd(2, 4));
      }
    }
    // 种子：按所在区域等级解锁，保证高等级作物（及依赖它们的烹饪）可自给
    const seedPool = Object.values(ITEMS).filter(i => i.type === 'seed' && lv >= (i.lv || 1));
    if (seedPool.length && chance(0.55)) {
      // 越往深处，越倾向出高等级作物种子
      const sd = weightedPick(seedPool, i => 1 + Math.round((i.lv || 1) / 12));
      p.addItem(sd.id, irnd(2, 4), 2);
      UI.log('获得种子 ' + sd.name, '#9fd06a');
    }
    p.addExp(lv * 20, this);
    UI.toast('开启宝箱！', '#ffd76a');
    Ach.check(this);
  }
  enterHome() {
    this.homeExit = { x: this.player.x, y: this.player.y };
    this.player.x = this.home.portal.x * TILE_PX + 16;
    this.player.y = this.home.portal.y * TILE_PX + 40;
    this.inHome = true;
    UI.toast('进入家园 · ' + this.home.cfg.name, '#9fe8ff');
    UI.log('家园：左键点背包里的种子 → 走到田地播种；走到渔场点击投放/收取', '#9fe8ff');
  }
  exitHome() {
    this.inHome = false;
    if (this.homeExit) { this.player.x = this.homeExit.x; this.player.y = this.homeExit.y; }
    else { this.player.x = this.world.homeEntry.x * TILE_PX; this.player.y = this.world.homeEntry.y * TILE_PX; }
    UI.toast('返回大陆', '#9fe8ff');
  }
  tryInteractHome() {
    const p = this.player;
    const h = this.home;
    // 传送门
    if (dist(p.x, p.y, h.portal.x * TILE_PX, h.portal.y * TILE_PX) < 56) { this.exitHome(); return; }
    // 渔场
    const pcx = (h.pond.x + h.pond.w / 2) * TILE_PX, pcy = (h.pond.y + h.pond.h / 2) * TILE_PX;
    if (dist(p.x, p.y, pcx, pcy) < Math.max(h.pond.w, h.pond.h) * TILE_PX * 0.62) {
      if (h.pending.length) { h.collectPond(this); return; }
      const idx = p.bag.findIndex(it => it && ITEMS[it.id].sub === 'fish');
      if (idx >= 0) { this.selectedBagIndex = idx; h.addFish(p.bag[idx], this); UI.refreshBag && UI.refreshBag(); return; }
      UI.toast('背包里没有鱼可投放', '#ff9a9a'); return;
    }
    // 田地
    let best = null, bd = 40;
    for (const pl of h.plots) {
      const d = dist(p.x, p.y, pl.x * TILE_PX + 16, pl.y * TILE_PX + 16);
      if (d < bd) { bd = d; best = pl; }
    }
    if (best) {
      if (best.crop && h.progress(best) >= 1) { h.harvest(best, this); return; }
      if (best.crop) { h.water(best, this); return; }
      const sidx = p.bag.findIndex(it => it && it.type === 'seed');
      if (sidx >= 0) { h.plant(best, p.bag[sidx].id, this); UI.refreshBag && UI.refreshBag(); return; }
      UI.toast('没有种子，去野外/商店获取吧', '#ff9a9a');
    }
  }
  updateHint() {
    let txt = '';
    if (this.inHome) {
      const h = this.home;
      if (dist(this.player.x, this.player.y, h.portal.x * TILE_PX, h.portal.y * TILE_PX) < 56) txt = 'E 离开家园';
      else {
        let best = null, bd = 40;
        for (const pl of h.plots) { const d = dist(this.player.x, this.player.y, pl.x * TILE_PX + 16, pl.y * TILE_PX + 16); if (d < bd) { bd = d; best = pl; } }
        if (best) txt = best.crop ? (h.progress(best) >= 1 ? 'E 收获' : 'E 浇水') : 'E 播种';
        const pcx = (h.pond.x + h.pond.w / 2) * TILE_PX, pcy = (h.pond.y + h.pond.h / 2) * TILE_PX;
        if (txt === '' && dist(this.player.x, this.player.y, pcx, pcy) < Math.max(h.pond.w, h.pond.h) * TILE_PX * 0.62) txt = h.pending.length ? 'E 收取渔获' : 'E 投放鱼';
      }
    } else {
      const tx = Math.floor(this.player.x / TILE_PX), ty = Math.floor(this.player.y / TILE_PX);
      const nd = this.world.nearestNode(tx, ty, 2.6);
      if (nd) txt = '左键/E 打开 ' + this.nodeName(nd.node) + ' 采集面板';
      else {
        const objs = this.world.objectsNear(tx, ty, 2).sort((a, b) => dist(a.tx, a.ty, tx, ty) - dist(b.tx, b.ty, tx, ty));
        const o = objs.find(x => ['chest', 'bench', 'portal', 'npc'].includes(x.o.kind));
        if (o) txt = 'E ' + { chest: '开启宝箱', bench: '使用制作台', portal: '进入家园', npc: '交谈' }[o.o.kind];
      }
    }
    this.interactHint = txt;
  }

  /* ================= 采集 ================= */
  /** 资源点显示名 */
  nodeName(nd) {
    if (nd.skill === 'fish') return '渔点 · ' + ({ plain: '内陆水域', forest: '林间溪流', desert: '绿洲水域', snow: '冰湖', abyss: '深渊暗流', ruin: '星陨湖', waste: '荒原水泊', coast: '近海渔场' }[nd.area] || '淡水');
    const it = ITEMS[nd.itemId];
    if (!it) return '资源点';
    // 矿石统一叫「××矿脉」，煤炭/宝石等非「矿石」结尾的词也按同一规则补后缀
    if (nd.skill === 'mine') return (it.id === 4005 ? '煤矿脉' : it.name.replace(/矿石$/, '') + '矿脉');
    const suffix = { log: '林场', herb: '', bug: '虫巢' }[nd.skill] || '';
    return it.name + suffix;
  }
  hasTool(skill) {
    const p = this.player, toolId = TOOL_OF[skill];
    return p.countItem(toolId) > 0 || p.countItem({ mine: 5002, log: 5012, herb: 5022, fish: 5032 }[skill] || 0) > 0;
  }
  /** 单次采集耗时（秒） */
  gatherTime(nd) {
    const p = this.player, skill = nd.skill;
    const toolId = TOOL_OF[skill];
    const hasTool = this.hasTool(skill);
    const toolDef = ITEMS[toolId];
    const base = { mine: 3.0, log: 2.2, herb: 2.0, bug: 2.5, fish: 6.0 }[skill];
    const life = p.life[skill];
    const own = (p.stats.gatherSpeed || 0) + (({ mine: 11, log: 12, herb: 13, fish: 14 }[skill]) ? p.talentLevel({ mine: 11, log: 12, herb: 13, fish: 14 }[skill]) * 5 : 0) + (p.stats.fishSpeed || 0);
    return Math.max(0.6, base / (1 + life.lv * 0.01 + (hasTool ? toolDef.toolSpeed * 0.4 : 0) + own / 100));
  }
  /** 渔点可产出的鱼名单 */
  fishPool(nd) {
    const all = Object.values(ITEMS).filter(i => i.type === 'mat' && i.sub === 'fish');
    const area = nd && nd.area;
    const list = all.filter(i => !area || i.region === area);
    return list.length ? list : all;
  }
  /** 鼠标位置下的资源点（含微小吸附半径） */
  nodeUnderMouse() {
    if (this.inHome) return null;
    const list = this.world.objectsNear(Math.floor(this.mouse.worldX / TILE_PX), Math.floor(this.mouse.worldY / TILE_PX), 1);
    let best = null, bd = 26;
    for (const it of list) {
      if (!it.o.node) continue;
      const cx = it.tx * TILE_PX + 16, cy = it.ty * TILE_PX + 16;
      const d = dist(this.mouse.worldX, this.mouse.worldY, cx, cy);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  /** 左键点击：命中资源点则打开采集面板 */
  clickNode() {
    const it = this.nodeUnderMouse();
    if (!it) return false;
    const p = this.player;
    const d = dist(p.x, p.y, it.tx * TILE_PX + 16, it.ty * TILE_PX + 16);
    if (d > 4.2 * TILE_PX) { UI.toast('距离太远，靠近后再点击资源点', '#ff9a9a'); return true; }
    UI.openNode(it.o.node);
    return true;
  }
  /** 鼠标悬停：更新资源点悬浮信息 */
  updateHoverNode() {
    if (!this.mouse.overCanvas) { if (this.hover) { this.hover = null; UI.tipHide('node'); } return; }
    const it = this.nodeUnderMouse();
    const nd = it ? it.o.node : null;
    this.hover = nd;
    if (nd) UI.tipNode(nd, this.mouse.cx, this.mouse.cy);
    else UI.tipHide('node');
  }

  /* ---------- 手动单次采集（进度条） ---------- */
  startGather(nd) {
    if (this.gather) return;
    const node = nd.node || nd;
    this.gather = { node: node, t: 0, total: this.gatherTime(node), skill: node.skill, hasTool: this.hasTool(node.skill) };
    $('progWrap').classList.remove('hide');
  }
  updateGather(dt) {
    const g = this.gather;
    if (!g) return;
    const nd = g.node, p = this.player;
    if (nd.amount <= 0) { this.gather = null; $('progWrap').classList.add('hide'); return; }
    const dd = dist(p.x, p.y, nd.tx * TILE_PX + 16, nd.ty * TILE_PX + 16);
    if (dd > 3.2 * TILE_PX) { this.gather = null; $('progWrap').classList.add('hide'); return; }
    g.t += dt;
    $('progFill').style.width = clamp(g.t / g.total * 100, 0, 100) + '%';
    $('progTxt').textContent = ({ mine: '采矿中', log: '伐木中', herb: '采药中', bug: '捕虫中', fish: '钓鱼中' })[g.skill] + ' ' + (g.t / g.total * 100).toFixed(0) + '%';
    if (g.t < g.total) return;
    $('progWrap').classList.add('hide');
    this.gather = null;
    this.finishGather(g, nd);
  }

  /* ---------- 批量 / 定时 / 无限循环采集 ---------- */
  ensureTask(nd) {
    if (this.task && this.task.nd !== nd) this.stopTask('已切换到新的资源点');
    if (!this.task) {
      const per = Math.min(0.6, this.gatherTime(nd));
      this.task = { nd: nd, per: per, timer: 0, remain: 0, endTime: 0, infinite: false, done: 0, startedAt: Date.now() };
    }
    this.task.startedAt = this.task.startedAt || Date.now();
    return this.task;
  }
  /** 增加采集次数 */
  queueGather(nd, n) {
    const p = this.player;
    if (p.life[nd.skill].lv < (nd.req || 1)) {
      UI.toast(SKILL_CN[nd.skill] + '等级不足（需 Lv.' + (nd.req || 1) + '）', '#ff9a9a'); return;
    }
    const t = this.ensureTask(nd);
    if (t.remain === Infinity && !t.endTime) { UI.toast('已在无限循环中', '#ffd76a'); return; }
    if (t.remain === Infinity) t.remain = 0;      // 限时模式 → 追加次数
    t.remain += Math.max(1, Math.floor(n));
    UI.toast('已加入 ' + n + ' 次采集任务', '#9fd06a');
    UI.refreshNode();
  }
  /** 增加采集时间（秒） */
  queueTime(nd, sec) {
    const p = this.player;
    if (p.life[nd.skill].lv < (nd.req || 1)) {
      UI.toast(SKILL_CN[nd.skill] + '等级不足（需 Lv.' + (nd.req || 1) + '）', '#ff9a9a'); return;
    }
    const t = this.ensureTask(nd);
    const now = Date.now();
    t.endTime = Math.max(t.endTime || now, now) + sec * 1000;
    if (!t.infinite && t.remain !== Infinity) t.remain = Infinity; // 限时模式：次数不限
    UI.toast('已设置 ' + Math.round(sec / 60) + ' 分钟自动采集', '#9fd06a');
    UI.refreshNode();
  }
  /** 无限循环开关 */
  toggleInfinite(nd) {
    const t = this.ensureTask(nd);
    t.infinite = !t.infinite;
    if (t.infinite) { t.remain = Infinity; t.endTime = 0; }
    else {
      t.remain = 0; t.endTime = 0;
      UI.toast('已关闭无限循环，当前批次完成后停止', '#ffdf94');
    }
    UI.refreshNode();
  }
  stopTask(reason) {
    if (!this.task) return;
    const t = this.task;
    this.task = null;
    UI.toast((reason || '自动采集结束') + '　共采集 ' + t.done + ' 次', '#9fd06a');
    UI.refreshNode();
  }
  updateTask(dt) {
    const t = this.task;
    if (!t) return;
    const nd = t.nd, p = this.player;
    // 超出距离 → 中断
    if (dist(p.x, p.y, nd.tx * TILE_PX + 16, nd.ty * TILE_PX + 16) > 4.2 * TILE_PX) {
      return this.stopTask('离开资源点');
    }
    if (p.life[nd.skill].lv < (nd.req || 1)) return this.stopTask(SKILL_CN[nd.skill] + '等级不足');
    if (t.endTime && Date.now() >= t.endTime) return this.stopTask('定时采集完成');
    if (!t.infinite && t.remain <= 0 && !t.endTime) return this.stopTask('批次采集完成');
    // 资源点采空 → 自动补充（自动采集期间视为持续产出）
    if (nd.amount <= 0 && nd.skill !== 'fish') {
      nd.amount = nd.max; nd.respawnAt = 0;
      const ch = this.world.chunks.get((nd.tx >> 4) + ',' + (nd.ty >> 4));
      if (ch) ch.canvas = null;
    }
    if (!p.bag.some(s => !s)) return this.stopTask('背包已满');
    t.per = Math.min(0.6, this.gatherTime(nd));
    t.timer += dt;
    if (t.timer < t.per) return;
    t.timer = 0;
    nd._quiet = true;
    this.finishGather({ skill: nd.skill, node: nd, hasTool: this.hasTool(nd.skill), quiet: true }, nd);
    t.done++;
    if (!t.infinite && t.remain !== Infinity) t.remain--;
    UI.refreshNode();
  }
  finishGather(g, nd) {
    const p = this.player, skill = g.skill;
    if (skill === 'fish') return this.finishFishing(nd);
    if (p.life[skill].lv < nd.req) {
      UI.toast(SKILL_CN[skill] + '等级不足（需 Lv.' + nd.req + '）', '#ff9a9a'); return;
    }
    this.world.takeNode(nd, 1);
    this.fx.push({ x: nd.tx * TILE_PX + 16, y: nd.ty * TILE_PX + 16, r: 40, ttl: .3, color: '#cfe8b8', type: 'circle' });
    let n = 1;
    if (chance(0.05 + p.stats.gatherPct / 200)) n++;
    if (chance(p.stats.doubleGather / 100)) { n *= 2; if (!g.quiet) UI.toast('双倍产出！', '#9fd06a'); }
    const qRoll = rollQuality(nd.rare ? 'gather_rare' : 'gather', 1, Math.floor(p.stats.rareFind / 20));
    const qv = clamp(qRoll + Math.floor(p.stats.gatherPct / 40), 1, 10);
    const left = p.addItem(nd.itemId, n, qv);
    if (left) UI.toast('背包已满', '#ff9a9a');
    if (!g.quiet) UI.log('采集获得 ' + ITEMS[nd.itemId].name + ' ×' + (n - left), '#9fd06a');
    p.addLifeExp(skill, Math.round(3 + nd.req * 0.4));
    p.stat.gathers++;
    // 生活技能统计：次数 + 采集总产值
    const ls = p.life[skill];
    ls.cnt = (ls.cnt || 0) + 1;
    ls.val = (ls.val || 0) + itemPrice({ id: nd.itemId, q: qv }) * (n - left);
    p.addExp(Math.round(p.life[skill].lv * 2 + 4), this);
    Ach.check(this);
  }
  finishFishing(nd) {
    const p = this.player;
    const pool = Object.values(ITEMS).filter(i => i.type === 'mat' && i.sub === 'fish' && (!nd.area || i.region === nd.area));
    const list = pool.length ? pool : Object.values(ITEMS).filter(i => i.sub === 'fish');
    const f = weightedPick(list, i => Math.max(1, 12 - i.qbase * 1.4));
    const q = rollFishQuality(f);
    const left = p.addItem(f.id, 1, q);
    if (left) UI.toast('背包已满', '#ff9a9a');
    else if (!nd._quiet) {
      UI.toast('钓到 ' + getQuality(q).name + f.name + '！', '#9fe8ff');
      UI.log('钓鱼获得 ' + getQuality(q).name + '的' + f.name, '#9fe8ff');
    }
    const fs = p.life.fish;
    fs.cnt = (fs.cnt || 0) + 1;
    fs.val = (fs.val || 0) + itemPrice({ id: f.id, q: q }) * (1 - left);
    if (q > (fs.best || 0)) { fs.best = q; fs.bestName = f.name; }
    p.stat.fish++;
    p.addLifeExp('fish', 6 + f.qbase * 3);
    p.addExp(Math.round(10 + f.qbase * 8), this);
    Ach.check(this);
  }

  /* ================= 制作 / 强化 ================= */
  craftRecipe(r, times) {
    const p = this.player;
    let done = 0, fail = 0;
    for (let i = 0; i < times; i++) {
      if (p.life[r.skill].lv < r.req) break;
      // 材料检查
      let ok = true, consume = [];
      for (const m of r.mats) {
        const have = p.countItem(m.id);
        if (have < m.n) { ok = false; break; }
        consume.push({ id: m.id, n: m.n });
      }
      if (!ok) { UI.toast('材料不足', '#ff9a9a'); break; }
      const saveRoll = chance(p.stats.matSave / 100);
      if (!saveRoll) consume.forEach(c => p.removeItem(c.id, c.n));
      const bonus = p.stats.craftRate + Math.min(20, p.life[r.skill].lv * 0.2);
      const rate = clamp(r.rate + bonus / 100, 0.05, 1);
      if (Math.random() <= rate) {
        done++;
        const critC = clamp((p.stats.craftCrit || 0) / 100, 0, 0.6);
        const crit = Math.random() < critC;
        let outQ = 0, outName = '';
        if (r.out.gear) {
          let q = rollQuality('craft', 2) + (p.stats.gearQuality || 0) + (crit ? 1 : 0);
          const g = newGear(r.out.gear, r.out.lv, clamp(q, 2, 10), 0);
          if (!p.addInstance(g)) UI.toast('背包已满', '#ff9a9a');
          else UI.log('锻造出 ' + gearTitle(g), getQuality(g.q).color);
          outQ = g.q; outName = getQuality(g.q).name + ITEMS[r.out.gear].name;
        } else {
          const n2 = r.out.n * (crit ? 2 : 1);
          const qq = clamp((r.out.q || 2) + (crit ? 1 : 0), 1, 10);
          const left = p.addItem(r.out.item, n2, qq);
          if (left && left === n2) UI.toast('背包已满', '#ff9a9a');
          else UI.log('制作 ' + ITEMS[r.out.item].name + ' ×' + (n2 - left), '#cfe86a');
          outQ = qq; outName = getQuality(qq).name + ITEMS[r.out.item].name;
        }
        // 生活技能统计：制作次数 + 最高品质
        const cs = p.life[r.skill];
        cs.cnt = (cs.cnt || 0) + 1;
        if (outQ > (cs.best || 0)) { cs.best = outQ; cs.bestName = outName; }
        p.addLifeExp(r.skill, Math.round(r.req * 1.2 + 4));
        p.stat.crafts++;
      } else {
        fail++;
        UI.log('制作失败，材料损失', '#ff9a9a');
      }
    }
    if (times > 1) UI.toast('制作完成：成功 ' + done + ' / 失败 ' + fail, '#ffd76a');
    UI.refreshBag(); UI.refreshCraft && UI.refreshCraft();
    Ach.check(this);
    return done;
  }
  enhance(it, rate, stoneId, stoneN, cost) {
    const p = this.player;
    if (it.enhance >= getQuality(it.q).enhCap) { UI.toast('已达强化上限', '#ff9a9a'); return; }
    if (p.countItem(stoneId) < stoneN) { UI.toast('强化石不足', '#ff9a9a'); return; }
    if (p.gold < cost) { UI.toast('金币不足', '#ff9a9a'); return; }
    p.removeItem(stoneId, stoneN); p.gold -= cost;
    if (chance(rate / 100)) {
      it.enhance++; p.recompute();
      UI.toast('强化成功 +' + it.enhance + '！', '#7fdba4');
      this.fx.push({ x: p.x, y: p.y, r: 60, ttl: .4, color: '#ffd76a', type: 'circle' });
    } else {
      if (it.enhance >= 11) {
        it.enhance = Math.max(0, it.enhance - 2);
        if (!it.protected && chance(0.05)) {
          it.destroyed = true;
          UI.toast('装备损坏！', '#ff3a5a');
        }
      } else if (it.enhance >= 6) it.enhance = Math.max(0, it.enhance - 1);
      UI.toast('强化失败…', '#ff9a9a');
    }
    it.protected = false;
    p.recompute(); UI.refreshCraft && UI.refreshCraft(); UI.refreshBag && UI.refreshBag();
  }
  useProtectStone(it) {
    const p = this.player;
    if (!p.countItem(4318)) return;
    p.removeItem(4318, 1); it.protected = true;
    UI.toast('已附加保护石', '#9fe8ff');
  }

  /* ================= 战斗回调 ================= */
  onMonsterDeath(m, killer) {
    const p = this.player;
    const lvd = m.lv - p.lv;
    let mul = 1;
    if (lvd >= 0) mul = 1; else if (lvd >= -3) mul = 0.7; else if (lvd >= -6) mul = 0.4; else if (lvd >= -9) mul = 0.15; else mul = 0.02;
    const exp = Math.round(m.data.exp * mul);
    p.addExp(exp, this);
    const gold = p.addGold(m.data.gold * mul);
    this.floatText(m, '+' + exp + ' EXP', '#ffd76a');
    this.floatTextAt(m.x, m.y - 20, '+' + fmt(gold) + ' 金', '#ffdf94');
    p.stat.kills++;
    if (m.data.tier === 'boss') p.stat.boss++;
    const tier = m.data.tier, src = m.data.dropSource;
    const reg = regionAtTile(Math.floor(m.x / TILE_PX), Math.floor(m.y / TILE_PX));
    // 掉落：装备
    const bonus = Math.floor(p.stats.dropPct / 25);
    const gearChance = tier === 'boss' ? 1 : tier === 'elite' ? 0.55 : 0.14;
    const isPerfect = (tier !== 'normal');
    p.pity = (p.pity || 0) + 1;
    let minQ = tier === 'boss' ? 5 : tier === 'elite' ? 3 : 1;
    if (p.pity >= 50 && tier === 'normal') { minQ = 4; }
    if (Math.random() < gearChance || (p.pity >= 50 && tier === 'normal')) {
      const g = rollEquipDrop(m.lv, src);
      const g2 = newGear(ITEMS[g.id].id, m.lv, Math.max(minQ, g.q + bonus), 0);
      if (p.addInstance(g2)) {
        UI.log('获得 ' + gearTitle(g2), getQuality(g2.q).color);
        this.floatTextAt(m.x, m.y - 40, gearFullName(g2), getQuality(g2.q).color);
        if (Math.max(minQ, g2.q) >= 4) p.pity = 0;
      } else UI.toast('背包已满！', '#ff9a9a');
    }
    // 材料
    const pool = reg.res;
    if (chance(tier === 'normal' ? 0.5 : 0.9)) {
      const key = choice(['ore', 'wood', 'herb', 'bug']);
      const e = weightedPick(pool[key], 'w');
      const left = p.addItem(e.id, irnd(1, tier === 'normal' ? 2 : 4), rollQuality(ndSrc(src), 1, bonus));
      if (!left) UI.log('获得材料 ' + ITEMS[e.id].name, '#9fd06a');
    }
    // 部位取材（表单来决定能否出肉/皮/骨，保证生活系材料有稳定来源）
    const parts = MOB_PARTS[m.data.tpl.shape];
    if (parts) {
      const mul = tier === 'normal' ? 0.7 : tier === 'elite' ? 1 : 1.4;
      for (const d of parts) {
        if (chance(d.p * mul)) p.addItem(d.id, 1, rollQuality(ndSrc(src), 1, bonus));
      }
    }
    // 模板专属掉落：普通 / 精英 / BOSS 按阶层概率缩放
    const tMul = DROP_TIER_MUL[tier] || 0.35;
    for (const d of (m.data.tpl.drop || [])) {
      if (chance(d.p * tMul)) {
        p.addItem(d.id, 1, rollQuality(src, tier === 'normal' ? 1 : 3));
        UI.log('猎获 ' + ITEMS[d.id].name, '#9fd06a');
      }
    }
    // 随身杂物（盐 / 清水 / 药剂…）
    if (chance(tier === 'normal' ? 0.12 : 0.3)) {
      const sp = weightedPick(MOB_SUPPLY, 'p');
      p.addItem(sp.id, irnd(1, 2), 2);
    }
    // Boss 专属材料 100%
    if (tier === 'boss' || tier === 'world') {
      p.addItem(4316, irnd(2, 5), 2);
    }
    // 消耗品
    if (chance(0.22)) {
      const cid = choice([3001, 3001, 3003, 3010, 3009]);
      p.addItem(cid, irnd(1, 3), 2);
    }
    Ach.check(this);
  }
  onPlayerDeath() {
    const p = this.player;
    p.stat.deaths++;
    UI.toast('你倒下了…', '#ff3a5a');
    UI.log('你在战斗中倒下，正在星落村复苏…', '#ff9a9a');
    setTimeout(() => {
      if (!this.inHome) {
        const lostGold = Math.round(p.gold * 0.05); p.gold -= lostGold;
        if (lostGold > 0) UI.log('损失金币 ' + fmt(lostGold), '#ff9a9a');
      }
      p.hp = Math.max(1, Math.round(p.maxHp * 0.4));
      p.mp = Math.max(1, Math.round(p.maxMp * 0.4));
      p.dead = false;
      p.buffs.clearDebuffs(2);
      this.monsters.forEach(m => { if (!m.dead && dist(m.x, m.y, p.x, p.y) < 30 * TILE_PX) { m.state = 'return'; } });
    }, 2200);
  }
  travelTo(r) {
    const cx = Math.floor((r.x0 + r.x1) / 2), cy = Math.floor((r.y0 + r.y1) / 2);
    let tx = cx, ty = cy;
    // 传送到营地旁的安全格
    for (let i = 0; i < 40; i++) {
      const spot = this.world.randomFreeTile(cx, cy, 10, 1);
      if (spot) { tx = spot.x; ty = spot.y; break; }
    }
    this.player.x = tx * TILE_PX + 16; this.player.y = ty * TILE_PX + 16;
    this.player.unlockedRegions[r.key] = 1;
    this.inHome = false;
    const _z = this.cam.zoom || 1;
    this.cam.x = this.player.x - this.cam.w / _z / 2; this.cam.y = this.player.y - this.cam.h / _z / 2;
    this.clampCam();
    this.monsters.length = 0;
    UI.toast('抵达 ' + r.name, '#9fe8ff');
    UI.log('抵达 ' + r.name + '：' + r.desc, '#9fe8ff');
    Ach.check(this);
  }
  teleportTo(x, y) { this.player.x = x; this.player.y = y; this.inHome = false; }

  /* ================= 视野缩放 ================= */
  /** 可视世界范围（世界像素），随缩放变化 */
  camView() {
    const z = this.cam.zoom || 1;
    return { x: this.cam.x, y: this.cam.y, w: this.cam.w / z, h: this.cam.h / z, zoom: z };
  }
  /** 边界收敛：缩放后可视范围变化，需按新的可视宽高重新夹取 */
  clampCam() {
    const z = this.cam.zoom || 1, vw = this.cam.w / z, vh = this.cam.h / z;
    if (this.inHome) {
      this.cam.x = clamp(this.cam.x, -32, HOME_SIZE * TILE_PX - vw + 32);
      this.cam.y = clamp(this.cam.y, -32, HOME_SIZE * TILE_PX - vh + 32);
      return;
    }
    this.cam.x = clamp(this.cam.x, 0, Math.max(0, WORLD_SIZE * TILE_PX - vw));
    this.cam.y = clamp(this.cam.y, 0, Math.max(0, WORLD_SIZE * TILE_PX - vh));
  }
  /** 设置缩放：以屏幕锚点为中心缩放（默认屏幕中心 = 主角），并写入存档 */
  setZoom(z, ax, ay) {
    const cam = this.cam, old = cam.zoom || 1;
    const nz = clamp(+z || 1, 0.5, 2.5);
    if (Math.abs(nz - old) < 0.002) return old;
    const sx = (ax === undefined ? cam.w / 2 : ax), sy = (ay === undefined ? cam.h / 2 : ay);
    const wx = cam.x + sx / old, wy = cam.y + sy / old;      // 锚点对应的世界坐标保持不变
    cam.zoom = nz;
    cam.x = wx - sx / nz; cam.y = wy - sy / nz;
    this.clampCam();
    if (typeof Settings !== 'undefined' && Settings.data) { Settings.data.zoom = nz; Settings.save(); }
    return nz;
  }

  /* ================= 工具 ================= */
  floatText(ent, text, color, big) { this.floats.push({ x: ent.x + rnd(-8, 8), y: ent.y - ent.maxHp * 0 - 40, text: text, color: color, t: big ? 1.4 : 1.0, big: big }); }
  floatTextAt(x, y, text, color) { this.floats.push({ x: x, y: y, text: text, color: color, t: 1.0 }); }
  toast(t, c) { UI.toast(t, c); }
  log(t, c) { UI.log(t, c); }

  /* ================= 渲染 ================= */
  render(dt) {
    const ctx = this.ctx, cam = this.cam;
    const z = cam.zoom || 1;
    const view = this.camView();                  // 剔除用可视世界范围（已含缩放）
    this._sun = this.sun();                       // 本帧太阳方位（阴影与光照共用）
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, cam.w, cam.h);
    ctx.save();
    ctx.scale(z, z);                              // 瓦片地图随缩放一起放大 / 缩小
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    if (this.inHome) this.home.draw(ctx, view);
    else this.world.draw(ctx, view);
    if (typeof Weather !== 'undefined') Weather.drawGround(ctx, this);   // 云影 / 积雪 / 湿滑地面（世界层）
    this.drawObjectShadows(ctx);                  // 太阳投影：树 / 石 / 矿 / 草
    this.drawFx(ctx);
    // 鼠标悬停的资源点高亮
    if (this.hover) {
      const nd = this.hover;
      ctx.strokeStyle = nd.qColor || 'rgba(255,215,106,.85)'; ctx.lineWidth = 2;   // 高亮圈跟随资源等级色
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(nd.tx * TILE_PX + 16, nd.ty * TILE_PX + 16, 20, 0, 6.28); ctx.stroke();
      ctx.setLineDash([]);
      const tasking = this.task && this.task.nd === nd;
      if (tasking) {
        ctx.strokeStyle = 'rgba(159,208,106,.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(nd.tx * TILE_PX + 16, nd.ty * TILE_PX + 16, 26, 0, 6.28 * (Date.now() % 1000) / 1000); ctx.stroke();
      }
    }
    // 实体
    const drawables = [];
    if (!this.inHome) for (const m of this.monsters) drawables.push(m);
    drawables.push(this.player);
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) {
      if (d === this.player) this.drawPlayer(ctx, d);
      else if (!this.inHome) this.drawMonster(ctx, d);
    }
    // 自动导航目标
    if (this.route) {
      const gx = this.route.tx * TILE_PX + 16, gy = this.route.ty * TILE_PX + 16;
      const rr = 20 + Math.sin(this.timeSec * 4) * 3;
      ctx.strokeStyle = '#ff54e0'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(gx, gy, rr, 0, 6.28); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '12px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      const dg = Math.round(dist(this.player.x, this.player.y, gx, gy) / TILE_PX);
      const label = (this.route.name ? this.route.name + ' ' : '目标 ') + dg + ' 格';
      ctx.fillText(label, gx + 1, gy - 27);
      ctx.fillStyle = '#ff9ae8';
      ctx.fillText(label, gx, gy - 28);
      ctx.textAlign = 'left';
    }
    this.drawFloats(ctx);
    ctx.restore();
    this.drawAmbient(ctx);             // 环境粒子（屏幕空间，落在角色之前）
    this.drawAtmosphere(ctx);          // 远景雾化 + 昼夜光照（屏幕空间叠加）
    if (typeof Weather !== 'undefined') Weather.drawSky(ctx, this);   // 雨丝 / 雪花 / 阵风 / 闪电（最上层）
    this.drawVignette(ctx);
    if (!this.inHome) this.drawMinimap();
    if (this.interactHint) {
      ctx.font = '14px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
      const py = (this.player.y - cam.y) * z;     // 世界 → 屏幕（含缩放）
      const y = py - 60;
      ctx.fillStyle = 'rgba(8,12,24,.8)';
      const wpx = ctx.measureText(this.interactHint).width + 20;
      ctx.fillRect(cam.w / 2 - wpx / 2, py - 78, wpx, 22);
      ctx.fillStyle = '#ffd76a';
      ctx.fillText(this.interactHint, cam.w / 2, y - 62);
      ctx.textAlign = 'left';
    }
  }
  /* ---------- 太阳光照：方位 + 动态投影 ----------
   * sun.x：-1 日出（光从左侧来）→ 0 正午（头顶）→ +1 日落（光从右侧来）
   * sun.light：太阳高度（0 = 地平线 / 夜间，1 = 头顶）；影子早晚长、正午短、夜间只剩淡淡环境影 */
  sun() {
    const DAY = 480;
    const ph = ((this.timeSec % DAY) + DAY) % DAY / DAY;
    const ang = (ph - 0.25) * Math.PI * 2;
    const sx = Math.sin(ang), elev = Math.cos(ang);
    return { ph: ph, x: sx, elev: elev, light: clamp(elev, 0, 1) };
  }
  /** 在地面画一个随太阳方位偏移、随高度伸缩的影子 */
  drawShadow(ctx, wx, wy, rx, ry) {
    const s = this._sun || (this._sun = this.sun());
    const len = (rx * 0.85 + 10) * (1.55 - s.light);            // 太阳越低，影子拉得越长
    const ox = -s.x * len, oy = 6 + (1 - s.light) * 3;
    const a = 0.12 + 0.26 * s.light;                            // 夜间保留极淡的环境影，避免角色悬空
    ctx.save();
    ctx.globalAlpha = a; ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(wx + ox, wy + oy, rx * (1 + (1 - s.light) * 0.75), ry, 0, 0, 6.28);
    ctx.fill();
    ctx.restore();
  }
  /** 场景物件投影：树 / 石 / 矿 / 草 / 渔点随太阳投出同一方向的影子（限量，低端机也不掉帧） */
  drawObjectShadows(ctx) {
    const s = this._sun; if (!s || this.inHome) return;
    const v = this.camView(), w = this.world;
    if (!w || !w.chunks) return;
    const CP = CHUNK * TILE_PX;
    const c0 = Math.floor(v.x / CP) - 1, c1 = Math.floor((v.x + v.w) / CP) + 1;
    const r0 = Math.floor(v.y / CP) - 1, r1 = Math.floor((v.y + v.h) / CP) + 1;
    const cap = (typeof Mobile !== 'undefined' && Mobile.on) ? 90 : 200;
    let n = 0;
    for (let cy = r0; cy <= r1 && n < cap; cy++) {
      for (let cx = c0; cx <= c1 && n < cap; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= WORLD_SIZE || cy * CHUNK >= WORLD_SIZE) continue;
        const ch = w.getChunk(cx, cy);
        if (!ch || !ch.objs) continue;
        for (const ob of ch.objs) {
          if (n >= cap) break;
          if (ob.node && ob.node.amount <= 0) continue;
          if (ob.kind === 'chest' && ob.opened) continue;
          if (ob.kind === 'fish') continue;                     // 水面上的渔点不投影
          const wx = (cx * CHUNK + ob.lx) * TILE_PX + 16 + (ob.ox || 0);
          const wy = (cy * CHUNK + ob.ly) * TILE_PX + TILE_PX - 2 + (ob.oy || 0);
          if (wx < v.x - 48 || wx > v.x + v.w + 48 || wy < v.y - 48 || wy > v.y + v.h + 48) continue;
          this.drawShadow(ctx, wx, wy, ob.kind === 'tree' ? 14 : 11, ob.kind === 'tree' ? 5 : 4);
          n++;
        }
      }
    }
  }

  /* ---------- 大气层：远景雾化 + 昼夜光照 ----------
   * 一轮昼夜 8 分钟：0 清晨 / .25 正午 / .52 黄昏 / .75 夜晚
   * 夜间玩家自带暖光（提灯），雾色取自当前大区的 pal.fog */
  drawAtmosphere(ctx) {
    if (this.inHome) return;                       // 家园室内保持明亮
    const cam = this.cam, w = cam.w, h = cam.h;
    const DAY = 480;
    const ph = ((this.timeSec % DAY) + DAY) % DAY / DAY;
    const night = clamp(1 - Math.abs(ph - 0.75) / 0.22, 0, 1);
    const dusk = clamp(1 - Math.abs(ph - 0.52) / 0.16, 0, 1);
    const dawn = clamp(1 - Math.min(Math.abs(ph - 0.02), Math.abs(ph - 0.98)) / 0.10, 0, 1);
    /* 时段切换提示（中英）：黎明 / 白昼 / 黄昏 / 夜晚 */
    let phase = 'day';
    if (night > 0.5) phase = 'night'; else if (dusk > 0.5) phase = 'dusk'; else if (dawn > 0.5) phase = 'dawn';
    if (this._dayPhase && this._dayPhase !== phase && typeof UI !== 'undefined' && UI.toast) {
      UI.toast({ dawn: '黎明 · Dawn', day: '天亮了 · Daytime', dusk: '黄昏 · Dusk', night: '入夜了 · Night' }[phase],
        phase === 'night' ? '#8fa8ff' : '#ffd76a');
    }
    this._dayPhase = phase;
    if (night > 0.01) { ctx.fillStyle = 'rgba(26,34,78,' + (night * 0.30).toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); }
    if (dusk > 0.01) { ctx.fillStyle = 'rgba(255,146,70,' + (dusk * 0.13).toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); }
    if (dawn > 0.01) { ctx.fillStyle = 'rgba(255,190,140,' + (dawn * 0.10).toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); }
    if (night > 0.05) {                            // 提灯暖光
      const z = this.cam.zoom || 1;
      const sx = (this.player.x - cam.x) * z, sy = (this.player.y - cam.y) * z;
      const g = ctx.createRadialGradient(sx, sy, 20, sx, sy, 250);
      g.addColorStop(0, 'rgba(255,200,120,' + (night * 0.20).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    /* 太阳方向光：从太阳所在一侧洒下的暖光，正午最盛、黄昏偏橙、夜间消失 */
    const s = this._sun || (this._sun = this.sun());
    if (s.light > 0.04 && night < 0.7) {
      const warm = dusk > 0.3 ? '255,170,90' : '255,222,158';
      const g3 = ctx.createLinearGradient(s.x >= 0 ? w : 0, 0, s.x >= 0 ? 0 : w, h * 0.65);
      g3.addColorStop(0, 'rgba(' + warm + ',' + (0.13 * s.light).toFixed(3) + ')');
      g3.addColorStop(1, 'rgba(' + warm + ',0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g3; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    const r = regionAtTile(Math.floor(this.player.x / TILE_PX), Math.floor(this.player.y / TILE_PX));
    const fog = (r && r.pal && r.pal.fog) || '#9fb4c8';
    const key = w + 'x' + h + '|' + fog;
    if (this._fogKey !== key) {                    // 渐变缓存：尺寸或雾色变化才重建
      const g2 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.80);
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(1, fog);
      this._fogKey = key; this._fogGrad = g2;
    }
    /* 天气能见度：雨/雪/雷暴时雾更重，视野变差 */
    const wvis = (typeof Weather !== 'undefined' && Weather.visMul) ? Weather.visMul() : 1;
    ctx.save();
    ctx.globalAlpha = clamp(0.16 + night * 0.06 + (1 - wvis) * 0.62, 0, 0.62);
    ctx.fillStyle = this._fogGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  /* ---------- 环境粒子：雪 / 沙 / 落叶 / 萤火 / 花瓣（按大区自动切换） ---------- */
  ambientKind() {
    const r = regionAtTile(Math.floor(this.player.x / TILE_PX), Math.floor(this.player.y / TILE_PX));
    switch (r && r.key) {
      case 'snow': return 'snow';
      case 'desert': case 'waste': return 'sand';
      case 'forest': return 'leaf';
      case 'abyss': case 'ruin': return 'spark';
      case 'sea': return 'spray';
      default: return 'petal';
    }
  }
  updateAmbient(dt) {
    if (this.inHome) return;
    const p = this.player, cam = this.cam;
    const z = cam.zoom || 1, vw = cam.w / z, vh = cam.h / z;   // 可视世界范围（粒子按世界坐标飘动）
    const kind = this.ambientKind();
    if (this._ambKind !== kind) { this._ambKind = kind; this.ambient = []; }
    if (!this.ambient) this.ambient = [];
    const wmul = (typeof Weather !== 'undefined' && Weather.ambientMul) ? Weather.ambientMul() : 1;
    const want = Math.round(((typeof Mobile !== 'undefined' && Mobile.on) ? 38 : 64) * wmul);
    const r = regionAtTile(Math.floor(p.x / TILE_PX), Math.floor(p.y / TILE_PX));
    const pal = (r && r.pal) || null;
    while (this.ambient.length < want) {
      this.ambient.push({
        x: cam.x + rnd(0, vw), y: cam.y + rnd(0, vh),
        vx: rnd(-10, 10), vy: 0, s: rnd(1, 2.6), ph: rnd(0, 6.28)
      });
    }
    const cfg = {
      snow: { vy: 26, col: '#ffffff', a: .75, sway: 14 },
      sand: { vy: 8, col: '#e8c98a', a: .45, sway: 46 },
      leaf: { vy: 22, col: (pal && pal.tree && pal.tree.leaf) || '#6fa04a', a: .60, sway: 20 },
      spark: { vy: -8, col: (pal && pal.flower && pal.flower[0]) || '#a45cff', a: .55, sway: 10 },
      spray: { vy: -14, col: '#dff2ff', a: .40, sway: 18 },
      petal: { vy: 18, col: (pal && pal.flower && pal.flower[0]) || '#ffc0d8', a: .55, sway: 16 }
    }[kind];
    for (const q of this.ambient) {
      q.ph += dt * 1.7;
      q.y += cfg.vy * dt;
      q.x += (cfg.vx || 0) * dt + Math.sin(q.ph) * cfg.sway * dt;
      /* 飘出视野就绕回另一侧，保持恒定密度（视野随缩放变化，用可视世界范围判断） */
      if (q.y > cam.y + vh + 8) { q.y = cam.y - 8; q.x = cam.x + rnd(0, vw); }
      if (q.y < cam.y - 8) { q.y = cam.y + vh + 8; q.x = cam.x + rnd(0, vw); }
      if (q.x > cam.x + vw + 8) q.x = cam.x - 8;
      if (q.x < cam.x - 8) q.x = cam.x + vw + 8;
    }
    void cfg.vx;
  }
  drawAmbient(ctx) {
    if (this.inHome || !this.ambient || !this.ambient.length) return;
    const cam = this.cam, kind = this.ambientKind();
    const r = regionAtTile(Math.floor(this.player.x / TILE_PX), Math.floor(this.player.y / TILE_PX));
    const pal = (r && r.pal) || null;
    const col = {
      snow: '#ffffff', sand: '#e8c98a', leaf: (pal && pal.tree && pal.tree.leaf) || '#6fa04a',
      spark: (pal && pal.flower && pal.flower[0]) || '#a45cff', spray: '#dff2ff',
      petal: (pal && pal.flower && pal.flower[0]) || '#ffc0d8'
    }[kind];
    const a = { snow: .75, sand: .45, leaf: .60, spark: .55, spray: .40, petal: .55 }[kind] || .5;
    const z = cam.zoom || 1;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col;
    for (const q of this.ambient) {
      const sx = (q.x - cam.x) * z, sy = (q.y - cam.y) * z;   // 世界 → 屏幕
      if (sx < -6 || sy < -6 || sx > cam.w + 6 || sy > cam.h + 6) continue;
      ctx.fillRect(sx, sy, Math.max(1, q.s * z), Math.max(1, q.s * z));
    }
    ctx.restore();
  }

  drawPlayer(ctx, p) {
    const sp = Sprites.player(p.clsKey);
    const frames = sp[p.face] || sp.down;
    const idx = p.moving ? (Math.floor(p.animT * 6) % 4) : 0;
    const cv = frames[idx];
    const cx = Math.round(p.x - sp.w / 2), cy = Math.round(p.y - sp.h + 12);
    // 影子：随太阳方位偏移、随太阳高度伸缩
    this.drawShadow(ctx, p.x, p.y, 12, 5);
    if (p.invulnT > 0) ctx.globalAlpha = 0.55;
    if (p.dead) { ctx.save(); ctx.translate(cx + sp.w / 2, cy + sp.h / 2); ctx.rotate(1.4); ctx.drawImage(cv, -sp.w / 2, -sp.h / 2); ctx.restore(); }
    else ctx.drawImage(cv, cx, cy);
    ctx.globalAlpha = 1;
    // 血条简易
    if (p.hp < p.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - 20, cy - 8, 40, 4);
      ctx.fillStyle = '#3fbf78'; ctx.fillRect(p.x - 20, cy - 8, 40 * (p.hp / p.maxHp), 4);
    }
    // 瞄准指示
    ctx.strokeStyle = 'rgba(255,215,106,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.mouse.worldX, this.mouse.worldY, 6, 0, 6.28); ctx.stroke();
  }
  drawMonster(ctx, m) {
    const frames = m.sprite.frames, size = m.size();
    const f = Math.floor(this.timeSec * 3 + m.x) % 2;
    const cv = frames[f];
    const wpx = 32 * clamp(size, 0.6, 3.2) * 1.4, hpx = wpx;
    const cx = Math.round(m.x - wpx / 2), cy = Math.round(m.y - hpx + 12);
    this.drawShadow(ctx, m.x, m.y, wpx * 0.35, hpx * 0.14);
    if (m.dead) {
      ctx.globalAlpha = clamp(1 - (Date.now() - m.deadT) / 3000, 0, 1);
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(1.5);
      ctx.drawImage(cv, -wpx / 2, -hpx / 2, wpx, hpx); ctx.restore(); ctx.globalAlpha = 1;
      return;
    }
    ctx.drawImage(cv, cx, cy, wpx, hpx);
    // 受击闪红
    if (m.hp < m.maxHp) {
      const w2 = Math.max(28, wpx);
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(m.x - w2 / 2, cy - 8, w2, 5);
      const col = m.data.tier === 'boss' ? '#e2453f' : m.data.tier === 'elite' ? '#ffae4a' : '#68b0ff';
      ctx.fillStyle = col; ctx.fillRect(m.x - w2 / 2, cy - 8, w2 * clamp(m.hp / m.maxHp, 0, 1), 5);
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#cfd8e8'; ctx.fillText('Lv.' + m.lv + ' ' + m.title, m.x, cy - 11);
      ctx.textAlign = 'left';
    }
    if (m === this.targetMonster) {
      ctx.strokeStyle = '#ff6a6a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(m.x, m.y + 4, wpx * 0.4, hpx * 0.18, 0, 0, 6.28); ctx.stroke();
    }
  }
  drawFx(ctx) {
    for (const f of this.fx) {
      const a = clamp(f.ttl / (f.type === 'circle' ? 0.5 : 0.3), 0, 1);
      ctx.globalAlpha = a * 0.8;
      if (f.type === 'circle') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - a * 0.4), 0, 6.28); ctx.stroke();
        ctx.globalAlpha = a * 0.25; ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - a * 0.4), 0, 6.28); ctx.fill();
      } else if (f.type === 'cone') {
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, f.r * (1.1 - a * 0.2), f.ang - f.arc / 2, f.ang + f.arc / 2);
        ctx.closePath(); ctx.fill();
      } else if (f.type === 'beam') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 6 * a + 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  drawFloats(ctx) {
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      ctx.globalAlpha = clamp(f.t, 0, 1);
      ctx.font = (f.big ? 'bold 20px' : '14px') + ' "Georgia",serif';
      ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color || '#fff'; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  drawVignette(ctx) {
    if (!this._vig) {
      const g = ctx.createRadialGradient(this.cam.w / 2, this.cam.h / 2, this.cam.h * 0.35, this.cam.w / 2, this.cam.h / 2, this.cam.h * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
      this._vig = g;
    }
    ctx.fillStyle = this._vig; ctx.fillRect(0, 0, this.cam.w, this.cam.h);
  }
  drawMinimap() {
    const cv = $('mm'), x = cv.getContext('2d');
    if (!this._miniCv) {
      const S = 240, o = CV(S, S), xx = o.x;
      const step = WORLD_SIZE / S;
      for (let py = 0; py < S; py++) {
        for (let px = 0; px < S; px++) {
          const info = this.world.tileInfo(Math.floor(px * step), Math.floor(py * step));
          if (info.water) xx.fillStyle = info.r.pal.water;
          else if (info.mountain) xx.fillStyle = info.r.pal.mountain;
          else xx.fillStyle = info.r.pal.ground[0];
          xx.fillRect(px, py, 1, 1);
        }
      }
      this._miniCv = o.c;
    }
    x.drawImage(this._miniCv, 0, 0, 240, 240);
    const scale = 240 / WORLD_SIZE;
    x.fillStyle = '#ff3a5a'; x.fillRect(this.player.x / TILE_PX * scale - 2, this.player.y / TILE_PX * scale - 2, 5, 5);
    // 站点
    x.fillStyle = '#ffd76a';
    for (const s of this.world.sites) x.fillRect(s.tx * scale - 1, s.ty * scale - 1, 3, 3);
  }

  /* ================= 存档 ================= */
  serialize() {
    return {
      v: 1, player: this.player.serialize(), home: {
        level: this.home.level, plots: this.home.plots.map(p => ({ x: p.x, y: p.y, crop: p.crop, t0: p.t0, growSec: p.growSec, watered: p.watered })),
        fish: this.home.fish, pending: this.home.pending
      },
      ach: Ach.serialize(), pos: { x: this.player.x, y: this.player.y, inHome: this.inHome },
      idle: Idle.serialize(), market: Market.serialize()
    };
  }
  save(show) {
    try {
      localStorage.setItem('starfall_save_v1', JSON.stringify(this.serialize()));
      if (show) UI.toast('已保存', '#7fdba4');
    } catch (e) { console.warn(e); }
  }
  static load(canvas) {
    let raw = null;
    try { raw = localStorage.getItem('starfall_save_v1'); } catch (e) { }
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      const p = Player.deserialize(d.player, null);
      const g = new Game(canvas, p);
      g.home.level = d.home.level; g.home.createPlots();
      (d.home.plots || []).forEach((pl, i) => { if (g.home.plots[i]) Object.assign(g.home.plots[i], pl); });
      g.home.fish = d.home.fish || []; g.home.pending = d.home.pending || [];
      Ach.load(d.ach);
      if (d.pos) {
        p.x = d.pos.x; p.y = d.pos.y;
        g.inHome = !!d.pos.inHome;
        g.homeExit = g.world.homeEntry;
        g.homeExit = { x: g.world.homeEntry.x * TILE_PX, y: g.world.homeEntry.y * TILE_PX };
      }
      const _z = g.cam.zoom || 1;
      g.cam.x = p.x - canvas.width / _z / 2; g.cam.y = p.y - canvas.height / _z / 2;
      g.clampCam();
      // 拍卖行与离线挂机
      Market.load(d.market);
      Idle.load(d.idle);
      if (Idle.running && Idle.startedAt) {
        const away = Math.floor((Date.now() - Idle.startedAt) / 1000);
        if (away >= 60 && Idle.queue.length) {
          const rep = Idle.offline(away);
          Idle.running = true; Idle.startedAt = Date.now();
          if (rep && rep.sec >= 60) setTimeout(() => UI.showIdleReport(rep, away), 900);
        }
      }
      return g;
    } catch (e) { console.warn('存档读取失败', e); return null; }
  }
}
function ndSrc(src) { return src === 'normal' ? 'gather' : src === 'elite' ? 'gather_rare' : 'gather_rare'; }
