/* ============================================================
 * 40_balance.js —— 数值总表：所有可调平衡参数集中在这里
 * 目的：改数值只改这一张表 + 游戏内「数值调试」面板可实时试；
 *      默认值与代码原常量完全一致 → 接入后行为零变化。
 * ==========================================================*/
'use strict';

const BAL = {
  /* 战斗 */
  combat: {
    reductionCap: 0.75,     // 减伤上限 75%（防无敌）
    penCap: 0.5,            // 穿透上限 50%
    comboStep: 0.05,        // 每层连击 +5% 伤害
    comboMax: 0.5,          // 连击加成上限 +50%
    comboTime: 2.0          // 连击保持 2 秒
  },
  /* 经验曲线 */
  exp: {
    base: 100, pow: 1.8, lin: 0.02,     // 升级：100 × lv^1.8 ×(1+lv×0.02)
    lifeBase: 50, lifePow: 1.5          // 生活技能：50 × lv^1.5
  },
  /* 采集单次耗时（秒，未计工具与天赋加成） */
  gather: { mine: 3.0, log: 2.2, herb: 2.0, bug: 2.5, fish: 6.0 },
  /* 刷怪节奏（秒） */
  spawn: { interval: 1.2 },
  /* 经济 */
  eco: {
    respec: [1000, 5000, 20000, 50000, 100000],   // 洗点费用递增
    dropTierMul: { normal: 0.35, elite: 0.7, boss: 1.0 }  // 掉落表生效概率
  },
  /* 打击感 */
  feel: { hitStopCrit: 0.06, hitStopKill: 0.09, slowRate: 0.12 },

  /* 默认快照，用于「复位」 */
  _defaults: null,
  snapshot() { return JSON.parse(JSON.stringify({ combat: this.combat, exp: this.exp, gather: this.gather, spawn: this.spawn, feel: this.feel })); },
  /** 把数值写回各系统的常量表（加载时与调试面板改动后各调一次） */
  apply() {
    if (!this._defaults) this._defaults = this.snapshot();
    if (typeof COMBAT_CONST !== 'undefined') {
      COMBAT_CONST.REDUCTION_CAP = this.combat.reductionCap;
      COMBAT_CONST.PEN_CAP = this.combat.penCap;
      COMBAT_CONST.COMBO_STEP = this.combat.comboStep;
      COMBAT_CONST.COMBO_MAX = this.combat.comboMax;
      COMBAT_CONST.COMBO_TIME = this.combat.comboTime;
    }
  },
  /** 升级所需经验（12_entities 的 expToNext 走这里） */
  expToNext(lv) { return Math.round(this.exp.base * Math.pow(lv, this.exp.pow) * (1 + lv * this.exp.lin)); },
  lifeExpToNext(lv) { return Math.round(this.exp.lifeBase * Math.pow(lv, this.exp.lifePow)); },
  gatherBase(skill) { return this.gather[skill] || 3; },
  reset() { const d = this._defaults || this.snapshot(); for (const k in d) this[k] = JSON.parse(JSON.stringify(d[k])); this.apply(); }
};
BAL.apply();
