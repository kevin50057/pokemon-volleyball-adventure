/**
 * 羈絆值與覺醒（這一輪）。羈絆值滿 AWAKEN_AT 就覺醒；覺醒只在這一輪有效，章節重來時跟著快照還原。
 * 這裡只改傳進來的「下一個版本」（bump 過的 run），不碰原本的。
 */
import { AWAKEN_AT, canAwaken } from '../content';
import type { ExpeditionRun } from '../types';

/** 加羈絆值；回傳這一次剛覺醒的角色（沒有就 null） */
export function addBond(next: ExpeditionRun, char: string, n: number): string | null {
  if (!canAwaken(char) || n <= 0) return null;
  const before = next.bond[char] || 0;
  next.bond[char] = Math.min(AWAKEN_AT, before + n);
  if (before < AWAKEN_AT && next.bond[char] >= AWAKEN_AT && next.awakened.indexOf(char) < 0) {
    next.awakened.push(char);
    return char;
  }
  return null;
}
