/* ============================================================
 * 17_codex.js —— 内置数据库：物资「来源 / 用途」反向索引
 * 供悬停提示、图鉴面板、排行榜使用（纯数据层，无渲染）
 * ==========================================================*/
'use strict';

const SHAPE_CN = {
  quad: '四足野兽', beast: '巨兽', bird: '飞禽', worm: '软体爬虫', humanoid: '人形生物',
  insect: '虫类', undead: '亡灵', golem: '岩石构造', plant: '植物', blob: '团状生物',
  ghost: '幽灵', dragon: '巨龙'
};
const POOL_SKILL = { ore: 'mine', wood: 'log', herb: 'herb', bug: 'bug' };

/** itemId -> 来源 / 用途索引 */
const ITEM_SRC = {};
function _srcOf(id) {
  return ITEM_SRC[id] || (ITEM_SRC[id] = {
    gather: [], fish: [], part: [], drop: [], craft: [], use: [],
    chest: false, supply: false, start: false, farm: null
  });
}
function ensureSrc(id) { return _srcOf(id); }

/* ================= 物品详细说明 =================
 * 加载期给每件物品补全「风味说明」；
 * 运行时由 UI / 悬停调用 itemDetailLines(id) 拿到完整的实用数据行。
 * ===============================================*/
const ITEM_FLAVOR = {
  4315: '最常见的清水，却是炼金台前消耗最快的材料。',
  4316: '锻造大师留下的强化媒介，能让装备突破原本的界限。',
  4317: '反复压缩的高阶强化石，+10 以上强化缺它不可。',
  4318: '包裹着星辉的保护石，可在强化失败时护住装备本体。',
  4319: '重铸装备词条的媒介，洗练次数会永远刻在装备上。',
  4320: '锋利的开孔工具，用于凿出镶嵌宝石的孔位。',
  4330: '野兽的鲜肉，烤熟后能迅速恢复体力。',
  4331: '精细研磨的小麦粉，多数食物的基底。',
  4332: '除杂熔炼后的精钢锭，工具与高阶装备的骨架。',
  4333: '粗盐，能让最朴素的食材也变得可口。',
  4334: '汲取灵气的泉水，高阶药剂的必备溶剂。',
  4310: '陨星坠落后散落的星核碎片，传说集齐 50 枚可唤醒真正的星痕。',
  4311: '坚不可摧的龙鳞，触之生寒，贴身携带格外沉重。',
  4312: '创世时代残留的尘埃，据说蕴含改写法则的力量。',
  4313: '通透的宝石，镶嵌后可大幅提升物理攻击。',
  4314: '含着微光的水晶，适合增幅魔力与法术。',
  4307: '滚烫的熔岩结晶，靠近便能感到灼热。',
  4308: '不化的冰晶碎片，握持时指尖结霜。'
};
function itemTierWord(lv) {
  lv = lv || 1;
  if (lv <= 1) return '新手级';
  if (lv < 25) return '初级';
  if (lv < 45) return '中级';
  if (lv < 70) return '高级';
  return '顶级';
}
const SUB_FLAVOR = {
  ore: d => itemTierWord(d.lv) + '金属原矿，纯度随矿脉深度提升，熔炼后可锻造武器、护甲与工具。',
  wood: d => itemTierWord(d.lv) + '木材，纹理紧实，适合打造工具柄身、家具与建筑材料。',
  herb: d => itemTierWord(d.lv) + '草药，采集后可直接入药，是炼金台的常客。',
  mob: d => '取自魔物身上的战利品，质地随怪物强度变化，多用于裁缝、锻造与炼金。',
  special: d => '极其稀有的特殊材料，通常只在高难区域的精英与首领身上出现。',
  gem: d => '通透的晶石，镶嵌进装备孔位后可显著增幅对应属性。',
  fish: d => '鲜活的渔获，品质浮动取决于运气与钓技，也可投放进家园渔场慢慢产出。',
  tool: d => '采集工具，随身携带可显著提升对应生活技能的采集效率。',
  seed: d => '可播种在家园农田的种子，成熟后收获对应作物。',
  crop: d => '农田中成熟收获的作物，可直接烹饪或作为炼金原料。',
  misc: d => '用途广泛的通用材料，冒险途中总能派上用场。'
};
function autoItemDesc(d) {
  if (d.type === 'gear') {
    const mainCN = { atk: '物理攻击', matk: '魔法攻击', acc: '全属性', def: '防御' }[d.main] || '防御';
    return '一件' + SLOT_CN[d.slot] + '，主属性提供' + mainCN + '。等级越高基础数值越高，词条数量、特效强度与孔位上限由品质决定。';
  }
  if (d.type === 'use') return d.desc || '可使用的消耗品。';
  const sub = SUB_FLAVOR[d.sub] || SUB_FLAVOR.misc;
  return sub(d);
}
/** 加载期补全每件物品的说明 */
function buildItemDescs() {
  Object.keys(ITEMS).forEach(id => {
    const d = ITEMS[id];
    if (!d.desc) d.desc = ITEM_FLAVOR[id] || autoItemDesc(d);
  });
}
buildItemDescs();

/** 运行时：某件物品的完整详细说明（数据行数组） */
function itemDetailLines(id) {
  const d = ITEMS[id];
  if (!d) return [];
  const out = [];
  const isSeed = d.type === 'seed', isCrop = d.type === 'crop';
  out.push('类别：' + codexTypeCN(d) + (d.sub ? '（' + codexSubCN(d) + '）' : ''));
  if (d.type === 'gear') {
    const lv = 30;
    out.push('部位：' + SLOT_CN[d.slot] + '　主属性：' + ({ atk: '物理攻击', matk: '魔法攻击', acc: '全属性', def: '防御' }[d.main] || '防御'));
    out.push('Lv.30 基准：' + Math.round((d.main === 'atk' || d.main === 'matk' ? baseAtk(lv) : d.main === 'acc' ? baseAcc(lv) : baseDef(lv))) +
      '　Lv.60 基准：' + Math.round((d.main === 'atk' || d.main === 'matk' ? baseAtk(60) : d.main === 'acc' ? baseAcc(60) : baseDef(60))));
    out.push('每件装备随机 1~5 条词条；品质越高，词条越多、特效越强、孔位上限越高（最高 5 孔）。');
  } else {
    const ref = { id: id, q: 2, type: d.type };
    out.push('参考单价：' + fmt(itemPrice(ref)) + ' 金' + (d.stack && d.stack > 1 ? '　堆叠上限：' + d.stack : '　不可堆叠'));
  }
  if (d.lv) out.push('等级需求：Lv.' + d.lv);
  if (d.toolSpeed) out.push('工具效率：' + d.toolSpeed.toFixed(1) + '（徒手为 1.0，按 40% 权重计入单次采集耗时公式）');
  if (isSeed && ITEMS[d.cropId]) out.push('成熟产物：' + ITEMS[d.cropId].name + '　生长时间：' + d.growMin + ' 分钟');
  if (isCrop) {
    const sd = Object.values(ITEMS).find(i => i.type === 'seed' && i.cropId === id);
    if (sd) out.push('来源种子：' + sd.name + '（' + sd.growMin + ' 分钟成熟）');
  }
  if (d.type === 'mat' && d.sub === 'fish') {
    const reg = REGIONS.find(r => r.fishArea === d.region);
    out.push('渔区：' + (reg ? reg.name : d.region || '未知') + '　品质基准：' + getQuality(d.qbase || 2).name + '（实际浮动 ±2 阶）');
  }
  if (typeof GEM_MAP !== 'undefined' && GEM_MAP[id]) {
    const gm = GEM_MAP[id];
    out.push('可镶嵌：' + gm.desc + '　镶嵌要求装备 Lv.' + gm.lv + ' 以上');
    out.push('Lv.30 镶嵌效果：' + Object.keys(gm.mods(30)).map(k => statCN(k) + ' +' + gm.mods(30)[k] + (PERCENT_KEYS.has(k) ? '%' : '')).join('　'));
  }
  const src = itemSources(id);
  if (src.length) out.push('获取方式：' + src.slice(0, 3).join('；') + (src.length > 3 ? ' 等 ' + src.length + ' 种' : ''));
  const use = itemUses(id);
  if (use.length) out.push('主要用途：' + use.slice(0, 3).join('；') + (use.length > 3 ? ' 等 ' + use.length + ' 项' : ''));
  if (typeof Market !== 'undefined' && Market.countListed) {
    const n = Market.countListed(id);
    if (n) out.push('拍卖行：当前有 ' + n + ' 条在售挂单');
  }
  return out;
}
function codexSubCN(d) {
  const m = {
    ore: '矿石', wood: '木材', herb: '草药', bug: '虫类', mob: '怪物掉落', special: '特殊材料',
    gem: '宝石', misc: '杂物', fish: '渔获', tool: '工具', seed: '种子', crop: '作物', water: '液体',
    powder: '粉末', ingot: '锭', food: '食材', stone: '石料'
  };
  return m[d.sub] || d.sub || '其它';
}

/* ---------- 1. 采集资源点（各大区资源池） ---------- */
REGIONS.forEach(r => {
  ['ore', 'wood', 'herb', 'bug'].forEach(k => {
    (r.res[k] || []).forEach(e => {
      const s = _srcOf(e.id);
      const hit = s.gather.find(g => g.skill === POOL_SKILL[k] && g.lv === (e.lv || 1));
      if (hit) hit.regions.push(r.name);
      else s.gather.push({ skill: POOL_SKILL[k], lv: e.lv || 1, regions: [r.name] });
    });
  });
});

/* ---------- 2. 钓鱼：按渔区反查大区 ---------- */
Object.values(ITEMS).forEach(i => {
  if (i.type !== 'mat' || i.sub !== 'fish') return;
  const s = _srcOf(i.id);
  REGIONS.forEach(r => { if (r.fishArea === i.region) s.fish.push(r.name); });
});

/* ---------- 3. 怪物取材 / 随身杂物 / 模板掉落 ---------- */
Object.keys(MOB_PARTS || {}).forEach(shape => {
  (MOB_PARTS[shape] || []).forEach(d => {
    _srcOf(d.id).part.push(SHAPE_CN[shape] || shape);
  });
});
(MOB_SUPPLY || []).forEach(d => { _srcOf(d.id).supply = true; });

/** 怪物图谱（图鉴 / 悬停用） */
const MONSTER_LIST = [];
Object.keys(MONSTERS).forEach(key => {
  const reg = REGION_BY_KEY[key], pool = MONSTERS[key];
  Object.keys(pool).forEach(tier => {
    (pool[tier] || []).forEach(tpl => {
      MONSTER_LIST.push({ region: reg, tier: tier, tpl: tpl });
      (tpl.drop || []).forEach(d => {
        _srcOf(d.id).drop.push({ name: tpl.name, region: reg.name, tier: tier, p: d.p });
      });
    });
  });
});

/* ---------- 4. 宝箱 / 家园种植 ---------- */
[4315, 4316, 3001, 3003, 4301, 4302, 4303, 4333, 4319, 4320].forEach(id => { _srcOf(id).chest = true; });
Object.values(ITEMS).forEach(i => {
  if (i.type !== 'seed') return;
  _srcOf(i.id).chest = true;                       // 种子由宝箱按区域等级产出
  const crop = _srcOf(i.cropId);
  crop.farm = { seed: i.name, growMin: i.growMin || 1, lv: i.lv || 1 };
});

/* ---------- 5. 配方：产出 / 消耗 ---------- */
RECIPES.forEach(r => {
  if (r.out.item) _srcOf(r.out.item).craft.push({ name: r.name, skill: r.skill, req: r.req, n: r.out.n });
  if (r.out.gear) _srcOf(r.out.gear).craft.push({ name: r.name, skill: r.skill, req: r.req, gear: true, lv: r.out.lv });
  r.mats.forEach(m => {
    const s = _srcOf(m.id);
    if (!s.use.some(u => u.name === r.name)) s.use.push({ name: r.name, skill: r.skill, req: r.req, n: m.n });
  });
});

/* ---------- 6. 开局物资 ---------- */
[3001, 3003, 5001, 5011, 5021, 5031, 7001, 7003, 4315, 4330, 4005].forEach(id => { _srcOf(id).start = true; });

/* ================= 查询辅助 ================= */
function codexTypeCN(def) {
  if (!def) return '未知';
  if (def.type === 'mat') {
    return { ore: '矿石', wood: '木材', herb: '草药', mob: '怪物材料', gem: '宝石', fish: '渔获', misc: '加工材料', special: '稀有素材', tool: '工具' }[def.sub] || '材料';
  }
  return { use: '消耗品', seed: '种子', crop: '作物', gear: '装备' }[def.type] || def.type;
}

/** 来源描述（用于悬停 / 图鉴） */
function itemSources(id) {
  const s = ITEM_SRC[id], out = [];
  if (!s) return out;
  s.gather.forEach(g => {
    out.push('采集（' + SKILL_CN[g.skill] + ' Lv.' + g.lv + '）：' + g.regions.join(' / '));
  });
  if (s.fish.length) out.push('钓鱼：' + s.fish.join(' / '));
  if (s.farm) out.push('家园种植：' + s.farm.seed + '（' + s.farm.growMin + ' 分钟成熟）');
  if (s.part.length) out.push('怪物取材：' + s.part.join(' / '));
  const drops = s.drop.slice(0, 4);
  if (drops.length) {
    out.push('怪物掉落：' + drops.map(d =>
      (d.tier === 'normal' ? '' : TYPE_CN[d.tier]) + d.name + '（' + Math.round(d.p * 100) + '%）').join('、'));
  }
  if (s.supply) out.push('怪物随身杂物（随机）');
  if (s.chest) out.push('宝箱产出');
  s.craft.slice(0, 3).forEach(c => {
    out.push('制作：' + SKILL_CN[c.skill] + '「' + c.name + '」(Lv.' + c.req + ')');
  });
  if (s.start) out.push('开局物资');
  return out;
}

/** 用途描述 */
function itemUses(id) {
  const s = ITEM_SRC[id];
  if (!s) return [];
  return s.use.map(u => SKILL_CN[u.skill] + '「' + u.name + '」×' + u.n + '（Lv.' + u.req + '）');
}

/** 图鉴：按类型取物品清单 */
function codexItems(typeFilter, kw, seen) {
  const kws = (kw || '').trim().toLowerCase();
  return Object.values(ITEMS).filter(i => {
    if (typeFilter && typeFilter !== 'all') {
      if (typeFilter === 'mat') { if (i.type !== 'mat') return false; }
      else if (typeFilter === 'fish') { if (!(i.sub === 'fish')) return false; }
      else if (typeFilter === 'gear') { if (i.type !== 'gear') return false; }
      else if (typeFilter === 'seed') { if (i.type !== 'seed' && i.type !== 'crop') return false; }
      else if (i.type !== typeFilter) return false;
    }
    if (kws && String(i.name).toLowerCase().indexOf(kws) < 0 && String(i.id).indexOf(kws) < 0) return false;
    return true;
  }).sort((a, b) => (a.id - b.id));
}

/** 图鉴：怪物清单 */
function codexMonsters(kw, regionKey) {
  const kws = (kw || '').trim().toLowerCase();
  return MONSTER_LIST.filter(m => {
    if (regionKey && regionKey !== 'all' && m.region.key !== regionKey) return false;
    if (kws && String(m.tpl.name).toLowerCase().indexOf(kws) < 0) return false;
    return true;
  }).sort((a, b) => {
    const t = { normal: 0, elite: 1, boss: 2, world: 3 };
    return (a.region.id - b.region.id) || ((t[a.tier] || 0) - (t[b.tier] || 0));
  });
}

/** 图鉴：配方清单 */
function codexRecipes(kw, skill) {
  const kws = (kw || '').trim().toLowerCase();
  return RECIPES.filter(r => {
    if (skill && skill !== 'all' && r.skill !== skill) return false;
    if (kws) {
      const hit = String(r.name).toLowerCase().indexOf(kws) >= 0;
      const matHit = r.mats.some(m => ITEMS[m.id] && String(ITEMS[m.id].name).toLowerCase().indexOf(kws) >= 0);
      if (!hit && !matHit) return false;
    }
    return true;
  });
}

/** 图鉴：大区资源总览 */
function codexRegionRes() {
  return REGIONS.map(r => ({
    region: r, lv: r.lv, elem: r.elem, desc: r.desc,
    res: ['ore', 'wood', 'herb', 'bug'].map(k => ({
      skill: POOL_SKILL[k],
      items: (r.res[k] || []).map(e => ({ name: ITEMS[e.id].name, id: e.id, lv: e.lv || 1 }))
    })),
    fish: Object.values(ITEMS).filter(i => i.sub === 'fish' && i.region === r.fishArea).map(i => ({ name: i.name, id: i.id }))
  }));
}

/* ================= 生活技能排行榜数据 ================= */
const GATHER_METRICS = [
  { key: 'lv', name: '采集等级' },
  { key: 'cnt', name: '采集次数' },
  { key: 'val', name: '采集总价' }
];
const CRAFT_METRICS = [
  { key: 'lv', name: '制作等级' },
  { key: 'cnt', name: '制作次数' },
  { key: 'best', name: '最高品质' }
];

/** 读取某生活技能的统计（老存档缺字段时补 0） */
function lifeStat(p, k) {
  const s = p.life[k] || {};
  return {
    lv: s.lv || 1, exp: s.exp || 0,
    cnt: s.cnt || 0,
    val: s.val || 0,
    best: s.best || 0,
    bestName: s.bestName || ''
  };
}
/** 排行榜行数据 + 名次 */
function lifeRanking(p) {
  const rows = [];
  GATHER_SKILLS.forEach(k => rows.push(Object.assign({ skill: k, kind: 'gather' }, lifeStat(p, k))));
  CRAFT_SKILLS.forEach(k => rows.push(Object.assign({ skill: k, kind: 'craft' }, lifeStat(p, k))));
  return rows;
}
function rankBy(rows, metric, kind) {
  const list = rows.filter(r => r.kind === kind).slice();
  list.sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
  list.forEach((r, i) => r.rank = i + 1);
  return list;
}
