/**
 * 路線節點的型別。每一章的節點寫在 chapter1.ts、chapter2.ts…，在 chapters.ts 合起來。
 */
import type { CharacterId } from '../../../core/types';
import type { EventId } from './events';
import type { BossDef, Diff, RuleId } from './rules';

/** sure：第一次贏必收；chance：機率收（失敗一次後保底）；stamps3：圖鑑上要有 3 隻不同夥伴的通關印章才收（百變怪） */
export type Capture = 'sure' | 'chance' | 'stamps3';
/** 岔路的空位：對手從 pool 抽，規則從 RULE_POOL 抽（同一個岔路的兩個選項不重複） */
export interface Slot { fork: string; pool: readonly CharacterId[]; rules?: readonly (RuleId | null)[] }
export interface MatchNode {
  id: string;
  kind: 'match';
  opp: CharacterId;
  /** 搶幾分（首領戰是首領的血量） */
  score: number;
  rule?: RuleId;
  /** 不寫就是原本的電腦，一點都不調 */
  diff?: Diff;
  boss?: BossDef;
  /** 贏了有沒有三選一；rare：只給機制卡 */
  reward: boolean | 'rare';
  /** 岔路的空位（opp、rule 由種子決定；這裡的 opp 只是佔位） */
  slot?: Slot;
  capture?: Capture;
  /** null：這一章的最後一站 */
  next: string | null;
}
/** hidden：只有符合條件才走得進去的選項（夢幻的幻之間） */
export interface ForkNode { id: string; kind: 'fork'; options: readonly string[]; hidden?: string }
export interface SupplyNode { id: string; kind: 'supply'; next: string }
/** 奇遇：由種子決定遇到哪一個，玩家從選項裡挑一個 */
export interface EventNode { id: string; kind: 'event'; pool: readonly EventId[]; next: string }
export type NodeDef = MatchNode | ForkNode | SupplyNode | EventNode;

/** 一章的站（岔路的兩條算同一站；岔路口本身不算一站） */
export type Stops = readonly (readonly string[])[];

/** 岔路的空位節點 */
export function slot(id: string, fork: string, pool: readonly CharacterId[], diff: Diff, next: string, rules?: readonly (RuleId | null)[]): MatchNode {
  return { id, kind: 'match', opp: pool[0], score: 5, diff, reward: true, capture: 'chance', next, slot: rules ? { fork, pool, rules } : { fork, pool } };
}
