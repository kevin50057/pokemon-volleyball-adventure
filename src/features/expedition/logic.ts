/**
 * 遠征的規則（純函式，不碰 IndexedDB、DOM、遊戲本體）。db.ts 在 transaction 裡呼叫這些。
 *
 * 規則（SPEC §2、§4、§5）：
 *  - 開打前先把 matchId 寫進存檔（phase → active）。
 *  - 重整、離開、被系統回收：phase 還是 active，回來從這一場的開頭重打，不扣心、matchId 不變。
 *  - 只有分出勝負，或明確按「放棄本場」，才結算一次：輸了（或放棄）扣 1 心，心用完這輪結束。
 *  - 同一個 matchId 只會結算一次。收服、三選一的內容都在結算那一筆決定，由種子決定，重整刷不出別的結果。
 *  - 有三選一時先進 reward：選一張或主動略過才回地圖；reward 不能重開已經結算的比賽。
 */
import { offerCards } from './cards';
import {
  CAPTURE_CHANCE, CARD_SLOTS, FIRST_NODE, PARTY_MAX, START_HEARTS, cardById, matchNode, nodeById,
} from './content';
import { rngFor } from './rng';
import {
  CONTENT_VERSION, RNG_VERSION, SCHEMA_VERSION,
  type CaptureRecord, type ExpeditionRunV1, type MatchResult, type Phase, type ProfileV1, type SettlementV1,
} from './types';

export class RuleError extends Error {
  constructor(public code: 'stale' | 'phase' | 'mismatch' | 'invalid', message: string) { super(message); }
}

export function newProfile(): ProfileV1 {
  return { schemaVersion: 1, expeditionUnlocked: [], captureMissesByCharacter: {} };
}

/** party：上場的夥伴，加上最多一隻備援 */
export function newRun(runId: string, seed: string, party: string | readonly string[], now: number): ExpeditionRunV1 {
  const ids = Array.from(new Set(typeof party === 'string' ? [party] : party)).slice(0, PARTY_MAX);
  if (!ids.length) throw new RuleError('invalid', 'a run needs a partner');
  return {
    schemaVersion: 1, runId, seed, rngVersion: RNG_VERSION, contentVersion: CONTENT_VERSION,
    phase: 'map', nodeId: FIRST_NODE, attemptNo: 0, hearts: START_HEARTS, losses: 0,
    partyIds: ids, equippedCardIds: [], ownedCardIds: [], visitedNodeIds: [],
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
function bump(run: ExpeditionRunV1): ExpeditionRunV1 {
  return {
    ...run, revision: run.revision + 1,
    partyIds: run.partyIds.slice(), equippedCardIds: run.equippedCardIds.slice(),
    ownedCardIds: run.ownedCardIds.slice(), visitedNodeIds: run.visitedNodeIds.slice(),
  };
}
function inMap(run: ExpeditionRunV1, what: string): void {
  if (run.phase !== 'map') throw new RuleError('phase', 'cannot ' + what + ' in phase ' + run.phase);
}

/**
 * 入場。phase 是 map 就開新的一場（attemptNo + 1）；已經是 active（重整後回來）就沿用同一個 matchId。
 * 回傳新的 run（沒有變化時回傳同一個物件）。
 */
export function beginMatch(run: ExpeditionRunV1, rev: number): ExpeditionRunV1 {
  expectRevision(run, rev);
  if (run.phase === 'active') return run;
  inMap(run, 'start a match');
  if (!matchNode(run.nodeId)) throw new RuleError('phase', run.nodeId + ' is not a match node');
  const next = bump(run);
  next.phase = 'active'; next.attemptNo = run.attemptNo + 1;
  next.matchId = matchIdOf(next);
  return next;
}

/** 岔路：選一條 */
export function chooseBranch(run: ExpeditionRunV1, rev: number, option: string): ExpeditionRunV1 {
  expectRevision(run, rev);
  inMap(run, 'choose a branch');
  const n = nodeById(run.nodeId);
  if (!n || n.kind !== 'fork' || n.options.indexOf(option) < 0) throw new RuleError('invalid', option + ' is not an option at ' + run.nodeId);
  const next = bump(run);
  next.nodeId = option; next.attemptNo = 0;
  return next;
}

function checkLoadout(run: ExpeditionRunV1, equipped: readonly string[]): string[] {
  const ids = Array.from(new Set(equipped));
  if (ids.length !== equipped.length || ids.length > CARD_SLOTS || !ids.every((id) => run.ownedCardIds.indexOf(id) >= 0)) {
    throw new RuleError('invalid', 'bad loadout');
  }
  return ids;
}

/** 補給站：確認換裝，前往下一站 */
export function leaveSupply(run: ExpeditionRunV1, rev: number, equipped: readonly string[]): ExpeditionRunV1 {
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

/** 換上場的夥伴（只能在地圖上） */
export function setLead(run: ExpeditionRunV1, rev: number, charId: string): ExpeditionRunV1 {
  expectRevision(run, rev);
  inMap(run, 'switch partners');
  if (run.partyIds.indexOf(charId) < 0) throw new RuleError('invalid', charId + ' is not in the party');
  if (run.partyIds[0] === charId) return run;
  const next = bump(run);
  next.partyIds = [charId].concat(run.partyIds.filter((id) => id !== charId));
  return next;
}

export interface Settled {
  run: ExpeditionRunV1;
  profile: ProfileV1;
  capture?: CaptureRecord;
  offered?: string[];
}

/** 結算後的 run 和 profile。呼叫前要確認這個 matchId 還沒結算過。不會修改輸入。 */
export function applySettlement(run: ExpeditionRunV1, profile: ProfileV1, matchId: string, result: MatchResult): Settled {
  if (run.phase !== 'active') throw new RuleError('phase', 'settle in phase ' + run.phase);
  if (run.matchId !== matchId) throw new RuleError('mismatch', 'settle ' + matchId + ' but active is ' + run.matchId);
  const node = matchNode(run.nodeId);
  if (!node) throw new RuleError('invalid', run.nodeId + ' is not a match node');
  const next = bump(run);
  delete next.matchId;
  const out: Settled = { run: next, profile };
  if (result !== 'win') {
    next.losses = run.losses + 1;
    next.hearts = run.hearts - 1;
    next.phase = next.hearts > 0 ? 'map' : 'failed';
    return out;
  }
  next.visitedNodeIds.push(run.nodeId);
  // 收服：落在結算，不打斷決勝球
  if (node.capture && profile.expeditionUnlocked.indexOf(node.opp) < 0) {
    const missed = (profile.captureMissesByCharacter[node.opp] || 0) > 0;
    const sure = node.capture === 'sure' || missed;
    const ok = sure || rngFor(run.seed, run.nodeId, 'capture', run.rngVersion).next() < CAPTURE_CHANCE;
    const p: ProfileV1 = { ...profile, expeditionUnlocked: profile.expeditionUnlocked.slice(), captureMissesByCharacter: { ...profile.captureMissesByCharacter } };
    let joined = false;
    if (ok) {
      p.expeditionUnlocked.push(node.opp);
      delete p.captureMissesByCharacter[node.opp];
      if (next.partyIds.length < PARTY_MAX && next.partyIds.indexOf(node.opp) < 0) { next.partyIds.push(node.opp); joined = true; }
    } else {
      p.captureMissesByCharacter[node.opp] = (p.captureMissesByCharacter[node.opp] || 0) + 1;
    }
    out.profile = p;
    out.capture = { char: node.opp, ok, sure, joined };
  }
  if (node.next === null) { next.phase = 'cleared'; return out; }
  next.nodeId = node.next; next.attemptNo = 0; next.phase = 'map';
  if (node.reward) {
    const offered = offerCards(run.ownedCardIds, rngFor(run.seed, run.nodeId, 'cards', run.rngVersion));
    if (offered.length) {
      out.offered = offered;
      next.phase = 'reward';
      next.pendingReward = { settlementId: settlementIdOf(run.runId, matchId), offeredCardIds: offered };
    }
  }
  return out;
}

/** 三選一：選一張（有空格就直接裝上），或傳 null 主動略過 */
export function pickReward(run: ExpeditionRunV1, rev: number, cardId: string | null): ExpeditionRunV1 {
  expectRevision(run, rev);
  if (run.phase !== 'reward' || !run.pendingReward) throw new RuleError('phase', 'no reward to pick in phase ' + run.phase);
  if (cardId !== null && run.pendingReward.offeredCardIds.indexOf(cardId) < 0) throw new RuleError('invalid', cardId + ' was not offered');
  const next = bump(run);
  delete next.pendingReward;
  next.phase = 'map';
  if (cardId !== null && next.ownedCardIds.indexOf(cardId) < 0) {
    next.ownedCardIds.push(cardId);
    if (next.equippedCardIds.length < CARD_SLOTS) next.equippedCardIds.push(cardId);
  }
  return next;
}

export function makeSettlement(run: ExpeditionRunV1, s: Settled, matchId: string, result: MatchResult, scores: [number, number], now: number): SettlementV1 {
  const st: SettlementV1 = { id: settlementIdOf(run.runId, matchId), runId: run.runId, matchId, nodeId: run.nodeId, result, scores, revision: s.run.revision, at: now, lead: run.partyIds[0] };
  if (s.capture) st.capture = s.capture;
  if (s.offered) st.offered = s.offered;
  return st;
}

// ---------- 讀檔檢查 ----------

const PHASES: readonly Phase[] = ['map', 'active', 'reward', 'cleared', 'failed'];
function isStrArr(v: unknown): v is string[] { return Array.isArray(v) && v.every((x) => typeof x === 'string'); }
function isInt(v: unknown, lo: number, hi: number): v is number { return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi; }
function distinct(a: readonly string[]): boolean { return new Set(a).size === a.length; }

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
  if (!isStrArr(r.partyIds) || r.partyIds.length < 1 || r.partyIds.length > PARTY_MAX || !distinct(r.partyIds) || !r.partyIds.every((id) => knownIds.includes(id))) return bad('partyIds');
  if (!isStrArr(r.equippedCardIds) || !isStrArr(r.ownedCardIds) || !isStrArr(r.visitedNodeIds)) return bad('ids');
  const owned = r.ownedCardIds, equipped = r.equippedCardIds;
  if (!distinct(owned) || !owned.every((id) => !!cardById(id))) return bad('ownedCardIds');
  if (!distinct(equipped) || equipped.length > CARD_SLOTS || !equipped.every((id) => owned.includes(id))) return bad('equippedCardIds');
  if (!r.visitedNodeIds.every((id) => !!nodeById(id))) return bad('visitedNodeIds');
  if (r.phase === 'active' && (typeof r.matchId !== 'string' || !r.matchId || !matchNode(r.nodeId))) return bad('matchId');
  if (r.phase !== 'active' && r.matchId !== undefined) return bad('matchId outside active');
  const pr = r.pendingReward as { settlementId?: unknown; offeredCardIds?: unknown } | undefined;
  if (r.phase === 'reward') {
    if (!pr || typeof pr !== 'object' || typeof pr.settlementId !== 'string' || !isStrArr(pr.offeredCardIds) || !pr.offeredCardIds.length || !pr.offeredCardIds.every((id) => !!cardById(id))) return bad('pendingReward');
  } else if (pr !== undefined) return bad('pendingReward outside reward');
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
