/**
 * 遠征存檔與規則的自動測試（PLAN M1 的通過條件）。`npm test` 執行；IndexedDB 用 fake-indexeddb。
 */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DbError, ExpeditionDb } from './db';
import { activeBonds, capped, cardMods, offerCards } from './cards';
import { CARDS, CHAR_TAG, DEX_NODE, NODES, STOPS, cardById, matchNode, nodeById } from './content';
import { RuleError, applySettlement, beginMatch, chooseBranch, leaveSupply, newProfile, newRun, pickReward, setLead, validateRun } from './logic';
import { rngFor } from './rng';
import { START_HEARTS } from './content';
import type { ExpeditionRunV1 } from './types';

const IDS = ['pikachu', 'vaporeon', 'jolteon', 'magikarp', 'psyduck', 'meowth', 'farfetchd', 'dragonite'];

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
    expect(r1.matchId).toBe('warmup#1');
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
      r = applySettlement(r, newProfile(), r.matchId as string, 'loss').run;
    }
    expect(r.hearts).toBe(0);
    expect(r.phase).toBe('failed');
    expect(r.losses).toBe(START_HEARTS);
  });
  it('a full winning route: warm-up, fork, branch, supply, elite, boss', () => {
    let r = newRun('r', 's', ['pikachu', 'vaporeon'], 0), p = newProfile();
    const win = (): void => {
      r = beginMatch(r, r.revision);
      const out = applySettlement(r, p, r.matchId as string, 'win');
      r = out.run; p = out.profile;
      if (r.phase === 'reward') r = pickReward(r, r.revision, (r.pendingReward as { offeredCardIds: string[] }).offeredCardIds[0]);
    };
    win();
    expect(r.nodeId).toBe('fork');
    expect(() => beginMatch(r, r.revision)).toThrow(RuleError);          // 岔路不能直接開打
    expect(() => chooseBranch(r, r.revision, 'boss')).toThrow(RuleError);
    r = chooseBranch(r, r.revision, 'gold');
    win();
    expect(r.nodeId).toBe('supply');
    r = leaveSupply(r, r.revision, r.equippedCardIds);
    expect(r.nodeId).toBe('elite');
    win(); win();
    expect(r.phase).toBe('cleared');
    expect(r.visitedNodeIds).toEqual(['warmup', 'gold', 'supply', 'elite', 'boss']);
    expect(r.ownedCardIds.length).toBe(3);
    expect(r.equippedCardIds.length).toBe(2);
    expect(r.hearts).toBe(START_HEARTS);
    expect(p.expeditionUnlocked).toEqual(expect.arrayContaining(['magikarp', 'farfetchd', 'dragonite']));
  });
  it('a sure capture joins the party when there is room, and is only recorded when full', () => {
    let r = beginMatch(newRun('r', 's', 'pikachu', 0), 1);
    let out = applySettlement(r, newProfile(), r.matchId as string, 'win');
    expect(out.capture).toEqual({ char: 'magikarp', ok: true, sure: true, joined: true });
    expect(out.run.partyIds).toEqual(['pikachu', 'magikarp']);
    r = beginMatch(newRun('r', 's', ['pikachu', 'vaporeon'], 0), 1);
    out = applySettlement(r, newProfile(), r.matchId as string, 'win');
    expect(out.capture && out.capture.joined).toBe(false);
    expect(out.run.partyIds).toEqual(['pikachu', 'vaporeon']);
    expect(out.profile.expeditionUnlocked).toEqual(['magikarp']);
    // 已經收服過：不會再收一次
    r = beginMatch(newRun('r2', 's', 'pikachu', 0), 1);
    expect(applySettlement(r, out.profile, r.matchId as string, 'win').capture).toBeUndefined();
  });
  it('a chance capture is fixed by the seed, and a miss guarantees the next one', () => {
    const at = (seed: string, profile = newProfile()) => {
      let r = newRun('r', seed, 'pikachu', 0);
      r = { ...r, nodeId: 'puddle' };
      r = beginMatch(r, r.revision);
      return applySettlement(r, profile, r.matchId as string, 'win');
    };
    let hit = 0, missSeed = '';
    for (let i = 0; i < 400; i++) {
      const a = at('seed' + i), b = at('seed' + i);
      expect(a.capture).toEqual(b.capture);                              // 同一個種子，重來幾次都一樣
      if (a.capture && a.capture.ok) hit++; else missSeed = 'seed' + i;
    }
    expect(hit).toBeGreaterThan(400 * 0.5);
    expect(hit).toBeLessThan(400 * 0.7);
    const miss = at(missSeed);
    expect(miss.profile.captureMissesByCharacter.psyduck).toBe(1);
    expect(miss.profile.expeditionUnlocked).toEqual([]);
    const next = at(missSeed, miss.profile);                             // 同一個「不中」的種子，這次保底
    expect(next.capture).toMatchObject({ ok: true, sure: true });
    expect(next.profile.captureMissesByCharacter.psyduck).toBeUndefined();
  });
  it('rewards: three distinct unowned cards, same seed gives the same offer, and reward blocks the map', () => {
    let r = beginMatch(newRun('r', 's', 'pikachu', 0), 1);
    const a = applySettlement(r, newProfile(), r.matchId as string, 'win'), b = applySettlement(r, newProfile(), r.matchId as string, 'win');
    expect(a.offered).toEqual(b.offered);
    expect(new Set(a.offered).size).toBe(3);
    r = a.run;
    expect(r.phase).toBe('reward');
    expect(() => beginMatch(r, r.revision)).toThrow(RuleError);
    expect(() => chooseBranch(r, r.revision, 'gold')).toThrow(RuleError);
    expect(() => pickReward(r, r.revision, 'not-a-card')).toThrow(RuleError);
    const skipped = pickReward(r, r.revision, null);
    expect(skipped.phase).toBe('map');
    expect(skipped.ownedCardIds).toEqual([]);
    expect(() => pickReward(skipped, skipped.revision, (a.offered as string[])[0])).toThrow(RuleError);   // 不能再選一次
    // 牌池不夠就少給，沒有就不進 reward
    const rng = { next: () => 0, int: () => 0, pick: <T>(x: readonly T[]) => x[0] };
    expect(offerCards(CARDS.slice(0, 4).map((c) => c.id), rng).length).toBe(2);
    expect(offerCards(CARDS.map((c) => c.id), rng)).toEqual([]);
  });
  it('supply: loadout must be owned cards, at most two; switching the lead reorders the party', () => {
    let r = newRun('r', 's', ['pikachu', 'vaporeon'], 0);
    r = { ...r, nodeId: 'supply', ownedCardIds: ['quickShoes', 'stance', 'windup'], equippedCardIds: ['quickShoes', 'stance'] };
    expect(() => leaveSupply(r, r.revision, ['quickShoes', 'stance', 'windup'])).toThrow(RuleError);
    expect(() => leaveSupply(r, r.revision, ['galeForce'])).toThrow(RuleError);
    expect(() => leaveSupply(r, r.revision, ['stance', 'stance'])).toThrow(RuleError);
    const sw = setLead(r, r.revision, 'vaporeon');
    expect(sw.partyIds).toEqual(['vaporeon', 'pikachu']);
    expect(() => setLead(r, r.revision, 'magikarp')).toThrow(RuleError);
    const out = leaveSupply(sw, sw.revision, ['windup']);
    expect(out.equippedCardIds).toEqual(['windup']);
    expect(out.nodeId).toBe('elite');
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
    const unknownCard = validateRun({ ...r, ownedCardIds: ['nope'] }, IDS);
    expect(!unknownCard.ok && unknownCard.reason).toBe('corrupt');
    const notOwned = validateRun({ ...r, equippedCardIds: ['stance'] }, IDS);
    expect(!notOwned.ok && notOwned.reason).toBe('corrupt');
    const oldContent = validateRun({ ...r, contentVersion: 'm1-1' }, IDS);
    expect(!oldContent.ok && oldContent.reason).toBe('unsupported');
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
    await expect(db.settle('warmup#99', 'win', [5, 0], 1, IDS)).rejects.toBeInstanceOf(RuleError);
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

describe('cards and bonds', () => {
  it('content only refers to things that exist', () => {
    NODES.forEach((n) => {
      if (n.kind === 'match') { expect(IDS).toContain(n.opp); if (n.next) expect(nodeById(n.next)).toBeTruthy(); }
      if (n.kind === 'fork') n.options.forEach((o) => expect(matchNode(o)).toBeTruthy());
      if (n.kind === 'supply') expect(nodeById(n.next)).toBeTruthy();
    });
    STOPS.forEach((st) => st.forEach((id) => expect(nodeById(id)).toBeTruthy()));
    Object.keys(DEX_NODE).forEach((ch) => { expect(IDS).toContain(ch); expect((matchNode(DEX_NODE[ch]) as { opp: string }).opp).toBe(ch); });
    Object.keys(CHAR_TAG).forEach((ch) => expect(IDS).toContain(ch));
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(CARDS.length).toBe(6);
  });
  it('the same card never counts twice and order does not matter', () => {
    expect(cardMods('vaporeon', ['quickShoes', 'quickShoes']).move).toBeCloseTo(1.08);
    expect(cardMods('vaporeon', ['stance', 'quickShoes'])).toEqual(cardMods('vaporeon', ['quickShoes', 'stance']));
    expect(cardMods('vaporeon', ['quickShoes', 'stance']).move).toBeCloseTo(1.08 * 1.06);
  });
  it('bonds need two of a tag and count the active partner', () => {
    expect(activeBonds('vaporeon', ['quickShoes'])).toEqual([]);
    expect(activeBonds('pikachu', ['quickShoes'])).toEqual(['thunder']);
    expect(activeBonds('vaporeon', ['quickShoes', 'voltBall'])).toEqual(['thunder']);
    expect(activeBonds('farfetchd', ['lightFeather'])).toEqual(['wind']);
    expect(cardMods('pikachu', ['voltBall']).dive).toBeCloseTo(1.12 * 1.08);
    expect(cardMods('farfetchd', ['lightFeather']).jump).toBeCloseTo(1.08 * 1.06);
  });
  it('multipliers are capped together with the character\'s own', () => {
    expect(capped('move', 1, 1.08 * 1.06)).toBeCloseTo(1.1448);
    expect(capped('move', 1.05, 1.08 * 1.06)).toBe(1.15);        // 傑尼龜 ×1.05 再加兩張移速卡：封頂
    expect(capped('jump', 0.92, 0.95)).toBeCloseTo(0.874);
    expect(capped('jump', 0.92, 0.9)).toBe(0.85);
    expect(capped('move', 1.05, 1)).toBe(1.05);                  // 沒有卡：角色原本的值不動
    CARDS.forEach((c) => expect(cardById(c.id)).toBe(c));
  });
});

describe('save file: rewards and captures', () => {
  it('capture, reward offer and settlement are written together; picking is recorded once', async () => {
    const { db, run } = await started();
    const out = await db.settle(run.matchId as string, 'win', [5, 2], 1, IDS);
    expect(out.run.phase).toBe('reward');
    expect(out.settlement.capture).toMatchObject({ char: 'magikarp', ok: true });
    expect(out.profile.expeditionUnlocked).toEqual(['magikarp']);
    const loaded = await db.load(IDS);
    expect(loaded.kind === 'ok' && loaded.profile.expeditionUnlocked).toEqual(['magikarp']);
    const card = (out.settlement.offered as string[])[1];
    const picked = await db.pickReward(out.run.revision, card, IDS);
    expect(picked.ownedCardIds).toEqual([card]);
    expect(picked.equippedCardIds).toEqual([card]);
    await expect(db.pickReward(out.run.revision, card, IDS)).rejects.toBeInstanceOf(RuleError);   // 舊 revision
    await expect(db.pickReward(picked.revision, card, IDS)).rejects.toBeInstanceOf(RuleError);    // 已經選過
    const log = await db.settlementsOf('run-1');
    expect(log.length).toBe(1);
    expect(log[0].picked).toBe(card);
  });
  it('a crash while settling a win leaves no capture and no reward behind', async () => {
    const { db, factory, run } = await started();
    await expect(db.settle(run.matchId as string, 'win', [5, 0], 1, IDS, { crashAfterRunPut: true })).rejects.toBeInstanceOf(DbError);
    db.close();
    const db2 = await reopen(factory);
    const s = await db2.load(IDS);
    expect(s.kind === 'ok' && s.run).toEqual(run);
    expect(s.kind === 'ok' && s.profile.expeditionUnlocked).toEqual([]);
    // 重試：同一個種子，得到同樣的三選一
    const a = await db2.settle(run.matchId as string, 'win', [5, 0], 2, IDS);
    const again = await db2.settle(run.matchId as string, 'win', [5, 0], 3, IDS);
    expect(again.duplicate).toBe(true);
    expect(again.settlement.offered).toEqual(a.settlement.offered);
    expect((await current(db2)).pendingReward).toEqual({ settlementId: a.settlement.id, offeredCardIds: a.settlement.offered });
  });
  it('branch, supply and partner changes from a stale tab are rejected', async () => {
    const { db, factory, run } = await started();
    const won = await db.settle(run.matchId as string, 'win', [5, 0], 1, IDS);
    const r1 = await db.pickReward(won.run.revision, null, IDS);
    const tabB = await reopen(factory);
    const r2 = await db.chooseBranch(r1.revision, 'puddle', IDS);
    await expect(tabB.chooseBranch(r1.revision, 'gold', IDS)).rejects.toBeInstanceOf(RuleError);
    await expect(tabB.setLead(r1.revision, 'magikarp', IDS)).rejects.toBeInstanceOf(RuleError);
    expect((await current(tabB)).nodeId).toBe('puddle');
    expect(r2.attemptNo).toBe(0);
  });
});
