# 音频设计 · 音效从 0→1 + 程序化 BGM

## 0. 现状（实测）

| 项 | 现状 |
|---|---|
| 音频文件 | **0 个**（仓库无任何 .ogg/.mp3/.wav） |
| 引擎 | 有：`31_settings.js:10-82` `Snd`，`AudioContext` + master / sfx / music / amb 四总线 |
| 合成器 | `tone()`（Oscillator + Gain 包络）`play(name)`，仅 5 种：`click / ok / err / level / default` |
| 调用点 | **全库仅 16 处**，且 15 处在设置面板；战斗 / 采集 / 掉落 / 升级 **0 处**；`'level'` 已定义但无调用 |
| 环境音 | `33_ambience.js` 三层（water / bird / farm），质量已不错，属音效层不是音乐 |
| BGM | `updateMusic()`：两枚失谐正弦（110 + 164.8Hz）过低通 + LFO，**常驻无旋律、不随区域/战斗/昼夜变** |

结论：**总线与解锁机制现成，缺的是音色库、挂钩点、编曲**。全部用 WebAudio 合成，零外部文件、零版权风险（符合"素材必须先确认授权"的规矩）。

## 1. 音色库（全部合成，参数可调）

### 1.1 战斗

| 事件 | 音色 | 合成 | 时长 |
|---|---|---|---|
| `swing` 挥砍 | 噪声扫频 | white noise → bandpass 800→2500Hz 扫，gain 0.00→0.35→0 | 90ms |
| `hit` 命中 | 方波 + 噪声爆 | square 180Hz（60ms）+ noise burst 高通 2kHz | 70ms |
| `crit` 暴击 | 上滑三角 + FM 金属感 | triangle 330→880Hz，叠 1.5kHz 调制 | 140ms |
| `cast` 施法 | 正弦上滑 + 尾音 | sine 220→660Hz，release 180ms，加元素色偏移（火 +20%、冰 -15% 音高） | 260ms |
| `die` 死亡 | 下滑锯齿 | saw 300→80Hz，lowpass 1.2kHz | 320ms |
| `level` 升级 | 三音琶音 | 523→659→784Hz（**已有音色，需接上调用点**） | 480ms |

### 1.2 采集与生活

| 事件 | 音色 | 合成 |
|---|---|---|
| `mine` 挖矿 | 金属叮 | triangle 1200Hz ±5% 随机音高，衰减 120ms + 噪声 click |
| `chop` 伐木 | 木头闷响 | noise(lowpass 400Hz) + sine 200Hz，衰减 90ms |
| `herb` 采草 | 沙沙 | noise(highpass 3kHz) 40ms，包络快起快落 |
| `fish` 钓鱼 | 水花 | noise 下扫 4k→600Hz + 低频 thud 90Hz |
| `craft` 制作完成 | 两音上行 | 440→660 triangle |
| `pickup` 拾取 | 短促上行 | sine 700→1000Hz，60ms |

### 1.3 UI 与交互

`open` 面板开、`close` 面板关、`tab` 切页、`buy`/`sell` 交易、`equip` 装备、`error` 不足（沿用 `err`）、`portal` 传送（上滑 + 颤音）、`board`/`disembark` 上下船（水花，复用 `fish` 变体）、`thunder` 雷声（低频噪声 + 长尾 1.2s，接 `32_weather.js` 闪电，现在只有视觉没声音）、`chest` 开箱、`quest` 完成。

### 1.4 节流与并发（必须）

- 同名音效最小间隔 **40ms**（挂机 / 群战时不糊成一团）
- 全局并发上限 **12** 个音源，超出丢弃最旧的
- master 总线加 `DynamicsCompressor`（threshold -12dB, ratio 4）防爆音
- 挂机结算（20_idle）走"批量完成"单音，不逐次播

## 2. BGM：程序化编曲

不用任何音频文件，运行时合成。挂现有 `music` 总线与音量滑块。

### 2.1 结构

```
[鼓组层] kick（sine 60Hz 快衰）+ hihat（noise highpass 8k）—— 战斗 intensity≥1 才加
[低音层] root 音，每小节 1 个，triangle
[和弦层] 三音 pad（sine+triangle 混合，慢起慢落），每 2 拍换和弦
[旋律层] 8 小节 motif，五声音阶随机变奏（种子来自区域，同一区域每次进一致）
```

### 2.2 区域调式（8 区映射）

| 区域 | 调式 / 情绪 | BPM |
|---|---|---|
| plain 平原 | 伊奥尼亚（大调），明亮 | 96 |
| forest 森林 | 利底亚，木管感（triangle 为主） | 88 |
| desert 沙漠 | 弗里几亚暗示，加打击层 | 104 |
| snow 雪原 | 爱奥利（小调），稀疏、长混响 | 72 |
| abyss 深渊 | 洛克里亚 / 半音，低频 drone | 68 |
| ruin 遗迹 | 多利亚，空灵 | 80 |
| waste 荒原 | 小调 + 失真感（saw 少量） | 92 |
| sea 海域 | 大调 + 涌动 LFO | 84 |

### 2.3 状态变奏（交叉淡入 2s）

| 状态 | 变化 |
|---|---|
| 探索 | 和弦 + 旋律（无鼓） |
| 战斗（intensity 1） | 加鼓组，BPM +8，旋律层减半 |
| 精英/BOSS（intensity 2） | 再加低音八度 + 更密集 hihat |
| 夜间 | BPM ×0.8，去掉一层，旋律降八度 |
| 家园 | 固定温暖小调短循环 |

### 2.4 调度

- 输入：`区域 key`、`inCombat`（近 3s 有敌对目标）、`昼夜相位`、`weather`
- 输出：每小节（按 BPM 算）调度下一批音符；状态变化走 2s 交叉淡入，不硬切
- 自动播放解锁沿用现有 `pointerdown` 解锁（`31_settings.js`）
- 音量默认：music 沿用现有默认值（不动），首次进入不自动播放（等交互）

## 3. 验收清单

| # | 项 | 判定 |
|---|---|---|
| A-1 | 战斗五音（swing/hit/crit/cast/die）能听到且不同 | 无头用例断言 `Snd.play` 被调用 + 音色表存在 |
| A-2 | 采集四音（mine/chop/herb/fish）绑定材质 | 同上 |
| A-3 | 升级音接上（现在定义了没用） | 断言升级路径有调用 |
| A-4 | 节流生效：100ms 内 10 次 `hit` 只出 ≤3 声 | 用例断言计数 |
| A-5 | 并发 ≤12、有 compressor | 代码审查 + 用例 |
| A-6 | BGM 随区域切换调式、战斗加层、夜间减速 | 逻辑用例断言参数变化 |
| A-7 | 移动端 CPU 不明显上升 | 真机（NOT ASSESSED 时如实标注） |

## 4. 风险

- 浏览器/WebView 自动播放策略：已有解锁机制，复用即可
- 高频事件音源爆炸：靠节流 + 并发上限（本节 1.4）
- 挂机批量结算：单音汇总，不逐条播
