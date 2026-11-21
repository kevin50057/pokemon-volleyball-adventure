/**
 * 難度等級：0 = 一般。每通關一次（任何模式）就開放下一級。效果是累加的。
 */
import { START_HEARTS } from './basics';
import type { BossDef, Diff } from './rules';

export const RANK_MAX = 3;
/** 等級 1 起：電腦更強 */
export function rankDiff(d: Diff | undefined, rank: number): Diff | undefined {
  if (!d || rank < 1) return d;
  return { move: Math.min(1, d.move + 0.06), spike: Math.min(1, d.spike + 0.12), lapse: d.lapse * 0.6 };
}
/** 首領多幾滴血：加在第一階段，之後的階段門檻不變 */
export function bossWithExtraHp(b: BossDef, extra: number): BossDef {
  if (extra <= 0) return b;
  const hp = b.hp + extra;
  return { ...b, hp, phases: b.phases.map((p, i) => (i === 0 ? { ...p, atHp: hp } : p)) };
}
/** 等級 2 起：首領多 2 滴血 */
export function rankBoss(b: BossDef | undefined, rank: number): BossDef | undefined {
  return b && rank >= 2 ? bossWithExtraHp(b, 2) : b;
}
/** 等級 3：每章只有 2 顆心 */
export function maxHearts(rank: number): number { return rank >= 3 ? START_HEARTS - 1 : START_HEARTS; }
