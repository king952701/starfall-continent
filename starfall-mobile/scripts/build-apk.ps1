# 星落大陆 · 一键打 APK（需要本机 JDK 17 + Android SDK）
param(
  [switch]$Release,
  [string]$Keystore = "",
  [string]$KeystorePass = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSCommandPath
Set-Location $root

Write-Host "== 1/4 安装 cordova ==" -ForegroundColor Cyan
if (-not (Test-Path "node_modules\cordova\bin\cordova")) { npm install --no-audit --no-fund }

Write-Host "== 2/4 同步网页版到 www/ ==" -ForegroundColor Cyan
node scripts/prepare.js

Write-Host "== 3/4 添加安卓平台 ==" -ForegroundColor Cyan
if (-not (Test-Path "platforms\android")) { npx cordova platform add android }

Write-Host "== 4/4 编译 APK ==" -ForegroundColor Cyan
if ($Release) {
  if ($Keystore) {
    $out = "Starfall-release.apk"
    npx cordova build android --release -- --keystore="$Keystore" --storePassword="$KeystorePass" --alias=starfall --password="$KeystorePass" --packageType=apk
  } else {
    npx cordova build android --release
    $out = "app-release-unsigned.apk"
  }
} else {
  npx cordova build android --debug
  $out = "app-debug.apk"
}

$src = Join-Path $root "platforms\android\app\build\outputs\apk\$(if($Release){'release'}else{'debug'})\$out"
$dstDir = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
if (Test-Path $src) {
  $dst = Join-Path $dstDir ("星落大陆-" + $(if($Release){'release'}else{'debug'}) + ".apk")
  Copy-Item $src $dst -Force
  Write-Host "`nAPK 已生成：$dst" -ForegroundColor Green
} else {
  Write-Host "`n未找到 $src ，请检查 JDK / Android SDK 是否安装完整" -ForegroundColor Yellow
}
