/**
 * 遠征的畫面：一個面板，依存檔狀態顯示不同內容。
 * 地圖、收服演出、明信片的圖在 art.ts，排版用的小元件和樣式在 widgets.ts；這裡負責存檔操作和組版。
 * 所有會改存檔的操作都經過 guard()：錯誤一律顯示出來，不吞掉、不假裝已存。
 */
import { fmt } from '../../core/i18n';
import { nextZ, onReady, svc } from '../../core/services';
import type { CharacterId } from '../../core/types';
import { CHARS } from '../characters';
import * as match from './adapter';
import { drawCapture, drawMap, drawPostcard, face, sceneNumbers } from './art';
import { STATS, cardMods } from './cards';
import {
  CAPTURE_CHANCE, CHAPTERS, DEX_WHERE, cardSlots, EVENTS, FORK_OF, PARTY_MAX, RANK_MAX, STARTERS, STOPS,
  cardById, matchNode, maxHearts, nodeById, rankBoss, rankDiff, type EventChoice, type MatchNode, type MechId,
} from './content';
import { DbError, ExpeditionDb, type LoadState } from './db';
import { RuleError, eventOf, newRun } from './logic';
import { newSeed, rngFor } from './rng';
import { T } from './texts';
import type { CaptureRecord, ExpeditionRun, MatchResult, ProfileV1, RunMode, SettlementV1 } from './types';
import { acquireWriter } from './env';
import { fired as mechFired } from './mech';
import { resolveMatch } from './route';
import { CSS, bonusView, button, cardView, charName, el, nodeName, portrait, stage } from './widgets';

const ids = (): readonly string[] => CHARS.ids;
type Ok = Extract<LoadState, { kind: 'ok' }>;

const ui = {
  root: null as HTMLDivElement | null,
  db: null as ExpeditionDb | null,
  state: null as LoadState | null,
  error: null as DbError | null,
  /** 出錯時「再試一次」要做的事 */
  retry: null as (() => Promise<void>) | null,
  canWrite: false,
  note: '',
  interrupted: false,
  pausedHidden: false,
  partner: '' as string,
  backup: '' as string,
  mode: 'chapter' as RunMode,
  rank: 0,
  tab: 'run' as 'run' | 'dex',
  /** 補給站正在編輯的裝備（還沒存） */
  loadout: null as string[] | null,
  journal: [] as SettlementV1[],
  /** 剛結算完的收服演出 */
  scene: null as { rec: CaptureRecord; start: number } | null,
  nums: [] as number[],
  numsSeed: '',
  raf: 0,
  draw: null as ((t: number) => void) | null,
  /** 後援換人：先點了哪一隻後援 */
  swapPick: '' as string,
};

function okState(): Ok | null { return ui.state && ui.state.kind === 'ok' ? ui.state : null; }
function run(): ExpeditionRun | null { const s = okState(); return s ? s.run : null; }
function profile(): ProfileV1 | null { const s = okState(); return s ? s.profile : null; }
function setRun(r: ExpeditionRun, p?: ProfileV1): void { const s = okState(); if (s) ui.state = { kind: 'ok', profile: p || s.profile, run: r }; }
/** 可以帶出門的夥伴：起始夥伴加上遠征收服過的 */
function partners(): string[] {
  const p = profile(), got = p ? p.expeditionUnlocked : [];
  return CHARS.ids.filter((id) => STARTERS.indexOf(id) >= 0 || got.indexOf(id) >= 0);
}
function runName(r: ExpeditionRun): string {
  return rngFor(r.seed, 'run', 'event', r.rngVersion).pick(T.runNames) + ' #' + r.seed.slice(0, 4).toUpperCase();
}
function nums(seed: string): number[] {
  if (ui.numsSeed !== seed) { ui.nums = sceneNumbers(seed); ui.numsSeed = seed; }
  return ui.nums;
}
function chapterLabel(r: ExpeditionRun): string {
  const c = CHAPTERS[r.chapter];
  return fmt(T.chapterLine, { n: r.chapter + 1, name: (c && T.chapterName[c.id]) || '' });
}
/** 比賽站的名字：岔路空位用抽到的對手取名（同一輪對手不會重複，名字也就不會重複；規則另外寫在卡上），其他站用固定的名字 */
function matchName(node: MatchNode): string {
  if (!node.slot) return nodeName(node.id);
  return T.placeByOpp[node.opp] || nodeName(node.id);
}
function nameOf(id: string, seed: string): string { const m = resolveMatch(id, seed); return m ? matchName(m) : nodeName(id); }
function stopNames(seed: string): Record<string, string> {
  const names: Record<string, string> = {};
  STOPS.forEach((st) => st.forEach((id) => { names[id] = nameOf(id, seed); }));
  return names;
}

// ---------- 存檔操作（每個都經過 guard：錯誤一律顯示，不吞掉） ----------

async function guard(action: () => Promise<void>): Promise<void> {
  ui.error = null; ui.retry = null;
  try {
    await action();
  } catch (e) {
    if (e instanceof RuleError && e.code === 'stale') { ui.note = T.stale; await reload(); return; }
    if (e instanceof DbError) { ui.error = e; ui.retry = () => guard(action); }
    else { ui.error = new DbError('unknown', String(e && (e as Error).message || e), e); ui.retry = () => guard(action); }
  }
  render();
}

async function ensureDb(): Promise<ExpeditionDb> {
  if (!ui.db) ui.db = await ExpeditionDb.open();
  return ui.db;
}

async function reload(): Promise<void> {
  const db = await ensureDb();
  ui.state = await db.load(ids());
  const r = run();
  ui.journal = r ? await db.settlementsOf(r.runId) : [];
  ui.loadout = null;
  if (r && r.phase === 'active' && !match.playing()) ui.interrupted = true;
  render();
}

/** 只改 run 的操作：寫進存檔，成功才更新畫面上的狀態 */
function change(fn: (db: ExpeditionDb, r: ExpeditionRun) => Promise<ExpeditionRun>): Promise<void> {
  return guard(async () => {
    const r = run();
    if (!r || !ui.canWrite) return;
    const db = await ensureDb(), next = await fn(db, r);
    setRun(next);
    ui.journal = await db.settlementsOf(next.runId);
    ui.scene = null; ui.note = ''; ui.loadout = null;
  });
}

function startNewRun(): Promise<void> {
  return guard(async () => {
    if (!ui.canWrite) return;
    const db = await ensureDb(), list = partners();
    const lead = list.indexOf(ui.partner) >= 0 ? ui.partner : list[0];
    const party = [lead].concat(ui.backup && ui.backup !== lead && list.indexOf(ui.backup) >= 0 ? [ui.backup] : []);
    await db.createRun(newRun(crypto.randomUUID ? crypto.randomUUID() : newSeed(), newSeed(), party, Date.now(), ui.mode, Math.min(ui.rank, (profile() || {}).rankUnlocked || 0)), ids());
    ui.note = ''; ui.scene = null;
    await reload();
  });
}

/** 各站的場地色調（時段氣氛）；首領的色調在 field.ts */
const TINT: Record<string, number> = { rain: 0xB8C8E8, gold: 0xFFE9B0, lowgrav: 0xF3D2EC, elite: 0xFFC79E };

function fight(): Promise<void> {
  return guard(async () => {
    const r = run();
    if (!r || !ui.canWrite) return;
    if (match.otherModeBusy()) { ui.note = T.busy; return; }
    const ready = await gameReady();
    if (!ready) return;
    const db = await ensureDb();
    // 先把 matchId 寫進存檔才開打（重整後回來是同一場、不扣心）
    const r2 = await db.beginMatch(r.revision, ids());
    setRun(r2);
    const node = resolveMatch(r2.nodeId, r2.seed);
    if (!node || !r2.matchId) return;
    const lead = r2.partyIds[0], mods = cardMods(lead, r2.equippedCardIds);
    const mechs = r2.equippedCardIds.slice().sort().map((id) => cardById(id)).filter((c) => c && c.mech).map((c) => (c as { mech: MechId }).mech);
    const ok = match.start({
      matchId: r2.matchId, p1: lead as CharacterId, p2: node.opp, score: node.score,
      field: {
        title: matchName(node), hearts: r2.hearts, maxHearts: maxHearts(r2.rank), rule: node.rule, diff: rankDiff(node.diff, r2.rank), boss: rankBoss(node.boss, r2.rank),
        tint: node.id === 'elite' ? TINT.elite : node.rule ? TINT[node.rule] : undefined,
        mods: STATS.some((k) => mods[k] !== 1) ? mods : undefined, mechs,
      },
    }, onEnd, onInterrupt);
    if (!ok) { ui.note = T.busy; return; }
    ui.interrupted = false; ui.pausedHidden = false; ui.note = ''; ui.scene = null;
    hide();
  });
}

/** 結算。delay：存好之後等幾毫秒（讓場上的 GAME END 播一下）再離場、打開面板 */
function settle(matchId: string, result: MatchResult, scores: [number, number], delay: number): Promise<void> {
  return guard(async () => {
    const db = await ensureDb();
    const out = await db.settle(matchId, result, scores, Date.now(), ids());
    setRun(out.run, out.profile);
    ui.journal = await db.settlementsOf(out.run.runId);
    // 章節重來時心已經回滿；這裡要顯示的是「輸掉這一場之後」剩幾顆（0）
    const s = out.settlement, h = s.chapterRestart ? 0 : out.run.hearts;
    ui.note = s.result === 'win' ? fmt(T.win, { a: s.scores[0], b: s.scores[1] })
      : s.result === 'loss' ? fmt(T.loss, { a: s.scores[0], b: s.scores[1], hearts: h })
        : fmt(T.forfeited, { hearts: h });
    if (s.chapterRestart) ui.note += '　' + fmt(T.chapterRestart, { chapter: chapterLabel(out.run) });
    ui.interrupted = false; ui.pausedHidden = false;
    ui.scene = s.capture && !out.duplicate ? { rec: s.capture, start: 0 } : null;
  }).then(() => new Promise<void>((resolve) => {
    setTimeout(() => {
      if (match.playing()) match.stop(true);
      if (ui.scene) ui.scene.start = performance.now();
      show();
      resolve();
    }, delay);
  }));
}

const onEnd: match.OnEnd = (matchId, result, scores) => {
  // 分出勝負的那一幀就存（不等動畫），存好之後再顯示結果
  void settle(matchId, result, scores, 1900);
};

const onInterrupt: match.OnInterrupt = (why) => {
  if (why === 'hidden') ui.pausedHidden = true;
  else ui.interrupted = true;
  show();
};

function forfeit(): Promise<void> {
  const r = run();
  if (!r || !r.matchId || !ui.canWrite) return Promise.resolve();
  if (!window.confirm(T.forfeitConfirm)) return Promise.resolve();
  const c = svc.ctrl, scores: [number, number] = c && match.playing() ? [c.scores[0], c.scores[1]] : [0, 0];
  if (match.playing()) match.stop(true);
  return settle(r.matchId, 'forfeit', scores, 0);
}

function discard(): Promise<void> {
  const r = run();
  if (!r || !ui.canWrite || !window.confirm(T.discardConfirm)) return Promise.resolve();
  return guard(async () => { if (match.playing()) match.stop(true); await (await ensureDb()).discardRun(r.revision, ids()); ui.note = ''; ui.scene = null; await reload(); });
}

function pick(cardId: string | null): Promise<void> { return change((db, r) => db.pickReward(r.revision, cardId, ids())); }
function branch(option: string): Promise<void> { return change((db, r) => db.chooseBranch(r.revision, option, ids())); }
function depart(): Promise<void> { const lo = ui.loadout; return change((db, r) => db.leaveSupply(r.revision, lo || r.equippedCardIds, ids())); }
function sendIn(id: string): Promise<void> { return change((db, r) => db.setLead(r.revision, id, ids())); }
function swap(benchId: string, out: string | null): Promise<void> { ui.swapPick = ''; return change((db, r) => db.swapIn(r.revision, benchId, out, ids())); }
function choose(choice: EventChoice, cardId?: string): Promise<void> { return change((db, r) => db.resolveEvent(r.revision, choice, ids(), cardId)); }

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function stamp(): string { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); }

function exportSave(): Promise<void> {
  return guard(async () => {
    const data = await (await ensureDb()).exportAll();
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'pva-expedition-' + stamp() + '.json');
  });
}

function moveAside(): Promise<void> {
  if (!ui.canWrite || !window.confirm(T.moveAsideConfirm)) return Promise.resolve();
  return guard(async () => { await (await ensureDb()).quarantineRun(ui.state && ui.state.kind !== 'ok' ? ui.state.kind + ': ' + ui.state.detail : ''); await reload(); });
}

/** 遊戲本體還沒載入（關於頁還開著）就先關掉它，等載入完成 */
function gameReady(): Promise<boolean> {
  if (svc.ctrl) return Promise.resolve(true);
  const box = document.getElementById('about-box'), btn = document.getElementById('close-about-btn');
  if (box && btn && !box.classList.contains('hidden')) btn.click();
  return new Promise((resolve) => { onReady(() => resolve(true)); });
}

// ---------- 畫面 ----------

function errorText(e: DbError): string {
  return e.code === 'quota' ? T.errQuota : e.code === 'unavailable' ? T.errUnavailable
    : e.code === 'version' ? T.errVersion : e.code === 'blocked' ? T.errBlocked : T.errOther;
}

function partyView(r: ExpeditionRun, canSwitch: boolean): HTMLElement {
  const wrap = el('div');
  const row = el('div', 'pv-exp-party');
  const picking = canSwitch && ui.swapPick && r.benchIds.indexOf(ui.swapPick) >= 0 ? ui.swapPick : '';
  r.partyIds.forEach((id, i) => {
    const cell = el('div', 'pv-exp-mate' + (i === 0 ? ' lead' : ''));
    cell.appendChild(portrait(id, i === 0 ? 44 : 34));
    const txt = el('div');
    txt.appendChild(el('b', '', charName(id)));
    txt.appendChild(el('div', 'pv-exp-dim', i === 0 ? T.lead : T.backup));
    cell.appendChild(txt);
    if (picking) cell.appendChild(button(fmt(T.swapWith, { name: charName(id) }), () => swap(picking, id), 'small main'));
    else if (i > 0 && canSwitch) cell.appendChild(button(T.switchLead, () => sendIn(id), 'small'));
    row.appendChild(cell);
  });
  if (picking && r.partyIds.length < PARTY_MAX) row.appendChild(button(T.joinParty, () => swap(picking, null), 'small main'));
  wrap.appendChild(row);
  if (r.benchIds.length) {
    const bench = el('div', 'pv-exp-bench');
    bench.appendChild(el('span', 'pv-exp-dim', T.bench + '：'));
    r.benchIds.forEach((id) => {
      const b = button('', () => { ui.swapPick = ui.swapPick === id ? '' : id; render(); }, 'char small' + (picking === id ? ' on' : ''));
      b.appendChild(portrait(id, 26)); b.appendChild(el('span', '', charName(id)));
      if (!canSwitch) b.disabled = true;
      bench.appendChild(b);
    });
    if (picking) bench.appendChild(button(T.cancel, () => { ui.swapPick = ''; render(); }, 'small'));
    wrap.appendChild(bench);
    if (canSwitch) wrap.appendChild(el('div', 'pv-exp-dim', T.benchHint));
  }
  return wrap;
}

function captureLine(node: MatchNode): string {
  const p = profile();
  if (!node.capture || !p) return '';
  if (p.expeditionUnlocked.indexOf(node.opp) >= 0) return T.captureHave;
  if (node.capture === 'sure') return T.captureSure;
  return (p.captureMissesByCharacter[node.opp] || 0) > 0 ? T.capturePity : fmt(T.captureChance, { pct: Math.round(CAPTURE_CHANCE * 100) });
}

function nodeCard(node: MatchNode, action: HTMLElement | null): HTMLElement {
  const card = el('div', 'pv-exp-node');
  const head = el('div', 'pv-exp-node-head');
  head.appendChild(portrait(node.opp, 46));
  const tt = el('div');
  tt.appendChild(el('b', '', matchName(node)));
  tt.appendChild(el('div', '', fmt(node.boss ? T.vsBoss : T.vs, { opp: charName(node.opp), score: node.score })));
  const cap = captureLine(node);
  if (cap) tt.appendChild(el('div', 'pv-exp-cap', '◓ ' + cap));
  head.appendChild(tt);
  card.appendChild(head);
  if (node.rule) { card.appendChild(el('b', 'pv-exp-rule ' + node.rule, T.ruleName[node.rule])); card.appendChild(el('p', '', T.ruleDesc[node.rule])); }
  else if (node.boss) card.appendChild(el('p', '', fmt(T.bossDesc, { a: node.boss.playerHp, b: node.boss.hp, n: node.boss.phase2AtHp, opp: charName(node.opp) })));
  else card.appendChild(el('p', 'pv-exp-dim', T.noRule));
  if (action) card.appendChild(action);
  return card;
}

/** 夥伴的一句話（同時是這一站的提示），由種子決定講哪一句 */
function tip(r: ExpeditionRun, nodeId: string): HTMLElement | null {
  const m = resolveMatch(nodeId, r.seed);
  const lines = m && m.slot ? (m.rule ? T.tipsRule[m.rule] : T.tipsOpp[m.opp]) : T.tips[nodeId];
  if (!lines || !lines.length) return null;
  const box = el('div', 'pv-exp-tip');
  box.appendChild(portrait(r.partyIds[0], 30));
  box.appendChild(el('div', '', charName(r.partyIds[0]) + '：「' + rngFor(r.seed, nodeId, 'event', r.rngVersion).pick(lines) + '」'));
  return box;
}

function journalLines(): string[] {
  return ui.journal.map((s) => {
    const r = run(), node = r ? resolveMatch(s.nodeId, r.seed) : matchNode(s.nodeId), opp = node ? charName(node.opp) : '?';
    let ln = fmt(s.result === 'win' ? T.jWin : s.result === 'loss' ? T.jLoss : T.jForfeit, { node: node ? matchName(node) : nodeName(s.nodeId), a: s.scores[0], b: s.scores[1], opp });
    if (s.capture) ln += '・' + fmt(s.capture.ok ? T.jCaught : T.jMissed, { name: charName(s.capture.char) });
    if (s.picked) ln += '・' + fmt(T.jPick, { card: T.cardName[s.picked] || s.picked });
    return ln;
  });
}
function journalView(): HTMLElement | null {
  if (!ui.journal.length) return null;
  const d = el('details', 'pv-exp-journal');
  d.appendChild(el('summary', '', T.journal + '（' + ui.journal.length + '）'));
  journalLines().forEach((ln) => d.appendChild(el('div', '', ln)));
  return d;
}

/** 開新的一輪：選上場的夥伴和（可以不帶的）備援 */
function chooser(body: HTMLElement, again: boolean): void {
  const list = partners();
  if (list.indexOf(ui.partner) < 0) ui.partner = list[0];
  if (ui.backup === ui.partner || list.indexOf(ui.backup) < 0) ui.backup = '';
  const grid = (title: string, cur: string, set: (id: string) => void, none: boolean, skip: string): void => {
    body.appendChild(el('p', '', title));
    const g = el('div', 'pv-exp-chars');
    if (none) g.appendChild(button(T.noBackup, () => { set(''); render(); }, cur === '' ? 'on' : ''));
    list.filter((id) => id !== skip).forEach((id) => {
      const b = button('', () => { set(id); render(); }, 'char' + (id === cur ? ' on' : ''));
      b.appendChild(portrait(id, 36)); b.appendChild(el('span', '', charName(id)));
      g.appendChild(b);
    });
    body.appendChild(g);
  };
  body.appendChild(el('p', '', T.modeTitle));
  const modes = el('div', 'pv-exp-chars');
  (['chapter', 'ironman'] as RunMode[]).forEach((m) => modes.appendChild(button(m === 'chapter' ? T.modeChapter : T.modeIronman, () => { ui.mode = m; render(); }, ui.mode === m ? 'on' : '')));
  body.appendChild(modes);
  body.appendChild(el('div', 'pv-exp-dim', ui.mode === 'chapter' ? T.modeChapterDesc : T.modeIronmanDesc));
  const unlockedRank = Math.min(RANK_MAX, (profile() || {}).rankUnlocked || 0);
  if (ui.rank > unlockedRank) ui.rank = unlockedRank;
  body.appendChild(el('p', '', T.rankTitle));
  const ranks = el('div', 'pv-exp-chars');
  for (let k = 0; k <= RANK_MAX; k++) {
    const rb = button(T.rankName[k], () => { ui.rank = k; render(); }, ui.rank === k ? 'on' : '');
    if (k > unlockedRank) { rb.disabled = true; rb.title = T.rankLocked; }
    ranks.appendChild(rb);
  }
  body.appendChild(ranks);
  body.appendChild(el('div', 'pv-exp-dim', T.rankDesc[ui.rank] + (unlockedRank < RANK_MAX ? '　' + T.rankLocked : '')));
  grid(T.partner, ui.partner, (id) => { ui.partner = id; }, false, '');
  if (PARTY_MAX > 1 && list.length > 1) grid(T.pickBackup, ui.backup, (id) => { ui.backup = id; }, true, ui.partner);
  if (ui.canWrite) body.appendChild(button(again ? T.again : T.newRun, startNewRun, 'main'));
}

/** 圖鑑：收服過的看得到，還沒收服的是剪影加條件 */
function dexView(body: HTMLElement): void {
  const p = profile(), got = p ? p.expeditionUnlocked : [];
  const starter = (id: string): boolean => STARTERS.indexOf(id as CharacterId) >= 0;
  const have = (id: string): boolean => starter(id) || got.indexOf(id) >= 0;
  body.appendChild(el('p', 'pv-exp-note', fmt(T.dexCount, { n: CHARS.ids.filter(have).length, total: CHARS.ids.length })));
  const grid = el('div', 'pv-exp-dex');
  const order = (id: string): number => (starter(id) ? 0 : DEX_WHERE[id] ? 1 : 2);
  const stamps = (p && p.stamps) || {}, iron = (p && p.ironmanClears) || [];
  const how = (id: string): string => { const w = DEX_WHERE[id]; return w === 'fork' ? T.dexFork : fmt(T.dexHow, { node: nodeName(w) }); };
  CHARS.ids.slice().sort((a, b) => order(a) - order(b)).forEach((id) => {
    const cell = el('div', 'pv-exp-dexcell' + (have(id) ? ' have' : ''));
    cell.appendChild(portrait(id, 40, !have(id)));
    cell.appendChild(el('b', '', have(id) || DEX_WHERE[id] ? charName(id) : '？？？'));
    cell.appendChild(el('div', 'pv-exp-dim', starter(id) ? T.dexStarter : have(id) ? T.captureHave : DEX_WHERE[id] ? how(id) : T.dexLater));
    // 通關印章：用這隻通關過的最高難度；一命到底另外標
    if (stamps[id] || iron.indexOf(id) >= 0) cell.appendChild(el('div', 'pv-exp-stamp', (stamps[id] ? '★' + T.rankShort[stamps[id] - 1] : '') + (iron.indexOf(id) >= 0 ? ' ♥' + T.modeIronman : '')));
    grid.appendChild(cell);
  });
  body.appendChild(grid);
}

/** 地圖；剛結算完有收服的話，同一塊畫布先播收服演出 */
function mapStage(body: HTMLElement, r: ExpeditionRun): void {
  // 窄螢幕：畫布的邏輯寬度變小（同樣的字在手機上大一點），只標目前這一站
  const compact = window.innerWidth < 560, W2 = compact ? 380 : 520, H2 = compact ? 190 : 200;
  const [c, g] = stage(W2, H2), n = nums(r.seed), sc = ui.scene, names = stopNames(r.seed), resolve = (id: string) => resolveMatch(id, r.seed);
  body.appendChild(c);
  ui.draw = (t) => {
    if (sc && ui.scene === sc) {
      const f = (performance.now() - sc.start) / 33, name = charName(sc.rec.char);
      drawCapture(g, W2, H2, f, t, n, sc.rec.char, sc.rec.ok,
        fmt(sc.rec.returning ? T.captureBack : sc.rec.ok ? T.captureOk : T.captureFail, { name }), sc.rec.ok ? (sc.rec.joined ? T.captureJoin : T.captureDex) : '');
      return;
    }
    drawMap(g, W2, H2, t, { compact, nums: n, nodeId: r.nodeId, visited: r.visitedNodeIds, lead: r.partyIds[0], hearts: r.hearts, maxHearts: maxHearts(r.rank), resolve, ended: r.phase === 'cleared' || r.phase === 'failed', names });
  };
}

function postcardView(body: HTMLElement, r: ExpeditionRun): void {
  const [c, g] = stage(520, 250), cleared = r.phase === 'cleared';
  const lines = journalLines().slice(-5)
    .concat(r.ownedCardIds.length ? [r.ownedCardIds.map((id) => T.cardName[id] || id).join('・')] : [])
    .concat([fmt(T.pcLosses, { n: r.losses }) + (r.mode === 'ironman' ? '・' + T.modeIronman : r.chapterRetries ? '・' + fmt(T.retries, { n: r.chapterRetries }) : '')]);
  const paint = (): void => drawPostcard(g, 520, 250, {
    title: T.postcard, runName: runName(r), headline: cleared ? T.pcCleared : T.pcFailed, cleared,
    party: r.partyIds, visited: r.visitedNodeIds, names: stopNames(r.seed), hearts: r.hearts, maxHearts: maxHearts(r.rank), resolve: (id: string) => resolveMatch(id, r.seed),
    lines, date: new Date(r.createdAt).toISOString().slice(0, 10), nums: nums(r.seed),
  });
  paint();
  // 頭像素材可能晚一點才載好：載好之後補畫一次
  ui.draw = () => { if (!c.dataset.done && face(r.partyIds[0])) { paint(); c.dataset.done = '1'; } };
  body.appendChild(c);
  body.appendChild(button(T.savePostcard, () => { c.toBlob((b) => { if (b) download(b, 'pva-postcard-' + stamp() + '.png'); }); }, 'small'));
}

function render(): void {
  const root = ui.root;
  if (!root) return;
  ui.draw = null;
  const box = root.querySelector('.pv-exp-box') as HTMLDivElement;
  box.textContent = '';
  const r0 = run();
  const head = el('div', 'pv-exp-head');
  head.appendChild(el('b', '', r0 ? runName(r0) : T.title));
  const tabs = el('div', 'pv-exp-tabs');
  tabs.appendChild(button(T.tabRun, () => { ui.tab = 'run'; render(); }, 'small' + (ui.tab === 'run' ? ' on' : '')));
  tabs.appendChild(button(T.tabDex, () => { ui.tab = 'dex'; render(); }, 'small' + (ui.tab === 'dex' ? ' on' : '')));
  tabs.appendChild(button('×', hide, 'x'));
  head.appendChild(tabs);
  box.appendChild(head);
  const body = el('div', 'pv-exp-body');
  box.appendChild(body);

  if (ui.error) {
    const err = el('div', 'pv-exp-err');
    err.appendChild(el('b', '', T.errTitle));
    err.appendChild(el('p', '', errorText(ui.error)));
    err.appendChild(el('code', '', ui.error.code + ': ' + ui.error.message));
    if (ui.retry) err.appendChild(button(T.tryAgain, ui.retry));
    body.appendChild(err);
  }
  if (!ui.canWrite) body.appendChild(el('p', 'pv-exp-warn', T.readonly));

  const st = ui.state;
  if (!st) { body.appendChild(el('p', '', T.loading)); return; }
  if (st.kind !== 'ok') {
    body.appendChild(el('p', 'pv-exp-warn', fmt(st.kind === 'corrupt' ? T.corrupt : T.unsupported, { detail: st.what + ' / ' + st.detail })));
    body.appendChild(button(T.exportBtn, exportSave));
    // 壞檔、或舊內容版本的那一輪：原封不動另存起來（還能匯出），才能開新的一輪
    if (st.what === 'run' && ui.canWrite) body.appendChild(button(T.moveAside, moveAside, 'danger'));
    return;
  }
  if (ui.tab === 'dex') { dexView(body); return; }
  const r = st.run;
  if (!r) { chooser(body, false); return; }
  const ended = r.phase === 'cleared' || r.phase === 'failed';
  // 剛打完最後一場：先看收服演出，再看明信片
  if (ended && !ui.scene) postcardView(body, r); else mapStage(body, r);
  if (ui.note) body.appendChild(el('p', 'pv-exp-note', ui.note));
  if (ended) {
    body.appendChild(el('p', 'pv-exp-big', r.phase === 'cleared' ? T.cleared : T.failed));
    if (ui.scene) body.appendChild(button(T.ok, () => { ui.scene = null; render(); }, 'main'));
    const j0 = journalView(); if (j0) body.appendChild(j0);
    chooser(body, true);
    return;
  }
  const node = nodeById(r.nodeId), mn = resolveMatch(r.nodeId, r.seed);
  const stop = FORK_OF[r.nodeId] !== undefined ? FORK_OF[r.nodeId] : STOPS.findIndex((s) => s.indexOf(r.nodeId) >= 0);
  body.appendChild(el('div', 'pv-exp-dim', chapterLabel(r) + '｜' + fmt(T.stopOf, { n: (stop < 0 ? 1 : stop) + 1, total: STOPS.length })
    + '｜' + (r.mode === 'ironman' ? T.modeIronman : T.modeChapter) + (r.rank ? '｜' + T.rankName[r.rank] : '') + (r.chapterRetries ? '｜' + fmt(T.retries, { n: r.chapterRetries }) : '')));
  body.appendChild(partyView(r, ui.canWrite && r.phase === 'map'));
  const tail = (): void => {
    if (r.ownedCardIds.length && !(node && node.kind === 'supply' && r.phase === 'map')) {
      const row = el('div', 'pv-exp-cards');
      r.equippedCardIds.forEach((id) => row.appendChild(cardView(id, null, true)));
      body.appendChild(row);
      body.appendChild(bonusView(r.partyIds[0], r.equippedCardIds));
    }
    const j = journalView(); if (j) body.appendChild(j);
    if (ui.canWrite) body.appendChild(button(T.discard, discard, 'danger small'));
  };
  if (!ui.canWrite) { tail(); return; }
  if (ui.pausedHidden && match.playing()) {
    body.appendChild(el('p', 'pv-exp-note', T.paused));
    body.appendChild(button(T.resume, () => { ui.pausedHidden = false; match.resume(); hide(); }, 'main'));
    body.appendChild(button(T.forfeit, forfeit, 'danger'));
    return;
  }
  if (r.phase === 'reward' && r.pendingReward) {
    body.appendChild(el('b', '', T.rewardTitle));
    const row = el('div', 'pv-exp-cards');
    r.pendingReward.offeredCardIds.forEach((id) => row.appendChild(cardView(id, () => pick(id), false)));
    body.appendChild(row);
    body.appendChild(el('div', 'pv-exp-dim', T.bondHint));
    body.appendChild(button(T.skip, () => pick(null), 'small'));
  } else if (r.phase === 'active' && mn) {
    if (match.playing()) {
      body.appendChild(el('p', 'pv-exp-note', T.inMatch));
      body.appendChild(button(T.backToMatch, hide, 'main'));
    } else {
      body.appendChild(nodeCard(mn, null));
      body.appendChild(el('p', 'pv-exp-note', T.interrupted));
      body.appendChild(button(T.retry, fight, 'main'));
    }
    body.appendChild(button(T.forfeit, forfeit, 'danger'));
  } else if (node && node.kind === 'fork') {
    body.appendChild(el('b', '', T.forkTitle));
    const row = el('div', 'pv-exp-fork');
    node.options.forEach((id) => { const o = resolveMatch(id, r.seed); if (o) row.appendChild(nodeCard(o, button(T.choose, () => branch(id), 'main'))); });
    body.appendChild(row);
  } else if (node && node.kind === 'event') {
    const ev = eventOf(r);
    if (ev) {
      const box = el('div', 'pv-exp-node');
      box.appendChild(el('b', '', '？ ' + T.eventTitle[ev]));
      box.appendChild(el('p', '', T.eventDesc[ev]));
      EVENTS[ev].forEach((ch) => {
        if (ch === 'trade') {
          // 換卡：選一張自己的卡丟掉
          box.appendChild(el('div', 'pv-exp-dim', r.ownedCardIds.length ? T.tradePick : T.tradeNone));
          const row = el('div', 'pv-exp-cards');
          r.ownedCardIds.forEach((id) => row.appendChild(cardView(id, () => choose('trade', id), false)));
          box.appendChild(row);
          return;
        }
        const why = ch === 'heal' && r.hearts >= maxHearts(r.rank) ? T.heartsFull : ch === 'gamble' && r.hearts <= 1 ? T.gambleNo : '';
        const b = button(T.eventChoice[ch] + (why ? '（' + why + '）' : ''), () => choose(ch), ch === 'leave' ? '' : 'main');
        if (why) b.disabled = true;
        box.appendChild(b);
      });
      body.appendChild(box);
    }
  } else if (node && node.kind === 'supply') {
    const lo = ui.loadout || r.equippedCardIds.slice();
    body.appendChild(el('b', '', nodeName(node.id)));
    body.appendChild(el('p', '', fmt(T.supplyDesc, { max: cardSlots(r.chapter) })));
    const tp = tip(r, node.id); if (tp) body.appendChild(tp);
    if (!r.ownedCardIds.length) body.appendChild(el('p', 'pv-exp-dim', T.noCards));
    else {
      body.appendChild(el('div', 'pv-exp-dim', fmt(T.slots, { n: lo.length, max: cardSlots(r.chapter) }) + '｜' + T.tapToEquip));
      const row = el('div', 'pv-exp-cards');
      r.ownedCardIds.forEach((id) => row.appendChild(cardView(id, () => {
        const i = lo.indexOf(id);
        if (i >= 0) lo.splice(i, 1); else if (lo.length < cardSlots(r.chapter)) lo.push(id); else return;
        ui.loadout = lo; render();
      }, lo.indexOf(id) >= 0)));
      body.appendChild(row);
      body.appendChild(bonusView(r.partyIds[0], lo));
      body.appendChild(el('div', 'pv-exp-dim', T.bondHint));
    }
    body.appendChild(button(T.depart, depart, 'main'));
  } else if (mn) {
    const tp = tip(r, mn.id);
    body.appendChild(nodeCard(mn, null));
    if (tp) body.appendChild(tp);
    body.appendChild(button(T.fight, fight, 'main'));
  }
  tail();
}

function loop(): void {
  ui.raf = 0;
  if (!ui.root || ui.root.style.display === 'none') return;
  if (ui.draw) { try { ui.draw(performance.now() / 33); } catch { /* 畫圖失敗不影響操作 */ } }
  ui.raf = requestAnimationFrame(loop);
}

export function show(): void {
  if (!ui.root) return;
  ui.root.style.display = 'flex';
  ui.root.style.zIndex = String(nextZ());
  render();
  if (!ui.raf) ui.raf = requestAnimationFrame(loop);
}
function hide(): void {
  if (!ui.root) return;
  ui.root.style.display = 'none';
}

export async function mount(): Promise<void> {
  const st = el('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = ui.root = el('div') as HTMLDivElement;
  root.id = 'pv-exp';
  root.appendChild(el('div', 'pv-exp-box'));
  root.addEventListener('click', (e) => { if (e.target === root) hide(); });
  document.body.appendChild(root);

  const left = document.querySelector('#menu-bar .btn-container.left');
  if (left) {
    const wrap = el('div', 'relative-container');
    const btn = el('button', 'btn', T.menuBtn);
    btn.type = 'button'; btn.id = 'pv-exp-btn';
    btn.onclick = (e) => { e.stopPropagation(); show(); };
    wrap.appendChild(btn);
    left.insertBefore(wrap, left.querySelector('.color-scheme-toggle-switch-container'));
  }

  ui.canWrite = await acquireWriter();
  await guard(reload);
  // 重整前有一場打到一半：直接打開面板讓玩家重打
  const r = run();
  if (r && r.phase === 'active') show();
}

/** 除錯用（只有開關打開時才有） */
export const debug = {
  state: () => ({ ...ui, db: !!ui.db, root: !!ui.root, draw: !!ui.draw }),
  exportAll: async () => (await ensureDb()).exportAll(),
  reload,
  show,
  actions: { startNewRun, fight, pick, branch, depart, sendIn, swap, choose },
  /**
   * 電腦對電腦打某一站（不寫存檔），用來檢查場地規則會不會卡死。
   * 回傳 false 表示遊戲本體還沒好或有其他模式在用。結束後呼叫 soakStop()。
   */
  soak: (nodeId: string, lead: CharacterId = 'pikachu', mods?: Record<string, number>, mechs?: MechId[], cpu = true): boolean => {
    const node = resolveMatch(nodeId, 'soak');
    if (!node || match.playing()) return false;
    hide();
    return match.start({
      matchId: 'soak/' + nodeId, p1: lead, p2: node.opp, score: node.score, cpuP1: cpu,
      field: { title: matchName(node), hearts: 3, maxHearts: 3, rule: node.rule, diff: node.diff, boss: node.boss, mods: mods as never, mechs },
    }, () => { /* 不結算 */ }, () => { /* 不處理 */ });
  },
  soakStop: () => match.stop(true),
  mechFired,
};
