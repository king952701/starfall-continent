/* ============================================================
 * 13_home.js —— 家园（独立实例空间）：种植 + 渔场 + 传送
 * 家园为 60×60 格的私人维度，不占用大地图任何面积（V0.4 方案）
 * ==========================================================*/
'use strict';

const HOME_SIZE = 60;
const HOME_TIME_SCALE = 8;   // 现实 1 分钟 = 游戏 8 秒
const HOME_LEVELS = [
  { name: '小屋', size: 60, plots: 6, fish: 5, cost: 0 },
  { name: '农舍', size: 60, plots: 12, fish: 10, cost: 50000 },
  { name: '宅院', size: 60, plots: 24, fish: 20, cost: 200000 },
  { name: '庄园', size: 60, plots: 40, fish: 40, cost: 500000 },
  { name: '城堡', size: 60, plots: 60, fish: 80, cost: 2000000 }
];
/** 渔场产出池：按鱼品质产出对应材料 */
const POND_MATS = [
  null,
  [4304, 4301], [4301, 4302], [4302, 4303], [4301, 4314],
  [4303, 4313], [4313, 4307], [4307, 4308], [4308, 4309], [4310, 4311], [4310, 4312]
];

class Home {
  constructor(owner) {
    this.owner = owner || '';
    this.level = 0;
    this.plots = [];       // {x,y,crop,t0,growSec,watered,stage}
    this.fish = [];        // {id,q,t}
    this.pending = [];     // 待收取产物
    this.portal = { x: 30, y: 54 };
    this.house = { x: 8, y: 8, w: 3, h: 2 };
    this.pond = { x: 34, y: 14, w: 20, h: 12 };
    this.createPlots();
  }
  get cfg() { return HOME_LEVELS[this.level]; }
  createPlots() {
    const need = this.cfg.plots;
    while (this.plots.length < need) {
      const i = this.plots.length;
      this.plots.push({ x: 8 + (i % 8) * 2, y: 22 + Math.floor(i / 8) * 2, crop: null, t0: 0, growSec: 0, watered: false, stage: 0 });
    }
  }
  upgrade(game) {
    if (this.level >= HOME_LEVELS.length - 1) { game.toast('已达最高级', '#ff9a9a'); return false; }
    const cost = HOME_LEVELS[this.level + 1].cost;
    if (game.player.gold < cost) { game.toast('金币不足：' + fmt(cost), '#ff9a9a'); return false; }
    game.player.gold -= cost; this.level++; this.createPlots();
    game.toast('家园升级为「' + this.cfg.name + '」', '#ffd76a');
    return true;
  }
  /* ---------- 种植 ---------- */
  plant(plot, seedItemId, game) {
    const def = ITEMS[seedItemId];
    if (!def || def.type !== 'seed') return false;
    if (plot.crop) { game.toast('该田地已有作物', '#ff9a9a'); return false; }
    plot.crop = seedItemId; plot.t0 = Date.now(); plot.watered = false;
    plot.growSec = (def.growMin || 5) * HOME_TIME_SCALE;
    if (!game.player.removeItem(seedItemId, 1)) { plot.crop = null; return false; }
    game.floatTextAt(plot.x * TILE_PX, plot.y * TILE_PX, '播种 ' + def.name, '#9fd06a');
    return true;
  }
  water(plot, game) {
    if (!plot.crop || plot.watered) return false;
    if (!game.player.countItem(4315)) { game.toast('需要清水', '#ff9a9a'); return false; }
    game.player.removeItem(4315, 1);
    plot.watered = true; plot.t0 -= plot.growSec * 0.15 * 1000;
    game.floatTextAt(plot.x * TILE_PX, plot.y * TILE_PX, '浇水', '#7fcfff');
    return true;
  }
  harvest(plot, game) {
    if (!plot.crop) return false;
    const sec = (Date.now() - plot.t0) / 1000;
    if (sec < plot.growSec) { game.toast('尚未成熟', '#ff9a9a'); return false; }
    const seedDef = ITEMS[plot.crop];
    const cropDef = ITEMS[seedDef.cropId];
    let n = 1 + Math.floor(rnd(0, 2.99));
    if (plot.watered) n += 1;
    let q = 2 + (chance(0.05 + game.player.stats.gatherPct / 200) ? 1 : 0);
    if (chance(0.05)) { q++; n += 1; game.toast('变异作物！', '#9fd06a'); }
    const left = game.player.addItem(cropDef.id, n, clamp(q, 1, 10));
    if (left) game.toast('背包已满', '#ff9a9a');
    game.player.addLifeExp('log', 3);
    const hs = game.player.life.log;              // 家园收获同样计入伐木 / 采集榜
    hs.cnt = (hs.cnt || 0) + 1;
    hs.val = (hs.val || 0) + itemPrice({ id: cropDef.id, q: q }) * (n - left);
    if (q > (hs.best || 0)) { hs.best = q; hs.bestName = getQuality(q).name + cropDef.name; }
    game.floatTextAt(plot.x * TILE_PX, plot.y * TILE_PX, cropDef.name + ' ×' + (n - left), '#cfe86a');
    plot.crop = null; plot.watered = false;
    return true;
  }
  progress(plot) {
    if (!plot.crop) return 0;
    const sec = (Date.now() - plot.t0) / 1000;
    return clamp(sec / plot.growSec, 0, 1);
  }
  /* ---------- 渔场 ---------- */
  putFish(plot) { return null; }
  addFish(inst, game) {
    if (this.fish.length >= this.cfg.fish) { game.toast('渔场已满', '#ff9a9a'); return false; }
    if (!game.player.removeAt(game.selectedBagIndex, 1)) return false;
    this.fish.push({ id: inst.id, q: inst.q, t: Date.now() });
    game.floatTextAt((this.pond.x + 10) * TILE_PX, (this.pond.y + 6) * TILE_PX, '投放 ' + ITEMS[inst.id].name, '#9fe8ff');
    return true;
  }
  collectPond(game) {
    if (!this.pending.length) { game.toast('暂无产出', '#ff9a9a'); return false; }
    let n = 0;
    this.pending.forEach(p => { if (!game.player.addItem(p.id, p.n, p.q)) n++; });
    this.pending = [];
    game.floatTextAt((this.pond.x + 10) * TILE_PX, (this.pond.y + 6) * TILE_PX, '收取 ' + n + ' 类产物', '#cfe86a');
    return true;
  }
  update(dt) {
    const now = Date.now();
    for (const f of this.fish) {
      if (now - f.t < 25000) continue;
      f.t = now;
      const pool = POND_MATS[clamp(f.q, 1, 10)] || POND_MATS[2];
      const id = choice(pool);
      const n = 1 + Math.floor(f.q / 5);
      const ex = this.pending.find(p => p.id === id && p.q === f.q);
      if (ex) ex.n += n; else this.pending.push({ id: id, q: clamp(f.q, 1, 10), n: n });
    }
  }
  /* ---------- 地形与渲染 ---------- */
  tileKind(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= HOME_SIZE || ty >= HOME_SIZE) return 'fence';
    const p = this.pond;
    if (tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) return 'water';
    for (const pl of this.plots) if (pl.x === tx && pl.y === ty) return 'soil';
    if (tx >= this.house.x && tx < this.house.x + this.house.w && ty >= this.house.y && ty < this.house.y + this.house.h) return 'house';
    return 'grass';
  }
  draw(ctx, cam) {
    const grassPal = { ground: ['#5c8a45', '#6b9a4f', '#548040'], grass: '#8fc45a', water: '#3f7fa8', tree: { leaf: '#3f7a3a', trunk: '#5b3f27' }, mountain: '#6b6b60', flower: ['#ffd76a'], rock: '#7d7d86' };
    for (let ty = 0; ty < HOME_SIZE; ty++) {
      for (let tx = 0; tx < HOME_SIZE; tx++) {
        const px = tx * TILE_PX, py = ty * TILE_PX;
        if (px + TILE_PX < cam.x || py + TILE_PX < cam.y || px > cam.x + cam.w || py > cam.y + cam.h) continue;
        const k = this.tileKind(tx, ty);
        if (k === 'water') ctx.drawImage(Sprites.waterTile('home', grassPal, (Math.floor(Date.now() / 500) + tx) % 3), px, py);
        else if (k === 'soil') {
          ctx.drawImage(Sprites.groundTile('home', grassPal, tx * 13 + ty * 7, 0), px, py);
          ctx.drawImage(Sprites.rock('home', grassPal, 1), px, py);
        } else if (k === 'fence') ctx.drawImage(Sprites.mountainTile('home', grassPal), px, py);
        else ctx.drawImage(Sprites.groundTile('home', grassPal, tx * 13 + ty * 7, (tx + ty) % 3), px, py);
      }
    }
    // 建筑
    const hs = Sprites.house(this.house.w, this.house.h, grassPal, 1);
    ctx.drawImage(hs, this.house.x * TILE_PX, this.house.y * TILE_PX + TILE_PX - hs.height);
    // 传送门
    const pv = Sprites.portal();
    ctx.drawImage(pv, this.portal.x * TILE_PX - 8, this.portal.y * TILE_PX + TILE_PX - pv.height);
    // 作物
    for (const pl of this.plots) {
      if (!pl.crop) continue;
      const pr = this.progress(pl);
      const stage = pr >= 1 ? 3 : pr > .6 ? 2 : pr > .25 ? 1 : 0;
      const cropDef = ITEMS[ITEMS[pl.crop].cropId];
      const col = cropDef.color;
      const cx = pl.x * TILE_PX + 16, cy = pl.y * TILE_PX + 20;
      if (stage === 0) { ctx.fillStyle = '#4a3a28'; ctx.fillRect(cx - 3, cy, 6, 3); }
      else if (stage === 1) { const sp = Sprites.herbNode('#7fbf6f', 1); ctx.drawImage(sp, pl.x * TILE_PX, pl.y * TILE_PX + 8, 32, 32); }
      else if (stage === 2) { const sp = Sprites.herbNode(col, 2); ctx.drawImage(sp, pl.x * TILE_PX, pl.y * TILE_PX + 4, 32, 32); }
      else {
        const sp = Sprites.icon({ id: cropDef.id, q: 3, type: 'crop' });
        ctx.drawImage(sp, cx - 16, cy - 30, 32, 32);
        ctx.fillStyle = '#ffe36a'; ctx.font = '10px sans-serif';
        ctx.fillText('可收获', cx - 14, cy - 34);
      }
    }
    // 鱼的显示
    this.fish.forEach((f, i) => {
      const fx = (this.pond.x + 2 + (i % 6) * 3) * TILE_PX, fy = (this.pond.y + 2 + Math.floor(i / 6) * 3) * TILE_PX;
      const sp = Sprites.icon({ id: f.id, q: f.q, type: 'mat' });
      const bob = Math.sin(Date.now() / 400 + i) * 3;
      ctx.drawImage(sp, fx, fy + bob, 24, 24);
    });
    if (this.pending.length) {
      ctx.fillStyle = '#ffe36a'; ctx.font = '12px sans-serif';
      ctx.fillText('◈ 渔场有产物可收取', (this.pond.x) * TILE_PX, (this.pond.y - 1) * TILE_PX);
    }
  }
}
