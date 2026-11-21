/**
 * 路線與內容：三章一路打到底、每一輪的岔路、內容只指向存在的東西、三種語言的文字都齊。
 */
import { describe, expect, it } from 'vitest';
import {
  AWAKEN, CARDS, CHALLENGES, CHAPTERS, CHAR_TAG, DEX_WHERE, EVENTS, FORK_OF, GOALS, NODES, RULE_POOL, START_HEARTS,
  chapterOf, isMechCard, matchNode, nodeById,
} from '../content';
import { chooseBranch, leaveSupply, resolveEvent, slotsOf, validateRun } from '../logic';
import { resolveMatch, routeOf } from '../route';
import { en } from '../texts/en';
import { ko } from '../texts/ko';
import { zh } from '../texts/zh';
import { IDS, Walker, mkRun, optionsOf } from './helpers';

describe('a full run', () => {
  it('wins through all three chapters', () => {
    const w = new Walker(mkRun({ party: ['pikachu', 'vaporeon'] }));
    const go = (opt: string): void => { w.r = chooseBranch(w.r, w.r.revision, opt, w.p); };
    const rest = (): void => { w.r = leaveSupply(w.r, w.r.revision, w.r.equippedCardIds); };
    const leave = (): void => { w.r = resolveEvent(w.r, w.r.revision, 'leave', undefined, []); };
    w.win();
    expect(w.r.nodeId).toBe('fork1');
    go('f1b'); w.win();
    expect(w.r.nodeId).toBe('event1');
    leave(); go('f2b'); w.win(); rest(); w.win(); go('f3b'); w.win();
    expect(w.r.nodeId).toBe('camp');
    rest();
    w.r = { ...w.r, hearts: 1 };                           // 帶著 1 顆心打倒第一章首領
    w.win();
    // 第一章首領 → 第二章開頭：心回滿、卡槽變 3、記新的快照
    expect(w.r.phase).toBe('map');
    expect(w.r.chapter).toBe(1);
    expect(w.r.nodeId).toBe('gate');
    expect(w.r.hearts).toBe(START_HEARTS);
    expect(w.r.visitedNodeIds).toEqual(['warmup', 'f1b', 'event1', 'f2b', 'supply', 'elite', 'f3b', 'camp', 'boss']);
    expect(w.r.checkpoint.visitedNodeIds).toEqual(w.r.visitedNodeIds);
    expect(slotsOf(w.r)).toBe(3);
    expect(validateRun(w.r, IDS).ok).toBe(true);
    w.win(); go('f4a'); w.win(); leave(); go('thunder'); w.win(); rest();
    w.win(); w.win(); w.win();                             // 四天王
    expect(w.r.nodeId).toBe('c2camp2');
    rest(); w.win();
    // 第二章首領 → 第三章：華藍洞窟
    expect(w.r.chapter).toBe(2);
    expect(w.r.nodeId).toBe('c3gate');
    expect(slotsOf(w.r)).toBe(4);
    const ditto = w.win();
    expect(ditto.capture).toMatchObject({ char: 'ditto', ok: false, gated: { have: 0, need: 3 } });   // 還沒有三隻夥伴的印章
    go('f6a'); w.win(); leave();
    expect(optionsOf('fork7')).toContain('mewroom');
    go('mewroom');                                         // 一次都沒重來過：幻之間開著
    const mew = w.win();
    expect(mew.capture).toMatchObject({ char: 'mew', ok: true });
    rest(); w.win(); w.win(); rest();
    expect(w.r.nodeId).toBe('mewtwo');
    w.win();
    expect(w.r.phase).toBe('cleared');
    expect(w.p.expeditionUnlocked).toEqual(expect.arrayContaining(['magikarp', 'farfetchd', 'dragonite', 'electrode', 'bird', 'gengar', 'umbreon', 'mew', 'mewtwo']));
    expect(w.p.expeditionUnlocked).not.toContain('ditto');
    expect(w.p.stamps).toEqual({ pikachu: 1 });
    expect(w.p.rankUnlocked).toBe(1);
    expect(w.p.goals && w.p.goals.firstClear).toBe(1);
    expect(w.p.cardPool).toContain('expShare');             // 第一次通關：學習裝置進卡池
    expect(validateRun(w.r, IDS).ok).toBe(true);
  });
});

describe('route', () => {
  it('each seed gives a fixed route; options at a fork differ; no opponent repeats within a chapter', () => {
    const seen = new Set<string>();
    const slotsByChapter = [['f1a', 'f1b', 'f2a', 'f2b', 'f3a', 'f3b'], ['f4a', 'f4b', 'f5b'], ['f6a', 'f6b', 'f7a', 'f7b']];
    for (let i = 0; i < 200; i++) {
      const seed = 'route' + i, a = routeOf(seed);
      expect(routeOf(seed)).toEqual(a);
      slotsByChapter.forEach((ids) => {
        const o = ids.map((id) => a[id].opp);
        expect(new Set(o).size).toBe(o.length);
      });
      ['fork1', 'fork2', 'fork3', 'fork4', 'fork6'].forEach((f) => {
        const [x, y] = optionsOf(f).map((id) => a[id]);
        expect(x.opp).not.toBe(y.opp);
        expect(x.rule || null).not.toBe(y.rule || null);
      });
      ['f1a', 'f2a', 'f3b', 'f4a'].forEach((id) => { expect(RULE_POOL).toContain(a[id].rule || null); expect(a[id].rule).not.toBe('wind'); });
      seen.add(Object.values(a).map((x) => x.opp + (x.rule || '-')).join(','));
    }
    expect(seen.size).toBeGreaterThan(100);              // 每一輪真的不一樣
  });
  it('chapter 3 forks can roll the gravity field', () => {
    let heavy = 0;
    for (let i = 0; i < 100; i++) if (resolveMatch('f6a', 'h' + i)?.rule === 'heavy') heavy++;
    expect(heavy).toBeGreaterThan(5);
  });
});

describe('content', () => {
  it('only refers to things that exist', () => {
    NODES.forEach((n) => {
      if (n.kind === 'match') { expect(IDS).toContain(n.opp); if (n.next) expect(nodeById(n.next)).toBeTruthy(); }
      if (n.kind === 'fork') { n.options.forEach((o) => expect(matchNode(o)).toBeTruthy()); if (n.hidden) expect(n.options).toContain(n.hidden); }
      if (n.kind === 'supply' || n.kind === 'event') expect(nodeById(n.next)).toBeTruthy();
      if (n.kind === 'event') n.pool.forEach((e) => expect(EVENTS[e]).toBeTruthy());
    });
    CHAPTERS.forEach((c, ci) => {
      expect(nodeById(c.first)).toBeTruthy();
      c.stops.forEach((st) => st.forEach((id) => { expect(nodeById(id)).toBeTruthy(); expect(chapterOf(id)).toBe(ci); }));
    });
    Object.keys(FORK_OF).forEach((f) => {
      const n = nodeById(f);
      if (!n || n.kind !== 'fork') throw new Error(f + ' is not a fork');
      n.options.forEach((o) => expect(CHAPTERS[chapterOf(f)].stops[FORK_OF[f]]).toContain(o));
    });
    Object.keys(DEX_WHERE).forEach((ch) => {
      expect(IDS).toContain(ch);
      const w = DEX_WHERE[ch];
      if (w !== 'fork') expect(matchNode(w)?.opp).toBe(ch);
    });
    Object.keys(CHAR_TAG).forEach((ch) => expect(IDS).toContain(ch));
    Object.keys(AWAKEN).forEach((ch) => expect(IDS).toContain(ch));
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(CARDS.length).toBe(17);
    // 每一章最後一站是首領，首領的每個階段門檻由高到低
    CHAPTERS.forEach((c) => {
      const last = c.stops[c.stops.length - 1][0], boss = matchNode(last)?.boss;
      if (!boss) throw new Error(last + ' has no boss');
      expect(boss.phases[0].atHp).toBe(boss.hp);
      boss.phases.forEach((ph, i) => { if (i) expect(ph.atHp).toBeLessThan(boss.phases[i - 1].atHp); });
    });
  });
  it('has every text in all three languages', () => {
    const langs = { zh, en, ko };
    Object.entries(langs).forEach(([lang, T]) => {
      const need = (table: Readonly<Record<string, unknown>>, key: string, what: string): void => { expect(table[key], lang + ' ' + what + ' ' + key).toBeTruthy(); };
      NODES.forEach((n) => { if (!(n.kind === 'match' && n.slot)) need(T.nodeName, n.id, 'nodeName'); });
      CHAPTERS.forEach((c) => need(T.chapterName, c.id, 'chapterName'));
      RULE_POOL.concat(['wind', 'heavy', 'stasis', 'gravflip']).forEach((r) => { if (r) { need(T.ruleName, r, 'ruleName'); need(T.ruleDesc, r, 'ruleDesc'); } });
      CARDS.forEach((c) => { need(T.cardName, c.id, 'cardName'); if (isMechCard(c.id) || c.effect) need(T.cardDesc, c.id, 'cardDesc'); });
      ['@bond', '@heal'].forEach((f) => { need(T.cardName, f, 'cardName'); need(T.cardDesc, f, 'cardDesc'); });
      CARDS.forEach((c) => { if (c.mech) need(T.mechPop, c.mech, 'mechPop'); });
      Object.keys(AWAKEN).forEach((ch) => { need(T.awakenName, ch, 'awakenName'); need(T.awakenDesc, ch, 'awakenDesc'); });
      Object.entries(AWAKEN).forEach(([ch, kind]) => { if (kind !== 'look' && ch !== 'meowth') need(T.awakenPop, ch, 'awakenPop'); });
      CHAPTERS.forEach((c) => matchNode(c.stops[c.stops.length - 1][0])?.boss?.phases.forEach((ph, i) => {
        if (i) { need(T.phaseTitle, ph.id, 'phaseTitle'); need(T.phaseNote, ph.id, 'phaseNote'); }
      }));
      Object.keys(EVENTS).forEach((e) => { need(T.eventTitle, e, 'eventTitle'); need(T.eventDesc, e, 'eventDesc'); });
      GOALS.forEach((g) => need(T.goalName, g.id, 'goalName'));
      CHALLENGES.forEach((c) => { need(T.challengeName, c, 'challengeName'); need(T.challengeDesc, c, 'challengeDesc'); });
      // 岔路會抽到的對手：都有地名和夥伴的提示
      NODES.forEach((n) => { if (n.kind === 'match' && n.slot) n.slot.pool.forEach((opp) => { need(T.placeByOpp, opp, 'placeByOpp'); need(T.tipsOpp, opp, 'tipsOpp'); }); });
    });
  });
});
