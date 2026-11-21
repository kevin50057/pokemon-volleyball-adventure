/**
 * 遠征（開發版）的畫面：一個面板，依存檔狀態顯示不同內容。
 * M1 只求整條路能走、錯誤看得見，不追求好看；正式的地圖畫面在 M2。
 */
import { fmt } from '../../core/i18n';
import { nextZ, onReady, svc } from '../../core/services';
import type { CharacterId } from '../../core/types';
import { CHARS } from '../characters';
import * as match from './adapter';
import { nodeById } from './content';
import { DbError, ExpeditionDb, type LoadState } from './db';
import { RuleError, newRun } from './logic';
import { newSeed } from './rng';
import { T } from './texts';
import type { ExpeditionRunV1, MatchResult } from './types';
import { acquireWriter } from './env';

const ids = (): readonly string[] => CHARS.ids;

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
  /** 結算完、等玩家看結果 */
  showingResult: false,
};

function run(): ExpeditionRunV1 | null { return ui.state && ui.state.kind === 'ok' ? ui.state.run : null; }
function charName(id: string): string { const c = CHARS.byId[id]; return c ? c.name : id; }
function unlockedChars(): CharacterId[] {
  const cs = svc.charSelect;
  return CHARS.ids.filter((id) => (cs ? cs.unlocked(id) : true));
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
  if (r && r.phase === 'active' && !match.playing()) ui.interrupted = true;
  render();
}

function startNewRun(): Promise<void> {
  return guard(async () => {
    if (!ui.canWrite) return;
    const db = await ensureDb();
    const partner = ui.partner || unlockedChars()[0];
    await db.createRun(newRun(crypto.randomUUID ? crypto.randomUUID() : newSeed(), newSeed(), partner, Date.now()), ids());
    ui.note = '';
    await reload();
  });
}

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
    ui.state = { kind: 'ok', profile: (ui.state as Extract<LoadState, { kind: 'ok' }>).profile, run: r2 };
    const node = nodeById(r2.nodeId);
    if (!node || !r2.matchId) return;
    const ok = match.start({ matchId: r2.matchId, p1: r2.partyIds[0] as CharacterId, p2: node.opp, score: node.score }, onEnd, onInterrupt);
    if (!ok) { ui.note = T.busy; return; }
    ui.interrupted = false; ui.pausedHidden = false; ui.note = ''; ui.showingResult = false;
    hide();
  });
}

function settle(matchId: string, result: MatchResult, scores: [number, number]): Promise<void> {
  return guard(async () => {
    const db = await ensureDb();
    const out = await db.settle(matchId, result, scores, Date.now(), ids());
    ui.state = { kind: 'ok', profile: (ui.state as Extract<LoadState, { kind: 'ok' }>).profile, run: out.run };
    const s = out.settlement, h = out.run.hearts;
    ui.note = s.result === 'win' ? fmt(T.win, { a: s.scores[0], b: s.scores[1] })
      : s.result === 'loss' ? fmt(T.loss, { a: s.scores[0], b: s.scores[1], hearts: h })
        : fmt(T.forfeited, { hearts: h });
    ui.interrupted = false;
  });
}

const onEnd: match.OnEnd = (matchId, result, scores) => {
  // 分出勝負的那一幀就存（不等動畫），存好之後再顯示結果
  ui.showingResult = true;
  void settle(matchId, result, scores).then(() => { setTimeout(() => show(), 1900); });
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
  ui.pausedHidden = false;
  return settle(r.matchId, 'forfeit', scores);
}

function discard(): Promise<void> {
  const r = run();
  if (!r || !ui.canWrite || !window.confirm(T.discardConfirm)) return Promise.resolve();
  return guard(async () => { if (match.playing()) match.stop(true); await (await ensureDb()).discardRun(r.revision, ids()); ui.note = ''; await reload(); });
}

function exportSave(): Promise<void> {
  return guard(async () => {
    const data = await (await ensureDb()).exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pva-expedition-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(label: string, fn: () => unknown, kind = ''): HTMLButtonElement {
  const b = el('button', 'pv-exp-btn ' + kind, label);
  b.type = 'button';
  b.onclick = (e) => { e.stopPropagation(); void fn(); };
  return b;
}

function errorText(e: DbError): string {
  return e.code === 'quota' ? T.errQuota : e.code === 'unavailable' ? T.errUnavailable
    : e.code === 'version' ? T.errVersion : e.code === 'blocked' ? T.errBlocked : T.errOther;
}

function render(): void {
  const root = ui.root;
  if (!root) return;
  const box = root.querySelector('.pv-exp-box') as HTMLDivElement;
  box.textContent = '';
  const head = el('div', 'pv-exp-head');
  head.appendChild(el('b', '', T.title));
  head.appendChild(button('×', hide, 'x'));
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
  if (ui.note) body.appendChild(el('p', 'pv-exp-note', ui.note));
  if (!ui.canWrite) body.appendChild(el('p', 'pv-exp-warn', T.readonly));

  const st = ui.state;
  if (!st) { body.appendChild(el('p', '', T.loading)); return; }
  if (st.kind !== 'ok') {
    body.appendChild(el('p', 'pv-exp-warn', fmt(st.kind === 'corrupt' ? T.corrupt : T.unsupported, { detail: st.what + ' / ' + st.detail })));
    body.appendChild(button(T.exportBtn, exportSave));
    if (st.kind === 'corrupt' && st.what === 'run' && ui.canWrite) body.appendChild(button(T.moveAside, moveAside, 'danger'));
    return;
  }
  const r = st.run;
  if (!r || r.phase === 'cleared' || r.phase === 'failed') {
    if (r) body.appendChild(el('p', 'pv-exp-big', r.phase === 'cleared' ? T.cleared : T.failed));
    body.appendChild(el('p', '', T.partner));
    const list = el('div', 'pv-exp-chars');
    const chars = unlockedChars();
    if (!ui.partner || chars.indexOf(ui.partner as CharacterId) < 0) ui.partner = chars[0];
    chars.forEach((id) => {
      const b = button(charName(id), () => { ui.partner = id; render(); }, id === ui.partner ? 'on' : '');
      list.appendChild(b);
    });
    body.appendChild(list);
    if (ui.canWrite) body.appendChild(button(r ? T.again : T.newRun, startNewRun, 'main'));
    return;
  }
  // 進行中的一輪
  const node = nodeById(r.nodeId);
  const info = el('div', 'pv-exp-info');
  info.appendChild(el('div', '', charName(r.partyIds[0]) + '　' + T.hearts + ' ' + '♥'.repeat(r.hearts) + '♡'.repeat(Math.max(0, 3 - r.hearts))));
  if (node) info.appendChild(el('div', '', T.node + '：' + r.nodeId + '｜' + fmt(T.vs, { opp: charName(node.opp), score: node.score })));
  body.appendChild(info);
  if (!ui.canWrite) return;
  if (ui.pausedHidden && match.playing()) {
    body.appendChild(el('p', 'pv-exp-note', T.paused));
    body.appendChild(button(T.resume, () => { ui.pausedHidden = false; match.resume(); hide(); }, 'main'));
    body.appendChild(button(T.forfeit, forfeit, 'danger'));
    return;
  }
  if (r.phase === 'active') {
    if (ui.showingResult && match.playing()) return;   // 結算中
    if (match.playing()) {
      // 比賽進行中打開面板：可以回去繼續打，或放棄
      body.appendChild(el('p', 'pv-exp-note', T.inMatch));
      body.appendChild(button(T.backToMatch, hide, 'main'));
      body.appendChild(button(T.forfeit, forfeit, 'danger'));
      return;
    }
    body.appendChild(el('p', 'pv-exp-note', T.interrupted));
    body.appendChild(button(T.retry, fight, 'main'));
    body.appendChild(button(T.forfeit, forfeit, 'danger'));
  } else {
    body.appendChild(button(T.fight, fight, 'main'));
  }
  body.appendChild(button(T.discard, discard, 'danger small'));
}

export function show(): void {
  if (!ui.root) return;
  ui.root.style.display = 'flex';
  ui.root.style.zIndex = String(nextZ());
  render();
}
function hide(): void {
  if (!ui.root) return;
  ui.root.style.display = 'none';
  // 看完結果按關閉：回到標題
  if (ui.showingResult) { ui.showingResult = false; if (match.playing()) match.stop(true); }
}

const CSS = [
  '#pv-exp{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:14px/1.5 "Noto Sans TC","Noto Sans KR",sans-serif}',
  '#pv-exp .pv-exp-box{background:#1d2140;color:#fff;border:2px solid #7d8cff;border-radius:12px;max-width:min(560px,94vw);max-height:90vh;overflow:auto;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.5)}',
  '#pv-exp .pv-exp-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:16px}',
  '#pv-exp .pv-exp-btn{display:inline-block;margin:4px 6px 4px 0;padding:7px 12px;border:0;border-radius:8px;background:#3a4170;color:#fff;font:inherit;cursor:pointer}',
  '#pv-exp .pv-exp-btn.main{background:#ff7a3d;font-weight:700}',
  '#pv-exp .pv-exp-btn.danger{background:#6b2a3a}',
  '#pv-exp .pv-exp-btn.small{font-size:12px;padding:4px 8px}',
  '#pv-exp .pv-exp-btn.on{outline:2px solid #ffd54f}',
  '#pv-exp .pv-exp-btn.x{background:none;font-size:20px;padding:0 6px}',
  '#pv-exp .pv-exp-chars{display:flex;flex-wrap:wrap}',
  '#pv-exp .pv-exp-err{background:#5a1f2b;border-radius:8px;padding:8px;margin-bottom:8px}',
  '#pv-exp .pv-exp-err code{display:block;font-size:11px;opacity:.7;word-break:break-all}',
  '#pv-exp .pv-exp-warn{color:#ffcf6b}',
  '#pv-exp .pv-exp-note{color:#9fe0ff}',
  '#pv-exp .pv-exp-big{font-size:18px;font-weight:700}',
].join('');

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
  state: () => ({ ...ui, db: !!ui.db, root: !!ui.root }),
  exportAll: async () => (await ensureDb()).exportAll(),
  reload,
};
