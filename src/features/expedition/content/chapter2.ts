/**
 * 第二章「四天王與秘境」（十站，七場比賽）：
 *   發電廠（頑皮雷彈）→ 岔路④ → 奇遇 → 岔路⑤（雷電秘境：閃電鳥／一般）→ 營地
 *   → 四天王（果然翁 → 耿鬼 → 魔牆人偶，中間不能補給）→ 冠軍前的營火 → 冠軍（月伊布首領）
 */
import type { CharacterId } from '../../../core/types';
import { LATE_EVENTS } from './events';
import { slot, type NodeDef, type Stops } from './nodes';
import type { Diff } from './rules';

// 岔路池（四天王的三隻不會出現在岔路）
const P4: readonly CharacterId[] = ['psyduck', 'meowth', 'jigglypuff', 'snorlax', 'dugtrio', 'farfetchd'];
export const CH2_POOLS: readonly (readonly CharacterId[])[] = [P4];

const D4: Diff = { move: 0.92, spike: 0.78, lapse: 0.18 };
const DK: Diff = { move: 0.96, spike: 0.86, lapse: 0.12 };

export const CH2_NODES: readonly NodeDef[] = [
  { id: 'gate', kind: 'match', opp: 'electrode', score: 5, diff: { move: 0.86, spike: 0.66, lapse: 0.26 }, reward: true, capture: 'sure', next: 'fork4' },
  { id: 'fork4', kind: 'fork', options: ['f4a', 'f4b'] },
  slot('f4a', 'fork4', P4, D4, 'event2'), slot('f4b', 'fork4', P4, D4, 'event2'),
  { id: 'event2', kind: 'event', pool: LATE_EVENTS, next: 'fork5' },
  { id: 'fork5', kind: 'fork', options: ['thunder', 'f5b'] },
  // 雷電秘境：比較難（搶 7、強風），贏了一定收服閃電鳥，而且給機制卡
  { id: 'thunder', kind: 'match', opp: 'bird', score: 7, rule: 'wind', diff: { move: 0.94, spike: 0.82, lapse: 0.16 }, reward: 'rare', capture: 'sure', next: 'c2camp' },
  slot('f5b', 'fork5', P4, D4, 'c2camp'),
  { id: 'c2camp', kind: 'supply', next: 'k1' },
  // 四天王：連戰，中間不能補給，心一路帶著
  { id: 'k1', kind: 'match', opp: 'wobbuffet', score: 5, diff: DK, reward: true, capture: 'chance', next: 'k2' },
  { id: 'k2', kind: 'match', opp: 'gengar', score: 5, rule: 'lowgrav', diff: DK, reward: false, capture: 'sure', next: 'k3' },
  { id: 'k3', kind: 'match', opp: 'mrmime', score: 5, rule: 'gold', diff: DK, reward: 'rare', capture: 'chance', next: 'c2camp2' },
  { id: 'c2camp2', kind: 'supply', next: 'champion' },
  { id: 'champion', kind: 'match', opp: 'umbreon', score: 8, diff: { move: 1, spike: 0.9, lapse: 0.08 }, boss: { playerHp: 5, hp: 8, phases: [{ id: 'dark', atHp: 8, tint: 0x7A70B8 }, { id: 'moonlight', atHp: 3, ballSpeed: 1.12, tint: 0x4B3F8A, bgm: 1.1 }] }, reward: false, capture: 'sure', next: null },
];

export const CH2_STOPS: Stops = [
  ['gate'], ['f4a', 'f4b'], ['event2'], ['thunder', 'f5b'], ['c2camp'], ['k1'], ['k2'], ['k3'], ['c2camp2'], ['champion'],
];
export const CH2_FORKS: Readonly<Record<string, number>> = { fork4: 1, fork5: 3 };
export const CH2_DEX: Readonly<Record<string, string>> = { electrode: 'gate', bird: 'thunder', gengar: 'k2', umbreon: 'champion' };
