/* ============================================================
 * 01_quality.js —— 10 级品质体系 + 词条 / 特效池（策划 V0.2 一章）
 * ==========================================================*/
'use strict';

const QUALITY = [
  { q: 1, name: '粗糙', en: 'Crude', color: '#9a9a9a', mult: 0.7, weight: 30, affix: 0, enhCap: 3 },
  { q: 2, name: '普通', en: 'Common', color: '#e6e6e6', mult: 1.0, weight: 25, affix: 0, enhCap: 5 },
  { q: 3, name: '优秀', en: 'Fine', color: '#4CAF50', mult: 1.3, weight: 18, affix: 1, enhCap: 7 },
  { q: 4, name: '精良', en: 'Superior', color: '#2196F3', mult: 1.6, weight: 12, affix: 1, enhCap: 9 },
  { q: 5, name: '史诗', en: 'Epic', color: '#9C27B0', mult: 2.0, weight: 7, affix: 2, enhCap: 12 },
  { q: 6, name: '传说', en: 'Legendary', color: '#FF9800', mult: 2.5, weight: 4, affix: 2, enhCap: 15 },
  { q: 7, name: '神话', en: 'Mythic', color: '#F44336', mult: 3.2, weight: 2, affix: 3, enhCap: 18 },
  { q: 8, name: '远古', en: 'Ancient', color: '#FFD700', mult: 4.0, weight: 1.2, affix: 3, enhCap: 20 },
  { q: 9, name: '星辉', en: 'Stellar', color: '#00FFFF', mult: 5.5, weight: 0.6, affix: 4, enhCap: 25 },
  { q: 10, name: '创世', en: 'Genesis', color: '#FF55FF', mult: 8.0, weight: 0.2, affix: 5, enhCap: 30 }
];
function getQuality(q) { return QUALITY[clamp(Math.round(q), 1, 10) - 1]; }

/** 拍卖/出售估价用的品质倍率 */
const QUALITY_VALUE = { 1: 0.5, 2: 1, 3: 1.5, 4: 2.5, 5: 4, 6: 7, 7: 12, 8: 20, 9: 35, 10: 60 };

/** 各来源的品质权重（V0.5 Sheet 11） */
const QUALITY_WEIGHTS = {
  normal: [30, 25, 18, 12, 7, 4, 2, 1.2, 0.6, 0.2],
  elite: [15, 20, 22, 18, 12, 7, 3, 1.8, 0.9, 0.3],
  boss: [5, 10, 15, 20, 22, 15, 8, 3, 1.5, 0.5],
  world: [0, 2, 5, 10, 20, 28, 20, 10, 4, 1],
  dungeon: [10, 15, 20, 20, 18, 10, 5, 1.5, 0.4, 0.1],
  chest: [25, 25, 20, 15, 9, 4, 1.5, 0.4, 0.1, 0],
  gather: [40, 30, 20, 8, 2, 0, 0, 0, 0, 0],
  gather_rare: [10, 20, 30, 25, 10, 4, 1, 0, 0, 0],
  fishing: [20, 30, 26, 14, 7, 3, 0, 0, 0, 0],
  craft: [0, 30, 30, 20, 12, 6, 2, 0, 0, 0]
};
/** 掉落品质判定 */
function rollQuality(source, minQ, bonusLevel) {
  const w = QUALITY_WEIGHTS[source] || QUALITY_WEIGHTS.normal;
  let r = Math.random() * w.reduce((a, b) => a + b, 0), idx = 0;
  for (let i = 0; i < 10; i++) { r -= w[i]; if (r <= 0) { idx = i; break; } }
  let q = idx + 1 + (bonusLevel || 0);
  // 幸运 / 加成再次判定（每个增值 15% 概率再升一级）
  let b = bonusLevel || 0;
  while (b > 0 && chance(0.15)) { q++; b--; }
  return clamp(Math.max(q, minQ || 1), 1, 10);
}

/* ---------- 品质附加硬性加成（V0.2 1.2 节） ---------- */
const WPN_BONUS = [
  {}, { crit: 0, cdmg: 0, aspd: 0 }, { crit: 1, cdmg: 3, aspd: 0 }, { crit: 2, cdmg: 5, aspd: 2 },
  { crit: 3, cdmg: 10, aspd: 3 }, { crit: 5, cdmg: 15, aspd: 5 }, { crit: 7, cdmg: 20, aspd: 7 },
  { crit: 10, cdmg: 30, aspd: 10 }, { crit: 13, cdmg: 40, aspd: 12 }, { crit: 18, cdmg: 60, aspd: 15 }
];
const ARMOR_BONUS = [
  {}, { hp: 0, red: 0, res: 0 }, { hp: 2, red: 1, res: 2 }, { hp: 4, red: 2, res: 4 },
  { hp: 7, red: 4, res: 6 }, { hp: 10, red: 6, res: 8 }, { hp: 15, red: 8, res: 12 },
  { hp: 20, red: 12, res: 15 }, { hp: 28, red: 16, res: 20 }, { hp: 40, red: 22, res: 30 }
];

/* ---------- 特效池：mods 进属性聚合，proc 进战斗触发 ---------- */
const WPN_EFFECTS = [
  { name: '锋锐', minQ: 5, desc: '无视目标 5% 防御', mods: { pen: 5 } },
  { name: '烈焰附魔', minQ: 5, desc: '攻击附带灼烧(3秒)', proc: { t: 'burn', v: 3 } },
  { name: '寒冰附魔', minQ: 5, desc: '15% 概率冰冻 1 秒', proc: { t: 'freeze', v: 1, p: 0.15 } },
  { name: '雷电附魔', minQ: 5, desc: '10% 概率连锁闪电', proc: { t: 'chain', v: 60, p: 0.1 } },
  { name: '吸血之刃', minQ: 6, desc: '攻击回复 5% 伤害为 HP', mods: { lifesteal: 5 } },
  { name: '破甲', minQ: 6, desc: '攻击降低目标 10% 防御', proc: { t: 'sunder', v: 10, p: 1 } },
  { name: '连击风暴', minQ: 7, desc: '每次攻击 +5% 攻速(最多5层)', proc: { t: 'frenzy' } },
  { name: '星陨打击', minQ: 7, desc: '每 5 次攻击触发星陨范围伤害', proc: { t: 'starstrike', v: 200 } },
  { name: '虚空撕裂', minQ: 8, desc: '15% 概率额外 100% 真实伤害', proc: { t: 'void', v: 100, p: 0.15 } },
  { name: '元素共鸣', minQ: 9, desc: '元素伤害 +30%', mods: { elemDmg: 30 } },
  { name: '创世之怒', minQ: 10, desc: '攻击额外 50% 无视防御伤害', mods: { pen: 50 }, proc: { t: 'void', v: 50, p: 1 } }
];
const ARMOR_EFFECTS = [
  { name: '坚韧', minQ: 5, desc: '受到致命伤害保留 1 HP(内置CD)', proc: { t: 'laststand' }, mods: { hp: 100 } },
  { name: '荆棘', minQ: 5, desc: '反弹受到伤害的 10%', proc: { t: 'thorn', v: 10 } },
  { name: '元素屏障', minQ: 6, desc: '每 30 秒生成护盾', proc: { t: 'shield' } },
  { name: '生命涌泉', minQ: 6, desc: '每秒回复 0.5% 最大 HP', mods: { hpRegenPct: 0.5 } },
  { name: '不屈意志', minQ: 7, desc: 'HP<20% 时 DEF+50%', proc: { t: 'will' } },
  { name: '魔法反射', minQ: 7, desc: '20% 概率反射魔法伤害', proc: { t: 'reflect', v: 20, p: 0.2 } },
  { name: '远古守护', minQ: 8, desc: '受到暴击减伤 50%', mods: { critGuard: 50 } },
  { name: '时空护盾', minQ: 8, desc: '每 45 秒免疫一次控制', mods: { ccImmune: 1 } },
  { name: '星辉庇护', minQ: 9, desc: '全属性 +5%', mods: { allStat: 5 } },
  { name: '不灭之躯', minQ: 9, desc: '每场战斗首次致死伤害无效', proc: { t: 'undying' } },
  { name: '创世壁垒', minQ: 10, desc: '超过 20% 最大 HP 的伤害减免 80%', mods: { bigHitGuard: 80 } }
];
const ACC_EFFECTS = [
  { name: '幸运', minQ: 3, desc: '掉落率 +10%', mods: { dropPct: 10 } },
  { name: '贪婪', minQ: 3, desc: '金币获取 +15%', mods: { goldPct: 15 } },
  { name: '智慧', minQ: 4, desc: '经验获取 +10%', mods: { expPct: 10 } },
  { name: '疾风', minQ: 4, desc: '移动速度 +10%', mods: { moveSpd: 10 } },
  { name: '冥想', minQ: 5, desc: 'MP 回复 +30%', mods: { mpRegenPct: 30 } },
  { name: '狂热', minQ: 5, desc: '击杀后 3 秒 ATK+20%', proc: { t: 'fever' } },
  { name: '远古智慧', minQ: 6, desc: '技能冷却 -10%', mods: { cdr: 10 } },
  { name: '命运之轮', minQ: 6, desc: '全属性 +5%', mods: { allStat: 5 } },
  { name: '星辉指引', minQ: 7, desc: '采集产出 +15%', mods: { gatherPct: 15 } },
  { name: '创世之心', minQ: 8, desc: '全属性 +15%', mods: { allStat: 15 } }
];

/* ---------- 词条池：Mods 键与 {12_entities} 属性聚合一致 ---------- */
const AFFIX_POOL = [
  { key: 'atk', pct: false, label: '攻击力', min: l => 2 + l * 0.5, max: l => 6 + l * 2.0 },
  { key: 'matk', pct: false, label: '魔攻', min: l => 2 + l * 0.5, max: l => 6 + l * 1.8 },
  { key: 'def', pct: false, label: '防御', min: l => 2 + l * 0.4, max: l => 5 + l * 1.5 },
  { key: 'hp', pct: false, label: '生命', min: l => 15 + l * 6, max: l => 60 + l * 24 },
  { key: 'mp', pct: false, label: '魔力', min: l => 8 + l * 3, max: l => 30 + l * 10 },
  { key: 'crit', pct: true, label: '暴击率', min: () => 1, max: () => 8, unit: '%' },
  { key: 'cdmg', pct: true, label: '暴伤', min: () => 5, max: () => 30, unit: '%' },
  { key: 'aspd', pct: true, label: '攻速', min: () => 2, max: () => 10, unit: '%' },
  { key: 'dodge', pct: true, label: '闪避', min: () => 1, max: () => 5, unit: '%' },
  { key: 'lifesteal', pct: true, label: '吸血', min: () => 1, max: () => 5, unit: '%' },
  { key: 'cdr', pct: true, label: '冷却缩减', min: () => 2, max: () => 10, unit: '%' },
  { key: 'pen', pct: true, label: '穿透', min: () => 2, max: () => 10, unit: '%' },
  { key: 'hpPct', pct: true, label: '生命', min: () => 3, max: () => 12, unit: '%' },
  { key: 'moveSpd', pct: true, label: '移速', min: () => 2, max: () => 8, unit: '%' },
  { key: 'dropPct', pct: true, label: '掉落率', min: () => 2, max: () => 8, unit: '%' },
  { key: 'goldPct', pct: true, label: '金币', min: () => 3, max: () => 10, unit: '%' },
  { key: 'expPct', pct: true, label: '经验', min: () => 2, max: () => 8, unit: '%' }
];
function rollAffix(lv) {
  const a = choice(AFFIX_POOL);
  const lo = a.min(lv), hi = a.max(lv);
  const v = Math.round(rnd(lo, hi) * (a.pct ? 10 : 1)) / (a.pct ? 10 : 1);
  return { key: a.key, pct: a.pct, label: a.label, unit: a.unit || '', v: v };
}
function affixText(a) {
  if (a.pct) return `${a.label} +${a.v}${a.unit}`;
  return `${a.label} +${Math.round(a.v)}`;
}
