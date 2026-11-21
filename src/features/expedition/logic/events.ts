/** 奇遇：遇到哪一個由種子決定，選項的效果在這裡。 */
import { EVENTS, STONE_BOND, nodeById, type EventChoice, type EventId } from '../content';
import { rngFor } from '../rng';
import type { ExpeditionRun } from '../types';
import { addBond } from './bond';
import { heartCap, slotsOf } from './derived';
import { RuleError } from './errors';
import { makeOffer } from './rewards';
import { bump, expectRevision, inMap, settlementIdOf } from './run';

/** 這個奇遇節點遇到的是哪一個（由種子決定，重整不會變） */
export function eventOf(run: ExpeditionRun): EventId | null {
  const n = nodeById(run.nodeId);
  if (!n || n.kind !== 'event') return null;
  return rngFor(run.seed, n.id, 'event', run.rngVersion).pick(n.pool);
}

/**
 * 奇遇：選一個選項。arg：換卡（trade）要丟掉的卡、進化之石（stone）要給的夥伴。
 * 回 1 心不會超過上限；拿卡的話進三選一（或二選一）。pool：profile 裡解鎖進卡池的卡。
 */
export function resolveEvent(run: ExpeditionRun, rev: number, choice: EventChoice, arg: string | undefined, unlocked: readonly string[]): ExpeditionRun {
  // 每日遠征：大家拿到的卡池一樣，不吃個人解鎖的卡
  const pool = run.daily ? [] : unlocked;
  expectRevision(run, rev);
  inMap(run, 'resolve an event');
  const n = nodeById(run.nodeId), ev = eventOf(run);
  if (!n || n.kind !== 'event' || !ev) throw new RuleError('phase', run.nodeId + ' is not an event');
  if (EVENTS[ev].indexOf(choice) < 0) throw new RuleError('invalid', choice + ' is not an option of ' + ev);
  if (choice === 'gamble' && run.hearts <= 1) throw new RuleError('invalid', 'not enough hearts to gamble');
  if (choice === 'trade' && (!arg || run.ownedCardIds.indexOf(arg) < 0)) throw new RuleError('invalid', 'trade needs one of your cards');
  if (choice === 'stone' && (!arg || run.partyIds.indexOf(arg) < 0)) throw new RuleError('invalid', 'the stone needs a party member');
  const next = bump(run);
  next.visitedNodeIds.push(n.id);
  next.nodeId = n.next; next.attemptNo = 0;
  if (choice === 'heal') next.hearts = Math.min(heartCap(next), run.hearts + 1);
  if (choice === 'stone' && arg) addBond(next, arg, STONE_BOND);
  let offered: string[] = [];
  const rng = rngFor(run.seed, n.id, 'cards', run.rngVersion);
  if (choice === 'cards2' || choice === 'cards3') offered = makeOffer(run, rng, choice === 'cards2' ? 2 : 3, { pool, after: next });
  if (choice === 'gamble') {
    next.hearts = run.hearts - 1;
    offered = makeOffer(run, rng, 3, { rare: true, pool, after: next });
  }
  if (choice === 'trade' && arg) {
    next.ownedCardIds = next.ownedCardIds.filter((id) => id !== arg);
    next.equippedCardIds = next.equippedCardIds.filter((id) => id !== arg);
    // 丟掉的是達人帶：卡槽少一格，多出來的裝備從後面卸下
    next.equippedCardIds = next.equippedCardIds.slice(0, slotsOf(next));
    offered = makeOffer(run, rng, 3, { pool, after: next });      // 用丟掉之前的牌組抽：丟掉的那張不會再出現
  }
  if (offered.length) { next.phase = 'reward'; next.pendingReward = { settlementId: settlementIdOf(run.runId, n.id + '#event'), offeredCardIds: offered }; }
  return next;
}
