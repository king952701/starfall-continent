/* ============================================================
 * 02_items.js —— 物品总库 / 装备生成 / 词条与估价
 * 武器·防具·首饰·消耗品·材料·工具·种子作物·鱼类
 * ==========================================================*/
'use strict';

const ITEMS = {};
let _uidSeq = 1;
function defItem(o) { o.stack = o.stack || 1; ITEMS[o.id] = o; return o; }

/* ================= 装备 ================= */
const SLOT_CN = { weapon: '武器', offhand: '副手', helmet: '头盔', chest: '胸甲', legs: '护腿', boots: '靴子', ring: '戒指', necklace: '项链', amulet: '护符' };
const EQP_ORDER = ['weapon', 'offhand', 'helmet', 'chest', 'legs', 'boots', 'ring', 'necklace', 'amulet'];

/** 等级→形态名 */
function gearTier(lv) { return lv < 10 ? 0 : lv < 25 ? 1 : lv < 40 ? 2 : lv < 55 ? 3 : 4; }
const NAME_TIER = {
  sword: ['木剑', '铁剑', '精钢长剑', '秘银长剑', '星陨巨剑'],
  bow: ['短弓', '猎弓', '复合长弓', '灵木长弓', '星辉神弓'],
  staff: ['学徒法杖', '橡木法杖', '铁木法杖', '灵纹法杖', '星辉法杖'],
  dagger: ['铁匕首', '钢刃匕首', '影牙匕首', '虚空之刺', '星辰断刃'],
  hammer: ['木锤', '铁锤', '战锤', '陨铁重锤', '破界巨锤'],
  helmet: ['皮帽', '铁盔', '秘银盔', '龙鳞盔', '星辉冠冕'],
  chest: ['皮甲', '锁子甲', '秘银铠甲', '龙鳞胸铠', '创世战甲'],
  legs: ['皮护腿', '铁护腿', '秘银护腿', '龙鳞护腿', '创世腿铠'],
  boots: ['布靴', '皮靴', '铁靴', '疾风战靴', '星尘长靴'],
  ring: ['铜戒', '银戒', '宝石戒', '远古符戒', '创世之戒'],
  necklace: ['贝链', '银链', '秘银坠', '远古项链', '星河之链'],
  amulet: ['木符', '骨符', '灵纹护符', '远古护符', '创世徽记']
};
/* 基础值公式（在策划 V0.5 Sheet5/6 表基础上做了线性化，便于长线平衡） */
function baseAtk(lv) { return 5 + lv * 1.5 * (1 + (lv - 1) * 0.006); }
function baseDef(lv) { return 4 + lv * 1.0 * (1 + (lv - 1) * 0.006); }
function baseAcc(lv) { return 4 + lv * 0.8 * (1 + (lv - 1) * 0.006); }

const GEAR_DEFS = [
  { id: 1101, name: '剑', slot: 'weapon', grp: 'sword', icon: 'sword', color: '#c9d4e8', main: 'atk' },
  { id: 1102, name: '弓', slot: 'weapon', grp: 'bow', icon: 'bow', color: '#b98b52', main: 'atk' },
  { id: 1103, name: '法杖', slot: 'weapon', grp: 'staff', icon: 'staff', color: '#8f6fc4', main: 'matk' },
  { id: 1104, name: '匕首', slot: 'weapon', grp: 'dagger', icon: 'dagger', color: '#a8b2c8', main: 'atk' },
  { id: 1105, name: '锤', slot: 'weapon', grp: 'hammer', icon: 'hammer', color: '#8b6b4a', main: 'atk' },
  { id: 1201, name: '头盔', slot: 'helmet', grp: 'helmet', icon: 'helmet', color: '#7f8ba6', main: 'def' },
  { id: 1202, name: '胸甲', slot: 'chest', grp: 'chest', icon: 'chest', color: '#8a94ad', main: 'def' },
  { id: 1203, name: '护腿', slot: 'legs', grp: 'legs', icon: 'legs', color: '#7a849c', main: 'def' },
  { id: 1204, name: '靴子', slot: 'boots', grp: 'boots', icon: 'boots', color: '#6a5b4a', main: 'def' },
  { id: 1205, name: '盾牌', slot: 'offhand', grp: 'chest', icon: 'shield', color: '#9a8b6b', main: 'def', defMul: 1.1 },
  { id: 1301, name: '戒指', slot: 'ring', grp: 'ring', icon: 'ring', color: '#d8c05a', main: 'acc' },
  { id: 1302, name: '项链', slot: 'necklace', grp: 'necklace', icon: 'necklace', color: '#5ad8d0', main: 'acc' },
  { id: 1303, name: '护符', slot: 'amulet', grp: 'amulet', icon: 'amulet', color: '#d05ad8', main: 'acc' }
];
GEAR_DEFS.forEach(d => { d.type = 'gear'; ITEMS[d.id] = d; });
function getGearDef(id) { return ITEMS[id]; }

function gearBaseStat(def, lv, q) {
  const m = getQuality(q).mult;
  if (def.main === 'atk' || def.main === 'matk') return Math.round(baseAtk(lv) * m);
  if (def.main === 'acc') return Math.round(baseAcc(lv) * m);
  return Math.round(baseDef(lv) * m * (def.defMul || 1));
}
/** 生成一件装备实例 */
function newGear(id, lv, q, enhance) {
  const def = ITEMS[id];
  q = clamp(Math.round(q), 1, 10);
  lv = clamp(Math.round(lv), 1, 60);
  const Q = getQuality(q);
  const inst = {
    uid: _uidSeq++, type: 'gear', id: id, lv: lv, q: q, n: 1, enhance: enhance || 0,
    affix: [], eff: [], mods: {}, procs: [], holes: [], reroll: 0, timer: 0
  };
  const isWpn = def.slot === 'weapon';
  const isAcc = def.main === 'acc';
  // 词条
  const nAffix = Q.affix + (chance(0.25) ? 1 : 0);
  for (let i = 0; i < nAffix; i++) inst.affix.push(rollAffix(lv));
  // 特效
  const pool = isWpn ? WPN_EFFECTS : (isAcc ? ACC_EFFECTS : ARMOR_EFFECTS);
  const avail = pool.filter(e => e.minQ <= q);
  const nEff = isWpn ? Math.min(avail.length, q >= 9 ? 3 : q >= 7 ? 2 : q >= 5 ? 1 : 0)
    : isAcc ? Math.min(avail.length, q >= 6 ? 2 : q >= 3 ? 1 : 0)
      : Math.min(avail.length, q >= 8 ? 3 : q >= 6 ? 2 : q >= 5 ? 1 : 0);
  const picked = [];
  for (let i = 0; i < nEff && avail.length; i++) {
    const e = choice(avail);
    if (picked.indexOf(e) >= 0) { i--; continue; }
    picked.push(e);
  }
  inst.eff = picked;
  // 聚合 mods / procs
  for (const e of picked) {
    if (e.mods) for (const k in e.mods) inst.mods[k] = (inst.mods[k] || 0) + e.mods[k];
    if (e.proc) inst.procs.push(e.proc);
  }
  // 品质固有加成
  if (isWpn) {
    const b = WPN_BONUS[q - 1];
    inst.mods.crit = (inst.mods.crit || 0) + b.crit;
    inst.mods.cdmg = (inst.mods.cdmg || 0) + b.cdmg;
    inst.mods.aspd = (inst.mods.aspd || 0) + b.aspd;
  } else if (!isAcc) {
    const b = ARMOR_BONUS[q - 1];
    inst.mods.hpPct = (inst.mods.hpPct || 0) + b.hp;
    inst.mods.reduction = (inst.mods.reduction || 0) + b.red;
    inst.mods.elemRes = (inst.mods.elemRes || 0) + b.res;
  }
  return inst;
}
/** 装备主属性（含强化） */
function gearMainStat(inst) {
  const def = ITEMS[inst.id];
  const base = gearBaseStat(def, inst.lv, inst.q);
  return Math.round(base * (1 + inst.enhance * 0.05));
}
function gearTitle(inst) {
  const def = ITEMS[inst.id];
  const t = NAME_TIER[def.grp][gearTier(inst.lv)];
  return getQuality(inst.q).name + '的' + t;
}
function gearFullName(inst) {
  let s = NAME_TIER[ITEMS[inst.id].grp][gearTier(inst.lv)];
  if (inst.enhance > 0) s += ' +' + inst.enhance;
  return s;
}
function gearValue(inst) {
  const def = ITEMS[inst.id];
  const baseKind = def.main === 'acc' ? 60 : (def.slot === 'weapon' ? 50 : 40);
  return Math.round(inst.lv * baseKind * (QUALITY_VALUE[inst.q] || 1) * (1 + inst.enhance * 0.05));
}

/* ================= 材料 / 消耗品 / 其它 ================= */
function mat(id, name, sub, price, lv, color, shape) {
  return defItem({ id, name, sub, price, lv, color, shape, type: 'mat', stack: 999 });
}
/* 矿石 */
mat(4001, '碎铜矿', 'ore', 4, 1, '#b87333', 'ore');
mat(4002, '铜矿石', 'ore', 8, 5, '#c97a3a', 'ore');
mat(4003, '锡矿石', 'ore', 8, 8, '#a9b4c2', 'ore');
mat(4004, '铁矿石', 'ore', 14, 20, '#8c8c96', 'ore');
mat(4005, '煤炭', 'ore', 10, 15, '#2c2c33', 'ore');
mat(4006, '银矿石', 'ore', 24, 25, '#cfd8e3', 'ore');
mat(4007, '金矿石', 'ore', 45, 35, '#e6c34a', 'ore');
mat(4008, '秘银矿石', 'ore', 90, 45, '#8fd6e8', 'ore');
mat(4009, '星铁矿石', 'ore', 180, 55, '#6fa8ff', 'ore');
mat(4010, '陨铁', 'ore', 380, 70, '#5f5f7a', 'ore');
mat(4011, '虚空晶矿', 'ore', 760, 80, '#a45cff', 'ore');
mat(4012, '星核矿石', 'ore', 1500, 90, '#5cf0ff', 'ore');
/* 木材 */
mat(4101, '松木', 'wood', 5, 1, '#8a6a42', 'wood');
mat(4102, '橡木', 'wood', 8, 5, '#7d5a34', 'wood');
mat(4103, '桦木', 'wood', 12, 20, '#c9b48c', 'wood');
mat(4104, '铁木', 'wood', 22, 30, '#5b4a3a', 'wood');
mat(4105, '紫檀', 'wood', 40, 45, '#6a3a55', 'wood');
mat(4106, '金丝楠', 'wood', 70, 50, '#c9a24a', 'wood');
mat(4107, '灵木', 'wood', 140, 60, '#7fd6a0', 'wood');
mat(4108, '星辉木', 'wood', 300, 70, '#8fd8ff', 'wood');
mat(4109, '世界树枝', 'wood', 900, 85, '#c8f0a0', 'wood');
/* 草药 */
mat(4201, '止血草', 'herb', 6, 1, '#6fbf6f', 'herb');
mat(4202, '薄荷', 'herb', 8, 5, '#9fe8b8', 'herb');
mat(4203, '月光花', 'herb', 18, 15, '#cfd8ff', 'herb');
mat(4204, '灵芝', 'herb', 30, 25, '#c46a4a', 'herb');
mat(4205, '雪莲', 'herb', 55, 35, '#dff2ff', 'herb');
mat(4206, '火参', 'herb', 60, 35, '#ff7a4a', 'herb');
mat(4207, '龙血草', 'herb', 120, 50, '#d04060', 'herb');
mat(4208, '星灵花', 'herb', 300, 70, '#a0a0ff', 'herb');
mat(4209, '虚空根', 'herb', 600, 80, '#8040c0', 'herb');
/* 怪物掉落 / 通用 */
mat(4301, '兽皮', 'mob', 10, 5, '#a07850', 'hide');
mat(4302, '丝线', 'mob', 12, 10, '#e8e8f0', 'thread');
mat(4303, '布料', 'mob', 14, 10, '#cfd8e8', 'cloth');
mat(4304, '兽骨', 'mob', 8, 5, '#e0dcc8', 'bone');
mat(4305, '羽毛', 'mob', 12, 15, '#cfd8e8', 'feather');
mat(4306, '毒囊', 'mob', 18, 20, '#7fd05a', 'sac');
mat(4307, '熔岩核心', 'mob', 120, 45, '#ff6a2a', 'core');
mat(4308, '冰晶碎片', 'mob', 90, 40, '#9fe8ff', 'core');
mat(4309, '暗影精华', 'mob', 150, 50, '#6a4ac0', 'core');
mat(4310, '星核碎片', 'special', 500, 60, '#7ff0ff', 'star');
mat(4311, '龙鳞', 'special', 800, 70, '#6ac0a0', 'scale');
mat(4312, '创世之尘', 'special', 3000, 90, '#ff9fe8', 'star');
mat(4313, '宝石', 'gem', 60, 30, '#4ac0ff', 'gem');
mat(4314, '水晶', 'gem', 45, 25, '#cfeaff', 'gem');
mat(4315, '清水', 'misc', 3, 1, '#7fcfff', 'water');
mat(4316, '强化石', 'misc', 120, 1, '#ffd76a', 'stone');
mat(4317, '高级强化石', 'misc', 400, 1, '#ff6ac0', 'stone');
mat(4318, '保护石', 'misc', 600, 1, '#9fe8ff', 'stone');
mat(4319, '洗练石', 'misc', 260, 1, '#9f7fff', 'stone');
mat(4320, '开孔锥', 'misc', 320, 1, '#ffb25a', 'stone');
/* 工具 */
function tool(id, name, sub, price, lv, speed, color) {
  const it = mat(id, name, sub, price, lv, color, 'tool');
  it.toolSpeed = speed; it.stack = 1; return it;
}
tool(5001, '木柄矿镐', 'tool', 100, 1, 1.0, '#8a6a42');
tool(5002, '铁制矿镐', 'tool', 600, 20, 1.4, '#9aa4b8');
tool(5003, '秘银矿镐', 'tool', 3000, 50, 1.9, '#8fd6e8');
tool(5011, '伐木斧', 'tool', 100, 1, 1.0, '#a06a3a');
tool(5012, '精钢斧', 'tool', 600, 20, 1.4, '#c0c8d8');
tool(5021, '药锄', 'tool', 100, 1, 1.0, '#7fbf6f');
tool(5022, '灵纹锄', 'tool', 600, 20, 1.4, '#9fe8b8');
tool(5031, '木鱼竿', 'tool', 120, 1, 1.0, '#c8a06a');
tool(5032, '灵泉鱼竿', 'tool', 800, 25, 1.5, '#7fcfff');
tool(5041, '捕虫网', 'tool', 100, 1, 1.0, '#cfd8e8');

/* 鱼类（渔场核心：品质 = 鱼种基准 ± 浮动） */
function fish(id, name, price, qbase, lv, color, region) {
  const it = mat(id, name, 'fish', price, lv, color, 'fish');
  it.qbase = qbase; it.region = region; return it;
}
fish(6001, '小鲫鱼', 20, 2, 1, '#9aa4b8', 'plain');
fish(6002, '草鱼', 24, 2, 1, '#7f8f6a', 'plain');
fish(6003, '翠风鲤', 80, 4, 10, '#cfe86a', 'plain');
fish(6004, '金背鲫', 160, 5, 12, '#ffd76a', 'plain');
fish(6005, '暗影鳗', 120, 4, 15, '#5a4a80', 'forest');
fish(6006, '沼泽鲶', 100, 3, 15, '#6a5a40', 'forest');
fish(6007, '幽灵鱼', 400, 6, 20, '#cff0ff', 'forest');
fish(6008, '火纹鱼', 150, 4, 22, '#ff8a4a', 'desert');
fish(6009, '熔岩鲤', 520, 6, 30, '#ff5a2a', 'desert');
fish(6010, '冰晶鱼', 180, 4, 32, '#9fe8ff', 'snow');
fish(6011, '极光鲑', 620, 6, 40, '#a0ffe0', 'snow');
fish(6012, '深渊盲鱼', 300, 5, 42, '#8a7fa0', 'abyss');
fish(6013, '虚空水母', 900, 7, 50, '#a45cff', 'abyss');
fish(6014, '星辉鱼', 1600, 8, 55, '#5cf0ff', 'ruin');
fish(6015, '虹彩水母', 1800, 8, 58, '#ff9fe8', 'ruin');
fish(6016, '深海鳕', 60, 3, 8, '#a8c0d8', 'coast');
fish(6017, '金枪鱼', 140, 4, 18, '#5a8ac0', 'coast');

/* 种子 / 作物 */
function cropPair(id, seedName, cropName, growMin, price, lv, fish0) {
  const sd = defItem({ id: id, name: seedName, type: 'seed', sub: 'seed', price: Math.round(price * 0.4), lv: lv, stack: 99, growMin: growMin, cropId: id + 1, color: '#c8b070', shape: 'seed' });
  const cr = defItem({ id: id + 1, name: cropName, type: 'crop', sub: 'crop', price: price, lv: lv, stack: 99, priceBase: price, color: '#9fd06a', shape: 'crop' });
  return sd;
}
cropPair(7001, '小麦种子', '小麦', 6, 12, 1);
cropPair(7003, '胡萝卜种子', '胡萝卜', 4, 18, 1);
cropPair(7005, '月光花种', '月光花瓣', 20, 70, 15);
cropPair(7007, '火焰椒种', '火焰椒', 14, 110, 25);
cropPair(7009, '冰晶草种', '冰晶草', 30, 180, 35);
cropPair(7011, '星辰果种', '星辰果', 40, 700, 50);

/* ================= 消耗品 ================= */
function consum(id, name, price, lv, desc, use, icon, color, buffId) {
  return defItem({ id, name, type: 'use', price, lv, desc, use, icon, color, buffId, stack: 99 });
}
consum(3001, '小型生命药水', 60, 1, '立即恢复 35% 最大生命（60秒内最多使用10次）', g => {
  const p = g.player; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35); g.floatText(p, '+' + Math.round(p.maxHp * 0.35), '#7fdba4'); return true;
}, 'potion', '#ff5a6a');
consum(3002, '大型生命药水', 220, 15, '立即恢复 70% 最大生命', g => {
  const p = g.player; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.7); g.floatText(p, '+' + Math.round(p.maxHp * 0.7), '#7fdba4'); return true;
}, 'potion', '#ff3a5a');
consum(3003, '魔力药水', 60, 1, '恢复 40% 最大魔力', g => {
  const p = g.player; p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.4); g.floatText(p, '+' + Math.round(p.maxMp * 0.4), '#7fcfff'); return true;
}, 'potion', '#4d86e8');
consum(3004, '力量药剂', 180, 20, '30秒内 ATK+20%', g => { BuffSys.apply(g.player, 'B002', g); return true; }, 'elixir', '#ff9a6a', 'B002');
consum(3005, '铁壁药剂', 180, 20, '30秒内 DEF+25%', g => { BuffSys.apply(g.player, 'B005', g); return true; }, 'elixir', '#6ab0ff', 'B005');
consum(3006, '疾风药剂', 150, 15, '30秒内移动速度 +25%', g => { BuffSys.apply(g.player, 'B011', g); return true; }, 'elixir', '#9ff0a0', 'B011');
consum(3007, '幸运星', 300, 25, '10分钟内掉落率 +25%', g => { BuffSys.apply(g.player, 'B015', g); return true; }, 'elixir', '#ffe07a', 'B015');
consum(3008, '经验之书', 500, 30, '10分钟内经验获取 +25%', g => { BuffSys.apply(g.player, 'B020', g); return true; }, 'scroll', '#d0a0ff', 'B020');
consum(3009, '采集加速药水', 120, 10, '10分钟采集速度 +25%', g => { BuffSys.apply(g.player, 'B201', g); return true; }, 'elixir', '#c08a5a', 'B201');
consum(3010, '回城卷轴', 50, 1, '传送回星落村', g => { g.teleportTo(g.world.homeEntry.x, g.world.homeEntry.y); return true; }, 'scroll', '#ffe0a0');
consum(3011, '烤肉', 80, 5, '食用后 5 分钟内 ATK+10%（战斗回血）', g => { BuffSys.apply(g.player, 'B001', g); g.player.hp = Math.min(g.player.maxHp, g.player.hp + g.player.maxHp * 0.2); return true; }, 'food', '#c0703a', 'B001');
consum(3012, '蔬菜汤', 80, 5, '食用后 5 分钟内 DEF+10%', g => { BuffSys.apply(g.player, 'B004', g); return true; }, 'food', '#7fbf6f', 'B004');

/* ================= 实例与通用接口 ================= */
function newItem(id, n, q, lv) {
  const def = ITEMS[id];
  if (!def) return null;
  if (def.type === 'gear') return newGear(id, lv || 1, q || 2, 0);
  return { uid: _uidSeq++, type: def.type, id: id, q: q || 2, n: n || 1, lv: lv || def.lv || 1 };
}
function itemDef(inst) { return ITEMS[inst.id]; }
function itemName(inst) {
  const d = ITEMS[inst.id];
  if (inst.type === 'gear') return gearFullName(inst);
  return d.name;
}
function itemFullLabel(inst) {
  if (inst.type === 'gear') return gearTitle(inst);
  const d = ITEMS[inst.id];
  if (inst.q && inst.q !== 2) return getQuality(inst.q).name + '的' + d.name;
  return d.name;
}
function itemMaxStack(inst) { return ITEMS[inst.id].stack || 1; }
function itemPrice(inst) {
  if (inst.type === 'gear') return gearValue(inst);
  const d = ITEMS[inst.id];
  const qm = 1 + (inst.q - 2) * 0.7;
  return Math.max(1, Math.round(d.price * Math.max(0.35, qm)));
}
/** 系统生成：随机装备（怪物掉落） */
function rollEquipDrop(lv, source) {
  const q = rollQuality(source, 1);
  const id = choice(GEAR_DEFS).id;
  return newGear(id, clamp(lv + irnd(-2, 3), 1, 60), q, 0);
}
/** 系统生成：按类型 */
function rollEquipOfSlot(slot, lv, source) {
  const list = GEAR_DEFS.filter(d => d.slot === slot);
  return newGear(choice(list).id, clamp(lv + irnd(-2, 3), 1, 60), rollQuality(source), 0);
}
function rollFishQuality(def) {
  let q = def.qbase;
  const r = Math.random();
  if (r < 0.12) q += 2; else if (r < 0.38) q += 1; else if (r > 0.9) q -= 1;
  return clamp(Math.round(q), 1, 10);
}
