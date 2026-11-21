/**
 * 開新的一輪：模式、難度、挑戰規則（通關過一次才有）、上場的夥伴和（可以不帶的）備援。
 */
import { CHALLENGES, PARTY_MAX, RANK_MAX } from '../content';
import { T } from '../texts';
import type { ChallengeId, RunMode } from '../types';
import { challengesOpen, startNewRun } from './actions';
import { charName } from './names';
import { levelOf } from './party';
import { partners, profile, ui, view } from './state';
import { button, el, portrait } from './widgets';

function toggle(id: ChallengeId): void {
  const i = ui.challenges.indexOf(id);
  if (i >= 0) ui.challenges.splice(i, 1); else ui.challenges.push(id);
  view.render();
}

function challengeView(body: HTMLElement): void {
  if (!challengesOpen(profile())) { body.appendChild(el('div', 'pv-exp-dim', T.challengeLocked)); return; }
  body.appendChild(el('p', '', T.challengeTitle));
  const row = el('div', 'pv-exp-chars');
  CHALLENGES.forEach((id) => row.appendChild(button(T.challengeName[id] || id, () => toggle(id), 'small' + (ui.challenges.indexOf(id) >= 0 ? ' on' : ''))));
  body.appendChild(row);
  ui.challenges.forEach((id) => body.appendChild(el('div', 'pv-exp-dim', '・' + (T.challengeName[id] || id) + '：' + (T.challengeDesc[id] || ''))));
}

export function chooser(body: HTMLElement, again: boolean): void {
  const list = partners(), p = profile();
  if (list.indexOf(ui.partner) < 0) ui.partner = list[0];
  if (ui.backup === ui.partner || list.indexOf(ui.backup) < 0) ui.backup = '';
  if (!challengesOpen(p)) ui.challenges = [];
  const grid = (title: string, cur: string, set: (id: string) => void, none: boolean, skip: string): void => {
    body.appendChild(el('p', '', title));
    const g = el('div', 'pv-exp-chars');
    if (none) g.appendChild(button(T.noBackup, () => { set(''); view.render(); }, cur === '' ? 'on' : ''));
    list.filter((id) => id !== skip).forEach((id) => {
      const b = button('', () => { set(id); view.render(); }, 'char' + (id === cur ? ' on' : ''));
      b.appendChild(portrait(id, 36)); b.appendChild(el('span', '', charName(id)));
      const lv = levelOf(p, id);
      if (lv >= 2) b.appendChild(el('span', 'pv-exp-lv', 'Lv' + lv));
      g.appendChild(b);
    });
    body.appendChild(g);
  };
  body.appendChild(el('p', '', T.modeTitle));
  const modes = el('div', 'pv-exp-chars');
  const MODES: readonly RunMode[] = ['chapter', 'ironman'];
  MODES.forEach((m) => modes.appendChild(button(m === 'chapter' ? T.modeChapter : T.modeIronman, () => { ui.mode = m; view.render(); }, ui.mode === m ? 'on' : '')));
  body.appendChild(modes);
  body.appendChild(el('div', 'pv-exp-dim', ui.mode === 'chapter' ? T.modeChapterDesc : T.modeIronmanDesc));
  const unlockedRank = Math.min(RANK_MAX, (p && p.rankUnlocked) || 0);
  if (ui.rank > unlockedRank) ui.rank = unlockedRank;
  body.appendChild(el('p', '', T.rankTitle));
  const ranks = el('div', 'pv-exp-chars');
  for (let k = 0; k <= RANK_MAX; k++) {
    const rb = button(T.rankName[k], () => { ui.rank = k; view.render(); }, ui.rank === k ? 'on' : '');
    if (k > unlockedRank) { rb.disabled = true; rb.title = T.rankLocked; }
    ranks.appendChild(rb);
  }
  body.appendChild(ranks);
  body.appendChild(el('div', 'pv-exp-dim', T.rankDesc[ui.rank] + (unlockedRank < RANK_MAX ? '　' + T.rankLocked : '')));
  challengeView(body);
  const random = ui.challenges.indexOf('random') >= 0, solo = ui.challenges.indexOf('solo') >= 0;
  if (random) body.appendChild(el('p', 'pv-exp-note', T.randomNote));
  else {
    grid(T.partner, ui.partner, (id) => { ui.partner = id; }, false, '');
    if (!solo && PARTY_MAX > 1 && list.length > 1) grid(T.pickBackup, ui.backup, (id) => { ui.backup = id; }, true, ui.partner);
  }
  if (ui.canWrite) body.appendChild(button(again ? T.again : T.newRun, startNewRun, 'main'));
}
