/* ============================================================
 * 10_buff.js —— Buff / Debuff 系统（V0.2 第二章）
 * 叠加规则：1 取最高 / 2 刷新时间 / 3 独立计算 / 4 不可叠加
 * ==========================================================*/
'use strict';

const BUFFS = {
  /* 属性增益 */
  B001: { name: '力量祝福', icon: '💪', type: 'buff', rule: 1, dur: 300, mods: { atkPct: 10 }, desc: 'ATK+10%' },
  B002: { name: '力量强化', icon: '💪', type: 'buff', rule: 1, dur: 180, mods: { atkPct: 20 }, desc: 'ATK+20%' },
  B004: { name: '铁壁', icon: '🛡', type: 'buff', rule: 1, dur: 300, mods: { defPct: 10 }, desc: 'DEF+10%' },
  B005: { name: '钢铁之躯', icon: '🛡', type: 'buff', rule: 1, dur: 180, mods: { defPct: 25 }, desc: 'DEF+25%' },
  B007: { name: '生命涌流', icon: '❤', type: 'buff', rule: 1, dur: 300, mods: { hpPct: 10 }, desc: '最大HP+10%' },
  B008: { name: '霸体', icon: '⚡', type: 'buff', rule: 2, dur: 2, control: 'superarmor', desc: '免疫控制，格挡减伤 80%', mods: { reduction: 30, ccImmune: 1 } },
  B011: { name: '疾风步', icon: '👟', type: 'buff', rule: 1, dur: 180, mods: { moveSpd: 25 }, desc: '移速+25%' },
  B013: { name: '鹰眼', icon: '👁', type: 'buff', rule: 1, dur: 300, mods: { crit: 5 }, desc: '暴击率+5%' },
  B015: { name: '幸运星', icon: '🍀', type: 'buff', rule: 1, dur: 600, mods: { dropPct: 25 }, desc: '掉落率+25%' },
  B016: { name: '元素亲和', icon: '✨', type: 'buff', rule: 1, dur: 300, mods: { elemDmg: 15 }, desc: '元素伤害+15%' },
  B020: { name: '经验加成', icon: '📚', type: 'buff', rule: 1, dur: 600, mods: { expPct: 25 }, desc: '经验获取+25%' },
  B019: { name: '财富祝福', icon: '💰', type: 'buff', rule: 1, dur: 600, mods: { goldPct: 25 }, desc: '金币获取+25%' },
  /* 战斗增益 */
  B101: { name: '生命回复', icon: '💚', type: 'buff', rule: 2, dur: 10, dotHealPct: 2, desc: '每秒回复 2% 最大HP' },
  B102: { name: '强力回复', icon: '💚', type: 'buff', rule: 2, dur: 8, dotHealPct: 5, desc: '每秒回复 5% 最大HP' },
  B104: { name: '魔法护盾', icon: '🔵', type: 'buff', rule: 1, dur: 30, shield: 500, desc: '吸收伤害护盾' },
  B106: { name: '吸血', icon: '🩸', type: 'buff', rule: 1, dur: 10, mods: { lifesteal: 8 }, desc: '攻击回血 8%' },
  B109: { name: '无敌', icon: '⭐', type: 'buff', rule: 4, dur: 2, mods: {}, invincible: 1, desc: '免疫所有伤害' },
  B112: { name: '火元素附魔', icon: '🔥', type: 'buff', rule: 1, dur: 60, mods: { elemDmg: 15 }, elem: 'fire', desc: '攻击附带火元素' },
  B113: { name: '冰元素附魔', icon: '❄', type: 'buff', rule: 1, dur: 60, mods: { elemDmg: 15 }, elem: 'ice', desc: '攻击附带冰元素' },
  B114: { name: '雷元素附魔', icon: '⚡', type: 'buff', rule: 1, dur: 60, mods: { elemDmg: 15 }, elem: 'thunder', desc: '攻击附带雷元素' },
  B301: { name: '隐身', icon: '👻', type: 'buff', rule: 2, dur: 3, stealth: 1, desc: '怪物不会主动攻击' },
  B302: { name: '飞行', icon: '🪽', type: 'buff', rule: 2, dur: 30, mods: { moveSpd: 40 }, desc: '可飞越地形，移速提升' },
  B310: { name: '时间加速', icon: '⏩', type: 'buff', rule: 1, dur: 300, mods: { cdr: 20 }, desc: '技能冷却-20%' },
  /* 生活增益 */
  B201: { name: '采集加速', icon: '⛏', type: 'buff', rule: 1, dur: 600, mods: { gatherSpeed: 25 }, desc: '采集速度+25%' },
  B202: { name: '矿工之眼', icon: '👁', type: 'buff', rule: 2, dur: 900, mods: { rareFind: 8 }, desc: '显示隐藏矿脉' },
  B206: { name: '制作精通', icon: '🔨', type: 'buff', rule: 1, dur: 1800, mods: { craftRate: 10 }, desc: '制作成功率+10%' },
  B207: { name: '灵感迸发', icon: '💡', type: 'buff', rule: 1, dur: 1800, mods: { craftCrit: 15 }, desc: '制作暴击率+15%' },
  /* Debuff */
  D001: { name: '虚弱', icon: '💔', type: 'debuff', rule: 1, dur: 10, mods: { atkPct: -15 }, dispel: 1, desc: 'ATK-15%' },
  D002: { name: '破甲', icon: '🛡', type: 'debuff', rule: 1, dur: 8, mods: { defPct: -20 }, dispel: 1, desc: 'DEF-20%' },
  D003: { name: '迟缓', icon: '🐌', type: 'debuff', rule: 1, dur: 5, mods: { moveSpd: -30 }, dispel: 1, desc: '移速-30%' },
  D006: { name: '致盲', icon: '🕶', type: 'debuff', rule: 1, dur: 5, mods: { dodge: -20 }, dispel: 1, desc: '命中下降' },
  D101: { name: '冰冻', icon: '❄', type: 'debuff', rule: 2, dur: 2, control: 'freeze', dispel: 1, desc: '无法移动攻击' },
  D102: { name: '眩晕', icon: '💫', type: 'debuff', rule: 2, dur: 1.5, control: 'stun', dispel: 1, desc: '无法行动' },
  D103: { name: '麻痹', icon: '⚡', type: 'debuff', rule: 2, dur: 3, control: 'paralyze', mods: { aspd: -50 }, dispel: 1, desc: '无法移动，攻速-50%' },
  D104: { name: '定身', icon: '🕸', type: 'debuff', rule: 2, dur: 2.5, control: 'root', dispel: 1, desc: '无法移动' },
  D105: { name: '沉默', icon: '🤐', type: 'debuff', rule: 2, dur: 3, control: 'silence', dispel: 1, desc: '无法使用技能' },
  D106: { name: '恐惧', icon: '😱', type: 'debuff', rule: 2, dur: 2, control: 'fear', dispel: 1, desc: '逃离施法者' },
  D201: { name: '灼烧', icon: '🔥', type: 'debuff', rule: 2, dur: 5, dot: { hpPct: 2 }, dispel: 1, desc: '每秒损失 2% 最大HP' },
  D202: { name: '烈焰', icon: '🔥', type: 'debuff', rule: 2, dur: 5, dot: { hpPct: 4 }, dispel: 1, desc: '每秒损失 4% 最大HP' },
  D203: { name: '中毒', icon: '☠', type: 'debuff', rule: 3, dur: 8, dot: { flatPerLevel: 5 }, dispel: 1, desc: '持续毒性伤害' },
  D205: { name: '流血', icon: '🩸', type: 'debuff', rule: 2, dur: 6, dot: { hpPct: 1.5 }, dispel: 1, desc: '每秒损失 1.5% 最大HP' },
  D207: { name: '腐蚀', icon: '🟢', type: 'debuff', rule: 2, dur: 10, dot: { hpPct: 2 }, mods: { defPct: -10 }, dispel: 1, desc: '持续伤害并降低防御' },
  D209: { name: '星核侵蚀', icon: '💎', type: 'debuff', rule: 2, dur: 12, dot: { hpPct: 2 }, mods: { allStat: -5 }, dispel: 2, desc: '全属性下降并持续伤害' },
  D301: { name: '重伤', icon: '🩹', type: 'debuff', rule: 1, dur: 10, mods: { healCut: 50 }, dispel: 1, desc: '受到治疗-50%' },
  D306: { name: '寒冷', icon: '🥶', type: 'debuff', rule: 2, dur: 6, dot: { hpPct: 0.3 }, mods: { aspd: -10 }, dispel: 0, desc: '雪原环境减益' },
  D307: { name: '炎热', icon: '🥵', type: 'debuff', rule: 2, dur: 6, dot: { hpPct: 0.3 }, mods: { moveSpd: -8 }, dispel: 0, desc: '荒漠环境减益' }
};

class BuffHolder {
  constructor(owner) { this.owner = owner; this.list = []; }
  add(id, durOverride, srcLevel) {
    const def = BUFFS[id]; if (!def) return null;
    const dur = durOverride || def.dur;
    if (def.rule === 1 || def.rule === 2) {
      const ex = this.list.find(b => b.id === id);
      if (ex) {
        if (def.rule === 1) {
          // 取最高（连续两次以新值覆盖）
          ex.t = Math.max(ex.t, dur); return ex;
        }
        ex.t = Math.max(ex.t, dur); return ex;
      }
    }
    if (def.rule === 4) {
      const ex = this.list.find(b => b.id === id);
      if (ex) { ex.t = Math.max(ex.t, dur); return ex; }
    }
    // 元素互斥
    if (def.elem) this.list = this.list.filter(b => !(BUFFS[b.id].elem && b.id !== id));
    const b = { id: id, t: dur, srcLevel: srcLevel || 1, tickT: 0 };
    this.list.push(b);
    if (def.control) this.owner.controlT = Math.max(this.owner.controlT || 0, dur);
    if (def.shield) this.owner.shield = Math.max(this.owner.shield || 0, def.shield);
    return b;
  }
  remove(id) { this.list = this.list.filter(b => b.id !== id); }
  clearDebuffs(level) {
    this.list = this.list.filter(b => {
      const d = BUFFS[b.id];
      if (d.type !== 'debuff') return true;
      if (d.dispel === 0) return true;
      return !(level >= (d.dispel || 1));
    });
  }
  has(id) { return this.list.some(b => b.id === id); }
  update(dt, ctx) {
    const ent = this.owner;
    let heal = 0, dmg = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i], def = BUFFS[b.id];
      b.t -= dt;
      if (def.dot) {
        b.tickT += dt;
        while (b.tickT >= 1) {
          b.tickT -= 1;
          let d = 0;
          if (def.dot.hpPct) d += ent.maxHp * def.dot.hpPct / 100;
          if (def.dot.flatPerLevel) d += def.dot.flatPerLevel * (b.srcLevel || ent.lv || 1);
          dmg += d;
        }
      }
      if (def.dotHealPct) {
        b.tickT += dt;
        while (b.tickT >= 1) { b.tickT -= 1; heal += ent.maxHp * def.dotHealPct / 100; }
      }
      if (b.t <= 0) this.list.splice(i, 1);
    }
    if (dmg > 0) Combat.applyRawDamage(ent, dmg, { source: 'dot' });
    if (heal > 0) { ent.hp = Math.min(ent.maxHp, ent.hp + heal); if (ctx) ctx.floatText(ent, '+' + Math.round(heal), '#7fdba4'); }
  }
  mods() {
    const m = {};
    for (const b of this.list) {
      const d = BUFFS[b.id];
      if (d.mods) for (const k in d.mods) m[k] = (m[k] || 0) + d.mods[k];
    }
    return m;
  }
  hasInvincible() { return this.list.some(b => BUFFS[b.id].invincible); }
  isStealthed() { return this.list.some(b => BUFFS[b.id].stealth); }
  hasCcImmune() { return this.list.some(b => (BUFFS[b.id].mods && BUFFS[b.id].mods.ccImmune) || BUFFS[b.id].control === 'superarmor'); }
  controlKind() {
    for (const b of this.list) { const d = BUFFS[b.id]; if (d.control && d.control !== 'superarmor') return d.control; }
    return null;
  }
}
const BuffSys = {
  apply(ent, id, ctx, dur) { const b = ent.buffs.add(id, dur, ent.lv); if (ctx && b) ctx.floatText && ctx.floatText(ent, BUFFS[id].name, '#ffe07a'); return b; }
};
