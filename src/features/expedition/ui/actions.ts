/**
 * 所有會改存檔的操作。每個都經過 guard()：錯誤一律顯示出來，不吞掉、不假裝已存。
 * 成功寫進存檔之後才更新畫面上的狀態；畫面透過 state.ts 的 view 重畫。
 */
import { fmt } from '../../../core/i18n';
import { onReady, svc } from '../../../core/services';
import { STATS, cardMods } from '../cards';
import { auraColorOf, cardById, formOf, hasStages, stageOf, startBond, type EventChoice, type MechId } from '../content';
import { DbError, ExpeditionDb } from '../db';
import { RuleError, dailyPlan, dailyScore, heartCap, matchSetup, newDailyRun, newRun, randomPartner, utcDate } from '../logic';
import * as match from '../match/adapter';
import type { FieldSpec } from '../match/field';
import { newSeed } from '../rng';
import { resolveMatch } from '../route';
import { T } from '../texts';
import type { ExpeditionRun, MatchResult, ProfileV1, SaveSlot } from '../types';
import { chapterLabel, charId, formName, matchName } from './names';
import { ended, ids, partners, profile, run, setRun, ui, view, type Scene, type Tab } from './state';

/** 這一下誰進化（御三家換階段）或覺醒了：要播的演出 */
function growthScenes(before: ExpeditionRun, after: ExpeditionRun): Scene[] {
  const out: Scene[] = [];
  after.partyIds.concat(after.benchIds).forEach((id) => {
    const b0 = before.bond[id] || 0, b1 = after.bond[id] || 0;
    if (hasStages(id)) {
      if (stageOf(id, b1) > stageOf(id, b0)) out.push({ kind: 'evolve', char: id, from: formOf(id, b0), to: formOf(id, b1), start: 0 });
    } else if (after.awakened.indexOf(id) >= 0 && before.awakened.indexOf(id) < 0) out.push({ kind: 'awaken', char: id, start: 0 });
  });
  return out;
}

// ---------- 共用 ----------

export async function guard(action: () => Promise<void>): Promise<void> {
  ui.error = null; ui.retry = null;
  try {
    await action();
  } catch (e) {
    if (e instanceof RuleError && e.code === 'stale') { ui.note = T.stale; await reload(); return; }
    ui.error = e instanceof DbError ? e : new DbError('unknown', e instanceof Error ? e.message : String(e), e);
    ui.retry = () => guard(action);
  }
  view.render();
}

async function baseDb(): Promise<ExpeditionDb> {
  if (!ui.db) ui.db = await ExpeditionDb.open();
  return ui.db;
}
/** 目前畫面上那個存檔位的資料庫 */
export async function slotDb(slot: SaveSlot = ui.slot): Promise<ExpeditionDb> {
  const db = await baseDb();
  return slot === 'current' ? db : db.forSlot(slot);
}
function uuid(): string { return crypto.randomUUID ? crypto.randomUUID() : newSeed() + newSeed(); }

export async function reload(): Promise<void> {
  const db = await slotDb();
  ui.state = await db.load(ids());
  const r = run();
  ui.journal = r ? await db.settlementsOf(r.runId) : [];
  ui.loadout = null;
  if (r && r.phase === 'active' && !match.playing()) ui.interrupted = true;
  view.render();
}

/** 只看某個存檔位有沒有打到一半的比賽（重整後回來用） */
export async function activeIn(slot: SaveSlot): Promise<boolean> {
  const st = await (await slotDb(slot)).load(ids());
  return st.kind === 'ok' && !!st.run && st.run.phase === 'active';
}

/** 換分頁：遠征／每日用不同的存檔位，換過去要重新讀 */
export function switchTab(tab: Tab): Promise<void> {
  ui.tab = tab;
  const slot: SaveSlot | null = tab === 'run' ? 'current' : tab === 'daily' ? 'daily' : null;
  if (!slot || slot === ui.slot) { view.render(); return Promise.resolve(); }
  ui.slot = slot; ui.scenes = []; ui.note = ''; ui.swapPick = ''; ui.interrupted = false;
  return guard(reload);
}

/**
 * 地圖上的操作：寫進存檔，成功才更新畫面上的狀態（重新讀一次，profile 也可能變了：補位或進化之石讓誰覺醒）。
 * 這一下讓誰覺醒了，就播覺醒演出。
 */
function change(fn: (db: ExpeditionDb, r: ExpeditionRun) => Promise<ExpeditionRun>): Promise<void> {
  return guard(async () => {
    const r = run();
    if (!r || !ui.canWrite) return;
    const db = await slotDb(), next = await fn(db, r);
    const st = await db.load(ids());
    if (st.kind === 'ok') ui.state = st; else setRun(next);
    ui.journal = await db.settlementsOf(next.runId);
    ui.note = ''; ui.loadout = null;
    ui.scenes = growthScenes(r, next);
  });
}

// ---------- 開新的一輪 ----------

/** 羈絆 Lv2 以上的夥伴，開局親密度從 1 開始 */
function startBonds(p: ProfileV1 | null, party: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}, xp = (p && p.bondXp) || {};
  party.forEach((id) => { const b = startBond(xp[id] || 0); if (b) out[id] = b; });
  return out;
}

export function challengesOpen(p: ProfileV1 | null): boolean { return !!p && (p.rankUnlocked || 0) >= 1; }

export function startNewRun(): Promise<void> {
  return guard(async () => {
    if (!ui.canWrite) return;
    const db = await slotDb('current'), list = partners(), p = profile(), seed = newSeed();
    const challenges = challengesOpen(p) ? ui.challenges.slice() : [];
    const random = challenges.indexOf('random') >= 0, solo = challenges.indexOf('solo') >= 0;
    // 隨緣：起始夥伴由種子決定，不帶備援出發
    const lead = random ? randomPartner(seed, list) : list.indexOf(ui.partner) >= 0 ? ui.partner : list[0];
    const party = [lead].concat(!random && !solo && ui.backup && ui.backup !== lead && list.indexOf(ui.backup) >= 0 ? [ui.backup] : []);
    const rank = Math.min(ui.rank, (p && p.rankUnlocked) || 0);
    await db.createRun(newRun({ runId: uuid(), seed, party, now: Date.now(), mode: ui.mode, rank, challenges, bond: startBonds(p, party) }), ids());
    ui.note = ''; ui.scenes = [];
    await reload();
  });
}

export function startDaily(): Promise<void> {
  return guard(async () => {
    if (!ui.canWrite) return;
    const plan = dailyPlan(utcDate(Date.now()));
    const partner = plan.partners.indexOf(ui.dailyPartner) >= 0 ? ui.dailyPartner : plan.partners[0];
    await (await slotDb('daily')).createRun(newDailyRun(plan, partner, Date.now(), uuid()), ids());
    ui.note = ''; ui.scenes = [];
    await reload();
  });
}

// ---------- 比賽 ----------

/** 各站的場地色調（時段氣氛）；首領的色調在 match/boss.ts 的階段裡 */
const TINT: Readonly<Record<string, number>> = {
  rain: 0xB8C8E8, gold: 0xFFE9B0, lowgrav: 0xF3D2EC, heavy: 0xD8CDB8, stasis: 0xD4C6F0, gravflip: 0xE0C0D8,
  elite: 0xFFC79E, gate: 0xEDE3A8, thunder: 0x9AA0C8, k1: 0xC9B8F0, k2: 0x9C8CD0, k3: 0xF0D8FF,
  c3gate: 0xB8C4E0, mewroom: 0xFFD8F0, t1: 0xC8BCA8, t2: 0xC4B4E8,
};

function mechsOf(equipped: readonly string[]): MechId[] {
  const out: MechId[] = [];
  equipped.slice().sort().forEach((id) => { const c = cardById(id); if (c && c.mech) out.push(c.mech); });
  return out;
}

/** 遊戲本體還沒載入（關於頁還開著）就先關掉它，等載入完成 */
function gameReady(): Promise<boolean> {
  if (svc.ctrl) return Promise.resolve(true);
  const box = document.getElementById('about-box'), btn = document.getElementById('close-about-btn');
  if (box && btn && !box.classList.contains('hidden')) btn.click();
  return new Promise((resolve) => { onReady(() => resolve(true)); });
}

export function fight(): Promise<void> {
  return guard(async () => {
    const r = run(), slot = ui.slot;
    if (!r || !ui.canWrite) return;
    if (match.otherModeBusy()) { ui.note = T.busy; return; }
    if (!(await gameReady())) return;
    // 等遊戲載入的時候可能切了分頁：一律用按下開打時的存檔位
    if (ui.slot !== slot) return;
    const db = await slotDb(slot);
    // 先把 matchId 寫進存檔才開打（重整後回來是同一場、不扣心）
    const r2 = await db.beginMatch(r.revision, ids());
    setRun(r2);
    const node = resolveMatch(r2.nodeId, r2.seed), lead = charId(r2.partyIds[0]);
    if (!node || !r2.matchId || !lead) return;
    const setup = matchSetup(r2, node), mods = cardMods(lead, r2.equippedCardIds, r2.partyIds[1]);
    const field: FieldSpec = {
      title: matchName(node), hearts: r2.hearts, maxHearts: heartCap(r2), leadName: formName(lead, r2.bond[lead] || 0),
      form: formOf(lead, r2.bond[lead] || 0), stage: stageOf(lead, r2.bond[lead] || 0),
      mechs: mechsOf(r2.equippedCardIds), bossStart: setup.bossStart,
      awakened: r2.awakened.indexOf(lead) >= 0, auraColor: auraColorOf(lead),
    };
    if (setup.rule) field.rule = setup.rule;
    if (setup.diff) field.diff = setup.diff;
    if (setup.boss) field.boss = setup.boss;
    const tint = TINT[node.id] !== undefined ? TINT[node.id] : setup.rule ? TINT[setup.rule] : undefined;
    if (tint !== undefined) field.tint = tint;
    if (STATS.some((k) => mods[k] !== 1)) field.mods = mods;
    ui.matchSlot = slot;
    const ok = match.start({ matchId: r2.matchId, p1: lead, p2: node.opp, score: setup.score, field, cpuP1: ui.autoplay }, onEnd, onInterrupt);
    if (!ok) { ui.note = T.busy; return; }
    ui.interrupted = false; ui.pausedHidden = false; ui.note = ''; ui.scenes = [];
    view.hide();
  });
}

/** 結算。delay：存好之後等幾毫秒（讓場上的 GAME END 播一下）再離場、打開面板 */
function settle(slot: SaveSlot, matchId: string, result: MatchResult, scores: [number, number], bossReached: number | undefined, delay: number): Promise<void> {
  return guard(async () => {
    // 結算到開打的那個存檔位（呼叫時就定下來，「再試一次」也不會跑到另一邊），畫面也切回去
    ui.slot = slot; ui.tab = slot === 'daily' ? 'daily' : 'run';
    const before = run();
    const db = await slotDb(slot);
    const out = await db.settle(matchId, result, scores, Date.now(), ids(), bossReached === undefined ? {} : { bossReached });
    ui.state = { kind: 'ok', profile: out.profile, run: out.run };
    ui.journal = await db.settlementsOf(out.run.runId);
    // 章節重來時心已經回滿；這裡要顯示的是「輸掉這一場之後」剩幾顆（0）
    const s = out.settlement, h = s.chapterRestart ? 0 : out.run.hearts;
    const lines = [s.result === 'win' ? fmt(T.win, { a: s.scores[0], b: s.scores[1] })
      : s.result === 'loss' ? fmt(T.loss, { a: s.scores[0], b: s.scores[1], hearts: h })
        : fmt(T.forfeited, { hearts: h })];
    if (s.chapterRestart) lines.push(fmt(T.chapterRestart, { chapter: chapterLabel(out.run) }));
    if (out.run.daily && ended(out.run)) lines.push(fmt(T.dailyResult, { score: dailyScore(out.run) }));
    out.goals.forEach((g) => lines.push(fmt(T.goalNew, { goal: T.goalName[g] || g })));
    ui.note = lines.join('　');
    ui.interrupted = false; ui.pausedHidden = false;
    ui.scenes = [];
    if (!out.duplicate) {
      if (s.capture) ui.scenes.push({ kind: 'capture', rec: s.capture, start: 0 });
      if (before && before.runId === out.run.runId) ui.scenes.push(...growthScenes(before, out.run));
      else if (s.awakened) ui.scenes.push({ kind: 'awaken', char: s.awakened, start: 0 });
    }
  }).then(() => new Promise<void>((resolve) => {
    setTimeout(() => {
      if (match.playing()) match.stop(true);
      view.show();
      resolve();
    }, delay);
  }));
}

const onEnd: match.OnEnd = (matchId, result, scores, info) => {
  // 分出勝負的那一幀就存（不等動畫），存好之後再顯示結果
  void settle(ui.matchSlot, matchId, result, scores, info.bossReached, 1900);
};

const onInterrupt: match.OnInterrupt = (why) => {
  if (why === 'hidden') ui.pausedHidden = true;
  else ui.interrupted = true;
  view.show();
};

export function forfeit(): Promise<void> {
  const r = run();
  if (!r || !r.matchId || !ui.canWrite) return Promise.resolve();
  if (!window.confirm(T.forfeitConfirm)) return Promise.resolve();
  const c = svc.ctrl, live = match.playing();
  const scores: [number, number] = c && live ? [c.scores[0], c.scores[1]] : [0, 0];
  // 正在打的那一場不屬於畫面上這個存檔位：不處理（放棄要在那一場的分頁按）
  if (live && ui.matchSlot !== ui.slot) return Promise.resolve();
  // 打到一半放棄：首領打到過的階段照樣記（重整後才放棄的話已經不知道，就不記）
  const reached = live ? match.bossReached() : undefined;
  if (live) match.stop(true);
  else ui.matchSlot = ui.slot;
  return settle(ui.matchSlot, r.matchId, 'forfeit', scores, reached, 0);
}

export function resume(): void { ui.pausedHidden = false; match.resume(); view.hide(); }

// ---------- 地圖上的操作 ----------

export function discard(): Promise<void> {
  const r = run();
  if (!r || !ui.canWrite || !window.confirm(T.discardConfirm)) return Promise.resolve();
  return guard(async () => {
    // 只停掉屬於這個存檔位的比賽
    if (match.playing() && ui.matchSlot === ui.slot) match.stop(true);
    await (await slotDb()).discardRun(r.revision, ids());
    ui.note = ''; ui.scenes = [];
    await reload();
  });
}

export function pick(cardId: string | null): Promise<void> { return change((db, r) => db.pickReward(r.revision, cardId, ids())); }
export function branch(option: string): Promise<void> { return change((db, r) => db.chooseBranch(r.revision, option, ids())); }
export function depart(): Promise<void> { const lo = ui.loadout; return change((db, r) => db.leaveSupply(r.revision, lo || r.equippedCardIds, ids())); }
export function sendIn(id: string): Promise<void> { return change((db, r) => db.setLead(r.revision, id, ids())); }
export function swap(benchId: string, out: string | null): Promise<void> { ui.swapPick = ''; return change((db, r) => db.swapIn(r.revision, benchId, out, ids())); }
export function choose(choice: EventChoice, arg?: string): Promise<void> { return change((db, r) => db.resolveEvent(r.revision, choice, ids(), arg)); }

// ---------- 存檔管理 ----------

export function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function stamp(): string { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); }

export function exportSave(): Promise<void> {
  return guard(async () => {
    const data = await (await baseDb()).exportAll();
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'pva-expedition-' + stamp() + '.json');
  });
}

export function moveAside(): Promise<void> {
  if (!ui.canWrite || !window.confirm(T.moveAsideConfirm)) return Promise.resolve();
  return guard(async () => {
    await (await slotDb()).quarantineRun(ui.state && ui.state.kind !== 'ok' ? ui.state.kind + ': ' + ui.state.detail : '');
    await reload();
  });
}

/** 除錯用：直接拿資料庫 */
export function exportAll(): Promise<Record<string, unknown>> { return baseDb().then((db) => db.exportAll()); }
