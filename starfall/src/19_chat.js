/* ============================================================
 * 19_chat.js —— 世界频道：发言 / 装备信息链接 / 模拟其他玩家
 * 纯数据层；渲染在 UI.openChat 里
 * ==========================================================*/
'use strict';

const NPC_NAMES = ['星尘旅人', '铁匠老王', '夜刃', '钓鱼仙人', '雪原猎手', '炼金术士·薇', '深蓝', '矿工阿泰', '小鹿 montaigne', '星痕猎人'];
const CHAT_LINES = [
  '南边薄荷刷新了，来抢啊！',
  '刚强化 +12 成功，血赚。',
  '有人一起打 BOSS 吗？缺个奶。',
  '谁有多余的强化石？高价收。',
  '这游戏的钓鱼也太上瘾了吧。',
  '翠风平原的野狼掉率还行。',
  '新手记得先做主线装备。',
  '宝箱点位我摸熟了，yy岛上。',
  '熔岩核心终于凑齐了，开心。',
  '装备词条真的太看运气了……'
];
const GEAR_LINK_LINES = [
  '晒个货：{link}',
  '这件怎么样？{link}',
  '刚出炉 {link}，还行吧。',
  '求对比 {link}',
  '出货了 {link}'
];

const Chat = {
  /** 九个独立频道：每个频道一个独立消息箱，互不干扰 */
  chans: ['世界', '中文', 'English', '交易', '队伍', '公会', '私聊', '好友', '系统'],
  msgs: {},                 // ch -> [message]
  max: 80,                  // 每个频道的保留条数
  npcT: 0,

  /** 取某频道的消息箱（不存在则建） */
  box(ch) {
    ch = ch || '世界';
    if (!this.msgs[ch]) this.msgs[ch] = [];
    return this.msgs[ch];
  },
  push(m) {
    m.time = Date.now();
    m.ch = this.chans.indexOf(m.ch) >= 0 ? m.ch : '世界';   // 旧数据/异常频道归入世界
    const b = this.box(m.ch);
    b.push(m);
    while (b.length > this.max) b.shift();
    if (this.onPush) this.onPush(m);      // 未读角标钩子（UI 填）
    if (this.onChange) this.onChange();
    return m;
  },
  /** 玩家发言：支持 #装备 形式的链接由 UI 处理 */
  say(who, channel, text) {
    if (!text) return null;
    return this.push({ who: who, ch: channel, text: text, self: true });
  },
  /** 发送装备信息链接 */
  sayGear(who, channel, inst, note) {
    return this.push({
      who: who, ch: channel, text: note || '', self: true,
      link: gearToLink(inst, who)
    });
  },
  /** 发送任意物品的信息链接（材料 / 消耗品 / 装备通用） */
  sayItem(who, channel, inst, note) {
    if (!inst) return null;
    const isGear = inst.type === 'gear';
    return this.push({
      who: who, ch: channel, text: note || '', self: true,
      link: isGear ? gearToLink(inst, who) : { t: 'item', id: inst.id, q: inst.q, n: inst.n || 1, owner: who }
    });
  },
  /** 系统消息走「系统」频道 */
  system(text) { return this.push({ who: '系统', ch: '系统', text: text, sys: true }); },

  /** 在线期间随机冒出其他玩家的消息；偶尔附带一件随机装备链接 */
  tick(dt) {
    this.npcT -= dt;
    if (this.npcT > 0) return;
    this.npcT = rnd(14, 34);
    const npc = choice(NPC_NAMES);
    if (chance(0.45)) {
      // 生成一件与当前等级段相符的随机装备作为链接
      const lv = clamp(Math.round((UI && UI.game && UI.game.player ? UI.game.player.lv : 10) + irnd(-4, 8)), 1, 60);
      const def = choice(GEAR_DEFS);
      const q = rollQuality(chance(0.25) ? 'boss' : 'elite', 2, chance(0.3) ? 1 : 0);
      const g = newGear(def.id, lv, q, irnd(0, 8));
      this.push({ who: npc, ch: '世界', text: choice(GEAR_LINK_LINES).replace('{link}', '[装备]'), link: gearToLink(g, npc) });
    } else {
      this.push({ who: npc, ch: '世界', text: choice(CHAT_LINES) });
    }
  },

  serialize() {
    const o = {};
    for (const k in this.msgs) o[k] = this.msgs[k].slice(-30);
    return { msgs: o };
  },
  load(d) {
    if (!d || !d.msgs) return;
    if (Array.isArray(d.msgs)) {           // 旧版扁平结构 → 按各自 ch 归箱
      d.msgs.forEach(m => this.push(m));
    } else {
      for (const k in d.msgs) this.box(k).push(...d.msgs[k]);
    }
  }
};
