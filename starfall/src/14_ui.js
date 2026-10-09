/* ============================================================
 * 14_ui.js —— HUD / 背包 / 角色 / 制作 / 天赋 / 地图 / 成就 面板
 * ==========================================================*/
'use strict';

/* ---------------- 成就 ---------------- */
const ACHIEVEMENTS = [
  { id: 1, cat: '战斗', name: '初出茅庐', desc: '击杀第 1 只怪物', target: 1, get: p => p.stat.kills, exp: 100 },
  { id: 2, cat: '战斗', name: '百战勇士', desc: '累计击杀 1000 只怪物', target: 1000, get: p => p.stat.kills, gear: { q: 5 }, dia: 100 },
  { id: 3, cat: '战斗', name: '屠龙者', desc: '击杀 BOSS 10 次', target: 10, get: p => p.stat.boss, gear: { q: 6 } },
  { id: 4, cat: '战斗', name: '连击大师', desc: '单次连击达到 50', target: 50, get: p => p.stat.maxCombo, dia: 500 },
  { id: 5, cat: '探索', name: '初来乍到', desc: '解锁第 1 个区域', target: 1, get: p => Object.keys(p.unlockedRegions).length, exp: 200 },
  { id: 6, cat: '探索', name: '大陆巡游者', desc: '解锁 6 个区域', target: 6, get: p => Object.keys(p.unlockedRegions).length, gold: 50000, gear: { q: 7 } },
  { id: 7, cat: '探索', name: '宝藏猎人', desc: '开启 100 个宝箱', target: 100, get: p => p.stat.chests, gear: { q: 8 } },
  { id: 8, cat: '探索', name: '星核收集者', desc: '收集 50 个星核碎片', target: 50, get: p => p.countItem(4310), gear: { q: 9 } },
  { id: 9, cat: '生活', name: '矿工入门', desc: '采矿等级达到 10', target: 10, get: p => p.life.mine.lv, gold: 20000 },
  { id: 10, cat: '生活', name: '锻造大师', desc: '制作 500 件物品', target: 500, get: p => p.stat.crafts, gear: { q: 7 } },
  { id: 11, cat: '生活', name: '百万富翁', desc: '持有 100 万金币', target: 1000000, get: p => p.gold, dia: 1000 },
  { id: 12, cat: '生活', name: '钓鱼达人', desc: '钓上 30 条鱼', target: 30, get: p => p.stat.fish, gold: 30000, gear: { q: 6 } },
  { id: 13, cat: '社交', name: '星级矿工', desc: '采集 500 次', target: 500, get: p => p.stat.gathers, gold: 30000 }
];
const Ach = {
  done: {}, claimed: {},
  check(game) {
    const p = game.player;
    for (const a of ACHIEVEMENTS) {
      if (this.done[a.id]) continue;
      if (a.get(p) >= a.target) {
        this.done[a.id] = 1;
        this.claimed[a.id] = 1;
        let msg = '成就达成：' + a.name + ' ';
        if (a.exp) { p.addExp(a.exp, game); msg += '+' + a.exp + '经验 '; }
        if (a.gold) { p.gold += a.gold; msg += '+' + fmt(a.gold) + '金币 '; }
        if (a.dia) { p.diamond += a.dia; msg += '+' + a.dia + '钻石 '; }
        if (a.gear) {
          const g = rollEquipDrop(clamp(p.lv + 3, 1, 60), a.gear.q >= 8 ? 'world' : 'boss');
          const i2 = newGear(ITEMS[g.id].id, p.lv, a.gear.q, 0);
          if (!p.addInstance(i2)) { msg += '(背包已满) '; }
          msg += '获得装备 ';
        }
        UI.toast('★ ' + a.name, '#ffd76a');
        UI.log('【成就】' + a.name + ' — ' + msg);
      }
    }
  },
  serialize() { return { done: this.done, claimed: this.claimed }; },
  load(d) { if (d) { this.done = d.done || {}; this.claimed = d.claimed || {}; } }
};

/* ---------------- UI 主体 ---------------- */
const UI = {
  game: null, panels: {}, keysHeld: {},
  init(game) {
    this.game = game;
    this.elLog = $('log'); this.elTip = $('tooltip'); this.elRoot = $('panelRoot');
    this.elToast = $('toastWrap');
    this.buildSkillBar();
    this.buildChat();
    /* 聊天窗：消息区 / 输入区 上下可拖拽（静态 DOM，初始化时挂一次） */
    if (typeof Splitter !== 'undefined') {
      const cw = $('chatWrap');
      const msgs = $('chatMsgs'), row = $('chatRow');
      if (cw && msgs && row && !cw._spChat) {
        cw._spChat = Splitter.attach(cw, {
          dir: 'y', key: 'chat.main', a: msgs, b: row,
          min1: 90, max1: 640, min2: 34, def: 0.80
        });
      }
    }
    $('hud').classList.remove('hide');
    window.addEventListener('resize', () => this.fitPanels());   // 旋屏 / 窗口变化时重新居中缩放
    // 任意操作都重置「10 秒无操作自动关闭」计时
    ['mousedown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, () => this.touch(), { passive: true }));
  },
  log(t, color) {
    if (!this.elLog) return;
    const d = el('div', '', t);
    if (color) d.style.color = color;
    this.elLog.appendChild(d);
    setTimeout(() => d.remove(), 4000);
    while (this.elLog.children.length > 8) this.elLog.firstChild.remove();
  },
  toast(t, color) {
    const d = el('div', 'toast', t); if (color) d.style.color = color;
    this.elToast.appendChild(d); setTimeout(() => d.remove(), 1600);
  },

  /* ---------- HUD ---------- */
  buildSkillBar() {
    const bar = $('skillbar'); bar.innerHTML = '';
    this.skillEls = [];
    for (let i = 1; i <= 6; i++) {
      const d = el('div', 'sk');
      const cv = document.createElement('canvas'); cv.width = 36; cv.height = 36; cv.className = 'ic';
      d.appendChild(cv);
      d.appendChild(el('div', 'key', String(i)));
      const nm = el('div', 'nm', '');
      d.appendChild(nm);
      const cd = el('div', 'cd hide', '');
      d.appendChild(cd);
      bar.appendChild(d);
      d.onmouseenter = e => {
        const sk = this.game && this.game.player.cls.skills[i - 1];
        if (sk) this.tipSkill(sk, this.game.player, e.clientX, e.clientY);
      };
      d.onmousemove = e => {
        const sk = this.game && this.game.player.cls.skills[i - 1];
        if (sk) this.tipSkill(sk, this.game.player, e.clientX, e.clientY);
      };
      d.onmouseleave = () => this.tipHide('skill');
      this.skillEls.push({ root: d, cv: cv, nm: nm, cd: cd, ctx: cv.getContext('2d'), idx: i });
    }
  },
  refresh() {
    const g = this.game, p = g.player;
    if (!p) return;
    const tAcademic = Math.floor(Date.now() / 100);
    $('pName').textContent = p.name + ' · ' + p.cls.name;
    $('pLv').textContent = 'Lv.' + p.lv;
    $('bhp').style.width = (p.hp / p.maxHp * 100) + '%';
    $('bhptxt').textContent = Math.round(p.hp) + ' / ' + Math.round(p.maxHp);
    $('bmp').style.width = (p.mp / p.maxMp * 100) + '%';
    $('bmptxt').textContent = Math.round(p.mp) + ' / ' + Math.round(p.maxMp);
    const need = expToNext(p.lv);
    $('bxp').style.width = clamp(p.exp / need * 100, 0, 100) + '%';
    $('bxptxt').textContent = fmt(p.exp) + ' / ' + fmt(need);
    $('gGold').textContent = '金 ' + fmt(p.gold);
    $('gDia').textContent = '钻 ' + fmt(p.diamond);
    $('gCombat').textContent = '战力 ' + fmt(p.power || 0);
    // Buff
    const bw = $('buffs');
    const sig = p.buffs.list.map(b => b.id + Math.ceil(b.t)).join(',');
    if (bw.dataset.sig !== sig) {
      bw.dataset.sig = sig; bw.innerHTML = '';
      p.buffs.list.slice(0, 10).forEach(b => {
        const d = BUFFS[b.id];
        /* timer=false 的状态类效果（如「游泳」）不显示倒计时 */
        const e = el('div', 'bf' + (d.type === 'debuff' ? ' bad' : ''),
          d.icon + (d.timer === false ? '' : '<i>' + Math.ceil(b.t) + '</i>'));
        e.setAttribute('aria-label', d.name + '：' + d.desc);
        this.bindBuffTip(e, b, d);
        bw.appendChild(e);
        /* 图标每秒重建：若面板正开着同一个效果，重建后保持显示（不重置 3s 计时） */
        if (this._buffHoverId === b.id) this.showBuffTip(e, b, d, true);
      });
    }
    // 技能栏
    const cls = p.cls;
    for (let i = 0; i < 6; i++) {
      const s = this.skillEls[i], sk = cls.skills[i];
      if (!sk) continue;
      if (s.nm.dataset.id !== String(sk.id)) {
        s.nm.dataset.id = String(sk.id);
        s.ctx.clearRect(0, 0, 36, 36);
        s.ctx.drawImage(Sprites.skillIcon(sk.icon), 2, 2, 32, 32);
        s.nm.textContent = sk.name;
      }
      const locked = p.lv < sk.lv;
      s.root.classList.toggle('lock', locked);
      const cur = p.cds[sk.id] || 0;
      if (cur > 0) { s.cd.classList.remove('hide'); s.cd.textContent = cur.toFixed(1); s.root.classList.remove('ready'); }
      else { s.cd.classList.add('hide'); s.root.classList.toggle('ready', !locked && p.mp >= sk.mp); }
    }
    // 区域
    if (tAcademic !== this._tick) {
      this._tick = tAcademic;
      const tile = { tx: Math.floor(p.x / TILE_PX), ty: Math.floor(p.y / TILE_PX) };
      const r = g.inHome ? { name: '私人家园' } : regionAtTile(tile.tx, tile.ty);
      $('regionName').textContent = r.name;
      $('coord').textContent = g.inHome ? '实例空间' : (tile.tx + ', ' + tile.ty);
      /* 天气 + 时段（HUD 左上，和区域信息同频刷新） */
      if (typeof Weather !== 'undefined') {
        const wEl = $('weather');
        if (wEl) {
          const wt = Weather.hud();
          if (wEl.textContent !== wt.t) { wEl.textContent = wt.t; wEl.style.color = wt.c; }
        }
      }
      const cl = $('clock');
      if (cl) {
        const DAY = 480, ph = ((g.timeSec % DAY) + DAY) % DAY / DAY;
        const hh = Math.floor(ph * 24), mm = Math.floor((ph * 24 % 1) * 60);
        const pd = g.inHome ? '家园' : (ph < 0.06 || ph > 0.94 ? '黎明' : ph < 0.42 ? '白昼' : ph < 0.62 ? '黄昏' : '夜晚');
        const s = pd + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
        if (cl.textContent !== s) cl.textContent = s;
      }
      if (this.panels.bag) this.refreshBag();
    }
    // 目标
    const tgt = g.targetMonster;
    if (tgt && !tgt.dead) {
      $('enemyBar').classList.remove('hide');
      $('ebName').textContent = 'Lv.' + tgt.lv + ' ' + tgt.name + (tgt.title ? ' [' + tgt.title + ']' : '');
      $('ebHp').style.width = clamp(tgt.hp / tgt.maxHp * 100, 0, 100) + '%';
    } else $('enemyBar').classList.add('hide');
  },

  /* ---------- Tooltip ---------- */
  tipInst(inst, x, y, owner) {
    if (!inst) { this.tipHide(owner); return; }
    const _k = 'inst:' + (inst.uid || 0) + ':' + inst.id + ':' + inst.q + ':' + inst.enhance;
    if (this.tipReuse(_k, x, y)) return;
    let html = '';
    const q = getQuality(inst.q);
    html += '<div class="tn" style="color:' + q.color + '">' + itemFullLabel(inst) + '</div>';
    html += '<div class="tq">' + q.name + ' · ' + (inst.type === 'gear' ? SLOT_CN[ITEMS[inst.id].slot] + ' · 等级需求 ' + inst.lv : (ITEMS[inst.id].sub || '')) + '</div>';
    if (inst.type === 'gear') {
      const def = ITEMS[inst.id];
      html += '<div class="tr s">主属性：' + (def.main === 'atk' ? '攻击 ' : def.main === 'matk' ? '魔攻 ' : def.main === 'acc' ? '全属性 ' : '防御 ') + gearMainStat(inst) + '</div>';
      inst.affix.forEach(a => { html += '<div class="s">· ' + affixText(a) + '</div>'; });
      inst.eff.forEach(e => { html += '<div class="eff">◆ ' + e.name + '：' + e.desc + '</div>'; });
      (inst.holes || []).forEach((g, i) => {
        html += '<div class="s">◇ 孔' + (i + 1) + '：' + (g ? (GEM_MAP[g] ? GEM_MAP[g].label + '（' + gemText(g, inst.lv) + '）' : '?') : '空') + '</div>';
      });
      html += '<div class="mini">强化 +' + inst.enhance + ' / 上限 +' + q.enhCap + '　孔 ' + (inst.holes || []).length + '/' + gearMaxHoles(inst.q) + '　估价 ' + fmt(gearValue(inst)) + ' 金</div>';
      if (!inst._isLink) {
        const rk = gearRank(inst);
        html += '<div class="tr">装备战力 <b style="color:#ff9a9a">' + fmt(gearPower(inst)) + '</b>　装备评分 <b style="color:#ffd76a">' + fmt(gearScore(inst)) + '</b>' +
          '　<b style="color:' + rk.color + '">' + rk.name + '</b></div>';
        const cur = this.game.player.equip[ITEMS[inst.id].slot];
        if (cur && cur !== inst) {
          const cp = gearPower(inst) - gearPower(cur);
          html += '<div class="tr">对比当前装备：战力 <b class="' + (cp >= 0 ? 'ok' : 'bad') + '">' + (cp >= 0 ? '+' : '') + fmt(cp) + '</b></div>';
        }
        html += '<div class="mini">左键查看 / 强化 / 洗练 / 打孔 / 镶嵌 / 对比</div>';
      } else {
        html += '<div class="tr">装备战力 <b style="color:#ff9a9a">' + fmt(gearPower(inst)) + '</b>　装备评分 <b style="color:#ffd76a">' + fmt(gearScore(inst)) + '</b></div>';
        html += '<div class="mini">他人装备链接 · 点击可与已装备对比</div>';
      }
    } else {
      const d = ITEMS[inst.id];
      if (d.desc) html += '<div class="td">' + d.desc + '</div>';
      if (d.type === 'seed') html += '<div class="mini">作物：' + ITEMS[d.cropId].name + '（生长 ' + d.growMin + ' 分钟）</div>';
      itemDetailLines(inst.id).slice(0, 4).forEach(s => { html += '<div class="td">' + s + '</div>'; });
      html += '<div class="mini">单价 ' + fmt(itemPrice(inst)) + ' 金' + (d.toolSpeed ? '　工具效率 ' + d.toolSpeed : '') + '　左键查看物品详情面板</div>';
    }
    this.tipShow(html, x, y, owner);
    this._tipKey = _k;
  },
  tipShow(html, x, y, owner, opt) {
    opt = opt || {};
    this.elTip.innerHTML = html;
    /* 触屏端没有 mouseleave：提示框需要手动关闭，否则会一直留在屏幕上 */
    if (opt.noClose !== true && typeof Mobile !== 'undefined' && Mobile.on) {
      const c = document.createElement('span');
      c.className = 'tipClose';
      c.textContent = '✕ 关闭';
      c.onclick = ev => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (ev && ev.preventDefault) ev.preventDefault();
        this.tipHide(owner);
      };
      this.elTip.insertBefore(c, this.elTip.firstChild);
      if (this._tipT) clearTimeout(this._tipT);
      this._tipT = setTimeout(() => { this._tipT = null; this.tipHide(owner); }, 6000);   // 兜底：6 秒后自动消失
    } else if (opt.fade) {
      /* 定时渐隐消失（Buff 面板：3 秒） */
      if (this._tipT) clearTimeout(this._tipT);
      this._tipT = setTimeout(() => { this._tipT = null; this.tipFade(owner); }, opt.fade);
    }
    this.elTip.classList.remove('hide');
    this.elTip.classList.remove('tipFade');
    /* 无关闭按钮的面板不需要为按钮预留右侧内边距（移动端） */
    if (this.elTip.classList) this.elTip.classList.toggle('tipNoClose', opt.noClose === true);
    this._tipOwner = owner || '';
    this._tipKey = '';
    const r = this.elTip.getBoundingClientRect();
    this.elTip.style.left = Math.min(x + 16, window.innerWidth - r.width - 8) + 'px';
    this.elTip.style.top = Math.min(y + 12, window.innerHeight - r.height - 8) + 'px';
  },
  /** 同一内容重复触发时只移动位置，避免鼠标移动时反复重建导致闪烁 */
  tipReuse(key, x, y) {
    if (this._tipKey === key && this.elTip && !this.elTip.classList.contains('hide')) {
      const r = this.elTip.getBoundingClientRect();
      this.elTip.style.left = Math.min(x + 16, window.innerWidth - r.width - 8) + 'px';
      this.elTip.style.top = Math.min(y + 12, window.innerHeight - r.height - 8) + 'px';
      return true;
    }
    this._tipKey = key;
    return false;
  },
  /** 悬浮窗内的物品图标（data-tic 占位） */
  paintTipIcons() {
    if (!this.elTip || !this.elTip.querySelectorAll) return;
    this.elTip.querySelectorAll('[data-tic]').forEach(s => {
      const id = +s.dataset.tic;
      if (!ITEMS[id]) return;
      const c = document.createElement('canvas'); c.width = 22; c.height = 22; c.className = 'ic';
      try { c.getContext('2d').drawImage(Sprites.icon({ id: id, q: 2, type: ITEMS[id].type }), 0, 0, 22, 22); } catch (e) { }
      s.appendChild(c);
    });
  },
  /** 生成可悬停的物资文本：<span data-tip="物品id">名称</span> */
  tipMark(id, label) {
    return '<span class="tl" data-tip="' + id + '">' + (label || (ITEMS[id] ? ITEMS[id].name : id)) + '</span>';
  },
  /** 把容器中所有 data-tip 节点绑定为物资悬停（面板/列表通用） */
  bindTips(root, owner) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-tip]').forEach(s => {
      if (s.dataset.bound === '1') return;
      s.dataset.bound = '1';
      const id = +s.dataset.tip;
      s.onmouseenter = e => this.tipMat(id, e.clientX, e.clientY, owner || 'mat');
      s.onmousemove = e => this.tipMat(id, e.clientX, e.clientY, owner || 'mat');
      s.onmouseleave = () => this.tipHide(owner || 'mat');
    });
  },
  /** 物资通用悬停：基础属性 + 内置数据库的来源 / 用途 */
  tipMat(id, x, y, owner) {
    const d = ITEMS[id];
    if (!d) { this.tipHide(owner || 'mat'); return; }
    const _k = 'mat:' + id;
    if (this.tipReuse(_k, x, y)) return;
    const p = this.game.player;
    let html = '<div class="tn"><span data-tic="' + id + '"></span>' + d.name + '</div>';
    html += '<div class="tq">' + codexTypeCN(d) + (d.lv ? ' · 等级需求 Lv.' + d.lv : '') + '</div>';
    if (d.desc) html += '<div class="td">' + d.desc + '</div>';
    html += '<div class="tr">' + (d.type === 'gear' ? '估价' : '参考单价') + ' <b style="color:#ffdf94">' +
      fmt(d.type === 'gear' ? gearValue(newGear(id, d.lv || 1, 2, 0)) : itemPrice({ id: id, q: 2 })) + ' 金</b>' +
      '　持有 <b style="color:#9fd06a">' + p.countItem(id) + '</b>' +
      (d.stack && d.stack > 1 ? '　堆叠上限 ' + d.stack : '') +
      (d.toolSpeed ? '　工具效率 ' + d.toolSpeed : '') + '</div>';
    const src = itemSources(id);
    if (src.length) html += '<div class="td">来源：<br>' + src.map(s => '· ' + s).join('<br>') + '</div>';
    const use = itemUses(id);
    if (use.length) {
      html += '<div class="td">用途：<br>' + use.slice(0, 4).map(u => '· ' + u).join('<br>') +
        (use.length > 4 ? '<br>· 等 ' + use.length + ' 个配方' : '') + '</div>';
    }
    if (d.type === 'seed' && ITEMS[d.cropId]) html += '<div class="mini">成熟产物：' + this.tipMark(d.cropId, ITEMS[d.cropId].name) + '（' + d.growMin + ' 分钟）</div>';
    html += '<div class="mini">来源/用途由内置数据库实时整理（按 P 打开图鉴）</div>';
    this.tipShow(html, x, y, owner || 'mat');
    this.paintTipIcons();
    this.bindTips(this.elTip, owner || 'mat');
    this._tipKey = _k;
  },
  /** 怪物悬停（图鉴 / 列表） */
  tipMonster(m, x, y) {
    const _k = 'mon:' + m.region.key + ':' + m.tpl.name;
    if (this.tipReuse(_k, x, y)) return;
    const t = m.tpl, reg = m.region, lv = reg.lv;
    const M = TYPE_MULT[m.tier] || 1;
    const at = lv[0], bt = lv[1];
    let html = '<div class="tn" style="color:' + (m.tier === 'normal' ? '#ffd76a' : '#ff54e0') + '">' +
      (TYPE_CN[m.tier] ? TYPE_CN[m.tier] + '·' : '') + t.name + '</div>';
    html += '<div class="tq">' + reg.name + '　登场等级 Lv.' + lv[0] + '-' + lv[1] + '　形态：' + (SHAPE_CN[t.shape] || t.shape) + '</div>';
    html += '<div class="tr">生命 ' + fmt(Math.round(50 * levelMult(at) * M * reg.diff)) +
      ' → ' + fmt(Math.round(50 * levelMult(bt) * M * reg.diff)) + '（随等级成长）</div>';
    html += '<div class="tr">攻击类型 ' + (t.atk === 'ranged' ? '远程' : '近战') +
      '　元素 ' + (ELEMENT_CN[t.special || reg.elem] || '无') + '　移动速度 ' + (t.speed || 1).toFixed(1) + '</div>';
    html += '<div class="tr">击败奖励（Lv.' + at + '）：经验 ' + fmt(Math.round(at * 10 * (M > 1 ? (M > 10 ? 50 : 12) : 1) * 0.35)) +
      '　金币 ' + fmt(Math.round(at * 5 * (M > 1 ? (M > 10 ? 30 : 8) : 1) * 0.5)) + '</div>';
    const parts = MOB_PARTS[t.shape] || [];
    if (parts.length) html += '<div class="td">取材：' + parts.map(d => this.tipMark(d.id) + ' ' + Math.round(d.p * 100) + '%').join('　') + '</div>';
    const drops = t.drop || [];
    if (drops.length) {
      const mul = DROP_TIER_MUL[m.tier] || 0.35;
      html += '<div class="td">专属掉落：' + drops.map(d => this.tipMark(d.id) + ' ' + Math.round(d.p * mul * 100) + '%').join('　') + '</div>';
    }
    html += '<div class="mini">普通怪物模板掉落按 35% 概率生效，精英 70%，BOSS 100%</div>';
    this.tipShow(html, x, y, 'mon');
    this.paintTipIcons();
    this.bindTips(this.elTip, 'mon');
    this._tipKey = _k;
  },
  /** 配方悬停 */
  tipRecipe(r, x, y) {
    const _k = 'rec:' + r.id;
    if (this.tipReuse(_k, x, y)) return;
    const p = this.game.player;
    const ok = p.life[r.skill].lv >= r.req;
    let html = '<div class="tn">' + r.name + '</div>';
    html += '<div class="tq">' + SKILL_CN[r.skill] + '　需求 Lv.' + r.req + '（当前 ' + p.life[r.skill].lv + '）' +
      '　<span class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '可制作' : '等级不足') + '</span></div>';
    html += '<div class="tr">基础成功率 ' + Math.round(r.rate * 100) + '%　单次耗时 ' + r.time + 's</div>';
    html += '<div class="td">材料：' + r.mats.map(m => {
      const have = p.countItem(m.id);
      return '· ' + this.tipMark(m.id) + ' <b class="' + (have >= m.n ? 'ok' : 'bad') + '">' + have + '/' + m.n + '</b>';
    }).join('<br>') + '</div>';
    html += '<div class="td">产出：' + (r.out.gear
      ? this.tipMark(r.out.gear) + '（装备 Lv.' + r.out.lv + '）'
      : this.tipMark(r.out.item) + ' ×' + r.out.n + (r.out.q ? '（' + getQuality(r.out.q).name + '起）' : '')) + '</div>';
    this.tipShow(html, x, y, 'rec');
    this.paintTipIcons();
    this.bindTips(this.elTip, 'rec');
    this._tipKey = _k;
  },
  /** owner 不为空时，只关闭由该来源打开的悬浮面板（避免互相抢焦点） */
  tipHide(owner) {
    if (owner && this._tipOwner !== owner) return;
    this._tipOwner = ''; this._tipKey = '';
    if (this._tipT) { clearTimeout(this._tipT); this._tipT = null; }
    this.elTip.classList.remove('tipFade');
    this.elTip.classList.add('hide');
  },
  /** 渐隐后关闭：先加 .tipFade（CSS 过渡 0.35s），过渡结束再真正隐藏 */
  tipFade(owner) {
    const t = this.elTip;
    if (!t || t.classList.contains('hide')) return;
    if (owner && this._tipOwner !== owner) return;
    t.classList.add('tipFade');
    if (this._fadeT) clearTimeout(this._fadeT);
    this._fadeT = setTimeout(() => { this._fadeT = null; this.tipHide(owner); }, 360);
  },

  /* ---------- Buff / Debuff 图标信息面板 ----------
   * PC：鼠标悬停查看；安卓 APK / 移动端：点击（触摸）查看；均 3 秒后渐隐消失 */
  showBuffTip(el, b, d, keepT) {
    const r = el.getBoundingClientRect();
    const color = d.type === 'debuff' ? '#ff9a9a' : '#9fe8b8';
    let html = '<div class="tn">' + d.icon + ' ' + d.name + '</div>' +
      '<div class="tq" style="color:' + color + '">' + (d.type === 'debuff' ? '减益 · Debuff' : '增益 · Buff') + '</div>' +
      '<div class="td">' + d.desc + '</div>' +
      '<div class="tr">' + (d.timer === false
        ? '<span class="mini">状态效果：' + (d.tip || '条件解除后自动移除') + '</span>'
        : '<span class="mini">剩余 ' + Math.ceil(b.t) + ' 秒</span>') + '</div>';
    this._buffHoverId = b.id;
    this.tipShow(html, r.left, r.bottom + 4, 'buff', keepT ? { noClose: true } : { fade: 3000, noClose: true });
  },
  bindBuffTip(el, b, d) {
    const self = this;
    if (typeof Mobile !== 'undefined' && Mobile.on) {
      el.addEventListener('click', ev => {                 // 移动端：点击图标弹出信息
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (ev && ev.preventDefault) ev.preventDefault();
        self.showBuffTip(el, b, d, false);
      });
    } else {
      el.addEventListener('mouseenter', () => self.showBuffTip(el, b, d, false));
      el.addEventListener('mouseleave', () => {
        if (self._buffHoverId === b.id) { self._buffHoverId = null; self.tipHide('buff'); }
      });
    }
  },

  /* ---------- 资源点悬浮信息 ---------- */
  tipNode(nd, x, y) {
    const _k = 'node:' + nd.tx + ',' + nd.ty + ':' + nd.amount;
    if (this.tipReuse(_k, x, y)) return;
    const g = this.game, p = g.player;
    const kindCN = { mine: '采矿点', log: '伐木点', herb: '采药点', bug: '捕虫点', fish: '渔点' }[nd.skill] || '资源点';
    const nq = nodeQuality(nd.req);
    let html = '<div class="tn" style="color:' + nq.color + '">' + g.nodeName(nd) + '</div>';
    html += '<div class="tq">' + kindCN + '　<b style="color:' + nq.color + '">' + nq.name + '</b>' +
      (nd.rare ? '　<b style="color:#ff54e0">稀有</b>' : '') + '</div>';
    const my = p.life[nd.skill].lv;
    const ok = my >= (nd.req || 1);
    html += '<div class="tr">采集等级：<b class="' + (ok ? 'ok' : 'bad') + '">需要 Lv.' + (nd.req || 1) + '</b>　当前 ' + SKILL_CN[nd.skill] + ' Lv.' + my + '</div>';
    html += '<div class="tr">可采集次数：<b style="color:#ffd76a">' + (nd.skill === 'fish' ? '无限' : nd.amount + ' / ' + nd.max) + '</b>' +
      (nd.amount <= 0 && nd.skill !== 'fish' ? '　<span class="bad">已采空（等待刷新）</span>' : '') + '</div>';
    html += '<div class="tr">单次耗时：' + g.gatherTime(nd).toFixed(1) + 's　稀有产出概率 ' + Math.round((nd.rare ? 0.06 : 0) * 100 + (p.stats.rareFind || 0) / 4) + '%</div>';
    html += '<div class="td">产出预估：<br>';
    if (nd.skill === 'fish') {
      const list = g.fishPool(nd).slice(0, 6).map(f => '· ' + f.name).join('<br>');
      html += list || '· 普通鱼类';
    } else {
      const doublePct = Math.round(Math.min(95, (p.stats.doubleGather || 0)));
      html += '· ' + ITEMS[nd.itemId].name + ' ×1' + (doublePct > 0 ? '（双倍概率 ' + doublePct + '%）' : '') + '<br>';
      html += '· 额外数量概率 ' + Math.round((0.05 + (p.stats.gatherPct || 0) / 200) * 100) + '%<br>';
      html += '· 生活经验 +' + Math.round(3 + nd.req * 0.4) + '　角色经验 +' + Math.round(p.life[nd.skill].lv * 2 + 4);
    }
    html += '</div>';
    html += '<div class="mini">左键点击资源点 → 打开采集面板（可批量 / 定时 / 无限循环）</div>';
    this.tipShow(html, x, y, 'node');
    this._tipKey = _k;
  },

  /* ---------- 靠近资源点：自动信息面板 ----------
   * 人物走近资源点时自动弹出（顶部居中，不挡视线），3 秒后淡出；
   * 走开立即淡出（CSS 0.5s 过渡，慢慢消失）。 */
  nodePop(nd) {
    if (!nd) return this.nodePopHide();
    const g = this.game, p = g.player;
    const kindCN = { mine: '采矿点', log: '伐木点', herb: '采药点', bug: '捕虫点', fish: '渔点' }[nd.skill] || '资源点';
    const nq = nodeQuality(nd.req);
    const my = p.life[nd.skill].lv, ok = my >= (nd.req || 1);
    let html = '<div class="npName" style="color:' + nq.color + '">' + g.nodeName(nd) + '</div>';
    html += '<div class="npSub">' + kindCN + '　<b style="color:' + nq.color + '">' + nq.name + '</b>' +
      (nd.rare ? '　<b style="color:#ff54e0">稀有</b>' : '') + '</div>';
    html += '<div class="npRow">采集等级：<b class="' + (ok ? 'ok' : 'bad') + '">需要 Lv.' + (nd.req || 1) +
      '</b>　当前 ' + SKILL_CN[nd.skill] + ' Lv.' + my + '</div>';
    html += '<div class="npRow">剩余次数：<b style="color:#ffd76a">' +
      (nd.skill === 'fish' ? '无限' : nd.amount + ' / ' + nd.max) + '</b>　单次 ' + g.gatherTime(nd).toFixed(1) + 's</div>';
    html += '<div class="npRow">产出：<b style="color:#ffd76a">' +
      (nd.skill === 'fish' ? g.fishPool(nd).slice(0, 3).map(f => f.name).join(' / ') + ' 等'
        : (ITEMS[nd.itemId] ? ITEMS[nd.itemId].name : '材料')) + '</b>' +
      (p.stats.doubleGather ? '　双倍 ' + Math.round(Math.min(95, p.stats.doubleGather)) + '%' : '') + '</div>';
    html += '<div class="npFoot">左键 / E 打开采集面板（可批量 · 定时 · 无限循环）</div>';
    const e = $('nodePop');
    if (!e) return;
    e.innerHTML = html;
    e.classList.add('show');
    if (this._npT) clearTimeout(this._npT);
    this._npT = setTimeout(() => { this._npT = null; this.nodePopHide(); }, 3000);   // 持续 3 秒
    this._npNd = nd;
  },
  nodePopHide() {
    const e = $('nodePop');
    if (e) e.classList.remove('show');                     // 淡出（CSS 过渡 0.5s）
    if (this._npT) { clearTimeout(this._npT); this._npT = null; }
    this._npNd = null;
  },

  /* ---------- 技能悬浮信息 ---------- */
  tipSkill(sk, p, x, y) {
    if (!sk) { this.tipHide('skill'); return; }
    const lv = skillLevelOf(sk, p.lv);
    const open = p.lv >= sk.lv;
    const patCN = { single: '单体', cone: '扇形', circle: '范围', line: '直线', dash: '突进', self: '自身' }[sk.pattern] || sk.pattern;
    let html = '<div class="tn" style="color:' + (sk.ult ? '#ff54e0' : '#ffd76a') + '">' + sk.name + (sk.ult ? ' · 觉醒技' : '') + '</div>';
    html += '<div class="tq">' + patCN + '　元素 ' + (ELEMENT_CN[sk.elem] || '无') + '　等级 ' + lv + '</div>';
    html += '<div class="tr">倍率：<b style="color:#ff9a6a">' + (sk.mult ? (skillMult(sk, p.lv) * 100).toFixed(0) + '%' : '—') + '</b>' +
      (sk.hits > 1 ? ' × ' + sk.hits + ' 段' : '') + '</div>';
    html += '<div class="tr">消耗：' + sk.mp + ' MP　冷却：' + skillCd(sk, p.lv).toFixed(1) + 's</div>';
    if (sk.heal) html += '<div class="tr">治疗：' + sk.mult + '%</div>';
    html += '<div class="td">' + (sk.desc || '') + '</div>';
    if (sk.buffId && BUFFS[sk.buffId]) html += '<div class="eff">◆ ' + BUFFS[sk.buffId].name + '：' + BUFFS[sk.buffId].desc + '</div>';
    if (sk.debuffId && BUFFS[sk.debuffId]) html += '<div class="eff">◆ ' + BUFFS[sk.debuffId].name + '：' + BUFFS[sk.debuffId].desc + '</div>';
    if (sk.proc) html += '<div class="eff">◆ 命中附加：' + { burn: '灼烧', freeze: '冰冻', sunder: '破甲', fever: '剧毒', void: '虚空', starstrike: '星痕', chain: '连锁', frenzy: '狂乱' }[sk.proc.t] + ' ' + sk.proc.v + '%</div>';
    html += '<div class="mini">' + (open ? '已解锁（' + sk.lv + ' 级）' : '<span class="bad">未解锁：需要角色 Lv.' + sk.lv + '</span>') +
      '　快捷键 ' + ((p.cls.skills.indexOf(sk) || 0) + 1) + '</div>';
    this.tipShow(html, x, y, 'skill');
  },

  /* ---------- 天赋悬浮信息 ---------- */
  tipTalent(n, pl, x, y) {
    const l = pl.talentLevel(n.id);
    const preOk = !n.pre || pl.talentLevel(n.pre.id) >= n.pre.lv;
    let html = '<div class="tn" style="color:#7fe8ff">' + n.name + '</div>';
    html += '<div class="tq">' + n.treeCN + '　等级 ' + l + ' / ' + n.max + '　每级 ' + n.cost + ' 点</div>';
    html += '<div class="td">' + n.desc + '</div>';
    if (n.mods) {
      html += '<div class="tr">效果（每级）：</div>';
      for (const k in n.mods) {
        const isPct = /pct$|Spd$|Rate$|Find$|Pct$/.test(k) || k.indexOf('pct') >= 0;
        const cn = STAT_CN[k] || k;
        html += '<div class="s">· ' + cn + ' +' + (isPct ? n.mods[k] + '%' : n.mods[k]) + '　当前累计 +' +
          (isPct ? n.mods[k] * l + '%' : n.mods[k] * l) + '</div>';
      }
    }
    if (n.pre) html += '<div class="mini ' + (preOk ? 'ok' : 'bad') + '">前置：' + TALENT_MAP[n.pre.id].name + ' Lv.' + n.pre.lv + '</div>';
    html += '<div class="mini">' + (l >= n.max ? '已满级' : preOk ? '左键加点' : '前置未达成') + '</div>';
    this.tipShow(html, x, y, 'talent');
  },

  /* ---------- 通用面板 ---------- */
  /** 记录一次玩家操作：重置自动关闭倒计时（默认 10 秒无操作自动关闭所有面板） */
  touch() {
    const at = Date.now() + (this.autoCloseMs || 10000);
    this._closeAt = at;
    if (this._idleTimer && this._schedAt && this._schedAt >= at && this._schedAt - at <= 250) return;  // 已排在相近时刻触发，无需重建定时器
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
    this._schedAt = at;
    this._idleTimer = setTimeout(() => this.autoCloseAll(), Math.max(50, at - Date.now()));
  },
  checkIdle() {
    if (Date.now() < (this._closeAt || 0)) return;
    this.autoCloseAll();
  },
  autoCloseAll() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; this._schedAt = 0; }
    let open = false;
    for (const k in this.panels) { if (this.panels[k].el.style.display !== 'none') { open = true; break; } }
    if (!open) return;
    this.closeAll();
    this.toast && this.toast('10 秒无操作，面板已自动关闭', '#9fb0dd');
  },
  /** 把面板缩放到可视区并居中：手机横屏/竖屏都不会超出屏幕，且内容可滚动 */
  fitPanel(k) {
    const pt = this.panels[k]; if (!pt || !pt.el) return null;
    const ow = pt._ow || parseInt(pt.el.style.width) || 0;
    const oh = pt._oh || parseInt(pt.el.style.height) || 0;
    if (!ow || !oh) return pt;
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = Math.max(200, Math.min(ow, vw - 16));
    const ph = Math.max(140, Math.min(oh, vh - 20));
    const mob = (typeof Mobile !== 'undefined' && Mobile.on);
    pt.el.style.width = pw + 'px';
    pt.el.style.height = ph + 'px';
    const left = mob ? Math.round((vw - pw) / 2) : (parseInt(pt.el.style.left) || Math.round((vw - pw) / 2));
    const top = mob ? Math.max(6, Math.round((vh - ph) / 2)) : (parseInt(pt.el.style.top) || 60);
    pt.el.style.left = clamp(left, 6, Math.max(6, vw - pw - 6)) + 'px';
    pt.el.style.top = clamp(top, 6, Math.max(6, vh - ph - 6)) + 'px';
    if (pt.body) pt.body.style.height = (ph - 30) + 'px';   // 内容区高度跟随缩放，超出部分可滚动
    return pt;
  },
  fitPanels() { for (const k in this.panels) this.fitPanel(k); },

  /* ---------- 第三方资源致谢页（中英双语 / 可点击跳转） ---------- */
  creditList: [
    {
      name: 'Kenney 游戏美术素材（地表瓦片）', en: 'Kenney Game Assets (terrain tiles)',
      by: 'Kenney（www.kenney.nl）', lic: 'CC0 1.0 公共领域 / Public Domain',
      url: 'https://kenney.nl/assets', note: '地形瓦片经按区域重新染色后使用'
    },
    {
      name: 'Kenney 海盗素材包（水域小船）', en: 'Kenney Pirate Pack (dinghy sprites)',
      by: 'Kenney Vleugels（www.kenney.nl）', lic: 'CC0 1.0 公共领域 / Public Domain',
      url: 'https://kenney.nl/assets/pirate-pack', note: '小船外观（assets/boat/，随包附 LICENSE-Kenney.txt）'
    },
    {
      name: 'Apache Cordova', en: 'Apache Cordova（Android 打包框架）',
      by: 'Apache Software Foundation', lic: 'Apache-2.0',
      url: 'https://cordova.apache.org/', note: '将网页游戏打包为 Android 安装包'
    },
    {
      name: 'cordova-android', en: 'Cordova Android Platform',
      by: 'Apache Software Foundation', lic: 'Apache-2.0',
      url: 'https://github.com/apache/cordova-android', note: 'Android 平台适配层'
    },
    {
      name: 'Node.js', en: 'Node.js（构建脚本工具链）',
      by: 'OpenJS Foundation', lic: 'MIT',
      url: 'https://nodejs.org/', note: '上传与打包脚本运行环境'
    },
    {
      name: 'GitHub Actions', en: 'GitHub Actions（云端自动化构建）',
      by: 'GitHub, Inc.', lic: '专有服务 / Proprietary service',
      url: 'https://github.com/features/actions', note: '自动化编译并产出 APK'
    },
    {
      name: '系统字体', en: 'System fonts（PingFang SC / Noto Sans / system-ui）',
      by: '操作系统自带 / Provided by the OS', lic: '未引入任何第三方字体 / No bundled third-party font',
      url: '', note: '界面文字使用系统字体'
    }
  ],
  /** 用系统浏览器打开外链（Cordova 环境下走 _system） */
  openLink(url) {
    if (!url) return;
    try {
      if (typeof window !== 'undefined' && window.cordova && window.cordova.InAppBrowser) {
        window.cordova.InAppBrowser.open(url, '_system'); return;
      }
      const w = typeof window !== 'undefined' && window.open ? window.open(url, '_system') : null;
      if (!w && typeof window !== 'undefined' && window.open) window.open(url, '_blank');
    } catch (e) {
      try { if (typeof window !== 'undefined' && window.open) window.open(url, '_blank'); } catch (e2) { /* 忽略 */ }
    }
  },
  showCredits() {
    if (this._credits) { this._credits.style.display = ''; this.touch && this.touch(); return; }
    const mask = el('div', 'creditsMask');
    const box = el('div', 'creditsBox');

    const head = el('div', 'crHead');
    head.appendChild(el('span', 'crTitle', '致 谢 / Credits'));
    const closer = el('span', 'pclose', '✕ 关闭');
    closer.title = '关闭';
    closer.onclick = () => { mask.style.display = 'none'; this.touch && this.touch(); };
    head.appendChild(closer);
    box.appendChild(head);

    const body = el('div', 'crBody');
    body.appendChild(el('p', 'crP',
      '《星落大陆》是一款原创的 2D 开放世界沙盒 RPG。地表瓦片与水域小船采用 CC0 公共领域素材（瓦片按大区重新染色）；' +
      '角色立绘、图标、界面与全部特效均由本项目自研的程序化绘图系统实时生成，未使用任何受版权保护的美术或音频资源。' +
      '在此向所有让本项目成为可能的开源作者致以诚挚谢意。'));
    body.appendChild(el('p', 'crP en',
      'Starlit Continent is an original 2D open-world sandbox RPG. Terrain tiles are CC0 public-domain assets, ' +
      're-tinted per region. All characters, icons, UI elements and visual effects are generated at runtime by this ' +
      'project’s own procedural drawing system. No copyrighted artwork or audio is used. ' +
      'Our sincere thanks to every open-source author who made this possible.'));
    body.appendChild(el('div', 'crSec', '第三方资源 / Third-party resources（点击名称前往原站）'));

    for (const c of this.creditList) {
      const row = el('div', 'crItem');
      if (c.url) {
        const a = el('a', 'crLink', c.name + ' · ' + c.en + '  ↗');
        a.href = c.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = c.url;
        a.onclick = ev => { if (ev && ev.preventDefault) ev.preventDefault(); this.openLink(c.url); };
        row.appendChild(a);
      } else {
        row.appendChild(el('span', 'crName', c.name + ' · ' + c.en));
      }
      row.appendChild(el('div', 'crMeta', '作者 / Author：' + c.by + '　　许可 / License：' + c.lic));
      if (c.note) row.appendChild(el('div', 'crMeta', '用途 / Usage：' + c.note));
      body.appendChild(row);
    }

    body.appendChild(el('div', 'crSec', '原创内容 / Original content'));
    body.appendChild(el('p', 'crP',
      '游戏设计、程序代码、程序化美术与全部文案：本项目开发团队（原创）。音乐与音效：本项目未内置任何音频。' +
      '如你对本项目有任何意见或建议，欢迎通过仓库 Issues 反馈。'));
    body.appendChild(el('p', 'crP en',
      'Game design, source code, procedural art and all writing: this project’s development team (original work). ' +
      'Music & SFX: none bundled. Feedback is welcome via the repository Issues.'));

    const foot = el('div', 'crFoot');
    const bOk = el('button', 'btn gold', '知道了，开始旅程 / Got it');
    bOk.onclick = () => { mask.style.display = 'none'; this.touch && this.touch(); };
    foot.appendChild(bOk);
    box.appendChild(body); box.appendChild(foot); mask.appendChild(box);
    (typeof document !== 'undefined' && document.body ? document.body : this.elRoot).appendChild(mask);
    this._credits = mask;
    this.touch && this.touch();
    return mask;
  },

  panel(name, title, w, h, x, y) {
    if (this.panels[name]) {
      const old = this.panels[name];
      old.el.style.display = '';
      this.fitPanel(name);
      this.touch();                                      // 重新计时：10 秒无操作自动关闭
      return old;
    }
    const p = el('div', 'panel');
    const vw = window.innerWidth, vh = window.innerHeight;
    let pw = Math.max(200, Math.min(w, vw - 16));
    let ph = Math.max(140, Math.min(h, vh - 20));
    const mob = (typeof Mobile !== 'undefined' && Mobile.on);
    const left = mob ? Math.round((vw - pw) / 2) : (x === undefined ? Math.round((vw - pw) / 2) : x);
    const top = mob ? Math.max(6, Math.round((vh - ph) / 2)) : (y === undefined ? 60 : y);
    p.style.width = pw + 'px'; p.style.height = ph + 'px';
    p.style.left = clamp(left, 6, Math.max(6, vw - pw - 6)) + 'px';
    p.style.top = clamp(top, 6, Math.max(6, vh - ph - 6)) + 'px';
    const closeTxt = (typeof Mobile !== 'undefined' && Mobile.on) ? '✕ 关闭' : '✕';
    const t = el('div', 'ptitle', '<span>' + title + '</span><span class="pclose" title="关闭">' + closeTxt + '</span>');
    const b = el('div', 'pbody');
    b.style.height = (ph - 30) + 'px';
    b.style.overflowY = 'auto'; b.style.overflowX = 'hidden';
    p.appendChild(t); p.appendChild(b);
    this.elRoot.appendChild(p);
    const closer = t.querySelector('.pclose');
    closer.onclick = () => { p.style.display = 'none'; };
    closer.onmousedown = e => e.stopPropagation();   // 避免点关闭时触发拖动
    // 拖动
    let drag = null;
    t.onmousedown = e => { drag = { x: e.clientX - parseInt(p.style.left), y: e.clientY - parseInt(p.style.top) }; };
    window.addEventListener('mouseup', () => drag = null);
    window.addEventListener('mousemove', e => { if (drag) { p.style.left = (e.clientX - drag.x) + 'px'; p.style.top = (e.clientY - drag.y) + 'px'; } });
    const obj = { el: p, body: b, title: t, _ow: w, _oh: h };
    this.panels[name] = obj;
    if (p._ow === undefined) { p._ow = w; p._oh = h; }   // DOM 上保留原始尺寸供 fitPanel 使用
    /* 面板内容由各 open*() 同步填充 → 下一帧统一挂载分隔条（含嵌套），
     * 这样所有面板无需逐个改代码，只需在模板上标 data-sp / data-sp-key */
    if (typeof Splitter !== 'undefined') requestAnimationFrame(() => Splitter.scan(b));
    this.touch();                                        // 打开面板开始计时
    return obj;
  },
  toggle(name, fn) {
    const p = this.panels[name];
    if (p && p.el.style.display !== 'none') { p.el.style.display = 'none'; return; }
    fn();
  },
  closeAll() {
    for (const k in this.panels) this.panels[k].el.style.display = 'none';
    this.closeOverview();
  },
  isOverviewOpen() { const b = $('ovOverlay'); return b && !b.classList.contains('hide'); },

  cell(inst, idx, opts) {
    opts = opts || {};
    const d = el('div', 'cell' + (inst ? '' : ' empty'));
    if (inst) {
      const cv = Sprites.icon(inst);
      const c = document.createElement('canvas'); c.width = 36; c.height = 36;
      c.getContext('2d').drawImage(cv, 2, 2, 32, 32);
      d.appendChild(c);
      if ((inst.n || 1) > 1) d.appendChild(el('div', 'cn2', String(inst.n)));
      if (inst.q >= 5) d.style.borderColor = getQuality(inst.q).color;
      d.onclick = e => {
        if (typeof opts.onClick === 'function') { opts.onClick(idx, e); }
      };
      d.ondblclick = e => { if (typeof opts.onDbl === 'function') { e.preventDefault(); opts.onDbl(idx, e); } };
      d.onmouseenter = e => this.tipInst(inst, e.clientX, e.clientY);
      d.onmouseleave = () => this.tipHide();
      d.oncontextmenu = e => { e.preventDefault(); if (typeof opts.onRight === 'function') opts.onRight(idx, e); };
    }
    return d;
  },

  /* ---------- 资源点采集面板 ---------- */
  openNode(nd) {
    const g = this.game, p = g.player;
    const pan = this.panel('node', '采集面板 · ' + g.nodeName(nd), 430, 500, 30, 90);
    pan.body.innerHTML = '';
    pan.el.style.display = '';
    this._nodeNd = nd;
    const self = this;

    const info = el('div', 'ninfo');
    const ctrl = el('div', 'nctrl');
    const stat = el('div', 'nstat');
    pan.body.appendChild(info); pan.body.appendChild(ctrl); pan.body.appendChild(stat);
    this._nodeInfo = info; this._nodeStat = stat;

    // 次数按钮
    const row1 = el('div', 'btnRow');
    [1, 10, 100, 1000].forEach(n => {
      const b = el('button', 'btn', '采集 ' + n + ' 次');
      b.onclick = () => g.queueGather(nd, n);
      row1.appendChild(b);
    });
    ctrl.appendChild(el('div', 'lbl', '增加采集次数'));
    ctrl.appendChild(row1);
    const row2 = el('div', 'btnRow');
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '1'; inp.max = '999999'; inp.value = '5000'; inp.className = 'numInput';
    const bCustom = el('button', 'btn gold', '自定义次数');
    bCustom.onclick = () => {
      const n = Math.max(1, Math.min(999999, Math.floor(+inp.value || 0)));
      if (!n) { this.toast('请输入有效次数', '#ff9a9a'); return; }
      g.queueGather(nd, n);
    };
    row2.appendChild(inp); row2.appendChild(bCustom);
    ctrl.appendChild(row2);

    // 时间按钮
    const row3 = el('div', 'btnRow');
    [[1, '1 分钟'], [5, '5 分钟'], [30, '30 分钟']].forEach(t => {
      const b = el('button', 'btn', '采集 ' + t[1]);
      b.onclick = () => g.queueTime(nd, t[0] * 60);
      row3.appendChild(b);
    });
    ctrl.appendChild(el('div', 'lbl', '增加采集时间'));
    ctrl.appendChild(row3);

    const row4 = el('div', 'btnRow');
    const bInf = el('button', 'btn', '无限循环：关');
    bInf.onclick = () => { g.toggleInfinite(nd); };
    const bStop = el('button', 'btn', '停止采集');
    bStop.onclick = () => g.stopTask('已手动停止');
    row4.appendChild(bInf); row4.appendChild(bStop);
    ctrl.appendChild(row4);
    this._nodeBtnInf = bInf;

    this.refreshNode();
    return pan;
  },
  refreshNode() {
    const nd = this._nodeNd;
    if (!nd || !this._nodeInfo) return;
    const g = this.game, p = g.player;
    const kindCN = { mine: '采矿点', log: '伐木点', herb: '采药点', bug: '捕虫点', fish: '渔点' }[nd.skill] || '资源点';
    const my = p.life[nd.skill].lv, ok = my >= (nd.req || 1);
    const nq = nodeQuality(nd.req);
    let html = '<div class="tr">资源点：<b style="color:' + nq.color + '">' + g.nodeName(nd) + '</b>' +
      '　<b style="color:' + nq.color + '">' + nq.name + '</b></div>';
    html += '<div class="tr">类型：<b>' + kindCN + '</b>' + (nd.rare ? '　<b style="color:#ff54e0">稀有资源</b>' : '') + '</div>';
    html += '<div class="tr">采集等级：<b class="' + (ok ? 'ok' : 'bad') + '">' + (nd.req || 1) + ' 级</b>' +
      '　当前 ' + SKILL_CN[nd.skill] + ' Lv.' + my + '</div>';
    html += '<div class="tr">采集掉落物：<b style="color:#ffd76a">' +
      (nd.skill === 'fish'
        ? g.fishPool(nd).slice(0, 3).map(f => this.tipMark(f.id)).join(' / ') + ' 等 ' + g.fishPool(nd).length + ' 种鱼'
        : this.tipMark(nd.itemId, ITEMS[nd.itemId].name) + ' ×1' + '（' + getQuality(rollQuality(nd.rare ? 'gather_rare' : 'gather', 1, 0)).name + '起）') + '</b></div>';
    html += '<div class="tr">可采集次数：<b style="color:#ffd76a">' + (nd.skill === 'fish' ? '无限' : nd.amount + ' / ' + nd.max) + '</b>' +
      '　单次耗时 <b>' + g.gatherTime(nd).toFixed(1) + 's</b></div>';
    this._nodeInfo.innerHTML = html;
    this.bindTips(this._nodeInfo, 'node');

    const t = (g.task && g.task.nd === nd) ? g.task : null;
    if (!t) {
      this._nodeStat.innerHTML = '<div class="mini">当前空闲。点击上方按钮开始批量 / 定时 / 无限循环采集。</div>';
      if (this._nodeBtnInf) { this._nodeBtnInf.textContent = '无限循环：关'; this._nodeBtnInf.className = 'btn'; }
      return;
    }
    let s = '<div class="tr">状态：<b class="ok">采集中…</b>　已采集 <b style="color:#ffd76a">' + t.done + '</b> 次</div>';
    s += '<div class="tr">剩余次数：<b>' + (t.infinite ? '∞（无限循环）' : (t.remain === Infinity ? '限时模式' : fmt(Math.max(0, t.remain)))) + '</b></div>';
    if (t.endTime) {
      const left = Math.max(0, Math.ceil((t.endTime - Date.now()) / 1000));
      s += '<div class="tr">剩余时间：<b>' + fmtTime(left) + '</b>（总时长 ' + Math.round((t.endTime - t.startedAt) / 1000) + 's）</div>';
    }
    s += '<div class="mini">移动（WASD）或远离资源点会中断自动采集。</div>';
    this._nodeStat.innerHTML = s;
    if (this._nodeBtnInf) {
      this._nodeBtnInf.textContent = '无限循环：' + (t.infinite ? '开' : '关');
      this._nodeBtnInf.className = 'btn' + (t.infinite ? ' gold' : '');
    }
  },

  /* ---------- 背包 ---------- */
  openBag() {
    const p = this.panel('bag', '背包', 500, 430);
    p.body.innerHTML = '';
    this._bagFilter = this._bagFilter || 'all';
    const tabs = el('div', 'tabs');
    [['all', '全部'], ['gear', '装备'], ['use', '消耗'], ['mat', '材料'], ['seed', '种子']].forEach(t => {
      const b = el('div', 'tab' + (this._bagFilter === t[0] ? ' on' : ''), t[1]);
      b.onclick = () => { this._bagFilter = t[0]; this.refreshBag(); this.openBag(); };
      tabs.appendChild(b);
    });
    p.body.appendChild(tabs);
    const grid = el('div', 'grid');
    p.body.appendChild(grid);
    const btnRow = el('div', '', '');
    const bSort = el('button', 'btn', '整理'); bSort.onclick = () => { this.game.player.sortBag(); this.refreshBag(); };
    const bSell = el('button', 'btn', '出售粗糙/普通');
    bSell.onclick = () => this.sellJunk();
    const bTip = el('span', 'mini', '　左键=物品信息面板　双击=使用/装备　Shift+左键=发到频道　右键=丢弃');
    btnRow.appendChild(bSort); btnRow.appendChild(bSell); btnRow.appendChild(bTip);
    p.body.appendChild(btnRow);
    const info = el('div', 'mini', '');
    p.body.appendChild(info);
    this._bagGrid = grid; this._bagInfo = info;
    this.refreshBag();
  },
  refreshBag() {
    if (!this._bagGrid) return;
    const g = this.game, p = g.player;
    const grid = this._bagGrid; grid.innerHTML = '';
    let used = 0;
    p.bag.forEach((inst, i) => {
      if (!inst) return;
      used++;
      const f = this._bagFilter;
      const t = inst.type;
      if (f !== 'all' && !(f === 'seed' ? t === 'seed' : t === f)) return;
      grid.appendChild(this.cell(inst, i, {
        // 左键：物品信息面板（出售 / 上架拍卖行 / 丢弃 / 发送聊天链接）
        onClick: (idx, e) => {
          g.selectedBagIndex = idx;
          const it = p.bag[idx];
          if (!it) return;
          if (e.shiftKey) {                      // Shift+左键：直接发送到聊天窗
            const ch = $('chatCh') ? $('chatCh').value : '世界';
            if (it.type === 'gear') Chat.sayGear(p.name, ch, it, ''); else Chat.sayItem(p.name, ch, it, '');
            const w = $('chatWrap'); if (w) w.classList.remove('fold');
            this.toast('已发送到频道：' + itemFullLabel(it), '#9fe8ff');
            return;
          }
          this.openItem(it, {});
        },
        // 双击：快捷使用 / 装备
        onDbl: idx => {
          const it = p.bag[idx]; if (!it) return;
          if (it.type === 'gear') {
            p.equipItem(idx); this.refreshBag(); this.refreshChar && this.refreshChar();
            this.toast('已装备 ' + gearFullName(it), '#9fd06a');
          } else if (it.type === 'use') { this.useItem(idx); }
          else if (it.type === 'seed' && g.inHome) { g.tryPlantHome(it); this.refreshBag(); }
          else this.toast(ITEMS[it.id].name, '#cfd8e8');
        },
        onRight: idx => {
          const it = p.bag[idx];
          if (!it) return;
          if (it.q >= 4 && !confirm('丢弃 ' + itemFullLabel(it) + '？')) return;
          p.removeAt(idx, it.n || 1);
          this.refreshBag(); this.refreshChar && this.refreshChar();
          this.log('丢弃：' + itemFullLabel(it), '#ff9a9a');
        }
      }));
    });
    this._bagInfo.textContent = '容量 ' + used + ' / ' + p.bag.length + '　金币 ' + fmt(p.gold);
  },
  useItem(idx) {
    const g = this.game, p = g.player, it = p.bag[idx];
    if (!it || it.type !== 'use') return;
    const ok = ITEMS[it.id].use(g);
    if (ok !== false) { p.removeAt(idx, 1); this.refreshBag(); }
  },
  dropItem(idx) {
    const p = this.game.player, it = p.bag[idx];
    if (!it) return;
    if (it.q >= 4 && !confirm('丢弃 ' + ITEMS[it.id].name + '？')) return;
    p.removeAt(idx, it.n || 1); this.refreshBag(); this.log('丢弃：' + ITEMS[it.id].name);
  },
  sellJunk() {
    const p = this.game.player; let gold = 0;
    p.bag.forEach((it, i) => {
      if (it && it.q <= 2 && it.type !== 'use') { gold += itemPrice(it) * (it.n || 1); p.removeAt(i, it.n || 1); }
    });
    if (gold) { p.gold += gold; this.log('出售获得 ' + fmt(gold) + ' 金币', '#ffdf94'); this.refreshBag(); }
  },

  /* ---------- 角色 / 装备 ---------- */
  openChar() {
    const p = this.panel('char', '角色', 460, 520, 40, 60);
    p.body.innerHTML = '';
    const row = el('div', 'rowline');
    const left = el('div', 'col'); left.style.maxWidth = '210px';
    const grid = el('div', 'grid'); grid.style.gridTemplateColumns = 'repeat(3,44px)';
    const slots = ['helmet', 'chest', 'legs', 'weapon', 'offhand', 'boots', 'ring', 'necklace', 'amulet'];
    slots.forEach(s => {
      const d = el('div', 'cell');
      const inst = this.game.player.equip[s];
      if (inst) {
        const c = document.createElement('canvas'); c.width = 36; c.height = 36;
        c.getContext('2d').drawImage(Sprites.icon(inst), 2, 2, 32, 32);
        d.appendChild(c);
        d.style.borderColor = getQuality(inst.q).color;
        d.onmouseenter = e => this.tipInst(inst, e.clientX, e.clientY, 'char');
        d.onmousemove = e => this.tipInst(inst, e.clientX, e.clientY, 'char');
        d.onmouseleave = () => this.tipHide('char');
        d.onclick = () => this.openItem(inst, { equipped: true, slot: s });
        d.oncontextmenu = ev => { ev.preventDefault(); this.game.player.unequip(s); this.openChar(); this.refreshBag(); };
      } else d.appendChild(el('div', 'mini', SLOT_CN[s]));
      grid.appendChild(d);
    });
    left.appendChild(el('div', 'lbl', '装备栏（左键打开装备面板 / 右键卸下）'));
    left.appendChild(grid);
    row.appendChild(left);
    const right = el('div', 'col');
    row.appendChild(right);
    p.body.appendChild(row);
    const sEl = el('div', '');
    p.body.appendChild(sEl);
    const lifeEl = el('div', '');
    p.body.appendChild(lifeEl);
    this._charRight = right; this._charStats = sEl; this._charLife = lifeEl;
    this.refreshChar();
  },
  refreshChar() {
    if (!this._charRight) return;
    const p = this.game.player, s = p.stats;
    this._charRight.innerHTML =
      '<div class="lbl">' + p.name + '　<span style="color:#ffd76a">Lv.' + p.lv + '</span>　' + p.cls.name + '</div>' +
      '<div class="mini">' + p.cls.desc + '</div>' +
      '<div class="lbl">天赋点 ' + (p.talentTotal() - p.talentSpent()) + ' / ' + p.talentTotal() + '</div>';
    const rows = [
      ['生命', Math.round(p.maxHp)], ['魔力', Math.round(p.maxMp)],
      ['攻击', Math.round(s.atk)], ['魔攻', Math.round(s.matk)],
      ['防御', Math.round(s.def)], ['魔防', Math.round(s.mdef)],
      ['暴击率', pct(s.crit / 100)], ['暴击伤害', Math.round(s.cdmg) + '%'],
      ['攻速', s.aspd.toFixed(2) + '/s'], ['闪避', pct(s.dodge / 100)],
      ['移速', s.moveSpd.toFixed(2)], ['穿透', s.pen + '%'],
      ['吸血', s.lifesteal + '%'], ['减伤', s.reduction + '%'],
      ['元素增伤', s.elemDmg + '%'], ['冷却缩减', s.cdr + '%'],
      ['掉落率', s.dropPct + '%'], ['金币加成', s.goldPct + '%'],
      ['战力', fmt(p.power)]
    ];
    this._charStats.innerHTML = '<div class="lbl">属性总览</div><div class="statgrid">' +
      rows.map(r => '<span>' + r[0] + '</span><b>' + r[1] + '</b>').join('') + '</div>';
    this._charLife.innerHTML = '<div class="lbl">生活技能</div><div class="statgrid">' +
      Object.keys(p.life).map(k => '<span>' + SKILL_CN[k] + '</span><b>Lv.' + p.life[k].lv + '</b>').join('') + '</div>';
  },

  /* ---------- 制作 / 强化 ---------- */
  openCraft() {
    const p = this.panel('craft', '制作台', 720, 520, 300, 60);
    p.body.innerHTML = '';
    this._craftTab = this._craftTab || 'forge';
    const tabs = el('div', 'tabs');
    CRAFT_SKILLS.concat(['enhance']).forEach(k => {
      const b = el('div', 'tab' + (this._craftTab === k ? ' on' : ''), k === 'enhance' ? '强化' : SKILL_CN[k]);
      b.onclick = () => { this._craftTab = k; this.openCraft(); };
      tabs.appendChild(b);
    });
    p.body.appendChild(tabs);
    const row = el('div', 'rowline');
    const left = el('div', 'cSide'); const right = el('div', 'cMain');
    row.appendChild(left); row.appendChild(right);
    p.body.appendChild(row);
    this._craftList = left; this._craftInfo = right;
    this.refreshCraft();
  },
  refreshCraft() {
    const g = this.game, p = g.player;
    if (!this._craftList || !this.panels.craft || this.panels.craft.el.style.display === 'none') return;
    if (this._craftTab === 'enhance') return this.refreshEnhance();
    const list = recipesOf(this._craftTab).sort((a, b) => a.req - b.req);
    const left = this._craftList; left.innerHTML = '';
    this._craftSel = this._craftSel || list[0];
    list.forEach(r => {
      const d = el('div', 'ritem' + (this._craftSel === r ? ' on' : ''), '<span>' + r.name + '</span><span class="no">Lv.' + r.req + '</span>');
      d.onclick = () => { this._craftSel = r; this.refreshCraft(); };
      left.appendChild(d);
    });
    const r = this._craftSel; if (!r) return;
    const right = this._craftInfo;
    const canLv = p.life[r.skill].lv >= r.req;
    let html = '<div style="font-size:14px;color:#ffd76a">' + r.name + '</div>';
    html += '<div class="mini">需要 ' + SKILL_CN[r.skill] + ' Lv.' + r.req + '（当前 ' + p.life[r.skill].lv + '）　基础成功率 ' + Math.round(r.rate * 100) + '%　耗时 ' + r.time + 's</div>';
    html += '<div class="lbl">材料</div>';
    let lacking = false;
    r.mats.forEach(m => {
      const have = p.countItem(m.id);
      const okmark = have >= m.n;
      if (!okmark) lacking = true;
      html += '<div class="matRow"><span data-icon="' + m.id + '"></span>' + this.tipMark(m.id, ITEMS[m.id].name) +
        ' <b class="' + (okmark ? 'ok' : 'no') + '">' + have + '/' + m.n + '</b></div>';
    });
    // 产出预览
    html += '<div class="lbl">产出</div>';
    if (r.out.gear) html += '<div class="matRow"><span data-out="gear"></span>' + this.tipMark(r.out.gear, ITEMS[r.out.gear].name) + '（等级 ' + r.out.lv + '）</div>';
    else html += '<div class="matRow"><span data-out="item"></span>' + this.tipMark(r.out.item, ITEMS[r.out.item].name) + ' ×' + r.out.n + '</div>';
    html += '<div class="lbl">操作</div>';
    right.innerHTML = html;
    // 图标注入
    right.querySelectorAll('[data-icon]').forEach(s => {
      const id = +s.dataset.icon;
      const c = document.createElement('canvas'); c.width = 22; c.height = 22; c.className = 'ic';
      c.getContext('2d').drawImage(Sprites.icon({ id: id, q: 2, type: ITEMS[id].type }), 0, 0, 22, 22);
      s.appendChild(c);
    });
    right.querySelectorAll('[data-out]').forEach(s => {
      const c = document.createElement('canvas'); c.width = 26; c.height = 26; c.className = 'ic';
      if (r.out.gear) c.getContext('2d').drawImage(Sprites.icon(newGear(r.out.gear, r.out.lv, 4, 0)), 0, 0, 26, 26);
      else c.getContext('2d').drawImage(Sprites.icon({ id: r.out.item, q: 2, type: 'mat' }), 0, 0, 26, 26);
      s.appendChild(c);
    });
    this.bindTips(right, 'mat');
    const b1 = el('button', 'btn gold', '制作 1 次');
    const b10 = el('button', 'btn', '制作 10 次');
    b1.disabled = lacking || !canLv; b10.disabled = b1.disabled;
    b1.onclick = () => g.craftRecipe(r, 1);
    b10.onclick = () => g.craftRecipe(r, 10);
    right.appendChild(b1); right.appendChild(b10);
    if (!canLv) right.appendChild(el('div', 'mini', '　* 生活技能等级不足'));
    if (lacking) right.appendChild(el('div', 'mini', '　* 材料不足'));
  },
  refreshEnhance() {
    const g = this.game, p = g.player;
    const right = this._craftInfo;
    const options = [];
    EQP_ORDER.forEach(s => { if (p.equip[s]) options.push({ slot: s, it: p.equip[s] }); });
    p.bag.forEach((it, i) => { if (it && it.type === 'gear') options.push({ idx: i, it: it }); });
    const left = this._craftList; left.innerHTML = '';
    if (!this._enhSel || !options.find(o => o.it === this._enhSel)) this._enhSel = options[0] && options[0].it;
    options.forEach(o => {
      const d = el('div', 'ritem' + (this._enhSel === o.it ? ' on' : ''), '<span>' + gearFullName(o.it) + '</span><span class="no">+' + o.it.enhance + '</span>');
      d.onclick = () => { this._enhSel = o.it; this.refreshCraft(); this.openGear(o.it, {}); };
      left.appendChild(d);
    });
    const it = this._enhSel;
    if (!it) { right.innerHTML = '<div class="mini">没有可强化的装备</div>'; return; }
    const lv = it.enhance, cap = getQuality(it.q).enhCap;
    const rate = [100, 100, 95, 90, 85, 75, 65, 55, 45, 35, 25, 20, 15, 10, 5][Math.min(lv, 14)];
    const stoneId = lv >= 10 ? 4317 : 4316, stoneN = lv >= 13 ? 4 : lv >= 10 ? 3 : lv >= 6 ? 2 : 1;
    const cost = Math.round(it.lv * (lv >= 13 ? 1000 : lv >= 10 ? 800 : lv >= 8 ? 400 : lv >= 5 ? 150 : 100));
    let html = '<div style="font-size:14px;color:#ffd76a">' + gearTitle(it) + ' +' + lv + '</div>';
    html += '<div class="mini">主属性 ' + gearMainStat(it) + ' → ' + Math.round(gearMainStat(it) / (1 + lv * 0.05) * (1 + (lv + 1) * 0.05)) + '（下一级）</div>';
    html += '<div class="matRow">强化上限 +' + cap + '　成功率 <b class="ok">' + rate + '%</b></div>';
    html += '<div class="matRow">消耗 ' + this.tipMark(stoneId, ITEMS[stoneId].name) + '×' + stoneN + '（持有 ' + p.countItem(stoneId) + '）　金币 ' + fmt(cost) + '</div>';
    html += '<div class="matRow">保护石可选：' + this.tipMark(4318, ITEMS[4318].name) + '（持有 ' + p.countItem(4318) + '）</div>';
    html += '<div class="mini">' + (lv >= 6 && lv <= 10 ? '失败：-1 级' : lv >= 11 ? '失败：-2 级，5% 概率损坏（保护石可防止）' : '失败：无惩罚') + '</div>';
    right.innerHTML = html;
    this.bindTips(right, 'mat');
    const b = el('button', 'btn gold', '强化');
    b.onclick = () => g.enhance(it, rate, stoneId, stoneN, cost);
    right.appendChild(b);
    const bProt = el('button', 'btn', '使用保护石');
    bProt.disabled = p.countItem(4318) <= 0;
    bProt.onclick = () => { g.useProtectStone(it); this.refreshCraft(); };
    right.appendChild(bProt);
  },

  /* ---------- 天赋 ---------- */
  openTalent() {
    const p = this.panel('talent', '天赋树', 720, 520, 340, 40);
    const pl = this.game.player;
    p.body.innerHTML = '';
    const head = el('div', 'mini', '可用天赋点：<b style="color:#ffd76a">' + (pl.talentTotal() - pl.talentSpent()) + '</b> / ' + pl.talentTotal() +
      '　（重置消耗 ' + fmt(respecCost(pl.respecTimes)) + ' 金）');
    p.body.appendChild(head);
    const wrap = el('div', 'treeWrap');
    TALENT_TREES.forEach(t => {
      const col = el('div', 'tCol');
      col.appendChild(el('h4', '', t.icon + ' ' + t.name));
      talentsOf(t.key).forEach(n => {
        const l = pl.talentLevel(n.id);
        const preOk = !n.pre || pl.talentLevel(n.pre.id) >= n.pre.lv;
        const d = el('div', 'tNode' + (l >= n.max ? ' max' : '') + (!preOk ? ' lock' : ''),
          '<span class="n">' + n.name + '</span><span class="p">' + l + '/' + n.max + '</span><div class="d">' + n.desc + '</div>');
        d.onmouseenter = e => this.tipTalent(n, pl, e.clientX, e.clientY);
        d.onmousemove = e => this.tipTalent(n, pl, e.clientX, e.clientY);
        d.onmouseleave = () => this.tipHide('talent');
        d.onclick = () => {
          if (!preOk) { this.toast('前置未达成', '#ff9a9a'); return; }
          if (pl.talentSpent() + n.cost > pl.talentTotal()) { this.toast('天赋点不足', '#ff9a9a'); return; }
          if (l >= n.max) return;
          pl.talents[n.id] = l + 1; pl.recompute();
          this.openTalent(); if (this.panels.char) this.refreshChar();
        };
        col.appendChild(d);
      });
      wrap.appendChild(col);
    });
    p.body.appendChild(wrap);
    const b = el('button', 'btn', '重置天赋');
    b.onclick = () => {
      const cost = respecCost(pl.respecTimes);
      if (pl.gold < cost) { this.toast('金币不足', '#ff9a9a'); return; }
      pl.gold -= cost; pl.respecTimes++; pl.talents = {}; pl.recompute();
      this.openTalent(); if (this.panels.char) this.refreshChar();
      this.log('已重置天赋', '#ffdf94');
    };
    p.body.appendChild(b);
  },

  /* ---------- 生活技能 ---------- */
  openSkills() {
    const p = this.panel('skills', '生活技能', 520, 460, 420, 60);
    p.body.innerHTML = '';
    const pl = this.game.player;
    ['mine', 'log', 'herb', 'fish', 'bug'].forEach(k => {
      const s = pl.life[k], st = lifeStat(pl, k);
      const need = lifeExpToNext(s.lv);
      const d = el('div', '', '<div>' + SKILL_CN[k] + '　<b style="color:#ffd76a">Lv.' + s.lv + '</b>　<span class="mini">' +
        fmt(s.exp) + '/' + fmt(need) + '　采集 ' + fmt(st.cnt) + ' 次　总价 ' + fmt(st.val) + ' 金</span></div>');
      const bar = el('div', 'bar2'); const i2 = el('i'); i2.style.width = (s.exp / need * 100) + '%';
      bar.appendChild(i2); d.appendChild(bar);
      d.style.marginBottom = '6px';
      p.body.appendChild(d);
    });
    p.body.appendChild(el('div', 'lbl', '制作技能'));
    CRAFT_SKILLS.forEach(k => {
      const s = pl.life[k], st = lifeStat(pl, k);
      const need = lifeExpToNext(s.lv);
      const q = st.best ? getQuality(st.best) : null;
      const d = el('div', '', '<div>' + SKILL_CN[k] + '　<b style="color:#ffd76a">Lv.' + s.lv + '</b>　<span class="mini">' +
        fmt(s.exp) + '/' + fmt(need) + '　配方 ' + recipesOf(k).filter(r => r.req <= s.lv).length + '/' + recipesOf(k).length +
        '　制作 ' + fmt(st.cnt) + ' 次' + (q ? '　最高 ' + '<b style="color:' + q.color + '">' + q.name + '</b>' : '') + '</span></div>');
      const bar = el('div', 'bar2'); const i2 = el('i'); i2.style.width = (s.exp / need * 100) + '%';
      bar.appendChild(i2); d.appendChild(bar);
      d.style.marginBottom = '6px';
      p.body.appendChild(d);
    });
    const bRank = el('button', 'btn gold', '打开生活技能排行榜（L）');
    bRank.onclick = () => this.openRank();
    p.body.appendChild(bRank);
    const bCodex = el('button', 'btn', '打开内置数据库（P）');
    bCodex.onclick = () => this.openCodex();
    p.body.appendChild(bCodex);
    p.body.appendChild(el('div', 'mini', '提示：野外左键点击矿脉 / 树木 / 草药 / 虫巢 / 水面（或按 E）打开采集面板，可批量、定时或无限循环采集；手持对应工具效率更高。'));
  },

  /* ---------- 世界地图 / 传送 ---------- */
  openMap() {
    const p = this.panel('map', '大陆地图 · 传送', 700, 520, 300, 40);
    p.body.innerHTML = '';
    const row = el('div', 'rowline');
    const cvBox = el('div', '');
    const cv = document.createElement('canvas'); cv.id = 'mapCv'; cv.width = 480; cv.height = 480;
    cvBox.appendChild(cv); row.appendChild(cvBox);
    const side = el('div', 'mapSide');
    row.appendChild(side);
    p.body.appendChild(row);
    const x = cv.getContext('2d');
    const scale = 480 / WORLD_SIZE;
    x.fillStyle = '#05070f'; x.fillRect(0, 0, 480, 480);
    REGIONS.forEach(r => {
      x.fillStyle = r.pal.ground[0];
      x.fillRect(r.x0 * scale, r.y0 * scale, (r.x1 - r.x0) * scale, (r.y1 - r.y0) * scale);
      x.strokeStyle = 'rgba(255,215,106,.25)'; x.strokeRect(r.x0 * scale, r.y0 * scale, (r.x1 - r.x0) * scale, (r.y1 - r.y0) * scale);
      x.fillStyle = '#fff'; x.font = '11px sans-serif';
      x.fillText(r.name, r.x0 * scale + 6, r.y0 * scale + 16);
    });
    const pl = this.game.player;
    REGIONS.forEach(r => {
      const unlocked = !!pl.unlockedRegions[r.key] || pl.lv >= r.lv[0];
      const d = el('div', 'mItem' + (unlocked ? '' : ' lock'), '<div>' + r.name + '</div><div class="mini">Lv.' + r.lv[0] + '-' + r.lv[1] + '</div>');
      d.onclick = () => {
        if (!unlocked) { this.toast('等级不足或未解锁', '#ff9a9a'); return; }
        this.game.travelTo(r);
      };
      side.appendChild(d);
    });
    // 玩家位置
    const drawMark = () => {
      x.fillStyle = '#ff3a5a';
      x.fillRect(pl.x / TILE_PX * scale - 3, pl.y / TILE_PX * scale - 3, 6, 6);
    };
    drawMark();
    cv.onclick = e => {
      const rect = cv.getBoundingClientRect();
      const tx = (e.clientX - rect.left) / rect.width * WORLD_SIZE;
      const ty = (e.clientY - rect.top) / rect.height * WORLD_SIZE;
      const r = regionAtTile(Math.floor(tx), Math.floor(ty));
      if (!pl.unlockedRegions[r.key] && pl.lv < r.lv[0]) { this.toast(r.name + ' 等级不足', '#ff9a9a'); return; }
      this.game.travelTo(r);
    };
  },

  /* ---------- 资源导航地图（Tab） ---------- */
  ovKindColor(skill) {
    return { mine: '#9fd0ff', log: '#7fdba4', herb: '#ffd76a', bug: '#ff9ac0', fish: '#7fe8ff' }[skill] || '#ffffff';
  },
  ovKindCN(skill) {
    return { mine: '矿脉', log: '林木', herb: '草药', bug: '虫巢', fish: '渔点' }[skill] || '资源';
  },
  ensureOvControls() {
    if (this._ovInited) return;
    this._ovInited = true;
    this._ovRad = this._ovRad || 60;
    this._ovFilter = this._ovFilter || 'all';
    const tabs = $('ovTabs');
    [['all', '全部'], ['mine', '矿脉'], ['log', '林木'], ['herb', '草药'], ['bug', '虫巢'], ['fish', '渔点']].forEach(t => {
      const d = el('div', 'tab' + (this._ovFilter === t[0] ? ' on' : ''), t[1]);
      d.dataset.k = t[0];
      d.onclick = () => {
        this._ovFilter = t[0];
        tabs.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.k === t[0]));
        this.buildOvList(); this.drawOverview();
      };
      tabs.appendChild(d);
    });
    const ranges = $('ovRanges');
    [[40, '近 40 格'], [80, '中 80 格'], [160, '远 160 格']].forEach(r => {
      const d = el('button', 'btn' + (this._ovRad === r[0] ? ' gold' : ''), r[1]);
      d.dataset.r = String(r[0]);
      d.onclick = () => {
        this._ovRad = r[0];
        ranges.querySelectorAll('.btn').forEach(x => x.classList.toggle('gold', x.dataset.r === String(r[0])));
        this.scanOverview();
      };
      ranges.appendChild(d);
    });
    $('ovClose').onclick = () => this.closeOverview();
    $('ovRefresh').onclick = () => this.scanOverview();
    $('ovCv').onclick = e => {
      const cv = $('ovCv'), rect = cv.getBoundingClientRect(), v = this._ovView;
      if (!v) return;
      const px = (e.clientX - rect.left) / rect.width * cv.width;
      const py = (e.clientY - rect.top) / rect.height * cv.height;
      const tx = Math.round(v.cx - v.rad + px / v.scale), ty = Math.round(v.cy - v.rad + py / v.scale);
      // 若点附近 3 格内有资源点，优先吸附到该资源
      let best = null, bd = 3;
      for (const it of (this._ovListRaw || [])) {
        const d = Math.hypot(it.tx - tx, it.ty - ty);
        if (d < bd) { bd = d; best = it; }
      }
      this.game.autoTravel(best ? best.tx : tx, best ? best.ty : ty, best ? best.name : null);
      this.closeOverview();
    };
  },
  toggleOverview() {
    this.ensureOvControls();
    if (this.isOverviewOpen()) this.closeOverview(); else this.openOverview();
  },
  openOverview() {
    this.ensureOvControls();
    const g = this.game;
    if (g.inHome) { this.toast('家园为独立空间，无法导航野外资源', '#ff9a9a'); return; }
    $('ovOverlay').classList.remove('hide');
    $('ovOverlay').style.display = '';
    /* 左地图 / 右列表：左右可拖拽（地图画布保底 600px，右侧列表最少 220px） */
    if (typeof Splitter !== 'undefined') {
      const bd = document.querySelector('.ovBody');
      if (bd && !bd._sp) Splitter.attach(bd, { dir: 'x', key: 'ov.main', min1: 600, max1: 900, min2: 200, def: 0.66 });
      else if (bd && bd._sp) bd._sp.relayout();
    }
    this.scanOverview();
  },
  closeOverview() {
    const b = $('ovOverlay');
    if (b) b.classList.add('hide');
    this._ovHi = null;
    this.tipHide('ov');
  },
  /** 扫描范围内真实存在的采集资源点 */
  scanOverview() {
    const g = this.game;
    this._ovListRaw = g.scanResources(this._ovRad);
    const p = g.player;
    this._ovScanAt = { cx: Math.floor(p.x / TILE_PX), cy: Math.floor(p.y / TILE_PX) };
    this.buildOvList();
    this.drawOverview();
  },
  buildOvList() {
    const side = $('ovSide'); if (!side) return;
    const list = (this._ovListRaw || []).filter(it => this._ovFilter === 'all' || it.skill === this._ovFilter);
    const p = this.game.player;
    side.innerHTML = '';
    if (!list.length) {
      side.appendChild(el('div', 'mini', '范围内没有发现资源点，试着扩大扫描范围。'));
      $('ovFoot').textContent = '共 0 处';
      return;
    }
    const max = 60;
    list.slice(0, max).forEach(it => {
      const ok = p.life[it.skill].lv >= (it.req || 1);
      const d = el('div', 'resItem' + (ok ? '' : ' lock'),
        '<span class="rn" style="color:' + this.ovKindColor(it.skill) + '">' + it.name + '</span>' +
        '<span class="rc">(' + it.tx + ', ' + it.ty + ')</span>' +
        '<span class="rd">' + this.ovKindCN(it.skill) + ' · ' + it.d + ' 格' +
        (ok ? '' : ' · <b class="bad">需 Lv.' + it.req + '</b>') + '</span>');
      d.onmouseenter = e => { this._ovHi = it; this.drawOverview(); this.tipNode(it.nd, e.clientX, e.clientY); };
      d.onmousemove = e => { this.tipNode(it.nd, e.clientX, e.clientY); };
      d.onmouseleave = () => { if (this._ovHi === it) { this._ovHi = null; this.drawOverview(); } this.tipHide('node'); };
      d.onclick = () => { this.game.autoTravel(it.tx, it.ty, it.name); this.closeOverview(); };
      side.appendChild(d);
    });
    $('ovFoot').textContent = '范围内共 ' + list.length + ' 处' + (list.length > max ? '（显示最近 ' + max + ' 处）' : '') +
      '　·　左键点击列表或地图即可自动前往';
  },
  /** 绘制以玩家为中心的地形 + 资源分布 */
  drawOverview() {
    const cv = $('ovCv'); if (!cv) return;
    const x = cv.getContext('2d');
    const g = this.game, p = g.player, S = cv.width;
    const cx = Math.floor(p.x / TILE_PX), cy = Math.floor(p.y / TILE_PX);
    const rad = this._ovRad;
    const scale = S / (rad * 2 + 1);
    this._ovView = { cx: cx, cy: cy, rad: rad, scale: scale };
    x.fillStyle = '#05070f'; x.fillRect(0, 0, S, S);
    // 地形（缓存：玩家移动超过 4 格才重建，避免每帧噪声计算）
    const key = Math.floor(cx / 4) + '_' + Math.floor(cy / 4) + '_' + rad;
    if (this._ovTerrainKey !== key) {
      this._ovTerrainKey = key;
      this._ovTerrain = this.bakeOvTerrain(cx, cy, rad);
    }
    if (this._ovTerrain) x.drawImage(this._ovTerrain, 0, 0);
    // 区域分界线 + 名称
    const toPx = (tx, ty) => [(tx - (cx - rad)) * scale, (ty - (cy - rad)) * scale];
    x.font = '11px sans-serif';
    REGIONS.forEach(r => {
      const a = toPx(r.x0, r.y0);
      x.strokeStyle = 'rgba(255,215,106,.28)'; x.lineWidth = 1;
      x.strokeRect(a[0], a[1], (r.x1 - r.x0) * scale, (r.y1 - r.y0) * scale);
      if (a[0] > -80 && a[0] < S && a[1] > -20 && a[1] < S) {
        x.fillStyle = 'rgba(255,255,255,.75)';
        x.fillText(r.name, Math.max(2, a[0] + 4), Math.max(12, a[1] + 14));
      }
    });
    // 资源点
    const list = (this._ovListRaw || []).filter(it => this._ovFilter === 'all' || it.skill === this._ovFilter);
    for (const it of list) {
      const q = toPx(it.tx, it.ty);
      x.fillStyle = this.ovKindColor(it.skill);
      x.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
      if (this._ovHi === it) {
        x.strokeStyle = '#ffffff'; x.lineWidth = 2;
        x.strokeRect(q[0] - 5, q[1] - 5, 10, 10);
      }
    }
    if (this._ovHi) {
      const q = toPx(this._ovHi.tx, this._ovHi.ty);
      x.fillStyle = '#fff'; x.font = '11px sans-serif'; x.textAlign = 'center';
      x.fillText(this._ovHi.name, clamp(q[0], 30, S - 30), clamp(q[1] - 8, 12, S - 4));
      x.textAlign = 'left';
    }
    // 自动前往目标
    if (g.route) {
      const q = toPx(g.route.tx, g.route.ty);
      x.strokeStyle = '#ff54e0'; x.lineWidth = 2;
      x.beginPath(); x.arc(q[0], q[1], 7, 0, 6.28); x.stroke();
    }
    // 玩家（始终居中）
    const pc = rad * scale + scale / 2;
    x.fillStyle = '#ff3a5a';
    x.beginPath(); x.arc(pc, pc, 4, 0, 6.28); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 1; x.stroke();
    // 比例尺
    x.fillStyle = 'rgba(255,255,255,.6)';
    const ten = Math.round(10 / (rad * 2 + 1) * S / 10) * 10;
    x.fillRect(8, S - 14, ten, 2);
    x.fillText('10 格', 8 + ten + 4, S - 9);
  },
  bakeOvTerrain(cx, cy, rad) {
    const S = 600, M = 150;                    // 采样 150×150，与具体格数无关
    const o = CV(S, S), x = o.x;
    const w = this.game.world;
    const step = (rad * 2 + 1) / M;
    const bs = S / M;
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < M; i++) {
        const tx = Math.round(cx - rad + i * step), ty = Math.round(cy - rad + j * step);
        if (tx < 0 || ty < 0 || tx >= WORLD_SIZE || ty >= WORLD_SIZE) continue;
        const info = w.tileInfo(tx, ty);
        const pal = info.r.pal;
        x.fillStyle = info.water ? (pal.water || '#2f7fbf')
          : info.mountain ? (pal.mountain || '#6b6b60')
            : pal.ground[info.variant % pal.ground.length];
        x.fillRect(i * bs, j * bs, bs + 1, bs + 1);
      }
    }
    return o.c;
  },
  tickOverview(dt) {
    if (!this.isOverviewOpen()) return;
    this._ovTick = (this._ovTick || 0) + dt;
    if (this._ovTick < 0.6) return;
    this._ovTick = 0;
    const p = this.game.player;
    const cx = Math.floor(p.x / TILE_PX), cy = Math.floor(p.y / TILE_PX);
    if (!this._ovScanAt || Math.abs(cx - this._ovScanAt.cx) > 24 || Math.abs(cy - this._ovScanAt.cy) > 24) this.scanOverview();
    else { this.buildOvList(); this.drawOverview(); }
  },

  /* ---------- 内置数据库（图鉴） ---------- */
  openCodex() {
    const p = this.panel('codex', '内置数据库 · 图鉴', 880, 580, 180, 24);
    p.body.innerHTML = '';
    this._codexTab = this._codexTab || 'item';
    const head = el('div', 'codHead');
    const search = document.createElement('input');
    search.className = 'numInput codSearch';
    search.placeholder = '搜索名称 / 物品 ID / 材料成分…';
    search.value = this._codexKw || '';
    search.oninput = () => { this._codexKw = search.value; this.renderCodex(); };
    head.appendChild(search);
    const tabs = el('div', 'tabs');
    [['item', '物资'], ['gear', '装备'], ['monster', '怪物'], ['recipe', '配方'], ['region', '大区']].forEach(t => {
      const b = el('div', 'tab' + (this._codexTab === t[0] ? ' on' : ''), t[1]);
      b.onclick = () => { this._codexTab = t[0]; this._codexKw = search.value; this.openCodex(); };
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
    this._codexCount = el('div', 'mini', '');
    head.appendChild(this._codexCount);
    p.body.appendChild(head);
    this._codexList = el('div', 'codList');
    p.body.appendChild(this._codexList);
    this.renderCodex();
  },
  renderCodex() {
    const list = this._codexList; if (!list) return;
    const pl = this.game.player;
    const kw = this._codexKw || '', tab = this._codexTab;
    list.innerHTML = '';
    const paintIcons = () => {
      list.querySelectorAll('[data-cic]').forEach(s => {
        const id = +s.dataset.cic;
        const c = document.createElement('canvas'); c.width = 26; c.height = 26; c.className = 'ic';
        try {
          const inst = ITEMS[id].type === 'gear'
            ? newGear(id, ITEMS[id].lv || 1, 2, 0)
            : { id: id, q: 2, type: ITEMS[id].type };
          c.getContext('2d').drawImage(Sprites.icon(inst), 0, 0, 26, 26);
        } catch (e) { }
        s.appendChild(c);
      });
    };
    const matRow = (d, extra, tipFn) => {
      const known = !!pl.seen[d.id];
      const src = itemSources(d.id);
      const row = el('div', 'codRow' + (known ? '' : ' un'),
        '<span data-cic="' + d.id + '"></span>' +
        '<b>' + d.name + '</b>' +
        '<span class="tag">' + codexTypeCN(d) + '</span>' +
        '<span class="mini">' + (ITEMS[d.id].price ? '单价 ' + fmt(ITEMS[d.id].price) + ' 金' : '') + '</span>' +
        '<span class="mini">持有 ' + pl.countItem(d.id) + '</span>' +
        '<span class="src mini">' + (extra || src[0] || '暂无已知来源') + '</span>');
      row.onmouseenter = e => tipFn(e.clientX, e.clientY);
      row.onmousemove = e => tipFn(e.clientX, e.clientY);
      row.onmouseleave = () => this.tipHide('codex');
      list.appendChild(row);
    };

    if (tab === 'monster') {
      const ms = codexMonsters(kw);
      ms.forEach(m => {
        const mul = DROP_TIER_MUL[m.tier] || 0.35;
        const t = m.tpl;
        const drops = (t.drop || []).map(d => ITEMS[d.id].name + ' ' + Math.round(d.p * mul * 100) + '%');
        const parts = (MOB_PARTS[t.shape] || []).map(d => ITEMS[d.id].name);
        const row = el('div', 'codRow' + (pl.stat.kills > 0 || true ? '' : ' un'),
          '<b>' + (TYPE_CN[m.tier] ? TYPE_CN[m.tier] + '·' : '') + t.name + '</b>' +
          '<span class="tag">' + (m.tier === 'normal' ? '普通' : TYPE_CN[m.tier]) + '</span>' +
          '<span class="mini">' + m.region.name + ' Lv.' + m.region.lv[0] + '-' + m.region.lv[1] + '</span>' +
          '<span class="src mini">' + (parts.length ? '取材：' + parts.join('、') : '') +
          (drops.length ? (parts.length ? '　' : '') + '掉落：' + drops.join('、') : '') + '</span>');
        row.onmouseenter = e => this.tipMonster(m, e.clientX, e.clientY);
        row.onmousemove = e => this.tipMonster(m, e.clientX, e.clientY);
        row.onmouseleave = () => this.tipHide('mon');
        list.appendChild(row);
      });
      this._codexCount.textContent = '怪物 ' + ms.length + ' 条　（悬停查看属性 / 取材 / 掉落明细）';
      return;
    }
    if (tab === 'recipe') {
      const rs = codexRecipes(kw);
      rs.forEach(r => {
        const row = el('div', 'codRow',
          '<b>' + r.name + '</b>' +
          '<span class="tag">' + SKILL_CN[r.skill] + ' Lv.' + r.req + '</span>' +
          '<span class="mini">成功率 ' + Math.round(r.rate * 100) + '%　' + r.time + 's</span>' +
          '<span class="src mini">材料：' + r.mats.map(m => this.tipMark(m.id) + '×' + m.n).join('、') + '　产出：' +
          (r.out.gear ? this.tipMark(r.out.gear) : this.tipMark(r.out.item) + '×' + r.out.n) + '</span>');
        row.onmouseenter = e => this.tipRecipe(r, e.clientX, e.clientY);
        row.onmousemove = e => this.tipRecipe(r, e.clientX, e.clientY);
        row.onmouseleave = () => this.tipHide('rec');
        list.appendChild(row);
        this.bindTips(row, 'codex');
      });
      paintIcons();
      this._codexCount.textContent = '配方 ' + rs.length + ' 条　（共 ' + RECIPES.length + ' 条）';
      return;
    }
    if (tab === 'region') {
      codexRegionRes().forEach(c => {
        const row = el('div', 'codRow tall',
          '<b>' + c.region.name + '</b>' +
          '<span class="tag">Lv.' + c.lv[0] + '-' + c.lv[1] + '</span>' +
          '<span class="mini">' + c.desc + '</span>' +
          c.res.map(g => '<span class="src mini">' + SKILL_CN[g.skill] + '：' +
            g.items.map(i => this.tipMark(i.id) + '(Lv.' + i.lv + ')').join('、') + '</span>').join('') +
          (c.fish.length ? '<span class="src mini">渔获：' + c.fish.map(f => this.tipMark(f.id)).join('、') + '</span>' : ''));
        list.appendChild(row);
        this.bindTips(row, 'codex');
      });
      paintIcons();
      this._codexCount.textContent = '大区 ' + REGIONS.length + ' 个　（资源 / 渔获悬停可查看来源）';
      return;
    }
    // 物资 / 装备
    const items = (tab === 'gear' ? codexItems('gear', kw) : codexItems('all', kw).filter(i => i.type !== 'gear'));
    items.forEach(d => matRow(d, null, (x, y) => this.tipMat(d.id, x, y, 'codex')));
    paintIcons();
    let known = 0;
    for (const id in pl.seen) if (ITEMS[id]) known++;
    this._codexCount.textContent = '共 ' + items.length + ' 条　已发现 ' + known + ' / ' + Object.keys(ITEMS).length + ' 件物资';
  },

  /* ---------- 生活技能排行榜 ---------- */
  openRank() {
    const p = this.panel('rank', '生活技能排行榜', 780, 580, 250, 26);
    p.body.innerHTML = '';
    this._rankG = this._rankG || 'cnt';
    this._rankC = this._rankC || 'cnt';
    this._rankBody = el('div', 'rkBody');
    p.body.appendChild(this._rankBody);
    this.renderRank();
  },
  renderRank() {
    const box = this._rankBody; if (!box) return;
    const pl = this.game.player;
    box.innerHTML = '';
    const rows = lifeRanking(pl);
    const seenMap = pl.seen || {};
    const sumCnt = rows.reduce((a, r) => a + r.cnt, 0);
    const sumVal = rows.reduce((a, r) => a + r.val, 0);
    const best = rows.reduce((a, r) => Math.max(a, r.best || 0), 0);
    box.appendChild(el('div', 'rkSum',
      '<span>采集总次数 <b>' + fmt(pl.stat.gathers) + '</b></span>' +
      '<span>采集总产值 <b style="color:#ffdf94">' + fmt(sumVal) + ' 金</b></span>' +
      '<span>制作总次数 <b>' + fmt(pl.stat.crafts) + '</b></span>' +
      '<span>图鉴发现 <b>' + Object.keys(seenMap).filter(id => ITEMS[id]).length + ' / ' + Object.keys(ITEMS).length + '</b></span>' +
      (best ? '<span>生涯最高品质 <b style="color:' + getQuality(best).color + '">' + getQuality(best).name + '</b></span>' : '')));

    const metricBtns = (list, cur, set) => {
      const wrap = el('div', 'ranges');
      list.forEach(m => {
        const b = el('button', 'btn' + (cur === m.key ? ' gold' : ''), '按' + m.name);
        b.onclick = () => { set(m.key); this.renderRank(); };
        wrap.appendChild(b);
      });
      return wrap;
    };
    const medal = r => r === 1 ? 'rkNo rk1' : r === 2 ? 'rkNo rk2' : r === 3 ? 'rkNo rk3' : 'rkNo';

    // 采集榜
    box.appendChild(el('div', 'rkTitle', '采集类'));
    box.appendChild(metricBtns(GATHER_METRICS, this._rankG, k => this._rankG = k));
    rankBy(rows, this._rankG, 'gather').forEach(s => {
      const need = lifeExpToNext(s.lv);
      const avg = s.cnt ? Math.round(s.val / s.cnt) : 0;
      const row = el('div', 'rkRow',
        '<span class="' + medal(s.rank) + '">' + s.rank + '</span>' +
        '<b class="rkn">' + SKILL_CN[s.skill] + '</b>' +
        '<span class="rkv">Lv.<b style="color:#ffd76a">' + s.lv + '</b> <span class="mini">' + fmt(s.exp) + '/' + fmt(need) + '</span></span>' +
        '<span class="rkv">采集次数 <b>' + fmt(s.cnt) + '</b></span>' +
        '<span class="rkv">采集总价 <b style="color:#ffdf94">' + fmt(s.val) + '</b> 金' + (avg ? ' <span class="mini">均价 ' + fmt(avg) + '</span>' : '') + '</span>' +
        '<div class="bar2"><i style="width:' + (s.exp / need * 100) + '%"></i></div>');
      box.appendChild(row);
    });
    // 制作榜
    box.appendChild(el('div', 'rkTitle', '制作类'));
    box.appendChild(metricBtns(CRAFT_METRICS, this._rankC, k => this._rankC = k));
    rankBy(rows, this._rankC, 'craft').forEach(s => {
      const need = lifeExpToNext(s.lv);
      const q = s.best ? getQuality(s.best) : null;
      const row = el('div', 'rkRow',
        '<span class="' + medal(s.rank) + '">' + s.rank + '</span>' +
        '<b class="rkn">' + SKILL_CN[s.skill] + '</b>' +
        '<span class="rkv">Lv.<b style="color:#ffd76a">' + s.lv + '</b> <span class="mini">' + fmt(s.exp) + '/' + fmt(need) + '</span></span>' +
        '<span class="rkv">制作次数 <b>' + fmt(s.cnt) + '</b></span>' +
        '<span class="rkv">最高品质 ' + (q ? '<b style="color:' + q.color + '">' + q.name + '</b>' + (s.bestName ? ' <span class="mini">' + s.bestName + '</span>' : '') : '<span class="mini">尚未出品</span>') + '</span>' +
        '<div class="bar2"><i style="width:' + (s.exp / need * 100) + '%"></i></div>');
      box.appendChild(row);
    });
    box.appendChild(el('div', 'mini', '排行按当前排序实时统计（采集次数含批量采集与家园收获；总价按获得瞬间的物品估价累加）。'));
  },

  /* ================= 世界频道 ================= */
  buildChat() {
    this.elChatMsgs = $('chatMsgs'); this.elChatInput = $('chatInput'); this.elChatCh = $('chatCh');
    if (!this.elChatMsgs) return;
    $('chatSend').onclick = () => this.sendChat();
    $('chatToggle').onclick = () => $('chatWrap').classList.toggle('fold');
    // 输入框内的按键不要触发游戏快捷键
    this.elChatInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') this.sendChat();
    });
    Chat.onChange = () => this.renderChat();
    Chat.system('欢迎来到星落大陆！按 Enter 发言；装备面板可「发送链接」分享战力。');
    this.renderChat();
  },
  focusChat() {
    if (!this.elChatInput) return;
    const w = $('chatWrap'); if (w) w.classList.remove('fold');
    this.elChatInput.focus();
  },
  sendChat() {
    if (!this.elChatInput) return;
    const p = this.game.player;
    const raw = this.elChatInput.value.trim();
    if (!raw) { this.elChatInput.blur(); return; }
    this.elChatInput.value = '';
    const m = raw.match(/^#(\d+)$/);
    if (m) {                                  // #索引 = 发送背包内该件装备
      const it = p.bag[+m[1]];
      if (it && it.type === 'gear') {
        Chat.sayGear(p.name, this.elChatCh.value, it);
        this.elChatInput.blur();
        return;
      }
    }
    Chat.say(p.name, this.elChatCh.value, raw);
    this.elChatInput.blur();
  },
  renderChat() {
    const box = this.elChatMsgs; if (!box) return;
    box.innerHTML = '';
    Chat.msgs.slice(-60).forEach(m => {
      const d = el('div', 'cmsg' + (m.self ? ' self' : '') + (m.sys ? ' sys' : ''), '');
      d.appendChild(el('span', 'cwho', '[' + (m.ch || '世界') + '] ' + m.who + '：'));
      if (m.text) d.appendChild(el('span', '', m.text));
      if (m.link) {
        const inst = m.link.t === 'item'
          ? { uid: 0, type: ITEMS[m.link.id] ? ITEMS[m.link.id].type : 'mat', id: m.link.id, q: m.link.q || 2, n: m.link.n || 1, lv: ITEMS[m.link.id] ? (ITEMS[m.link.id].lv || 1) : 1, _isLink: true }
          : gearFromLink(m.link);
        m._inst = inst; inst._owner = m.who; inst._isLink = true;
        const q = getQuality(inst.q);
        const label = inst.type === 'gear'
          ? gearTitle(inst) + (inst.enhance ? ' +' + inst.enhance : '')
          : itemFullLabel(inst) + ((inst.n || 1) > 1 ? ' ×' + inst.n : '');
        const lk = el('span', 'cLink', '[' + label + ']');
        lk.style.color = q.color;
        lk.title = '左键查看物品信息面板';
        lk.onmouseenter = e => this.tipInst(inst, e.clientX, e.clientY, 'link');
        lk.onmousemove = e => this.tipInst(inst, e.clientX, e.clientY, 'link');
        lk.onmouseleave = () => this.tipHide('link');
        lk.onclick = ev => {
          ev.stopPropagation();
          this.openItem(inst, { link: true, owner: m.who });
        };
        d.appendChild(lk);
      }
      box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
  },

  /* ================= 物品信息面板（装备 / 材料 / 消耗品通用） ================= */
  /** 左键点击任何物品（背包 / 装备栏 / 聊天链接）都打开此面板 */
  openItem(inst, opts) {
    if (!inst) return;
    opts = opts || {};
    const p = this.game.player;
    if (!opts.link) {
      const idx = p.bag.indexOf(inst);
      if (idx >= 0) opts.bagIdx = idx;
      else if (inst.type === 'gear') {
        const slot = ITEMS[inst.id].slot;
        if (p.equip[slot] === inst) { opts.slot = slot; opts.equipped = true; }
      }
    }
    opts._sellMode = opts._sellMode || false;
    this._gearCtx = { inst: inst, opts: opts };
    const title = inst.type === 'gear' ? '装备详情 · ' + gearFullName(inst) : '物品详情 · ' + itemFullLabel(inst);
    const pan = this.panel('gear', title, 640, 620, 320, 30);
    pan.body.innerHTML = '';
    pan.body.style.overflow = 'auto';
    this.renderGear();
    return pan;
  },
  openGear(inst, opts) { return this.openItem(inst, opts); },
  renderGear() {
    const ctx = this._gearCtx;
    if (!ctx || !this.panels.gear) return;
    const inst = ctx.inst, opts = ctx.opts, g = this.game, p = g.player;
    const pan = this.panels.gear;
    if (pan.el.style.display === 'none') return;
    pan.body.innerHTML = '';
    if (opts.marketLid === undefined && this.isGearGone(inst)) {
      pan.body.innerHTML = '<div class="mini">该物品已不在你的背包 / 装备栏中。</div>'; return;
    }
    const def = ITEMS[inst.id], q = getQuality(inst.q);
    const isLink = !!opts.link;
    const isGear = inst.type === 'gear';
    const count = inst.type === 'gear' ? 1 : (inst.n || 1);

    /* ---------- 头部 ---------- */
    const head = el('div', 'gHead');
    const ic = el('span', 'gIcon');
    head.appendChild(ic);
    const info = el('div', 'gInfo');
    let headHtml = '<div class="gName" style="color:' + q.color + '">' +
      (isGear ? gearTitle(inst) + (inst.enhance > 0 ? ' +' + inst.enhance : '') : itemFullLabel(inst) + (count > 1 ? ' ×' + count : '')) + '</div>';
    if (isGear) {
      const rk = gearRank(inst);
      headHtml += '<div class="mini">' + SLOT_CN[def.slot] + '　等级需求 Lv.' + inst.lv + '　' + q.name +
        (inst.reroll ? '　洗练 ' + inst.reroll + ' 次' : '') + (isLink ? '　来自：' + (opts.owner || '他人') : '') + '</div>' +
        '<div class="tr">装备战力 <b style="color:#ff9a9a">' + fmt(gearPower(inst)) + '</b>' +
        '　装备评分 <b style="color:#ffd76a">' + fmt(gearScore(inst)) + '</b>' +
        '　<b style="color:' + rk.color + '">' + rk.name + '</b>（' + rk.ratio.toFixed(2) + '× 期望值）</div>' +
        '<div class="mini">期望评分 ' + fmt(Math.round(gearExpectedScore(inst))) + '　估价 ' + fmt(gearValue(inst)) + ' 金</div>';
    } else {
      headHtml += '<div class="mini">' + codexTypeCN(def) + '（' + codexSubCN(def) + '）　品质 ' + q.name +
        (def.lv ? '　等级需求 Lv.' + def.lv : '') + (isLink ? '　来自：' + (opts.owner || '他人') : '') + '</div>' +
        '<div class="tr">持有 <b style="color:#9fd06a">' + (p.countItem(inst.id) || 0) + '</b>' +
        '　单价 <b style="color:#ffdf94">' + fmt(itemPrice(inst)) + ' 金</b>' +
        '　合计 <b style="color:#ffdf94">' + fmt(itemPrice(inst) * count) + ' 金</b>' +
        (def.stack > 1 ? '　堆叠上限 ' + def.stack : '') + '</div>';
    }
    info.innerHTML = headHtml;
    head.appendChild(info);
    pan.body.appendChild(head);
    try {
      const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.className = 'ic';
      c.getContext('2d').drawImage(Sprites.icon(inst), 0, 0, 40, 40);
      ic.appendChild(c);
    } catch (e) { }

    /* ---------- 详细说明 ---------- */
    pan.body.appendChild(el('div', 'lbl', '详细说明'));
    const det = el('div', 'gDetail');
    if (def.desc) det.appendChild(el('div', 'gDesc', def.desc));
    itemDetailLines(inst.id).forEach(s => det.appendChild(el('div', 'gRow', s)));
    pan.body.appendChild(det);

    /* ---------- 装备属性 / 养成 ---------- */
    if (isGear) {
      pan.body.appendChild(el('div', 'lbl', '属性'));
      const stat = el('div', 'gStats');
      gearDisplayLines(inst).forEach(l => stat.appendChild(el('div', 'gRow', '<span>' + l.t + '</span><b>' + l.v + '</b>')));
      pan.body.appendChild(stat);
      if (!isLink && opts.marketLid === undefined) {        // 拍卖行挂单不能强化/洗练/打孔
        pan.body.appendChild(this.gearEnhanceBlock(inst));
        pan.body.appendChild(this.gearRerollBlock(inst));
        pan.body.appendChild(this.gearSocketBlock(inst));
      }
    }

    /* ---------- 操作区 ---------- */
    pan.body.appendChild(el('div', 'lbl', '操作'));
    const ops = el('div', 'btnRow');
    if (!isLink && opts.marketLid === undefined) {         // 拍卖行挂单只可购买/下架
      if (isGear) {
        if (opts.equipped) {
          const b = el('button', 'btn', '卸下');
          b.onclick = () => { p.unequip(opts.slot); this.closeGearPanel(); this.afterGearChange(); this.log('卸下：' + gearFullName(inst)); };
          ops.appendChild(b);
        } else {
          const b = el('button', 'btn gold', '装备');
          b.onclick = () => { if (opts.bagIdx === undefined) return; p.equipItem(opts.bagIdx); this.closeGearPanel(); this.afterGearChange(); this.log('装备：' + gearFullName(inst)); };
          ops.appendChild(b);
        }
      } else if (inst.type === 'use') {
        const b = el('button', 'btn gold', '使用');
        b.onclick = () => { this.useItem(opts.bagIdx); this.closeGearPanel(); };
        ops.appendChild(b);
      } else if (inst.type === 'seed' && g.inHome) {
        const b = el('button', 'btn gold', '在家园播种');
        b.onclick = () => { g.tryPlantHome(inst); this.refreshBag(); };
        ops.appendChild(b);
      }
    }
    const bLink = el('button', 'btn', '发送至聊天窗');
    bLink.onclick = () => {
      const ch = $('chatCh') ? $('chatCh').value : '世界';
      if (isGear) Chat.sayGear(p.name, ch, inst, '');
      else Chat.sayItem(p.name, ch, inst, '');
      const w = $('chatWrap'); if (w) w.classList.remove('fold');
      this.toast('物品信息已发送到频道', '#9fe8ff');
    };
    ops.appendChild(bLink);
    if (isGear) {
      const curS = p.equip[def.slot];
      if (curS && curS !== inst) {
        const bCmp = el('button', 'btn', '与已装备对比');
        bCmp.onclick = () => this.openCompare(inst, curS, '候选', '当前装备');
        ops.appendChild(bCmp);
      }
    }
    pan.body.appendChild(ops);

    /* ---------- 拍卖行挂单：购买 / 下架 ---------- */
    if (opts.marketLid !== undefined) {
      const lt = Market.get(opts.marketLid);
      if (!lt) {
        pan.body.appendChild(el('div', 'mini', '该挂单已被买走或已下架。'));
        this.toast('该挂单已不存在', '#ff9a9a');
      } else {
        const total = Market.totalOf(lt);
        const cnt = lt.inst.type === 'gear' ? 1 : (lt.inst.n || 1);
        const trade = el('div', 'gBlock');
        trade.appendChild(el('div', 'lbl', '拍卖行'));
        trade.appendChild(el('div', 'matRow',
          '卖家 <b>' + lt.seller + '</b>　单价 <b style="color:#ffdf94">' + fmt(lt.unit) + ' 金</b>' +
          '　数量 <b>' + fmt(cnt) + '</b>　总价 <b style="color:#ffdf94">' + fmt(total) + ' 金</b>' +
          '　（成交扣 ' + Math.round(MARKET_TAX * 100) + '% 手续费）　持有金币 ' + fmt(p.gold)));
        const rowM = el('div', 'btnRow');
        if (lt.mine) {
          const bCancel = el('button', 'btn', '下架取回');
          bCancel.onclick = () => {
            const r = Market.cancel(lt.lid, p);
            this.toast(r.msg, r.ok ? '#9fd06a' : '#ff9a9a');
            this.refreshBag();
            this.closeGearPanel();
            this.renderMarket();
          };
          rowM.appendChild(bCancel);
        } else {
          const bBuy = el('button', 'btn gold', '购买（' + fmt(total) + ' 金）');
          bBuy.disabled = p.gold < total;
          bBuy.onclick = () => {
            const r = Market.buy(lt.lid, p);
            this.toast(r.msg, r.ok ? '#9fd06a' : '#ff9a9a');
            this.log('拍卖行：' + r.msg, r.ok ? '#ffd76a' : '#ff9a9a');
            this.refreshBag();
            if (r.ok) this.closeGearPanel();
            this.renderMarket();
          };
          rowM.appendChild(bBuy);
        }
        const bBack = el('button', 'btn', '返回拍卖行 (Y)');
        bBack.onclick = () => { this.closeGearPanel(); this.openMarket(); };
        rowM.appendChild(bBack);
        trade.appendChild(rowM);
        pan.body.appendChild(trade);
      }
    }

    if (!isLink && opts.bagIdx === undefined && opts.marketLid === undefined) {
      pan.body.appendChild(el('div', 'mini', '已穿戴 / 他人分享的物品不能直接出售或上架：装备请先卸下，链接物品只可查看与转发。'));
    }
    if (!isLink && opts.bagIdx !== undefined) {
      /* ---------- 出售 / 上架 / 丢弃 ---------- */
      const trade = el('div', 'gBlock');
      trade.appendChild(el('div', 'lbl', '交易'));
      const unitRecycle = Math.max(1, Math.round(itemPrice(inst) * 0.7));
      const totalRecycle = unitRecycle * count;
      trade.appendChild(el('div', 'matRow',
        '系统回收价：<b style="color:#ffdf94">' + fmt(unitRecycle) + ' 金</b>/件　合计 <b style="color:#ffdf94">' + fmt(totalRecycle) + ' 金</b>' +
        '　持有金币 ' + fmt(p.gold)));
      const row2 = el('div', 'btnRow');
      const bSellAll = el('button', 'btn gold', '出售全部（' + fmt(totalRecycle) + ' 金）');
      bSellAll.onclick = () => this.sellItem(opts.bagIdx, count);
      row2.appendChild(bSellAll);
      if (!isGear && count > 1) {
        const bSell1 = el('button', 'btn', '出售 1 个');
        bSell1.onclick = () => this.sellItem(opts.bagIdx, 1);
        row2.appendChild(bSell1);
      }
      const bDrop = el('button', 'btn', '丢弃');
      bDrop.onclick = () => {
        if (inst.q >= 4 && !confirm('丢弃 ' + (isGear ? gearFullName(inst) : ITEMS[inst.id].name) + '？')) return;
        p.removeAt(opts.bagIdx, count);
        this.closeGearPanel(); this.refreshBag(); this.refreshChar && this.refreshChar();
        this.log('丢弃：' + itemFullLabel(inst), '#ff9a9a');
        this.toast('已丢弃', '#ff9a9a');
      };
      row2.appendChild(bDrop);
      trade.appendChild(row2);

      // 上架拍卖行
      const row3 = el('div', 'btnRow');
      const pin = document.createElement('input');
      pin.type = 'number'; pin.className = 'numInput'; pin.min = '1';
      pin.value = String(Math.max(1, Math.round(itemPrice(inst) * 1.2)));
      pin.style.width = '110px';
      row3.appendChild(el('span', 'mini', '单价'));
      row3.appendChild(pin);
      const bList = el('button', 'btn gold', '上架拍卖行');
      bList.onclick = () => {
        const r = Market.listItem(inst, +pin.value || 1, p);
        this.toast(r.msg, r.ok ? '#9fd06a' : '#ff9a9a');
        this.log('拍卖行：' + r.msg, r.ok ? '#ffd76a' : '#ff9a9a');
        if (r.ok) { this.closeGearPanel(); this.refreshBag(); }
      };
      row3.appendChild(bList);
      const bOpenMk = el('button', 'btn', '打开拍卖行 (Y)');
      bOpenMk.onclick = () => this.openMarket();
      row3.appendChild(bOpenMk);
      trade.appendChild(row3);
      trade.appendChild(el('div', 'mini',
        '上架后物品会寄存进拍卖行（不再占背包），成交扣除 ' + Math.round(MARKET_TAX * 100) + '% 手续费后可随时查看盈利；也可以随时下架退回背包。'));
      pan.body.appendChild(trade);
    }
  },
  /** 出售某个背包格 N 个给系统 */
  sellItem(idx, n) {
    const p = this.game.player, it = p.bag[idx];
    if (!it) return;
    const unit = Math.max(1, Math.round(itemPrice(it) * 0.7));
    const cnt = Math.min(n || (it.n || 1), it.type === 'gear' ? 1 : (it.n || 1));
    const gain = unit * cnt;
    p.gold += gain;
    p.removeAt(idx, cnt);
    this.toast('出售 ' + itemFullLabel(it) + ' ×' + cnt + '，获得 ' + fmt(gain) + ' 金', '#ffdf94');
    this.log('出售：' + itemFullLabel(it) + ' ×' + cnt + '，+' + fmt(gain) + ' 金', '#ffdf94');
    this.refreshBag();
    if (this.panels.gear) this.renderGear();
  },
  isGearGone(inst) {
    if (inst._isLink) return false;
    const p = this.game.player;
    if (inst.type === 'gear') return p.bag.indexOf(inst) < 0 && p.equip[ITEMS[inst.id].slot] !== inst;
    return p.bag.indexOf(inst) < 0;
  },
  closeGearPanel() {
    const pan = this.panels.gear;
    if (pan) pan.el.style.display = 'none';
    this._gearCtx = null;
  },
  /** 强化分区（与制作台强化规则一致） */
  gearEnhanceBlock(inst) {
    const p = this.game.player, g = this.game;
    const wrap = el('div', 'gBlock');
    wrap.appendChild(el('div', 'lbl', '强化'));
    const lv = inst.enhance, cap = getQuality(inst.q).enhCap;
    const rate = [100, 100, 95, 90, 85, 75, 65, 55, 45, 35, 25, 20, 15, 10, 5][Math.min(lv, 14)];
    const stoneId = lv >= 10 ? 4317 : 4316, stoneN = lv >= 13 ? 4 : lv >= 10 ? 3 : lv >= 6 ? 2 : 1;
    const cost = Math.round(inst.lv * (lv >= 13 ? 1000 : lv >= 10 ? 800 : lv >= 8 ? 400 : lv >= 5 ? 150 : 100));
    const html = '<div class="mini">当前 +' + lv + ' → +' + (lv + 1) + '　成功率 <b class="ok">' + rate + '%</b>　' +
      (lv >= 6 && lv <= 10 ? '失败 -1 级' : lv >= 11 ? '失败 -2 级且有损坏风险' : '失败无惩罚') + '</div>' +
      '<div class="matRow">主属性 ' + gearMainStat(inst) + ' → <b class="ok">' +
      Math.round(gearMainStat(inst) / (1 + lv * 0.05) * (1 + (lv + 1) * 0.05)) + '</b>　战力 ' +
      fmt(gearPower(inst)) + ' → <b class="ok">' + fmt(Math.round(gearPower(inst) * (1 + 0.05 / (1 + lv * 0.05)))) + '</b></div>' +
      '<div class="matRow">消耗：' + this.tipMark(stoneId, ITEMS[stoneId].name) + '×' + stoneN +
      '（持有 ' + p.countItem(stoneId) + '）　金币 ' + fmt(cost) + '</div>' +
      '<div class="mini">强化上限 +' + cap + (lv >= cap ? '（已满级）' : '') + '</div>';
    wrap.appendChild(el('div', '', html));
    this.bindTips(wrap, 'gear');
    const row = el('div', 'btnRow');
    const b = el('button', 'btn gold', '强化');
    b.disabled = lv >= cap || p.countItem(stoneId) < stoneN || p.gold < cost;
    b.onclick = () => {
      g.enhance(inst, rate, stoneId, stoneN, cost);
      this.afterGearChange();
    };
    row.appendChild(b);
    const bp = el('button', 'btn', '使用保护石');
    bp.disabled = p.countItem(4318) <= 0;
    bp.onclick = () => { g.useProtectStone(inst); this.afterGearChange(); };
    row.appendChild(bp);
    wrap.appendChild(row);
    return wrap;
  },
  /** 洗练分区 */
  gearRerollBlock(inst) {
    const p = this.game.player;
    const wrap = el('div', 'gBlock');
    wrap.appendChild(el('div', 'lbl', '洗练（词条重铸）'));
    const c = rerollCost(inst);
    wrap.appendChild(el('div', 'matRow', '消耗：' + this.tipMark(c.id, ITEMS[c.id].name) + '×' + c.n +
      '（持有 ' + p.countItem(c.id) + '）　金币 ' + fmt(c.gold)));
    this.bindTips(wrap, 'gear');
    wrap.appendChild(el('div', 'mini', '重铸全部词条（数量按品质 1~5 条随机制），洗练次数会记录到装备上。'));
    const row = el('div', 'btnRow');
    const b = el('button', 'btn gold', '洗练词条');
    b.disabled = p.countItem(c.id) < c.n || p.gold < c.gold;
    b.onclick = () => {
      const r = rerollAffix(inst, p);
      this.toast(r.msg, r.ok ? '#ffd76a' : '#ff9a9a');
      this.log('洗练：' + gearFullName(inst) + ' — ' + r.msg, r.ok ? '#ffd76a' : '#ff9a9a');
      this.afterGearChange();
    };
    row.appendChild(b);
    wrap.appendChild(row);
    return wrap;
  },
  /** 打孔 / 镶嵌分区 */
  gearSocketBlock(inst) {
    const p = this.game.player;
    const wrap = el('div', 'gBlock');
    const max = gearMaxHoles(inst.q), cur = (inst.holes || []).length;
    wrap.appendChild(el('div', 'lbl', '打孔 / 镶嵌　（' + cur + '/' + max + '）'));
    for (let i = 0; i < max; i++) {
      const row = el('div', 'sockRow');
      const gem = (inst.holes || [])[i];
      if (i >= cur) {
        const c = holeCost(inst, i);
        row.appendChild(el('span', 'mini', '孔' + (i + 1) + '：未开启　需 ' + this.tipMark(c.id, ITEMS[c.id].name) + '×' + c.n + ' + ' + fmt(c.gold) + ' 金'));
        const b = el('button', 'btn', '打孔');
        b.disabled = p.countItem(c.id) < c.n || p.gold < c.gold;
        b.onclick = () => {
          const r = openHole(inst, p, this.game);
          this.toast(r.msg, r.ok ? '#ffd76a' : '#ff9a9a');
          this.afterGearChange();
        };
        row.appendChild(b);
      } else if (!gem) {
        row.appendChild(el('span', 'mini', '孔' + (i + 1) + '：空　'));
        const sel = document.createElement('select');
        sel.className = 'numInput';
        SOCKET_GEMS.forEach(gm => {
          const have = p.countItem(gm.id);
          const o = document.createElement('option');
          o.value = String(gm.id);
          o.textContent = gm.label + '（持 ' + have + '）· ' + gemText(gm.id, inst.lv) + (gm.lv > inst.lv ? ' [需装备Lv.' + gm.lv + ']' : '');
          sel.appendChild(o);
        });
        row.appendChild(sel);
        const b = el('button', 'btn', '镶嵌');
        b.onclick = () => {
          const r = socketGem(inst, i, +sel.value, p);
          this.toast(r.msg, r.ok ? '#9fd06a' : '#ff9a9a');
          this.afterGearChange();
        };
        row.appendChild(b);
      } else {
        row.appendChild(el('span', 'mini', '孔' + (i + 1) + '：<b style="color:' + GEM_MAP[gem].color + '">' + GEM_MAP[gem].label + '</b>　' + gemText(gem, inst.lv)));
        const cost = Math.round(inst.lv * 80);
        const b = el('button', 'btn', '取出（' + fmt(cost) + ' 金）');
        b.onclick = () => {
          const r = unsocketGem(inst, i, p);
          this.toast(r.msg, r.ok ? '#ffdf94' : '#ff9a9a');
          this.afterGearChange();
        };
        row.appendChild(b);
      }
      wrap.appendChild(row);
    }
    this.bindTips(wrap, 'gear');
    return wrap;
  },
  /** 装备发生变更后：刷新所有相关面板 */
  afterGearChange() {
    const p = this.game.player;
    p.recompute();
    this.renderGear();
    this.refreshBag();
    this.refreshChar && this.refreshChar();
    if (this.panels.compare && this.panels.compare.el.style.display !== 'none') this.renderCompare();
    Ach.check(this.game);
  },

  /* ================= 拍卖行 ================= */
  /** 拍卖行挂单 → 物品信息面板（含 购买 / 下架） */
  openMarketItem(lid) {
    const t = Market.get(lid);
    if (!t) { this.toast('该挂单已不存在', '#ff9a9a'); this.renderMarket(); return; }
    this.openItem(t.inst, { marketLid: lid });
  },

  openMarket() {
    const pan = this.panel('market', '拍卖行 · 玩家交易行', 860, 600, 180, 20);
    pan.body.innerHTML = '';
    pan.body.style.overflow = 'hidden';
    this._mkTab = this._mkTab || 'all';
    this._mkSort = this._mkSort || 'new';
    this._mkKw = this._mkKw || '';
    const head = el('div', 'codHead');
    const search = document.createElement('input');
    search.className = 'numInput codSearch';
    search.placeholder = '搜索物品名 / 物品 ID / 卖家…';
    search.value = this._mkKw;
    search.oninput = () => { this._mkKw = search.value; this.renderMarket(); };
    head.appendChild(search);
    const tabs = el('div', 'tabs');
    [['all', '全部'], ['mat', '材料'], ['gear', '装备'], ['use', '消耗品'], ['mine', '我的上架']].forEach(t => {
      const b = el('div', 'tab' + (this._mkTab === t[0] ? ' on' : ''), t[1]);
      b.onclick = () => { this._mkTab = t[0]; this.renderMarket(); };
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
    const sorts = el('div', 'tabs');
    [['new', '最新'], ['unit', '单价↑'], ['unitDesc', '单价↓'], ['total', '总价↑']].forEach(s => {
      const b = el('div', 'tab' + (this._mkSort === s[0] ? ' on' : ''), s[1]);
      b.onclick = () => { this._mkSort = s[0]; this.renderMarket(); };
      sorts.appendChild(b);
    });
    head.appendChild(sorts);
    this._mkCount = el('div', 'mini', '');
    head.appendChild(this._mkCount);
    pan.body.appendChild(head);
    this._mkHead2 = el('div', 'mkSum');
    pan.body.appendChild(this._mkHead2);
    this._mkList = el('div', 'mkList');
    pan.body.appendChild(this._mkList);
    this.renderMarket();
  },
  renderMarket() {
    if (!this._mkList) return;
    const p = this.game.player;
    const tab = this._mkTab, kw = this._mkKw, sort = this._mkSort;
    let list = Market.search(kw, sort, tab === 'mine');
    if (tab === 'mat') list = list.filter(t => (t.inst.type === 'mat' || t.inst.type === 'seed' || t.inst.type === 'crop'));
    else if (tab === 'gear') list = list.filter(t => t.inst.type === 'gear');
    else if (tab === 'use') list = list.filter(t => t.inst.type === 'use');
    this._mkList.innerHTML = '';
    this._mkHead2.innerHTML = '挂单 ' + list.length + ' 条　我的上架 ' + Market.mine().length + '/' + MARKET_MAX_MINE +
      '　持有金币 <b style="color:#ffdf94">' + fmt(p.gold) + '</b>' +
      '　<span class="mini">成交扣 ' + Math.round(MARKET_TAX * 100) + '% 手续费，可随时下架取回</span>';
    if (!list.length) {
      this._mkList.appendChild(el('div', 'mini', '没有符合条件的挂单。可以在物品信息面板里「上架拍卖行」，或等待 NPC 补货。'));
      this._mkCount.textContent = '';
      return;
    }
    list.slice(0, 80).forEach(t => {
      const inst = t.inst, q = getQuality(inst.q);
      const cnt = inst.type === 'gear' ? 1 : (inst.n || 1);
      const total = Market.totalOf(t);
      const canBuy = p.gold >= total && !t.mine;
      const row = el('div', 'mkRow' + (t.mine ? ' mine' : ''),
        '<span class="mkIcon" data-mkic="' + t.lid + '"></span>' +
        '<b style="color:' + (inst.q >= 5 ? q.color : '#cfe8b8') + '">' +
        (inst.type === 'gear' ? gearTitle(inst) + (inst.enhance ? ' +' + inst.enhance : '') : itemFullLabel(inst)) + '</b>' +
        (cnt > 1 ? '<span class="mini">×' + cnt + '</span>' : '') +
        '<span class="mini">' + q.name + '</span>' +
        '<span class="mini">卖家 ' + t.seller + '</span>' +
        '<span class="mini">单价 <b style="color:#ffdf94">' + fmt(t.unit) + '</b></span>' +
        '<span class="mini">总价 <b style="color:#ffdf94">' + fmt(total) + '</b></span>');
      // 整行可点：弹出该挂单物品的信息面板（面板带关闭按钮）
      row.style.cursor = 'pointer';
      row.title = '点击查看这件物品的完整信息';
      row.onclick = ev => {
        if (ev && ev.target && ev.target.tagName === 'BUTTON') return;   // 点按钮时不重复弹面板
        this.openMarketItem(t.lid);
      };
      const bInfo = el('button', 'btn', '查看');
      bInfo.onclick = () => this.openMarketItem(t.lid);
      row.appendChild(bInfo);
      if (t.mine) {
        const bCancel = el('button', 'btn', '下架');
        bCancel.onclick = () => {
          const r = Market.cancel(t.lid, p);
          this.toast(r.msg, r.ok ? '#ffdf94' : '#ff9a9a');
          this.refreshBag(); this.renderMarket();
        };
        row.appendChild(bCancel);
      } else {
        const bBuy = el('button', 'btn gold', '购买');
        bBuy.disabled = !canBuy;
        bBuy.onclick = () => {
          const r = Market.buy(t.lid, p);
          this.toast(r.msg, r.ok ? '#9fd06a' : '#ff9a9a');
          this.log('拍卖行：' + r.msg, r.ok ? '#ffd76a' : '#ff9a9a');
          this.refreshBag(); this.renderMarket();
        };
        row.appendChild(bBuy);
      }
      this._mkList.appendChild(row);
    });
    // 图标
    this._mkList.querySelectorAll('[data-mkic]').forEach(s => {
      const t = Market.get(+s.dataset.mkic);
      if (!t) return;
      const inst = t.inst;
      const c = document.createElement('canvas'); c.width = 26; c.height = 26; c.className = 'ic';
      try { c.getContext('2d').drawImage(Sprites.icon(inst), 0, 0, 26, 26); } catch (e) { }
      s.appendChild(c);
    });
    this._mkCount.textContent = '显示 ' + Math.min(list.length, 80) + ' / ' + list.length + ' 条';
  },

  /* ================= 装备对比 ================= */
  openCompare(a, b, labelA, labelB) {
    if (!a) return;
    const pan = this.panel('compare', '装备对比', 560, 520, 700, 60);
    pan.body.innerHTML = '';
    pan.body.style.overflow = 'auto';
    this._cmp = { a: a, b: b, la: labelA || '候选装备', lb: labelB || '参照装备' };
    this.renderCompare();
  },
  renderCompare() {
    const c = this._cmp; if (!c || !this.panels.compare) return;
    const pan = this.panels.compare;
    const p = this.game.player;
    const a = c.a, b = c.b;
    if (!a) { pan.body.innerHTML = '<div class="mini">没有可对比的装备。</div>'; return; }
    const res = gearCompare(a, b);
    const qa = getQuality(a.q), qb = b ? getQuality(b.q) : null;
    const head = el('div', 'cmpHead');
    head.innerHTML =
      '<div class="cmpCard"><div class="mini">' + c.la + '</div>' +
      '<div class="cmpName" style="color:' + qa.color + '">' + gearTitle(a) + (a.enhance ? ' +' + a.enhance : '') + '</div>' +
      '<div class="mini">战力 ' + fmt(res.powerA) + '　评分 ' + fmt(res.scoreA) + '　' + gearRank(a).name + '</div></div>' +
      '<div class="cmpVs">VS</div>' +
      '<div class="cmpCard"><div class="mini">' + c.lb + '</div>' +
      (b ? '<div class="cmpName" style="color:' + qb.color + '">' + gearTitle(b) + (b.enhance ? ' +' + b.enhance : '') + '</div>' +
        '<div class="mini">战力 ' + fmt(res.powerB) + '　评分 ' + fmt(res.scoreB) + '　' + gearRank(b).name + '</div>'
        : '<div class="cmpName">无装备</div><div class="mini">战力 0　评分 0</div>') + '</div>';
    pan.body.appendChild(head);
    const verdict = el('div', 'cmpVerdict',
      '结论：候选装备战力 ' + (res.powerD >= 0 ? '提升 ' + fmt(res.powerD) : '下降 ' + fmt(-res.powerD)) +
      '　评分 ' + (res.scoreD >= 0 ? '+' + fmt(res.scoreD) : fmt(res.scoreD)) +
      '　<b class="' + (res.better ? 'ok' : 'bad') + '">' + (res.better ? '换装更强' : '不如当前') + '</b>');
    pan.body.appendChild(verdict);
    const tbl = el('div', 'cmpTbl');
    tbl.appendChild(el('div', 'cmpTr head', '<span>属性</span><b>' + c.la + '</b><b>' + c.lb + '</b><b>差值</b>'));
    const rows = [{
      key: 'main', label: '主属性', a: res.mainA, b: res.mainB, d: res.mainA - res.mainB, unit: ''
    }].concat(res.rows);
    rows.forEach(r => {
      const cls = r.d > 0 ? 'ok' : r.d < 0 ? 'bad' : '';
      tbl.appendChild(el('div', 'cmpTr',
        '<span>' + r.label + '</span><b>' + fmt2(r.a) + (r.unit || '') + '</b><b>' + fmt2(r.b) + (r.unit || '') + '</b>' +
        '<b class="' + cls + '">' + (r.d > 0 ? '+' : '') + fmt2(r.d) + (r.unit || '') + '</b>'));
    });
    pan.body.appendChild(tbl);
    const owned = p.bag.indexOf(a) >= 0;
    const row = el('div', 'btnRow');
    if (owned) {
      const bb = el('button', 'btn gold', '装备这件');
      bb.onclick = () => { p.equipItem(p.bag.indexOf(a)); this.refreshBag(); this.refreshChar && this.refreshChar(); this.toast('已装备 ' + gearFullName(a), '#9fd06a'); this.renderCompare(); };
      row.appendChild(bb);
    }
    const bl = el('button', 'btn', '发送到频道');
    bl.onclick = () => { Chat.sayGear(p.name, '世界', a, '对比：'); this.toast('已发送', '#9fe8ff'); };
    row.appendChild(bl);
    pan.body.appendChild(row);
  },

  /* ================= 离线挂机面板 ================= */
  openIdle() {
    const pan = this.panel('idle', '离线挂机 · 队列配置', 720, 600, 220, 24);
    pan.body.innerHTML = '';
    pan.body.style.overflow = 'auto';
    this._idleTab = this._idleTab || 'gather';
    this._idleMode = this._idleMode || 'count';
    this.renderIdle();
  },
  renderIdle() {
    const pan = this.panels.idle; if (!pan) return;
    const B = pan.body; B.innerHTML = '';
    const pl = this.game.player;
    /* 状态行 */
    const state = el('div', 'idState');
    state.innerHTML = '状态：<b class="' + (Idle.running ? 'ok' : 'bad') + '">' + (Idle.running ? '挂机中' : '未运行') + '</b>' +
      '　队列任务 ' + Idle.queue.length + ' 项' +
      '　<span class="mini">（在线时人物自动前往资源点真实采集；离线后按此队列结算，规则与手动行为相同）</span>';
    B.appendChild(state);
    if (Idle.lastReport) B.appendChild(this.idleReportBlock(Idle.lastReport));

    /* 添加区 */
    B.appendChild(el('div', 'lbl', '添加任务'));
    const tabs = el('div', 'tabs');
    Object.values(IDLE_TYPES).forEach(t => {
      const b = el('div', 'tab' + (this._idleTab === t.key ? ' on' : ''), t.name);
      b.onclick = () => { this._idleTab = t.key; this.renderIdle(); };
      tabs.appendChild(b);
    });
    B.appendChild(tabs);
    B.appendChild(el('div', 'mini', IDLE_TYPES[this._idleTab].desc));

    const line1 = el('div', 'btnRow');
    const sel = document.createElement('select'); sel.className = 'numInput'; sel.style.width = '260px';
    const targets = this._idleTab === 'gather' ? Idle.gatherTargets() : this._idleTab === 'fish' ? Idle.fishTargets() : Idle.combatTargets();
    targets.forEach(t => {
      const o = document.createElement('option');
      if (this._idleTab === 'gather') { o.value = t.id; o.textContent = t.name + '（' + SKILL_CN[t.skill] + ' Lv.' + t.lv + '）'; }
      else if (this._idleTab === 'fish') { o.value = t.key; o.textContent = t.name + '（' + t.count + ' 种：' + t.sample + '）'; }
      else { o.value = t.key; o.textContent = t.name + '（Lv.' + t.lv[0] + '-' + t.lv[1] + '）'; }
      sel.appendChild(o);
    });
    line1.appendChild(sel);
    B.appendChild(line1);

    const line2 = el('div', 'btnRow');
    [['count', '按次数'], ['time', '按时间']].forEach(m => {
      const b = el('div', 'tab' + (this._idleMode === m[0] ? ' on' : ''), m[1]);
      b.onclick = () => { this._idleMode = m[0]; this.renderIdle(); };
      line2.appendChild(b);
    });
    const qinp = document.createElement('input'); qinp.type = 'number'; qinp.className = 'numInput'; qinp.min = '1';
    qinp.value = this._idleMode === 'time' ? '30' : '100';
    qinp.style.width = '90px';
    line2.appendChild(qinp);
    (this._idleMode === 'time' ? [5, 30, 60, 240] : [10, 50, 100, 1000]).forEach(v => {
      const b = el('button', 'btn', String(v) + (this._idleMode === 'time' ? ' 分' : ' 次'));
      b.onclick = () => { qinp.value = String(v); };
      line2.appendChild(b);
    });
    B.appendChild(line2);

    const line3 = el('div', 'btnRow');
    const loopSel = document.createElement('select'); loopSel.className = 'numInput';
    [[0, '不循环'], [2, '循环 1 次'], [3, '循环 2 次'], [1, '无限循环']].forEach(o => {
      const op = document.createElement('option'); op.value = String(o[0]); op.textContent = o[1]; loopSel.appendChild(op);
    });
    line3.appendChild(loopSel);
    const bAdd = el('button', 'btn gold', '加入队列');
    bAdd.onclick = () => {
      const t = this._idleTab;
      const quota = this._idleMode === 'time' ? Math.max(1, +qinp.value || 30) * 60 : Math.max(1, +qinp.value || 10);
      Idle.add({
        type: t,
        skill: t === 'gather' ? (Idle.gatherTargets().find(x => x.id === +sel.value) || {}).skill : (t === 'fish' ? 'fish' : ''),
        target: sel.value,
        mode: this._idleMode, quota: quota,
        loop: +loopSel.value !== 0, loopN: +loopSel.value === 1 ? 0 : +loopSel.value
      });
      this.toast('已加入队列：' + IDLE_TYPES[t].name + ' × ' + qinp.value + (this._idleMode === 'time' ? ' 分钟' : ' 次'), '#9fd06a');
      this.renderIdle();
    };
    line3.appendChild(bAdd);
    B.appendChild(line3);

    /* 队列列表 */
    B.appendChild(el('div', 'lbl', '队列（按顺序执行，可循环）'));
    if (!Idle.queue.length) B.appendChild(el('div', 'mini', '暂无任务：选择目标 → 设置次数或时间 → 加入队列。'));
    Idle.queue.forEach((t, i) => {
      const row = el('div', 'idRow');
      const name = t.type === 'gather' ? (ITEMS[t.target] ? ITEMS[t.target].name : '?')
        : t.type === 'fish' ? (Idle.fishTargets().find(f => f.key === t.target) || {}).name
          : (Idle.combatTargets().find(c => c.key === t.target) || {}).name;
      row.innerHTML = '<span class="no">' + (i + 1) + '</span>' +
        '<b>' + IDLE_TYPES[t.type].name + '</b><span>' + (name || t.target) + '</span>' +
        '<span class="mini">' + (t.mode === 'time' ? fmtTime(t.quota) : '次数 ' + fmt(t.quota)) +
        (t.loop ? '　循环' + (t.loopN ? '×' + t.loopN : '∞') : '') + '</span>' +
        '<span class="mini">进度 ' + (t.mode === 'time' ? fmtTime(Math.round(t.sec)) : fmt(t.done)) +
        (t.loops ? '　已循环 ' + t.loops : '') + (t.stopReason ? '　<b class="bad">' + t.stopReason + '</b>' : '') + '</span>';
      const up = el('button', 'btn', '↑'); up.onclick = () => { Idle.move(t.id, -1); this.renderIdle(); };
      const dn = el('button', 'btn', '↓'); dn.onclick = () => { Idle.move(t.id, 1); this.renderIdle(); };
      const del = el('button', 'btn', '✕'); del.onclick = () => { Idle.remove(t.id); this.renderIdle(); };
      row.appendChild(up); row.appendChild(dn); row.appendChild(del);
      B.appendChild(row);
    });

    /* 控制区 */
    const ctrl = el('div', 'btnRow');
    if (Idle.running) {
      const b = el('button', 'btn', '停止挂机');
      b.onclick = () => { Idle.stop('手动停止'); this.renderIdle(); };
      ctrl.appendChild(b);
      const bTb = el('button', 'btn gold', '查看结算明细');
      bTb.onclick = () => { Idle.lastReport = Idle.report(); this.renderIdle(); };
      ctrl.appendChild(bTb);
    } else {
      const b = el('button', 'btn gold', '开始挂机（在线持续 / 离线结算）');
      b.onclick = () => { Idle.start(pl); this.renderIdle(); };
      ctrl.appendChild(b);
      const bc = el('button', 'btn', '清空队列');
      bc.onclick = () => { Idle.clear(); Idle.total = null; Idle.lastReport = null; this.renderIdle(); };
      ctrl.appendChild(bc);
    }
    B.appendChild(ctrl);
    B.appendChild(el('div', 'mini', '在线时按 Ctrl+S 或系统自动存档会记录挂机进度；关闭页面后再次进入时，会按队列自动结算（单次最多结算 ' + Math.round(IDLE_MAX_SEC / 3600) + ' 小时）。'));
  },
  /** 离线归来：弹出结算概要 */
  showIdleReport(rep, away) {
    if (!rep) return;
    Idle.lastReport = rep;
    const top = rep.items.slice(0, 3).map(i => i.name + '×' + fmt(i.n)).join('、');
    this.toast('离线挂机 ' + fmtTime(Math.min(away, rep.sec)) + '　经验 +' + fmt(rep.exp) + (top ? '　' + top : ''), '#ffd76a');
    this.log('【离线挂机】' + Math.round(rep.sec / 60) + ' 分钟：经验 +' + fmt(rep.exp) + '　金币 +' + fmt(rep.gold) +
      '　采集 ' + rep.gathers + '　击杀 ' + rep.kills + (top ? '　' + top : ''), '#ffd76a');
    this.openIdle();
  },
  idleReportBlock(rep) {
    const wrap = el('div', 'idReport');
    let html = '<div class="tr">挂机时长 <b>' + fmtTime(rep.sec) + '</b>　采集 ' + fmt(rep.gathers) + ' 次　击杀 ' + fmt(rep.kills) +
      ' 只　经验 <b style="color:#ffd76a">+' + fmt(rep.exp) + '</b>　金币 <b style="color:#ffdf94">+' + fmt(rep.gold) + '</b>' +
      (rep.lvUp ? '　<b class="ok">升级 ' + rep.lvUp + ' 级</b>' : '') + '</div>';
    if (rep.items.length) {
      html += '<div class="matRow">获得：' + rep.items.slice(0, 10).map(it =>
        '<span class="tl" data-tip="' + it.id + '">' + it.name + '</span>×' + fmt(it.n) +
        (it.q > 2 ? '(' + getQuality(it.q).name + ')' : '')).join('　') + '</div>';
    }
    const ls = Object.keys(rep.life || {});
    if (ls.length) html += '<div class="mini">生活经验：' + ls.map(k => SKILL_CN[k] + ' +' + fmt(rep.life[k])).join('　') + '</div>';
    if (rep.equips.length) html += '<div class="mini">获得装备：' + rep.equips.slice(0, 6).join('、') + '</div>';
    const tasks = (rep.tasks || []).map(t => (t.type === 'gather' ? ITEMS[t.target].name : (t.type === 'fish' ? '钓鱼' : '战斗')) +
      '（' + t.mode + ' ' + (t.mode === 'time' ? fmtTime(t.quota) : t.quota) + '）');
    if (tasks.length) html += '<div class="mini">队列：' + tasks.join(' → ') + '</div>';
    wrap.innerHTML = html;
    setTimeout(() => this.bindTips(wrap, 'idle'), 0);
    return wrap;
  },

  /* ---------- 成就 ---------- */
  openAch() {
    const p = this.panel('ach', '成就', 560, 500, 400, 50);
    p.body.innerHTML = '';
    const pl = this.game.player;
    let pts = 0;
    ACHIEVEMENTS.forEach(a => {
      const cur = Math.min(a.get(pl), a.target);
      const done = cur >= a.target;
      if (done) pts += a.target >= 1000 ? 50 : a.target >= 100 ? 20 : 10;
      const d = el('div', 'ritem', '<span>' + (done ? '★ ' : '') + a.name + '<div class="mini">' + a.desc + '</div>' +
        '<div class="bar2"><i style="width:' + (cur / a.target * 100) + '%"></i></div></span><span class="no">' + fmt(cur) + '/' + fmt(a.target) + '</span>');
      p.body.appendChild(d);
    });
    p.body.appendChild(el('div', 'mini', '成就点数：' + pts + '　（点亮账号成长奖励）'));
  }
};
