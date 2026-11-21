/**
 * 三選一：從卡池裡沒有的卡抽（同一個種子抽到的一樣），卡池不夠就用「羈絆值 +1」「回 1 顆心」補位。
 * 選卡：有空的卡槽就直接裝上；不佔卡槽的卡（達人帶）拿到就生效。
 */
import { offerCards } from '../cards';
import { AWAKEN_AT, FILL_BOND, FILL_HEAL, canAwaken, hasEffect, inPool, isMechCard } from '../content';
import type { Rng } from '../rng';
import type { ExpeditionRun } from '../types';
import { addBond } from './bond';
import { heartCap, isPassive, slotsOf } from './derived';
import { RuleError } from './errors';
import { bump, expectRevision, hasChallenge } from './run';

export interface OfferOpts {
  /** 只給機制卡（菁英、攤販）；沒有剩的才給一般卡 */
  rare?: boolean;
  /** profile 裡解鎖進卡池的卡 */
  pool: readonly string[];
  /** 三選一出現時這一輪的樣子（補位要看這時候用不用得到）；不給就用 run */
  after?: ExpeditionRun;
}

/** 補位的「親密度 +1」給誰：隊伍裡第一隻還沒滿的（上場的優先）；都滿了回 undefined */
export function bondTarget(r: Pick<ExpeditionRun, 'partyIds' | 'bond'>): string | undefined {
  return r.partyIds.find((id) => canAwaken(id) && (r.bond[id] || 0) < AWAKEN_AT);
}
/** 現在用得到的補位 */
export function fillsFor(r: ExpeditionRun): string[] {
  const out: string[] = [];
  if (bondTarget(r)) out.push(FILL_BOND);
  if (r.hearts < heartCap(r)) out.push(FILL_HEAL);
  return out;
}
/** 這一輪不會用到的卡：單打獨鬥沒有備援，學習裝置沒有用 */
function usable(run: ExpeditionRun, id: string): boolean {
  return !(hasChallenge(run, 'solo') && hasEffect([id], 'expShare'));
}

export function makeOffer(run: ExpeditionRun, rng: Rng, n: number, o: OfferOpts): string[] {
  const fills = fillsFor(o.after || run);
  if (hasChallenge(run, 'noCards')) return fills.slice(0, n);
  const ok = (id: string): boolean => inPool(id, o.pool) && usable(run, id);
  let cards = o.rare ? offerCards(run.ownedCardIds, rng, n, (id) => ok(id) && isMechCard(id)) : [];
  if (!cards.length) cards = offerCards(run.ownedCardIds, rng, n, ok);
  return cards.concat(fills.slice(0, Math.max(0, n - cards.length)));
}

/** 三選一：選一個（卡、羈絆值、回心），或傳 null 主動略過 */
export function pickReward(run: ExpeditionRun, rev: number, choice: string | null): ExpeditionRun {
  expectRevision(run, rev);
  if (run.phase !== 'reward' || !run.pendingReward) throw new RuleError('phase', 'no reward to pick in phase ' + run.phase);
  if (choice !== null && run.pendingReward.offeredCardIds.indexOf(choice) < 0) throw new RuleError('invalid', choice + ' was not offered');
  const next = bump(run);
  delete next.pendingReward;
  next.phase = 'map';
  if (choice === FILL_HEAL) next.hearts = Math.min(heartCap(next), next.hearts + 1);
  else if (choice === FILL_BOND) { const who = bondTarget(next); if (who) addBond(next, who, 1); }
  else if (choice !== null && next.ownedCardIds.indexOf(choice) < 0) {
    next.ownedCardIds.push(choice);
    if (isPassive(choice)) next.hearts = Math.min(next.hearts, heartCap(next));
    else if (next.equippedCardIds.length < slotsOf(next)) next.equippedCardIds.push(choice);
  }
  return next;
}
