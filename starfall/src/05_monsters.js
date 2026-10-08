/* ============================================================
 * 05_monsters.js —— 怪物图鉴 / 属性成长 / 掉落判定
 * 公式：HP=50×LevelMult×TypeMult×AreaMult（V0.5 Sheet3/4）
 * ==========================================================*/
'use strict';

const TYPE_MULT = { normal: 1.0, elite: 3.5, boss: 12, world: 50 };
const TYPE_CN = { normal: '', elite: '精英', boss: 'BOSS', world: '世界BOSS' };

function levelMult(L) { return 1 + (L - 1) * 0.12 + (L - 1) * (L - 1) * 0.008; }

function monster(L, name, tier, shape, o) {
  o = o || {};
  return Object.assign({
    name: name, tier: tier, shape: shape, size: 1, atk: 'melee', range: 1.8,
    c1: '#8a8a8a', c2: '#5a5a5a', eye: '#ffe36a', speed: 1.0, special: null, drop: null
  }, o);
}

/** 取材表：按怪物形态产出部位材料（符合生态设定，保证生活材料有稳定来源） */
const MOB_PARTS = {
  quad: [{ id: 4330, p: .34 }, { id: 4301, p: .18 }],      // 兽肉 / 兽皮
  beast: [{ id: 4330, p: .42 }, { id: 4301, p: .22 }],
  bird: [{ id: 4330, p: .26 }, { id: 4305, p: .22 }],      // 禽肉 / 羽毛
  worm: [{ id: 4330, p: .30 }, { id: 4303, p: .10 }],
  humanoid: [{ id: 4330, p: .16 }, { id: 4303, p: .20 }],
  insect: [{ id: 4302, p: .18 }],                          // 丝线
  undead: [{ id: 4304, p: .22 }],                          // 兽骨
  golem: [{ id: 4314, p: .10 }],                           // 水晶碎屑
  dragon: [{ id: 4311, p: .22 }]                           // 龙鳞
};
/** 怪物随身杂物（可按掉落阶层缩放） */
const MOB_SUPPLY = [
  { id: 4333, p: .10 },   // 盐
  { id: 4315, p: .14 },   // 清水
  { id: 4316, p: .08 },   // 强化石
  { id: 4319, p: .05 },   // 洗练石
  { id: 4320, p: .04 },   // 开孔锥
  { id: 3001, p: .07 },   // 小型生命药水
  { id: 3003, p: .06 }    // 魔力药水
];
/** 按层数换算模板掉落概率（普通怪 35%，精英 70%，BOSS 100%） */
const DROP_TIER_MUL = { normal: 0.35, elite: 0.7, boss: 1, world: 1 };

const MONSTERS = {
  plain: {
    normal: [
      monster(0, '草原兔', 'normal', 'quad', { c1: '#c9b89a', c2: '#a09070', size: .7, speed: 1.3, drop: [{ id: 4301, p: .5 }] }),
      monster(0, '风蝶', 'normal', 'bird', { c1: '#cfe8ff', c2: '#9fc4ff', size: .6, speed: 1.4, drop: [{ id: 4305, p: .4 }] }),
      monster(0, '小石精', 'normal', 'golem', { c1: '#9a9a8a', c2: '#6a6a5a', size: .8, drop: [{ id: 4001, p: .5 }] }),
      monster(0, '荆棘鼠', 'normal', 'quad', { c1: '#8a7a5a', c2: '#5a4a30', size: .7, special: 'earth' }),
      monster(0, '野狼', 'normal', 'quad', { c1: '#7a7a80', c2: '#4a4a50', speed: 1.2, drop: [{ id: 4301, p: .6 }, { id: 4304, p: .3 }] })
    ],
    elite: [
      monster(0, '狂化野猪', 'elite', 'quad', { c1: '#7a4a30', c2: '#4a2a1a', size: 1.3, speed: 1.1, drop: [{ id: 4301, p: .8 }] }),
      monster(0, '石甲龟王', 'elite', 'golem', { c1: '#7f9a5a', c2: '#4a6a3a', size: 1.4, drop: [{ id: 4002, p: .8 }] })
    ],
    boss: [monster(0, '翠风狼王·加尔', 'boss', 'beast', { c1: '#5a6a8a', c2: '#2f3f5a', eye: '#9ff0ff', size: 2.2, speed: 1.2, special: 'wind', drop: [{ id: 4310, p: .15 }] })]
  },
  forest: {
    normal: [
      monster(0, '毒蘑菇人', 'normal', 'plant', { c1: '#8f4a7a', c2: '#5f2f4a', special: 'poison', drop: [{ id: 4306, p: .45 }] }),
      monster(0, '暗影蝙蝠', 'normal', 'bird', { c1: '#4a3a5a', c2: '#2a2035', speed: 1.3, drop: [{ id: 4305, p: .4 }] }),
      monster(0, '腐木精', 'normal', 'plant', { c1: '#5a4a2a', c2: '#3a2f1a', drop: [{ id: 4101, p: .6 }] }),
      monster(0, '沼泽蛙', 'normal', 'quad', { c1: '#4f7a3a', c2: '#2f5a2a', special: 'poison' }),
      monster(0, '蛛网猎手', 'normal', 'insect', { c1: '#3a3a44', c2: '#1f1f28', drop: [{ id: 4302, p: .5 }] })
    ],
    elite: [
      monster(0, '剧毒蛛后', 'elite', 'insect', { c1: '#6a3a7a', c2: '#3a1f4a', size: 1.4, special: 'poison', drop: [{ id: 4306, p: .9 }, { id: 4302, p: .8 }] }),
      monster(0, '腐化树人', 'elite', 'plant', { c1: '#4a3a22', c2: '#2a2016', size: 1.6, drop: [{ id: 4103, p: .9 }] })
    ],
    boss: [monster(0, '森林之主·莫尔甘', 'boss', 'plant', { c1: '#2f5a30', c2: '#123018', eye: '#cffe6a', size: 2.4, special: 'poison', drop: [{ id: 4109, p: .2 }] })]
  },
  desert: {
    normal: [
      monster(0, '沙蝎', 'normal', 'insect', { c1: '#c98a4a', c2: '#8a5a2a', special: 'poison', drop: [{ id: 4306, p: .4 }] }),
      monster(0, '火蜥蜴', 'normal', 'quad', { c1: '#d05a2a', c2: '#8a2a1a', special: 'fire', drop: [{ id: 4307, p: .35 }] }),
      monster(0, '熔岩史莱姆', 'normal', 'blob', { c1: '#ff7a2a', c2: '#a02a00', special: 'fire', size: .9, drop: [{ id: 4307, p: .5 }] }),
      monster(0, '沙漠秃鹫', 'normal', 'bird', { c1: '#8a7050', c2: '#5a4028', speed: 1.3, drop: [{ id: 4305, p: .5 }] }),
      monster(0, '赤甲虫', 'normal', 'insect', { c1: '#a03a2a', c2: '#5a1a10', drop: [{ id: 4313, p: .25 }] })
    ],
    elite: [
      monster(0, '炎魔战士', 'elite', 'humanoid', { c1: '#ff5a2a', c2: '#8a1a00', size: 1.4, special: 'fire', drop: [{ id: 4307, p: .9 }] }),
      monster(0, '沙暴巨蝎', 'elite', 'insect', { c1: '#d0a04a', c2: '#8a5a20', size: 1.5, special: 'poison' })
    ],
    boss: [monster(0, '炎狱领主·伊弗利特', 'boss', 'humanoid', { c1: '#ff3a00', c2: '#5a1200', eye: '#ffd700', size: 2.4, special: 'fire', drop: [{ id: 4307, p: 1 }, { id: 4311, p: .25 }] })]
  },
  snow: {
    normal: [
      monster(0, '冰狼', 'normal', 'quad', { c1: '#cfe8ff', c2: '#7fa8c8', speed: 1.25, special: 'ice', drop: [{ id: 4308, p: .4 }] }),
      monster(0, '雪怪', 'normal', 'humanoid', { c1: '#e8f4ff', c2: '#a0b8d0', size: 1.2, special: 'ice' }),
      monster(0, '冻骨骷髅', 'normal', 'undead', { c1: '#dfe8f5', c2: '#8a97ad', drop: [{ id: 4304, p: .6 }] }),
      monster(0, '寒冰精灵', 'normal', 'ghost', { c1: '#9fe8ff', c2: '#5aa8d0', special: 'ice', drop: [{ id: 4308, p: .6 }] }),
      monster(0, '白熊', 'normal', 'quad', { c1: '#f0f4fa', c2: '#c0ccd8', size: 1.2, drop: [{ id: 4301, p: .8 }] })
    ],
    elite: [
      monster(0, '冰霜巨人', 'elite', 'humanoid', { c1: '#bfd8f0', c2: '#6a86a8', size: 1.8, special: 'ice', drop: [{ id: 4308, p: 1 }] }),
      monster(0, '极寒巫妖', 'elite', 'undead', { c1: '#8fb0d8', c2: '#3a4a6a', size: 1.4, atk: 'ranged', special: 'ice' })
    ],
    boss: [monster(0, '霜骨龙·尼德霍格', 'boss', 'dragon', { c1: '#dff2ff', c2: '#5a86af', eye: '#7fffff', size: 2.8, special: 'ice', drop: [{ id: 4311, p: .5 }, { id: 4308, p: 1 }] })]
  },
  abyss: {
    normal: [
      monster(0, '深渊蠕虫', 'normal', 'worm', { c1: '#6a5a70', c2: '#3a2f40', drop: [{ id: 4309, p: .35 }] }),
      monster(0, '暗影刺客', 'normal', 'humanoid', { c1: '#3a3550', c2: '#1f1a30', speed: 1.35, special: 'dark' }),
      monster(0, '裂谷蝙蝠', 'normal', 'bird', { c1: '#4a3f60', c2: '#241d3a', speed: 1.3 }),
      monster(0, '堕落骑士', 'normal', 'undead', { c1: '#5a4a6a', c2: '#2a2035', drop: [{ id: 4304, p: .5 }] }),
      monster(0, '虚空水母', 'normal', 'ghost', { c1: '#a45cff', c2: '#5a2f8f', special: 'dark', drop: [{ id: 4309, p: .5 }] })
    ],
    elite: [
      monster(0, '深渊领主', 'elite', 'humanoid', { c1: '#5a2f8f', c2: '#1f0f3a', size: 1.6, special: 'dark', drop: [{ id: 4309, p: 1 }] }),
      monster(0, '虚空编织者', 'elite', 'insect', { c1: '#7f4ac0', c2: '#3a1a6a', size: 1.5, special: 'dark' })
    ],
    boss: [monster(0, '深渊之眼·阿比斯', 'boss', 'blob', { c1: '#6a2fb0', c2: '#200f3a', eye: '#ff3aff', size: 2.6, special: 'dark', drop: [{ id: 4310, p: .5 }] })]
  },
  ruin: {
    normal: [
      monster(0, '星核傀儡', 'normal', 'golem', { c1: '#5a6a9f', c2: '#2f3a5f', special: 'stellar', drop: [{ id: 4310, p: .18 }] }),
      monster(0, '异变体', 'normal', 'blob', { c1: '#7f5ac0', c2: '#3a2a6a', special: 'dark' }),
      monster(0, '时空裂隙兽', 'normal', 'beast', { c1: '#5cf0ff', c2: '#2a6a8a', speed: 1.3, special: 'stellar' }),
      monster(0, '星尘幽灵', 'normal', 'ghost', { c1: '#9fe8ff', c2: '#3f7f9f', special: 'stellar', drop: [{ id: 4310, p: .25 }] })
    ],
    elite: [
      monster(0, '星陨守卫', 'elite', 'golem', { c1: '#8fa8ff', c2: '#2f3a7a', size: 1.6, special: 'stellar', drop: [{ id: 4310, p: .6 }] }),
      monster(0, '时空扭曲者', 'elite', 'ghost', { c1: '#ff9fe8', c2: '#6a2f8f', size: 1.5, special: 'stellar' })
    ],
    boss: [monster(0, '陨星之主·阿斯特拉尔', 'boss', 'dragon', { c1: '#cfe8ff', c2: '#3a3a8f', eye: '#ffffff', size: 3.0, special: 'stellar', drop: [{ id: 4310, p: 1 }, { id: 4312, p: .2 }] })]
  },
  waste: {
    normal: [
      monster(0, '亡灵士兵', 'normal', 'undead', { c1: '#8a9a7a', c2: '#4a5a3a', drop: [{ id: 4304, p: .5 }] }),
      monster(0, '幽灵村民', 'normal', 'ghost', { c1: '#c0c8b0', c2: '#6a7060' }),
      monster(0, '荒野狼犬', 'normal', 'quad', { c1: '#6a5a45', c2: '#3a3028', speed: 1.25 }),
      monster(0, '沙盗游荡者', 'normal', 'humanoid', { c1: '#8a7050', c2: '#503a28', drop: [{ id: 4303, p: .4 }] }),
      monster(0, '骨甲箭手', 'normal', 'undead', { c1: '#d0c8a8', c2: '#8a8060', atk: 'ranged' })
    ],
    elite: [
      monster(0, '幽灵队长', 'elite', 'undead', { c1: '#9fd0a8', c2: '#3a5a44', size: 1.5 }),
      monster(0, '骨龙残骸', 'elite', 'dragon', { c1: '#dfe8d8', c2: '#8a978a', size: 1.8, drop: [{ id: 4311, p: .3 }] })
    ],
    boss: [monster(0, '遗忘之王', 'boss', 'undead', { c1: '#ffd700', c2: '#4a3a1a', eye: '#ff9a2a', size: 2.6, special: 'dark', drop: [{ id: 4313, p: 1 }] })]
  },
  sea: {
    normal: [
      monster(0, '海滩蟹', 'normal', 'insect', { c1: '#e07a5a', c2: '#a0402a', drop: [{ id: 4303, p: .3 }] }),
      monster(0, '海鸥', 'normal', 'bird', { c1: '#f0f4fa', c2: '#a0aec0', speed: 1.35, drop: [{ id: 4305, p: .5 }] }),
      monster(0, '水母精', 'normal', 'ghost', { c1: '#7fd0ff', c2: '#3a7fbf', special: 'water' }),
      monster(0, '潮汐史莱姆', 'normal', 'blob', { c1: '#5ab0d0', c2: '#2a6a8a', special: 'water' })
    ],
    elite: [
      monster(0, '巨型寄居蟹', 'elite', 'insect', { c1: '#d06a4a', c2: '#7a3a20', size: 1.5 }),
      monster(0, '沉船幽灵', 'elite', 'ghost', { c1: '#9fb8d0', c2: '#3a4a6a', size: 1.5, special: 'water' })
    ],
    boss: [monster(0, '深海巨鲸', 'boss', 'beast', { c1: '#3f7fbf', c2: '#1f3f6a', eye: '#cfe8ff', size: 3.0, special: 'water', drop: [{ id: 6017, p: 1 }] })]
  }
};

/** 由模板生成一只实战怪物的数据 */
function spawnMonsterData(regionKey, tier, lv) {
  const pool = MONSTERS[regionKey] || MONSTERS.plain;
  const list = pool[tier] || pool.normal;
  const tpl = choice(list);
  const r = REGION_BY_KEY[regionKey];
  const M = TYPE_MULT[tier] || 1;
  const A = r.diff;
  const lvm = levelMult(lv);
  const dmgType = (tpl.atk === 'ranged') ? 'mag' : 'phys';
  return {
    tpl: tpl, name: (tier === 'normal' ? '' : TYPE_CN[tier] + '·') + tpl.name, title: TYPE_CN[tier] || '普通',
    lv: lv, tier: tier, elem: tpl.special || r.elem,
    hp: Math.round(50 * lvm * M * A), maxHp: Math.round(50 * lvm * M * A),
    atk: 5 * lvm * M * A * 0.55, matk: 5 * lvm * M * A * 0.55,
    def: 3 * lvm * M * A * 0.5, mdef: 3 * lvm * M * A * 0.5,
    exp: Math.round(lv * 10 * (M > 1 ? (M > 10 ? 50 : 12) : 1) * 0.35),
    gold: Math.round(lv * 5 * (M > 1 ? (M > 10 ? 30 : 8) : 1) * 0.5),
    speed: (2.6 + tpl.speed * 0.6) * (tier === 'boss' || tier === 'world' ? 1.15 : 1),
    dropSource: tier === 'normal' ? 'normal' : tier === 'elite' ? 'elite' : (tier === 'world' ? 'world' : 'boss'),
    dmgType: dmgType, atkRange: tpl.atk === 'ranged' ? 6.5 : tpl.range, aggro: tpl.atk === 'ranged' ? 8 : 6.5,
    phase: 1
  };
}
/** Boss 阶段强化 */
function bossPhase(d) {
  const r = d.hp / d.maxHp;
  if (r > 0.7) return 1; if (r > 0.3) return 2; return 3;
}
