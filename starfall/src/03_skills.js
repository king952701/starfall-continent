/* ============================================================
 * 03_skills.js —— 职业 / 技能表（V0.5 Sheet 10）
 * pattern: single 单体 | cone 扇形 | circle 圆 | line 直线
 *          dash 突进 | self 自身 | heal 治疗 | multi 多段
 * ==========================================================*/
'use strict';

const ELEMENT_CN = { none: '无', fire: '火', wind: '风', earth: '地', water: '水', ice: '冰', thunder: '雷', poison: '毒', dark: '暗', light: '光', stellar: '星' };
/** 元素克制：火>风>地>水>火，光暗互克 */
const ELEMENT_BEATS = { fire: 'wind', wind: 'earth', earth: 'water', water: 'fire', ice: 'earth', thunder: 'water', poison: 'wind', light: 'dark', dark: 'light', stellar: 'none', none: 'none' };

function makeSkill(o) {
  o.icon = o.icon || 'slash';
  o.elem = o.elem || 'none';
  o.hits = o.hits || 1;
  o.mp = o.mp || 0;
  o.scale = o.scale || 1;
  return o;
}

const CLASSES = {
  warrior: {
    key: 'warrior', name: '剑士', en: 'Swordman', iconSpec: { wep: 'sword' },
    desc: '近战坦克型，高防高血，格挡与突进兼备。擅长持续输出与 Boss 战。',
    tags: ['近战', '坦克', '持续输出'],
    mods: { hp: 1.2, atk: 1.3, matk: 0.7, def: 1.3, mdef: 0.9, aspd: 1.0, crit: 1.0, dodge: 1.0 },
    special: { block: 10 },
    look: { skin: '#f0c8a0', hair: '#4a2c1a', cloth: '#b8493a', trim: '#ffd76a', pants: '#3a3f52', wep: '#d8e0ee' },
    basic: { range: 2.1, arc: 1.9, mult: 1.0 },
    skills: [
      makeSkill({ id: 1, name: '横斩', mult: 1.8, cd: 3, mp: 10, lv: 1, pattern: 'cone', radius: 2.4, arc: 1.5, icon: 'slash', desc: '向前方扇形挥砍' }),
      makeSkill({ id: 2, name: '突刺', mult: 2.2, cd: 5, mp: 15, lv: 3, pattern: 'dash', dashDist: 3.2, radius: 1.6, icon: 'dash', desc: '向前突进并造成伤害' }),
      makeSkill({ id: 3, name: '旋风斩', mult: 1.2, cd: 8, mp: 25, lv: 8, pattern: 'circle', radius: 3.2, icon: 'spin', desc: '360° 范围旋转斩击' }),
      makeSkill({ id: 4, name: '格挡反击', mult: 3.0, cd: 12, mp: 20, lv: 12, pattern: 'self', icon: 'shield', buffId: 'B008', counter: true, desc: '2 秒格挡，减伤 80%，反击造成 300% 伤害' }),
      makeSkill({ id: 5, name: '剑气波', mult: 3.5, cd: 15, mp: 40, lv: 18, pattern: 'line', len: 8, width: 1.6, icon: 'wave', desc: '释放穿透直线剑气' }),
      makeSkill({ id: 6, name: '星陨斩', mult: 8.0, cd: 45, mp: 100, lv: 30, pattern: 'circle', radius: 5, icon: 'ultimate', elem: 'stellar', proc: { t: 'burn', v: 3 }, desc: '召唤星陨轰击周围敌人并附加灼烧', ult: true })
    ]
  },
  archer: {
    key: 'archer', name: '弓手', en: 'Archer', iconSpec: { wep: 'bow' },
    desc: '远程持续输出，高攻速与暴击，依靠走位与陷阱风筝敌人。',
    tags: ['远程', '持续输出', '高暴击'],
    mods: { hp: 0.9, atk: 1.2, matk: 0.8, def: 0.9, mdef: 0.9, aspd: 1.2, crit: 1.3, dodge: 1.05 },
    special: { dodgeBase: 5 },
    look: { skin: '#f0c8a0', hair: '#8a6a3a', cloth: '#3f7a4a', trim: '#cfe86a', pants: '#4a4030', wep: '#b98b52' },
    basic: { range: 6.5, arc: 0.7, mult: 1.0, ranged: true },
    skills: [
      makeSkill({ id: 1, name: '精准射击', mult: 2.0, cd: 3, mp: 10, lv: 1, pattern: 'single', radius: 7, icon: 'arrow', desc: '射出强力一箭' }),
      makeSkill({ id: 2, name: '多重箭', mult: 0.8, cd: 6, mp: 20, lv: 3, pattern: 'cone', radius: 5.5, arc: 0.9, icon: 'multi', desc: '扇形散射 3 支箭' }),
      makeSkill({ id: 3, name: '陷阱', mult: 1.5, cd: 10, mp: 25, lv: 8, pattern: 'circle', radius: 1.8, icon: 'trap', debuffId: 'D104', desc: '布置陷阱，定身敌人' }),
      makeSkill({ id: 4, name: '翻滚射击', mult: 2.5, cd: 8, mp: 20, lv: 12, pattern: 'dash', dashDist: -3.2, radius: 2.0, icon: 'dash', desc: '后跳射击' }),
      makeSkill({ id: 5, name: '箭雨', mult: 1.0, cd: 15, mp: 45, lv: 20, pattern: 'circle', radius: 5, hits: 3, icon: 'rain', desc: '范围内降下箭雨，造成 3 段伤害' }),
      makeSkill({ id: 6, name: '流星箭', mult: 9.0, cd: 50, mp: 110, lv: 30, pattern: 'line', len: 9, width: 2.0, icon: 'ultimate', elem: 'fire', proc: { t: 'burn', v: 3 }, desc: '贯穿全场的流星一箭', ult: true })
    ]
  },
  mage: {
    key: 'mage', name: '法师', en: 'Mage', iconSpec: { wep: 'staff' },
    desc: '元素爆发型，技能范围大、倍率高，但身板脆弱，需要控制蓝量。',
    tags: ['远程', '爆发', 'AOE'],
    mods: { hp: 0.8, atk: 0.6, matk: 1.5, def: 0.7, mdef: 1.3, aspd: 0.9, crit: 1.0, dodge: 1.0 },
    special: { mpBonus: 30 },
    look: { skin: '#f4d0b0', hair: '#3a3a6a', cloth: '#5a4a9a', trim: '#a0cfff', pants: '#2f2f4a', wep: '#8f6fc4' },
    basic: { range: 5.0, arc: 0.9, mult: 1.0, magic: true, ranged: true },
    skills: [
      makeSkill({ id: 1, name: '火球术', mult: 2.5, cd: 4, mp: 15, lv: 1, pattern: 'single', radius: 6, icon: 'fire', elem: 'fire', proc: { t: 'burn', v: 2 }, desc: '火球并附加灼烧' }),
      makeSkill({ id: 2, name: '冰锥术', mult: 2.0, cd: 5, mp: 12, lv: 3, pattern: 'cone', radius: 4.5, arc: 0.7, icon: 'ice', elem: 'ice', debuffId: 'D003', desc: '冰锥减速敌人' }),
      makeSkill({ id: 3, name: '闪电链', mult: 1.5, cd: 8, mp: 30, lv: 8, pattern: 'cone', radius: 5, arc: 1.2, icon: 'thunder', elem: 'thunder', hits: 3, desc: '三连锁电击' }),
      makeSkill({ id: 4, name: '魔法盾', mult: 0, cd: 12, mp: 35, lv: 12, pattern: 'self', icon: 'shield', buffId: 'B104', desc: '获得吸收伤害的护盾' }),
      makeSkill({ id: 5, name: '陨石术', mult: 4.5, cd: 18, mp: 60, lv: 20, pattern: 'circle', radius: 4, icon: 'meteor', elem: 'fire', debuffId: 'D102', desc: '陨石轰击，眩晕 1 秒' }),
      makeSkill({ id: 6, name: '星核爆发', mult: 10.0, cd: 60, mp: 120, lv: 30, pattern: 'circle', radius: 6, icon: 'ultimate', elem: 'stellar', desc: '全元素星核爆发', ult: true })
    ]
  },
  assassin: {
    key: 'assassin', name: '刺客', en: 'Assassin', iconSpec: { wep: 'dagger' },
    desc: '极致爆发与控制，双匕首高频攻击，背刺与毒刃令单体输出冠绝全场。',
    tags: ['近战', '爆发', 'DOT'],
    mods: { hp: 0.85, atk: 1.1, matk: 0.7, def: 0.8, mdef: 0.8, aspd: 1.4, crit: 1.5, dodge: 1.03 },
    special: { backstab: 50 },
    look: { skin: '#e8c0a0', hair: '#2a2a3a', cloth: '#3a3a4a', trim: '#7fdba4', pants: '#26262f', wep: '#c8d0e0' },
    basic: { range: 2.0, arc: 2.2, mult: 1.0 },
    skills: [
      makeSkill({ id: 1, name: '背刺', mult: 2.5, cd: 4, mp: 12, lv: 1, pattern: 'single', radius: 2.4, icon: 'stab', desc: '背后攻击额外 50% 伤害' }),
      makeSkill({ id: 2, name: '影步', mult: 0, cd: 6, mp: 15, lv: 3, pattern: 'dash', dashDist: 5, radius: 1.5, icon: 'dash', buffId: 'B301', desc: '瞬移并短暂隐身' }),
      makeSkill({ id: 3, name: '毒刃', mult: 1.8, cd: 8, mp: 20, lv: 8, pattern: 'cone', radius: 2.2, arc: 1.4, icon: 'poison', elem: 'poison', debuffId: 'D203', desc: '附加中毒 8 秒' }),
      makeSkill({ id: 4, name: '烟雾弹', mult: 0, cd: 15, mp: 25, lv: 12, pattern: 'circle', radius: 3, icon: 'smoke', debuffId: 'D006', desc: '致盲范围内敌人' }),
      makeSkill({ id: 5, name: '连斩', mult: 0.8, cd: 12, mp: 40, lv: 20, pattern: 'cone', radius: 2.4, arc: 1.4, hits: 5, icon: 'multi', desc: '5 连击' }),
      makeSkill({ id: 6, name: '暗影绝杀', mult: 12.0, cd: 50, mp: 100, lv: 30, pattern: 'single', radius: 3, icon: 'ultimate', elem: 'dark', mustCrit: true, debuffId: 'D205', desc: '必暴必杀一击，附带流血', ult: true })
    ]
  }
};
const CLASS_KEYS = ['warrior', 'archer', 'mage', 'assassin'];

/** 技能等级：默认等于玩家等级的进阶（暂按玩家等级自动同步） */
function skillLevelOf(sk, playerLv) {
  if (sk.ult) return 1 + Math.floor(Math.max(0, playerLv - sk.lv) / 5);
  return clamp(1 + Math.floor(Math.max(0, playerLv - sk.lv) / 6), 1, 10);
}
/** 最终倍率：基础 × (1 + (技能等级-1)×0.08) */
function skillMult(sk, playerLv) {
  const l = skillLevelOf(sk, playerLv);
  return { mult: sk.mult * (1 + (l - 1) * 0.08), lv: l };
}
/** 最终 CD：每 5 级 -1 秒，受冷却缩减影响 */
function skillCd(sk, playerLv, cdr) {
  const l = skillLevelOf(sk, playerLv);
  const base = sk.cd - Math.floor((l - 1) / 5);
  return Math.max(0.6, base * (1 - clamp(cdr || 0, 0, 60) / 100));
}
