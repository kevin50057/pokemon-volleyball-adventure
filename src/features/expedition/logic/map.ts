/** 地圖上的操作：入場、選岔路、離開補給站（換裝）、換上場夥伴、後援換人。 */
import { PARTY_MAX, matchNode, nodeById } from '../content';
import type { ExpeditionRun, ProfileV1 } from '../types';
import { isPassive, mewOpen, slotsOf } from './derived';
import { RuleError } from './errors';
import { bump, expectRevision, hasChallenge, inMap, matchIdOf } from './run';

/**
 * 入場。phase 是 map 就開新的一場（attemptNo + 1）；已經是 active（重整後回來）就沿用同一個 matchId。
 * 回傳新的 run（沒有變化時回傳同一個物件）。
 */
export function beginMatch(run: ExpeditionRun, rev: number): ExpeditionRun {
  expectRevision(run, rev);
  if (run.phase === 'active') return run;
  inMap(run, 'start a match');
  if (!matchNode(run.nodeId)) throw new RuleError('phase', run.nodeId + ' is not a match node');
  const next = bump(run);
  next.phase = 'active'; next.attemptNo = run.attemptNo + 1;
  next.matchId = matchIdOf(next);
  return next;
}

/** 這個岔路現在走得到的選項（藏起來的那條要符合條件） */
export function forkOptions(run: ExpeditionRun, profile: ProfileV1, forkId: string): string[] {
  const n = nodeById(forkId);
  if (!n || n.kind !== 'fork') return [];
  return n.options.filter((o) => o !== n.hidden || mewOpen(run, profile));
}

/** 岔路：選一條 */
export function chooseBranch(run: ExpeditionRun, rev: number, option: string, profile: ProfileV1): ExpeditionRun {
  expectRevision(run, rev);
  inMap(run, 'choose a branch');
  if (forkOptions(run, profile, run.nodeId).indexOf(option) < 0) throw new RuleError('invalid', option + ' is not an option at ' + run.nodeId);
  const next = bump(run);
  next.nodeId = option; next.attemptNo = 0;
  return next;
}

export function checkLoadout(run: ExpeditionRun, equipped: readonly string[]): string[] {
  const ids = Array.from(new Set(equipped));
  if (ids.length !== equipped.length || ids.length > slotsOf(run) || !ids.every((id) => run.ownedCardIds.indexOf(id) >= 0 && !isPassive(id))) {
    throw new RuleError('invalid', 'bad loadout');
  }
  return ids;
}

/** 補給站：確認換裝，前往下一站 */
export function leaveSupply(run: ExpeditionRun, rev: number, equipped: readonly string[]): ExpeditionRun {
  expectRevision(run, rev);
  inMap(run, 'leave the supply stop');
  const n = nodeById(run.nodeId);
  if (!n || n.kind !== 'supply') throw new RuleError('phase', run.nodeId + ' is not a supply stop');
  const ids = checkLoadout(run, equipped);
  const next = bump(run);
  next.equippedCardIds = ids;
  next.visitedNodeIds.push(run.nodeId);
  next.nodeId = n.next; next.attemptNo = 0;
  return next;
}

/** 換上場的夥伴（只能在地圖上；solo 挑戰不能換） */
export function setLead(run: ExpeditionRun, rev: number, charId: string): ExpeditionRun {
  expectRevision(run, rev);
  inMap(run, 'switch partners');
  if (hasChallenge(run, 'solo')) throw new RuleError('invalid', 'solo challenge: no switching');
  if (run.partyIds.indexOf(charId) < 0) throw new RuleError('invalid', charId + ' is not in the party');
  if (run.partyIds[0] === charId) return run;
  const next = bump(run);
  next.partyIds = [charId].concat(run.partyIds.filter((id) => id !== charId));
  return next;
}

/**
 * 把後援換進隊伍。out 給 null：隊伍還有空位，直接加入；
 * 否則 out 那一隻（留在原本的位置順序）換下來進後援。換上場的那隻如果頂替的是第一隻，就變成上場的。
 */
export function swapIn(run: ExpeditionRun, rev: number, benchId: string, out: string | null): ExpeditionRun {
  expectRevision(run, rev);
  inMap(run, 'swap partners');
  if (hasChallenge(run, 'solo')) throw new RuleError('invalid', 'solo challenge: no switching');
  if (run.benchIds.indexOf(benchId) < 0) throw new RuleError('invalid', benchId + ' is not on the bench');
  const next = bump(run);
  next.benchIds = run.benchIds.filter((id) => id !== benchId);
  if (out === null) {
    if (run.partyIds.length >= PARTY_MAX) throw new RuleError('invalid', 'the party is full');
    next.partyIds.push(benchId);
    return next;
  }
  const i = run.partyIds.indexOf(out);
  if (i < 0) throw new RuleError('invalid', out + ' is not in the party');
  next.partyIds[i] = benchId;
  next.benchIds.push(out);
  return next;
}
