/**
 * 第一章「道館巡禮」（九站，七場比賽）：
 *   熱身草原 → 岔路① → 奇遇 → 岔路② → 補給營地 → 強風山口 → 岔路③ → 龍之巢前的營火 → 龍之巢（快龍首領）
 */
import type { CharacterId } from '../../../core/types';
import { ALL_EVENTS } from './events';
import { slot, type NodeDef, type Stops } from './nodes';
import type { Diff } from './rules';

// 岔路池（耿鬼、頑皮雷彈照 SPEC §3 留到第二章）
const P1: readonly CharacterId[] = ['psyduck', 'meowth', 'jigglypuff', 'wobbuffet', 'dugtrio'];
const P2: readonly CharacterId[] = ['snorlax', 'jigglypuff', 'mrmime', 'psyduck', 'meowth', 'wobbuffet'];
// 第三個岔路包含整章所有可能的對手：前兩個岔路最多用掉 4 隻，這裡一定還剩兩隻不重複的
const P3: readonly CharacterId[] = ['dugtrio', 'mrmime', 'snorlax', 'wobbuffet', 'psyduck', 'meowth', 'jigglypuff'];
export const CH1_POOLS: readonly (readonly CharacterId[])[] = [P1, P2, P3];

const D1: Diff = { move: 0.70, spike: 0.45, lapse: 0.42 };
const D2: Diff = { move: 0.78, spike: 0.55, lapse: 0.35 };
const D3: Diff = { move: 0.90, spike: 0.74, lapse: 0.22 };

export const CH1_NODES: readonly NodeDef[] = [
  { id: 'warmup', kind: 'match', opp: 'magikarp', score: 5, diff: { move: 0.60, spike: 0.35, lapse: 0.50 }, reward: true, capture: 'sure', next: 'fork1' },
  { id: 'fork1', kind: 'fork', options: ['f1a', 'f1b'] },
  slot('f1a', 'fork1', P1, D1, 'event1'), slot('f1b', 'fork1', P1, D1, 'event1'),
  { id: 'event1', kind: 'event', pool: ALL_EVENTS, next: 'fork2' },
  { id: 'fork2', kind: 'fork', options: ['f2a', 'f2b'] },
  slot('f2a', 'fork2', P2, D2, 'supply'), slot('f2b', 'fork2', P2, D2, 'supply'),
  { id: 'supply', kind: 'supply', next: 'elite' },
  { id: 'elite', kind: 'match', opp: 'farfetchd', score: 7, rule: 'wind', diff: { move: 0.86, spike: 0.66, lapse: 0.27 }, reward: 'rare', capture: 'sure', next: 'fork3' },
  { id: 'fork3', kind: 'fork', options: ['f3a', 'f3b'] },
  slot('f3a', 'fork3', P3, D3, 'camp'), slot('f3b', 'fork3', P3, D3, 'camp'),
  { id: 'camp', kind: 'supply', next: 'boss' },
  { id: 'boss', kind: 'match', opp: 'dragonite', score: 7, diff: { move: 0.94, spike: 0.82, lapse: 0.16 }, boss: { playerHp: 5, hp: 7, phases: [{ id: 'dragon', atHp: 7, tint: 0x8FA0E8 }, { id: 'outrage', atHp: 3, ballSpeed: 1.10, tint: 0xE08A7A, bgm: 1.1 }] }, reward: false, capture: 'sure', next: null },
];

export const CH1_STOPS: Stops = [
  ['warmup'], ['f1a', 'f1b'], ['event1'], ['f2a', 'f2b'], ['supply'], ['elite'], ['f3a', 'f3b'], ['camp'], ['boss'],
];
/** 岔路口 → 它分出去的那一站（在這一章的第幾站） */
export const CH1_FORKS: Readonly<Record<string, number>> = { fork1: 1, fork2: 3, fork3: 6 };
/** 這一章收得到的角色 → 在哪裡（岔路的不寫，由池子推出來） */
export const CH1_DEX: Readonly<Record<string, string>> = { magikarp: 'warmup', farfetchd: 'elite', dragonite: 'boss' };
