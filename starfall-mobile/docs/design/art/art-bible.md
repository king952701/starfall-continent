# 美术圣经 · 画质 / 贴图 / 人物 / 动画

## 0. 不可破坏的底线

- 像素风主路径：`CV()` 内 `imageSmoothingEnabled=false`，画布 CSS `image-rendering:pixelated`（`css/style.css:13`）
- 角色逻辑尺寸 **16×24**（`Sprites.drawChar`，`S=2` 渲成 32×48）——本次不放大逻辑尺寸，只加层与加帧，避免全身重绘
- 所有新效果必须挂画质档与 `Mobile.on` 分流，低端机可完全关闭

## 1. 画质：分辨率与后处理

### 1.1 DPR（现状问题）

`15_game.js:39-46`：`canvas 像素 = min(innerW,1920)×min(innerH,1080) × Settings.qScale`，**无 `devicePixelRatio`**，高 DPI 手机/4K 屏实际是 CSS 拉伸放大 → 糊。

新策略：

```
dpr   = min(window.devicePixelRatio || 1, Mobile.on ? 2 : 2)
eff   = 1 + (dpr - 1) * 0.6          // 不完全按物理像素，取 60% 折中，控制填充率
base  = min(innerW, 1920) , min(innerH, 1080)
px    = base * Settings.qScale * eff
上限  = 2560×1440（超过则回落，移动端上限 1920×1080）
```
- 低画质档 `qScale=.6` 时 `eff=1`（不再放大，优先帧率）
- `resize` 与 `Settings` 变更都要重算；`world` 区块缓存不受影响（世界按世界坐标绘制，缩放只改相机变换）

### 1.2 泛光 Bloom（新增，仅中/高画质）

流程（每帧，主画布之后）：
1. 离屏 `b1 = w/4 × h/4`：`drawImage(主画布)` 降采样
2. 阈值提亮：`globalCompositeOperation` 用 `source-over` 画一层 `rgba(0,0,0,α)` 压暗暗部（近似 threshold），阈值 0.62
3. 模糊：两次 box blur（水平+垂直，半径 2/4）→ `b2`
4. 叠加：`lighter`，`globalAlpha = 强度`

| 档 | 强度 | 说明 |
|---|---|---|
| 低 | 0（完全跳过） | 移动端默认 |
| 中 | 0.35 | |
| 高 | 0.60 | |
| 移动端 | 默认关，设置里可开 | 填充率敏感 |

发光源优先级：夜间提灯、技能特效、水面高光、金色交互提示。

### 1.3 色调映射（LUT 近似）

保持现有 `drawAtmosphere()` 的昼夜色罩顺序不变，在其**之后**追加一层：
- 对比度：`ctx.filter` 不可用（Canvas2D 无 LUT），改用「整屏半透明色罩 + 高光 `lighter` 叠加」近似
- 分区域基调：雪原 +冷蓝 / 沙漠 +暖黄 / 深渊 +紫 / 遗迹 +青灰，强度 0.06~0.10（要克制）

## 2. 贴图

| 项 | 现状 | 做法 |
|---|---|---|
| 数量 | 42 PNG（39 瓦片·原创生成 + 3 小船·Kenney CC0），其余 675 行程序化 | 保持程序化为主 |
| 缩放闪烁 | `pixelated` + zoom<1 会摩尔纹 | 预生成 2 级缩放（1× / 0.5×）缓存，按当前 zoom 选级 |
| 无图集 | 水面/草丛逐格 `drawImage`（单区块最多 256 次） | 区块烘焙时把同类格合成为一张 512 图集，运行时一次 drawImage |
| 缓存 | `Assets.variant()` 无上限 | LRU 上限 256 项，超出淘汰最久未用 |
| 加载失败 | 仅改 footer 文案 | 加可见提示条 + 强制回退程序化贴图（现有回退逻辑保留） |

## 3. 人物模型：装备影响外观

现状：`drawChar(x, look, dir, frame, wepType)`，`look = {skin,hair,cloth,trim,pants,wep}` 固定来自职业（`03_skills.js:28/45/62/79`），**装备完全不体现**。

扩展（不破坏现有调用方，新增可选参数 `gearLook`）：

```
gearLook = {
  helm:  null | {kind:'helm', col, tier}   // 头盔：头顶 1~2px 覆盖 + 护耳
  body:  null | {kind, col, col2}          // 衣服：躯干主色替换 cloth/trim
  cloak: null | {col}                      // 披风：躯干后方一层，走路时末端摆动
  wep:   {kind:'sword'|'bow'|'staff'|'dagger'|'axe', col, glow}  // 武器外观 + 高品级发光
}
```
- 映射来源：已装备的 `equip` 槽位 → 物品 `iconSpec` / 品质 → 外观（品质 ≥6 加 `glow`）
- 未装备 → `null`，外观退化为当前职业配色（**零回归**）
- 头盔覆盖头发时需保留头发下缘 1px，避免"秃头"

## 4. 动画：帧数 + 伪骨骼关节

### 4.1 帧表（4 方向 × 8 帧）

| 帧 | 用途 |
|---|---|
| 0-3 | 走路（现有 4 帧） |
| 4-5 | 待机（呼吸起伏，2 帧，2Hz） |
| 6 | 攻击（挥砍/射击/施法，由 `atkT` 驱动） |
| 7 | 受击（后仰 2px + 闪白，0.2s） |

NPC：加 4 帧走路（现单帧）。怪物：2 帧 → 4 帧（浮动 + 挤压）。

### 4.2 伪骨骼（不引入真骨骼）

把 `drawChar` 内部拆成可独立变换的节点（仍用 `fillRect`，只是位置/旋转由参数算）：

```
root(躯干) ─ head(头, 可点头 ±3°)
          ├ armL(上臂/前臂一段, 摆臂 θ)
          ├ armR(持武器, 攻击时 θ 走关键帧)
          ├ legL / legR(交替, θ = sin(phase))
          └ weapon(跟随 armR 末端)
```
- 走路：`legL/R θ = ±sin(2π·animT·2)·18°`，`armL/R` 反相 12°，躯干 bob 1px
- 攻击（0.45s）：抬手 0~0.15（θ -60°）→ 挥出 0.15~0.30（θ +75°，武器拖一道弧光）→ 收 0.30~0.45
- 施法（0.6s）：armR 抬起 + 双手前推，头顶浮现元素色圆（复用现 fx `circle`）
- 受击（0.2s）：整体后仰 2px + 白色叠加

**不做真骨骼的理由**：16×24 像素角色，骨骼运行时（Spine/DragonBones）+ 骨骼数据 + 全部缓存键与立绘改造，代价高、收益低于上面这套程序化关节。真骨骼只在未来换美术风格（≥64×96 立绘）时才划算。

## 5. 风险与回退

| 风险 | 回退 |
|---|---|
| 泛光抬高移动端填充率 | 移动端默认关 + 设置开关 + `frameMs` 超预算自动降档（复用现有 `this.ss` 自适应思路） |
| `drawChar` 签名改动波及立绘/角色卡 | `gearLook` 默认 `null`；同步 `player()`/`portrait()`/`16_main.js:134` 与缓存键 `pl{clsKey}`（改为 `pl{clsKey}|{gearHash}`） |
| 图集改动牵动烘焙 | 图集只在区块烘焙路径内使用，运行时绘制路径不变；两者可并存，出问题可单关 |
