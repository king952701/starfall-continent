/* ============================================================
 * 04_world_data.js —— 大地图分区（12000×12000 格）与资源分布
 * 每个大区：地形调色 + 采集资源表 + 怪物表 Key + 难度系数
 * ==========================================================*/
'use strict';

const WORLD_SIZE = 12000;      // 世界边长（格）
const TILE_PX = 32;            // 每格像素
const CHUNK = 16;              // 每个区块边长（格）

const REGIONS = [
  {
    id: 1, key: 'plain', name: '翠风平原', en: 'Windswept Plain',
    x0: 0, y0: 6000, x1: 3000, y1: 9000, lv: [1, 12], diff: 1.0, elem: 'wind',
    desc: '新手区域，田园风光，风车与麦田遍布，陨星纪念碑矗立在村中央。',
    pal: {
      ground: ['#5c8a45', '#6b9a4f', '#548040'], accent: '#86a95c',
      dirt: '#8a7a4a', rock: '#7d7d86', water: '#3f7fa8', sand: '#c9b98a',
      tree: { leaf: '#3f7a3a', trunk: '#5b3f27' }, grass: '#8fc45a',
      flower: ['#ffd76a', '#ff9ac0', '#e8e8f0'], mountain: '#6b6b60', fog: '#bcd8a0'
    },
    res: {
      // 煤炭为通用燃料，每个大区均可采集（否则前期锻造会缺燃料）
      ore: [{ id: 4001, w: 34, lv: 1 }, { id: 4002, w: 34, lv: 5 }, { id: 4003, w: 18, lv: 8 }, { id: 4005, w: 30, lv: 7 }],
      wood: [{ id: 4101, w: 60, lv: 1 }, { id: 4102, w: 40, lv: 5 }],
      herb: [{ id: 4201, w: 55, lv: 1 }, { id: 4202, w: 45, lv: 5 }],
      bug: [{ id: 4302, w: 60, lv: 1 }, { id: 4305, w: 40, lv: 3 }]
    },
    fishArea: 'plain', treeRate: 0.10, rockRate: 0.035, herbRate: 0.030, hasVillage: true
  },
  {
    id: 2, key: 'forest', name: '幽暗森林', en: 'Gloom Forest',
    x0: 0, y0: 3000, x1: 3000, y1: 6000, lv: [10, 22], diff: 1.1, elem: 'poison',
    desc: '遮天蔽日的密林与沼泽，毒雾弥漫，木材与毒系材料极度丰富。',
    pal: {
      ground: ['#2f4a2c', '#38542f', '#294225'], accent: '#4f7240',
      dirt: '#4a3a28', rock: '#5a5a62', water: '#2f5a4a', sand: '#6a6040',
      tree: { leaf: '#274a2a', trunk: '#3a2a1c' }, grass: '#4f8a3a',
      flower: ['#9fe8b8', '#c46ac0', '#7fd05a'], mountain: '#4a4a44', fog: '#7fa88a'
    },
    res: {
      ore: [{ id: 4004, w: 45, lv: 20 }, { id: 4005, w: 35, lv: 15 }, { id: 4002, w: 20, lv: 5 }],
      wood: [{ id: 4103, w: 45, lv: 20 }, { id: 4102, w: 35, lv: 5 }, { id: 4105, w: 20, lv: 40 }],
      herb: [{ id: 4203, w: 45, lv: 15 }, { id: 4201, w: 30, lv: 1 }, { id: 4204, w: 25, lv: 25 }],
      bug: [{ id: 4306, w: 50, lv: 20 }, { id: 4302, w: 50, lv: 1 }]
    },
    fishArea: 'forest', treeRate: 0.30, rockRate: 0.030, herbRate: 0.045
  },
  {
    id: 3, key: 'desert', name: '赤炎荒漠', en: 'Ember Desert',
    x0: 6000, y0: 3000, x1: 9000, y1: 6000, lv: [20, 32], diff: 1.2, elem: 'fire',
    desc: '灼热沙丘与活火山口，地表裂隙中流淌着熔岩，矿产最为富饶。',
    pal: {
      ground: ['#c9a05a', '#d4ab62', '#bd914e'], accent: '#e8c98a',
      dirt: '#a07a44', rock: '#8a5a3a', water: '#c96a2a', sand: '#e0c48a',
      tree: { leaf: '#7a6a3a', trunk: '#5a3a22' }, grass: '#c9a04a',
      flower: ['#ff7a2a', '#ffd76a', '#ff4a4a'], mountain: '#7a5040', fog: '#f0c890'
    },
    res: {
      ore: [{ id: 4006, w: 32, lv: 25 }, { id: 4007, w: 23, lv: 35 }, { id: 4005, w: 25, lv: 15 }, { id: 4004, w: 14, lv: 20 }],
      wood: [{ id: 4106, w: 40, lv: 45 }, { id: 4105, w: 60, lv: 40 }],
      herb: [{ id: 4206, w: 60, lv: 35 }, { id: 4205, w: 20, lv: 35 }, { id: 4203, w: 20, lv: 15 }],
      bug: [{ id: 4307, w: 60, lv: 30 }, { id: 4313, w: 40, lv: 25 }]
    },
    fishArea: 'desert', treeRate: 0.02, rockRate: 0.10, herbRate: 0.020
  },
  {
    id: 4, key: 'snow', name: '霜骨雪原', en: 'Frostbone Field',
    x0: 3000, y0: 0, x1: 9000, y1: 3000, lv: [30, 42], diff: 1.3, elem: 'ice',
    desc: '永冻冰原与骸骨山脉，极光垂落之地，稀有草药藏于冰层之下。',
    pal: {
      ground: ['#dfe8f5', '#cfdcee', '#e8f0ff'], accent: '#ffffff',
      dirt: '#8a97ad', rock: '#6f7a8f', water: '#7fcfff', sand: '#cfd8e8',
      tree: { leaf: '#3f5a4a', trunk: '#4a3a30' }, grass: '#cfe8ff',
      flower: ['#9fe8ff', '#ffffff', '#a0d0ff'], mountain: '#8895ab', fog: '#e8f4ff'
    },
    res: {
      ore: [{ id: 4008, w: 36, lv: 45 }, { id: 4006, w: 22, lv: 25 }, { id: 4314, w: 32, lv: 25 }, { id: 4005, w: 26, lv: 20 }],
      wood: [{ id: 4104, w: 50, lv: 30 }, { id: 4107, w: 50, lv: 60 }],
      herb: [{ id: 4205, w: 55, lv: 35 }, { id: 4204, w: 25, lv: 25 }, { id: 4207, w: 20, lv: 50 }],
      bug: [{ id: 4308, w: 60, lv: 40 }, { id: 4314, w: 40, lv: 25 }]
    },
    fishArea: 'snow', treeRate: 0.12, rockRate: 0.08, herbRate: 0.030
  },
  {
    id: 5, key: 'abyss', name: '深渊裂谷', en: 'Abyss Rift',
    x0: 3000, y0: 6000, x1: 6000, y1: 9000, lv: [42, 52], diff: 1.5, elem: 'dark',
    desc: '大地被撕裂的深谷，向下是无尽黑暗，虚空生物在此徘徊。',
    pal: {
      ground: ['#3a3550', '#443e5e', '#2f2b45'], accent: '#6a5f8f',
      dirt: '#2a2438', rock: '#4a4460', water: '#5a3f8f', sand: '#3a3450',
      tree: { leaf: '#4a2f5a', trunk: '#2a2030' }, grass: '#6a4a8f',
      flower: ['#a45cff', '#7f5ac0', '#ff5ac0'], mountain: '#3a3450', fog: '#6a5a9a'
    },
    res: {
      ore: [{ id: 4009, w: 32, lv: 55 }, { id: 4010, w: 18, lv: 70 }, { id: 4008, w: 23, lv: 45 }, { id: 4313, w: 18, lv: 30 }, { id: 4005, w: 24, lv: 25 }],
      wood: [{ id: 4108, w: 45, lv: 70 }, { id: 4109, w: 15, lv: 85 }, { id: 4107, w: 40, lv: 60 }],
      herb: [{ id: 4208, w: 35, lv: 70 }, { id: 4209, w: 25, lv: 80 }, { id: 4207, w: 40, lv: 50 }],
      bug: [{ id: 4309, w: 60, lv: 50 }, { id: 4310, w: 40, lv: 60 }]
    },
    fishArea: 'abyss', treeRate: 0.08, rockRate: 0.09, herbRate: 0.035
  },
  {
    id: 6, key: 'ruin', name: '星陨废墟', en: 'Starfall Ruins',
    x0: 3000, y0: 3000, x1: 6000, y1: 6000, lv: [52, 60], diff: 1.8, elem: 'stellar',
    desc: '大陆中心，陨星坠落的原点。时空紊乱，星核傀儡游荡于遗迹之间。',
    pal: {
      ground: ['#2a2f52', '#333a63', '#232848'], accent: '#7ff0ff',
      dirt: '#3a3560', rock: '#5a5a8f', water: '#5cf0ff', sand: '#4a4a7a',
      tree: { leaf: '#3f7f8f', trunk: '#3a3a5a' }, grass: '#7ff0ff',
      flower: ['#5cf0ff', '#ff9fe8', '#ffffff'], mountain: '#3f3f6a', fog: '#7fa8ff'
    },
    res: {
      ore: [{ id: 4011, w: 32, lv: 80 }, { id: 4012, w: 23, lv: 90 }, { id: 4010, w: 37, lv: 70 }, { id: 4005, w: 22, lv: 30 }],
      wood: [{ id: 4109, w: 50, lv: 85 }, { id: 4108, w: 50, lv: 70 }],
      herb: [{ id: 4209, w: 45, lv: 80 }, { id: 4208, w: 35, lv: 70 }, { id: 4207, w: 20, lv: 50 }],
      bug: [{ id: 4310, w: 60, lv: 60 }, { id: 4312, w: 40, lv: 90 }]
    },
    fishArea: 'ruin', treeRate: 0.06, rockRate: 0.10, herbRate: 0.030
  },
  {
    id: 7, key: 'waste', name: '遗忘荒原', en: 'Forgotten Waste',
    x0: 6000, y0: 6000, x1: 9000, y1: 9000, lv: [30, 45], diff: 1.35, elem: 'earth',
    desc: '被遗弃的战场与幽灵小镇，沙暴与亡灵一起在废墟中穿行。',
    pal: {
      ground: ['#7a6a52', '#8a7a5c', '#6a5a48'], accent: '#a89870',
      dirt: '#6a5a40', rock: '#7a7060', water: '#4a5f6a', sand: '#9a8a6a',
      tree: { leaf: '#5a5a3a', trunk: '#4a3a28' }, grass: '#8a8a5a',
      flower: ['#a89a70', '#d0c090', '#8f7a5a'], mountain: '#6a6055', fog: '#b0a888'
    },
    res: {
      ore: [{ id: 4007, w: 31, lv: 35 }, { id: 4008, w: 27, lv: 45 }, { id: 4004, w: 31, lv: 20 }, { id: 4005, w: 30, lv: 15 }],
      wood: [{ id: 4104, w: 60, lv: 30 }, { id: 4105, w: 40, lv: 40 }],
      herb: [{ id: 4204, w: 45, lv: 25 }, { id: 4206, w: 30, lv: 35 }, { id: 4207, w: 25, lv: 50 }],
      bug: [{ id: 4301, w: 50, lv: 10 }, { id: 4304, w: 50, lv: 5 }]
    },
    fishArea: 'plain', treeRate: 0.03, rockRate: 0.06, herbRate: 0.020
  },
  {
    id: 8, key: 'sea', name: '南海诸岛', en: 'South Archipelago',
    x0: 0, y0: 9000, x1: 12000, y1: 12000, lv: [8, 25], diff: 1.1, elem: 'water',
    desc: '散布在南方 warm 海域的群岛，珊瑚礁与沉船中藏着稀世渔获。',
    pal: {
      ground: ['#c9d8a0', '#b8c890', '#d8e8b0'], accent: '#8fc4d8',
      dirt: '#a89870', rock: '#8a9aa8', water: '#2f7fbf', sand: '#e8dcaa',
      tree: { leaf: '#3f7a5a', trunk: '#6a5030' }, grass: '#8fc46a',
      flower: ['#ff9ac0', '#7fd0ff', '#ffd76a'], mountain: '#6a7a8a', fog: '#cfe8ff'
    },
    res: {
      ore: [{ id: 4002, w: 34, lv: 5 }, { id: 4003, w: 26, lv: 8 }, { id: 4314, w: 26, lv: 25 }, { id: 4005, w: 28, lv: 8 }],
      wood: [{ id: 4101, w: 50, lv: 1 }, { id: 4103, w: 50, lv: 20 }],
      herb: [{ id: 4201, w: 50, lv: 1 }, { id: 4203, w: 50, lv: 15 }],
      bug: [{ id: 4303, w: 60, lv: 10 }, { id: 4305, w: 40, lv: 15 }]
    },
    fishArea: 'coast', treeRate: 0.08, rockRate: 0.02, herbRate: 0.02, seaLevel: 0.55
  }
];
const REGION_BY_KEY = {};
REGIONS.forEach(r => REGION_BY_KEY[r.key] = r);

function regionAtTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= WORLD_SIZE || ty >= WORLD_SIZE) return REGION_BY_KEY.sea;
  for (const r of REGIONS) if (tx >= r.x0 && tx < r.x1 && ty >= r.y0 && ty < r.y1) return r;
  // 海洋 / 边界 → 根据最近区域
  if (tx >= 9000) return REGION_BY_KEY.waste;
  if (ty < 0) return REGION_BY_KEY.snow;
  return REGION_BY_KEY.sea;
}
/** 区域内等级梯度：越深入区域等级越高 */
function regionLevelAt(r, tx, ty) {
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  const rx = (r.x1 - r.x0) / 2, ry = (r.y1 - r.y0) / 2;
  const d = Math.min(1, dist(tx, ty, cx, cy) / Math.max(rx, ry));
  const t = clamp(d * 0.85 + rnd(-0.06, 0.06), 0, 1);
  return Math.round(lerp(r.lv[0], r.lv[1], t));
}
const START_REGION = REGION_BY_KEY.plain;
