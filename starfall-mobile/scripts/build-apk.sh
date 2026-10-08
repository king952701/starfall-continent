#!/usr/bin/env bash
# 星落大陆 · 一键打 APK（Linux / macOS / Git Bash）
# 用法： bash scripts/build-apk.sh [debug|release]
set -e
cd "$(dirname "$0")/.."

MODE=${1:-debug}

echo "== 1/4 安装 cordova =="
[ -d node_modules/cordova ] || npm install --no-audit --no-fund

echo "== 2/4 同步网页版到 www/ =="
node scripts/prepare.js

echo "== 3/4 添加安卓平台 =="
[ -d platforms/android ] || npx cordova platform add android

echo "== 4/4 编译 APK =="
if [ "$MODE" = "release" ]; then
  npx cordova build android --release
  APK="platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk"
  DST="dist/星落大陆-release.apk"
else
  npx cordova build android --debug
  APK="platforms/android/app/build/outputs/apk/debug/app-debug.apk"
  DST="dist/星落大陆-debug.apk"
fi

mkdir -p dist
cp -f "$APK" "$DST"
echo ""
echo "APK 已生成：$PWD/$DST"
