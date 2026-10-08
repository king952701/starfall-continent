/* ============================================================
 * mobile-boot.js —— 仅在 APK 内生效（cordova.js 存在时）
 * 1) 触摸 cues / 双击缩放禁用
 * 2) Android 返回键：先关最上层面板 → 没有面板再双击退出
 * 3) 隐藏状态栏之外的系统 UI（沉浸式）+ 防止休眠
 * ==========================================================*/
(function () {
  'use strict';
  var backTapped = 0;

  function boot() {
    try {
      if (window.AndroidFullScreen && AndroidFullScreen.immersiveMode) AndroidFullScreen.immersiveMode();
    } catch (e) { }
    try { if (window.plugins && plugins.insomnia) plugins.insomnia.keepAwake(); } catch (e) { }

    // 禁用双击缩放 / 长按菜单带来的抖动
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

    // 返回键
    document.addEventListener('backbutton', function (e) {
      e.preventDefault();
      var closed = false;
      try { if (typeof UI !== 'undefined' && UI.isAnyPanelOpen) closed = UI.isAnyPanelOpen(); } catch (err) { }
      if (typeof UI !== 'undefined' && UI.panels) {
        var openCount = Object.keys(UI.panels).filter(function (k) {
          var el = UI.panels[k] && UI.panels[k].el;
          return el && el.style.display !== 'none';
        });
        if (openCount.length) { closed = false; UI.closeAll(); return; }
      }
      if (!closed) {
        if (!backTapped || Date.now() - backTapped > 1600) {
          backTapped = Date.now();
          if (typeof UI !== 'undefined' && UI.toast) UI.toast('再按一次退出', '#ffdf94');
        } else {
          try { navigator.app.exitApp(); } catch (err) { }
        }
      }
    }, false);

    // 音量键没事干时也不应触发浏览器行为
    document.addEventListener('volumeupbutton', function (e) { e.preventDefault(); });
    document.addEventListener('volumedownbutton', function (e) { e.preventDefault(); });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 500);
  else document.addEventListener('deviceready', boot, false);
})();
