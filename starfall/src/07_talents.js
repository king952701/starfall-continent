/* ============================================================
 * 07_talents.js —— 天赋树（战斗 / 采集 / 制作 / 社交）
 * 每升 1 级获得 1 点天赋点，满级 60 点
 * ==========================================================*/
'use strict';

const TALENT_TREES = [
  { key: 'battle', name: '战斗', icon: '⚔' },
  { key: 'gather', name: '采集', icon: '⛏' },
  { key: 'craft', name: '制作', icon: '🔨' },
  { key: 'social', name: '社交', icon: '✦' }
];

/* mods 键与玩家属性聚合一致；special 为被动程序效果 */
const TALENTS = [
  /* ---- 战斗 ---- */
  { id: 1, tree: 'battle', name: '力量强化', tier: 1, max: 5, cost: 1, mods: { atkPct: 3 }, desc: '每级 ATK +3%' },
  { id: 2, tree: 'battle', name: '敏捷强化', tier: 1, max: 5, cost: 1, mods: { aspd: 2, dodge: 1 }, desc: '每级 攻速+2%, 闪避+1%' },
  { id: 3, tree: 'battle', name: '智力强化', tier: 1, max: 5, cost: 1, mods: { matkPct: 3 }, desc: '每级 MATK +3%' },
  { id: 4, tree: 'battle', name: '防御专精', tier: 2, max: 5, cost: 1, mods: { defPct: 4, reduction: 1 }, desc: '每级 DEF+4%, 减伤+1%' },
  { id: 5, tree: 'battle', name: '暴击精通', tier: 2, max: 5, cost: 1, pre: { id: 1, lv: 3 }, mods: { crit: 2, cdmg: 5 }, desc: '每级 暴击+2%, 暴伤+5%' },
  { id: 6, tree: 'battle', name: '生命汲取', tier: 3, max: 3, cost: 2, pre: { id: 5, lv: 2 }, mods: { lifesteal: 2 }, desc: '每级 攻击回复伤害 2% 为 HP' },
  { id: 7, tree: 'battle', name: '元素掌握', tier: 3, max: 5, cost: 1, pre: { id: 3, lv: 3 }, mods: { elemDmg: 5 }, desc: '每级 元素伤害 +5%' },
  { id: 8, tree: 'battle', name: '狂暴', tier: 4, max: 3, cost: 2, pre: { id: 6, lv: 1 }, mods: {}, special: 'berserk', desc: 'HP<30% 时每层 ATK +10%' },
  { id: 9, tree: 'battle', name: '星陨之力', tier: 5, max: 1, cost: 3, pre: { id: 8, lv: 3 }, mods: { allStat: 5 }, special: 'ultimate', desc: '解锁终极技强化：终极技能伤害 +30%' },
  /* ---- 采集 ---- */
  { id: 11, tree: 'gather', name: '采矿效率', tier: 1, max: 5, cost: 1, mods: { gatherSpeed: 5, mineYield: 4 }, desc: '每级 采矿速度+5%, 产出+4%' },
  { id: 12, tree: 'gather', name: '伐木效率', tier: 1, max: 5, cost: 1, mods: { logSpeed: 5, logYield: 4 }, desc: '每级 伐木速度+5%, 产出+4%' },
  { id: 13, tree: 'gather', name: '采药效率', tier: 1, max: 5, cost: 1, mods: { herbSpeed: 5, herbYield: 4 }, desc: '每级 采药速度+5%, 产出+4%' },
  { id: 14, tree: 'gather', name: '钓鱼大师', tier: 2, max: 5, cost: 1, mods: { fishSpeed: 5, gatherPct: 2 }, desc: '每级 钓鱼速度+5%, 稀有大鱼概率+3%' },
  { id: 15, tree: 'gather', name: '稀有发现', tier: 3, max: 5, cost: 2, pre: { id: 11, lv: 3 }, mods: { rareFind: 2 }, desc: '每级 稀有材料额外获得 +2%' },
  { id: 16, tree: 'gather', name: '采集双倍', tier: 4, max: 3, cost: 2, pre: { id: 15, lv: 2 }, mods: { doubleGather: 10 }, desc: '每级 10% 概率双倍产出' },
  { id: 17, tree: 'gather', name: '自然恩赐', tier: 5, max: 1, cost: 3, pre: { id: 16, lv: 2 }, mods: { gatherPct: 20 }, desc: '所有采集产出 +20%' },
  /* ---- 制作 ---- */
  { id: 21, tree: 'craft', name: '锻造精通', tier: 1, max: 5, cost: 1, mods: { craftRate: 2 }, desc: '每级 制作成功率 +2%' },
  { id: 22, tree: 'craft', name: '炼金精通', tier: 1, max: 5, cost: 1, mods: { alchRate: 3 }, desc: '每级 炼金成功率 +3%，产出 +1' },
  { id: 23, tree: 'craft', name: '裁缝精通', tier: 1, max: 5, cost: 1, mods: { tailorRate: 2, armorYield: 3 }, desc: '每级 装备主属性 +3%' },
  { id: 24, tree: 'craft', name: '制作暴击', tier: 3, max: 5, cost: 2, pre: { id: 21, lv: 3 }, mods: { craftCrit: 2 }, desc: '每级 制作暴击率 +2%' },
  { id: 25, tree: 'craft', name: '材料节省', tier: 4, max: 3, cost: 2, pre: { id: 24, lv: 2 }, mods: { matSave: 10 }, desc: '每级 10% 概率不消耗材料' },
  { id: 26, tree: 'craft', name: '大师之手', tier: 5, max: 1, cost: 3, pre: { id: 25, lv: 2 }, mods: { craftRate: 15, gearQuality: 1 }, desc: '所有成品品质 +1 级' },
  /* ---- 社交（单人化：转化为成长效率） ---- */
  { id: 31, tree: 'social', name: '游历经验', tier: 1, max: 5, cost: 1, mods: { expPct: 3 }, desc: '每级 经验获取 +3%' },
  { id: 32, tree: 'social', name: '商人之道', tier: 2, max: 3, cost: 1, mods: { goldPct: 5 }, desc: '每级 金币获取 +5%' },
  { id: 33, tree: 'social', name: '幸运星', tier: 3, max: 5, cost: 1, mods: { dropPct: 3 }, desc: '每级 掉落率 +3%' },
  { id: 34, tree: 'social', name: '轻囊而行', tier: 4, max: 3, cost: 2, pre: { id: 33, lv: 2 }, mods: { moveSpd: 6 }, desc: '每级 移动速度 +6%' },
  { id: 35, tree: 'social', name: '领袖气质', tier: 5, max: 1, cost: 3, pre: { id: 34, lv: 2 }, mods: { allStat: 5 }, desc: '全属性 +5%' }
];
const TALENT_TREE_CN = {};
TALENT_TREES.forEach(t => TALENT_TREE_CN[t.key] = t.name);

/** 属性键 → 中文名（悬浮面板/角色面板共用） */
const STAT_CN = {
  atk: '攻击', matk: '魔攻', def: '防御', mdef: '魔防', hp: '生命', mp: '法力',
  atkPct: '攻击', matkPct: '魔攻', defPct: '防御', mdefPct: '魔防', hpPct: '生命', mpPct: '法力',
  crit: '暴击率', cdmg: '暴击伤害', dodge: '闪避', hit: '命中', aspd: '攻速', moveSpd: '移动速度',
  pen: '穿透', reduction: '减伤', lifesteal: '吸血', elemDmg: '元素伤害', allStat: '全属性',
  gatherSpeed: '采集速度', mineYield: '采矿产出', logYield: '伐木产出', herbYield: '采药产出',
  logSpeed: '伐木速度', herbSpeed: '采药速度', fishSpeed: '钓鱼速度', gatherPct: '采集产出',
  rareFind: '稀有发现', doubleGather: '双倍采集', craftRate: '制作成功率', alchRate: '炼金成功率',
  tailorRate: '裁缝成功率', armorYield: '装备主属性', craftCrit: '制作暴击', matSave: '材料节省',
  gearQuality: '成品品质', expPct: '经验获取', goldPct: '金币获取', dropPct: '掉落率', power: '战力'
};

const TALENT_MAP = {};
TALENTS.forEach(t => { t.treeCN = TALENT_TREE_CN[t.tree]; TALENT_MAP[t.id] = t; });
function talentsOf(tree) { return TALENTS.filter(t => t.tree === tree); }
/** 天赋点上限 = 等级 */
function talentPointsOf(level) { return level; }
/** 重置费用：1000 → 5000 → 20000 …递增 */
function respecCost(times) {
  const t = (typeof BAL !== 'undefined' && BAL.eco && BAL.eco.respec) ? BAL.eco.respec : [1000, 5000, 20000, 50000, 100000];
  return t[Math.min(times, t.length - 1)];
}
