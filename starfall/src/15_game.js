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
    this.boat = null;                      // 正在驾驶的船
    this.proj = [];                        // 飞行中的投射物（箭 / 法球 / 怪物弹）
    this.hitStop = 0;                      // 命中顿帧剩余时间（打击感）
    this._board = null; this._disembark = null;   // 上船 / 下船补间动画
    this._wakeT = 0;                       // 航行尾迹计时
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
    /* 设备像素比：此前高 DPI 屏（手机 2~3x / 4K 显示器）只是把低分辨率画布用 CSS 拉大 → 发糊。
     * 这里按 (dpr-1)×0.6 折中补清晰度（全量按物理像素会让移动端填充率爆炸），并做总像素封顶。 */
    const mobile = (typeof Mobile !== 'undefined' && Mobile.on);
    const cap = (typeof Settings !== 'undefined') ? (+Settings.data.dprCap || 2) : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const eff = s < 1 ? 1 : 1 + (dpr - 1) * 0.6;      // 低画质档不再放大：优先帧率
    let pw = Math.round(w * s * eff), ph = Math.round(h * s * eff);
    const capW = mobile ? 1920 : 2560, capH = mobile ? 1080 : 1440;
    const over = Math.max(pw / capW, ph / capH);
    if (over > 1) { pw = Math.round(pw / over); ph = Math.round(ph / over); }
    this.cv.width = Math.max(320, pw);
    this.cv.height = Math.max(240, ph);
    this.cam.w = w; this.cam.h = h;
    this.dprEff = eff;
  }
  start() { requestAnimationFrame(t => this.loop(t)); }
  loop(ts) {
    /* 帧率上限（设置模块）：未到间隔直接跳过这一帧，只排队下一帧 */
    if (typeof Settings !== 'undefined' && Settings.frameMs) {
      const gap = Settings.frameMs();
      if (gap > 0 && ts - this.last < gap - 1.2) { requestAnimationFrame(t => this.loop(t)); return; }
    }
    const dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
    /* 手柄：聚焦分隔条后可用左摇杆调整（无手柄时立即返回，几乎零开销） */
    if (typeof Splitter !== 'undefined') { try { Splitter.gamepadTick(); } catch (e) { } }
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
  /** 静默设定自动导航目标（挂机等系统内部使用，不弹提示） */
  setRoute(tx, ty, name) {
    if (this.inHome) return;
    tx = clamp(Math.round(tx), 0, WORLD_SIZE - 1); ty = clamp(Math.round(ty), 0, WORLD_SIZE - 1);
    this.route = { tx: tx, ty: ty, name: name || null, t: 0, stuck: 0, side: 0, sideT: 0, lastSide: 0 };
  }
  /** 设定自动前往目标（格坐标） */
  autoTravel(tx, ty, name) {
    if (this.inHome) { UI.toast('家园为独立空间，无法自动前往', '#ff9a9a'); return; }
    tx = clamp(Math.round(tx), 0, WORLD_SIZE - 1); ty = clamp(Math.round(ty), 0, WORLD_SIZE - 1);
    this.setRoute(tx, ty, name);
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
    /* 命中顿帧（打击感）：暴击 / 击杀时世界推进放慢到 12%，特效与渲染照常 → "卡那一下" */
    let wdt = dt;
    if (this.hitStop > 0) { this.hitStop -= dt; wdt = dt * 0.12; }
    /* BGM 场景同步（内部 0.5s 节流）：区域调式 / 战斗强度 / 昼夜 */
    if (typeof Music !== 'undefined' && Music.syncFromGame) Music.syncFromGame(this, dt);
    // 玩家有操作（移动 / 按住攻击 / 摇杆）→ 重置「10 秒无操作自动关闭面板」计时
    if (typeof UI !== 'undefined' && UI.touch) {
      const k = this.keys;
      const joyOn = (typeof Mobile !== 'undefined' && Mobile.on && (Mobile.dx || Mobile.dy));
      if (this.mouse.down || joyOn || k['w'] || k['a'] || k['s'] || k['d']) UI.touch();
    }
    const z = this.cam.zoom || 1;
    this.mouse.worldX = this.cam.x + this.mouse.x / z; this.mouse.worldY = this.cam.y + this.mouse.y / z;
    p.aimAngle = angleOf(p.x, p.y - 8, this.mouse.worldX, this.mouse.worldY);
    if (!p.dead) { this.updateBoard(wdt) || this.movePlayer(wdt); }
    p.update(wdt, this);
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
      const si = (typeof BAL !== 'undefined') ? BAL.spawn.interval : 1.2;
      if (this.spawnT <= 0) { this.spawnT = si / Math.max(0.2, smul); this.updateSpawns(); }
    } else {
      this.home.update(dt);
    }
    this.updateAmbient(dt);
    if (typeof Weather !== 'undefined') Weather.update(dt, this);   // 天气 AI + 天气粒子
    if (typeof Ambience !== 'undefined') Ambience.tick(this, dt);   // 环境音：按大区/昼夜/天气调整                        // 环境粒子（雪 / 沙 / 落叶 / 萤火）
    // 实体
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (!this.inHome) m.update(wdt, this);
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
    /* 迷雾：走出一片揭一片（0.4s 一次，半径 14 格 ≈ 半屏多） */
    this._explT = (this._explT || 0) + dt;
    if (this._explT > 0.4) {
      this._explT = 0;
      if (!this.inHome) this.markExplored(Math.floor(p.x / TILE_PX), Math.floor(p.y / TILE_PX), 14);
    }
    // 特效 / 飘字
    /* 特效：粒子（spark）受重力与阻尼，其余只减 ttl */
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.ttl -= dt;
      if (f.type === 'spark') {
        f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt;
        f.vy = (f.vy || 0) + (f.g === undefined ? 260 : f.g) * dt;
        f.vx = (f.vx || 0) * 0.97;
      }
      if (f.ttl <= 0) this.fx.splice(i, 1);
    }
    this.updateProj(dt);
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
    if (p.sailing) { this.boatMove(dt, dx, dy); return; }   // 驾船：船在水面航行
    if (this._board || this._disembark) return;             // 上 / 下船动画中不可操作
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
    /* 船只优先：在船上 → 下船；岸边有小船 → 上船 */
    if (p.sailing) return this.tryDisembark();
    const bt = this.nearbyBoat();
    if (bt) return this.boardBoat(bt);
    const tx = Math.floor(p.x / TILE_PX), ty = Math.floor(p.y / TILE_PX);
    // 优先采集点：E = 直接开始采集（进度条见屏幕中下方）；左键点击资源点才是面板
    const nd = this.world.nearestNode(tx, ty, 2.6);
    if (nd) { this.startGather(nd); return; }
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
  /* ================= 船只 ================= */
  /** 找玩家身边可乘坐的小船（按世界坐标就近，半径 52px） */
  nearbyBoat() {
    const p = this.player;
    if (this.inHome) return null;
    const tx = Math.floor(p.x / TILE_PX), ty = Math.floor(p.y / TILE_PX);
    for (let cx = (tx - 2) >> 4; cx <= (tx + 2) >> 4; cx++) {
      for (let cy = (ty - 2) >> 4; cy <= (ty + 2) >> 4; cy++) {
        const ch = this.world.getChunk(cx, cy);   // 用 getChunk：区块未加载时现生成（与视野加载一致）
        if (!ch) continue;
        for (const o of ch.objs) {
          if (o.kind === 'boat' && !o.riding && dist(o.wx, o.wy, p.x, p.y) < 52) return o;
        }
      }
    }
    return null;
  }
  /** 上船：0.5s 走向小船的补间，落座后接管操控 */
  boardBoat(o) {
    const p = this.player;
    if (p.sailing || this._board || this._disembark) return;
    if (this.route) this.cancelRoute('上船已取消导航');
    if (this.task) this.stopTask('上船中断了自动采集');
    p.boarding = true;
    if (typeof Snd !== 'undefined' && Snd.play) Snd.play('board');    // 上船水花
    this._board = { t: 0, dur: 0.5, fx: p.x, fy: p.y, boat: o };
    this.fx.push({ x: o.wx, y: o.wy, r: 20, ttl: .5, color: '#cfe8ff', type: 'circle' });
  }
  /** 下船：找最近的可站立岸格，0.45s 走过去 */
  tryDisembark() {
    const p = this.player, o = this.boat;
    if (!o || this._board || this._disembark) return;
    const tx = Math.floor(o.wx / TILE_PX), ty = Math.floor(o.wy / TILE_PX);
    let best = null, bd = 1e9;
    for (let ry = -2; ry <= 2; ry++) for (let rx = -2; rx <= 2; rx++) {
      const nx = tx + rx, ny = ty + ry;
      if (nx < 0 || ny < 0 || nx >= WORLD_SIZE || ny >= WORLD_SIZE) continue;
      const info = this.world.tileInfo(nx, ny);
      if (info.water || info.mountain || this.world.solidTile(nx, ny)) continue;
      const d = dist(nx, ny, tx, ty);
      if (d < bd) { bd = d; best = { x: nx, y: ny }; }
    }
    if (!best) { UI.toast('离岸太远，无法下船', '#ff9a9a'); return; }
    if (this.task) this.stopTask('下船中断了自动采集');
    p.disembarking = true;
    if (typeof Snd !== 'undefined' && Snd.play) Snd.play('board');    // 下船水花
    this._disembark = { t: 0, dur: 0.45, fx: p.x, fy: p.y,
      tx2: best.x * TILE_PX + TILE_PX / 2, ty2: best.y * TILE_PX + TILE_PX / 2 };
    this.fx.push({ x: o.wx, y: o.wy, r: 18, ttl: .5, color: '#cfe8ff', type: 'circle' });
  }
  /** 上 / 下船补间推进；返回 true 表示本帧玩家被动画接管 */
  updateBoard(dt) {
    const p = this.player;
    if (this._board) {
      const a = this._board; a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1), e = k * k * (3 - 2 * k);
      p.x = a.fx + (a.boat.wx - a.fx) * e;
      p.y = a.fy + (a.boat.wy - a.fy) * e;
      p.moving = true; p.animT += dt * 3;
      if (k >= 1) {
        this._board = null; p.boarding = false;
        p.sailing = true; this.boat = a.boat; a.boat.riding = true;
        p.x = a.boat.wx; p.y = a.boat.wy;
        p.buffs.remove('D308'); p.recompute();   // 坐船不吃游泳减速
        UI.toast('已上船 · 方向键 / 摇杆开船，靠岸按 E 下船', '#9fe8ff');
      }
      return true;
    }
    if (this._disembark) {
      const a = this._disembark; a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1), e = k * k * (3 - 2 * k);
      p.x = a.fx + (a.tx2 - a.fx) * e;
      p.y = a.fy + (a.ty2 - a.fy) * e;
      p.moving = true; p.animT += dt * 3;
      if (k >= 1) {
        const o = this.boat;
        this._disembark = null; p.disembarking = false; p.sailing = false;
        if (o) { o.riding = false; }
        this.boat = null;
        p.recompute();
        UI.toast('已下船', '#9fe8ff');
      }
      return true;
    }
    return false;
  }
  /** 驾船移动：只能在水面航行，船速略高于步行且不受游泳减速影响 */
  boatMove(dt, dx, dy) {
    const p = this.player, o = this.boat;
    if (!o) { p.sailing = false; return; }
    const ox = o.wx, oy = o.wy;
    if (dx || dy) {
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      const sp = p.stats.moveSpd * TILE_PX * 1.1 * dt, r = 10;
      const canGo = (nx, ny) => {
        const pts = [[nx - r, ny - r], [nx + r, ny - r], [nx - r, ny + r], [nx + r, ny + r], [nx, ny]];
        for (const q of pts) if (!this.world.waterTile(Math.floor(q[0] / TILE_PX), Math.floor(q[1] / TILE_PX))) return false;
        return true;
      };
      if (dx && canGo(o.wx + dx * sp, o.wy)) o.wx += dx * sp;
      if (dy && canGo(o.wx, o.wy + dy * sp)) o.wy += dy * sp;
      p.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      o.face = Math.atan2(dy, dx) + Math.PI / 2;   // 素材船头朝上，行进方向 + 90°
      p.animT += dt * Math.min(3, 1 + p.stats.moveSpd / 6);
      this._wakeT -= dt;                            // 航行尾迹
      if (this._wakeT <= 0) {
        this._wakeT = 0.18;
        this.fx.push({ x: o.wx - Math.sin(o.face) * 12, y: o.wy + Math.cos(o.face) * 12, r: 7, ttl: .5, color: 'rgba(207,232,255,.5)', type: 'circle' });
      }
    }
    p.x = o.wx; p.y = o.wy;
    p.moving = (o.wx !== ox || o.wy !== oy);
  }
  /** 绘制水域上的小船（含轻微起伏） */
  drawBoats(ctx, view) {
    const CS = CHUNK * TILE_PX;
    const c0x = Math.floor(view.x / CS) - 1, c1x = Math.floor((view.x + view.w) / CS) + 1;
    const c0y = Math.floor(view.y / CS) - 1, c1y = Math.floor((view.y + view.h) / CS) + 1;
    const bob = Math.sin(this.timeSec * 2.2) * 1.4;
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const ch = this.world.chunks.get(cx + ',' + cy);
        if (!ch) continue;
        for (const o of ch.objs) {
          if (o.kind !== 'boat') continue;
          this.drawShadow(ctx, o.wx, o.wy + 6, 10, 4);
          ctx.save();
          ctx.translate(Math.round(o.wx), Math.round(o.wy + bob));
          ctx.rotate(o.face || 0);
          ctx.drawImage(Sprites.boat(o.v || 1), -11, -18, 22, 36);
          ctx.restore();
        }
      }
    }
  }
  /** NPC 走路帧 + 篝火跳动：动态件不进区块烘焙，这里逐帧画（与 drawBoats 同一套坐标约定） */
  drawNpcs(ctx, view) {
    const CS = CHUNK * TILE_PX;
    const c0x = Math.floor(view.x / CS) - 1, c1x = Math.floor((view.x + view.w) / CS) + 1;
    const c0y = Math.floor(view.y / CS) - 1, c1y = Math.floor((view.y + view.h) / CS) + 1;
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const ch = this.world.chunks.get(cx + ',' + cy);
        if (!ch) continue;
        for (const o of ch.objs) {
          const wx = (cx * CHUNK + o.lx) * TILE_PX + 16 + (o.ox || 0);
          const wy = (cy * CHUNK + o.ly) * TILE_PX + TILE_PX - 2 + (o.oy || 0);
          if (wx < view.x - 48 || wx > view.x + view.w + 48 || wy < view.y - 48 || wy > view.y + view.h + 48) continue;
          if (o.kind === 'npc') {
            const f = Math.floor(this.timeSec * 2 + (o.npcSeed || 0) * 0.37) % 4;   // 各自相位错开
            this.drawShadow(ctx, wx, wy, 8, 4);
            const sp = Sprites.npc(o.npcSeed || 1, o.data, f);
            ctx.drawImage(sp, Math.round(wx - sp.width / 2), Math.round(wy - sp.height + 2));
          } else if (o.kind === 'prop' && o.data === 'campfire') {
            const f = Math.floor(this.timeSec * 6 + (o.lx * 3 + o.ly)) % 3;
            const sp = Sprites.campfire(f);
            ctx.drawImage(sp, Math.round(wx - 16), Math.round(wy - sp.height + 2));
          }
        }
      }
    }
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
    /* 野外宝箱：记下坐标，区块卸载重生成时仍是"已开"状态（与 120 秒回补一致，不写存档） */
    if (o.wild) {
      if (typeof CHEST_OPENED !== 'undefined') {
        CHEST_OPENED[tx + ',' + ty] = now;
        if (Object.keys(CHEST_OPENED).length > 400) {              // 只清理过期项，避免无限增长
          for (const k in CHEST_OPENED) if (now - CHEST_OPENED[k] > 600000) delete CHEST_OPENED[k];
        }
      }
    }
    if (typeof Snd !== 'undefined' && Snd.play) Snd.play('chest');
    const ch = this.world.chunks.get((tx >> 4) + ',' + (ty >> 4));
    if (ch) ch.canvas = null;
    const p = this.player;
    const lv = clamp(regionLevelAt(regionAtTile(tx, ty), tx, ty), 1, 60);
    const rare = !!o.rare;                                        // 精致宝箱：物资翻倍
    p.stat.chests++;
    this.burst(tx * TILE_PX + 16, ty * TILE_PX - 4, rare ? 22 : 12, rare ? ['#ffe9a0', '#fff6c4', '#ffd76a'] : ['#ffd76a', '#c9a24a'], { spd: 150, life: .6, up: 60, r: 3 });
    const gold = irnd(lv * 20, lv * 60) * (rare ? 3 : 1);
    p.addGold(gold);
    this.floatTextAt(tx * TILE_PX, ty * TILE_PX, '+' + fmt(gold) + ' 金币', '#ffdf94');
    UI.log((rare ? '精致' : '') + '宝箱：' + fmt(gold) + ' 金币', '#ffdf94');
    /* 装备：野外箱必给一件（精致箱更高品质） */
    const gp = rare ? 1 : 0.45;
    if (chance(gp)) {
      const g = rollEquipDrop(rare ? lv + 4 : lv, 'chest');
      if (p.addInstance(g)) UI.log('获得装备：' + gearFullName(g), getQuality(g.q).color);
    }
    /* 材料 / 消耗品：数量随箱型提升 */
    const pool = [4315, 4316, 3001, 3003, 4301, 4302, 4303, 4333, 4319, 4320];
    for (let i = 0; i < (rare ? 5 : 3); i++) {
      if (chance(rare ? 0.8 : 0.6)) {
        const id = choice(pool), n = irnd(1, 3) * (rare ? 2 : 1);
        p.addItem(id, n, irnd(2, 4));
        UI.log('获得物资 ' + ITEMS[id].name + ' ×' + n, '#cfe8b8');
      }
    }
    /* 药水：野外箱额外来一瓶（回血 / 回蓝） */
    if (o.wild && chance(rare ? 1 : 0.5)) {
      const pot = choice([3001, 3002, 3003, 3011, 3012].filter(id => ITEMS[id]));   // 生命/魔力药水 + 食物
      if (pot) { p.addItem(pot, rare ? 3 : 1, 2); UI.log('获得药水 ' + ITEMS[pot].name, '#9fe8ff'); }
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
      if (this.player.sailing) { this.interactHint = 'E 下船（靠近岸边）'; this.updateNodePop(); return; }
      const bt = this.nearbyBoat();
      if (bt) { this.interactHint = 'E 上船'; this.updateNodePop(); return; }
      const nd = this.world.nearestNode(tx, ty, 2.6);
      if (nd) txt = 'E 直接采集 ' + this.nodeName(nd.node) + '（10s）｜ 左键 打开采集面板';
      else {
        const objs = this.world.objectsNear(tx, ty, 2).sort((a, b) => dist(a.tx, a.ty, tx, ty) - dist(b.tx, b.ty, tx, ty));
        const o = objs.find(x => ['chest', 'bench', 'portal', 'npc'].includes(x.o.kind));
        if (o) txt = 'E ' + { chest: '开启宝箱', bench: '使用制作台', portal: '进入家园', npc: '交谈' }[o.o.kind];
      }
    }
    this.interactHint = txt;
    this.updateNodePop();
  }
  /** 靠近资源点 → 自动弹出资源信息面板（3 秒后淡出）；走开 → 慢慢淡出 */
  updateNodePop() {
    if (typeof UI === 'undefined' || !UI.nodePop) return;
    const near = (this.inHome || !this.world) ? null
      : this.world.nearestNode(Math.floor(this.player.x / TILE_PX), Math.floor(this.player.y / TILE_PX), 2.4);
    const nd = near ? near.node : null;
    if (nd === this._popNd) return;                 // 同一个资源点不重复弹
    this._popNd = nd;
    if (nd) UI.nodePop(nd); else UI.nodePopHide();
  }

  /* ================= 采集 ================= */
  /** 资源点显示名 */
  nodeName(nd) {
    if (nd.skill === 'fish') return '渔点 · ' + ({ plain: '内陆水域', forest: '林间溪流', desert: '绿洲水域', snow: '冰湖', abyss: '深渊暗流', ruin: '星陨湖', waste: '荒原水泊', coast: '近海渔场', sea: '远海渔场', river: '蜿蜒江河', lake: '平静湖泊' }[nd.area] || '淡水');
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
  /** 单次采集耗时（秒）：所有资源点统一基础 10 秒；工具 / 天赋 / 等级仍可缩短，下限 2 秒 */
  gatherTime(nd) {
    const p = this.player, skill = nd.skill;
    const toolId = TOOL_OF[skill];
    const hasTool = this.hasTool(skill);
    const toolDef = ITEMS[toolId];
    const base = 10;
    const life = p.life[skill];
    const own = (p.stats.gatherSpeed || 0) + (({ mine: 11, log: 12, herb: 13, fish: 14 }[skill]) ? p.talentLevel({ mine: 11, log: 12, herb: 13, fish: 14 }[skill]) * 5 : 0) + (p.stats.fishSpeed || 0);
    return Math.max(2, base / (1 + life.lv * 0.01 + (hasTool ? toolDef.toolSpeed * 0.4 : 0) + own / 100));
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
    /* 黄色高亮进度条：显示剩余倒计时（秒） */
    $('progTxt').textContent = ({ mine: '采矿中', log: '伐木中', herb: '采药中', bug: '捕虫中', fish: '钓鱼中' })[g.skill]
      + '　剩余 ' + Math.max(0, g.total - g.t).toFixed(1) + 's';
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
    /* 采集音按材质区分：矿=金属叮、木=闷响、草=沙沙；批量采集（quiet）不播，避免刷屏 */
    if (typeof Snd !== 'undefined' && Snd.play && !g.quiet) {
      Snd.play(skill === 'mine' ? 'mine' : skill === 'log' ? 'chop' : 'herb');
    }
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
    if (typeof Snd !== 'undefined' && Snd.play && !nd._quiet) Snd.play('fish');   // 水花 + 低频闷响
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
        if (typeof Snd !== 'undefined' && Snd.play) Snd.play('craft');
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
  teleportTo(x, y) {
    this.player.x = x; this.player.y = y; this.inHome = false;
    if (typeof Snd !== 'undefined' && Snd.play) Snd.play('portal');
  }

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
    if (!this.inHome) this.drawBoats(ctx, view);  // 水域小船（含驾驶中的船）
    if (!this.inHome) this.drawNpcs(ctx, view);   // NPC 走路帧 + 篝火跳动
    if (!this.inHome) this.drawProj(ctx);   // 飞行中的箭 / 法球（在特效之下、实体之上）
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
    if (!this.inHome) this.drawNodeLabels(ctx);   // 附近 2 格内采集资源的金色名称（屏幕空间，字号不随缩放变化）
    this.drawAmbient(ctx);             // 环境粒子（屏幕空间，落在角色之前）
    this.drawAtmosphere(ctx);          // 远景雾化 + 昼夜光照（屏幕空间叠加）
    if (typeof Weather !== 'undefined') Weather.drawSky(ctx, this);   // 雨丝 / 雪花 / 阵风 / 闪电（最上层）
    this.applyPostFx(ctx);                            // 泛光 + 区域色调映射（可关，移动端默认关）
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
      ctx.save();
      try {
        const g = ctx.createRadialGradient(sx, sy, 20, sx, sy, 250);
        g.addColorStop(0, 'rgba(255,200,120,' + (night * 0.20).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      } catch (e) { /* 渐变创建失败（老内核）→ 退化为柔和圆光 */ }
      ctx.restore();
    }
    /* 太阳方向光：从太阳所在一侧洒下的暖光，正午最盛、黄昏偏橙、夜间消失 */
    const s = this._sun || (this._sun = this.sun());
    if (s.light > 0.04 && night < 0.7) {
      ctx.save();
      try {
        const warm = dusk > 0.3 ? '255,170,90' : '255,222,158';
        const g3 = ctx.createLinearGradient(s.x >= 0 ? w : 0, 0, s.x >= 0 ? 0 : w, h * 0.65);
        g3.addColorStop(0, 'rgba(' + warm + ',' + (0.13 * s.light).toFixed(3) + ')');
        g3.addColorStop(1, 'rgba(' + warm + ',0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g3; ctx.fillRect(0, 0, w, h);
      } catch (e) { }
      ctx.restore();
    }
    const r = regionAtTile(Math.floor(this.player.x / TILE_PX), Math.floor(this.player.y / TILE_PX));
    const fog = (r && r.pal && r.pal.fog) || '#9fb4c8';
    /* 天气能见度：雨/雪/雷暴时雾更重，视野变差 */
    const wvis = (typeof Weather !== 'undefined' && Weather.visMul) ? Weather.visMul() : 1;
    ctx.save();
    ctx.globalAlpha = clamp(0.16 + night * 0.06 + (1 - wvis) * 0.62, 0, 0.62);
    const fogCv = this.bakeMask('fog|' + fog, w, h, (x, W, H) => {
      const g2 = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.80);
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(1, fog);
      x.fillStyle = g2; x.fillRect(0, 0, W, H);
    });
    if (fogCv) ctx.drawImage(fogCv, 0, 0, w, h);
    else { ctx.fillStyle = fog; ctx.fillRect(0, 0, w, h); }   // 兜底：纯色雾
    ctx.restore();
  }
  /** 遮罩烘焙：把径向渐变画到离屏画布再 drawImage 叠加。
   *  部分安卓 WebView 对「跨帧复用的 CanvasGradient」兼容性差（会渲染成实心黑块），
   *  且窗口尺寸变化后必须重建 —— 这里以 key+尺寸 为缓存键，尺寸变了自动重烘。 */
  bakeMask(key, w, h, paint) {
    const store = this._masks || (this._masks = {});
    const hit = store[key];
    const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
    if (hit && hit.cv.width === W && hit.cv.height === H) return hit.cv;
    try {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      paint(x, W, H);
      store[key] = { cv: c };
      return c;
    } catch (e) { store[key] = { cv: null }; return null; }
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
    const sp = Sprites.player(p.clsKey, p.gearLook ? p.gearLook() : null);   // 装备影响外观
    const frames = sp[p.face] || sp.down;
    const sailing = !!p.sailing;
    /* 帧优先级：受击 7 > 攻击/施法 6 > 走路 0-3 > 待机呼吸 4-5 */
    let idx;
    if (p.hitT > 0) idx = 7;
    else if (p.atkT > 0) idx = 6;
    else if (p.moving && !sailing) idx = Math.floor(p.animT * 6) % 4;
    else idx = 4 + (Math.floor(this.timeSec * 2) % 2);
    const cv = frames[idx];
    /* 坐船：随船起伏，坐姿（不播放走路帧、不画人影，船已有影子） */
    const bob = sailing ? Math.sin(this.timeSec * 2.2) * 1.4 : 0;
    const cx = Math.round(p.x - sp.w / 2), cy = Math.round(p.y - sp.h + (sailing ? 16 : 12) + bob);
    if (!sailing) this.drawShadow(ctx, p.x, p.y, 12, 5);
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
    /* 受击时抖一下（4 帧浮动，受击帧取最后一帧） */
    const f = (m.hitT > 0) ? 3 : Math.floor(this.timeSec * 3 + m.x) % 4;
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
  /* ================= 打击感：粒子 / 投射物 / 顿帧 ================= */
  /** 粒子爆发：命中火花、击杀碎片、水花、升级星屑 */
  burst(x, y, n, col, opt) {
    if (typeof Settings !== 'undefined' && Settings.data.quality === 'low') n = Math.ceil(n / 2);
    const o = opt || {}, life = o.life || 0.45;
    const cap = (typeof Mobile !== 'undefined' && Mobile.on) ? 90 : 160;
    if (this.fx.length > cap) n = Math.min(n, 6);              // 特效堆积时自动收敛，保帧率
    for (let i = 0; i < n; i++) {
      const a = o.ang === undefined ? Math.random() * 6.283 : o.ang + (Math.random() - 0.5) * (o.spread || 1.2);
      const sp = (o.spd || 130) * (0.5 + Math.random());
      this.fx.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
        r: (o.r || 3) * (0.6 + Math.random() * 0.8), ttl: life * (0.6 + Math.random() * 0.6), life: life,
        color: Array.isArray(col) ? col[Math.floor(Math.random() * col.length)] : col,
        g: o.g === undefined ? 260 : o.g, type: 'spark'
      });
    }
  }
  /** 发射投射物：飞行命中才结算伤害（弓 / 法球 / 怪物弹） */
  spawnProj(o) {
    const spd = o.spd || 420;
    this.proj.push({
      x: o.x, y: o.y, px: o.x, py: o.y,
      vx: Math.cos(o.ang) * spd, vy: Math.sin(o.ang) * spd,
      r: o.r || 4, owner: o.owner, opts: o.opts || {}, col: o.col || '#ffd76a',
      kind: o.kind || 'orb', ttl: (o.range || 400) / spd + 0.15, cb: o.cb || null,
      dmgT: 0, pierce: o.pierce || 0, hit: null, spin: Math.random() * 6.28
    });
  }
  updateProj(dt) {
    const p = this.player;
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const b = this.proj[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt; b.spin += dt * 12;
      let done = b.ttl <= 0;
      if (!done) {
        /* 命中判定：玩家发射 → 打怪；怪物发射 → 打玩家 */
        const list = (b.owner && b.owner.isPlayer) ? this.monsters : [p];
        for (const t of list) {
          if (!t || t.dead || (b.owner && t === b.owner)) continue;
          if (dist(b.x, b.y, t.x, t.y - 8) > (b.r + 10)) continue;
          /* 有回调走回调（保留多段 / 减益等技能逻辑），否则直接结算伤害 */
          if (b.cb) b.cb(t); else Combat.dealDamage(b.owner || p, t, b.opts, this);
          this.burst(b.x, b.y, 8, b.col, { spd: 150, life: .3, r: 2.5 });
          if (b.pierce > 0) { b.pierce--; } else { done = true; }
          break;
        }
      }
      /* 撞墙 / 撞树：直接消散 */
      if (!done && this.world && this.world.solidTile(Math.floor(b.x / TILE_PX), Math.floor(b.y / TILE_PX))) {
        this.burst(b.x, b.y, 5, b.col, { spd: 90, life: .25, r: 2 });
        done = true;
      }
      if (done) this.proj.splice(i, 1);
    }
  }
  drawProj(ctx) {
    for (const b of this.proj) {
      ctx.save();
      ctx.translate(Math.round(b.x), Math.round(b.y));
      ctx.rotate(Math.atan2(b.vy, b.vx));
      if (b.kind === 'arrow') {
        ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = b.col; ctx.beginPath();
        ctx.moveTo(6, 0); ctx.lineTo(1, -3); ctx.lineTo(1, 3); ctx.closePath(); ctx.fill();
      } else {
        /* 法球：核心 + 旋转光晕 + 拖尾 */
        ctx.globalAlpha = 0.35; ctx.fillStyle = b.col;
        ctx.beginPath(); ctx.arc(0, 0, b.r * 2.2, 0, 6.28); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 6.28); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.globalAlpha = 0.5; ctx.strokeStyle = b.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, b.r * 1.6, b.spin, b.spin + 3.6); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  drawFx(ctx) {
    for (const f of this.fx) {
      const a = clamp(f.ttl / (f.type === 'circle' ? 0.5 : (f.type === 'spark' ? (f.life || 0.5) : 0.3)), 0, 1);
      ctx.globalAlpha = a * 0.8;
      if (f.type === 'spark') {
        ctx.fillStyle = f.color;
        const s = Math.max(1, f.r * a);
        ctx.fillRect(f.x - s / 2, f.y - s / 2, s, s);
        ctx.globalAlpha = 1;
        continue;
      }
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
  /** 采集资源名称：玩家方圆 2 格内的资源点，头顶 1 格显示金色名字
   * 屏幕空间绘制 → 字号不随视野缩放变化；已采尽的不显示 */
  drawNodeLabels(ctx) {
    if (this.inHome || !this.world) return;
    const p = this.player, z = this.cam.zoom || 1;
    const CS = CHUNK * TILE_PX;
    const vw = this.cam.w / z, vh = this.cam.h / z;
    const c0x = Math.floor(this.cam.x / CS) - 1, c1x = Math.floor((this.cam.x + vw) / CS) + 1;
    const c0y = Math.floor(this.cam.y / CS) - 1, c1y = Math.floor((this.cam.y + vh) / CS) + 1;
    const ptx = Math.floor(p.x / TILE_PX), pty = Math.floor(p.y / TILE_PX);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    let n = 0;
    for (let cy = c0y; cy <= c1y && n < 24; cy++) {
      for (let cx = c0x; cx <= c1x && n < 24; cx++) {
        const ch = this.world.chunks.get(cx + ',' + cy);
        if (!ch) continue;
        for (const ob of ch.objs) {
          const nd = ob.node;
          if (!nd || nd.amount <= 0) continue;                 // 采尽 / 钓鱼点无限
          const tx = cx * CHUNK + ob.lx, ty = cy * CHUNK + ob.ly;
          if (Math.max(Math.abs(tx - ptx), Math.abs(ty - pty)) > 2) continue;   // 方圆 2 格
          const name = nd.itemId ? ((ITEMS[nd.itemId] && ITEMS[nd.itemId].name) || '资源') : '渔点';
          const wx = tx * TILE_PX + 16 + (ob.ox || 0), wy = ty * TILE_PX + TILE_PX - 2 + (ob.oy || 0);
          const sx = (wx - this.cam.x) * z, sy = (wy - this.cam.y) * z - TILE_PX * z;   // 头顶上方 1 格
          ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
          const tw = ctx.measureText(name).width;
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = 'rgba(8,12,24,.72)';
          ctx.fillRect(sx - tw / 2 - 6, sy - 15, tw + 12, 18);
          ctx.fillStyle = '#000'; ctx.fillText(name, sx + 1, sy);   // 描边：保证浅色地形上也看得清
          ctx.fillStyle = '#ffd76a'; ctx.fillText(name, sx, sy - 1);
          ctx.globalAlpha = 1;
          n++;
        }
      }
    }
    ctx.restore();
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
  /* ================= 后处理：泛光 Bloom + 区域色调映射 =================
   * 全部可关（设置里「泛光」：关 / 自动 / 开，「色调强度」0~0.15）；低画质档强制关；
   * 连续偏慢（EMA 帧耗时 > 9ms）自动整体关闭，保证帧率优先 */
  postFxStrength() {
    if (typeof Settings === 'undefined') return 0;
    const b = (Settings.data.bloom === undefined ? 2 : Settings.data.bloom);
    if (b === 0) return 0;
    if (typeof Mobile !== 'undefined' && Mobile.on && b === 2) return 0;   // 自动：移动端关
    if (Settings.data.quality === 'low') return 0;
    return Settings.data.quality === 'high' || Settings.data.quality === '4k' ? 0.60 : 0.35;
  }
  applyPostFx(ctx) {
    if (this._fxOff) return;
    const s = this.postFxStrength();
    const tint = (typeof Settings !== 'undefined') ? (+Settings.data.tint || 0) : 0;
    if (s <= 0 && tint <= 0) return;
    const t0 = (typeof nowMs === 'function') ? nowMs() : Date.now();
    try {
      if (s > 0) this.bloom(ctx, this.cam.w, this.cam.h, s);
      if (tint > 0) this.toneTint(ctx, this.cam.w, this.cam.h, tint);
    } catch (e) { this._fxOff = true; return; }
    const t1 = (typeof nowMs === 'function') ? nowMs() : Date.now();
    this._fxMs = (this._fxMs || 0) * 0.9 + (t1 - t0) * 0.1;
    if (this._fxMs > 9) this._fxOff = true;             // 持续偏慢 → 自动降级
  }
  /** 泛光：1/4 降采样 → 自乘压暗暗部（阈值近似）→ 4 向偏移模糊 → lighter 叠加 */
  bloom(ctx, w, h, strength) {
    const bw = Math.max(64, Math.round(w / 4)), bh = Math.max(48, Math.round(h / 4));
    if (!this._blA || this._blA.width !== bw || this._blA.height !== bh) {
      this._blA = CV(bw, bh).c; this._blB = CV(bw, bh).c;
    }
    const A = this._blA, B = this._blB;
    const ax = A.getContext('2d'), bx = B.getContext('2d');
    ax.globalCompositeOperation = 'source-over'; ax.globalAlpha = 1;
    ax.clearRect(0, 0, bw, bh);
    ax.drawImage(ctx.canvas, 0, 0, bw, bh);
    ax.globalCompositeOperation = 'multiply';           // x²：暗部更暗、亮部保留 ≈ 阈值
    ax.drawImage(A, 0, 0);
    ax.globalCompositeOperation = 'source-over';
    bx.globalCompositeOperation = 'source-over';
    bx.clearRect(0, 0, bw, bh);
    bx.globalAlpha = 0.25;
    bx.drawImage(A, 1, 0); bx.drawImage(A, -1, 0); bx.drawImage(A, 0, 1); bx.drawImage(A, 0, -1);
    bx.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = strength;
    ctx.imageSmoothingEnabled = true;                   // 放大回屏幕时平滑，缩小保持像素风
    ctx.drawImage(B, 0, 0, w, h);
    ctx.restore();
  }
  /** 区域色调映射：soft-light 薄罩一层区域色，强度 0.06~0.15 之间（要克制） */
  toneTint(ctx, w, h, a) {
    let key = 'plain';
    try {
      const reg = regionAtTile(Math.floor(this.player.x / TILE_PX), Math.floor(this.player.y / TILE_PX));
      if (reg && reg.key) key = reg.key;
    } catch (e) { }
    const COL = { plain: '#ffe9b0', forest: '#7fd06a', desert: '#ffb46a', snow: '#8fb6ff',
      abyss: '#a06aff', ruin: '#7fe0d0', waste: '#c08a6a', sea: '#6ac0ff' };
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = a;
    ctx.fillStyle = COL[key] || COL.plain;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  drawVignette(ctx) {
    const w = this.cam.w, h = this.cam.h;
    /* 暗角同样烘焙成离屏画布：不再跨帧复用 CanvasGradient（老内核兼容），尺寸变化自动重建 */
    const cv = this.bakeMask('vig', w, h, (x, W, H) => {
      const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.55)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    });
    if (cv) ctx.drawImage(cv, 0, 0, w, h);
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
      idle: Idle.serialize(), market: Market.serialize(),
      /* 迷雾：已探索位图（CELL 格一个 bit/byte，base64 压缩后约 190KB）。
       * 旧档没有这个字段 → parseExplored 返回全 0，即「全未探索」，不丢档、不报错 */
      explored: this.serializeExplored()
    };
  }
  /* ================= 迷雾（D2）：已探索区块 =================
   * 粒度 EXPL_CELL 格/单元；仅主世界记录，家园不涉及。跨局持久化，旧档视为全未探索。 */
  EXPL_CELL = 32;
  initExplored() {
    const n = Math.ceil(WORLD_SIZE / this.EXPL_CELL);
    if (!this.explored || this.explored.length !== n * n) this.explored = new Uint8Array(n * n);
    return this.explored;
  }
  /** 把玩家周围 r 格标记为已探索 */
  markExplored(tx, ty, r) {
    const e = this.initExplored(), C = this.EXPL_CELL, n = Math.ceil(WORLD_SIZE / C);
    const c0x = Math.max(0, Math.floor((tx - r) / C)), c1x = Math.min(n - 1, Math.floor((tx + r) / C));
    const c0y = Math.max(0, Math.floor((ty - r) / C)), c1y = Math.min(n - 1, Math.floor((ty + r) / C));
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) e[cy * n + cx] = 1;
  }
  /** 序列化：RLE 行程编码（未探索区连片 0，实测几百 KB → 几 KB） */
  serializeExplored() {
    const e = this.initExplored();
    let s = '', i = 0;
    while (i < e.length) {
      const v = e[i] ? 1 : 0;
      let run = 0;
      while (i + run < e.length && run < 255 && ((e[i + run] ? 1 : 0) === v)) run++;
      s += String.fromCharCode(v) + String.fromCharCode(run);
      i += run;
    }
    return { c: this.EXPL_CELL, n: e.length, rle: 1, b: (typeof btoa === 'function') ? btoa(s) : null };
  }
  parseExplored(o) {
    const n = Math.ceil(WORLD_SIZE / this.EXPL_CELL);
    const e = new Uint8Array(n * n);
    if (o && o.c === this.EXPL_CELL && typeof atob === 'function' && o.b) {
      try {
        const s = atob(o.b);
        if (o.rle) {
          let i = 0, k = 0;
          while (i + 1 < s.length && k < e.length) {
            const v = s.charCodeAt(i), run = s.charCodeAt(i + 1); i += 2;
            for (let j = 0; j < run && k < e.length; j++, k++) e[k] = v ? 1 : 0;
          }
        } else {
          for (let i = 0; i < Math.min(s.length, e.length); i++) e[i] = s.charCodeAt(i) ? 1 : 0;
        }
      } catch (err) { }
    }
    return e;
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
      g.explored = g.parseExplored(d.explored || null);   // 旧档无此字段 → 全未探索（不丢档）
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
