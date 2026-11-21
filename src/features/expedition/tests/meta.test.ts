/**
 * 讓人一直玩的系統：親密度與覺醒、挑戰規則、訓練家手冊與卡池、常駐卡與補位、每日遠征、
 * 第三章的條件（百變怪、幻之間）、首領的階段檢查點、難度。
 */
import { describe, expect, it } from 'vitest';
import {
  AWAKEN, AWAKEN_AT, BIG_BOSS_HP, EVO_LINES, STAGE2_AT, formOf, stageOf, CARDS, CHAPTERS, FILL_BOND, FILL_HEAL, STARTERS, START_HEARTS, STONE_BOND, bondLevel, matchNode, maxHearts, startBond,
} from '../content';
import { rngFor } from '../rng';
import {
  RuleError, chooseBranch, dailyPlan, dailyScore, eventOf, forkOptions, heartCap, makeOffer, matchSetup, newDailyRun, pickReward,
  fillsFor, liveStreak, randomPartner, recordDaily, refreshGoals, resolveEvent, setLead, slotsOf, swapIn, validateProfile, validateRun,
} from '../logic';
import type { ExpeditionRun, ProfileV1 } from '../types';
import { IDS, Walker, mkRun, must, newProfile, play } from './helpers';

const at = (r: ExpeditionRun, nodeId: string, chapter = r.chapter): ExpeditionRun => ({ ...r, nodeId, chapter });
const BOSS3 = must(matchNode('mewtwo'), 'mewtwo');

describe('friendship and awakening', () => {
  it('a win as the active partner gives +1, an elite or boss +2; full friendship awakens for this run', () => {
    let out = play(mkRun(), newProfile(), 'win');
    expect(out.run.bond).toEqual({ pikachu: 1 });
    expect(out.profile.bondXp).toEqual({ pikachu: 1 });
    out = play(at(mkRun(), 'elite'), newProfile(), 'win');
    expect(out.run.bond.pikachu).toBe(2);
    const near = { ...at(mkRun(), 'elite'), bond: { pikachu: AWAKEN_AT - 2 } };
    out = play(near, newProfile(), 'win');
    expect(out.awakened).toBe('pikachu');
    expect(out.run.awakened).toEqual(['pikachu']);
    expect(out.run.bond.pikachu).toBe(AWAKEN_AT);
    expect(out.profile.awakenedSeen).toEqual(['pikachu']);
    // 再贏不會再覺醒一次
    const again = play(at(pickReward(out.run, out.run.revision, null), 'f3a'), out.profile, 'win');
    expect(again.awakened).toBeUndefined();
    expect(again.run.bond.pikachu).toBe(AWAKEN_AT);
  });
  it('every character can awaken; Mew, Mewtwo and Ditto only get the aura', () => {
    IDS.forEach((id) => expect(AWAKEN[id], id).toBeTruthy());
    expect(['mew', 'mewtwo', 'ditto'].map((id) => AWAKEN[id])).toEqual(['look', 'look', 'look']);
    const out = play(mkRun({ party: 'electrode' }), newProfile(), 'win');
    expect(out.run.bond).toEqual({ electrode: 1 });
    expect(out.profile.bondXp).toEqual({ electrode: 1 });        // 羈絆等級（跨輪）照樣累計
  });
  it('Exp. Share lets the backup gain friendship too', () => {
    const r = { ...mkRun({ party: ['pikachu', 'vaporeon'] }), ownedCardIds: ['expShare'], equippedCardIds: ['expShare'] };
    const out = play(r, newProfile(), 'win');
    expect(out.run.bond).toEqual({ pikachu: 1, vaporeon: 1 });
    // 這一場才收服、補進隊伍的夥伴不算備援
    const solo = { ...mkRun(), ownedCardIds: ['expShare'], equippedCardIds: ['expShare'] };
    expect(play(solo, newProfile(), 'win').run.bond).toEqual({ pikachu: 1 });
  });
  it('a chapter restart takes back the awakening from that chapter', () => {
    const w = new Walker({ ...mkRun({ mode: 'chapter' }), bond: { pikachu: AWAKEN_AT - 1 } });
    w.r = { ...w.r, checkpoint: { ...w.r.checkpoint, bond: { pikachu: AWAKEN_AT - 1 } } };
    w.win();
    expect(w.r.awakened).toEqual(['pikachu']);
    w.r = chooseBranch(w.r, w.r.revision, 'f1a', w.p);
    for (let i = 0; i < START_HEARTS; i++) w.lose();
    expect(w.r.chapterRetries).toBe(1);
    expect(w.r.awakened).toEqual([]);
    expect(w.r.bond).toEqual({ pikachu: AWAKEN_AT - 1 });
    expect(w.p.awakenedSeen).toEqual(['pikachu']);               // 圖鑑上「看過覺醒」不收回
  });
  it('bond levels across runs: Lv2 starts the partner with 1 friendship', () => {
    expect([0, 2, 3, 8, 15, 25].map(bondLevel)).toEqual([1, 1, 2, 3, 4, 5]);
    expect(startBond(2)).toBe(0);
    expect(startBond(3)).toBe(1);
    expect(startBond(15)).toBe(2);
    const r = mkRun({ party: ['pikachu', 'vaporeon'], bond: { pikachu: 1, electrode: 1 } });
    expect(r.bond).toEqual({ pikachu: 1 });
    expect(r.checkpoint.bond).toEqual({ pikachu: 1 });
  });
  it('the evolution stone gives +2 friendship to a party member', () => {
    let seed = '';
    for (let i = 0; i < 200 && !seed; i++) if (eventOf(at(mkRun({ seed: 'st' + i }), 'event3', 2)) === 'evoStone') seed = 'st' + i;
    expect(seed).not.toBe('');
    const r = at(mkRun({ seed, party: ['pikachu', 'vaporeon'] }), 'event3', 2);
    expect(() => resolveEvent(r, r.revision, 'stone', undefined, [])).toThrow(RuleError);
    expect(() => resolveEvent(r, r.revision, 'stone', 'magikarp', [])).toThrow(RuleError);     // 不在隊伍裡
    const out = resolveEvent(r, r.revision, 'stone', 'vaporeon', []);
    expect(out.bond.vaporeon).toBe(STONE_BOND);
    expect(out.nodeId).toBe('fork7');
  });
  it('fills only show up when useful; friendship goes to the first partner who is not full', () => {
    const r = { ...mkRun({ party: ['pikachu', 'vaporeon'] }), phase: 'reward' as const, hearts: START_HEARTS, pendingReward: { settlementId: 'x', offeredCardIds: [FILL_BOND, FILL_HEAL] } };
    expect(pickReward(r, r.revision, FILL_BOND).bond).toEqual({ pikachu: 1 });
    const full = { ...r, bond: { pikachu: AWAKEN_AT }, awakened: ['pikachu'] };
    expect(pickReward(full, full.revision, FILL_BOND).bond).toEqual({ pikachu: AWAKEN_AT, vaporeon: 1 });
    expect(fillsFor({ ...full, hearts: START_HEARTS })).toEqual([FILL_BOND]);
    expect(fillsFor({ ...full, hearts: 1, bond: { pikachu: AWAKEN_AT, vaporeon: AWAKEN_AT }, awakened: ['pikachu', 'vaporeon'] })).toEqual([FILL_HEAL]);
    expect(pickReward(r, r.revision, FILL_HEAL).hearts).toBe(START_HEARTS);
    expect(pickReward({ ...r, hearts: 1 }, r.revision, FILL_HEAL).hearts).toBe(2);
  });
});

describe('starter evolution', () => {
  it('the starters evolve at 3 and 6 friendship; others keep their look', () => {
    expect([0, 2, 3, 5, 6].map((b) => stageOf('charmander', b))).toEqual([1, 1, 2, 2, 3]);
    expect([0, 3, 6].map((b) => formOf('charmander', b))).toEqual(['charmander', 'charmeleon', 'charizard']);
    expect(formOf('bulbasaur', 6)).toBe('venusaur');
    expect(formOf('squirtle', 3)).toBe('wartortle');
    expect(formOf('pikachu', 6)).toBe('pikachu');
    expect(stageOf('pikachu', 6)).toBe(1);
    expect(STAGE2_AT).toBeLessThan(AWAKEN_AT);
  });
  it('evolving follows friendship, and a chapter restart takes it back', () => {
    const w = new Walker({ ...mkRun({ party: 'charmander' }), bond: { charmander: STAGE2_AT - 1 } });
    w.r = { ...w.r, checkpoint: { ...w.r.checkpoint, bond: { charmander: STAGE2_AT - 1 } } };
    w.win();
    expect(formOf('charmander', w.r.bond.charmander || 0)).toBe('charmeleon');
    w.r = chooseBranch(w.r, w.r.revision, 'f1a', w.p);
    for (let i = 0; i < START_HEARTS; i++) w.lose();
    expect(formOf('charmander', w.r.bond.charmander || 0)).toBe('charmander');
  });
  it('every evolved form has a sprite sheet laid out like its first stage', () => {
    // 用 Vite 的 glob 讀 public 底下的圖檔清單和格子設定（不用 Node 的檔案 API）
    const sheets: Record<string, unknown> = import.meta.glob('/public/resources/assets/images/*_sheet.json', { eager: true, import: 'default' });
    const pngs = Object.keys(import.meta.glob('/public/resources/assets/images/*_sheet.png'));
    const frames = (id: string): string[] => {
      const d = sheets['/public/resources/assets/images/' + id + '_sheet.json'];
      if (!d || typeof d !== 'object' || !('frames' in d) || !d.frames || typeof d.frames !== 'object') throw new Error('bad sheet ' + id);
      return Object.keys(d.frames).map((k) => k.replace(/^[a-z]+\/[a-z]+_/, ''));
    };
    Object.entries(EVO_LINES).forEach(([base, forms]) => forms.forEach((f) => {
      expect(pngs, f).toContain('/public/resources/assets/images/' + f + '_sheet.png');
      expect(frames(f), f).toEqual(frames(base));
      expect(frames(f).length, f).toBe(28);
    }));
  });
});

describe('challenges', () => {
  it('Empty Hands: no card slots, and rewards are only fills', () => {
    const r = mkRun({ challenges: ['noCards'] });
    expect(slotsOf(r)).toBe(0);
    const out = play(r, newProfile(), 'win');
    expect(out.offered).toEqual([FILL_BOND]);                  // 心是滿的：不給用不到的回心
    expect(validateRun({ ...out.run, phase: 'map', ownedCardIds: ['charge'], equippedCardIds: ['charge'], pendingReward: undefined }, IDS).ok).toBe(false);
  });
  it('Solo: one partner, captures go to the bench, no switching', () => {
    const r = mkRun({ party: ['pikachu', 'vaporeon'], challenges: ['solo'] });
    expect(r.partyIds).toEqual(['pikachu']);
    const out = play(r, newProfile(), 'win');
    expect(out.run.partyIds).toEqual(['pikachu']);
    expect(out.run.benchIds).toEqual(['magikarp']);
    const m = pickReward(out.run, out.run.revision, null);
    expect(() => swapIn(m, m.revision, 'magikarp', 'pikachu')).toThrow(RuleError);
    expect(() => setLead({ ...m, partyIds: ['pikachu', 'magikarp'] }, m.revision, 'magikarp')).toThrow(RuleError);
  });
  it('Storm Season: normal matches without a rule get strong wind; bosses do not', () => {
    const r = mkRun({ challenges: ['storm'] });
    expect(matchSetup(r, must(matchNode('warmup'), 'warmup')).rule).toBe('wind');
    expect(matchSetup(mkRun(), must(matchNode('warmup'), 'warmup')).rule).toBeUndefined();
    expect(matchSetup(r, must(matchNode('k2'), 'k2')).rule).toBe('lowgrav');       // 有規則的站不變
    expect(matchSetup(r, BOSS3).rule).toBeUndefined();
  });
  it('Light Pack and Mighty Bosses', () => {
    expect(slotsOf({ ...mkRun({ challenges: ['fewSlots'] }), chapter: 2 })).toBe(CHAPTERS[2].slots - 1);
    const base = must(BOSS3.boss, 'boss');
    const big = must(matchSetup(mkRun({ challenges: ['bigBoss'] }), BOSS3).boss, 'boss');
    expect(big.hp).toBe(base.hp + BIG_BOSS_HP);
    expect(big.phases[0].atHp).toBe(big.hp);
    expect(big.phases.slice(1)).toEqual(base.phases.slice(1));
    const both = must(matchSetup(mkRun({ challenges: ['bigBoss'], rank: 2 }), BOSS3).boss, 'boss');
    expect(both.hp).toBe(base.hp + BIG_BOSS_HP + 2);
    // 加了血，這一場要打到的分數也要跟著加，不然血還沒打完比賽就結束了
    expect(matchSetup(mkRun({ challenges: ['bigBoss'], rank: 2 }), BOSS3).score).toBe(both.hp);
    expect(matchSetup(mkRun(), BOSS3).score).toBe(base.hp);
    expect(matchSetup(mkRun(), must(matchNode('warmup'), 'warmup')).score).toBe(5);
  });
  it('Fate: the seed picks the partner', () => {
    const list = ['pikachu', 'vaporeon', 'flareon'];
    expect(randomPartner('abc', list)).toBe(randomPartner('abc', list));
    const picks = new Set<string>();
    for (let i = 0; i < 50; i++) picks.add(randomPartner('s' + i, list));
    expect(picks.size).toBe(3);
  });
  it('clearing with challenges records each of them', () => {
    const out = play(at(mkRun({ challenges: ['storm', 'fewSlots'] }), 'mewtwo', 2), newProfile(), 'win');
    expect(out.run.phase).toBe('cleared');
    expect(out.profile.challengeClears).toEqual({ storm: 1, fewSlots: 1 });
    expect(out.goals).toContain('challenge1');
  });
});

describe('handbook and card pool', () => {
  it('goals are recomputed from the profile and reported once', () => {
    const p: ProfileV1 = { ...newProfile(), stamps: { pikachu: 1 } };
    const a = refreshGoals(p);
    expect(a.achieved).toContain('firstClear');
    expect(a.profile.cardPool).toEqual(['expShare']);
    const b = refreshGoals(a.profile);
    expect(b.achieved).toEqual([]);
    expect(b.profile).toEqual(a.profile);
    const many: ProfileV1 = { ...newProfile(), expeditionUnlocked: IDS.filter((id) => !STARTERS.some((s) => s === id)).slice(0, 11) };
    expect(refreshGoals(many).profile.cardPool).toEqual(['expertBelt']);     // 收服 18 隻
  });
  it('Exp. Share is never offered under Solo, and daily runs ignore the personal card pool', () => {
    for (let i = 0; i < 200; i++) {
      const solo = mkRun({ seed: 'so' + i, challenges: ['solo'] });
      expect(makeOffer(solo, rngFor(solo.seed, 'x', 'cards'), 3, { pool: ['expShare'] })).not.toContain('expShare');
    }
    const plan = dailyPlan('2026-11-21');
    const p: ProfileV1 = { ...newProfile(), cardPool: ['expShare', 'expertBelt'] };
    for (let i = 0; i < 40; i++) {
      const r = { ...newDailyRun({ ...plan, seed: 'dp' + i, chapter: 0 }, plan.partners[0], 0, 'd'), nodeId: 'warmup' };
      expect(play(r, p, 'win').offered || []).not.toContain('expShare');
    }
  });
  it('locked cards only show up once they are in the card pool', () => {
    let seenLocked = false;
    for (let i = 0; i < 200; i++) {
      const r = mkRun({ seed: 'pool' + i });
      const plain = makeOffer(r, rngFor(r.seed, 'x', 'cards'), 3, { pool: [] });
      expect(plain.some((id) => id === 'expShare' || id === 'expertBelt')).toBe(false);
      const open = makeOffer(r, rngFor(r.seed, 'x', 'cards'), 3, { pool: ['expShare', 'expertBelt'] });
      if (open.some((id) => id === 'expShare' || id === 'expertBelt')) seenLocked = true;
    }
    expect(seenLocked).toBe(true);
  });
  it('trading away the Expert Belt at the dojo unequips what no longer fits', () => {
    let seed = '';
    for (let i = 0; i < 200 && !seed; i++) if (eventOf(at(mkRun({ seed: 'dj' + i }), 'event1')) === 'dojo') seed = 'dj' + i;
    const owned = ['expertBelt', 'charge', 'quickShoes', 'windup'];
    const r = { ...at(mkRun({ seed }), 'event1'), ownedCardIds: owned, equippedCardIds: ['charge', 'quickShoes', 'windup'], hearts: 2 };
    expect(validateRun(r, IDS).ok).toBe(true);
    const out = resolveEvent(r, r.revision, 'trade', 'expertBelt', []);
    expect(out.equippedCardIds).toEqual(['charge', 'quickShoes']);
    expect(validateRun(out, IDS).ok).toBe(true);
  });
  it('the Expert Belt takes no slot: +1 slot, -1 max heart, and cannot be equipped', () => {
    const r = { ...mkRun(), phase: 'reward' as const, pendingReward: { settlementId: 'x', offeredCardIds: ['expertBelt'] } };
    const out = pickReward(r, r.revision, 'expertBelt');
    expect(out.ownedCardIds).toEqual(['expertBelt']);
    expect(out.equippedCardIds).toEqual([]);
    expect(slotsOf(out)).toBe(CHAPTERS[0].slots + 1);
    expect(heartCap(out)).toBe(START_HEARTS - 1);
    expect(out.hearts).toBe(START_HEARTS - 1);
    expect(validateRun({ ...out, equippedCardIds: ['expertBelt'] }, IDS).ok).toBe(false);
    expect(validateRun(out, IDS).ok).toBe(true);
  });
  it('profiles: optional fields are checked when present', () => {
    expect(validateProfile(newProfile(), IDS).ok).toBe(true);
    const bad: Record<string, unknown>[] = [
      { goals: { firstClear: 2 } }, { cardPool: ['nope'] }, { bondXp: { missingno: 1 } }, { challengeClears: { nope: 1 } },
      { awakenedSeen: ['missingno'] }, { daily: { lastDate: '', streak: -1, bestStreak: 0, history: [] } },
    ];
    bad.forEach((patch) => expect(validateProfile({ ...newProfile(), ...patch }, IDS).ok, JSON.stringify(patch)).toBe(false));
  });
});

describe('chapter 3 gates and the boss checkpoint', () => {
  it('Ditto only follows a trainer with clear stamps from three partners', () => {
    const r = at(mkRun(), 'c3gate', 2);
    const gated = play(r, newProfile(), 'win');
    expect(gated.capture).toEqual({ char: 'ditto', ok: false, sure: false, joined: false, gated: { have: 0, need: 3 } });
    expect(gated.profile.captureMissesByCharacter).toEqual({});           // 不算沒收服到（不給保底）
    const ok = play(r, { ...newProfile(), stamps: { pikachu: 1, vaporeon: 1, jolteon: 2 } }, 'win');
    expect(ok.capture).toMatchObject({ char: 'ditto', ok: true });
  });
  it('in One Life (and the daily run) the Mythical Room needs a run without a single loss', () => {
    const r = at(mkRun({ mode: 'ironman' }), 'fork7', 2);
    expect(forkOptions(r, newProfile(), 'fork7')).toContain('mewroom');
    expect(forkOptions({ ...r, losses: 1 }, newProfile(), 'fork7')).toEqual(['f7a', 'f7b']);
  });
  it('the Mythical Room opens for a run with no chapter restarts, three stamps, or Mew already caught', () => {
    const r = at(mkRun(), 'fork7', 2);
    expect(forkOptions(r, newProfile(), 'fork7')).toEqual(['mewroom', 'f7a', 'f7b']);
    const retried = { ...r, chapterRetries: 1 };
    expect(forkOptions(retried, newProfile(), 'fork7')).toEqual(['f7a', 'f7b']);
    expect(() => chooseBranch(retried, retried.revision, 'mewroom', newProfile())).toThrow(RuleError);
    expect(forkOptions(retried, { ...newProfile(), stamps: { a: 1, b: 1, c: 1 } }, 'fork7')).toContain('mewroom');
    expect(forkOptions(retried, { ...newProfile(), expeditionUnlocked: ['mew'] }, 'fork7')).toContain('mewroom');
  });
  it('a boss loss remembers the furthest phase within the chapter attempt', () => {
    const w = new Walker(at(mkRun(), 'mewtwo', 2));
    w.lose({ bossReached: 1 });
    expect(w.r.bossPhase).toBe(1);
    expect(matchSetup(w.r, BOSS3).bossStart).toBe(1);
    w.lose({ bossReached: 0 });                             // 打得比上次差：還是從第 2 階段開始
    expect(w.r.bossPhase).toBe(1);
    w.r = { ...w.r, hearts: 1 };
    w.lose({ bossReached: 2 });                             // 心用完：章節重來，檢查點清掉
    expect(w.r.chapterRetries).toBe(1);
    expect(w.r.bossPhase).toBeUndefined();
    // 一命到底沒有階段檢查點；非首領站不記
    const iron = { ...at(mkRun({ mode: 'ironman' }), 'mewtwo', 2), bossPhase: 2 };
    expect(matchSetup(iron, BOSS3).bossStart).toBe(0);
    expect(play(at(mkRun(), 'warmup'), newProfile(), 'loss', { bossReached: 2 }).run.bossPhase).toBeUndefined();
  });
  it('ranks: a clear opens the next rank and stamps the partner; rank 3 has 2 hearts', () => {
    const out = play(at(mkRun({ party: 'jolteon', mode: 'ironman', rank: 1 }), 'mewtwo', 2), newProfile(), 'win');
    expect(out.run.phase).toBe('cleared');
    expect(out.profile.rankUnlocked).toBe(2);
    expect(out.profile.stamps).toEqual({ jolteon: 2 });
    expect(out.profile.ironmanClears).toEqual(['jolteon']);
    expect(out.profile.expeditionUnlocked).toEqual(['mewtwo']);
    const r3 = mkRun({ rank: 3 });
    expect(r3.hearts).toBe(2);
    expect(maxHearts(3)).toBe(2);
    expect(validateRun({ ...r3, hearts: 3 }, IDS).ok).toBe(false);
    expect(validateRun({ ...r3, rank: 9 }, IDS).ok).toBe(false);
    expect(mkRun({ rank: 99 }).rank).toBe(3);
  });
});

describe('daily expedition', () => {
  it('the plan is fixed by the date', () => {
    const a = dailyPlan('2026-11-21');
    expect(dailyPlan('2026-11-21')).toEqual(a);
    expect(a.partners.length).toBe(3);
    expect(new Set(a.partners).size).toBe(3);
    a.partners.forEach((id) => expect(STARTERS).toContain(id));
    expect(a.cards.length).toBe(2);
    a.cards.forEach((id) => { const c = CARDS.find((x) => x.id === id); expect(c && !c.locked && !c.passive).toBe(true); });
    expect(a.chapter).toBeGreaterThanOrEqual(0);
    expect(a.chapter).toBeLessThan(CHAPTERS.length);
    const days = new Set<string>();
    for (let d = 1; d <= 28; d++) days.add(JSON.stringify(dailyPlan('2026-02-' + String(d).padStart(2, '0'))));
    expect(days.size).toBe(28);
  });
  it('a daily run is one chapter on rank 1 with one life, starting with the day\'s cards', () => {
    const plan = dailyPlan('2026-11-21');
    expect(() => newDailyRun(plan, 'mewtwo', 0, 'd')).toThrow();
    const r = newDailyRun(plan, plan.partners[1], 0, 'd');
    expect(r.mode).toBe('ironman');
    expect(r.rank).toBe(1);
    expect(r.chapter).toBe(plan.chapter);
    expect(r.nodeId).toBe(CHAPTERS[plan.chapter].first);
    expect(r.ownedCardIds).toEqual(plan.cards);
    expect(r.equippedCardIds).toEqual(plan.cards.slice(0, slotsOf(r)));
    expect(r.daily).toBe('2026-11-21');
    expect(validateRun(r, IDS).ok).toBe(true);
  });
  it('clearing the chapter ends the daily run and records the score', () => {
    const plan = { ...dailyPlan('2026-11-21'), chapter: 0 };
    const r = { ...newDailyRun(plan, plan.partners[0], 0, 'd'), nodeId: 'boss', pointDiff: 12, hearts: 2 };
    const out = play(r, newProfile(), 'win');
    expect(out.run.phase).toBe('cleared');
    expect(out.run.chapter).toBe(0);                         // 不會進下一章
    expect(dailyScore(out.run)).toBe(2 * 100 + 12 + 5);
    expect(out.profile.daily).toEqual({ lastDate: '2026-11-21', streak: 1, bestStreak: 1, history: [{ date: '2026-11-21', score: 217, cleared: true }] });
    expect(out.profile.stamps).toEqual({});                  // 每日不給通關印章、不開難度
    expect(out.profile.expeditionUnlocked).toEqual([]);        // 也不給新的永久收服
    expect(out.capture).toBeUndefined();
    expect(out.profile.rankUnlocked).toBeUndefined();
    expect(out.goals).toContain('daily1');
  });
  it('falling in the daily run also records it; streaks count consecutive days', () => {
    const plan = dailyPlan('2026-11-21');
    const r = { ...newDailyRun(plan, plan.partners[0], 0, 'd'), hearts: 1 };
    const out = play(r, newProfile(), 'loss');
    expect(out.run.phase).toBe('failed');
    expect(out.profile.daily && out.profile.daily.history).toEqual([{ date: '2026-11-21', score: -5, cleared: false }]);
    const day = (date: string, phase: 'cleared' | 'failed', hearts: number, pointDiff: number): ExpeditionRun => ({ ...mkRun(), daily: date, phase, hearts, pointDiff });
    let p = recordDaily(newProfile(), day('2026-11-20', 'cleared', 3, 4));
    p = recordDaily(p, day('2026-11-21', 'failed', 0, -3));
    expect(p.daily && [p.daily.streak, p.daily.bestStreak]).toEqual([2, 2]);
    p = recordDaily(p, day('2026-11-21', 'cleared', 1, 2));   // 同一天再打是練習：分數照第一次，不加天數
    expect(p.daily && p.daily.history[1]).toEqual({ date: '2026-11-21', score: -3, cleared: false });
    expect(p.daily && p.daily.streak).toBe(2);
    p = recordDaily(p, day('2026-11-23', 'cleared', 3, 0));   // 中間斷了一天
    expect(p.daily && [p.daily.streak, p.daily.bestStreak]).toEqual([1, 2]);
    expect(liveStreak(p.daily, '2026-11-24')).toBe(1);
    expect(liveStreak(p.daily, '2026-11-26')).toBe(0);          // 斷掉了，畫面上顯示 0
    p = recordDaily(p, day('2026-11-22', 'cleared', 3, 0));   // 跨日才打完的舊日期：補進紀錄，不動連續天數
    expect(p.daily && [p.daily.lastDate, p.daily.streak]).toEqual(['2026-11-23', 1]);
    expect(p.daily && p.daily.history.map((h) => h.date)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']);
    expect(validateProfile(p, IDS).ok).toBe(true);
  });
});
