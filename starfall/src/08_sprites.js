/* ============================================================
 * 08_sprites.js —— 程序化美术工厂（贴图 / 立绘 / 图标全部系统生成）
 * 无任何外部图片，全部由 Canvas 像素绘制并缓存
 * ==========================================================*/
'use strict';

function CV(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  return { c: c, x: x };
}
function R(x, px, py, w, h, col) { x.fillStyle = col; x.fillRect(px, py, w, h); }
function CIRC(x, cx, cy, r, col) {
  x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r + amt), 0, 255); g = clamp(Math.round(g + amt), 0, 255); b = clamp(Math.round(b + amt), 0, 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const Sprites = {
  _cache: {},
  key(k, fn) { if (!this._cache[k]) this._cache[k] = fn(); return this._cache[k]; },

  /* ==================== 地形 ==================== */
  groundTile(key, pal, seed, variant) {
    return this.key('gt' + key + variant, () => {
      const o = CV(16, 16), x = o.x, base = pal.ground[variant % pal.ground.length];
      R(x, 0, 0, 16, 16, base);
      const rndr = mulberry32(seed * 977 + variant * 31);
      for (let i = 0; i < 26; i++) {
        const px = Math.floor(rndr() * 16), py = Math.floor(rndr() * 16), s = rndr();
        R(x, px, py, 1, 1, s > .75 ? shade(base, 18) : shade(base, -14));
      }
      if (variant === 1) { // 草簇变体
        for (let i = 0; i < 3; i++) {
          const px = 2 + Math.floor(rndr() * 11), py = 3 + Math.floor(rndr() * 10);
          R(x, px, py, 1, 2, shade(pal.grill || pal.grass, 10)); R(x, px, py + 2, 1, 1, shade(pal.grass, -20));
        }
      }
      if (variant === 2) { // 小花
        const px = 3 + Math.floor(rndr() * 9), py = 4 + Math.floor(rndr() * 8);
        R(x, px, py, 1, 1, pal.flower[Math.floor(rndr() * pal.flower.length)]);
      }
      return o.c;
    });
  },
  waterTile(key, pal, frame) {
    return this.key('wt' + key + frame, () => {
      const o = CV(16, 16), x = o.x, b = pal.water;
      R(x, 0, 0, 16, 16, b);
      for (let i = 0; i < 4; i++) {
        const y = (i * 4 + frame * 2) % 16;
        R(x, 0, y, 16, 1, shade(b, 22));
        R(x, ((i % 2) ? 5 : 0) + frame, y + 1, 6, 1, shade(b, 34));
      }
      return o.c;
    });
  },
  mountainTile(key, pal) {
    return this.key('mt' + key, () => {
      const o = CV(16, 16), x = o.x, b = pal.mountain;
      R(x, 0, 0, 16, 16, b);
      for (let i = 0; i < 8; i++) R(x, (i * 5 + 2) % 14, (i * 7 + 1) % 14, 3, 2, shade(b, 20));
      R(x, 0, 0, 16, 1, shade(b, -30));
      return o.c;
    });
  },

  /* ==================== 场景物件 ==================== */
  tree(key, pal, v) {
    return this.key('tree' + key + v, () => {
      const o = CV(32, 64), x = o.x;
      const tr = pal.tree.trunk, lf = pal.tree.leaf;
      const h = 26 + v * 4;
      R(x, 13, 64 - h, 6, h, tr);
      R(x, 13, 64 - h, 2, h, shade(tr, -18));
      // 树冠：三层像素团
      const cy = 64 - h - 4;
      CIRC(x, 16, cy - 6, 12, lf);
      CIRC(x, 9, cy + 2, 8, shade(lf, -12));
      CIRC(x, 23, cy + 1, 8, shade(lf, -8));
      CIRC(x, 16, cy - 12, 8, shade(lf, 14));
      const rr = mulberry32(v * 71 + 3);
      for (let i = 0; i < 18; i++) {
        const px = 4 + Math.floor(rr() * 24), py = cy - 22 + Math.floor(rr() * 26);
        R(x, px, py, 2, 2, rr() > .5 ? shade(lf, 16) : shade(lf, -16));
      }
      return o.c;
    });
  },
  stump(key, pal) {
    return this.key('stump' + key, () => {
      const o = CV(32, 40), x = o.x;
      R(x, 9, 20, 14, 18, pal.tree.trunk);
      R(x, 9, 20, 14, 3, shade(pal.tree.trunk, 18));
      CIRC(x, 16, 21, 7, shade(pal.tree.trunk, 22));
      CIRC(x, 16, 21, 4, shade(pal.tree.trunk, -14));
      return o.c;
    });
  },
  rock(key, pal, v) {
    return this.key('rock' + key + v, () => {
      const o = CV(32, 32), x = o.x, b = pal.rock;
      const pts = [[6, 26], [10, 20], [16, 16], [24, 20], [27, 27], [16, 30]];
      x.fillStyle = b; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) x.lineTo(p[0], p[1]);
      x.closePath(); x.fill();
      x.fillStyle = shade(b, 22); x.beginPath(); x.moveTo(10, 20); x.lineTo(16, 16); x.lineTo(20, 19); x.lineTo(14, 23); x.closePath(); x.fill();
      R(x, 8, 28, 18, 2, shade(b, -30));
      return o.c;
    });
  },
  oreNode(color, v) {
    return this.key('ore' + color + v, () => {
      const o = CV(32, 40), x = o.x, b = '#6a6a72';
      x.fillStyle = b; x.beginPath(); x.moveTo(5, 38); x.lineTo(9, 24); x.lineTo(17, 20); x.lineTo(25, 25); x.lineTo(28, 38); x.closePath(); x.fill();
      R(x, 9, 24, 14, 3, shade(b, 20));
      const spots = [[11, 28], [17, 25], [22, 30], [14, 33]];
      for (const s of spots) { CIRC(x, s[0], s[1], 2 + (v % 2), color); R(x, s[0] - 1, s[1] - 1, 1, 1, shade(color, 60)); }
      return o.c;
    });
  },
  /** 煤矿脉：黑色块煤 + 冷灰高光与描边，避免与深色地表糊在一起 */
  coalNode(v) {
    return this.key('coal' + v, () => {
      const o = CV(32, 40), x = o.x, b = '#5a5660';
      x.fillStyle = b;
      x.beginPath(); x.moveTo(5, 38); x.lineTo(9, 24); x.lineTo(17, 20); x.lineTo(25, 25); x.lineTo(28, 38); x.closePath(); x.fill();
      R(x, 9, 24, 14, 3, shade(b, 22));
      R(x, 5, 36, 23, 2, '#3a3742');
      const lumps = [[11, 29, 4], [18, 25, 4], [23, 31, 3], [14, 33, 3]];
      for (const s of lumps) {
        CIRC(x, s[0], s[1], s[2], '#15151b');
        CIRC(x, s[0], s[1], Math.max(1, s[2] - 1), '#0b0b10');
        R(x, s[0] - s[2] + 1, s[1] - s[2] + 1, 2, 1, '#75809a');   // 冷色高光
      }
      x.strokeStyle = 'rgba(165,175,196,.6)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(5, 38); x.lineTo(9, 24); x.lineTo(17, 20); x.lineTo(25, 25); x.lineTo(28, 38); x.closePath(); x.stroke();
      return o.c;
    });
  },
  herbNode(color, shape) {
    return this.key('herb' + color + shape, () => {
      const o = CV(32, 32), x = o.x;
      R(x, 15, 18, 2, 12, '#3f6a30');
      for (let i = 0; i < 3; i++) {
        CIRC(x, 10 + i * 6, 16 - i % 2 * 4, 4, i % 2 ? shade(color, -14) : color);
      }
      CIRC(x, 16, 12, 3, shade(color, 25));
      return o.c;
    });
  },
  flower(color) {
    return this.key('fl' + color, () => {
      const o = CV(32, 32), x = o.x;
      R(x, 15, 16, 2, 14, '#3f6a30');
      CIRC(x, 16, 12, 4, color); CIRC(x, 12, 13, 3, shade(color, -15)); CIRC(x, 20, 13, 3, shade(color, -15));
      CIRC(x, 16, 12, 2, shade(color, 40));
      return o.c;
    });
  },
  bugNode() {
    return this.key('bugNode', () => {
      const o = CV(32, 32), x = o.x;
      R(x, 8, 22, 16, 8, '#5a4a34');
      for (let i = 0; i < 5; i++) R(x, 8 + i * 4, 22, 1, 8, '#3a2f22');
      R(x, 6, 20, 20, 3, '#7a6a4a');
      return o.c;
    });
  },
  fishSpot() {
    return this.key('fishSpot', () => {
      const o = CV(32, 32), x = o.x;
      x.strokeStyle = 'rgba(255,255,255,.65)'; x.lineWidth = 2;
      for (let i = 0; i < 2; i++) { x.beginPath(); x.arc(16, 16, 5 + i * 4, 0, 6.28); x.stroke(); }
      return o.c;
    });
  },
  chest(qColor) {
    return this.key('chest' + qColor, () => {
      const o = CV(32, 32), x = o.x;
      R(x, 6, 14, 20, 14, '#7a5230'); R(x, 6, 14, 20, 4, '#96673c');
      R(x, 6, 20, 20, 2, '#c9a24a'); R(x, 14, 20, 4, 5, qColor);
      R(x, 6, 27, 20, 2, '#4a3220'); R(x, 15, 24, 2, 3, '#ffd76a');
      return o.c;
    });
  },
  bench(skillKey) {
    const cols = { forge: ['#7a5230', '#ff7a2a'], alchemy: ['#4a5a7a', '#7fcfff'], cooking: ['#6a5a3a', '#ff9a4a'], tailor: ['#7a4a5a', '#ff9ac0'], wood: ['#5a4a34', '#c9a24a'] }[skillKey] || ['#6a5a3a', '#ffd76a'];
    return this.key('bench' + skillKey, () => {
      const o = CV(48, 48), x = o.x;
      R(x, 4, 22, 40, 8, cols[0]); R(x, 4, 22, 40, 2, shade(cols[0], 24));
      R(x, 8, 30, 6, 14, cols[0]); R(x, 34, 30, 6, 14, cols[0]);
      R(x, 12, 12, 24, 10, shade(cols[0], -18));
      // 台面上的工具光晕
      CIRC(x, 24, 17, 6, cols[1]); CIRC(x, 24, 17, 3, shade(cols[1], 60));
      R(x, 4, 44, 40, 2, '#2a2018');
      return o.c;
    });
  },
  house(w, h, pal, seed) {
    return this.key('house' + w + h + seed, () => {
      const cw = w * 32, ch = h * 32 + 24;
      const o = CV(cw, ch), x = o.x;
      const wall = '#c9b89a', roof = '#8f3a2a', wood = '#6a4a2a';
      R(x, 0, 32, cw, ch - 32, wall);
      for (let i = 0; i < cw; i += 16) R(x, i, 32, 1, ch - 32, shade(wall, -14));
      for (let i = 0; i < w; i++) { // 屋顶（瓦）
        for (let j = 0; j < 4; j++) R(x, i * 32, j * 8, 32, 8, j % 2 ? shade(roof, 12) : roof);
      }
      R(x, 0, 0, cw, 4, shade(roof, -30));
      // 门与窗
      const dx = Math.floor(cw / 2) - 12;
      R(x, dx, ch - 40, 24, 40, wood); R(x, dx + 2, ch - 38, 20, 38, shade(wood, -16));
      CIRC(x, dx + 20, ch - 20, 1, '#ffd76a');
      R(x, 8, 44, 14, 14, '#2f4a5a'); R(x, 8, 44, 14, 2, '#c9a24a');
      R(x, cw - 22, 44, 14, 14, '#2f4a5a'); R(x, cw - 22, 44, 14, 2, '#c9a24a');
      R(x, Math.floor(cw / 2) - 4, 8, 8, 26, '#6a5a4a');
      return o.c;
    });
  },
  portal() {
    return this.key('portal', () => {
      const o = CV(48, 64), x = o.x;
      R(x, 6, 8, 6, 54, '#5a6a9f'); R(x, 36, 8, 6, 54, '#5a6a9f'); R(x, 4, 6, 40, 6, '#3f4a7a');
      const g = x.createLinearGradient(0, 12, 0, 60);
      g.addColorStop(0, '#9fffff'); g.addColorStop(.5, '#5cf0ff'); g.addColorStop(1, '#6a4ac0');
      x.fillStyle = g; x.fillRect(12, 12, 24, 46);
      for (let i = 0; i < 10; i++) { CIRC(x, 24, 58 - i * 5, 1 + (i % 2), 'rgba(255,255,255,.7)'); }
      return o.c;
    });
  },
  npc(seed, role) {
    return this.key('npc' + seed + role, () => {
      const o = CV(32, 48), x = o.x;
      const rr = mulberry32(seed);
      const skin = '#f0c8a0';
      const cloth = ['#4a5a8a', '#7a4a5a', '#3f6a4a', '#8a6a3a', '#5a4a7a'][Math.floor(rr() * 5)];
      const hair = ['#3a2a1a', '#7a6a3a', '#2a2a2a', '#a08a5a'][Math.floor(rr() * 4)];
      R(x, 10, 30, 12, 16, cloth); R(x, 10, 44, 12, 2, shade(cloth, -30));
      R(x, 8, 32, 3, 10, skin); R(x, 21, 32, 3, 10, skin);
      R(x, 10, 16, 12, 14, skin);
      R(x, 9, 12, 14, 6, hair); R(x, 9, 12, 14, 2, shade(hair, 20));
      R(x, 12, 22, 2, 2, '#2a2a2a'); R(x, 18, 22, 2, 2, '#2a2a2a');
      if (role === 'guard') { R(x, 24, 14, 2, 30, '#8a8a9a'); R(x, 22, 10, 6, 6, '#c0c8d8'); }
      if (role === 'merchant') { R(x, 22, 34, 8, 8, '#8a6a3a'); }
      if (role === 'elder') { R(x, 12, 26, 8, 2, '#dfe8f5'); }
      return o.c;
    });
  },

  /* ==================== 角色 ==================== */
  _charCanvas(w) { const o = CV(16, 24); return o; },
  drawChar(x, look, dir, frame, wepType, scaled) {
    const s = scaled || 1;
    const P = (px, py, w, h, c) => { x.fillStyle = c; x.fillRect(px * s, py * s, w * s, h * s); };
    const bob = (frame === 1 || frame === 3) ? 1 : 0;
    let lo1 = 0, lo2 = 0;
    if (frame === 1) { lo1 = 1; lo2 = -1; } else if (frame === 3) { lo1 = -1; lo2 = 1; }
    // 腿
    P(5, 17 + lo1, 3, 6, look.pants); P(8, 17 + lo2, 3, 6, look.pants);
    P(5, 22 + lo1, 3, 2, shade(look.pants, -25)); P(8, 22 + lo2, 3, 2, shade(look.pants, -25));
    // 躯干
    P(4, 9 + bob, 8, 9, look.cloth);
    P(4, 9 + bob, 8, 1, look.trim); P(4, 13 + bob, 8, 1, shade(look.cloth, -22));
    P(4, 15 + bob, 8, 2, look.trim);
    // 手臂（挥动）
    const ao = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    P(2, 10 + ao, 2, 7, look.cloth); P(12, 10 - ao, 2, 7, look.cloth);
    P(2, 16 + ao, 2, 2, look.skin); P(12, 16 - ao, 2, 2, look.skin);
    // 头
    P(4, 2 + bob, 8, 7, look.skin);
    if (dir === 'up') {
      P(3, 1 + bob, 10, 6, look.hair);
    } else {
      P(3, 1 + bob, 10, 4, look.hair);
      P(3, 4 + bob, 2, 3, look.hair); P(11, 4 + bob, 2, 3, look.hair);
      if (dir === 'down') { P(6, 5 + bob, 1, 2, '#22232e'); P(9, 5 + bob, 1, 2, '#22232e'); }
      else if (dir === 'right') { P(9, 5 + bob, 1, 2, '#22232e'); }
      else { P(6, 5 + bob, 1, 2, '#22232e'); }
    }
    // 武器
    const wy = 8 + bob;
    if (wepType === 'sword') {
      if (dir === 'left') { P(0, wy + 3, 6, 2, look.wep); P(3, wy, 2, 2, '#ffd76a'); }
      else if (dir === 'right') { P(10, wy + 3, 6, 2, look.wep); P(9, wy, 2, 2, '#ffd76a'); }
      else if (dir === 'up') { P(13, wy - 3, 2, 9, look.wep); P(13, wy + 5, 3, 2, '#ffd76a'); }
      else { P(11, wy - 2, 2, 10, look.wep); P(10, wy + 6, 4, 2, '#ffd76a'); }
    } else if (wepType === 'bow') {
      const bx = dir === 'left' ? 1 : 13;
      x.fillStyle = look.wep;
      x.beginPath(); x.arc(bx * s + 1, (wy + 4) * s, 7 * s, -1.2, 1.2); x.lineWidth = 2 * s; x.strokeStyle = look.wep; x.stroke();
      x.beginPath(); x.moveTo(bx * s + 1, (wy - 2) * s); x.lineTo(bx * s + 1, (wy + 10) * s); x.lineWidth = 1 * s; x.strokeStyle = '#e8e8f0'; x.stroke();
    } else if (wepType === 'staff') {
      const sx = dir === 'left' ? 1 : 12;
      P(sx, wy - 4, 2, 14, '#6a4a2a');
      CIRC(x, sx * s + 1 * s, (wy - 6) * s, 3 * s, look.wep);
      CIRC(x, sx * s + 1 * s, (wy - 6) * s, 1.5 * s, '#ffffff');
    } else if (wepType === 'dagger') {
      const dx2 = dir === 'left' ? 1 : 12;
      P(dx2, wy + 6, 4, 2, look.wep); P(dx2 + 3, wy + 5, 2, 2, '#ffd76a');
    }
  },
  player(clsKey) {
    return this.key('pl' + clsKey, () => {
      const look = CLASSES[clsKey].look, wep = CLASSES[clsKey].iconSpec.wep;
      const S = 2, out = {};
      ['down', 'up', 'left', 'right'].forEach(dir => {
        const arr = [];
        for (let f = 0; f < 4; f++) {
          const o = CV(16 * S, 24 * S);
          this.drawChar(o.x, look, dir, f, wep, S);
          arr.push(o.c);
        }
        out[dir] = arr;
      });
      out.w = 16 * S; out.h = 24 * S;
      return out;
    });
  },
  portrait(clsKey, scale) {
    const S = scale || 3;
    return this.key('pt' + clsKey + S, () => {
      const look = CLASSES[clsKey].look, wep = CLASSES[clsKey].iconSpec.wep;
      const o = CV(16 * S, 24 * S);
      this.drawChar(o.x, look, 'down', 0, wep, S);
      return o.c;
    });
  },

  /* ==================== 怪物 ==================== */
  monster(tpl) {
    return this.key('mo' + tpl.name, () => {
      const S = 24, frames = [];
      for (let f = 0; f < 2; f++) {
        const o = CV(S, S), x = o.x;
        const b = f ? 1 : 0;
        const c1 = tpl.c1, c2 = tpl.c2, eye = tpl.eye || '#ffe36a';
        const ground = 22;
        switch (tpl.shape) {
          case 'quad':
            R(x, 4, 9 + b, 15, 8, c1); R(x, 5, 13 + b, 13, 4, c2);
            R(x, 15, 5 + b, 7, 6, c1); R(x, 17, 8 + b, 2, 2, eye); R(x, 20, 7 + b, 2, 2, shade(eye, -40));
            R(x, 13, 11 + b, 2, 3, c2);
            R(x, 5, 17 + b, 3, 6, c2); R(x, 10, 17 - b, 3, 6, c2); R(x, 15, 17 + b, 3, 6, c2);
            R(x, 5, 22 + b, 3, 1, shade(c2, -30)); R(x, 10, 22 - b, 3, 1, shade(c2, -30));
            break;
          case 'beast':
            R(x, 3, 8 + b, 18, 10, c1); R(x, 4, 13 + b, 16, 5, c2);
            R(x, 15, 3 + b, 9, 8, c1); R(x, 17, 6 + b, 2, 2, eye); R(x, 21, 6 + b, 2, 2, eye);
            R(x, 19, 9 + b, 3, 2, '#ffffff');
            for (let i = 0; i < 5; i++) R(x, 2 + i * 3, 4 + b, 2, 5, shade(c1, -22));
            R(x, 4, 18 + b, 4, 6, c2); R(x, 10, 18 - b, 4, 6, c2); R(x, 16, 18 + b, 4, 6, c2);
            break;
          case 'bird':
            R(x, 8, 10 + b, 8, 7, c1); R(x, 9, 13 + b, 6, 4, c2);
            R(x, 14, 8 + b, 5, 4, c1); R(x, 17, 9 + b, 2, 2, eye); R(x, 18, 11 + b, 3, 1, '#ffb04a');
            const w = b ? -2 : 2;
            for (let i = 0; i < 4; i++) R(x, 3 + i, 8 + b + (i * w) / 2, 5, 2, shade(c1, i % 2 ? 16 : -16));
            R(x, 9, 17 + b, 2, 4, '#c9a24a'); R(x, 13, 17 + b, 2, 4, '#c9a24a');
            break;
          case 'insect':
            CIRC(x, 12, 13 + b, 7, c1); CIRC(x, 12, 10 + b, 4, c2);
            R(x, 8, 10 + b, 1, 2, eye); R(x, 14, 10 + b, 1, 2, eye);
            for (let i = 0; i < 3; i++) {
              const lx = 6 + i * 5;
              R(x, lx, 18 + (i % 2 ? b : -b), 1, 5, shade(c2, -20));
              R(x, lx + 1, 13 + (i % 2 ? -b : b), 1, 5, shade(c2, -10));
            }
            break;
          case 'blob':
            CIRC(x, 12, 15 + b, 8, c1); R(x, 4, 15 + b, 16, 8, c1);
            CIRC(x, 12, 20, 8, shade(c1, -16)); CIRC(x, 9, 10 + b, 3, shade(c1, 30));
            R(x, 8, 13 + b, 3, 3, eye); R(x, 14, 13 + b, 3, 3, eye);
            R(x, 9, 14 + b, 1, 1, '#1a1a22'); R(x, 15, 14 + b, 1, 1, '#1a1a22');
            break;
          case 'plant':
            R(x, 10, 12 + b, 4, 11, '#4a6a30');
            for (let i = 0; i < 3; i++) { CIRC(x, 7 + i * 5, 12 + b - (i % 2) * 2, 5, i % 2 ? shade(c1, -14) : c1); }
            CIRC(x, 12, 6 + b, 4, c2);
            R(x, 10, 8 + b, 2, 2, eye); R(x, 14, 8 + b, 2, 2, eye);
            break;
          case 'golem':
            R(x, 5, 8 + b, 14, 14, c1); R(x, 6, 9 + b, 12, 5, shade(c1, 20));
            R(x, 7, 15 + b, 10, 6, c2);
            CIRC(x, 9, 12 + b, 2, eye); CIRC(x, 15, 12 + b, 2, eye);
            R(x, 3, 10 + b, 3, 8, shade(c1, -16)); R(x, 18, 10 - b, 3, 8, shade(c1, -16));
            R(x, 6, 22 + b, 4, 2, shade(c2, -20)); R(x, 14, 22 + b, 4, 2, shade(c2, -20));
            break;
          case 'humanoid':
            R(x, 9, 9 + b, 6, 8, c1); R(x, 9, 9 + b, 6, 2, shade(c1, 22));
            R(x, 9, 3 + b, 6, 6, c2); R(x, 10, 5 + b, 2, 2, eye); R(x, 13, 5 + b, 2, 2, eye);
            R(x, 6, 10 + b + (b ? 1 : 0), 3, 8, c1); R(x, 15, 10 + b - (b ? 1 : 0), 3, 8, c1);
            R(x, 9, 17 + b, 2, 6, c2); R(x, 13, 17 - b, 2, 6, c2);
            break;
          case 'undead':
            R(x, 8, 9 + b, 8, 3, c1);
            R(x, 9, 3 + b, 6, 6, c1); R(x, 10, 5 + b, 2, 2, eye); R(x, 13, 5 + b, 2, 2, eye);
            for (let i = 0; i < 4; i++) R(x, 8, 13 + i * 2 + b, 8, 1, c2);
            R(x, 6, 9 + b, 2, 9, c1); R(x, 16, 9 - b, 2, 9, c1);
            R(x, 9, 18 + b, 2, 5, c1); R(x, 13, 18 - b, 2, 5, c1);
            break;
          case 'ghost':
            CIRC(x, 12, 10 + b, 7, c1);
            for (let i = 0; i < 4; i++) R(x, 5 + i * 5, 16 + b + (i % 2 ? 1 : 0), 4, 5, c1);
            R(x, 9, 9 + b, 2, 2, eye); R(x, 14, 9 + b, 2, 2, eye);
            CIRC(x, 12, 10 + b, 3, shade(c1, 40));
            break;
          case 'worm':
            for (let i = 0; i < 5; i++) {
              CIRC(x, 6 + i * 3, 15 + b + Math.sin(i + f) * 1.5, 4 - i * 0.3, i % 2 ? c1 : c2);
            }
            R(x, 15, 12 + b, 4, 4, c1); R(x, 16, 13 + b, 2, 2, eye);
            break;
          case 'dragon':
            R(x, 4, 10 + b, 16, 9, c1); R(x, 5, 14 + b, 14, 5, c2);
            R(x, 16, 4 + b, 8, 7, c1); R(x, 18, 7 + b, 2, 2, eye); R(x, 22, 7 + b, 2, 2, eye);
            const wf = b ? 3 : -3;
            for (let i = 0; i < 6; i++) R(x, 2 + i, 8 + b + i * wf / 3, 6, 2, i % 2 ? shade(c2, 20) : shade(c2, -10));
            R(x, 5, 19 + b, 4, 4, c2); R(x, 12, 19 - b, 4, 4, c2);
            R(x, 2, 20 + b, 6, 2, c2);
            break;
          default:
            CIRC(x, 12, 13 + b, 7, c1); R(x, 9, 11 + b, 2, 2, eye); R(x, 14, 11 + b, 2, 2, eye);
        }
        frames.push(o.c);
      }
      return { frames: frames, size: tpl.size || 1 };
    });
  },

  /* ==================== 物品图标 ==================== */
  icon(inst) {
    const q = inst.type === 'gear' ? inst.q : (inst.q || 2);
    return this.key('ic' + inst.id + '|' + q, () => {
      const o = CV(32, 32), x = o.x, def = ITEMS[inst.id];
      const col = def.color || '#cccccc';
      let shape = def.shape || def.icon || 'misc';
      if (inst.type === 'gear') shape = def.icon;
      const P = (a, b, w, h, c) => R(x, a, b, w, h, c);
      switch (shape) {
        case 'sword': x.save(); x.translate(16, 16); x.rotate(-0.7); P(-2, -13, 4, 20, col); P(-2, -17, 4, 4, shade(col, 40)); P(-5, 5, 10, 3, '#ffd76a'); P(-2, 8, 4, 6, '#7a4a2a'); x.restore(); break;
        case 'bow': x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.arc(14, 16, 11, -1.3, 1.3); x.stroke(); x.strokeStyle = '#e8e8f0'; x.lineWidth = 1; x.beginPath(); x.moveTo(14, 4); x.lineTo(14, 28); x.stroke(); break;
        case 'staff': P(14, 6, 3, 22, '#7a5230'); CIRC(x, 15, 6, 5, col); CIRC(x, 15, 6, 2, '#ffffff'); break;
        case 'dagger': x.save(); x.translate(16, 16); x.rotate(-0.8); P(-2, -8, 4, 12, col); P(-4, 4, 8, 2, '#ffd76a'); P(-1, 6, 3, 6, '#5a3a22'); x.restore(); break;
        case 'hammer': P(14, 8, 3, 18, '#7a5230'); P(8, 5, 15, 8, col); P(8, 5, 15, 2, shade(col, 30)); break;
        case 'helmet': CIRC(x, 16, 16, 10, col); P(6, 16, 20, 8, col); P(6, 22, 20, 3, shade(col, -25)); P(12, 13, 8, 4, '#2a2f45'); break;
        case 'chest': P(7, 8, 18, 18, col); P(9, 8, 14, 5, shade(col, 26)); P(7, 14, 18, 2, '#ffd76a'); P(11, 10, 2, 12, shade(col, -22)); P(19, 10, 2, 12, shade(col, -22)); break;
        case 'shield': x.beginPath(); x.moveTo(16, 5); x.lineTo(27, 9); x.lineTo(25, 22); x.lineTo(16, 28); x.lineTo(7, 22); x.lineTo(5, 9); x.closePath(); x.fillStyle = col; x.fill(); CIRC(x, 16, 16, 4, '#ffd76a'); break;
        case 'legs': P(9, 6, 6, 22, col); P(17, 6, 6, 22, col); P(8, 6, 18, 4, shade(col, 26)); break;
        case 'boots': P(9, 12, 6, 12, col); P(17, 12, 6, 12, col); P(8, 22, 8, 4, shade(col, -22)); P(16, 22, 8, 4, shade(col, -22)); break;
        case 'ring': x.strokeStyle = col; x.lineWidth = 4; x.beginPath(); x.arc(16, 18, 9, 0, 6.28); x.stroke(); CIRC(x, 16, 7, 4, '#ffffff'); break;
        case 'necklace': x.strokeStyle = col; x.lineWidth = 2; x.beginPath(); x.arc(16, 12, 10, 0.3, 2.8); x.stroke(); CIRC(x, 16, 24, 4, '#ffffff'); break;
        case 'amulet': P(10, 6, 12, 12, col); P(12, 8, 8, 8, shade(col, 30)); P(14, 18, 4, 8, '#c9a24a'); break;
        case 'ore': [[8, 16, 6], [16, 12, 7], [20, 19, 5], [13, 19, 6]].forEach(s => { CIRC(x, s[0], s[1], s[2], col); CIRC(x, s[0] - 1, s[1] - 1, s[2] - 2, shade(col, 30)); }); break;
        case 'wood': P(6, 11, 20, 10, col); P(6, 11, 20, 2, shade(col, 26)); CIRC(x, 10, 16, 3, shade(col, -24)); CIRC(x, 22, 16, 4, shade(col, -24)); CIRC(x, 22, 16, 2, shade(col, -40)); break;
        case 'herb': P(15, 14, 2, 14, '#3f6a30'); CIRC(x, 11, 13, 5, col); CIRC(x, 21, 12, 5, shade(col, -14)); CIRC(x, 16, 8, 4, shade(col, 26)); break;
        case 'fish': x.beginPath(); x.ellipse(15, 17, 10, 6, 0, 0, 6.28); x.fillStyle = col; x.fill(); x.beginPath(); x.moveTo(5, 17); x.lineTo(0, 10); x.lineTo(0, 24); x.closePath(); x.fill(); CIRC(x, 21, 15, 2, '#ffffff'); CIRC(x, 21, 15, 1, '#111'); break;
        case 'gem': x.beginPath(); x.moveTo(16, 4); x.lineTo(26, 14); x.lineTo(16, 28); x.lineTo(6, 14); x.closePath(); x.fillStyle = col; x.fill(); x.beginPath(); x.moveTo(16, 4); x.lineTo(20, 14); x.lineTo(16, 28); x.lineTo(12, 14); x.closePath(); x.fillStyle = shade(col, 40); x.fill(); break;
        case 'hide': x.beginPath(); x.ellipse(16, 16, 11, 9, 0, 0, 6.28); x.fillStyle = col; x.fill(); P(10, 12, 12, 2, shade(col, -24)); break;
        case 'thread': x.strokeStyle = col; x.lineWidth = 2; x.beginPath(); x.arc(16, 16, 9, 0, 6.28); x.stroke(); x.beginPath(); x.arc(16, 16, 5, 1, 4); x.stroke(); break;
        case 'cloth': P(8, 8, 16, 16, col); P(8, 8, 16, 2, shade(col, 26)); P(12, 10, 2, 12, shade(col, -20)); break;
        case 'bone': P(8, 14, 16, 4, col); CIRC(x, 8, 12, 3, col); CIRC(x, 8, 20, 3, col); CIRC(x, 24, 12, 3, col); CIRC(x, 24, 20, 3, col); break;
        case 'feather': P(15, 6, 2, 20, '#a0a8b8'); x.beginPath(); x.ellipse(14, 14, 6, 9, -0.3, 0, 6.28); x.fillStyle = col; x.fill(); break;
        case 'sac': CIRC(x, 16, 18, 9, col); P(13, 6, 6, 8, shade(col, -22)); CIRC(x, 13, 16, 3, shade(col, 40)); break;
        case 'core': CIRC(x, 16, 16, 8, col); CIRC(x, 16, 16, 5, shade(col, 50)); CIRC(x, 13, 13, 2, '#ffffff'); break;
        case 'star': for (let i = 0; i < 5; i++) { const a = -1.57 + i * 1.256; P(16 + Math.cos(a) * 11 - 2, 16 + Math.sin(a) * 11 - 2, 4, 4, col); } CIRC(x, 16, 16, 6, shade(col, 60)); break;
        case 'scale': for (let i = 0; i < 6; i++) CIRC(x, 10 + i * 3, 12 + (i % 2) * 6, 4, i % 2 ? col : shade(col, -18)); break;
        case 'water': x.beginPath(); x.moveTo(16, 4); x.quadraticCurveTo(26, 18, 16, 28); x.quadraticCurveTo(6, 18, 16, 4); x.fillStyle = col; x.fill(); CIRC(x, 14, 18, 2, '#ffffff'); break;
        case 'stone': x.beginPath(); x.moveTo(6, 22); x.lineTo(10, 10); x.lineTo(20, 8); x.lineTo(26, 20); x.lineTo(16, 27); x.closePath(); x.fillStyle = col; x.fill(); break;
        case 'powder': P(9, 14, 14, 12, '#d8d0b0'); P(11, 10, 10, 5, col); P(13, 12, 2, 2, shade(col, 30)); break;
        case 'ingot': P(7, 18, 18, 7, col); P(9, 14, 14, 5, shade(col, 24)); P(7, 23, 18, 2, shade(col, -24)); break;
        case 'potion': x.beginPath(); x.moveTo(13, 4); x.lineTo(19, 4); x.lineTo(19, 9); x.quadraticCurveTo(26, 16, 22, 26); x.lineTo(10, 26); x.quadraticCurveTo(6, 16, 13, 9); x.closePath(); x.fillStyle = 'rgba(220,235,255,.35)'; x.fill(); x.beginPath(); x.ellipse(16, 21, 7, 6, 0, 0, 6.28); x.fillStyle = col; x.fill(); P(13, 3, 6, 2, '#8a6a3a'); break;
        case 'elixir': x.beginPath(); x.moveTo(13, 4); x.lineTo(19, 4); x.lineTo(19, 10); x.lineTo(24, 27); x.lineTo(8, 27); x.lineTo(13, 10); x.closePath(); x.fillStyle = col; x.fill(); CIRC(x, 16, 20, 3, shade(col, 50)); break;
        case 'scroll': P(8, 8, 16, 18, '#e8dcb8'); P(8, 8, 16, 3, '#c9b078'); P(8, 23, 16, 3, '#c9b078'); P(12, 13, 8, 1, '#7a6a4a'); P(12, 17, 8, 1, '#7a6a4a'); break;
        case 'food': x.beginPath(); x.arc(16, 18, 9, 3.14, 6.28); x.fillStyle = col; x.fill(); P(7, 18, 18, 5, shade(col, -20)); CIRC(x, 13, 14, 2, shade(col, 40)); CIRC(x, 19, 13, 2, shade(col, 40)); break;
        case 'seed': CIRC(x, 16, 20, 5, col); P(15, 14, 2, 7, '#7fbf6f'); CIRC(x, 19, 12, 3, shade('#7fbf6f', 20)); break;
        case 'crop': P(15, 12, 2, 15, '#6a8a3a'); CIRC(x, 16, 10, 6, col); CIRC(x, 12, 13, 4, shade(col, -16)); break;
        case 'tool': P(15, 6, 3, 12, '#8a6a42'); x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.arc(16, 20, 8, 0.2, 2.2); x.stroke(); break;
        default: P(8, 8, 16, 16, col); P(11, 11, 10, 10, shade(col, 30));
      }
      // 品质描边
      const qc = getQuality(q).color;
      x.strokeStyle = q === 2 ? 'rgba(0,0,0,.5)' : qc; x.lineWidth = 2;
      x.strokeRect(1, 1, 30, 30);
      return o.c;
    });
  },
  blobIconUrl(inst) { return this.icon(inst); },

  /* ==================== 技能图标 ==================== */
  skillIcon(key) {
    return this.key('sk' + key, () => {
      const o = CV(32, 32), x = o.x;
      R(x, 0, 0, 32, 32, '#141c33');
      const G = (pts, col) => { x.strokeStyle = col; x.lineWidth = 2; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.stroke(); };
      switch (key) {
        case 'slash': G([[6, 26], [16, 18], [26, 6]], '#ffd76a'); G([[10, 26], [20, 8]], '#fff4c0'); break;
        case 'dash': G([[6, 16], [26, 16]], '#9fe8ff'); G([[18, 10], [26, 16], [18, 22]], '#9fe8ff'); break;
        case 'spin': x.strokeStyle = '#ffb04a'; x.lineWidth = 3; x.beginPath(); x.arc(16, 16, 10, 0.6, 5.2); x.stroke(); break;
        case 'shield': x.beginPath(); x.moveTo(16, 4); x.lineTo(27, 9); x.lineTo(25, 22); x.lineTo(16, 28); x.lineTo(7, 22); x.lineTo(5, 9); x.closePath(); x.strokeStyle = '#cfd8e8'; x.lineWidth = 3; x.stroke(); break;
        case 'wave': x.strokeStyle = '#9fe8ff'; x.lineWidth = 3; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(6, 16, 6 + i * 5, -1, 1); x.stroke(); } break;
        case 'ultimate': for (let i = 0; i < 5; i++) { const a = -1.57 + i * 1.256; R(x, 16 + Math.cos(a) * 9 - 2, 16 + Math.sin(a) * 9 - 2, 4, 4, '#ff9fe8'); } CIRC(x, 16, 16, 5, '#ffffff'); break;
        case 'arrow': G([[6, 26], [26, 6]], '#cfe86a'); G([[16, 6], [26, 6], [26, 16]], '#cfe86a'); break;
        case 'multi': [[6, 24], [16, 16], [26, 8]].forEach(a => G([[a[0], a[1]], [a[0] + 8, a[1] - 8]], '#cfe86a')); break;
        case 'trap': x.strokeStyle = '#c9a24a'; x.lineWidth = 2; x.beginPath(); x.arc(16, 16, 9, 0, 6.28); x.stroke(); G([[10, 10], [22, 22]], '#c9a24a'); G([[22, 10], [10, 22]], '#c9a24a'); break;
        case 'rain': for (let i = 0; i < 5; i++) G([[6 + i * 5, 6], [6 + i * 5, 24]], '#9fe8b8'); break;
        case 'fire': CIRC(x, 16, 18, 8, '#ff6a2a'); CIRC(x, 14, 14, 5, '#ffb04a'); CIRC(x, 14, 12, 3, '#ffe07a'); break;
        case 'ice': G([[16, 4], [16, 28]], '#9fe8ff'); G([[16, 16], [7, 10]], '#9fe8ff'); G([[16, 16], [25, 10]], '#9fe8ff'); G([[16, 16], [7, 22]], '#9fe8ff'); G([[16, 16], [25, 22]], '#9fe8ff'); break;
        case 'thunder': G([[18, 4], [12, 16], [18, 16], [12, 28]], '#ffe36a'); break;
        case 'meteor': CIRC(x, 16, 12, 7, '#ff6a2a'); G([[20, 20], [10, 28]], '#ffd76a'); G([[24, 16], [16, 26]], '#ffd76a'); break;
        case 'stab': G([[6, 8], [26, 24]], '#c8d0e0'); G([[18, 20], [26, 24], [22, 16]], '#7fdba4'); break;
        case 'poison': CIRC(x, 16, 18, 7, '#7fd05a'); CIRC(x, 13, 14, 3, '#cfffa0'); R(x, 12, 6, 8, 3, '#4a8a2a'); break;
        case 'smoke': CIRC(x, 12, 18, 6, '#8a94ad'); CIRC(x, 20, 15, 5, '#6a7488'); CIRC(x, 16, 22, 5, '#5a647a'); break;
        default: CIRC(x, 16, 16, 9, '#8fa8ff');
      }
      x.strokeStyle = 'rgba(255,215,106,.5)'; x.lineWidth = 2; x.strokeRect(1, 1, 30, 30);
      return o.c;
    });
  }
};
