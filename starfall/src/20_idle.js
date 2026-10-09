/* ============================================================
 * 20_idle.js —— 离线挂机系统：任务队列 / 时间次数配额 / 循环 / 结算
 * 规则与手动采集、野外战斗一致（耗时、工具、天赋加成、掉落权重）
 * ==========================================================*/
'use strict';

const IDLE_MAX_SEC = 12 * 3600;      // 单次离线结算上限（12 小时）
const IDLE_TYPES = {
  gather: { key: 'gather', name: '采集', desc: '自动循环资源点：受工具/天赋/生活等级影响' },
  fish: { key: 'fish', name: '钓鱼', desc: '在指定渔区垂钓，产出按鱼种权重' },
  combat: { key: 'combat', name: '战斗', desc: '自动讨伐区域怪物：经验 / 金币 / 材料 / 装备' }
};

const Idle = {
  queue: [],
  running: false,
  startedAt: 0,
  acc: 0,
  _seq: 1,
  lastReport: null,

  /* ---------- 队列管理 ---------- */
  add(cfg) {
    const t = {
      id: this._seq++,
      type: cfg.type || 'gather',
      skill: cfg.skill || 'mine',
      target: cfg.target || '',     // 物品 id / 渔区 key / 大区 key
      mode: cfg.mode || 'count',    // count | time
      quota: cfg.mode === 'time' ? Math.max(60, cfg.quota | 0) : Math.max(1, cfg.quota | 0),
      loop: !!cfg.loop,
      loopN: cfg.loopN || 0,        // 0 = 无限循环
      // 进度
      done: 0, sec: 0, loops: 0, finished: false, stopReason: '', frac: 0
    };
    this.queue.push(t);
    return t;
  },
  remove(id) { this.queue = this.queue.filter(t => t.id !== id); },
  move(id, dir) {
    const i = this.queue.findIndex(t => t.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= this.queue.length) return;
    const t = this.queue[i]; this.queue[i] = this.queue[j]; this.queue[j] = t;
  },
  clear() { this.queue = []; },
  active() { return this.queue.find(t => !t.finished) || null; },
  start(p) {
    if (!this.queue.length) { UI.toast('请先添加挂机任务', '#ff9a9a'); return false; }
    this.queue.forEach(t => { if (t.finished && (!t.loop || (t.loopN && t.loops >= t.loopN))) { } });
    this.resetProgress();
    this._ap = { acc: 0, travelT: 0, dest: '' };
    this.running = true; this.startedAt = Date.now(); this.acc = 0;
    UI.toast('开始挂机：队列共 ' + this.queue.length + ' 项', '#9fd06a');
    return true;
  },
  stop(reason) {
    if (!this.running) return;
    this.running = false;
    /* 停止挂机：取消自动导航，人物不再自行跑图 */
    this._ap = { acc: 0, travelT: 0, dest: '' };
    if (UI.game && UI.game.route) UI.game.cancelRoute();
    this.lastReport = this.report();
    UI.toast('挂机结束（' + (reason || '手动停止') + '）总时长 ' + fmtTime(Math.round(this.lastReport.sec)), '#ffd76a');
  },
  resetProgress() {
    this.queue.forEach(t => { t.done = 0; t.sec = 0; t.loops = 0; t.finished = false; t.stopReason = ''; t.frac = 0; });
  },

  /* ---------- 配额换算 ---------- */
  remainQuota(t) {
    if (t.mode === 'time') return Math.max(0, t.quota - t.sec);
    // 次数模式折算成剩余秒数
    const per = this.actionTime(t);
    return Math.max(0, (t.quota - t.done) * per);
  },
  quotaDone(t) {
    if (t.mode === 'time') return t.sec >= t.quota - 1e-6;
    return t.done >= t.quota;
  },
  /** 单次动作耗时（秒） */
  actionTime(t) {
    const p = UI.game.player;
    if (t.type === 'combat') {
      return this.combatKillTime(t);
    }
    if (t.type === 'fish') return Math.max(0.6, 6.0 / (1 + p.life.fish.lv * 0.01 + this.toolBonus('fish') + (p.stats.fishSpeed || 0) / 100));
    return this.gatherTime(t.skill);
  },
  gatherTime(skill) {
    const p = UI.game.player;
    const base = { mine: 3.0, log: 2.2, herb: 2.0, bug: 2.5, fish: 6.0 }[skill] || 3;
    const life = p.life[skill];
    return Math.max(0.6, base / (1 + life.lv * 0.01 + this.toolBonus(skill) + (p.stats.gatherSpeed || 0) / 100));
  },
  toolBonus(skill) {
    const p = UI.game.player;
    const alt = { mine: [5001, 5002, 5003], log: [5011, 5012], herb: [5021, 5022], fish: [5031, 5032], bug: [5041] }[skill] || [];
    for (const tid of alt) {
      if (p.countItem(tid) > 0 && ITEMS[tid].toolSpeed) return ITEMS[tid].toolSpeed * 0.4;
    }
    return 0;
  },
  combatKillTime(t) {
    const p = UI.game.player;
    const reg = REGION_BY_KEY[t.target];
    const lv = clamp(Math.round((reg.lv[0] + reg.lv[1]) / 2), 1, 60);
    const hp = 50 * levelMult(lv) * (reg.diff || 1);
    const dps = Math.max(1, p.stats.atk * (p.stats.aspd || 1) * 1.1 + p.stats.matk * 0.8);
    return clamp(hp / dps + 1.6, 1.2, 40);
  },

  /* ---------- 产出 ---------- */
  produce(t, sec) {
    const p = UI.game.player;
    const R = this.total;
    if (t.type === 'combat') {
      const per = Math.max(1.2, this.combatKillTime(t));
      t.frac += sec / per;
      let n = Math.floor(t.frac); t.frac -= n;
      if (n <= 0) { t.sec += sec; return; }
      n = Math.min(n, 400);
      this.combatYield(t, n);
      t.done += n; t.sec += sec;
      R.kills += n;
      return;
    }
    const per = Math.max(0.6, this.actionTime(t));
    t.frac += sec / per;
    let n = Math.floor(t.frac); t.frac -= n;
    if (n <= 0) { t.sec += sec; return; }
    n = Math.min(n, 400);
    if (t.type === 'fish') this.fishYield(t, n);
    else this.gatherYield(t, n);
    t.done += n; t.sec += sec;
    R.gathers += n;
  },
  gatherYield(t, n) {
    const p = UI.game.player, R = this.total;
    const id = t.target, def = ITEMS[id];
    const req = def.lv || 1;
    if (p.life[t.skill].lv < req) { t.finished = true; t.stopReason = SKILL_CN[t.skill] + '等级不足'; return; }
    const rareRoll = rollQuality(def.price >= 300 ? 'gather_rare' : 'gather', 1, Math.floor(p.stats.rareFind / 20));
    const q = clamp(rareRoll + Math.floor(p.stats.gatherPct / 40), 1, 10);
    let amount = n;
    if (chance(0.05 + p.stats.gatherPct / 200)) amount += Math.ceil(n * 0.05);
    if (chance(p.stats.doubleGather / 100)) amount *= 2;
    const left = p.addItem(id, amount, q);
    this._addItemStat(id, amount - left, q);
    if (left && left === amount) { t.finished = true; t.stopReason = '背包已满'; }
    const exp = Math.round((3 + req * 0.4) * n);
    this._addLife(t.skill, exp);
    const pexp = Math.round((p.life[t.skill].lv * 2 + 4) * n);
    this._addExp(pexp);
  },
  fishYield(t, n) {
    const p = UI.game.player;
    let list = Object.values(ITEMS).filter(i => i.sub === 'fish' && (!t.target || i.region === t.target));
    if (!list.length) list = Object.values(ITEMS).filter(i => i.sub === 'fish');
    for (let i = 0; i < n; i++) {
      const f = weightedPick(list, x => Math.max(1, 12 - x.qbase * 1.4));
      const q = rollFishQuality(f);
      const left = p.addItem(f.id, 1, q);
      if (!left) this._addItemStat(f.id, 1, q);
      else { t.finished = true; t.stopReason = '背包已满'; break; }
      this._addLife('fish', 6 + f.qbase * 3);
      this._addExp(10 + f.qbase * 8);
    }
  },
  combatYield(t, n) {
    const p = UI.game.player, R = this.total;
    const reg = REGION_BY_KEY[t.target] || REGION_BY_KEY.plain;
    const lv = clamp(Math.round((reg.lv[0] + reg.lv[1]) / 2), 1, 60);
    const pool = MONSTERS[reg.key] || MONSTERS.plain;
    const names = (pool.normal || []).concat(pool.elite || []);
    const shapes = names.map(m => m.shape);
    const exp = Math.round(lv * 10 * 0.35) * n;
    const got = p.addGold(Math.round(lv * 5 * 0.5) * n);
    this._addExp(exp);
    R.gold += got;
    // 区域资源掉落
    const res = [];
    ['ore', 'wood', 'herb', 'bug'].forEach(k => (reg.res[k] || []).forEach(e => res.push(e)));
    for (let i = 0; i < n; i++) {
      if (chance(0.35) && res.length) {
        const e = choice(res);
        const left = p.addItem(e.id, 1, rollQuality('normal', 1, 0));
        if (!left) this._addItemStat(e.id, 1, 2);
      }
      if (chance(0.22) && shapes.length) {
        const parts = MOB_PARTS[choice(shapes)];
        if (parts) for (const d of parts) {
          if (chance(d.p * 0.7)) { const left = p.addItem(d.id, 1, rollQuality('normal', 1, 0)); if (!left) this._addItemStat(d.id, 1, 2); }
        }
      }
      if (chance(0.08)) {
        const sid = choice(MOB_SUPPLY).id;
        const left = p.addItem(sid, 1, 2);
        if (!left) this._addItemStat(sid, 1, 2);
      }
      if (chance(0.035)) {
        const g = rollEquipDrop(lv, chance(0.15) ? 'elite' : 'normal');
        if (p.addInstance(g)) R.equips.push(gearTitle(g));
        else { t.finished = true; t.stopReason = '背包已满'; }
      }
      if (chance(0.01)) { p.addItem(4316, 1, 2); this._addItemStat(4316, 1, 2); }
    }
    if (!p.bag.some(s => !s)) { t.finished = true; t.stopReason = '背包已满'; }
  },

  /* ---------- 累计容器 ---------- */
  total: null,
  _initTotal() {
    return {
      sec: 0, exp: 0, gold: 0, gathers: 0, kills: 0,
      items: {}, life: {}, equips: [], tasks: {}, lvUp: 0
    };
  },
  _addItemStat(id, n, q) {
    if (n <= 0) return;
    const R = this.total, e = R.items[id] || (R.items[id] = { n: 0, best: 0 });
    e.n += n; e.best = Math.max(e.best || 0, q || 2);
  },
  _addLife(skill, v) {
    const R = this.total;
    R.life[skill] = (R.life[skill] || 0) + v;
    const p = UI.game.player;
    p.addLifeExp(skill, v);
  },
  _addExp(v) {
    const p = UI.game.player;
    const lv0 = p.lv;
    R0(this.total, v);
    const before = p.exp;
    p.addExp && p.addExp(v, UI.game);
    this.total.lvUp += Math.max(0, p.lv - lv0);
  },

  /* ---------- 在线挂机：驱动人物自动前往资源点，抵达后真实采集 ---------- */
  _ap: { acc: 0, travelT: 0, dest: '' },
  /** 找到当前任务对应的资源点（由近及远扩大搜索） */
  findNode(g, t) {
    const p = g.player;
    const tx = Math.floor(p.x / TILE_PX), ty = Math.floor(p.y / TILE_PX);
    for (const rad of [5, 12, 24, 40]) {
      const list = g.world.objectsNear(tx, ty, rad) || [];
      let best = null, bd = 1e9;
      for (const it of list) {
        const nd = it.o && it.o.node; if (!nd) continue;
        if (t.type === 'fish') {
          if (nd.skill !== 'fish') continue;
          if (t.target && nd.area !== t.target) continue;
        } else {
          if (nd.itemId !== +t.target) continue;
          if (nd.amount <= 0) continue;                       // 已采空，换一个
        }
        if ((nd.req || 1) > p.life[nd.skill].lv) continue;    // 等级不够，跳过
        const dd = dist(it.tx, it.ty, tx, ty);
        if (dd < bd) { bd = dd; best = { node: nd, tx: it.tx, ty: it.ty, d: dd }; }
      }
      if (best) return best;
    }
    return null;
  },
  /** 附近没有目标资源 → 找有该资源的大区中心 */
  regionFor(g, t) {
    const p = g.player, list = [];
    if (t.type === 'fish') {
      const reg = REGIONS.find(r => r.fishArea === t.target);
      if (reg) list.push(reg);
    } else {
      const id = +t.target;
      REGIONS.forEach(r => ['ore', 'wood', 'herb', 'bug'].forEach(k => (r.res[k] || []).forEach(e => {
        if (e.id === id && list.indexOf(r) < 0) list.push(r);
      })));
    }
    if (!list.length) return null;
    let best = null, bd = 1e9;
    for (const r of list) {
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
      const dd = dist(p.x / TILE_PX, p.y / TILE_PX, cx, cy);
      if (dd < bd) { bd = dd; best = { tx: Math.round(cx), ty: Math.round(cy), name: r.name }; }
    }
    return best;
  },
  travel(g, tx, ty, name) {
    const key = tx + ',' + ty;
    const same = g.route && g.route.tx === tx && g.route.ty === ty;
    if (same) { this._ap.dest = key; return; }                // 已在导航中
    g.setRoute(tx, ty, name);                                 // 静默设定（可能被手动移动取消，下一帧会重建）
    if (this._ap.dest !== key) {                              // 换目标时才提示一次
      this._ap.dest = key;
      UI.toast('挂机中：自动前往 ' + (name || '资源点') + ' (' + tx + ', ' + ty + ')', '#9fd06a');
    }
  },
  /** 战斗任务：自动前往目标大区，抵达后照常结算 */
  autoPilotCombat(g, t, dt) {
    const p = g.player, reg = REGION_BY_KEY[t.target];
    if (!reg) return false;
    const tx = Math.floor(p.x / TILE_PX), ty = Math.floor(p.y / TILE_PX);
    const inside = tx >= (reg.x0 || 0) && tx <= (reg.x1 || 0) && ty >= (reg.y0 || 0) && ty <= (reg.y1 || 0);
    if (inside) return false;                                 // 已在目标大区 → 走正常结算
    this.travel(g, Math.round((reg.x0 + reg.x1) / 2), Math.round((reg.y0 + reg.y1) / 2), reg.name);
    this._ap.travelT += dt;
    return this._ap.travelT < 180;                            // 超时则退回原地结算，避免卡死
  },
  /** 返回 true = 本帧由「真实采集 / 自动前往」接管（不再原地空转产出） */
  autoPilot(dt) {
    const g = UI.game;
    if (!g || g.inHome || !g.player || g.player.dead) return false;
    const t = this.active();
    if (!t) return false;
    const p = g.player;
    if (!p.bag.some(s => !s)) { t.finished = true; t.stopReason = '背包已满'; return false; }
    if (t.type === 'combat') return this.autoPilotCombat(g, t, dt);
    const hit = this.findNode(g, t);
    if (!hit) {                                               // 附近没有 → 自动前往有该资源的大区
      const dest = this.regionFor(g, t);
      if (dest) { this.travel(g, dest.tx, dest.ty, dest.name); this._ap.travelT += dt; }
      return this._ap.travelT < 120;                          // 找了 2 分钟还没到 → 退回原地结算
    }
    this._ap.travelT = 0;
    const nd = hit.node;
    const gx = hit.tx * TILE_PX + 16, gy = hit.ty * TILE_PX + 16;
    if (dist(p.x, p.y, gx, gy) > 2.0 * TILE_PX) {             // 还没走到 → 导航过去，移动中不产出
      this.travel(g, hit.tx, hit.ty, g.nodeName(nd));
      this._ap.acc = 0;
      return true;
    }
    if (g.route) g.cancelRoute();                             // 已抵达：停止导航
    if ((nd.req || 1) > p.life[nd.skill].lv) { t.finished = true; t.stopReason = SKILL_CN[nd.skill] + '等级不足'; return false; }
    const per = Math.max(0.35, g.gatherTime(nd));
    this._ap.acc += dt;
    if (this._ap.acc < per) return true;
    this._ap.acc = 0;
    /* 与手动一致：节点真实消耗；采空后自动补充（挂机视为持续产出） */
    if (nd.amount <= 0 && nd.skill !== 'fish') {
      nd.amount = nd.max; nd.respawnAt = 0;
      const ch = g.world.chunks.get((nd.tx >> 4) + ',' + (nd.ty >> 4));
      if (ch) ch.canvas = null;
    }
    g.finishGather({ skill: nd.skill, node: nd, hasTool: g.hasTool(nd.skill), quiet: true }, nd);
    t.done++; t.sec += per;
    this.total = this.total || this._initTotal();
    this.total.sec += per; this.total.gathers++;
    const tk = this.total.tasks[t.id] || (this.total.tasks[t.id] = { n: 0, type: t.type, target: t.target, loops: 0 });
    tk.n += 1;
    if (UI._nodeNd === nd) UI.refreshNode();
    if (this.quotaDone(t)) {
      if (t.loop && (t.loopN === 0 || t.loops + 1 < t.loopN)) { t.loops++; t.done = 0; t.sec = 0; tk.loops = t.loops; }
      else { t.finished = true; }
    }
    return true;
  },

  /* ---------- 主循环 ---------- */
  tick(dt) {
    if (!this.running) { Chat && Chat.tick && Chat.tick(dt); return; }
    Chat && Chat.tick && Chat.tick(dt);
    this.total = this.total || this._initTotal();
    /* 在线挂机：先驱动人物自动前往资源点并真实采集；未接管时才走原地结算 */
    if (this.autoPilot(dt)) {
      if (this.queue.every(t => t.finished)) this.stop('队列已完成');
      return;
    }
    this.acc += dt;
    let guard = 0;
    while (this.acc >= 2 && guard++ < 6) { this.acc -= 2; this.advance(2); }
    if (this.queue.every(t => t.finished)) this.stop('队列已完成');
  },
  advance(sec) {
    let left = sec, guard = 0;
    while (left > 1e-6 && guard++ < 200) {
      const t = this.active();
      if (!t) { left = 0; break; }
      const need = this.remainQuota(t);
      const use = Math.min(left, Math.max(0.001, need));
      this.produce(t, use);
      this.total.sec += use;
      const key = t.id;
      const tk = this.total.tasks[key] || (this.total.tasks[key] = { n: 0, type: t.type, target: t.target, loops: 0 });
      tk.n += use;
      left -= use;
      if (this.quotaDone(t)) {
        if (t.loop && (t.loopN === 0 || t.loops + 1 < t.loopN)) { t.loops++; t.done = 0; t.sec = 0; tk.loops = t.loops; }
        else { t.finished = true; }
      }
      if (t.finished) continue;
    }
  },
  /** 离线结算：调用前须已加载存档 / 初始化 UI.game */
  offline(elapsedSec) {
    const sec = Math.min(elapsedSec, IDLE_MAX_SEC);
    if (sec < 60) { this.lastReport = null; return null; }
    this.total = this._initTotal();
    const lv0 = UI.game.player.lv;
    let left = sec, guard = 0;
    while (left > 0 && guard++ < 20000) {
      const chunk = Math.min(30, left);
      this.advance(chunk);
      left -= chunk;
      if (this.queue.every(t => t.finished) && !this.queue.some(t => t.loop)) break;
      if (!this.queue.some(t => !t.finished)) break;
    }
    this.resetProgressSoft();
    this.lastReport = this.report();
    this.lastReport.lvUp = Math.max(0, UI.game.player.lv - lv0);
    Ach.check(UI.game);
    return this.lastReport;
  },
  resetProgressSoft() {
    this.queue.forEach(t => { t.done = 0; t.sec = 0; if (!t.loop) t.finished = false; else t.finished = false; t.stopReason = ''; t.frac = 0; });
  },
  report() {
    const R = this.total || this._initTotal();
    const items = Object.keys(R.items).map(id => ({
      id: +id, name: ITEMS[id].name, n: R.items[id].n, q: R.items[id].best || 2
    })).sort((a, b) => b.n - a.n);
    return {
      sec: Math.round(R.sec), exp: R.exp, gold: R.gold, gathers: R.gathers, kills: R.kills,
      life: R.life, equips: R.equips.slice(0, 12), items: items, lvUp: R.lvUp || 0,
      tasks: this.queue.map(t => ({
        type: t.type, skill: t.skill, target: t.target, mode: t.mode, quota: t.quota,
        done: Math.round(t.done), sec: Math.round(t.sec), loops: t.loops, finished: t.finished, stopReason: t.stopReason
      }))
    };
  },

  /* ---------- 目标清单（UI 用） ---------- */
  gatherTargets() {
    const p = UI.game.player;
    const out = [];
    REGIONS.forEach(r => ['ore', 'wood', 'herb', 'bug'].forEach(k => (r.res[k] || []).forEach(e => {
      const skill = { ore: 'mine', wood: 'log', herb: 'herb', bug: 'bug' }[k];
      if (out.some(o => o.id === e.id)) return;
      out.push({ id: e.id, skill: skill, lv: e.lv || 1, name: ITEMS[e.id].name, region: r.name });
    })));
    return out.filter(o => p.life[o.skill].lv >= 1).sort((a, b) => a.lv - b.lv);
  },
  fishTargets() {
    const areas = {};
    Object.values(ITEMS).forEach(i => { if (i.sub === 'fish') (areas[i.region] = areas[i.region] || []).push(i.name); });
    return Object.keys(areas).map(k => {
      const reg = REGIONS.find(r => r.fishArea === k);
      return { key: k, name: (reg ? reg.name : k) + '渔区', count: areas[k].length, sample: areas[k].slice(0, 3).join('、') };
    });
  },
  combatTargets() {
    const p = UI.game.player;
    return REGIONS.filter(r => !!p.unlockedRegions[r.key] || p.lv >= r.lv[0])
      .map(r => ({ key: r.key, name: r.name, lv: r.lv, diff: r.diff }));
  },

  serialize() {
    return {
      queue: this.queue.map(t => ({
        id: t.id, type: t.type, skill: t.skill, target: t.target, mode: t.mode,
        quota: t.quota, loop: t.loop, loopN: t.loopN
      })),
      running: this.running, startedAt: this.startedAt, _seq: this._seq
    };
  },
  load(d) {
    if (!d) return;
    this.queue = (d.queue || []).map(c => this.add(c));
    this._seq = d._seq || this.queue.length + 1;
    this.resetProgress();
    this.running = !!d.running;
    this.startedAt = d.startedAt || 0;
  }
};

function R0(total, v) { total.exp += v; }
