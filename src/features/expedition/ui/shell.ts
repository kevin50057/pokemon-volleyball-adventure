/**
 * 面板的外殼：掛到頁面上、開關、畫布的動畫迴圈、選單上的入口按鈕，以及除錯用的介面。
 */
import { nextZ } from '../../../core/services';
import type { CharacterId } from '../../../core/types';
import type { Mods } from '../cards';
import type { MechId } from '../content';
import { acquireWriter } from '../env';
import * as match from '../match/adapter';
import { awakenFired } from '../match/awaken';
import { fired as mechFired } from '../match/mech';
import { resolveMatch } from '../route';
import { T } from '../texts';
import * as actions from './actions';
import { matchName } from './names';
import { render } from './render';
import { run, setView, ui } from './state';
import { CSS } from './css';
import { el } from './widgets';

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
export function hide(): void {
  if (!ui.root) return;
  // 比賽暫停中（切到背景或失焦回來）：面板不能關，不然畫面停住卻沒有任何提示。要按「繼續」或「放棄本場」
  if (ui.pausedHidden && match.playing()) return;
  ui.root.style.display = 'none';
}

setView({ render, show, hide });

export async function mount(): Promise<void> {
  const st = el('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = el('div');
  ui.root = root;
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
  await actions.guard(actions.reload);
  // 重整前有一場打到一半：直接打開面板讓玩家重打（主線沒有的話看每日遠征）
  const r = run();
  if (r && r.phase === 'active') { show(); return; }
  let daily = false;
  await actions.guard(async () => { daily = await actions.activeIn('daily'); });
  if (daily) { await actions.switchTab('daily'); show(); }
}

/** 除錯用（只有開關打開時才有） */
export const debug = {
  state: () => ({ ...ui, db: !!ui.db, root: !!ui.root, draw: !!ui.draw }),
  exportAll: actions.exportAll,
  reload: actions.reload,
  show,
  actions: {
    startNewRun: actions.startNewRun, startDaily: actions.startDaily, fight: actions.fight, pick: actions.pick, branch: actions.branch,
    depart: actions.depart, sendIn: actions.sendIn, swap: actions.swap, choose: actions.choose, switchTab: actions.switchTab,
  },
  /**
   * 電腦對電腦打某一站（不寫存檔），用來檢查場地規則會不會卡死。
   * 回傳 false 表示遊戲本體還沒好或有其他模式在用。結束後呼叫 soakStop()。
   * awakened：左邊的夥伴當作已經覺醒；bossStart：首領從第幾階段開始。
   */
  soak: (nodeId: string, lead: CharacterId = 'pikachu', mods?: Mods, mechs?: MechId[], cpu = true, awakened = false, bossStart = 0): boolean => {
    const node = resolveMatch(nodeId, 'soak');
    if (!node || match.playing()) return false;
    hide();
    return match.start({
      matchId: 'soak/' + nodeId, p1: lead, p2: node.opp, score: node.score, cpuP1: cpu,
      field: { title: matchName(node), hearts: 3, maxHearts: 3, leadName: lead, rule: node.rule, diff: node.diff, boss: node.boss, bossStart, mods, mechs, awakened },
    }, () => { /* 不結算 */ }, () => { /* 不處理 */ });
  },
  soakStop: () => match.stop(true),
  /** 左邊也交給電腦打（照樣結算、寫存檔） */
  autoplay: (on: boolean): void => { ui.autoplay = on; },
  mechFired,
  awakenFired,
};
