/* ============================================================
 * 11_combat.js —— 战斗核心：命中 / 暴击 / 元素 / 连击 / 伤害结算
 * 最终伤害 = max(ATK×倍率 − DEF×0.6×(1−穿透), 基础×10%)
 *           × 元素克制 × 暴击倍率 × 随机(0.92~1.08) × (1−减伤)
 * ==========================================================*/
'use strict';

const COMBAT_CONST = {
  DEF_COEF: 0.6, MIN_DMG: 0.1, CRIT_BASE: 1.5, CRIT_CAP: 0.85, CRIT_DMG_CAP: 4.0,
  DODGE_CAP: 0.4, HIT_BASE: 0.95, HIT_MIN: 0.30,
  REDUCTION_CAP: 0.75, PEN_CAP: 0.5, COMBO_STEP: 0.05, COMBO_MAX: 0.5, COMBO_TIME: 2.0
};

const Combat = {
  elementFactor(atkElem, defElem) {
    if (!atkElem || atkElem === 'none') return { mult: 1, tag: '' };
    const beats = ELEMENT_BEATS[atkElem];
    if (beats === defElem) return { mult: 1.5, tag: '克制' };
    if (ELEMENT_BEATS[defElem] === atkElem) return { mult: 0.75, tag: '被克' };
    if (atkElem === defElem) return { mult: 0.5, tag: '抗性' };
    if ((atkElem === 'light' && defElem === 'dark') || (atkElem === 'dark' && defElem === 'light')) return { mult: 1.25, tag: '互克' };
    return { mult: 1, tag: '' };
  },

  /** 计算伤害 */
  calc(a, t, opts) {
    opts = opts || {};
    const mult = opts.mult || 1;
    const magic = !!opts.magic;
    const raw = (magic ? a.stats.matk : a.stats.atk) * mult;
    const defStat = magic ? t.stats.mdef : t.stats.def;
    const pen = clamp((a.stats.pen || 0) / 100, 0, COMBAT_CONST.PEN_CAP);
    let dmg = Math.max(raw - defStat * COMBAT_CONST.DEF_COEF * (1 - pen), raw * COMBAT_CONST.MIN_DMG);
    // 元素克制
    const ef = this.elementFactor(opts.elem || a.stats.elem || 'none', t.stats.elemResistElem || t.elem);
    dmg *= ef.mult;
    // 命中 / 闪避
    const hit = clamp(COMBAT_CONST.HIT_BASE + (a.stats.hit || 0) / 100 - (t.stats.dodge || 0) / 100, COMBAT_CONST.HIT_MIN, 1.0);
    const miss = !opts.noMiss && Math.random() > hit;
    // 暴击
    let crit = false;
    const crate = clamp((a.stats.crit || 0) / 100, 0, COMBAT_CONST.CRIT_CAP);
    if (opts.mustCrit) crit = true; else if (Math.random() < crate) crit = true;
    if (crit) {
      const cd = clamp((a.stats.cdmg || 150) / 100, 1, COMBAT_CONST.CRIT_DMG_CAP);
      const guard = (t.stats.critGuard || 0) / 100;
      dmg *= crit ? (cd * (1 - guard * 0.5)) : 1;
    }
    dmg *= rnd(0.92, 1.08);
    // 连击加成
    const comboBonus = Math.min(COMBAT_CONST.COMBO_MAX, Math.floor((a.combo || 0) / 10) * COMBAT_CONST.COMBO_STEP);
    dmg *= (1 + comboBonus);
    // 目标减伤
    const red = clamp((t.stats.reduction || 0) / 100, 0, COMBAT_CONST.REDUCTION_CAP);
    dmg *= (1 - red);
    // 元素伤害加成
    if (opts.elem || a.stats.elem) dmg *= (1 + (a.stats.elemDmg || 0) / 100);
    return {
      dmg: Math.max(1, Math.round(dmg)), crit: crit, miss: miss, elemTag: ef.tag,
      combo: comboBonus, elemMult: ef.mult
    };
  },

  /** 造成伤害（含吸血 / 反伤 / 致死保护） */
  dealDamage(a, t, opts, game) {
    if (!t || t.dead) return null;
    const res = this.calc(a, t, opts);
    if (t.buffs && t.buffs.hasInvincible()) {
      game && game.floatText(t, '免疫', '#cfd8e8'); return res;
    }
    if (res.miss) { game && game.floatText(t, 'MISS', '#8f9bc4'); a.combo = 0; t.onHit && t.onHit(a, 0, res); return res; }
    if (t.hitT !== undefined) t.hitT = 0.2;                       // 受击帧（后仰 + 闪白 0.2s）
    /* 音效：玩家打出去 = 命中 / 暴击；怪物打到玩家用略低音高区分（同名 45ms 节流） */
    if (typeof Snd !== 'undefined' && Snd.play) {
      if (a.isPlayer) Snd.play(res.crit ? 'crit' : 'hit');
      else if (t.isPlayer) Snd.play('hit', { pitch: 0.85 });
    }
    /* 打击感：命中火花（暴击更多更亮）+ 暴击顿帧 60ms */
    if (game && game.burst) {
      const EC = { fire: '#ff7a2a', ice: '#9fe8ff', thunder: '#ffe36a', poison: '#7fd05a', dark: '#a45cff', stellar: '#5cf0ff', wind: '#cfe8b8', water: '#5ab0d0', earth: '#c9a24a' };
      const col = res.crit ? ['#ffd76a', '#fff3c4', '#ff9a3a'] : [EC[(opts && opts.elem) || ''] || '#ffd76a', '#ffffff'];
      game.burst(t.x, t.y - 10, res.crit ? 14 : 8, col, { spd: res.crit ? 190 : 130, life: 0.35, r: res.crit ? 3.5 : 2.5 });
      const FB = (typeof BAL !== 'undefined') ? BAL.feel : { hitStopCrit: 0.06 };
      if (res.crit) game.hitStop = Math.max(game.hitStop || 0, FB.hitStopCrit);
    }
    // 连击累积
    a.combo = (a.combo || 0) + 1; a.comboT = COMBAT_CONST.COMBO_TIME;
    let final = res.dmg;
    // 大额伤害减免（创世壁垒）
    if (t.stats.bigHitGuard && final > t.maxHp * 0.2) {
      const over = final - t.maxHp * 0.2;
      final = t.maxHp * 0.2 + over * (1 - t.stats.bigHitGuard / 100);
    }
    if (t.shield > 0) {
      const ab = Math.min(t.shield, final);
      t.shield -= ab; final -= ab;
      if (ab > 0) game && game.floatText(t, '盾-' + Math.round(ab), '#9fe8ff');
    }
    final = Math.round(final);
    t.hp -= final;
    if (game) {
      if (res.crit) game.floatText(t, '暴击 ' + final, '#ffd76a', true);
      else game.floatText(t, '' + final, opts && opts.magic ? '#c0a8ff' : '#ffffff');
      if (res.elemTag) game.floatText(t, res.elemTag + ' ×' + res.elemMult, '#9fe8ff');
    }
    // 吸血
    const ls = (a.stats.lifesteal || 0) / 100;
    if (ls > 0 && a.hp > 0) {
      const heal = Math.round(final * ls);
      a.hp = Math.min(a.maxHp, a.hp + heal);
      if (heal > 0 && game && a.isPlayer) game.floatText(a, '+' + heal, '#7fdba4');
    }
    // 荆棘反伤
    const thorn = a.procThorn || 0;
    if (thorn > 0 && a.hp > 0) Combat.applyRawDamage(a, Math.round(final * thorn / 100), { source: 'thorn' }, game);
    // 特效触发（以攻击方 tsh -> 目标）
    if (opts && opts.proc && game) this.runProc(a, t, opts.proc, res.dmg, game);
    this.runGearProcs(a, t, res.dmg, game);
    if (t.hp <= 0) this.kill(a, t, game);
    return res;
  },

  runProc(a, t, proc, dmg, game) {
    if (proc.p !== undefined && Math.random() > proc.p) return;
    switch (proc.t) {
      case 'burn': t.buffs && BuffSys.apply(t, proc.v >= 4 ? 'D202' : 'D201', null, proc.v); break;
      case 'freeze': t.buffs && !t.buffs.hasCcImmune() && BuffSys.apply(t, 'D101', null, proc.v); break;
      case 'sunder': t.buffs && BuffSys.apply(t, 'D002', null, 5); break;
      case 'fever': a.buffs && BuffSys.apply(a, 'B001', null, 3); break;
      case 'poison': t.buffs && BuffSys.apply(t, 'D203', null, 8); break;
      case 'void': Combat.applyRawDamage(t, Math.round(dmg * proc.v / 100), { trueDamage: 1 }, game); break;
      case 'starstrike':
        const list = game.monsters.filter(m => !m.dead && dist(m.x, t.x, t.y, m.y) < 3.2 * TILE_PX);
        list.forEach(m => Combat.applyRawDamage(m, Math.round(a.stats.atk * proc.v / 100), {}, game));
        game.fx && game.fx.push({ x: t.x, y: t.y, r: 3.2 * TILE_PX, ttl: .5, color: '#5cf0ff', type: 'circle' });
        break;
      case 'chain':
        const targets = game.monsters.filter(m => !m.dead && m !== t && dist(m.x, m.y, t.x, t.y) < 4 * TILE_PX).slice(0, 3);
        targets.forEach(m => { Combat.applyRawDamage(m, Math.round(dmg * 0.35), {}, game); });
        if (targets.length) game.fx && game.fx.push({ x: t.x, y: t.y, tx: targets[0].x, ty: targets[0].y, ttl: .25, color: '#ffe36a', type: 'beam' });
        break;
      case 'frenzy': a.buffs && BuffSys.apply(a, 'B013', null, 5); break;
    }
  },
  runGearProcs(a, t, dmg, game) {
    for (const p of (a.gearProcs || [])) this.runProc(a, t, p, dmg, game);
  },
  /** 不受公式影响的直接伤害（DoT、陷阱等） */
  applyRawDamage(ent, dmg, opts, game) {
    if (!ent || ent.dead) return 0;
    if (ent.buffs && ent.buffs.hasInvincible() && !(opts && opts.trueDamage)) return 0;
    if (!(opts && opts.trueDamage)) {
      const red = clamp((ent.stats.reduction || 0) / 100, 0, COMBAT_CONST.REDUCTION_CAP);
      dmg *= (1 - red);
      if (ent.shield > 0) { const ab = Math.min(ent.shield, dmg); ent.shield -= ab; dmg -= ab; }
    }
    dmg = Math.max(1, Math.round(dmg));
    ent.hp -= dmg;
    game && game.floatText(ent, '' + dmg, '#ff9a9a');
    if (ent.hp <= 0) this.kill(opts && opts.source ? ent.lastAttacker : null, ent, game);
    return dmg;
  },
  kill(a, t, game) {
    if (t.dead) return;
    if (t.buffs && t.buffs.list.some(b => b.id === 'D301')) { /* noop */ }
    // 不灭之躯：首次致死无效
    if (t.procUndying && !t.undyingUsed) {
      t.undyingUsed = true; t.hp = Math.round(t.maxHp * 0.3);
      game && game.floatText(t, '不灭！', '#ffd700'); return;
    }
    if (t.procLastStand && !t.lastStandUsed) {
      t.lastStandUsed = true; t.hp = 1;
      game && game.floatText(t, '坚韧！', '#ffd700'); return;
    }
    t.hp = 0; t.dead = true; t.deadT = Date.now();
    if (typeof Snd !== 'undefined' && Snd.play) Snd.play('die');
    if (game && game.burst) {
      game.burst(t.x, t.y - 10, 18, ['#ff6a6a', '#ffd76a', '#ffffff'], { spd: 210, life: 0.5, r: 3.5 });
      game.hitStop = Math.max(game.hitStop || 0, (typeof BAL !== 'undefined') ? BAL.feel.hitStopKill : 0.09);   // 击杀顿帧更久
    }
    if (game) {
      if (t.isMonster) game.onMonsterDeath(t, a); else game.onPlayerDeath && game.onPlayerDeath();
    }
  },
  /* ---------- 技能目标选择 ---------- */
  targetsIn(game, caster, skill) {
    const list = caster.isPlayer ? game.monsters.filter(m => !m.dead) : [game.player];
    const ang = caster.aimAngle;
    const out = [];
    for (const m of list) {
      const d = dist(caster.x, caster.y, m.x, m.y);
      const R = TILE_PX;
      if (skill.pattern === 'single') { if (d <= (skill.radius || 3) * R) out.push(m); }
      else if (skill.pattern === 'cone') {
        if (d <= (skill.radius || 3) * R) {
          const a2 = angleOf(caster.x, caster.y, m.x, m.y);
          let diff = Math.abs(((a2 - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff <= (skill.arc || 1.2)) out.push(m);
        }
      } else if (skill.pattern === 'circle') { if (d <= (skill.radius || 3) * R) out.push(m); }
      else if (skill.pattern === 'line') {
        const len = (skill.len || 6) * R, wid = (skill.width || 1.5) * R;
        const vx = Math.cos(ang), vy = Math.sin(ang);
        const px = (m.x - caster.x), py = (m.y - caster.y);
        const proj = px * vx + py * vy;
        if (proj > -R * 0.5 && proj < len) {
          const perp = Math.abs(px * -vy + py * vx);
          if (perp < wid / 2 + R * 0.4) out.push(m);
        }
      } else if (skill.pattern === 'dash') {
        const distMove = Math.abs(skill.dashDist || 3) * R;
        const tx2 = caster.x + Math.cos(ang) * distMove, ty2 = caster.y + Math.sin(ang) * distMove;
        if (dist(m.x, m.y, tx2, ty2) <= (skill.radius || 2) * R) out.push(m);
      }
    }
    return out;
  },
  cast(game, caster, skill) {
    const lv = caster.lv || 1;
    const info = skillMult(skill, lv);
    let targets = [];
    const elemCol = { fire: '#ff7a2a', ice: '#9fe8ff', thunder: '#ffe36a', poison: '#7fd05a', dark: '#a45cff', stellar: '#5cf0ff', wind: '#cfe8b8', water: '#5ab0d0', earth: '#c9a24a' }[skill.elem] || '#ffd76a';
    if (skill.pattern === 'self') {
      if (skill.buffId) BuffSys.apply(caster, skill.buffId, game);
      if (skill.counter) { caster.counterT = 2.0; caster.counterMult = skill.mult; }
      game.fx.push({ x: caster.x, y: caster.y, r: 2.4 * TILE_PX, ttl: .4, color: '#9fe8ff', type: 'circle' });
    } else if (skill.pattern === 'dash') {
      const dd = (skill.dashDist || 3) * TILE_PX;
      caster.dashTo(caster.x + Math.cos(caster.aimAngle) * dd, caster.y + Math.sin(caster.aimAngle) * dd, game);
      const list = caster.isPlayer ? game.monsters.filter(m => !m.dead) : [game.player];
      targets = list.filter(m => dist(m.x, m.y, caster.x, caster.y) <= (skill.radius || 2) * TILE_PX);
      caster.castTargets(targets, skill, info, game);
    } else if (skill.pattern === 'line' && game && game.spawnProj) {
      /* 直线技能 → 飞行法球：命中才结算（保留多段与减益：走 castTargets 回调） */
      game.spawnProj({
        x: caster.x, y: caster.y - 8, ang: caster.aimAngle, spd: 520, r: 5,
        range: (skill.len || 6) * TILE_PX, owner: caster, kind: 'orb', col: elemCol,
        cb: t => caster.castTargets([t], skill, info, game)
      });
    } else {
      targets = this.targetsIn(game, caster, skill);
      caster.castTargets(targets, skill, info, game);
    }
    // 表现
    const col = elemCol;
    if (skill.pattern === 'cone') game.fx.push({ x: caster.x, y: caster.y, ang: caster.aimAngle, r: (skill.radius || 3) * TILE_PX, arc: skill.arc || 1.2, ttl: .25, color: col, type: 'cone' });
    else if (skill.pattern === 'circle') game.fx.push({ x: caster.x, y: caster.y, r: (skill.radius || 3) * TILE_PX, ttl: .35, color: col, type: 'circle' });
    else if (skill.pattern === 'line') game.fx.push({ x: caster.x, y: caster.y, tx: caster.x + Math.cos(caster.aimAngle) * (skill.len || 6) * TILE_PX, ty: caster.y + Math.sin(caster.aimAngle) * (skill.len || 6) * TILE_PX, ttl: .3, color: col, type: 'beam' });
    return targets.length;
  }
};
