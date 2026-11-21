/**
 * 遠征存檔（SPEC §5.1、§5.3）：獨立的 IndexedDB，跟 localStorage 的既有存檔完全分開。
 *
 *  - 每個變更都在一個 readwrite transaction 裡完成：讀 → 檢查 revision → 寫。中途失敗整筆不生效。
 *  - profile、run、settlement 一起寫在同一個 transaction。
 *  - 讀到壞檔或不支援的版本：保留原檔、回報狀態，不會自動重設；要開新的一輪，舊檔先搬進 quarantine。
 *  - 寫不進去（容量、權限）丟出 DbError，由畫面顯示，不假裝已存。
 */
import {
  RuleError, applySettlement, beginMatch as ruleBegin, chooseBranch as ruleBranch, leaveSupply as ruleSupply,
  makeSettlement, newProfile, noteAwakened, recordDaily, refreshGoals, type SettleInfo, pickReward as rulePick, resolveEvent as ruleEvent, swapIn as ruleSwap, setLead as ruleLead, settlementIdOf, validateProfile, validateRun,
} from './logic';
import type { EventChoice } from './content';
import type { ExpeditionRun, MatchResult, ProfileV1, SaveSlot, SettlementV1 } from './types';

export const DB_NAME = 'pva-expedition';
const DB_VERSION = 1;
const S_PROFILE = 'profile', S_RUN = 'run', S_SETTLE = 'settlements', S_QUAR = 'quarantine';
/** profile 只有一份；run 依存檔位（主線、每日遠征）各存一份 */
const PROFILE_KEY = 'current';

export type DbErrorCode = 'unavailable' | 'quota' | 'version' | 'blocked' | 'aborted' | 'unknown';
export class DbError extends Error {
  constructor(public code: DbErrorCode, message: string, public cause?: unknown) { super(message); }
}

function toDbError(e: unknown): DbError | RuleError {
  if (e instanceof DbError || e instanceof RuleError) return e;
  const name = (e as { name?: string } | null)?.name || '';
  const msg = (e as { message?: string } | null)?.message || String(e);
  if (name === 'QuotaExceededError') return new DbError('quota', msg, e);
  if (name === 'VersionError') return new DbError('version', msg, e);
  if (name === 'AbortError') return new DbError('aborted', msg, e);
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError') return new DbError('unavailable', msg, e);
  return new DbError('unknown', msg, e);
}

/** IndexedDB 的請求。讀出來的東西一律當成 unknown，用之前要經過檢查（validate*、isSettlement） */
function req(r: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => { const v: unknown = r.result; resolve(v); };
    r.onerror = () => reject(r.error);
  });
}
/** 存檔裡的結算紀錄（自己寫進去的；這裡只確認形狀，壞掉的就當作沒有） */
function isSettlement(v: unknown): v is SettlementV1 {
  if (!v || typeof v !== 'object') return false;
  const o: { [k: string]: unknown } = { ...v };
  return typeof o.id === 'string' && typeof o.runId === 'string' && typeof o.matchId === 'string' && typeof o.nodeId === 'string'
    && (o.result === 'win' || o.result === 'loss' || o.result === 'forfeit') && Array.isArray(o.scores) && typeof o.revision === 'number';
}

export type LoadState =
  | { kind: 'ok'; profile: ProfileV1; run: ExpeditionRun | null }
  | { kind: 'unsupported' | 'corrupt'; what: 'run' | 'profile'; detail: string; raw: unknown };

/** 測試用：在結算寫到一半時模擬當機 */
export interface TestFaults { crashAfterRunPut?: boolean }

export class ExpeditionDb {
  private constructor(private db: IDBDatabase, private key: SaveSlot = 'current') {}

  /** 同一個資料庫、另一個存檔位（每日遠征用 'daily'） */
  forSlot(slot: SaveSlot): ExpeditionDb { return new ExpeditionDb(this.db, slot); }
  get slot(): SaveSlot { return this.key; }

  static open(factory: IDBFactory | undefined = typeof indexedDB !== 'undefined' ? indexedDB : undefined, name = DB_NAME): Promise<ExpeditionDb> {
    return new Promise((resolve, reject) => {
      if (!factory) { reject(new DbError('unavailable', 'IndexedDB is not available')); return; }
      let r: IDBOpenDBRequest;
      try { r = factory.open(name, DB_VERSION); } catch (e) { reject(toDbError(e)); return; }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(S_PROFILE)) db.createObjectStore(S_PROFILE);
        if (!db.objectStoreNames.contains(S_RUN)) db.createObjectStore(S_RUN);
        if (!db.objectStoreNames.contains(S_SETTLE)) db.createObjectStore(S_SETTLE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(S_QUAR)) db.createObjectStore(S_QUAR, { autoIncrement: true });
      };
      r.onblocked = () => reject(new DbError('blocked', 'another tab is holding an older version of the database'));
      r.onerror = () => reject(toDbError(r.error));
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => db.close();   // 新版在另一個分頁打開：讓位
        resolve(new ExpeditionDb(db));
      };
    });
  }

  close(): void { this.db.close(); }

  /** 一個 readwrite（或 readonly）transaction；fn 回傳的值在 transaction 完整提交後才 resolve。 */
  private tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let t: IDBTransaction;
      try { t = this.db.transaction(stores, mode); } catch (e) { reject(toDbError(e)); return; }
      let value: T, failed: unknown = null;
      t.oncomplete = () => { if (failed) reject(toDbError(failed)); else resolve(value); };
      t.onabort = () => reject(toDbError(failed || t.error || new DbError('aborted', 'transaction aborted')));
      t.onerror = (ev) => { ev.preventDefault(); };   // 交給 onabort 統一處理
      fn(t).then((v) => { value = v; }, (e) => { failed = e; try { t.abort(); } catch { /* 已經結束 */ } });
    });
  }

  async load(knownIds: readonly string[]): Promise<LoadState> {
    return this.tx([S_PROFILE, S_RUN], 'readonly', async (t): Promise<LoadState> => {
      const rawP = await req(t.objectStore(S_PROFILE).get(PROFILE_KEY));
      const rawR = await req(t.objectStore(S_RUN).get(this.key));
      let profile = newProfile();
      if (rawP !== undefined) {
        const p = validateProfile(rawP, knownIds);
        if (!p.ok) return { kind: p.reason, what: 'profile', detail: p.detail, raw: rawP };
        profile = p.value;
      }
      if (rawR === undefined) return { kind: 'ok', profile, run: null };
      const r = validateRun(rawR, knownIds);
      if (!r.ok) return { kind: r.reason, what: 'run', detail: r.detail, raw: rawR };
      return { kind: 'ok', profile, run: r.value };
    });
  }

  /** 開新的一輪。已經有一輪還沒結束（不是 cleared／failed）就拒絕。 */
  async createRun(run: ExpeditionRun, knownIds: readonly string[]): Promise<ExpeditionRun> {
    return this.tx([S_PROFILE, S_RUN], 'readwrite', async (t) => {
      const rs = t.objectStore(S_RUN), ps = t.objectStore(S_PROFILE);
      const old = await req(rs.get(this.key));
      if (old !== undefined) {
        const v = validateRun(old, knownIds);
        if (!v.ok) throw new RuleError('invalid', 'existing run is ' + v.reason + '; quarantine it first');
        if (v.value.phase !== 'cleared' && v.value.phase !== 'failed') throw new RuleError('phase', 'a run is still in progress');
      }
      if ((await req(ps.get(PROFILE_KEY))) === undefined) await req(ps.put(newProfile(), PROFILE_KEY));
      await req(rs.put(run, this.key));
      return run;
    });
  }

  /** 入場前呼叫：把 matchId 寫進存檔（重整後回來是同一個 matchId）。 */
  async beginMatch(rev: number, knownIds: readonly string[]): Promise<ExpeditionRun> {
    return this.tx([S_RUN], 'readwrite', async (t) => {
      const rs = t.objectStore(S_RUN);
      const run = this.must(await req(rs.get(this.key)), knownIds);
      const next = ruleBegin(run, rev);
      if (next !== run) await req(rs.put(next, this.key));
      return next;
    });
  }

  /**
   * 結算一場。同一個 matchId 已經結算過就直接回傳那一筆（duplicate: true），不再改任何東西。
   * profile、run、settlement 在同一個 transaction 裡寫。
   */
  async settle(matchId: string, result: MatchResult, scores: [number, number], now: number, knownIds: readonly string[], info: SettleInfo = {}, faults: TestFaults = {}): Promise<{ run: ExpeditionRun; profile: ProfileV1; settlement: SettlementV1; duplicate: boolean; goals: string[] }> {
    return this.tx([S_PROFILE, S_RUN, S_SETTLE], 'readwrite', async (t) => {
      const rs = t.objectStore(S_RUN), ss = t.objectStore(S_SETTLE), ps = t.objectStore(S_PROFILE);
      const run = this.must(await req(rs.get(this.key)), knownIds);
      const profile = this.mustProfile(await req(ps.get(PROFILE_KEY)), knownIds);
      const sid = settlementIdOf(run.runId, matchId);
      const done = await req(ss.get(sid));
      if (isSettlement(done)) return { run, profile, settlement: done, duplicate: true, goals: [] };
      const after = applySettlement(run, profile, matchId, result, scores, info);
      const st = makeSettlement(run, after, matchId, result, scores, now);
      await req(rs.put(after.run, this.key));
      if (faults.crashAfterRunPut) throw new DbError('aborted', 'simulated crash after run write');
      if (after.profile !== profile) await req(ps.put(after.profile, PROFILE_KEY));
      // 用 put：同一個 id 留著一筆讀不懂的壞紀錄時，用這一筆蓋掉（讀得懂的重複結算在上面就擋掉了）
      await req(ss.put(st));
      return { run: after.run, profile: after.profile, settlement: st, duplicate: false, goals: after.goals };
    });
  }

  /** 只改 run 的變更（選路、換夥伴、離開補給站）：讀 → 規則檢查 revision → 寫 */
  private change(knownIds: readonly string[], fn: (run: ExpeditionRun) => ExpeditionRun): Promise<ExpeditionRun> {
    return this.tx([S_RUN], 'readwrite', async (t) => {
      const rs = t.objectStore(S_RUN);
      const run = this.must(await req(rs.get(this.key)), knownIds);
      const next = fn(run);
      if (next !== run) await req(rs.put(next, this.key));
      return next;
    });
  }
  /** 會讀 profile 的變更（夢幻的門、卡池）：profile 和 run 在同一個 transaction 裡讀；有人覺醒就記進圖鑑 */
  private changeWithProfile(knownIds: readonly string[], fn: (run: ExpeditionRun, profile: ProfileV1) => ExpeditionRun): Promise<ExpeditionRun> {
    return this.tx([S_RUN, S_PROFILE], 'readwrite', async (t) => {
      const rs = t.objectStore(S_RUN);
      const run = this.must(await req(rs.get(this.key)), knownIds);
      const ps = t.objectStore(S_PROFILE);
      const profile = this.mustProfile(await req(ps.get(PROFILE_KEY)), knownIds);
      const next = fn(run, profile);
      if (next !== run) await req(rs.put(next, this.key));
      const seen = noteAwakened(profile, next);
      if (seen) await req(ps.put(seen.profile, PROFILE_KEY));
      return next;
    });
  }
  chooseBranch(rev: number, option: string, knownIds: readonly string[]): Promise<ExpeditionRun> { return this.changeWithProfile(knownIds, (r, p) => ruleBranch(r, rev, option, p)); }
  leaveSupply(rev: number, equipped: readonly string[], knownIds: readonly string[]): Promise<ExpeditionRun> { return this.change(knownIds, (r) => ruleSupply(r, rev, equipped)); }
  setLead(rev: number, charId: string, knownIds: readonly string[]): Promise<ExpeditionRun> { return this.change(knownIds, (r) => ruleLead(r, rev, charId)); }
  swapIn(rev: number, benchId: string, out: string | null, knownIds: readonly string[]): Promise<ExpeditionRun> { return this.change(knownIds, (r) => ruleSwap(r, rev, benchId, out)); }
  resolveEvent(rev: number, choice: EventChoice, knownIds: readonly string[], arg?: string): Promise<ExpeditionRun> { return this.changeWithProfile(knownIds, (r, p) => ruleEvent(r, rev, choice, arg, p.cardPool || [])); }

  /** 三選一：選卡（或略過）和結算紀錄上的 picked 在同一個 transaction 裡寫 */
  async pickReward(rev: number, cardId: string | null, knownIds: readonly string[]): Promise<ExpeditionRun> {
    return this.tx([S_RUN, S_SETTLE, S_PROFILE], 'readwrite', async (t) => {
      const rs = t.objectStore(S_RUN), ss = t.objectStore(S_SETTLE), ps = t.objectStore(S_PROFILE);
      const run = this.must(await req(rs.get(this.key)), knownIds);
      const next = rulePick(run, rev, cardId);
      // 補位的「親密度 +1」讓誰覺醒了：記進圖鑑（看過覺醒）
      const profile = this.mustProfile(await req(ps.get(PROFILE_KEY)), knownIds), seen = noteAwakened(profile, next);
      if (seen) await req(ps.put(seen.profile, PROFILE_KEY));
      const sid = run.pendingReward ? run.pendingReward.settlementId : '';
      const st = sid ? await req(ss.get(sid)) : undefined;
      await req(rs.put(next, this.key));
      if (isSettlement(st)) await req(ss.put({ ...st, picked: cardId }));
      return next;
    });
  }

  /** 這一輪的結算紀錄，依時間排（日誌用） */
  async settlementsOf(runId: string): Promise<SettlementV1[]> {
    return this.tx([S_SETTLE], 'readonly', async (t) => {
      const raw = await req(t.objectStore(S_SETTLE).getAll());
      const all = Array.isArray(raw) ? raw.filter(isSettlement) : [];
      return all.filter((s) => s.runId === runId).sort((a, b) => a.revision - b.revision);
    });
  }

  /** 壞檔或不支援的 run：原封不動搬進 quarantine（之後可匯出），再清掉目前的 run。 */
  async quarantineRun(note: string): Promise<void> {
    return this.tx([S_RUN, S_QUAR], 'readwrite', async (t) => {
      const raw = await req(t.objectStore(S_RUN).get(this.key));
      if (raw !== undefined) await req(t.objectStore(S_QUAR).add({ at: Date.now(), note, raw }));
      await req(t.objectStore(S_RUN).delete(this.key));
    });
  }

  /** 放棄整輪（玩家確認過）。結算紀錄留著。 */
  async discardRun(rev: number, knownIds: readonly string[]): Promise<void> {
    return this.tx([S_RUN, S_PROFILE], 'readwrite', async (t) => {
      const rs = t.objectStore(S_RUN), ps = t.objectStore(S_PROFILE);
      const run = this.must(await req(rs.get(this.key)), knownIds);
      if (run.revision !== rev) throw new RuleError('stale', 'run changed in another tab');
      // 每日遠征打到一半放棄：也算今天打完了（沒過），不然可以一直放棄重來、打到滿意才計分
      if (run.daily && run.phase !== 'cleared' && run.phase !== 'failed') {
        const profile = this.mustProfile(await req(ps.get(PROFILE_KEY)), knownIds), after = recordDaily(profile, run);
        if (after !== profile) await req(ps.put(refreshGoals(after).profile, PROFILE_KEY));
      }
      await req(rs.delete(this.key));
    });
  }

  /** 全部原始資料（匯出、診斷用）。 */
  async exportAll(): Promise<Record<string, unknown>> {
    return this.tx([S_PROFILE, S_RUN, S_SETTLE, S_QUAR], 'readonly', async (t) => ({
      profile: await req(t.objectStore(S_PROFILE).get(PROFILE_KEY)),
      run: await req(t.objectStore(S_RUN).get('current')),
      daily: await req(t.objectStore(S_RUN).get('daily')),
      settlements: await req(t.objectStore(S_SETTLE).getAll()),
      quarantine: await req(t.objectStore(S_QUAR).getAll()),
    }));
  }

  private mustProfile(raw: unknown, knownIds: readonly string[]): ProfileV1 {
    if (raw === undefined) return newProfile();
    const v = validateProfile(raw, knownIds);
    if (!v.ok) throw new RuleError('invalid', 'profile is ' + v.reason + ': ' + v.detail);
    return v.value;
  }

  private must(raw: unknown, knownIds: readonly string[]): ExpeditionRun {
    if (raw === undefined) throw new RuleError('phase', 'no run');
    const v = validateRun(raw, knownIds);
    if (!v.ok) throw new RuleError('invalid', 'run is ' + v.reason + ': ' + v.detail);
    return v.value;
  }
}
