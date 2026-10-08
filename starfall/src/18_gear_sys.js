/* ============================================================
 * 18_gear_sys.js —— 装备战力 / 评分 / 对比 / 洗练 / 打孔 / 镶嵌 / 链接
 * 纯逻辑层，UI 只负责调用与展示
 * ==========================================================*/
'use strict';

/* ---------- 1. 属性值 → 战力权重（与 Player.recompute 的战力公式一致） ---------- */
const POWER_W = {
  atk: 3, matk: 2, def: 4, mdef: 2, hp: 0.5, mp: 0.1,
  crit: 8, cdmg: 2, aspd: 6, dodge: 5, lifesteal: 6, pen: 4,
  hpPct: 4, mpRegenPct: 2, reduction: 6, elemRes: 2, elemDmg: 3,
  cdr: 4, moveSpd: 3, allStat: 20, dropPct: 2, goldPct: 2, expPct: 2,
  gatherPct: 1, hit: 3
};
/** 词条加成 ≠ 面板数值时的换算（例如 hpPct 按当前等级血量折算） */
const PCT_BASE = { hpPct: 300, mpPct: 200, moveSpd: 0, gatherPct: 0 };
/** 属性中文名（07_talents 的 MOD_CN 之外补齐装备常用键） */
const _MOD_CN_EXTRA = {
  atk: '攻击', matk: '魔攻', def: '防御', mdef: '魔防', hp: '生命', mp: '魔力',
  hpPct: '生命', mpPct: '魔力', cdr: '冷却缩减', acc: '饰品主属性'
};
function statCN(k) { return (typeof MOD_CN !== 'undefined' && MOD_CN[k]) || _MOD_CN_EXTRA[k] || k; }

/** 装备提供的全部属性增量（主属性 + 品质加成 + 特效 mods + 词条 + 镶嵌） */
function gearContrib(inst) {
  const out = {};
  const add = (k, v) => { if (typeof v === 'number') out[k] = (out[k] || 0) + v; };
  if (!inst) return out;
  const def = ITEMS[inst.id];
  const main = gearMainStat(inst);
  if (def.main === 'atk') add('atk', main);
  else if (def.main === 'matk') add('matk', main);
  else if (def.main === 'acc') { add('atk', Math.round(main * 0.4)); add('matk', Math.round(main * 0.4)); add('def', Math.round(main * 0.3)); }
  else add('def', main);
  if (inst.mods) for (const k in inst.mods) add(k, inst.mods[k]);
  (inst.affix || []).forEach(a => add(a.key, a.v));
  (inst.holes || []).forEach(g => { if (g) { const m = gemMods(g, inst.lv); for (const k in m) add(k, m[k]); } });
  return out;
}
/** 装备战力贡献 */
function gearPower(inst) {
  const c = gearContrib(inst);
  let sum = 0;
  for (const k in c) {
    let v = c[k];
    if (PCT_BASE[k]) v = v / 100 * PCT_BASE[k];
    sum += v * (POWER_W[k] || 1);
  }
  return Math.max(0, Math.round(sum));
}
/** 该等级该部位装备的期望评分基准 */
function gearExpectedScore(inst) {
  const def = ITEMS[inst.id];
  const lv = inst.lv;
  const base = def.main === 'atk' || def.main === 'matk' ? baseAtk(lv) : (def.main === 'acc' ? baseAcc(lv) : baseDef(lv));
  return base * (def.main === 'acc' ? 5.5 : 3.6) + lv * 1.2;
}
/** 综合评分：主属性 60% + 品质/强化 15% + 词条 15% + 特效/镶嵌 10% */
function gearScore(inst) {
  if (!inst) return 0;
  const def = ITEMS[inst.id];
  const c = gearContrib(inst);
  let statScore = 0;
  for (const k in c) {
    let v = c[k];
    if (PCT_BASE[k]) v = v / 100 * PCT_BASE[k];
    statScore += v * (POWER_W[k] || 1) * 0.12;
  }
  const mainScore = statScore * 0.78;
  const qualityScore = (QUALITY_VALUE[inst.q] || 1) * 4 + getQuality(inst.q).mult * 30;
  const enhanceScore = inst.enhance * 12;
  const affixScore = (inst.affix || []).length * 45 + (inst.reroll || 0) * 3;
  const effScore = (inst.eff || []).length * 90;
  const holeScore = (inst.holes || []).filter(Boolean).length * 130 + (inst.holes || []).length * 20;
  const accMul = def.main === 'acc' ? 1.25 : 1;
  return Math.round((mainScore + qualityScore + enhanceScore + affixScore + effScore + holeScore) * accMul);
}
/** 评分区间 → 评价 */
const SCORE_RANKS = [
  [0.55, '废品', '#7a7a7a'], [0.75, '普通', '#cfd8e8'], [0.95, '良好', '#4CAF50'],
  [1.15, '优秀', '#2196F3'], [1.4, '精良', '#9C27B0'], [1.7, '极品', '#FF9800'],
  [2.1, '神话', '#F44336'], [2.6, '远古', '#FFD700'], [3.2, '星辉', '#00FFFF'], [99, '创世', '#FF55FF']
];
function gearRank(inst) {
  const r = gearExpectedScore(inst) > 0 ? gearScore(inst) / gearExpectedScore(inst) : 0;
  for (const s of SCORE_RANKS) if (r < s[0]) return { name: s[1], color: s[2], ratio: r };
  return { name: '未知', color: '#fff', ratio: r };
}

/* ---------- 2. 装备对比 ---------- */
const CMP_KEYS = ['atk', 'matk', 'def', 'mdef', 'hp', 'mp', 'crit', 'cdmg', 'aspd', 'dodge', 'lifesteal', 'pen', 'reduction', 'cdr', 'moveSpd', 'allStat', 'elemDmg', 'hpPct'];
function gearCompare(a, b) {
  // a = 候选（新），b = 参照（当前已装备）；delta > 0 表示更强
  const ca = gearContrib(a), cb = b ? gearContrib(b) : {};
  const rows = CMP_KEYS.filter(k => Math.abs((ca[k] || 0) - (cb[k] || 0)) > 0.001)
    .map(k => ({ key: k, a: ca[k] || 0, b: cb[k] || 0, d: (ca[k] || 0) - (cb[k] || 0), label: statCN(k), unit: PERCENT_KEYS.has(k) ? '%' : '' }));
  return {
    rows: rows,
    hasRows: rows.length > 0,
    powerA: gearPower(a), powerB: b ? gearPower(b) : 0,
    powerD: gearPower(a) - (b ? gearPower(b) : 0),
    scoreA: gearScore(a), scoreB: b ? gearScore(b) : 0,
    scoreD: gearScore(a) - (b ? gearScore(b) : 0),
    mainA: gearMainStat(a), mainB: b ? gearMainStat(b) : 0,
    better: gearPower(a) >= (b ? gearPower(b) : 0)
  };
}
const PERCENT_KEYS = new Set(['crit', 'cdmg', 'aspd', 'dodge', 'lifesteal', 'pen', 'reduction', 'cdr', 'moveSpd', 'allStat', 'elemDmg', 'hpPct', 'dropPct', 'goldPct', 'expPct', 'gatherPct']);

/* ---------- 3. 打孔 / 镶嵌 ---------- */
/** 每种品质允许的最大孔数（粗糙 1 → 创世 5） */
function gearMaxHoles(q) { return Math.min(5, 1 + Math.floor(clamp(q, 1, 10) / 2)); }
/** 第 n 个孔的开孔消耗 */
function holeCost(inst, idx) {
  const drill = [1, 2, 4, 8, 12][Math.min(idx, 4)] || 12;
  return { id: 4320, n: drill, gold: Math.round(inst.lv * (60 + idx * 90) + (ITEMS[inst.id].main === 'acc' ? 200 : 0)) };
}
/** 可作为宝石镶嵌的材料 */
const SOCKET_GEMS = [
  { id: 4313, lv: 20, label: '宝石', desc: '攻击力大幅提升', color: '#4ac0ff', mods: l => ({ atk: Math.round(6 + l * 0.7) }) },
  { id: 4314, lv: 15, label: '水晶', desc: '魔攻与魔力', color: '#cfeaff', mods: l => ({ matk: Math.round(6 + l * 0.7), mp: 20 + l }) },
  { id: 4310, lv: 50, label: '星核碎片', desc: '全属性 + 暴击', color: '#7ff0ff', mods: l => ({ allStat: 3, crit: Math.round(2 + l * 0.05) }) },
  { id: 4311, lv: 60, label: '龙鳞', desc: '防御与生命', color: '#6ac0a0', mods: l => ({ def: Math.round(5 + l * 0.5), hpPct: 4 }) },
  { id: 4307, lv: 45, label: '熔岩核心', desc: '元素增伤', color: '#ff6a2a', mods: l => ({ elemDmg: 8 + Math.round(l * 0.1) }) },
  { id: 4308, lv: 40, label: '冰晶碎片', desc: '减伤', color: '#9fe8ff', mods: l => ({ reduction: 3 + Math.round(l * 0.06) }) },
  { id: 4312, lv: 90, label: '创世之尘', desc: '全属性大幅提升', color: '#ff9fe8', mods: l => ({ allStat: 8, hpPct: 10 }) }
];
const GEM_MAP = {};
SOCKET_GEMS.forEach(g => GEM_MAP[g.id] = g);
function gemMods(id, lv) { const g = GEM_MAP[id]; return g ? g.mods(lv || 1) : {}; }
function gemText(id, lv) {
  const m = gemMods(id, lv);
  return Object.keys(m).map(k => statCN(k) + ' +' + m[k] + (PERCENT_KEYS.has(k) ? '%' : '')).join('　');
}
/** 已开孔数量 */
function holesOf(inst) { return (inst.holes || []).length; }
/** 打第 n 个孔：返回 {ok, msg} */
function openHole(inst, p, game) {
  if (!inst || inst.type !== 'gear') return { ok: false, msg: '目标不是装备' };
  const n = holesOf(inst);
  if (n >= gearMaxHoles(inst.q)) return { ok: false, msg: '已达该品质最大孔数 ' + gearMaxHoles(inst.q) };
  const cost = holeCost(inst, n);
  if (p.countItem(cost.id) < cost.n) return { ok: false, msg: ITEMS[cost.id].name + '不足（需 ' + cost.n + '）' };
  if (p.gold < cost.gold) return { ok: false, msg: '金币不足（需 ' + fmt(cost.gold) + '）' };
  p.removeItem(cost.id, cost.n); p.gold -= cost.gold;
  inst.holes.push(null);
  p.recompute();
  return { ok: true, msg: '已开启第 ' + (n + 1) + ' 个孔（消耗 ' + ITEMS[cost.id].name + '×' + cost.n + '、' + fmt(cost.gold) + ' 金）' };
}
/** 镶嵌：idx 孔位放入宝石 id */
function socketGem(inst, idx, gemId, p) {
  if (!inst.holes || idx >= inst.holes.length) return { ok: false, msg: '孔位不存在' };
  if (inst.holes[idx]) return { ok: false, msg: '该孔已有宝石，请先取出' };
  const g = GEM_MAP[gemId]; if (!g) return { ok: false, msg: '该材料不能镶嵌' };
  if (inst.lv < (g.lv || 1)) return { ok: false, msg: '装备等级不足 Lv.' + g.lv };
  if (p.countItem(gemId) < 1) return { ok: false, msg: g.label + '不足' };
  p.removeItem(gemId, 1);
  inst.holes[idx] = gemId;
  p.recompute();
  return { ok: true, msg: '镶嵌 ' + g.label + '：' + gemText(gemId, inst.lv) };
}
/** 取出宝石：返还材料 */
function unsocketGem(inst, idx, p) {
  const id = inst.holes && inst.holes[idx];
  if (!id) return { ok: false, msg: '该孔没有宝石' };
  const cost = Math.round(inst.lv * 80);
  if (p.gold < cost) return { ok: false, msg: '取出需 ' + fmt(cost) + ' 金' };
  p.gold -= cost;
  inst.holes[idx] = null;
  const left = p.addItem(id, 1, 2);
  p.recompute();
  return { ok: true, msg: '取出 ' + (left ? '失败（背包已满）' : ITEMS[id].name) };
}

/* ---------- 4. 洗练（词条重铸） ---------- */
function rerollCost(inst) {
  const n = (inst.affix || []).length;
  return { id: 4319, n: 1 + Math.floor(n / 2), gold: Math.round(inst.lv * 40 + (QUALITY_VALUE[inst.q] || 1) * 60) };
}
/** 重铸全部词条（数量与生成规则同 newGear） */
function rerollAffix(inst, p) {
  if (!inst || inst.type !== 'gear') return { ok: false, msg: '目标不是装备' };
  const cost = rerollCost(inst);
  if (p.countItem(cost.id) < cost.n) return { ok: false, msg: ITEMS[cost.id].name + '不足（需 ' + cost.n + '）' };
  if (p.gold < cost.gold) return { ok: false, msg: '金币不足（需 ' + fmt(cost.gold) + '）' };
  const before = inst.affix.slice();
  p.removeItem(cost.id, cost.n); p.gold -= cost.gold;
  const Q = getQuality(inst.q);
  const nAffix = Q.affix + (chance(0.25) ? 1 : 0);
  inst.affix = [];
  for (let i = 0; i < nAffix; i++) inst.affix.push(rollAffix(inst.lv));
  inst.reroll = (inst.reroll || 0) + 1;
  p.recompute();
  return {
    ok: true,
    msg: '洗练完成（第 ' + inst.reroll + ' 次）：' + (inst.affix.map(affixText).join('、') || '无词条'),
    before: before
  };
}

/* ---------- 5. 装备链接（聊天/对比用） ---------- */
const EFF_BY_NAME = {};
[...WPN_EFFECTS, ...ARMOR_EFFECTS, ...ACC_EFFECTS].forEach(e => EFF_BY_NAME[e.name] = e);
/** 装备实例 → 可序列化的链接数据 */
function gearToLink(inst, owner) {
  return {
    t: 'gear', id: inst.id, lv: inst.lv, q: inst.q, enhance: inst.enhance,
    affix: (inst.affix || []).map(a => ({ key: a.key, label: a.label, unit: a.unit, pct: a.pct, v: a.v })),
    eff: (inst.eff || []).map(e => e.name),
    holes: (inst.holes || []).slice(),
    reroll: inst.reroll || 0,
    owner: owner || '', uid: inst.uid
  };
}
/** 链接数据 → 只读装备对象（结构与实例一致，可直接参与对比） */
function gearFromLink(d) {
  if (!d || d.t !== 'gear') return null;
  const inst = newGear(d.id, d.lv, d.q, d.enhance);
  inst.uid = d.uid || inst.uid;
  inst.affix = (d.affix || []).map(a => ({ key: a.key, label: a.label, unit: a.unit || '', pct: a.pct, v: a.v }));
  inst.eff = (d.eff || []).map(n => EFF_BY_NAME[n]).filter(Boolean);
  inst.mods = {}; inst.procs = [];
  inst.eff.forEach(e => {
    if (e.mods) for (const k in e.mods) inst.mods[k] = (inst.mods[k] || 0) + e.mods[k];
    if (e.proc) inst.procs.push(e.proc);
  });
  const isWpn = ITEMS[d.id].slot === 'weapon', isAcc = ITEMS[d.id].main === 'acc';
  if (isWpn) { const b = WPN_BONUS[d.q - 1]; inst.mods.crit = (inst.mods.crit || 0) + b.crit; inst.mods.cdmg = (inst.mods.cdmg || 0) + b.cdmg; inst.mods.aspd = (inst.mods.aspd || 0) + b.aspd; }
  else if (!isAcc) { const b = ARMOR_BONUS[d.q - 1]; inst.mods.hpPct = (inst.mods.hpPct || 0) + b.hp; inst.mods.reduction = (inst.mods.reduction || 0) + b.red; inst.mods.elemRes = (inst.mods.elemRes || 0) + b.res; }
  inst.holes = (d.holes || []).slice();
  inst.reroll = d.reroll || 0;
  inst._owner = d.owner || '';
  inst._isLink = true;
  return inst;
}

/* ---------- 6. 展示辅助 ---------- */
/** 装备主属性 / 词条 / 特效 / 镶嵌 的展示清单 */
function gearDisplayLines(inst) {
  const lines = [];
  const def = ITEMS[inst.id];
  lines.push({ t: '主属性', v: statCN(def.main) + ' ' + gearMainStat(inst) });
  (inst.affix || []).forEach(a => lines.push({ t: '词条', v: affixText(a) }));
  (inst.eff || []).forEach(e => lines.push({ t: '特效', v: e.name + '：' + e.desc }));
  (inst.holes || []).forEach((g, i) => lines.push({ t: '孔' + (i + 1), v: g ? (GEM_MAP[g] ? GEM_MAP[g].label + '　' + gemText(g, inst.lv) : '?') : '空' }));
  return lines;
}
