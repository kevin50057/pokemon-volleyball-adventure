/**
 * 遠征的規則（純函式，不碰 IndexedDB、DOM、遊戲本體）。db.ts 在 transaction 裡呼叫這些。
 *
 * 規則（SPEC §2、§5）：
 *  - 開打前先把 matchId 寫進存檔（phase → active）。
 *  - 重整、離開、被系統回收：phase 還是 active，回來從這一場的開頭重打，不扣心、matchId 不變。
 *  - 只有分出勝負，或明確按「放棄本場」，才結算一次：輸了（或放棄）扣 1 心，心用完這輪結束。
 *  - 同一個 matchId 只會結算一次。
 */
import { ROUTE, START_HEARTS, nodeById } from './content';
import {
  CONTENT_VERSION, RNG_VERSION, SCHEMA_VERSION,
  type ExpeditionRunV1, type MatchResult, type Phase, type ProfileV1, type SettlementV1,
} from './types';

export class RuleError extends Error {
  constructor(public code: 'stale' | 'phase' | 'mismatch' | 'invalid', message: string) { super(message); }
}

export function newProfile(): ProfileV1 {
  return { schemaVersion: 1, expeditionUnlocked: [], captureMissesByCharacter: {} };
}

export function newRun(runId: string, seed: string, partner: string, now: number): ExpeditionRunV1 {
  return {
    schemaVersion: 1, runId, seed, rngVersion: RNG_VERSION, contentVersion: CONTENT_VERSION,
    phase: 'map', nodeId: ROUTE[0].id, attemptNo: 0, hearts: START_HEARTS, losses: 0,
    partyIds: [partner], equippedCardIds: [], ownedCardIds: [], visitedNodeIds: [],
    revision: 1, createdAt: now,
  };
}

export function matchIdOf(run: ExpeditionRunV1): string {
  return run.nodeId + '#' + run.attemptNo;
}
export function settlementIdOf(runId: string, matchId: string): string {
  return runId + '/' + matchId;
}

/** 寫入前檢查：呼叫端手上的 revision 必須是最新的 */
export function expectRevision(run: ExpeditionRunV1, rev: number): void {
  if (run.revision !== rev) throw new RuleError('stale', 'run revision ' + run.revision + ' != expected ' + rev);
}

/**
 * 入場。phase 是 map 就開新的一場（attemptNo + 1）；已經是 active（重整後回來）就沿用同一個 matchId。
 * 回傳新的 run（沒有變化時回傳同一個物件）。
 */
export function beginMatch(run: ExpeditionRunV1, rev: number): ExpeditionRunV1 {
  expectRevision(run, rev);
  if (run.phase === 'active') return run;
  if (run.phase !== 'map') throw new RuleError('phase', 'cannot start a match in phase ' + run.phase);
  const next: ExpeditionRunV1 = { ...run, phase: 'active', attemptNo: run.attemptNo + 1, revision: run.revision + 1 };
  next.matchId = matchIdOf(next);
  return next;
}

/** 結算後的 run。呼叫前要確認這個 matchId 還沒結算過。 */
export function applySettlement(run: ExpeditionRunV1, matchId: string, result: MatchResult): ExpeditionRunV1 {
  if (run.phase !== 'active') throw new RuleError('phase', 'settle in phase ' + run.phase);
  if (run.matchId !== matchId) throw new RuleError('mismatch', 'settle ' + matchId + ' but active is ' + run.matchId);
  const next: ExpeditionRunV1 = { ...run, revision: run.revision + 1, visitedNodeIds: run.visitedNodeIds.slice() };
  delete next.matchId;
  if (result === 'win') {
    next.visitedNodeIds.push(run.nodeId);
    const i = ROUTE.findIndex((n) => n.id === run.nodeId);
    if (i >= 0 && i + 1 < ROUTE.length) { next.nodeId = ROUTE[i + 1].id; next.phase = 'map'; next.attemptNo = 0; }
    else next.phase = 'cleared';
  } else {
    next.losses = run.losses + 1;
    next.hearts = run.hearts - 1;
    next.phase = next.hearts > 0 ? 'map' : 'failed';
  }
  return next;
}

export function makeSettlement(run: ExpeditionRunV1, after: ExpeditionRunV1, matchId: string, result: MatchResult, scores: [number, number], now: number): SettlementV1 {
  return { id: settlementIdOf(run.runId, matchId), runId: run.runId, matchId, nodeId: run.nodeId, result, scores, revision: after.revision, at: now };
}

// ---------- 讀檔檢查 ----------

const PHASES: readonly Phase[] = ['map', 'active', 'reward', 'cleared', 'failed'];
function isStrArr(v: unknown): v is string[] { return Array.isArray(v) && v.every((x) => typeof x === 'string'); }
function isInt(v: unknown, lo: number, hi: number): v is number { return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi; }

export type Check<T> = { ok: true; value: T } | { ok: false; reason: 'unsupported' | 'corrupt'; detail: string };

/** 不認得的版本回 unsupported（保留、唯讀）；形狀不對回 corrupt（保留、可匯出）。不會修改輸入。 */
export function validateRun(raw: unknown, knownIds: readonly string[]): Check<ExpeditionRunV1> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt', detail: 'not an object' };
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== SCHEMA_VERSION) {
    return typeof r.schemaVersion === 'number' && r.schemaVersion > SCHEMA_VERSION
      ? { ok: false, reason: 'unsupported', detail: 'schemaVersion ' + r.schemaVersion }
      : { ok: false, reason: 'corrupt', detail: 'schemaVersion ' + String(r.schemaVersion) };
  }
  const bad = (d: string): Check<ExpeditionRunV1> => ({ ok: false, reason: 'corrupt', detail: d });
  if (typeof r.runId !== 'string' || !r.runId) return bad('runId');
  if (typeof r.seed !== 'string' || !r.seed) return bad('seed');
  if (r.rngVersion !== RNG_VERSION) return { ok: false, reason: 'unsupported', detail: 'rngVersion ' + String(r.rngVersion) };
  if (r.contentVersion !== CONTENT_VERSION) return { ok: false, reason: 'unsupported', detail: 'contentVersion ' + String(r.contentVersion) };
  if (!PHASES.includes(r.phase as Phase)) return bad('phase');
  if (typeof r.nodeId !== 'string' || !nodeById(r.nodeId)) return bad('nodeId');
  if (!isInt(r.attemptNo, 0, 1e6)) return bad('attemptNo');
  if (!isInt(r.hearts, 0, START_HEARTS)) return bad('hearts');
  if (!isInt(r.losses, 0, 1e6)) return bad('losses');
  if (!isInt(r.revision, 1, Number.MAX_SAFE_INTEGER)) return bad('revision');
  if (!isStrArr(r.partyIds) || r.partyIds.length < 1 || !r.partyIds.every((id) => knownIds.includes(id))) return bad('partyIds');
  if (!isStrArr(r.equippedCardIds) || !isStrArr(r.ownedCardIds) || !isStrArr(r.visitedNodeIds)) return bad('ids');
  if (!r.visitedNodeIds.every((id) => !!nodeById(id))) return bad('visitedNodeIds');
  if (r.phase === 'active' && (typeof r.matchId !== 'string' || !r.matchId)) return bad('matchId');
  if (r.phase !== 'active' && r.matchId !== undefined) return bad('matchId outside active');
  if (r.phase === 'failed' ? r.hearts !== 0 : r.hearts < 1) return bad('hearts/phase');
  if (typeof r.createdAt !== 'number') return bad('createdAt');
  return { ok: true, value: raw as ExpeditionRunV1 };
}

export function validateProfile(raw: unknown, knownIds: readonly string[]): Check<ProfileV1> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt', detail: 'not an object' };
  const p = raw as Record<string, unknown>;
  if (p.schemaVersion !== SCHEMA_VERSION) {
    return typeof p.schemaVersion === 'number' && p.schemaVersion > SCHEMA_VERSION
      ? { ok: false, reason: 'unsupported', detail: 'schemaVersion ' + p.schemaVersion }
      : { ok: false, reason: 'corrupt', detail: 'schemaVersion' };
  }
  if (!isStrArr(p.expeditionUnlocked) || !p.expeditionUnlocked.every((id) => knownIds.includes(id))) return { ok: false, reason: 'corrupt', detail: 'expeditionUnlocked' };
  const m = p.captureMissesByCharacter;
  if (!m || typeof m !== 'object' || !Object.entries(m).every(([k, v]) => knownIds.includes(k) && isInt(v, 0, 1e6))) return { ok: false, reason: 'corrupt', detail: 'captureMissesByCharacter' };
  return { ok: true, value: raw as ProfileV1 };
}
