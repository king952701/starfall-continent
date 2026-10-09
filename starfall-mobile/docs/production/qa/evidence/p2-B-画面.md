# 批次 ② B 组（DPR / 泛光 / 装备外观 / 加帧伪骨骼）· 证据

日期：2026-10-09 · 结论：**ALL_OK（24/24）** · 方式：Node 无头用例（桩 DOM / Canvas / AudioContext）

## 用例输出（节选）

```
PASS 高画质 + dpr2：画布按折中倍率放大 1280×720 → 2048×1152
PASS 低画质不吃 dpr（优先帧率）：768px
PASS DPR 上限 =1 时等于 CSS 尺寸：1280px
PASS 4K 档受总像素封顶：2560×1440
PASS 泛光关闭 → 0
PASS 手动开 + 高画质 → 0.6
PASS 手动开 + 中画质 → 0.35
PASS 低画质强制关
PASS 自动档：移动端关（帧率优先）
PASS 自动档：桌面开
PASS applyPostFx 执行无异常
PASS 全部关闭时强度为 0
PASS 帧耗时持续超预算 → 自动关闭后处理
PASS 玩家精灵 4 方向 × 8 帧（走路4 / 待机2 / 攻击1 / 受击1）
PASS 未装备时外观映射为空（退回职业配色，零回归）
PASS 未装备沿用原缓存键 pl{cls}
PASS 装备变化 → 外观指纹变化
PASS 已装备槽位映射到外观
PASS 带装备生成独立精灵（缓存键含外观指纹）
PASS 卸下后回到无装备外观
PASS 普攻 → atkT 置位（攻击帧）
PASS atkT 随时间递减（0.5s 后归零）
PASS hitT 随时间递减（受击帧 0.2s）
PASS 怪物精灵 2 帧 → 4 帧浮动
PASS 回归：整帧 update + render 无异常
ALL_OK
```

## 说明

- **像素风未被破坏**：`imageSmoothingEnabled=false` 与 CSS `image-rendering:pixelated` 保持不变，泛光只在放大回屏幕那一步临时开平滑（save/restore 内）。
- **零回归设计**：`drawChar` 的 `gear` 为可选参数、`player(clsKey)` 不传 gear 时缓存键仍是 `pl{cls}`，未装备 = 旧外观。
- **NOT ASSESSED**：实际观感（泛光是否过曝、装备配色搭不搭、攻击挥砍角度好不好看）—— 本机无浏览器截图，需真机/浏览器确认后回填。
