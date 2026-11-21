/**
 * 規則（純函式）：亂數、入場、輸贏與心、章節重來、奇遇、後援、收服、三選一、補給站、讀檔檢查。
 */
import { describe, expect, it } from 'vitest';
import { CARDS, EVENTS, START_HEARTS, cardById, type EventChoice } from '../content';
import { offerCards } from '../cards';
import { RuleError, beginMatch, chooseBranch, eventOf, leaveSupply, pickReward, resolveEvent, setLead, swapIn, validateRun } from '../logic';
import { rngFor } from '../rng';
import { resolveMatch } from '../route';
import { IDS, Walker, mkRun, must, newProfile, offered, play } from './helpers';

describe('rng', () => {
  it('is reproducible for the same seed, node and purpose', () => {
    const a = rngFor('abc', 'n1', 'cards'), b = rngFor('abc', 'n1', 'cards');
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });
  it('gives independent streams per purpose and node', () => {
    const seq = (n: string, p: 'cards' | 'capture'): number[] => { const r = rngFor('abc', n, p); return [r.next(), r.next(), r.next()]; };
    expect(seq('n1', 'cards')).not.toEqual(seq('n1', 'capture'));
    expect(seq('n1', 'cards')).not.toEqual(seq('n2', 'cards'));
  });
  it('stays in [0, 1)', () => {
    const r = rngFor('x', 'y', 'route');
    for (let i = 0; i < 1000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('matches and hearts', () => {
  it('begins a match once and keeps the same matchId when already active', () => {
    const r0 = mkRun();
    const r1 = beginMatch(r0, r0.revision);
    expect(r1.phase).toBe('active');
    expect(r1.matchId).toBe('warmup#1');
    expect(beginMatch(r1, r1.revision)).toBe(r1);
  });
  it('rejects a stale revision', () => {
    const r0 = mkRun();
    expect(() => beginMatch(r0, r0.revision - 1)).toThrow(RuleError);
  });
  it('one life: a loss costs one heart and the last heart ends the run', () => {
    const w = new Walker(mkRun({ mode: 'ironman' }));
    for (let i = 0; i < START_HEARTS; i++) w.lose();
    expect(w.r.hearts).toBe(0);
    expect(w.r.phase).toBe('failed');
    expect(w.r.losses).toBe(START_HEARTS);
  });
  it('keeps the total point difference for the daily score', () => {
    const w = new Walker(mkRun());
    w.lose();
    expect(w.r.pointDiff).toBe(-5);
    w.win();
    expect(w.r.pointDiff).toBe(0);
  });
  it('chapters: running out of hearts restarts the chapter from its snapshot, keeping permanent captures', () => {
    const w = new Walker(mkRun());
    expect(w.r.mode).toBe('chapter');
    w.win();
    expect(w.r.partyIds).toEqual(['pikachu', 'magikarp']);
    expect(w.r.ownedCardIds.length).toBe(1);
    w.r = chooseBranch(w.r, w.r.revision, 'f1b', w.p);
    for (let i = 0; i < START_HEARTS; i++) {
      const out = play(w.r, w.p, i === 1 ? 'forfeit' : 'loss');
      w.r = out.run;
      expect(!!out.chapterRestart).toBe(i === START_HEARTS - 1);
    }
    expect(w.r.phase).toBe('map');
    expect(w.r.nodeId).toBe('warmup');
    expect(w.r.hearts).toBe(START_HEARTS);
    expect(w.r.chapterRetries).toBe(1);
    expect(w.r.losses).toBe(START_HEARTS);
    expect(w.r.partyIds).toEqual(['pikachu']);        // 回到這一章開始時的隊伍
    expect(w.r.ownedCardIds).toEqual([]);
    expect(w.r.visitedNodeIds).toEqual([]);
    expect(w.p.expeditionUnlocked).toEqual(['magikarp']);   // 永久收服不收回
    // 再贏一次熱身：已經收服過，不擲收服、圖鑑不動，但牠會回來幫忙
    const again = play(w.r, w.p, 'win');
    expect(again.capture).toMatchObject({ char: 'magikarp', returning: true });
    expect(again.profile.expeditionUnlocked).toEqual(w.p.expeditionUnlocked);
    expect(again.run.partyIds).toEqual(['pikachu', 'magikarp']);
    expect(validateRun(again.run, IDS).ok).toBe(true);
  });
  it('a failed run only exists in one-life mode', () => {
    const r = mkRun();
    expect(validateRun({ ...r, phase: 'failed', hearts: 0 }, IDS).ok).toBe(false);
    expect(validateRun({ ...r, mode: 'ironman', phase: 'failed', hearts: 0 }, IDS).ok).toBe(true);
    expect(validateRun({ ...r, mode: 'hard' }, IDS).ok).toBe(false);
    expect(validateRun({ ...r, chapter: 5 }, IDS).ok).toBe(false);
    expect(validateRun({ ...r, checkpoint: { ...r.checkpoint, partyIds: ['missingno'] } }, IDS).ok).toBe(false);
    const old = validateRun({ ...r, schemaVersion: 2 }, IDS);
    expect(!old.ok && old.reason).toBe('unsupported');     // 舊版的存檔：保留、不能接著玩
  });
});

describe('events', () => {
  it('are fixed by the seed; heal is capped; card choices go through reward', () => {
    const at = (seed: string, hearts = START_HEARTS) => ({ ...mkRun({ seed }), nodeId: 'event1', hearts });
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const r = at('e' + i), ev = must(eventOf(r), 'event');
      expect(eventOf(r)).toBe(ev);
      seen.add(ev);
      const opts = EVENTS[ev];
      expect(opts[opts.length - 1]).toBe('leave');
      expect(opts.indexOf('stone')).toBe(-1);              // 第一章沒有進化之石
      expect(() => resolveEvent(r, r.revision, 'stone', 'pikachu', [])).toThrow(RuleError);   // 不是這個奇遇的選項
      if (opts.indexOf('gamble') >= 0) {
        const g = resolveEvent(r, r.revision, 'gamble', undefined, []);
        expect(g.hearts).toBe(START_HEARTS - 1);
        expect(offered(g).every((id) => !!(cardById(id) || { mech: undefined }).mech)).toBe(true);
        const poor = at('e' + i, 1);
        expect(() => resolveEvent(poor, poor.revision, 'gamble', undefined, [])).toThrow(RuleError);   // 只剩 1 顆心不能賭
      }
      if (opts.indexOf('trade') >= 0) {
        expect(() => resolveEvent(r, r.revision, 'trade', undefined, [])).toThrow(RuleError);         // 沒有卡
        const rich = { ...r, ownedCardIds: ['charge', 'quickShoes'], equippedCardIds: ['charge'] };
        const t = resolveEvent(rich, rich.revision, 'trade', 'charge', []);
        expect(t.ownedCardIds).toEqual(['quickShoes']);
        expect(t.equippedCardIds).toEqual([]);
        expect(offered(t)).not.toContain('charge');
      }
      if (opts.indexOf('heal') >= 0) {
        expect(resolveEvent(r, r.revision, 'heal', undefined, []).hearts).toBe(START_HEARTS);
        const hurt = at('e' + i, 1);
        expect(resolveEvent(hurt, hurt.revision, 'heal', undefined, []).hearts).toBe(2);
      }
      const cardOpt = opts.find((o): o is EventChoice => o === 'cards2' || o === 'cards3');
      if (cardOpt) {
        const out = resolveEvent(r, r.revision, cardOpt, undefined, []);
        expect(out.phase).toBe('reward');
        expect(out.nodeId).toBe('fork2');
        expect(offered(out).length).toBe(cardOpt === 'cards2' ? 2 : 3);
        expect(pickReward(out, out.revision, null).phase).toBe('map');
      }
    }
    expect(seen.size).toBe(5);
  });
});

describe('party, captures and rewards', () => {
  it('bench: a capture with a full party waits on the bench and can be swapped in', () => {
    const out = play(mkRun({ party: ['pikachu', 'vaporeon'] }), newProfile(), 'win');
    const r = pickReward(out.run, out.run.revision, null);
    expect(r.benchIds).toEqual(['magikarp']);
    expect(() => swapIn(r, r.revision, 'magikarp', null)).toThrow(RuleError);   // 隊伍滿了，要指定換誰
    expect(() => swapIn(r, r.revision, 'jolteon', 'pikachu')).toThrow(RuleError);
    const a = swapIn(r, r.revision, 'magikarp', 'pikachu');
    expect(a.partyIds).toEqual(['magikarp', 'vaporeon']);                     // 頂替上場的位置
    expect(a.benchIds).toEqual(['pikachu']);
    const b = swapIn(a, a.revision, 'pikachu', 'vaporeon');
    expect(b.partyIds).toEqual(['magikarp', 'pikachu']);
    expect(b.benchIds).toEqual(['vaporeon']);
    const one = { ...mkRun(), benchIds: ['magikarp'] };
    expect(swapIn(one, one.revision, 'magikarp', null).partyIds).toEqual(['pikachu', 'magikarp']);
    expect(validateRun({ ...b, benchIds: ['magikarp'] }, IDS).ok).toBe(false);  // 同時在隊伍和後援：壞檔
  });
  it('a sure capture joins the party when there is room, and is only recorded when full', () => {
    let out = play(mkRun(), newProfile(), 'win');
    expect(out.capture).toEqual({ char: 'magikarp', ok: true, sure: true, joined: true });
    expect(out.run.partyIds).toEqual(['pikachu', 'magikarp']);
    out = play(mkRun({ party: ['pikachu', 'vaporeon'] }), newProfile(), 'win');
    expect(out.capture && out.capture.joined).toBe(false);
    expect(out.run.partyIds).toEqual(['pikachu', 'vaporeon']);
    expect(out.run.benchIds).toEqual(['magikarp']);
    expect(out.profile.expeditionUnlocked).toEqual(['magikarp']);
    // 已經收服過：不會再收一次（圖鑑不動），只是回來幫忙
    const again = play(mkRun({ runId: 'r2' }), out.profile, 'win');
    expect(again.capture && again.capture.returning).toBe(true);
    expect(again.profile.expeditionUnlocked).toEqual(out.profile.expeditionUnlocked);
  });
  it('a chance capture is fixed by the seed, and a miss guarantees the next one', () => {
    const at = (seed: string, profile = newProfile()) => play({ ...mkRun({ seed }), nodeId: 'f1a' }, profile, 'win');
    let hit = 0, missSeed = '';
    for (let i = 0; i < 400; i++) {
      const a = at('seed' + i), b = at('seed' + i);
      expect(a.capture).toEqual(b.capture);                              // 同一個種子，重來幾次都一樣
      if (a.capture && a.capture.ok) hit++; else missSeed = 'seed' + i;
    }
    expect(hit).toBeGreaterThan(400 * 0.5);
    expect(hit).toBeLessThan(400 * 0.7);
    const miss = at(missSeed), who = must(resolveMatch('f1a', missSeed), 'f1a').opp;
    expect(miss.profile.captureMissesByCharacter[who]).toBe(1);
    expect(miss.profile.expeditionUnlocked).toEqual([]);
    const next = at(missSeed, miss.profile);                             // 同一個「不中」的種子，這次保底
    expect(next.capture).toMatchObject({ ok: true, sure: true });
    expect(next.profile.captureMissesByCharacter[who]).toBeUndefined();
  });
  it('an opponent already caught joins this run when beaten, without a capture roll', () => {
    const p = { ...newProfile(), expeditionUnlocked: ['magikarp'] };
    let out = play(mkRun(), p, 'win');
    expect(out.capture).toEqual({ char: 'magikarp', ok: true, sure: true, joined: true, returning: true });
    expect(out.run.partyIds).toEqual(['pikachu', 'magikarp']);
    expect(out.profile.expeditionUnlocked).toEqual(['magikarp']);
    out = play(mkRun({ party: ['pikachu', 'vaporeon'] }), p, 'win');
    expect(out.run.benchIds).toEqual(['magikarp']);
  });
  it('rewards: three distinct unowned cards, same seed gives the same offer, and reward blocks the map', () => {
    const a = play(mkRun(), newProfile(), 'win'), b = play(mkRun(), newProfile(), 'win');
    expect(a.offered).toEqual(b.offered);
    expect(new Set(a.offered).size).toBe(3);
    const r = a.run;
    expect(r.phase).toBe('reward');
    expect(() => beginMatch(r, r.revision)).toThrow(RuleError);
    expect(() => chooseBranch(r, r.revision, 'f1b', newProfile())).toThrow(RuleError);
    expect(() => pickReward(r, r.revision, 'not-a-card')).toThrow(RuleError);
    const skipped = pickReward(r, r.revision, null);
    expect(skipped.phase).toBe('map');
    expect(skipped.ownedCardIds).toEqual([]);
    expect(() => pickReward(skipped, skipped.revision, offered(r)[0])).toThrow(RuleError);   // 不能再選一次
    // 牌池不夠就少給，沒有就不給
    const rng = { next: () => 0, int: () => 0, pick: <T>(x: readonly T[]): T => x[0] };
    const all = CARDS.map((c) => c.id);
    expect(offerCards(all.slice(0, all.length - 2), rng).length).toBe(2);
    expect(offerCards(all, rng)).toEqual([]);
  });
  it('the elite offers only mechanic cards', () => {
    for (let i = 0; i < 30; i++) {
      const out = play({ ...mkRun({ seed: 'el' + i }), nodeId: 'elite' }, newProfile(), 'win');
      expect(must(out.offered, 'offer').every((id) => !!(cardById(id) || { mech: undefined }).mech)).toBe(true);
    }
  });
  it('supply: loadout must be owned cards within the slots; switching the lead reorders the party', () => {
    const r = { ...mkRun({ party: ['pikachu', 'vaporeon'] }), nodeId: 'supply', ownedCardIds: ['quickShoes', 'charge', 'windup'], equippedCardIds: ['quickShoes', 'charge'] };
    expect(() => leaveSupply(r, r.revision, ['quickShoes', 'charge', 'windup'])).toThrow(RuleError);
    expect(() => leaveSupply(r, r.revision, ['galeForce'])).toThrow(RuleError);
    expect(() => leaveSupply(r, r.revision, ['charge', 'charge'])).toThrow(RuleError);
    const sw = setLead(r, r.revision, 'vaporeon');
    expect(sw.partyIds).toEqual(['vaporeon', 'pikachu']);
    expect(() => setLead(r, r.revision, 'magikarp')).toThrow(RuleError);
    const out = leaveSupply(sw, sw.revision, ['windup']);
    expect(out.equippedCardIds).toEqual(['windup']);
    expect(out.nodeId).toBe('elite');
  });
});

describe('validation', () => {
  it('flags future versions as unsupported, broken shapes as corrupt', () => {
    const r = mkRun();
    expect(validateRun(r, IDS).ok).toBe(true);
    const fut = validateRun({ ...r, schemaVersion: 9 }, IDS);
    expect(!fut.ok && fut.reason).toBe('unsupported');
    const cases: Record<string, unknown>[] = [
      { hearts: 99 }, { partyIds: ['missingno'] }, { ownedCardIds: ['nope'] }, { equippedCardIds: ['charge'] },
      { bond: { pikachu: 9 } }, { bond: { missingno: 1 } }, { awakened: ['missingno'] }, { awakened: ['pikachu', 'pikachu'] },
      { challenges: ['nope'] }, { challenges: ['solo', 'solo'] }, { bossPhase: -1 }, { pointDiff: 0.5 }, { daily: 'today' },
      { awakened: ['pikachu'] },                                   // 覺醒了，親密度卻沒滿
    ];
    cases.forEach((patch) => {
      const v = validateRun({ ...r, ...patch }, IDS);
      expect(!v.ok && v.reason, JSON.stringify(patch)).toBe('corrupt');
    });
    const oldContent = validateRun({ ...r, contentVersion: 'm1-1' }, IDS);
    expect(!oldContent.ok && oldContent.reason).toBe('unsupported');
    // 補位的「親密度 +1」「回 1 顆心」可以出現在三選一
    expect(validateRun({ ...r, phase: 'reward', pendingReward: { settlementId: 'x', offeredCardIds: ['@bond', '@heal'] } }, IDS).ok).toBe(true);
  });
});
