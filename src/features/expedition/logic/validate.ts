/**
 * 讀檔檢查：不認得的版本回 unsupported（保留、唯讀）；形狀不對回 corrupt（保留、可匯出）。不會修改輸入。
 * 每個欄位都檢查型別和範圍；檢查過的值再一個一個抄進新的 ExpeditionRun／ProfileV1（不用強制轉型），
 * 所以讀進來的物件只會有認得的欄位。
 */
import {
  AWAKEN_AT, CHAPTERS, MAX_CARD_SLOTS, PARTY_MAX, RANK_MAX, cardById, isChallenge, isFill, matchNode, nodeById,
} from '../content';
import {
  CONTENT_VERSION, RNG_VERSION, RUN_SCHEMA, SCHEMA_VERSION,
  type ChallengeId, type Checkpoint, type DailyProgress, type DailyRecord, type ExpeditionRun, type Phase, type ProfileV1, type RunMode,
} from '../types';
import { heartCap, isPassive, slotsOf } from './derived';

const PHASES: readonly Phase[] = ['map', 'active', 'reward', 'cleared', 'failed'];
const MODES: readonly RunMode[] = ['chapter', 'ironman'];
function isRecord(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isStrArr(v: unknown): v is string[] { return Array.isArray(v) && v.every((x) => typeof x === 'string'); }
function isInt(v: unknown, lo: number, hi: number): v is number { return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi; }
function distinct(a: readonly string[]): boolean { return new Set(a).size === a.length; }
function asPhase(v: unknown): Phase | undefined { return PHASES.find((p) => p === v); }
function asMode(v: unknown): RunMode | undefined { return MODES.find((m) => m === v); }
/** 角色 → 整數的表；不合格回 undefined（合格就回一份新的） */
function countMap(v: unknown, known: readonly string[], lo: number, hi: number): Record<string, number> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (!known.includes(k) || !isInt(n, lo, hi)) return undefined;
    out[k] = n;
  }
  return out;
}
/** 覺醒名單：不重複、認得的角色、而且親密度一定是滿的 */
function awakenedOk(list: readonly string[], bond: Readonly<Record<string, number>>, known: readonly string[]): boolean {
  return distinct(list) && list.every((id) => known.includes(id) && bond[id] === AWAKEN_AT);
}

export type Check<T> = { ok: true; value: T } | { ok: false; reason: 'unsupported' | 'corrupt'; detail: string };

function checkpointOf(cp: unknown, known: readonly string[]): Checkpoint | undefined {
  if (!isRecord(cp)) return undefined;
  const { partyIds, benchIds, ownedCardIds, equippedCardIds, visitedNodeIds, awakened } = cp;
  const bond = countMap(cp.bond, known, 0, AWAKEN_AT);
  if (!isStrArr(partyIds) || !partyIds.length || !isStrArr(benchIds) || !isStrArr(ownedCardIds) || !isStrArr(equippedCardIds) || !isStrArr(visitedNodeIds)) return undefined;
  if (!isStrArr(awakened) || !bond || !awakenedOk(awakened, bond, known)) return undefined;
  if (!partyIds.concat(benchIds).every((id) => known.includes(id))) return undefined;
  if (!ownedCardIds.every((id) => !!cardById(id))) return undefined;
  if (equippedCardIds.length > MAX_CARD_SLOTS || !equippedCardIds.every((id) => ownedCardIds.includes(id) && !isPassive(id))) return undefined;
  if (!visitedNodeIds.every((id) => !!nodeById(id))) return undefined;
  return {
    partyIds: partyIds.slice(), benchIds: benchIds.slice(), ownedCardIds: ownedCardIds.slice(), equippedCardIds: equippedCardIds.slice(),
    visitedNodeIds: visitedNodeIds.slice(), bond, awakened: awakened.slice(),
  };
}

export function validateRun(raw: unknown, knownIds: readonly string[]): Check<ExpeditionRun> {
  if (!isRecord(raw)) return { ok: false, reason: 'corrupt', detail: 'not an object' };
  const r = raw;
  if (r.schemaVersion !== RUN_SCHEMA) {
    // 新版做的、或舊版做的：都保留原檔、不能接著玩
    return isInt(r.schemaVersion, 1, 1e6)
      ? { ok: false, reason: 'unsupported', detail: 'schemaVersion ' + r.schemaVersion }
      : { ok: false, reason: 'corrupt', detail: 'schemaVersion ' + String(r.schemaVersion) };
  }
  const bad = (d: string): Check<ExpeditionRun> => ({ ok: false, reason: 'corrupt', detail: d });
  // 版本欄位缺了是壞檔；有但不一樣是別的版本做的（保留、不能接著玩）
  if (typeof r.rngVersion !== 'number') return bad('rngVersion');
  if (typeof r.contentVersion !== 'string') return bad('contentVersion');
  if (r.rngVersion !== RNG_VERSION) return { ok: false, reason: 'unsupported', detail: 'rngVersion ' + r.rngVersion };
  if (r.contentVersion !== CONTENT_VERSION) return { ok: false, reason: 'unsupported', detail: 'contentVersion ' + r.contentVersion };
  const mode = asMode(r.mode);
  if (!mode) return bad('mode');
  if (!isInt(r.rank, 0, RANK_MAX)) return bad('rank');
  if (!isStrArr(r.challenges) || !distinct(r.challenges)) return bad('challenges');
  const challenges: ChallengeId[] = [];
  for (const c of r.challenges) { if (!isChallenge(c)) return bad('challenges'); challenges.push(c); }
  if (r.daily !== undefined && (typeof r.daily !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.daily))) return bad('daily');
  if (!isInt(r.chapter, 0, CHAPTERS.length - 1)) return bad('chapter');
  if (!isInt(r.chapterRetries, 0, 1e6)) return bad('chapterRetries');
  const checkpoint = checkpointOf(r.checkpoint, knownIds);
  if (!checkpoint) return bad('checkpoint');
  if (typeof r.runId !== 'string' || !r.runId) return bad('runId');
  if (typeof r.seed !== 'string' || !r.seed) return bad('seed');
  const phase = asPhase(r.phase);
  if (!phase) return bad('phase');
  if (typeof r.nodeId !== 'string' || !nodeById(r.nodeId)) return bad('nodeId');
  if (!isInt(r.attemptNo, 0, 1e6)) return bad('attemptNo');
  if (!isInt(r.losses, 0, 1e6)) return bad('losses');
  if (!isInt(r.pointDiff, -1e6, 1e6)) return bad('pointDiff');
  if (!isInt(r.revision, 1, Number.MAX_SAFE_INTEGER)) return bad('revision');
  if (typeof r.createdAt !== 'number') return bad('createdAt');
  const { partyIds, benchIds, equippedCardIds, ownedCardIds, visitedNodeIds, awakened } = r;
  if (!isStrArr(partyIds) || partyIds.length < 1 || partyIds.length > PARTY_MAX || !distinct(partyIds) || !partyIds.every((id) => knownIds.includes(id))) return bad('partyIds');
  if (!isStrArr(benchIds) || !distinct(benchIds) || !benchIds.every((id) => knownIds.includes(id) && !partyIds.includes(id))) return bad('benchIds');
  if (!isStrArr(equippedCardIds) || !isStrArr(ownedCardIds) || !isStrArr(visitedNodeIds)) return bad('ids');
  if (!distinct(ownedCardIds) || !ownedCardIds.every((id) => !!cardById(id))) return bad('ownedCardIds');
  const shape = { rank: r.rank, chapter: r.chapter, challenges, ownedCardIds };
  if (!distinct(equippedCardIds) || equippedCardIds.length > slotsOf(shape) || !equippedCardIds.every((id) => ownedCardIds.includes(id) && !isPassive(id))) return bad('equippedCardIds');
  if (!isInt(r.hearts, 0, heartCap(shape))) return bad('hearts');
  if (!visitedNodeIds.every((id) => !!nodeById(id))) return bad('visitedNodeIds');
  const bond = countMap(r.bond, knownIds, 0, AWAKEN_AT);
  if (!bond) return bad('bond');
  if (!isStrArr(awakened) || !awakenedOk(awakened, bond, knownIds)) return bad('awakened');
  if (r.bossPhase !== undefined && !isInt(r.bossPhase, 0, 9)) return bad('bossPhase');
  if (phase === 'active' && (typeof r.matchId !== 'string' || !r.matchId || !matchNode(r.nodeId))) return bad('matchId');
  if (phase !== 'active' && r.matchId !== undefined) return bad('matchId outside active');
  const pr = r.pendingReward;
  let pendingReward: ExpeditionRun['pendingReward'];
  if (phase === 'reward') {
    if (!isRecord(pr) || typeof pr.settlementId !== 'string' || !isStrArr(pr.offeredCardIds) || !pr.offeredCardIds.length || !pr.offeredCardIds.every((id) => !!cardById(id) || isFill(id))) return bad('pendingReward');
    pendingReward = { settlementId: pr.settlementId, offeredCardIds: pr.offeredCardIds.slice() };
  } else if (pr !== undefined) return bad('pendingReward outside reward');
  if (phase === 'failed' ? r.hearts !== 0 || mode !== 'ironman' : r.hearts < 1) return bad('hearts/phase');
  const value: ExpeditionRun = {
    schemaVersion: RUN_SCHEMA, mode, rank: r.rank, challenges, chapter: r.chapter, chapterRetries: r.chapterRetries, checkpoint,
    runId: r.runId, seed: r.seed, rngVersion: r.rngVersion, contentVersion: r.contentVersion, phase, nodeId: r.nodeId,
    attemptNo: r.attemptNo, hearts: r.hearts, losses: r.losses, pointDiff: r.pointDiff,
    partyIds: partyIds.slice(), benchIds: benchIds.slice(), equippedCardIds: equippedCardIds.slice(), ownedCardIds: ownedCardIds.slice(),
    visitedNodeIds: visitedNodeIds.slice(), bond, awakened: awakened.slice(), revision: r.revision, createdAt: r.createdAt,
  };
  if (typeof r.daily === 'string') value.daily = r.daily;
  if (typeof r.matchId === 'string') value.matchId = r.matchId;
  if (typeof r.bossPhase === 'number') value.bossPhase = r.bossPhase;
  if (pendingReward) value.pendingReward = pendingReward;
  return { ok: true, value };
}

function dailyOf(v: unknown): DailyProgress | undefined {
  if (!isRecord(v) || typeof v.lastDate !== 'string' || !isInt(v.streak, 0, 1e6) || !isInt(v.bestStreak, 0, 1e6) || !Array.isArray(v.history)) return undefined;
  const history: DailyRecord[] = [];
  for (const h of v.history) {
    if (!isRecord(h) || typeof h.date !== 'string' || !isInt(h.score, -1e6, 1e6) || typeof h.cleared !== 'boolean') return undefined;
    history.push({ date: h.date, score: h.score, cleared: h.cleared });
  }
  return { lastDate: v.lastDate, streak: v.streak, bestStreak: v.bestStreak, history };
}

export function validateProfile(raw: unknown, knownIds: readonly string[]): Check<ProfileV1> {
  if (!isRecord(raw)) return { ok: false, reason: 'corrupt', detail: 'not an object' };
  const p = raw, bad = (d: string): Check<ProfileV1> => ({ ok: false, reason: 'corrupt', detail: d });
  if (p.schemaVersion !== SCHEMA_VERSION) {
    return isInt(p.schemaVersion, SCHEMA_VERSION + 1, 1e6)
      ? { ok: false, reason: 'unsupported', detail: 'schemaVersion ' + p.schemaVersion }
      : bad('schemaVersion');
  }
  const { expeditionUnlocked, ironmanClears, awakenedSeen, cardPool, importedLegacyVersion } = p;
  if (!isStrArr(expeditionUnlocked) || !expeditionUnlocked.every((id) => knownIds.includes(id))) return bad('expeditionUnlocked');
  const misses = countMap(p.captureMissesByCharacter, knownIds, 0, 1e6);
  if (!misses) return bad('captureMissesByCharacter');
  const value: ProfileV1 = { schemaVersion: SCHEMA_VERSION, expeditionUnlocked: expeditionUnlocked.slice(), captureMissesByCharacter: misses };
  // 之後加的欄位都可以沒有（舊的 profile 照樣能讀）
  if (importedLegacyVersion !== undefined) {
    if (typeof importedLegacyVersion !== 'string') return bad('importedLegacyVersion');
    value.importedLegacyVersion = importedLegacyVersion;
  }
  if (p.rankUnlocked !== undefined) {
    if (!isInt(p.rankUnlocked, 0, RANK_MAX)) return bad('rankUnlocked');
    value.rankUnlocked = p.rankUnlocked;
  }
  if (p.stamps !== undefined) {
    const stamps = countMap(p.stamps, knownIds, 1, RANK_MAX + 1);
    if (!stamps) return bad('stamps');
    value.stamps = stamps;
  }
  if (ironmanClears !== undefined) {
    if (!isStrArr(ironmanClears) || !ironmanClears.every((id) => knownIds.includes(id))) return bad('ironmanClears');
    value.ironmanClears = ironmanClears.slice();
  }
  if (awakenedSeen !== undefined) {
    if (!isStrArr(awakenedSeen) || !awakenedSeen.every((id) => knownIds.includes(id))) return bad('awakenedSeen');
    value.awakenedSeen = awakenedSeen.slice();
  }
  if (p.bondXp !== undefined) {
    const xp = countMap(p.bondXp, knownIds, 0, 1e9);
    if (!xp) return bad('bondXp');
    value.bondXp = xp;
  }
  if (p.challengeClears !== undefined) {
    const cc = p.challengeClears, out: Record<string, number> = {};
    if (!isRecord(cc)) return bad('challengeClears');
    for (const [k, n] of Object.entries(cc)) { if (!isChallenge(k) || !isInt(n, 0, 1e9)) return bad('challengeClears'); out[k] = n; }
    value.challengeClears = out;
  }
  if (p.goals !== undefined) {
    const g = p.goals, out: Record<string, 1> = {};
    if (!isRecord(g)) return bad('goals');
    for (const [k, n] of Object.entries(g)) { if (n !== 1) return bad('goals'); out[k] = 1; }
    value.goals = out;
  }
  if (cardPool !== undefined) {
    if (!isStrArr(cardPool) || !cardPool.every((id) => !!cardById(id))) return bad('cardPool');
    value.cardPool = cardPool.slice();
  }
  if (p.daily !== undefined) {
    const d = dailyOf(p.daily);
    if (!d) return bad('daily');
    value.daily = d;
  }
  return { ok: true, value };
}
