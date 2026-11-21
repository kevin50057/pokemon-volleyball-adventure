/** 一輪的建立與共用的小工具：新的 run／profile、比賽 id、revision 檢查、章節快照。 */
import { CHAPTERS, PARTY_MAX, RANK_MAX, maxHearts } from '../content';
import { rngFor } from '../rng';
import {
  CONTENT_VERSION, RNG_VERSION, RUN_SCHEMA,
  type ChallengeId, type Checkpoint, type ExpeditionRun, type ProfileV1, type RunMode,
} from '../types';
import { RuleError } from './errors';

export function newProfile(): ProfileV1 {
  return { schemaVersion: 1, expeditionUnlocked: [], captureMissesByCharacter: {} };
}

/** 章節快照：這一章開始時的隊伍、卡、走過的路、羈絆與覺醒 */
export function snapshot(r: Pick<ExpeditionRun, 'partyIds' | 'benchIds' | 'ownedCardIds' | 'equippedCardIds' | 'visitedNodeIds' | 'bond' | 'awakened'>): Checkpoint {
  return {
    partyIds: r.partyIds.slice(), benchIds: r.benchIds.slice(), ownedCardIds: r.ownedCardIds.slice(), equippedCardIds: r.equippedCardIds.slice(),
    visitedNodeIds: r.visitedNodeIds.slice(), bond: { ...r.bond }, awakened: r.awakened.slice(),
  };
}

export interface NewRunOpts {
  runId: string;
  seed: string;
  /** 上場的夥伴，加上最多一隻備援（solo 挑戰只取第一隻） */
  party: string | readonly string[];
  now: number;
  mode?: RunMode;
  rank?: number;
  challenges?: readonly ChallengeId[];
  /** 開局的羈絆值（羈絆 Lv2 的夥伴從 1 開始） */
  bond?: Readonly<Record<string, number>>;
  /** 每日遠征：日期、從第幾章、起始的卡 */
  daily?: { date: string; chapter: number; cards: readonly string[] };
}

export function newRun(o: NewRunOpts): ExpeditionRun {
  const challenges = Array.from(new Set(o.challenges || []));
  const limit = challenges.indexOf('solo') >= 0 ? 1 : PARTY_MAX;
  const ids = Array.from(new Set(typeof o.party === 'string' ? [o.party] : o.party)).slice(0, limit);
  if (!ids.length) throw new RuleError('invalid', 'a run needs a partner');
  const rank = Math.max(0, Math.min(RANK_MAX, o.rank || 0));
  const chapter = o.daily ? Math.max(0, Math.min(CHAPTERS.length - 1, o.daily.chapter)) : 0;
  const cards = o.daily ? o.daily.cards.slice() : [];
  const bond: Record<string, number> = {};
  ids.forEach((id) => { const b = o.bond && o.bond[id]; if (b) bond[id] = b; });
  const base = { partyIds: ids, benchIds: [] as string[], equippedCardIds: cards.slice(), ownedCardIds: cards, visitedNodeIds: [] as string[], bond, awakened: [] as string[] };
  const run: ExpeditionRun = {
    schemaVersion: RUN_SCHEMA, mode: o.mode || 'chapter', rank, challenges, chapter, chapterRetries: 0, checkpoint: snapshot(base),
    runId: o.runId, seed: o.seed, rngVersion: RNG_VERSION, contentVersion: CONTENT_VERSION,
    phase: 'map', nodeId: CHAPTERS[chapter].first, attemptNo: 0, hearts: maxHearts(rank), losses: 0, pointDiff: 0,
    ...base,
    revision: 1, createdAt: o.now,
  };
  if (o.daily) run.daily = o.daily.date;
  return run;
}

/** random 挑戰：起始夥伴由種子決定 */
export function randomPartner(seed: string, list: readonly string[]): string {
  return rngFor(seed, 'start', 'route').pick(list);
}

export function hasChallenge(run: Pick<ExpeditionRun, 'challenges'>, id: ChallengeId): boolean { return run.challenges.indexOf(id) >= 0; }

/** 一場比賽的 id。章節重來之後同一站會從第 1 次重新數，所以要帶上重來的次數，不然會跟之前的結算撞號 */
export function matchIdOf(run: ExpeditionRun): string {
  return run.nodeId + '#' + run.attemptNo + (run.chapterRetries ? '~r' + run.chapterRetries : '');
}
export function settlementIdOf(runId: string, matchId: string): string {
  return runId + '/' + matchId;
}

/** 寫入前檢查：呼叫端手上的 revision 必須是最新的 */
export function expectRevision(run: ExpeditionRun, rev: number): void {
  if (run.revision !== rev) throw new RuleError('stale', 'run revision ' + run.revision + ' != expected ' + rev);
}
/** 下一個版本（陣列、物件都複製一份，不改到輸入） */
export function bump(run: ExpeditionRun): ExpeditionRun {
  return {
    ...run, revision: run.revision + 1,
    partyIds: run.partyIds.slice(), benchIds: run.benchIds.slice(), equippedCardIds: run.equippedCardIds.slice(),
    ownedCardIds: run.ownedCardIds.slice(), visitedNodeIds: run.visitedNodeIds.slice(),
    bond: { ...run.bond }, awakened: run.awakened.slice(), challenges: run.challenges.slice(),
  };
}
export function inMap(run: ExpeditionRun, what: string): void {
  if (run.phase !== 'map') throw new RuleError('phase', 'cannot ' + what + ' in phase ' + run.phase);
}
