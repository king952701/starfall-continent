/* ============================================================
 * 21_market.js —— 拍卖行：上架 / 下架 / 购买 / NPC 货源
 * 玩家挂单会把物品寄存到拍卖行，下架或成交后才会回到背包
 * ==========================================================*/
'use strict';

const MARKET_TAX = 0.05;          // 成交手续费
const MARKET_MAX_NPC = 36;        // NPC 挂单保有量
const MARKET_MAX_MINE = 20;       // 玩家同时上架上限

const Market = {
  list: [],
  _lid: 1,
  npcT: 0,

  /* ---------- 挂单 ---------- */
  add(o) {
    const t = {
      lid: this._lid++, seller: o.seller, mine: !!o.mine,
      inst: o.inst, unit: Math.max(1, Math.round(o.unit)), ts: Date.now()
    };
    this.list.push(t);
    return t;
  },
  get(lid) { return this.list.find(t => t.lid === lid); },
  remove(lid) { this.list = this.list.filter(t => t.lid !== lid); },
  mine() { return this.list.filter(t => t.mine); },
  countListed(id) { return this.list.filter(t => t.inst && t.inst.id === id).length; },
  totalOf(t) { return t.unit * (t.inst.type === 'gear' ? 1 : (t.inst.n || 1)); },

  /** 上架：从背包扣除 → 寄存到拍卖行 */
  listItem(inst, unit, p) {
    if (!inst) return { ok: false, msg: '没有目标物品' };
    if (this.mine().length >= MARKET_MAX_MINE) return { ok: false, msg: '上架数量已达上限 ' + MARKET_MAX_MINE };
    const idx = p.bag.indexOf(inst);
    if (idx < 0) return { ok: false, msg: '该物品不在背包里' };
    unit = Math.max(1, Math.round(unit));
    if (!(unit > 0)) return { ok: false, msg: '请输入有效单价' };
    const stored = JSON.parse(JSON.stringify(inst));
    p.bag[idx] = null;
    const t = this.add({ seller: p.name, mine: true, inst: stored, unit: unit });
    return {
      ok: true, t: t,
      msg: '已上架 ' + (stored.type === 'gear' ? gearFullName(stored) : '[' + ITEMS[stored.id].name + ']') +
        '　单价 ' + fmt(unit) + ' 金（成交后扣 ' + Math.round(MARKET_TAX * 100) + '% 手续费）'
    };
  },
  /** 下架：退回背包 */
  cancel(lid, p) {
    const t = this.get(lid);
    if (!t) return { ok: false, msg: '挂单不存在' };
    if (!t.mine) return { ok: false, msg: '只能下架自己的挂单' };
    if (!p.addInstance(t.inst)) return { ok: false, msg: '背包没有空位，无法退回' };
    this.remove(lid);
    return { ok: true, msg: '已下架并退回背包' };
  },
  /** 购买 */
  buy(lid, p) {
    const t = this.get(lid);
    if (!t) return { ok: false, msg: '挂单不存在' };
    const price = this.totalOf(t);
    if (p.gold < price) return { ok: false, msg: '金币不足（需 ' + fmt(price) + ' 金）' };
    const inst = JSON.parse(JSON.stringify(t.inst));
    if (!p.addInstance(inst)) return { ok: false, msg: '背包已满，无法购买' };
    p.gold -= price;
    if (t.mine) {
      // 自己的挂单被（模拟 NPC）买走：返还税后金币
      const gain = Math.round(price * (1 - MARKET_TAX));
      p.gold += gain;
      this.remove(lid);
      return { ok: true, msg: '成交：' + ITEMS[inst.id].name + '　收入 ' + fmt(gain) + ' 金（已扣 ' + Math.round(MARKET_TAX * 100) + '% 税）' };
    }
    this.remove(lid);
    if (typeof Snd !== 'undefined' && Snd.play) Snd.play('buy');
    return { ok: true, msg: '购买成功：' + (inst.type === 'gear' ? gearFullName(inst) : ITEMS[inst.id].name) + '　-' + fmt(price) + ' 金' };
  },

  /* ---------- NPC 货源 ---------- */
  refreshNpc(force) {
    const npcNow = this.list.filter(t => !t.mine).length;
    const need = force ? MARKET_MAX_NPC : MARKET_MAX_NPC - npcNow;
    if (need <= 0) return 0;
    let n = 0;
    for (let i = 0; i < need; i++) { if (this.randomNpcListing()) n++; }
    return n;
  },
  randomNpcListing() {
    const pool = Object.values(ITEMS).filter(d => d.type !== 'gear' && d.price >= 3);
    if (!pool.length) return null;
    if (chance(0.35)) {                                  // 装备
      const lv = clamp(irnd(5, 60), 1, 60);
      const g = rollEquipDrop(lv, chance(0.3) ? 'elite' : 'normal');
      const unit = Math.round(gearValue(g) * rnd(0.9, 1.9)) + 20;
      return this.add({ seller: choice(NPC_NAMES), inst: JSON.parse(JSON.stringify(g)), unit: unit });
    }
    const d = choice(pool);
    if (d.type === 'use' || d.sub === 'tool') return null;
    const n = chance(0.7) ? irnd(1, 5) : irnd(5, 30);
    const inst = { type: 'mat', id: d.id, q: chance(0.4) ? irnd(3, 6) : 2, n: n, lv: d.lv || 1 };
    const unit = Math.max(1, Math.round(itemPrice({ id: d.id, q: inst.q }) * rnd(0.85, 1.6)));
    return this.add({ seller: choice(NPC_NAMES), inst: inst, unit: unit });
  },
  /** 随时间补货；偶尔会有 NPC 买走玩家的商品 */
  tick(dt) {
    this.npcT -= dt;
    if (this.npcT > 0) return;
    this.npcT = 25;
    if (this.list.filter(t => !t.mine).length < MARKET_MAX_NPC) this.refreshNpc();
    // NPC 收购：低概率买走玩家的高性价比挂单
    if (this.mine().length && chance(0.25)) {
      const p = UI.game.player;
      const mine_list = this.mine();
      const cheap = mine_list.filter(t => t.unit <= itemPrice(t.inst) * 1.6);
      if (cheap.length) {
        const t = choice(cheap);
        const price = this.totalOf(t);
        p.gold += Math.round(price * (1 - MARKET_TAX));
        const name = t.inst.type === 'gear' ? gearFullName(t.inst) : ITEMS[t.inst.id].name;
        this.remove(t.lid);
        UI.toast('拍卖成交：' + name + ' 已被收购，收入 ' + fmt(Math.round(price * (1 - MARKET_TAX))) + ' 金', '#ffdf94');
        UI.log('【拍卖行】' + name + ' 成交，收入 ' + fmt(Math.round(price * (1 - MARKET_TAX))) + ' 金', '#ffdf94');
      }
    }
  },

  /* ---------- 查询 ---------- */
  search(kw, sort, onlyMine) {
    let list = this.list.slice();
    if (onlyMine) list = list.filter(t => t.mine);
    if (kw) {
      const k = String(kw).toLowerCase();
      list = list.filter(t => {
        const nm = (t.inst.type === 'gear' ? gearTitle(t.inst) + ITEMS[t.inst.id].name : ITEMS[t.inst.id].name).toLowerCase();
        return nm.indexOf(k) >= 0 || String(t.inst.id) === k || (t.seller || '').toLowerCase().indexOf(k) >= 0;
      });
    }
    const total = t => this.totalOf(t);
    if (sort === 'unit') list.sort((a, b) => a.unit - b.unit);
    else if (sort === 'unitDesc') list.sort((a, b) => b.unit - a.unit);
    else if (sort === 'total') list.sort((a, b) => total(a) - total(b));
    else if (sort === 'new') list.sort((a, b) => b.ts - a.ts);
    else list.sort((a, b) => b.ts - a.ts);
    return list;
  },

  serialize() {
    return {
      list: this.list.map(t => ({
        lid: t.lid, seller: t.seller, mine: t.mine, inst: t.inst, unit: t.unit, ts: t.ts
      })),
      _lid: this._lid
    };
  },
  load(d) {
    this.list = [];
    if (!d) { this.refreshNpc(true); return; }
    (d.list || []).forEach(o => this.list.push({
      lid: o.lid, seller: o.seller, mine: !!o.mine, inst: o.inst, unit: o.unit, ts: o.ts || Date.now()
    }));
    this._lid = d._lid || (this.list.length + 1);
    this.refreshNpc();
  }
};
