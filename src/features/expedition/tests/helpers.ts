/**
 * 測試共用的小工具：建一輪、打一場、拿 matchId／三選一、開測試用的資料庫（fake-indexeddb）。
 * 拿不到東西時直接丟錯（讓測試失敗），不用強制轉型。
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { CHARACTER_IDS } from '../../../core/types';
import { nodeById } from '../content';
import { ExpeditionDb } from '../db';
import { applySettlement, beginMatch, newProfile, newRun, pickReward, type NewRunOpts, type SettleInfo, type Settled } from '../logic';
import type { ExpeditionRun, MatchResult, ProfileV1 } from '../types';

export const IDS: readonly string[] = CHARACTER_IDS;

/** 新的一輪；沒給的欄位用測試的預設值 */
export function mkRun(o: Partial<NewRunOpts> = {}): ExpeditionRun {
  return newRun({ runId: 'r', seed: 's', party: 'pikachu', now: 0, ...o });
}
export { newProfile };

export function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error('missing ' + what);
  return v;
}
export function mid(r: ExpeditionRun): string { return must(r.matchId, 'matchId'); }
export function offered(r: ExpeditionRun): string[] { return must(r.pendingReward, 'pendingReward').offeredCardIds; }
export function optionsOf(forkId: string): readonly string[] {
  const n = nodeById(forkId);
  if (!n || n.kind !== 'fork') throw new Error(forkId + ' is not a fork');
  return n.options;
}

/** 開打並結算一場（贏 5:0、輸 0:5） */
export function play(r: ExpeditionRun, p: ProfileV1, result: MatchResult, info: SettleInfo = {}): Settled {
  const a = beginMatch(r, r.revision);
  return applySettlement(a, p, mid(a), result, result === 'win' ? [5, 0] : [0, 5], info);
}

/** 一路往前走的小幫手：贏了有三選一就拿第一個 */
export class Walker {
  constructor(public r: ExpeditionRun, public p: ProfileV1 = newProfile()) {}
  win(info: SettleInfo = {}): Settled {
    const out = play(this.r, this.p, 'win', info);
    this.r = out.run; this.p = out.profile;
    if (this.r.phase === 'reward') this.r = pickReward(this.r, this.r.revision, offered(this.r)[0]);
    return out;
  }
  lose(info: SettleInfo = {}): Settled {
    const out = play(this.r, this.p, 'loss', info);
    this.r = out.run; this.p = out.profile;
    return out;
  }
}

// ---------- 資料庫 ----------

export async function freshDb(factory = new IDBFactory()): Promise<{ db: ExpeditionDb; factory: IDBFactory }> {
  return { db: await ExpeditionDb.open(factory, 'test', IDBKeyRange), factory };
}
export function reopen(factory: IDBFactory): Promise<ExpeditionDb> { return ExpeditionDb.open(factory, 'test', IDBKeyRange); }
export async function current(db: ExpeditionDb): Promise<ExpeditionRun> {
  const s = await db.load(IDS);
  if (s.kind !== 'ok' || !s.run) throw new Error('no run: ' + s.kind);
  return s.run;
}
export async function started(): Promise<{ db: ExpeditionDb; factory: IDBFactory; run: ExpeditionRun }> {
  const { db, factory } = await freshDb();
  const r0 = await db.createRun(newRun({ runId: 'run-1', seed: 'seed-1', party: 'pikachu', now: 1000 }), IDS);
  const run = await db.beginMatch(r0.revision, IDS);
  return { db, factory, run };
}
/** 繞過程式，直接改資料庫裡的檔（模擬壞檔、未來版本寫的檔） */
export function rawPut(factory: IDBFactory, store: string, value: unknown, key: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const r = factory.open('test');
    r.onsuccess = () => {
      const t = r.result.transaction(store, 'readwrite');
      t.objectStore(store).put(value, key);
      t.oncomplete = () => { r.result.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
    r.onerror = () => reject(r.error);
  });
}
