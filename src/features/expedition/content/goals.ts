/**
 * 訓練家手冊：看得到條件的目標。獎勵只有兩種：把新卡放進卡池、或一個稱號（純外觀）。
 * 條件只讀 profile（永久紀錄），所以任何時候重算都得到一樣的結果。
 */
import { CHARS } from '../../characters';
import type { ProfileV1 } from '../types';
import { STARTERS } from './basics';
import { CHALLENGES } from './challenges';

export interface GoalDef {
  id: string;
  /** 目前的進度與目標（畫面上顯示 n/need） */
  progress(p: ProfileV1): number;
  need: number;
  /** 達成時放進卡池的卡 */
  card?: string;
}

const count = (a: readonly string[] | undefined): number => (a ? a.length : 0);
const keys = (r: Record<string, number> | undefined): string[] => (r ? Object.keys(r) : []);
const isStarter = (id: string): boolean => STARTERS.some((s) => s === id);
const caught = (p: ProfileV1): number => STARTERS.length + p.expeditionUnlocked.filter((id) => !isStarter(id)).length;
const maxXp = (p: ProfileV1): number => Math.max(0, ...Object.values(p.bondXp || {}));

export const GOALS: readonly GoalDef[] = [
  { id: 'firstClear', progress: (p) => keys(p.stamps).length, need: 1, card: 'expShare' },
  { id: 'catch12', progress: caught, need: 12 },
  { id: 'catch18', progress: caught, need: 18, card: 'expertBelt' },
  { id: 'catchAll', progress: caught, need: CHARS.ids.length },
  { id: 'threePartners', progress: (p) => keys(p.stamps).length, need: 3 },
  { id: 'allStarters', progress: (p) => STARTERS.filter((id) => (p.stamps || {})[id]).length, need: STARTERS.length },
  { id: 'rank1', progress: (p) => Math.max(0, ...Object.values(p.stamps || {})) >= 2 ? 1 : 0, need: 1 },
  { id: 'rank3', progress: (p) => Math.max(0, ...Object.values(p.stamps || {})) >= 4 ? 1 : 0, need: 1 },
  { id: 'ironman', progress: (p) => count(p.ironmanClears), need: 1 },
  { id: 'awaken1', progress: (p) => count(p.awakenedSeen), need: 1 },
  { id: 'awaken4', progress: (p) => count(p.awakenedSeen), need: 4 },
  { id: 'awaken8', progress: (p) => count(p.awakenedSeen), need: 8 },
  { id: 'mew', progress: (p) => (p.expeditionUnlocked.indexOf('mew') >= 0 ? 1 : 0), need: 1 },
  { id: 'mewtwo', progress: (p) => (p.expeditionUnlocked.indexOf('mewtwo') >= 0 ? 1 : 0), need: 1 },
  { id: 'challenge1', progress: (p) => keys(p.challengeClears).length, need: 1 },
  { id: 'challengeAll', progress: (p) => CHALLENGES.filter((c) => (p.challengeClears || {})[c]).length, need: CHALLENGES.length },
  { id: 'bond3', progress: maxXp, need: 8 },
  { id: 'bond5', progress: maxXp, need: 25 },
  { id: 'daily1', progress: (p) => (p.daily ? p.daily.history.length : 0), need: 1 },
  { id: 'daily7', progress: (p) => (p.daily ? p.daily.bestStreak : 0), need: 7 },
];
