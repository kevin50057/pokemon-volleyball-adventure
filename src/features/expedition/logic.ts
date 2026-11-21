/**
 * 遠征的規則（純函式，不碰 IndexedDB、DOM、遊戲本體）。db.ts 在 transaction 裡呼叫這些。
 *
 * 規則（SPEC §2、§4、§5）：
 *  - 開打前先把 matchId 寫進存檔（phase → active）。
 *  - 重整、離開、被系統回收：phase 還是 active，回來從這一場的開頭重打，不扣心、matchId 不變。
 *  - 只有分出勝負，或明確按「放棄本場」，才結算一次：輸了（或放棄）扣 1 心，心用完這輪結束。
 *  - 同一個 matchId 只會結算一次。收服、三選一的內容都在結算那一筆決定，由種子決定，重整刷不出別的結果。
 *  - 有三選一時先進 reward：選一張或主動略過才回地圖；reward 不能重開已經結算的比賽。
 *  - 章節制（預設）：失敗的單位是「章」。心用完回到這一章的開頭，隊伍、卡牌、走過的路回到這一章開始時的快照，
 *    心回滿；已經入帳的永久收服不會收回。一命到底：心用完整輪結束。
 *  - 打倒一章的首領：有下一章就從下一章開頭開始（心回滿、記新的快照），沒有就整輪通關。
 */
import { offerCards } from './cards';
import {
  CAPTURE_CHANCE, CHAPTERS, EVENTS, PARTY_MAX, RANK_MAX, cardById, cardSlots, matchNode, maxHearts, nodeById,
  type EventChoice, type EventId,
} from './content';
import { rngFor } from './rng';
import { resolveMatch } from './route';

const isMech = (id: string): boolean => !!(cardById(id) || {}).mech;
import {
  CONTENT_VERSION, RNG_VERSION, RUN_SCHEMA, SCHEMA_VERSION,
  type CaptureRecord, type Checkpoint, type RunMode, type ExpeditionRun, type MatchResult, type Phase, type ProfileV1, type SettlementV1,
} from './types';

export class RuleError extends Error {
  constructor(public code: 'stale' | 'phase' | 'mismatch' | 'invalid', message: string) { super(message); }
}

export function newProfile(): ProfileV1 {
  return { schemaVersion: 1, expeditionUnlocked: [], captureMissesByCharacter: {} };
}

function snapshot(r: Pick<ExpeditionRun, 'partyIds' | 'benchIds' | 'ownedCardIds' | 'equippedCardIds' | 'visitedNodeIds'>): Checkpoint {
  return { partyIds: r.partyIds.slice(), benchIds: r.benchIds.slice(), ownedCardIds: r.ownedCardIds.slice(), equippedCardIds: r.equippedCardIds.slice(), visitedNodeIds: r.visitedNodeIds.slice() };
}

/** party：上場的夥伴，加上最多一隻備援 */
export function newRun(runId: string, seed: string, party: string | readonly string[], now: number, mode: RunMode = 'chapter', rank = 0): ExpeditionRun {
  const ids = Array.from(new Set(typeof party === 'string' ? [party] : party)).slice(0, PARTY_MAX);
  if (!ids.length) throw new RuleError('invalid', 'a run needs a partner');
  const base = { partyIds: ids, benchIds: [] as string[], equippedCardIds: [] as string[], ownedCardIds: [] as string[], visitedNodeIds: [] as string[] };
  return {
    schemaVersion: RUN_SCHEMA, mode, rank: Math.max(0, Math.min(RANK_MAX, rank)), chapter: 0, chapterRetries: 0, checkpoint: snapshot(base),
    runId, seed, rngVersion: RNG_VERSION, contentVersion: CONTENT_VERSION,
    phase: 'map', nodeId: CHAPTERS[0].first, attemptNo: 0, hearts: maxHearts(rank), losses: 0,
    ...base,
    revision: 1, createdAt: now,
  };
}

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
function bump(run: ExpeditionRun): ExpeditionRun {
  return {
    ...run, revision: run.revision + 1,
    partyIds: run.partyIds.slice(), benchIds: run.benchIds.slice(), equippedCardIds: run.equippedCardIds.slice(),
    ownedCardIds: run.ownedCardIds.slice(), visitedNodeIds: run.visitedNodeIds.slice(),
  };
}
function inMap(run: ExpeditionRun, what: string): void {
  if (run.phase !== 'map') throw new RuleError('phase', 'cannot ' + what + ' in phase ' + run.phase);
}

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

/** 岔路：選一條 */
export function chooseBranch(run: ExpeditionRun, rev: number, option: string): ExpeditionRun {
  expectRevision(run, rev);
  inMap(run, 'choose a branch');
  const n = nodeById(run.nodeId);
  if (!n || n.kind !== 'fork' || n.options.indexOf(option) < 0) throw new RuleError('invalid', option + ' is not an option at ' + run.nodeId);
  const next = bump(run);
  next.nodeId = option; next.attemptNo = 0;
  return next;
}

function checkLoadout(run: ExpeditionRun, equipped: readonly string[]): string[] {
  const ids = Array.from(new Set(equipped));
  if (ids.length !== equipped.length || ids.length > cardSlots(run.chapter) || !ids.every((id) => run.ownedCardIds.indexOf(id) >= 0)) {
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

/** 換上場的夥伴（只能在地圖上） */
export function setLead(run: ExpeditionRun, rev: number, charId: string): ExpeditionRun {
  expectRevision(run, rev);
  inMap(run, 'switch partners');
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

/** 這個奇遇節點遇到的是哪一個（由種子決定，重整不會變） */
export function eventOf(run: ExpeditionRun): EventId | null {
  const n = nodeById(run.nodeId);
  if (!n || n.kind !== 'event') return null;
  return rngFor(run.seed, n.id, 'event', run.rngVersion).pick(n.pool);
}

/** 奇遇：選一個選項。回 1 心不會超過上限；拿卡的話進三選一（或二選一） */
export function resolveEvent(run: ExpeditionRun, rev: number, choice: EventChoice, cardId?: string): ExpeditionRun {
  expectRevision(run, rev);
  inMap(run, 'resolve an event');
  const n = nodeById(run.nodeId), ev = eventOf(run);
  if (!n || n.kind !== 'event' || !ev) throw new RuleError('phase', run.nodeId + ' is not an event');
  if (EVENTS[ev].indexOf(choice) < 0) throw new RuleError('invalid', choice + ' is not an option of ' + ev);
  if (choice === 'gamble' && run.hearts <= 1) throw new RuleError('invalid', 'not enough hearts to gamble');
  if (choice === 'trade' && (!cardId || run.ownedCardIds.indexOf(cardId) < 0)) throw new RuleError('invalid', 'trade needs one of your cards');
  const next = bump(run);
  next.visitedNodeIds.push(n.id);
  next.nodeId = n.next; next.attemptNo = 0;
  if (choice === 'heal') next.hearts = Math.min(maxHearts(run.rank), run.hearts + 1);
  let offered: string[] = [];
  const rng = rngFor(run.seed, n.id, 'cards', run.rngVersion);
  if (choice === 'cards2' || choice === 'cards3') offered = offerCards(run.ownedCardIds, rng, choice === 'cards2' ? 2 : 3);
  if (choice === 'gamble') {
    next.hearts = run.hearts - 1;
    offered = offerCards(run.ownedCardIds, rng, 3, isMech);
    if (!offered.length) offered = offerCards(run.ownedCardIds, rng, 3);
  }
  if (choice === 'trade') {
    next.ownedCardIds = next.ownedCardIds.filter((id) => id !== cardId);
    next.equippedCardIds = next.equippedCardIds.filter((id) => id !== cardId);
    offered = offerCards(run.ownedCardIds, rng, 3);      // 丟掉的那張不會再出現
  }
  if (offered.length) { next.phase = 'reward'; next.pendingReward = { settlementId: settlementIdOf(run.runId, n.id + '#event'), offeredCardIds: offered }; }
  return next;
}

export interface Settled {
  run: ExpeditionRun;
  profile: ProfileV1;
  capture?: CaptureRecord;
  offered?: string[];
  /** 心用完，回到這一章的開頭（章節制） */
  chapterRestart?: boolean;
}

/** 結算後的 run 和 profile。呼叫前要確認這個 matchId 還沒結算過。不會修改輸入。 */
export function applySettlement(run: ExpeditionRun, profile: ProfileV1, matchId: string, result: MatchResult): Settled {
  if (run.phase !== 'active') throw new RuleError('phase', 'settle in phase ' + run.phase);
  if (run.matchId !== matchId) throw new RuleError('mismatch', 'settle ' + matchId + ' but active is ' + run.matchId);
  const node = resolveMatch(run.nodeId, run.seed);
  if (!node) throw new RuleError('invalid', run.nodeId + ' is not a match node');
  const next = bump(run);
  delete next.matchId;
  const out: Settled = { run: next, profile };
  if (result !== 'win') {
    next.losses = run.losses + 1;
    next.hearts = run.hearts - 1;
    next.phase = 'map';
    if (next.hearts > 0) return out;
    if (run.mode === 'ironman') { next.phase = 'failed'; return out; }
    // 章節制：回到這一章的開頭（快照），心回滿
    const cp = run.checkpoint;
    next.partyIds = cp.partyIds.slice(); next.benchIds = cp.benchIds.slice();
    next.ownedCardIds = cp.ownedCardIds.slice(); next.equippedCardIds = cp.equippedCardIds.slice();
    next.visitedNodeIds = cp.visitedNodeIds.slice();
    next.nodeId = CHAPTERS[run.chapter].first; next.attemptNo = 0;
    next.hearts = maxHearts(run.rank);
    next.chapterRetries = run.chapterRetries + 1;
    out.chapterRestart = true;
    return out;
  }
  next.visitedNodeIds.push(run.nodeId);
  // 早就收服過的對手：不擲收服，直接來幫這一輪的忙（加入隊伍或後援）
  if (node.capture && profile.expeditionUnlocked.indexOf(node.opp) >= 0 && next.partyIds.indexOf(node.opp) < 0 && next.benchIds.indexOf(node.opp) < 0) {
    let joined = false;
    if (next.partyIds.length < PARTY_MAX) { next.partyIds.push(node.opp); joined = true; } else next.benchIds.push(node.opp);
    out.capture = { char: node.opp, ok: true, sure: true, joined, returning: true };
  }
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
      else if (next.benchIds.indexOf(node.opp) < 0 && next.partyIds.indexOf(node.opp) < 0) next.benchIds.push(node.opp);
    } else {
      p.captureMissesByCharacter[node.opp] = (p.captureMissesByCharacter[node.opp] || 0) + 1;
    }
    out.profile = p;
    out.capture = { char: node.opp, ok, sure, joined };
  }
  if (node.next === null) {
    // 這一章的首領：有下一章就從下一章開頭開始，沒有就整輪通關
    const nc = CHAPTERS[run.chapter + 1];
    if (!nc) {
      next.phase = 'cleared';
      // 通關：開放下一級難度、蓋上場夥伴的通關印章
      const p0 = out.profile, lead = next.partyIds[0];
      const p: ProfileV1 = { ...p0, stamps: { ...(p0.stamps || {}) }, ironmanClears: (p0.ironmanClears || []).slice() };
      p.rankUnlocked = Math.max(p0.rankUnlocked || 0, Math.min(RANK_MAX, run.rank + 1));
      (p.stamps as Record<string, number>)[lead] = Math.max((p0.stamps || {})[lead] || 0, run.rank + 1);
      if (run.mode === 'ironman' && (p.ironmanClears as string[]).indexOf(lead) < 0) (p.ironmanClears as string[]).push(lead);
      out.profile = p;
      return out;
    }
    next.chapter = run.chapter + 1; next.nodeId = nc.first; next.attemptNo = 0; next.phase = 'map';
    next.hearts = maxHearts(run.rank);
    next.checkpoint = snapshot(next);
    return out;
  }
  next.nodeId = node.next; next.attemptNo = 0; next.phase = 'map';
  if (node.reward) {
    const rng = rngFor(run.seed, run.nodeId, 'cards', run.rngVersion);
    let offered = node.reward === 'rare' ? offerCards(run.ownedCardIds, rng, 3, isMech) : [];
    if (!offered.length) offered = offerCards(run.ownedCardIds, rng);
    if (offered.length) {
      out.offered = offered;
      next.phase = 'reward';
      next.pendingReward = { settlementId: settlementIdOf(run.runId, matchId), offeredCardIds: offered };
    }
  }
  return out;
}

/** 三選一：選一張（有空格就直接裝上），或傳 null 主動略過 */
export function pickReward(run: ExpeditionRun, rev: number, cardId: string | null): ExpeditionRun {
  expectRevision(run, rev);
  if (run.phase !== 'reward' || !run.pendingReward) throw new RuleError('phase', 'no reward to pick in phase ' + run.phase);
  if (cardId !== null && run.pendingReward.offeredCardIds.indexOf(cardId) < 0) throw new RuleError('invalid', cardId + ' was not offered');
  const next = bump(run);
  delete next.pendingReward;
  next.phase = 'map';
  if (cardId !== null && next.ownedCardIds.indexOf(cardId) < 0) {
    next.ownedCardIds.push(cardId);
    if (next.equippedCardIds.length < cardSlots(run.chapter)) next.equippedCardIds.push(cardId);
  }
  return next;
}

export function makeSettlement(run: ExpeditionRun, s: Settled, matchId: string, result: MatchResult, scores: [number, number], now: number): SettlementV1 {
  const st: SettlementV1 = { id: settlementIdOf(run.runId, matchId), runId: run.runId, matchId, nodeId: run.nodeId, result, scores, revision: s.run.revision, at: now, lead: run.partyIds[0] };
  if (s.capture) st.capture = s.capture;
  if (s.chapterRestart) st.chapterRestart = true;
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
export function validateRun(raw: unknown, knownIds: readonly string[]): Check<ExpeditionRun> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt', detail: 'not an object' };
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== RUN_SCHEMA) {
    // 新版做的、或舊版（章節制之前）做的：都保留原檔、不能接著玩
    return typeof r.schemaVersion === 'number' && Number.isInteger(r.schemaVersion) && r.schemaVersion >= 1
      ? { ok: false, reason: 'unsupported', detail: 'schemaVersion ' + r.schemaVersion }
      : { ok: false, reason: 'corrupt', detail: 'schemaVersion ' + String(r.schemaVersion) };
  }
  const bad = (d: string): Check<ExpeditionRun> => ({ ok: false, reason: 'corrupt', detail: d });
  if (r.mode !== 'chapter' && r.mode !== 'ironman') return bad('mode');
  if (!isInt(r.rank, 0, RANK_MAX)) return bad('rank');
  if (!isInt(r.chapter, 0, CHAPTERS.length - 1)) return bad('chapter');
  if (!isInt(r.chapterRetries, 0, 1e6)) return bad('chapterRetries');
  const cp = r.checkpoint as Record<string, unknown> | undefined;
  if (!cp || typeof cp !== 'object' || !isStrArr(cp.partyIds) || !cp.partyIds.length || !isStrArr(cp.benchIds) || !isStrArr(cp.ownedCardIds) || !isStrArr(cp.equippedCardIds) || !isStrArr(cp.visitedNodeIds)
    || !cp.partyIds.concat(cp.benchIds).every((id) => knownIds.includes(id)) || !cp.ownedCardIds.every((id) => !!cardById(id)) || !cp.equippedCardIds.every((id) => (cp.ownedCardIds as string[]).includes(id))
    || !cp.visitedNodeIds.every((id) => !!nodeById(id))) return bad('checkpoint');
  if (typeof r.runId !== 'string' || !r.runId) return bad('runId');
  if (typeof r.seed !== 'string' || !r.seed) return bad('seed');
  if (r.rngVersion !== RNG_VERSION) return { ok: false, reason: 'unsupported', detail: 'rngVersion ' + String(r.rngVersion) };
  if (r.contentVersion !== CONTENT_VERSION) return { ok: false, reason: 'unsupported', detail: 'contentVersion ' + String(r.contentVersion) };
  if (!PHASES.includes(r.phase as Phase)) return bad('phase');
  if (typeof r.nodeId !== 'string' || !nodeById(r.nodeId)) return bad('nodeId');
  if (!isInt(r.attemptNo, 0, 1e6)) return bad('attemptNo');
  if (!isInt(r.hearts, 0, maxHearts(r.rank as number))) return bad('hearts');
  if (!isInt(r.losses, 0, 1e6)) return bad('losses');
  if (!isInt(r.revision, 1, Number.MAX_SAFE_INTEGER)) return bad('revision');
  if (!isStrArr(r.partyIds) || r.partyIds.length < 1 || r.partyIds.length > PARTY_MAX || !distinct(r.partyIds) || !r.partyIds.every((id) => knownIds.includes(id))) return bad('partyIds');
  if (!isStrArr(r.benchIds) || !distinct(r.benchIds) || !r.benchIds.every((id) => knownIds.includes(id) && !(r.partyIds as string[]).includes(id))) return bad('benchIds');
  if (!isStrArr(r.equippedCardIds) || !isStrArr(r.ownedCardIds) || !isStrArr(r.visitedNodeIds)) return bad('ids');
  const owned = r.ownedCardIds, equipped = r.equippedCardIds;
  if (!distinct(owned) || !owned.every((id) => !!cardById(id))) return bad('ownedCardIds');
  if (!distinct(equipped) || equipped.length > cardSlots(r.chapter as number) || !equipped.every((id) => owned.includes(id))) return bad('equippedCardIds');
  if (!r.visitedNodeIds.every((id) => !!nodeById(id))) return bad('visitedNodeIds');
  if (r.phase === 'active' && (typeof r.matchId !== 'string' || !r.matchId || !matchNode(r.nodeId))) return bad('matchId');
  if (r.phase !== 'active' && r.matchId !== undefined) return bad('matchId outside active');
  const pr = r.pendingReward as { settlementId?: unknown; offeredCardIds?: unknown } | undefined;
  if (r.phase === 'reward') {
    if (!pr || typeof pr !== 'object' || typeof pr.settlementId !== 'string' || !isStrArr(pr.offeredCardIds) || !pr.offeredCardIds.length || !pr.offeredCardIds.every((id) => !!cardById(id))) return bad('pendingReward');
  } else if (pr !== undefined) return bad('pendingReward outside reward');
  if (r.phase === 'failed' ? r.hearts !== 0 || r.mode !== 'ironman' : r.hearts < 1) return bad('hearts/phase');
  if (typeof r.createdAt !== 'number') return bad('createdAt');
  return { ok: true, value: raw as ExpeditionRun };
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
  // 之後加的欄位都可以沒有（舊的 profile 照樣能讀）
  if (p.rankUnlocked !== undefined && !isInt(p.rankUnlocked, 0, RANK_MAX)) return { ok: false, reason: 'corrupt', detail: 'rankUnlocked' };
  const st = p.stamps;
  if (st !== undefined && (!st || typeof st !== 'object' || !Object.entries(st).every(([k, v]) => knownIds.includes(k) && isInt(v, 1, RANK_MAX + 1)))) return { ok: false, reason: 'corrupt', detail: 'stamps' };
  if (p.ironmanClears !== undefined && (!isStrArr(p.ironmanClears) || !p.ironmanClears.every((id) => knownIds.includes(id)))) return { ok: false, reason: 'corrupt', detail: 'ironmanClears' };
  return { ok: true, value: raw as ProfileV1 };
}
