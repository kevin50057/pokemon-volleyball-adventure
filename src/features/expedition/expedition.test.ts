/**
 * 遠征存檔與規則的自動測試（PLAN M1 的通過條件）。`npm test` 執行；IndexedDB 用 fake-indexeddb。
 */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DbError, ExpeditionDb } from './db';
import { RuleError, applySettlement, beginMatch, newRun, validateRun } from './logic';
import { rngFor } from './rng';
import { START_HEARTS } from './content';
import type { ExpeditionRunV1 } from './types';

const IDS = ['pikachu', 'vaporeon', 'magikarp'];

async function freshDb(factory = new IDBFactory()): Promise<{ db: ExpeditionDb; factory: IDBFactory }> {
  return { db: await ExpeditionDb.open(factory, 'test'), factory };
}
async function reopen(factory: IDBFactory): Promise<ExpeditionDb> { return ExpeditionDb.open(factory, 'test'); }
async function current(db: ExpeditionDb): Promise<ExpeditionRunV1> {
  const s = await db.load(IDS);
  if (s.kind !== 'ok' || !s.run) throw new Error('no run: ' + s.kind);
  return s.run;
}
async function started(): Promise<{ db: ExpeditionDb; factory: IDBFactory; run: ExpeditionRunV1 }> {
  const { db, factory } = await freshDb();
  const r0 = await db.createRun(newRun('run-1', 'seed-1', 'pikachu', 1000), IDS);
  const run = await db.beginMatch(r0.revision, IDS);
  return { db, factory, run };
}

describe('rng', () => {
  it('is reproducible for the same seed, node and purpose', () => {
    const a = rngFor('abc', 'n1', 'cards'), b = rngFor('abc', 'n1', 'cards');
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });
  it('gives independent streams per purpose and node', () => {
    const seq = (n: string, p: 'cards' | 'capture') => { const r = rngFor('abc', n, p); return [r.next(), r.next(), r.next()]; };
    expect(seq('n1', 'cards')).not.toEqual(seq('n1', 'capture'));
    expect(seq('n1', 'cards')).not.toEqual(seq('n2', 'cards'));
  });
  it('stays in [0, 1)', () => {
    const r = rngFor('x', 'y', 'route');
    for (let i = 0; i < 1000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('rules', () => {
  it('begins a match once and keeps the same matchId when already active', () => {
    const r0 = newRun('r', 's', 'pikachu', 0);
    const r1 = beginMatch(r0, r0.revision);
    expect(r1.phase).toBe('active');
    expect(r1.matchId).toBe('m1-warmup#1');
    expect(beginMatch(r1, r1.revision)).toBe(r1);
  });
  it('rejects a stale revision', () => {
    const r0 = newRun('r', 's', 'pikachu', 0);
    expect(() => beginMatch(r0, r0.revision - 1)).toThrow(RuleError);
  });
  it('a loss costs one heart; the last heart ends the run', () => {
    let r = newRun('r', 's', 'pikachu', 0);
    for (let i = 0; i < START_HEARTS; i++) {
      r = beginMatch(r, r.revision);
      r = applySettlement(r, r.matchId as string, 'loss');
    }
    expect(r.hearts).toBe(0);
    expect(r.phase).toBe('failed');
    expect(r.losses).toBe(START_HEARTS);
  });
  it('a win on the last node clears the run', () => {
    let r = newRun('r', 's', 'pikachu', 0);
    r = beginMatch(r, r.revision);
    r = applySettlement(r, r.matchId as string, 'win');
    expect(r.phase).toBe('cleared');
    expect(r.visitedNodeIds).toEqual(['m1-warmup']);
    expect(r.hearts).toBe(START_HEARTS);
  });
  it('validation flags future versions as unsupported, broken shapes as corrupt', () => {
    const r = newRun('r', 's', 'pikachu', 0);
    expect(validateRun(r, IDS).ok).toBe(true);
    const fut = validateRun({ ...r, schemaVersion: 2 }, IDS);
    expect(!fut.ok && fut.reason).toBe('unsupported');
    const bad = validateRun({ ...r, hearts: 99 }, IDS);
    expect(!bad.ok && bad.reason).toBe('corrupt');
    const unknownChar = validateRun({ ...r, partyIds: ['missingno'] }, IDS);
    expect(!unknownChar.ok && unknownChar.reason).toBe('corrupt');
  });
});

describe('save file', () => {
  it('refresh then refresh: no extra heart lost, same matchId', async () => {
    const { db, factory, run } = await started();
    db.close();
    for (let i = 0; i < 2; i++) {
      const db2 = await reopen(factory);
      const cur = await current(db2);
      expect(cur.phase).toBe('active');
      expect(cur.hearts).toBe(START_HEARTS);
      // 回來重打：沿用同一場
      const again = await db2.beginMatch(cur.revision, IDS);
      expect(again.matchId).toBe(run.matchId);
      expect(again.revision).toBe(run.revision);
      db2.close();
    }
  });

  it('settling the same match twice applies it once', async () => {
    const { db, run } = await started();
    const a = await db.settle(run.matchId as string, 'loss', [2, 5], 1, IDS);
    const b = await db.settle(run.matchId as string, 'loss', [2, 5], 2, IDS);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.settlement.id).toBe(a.settlement.id);
    const cur = await current(db);
    expect(cur.hearts).toBe(START_HEARTS - 1);
    expect(cur.losses).toBe(1);
  });

  it('a crash in the middle of settling leaves the save exactly as before', async () => {
    const { db, factory, run } = await started();
    await expect(db.settle(run.matchId as string, 'loss', [0, 5], 1, IDS, { crashAfterRunPut: true })).rejects.toBeInstanceOf(DbError);
    db.close();
    const db2 = await reopen(factory);
    const cur = await current(db2);
    expect(cur).toEqual(run);
    const dump = await db2.exportAll();
    expect(dump.settlements).toEqual([]);
    // 重試可以正常結算一次
    const ok = await db2.settle(run.matchId as string, 'loss', [0, 5], 2, IDS);
    expect(ok.duplicate).toBe(false);
    expect((await current(db2)).hearts).toBe(START_HEARTS - 1);
  });

  it('a second tab with an old revision cannot overwrite', async () => {
    const { db, factory } = await freshDb();
    const r0 = await db.createRun(newRun('run-1', 'seed', 'pikachu', 0), IDS);
    const tabB = await reopen(factory);
    const seenByB = await current(tabB);
    await db.beginMatch(r0.revision, IDS);                   // 分頁 A 先開打
    await expect(tabB.beginMatch(seenByB.revision, IDS)).rejects.toBeInstanceOf(RuleError);
    await expect(tabB.discardRun(seenByB.revision, IDS)).rejects.toBeInstanceOf(RuleError);
    expect((await current(db)).phase).toBe('active');
  });

  it('a settlement for a match that is not the active one is rejected', async () => {
    const { db } = await started();
    await expect(db.settle('m1-warmup#99', 'win', [5, 0], 1, IDS)).rejects.toBeInstanceOf(RuleError);
  });

  it('will not start a new run over one in progress', async () => {
    const { db } = await started();
    await expect(db.createRun(newRun('run-2', 'seed', 'vaporeon', 0), IDS)).rejects.toBeInstanceOf(RuleError);
  });

  it('a corrupt run is reported, kept, and only moved aside on request', async () => {
    const { db, factory } = await freshDb();
    await db.createRun(newRun('run-1', 'seed', 'pikachu', 0), IDS);
    db.close();
    // 直接把存檔弄壞
    await new Promise<void>((resolve, reject) => {
      const r = factory.open('test');
      r.onsuccess = () => {
        const t = r.result.transaction('run', 'readwrite');
        t.objectStore('run').put({ schemaVersion: 1, runId: 'run-1', hearts: 'lots' }, 'current');
        t.oncomplete = () => { r.result.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
    });
    const db2 = await reopen(factory);
    const s = await db2.load(IDS);
    expect(s.kind).toBe('corrupt');
    // 壞檔還在，不能直接開新的一輪
    await expect(db2.createRun(newRun('run-2', 'seed', 'pikachu', 0), IDS)).rejects.toBeInstanceOf(RuleError);
    await db2.quarantineRun('test');
    const dump = await db2.exportAll();
    expect((dump.quarantine as { raw: unknown }[])[0].raw).toMatchObject({ hearts: 'lots' });
    expect((await db2.load(IDS)).kind).toBe('ok');
  });

  it('a future-version run is reported as unsupported and left untouched', async () => {
    const { db } = await freshDb();
    const r = newRun('run-1', 'seed', 'pikachu', 0);
    await db.createRun(r, IDS);
    // 模擬未來版本寫入的檔
    const dump0 = await db.exportAll();
    expect(dump0.run).toBeTruthy();
    const fut = { ...r, schemaVersion: 2 };
    await (db as unknown as { tx: (s: string[], m: IDBTransactionMode, f: (t: IDBTransaction) => Promise<void>) => Promise<void> })
      .tx(['run'], 'readwrite', async (t) => { t.objectStore('run').put(fut, 'current'); });
    const s = await db.load(IDS);
    expect(s.kind).toBe('unsupported');
    expect((await db.exportAll()).run).toEqual(fut);
  });

  it('a write that the browser refuses (quota) surfaces as a DbError and changes nothing', async () => {
    const { db, run } = await started();
    // 讓 settlements 的 add 丟出 QuotaExceededError
    const realTx = (db as unknown as { db: IDBDatabase }).db.transaction.bind((db as unknown as { db: IDBDatabase }).db);
    (db as unknown as { db: IDBDatabase }).db.transaction = ((stores: string[], mode: IDBTransactionMode) => {
      const t = realTx(stores, mode);
      const realStore = t.objectStore.bind(t);
      t.objectStore = (name: string) => {
        const s = realStore(name);
        if (name === 'settlements') s.add = () => { throw new DOMException('full', 'QuotaExceededError'); };
        return s;
      };
      return t;
    }) as IDBDatabase['transaction'];
    const err = await db.settle(run.matchId as string, 'win', [5, 1], 1, IDS).catch((e) => e);
    expect(err).toBeInstanceOf(DbError);
    expect((err as DbError).code).toBe('quota');
    (db as unknown as { db: IDBDatabase }).db.transaction = realTx;
    expect(await current(db)).toEqual(run);
  });
});
