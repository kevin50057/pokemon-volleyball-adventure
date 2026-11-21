/**
 * 卡牌與羈絆的計算、球速上限，以及比賽中可以單獨測的純函式（場地規則的週期、首領的階段）。
 */
import { describe, expect, it } from 'vitest';
import { activeBonds, capped, cardMods, type Mods } from '../cards';
import { BONDS, CAPS, CARDS, MAX_BALL_SPEED, RULE_CFG, cardById, matchNode, type Stat } from '../content';
import { phaseForHp } from '../match/boss';
import { clampBall } from '../match/geom';
import { cycleOf, gravflipHeavy } from '../match/rules';
import { must } from './helpers';

const STATS: readonly Stat[] = ['move', 'jump', 'spike', 'dive'];

describe('cards and bonds', () => {
  it('the same card never counts twice and order does not matter', () => {
    expect(cardMods('vaporeon', ['quickShoes', 'quickShoes']).move).toBeCloseTo(1.12);
    expect(cardMods('vaporeon', ['muscleBand', 'quickShoes'])).toEqual(cardMods('vaporeon', ['quickShoes', 'muscleBand']));
    expect(cardMods('vaporeon', ['quickShoes', 'muscleBand']).move).toBeCloseTo(1.12 * 0.9);
    expect(cardMods('vaporeon', ['charge', 'doubleJump'])).toEqual({ move: 1, jump: 1, spike: 1, dive: 1 });   // 機制卡不動倍率
  });
  it('bonds need two of a tag and count the active partner', () => {
    expect(activeBonds('vaporeon', ['quickShoes'])).toEqual([]);
    expect(activeBonds('pikachu', ['quickShoes'])).toEqual(['thunder']);
    expect(activeBonds('vaporeon', ['quickShoes', 'serveAce'])).toEqual(['thunder']);
    expect(activeBonds('farfetchd', ['lightFeather'])).toEqual(['wind']);
    expect(cardMods('pikachu', ['serveAce']).dive).toBeCloseTo(1.08);
    expect(cardMods('farfetchd', ['lightFeather']).jump).toBeCloseTo(1.12 * 1.06);
  });
  it('Exp. Share counts the backup partner\'s tag, and only while it is equipped', () => {
    expect(activeBonds('pikachu', [], 'jolteon')).toEqual([]);
    expect(activeBonds('pikachu', ['expShare'], 'jolteon')).toEqual(['thunder']);
    expect(activeBonds('pikachu', ['expShare'], 'pikachu')).toEqual([]);          // 同一隻不算兩次
    expect(activeBonds('vaporeon', ['expShare'], 'squirtle')).toEqual(['water']);
    expect(cardMods('vaporeon', ['expShare'], 'squirtle')[BONDS.water.stat]).toBeCloseTo(BONDS.water.mult);
  });
  it('no loadout of up to four cards, with any lead and its bond, pushes a stat past its cap', () => {
    const leads = ['pikachu', 'jolteon', 'flareon', 'charmander', 'vaporeon', 'squirtle', 'bulbasaur', 'farfetchd', 'dragonite', 'magikarp'];
    const base: Readonly<Record<Stat, readonly number[]>> = { move: [0.95, 1.05], jump: [0.92, 1], spike: [0.95, 1], dive: [1, 1.15] };
    const stat = CARDS.filter((c) => Object.keys(c.mods).length).map((c) => c.id);
    let worst = 0;
    const check = (m: Mods): void => STATS.forEach((k) => base[k].forEach((cb) => {
      const v = capped(k, cb, m[k]);
      expect(v).toBeLessThanOrEqual(Math.max(CAPS[k][1], cb) + 1e-9);
      expect(v).toBeGreaterThanOrEqual(Math.min(CAPS[k][0], cb) - 1e-9);
      if (k === 'spike') worst = Math.max(worst, v);
    }));
    stat.forEach((a) => stat.forEach((b) => stat.forEach((c) => leads.forEach((lead) => check(cardMods(lead, [a, b, c, 'expShare'], 'pikachu'))))));
    expect(worst).toBeLessThanOrEqual(1.15);
  });
  it('multipliers are capped together with the character\'s own', () => {
    expect(capped('move', 1, 1.08 * 1.06)).toBeCloseTo(1.1448);
    CARDS.filter((c) => c.mech || c.effect).forEach((c) => expect(Object.keys(c.mods)).toEqual([]));
    expect(capped('move', 1.05, 1.08 * 1.06)).toBe(1.15);        // 傑尼龜 ×1.05 再加兩張移速卡：封頂
    expect(capped('jump', 0.92, 0.95)).toBeCloseTo(0.874);
    expect(capped('jump', 0.92, 0.9)).toBe(0.85);
    expect(capped('move', 1.05, 1)).toBe(1.05);                  // 沒有卡：角色原本的值不動
    CARDS.forEach((c) => expect(cardById(c.id)).toBe(c));
  });
});

describe('match helpers', () => {
  it('the ball is clamped to the engine speed limit after any expedition change', () => {
    const ball = { xVelocity: 41, yVelocity: -55 };
    clampBall(ball);
    expect(ball).toEqual({ xVelocity: MAX_BALL_SPEED, yVelocity: -MAX_BALL_SPEED });
  });
  it('the gravity field warns before it turns on, and gravity collapse alternates heavy and light', () => {
    const H = RULE_CFG.heavy;
    expect(cycleOf('heavy', H.warnAt - 1)).toMatchObject({ warn: false, on: false });
    expect(cycleOf('heavy', H.warnAt)).toMatchObject({ warn: true, on: false });
    expect(cycleOf('heavy', H.onAt)).toMatchObject({ warn: false, on: true });
    expect(cycleOf('heavy', H.period)).toMatchObject({ warn: false, on: false });
    const G = RULE_CFG.gravflip;
    expect(cycleOf('gravflip', G.onAt).on).toBe(true);
    expect(cycleOf('gravflip', G.offAt).on).toBe(false);
    expect(gravflipHeavy(0)).toBe(true);
    expect(gravflipHeavy(G.period)).toBe(false);
    expect(gravflipHeavy(G.period * 2)).toBe(true);
    const S = RULE_CFG.stasis;
    expect(cycleOf('stasis', S.warnAt).warn).toBe(true);
    expect(cycleOf('stasis', S.at).warn).toBe(false);          // 收攏的那一幀才判定，之後不再預警
  });
  it('boss phases follow the boss HP thresholds', () => {
    const boss = must(matchNode('mewtwo')?.boss, 'mewtwo boss');
    expect(phaseForHp(boss, 9)).toBe(0);
    expect(phaseForHp(boss, 7)).toBe(0);
    expect(phaseForHp(boss, 6)).toBe(1);
    expect(phaseForHp(boss, 3)).toBe(2);
    expect(phaseForHp(boss, 1)).toBe(2);
  });
});
