# 数值设计 · 常量集中化（balance.js）与调试面板

## 1. 现状：常量"半集中"

| 域 | 位置 | 内容 |
|---|---|---|
| 战斗 | `11_combat.js:8-12` `COMBAT_CONST`、`:26-62 calc()` | 防御系数 0.6、保底 10%、暴击上限 4.0、连击 ≤+50%、随机 ±8% |
| 属性 | `12_entities.js:101-176 recompute()`、`:104-109` 基础曲线 | `hp=100+(L-1)*12+(L-1)²*0.3` 等 |
| 等级 | `12_entities.js:7` | `expToNext = 100×lv^1.8×(1+lv*.02)` |
| 品质 | `01_quality.js:6-17` mult .7→8.0、`:24-35` 权重表、`:49-58` 部位加成、`:101-119` 词条池 | 10 级品质 |
| 装备评分 | `18_gear_sys.js:52-88` | 主属性 60% + 品质强化 15% + 词条 15% + 特效镶嵌 10% |
| 怪物 | `05_monsters.js:159+` `spawnMonsterData`、`TYPE_MULT × region.diff`、`:43 DROP_TIER_MUL`（normal .35 / elite .7 / boss 1） | 成长与掉落 |
| 区域 | `04_world_data.js:11-157` | 每区 `lv[min,max]`、`diff`、资源权重、tree/rock/herb 密度 |
| 经济 | 分散在 `02_items.js` 估价、`21_market.js`、`20_idle.js` | 价格与挂机产出 |

问题：调一个数值要在 4~5 个文件里找；没有"一处改全局生效"，也没有热调能力。

## 2. 做法：新建 `src/00_balance.js`

**原则：只搬迁，不改值**（本次不动任何数值平衡，纯重构，风险最低）。

```
BALANCE = {
  level:   { expBase, expPow, expLinear, maxLevel, ... },
  stat:    { hp:{base,lin,quad}, mp:{...}, atk, def, spd, crit, critDmg, ... },
  combat:  { defCoef, dmgFloor, critCap, comboCap, rng, elemMul, ... },
  quality: { mults:[...], weights:{...}, wpnBonus, armorBonus, effects, affixPool },
  drop:    { tierMul:{normal,elite,boss}, regionDiff, typeMult },
  gearScore:{ main, quality, affix, gem },
  economy: { priceBase, marketFee, idleRate }
}
```
- 引入顺序：`00_balance.js` 放在 `00_utils.js` 之后（index.html 首位区），各原处改为引用 `BALANCE.x`
- 兼容：原常量名保留为同义引用（`const COMBAT_CONST = BALANCE.combat`），避免遗漏调用点
- 迁移顺序（每步一测）：combat → stat/level → quality → drop → gearScore → economy

## 3. 调试面板（新增，仅本地生效）

- 开关：设置里「开发者调试」（默认关）+ 快捷键 F9
- 形态：DOM 浮层，列出 `BALANCE` 关键系数为滑条，拖动立即生效（重算 `recompute()` / 刷新评分）
- 「导出 JSON / 导入 JSON」按钮：把当前调过的系数导出，方便你把数值带回给我固化
- **不写存档**（除非点"保存到本地"），不影响线上数值

## 4. 验收清单

| # | 项 | 判定 |
|---|---|---|
| N-1 | 迁移前后战力 `power` 完全一致 | 用例：随机 20 个角色配置，迁移前后逐项比对（差值 <1e-6） |
| N-2 | 装备评分 `gearScore` 一致 | 用例：随机 200 件装备比对 |
| N-3 | 挂机结算一致 | 用例：同一配置跑 100 次结算比对总量 |
| N-4 | 调试面板能热改并立即反映到战力 | 手动/用例 |
| N-5 | 无遗漏引用（原常量改引用后无 undefined） | 全量 `node --check` + 无头启动用例 |

## 5. 明确不做

- **不改任何数值**（改平衡是独立需求，需要你的目标：难度曲线？经济通胀？）
- **不做区域群系化**（`tileInfo` 是烘焙/寻路/刷怪/存档共同依赖，代价高风险大，单列）
