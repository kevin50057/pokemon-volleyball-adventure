/**
 * 由 run／profile 推出來的值（卡槽數、心的上限、夢幻的門有沒有開…）。純函式，不改輸入。
 */
import { cardById, cardSlots, hasEffect, maxHearts } from '../content';
import type { ExpeditionRun, ProfileV1 } from '../types';
import { hasChallenge } from './run';

type RunLike = Pick<ExpeditionRun, 'rank' | 'chapter' | 'challenges' | 'ownedCardIds'>;

/** 這一輪現在有幾個卡槽：章節的格數，少一格（fewSlots）、多一格（達人帶），不能裝卡（noCards）就是 0 */
export function slotsOf(run: RunLike): number {
  if (hasChallenge(run, 'noCards')) return 0;
  return Math.max(0, cardSlots(run.chapter) - (hasChallenge(run, 'fewSlots') ? 1 : 0) + (hasEffect(run.ownedCardIds, 'expertBelt') ? 1 : 0));
}
/** 心的上限：難度 3 少一顆，達人帶再少一顆，最少 1 */
export function heartCap(run: RunLike): number {
  return Math.max(1, maxHearts(run.rank) - (hasEffect(run.ownedCardIds, 'expertBelt') ? 1 : 0));
}
/** 卡是不是不佔卡槽（拿到就生效） */
export function isPassive(id: string): boolean { const c = cardById(id); return !!(c && c.passive); }

/** 圖鑑上有幾隻不同夥伴的通關印章 */
export function stampsCount(p: ProfileV1): number { return Object.keys(p.stamps || {}).length; }

/**
 * 夢幻的幻之間（「沒有倒下過的訓練家」）：章節制是這一輪沒有重來過任何一章；一命到底（含每日遠征）本來就不能重來，
 * 所以改看這一輪一場都沒輸過。另外圖鑑上有 3 隻夥伴的印章、或已經收服過夢幻，也一律開門。
 */
export function mewOpen(run: Pick<ExpeditionRun, 'chapterRetries' | 'losses' | 'mode'>, p: ProfileV1): boolean {
  const unbroken = run.mode === 'chapter' ? run.chapterRetries === 0 : run.losses === 0;
  return unbroken || stampsCount(p) >= 3 || p.expeditionUnlocked.indexOf('mew') >= 0;
}
