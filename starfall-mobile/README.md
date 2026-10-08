# 《星落大陆》安卓版 —— 打包工程

把网页版（同级目录 `../starfall`）同步到 Cordova WebView 里编译成 APK。游戏全部素材/逻辑均为本地文件，**不联网即可运行**。

## 一、目录结构

```
starfall-mobile/
├─ config.xml                  Cordova 配置：包名 com.starfall.continent / 全屏 / 强制横屏
├─ package.json                cordova 12 + cordova-android 13
├─ scripts/
│   ├─ prepare.js              把 ../starfall 复制到 www/ 并注入 cordova.js / mobile-boot.js
│   ├─ mobile-boot.js          APK 内生效：返回键先关面板、再双击退出、防休眠
│   ├─ build-apk.ps1           Windows 一键打 APK
│   └─ build-apk.sh            Linux / macOS / Git Bash 一键打 APK
├─ .github/workflows/build-apk.yml   云端构建（推荐，无需本地 SDK）
└─ dist/                       构建产物 APK
```

## 二、两种出包方式

### 方式 A（推荐）：GitHub Actions 云端构建 —— 不需要本机装任何 SDK

把 `starfall-mobile` 推到 GitHub 仓库根目录后：

- `GitHub → Actions → Build Android APK → Run workflow`，跑完在 Artifact 里下载 `starfall-debug-xxxx.apk`；
- 或者 `git tag v1.0.0 && git push --tags`，会自动构建并把 APK 挂到 Release。

> 仓库里**不要**提交 `www/`、`platforms/`、`plugins/`（已写进 `.gitignore`），CI 会自动同步。

### 方式 B：本机一键构建（需 JDK 17 + Android SDK）

前置条件：

1. 安装 **JDK 17**（`java -version` 有输出即可）
2. 安装 **Android Studio** 或 **Command line tools**，并勾选：Android SDK Platform 34、Android SDK Build-Tools 34.x、Platform-Tools
3. 设置环境变量：`ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`（macOS/Linux：`$HOME/Android/Sdk`）

PowerShell（Windows）：

```powershell
cd starfall-mobile
.\scripts\build-apk.ps1                 # 调试版 → dist\星落大陆-debug.apk
.\scripts\build-apk.ps1 -Release        # 未签名发布版
.\scripts\build-apk.ps1 -Release -Keystore "D:\key\starfall.jks" -KeystorePass "******"   # 签名发布版
```

Linux / macOS / Git Bash：

```bash
cd starfall-mobile
bash scripts/build-apk.sh debug
bash scripts/build-apk.sh release
```

生成签名密钥（首次发布需要）：

```bash
keytool -genkeypair -v -keystore starfall.jks -keyalg RSA -keysize 2048 -validity 10000 -alias starfall
```

## 三、移动端已做的适配

游戏本体通过 `src/30_mobile.js` + `css/style.css` 里的 `.mobile` 样式自动适配，**桌面端完全不变**：

| 适配点 | 实现 |
| --- | --- |
| 虚拟摇杆 | 左下 `104px` 摇杆，方向直接写进 `Game.keys`，与键盘 WASD 同一套输入逻辑 |
| 触屏攻击 / 采集 | 点画布 = 普攻并锁定最近的怪；点到资源点 = 打开采集面板；长按 0.4s = 手动锁定怪物（等价右键）；按住拖动 = 持续攻击 |
| 动作按钮 | 右下圆形按钮：攻击 / 采集 / 交互 / 翻滚 / 药水 |
| 菜单按钮 | 右下「菜单」展开 14 个入口：背包、角色、制作、天赋、技能、地图、成就、图鉴、排行、挂机、拍卖、导航、频道、存档 |
| 面板自适应 | `UI.panel()` 按屏幕宽高自动缩放并限制在可视区内；小屏字号缩小，背包格子统一 40px 触摸目标；横竖屏切换实时重排 |
| HUD 缩放 | 头像条、小地图、技能栏、日志、聊天窗在移动端自动缩小重排；隐藏桌面快捷键提示 |
| 竖屏提示 | 竖屏时提示「建议横屏游玩」（APK 已配置 `Orientation=landscape` 强制横屏） |
| 返回键 | `mobile-boot.js`：有面板时先关面板，无面板时双击退出 |
| 其它 | `touch-action:none` 禁用双击缩放；禁用长按菜单；禁止休眠；Canvas 分辨率跟随屏幕密度自动设置 |

## 四、常见问题

- **构建时报找不到 `ANDROID_HOME`**：装好 SDK 后重开终端；Windows 默认路径 `%LOCALAPPDATA%\Android\Sdk`。
- **Gradle 下载失败**：首次构建需要联网拉 Gradle 与依赖；可用 `GRADLE_OPTS="-Dhttps.proxyHost=... "` 走代理，或用方式 A 云端构建。
- **改了游戏代码要重新出包**：重新跑 `.\scripts\build-apk.ps1`（脚本会自动执行一次同步）。
- **包名/应用名改哪里**：`config.xml` 的 `widget id` 与 `<name>`。
