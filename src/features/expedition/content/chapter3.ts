/**
 * 第三章「華藍洞窟」（九站，六場比賽）：
 *   洞口（百變怪）→ 岔路⑥ → 奇遇 → 岔路⑦（幻之間：夢幻，符合條件才現身／一般）→ 營地
 *   → 試煉一（耿鬼・重力場）→ 試煉二（月伊布・念力停球，連打）→ 最深處的營火 → 超夢（三階段首領）
 * 兩場試煉各教一個超夢會用的機制，玩家到超夢面前時已經看過兩種預警。
 */
import type { CharacterId } from '../../../core/types';
import { LATE_EVENTS } from './events';
import { slot, type NodeDef, type Stops } from './nodes';
import type { Diff, RuleId } from './rules';

const P6: readonly CharacterId[] = ['dragonite', 'bird', 'electrode', 'snorlax', 'farfetchd', 'wobbuffet', 'mrmime'];
export const CH3_POOLS: readonly (readonly CharacterId[])[] = [P6];
/** 第三章的岔路多了重力場 */
const RULES6: readonly (RuleId | null)[] = ['rain', 'gold', 'lowgrav', 'heavy', null];

const D6: Diff = { move: 0.97, spike: 0.88, lapse: 0.12 };
const DK: Diff = { move: 0.96, spike: 0.86, lapse: 0.12 };

export const CH3_NODES: readonly NodeDef[] = [
  // 百變怪：圖鑑上有 3 隻不同夥伴的通關印章才會跟你走
  { id: 'c3gate', kind: 'match', opp: 'ditto', score: 5, diff: DK, reward: true, capture: 'stamps3', next: 'fork6' },
  { id: 'fork6', kind: 'fork', options: ['f6a', 'f6b'] },
  slot('f6a', 'fork6', P6, D6, 'event3', RULES6), slot('f6b', 'fork6', P6, D6, 'event3', RULES6),
  { id: 'event3', kind: 'event', pool: LATE_EVENTS, next: 'fork7' },
  // 幻之間：這一輪沒有重來過任何一章、或圖鑑上有 3 隻夥伴的印章、或已經收服過夢幻，才走得進去
  { id: 'fork7', kind: 'fork', options: ['mewroom', 'f7a', 'f7b'], hidden: 'mewroom' },
  { id: 'mewroom', kind: 'match', opp: 'mew', score: 7, diff: { move: 1, spike: 0.9, lapse: 0.08 }, reward: 'rare', capture: 'sure', next: 'c3camp' },
  slot('f7a', 'fork7', P6, D6, 'c3camp', RULES6), slot('f7b', 'fork7', P6, D6, 'c3camp', RULES6),
  { id: 'c3camp', kind: 'supply', next: 't1' },
  // 兩場試煉連打，中間不能補給
  { id: 't1', kind: 'match', opp: 'gengar', score: 5, rule: 'heavy', diff: DK, reward: true, capture: 'chance', next: 't2' },
  { id: 't2', kind: 'match', opp: 'umbreon', score: 7, rule: 'stasis', diff: DK, reward: 'rare', capture: 'chance', next: 'c3camp2' },
  { id: 'c3camp2', kind: 'supply', next: 'mewtwo' },
  {
    id: 'mewtwo', kind: 'match', opp: 'mewtwo', score: 9, diff: { move: 1, spike: 0.95, lapse: 0.06 }, reward: false, capture: 'sure', next: null,
    boss: {
      playerHp: 5, hp: 9, phases: [
        { id: 'psychic', atHp: 9, tint: 0xB9A4EA, psyCooldown: 150 },
        { id: 'stasis', atHp: 6, rule: 'stasis', tint: 0x6B50AA, psyCooldown: 110, bgm: 1.1 },
        { id: 'collapse', atHp: 3, rule: 'gravflip', tint: 0x8E3C70, psyCooldown: 90, phantoms: true, bgm: 1.22 },
      ],
    },
  },
];

export const CH3_STOPS: Stops = [
  ['c3gate'], ['f6a', 'f6b'], ['event3'], ['mewroom', 'f7a', 'f7b'], ['c3camp'], ['t1'], ['t2'], ['c3camp2'], ['mewtwo'],
];
export const CH3_FORKS: Readonly<Record<string, number>> = { fork6: 1, fork7: 3 };
export const CH3_DEX: Readonly<Record<string, string>> = { ditto: 'c3gate', mew: 'mewroom', mewtwo: 'mewtwo' };
