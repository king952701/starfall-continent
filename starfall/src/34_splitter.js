/* =========================================================================
 * 34_splitter.js —— 统一可拖拽分隔条（Splitter）
 * 目标：PC / iOS / Android / 平板 四端一套代码，所有面板的左右、上下分区
 *      都能拖分隔条调整大小，尺寸本地保存并可通过账号体系四端同步。
 *
 * 设计要点
 *   1. 统一 Pointer Events：鼠标 / 手指 / 手写笔走同一条代码路径（不各端各写）
 *   2. 只写 CSS 变量 --sp-a（rAF 合批），不触发 canvas 重绘，不阻塞主逻辑
 *   3. 存「比例」不存像素 —— 四端分辨率不同（PC 1920 / 手机 19.5:9 / 平板 4:3）
 *      仍能得到一致的视觉分栏；像素级 min/max 在每次布局时现算
 *   4. ResizeObserver 兜底：横竖屏切换、iPad 分屏/台前调度、Android 多窗口
 *      导致容器变窄时自动重新 clamp，保证不溢出、不遮挡
 *   5. 递归：容器里再放 data-sp 就是嵌套分栏，共走同一套逻辑
 *   6. 键盘（方向键 / Shift 加速 / Home 复位）+ ARIA + 手柄轮询接口
 * =======================================================================*/
(function (global) {
  'use strict';

  var INST = {};                 // key -> 实例（同一 key 多端只存一份状态）
  var SEQ = 0;

  /** 状态仓库：优先复用 Settings（localStorage: sf_settings_v1），没有就自建 */
  function store() {
    if (global.Settings && global.Settings.data) {
      return global.Settings.data.split || (global.Settings.data.split = {});
    }
    return (Splitter._fallback || (Splitter._fallback = {}));
  }
  function save() {
    if (global.Settings && typeof global.Settings.save === 'function') global.Settings.save();
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }

  /* ------------------------------------------------------------------ 实例 */
  function Inst(box, opt) {
    this.box = box; this.opt = opt || {};
    this.dir = (opt.dir === 'y' || opt.dir === 'vertical') ? 'y' : 'x';
    this.key = opt.key || ('sp' + (++SEQ));
    /* min/max：像素优先，缺省用容器比例；四端不同分辨率下按比例兜底 */
    this.min1 = num(opt.min1, opt.min !== undefined ? opt.min : 120);
    this.max1 = num(opt.max1, opt.max !== undefined ? opt.max : Infinity);
    this.min2 = num(opt.min2, 80);
    this.minPct1 = num(opt.minPct, 0.15);      // 容器过小（手机竖屏）时的下限比例
    this.def = num(opt.def, 0.42);             // 默认 / 复位比例
    this.persist = opt.persist !== false;
    this.onEnd = opt.onEnd || null;
    this._raf = 0; this._px = 0; this._drag = false;

    this.build();
    if (!this.bar) return;               // 容器没有可分区的子节点：放弃挂载
    this.apply(num(store()[this.key], this.def), false);
    this.observe();
    INST[this.key] = this;
  }

  /** 把容器改造成 grid 三栏/三行：[A] [分隔条] [B] */
  Inst.prototype.build = function () {
    var box = this.box, kids = [];
    /* 指定 a / b 两个元素时：自动套一层 wrapper（如聊天窗：消息区 / 输入区，
     * 但头部 #chatHead 不参与分栏），避免把无关兄弟节点算进分区 */
    if (this.opt.a && this.opt.b && this.opt.a.parentNode === box && this.opt.b.parentNode === box) {
      var wrap = document.createElement('div');
      box.insertBefore(wrap, this.opt.a);
      wrap.appendChild(this.opt.a); wrap.appendChild(this.opt.b);
      wrap.style.flex = '1 1 auto'; wrap.style.minWidth = '0'; wrap.style.minHeight = '0';
      box = this.box = this.wrap = wrap;
    }
    for (var i = 0; i < box.children.length; i++) kids.push(box.children[i]);
    var a = kids[0];
    var b = kids[1];
    if (!a) return;
    if (!b || kids.length > 2) {                       // 多于 2 个子节点 → 其余归入 B
      b = document.createElement('div');
      for (var j = 1; j < kids.length; j++) b.appendChild(kids[j]);
      box.appendChild(b);
    }
    this.a = a; this.b = b;
    box.classList.add('sp', this.dir === 'x' ? 'sp-x' : 'sp-y');

    var bar = document.createElement('i');
    bar.className = 'sp-bar';
    bar.tabIndex = 0;
    bar.setAttribute('role', 'separator');
    bar.setAttribute('aria-orientation', this.dir === 'x' ? 'vertical' : 'horizontal');
    bar.setAttribute('aria-label', this.box.getAttribute('data-sp-label') || '调整分区大小');
    box.insertBefore(bar, b);
    this.bar = bar;

    var self = this;
    /* --- 指针：鼠标 / 触摸 / 手写笔统一路径 --- */
    bar.addEventListener('pointerdown', function (e) { self.down(e); });
    bar.addEventListener('dblclick', function () { self.reset(); });
    bar.addEventListener('keydown', function (e) { self.onKey(e); });
  };

  /** 容器尺寸变化时重新 clamp（横竖屏 / 分屏 / 多窗口 / 面板缩放） */
  Inst.prototype.observe = function () {
    var self = this;
    if (global.ResizeObserver) {
      this._ro = new global.ResizeObserver(function () { self.relayout(); });
      this._ro.observe(this.box);
    } else {
      this._onResize = function () { self.relayout(); };
      global.addEventListener('resize', this._onResize);
    }
  };

  Inst.prototype.total = function () {
    var r = this.box.getBoundingClientRect();
    return this.dir === 'x' ? r.width : r.height;
  };

  /** 给定比例 → 像素（含 min/max、安全区、容器上限） */
  Inst.prototype.toPx = function (ratio) {
    var total = this.total();
    if (!total) return 0;
    var barW = 2, avail = Math.max(0, total - barW - this.min2);
    var lo = Math.min(this.min1, Math.max(this.minPct1 * total, avail));
    var hi = Math.min(isFinite(this.max1) ? this.max1 : Infinity, avail);
    if (hi < lo) hi = lo;
    return clamp(ratio * total, lo, hi);
  };

  /** 应用比例；fromUser=true 时保存并回调 */
  Inst.prototype.apply = function (ratio, fromUser) {
    ratio = isFinite(ratio) ? clamp(ratio, 0, 1) : this.def;
    var px = this.toPx(ratio);
    this.box.style.setProperty('--sp-a', px.toFixed(1) + 'px');
    this._px = px;
    var pct = this.total() ? px / this.total() : ratio;
    this.bar.setAttribute('aria-valuenow', Math.round(pct * 100));
    if (fromUser && this.persist) { store()[this.key] = +pct.toFixed(4); save(); }
    if (fromUser && this.onEnd) { try { this.onEnd(px, pct); } catch (e) { } }
    return px;
  };

  /** rAF 合批：拖拽中每帧最多写一次样式 */
  Inst.prototype.applyRaf = function (ratio) {
    var self = this;
    this._pending = ratio;
    if (this._raf) return;
    this._raf = 1;
    (global.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () {
      self._raf = 0; self.apply(self._pending, false);
    });
  };

  Inst.prototype.down = function (e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    var self = this;
    var horiz = this.dir === 'x';
    var p0 = horiz ? e.clientX : e.clientY;
    var px0 = this._px;
    var total = this.total() || 1;
    this._drag = true;
    this.box.classList.add('sp-drag');
    this.bar.classList.add('sp-on');
    if (e.pointerId !== undefined && this.bar.setPointerCapture) {
      try { this.bar.setPointerCapture(e.pointerId); } catch (err) { }
    }
    e.preventDefault(); e.stopPropagation();

    function move(ev) {
      var p = horiz ? ev.clientX : ev.clientY;
      self.applyRaf((px0 + (p - p0)) / total);
      ev.preventDefault();
    }
    function up() {
      self._drag = false;
      self.box.classList.remove('sp-drag');
      self.bar.classList.remove('sp-on');
      global.removeEventListener('pointermove', move, true);
      global.removeEventListener('pointerup', up, true);
      global.removeEventListener('pointercancel', up, true);
      /* 松手才落盘：拖拽过程零 IO */
      self.apply(self.total() ? self._px / self.total() : self.def, true);
      if (self._sync) self._sync();
    }
    global.addEventListener('pointermove', move, true);
    global.addEventListener('pointerup', up, true);
    global.addEventListener('pointercancel', up, true);
  };

  /** 键盘：方向键 1%，Shift 加速 10%，Home 复位（PC / 外接键盘通用） */
  Inst.prototype.onKey = function (e) {
    var horiz = this.dir === 'x';
    var minus = horiz ? 'ArrowLeft' : 'ArrowUp';
    var plus = horiz ? 'ArrowRight' : 'ArrowDown';
    var total = this.total() || 1;
    var cur = this._px / total;
    var step = e.shiftKey ? 0.10 : 0.01;
    var v = null;
    if (e.key === minus) v = cur - step;
    else if (e.key === plus) v = cur + step;
    else if (e.key === 'Home' || e.key === 'Enter') { this.reset(); e.preventDefault(); return; }
    if (v === null) return;
    e.preventDefault();
    this.apply(v, true);
    if (this._sync) this._sync();
  };

  Inst.prototype.relayout = function () { this.apply(this.total() ? this._px / (this.total() || 1) : this.def, false); };
  /* 复位：清掉记忆并回到默认比例（不再写回，避免"复位后又被保存"） */
  Inst.prototype.reset = function () {
    delete store()[this.key];
    this.apply(this.def, false);
    save();
    if (this._sync) this._sync();
  };

  /* ------------------------------------------------------------------ 对外 */
  var Splitter = {
    /** 命令式挂载：Splitter.attach(box, {dir:'x'|'y', key, min1, max1, min2, def}) */
    attach: function (box, opt) {
      if (!box || box._sp) return box && box._sp;
      var it = new Inst(box, opt || {});
      if (!it.bar) return null;
      box._sp = it;
      it._sync = function () { if (Splitter.cloud && Splitter.cloud.enabled && Splitter.cloud.push) Splitter.cloud.push(Splitter.export()); };
      return it;
    },
    /** 声明式扫描：容器内所有 [data-sp]（含嵌套）一次性挂载 */
    scan: function (root) {
      if (!root) return [];
      var list = root.querySelectorAll ? root.querySelectorAll('[data-sp]') : [];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e._sp) { out.push(e._sp); continue; }
        out.push(Splitter.attach(e, {
          dir: e.getAttribute('data-sp'),
          key: e.getAttribute('data-sp-key') || ('sp' + (++SEQ)),
          min1: num(e.getAttribute('data-sp-min1'), undefined),
          max1: num(e.getAttribute('data-sp-max1'), undefined),
          min2: num(e.getAttribute('data-sp-min2'), undefined),
          def: num(e.getAttribute('data-sp-def'), undefined)
        }));
      }
      return out;
    },
    /** 窗口 / 面板尺寸变化后统一重排（所有实例） */
    relayout: function () { for (var k in INST) INST[k].relayout(); },
    reset: function (key) { if (INST[key]) INST[key].reset(); },
    resetAll: function () { store(); for (var k in INST) INST[k].reset(); },
    /** 导出/导入：给账号同步用（当前游戏为纯本地存档，接口先留好） */
    export: function () { var o = {}; for (var k in INST) o[k] = store()[k]; return o; },
    'import': function (obj) {
      if (!obj) return;
      for (var k in obj) { store()[k] = obj[k]; if (INST[k]) INST[k].apply(obj[k], false); }
      save();
    },
    /** 云同步适配器：接上账号体系后实现 pull/push 即可四端一致 */
    cloud: { enabled: false, pull: null, push: null }
  };

  /* 手柄：主循环里调 Splitter.gamepadTick() 即可用左摇杆调整当前聚焦的分隔条 */
  Splitter.gamepadTick = function () {
    if (!global.navigator || !navigator.getGamepads) return;
    var gps = navigator.getGamepads(); if (!gps) return;
    var gp = gps[0]; if (!gp) return;
    var bar = document.activeElement;
    if (!bar || !bar.classList || !bar.classList.contains('sp-bar')) return;
    var inst = bar.parentNode && bar.parentNode._sp; if (!inst) return;
    var dx = gp.axes[0] || 0, dy = gp.axes[1] || 0;
    var d = inst.dir === 'x' ? dx : dy;
    if (Math.abs(d) < 0.35) return;
    var total = inst.total() || 1;
    inst.apply(inst._px / total + d * 0.02, true);
  };

  if (typeof window !== 'undefined') window.Splitter = Splitter;
  if (typeof module !== 'undefined' && module.exports) module.exports = Splitter;
})(typeof window !== 'undefined' ? window : globalThis);
