/* ============================================================
 * 00_assets.js —— 开源瓦片美术素材（Kenney RPG Base, CC0）
 * assets/tiles/ 下的 grass / sand / snow / stone / water 五类瓦片，
 * 按区域做「乘法染色 + 压暗」派生出 草原 / 雪林 / 黄沙 / 荒漠 /
 * 岩石遗迹 / 深渊 / 河流 / 海洋 等截然不同的地貌。
 * 素材尚未就绪时，地形绘制自动回退到 08_sprites.js 的程序化贴图。
 * ==========================================================*/
'use strict';

const TILE_PLAN = {
  plain: { ground: ['grass', '#ffffff', 0], water: ['water', '#cfeaff', 0], mount: ['stone', '#a8a898', 0.10] },
  forest: { ground: ['grass', '#8ac48f', 0.16], water: ['water', '#9fd0b8', 0.10], mount: ['stone', '#7f8f7f', 0.25] },
  desert: { ground: ['sand', '#ffe9c0', 0], water: ['water', '#ffb060', 0.05], mount: ['stone', '#c08a5a', 0.10] },
  snow: { ground: ['snow', '#ffffff', 0], water: ['water', '#bfe8ff', 0], mount: ['stone', '#cfd8e8', 0.06] },
  abyss: { ground: ['stone', '#7a68a8', 0.38], water: ['water', '#8a6ac8', 0.30], mount: ['stone', '#584a7a', 0.45] },
  ruin: { ground: ['stone', '#c8bcd8', 0.10], water: ['water', '#9ff0ff', 0], mount: ['stone', '#a89ac8', 0.20] },
  waste: { ground: ['sand', '#b9a488', 0.12], water: ['water', '#8fa8a8', 0.10], mount: ['stone', '#9a9484', 0.18] },
  sea: { ground: ['sand', '#e8dfae', 0], water: ['water', '#86c8f0', 0], mount: ['stone', '#a8b8c0', 0.10] }
};

const Assets = {
  dir: 'assets/tiles/',
  counts: { grass: 8, sand: 10, water: 5, snow: 8, stone: 8 },
  imgs: {}, cache: {}, ready: false, loaded: 0, total: 0, failed: false,

  /** 预加载全部瓦片（异步），完成后调用 cb */
  load(cb) {
    const list = [];
    for (const cls in this.counts) for (let i = 0; i < this.counts[cls]; i++) list.push(cls + '_' + i + '.png');
    this.total = list.length; this.loaded = 0;
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      this.ready = !this.failed && this.loaded > 0;
      cb && cb(this.ready);
    };
    if (!list.length) return finish();
    let timer = setTimeout(finish, 4000); // 兜底：4 秒内必定放行
    for (const f of list) {
      const cls = f.split('_')[0];
      const img = new Image();
      img.onload = () => {
        (this.imgs[cls] = this.imgs[cls] || []).push(img);
        this.loaded++;
        if (this.loaded === list.length) { clearTimeout(timer); finish(); }
      };
      img.onerror = () => {
        this.failed = true; this.loaded++;
        if (this.loaded === list.length) { clearTimeout(timer); finish(); }
      };
      img.src = this.dir + f;
    }
  },

  /** 原始（未染色、已缩放到 TILE_PX）瓦片 */
  raw(cls, idx) {
    const arr = this.imgs[cls];
    if (!arr || !arr.length) return null;
    const im = arr[Math.abs(idx) % arr.length];
    const k = 'raw|' + cls + '|' + arr.indexOf(im);
    if (this.cache[k]) return this.cache[k];
    const o = CV(TILE_PX, TILE_PX);
    o.x.drawImage(im, 0, 0, TILE_PX, TILE_PX);
    this.cache[k] = o.c;
    return o.c;
  },

  /** 按区域 + 用途取一块瓦片敷色后的贴图；素材缺失返回 null（由调用方回退） */
  tile(regionKey, kind, seed) {
    if (!this.ready) return null;
    const plan = TILE_PLAN[regionKey] || TILE_PLAN.plain;
    const cfg = plan[kind] || plan.ground;
    const cls = cfg[0], mult = cfg[1], dark = cfg[2];
    const arr = this.imgs[cls];
    if (!arr || !arr.length) return null;
    const n = arr.length;
    const idx = Math.abs(Math.floor(seed || 0)) % n;
    return this.variant(cls, idx, mult, dark);
  },

  variant(cls, idx, mult, dark) {
    const key = cls + idx + '|' + mult + '|' + dark;
    if (this.cache[key]) return this.cache[key];
    const src = this.raw(cls, idx);
    if (!src) return null;
    const o = CV(TILE_PX, TILE_PX), x = o.x;
    x.drawImage(src, 0, 0);
    if (mult && mult !== '#ffffff') {
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = mult; x.fillRect(0, 0, TILE_PX, TILE_PX);
      x.globalCompositeOperation = 'source-over';
    }
    if (dark > 0) { x.fillStyle = 'rgba(0,0,0,' + dark + ')'; x.fillRect(0, 0, TILE_PX, TILE_PX); }
    this.cache[key] = o.c;
    return o.c;
  },

  /** UI 预览用：取某区域某用途的一块样例瓦片 */
  preview(regionKey, kind) { return this.tile(regionKey, kind, 3) || null; }
};
