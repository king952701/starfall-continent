/* ============================================================
 * 12_entities.js —— 玩家 / 怪物实体
 * 包含成长曲线、属性聚合、AI 行为树、掉落判定
 * ==========================================================*/
'use strict';

/* 经验曲线取 BALANCE 总表（40_balance.js）；未加载时退化为等价硬编码值 */
function expToNext(lv) {
  if (typeof BAL !== 'undefined') return BAL.expToNext(lv);
  return Math.round(100 * Math.pow(lv, 1.8) * (1 + lv * 0.02));
}
function lifeExpToNext(lv) {
  if (typeof BAL !== 'undefined') return BAL.lifeExpToNext(lv);
  return Math.round(50 * Math.pow(lv, 1.5));
}

class Entity {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hp = 100; this.maxHp = 100; this.shield = 0;
    this.dead = false; this.combo = 0; this.comboT = 0;
    this.controlT = 0; this.aimAngle = 0; this.face = 'down';
    this.animT = 0; this.frame = 0; this.invulnT = 0;
    this.stats = {}; this.buffs = new BuffHolder(this);
    this.lv = 1;
  }
  updateCommon(dt) {
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    if (this.controlT > 0) this.controlT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    this.shield = Math.max(0, this.shield);
  }
  /** 圆形与地形的碰撞移动（ignoreWater：玩家游泳时水域不再阻挡） */
  moveWithCollision(world, dx, dy, r, ignoreWater) {
    if (ignoreWater === undefined) ignoreWater = !!this.isPlayer;
    const tryStep = (nx, ny) => {
      const pts = [[nx - r, ny - r], [nx + r, ny - r], [nx - r, ny + r], [nx + r, ny + r], [nx, ny]];
      for (const p of pts) {
        const tx = Math.floor(p[0] / TILE_PX), ty = Math.floor(p[1] / TILE_PX);
        if (world.solidTile(tx, ty, ignoreWater)) return false;
      }
      this.x = nx; this.y = ny; return true;
    };
    if (dx) { tryStep(this.x + dx, this.y) || tryStep(this.x + dx * 0.3, this.y); }
    if (dy) { tryStep(this.x, this.y + dy) || tryStep(this.x, this.y + dy * 0.3); }
  }
  /** 当前是否被控制（冰冻/眩晕/定身/恐惧） */
  isControlled() {
    const kind = this.buffs.controlKind();
    return kind === 'freeze' || kind === 'stun' || kind === 'paralyze' || kind === 'root' || kind === 'fear';
  }
  dashTo(tx, ty, game) {
    const d = dist(this.x, this.y, tx, ty);
    if (d < 1) return;
    const step = 16;
    const steps = Math.ceil(d / step);
    for (let i = 0; i < steps; i++) {
      const nx = lerp(this.x, tx, (i + 1) / steps), ny = lerp(this.y, ty, (i + 1) / steps);
      if (game && game.world.solidTile(Math.floor(nx / TILE_PX), Math.floor(ny / TILE_PX), !!this.isPlayer)) break;
      this.x = nx; this.y = ny;
    }
  }
}

/* ============================ 玩家 ============================ */
class Player extends Entity {
  constructor(name, clsKey) {
    super(0, 0);
    this.isPlayer = true;
    this.name = name; this.clsKey = clsKey; this.cls = CLASSES[clsKey];
    this.lv = 1; this.exp = 0; this.gold = 500; this.diamond = 0;
    this.mp = 50; this.maxMp = 50;
    this.bag = new Array(60).fill(null);
    this.bagMax = 60;
    this.equip = {};
    this.talents = {}; this.respecTimes = 0;
    this.life = {}; GATHER_SKILLS.concat(CRAFT_SKILLS).forEach(k => this.life[k] = { lv: 1, exp: 0, cnt: 0, val: 0, best: 0, bestName: '' });
    this.cds = {}; this.dashCd = 0; this.attackCd = 0; this.moving = false;
    this.counterT = 0; this.counterMult = 0;
    this.stat = { kills: 0, boss: 0, gathers: 0, crafts: 0, fish: 0, chests: 0, deaths: 0, maxCombo: 0, playSec: 0 };
    this.seen = {};                                  // 图鉴：已发现的物品 id
    this.gearProcs = []; this.home = null; this.unlockedRegions = { plain: 1 };
    this.recompute();
    this.hp = this.maxHp; this.mp = this.maxMp;
  }

  /* ---------- 属性聚合 ---------- */
  gatherMods() {
    const M = {};
    const add = (k, v) => { M[k] = (M[k] || 0) + v; };
    // 装备词条 + 特效
    for (const slot in this.equip) {
      const it = this.equip[slot]; if (!it) continue;
      for (const a of it.affix) add(a.key, a.v);
      if (it.mods) for (const k in it.mods) add(k, it.mods[k]);
    }
    // 天赋
    for (const id in this.talents) {
      const t = TALENT_MAP[id], l = this.talents[id];
      if (!t || !t.mods) continue;
      for (const k in t.mods) add(k, t.mods[k] * l);
    }
    // Buff
    const bm = this.buffs.mods();
    for (const k in bm) add(k, bm[k]);
    return M;
  }
  recompute() {
    const L = this.lv, c = this.cls.mods;
    const b = {
      hp: 100 + (L - 1) * 12 + (L - 1) * (L - 1) * 0.3,
      mp: 50 + (L - 1) * 6 + (L - 1) * (L - 1) * 0.15,
      atk: 10 + (L - 1) * 2.2 + (L - 1) * (L - 1) * 0.05,
      matk: 8 + (L - 1) * 2 + (L - 1) * (L - 1) * 0.05,
      def: 5 + (L - 1) * 1.5 + (L - 1) * (L - 1) * 0.03,
      mdef: 4 + (L - 1) * 1.3 + (L - 1) * (L - 1) * 0.03
    };
    const M = this.gatherMods();
    const all = (M.allStat || 0);
    const pctOf = k => 1 + (M[k] || 0) / 100 + all / 100;
    // 装备主属性
    let gearAtk = 0, gearMatk = 0, gearDef = 0;
    for (const slot in this.equip) {
      const it = this.equip[slot]; if (!it) continue;
      const def = ITEMS[it.id];
      const main = gearMainStat(it);
      if (def.main === 'atk') gearAtk += main;
      else if (def.main === 'matk') gearMatk += main;
      else if (def.main === 'acc') { gearAtk += Math.round(main * 0.4); gearMatk += Math.round(main * 0.4); gearDef += Math.round(main * 0.3); }
      else gearDef += main;
    }
    if (this.cls.special && this.cls.special.mpBonus) b.mp *= (1 + this.cls.special.mpBonus / 100);
    const prevMax = this.maxHp, prevMaxMp = this.maxMp;
    this.maxHp = Math.round((b.hp * c.hp + (M.hp || 0)) * pctOf('hpPct'));
    this.maxMp = Math.round((b.mp + (M.mp || 0)) * (1 + (M.mpPct || 0) / 100));
    const s = this.stats = {};
    s.atk = Math.round((b.atk * c.atk + gearAtk) * pctOf('atkPct'));
    s.matk = Math.round((b.matk * c.matk + gearMatk) * pctOf('matkPct'));
    s.def = Math.round((b.def * c.def + gearDef) * pctOf('defPct'));
    s.mdef = Math.round((b.mdef * c.mdef + gearDef * 0.6) * pctOf('defPct'));
    s.crit = (5 * c.crit) + (M.crit || 0);
    s.cdmg = 150 + (M.cdmg || 0);
    s.aspd = 1.0 * c.aspd * (1 + (M.aspd || 0) / 100);
    s.dodge = clamp(3 * c.dodge + (M.dodge || 0), 0, 40);
    s.hit = 0 + (M.hit || 0);
    s.moveSpd = 5.0 * (1 + (M.moveSpd || 0) / 100);
    s.lifesteal = M.lifesteal || 0;
    s.pen = clamp(M.pen || 0, 0, 50);
    s.elemDmg = M.elemDmg || 0;
    s.reduction = clamp(M.reduction || 0, 0, 75);
    s.hpRegen = (0.5 + (M.hpRegenPct || 0) * 0.02) * (1 + (M.hpRegenPct || 0) / 100);
    s.mpRegen = 0.3 * (1 + (M.mpRegenPct || 0) / 100);
    s.cdr = M.cdr || 0;
    s.dropPct = M.dropPct || 0;
    s.goldPct = M.goldPct || 0;
    s.expPct = M.expPct || 0;
    s.critGuard = M.critGuard || 0;
    s.gatherSpeed = M.gatherSpeed || 0;
    s.gatherPct = M.gatherPct || 0;
    s.rareFind = M.rareFind || 0;
    s.doubleGather = M.doubleGather || 0;
    s.craftRate = M.craftRate || 0;
    s.craftCrit = M.craftCrit || 0;
    s.matSave = M.matSave || 0;
    s.gearQuality = M.gearQuality || 0;
    s.ccImmune = M.ccImmune || 0;
    // 装备触发特效
    this.gearProcs = [];
    this.procUndying = false; this.procLastStand = false; this.procThorn = 0;
    this.undyingUsed = false; this.lastStandUsed = false;
    for (const slot in this.equip) {
      const it = this.equip[slot]; if (!it || !it.procs) continue;
      for (const p of it.procs) {
        if (p.t === 'undying') this.procUndying = true;
        else if (p.t === 'laststand') this.procLastStand = true;
        else if (p.t === 'thorn') this.procThorn += p.v;
        else this.gearProcs.push(p);
      }
    }
    this.hp = Math.min(this.hp + Math.max(0, this.maxHp - prevMax), this.maxHp);
    this.mp = Math.min(this.mp + Math.max(0, this.maxMp - prevMaxMp), this.maxMp);
    this.power = Math.round(s.atk * 3 + s.matk * 2 + s.def * 4 + s.mdef * 2 + this.maxHp * 0.5 + s.crit * 8 + s.cdmg * 2);
  }
  talentLevel(id) { return this.talents[id] || 0; }
  talentSpent() { let s = 0; for (const id in this.talents) s += TALENT_MAP[id].cost * this.talents[id]; return s; }
  talentTotal() { return talentPointsOf(this.lv); }

  /* ---------- 背包 ---------- */
  countItem(id, q) {
    let n = 0;
    for (const it of this.bag) if (it && it.id === id && (!q || it.q === q)) n += it.n || 1;
    return n;
  }
  addItem(id, n, q, lv) {
    n = n || 1;
    const def = ITEMS[id]; if (!def) return 0;
    this.seen[id] = 1;                       // 图鉴解锁
    if (def.type === 'gear') {
      const inst = newGear(id, lv || def.lv || 1, q || 2, 0);
      return this.addInstance(inst) ? n : 0;
    }
    q = q || 2;
    const max = def.stack || 1;
    // 堆叠
    for (const it of this.bag) {
      if (it && it.id === id && it.q === q && (it.n || 1) < max) {
        const can = Math.min(n, max - (it.n || 1));
        it.n = (it.n || 1) + can; n -= can;
        if (n <= 0) return 0;
      }
    }
    for (let i = 0; i < this.bag.length; i++) {
      if (this.bag[i]) continue;
      const add = Math.min(n, max);
      this.bag[i] = { uid: _uidSeq++, type: def.type, id: id, q: q, n: add, lv: lv || def.lv || 1 };
      n -= add;
      if (n <= 0) return 0;
    }
    return n; // 背包满，返回剩余
  }
  addInstance(inst) {
    if (inst) this.seen[inst.id] = 1;        // 图鉴解锁
    for (let i = 0; i < this.bag.length; i++) {
      if (!this.bag[i]) { this.bag[i] = inst; return true; }
    }
    return false;
  }
  removeAt(idx, n) {
    const it = this.bag[idx]; if (!it) return false;
    if (it.type === 'gear') { this.bag[idx] = null; return true; }
    it.n -= (n || 1);
    if (it.n <= 0) this.bag[idx] = null;
    return true;
  }
  removeItem(id, n) {
    n = n || 1;
    for (let i = 0; i < this.bag.length; i++) {
      const it = this.bag[i];
      if (it && it.id === id) {
        const take = Math.min(n, it.n || 1);
        it.n -= take; n -= take;
        if (it.n <= 0) this.bag[i] = null;
        if (n <= 0) return true;
      }
    }
    return n <= 0;
  }
  sortBag() {
    const list = this.bag.filter(Boolean);
    list.sort((a, b) => (b.q - a.q) || (a.id - b.id));
    this.bag = new Array(this.bagMax).fill(null);
    list.forEach((it, i) => { if (i < this.bag.length) this.bag[i] = it; });
  }
  equipItem(idx) {
    const it = this.bag[idx]; if (!it || it.type !== 'gear') return false;
    const slot = ITEMS[it.id].slot;
    const prev = this.equip[slot];
    this.equip[slot] = it; this.bag[idx] = prev || null;
    this._gl = null;                       // 装备变了 → 外观指纹失效
    this.recompute(); return true;
  }
  unequip(slot) {
    const it = this.equip[slot]; if (!it) return false;
    if (!this.addInstance(it)) return false;
    this.equip[slot] = null; this._gl = null;
    this.recompute(); return true;
  }

  /* ---------- 装备 → 外观（B3：装备影响外观） ----------
   * 返回 { helm, body, pants, cloak, wep }，未装备部位为 null（外观自动退回职业配色 = 零回归）。
   * 按装备指纹缓存，避免每帧重建对象。 */
  gearLook() {
    const eq = this.equip || {};
    const sig = ['helmet', 'chest', 'legs', 'offhand', 'weapon']
      .map(s => { const it = eq[s]; return it ? (it.id + ':' + (it.q || 0) + ':' + (it.enhance || 0)) : '0'; }).join('/');
    if (this._gl && this._gl.hash === sig) return this._gl;
    const col = it => { const d = ITEMS[it.id]; return (d && d.color) || '#8a8a9a'; };
    const g = { hash: sig, helm: null, body: null, pants: null, cloak: null, wep: null };
    if (eq.helmet) g.helm = { col: col(eq.helmet), tier: eq.helmet.q || 0 };
    if (eq.chest) g.body = { col: col(eq.chest), tier: eq.chest.q || 0 };
    if (eq.legs) g.pants = { col: col(eq.legs) };
    if (eq.offhand) g.cloak = { col: col(eq.offhand) };          // 副手（盾/披挂）显示为背后披挂
    if (eq.weapon) {
      const d = ITEMS[eq.weapon.id] || {};
      g.wep = { kind: d.grp || d.icon || 'sword', col: col(eq.weapon), glow: (eq.weapon.q || 0) >= 6 };
    }
    this._gl = g;
    return g;
  }

  /* ---------- 经验 / 等级 ---------- */
  addExp(v, game) {
    if (this.cls.special && this.cls.special.exp) v *= 1;
    v = Math.round(v * (1 + this.stats.expPct / 100));
    this.exp += v;
    let up = 0;
    while (this.exp >= expToNext(this.lv) && this.lv < 60) {
      this.exp -= expToNext(this.lv); this.lv++; up++;
    }
    if (up) {
      this.recompute(); this.hp = this.maxHp; this.mp = this.maxMp;
      if (typeof Snd !== 'undefined' && Snd.play) Snd.play('level');   // 升级音（此前已定义但无人调用）
      game && game.toast('等级提升！ Lv.' + this.lv, '#ffd76a');
      game && game.fx.push({ x: this.x, y: this.y, r: 3 * TILE_PX, ttl: .8, color: '#ffd76a', type: 'circle' });
      game && Ach.check(game);
    }
    return up;
  }
  addGold(v) { const g = Math.round(v * (1 + this.stats.goldPct / 100)); this.gold += g; return g; }
  addLifeExp(skill, base) {
    const s = this.life[skill] || (this.life[skill] = { lv: 1, exp: 0 });
    s.exp += base;
    let up = 0;
    while (s.exp >= lifeExpToNext(s.lv) && s.lv < 100) { s.exp -= lifeExpToNext(s.lv); s.lv++; up++; }
    return up;
  }

  /* ---------- 战斗 ---------- */
  basicAttack(game) {
    if (this.attackCd > 0 || this.isControlled()) return false;
    const c = this.cls.basic;
    if (typeof Snd !== 'undefined' && Snd.play) Snd.play('swing');   // 挥砍起手
    this.atkT = 0.45;                                                // 攻击帧
    this.attackCd = 1 / Math.max(0.3, this.stats.aspd);
    /* 远程职业（弓 / 法杖）：普攻改为发射投射物，命中才结算（近战仍是即时扇形） */
    const WEP = (this.cls.iconSpec && this.cls.iconSpec.wep) || 'sword';
    if (this.isPlayer && game.spawnProj && (WEP === 'bow' || WEP === 'staff')) {
      game.spawnProj({
        x: this.x, y: this.y - 8, ang: this.aimAngle, spd: WEP === 'bow' ? 620 : 460, r: 4,
        range: c.range * TILE_PX + 64, owner: this, kind: WEP === 'bow' ? 'arrow' : 'orb',
        col: WEP === 'bow' ? '#e8e8f0' : '#9fe8ff',
        opts: { mult: c.mult, magic: !!c.magic, elem: this.elemAttack() }
      });
      return true;
    }
    const list = game.monsters.filter(m => !m.dead && dist(m.x, m.y, this.x, this.y) <= c.range * TILE_PX + 8);
    const inArc = list.filter(m => {
      const a = angleOf(this.x, this.y, m.x, m.y);
      const diff = Math.abs(((a - this.aimAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return diff <= c.arc;
    });
    game.fx.push({ x: this.x, y: this.y, ang: this.aimAngle, r: c.range * TILE_PX, arc: c.arc, ttl: .18, color: '#ffffff', type: 'cone' });
    for (const m of inArc) {
      const opts = { mult: c.mult, magic: !!c.magic, elem: this.elemAttack() };
      Combat.dealDamage(this, m, opts, game);
    }
    return inArc.length > 0;
  }
  elemAttack() {
    const b = this.buffs.list.map(x => BUFFS[x.id].elem).filter(Boolean);
    return b[0] || 'none';
  }
  castSkill(idx, game) {
    const sk = this.cls.skills[idx - 1]; if (!sk) return false;
    if (this.lv < sk.lv) { game.log('等级不足，技能未解锁'); return false; }
    if ((this.cds[sk.id] || 0) > 0) return false;
    if (this.isControlled()) return false;
    if (this.mp < sk.mp) { game.floatText(this, '魔力不足', '#7fcfff'); return false; }
    this.mp -= sk.mp;
    this.atkT = 0.6;                                                 // 施法帧（比普攻慢）
    this.cds[sk.id] = skillCd(sk, this.lv, this.stats.cdr);
    /* 施法音：按元素变调（火偏高、冰偏低、雷更高） */
    if (typeof Snd !== 'undefined' && Snd.play) {
      const EP = { fire: 1.08, ice: 0.90, frost: 0.90, thunder: 1.15, storm: 1.15, poison: 0.95, holy: 1.05, stellar: 1.0 };
      Snd.play('cast', { pitch: EP[sk.elem] || 1 });
    }
    Combat.cast(game, this, sk);
    game.fx.push({ x: this.x, y: this.y, r: 2 * TILE_PX, ttl: .2, color: '#9fe8ff', type: 'circle' });
    return true;
  }
  castTargets(targets, skill, info, game) {
    const hits = skill.hits || 1;
    for (let h = 0; h < hits; h++) {
      for (const t of targets) {
        if (t.dead) continue;
        const opts = {
          mult: info.mult / (hits > 1 ? 1 : 1), magic: skill.elem !== undefined && this.cls.key === 'mage',
          elem: skill.elem || this.elemAttack(), mustCrit: !!skill.mustCrit, proc: skill.proc
        };
        Combat.dealDamage(this, t, opts, game);
        if (skill.debuffId && t.buffs && (!game.playerOnly || true)) {
          if (!t.buffs.hasCcImmune()) BuffSys.apply(t, skill.debuffId, game);
        }
      }
    }
    if (targets.length) this.combo += targets.length;
  }
  roll(game) {
    if (this.dashCd > 0 || this.isControlled()) return false;
    this.dashCd = 1.6; this.invulnT = 0.35;
    this.dashTo(this.x + Math.cos(this.aimAngle) * TILE_PX * 2.6, this.y + Math.sin(this.aimAngle) * TILE_PX * 2.6, game);
    game.fx.push({ x: this.x, y: this.y, r: 2 * TILE_PX, ttl: .25, color: '#cfe8ff', type: 'circle' });
    return true;
  }

  update(dt, game) {
    this.stat.playSec += dt;
    if (this.dead) return;
    this.updateCommon(dt);
    /* 动画状态计时：攻击 0.45s / 施法 0.6s / 受击 0.2s（驱动帧 6 / 7） */
    if (this.atkT > 0) this.atkT -= dt;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] -= dt;
    if (this.counterT > 0) this.counterT -= dt;
    this.buffs.update(dt, game);
    // 回复
    this.hp = Math.min(this.maxHp, this.hp + this.stats.hpRegen * dt);
    this.mp = Math.min(this.maxMp, this.mp + this.stats.mpRegen * dt);
    // 环境：雪原寒冷 / 荒漠炎热
    const reg = regionAtTile(Math.floor(this.x / TILE_PX), Math.floor(this.y / TILE_PX));
    if (reg && reg.key === 'snow' && !this.buffs.has('B001')) { if (chance(dt * 0.15)) this.buffs.add('D306'); }
    if (reg && reg.key === 'desert' && !this.buffs.has('B011')) { if (chance(dt * 0.15)) this.buffs.add('D307'); }
    /* 水域：进入不碰撞，获得「游泳」状态（移速 -50%）；离开水域立即恢复
     * 驾船 / 上船 / 下船动画期间不触发（坐船不受游泳减速）
     * 只在状态切换那一帧重算属性，避免每帧 recompute */
    if (!this.sailing && !this.boarding && !this.disembarking && game && game.world && !game.inHome) {
      const inWater = !!game.world.waterTile(Math.floor(this.x / TILE_PX), Math.floor(this.y / TILE_PX));
      if (inWater !== this._swim) {
        this._swim = inWater; this.inWater = inWater;
        if (inWater) {
          this.buffs.add('D308');
          const now = Date.now();
          if (!this._swimTipAt || now - this._swimTipAt > 4000) {   // 岸边来回时不刷屏
            this._swimTipAt = now;
            if (game.toast) game.toast('进入水域 · 游泳中（移速 -50%）', '#9fe8ff');
          }
        } else {
          this.buffs.remove('D308');
        }
        this.recompute();
      }
    } else if (this._swim) {
      this._swim = false; this.inWater = false;
      this.buffs.remove('D308'); this.recompute();
    }
  }
  serialize() {
    return {
      name: this.name, clsKey: this.clsKey, lv: this.lv, exp: this.exp, gold: this.gold, diamond: this.diamond,
      hp: this.hp, mp: this.mp, x: this.x, y: this.y, bagMax: this.bagMax,
      bag: this.bag, equip: this.equip, talents: this.talents, life: this.life, stat: this.stat,
      respecTimes: this.respecTimes, unlockedRegions: this.unlockedRegions, seen: this.seen
    };
  }
  static deserialize(d, world) {
    const p = new Player(d.name, d.clsKey);
    Object.assign(p, {
      lv: d.lv, exp: d.exp, gold: d.gold, diamond: d.diamond, x: d.x, y: d.y,
      talents: d.talents || {}, life: d.life || p.life, stat: d.stat || p.stat,
      respecTimes: d.respecTimes || 0, unlockedRegions: d.unlockedRegions || { plain: 1 },
      seen: d.seen || {}
    });
    p.bagMax = d.bagMax || 60;
    p.bag = new Array(p.bagMax).fill(null);
    (d.bag || []).forEach((it, i) => { if (i < p.bag.length) p.bag[i] = it; });
    for (const slot in (d.equip || {})) {
      const it = d.equip[slot]; if (!it) continue;
      const g = newGear(it.id, it.lv, it.q, it.enhance);
      g.affix = it.affix || []; g.eff = it.eff || []; g.uid = it.uid || g.uid;
      g.holes = it.holes || []; g.reroll = it.reroll || 0;
      // 重建 mods / procs
      g.mods = {}; g.procs = [];
      for (const e of g.eff) {
        if (e.mods) for (const k in e.mods) g.mods[k] = (g.mods[k] || 0) + e.mods[k];
        if (e.proc) g.procs.push(e.proc);
      }
      const isWpn = ITEMS[g.id].slot === 'weapon', isAcc = ITEMS[g.id].main === 'acc';
      if (isWpn) { const b = WPN_BONUS[g.q - 1]; g.mods.crit = (g.mods.crit || 0) + b.crit; g.mods.cdmg = (g.mods.cdmg || 0) + b.cdmg; g.mods.aspd = (g.mods.aspd || 0) + b.aspd; }
      else if (!isAcc) { const b = ARMOR_BONUS[g.q - 1]; g.mods.hpPct = (g.mods.hpPct || 0) + b.hp; g.mods.reduction = (g.mods.reduction || 0) + b.red; g.mods.elemRes = (g.mods.elemRes || 0) + b.res; }
      p.equip[slot] = g;
    }
    p.recompute(); p.hp = clamp(d.hp, 1, p.maxHp); p.mp = clamp(d.mp, 0, p.maxMp);
    return p;
  }
}

/* ============================ 怪物 ============================ */
class Monster extends Entity {
  constructor(data, x, y) {
    super(x, y);
    this.isMonster = true;
    this.data = data; this.name = data.name; this.title = data.title;
    this.lv = data.lv; this.elem = data.elem;
    this.maxHp = data.hp; this.hp = data.maxHp;
    this.stats = {
      atk: data.atk, matk: data.matk, def: data.def, mdef: data.mdef,
      crit: 5, cdmg: 150, dodge: 3, moveSpd: data.speed, elemDmg: 0,
      reduction: data.tier === 'boss' || data.tier === 'world' ? 15 : 0, lifesteal: 0, pen: 0,
      elemResistElem: data.elem
    };
    this.homeX = x; this.homeY = y;
    this.state = 'idle'; this.stateT = 0; this.wanderA = rnd(0, 6.28);
    this.attackCd = 0; this.r = 12; this.aggroRange = data.aggroRange || data.aggro;
    this.atkRange = data.atkRange; this.sprite = Sprites.monster(data.tpl);
    this.lv0 = data.lv;
    this.dmgType = data.dmgType || 'phys';
    this.procLastStand = false; this.procUndying = false;
  }
  size() { return this.data.tpl.size || 1; }
  update(dt, game) {
    if (this.dead) return;
    this.updateCommon(dt);
    this.buffs.update(dt, game);
    if (this.attackCd > 0) this.attackCd -= dt;
    const p = game.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const range = this.atkRange * TILE_PX;
    const aggro = (this.aggroRange || 6) * TILE_PX;
    if (this.isControlled()) { /* 被控：暂停行动 */ }
    else if (this.data.tier === 'boss' || this.data.tier === 'world') this.updateBoss(dt, game, p, d, range, aggro);
    else this.updateNormal(dt, game, p, d, range, aggro);
  }
  updateNormal(dt, game, p, d, range, aggro) {
    const fleeHp = this.maxHp * 0.2;
    if (this.state === 'idle') {
      this.stateT -= dt;
      this.wander(dt, game);
      if (d < aggro && !p.buffs.isStealthed()) { this.state = 'chase'; this.stateT = 0; }
    } else if (this.state === 'chase') {
      if (d > aggro * 1.8 || p.dead) { this.state = 'return'; this.stateT = 0; }
      else if (d <= range) { this.state = 'attack'; this.stateT = 0; }
      else this.stepToward(p.x, p.y, dt, game);
      if (this.hp < fleeHp && chance(dt * 0.6)) this.state = 'flee';
    } else if (this.state === 'attack') {
      if (d > range * 1.4) { this.state = 'chase'; }
      else this.tryAttack(game, p);
    } else if (this.state === 'flee') {
      this.stateT += dt;
      const a = angleOf(p.x, p.y, this.x, this.y);
      const sp = this.stats.moveSpd * TILE_PX * dt;
      this.moveWithCollision(game.world, Math.cos(a) * sp, Math.sin(a) * sp, this.r);
      if (this.stateT > 4) { this.state = 'return'; this.stateT = 0; }
    } else if (this.state === 'return') {
      const dd = dist(this.x, this.y, this.homeX, this.homeY);
      if (dd < 8) { this.state = 'idle'; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25); }
      else this.stepToward(this.homeX, this.homeY, dt, game);
    }
  }
  updateBoss(dt, game, p, d, range, aggro) {
    const ph = bossPhase(this.data);
    if (ph !== this.data.phase) {
      this.data.phase = ph;
      this.stats.atk = this.data.atk * (ph === 2 ? 1.3 : ph === 3 ? 1.6 : 1);
      this.stats.aspdBuff = ph === 3 ? 1.3 : 1;
      game.toast(this.name + ' 进入第 ' + ph + ' 阶段！', '#ff6a6a');
      game.fx.push({ x: this.x, y: this.y, r: 5 * TILE_PX, ttl: .6, color: '#ff6a6a', type: 'circle' });
    }
    this.bossCastT = (this.bossCastT || 0) - dt;
    if (this.bossCastT <= 0) {
      this.bossCastT = rnd(6, 11) / (ph === 3 ? 1.6 : ph === 2 ? 1.3 : 1);
      this.castBossSkill(game, p, ph);
    }
    if (d > aggro * 2.2) { this.state = 'return'; }
    if (d <= range) this.tryAttack(game, p);
    else this.stepToward(p.x, p.y, dt, game);
  }
  castBossSkill(game, p, ph) {
    const col = { fire: '#ff6a2a', ice: '#9fe8ff', dark: '#a45cff', stellar: '#5cf0ff', water: '#5ab0d0', poison: '#7fd05a', earth: '#c9a24a', wind: '#cfe8b8' }[this.elem] || '#ff9a6a';
    // 扇形 AOE
    if (chance(0.4)) {
      game.fx.push({ x: this.x, y: this.y, ang: angleOf(this.x, this.y, p.x, p.y), r: 5 * TILE_PX, arc: 1.0, ttl: .35, color: col, type: 'cone' });
      if (dist(this.x, this.y, p.x, p.y) < 5 * TILE_PX) Combat.dealDamage(this, p, { mult: 2.5, noMiss: false }, game);
    } else if (chance(0.5)) {
      // 地面圈（延迟伤害）
      game.fx.push({ x: p.x, y: p.y, r: 3 * TILE_PX, ttl: .8, color: col, type: 'circle' });
      setTimeout(() => {
        if (game.player && !game.player.dead && dist(game.player.x, game.player.y, this.x, this.y) < 6 * TILE_PX) {
          Combat.dealDamage(this, game.player, { mult: 2.0 }, game);
        }
      }, 700);
    } else {
      // 召唤 / 强化：回复自身并重击
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.05);
      Combat.applyRawDamage(p, Math.round(this.stats.atk * 1.5), {}, game);
    }
  }
  wander(dt, game) {
    this.stateT -= dt;
    if (this.stateT <= 0) { this.stateT = rnd(1, 3); this.wanderA = rnd(0, 6.28); this.wanderMove = chance(0.6); }
    if (!this.wanderMove) { this.vx = this.vy = 0; return; }
    const sp = this.stats.moveSpd * TILE_PX * 0.45 * dt;
    this.moveWithCollision(game.world, Math.cos(this.wanderA) * sp, Math.sin(this.wanderA) * sp, this.r);
  }
  stepToward(tx, ty, dt, game) {
    const a = angleOf(this.x, this.y, tx, ty);
    const sp = this.stats.moveSpd * TILE_PX * dt;
    const beforeX = this.x, beforeY = this.y;
    this.moveWithCollision(game.world, Math.cos(a) * sp, Math.sin(a) * sp, this.r);
    this.face = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'right' : 'left') : (Math.sin(a) > 0 ? 'down' : 'up');
    if (Math.abs(this.x - beforeX) < 0.01 && Math.abs(this.y - beforeY) < 0.01) {
      // 卡墙：尝试侧移
      this.moveWithCollision(game.world, -Math.sin(a) * sp, Math.cos(a) * sp, this.r);
    }
  }
  tryAttack(game, p) {
    if (this.attackCd > 0) return;
    this.attackCd = 1.2 / (this.stats.aspdBuff || 1);
    const opts = { mult: this.dmgType === 'mag' ? 1.2 : 1.0, magic: this.dmgType === 'mag', elem: this.elem };
    const res = Combat.dealDamage(this, p, opts, game);
    if (res && !res.miss && p.counterT > 0) {
      // 玩家格挡反击
      Combat.dealDamage(p, this, { mult: p.counterMult || 3, elem: p.elemAttack() }, game);
      game.floatText(p, '格挡反击！', '#9fe8ff');
      p.counterT = 0;
    }
    // 怪物特效 Debuff
    if (res && !res.miss && this.data.tpl.special) {
      const map = { poison: 'D203', fire: 'D201', ice: 'D003', dark: 'D001', stellar: 'D209', wind: 'D002', water: 'D106' };
      const id = map[this.data.tpl.special];
      if (id && chance(0.35) && !p.buffs.hasCcImmune()) BuffSys.apply(p, id, game);
    }
  }
  castTargets(targets, skill, info, game) {
    for (const t of targets) Combat.dealDamage(this, t, { mult: info.mult, magic: this.dmgType === 'mag', elem: this.elem }, game);
  }
}
