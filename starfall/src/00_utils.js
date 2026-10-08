/* ============================================================
 * 00_utils.js —— 基础工具 / 随机与噪声
 * 所有随机、数学、格式化工具的集中地
 * ==========================================================*/
'use strict';

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }
function dist2(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return dx * dx + dy * dy; }
function angleOf(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

/** [a,b) 浮点随机；单参数则为 [0,a) */
function rnd(a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
/** [a,b] 整数随机 */
function irnd(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function chance(p) { return Math.random() < p; }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** 加权随机：list 元素 + 取权重函数 */
function weightedPick(list, wf) {
  let total = 0;
  for (const it of list) total += (typeof wf === 'function' ? wf(it) : it[wf]);
  if (total <= 0) return list[0];
  let r = Math.random() * total;
  for (const it of list) {
    r -= (typeof wf === 'function' ? wf(it) : it[wf]);
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

/* ---------- 可复现随机 ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, seed) {
  seed = seed || 0;
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smoothstep(t) { return t * t * (3 - 2 * t); }
function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smoothstep(xf), v = smoothstep(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
/** 分形噪声，返回约 0~1 */
function fbm(x, y, seed, oct) {
  oct = oct || 4;
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * noise2(x * f, y * f, seed + i * 131); norm += amp; f *= 2; amp *= 0.5; }
  return s / norm;
}

/* ---------- 显示格式化 ---------- */
function fmt(n) {
  n = Math.round(n);
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (h > 0) return h + '小时' + (m ? m + '分' : '');
  if (m > 0) return m + '分' + s + '秒';
  return s + '秒';
}
function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }
/** 小数友好格式：整数走 fmt，小数保留 1 位 */
function fmt2(v) {
  const abs = Math.abs(v);
  if (abs >= 10000) return fmt(v);
  if (Number.isInteger(v)) return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (Math.round(v * 10) / 10).toFixed(1);
}
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function $(id) { return document.getElementById(id); }
