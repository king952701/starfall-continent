/* ============================================================
 * 09_world.js —— 世界地形：区块流式生成 / 采集点 / 村落与营地
 * Chunk = 16×16 格（512px），离开视野自动卸载（保留已修改数据）
 * ==========================================================*/
'use strict';

const T_NODE_RESPAWN = 90000; // 采集点刷新 90 秒

class WorldSite {
  /** 村落 / 营地：一次性生成建筑清单 */
  constructor(tx, ty, scale, seed, isVillage) {
    this.tx = tx; this.ty = ty; this.items = [];
    const objs = this.items;
    const rr = mulberry32(seed);
    objs.push({ dx: 0, dy: 0, kind: 'portal' });
    ['forge', 'alchemy', 'cooking', 'tailor', 'wood'].forEach((s, i) => {
      objs.push({ dx: 4 + i * 2, dy: -1, kind: 'bench', data: s });
    });
    const benches = isVillage ? 4 : 1;
    for (let i = 0; i < benches; i++) {
      objs.push({ dx: -4 + i * 3, dy: 3, kind: 'house', w: 3, h: 2, data: i });
    }
    for (let i = 0; i < (isVillage ? 4 : 2); i++) {
      objs.push({ dx: -6 + rr() * 12, dy: -6 + rr() * 12, kind: 'npc', data: choice(['guard', 'merchant', 'elder']) });
    }
    objs.push({ dx: 6, dy: 2, kind: 'chest' });
    objs.push({ dx: -7, dy: 2, kind: 'chest' });
  }
}

class World {
  constructor(seed) {
    this.seed = seed || 20260810;
    this.chunks = new Map();
    this.sites = [];
    // 每个大区一个营地 + 新手村
    REGIONS.forEach((r, i) => {
      if (r.key === 'sea') return;
      const cx = Math.floor((r.x0 + r.x1) / 2), cy = Math.floor((r.y0 + r.y1) / 2);
      this.sites.push(new WorldSite(cx, cy, 1, this.seed + i * 17, r.hasVillage));
      if (r.hasVillage) this.villageTile = { x: cx, y: cy };
    });
    this.homeEntry = this.villageTile || { x: 1500, y: 7500 };
  }

  keyTile(tx, ty) { return (tx >> 4) + ',' + (ty >> 4); }

  /* ---------- 地形信息（纯函数，供小地图等使用） ---------- */
  tileInfo(tx, ty) {
    const r = regionAtTile(tx, ty);
    const h = fbm(tx * 0.012, ty * 0.012, this.seed, 4);
    const h2 = fbm(tx * 0.05, ty * 0.05, this.seed + 7, 3);
    let water = false, mountain = false;
    const outside = tx < 0 || ty < 0 || tx >= WORLD_SIZE || ty >= WORLD_SIZE;
    if (outside) water = true;
    else if (r.key === 'sea') water = h < 0.55;
    else {
      water = h < 0.16;
      if (tx >= 9200 || (ty >= 3000 && ty < 9000 && tx >= 9050)) water = water || h < 0.5;
    }
    mountain = !water && h > 0.74 && r.key !== 'sea';
    return { r: r, h: h, h2: h2, water: water, mountain: mountain, variant: Math.floor(h2 * 3) % 3 };
  }

  /* ---------- 区块生成 ---------- */
  getChunk(cx, cy) {
    const k = cx + ',' + cy;
    let ch = this.chunks.get(k);
    if (ch) return ch;
    ch = this.genChunk(cx, cy);
    this.chunks.set(k, ch);
    return ch;
  }
  chunkForTile(tx, ty) { return this.getChunk(tx >> 4, ty >> 4); }

  genChunk(cx, cy) {
    const btx = cx * CHUNK, bty = cy * CHUNK;
    const ch = { cx: cx, cy: cy, canvas: null, objs: [], nodes: new Map(), solid: new Uint8Array(CHUNK * CHUNK) };
    const used = new Set();
    /* --- 站点（村落 / 营地） --- */
    for (const site of this.sites) {
      for (const it of site.items) {
        const tx = Math.round(site.tx + it.dx), ty = Math.round(site.ty + it.dy);
        if (tx < btx || tx >= btx + CHUNK || ty < bty || ty >= bty + CHUNK) continue;
        const lx = tx - btx, ly = ty - bty;
        if (it.kind === 'house') {
          const sp = Sprites.house(it.w || 3, it.h || 2, REGION_BY_KEY.plain.pal, it.data || 0);
          ch.objs.push({ lx: lx, ly: ly, kind: 'house', sp: sp, ox: 0, oy: 0, solid: true, w: it.w, h: it.h });
          for (let a = 0; a < (it.w || 1); a++) for (let b = 0; b < (it.h || 1); b++) this._setSolid(ch, lx + a, ly + b, 1);
        } else if (it.kind === 'bench') {
          ch.objs.push({ lx: lx, ly: ly, kind: 'bench', data: it.data, sp: Sprites.bench(it.data), ox: -8, oy: 0, solid: true });
          this._setSolid(ch, lx, ly, 1);
        } else if (it.kind === 'portal') {
          ch.objs.push({ lx: lx, ly: ly, kind: 'portal', sp: Sprites.portal(), ox: -8, oy: 0, solid: false });
        } else if (it.kind === 'npc') {
          ch.objs.push({ lx: lx, ly: ly, kind: 'npc', data: it.data, sp: Sprites.npc((Math.abs(tx * 31 + ty * 17)) % 999, it.data), ox: 0, oy: 0, solid: false });
        } else if (it.kind === 'chest') {
          ch.objs.push({ lx: lx, ly: ly, kind: 'chest', sp: Sprites.chest('#ffd76a'), ox: 0, oy: 0, solid: false, opened: 0 });
        }
        used.add(lx + ',' + ly);
      }
    }
    /* --- 自然物件：抖动网格采样，一格 (4×4) 最多 1 个，密度可控且不成片 --- */
    const STEP = 4;
    const c0x = Math.floor(btx / STEP), c0y = Math.floor(bty / STEP);
    const nSteps = Math.ceil(CHUNK / STEP) + 1;
    for (let cy = c0y - 1; cy <= c0y + nSteps; cy++) {
      for (let cx = c0x - 1; cx <= c0x + nSteps; cx++) {
        const jx = Math.floor(hash2(cx, cy, this.seed + 991) * STEP);
        const jy = Math.floor(hash2(cx, cy, this.seed + 1777) * STEP);
        const tx = cx * STEP + jx, ty = cy * STEP + jy;
        if (tx < btx || tx >= btx + CHUNK || ty < bty || ty >= bty + CHUNK) continue;
        const lx = tx - btx, ly = ty - bty;
        const ks = lx + ',' + ly;
        const info = this.tileInfo(tx, ty);
        if (info.water || info.mountain) continue;
        if (used.has(ks)) continue;
        const rr = REGION_BY_KEY[info.r.key];
        // 树：低频噪声决定林区位置，命中率由大区 treeRate 控制
        if (fbm(tx * 0.09, ty * 0.09, this.seed + 31, 2) > 0.52 && hash2(tx, ty, this.seed + 4242) < rr.treeRate * 2.0) {
          ch.objs.push({ lx: lx, ly: ly, kind: 'tree', sp: Sprites.tree(rr.key, rr.pal, irnd(0, 2)), ox: 0, oy: 0, solid: true, node: this._mkNode(rr, 'log', tx, ty) });
          this._setSolid(ch, lx, ly, 1); continue;
        }
        // 其余资源：互斥分段，一次摇号只出一种
        const rh = hash2(tx, ty, this.seed + 8181);
        const pRock = rr.rockRate * 1.6, pHerb = rr.herbRate * 2.0, pBug = 0.05, pFlower = 0.12;
        if (rh < pRock) {
          if (chance(0.5)) {
            const pool = weightedPick(rr.res.ore, 'w');
            const item = ITEMS[pool.id];
            ch.objs.push({
              lx: lx, ly: ly, kind: 'ore',
              sp: pool.id === 4005 ? Sprites.coalNode(v0(tx + ty)) : Sprites.oreNode(item.color, v0(tx + ty)),
              ox: 0, oy: 0, solid: true, node: this._mkNode(rr, 'mine', tx, ty, pool.id)
            });
          } else {
            ch.objs.push({ lx: lx, ly: ly, kind: 'rock', sp: Sprites.rock(rr.key, rr.pal, v0(tx * 3 + ty)), ox: 0, oy: 0, solid: true });
          }
          this._setSolid(ch, lx, ly, 1); continue;
        }
        if (rh < pRock + pHerb) {
          const pool = weightedPick(rr.res.herb, 'w');
          const item = ITEMS[pool.id];
          ch.objs.push({ lx: lx, ly: ly, kind: 'herb', sp: Sprites.herbNode(item.color, item.id), ox: 0, oy: 0, solid: false, node: this._mkNode(rr, 'herb', tx, ty, pool.id) });
          continue;
        }
        if (rh < pRock + pHerb + pBug) {
          ch.objs.push({ lx: lx, ly: ly, kind: 'bug', sp: Sprites.bugNode(), ox: 0, oy: 0, solid: false, node: this._mkNode(rr, 'bug', tx, ty) });
          continue;
        }
        if (rh < pRock + pHerb + pBug + pFlower) {
          ch.objs.push({ lx: lx, ly: ly, kind: 'flower', sp: Sprites.flower(choice(rr.pal.flower)), ox: 0, oy: 0, solid: false });
          continue;
        }
      }
    }
    /* --- 水边的钓鱼点 --- */
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = btx + lx, ty = bty + ly;
        if (!this.tileInfo(tx, ty).water) continue;
        const nearLand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => !this.tileInfo(tx + d[0], ty + d[1]).water);
        if (nearLand && chance(0.012)) {
          const rr = REGION_BY_KEY[regionAtTile(tx, ty).key];
          ch.objs.push({ lx: lx, ly: ly, kind: 'fish', sp: Sprites.fishSpot(), ox: 0, oy: 0, solid: false, node: this._mkFishNode(rr, tx, ty) });
        }
      }
    }
    // 注册采集点索引
    for (const ob of ch.objs) {
      if (ob.node) { ob.node.lx = ob.lx; ob.node.ly = ob.ly; ch.nodes.set(ob.lx + ',' + ob.ly, ob.node); }
    }
    return ch;
  }
  _setSolid(ch, lx, ly, v) {
    if (lx < 0 || ly < 0 || lx >= CHUNK || ly >= CHUNK) return;
    ch.solid[ly * CHUNK + lx] = v;
  }
  _mkNode(rr, skill, tx, ty, forceId) {
    const key = { mine: 'ore', log: 'wood', herb: 'herb', bug: 'bug' }[skill];
    const pool = rr.res[key];
    const p = forceId ? pool.find(o => o.id === forceId) || weightedPick(pool, 'w') : weightedPick(pool, 'w');
    return {
      skill: skill, itemId: p.id, req: p.lv || 1, tx: tx, ty: ty, amount: irnd(2, 4), max: 4,
      respawnAt: 0, dead: 0, rare: chance(0.06)
    };
  }
  _mkFishNode(rr, tx, ty) {
    return { skill: 'fish', itemId: 0, req: 1, tx: tx, ty: ty, amount: 999, max: 999, respawnAt: 0, area: rr.fishArea };
  }

  /* ---------- 查询 ---------- */
  solidTile(tx, ty) {
    const info = this.tileInfo(tx, ty);
    if (info.water || info.mountain) return true;
    const ch = this.getChunk(tx >> 4, ty >> 4);
    return !!ch.solid[(ty & 15) * CHUNK + (tx & 15)];
  }
  nodeAt(tx, ty) {
    const ch = this.getChunk(tx >> 4, ty >> 4);
    return ch.nodes.get((tx & 15) + ',' + (ty & 15)) || null;
  }
  objAt(tx, ty) {
    const ch = this.chunks.get((tx >> 4) + ',' + (ty >> 4));
    if (!ch) return null;
    return ch.objs.find(o => o.lx === (tx & 15) && o.ly === (ty & 15)) || null;
  }
  /** 收集附近可交互对象（含采集点） */
  objectsNear(tx, ty, rad) {
    const out = [];
    for (let cx = (tx - rad) >> 4; cx <= ((tx + rad) >> 4); cx++) {
      for (let cy = (ty - rad) >> 4; cy <= ((ty + rad) >> 4); cy++) {
        const ch = this.getChunk(cx, cy);
        for (const o of ch.objs) {
          const gx = cx * CHUNK + o.lx, gy = cy * CHUNK + o.ly;
          if (Math.abs(gx - tx) <= rad && Math.abs(gy - ty) <= rad) out.push({ o: o, tx: gx, ty: gy });
        }
      }
    }
    return out;
  }
  nearestNode(tx, ty, rad) {
    let best = null, bd = 1e9;
    const list = this.objectsNear(tx, ty, rad);
    for (const it of list) {
      if (!it.o.node || it.o.node.amount <= 0) continue;
      const dd = dist(it.tx, it.ty, tx, ty);
      if (dd < bd) { bd = dd; best = { node: it.o.node, obj: it.o, tx: it.tx, ty: it.ty, d: dd }; }
    }
    return bd <= rad ? best : null;
  }
  /** 采集一次：返回本次是否成功 */
  takeNode(nd, n) {
    nd.amount -= (n || 1);
    if (nd.amount <= 0) {
      nd.amount = 0; nd.respawnAt = Date.now() + T_NODE_RESPAWN;
      const ch = this.chunks.get((nd.tx >> 4) + ',' + (nd.ty >> 4));
      if (ch) ch.canvas = null; // 触发重绘（物件消失）
    }
  }
  /** 随机找一处适合刷怪的空地 */
  randomFreeTile(tx, ty, rad, tries) {
    for (let i = 0; i < (tries || 30); i++) {
      const a = rnd(0, 6.283), d = rnd(2, rad);
      const nx = Math.round(tx + Math.cos(a) * d), ny = Math.round(ty + Math.sin(a) * d);
      if (nx < 0 || ny < 0 || nx >= WORLD_SIZE || ny >= WORLD_SIZE) continue;
      if (!this.solidTile(nx, ny)) return { x: nx, y: ny };
    }
    return null;
  }

  update(dt) {
    const now = Date.now();
    for (const ch of this.chunks.values()) {
      for (const nd of ch.nodes.values()) {
        if (nd.amount <= 0 && nd.respawnAt && now >= nd.respawnAt) {
          nd.amount = nd.max; nd.respawnAt = 0; nd.dead = 0;
        }
      }
    }
  }

  /* ---------- 渲染 ---------- */
  chunkCanvas(ch, regionKeyFallback) {
    if (ch.canvas) return ch.canvas;
    const px = CHUNK * TILE_PX;
    const o = CV(px, px), x = o.x;
    const useAsset = Assets.ready;
    /* 预先取好含一圈邻居的地形信息，供基础贴图与细节层共用（避免重复计算噪声） */
    const N = CHUNK + 2, grid = new Array(N * N);
    for (let j = -1; j <= CHUNK; j++) {
      for (let i = -1; i <= CHUNK; i++) {
        grid[(j + 1) * N + (i + 1)] = this.tileInfo(ch.cx * CHUNK + i, ch.cy * CHUNK + j);
      }
    }
    const at = (i, j) => grid[clamp(j + 1, 0, N - 1) * N + clamp(i + 1, 0, N - 1)];

    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = ch.cx * CHUNK + lx, ty = ch.cy * CHUNK + ly;
        const info = at(lx, ly);
        const pal = info.r.pal;
        const seed = Math.abs(tx * 73856093 ^ ty * 19349663);
        const kind = info.water ? 'water' : info.mountain ? 'mount' : 'ground';
        /* 6 种变体按坐标哈希取用，避免大片地表看起来一模一样 */
        const hv = Math.floor(hash2(tx, ty, this.seed + 91) * 6) % 6;
        let sp = useAsset ? Assets.tile(info.r.key, kind, seed + hv) : null;
        if (!sp) {
          sp = info.water ? Sprites.waterTile(info.r.key, pal, hv % 3)
            : info.mountain ? Sprites.mountainTile(info.r.key, pal)
              : Sprites.groundTile(info.r.key, pal, Math.abs(tx * 7 + ty * 13), hv);
        }
        x.drawImage(sp, lx * TILE_PX, ly * TILE_PX);
      }
    }
    this.paintDetails(x, ch, at, useAsset);
    // 物件：按 y 排序保证遮挡正确
    for (const ob of ch.objs) {
      if (ob.node && ob.node.amount <= 0) continue;      // 已采尽：不绘制
      if (ob.kind === 'chest' && ob.opened) continue;
      const dx = ob.lx * TILE_PX + (ob.ox || 0);
      const dy = ob.ly * TILE_PX + TILE_PX - ob.sp.height + (ob.oy || 0);
      x.drawImage(ob.sp, dx, dy);
    }
    ch.canvas = o.c;
    return ch.canvas;
  }
  /** 地表细节层：山体投影 / 岸线浅滩 / 山脚碎石 / 区域过渡 / 高低明暗 / 微噪点
   *  只在区块烘焙时执行一次，不增加运行时开销 */
  paintDetails(x, ch, at, useAsset) {
    const T = TILE_PX, seed = this.seed;
    const strip = (px, py, side, col, w) => {
      x.fillStyle = col;
      if (side === 'n') x.fillRect(px, py, T, w);
      else if (side === 's') x.fillRect(px, py + T - w, T, w);
      else if (side === 'w') x.fillRect(px, py, w, T);
      else x.fillRect(px + T - w, py, w, T);
    };
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const c = at(lx, ly), pal = c.r.pal;
        const n = at(lx, ly - 1), s = at(lx, ly + 1), w = at(lx - 1, ly), e = at(lx + 1, ly);
        const px = lx * T, py = ly * T;
        const tx = ch.cx * CHUNK + lx, ty = ch.cy * CHUNK + ly;

        /* 1) 高低明暗：假设光来自西北，用高度梯度做柔和高光/阴影 */
        if (!c.water) {
          const dh = (e.h - w.h) + (s.h - n.h);
          const lit = clamp(-dh * 2.6, -1, 1);
          if (lit > 0.02) { x.fillStyle = 'rgba(255,255,255,' + (lit * 0.13).toFixed(3) + ')'; x.fillRect(px, py, T, T); }
          else if (lit < -0.02) { x.fillStyle = 'rgba(0,0,0,' + (-lit * 0.12).toFixed(3) + ')'; x.fillRect(px, py, T, T); }
        }

        /* 2) 山体：投影、边缘明暗、山脚碎石过渡 */
        if (c.mountain) {
          if (!s.mountain) { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(px, py + T - 4, T, 4); }
          if (!n.mountain) strip(px, py, 'n', 'rgba(255,255,255,.10)', 3);
          if (!w.mountain) strip(px, py, 'w', 'rgba(0,0,0,.14)', 3);
          if (!e.mountain) strip(px, py, 'e', 'rgba(0,0,0,.10)', 3);
        } else if (!c.water && (n.mountain || w.mountain || e.mountain)) {
          if (n.mountain) { x.fillStyle = 'rgba(0,0,0,.20)'; x.fillRect(px, py, T, 6); }
          const rc = pal.rock || pal.mountain;
          x.globalAlpha = 0.30;
          if (n.mountain) x.fillRect(px + ((tx * 7 + ty) % 5), py, 6, 2);
          if (w.mountain) x.fillRect(px, py + ((tx * 5 + ty * 3) % 20), 2, 6);
          if (e.mountain) x.fillRect(px + T - 2, py + ((tx * 3 + ty * 7) % 20), 2, 6);
          x.globalAlpha = 1;
        }

        /* 3) 水体：深水更暗 + 临岸浅滩与浪花；陆地：邻水沙滩与泡沫 */
        if (c.water) {
          const deep = clamp((0.20 - c.h) / 0.20, 0, 1);
          if (deep > 0.05) { x.fillStyle = 'rgba(0,0,0,' + (deep * 0.28).toFixed(3) + ')'; x.fillRect(px, py, T, T); }
          const shallow = shade(pal.water, 46);
          if (!n.water) { strip(px, py, 'n', 'rgba(255,255,255,.14)', 5); strip(px, py, 'n', shallow, 2); }
          if (!s.water) { strip(px, py, 's', 'rgba(255,255,255,.10)', 5); strip(px, py, 's', shallow, 2); }
          if (!w.water) { strip(px, py, 'w', 'rgba(255,255,255,.12)', 4); strip(px, py, 'w', shallow, 2); }
          if (!e.water) { strip(px, py, 'e', 'rgba(255,255,255,.12)', 4); strip(px, py, 'e', shallow, 2); }
        } else {
          const beach = pal.sand || pal.dirt || shade(pal.ground[0], 20);
          if (n.water) { strip(px, py, 'n', beach, 4); strip(px, py, 'n', 'rgba(255,255,255,.20)', 2); }
          if (s.water) { strip(px, py, 's', beach, 4); strip(px, py, 's', 'rgba(255,255,255,.16)', 2); }
          if (w.water) { strip(px, py, 'w', beach, 3); strip(px, py, 'w', 'rgba(255,255,255,.16)', 2); }
          if (e.water) { strip(px, py, 'e', beach, 3); strip(px, py, 'e', 'rgba(255,255,255,.16)', 2); }
        }

        /* 4) 区域过渡：邻格属于别的大区时做柔和渗透，消除生硬直线边界 */
        if (!c.water && !c.mountain) {
          const sides = [[n, 'n'], [s, 's'], [w, 'w'], [e, 'e']];
          for (let i = 0; i < sides.length; i++) {
            const oi = sides[i][0], side = sides[i][1];
            if (oi.r.key === c.r.key || oi.water) continue;
            const col = oi.r.pal.ground[0];
            x.globalAlpha = 0.26; strip(px, py, side, col, 6);
            x.globalAlpha = 0.14; strip(px, py, side, col, 11);
            x.globalAlpha = 1;
          }
        }

        /* 5) 微噪点：程序化贴图时补一层细碎质感，避免整片重复 */
        if (!useAsset && !c.water) {
          const cnt = 2 + Math.floor(hash2(tx, ty, seed + 555) * 3);
          for (let i = 0; i < cnt; i++) {
            const a = hash2(tx * 13 + i, ty * 7 + i * 3, seed + 77);
            const b = hash2(tx * 5 + i * 11, ty * 17 + i, seed + 99);
            x.fillStyle = a > b ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)';
            x.fillRect(px + Math.floor(a * (T - 2)), py + Math.floor(b * (T - 1)), 2, 1);
          }
        }
      }
    }
  }

  draw(ctx, cam) {
    const c0 = Math.floor(cam.x / (CHUNK * TILE_PX)) - 1, c1 = Math.floor((cam.x + cam.w) / (CHUNK * TILE_PX)) + 1;
    const r0 = Math.floor(cam.y / (CHUNK * TILE_PX)) - 1, r1 = Math.floor((cam.y + cam.h) / (CHUNK * TILE_PX)) + 1;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= WORLD_SIZE || cy * CHUNK >= WORLD_SIZE) continue;
        const ch = this.getChunk(cx, cy);
        const cv = this.chunkCanvas(ch);
        ctx.drawImage(cv, cx * CHUNK * TILE_PX, cy * CHUNK * TILE_PX);
        // 采集点消耗后绘制残影
        for (const [k, nd] of ch.nodes) {
          if (nd.amount <= 0) continue;
        }
      }
    }
  }
  /** 卸载远离的区块（防止内存上涨） */
  unloadFar(tx, ty, radTiles) {
    for (const [k, ch] of this.chunks) {
      const cx = ch.cx, cy = ch.cy;
      const dx = Math.abs(cx * CHUNK - tx), dy = Math.abs(cy * CHUNK - ty);
      if (dx > radTiles + CHUNK * 2 || dy > radTiles + CHUNK * 2) {
        if (ch.canvas) { ch.canvas.width = 0; ch.canvas = null; }
      }
    }
  }
}
function v0(n) { return Math.abs(Math.floor(n)) % 3; }
