/**
 * 收藏：圖鑑（收服、看過覺醒、通關印章、羈絆等級）和訓練家手冊（看得到條件的目標）。只讀 profile。
 */
import { fmt } from '../../../core/i18n';
import { CHARS } from '../../characters';
import { DEX_WHERE, GOALS, STARTERS, canAwaken } from '../content';
import { T } from '../texts';
import { charName, nodeName } from './names';
import { levelOf } from './party';
import { profile } from './state';
import { el, portrait } from './widgets';

const MAX_LEVEL = 5;

export function dexView(body: HTMLElement): void {
  const p = profile(), got = p ? p.expeditionUnlocked : [];
  const seen = (p && p.awakenedSeen) || [];
  const starter = (id: string): boolean => STARTERS.some((s) => s === id);
  const have = (id: string): boolean => starter(id) || got.indexOf(id) >= 0;
  body.appendChild(el('p', 'pv-exp-note', fmt(T.dexCount, { n: CHARS.ids.filter(have).length, total: CHARS.ids.length })
    + '　★' + T.dexAwakened + ' ' + seen.length + '/' + CHARS.ids.filter(canAwaken).length));
  const grid = el('div', 'pv-exp-dex');
  const order = (id: string): number => (starter(id) ? 0 : DEX_WHERE[id] ? 1 : 2);
  const stamps = (p && p.stamps) || {}, iron = (p && p.ironmanClears) || [];
  const how = (id: string): string => { const w = DEX_WHERE[id]; return w === 'fork' ? T.dexFork : fmt(T.dexHow, { node: nodeName(w) }); };
  CHARS.ids.slice().sort((a, b) => order(a) - order(b)).forEach((id) => {
    const lv = levelOf(p, id);
    const cell = el('div', 'pv-exp-dexcell' + (have(id) ? ' have' : '') + (lv >= MAX_LEVEL ? ' gold' : ''));
    cell.appendChild(portrait(id, 40, !have(id)));
    const name = el('b', '', have(id) || DEX_WHERE[id] ? charName(id) : '？？？');
    if (lv >= 2) name.appendChild(el('span', 'pv-exp-lv', 'Lv' + lv));
    cell.appendChild(name);
    cell.appendChild(el('div', 'pv-exp-dim', starter(id) ? T.dexStarter : have(id) ? T.captureHave : DEX_WHERE[id] ? how(id) : T.dexLater));
    if (seen.indexOf(id) >= 0) cell.appendChild(el('div', 'pv-exp-awk', '★ ' + T.dexAwakened));
    // 通關印章：用這隻通關過的最高難度；一命到底另外標
    if (stamps[id] || iron.indexOf(id) >= 0) cell.appendChild(el('div', 'pv-exp-stamp', (stamps[id] ? '★' + T.rankShort[stamps[id] - 1] : '') + (iron.indexOf(id) >= 0 ? ' ♥' + T.modeIronman : '')));
    grid.appendChild(cell);
  });
  body.appendChild(grid);
}

export function bookView(body: HTMLElement): void {
  const p = profile(), done = (p && p.goals) || {};
  body.appendChild(el('p', 'pv-exp-note', T.bookTitle + '　' + GOALS.filter((g) => done[g.id]).length + '/' + GOALS.length));
  const list = el('div', 'pv-exp-goals');
  GOALS.forEach((g) => {
    const ok = !!done[g.id], n = p ? Math.min(g.need, g.progress(p)) : 0;
    const row = el('div', 'pv-exp-goal' + (ok ? ' done' : ''));
    const txt = el('div', 'txt');
    txt.appendChild(el('b', '', (ok ? '✓ ' : '') + (T.goalName[g.id] || g.id)));
    if (g.card) txt.appendChild(el('div', 'pv-exp-dim', fmt(T.goalUnlock, { card: T.cardName[g.card] || g.card })));
    row.appendChild(txt);
    const bar = el('div', 'bar'), fill = el('i');
    fill.style.width = Math.round(100 * n / g.need) + '%';
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(el('span', 'pv-exp-dim', ok ? T.goalDone : n + '/' + g.need));
    list.appendChild(row);
  });
  body.appendChild(list);
}
