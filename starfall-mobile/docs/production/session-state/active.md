# 当前进行中（断点续跑）

更新时间：2026-10-09

## 配置

- project: 星落大陆，engine=web，stage=polish
- rigor=standard，automation=autonomous
- 代码根：`starfall/src`（28 JS）；素材：`starfall/assets`；文档：本目录（`starfall-mobile/docs`，不进 APK）

## 进度

| 批次 | Story | 状态 |
|---|---|---|
| 文档 | project.yaml / gdd-index / art-bible / audio-design / ux-spec / balance / EPIC-01 | ✅ 完成 |
| 文档 | qa/evidence 规范 | ✅ 完成 |
| ① A 组 | A1 音效引擎（25 音色 + 节流 40ms + 并发 12 + 限幅器 + 密度设置） | ✅ |
| ① A 组 | A2/A3/A4 挂钩（战斗/采集/成长/UI/环境/交易） | ✅ 34/34 用例 |
| ① A 组 | A5 BGM 编曲（8 区调式 + 战斗强度 + 昼夜 + 家园） | ✅ |
| ② B 组 | B1 DPR | ⏳ 下一个 |
| ② B 组 | B1 DPR（折中 60% + 移动端/4K 封顶 + 设置 ×1/×1.5/×2） | ✅ |
| ② B 组 | B2 泛光 Bloom + 区域色调映射（三档 + 自动降级 + 移动端默认关） | ✅ |
| ② B 组 | B3 装备影响外观（helm/body/pants/cloak/wep+glow，未装备零回归） | ✅ |
| ② B 组 | B4 8 帧 + 伪骨骼（atkT/hitT 状态机、攻击挥砍旋转、受击闪白、怪物 4 帧） | ✅ 24/24 |
| ② B 组 | B5 贴图图集 / 预缩放 / LRU | ⬜ |
| ③ C 组 | C1 投射物 / C2 粒子+顿帧 | ✅ 22/22 |
| ③ C 组 | C3 天赋树状连线图（缩放/平移/触摸） | ✅ 15/15 |
| ④ D 组 | D1 大地图真实地形采样 + D2 迷雾（方案 A，RLE 后 1KB） | ✅ 18/18 |
| ④ D 组 | D3 POI 多样化 / NPC 走路帧 | ⏳ 下一个 |
| ③ C+D | C1 投射物 / C2 粒子顿帧 / C3 天赋树图 / D1 大地图 / D3 POI+NPC / D4 balance | ⬜ |
| ③ | D2 迷雾 | 🚫 BLOCKED（存档 schema，等选 A/B/C） |

## 关键事实（下次直接复用，别再查）

- 音频：`31_settings.js:10-82` `Snd`（AudioContext + master/sfx/music/amb），`tone()`/`play()` 仅 5 音色、16 处调用；`33_ambience.js` 三层环境音；BGM 是两枚失谐正弦 drone（`updateMusic()` `:40-59`）
- 渲染：`15_game.js:39-46` 画布尺寸（无 DPR）；`render()` `:1072-1131` 分层；`drawAtmosphere()` `:1200-1260`；无 `ctx.filter`
- 角色：`Sprites.drawChar` `08_sprites.js:424-473`（16×24，4方向×4帧），`player()` `:474-490`，缓存键 `pl{clsKey}`
- 技能特效：`15_game.js:1401-1419` 仅 circle/cone/beam；`Combat.cast` `11_combat.js:199-223`（即时结算，挂机依赖）
- 天赋 UI：`14_ui.js:1141-1181`；数据 `player.talents={id:lv}`（不改）
- 大地图：`14_ui.js:1221-1265` 画 8 个矩形块
- 出包：GitHub API 提交（用户已授权一次）→ Actions → artifact `starfall-apk`；下载 302 后须去掉 Authorization 头否则 403

## 停点记录

- D2 迷雾：需要存档新增字段 → 等用户选方案（首次实施到 D 组时提出）
