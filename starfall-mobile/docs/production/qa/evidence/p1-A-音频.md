# 批次 ① A 组（音效 0→1 + BGM）· 证据

日期：2026-10-09 · 结论：**ALL_OK（34/34）** · 方式：Node 无头用例（桩 DOM / Canvas / **AudioContext**）

## 用例输出（节选）

```
PASS 音色表齐备（25 个：战斗/采集/UI/环境）
PASS AudioContext 就绪
PASS 主总线挂了限幅器 DynamicsCompressor（防爆音）
PASS play() 正常派发（hit ×1）
PASS 同名节流生效（10 次连打 → 1 声）
PASS 精简密度：间隔翻倍（40 → 80ms）
PASS 密集密度：间隔缩小（40 → 24ms）
PASS 并发上限 12（20 个不同音效 → 只出 12 声）
PASS 主音量为 0 时不发声
PASS 八大区各有调式
PASS 区域 BPM 不同（平原 96 / 深渊 68）
PASS 夜间降速（96 → 76.8）
PASS 战斗提速（96 → 103.7）
PASS 音乐总线与四层建立（pad/bass/lead/drum）
PASS 鼓组随战斗强度淡入（探索 0 → BOSS 1）
PASS 排程一小节无异常
PASS 普攻 → 挥砍音 swing
PASS 命中 → hit / crit
PASS 击杀 → die
PASS 升级 → level（此前定义了却无人调用）
PASS 施法 → cast
PASS 开箱 → chest 调用点存在
PASS 传送 → portal 调用点存在
PASS 上下船 → board（2 处）
PASS 采集按材质分音（矿/木/草）
PASS 钓鱼 → fish
PASS 制作完成 → craft
PASS 闪电 → 雷声 thunder（此前只有视觉）
PASS 购买 → buy
PASS 出售 → sell
PASS 面板开合 → open / close
PASS 主循环同步区域：snow
PASS 回归：整帧 update + render 无异常
ALL_OK
```

## 说明

- 战斗挂钩用例是先全域粗扫找一块**非海域陆地**（出生点在 sea 区不刷怪）→ 刷出怪物 → 贴身普攻 / 击杀，断言 `Snd.stats` 计数。
- 采集 / 开箱 / 传送 / 上下船 / 雷声 / 交易 / 面板开合 属**源码级断言**（调用点确实存在于对应函数内），因为这些路径需要完整交互上下文；真机听感仍需确认。
- **NOT ASSESSED**：实际听感（音色是否好听、音量平衡、移动端 CPU 占用）—— 本机无音频播放能力，需真机试听后回填。
