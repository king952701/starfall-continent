/* ============================================================
 * 41_input_isolation.js —— 交互隔离层（禁用一切浏览器默认交互）
 *
 * 目标：游戏区域内不出现浏览器右键菜单、鼠标手势、文本选中、
 * 图片/链接拖拽、中键自动滚动、双击选中、键盘滚动页面、移动端
 * 触摸滚动与双指缩放；页面无滚动条；所有拦截集中在此文件管理，
 * 只作用于游戏页面本身，不污染外部网页行为。
 *
 * 设计：
 *  · 所有监听器统一登记到 Interlock.handlers，可用 destroy() 一次性解绑
 *  · 输入框 / 文本域 / 下拉框 / 可编辑区域 一律放行（聊天与面板还要用）
 *  · 每处 preventDefault 均有中文注释说明拦截目的
 * ==========================================================*/
'use strict';

const Interlock = {
  on: false,
  handlers: [],              // 集中管理：{ t: 监听目标, type: 事件名, fn: 回调, opt: 选项 }
  rightDown: false,          // 右键是否处于按下拖动中
  lastRightTs: 0,            // 最近一次右键按下的时间戳（用于手势扩展判定）
  tipShown: false,           // 提示是否已在本次会话弹过
  KEY: 'sf.gesture.warn',    // 手势扩展嫌疑标记（跨会话）
  lastTapTs: 0,              // 上次轻触时间戳（双击放大判定）
  lastTapX: 0, lastTapY: 0,  // 上次轻触坐标

  /* 游戏容器：本游戏为整页全屏，容器即 body（画布 / HUD / 面板都在其内） */
  container() { return document.body || document.documentElement; },

  /* 输入类元素放行：聊天框 / 昵称输入 / 数量输入仍要能打字与选中 */
  isEditable(t) {
    if (!t || !t.tagName) return false;
    const tag = t.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (t.isContentEditable) return true;
    return false;
  },

  /* 统一登记：便于 destroy() 全量解绑，也便于自查“拦截了哪些事件” */
  bind(t, type, fn, opt) {
    if (!t || !t.addEventListener) return;
    t.addEventListener(type, fn, opt || false);
    this.handlers.push({ t: t, type: type, fn: fn, opt: opt || false });
  },

  init() {
    if (this.on) return true;
    const box = this.container();
    if (!box) return false;
    const doc = document, win = window;

    /* 1) 禁止浏览器右键菜单：地图 / 道具 / UI 任意位置右键都不弹系统菜单 */
    this.bind(doc, 'contextmenu', e => { e.preventDefault(); }, false);

    /* 2) 鼠标按下：
     *    · 右键（button===2）：立即 preventDefault，阻止鼠标手势扩展截获拖动起点，
     *      右键拖动全程交由游戏自己处理（地图 / 视角）
     *    · 中键（button===1）：preventDefault，禁用 Windows 中键自动滚动 */
    this.bind(doc, 'mousedown', e => {
      if (e.button === 2) {
        e.preventDefault();
        this.rightDown = true;
        this.lastRightTs = Date.now();
      } else if (e.button === 1) {
        e.preventDefault();
      }
    }, false);

    /* 3) 右键拖动过程中持续接管 mousemove：
     *    preventDefault 阻止浏览器画出手势轨迹 / 触发默认拖放 */
    this.bind(doc, 'mousemove', e => {
      if (this.rightDown) e.preventDefault();
    }, false);

    /* 4) 右键抬起：结束拖动状态（手势扩展若在浏览器层抢走事件，这里收不到 → 触发提示） */
    const up = e => { if (e.button === 2) this.rightDown = false; };
    this.bind(doc, 'mouseup', up, false);
    this.bind(win, 'mouseup', up, false);

    /* 5) 禁止文本选中：双击 / 拖选都不选中游戏文字（输入框内放行） */
    this.bind(doc, 'selectstart', e => {
      if (this.isEditable(e.target)) return;
      e.preventDefault();
    }, false);

    /* 6) 禁止双击选中文本或元素 */
    this.bind(doc, 'dblclick', e => {
      if (this.isEditable(e.target)) return;
      e.preventDefault();
      const sel = win.getSelection && win.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    }, false);

    /* 7) 禁止图片 / 链接 / 画布被拖拽（避免误触发系统拖放与“在新标签打开”） */
    this.bind(doc, 'dragstart', e => { e.preventDefault(); }, false);
    this.bind(doc, 'dragover', e => { e.preventDefault(); }, false);
    this.bind(doc, 'drop', e => { e.preventDefault(); }, false);
    /* 中键 auxclick：禁止中键在新标签页打开链接 */
    this.bind(doc, 'auxclick', e => { if (e.button === 1) e.preventDefault(); }, false);

    /* 8) 禁止键盘滚动页面：方向键 / 空格 / PageUp / PageDown / Home / End
     *    （输入框与下拉框放行；空格同时是游戏翻滚键，preventDefault 只挡页面滚动） */
    const BLOCK = { ' ': 1, 'Spacebar': 1, 'ArrowUp': 1, 'ArrowDown': 1, 'ArrowLeft': 1, 'ArrowRight': 1, 'PageUp': 1, 'PageDown': 1, 'Home': 1, 'End': 1 };
    this.bind(doc, 'keydown', e => {
      const t = e.target;
      if (this.isEditable(t)) return;
      if (t && t.tagName && t.tagName.toUpperCase() === 'BUTTON') return;   // 保留按钮的空格/回车激活
      if (BLOCK[e.key]) e.preventDefault();
    }, false);

    /* 9) 触摸端隔离【必做】：阻止移动端触摸滚动、下拉刷新、双指缩放页面、双击放大、
     *    长按放大镜 / 系统菜单、Safari 私有手势、双指滑动返回。
     *    说明：preventDefault 只拦「浏览器默认行为」，同一个事件上的游戏回调照常执行，
     *    因此摇杆 / 按住攻击 / 游戏自己的双指缩放视野都不受影响。 */
    const SCROLL_OK = '.pbody,#chatMsgs,#log,#mMenuList';                 // 允许上下滚动的白名单
    const TAP_OK = '.btn,.cell,button,.pclose,.ctab,.mBtnI,.mbtn,.mMenuBtn'; // 允许连点的交互元素
    const hit = (el, sel) => !!(el && el.closest && el.closest(sel));

    /* 9.1 双指（及以上）落下 → 拦截浏览器双指缩放页面 / 双指滑动返回 */
    this.bind(doc, 'touchstart', e => {
      if (e.touches && e.touches.length > 1) {                 // 多指 = 浏览器手势，一律拦掉
        if (e.cancelable) e.preventDefault();
        return;
      }
      /* 9.2 双击：300ms 内同一位置二次轻触 → 阻止 iOS / Android 双击放大页面
       *     （按钮 / 格子等交互元素放行，不挡玩家自己的连点） */
      const t = e.touches && e.touches[0];
      if (!t) return;
      const now = Date.now();
      if (now - this.lastTapTs < 300
        && Math.abs(t.clientX - this.lastTapX) < 30
        && Math.abs(t.clientY - this.lastTapY) < 30
        && !hit(e.target, TAP_OK)) {
        if (e.cancelable) e.preventDefault();
        this.lastTapTs = 0;                                     // 连点不再连锁判定
        return;
      }
      this.lastTapTs = now; this.lastTapX = t.clientX; this.lastTapY = t.clientY;
    }, { passive: false });

    /* 9.3 Safari 私有手势（prevail 双指缩放 / 旋转整个页面） */
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(tp =>
      this.bind(doc, tp, e => { if (e.cancelable) e.preventDefault(); }, false));

    /* 9.4 iOS 长按放大镜 / Force Touch 预览（touchforcechange 会触发 3D Touch 菜单） */
    this.bind(doc, 'touchforcechange', e => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    /* 9.5 触摸移动：非白名单区域一律 preventDefault → 禁掉页面滚动与下拉刷新 */
    this.bind(doc, 'touchmove', e => {
      if (this.isEditable(e.target)) return;                   // 输入框内放行（选词 / 光标）
      if (hit(e.target, SCROLL_OK)) return;                    // 面板内容 / 聊天记录 / 日志仍可上下滚
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    /* 10) 鼠标手势扩展兜底提示：
     *     · 右键拖动中途窗口失焦 / 页面隐藏 → 大概率被扩展截获
     *     · 右键拖动后 3 秒内页面被卸载（后退 / 关闭 / 刷新）→ 记标记，下次进游戏提示一次 */
    this.bind(win, 'blur', () => { if (this.rightDown) this.gestureSuspect('窗口在右键拖动中失焦'); }, false);
    this.bind(doc, 'visibilitychange', () => {
      if (doc.hidden && this.rightDown) this.gestureSuspect('右键拖动中页面被隐藏');
    }, false);
    this.bind(win, 'pagehide', () => {
      if (Date.now() - this.lastRightTs < 3000) {
        try { localStorage.setItem(this.KEY, '1'); } catch (e) { /* 隐私模式忽略 */ }
      }
    }, false);

    /* 11) 新插入的图片 / 链接 / 画布自动禁止拖拽（面板与图标都是运行时创建） */
    this.watchDraggable();
    this.markDraggable(document);

    /* 12) 上次会话留下手势嫌疑标记 → 进入游戏时提示一次 */
    try {
      if (localStorage.getItem(this.KEY) === '1') {
        localStorage.removeItem(this.KEY);
        setTimeout(() => this.showGestureTip(), 1200);
      }
    } catch (e) { /* 忽略 */ }

    this.on = true;
    return true;
  },

  /** 运行时新增的 img / a / canvas 一并标记为不可拖拽 */
  watchDraggable() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    if (this._mo) return;
    this._mo = new MutationObserver(list => {
      for (const m of list) {
        for (const n of (m.addedNodes || [])) {
          if (n && n.nodeType === 1) this.markNode(n);
        }
      }
    });
    this._mo.observe(document.body, { childList: true, subtree: true });
  },
  markDraggable(root) {
    if (!root || !root.querySelectorAll) return;
    try { root.querySelectorAll('img,a,canvas').forEach(n => this.markNode(n)); } catch (e) { /* 忽略 */ }
  },
  markNode(n) {
    if (!n || !n.tagName) return;
    const tag = n.tagName.toUpperCase();
    if (tag === 'IMG' || tag === 'A' || tag === 'CANVAS') {
      try { n.draggable = false; n.setAttribute && n.setAttribute('draggable', 'false'); } catch (e) { /* 忽略 */ }
    }
    if (n.querySelectorAll) {
      try { n.querySelectorAll && n.querySelectorAll('img,a,canvas').forEach(x => this.markNode(x)); } catch (e) { /* 忽略 */ }
    }
  },

  /** 检测到疑似鼠标手势扩展干扰：弹一次友好提示 */
  gestureSuspect(reason) {
    this.rightDown = false;
    this.showGestureTip(reason);
  },
  showGestureTip(reason) {
    if (this.tipShown) return;
    this.tipShown = true;
    const txt = '检测到鼠标手势扩展可能影响游戏操作，建议在浏览器设置中为本页面关闭鼠标手势功能';
    if (typeof UI !== 'undefined' && UI.toast) { UI.toast(txt, '#ffd76a'); if (!reason) return; }
    let tip = (document.getElementById && document.getElementById('ilTip')) || null;
    const box = document.body || document.documentElement;
    if (!tip && box && box.appendChild && document.createElement) {
      try {
        tip = document.createElement('div');
        tip.id = 'ilTip';
        tip.className = 'ilTip';
        box.appendChild(tip);
      } catch (e) { tip = null; }
    }
    if (!tip) return;                       // 极端环境下拿不到容器：静默跳过，不影响游戏
    tip.textContent = txt;
    tip.classList.remove('hide');
    clearTimeout(this._tipT);
    this._tipT = setTimeout(() => { tip.classList.add('hide'); }, 9000);
  },

  /** 全量解绑（调试 / 复用页面时需要） */
  destroy() {
    for (const h of this.handlers) { try { h.t.removeEventListener(h.type, h.fn, h.opt); } catch (e) { /* 忽略 */ } }
    this.handlers = [];
    if (this._mo) { try { this._mo.disconnect(); } catch (e) { /* 忽略 */ } this._mo = null; }
    this.on = false;
  }
};

/* 脚本位于 </body> 前，body 已存在 → 立即生效 */
try { Interlock.init(); } catch (e) { /* 隔离层失败不影响游戏本身 */ }
