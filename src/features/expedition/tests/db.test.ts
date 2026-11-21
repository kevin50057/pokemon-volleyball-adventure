/**
 * 存檔（IndexedDB，用 fake-indexeddb）：重整、重複結算、寫到一半當機、舊分頁、壞檔、未來版本、空間不足、章節重來、每日存檔位。
 */
import { IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AWAKEN_AT, START_HEARTS } from '../content';
import { DbError } from '../db';
import { RuleError, dailyPlan, newDailyRun, newRun } from '../logic';
import { IDS, current, freshDb, mid, must, rawPut, reopen, started } from './helpers';

afterEach(() => { vi.restoreAllMocks(); });

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
    const a = await db.settle(mid(run), 'loss', [2, 5], 1, IDS);
    const b = await db.settle(mid(run), 'loss', [2, 5], 2, IDS);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.goals).toEqual([]);
    expect(b.settlement.id).toBe(a.settlement.id);
    const cur = await current(db);
    expect(cur.hearts).toBe(START_HEARTS - 1);
    expect(cur.losses).toBe(1);
    expect(cur.pointDiff).toBe(-3);
  });
  it('a crash in the middle of settling leaves the save exactly as before', async () => {
    const { db, factory, run } = await started();
    await expect(db.settle(mid(run), 'loss', [0, 5], 1, IDS, {}, { crashAfterRunPut: true })).rejects.toBeInstanceOf(DbError);
    db.close();
    const db2 = await reopen(factory);
    expect(await current(db2)).toEqual(run);
    expect((await db2.exportAll()).settlements).toEqual([]);
    // 重試可以正常結算一次
    const ok = await db2.settle(mid(run), 'loss', [0, 5], 2, IDS);
    expect(ok.duplicate).toBe(false);
    expect((await current(db2)).hearts).toBe(START_HEARTS - 1);
  });
  it('a second tab with an old revision cannot overwrite', async () => {
    const { db, factory } = await freshDb();
    const r0 = await db.createRun(newRun({ runId: 'run-1', seed: 'seed', party: 'pikachu', now: 0 }), IDS);
    const tabB = await reopen(factory);
    const seenByB = await current(tabB);
    await db.beginMatch(r0.revision, IDS);                   // 分頁 A 先開打
    await expect(tabB.beginMatch(seenByB.revision, IDS)).rejects.toBeInstanceOf(RuleError);
    await expect(tabB.discardRun(seenByB.revision, IDS)).rejects.toBeInstanceOf(RuleError);
    expect((await current(db)).phase).toBe('active');
  });
  it('a settlement for a match that is not the active one is rejected', async () => {
    const { db } = await started();
    await expect(db.settle('warmup#99', 'win', [5, 0], 1, IDS)).rejects.toBeInstanceOf(RuleError);
  });
  it('will not start a new run over one in progress', async () => {
    const { db } = await started();
    await expect(db.createRun(newRun({ runId: 'run-2', seed: 'seed', party: 'vaporeon', now: 0 }), IDS)).rejects.toBeInstanceOf(RuleError);
  });
  it('a corrupt run is reported, kept, and only moved aside on request', async () => {
    const { db, factory } = await freshDb();
    await db.createRun(newRun({ runId: 'run-1', seed: 'seed', party: 'pikachu', now: 0 }), IDS);
    db.close();
    await rawPut(factory, 'run', { schemaVersion: 3, runId: 'run-1', hearts: 'lots' }, 'current');
    const db2 = await reopen(factory);
    expect((await db2.load(IDS)).kind).toBe('corrupt');
    // 壞檔還在，不能直接開新的一輪
    await expect(db2.createRun(newRun({ runId: 'run-2', seed: 'seed', party: 'pikachu', now: 0 }), IDS)).rejects.toBeInstanceOf(RuleError);
    await db2.quarantineRun('test');
    const dump = await db2.exportAll();
    expect(dump.quarantine).toEqual([expect.objectContaining({ raw: expect.objectContaining({ hearts: 'lots' }) })]);
    expect((await db2.load(IDS)).kind).toBe('ok');
  });
  it('a future-version run is reported as unsupported and left untouched', async () => {
    const { db, factory } = await freshDb();
    const r = newRun({ runId: 'run-1', seed: 'seed', party: 'pikachu', now: 0 });
    await db.createRun(r, IDS);
    const fut = { ...r, schemaVersion: 99 };
    await rawPut(factory, 'run', fut, 'current');
    expect((await db.load(IDS)).kind).toBe('unsupported');
    expect((await db.exportAll()).run).toEqual(fut);
  });
  it('a write that the browser refuses (quota) surfaces as a DbError and changes nothing', async () => {
    const { db, run } = await started();
    // 結算要寫的時候被瀏覽器拒絕
    const add = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const err: unknown = await db.settle(mid(run), 'win', [5, 1], 1, IDS).catch((e: unknown) => e);
    expect(add).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(DbError);
    expect(err instanceof DbError && err.code).toBe('quota');
    expect(await current(db)).toEqual(run);
  });
});

describe('save file: rewards and captures', () => {
  it('capture, reward offer and settlement are written together; picking is recorded once', async () => {
    const { db, run } = await started();
    const out = await db.settle(mid(run), 'win', [5, 2], 1, IDS);
    expect(out.run.phase).toBe('reward');
    expect(out.settlement.capture).toMatchObject({ char: 'magikarp', ok: true });
    expect(out.profile.expeditionUnlocked).toEqual(['magikarp']);
    const loaded = await db.load(IDS);
    expect(loaded.kind === 'ok' && loaded.profile.expeditionUnlocked).toEqual(['magikarp']);
    const card = must(out.settlement.offered, 'offer')[1];
    const picked = await db.pickReward(out.run.revision, card, IDS);
    expect(picked.ownedCardIds).toEqual([card]);
    expect(picked.equippedCardIds).toEqual([card]);
    await expect(db.pickReward(out.run.revision, card, IDS)).rejects.toBeInstanceOf(RuleError);   // 舊 revision
    await expect(db.pickReward(picked.revision, card, IDS)).rejects.toBeInstanceOf(RuleError);    // 已經選過
    const log = await db.settlementsOf('run-1');
    expect(log.length).toBe(1);
    expect(await db.settlementsOf('run-')).toEqual([]);          // 只讀這一輪的（id 前綴要完全對上）
    expect(log[0].picked).toBe(card);
  });
  it('a crash while settling a win leaves no capture and no reward behind', async () => {
    const { db, factory, run } = await started();
    await expect(db.settle(mid(run), 'win', [5, 0], 1, IDS, {}, { crashAfterRunPut: true })).rejects.toBeInstanceOf(DbError);
    db.close();
    const db2 = await reopen(factory);
    const s = await db2.load(IDS);
    expect(s.kind === 'ok' && s.run).toEqual(run);
    expect(s.kind === 'ok' && s.profile.expeditionUnlocked).toEqual([]);
    // 重試：同一個種子，得到同樣的三選一
    const a = await db2.settle(mid(run), 'win', [5, 0], 2, IDS);
    const again = await db2.settle(mid(run), 'win', [5, 0], 3, IDS);
    expect(again.duplicate).toBe(true);
    expect(again.settlement.offered).toEqual(a.settlement.offered);
    expect((await current(db2)).pendingReward).toEqual({ settlementId: a.settlement.id, offeredCardIds: a.settlement.offered });
  });
  it('branch, supply and partner changes from a stale tab are rejected', async () => {
    const { db, factory, run } = await started();
    const won = await db.settle(mid(run), 'win', [5, 0], 1, IDS);
    const r1 = await db.pickReward(won.run.revision, null, IDS);
    const tabB = await reopen(factory);
    const r2 = await db.chooseBranch(r1.revision, 'f1a', IDS);
    await expect(tabB.chooseBranch(r1.revision, 'f1b', IDS)).rejects.toBeInstanceOf(RuleError);
    await expect(tabB.setLead(r1.revision, 'magikarp', IDS)).rejects.toBeInstanceOf(RuleError);
    expect((await current(tabB)).nodeId).toBe('f1a');
    expect(r2.attemptNo).toBe(0);
  });
});

describe('save file: chapters and goals', () => {
  it('the chapter restart is written with the settlement and survives a reload', async () => {
    const { db, factory } = await freshDb();
    await db.createRun(newRun({ runId: 'run-1', seed: 'seed-1', party: 'pikachu', now: 0 }), IDS);
    let restarted = false;
    for (let i = 0; i < START_HEARTS; i++) {
      const cur = await current(db);
      const r = await db.beginMatch(cur.revision, IDS);
      restarted = !!(await db.settle(mid(r), 'loss', [0, 5], i, IDS)).settlement.chapterRestart;
    }
    expect(restarted).toBe(true);
    db.close();
    const db2 = await reopen(factory);
    const r2 = await current(db2);
    expect(r2.nodeId).toBe('warmup');
    expect(r2.hearts).toBe(START_HEARTS);
    expect(r2.chapterRetries).toBe(1);
    expect((await db2.settlementsOf('run-1')).map((x) => x.matchId)).toEqual(['warmup#1', 'warmup#2', 'warmup#3']);
    // 重來之後是新的一場（attemptNo 從頭），不會跟之前的結算撞號
    const again = await db2.beginMatch(r2.revision, IDS);
    expect(again.matchId).toBe('warmup#1~r1');
    const won = await db2.settle(mid(again), 'win', [5, 0], 9, IDS);
    expect(won.duplicate).toBe(false);
    expect(won.run.nodeId).toBe('fork1');
  });
  it('reports new handbook goals once, together with the settlement', async () => {
    const { db } = await freshDb();
    await db.createRun({ ...newRun({ runId: 'run-1', seed: 'seed', party: 'jolteon', now: 0 }), chapter: 2, nodeId: 'mewtwo' }, IDS);
    const r = await db.beginMatch((await current(db)).revision, IDS);
    const out = await db.settle(mid(r), 'win', [9, 3], 1, IDS);
    expect(out.run.phase).toBe('cleared');
    expect(out.goals).toEqual(expect.arrayContaining(['firstClear', 'mewtwo']));
    const s = await db.load(IDS);
    expect(s.kind === 'ok' && s.profile.cardPool).toEqual(['expShare']);
  });
});

describe('save file: awakening outside a match', () => {
  it('an awakening from a reward fill is recorded in the dex right away', async () => {
    const { db } = await freshDb();
    const base = newRun({ runId: 'run-1', seed: 'seed', party: 'pikachu', now: 0 });
    await db.createRun({ ...base, bond: { pikachu: AWAKEN_AT - 1 }, phase: 'reward', pendingReward: { settlementId: 'x', offeredCardIds: ['@bond'] } }, IDS);
    const r = await db.pickReward(base.revision, '@bond', IDS);
    expect(r.awakened).toEqual(['pikachu']);
    const s = await db.load(IDS);
    expect(s.kind === 'ok' && s.profile.awakenedSeen).toEqual(['pikachu']);
    expect(s.kind === 'ok' && s.profile.goals && s.profile.goals.awaken1).toBe(1);
  });
});

describe('save file: daily slot', () => {
  it('keeps the daily run apart from the main run', async () => {
    const { db } = await freshDb();
    const daily = db.forSlot('daily');
    expect(daily.slot).toBe('daily');
    await db.createRun(newRun({ runId: 'main', seed: 'm', party: 'pikachu', now: 0 }), IDS);
    const plan = dailyPlan('2026-11-21');
    await daily.createRun(newDailyRun(plan, plan.partners[0], 0, 'day'), IDS);
    expect((await current(db)).runId).toBe('main');
    expect((await current(daily)).runId).toBe('day');
    // 每日的輸贏寫在每日的存檔位，主線不受影響
    const r = await daily.beginMatch((await current(daily)).revision, IDS);
    await daily.settle(mid(r), 'loss', [1, 5], 1, IDS);
    expect((await current(daily)).hearts).toBe(START_HEARTS - 1);
    expect((await current(db)).hearts).toBe(START_HEARTS);
    // 打到一半放棄每日那一輪：今天算打完了（沒過），再開只是練習
    const d2 = await current(daily);
    await daily.discardRun(d2.revision, IDS);
    const s = await db.load(IDS);
    expect(s.kind === 'ok' && s.profile.daily && s.profile.daily.history).toEqual([{ date: '2026-11-21', score: -4, cleared: false }]);
    await daily.createRun(newDailyRun(plan, plan.partners[0], 0, 'day2'), IDS);
    const dump = await db.exportAll();
    expect(dump.daily).toBeTruthy();
    expect(dump.run).toBeTruthy();
  });
});
