/**
 * 整個面板的組版：標題列和分頁、錯誤、讀檔狀態，再交給各分頁（遠征、每日、圖鑑、手冊）。
 */
import { fmt } from '../../../core/i18n';
import type { DbError } from '../db';
import { T } from '../texts';
import { exportSave, moveAside, switchTab } from './actions';
import { chooser } from './chooser';
import { bookView, dexView } from './collection';
import { dailyPanel } from './daily';
import { runName } from './names';
import { runView } from './run-view';
import { run, ui, view, type Tab } from './state';
import { button, el } from './widgets';

function errorText(e: DbError): string {
  return e.code === 'quota' ? T.errQuota : e.code === 'unavailable' ? T.errUnavailable
    : e.code === 'version' ? T.errVersion : e.code === 'blocked' ? T.errBlocked : T.errOther;
}

const TABS: readonly (readonly [Tab, () => string])[] = [['run', () => T.tabRun], ['daily', () => T.tabDaily], ['dex', () => T.tabDex], ['book', () => T.tabBook]];

export function render(): void {
  const root = ui.root, box = root ? root.querySelector('.pv-exp-box') : null;
  if (!(box instanceof HTMLDivElement)) return;
  ui.draw = null;
  box.textContent = '';
  const r0 = run();
  const head = el('div', 'pv-exp-head');
  head.appendChild(el('b', '', r0 && (ui.tab === 'run' || ui.tab === 'daily') ? runName(r0) : T.title));
  const tabs = el('div', 'pv-exp-tabs');
  TABS.forEach(([id, label]) => tabs.appendChild(button(label(), () => switchTab(id), 'small' + (ui.tab === id ? ' on' : ''))));
  tabs.appendChild(button('×', view.hide, 'x'));
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
  if (ui.tab === 'book') { bookView(body); return; }
  const r = st.run, menu = ui.tab === 'daily' ? dailyPanel : (b: HTMLElement): void => chooser(b, true);
  if (!r) { if (ui.tab === 'daily') dailyPanel(body); else chooser(body, false); return; }
  runView(body, r, menu);
}
