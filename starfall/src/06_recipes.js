/* ============================================================
 * 06_recipes.js —— 500 配方压缩包（蓝图生成器）
 * 系统按「等级梯队 × 部位 × 品类」自动展开，避免手写冗余
 * ==========================================================*/
'use strict';

const LIFE_SKILLS = {
  mine: { name: '采矿', type: 1, tool: [5001, 5002, 5003] },
  log: { name: '伐木', type: 1, tool: [5011, 5012] },
  herb: { name: '采药', type: 1, tool: [5021, 5022] },
  fish: { name: '钓鱼', type: 1, tool: [5031, 5032] },
  bug: { name: '捕虫', type: 1, tool: [5041] },
  forge: { name: '锻造', type: 2 },
  tailor: { name: '裁缝', type: 2 },
  alchemy: { name: '炼金', type: 2 },
  cooking: { name: '烹饪', type: 2 },
  wood: { name: '木工', type: 2 }
};
const GATHER_SKILLS = ['mine', 'log', 'herb', 'fish', 'bug'];
const CRAFT_SKILLS = ['forge', 'tailor', 'alchemy', 'cooking', 'wood'];
const SKILL_CN = Object.assign({}, ...Object.keys(LIFE_SKILLS).map(k => ({ [k]: LIFE_SKILLS[k].name })));

const TOOL_OF = { mine: 5001, log: 5011, herb: 5021, fish: 5031, bug: 5041 };

mat(4330, '兽肉', 'mob', 12, 1, '#a05a5a', 'food');
mat(4331, '小麦粉', 'misc', 10, 1, '#e8e0c0', 'powder');
mat(4332, '精钢锭', 'misc', 60, 20, '#b8c0d0', 'ingot');
mat(4333, '盐', 'misc', 5, 1, '#f0f0f0', 'powder');
mat(4334, '灵泉水', 'misc', 80, 25, '#9fe8ff', 'water');

const RECIPES = [];
let _rid = 0;
function R(skill, req, name, mats, out, time, rate) {
  RECIPES.push({ id: ++_rid, skill, req, name, mats, out, time: time || 3, rate: rate || 1 });
}
function M(id, n) { return { id: id, n: n }; }

/* ---------- 装备：等级梯队 ---------- */
const EQUIP_TIERS = [5, 15, 25, 35, 45, 55, 60];
const TIER_METAL = [
  { id: 4002, n: 4 }, { id: 4004, n: 6 }, { id: 4006, n: 6 }, { id: 4007, n: 6 },
  { id: 4008, n: 6 }, { id: 4009, n: 6 }, { id: 4010, n: 6 }
];
const TIER_WOOD = [
  { id: 4101, n: 5 }, { id: 4103, n: 6 }, { id: 4104, n: 6 }, { id: 4105, n: 6 },
  { id: 4107, n: 6 }, { id: 4108, n: 6 }, { id: 4109, n: 5 }
];
const TIER_CLOTH = [
  { id: 4303, n: 4 }, { id: 4301, n: 4 }, { id: 4301, n: 6 }, { id: 4302, n: 6 },
  { id: 4302, n: 8 }, { id: 4314, n: 6 }, { id: 4310, n: 3 }
];
const TIER_GEM = [
  null, { id: 4314, n: 1 }, { id: 4313, n: 1 }, { id: 4313, n: 2 }, { id: 4313, n: 3 }, { id: 4310, n: 1 }, { id: 4310, n: 3 }
];

/* 锻造：金属武器 + 金属防具 + 盾 + 工具 + 锭 */
const FORGE_GEAR = [1101 /*剑*/, 1104 /*匕*/, 1105 /*锤*/, 1201 /*盔*/, 1202 /*甲*/, 1203 /*腿*/, 1204 /*靴*/, 1205 /*盾*/];
EQUIP_TIERS.forEach((lvReq, i) => {
  const metal = TIER_METAL[i], gem = TIER_GEM[i];
  FORGE_GEAR.forEach((gid, gi) => {
    const mats = [M(metal.id, metal.n + gi), M(4005 /*煤炭*/, 2 + i)];
    if (gem) mats.push(M(gem.id, gem.n));
    if (i >= 2) mats.push(M(4301 /*兽皮*/, 2));
    const rlv = clamp(Math.round(lvReq * (gid === 1205 ? 1 : 1)), 1, 60);
    R('forge', lvReq, ['铁剑', '钢刃匕首', '战锤', '铁盔', '板甲', '护腿', '铁靴', '铁盾'][gi] + '·' + lvReq,
      mats, { gear: gid, lv: lvReq }, 3 + i * 0.6, [1, .95, .9, .85, .8, .72, .65][i]);
  });
  R('forge', lvReq, '强化石×' + (2 + i), [M(4002, 3), M(4005, 2), M(metal.id, 2)], { item: i >= 5 ? 4317 : 4316, n: 2 + i, q: 2 }, 2, .9);
  R('forge', lvReq, '开孔锥×' + (1 + (i >= 3 ? 1 : 0)), [M(metal.id, 3), M(4332, 1), M(4005, 2)], { item: 4320, n: 1 + (i >= 3 ? 1 : 0), q: 2 }, 3, .85);
});
R('forge', 10, '精钢锭', [M(4004, 4), M(4005, 2)], { item: 4332, n: 1, q: 2 }, 3, .95);
R('forge', 20, '铁制矿镐', [M(4332, 4), M(4103, 2)], { item: 5002, n: 1, q: 3 }, 6, .85);
R('forge', 25, '精钢斧', [M(4332, 4), M(4103, 2)], { item: 5012, n: 1, q: 3 }, 6, .85);
R('forge', 25, '灵纹锄', [M(4332, 3), M(4313, 1)], { item: 5022, n: 1, q: 3 }, 6, .85);
R('forge', 30, '灵泉鱼竿', [M(4107, 3), M(4334, 2), M(4302, 4)], { item: 5032, n: 1, q: 3 }, 8, .8);
R('forge', 50, '星银矿镐', [M(4008, 6), M(4313, 1), M(4332, 4)], { item: 5003, n: 1, q: 4 }, 10, .65);

/* 木工：弓 / 法杖 / 家具级材料 */
const WOOD_GEAR = [1102 /*弓*/, 1103 /*杖*/];
EQUIP_TIERS.forEach((lvReq, i) => {
  const w = TIER_WOOD[i], gem = TIER_GEM[i];
  WOOD_GEAR.forEach((gid, gi) => {
    const mats = [M(w.id, w.n), M(4302 /*丝线*/, 2 + i)];
    if (gem) mats.push(M(gem.id, gem.n));
    if (i >= 3) mats.push(M(4305 /*羽毛*/, 2));
    R('wood', lvReq, (gi === 0 ? '猎弓' : '法杖') + '·' + lvReq, mats, { gear: gid, lv: lvReq }, 3 + i * 0.5, [1, .95, .9, .85, .8, .72, .65][i]);
  });
  R('wood', lvReq, '木材捆×' + (3 + i), [M(w.id, 5)], { item: w.id, n: 3, q: 3 }, 2, .95);
});

/* 裁缝：布甲 / 皮甲 / 首饰 */
const TAILOR_GEAR = [1202 /*甲*/, 1204 /*靴*/, 1301 /*戒*/, 1302 /*链*/, 1303 /*符*/];
EQUIP_TIERS.forEach((lvReq, i) => {
  const c = TIER_CLOTH[i], gem = TIER_GEM[i];
  TAILOR_GEAR.forEach((gid, gi) => {
    const mats = [M(c.id, c.n), M(4302, 2 + i)];
    if (gem) mats.push(M(gem.id, gem.n));
    R('tailor', lvReq, (['皮甲', '皮靴', '宝石戒', '宝石坠', '灵符'][gi]) + '·' + lvReq,
      mats, { gear: gid, lv: lvReq }, 3 + i * 0.5, [1, .95, .9, .85, .8, .72, .65][i]);
  });
  R('tailor', lvReq, '丝线捆×5', [M(4302, 6), M(4303, 3)], { item: 4302, n: 5, q: 3 }, 2, .95);
});

/* 炼金：药水 */
const ALCHEMY = [
  { id: 3001, lv: 1, mats: [M(4201, 2), M(4315, 1)], n: 3, rate: 1 },
  { id: 3002, lv: 12, mats: [M(4204, 2), M(4201, 2), M(4315, 2)], n: 2, rate: .92 },
  { id: 3003, lv: 1, mats: [M(4202, 2), M(4315, 1)], n: 2, rate: 1 },
  { id: 3004, lv: 20, mats: [M(4206, 2), M(4204, 1), M(4313, 1)], n: 1, rate: .85 },
  { id: 3005, lv: 22, mats: [M(4205, 2), M(4301, 1), M(4314, 1)], n: 1, rate: .82 },
  { id: 3006, lv: 15, mats: [M(4203, 2), M(4305, 1), M(4315, 1)], n: 1, rate: .9 },
  { id: 3007, lv: 25, mats: [M(4207, 1), M(4313, 1), M(4315, 2)], n: 1, rate: .72 },
  { id: 3008, lv: 30, mats: [M(4207, 2), M(4309, 1), M(4334, 1)], n: 1, rate: .7 },
  { id: 3009, lv: 10, mats: [M(4201, 2), M(4333, 1), M(4315, 1)], n: 2, rate: .95 },
  { id: 3010, lv: 5, mats: [M(4201, 1), M(4303, 1)], n: 1, rate: 1 },
  { id: 4318, lv: 35, mats: [M(4316, 3), M(4313, 2)], n: 1, rate: .6 },
  { id: 4334, lv: 25, mats: [M(4315, 3), M(4314, 1)], n: 2, rate: .85 },
  { id: 4319, lv: 20, mats: [M(4334, 1), M(4204, 2)], n: 1, rate: .8 }   // 洗练石：词条重铸必需品
];
ALCHEMY.forEach(a => R('alchemy', a.lv, ITEMS[a.id].name, a.mats, { item: a.id, n: a.n, q: 2 }, 2.5, a.rate));

/* 烹饪：食物 Buff（含渔家菜：江河 / 湖泊鱼虾） */
const COOKING = [
  { out: 3011, lv: 1, mats: [M(4330, 1), M(4333, 1)], n: 2 },
  { out: 3012, lv: 3, mats: [M(7004, 2), M(4315, 1), M(4333, 1)], n: 2 },
  { out: 3013, lv: 6, mats: [M(6022, 2), M(4333, 1)], n: 2 },                     // 香煎河虾
  { out: 3011, lv: 10, mats: [M(6001, 1), M(4333, 1)], n: 2 },
  { out: 3014, lv: 10, mats: [M(6023, 1), M(4315, 1), M(4333, 1)], n: 2 },        // 鱼头豆腐汤
  { out: 3016, lv: 12, mats: [M(6002, 1), M(7002, 1), M(4333, 1)], n: 2 },        // 湖鲜炒饭
  { out: 3015, lv: 16, mats: [M(6020, 1), M(4315, 1), M(4333, 1)], n: 2 },        // 清蒸鳜鱼
  { out: 3018, lv: 20, mats: [M(6025, 1), M(7004, 2), M(4333, 1)], n: 3 },        // 酸菜鱼
  { out: 3017, lv: 24, mats: [M(6026, 1), M(4315, 1), M(4333, 1)], n: 2 },        // 太湖银鱼羹
  { out: 3012, lv: 20, mats: [M(7002, 2), M(4330, 1), M(4333, 1)], n: 3 },
  { out: 3011, lv: 35, mats: [M(6009, 1), M(7008, 1), M(4333, 1)], n: 3 },
  { out: 3018, lv: 30, mats: [M(6019, 1), M(7004, 2), M(4333, 1)], n: 3 },        // 家常青鱼（酸菜鱼做法）
  { out: 3015, lv: 28, mats: [M(6024, 1), M(4315, 1), M(4333, 1)], n: 2 },        // 清蒸团头鲂
  { out: 3014, lv: 40, mats: [M(6021, 1), M(4315, 2), M(4333, 1)], n: 3 }         // 中华鲟浓汤（稀有）
];
COOKING.forEach(a => R('cooking', a.lv, ITEMS[a.out].name, a.mats, { item: a.out, n: a.n, q: 2 }, 3, .95));
R('cooking', 5, '小麦粉×3', [M(7002, 3)], { item: 4331, n: 3, q: 2 }, 2, .95);
R('cooking', 1, '熬制粗盐×2', [M(4315, 3)], { item: 4333, n: 2, q: 2 }, 2, .95);   // 清水熬盐，保证烹调用盐可自给

/* 基础工具：开局工具若丢失可再次打造 */
R('forge', 1, '木柄矿镐', [M(4101, 3), M(4301, 1)], { item: 5001, n: 1, q: 3 }, 3, .95);
R('forge', 1, '伐木斧', [M(4101, 3), M(4001, 2)], { item: 5011, n: 1, q: 3 }, 3, .95);
R('forge', 1, '药锄', [M(4101, 3), M(4001, 2)], { item: 5021, n: 1, q: 3 }, 3, .95);
R('wood', 1, '木鱼竿', [M(4101, 3), M(4302, 2)], { item: 5031, n: 1, q: 3 }, 3, .95);
R('wood', 1, '捕虫网', [M(4101, 3), M(4302, 2)], { item: 5041, n: 1, q: 3 }, 3, .95);

/* 建筑 / 家园材料（木工） */
R('wood', 5, '家园建材·木', [M(4101, 5)], { item: 4101, n: 4, q: 2 }, 2, .95);
R('forge', 15, '家园建材·石', [M(4004, 3)], { item: 4004, n: 3, q: 2 }, 2, .95);

const RECIPE_MAP = {};
RECIPES.forEach(r => RECIPE_MAP[r.id] = r);
function recipesOf(skill) { return RECIPES.filter(r => r.skill === skill); }
