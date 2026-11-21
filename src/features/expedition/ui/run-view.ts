/**
 * 進行中的一輪：依 phase 和所在的站顯示該做的事（三選一、重打、岔路、奇遇、補給站、開打），
 * 以及打完之後的明信片。主線和每日遠征共用這一份。
 */
import { fmt } from '../../../core/i18n';
import { AWAKEN_AT, EVENTS, FORK_OF, canAwaken, isFill, nodeById } from '../content';
import { eventOf, forkOptions, heartCap, isPassive, slotsOf } from '../logic';
import * as match from '../match/adapter';
import { resolveMatch } from '../route';
import { T } from '../texts';
import type { ExpeditionRun } from '../types';
import { branch, choose, depart, discard, fight, forfeit, pick, resume } from './actions';
import { chapterLabel, charName, nodeName, stopsOf } from './names';
import { journalView, nodeCard, secretCard, tip } from './node-card';
import { partyView } from './party';
import { mapStage, postcardView, sceneOk } from './stage-view';
import { ended, profile, ui, view } from './state';
import { bonusView, button, cardView, el, portrait } from './widgets';

/** 這一輪的狀態列：第幾章、第幾站、模式、難度、挑戰、重來次數 */
function statusLine(r: ExpeditionRun): string {
  const STOPS = stopsOf(r), stop = FORK_OF[r.nodeId] !== undefined ? FORK_OF[r.nodeId] : STOPS.findIndex((s) => s.indexOf(r.nodeId) >= 0);
  return chapterLabel(r) + '｜' + fmt(T.stopOf, { n: (stop < 0 ? 1 : stop) + 1, total: STOPS.length })
    + '｜' + (r.daily ? T.tabDaily : r.mode === 'ironman' ? T.modeIronman : T.modeChapter) + (r.rank ? '｜' + T.rankName[r.rank] : '')
    + (r.challenges.length ? '｜' + r.challenges.map((c) => T.challengeName[c] || c).join('・') : '')
    + (r.chapterRetries ? '｜' + fmt(T.retries, { n: r.chapterRetries }) : '');
}

/** 裝備中的卡、常駐的卡、目前的加成 */
function cardsRow(body: HTMLElement, r: ExpeditionRun, equipped: readonly string[]): void {
  const passive = r.ownedCardIds.filter(isPassive);
  if (!equipped.length && !passive.length) return;
  const row = el('div', 'pv-exp-cards');
  equipped.forEach((id) => row.appendChild(cardView(id, null, true)));
  passive.forEach((id) => row.appendChild(cardView(id, null, true)));
  body.appendChild(row);
  body.appendChild(bonusView(r.partyIds[0], equipped, r.partyIds[1]));
}

function rewardView(body: HTMLElement, offered: readonly string[]): void {
  body.appendChild(el('b', '', T.rewardTitle));
  const row = el('div', 'pv-exp-cards');
  offered.forEach((id) => row.appendChild(cardView(id, () => pick(id), false)));
  body.appendChild(row);
  if (!offered.every(isFill)) body.appendChild(el('div', 'pv-exp-dim', T.bondHint));
  body.appendChild(button(T.skip, () => pick(null), 'small'));
}

function forkView(body: HTMLElement, r: ExpeditionRun, forkId: string): void {
  const n = nodeById(forkId), p = profile();
  if (!n || n.kind !== 'fork') return;
  const open = p ? forkOptions(r, p, forkId) : n.options.filter((o) => o !== n.hidden);
  body.appendChild(el('b', '', T.forkTitle));
  const row = el('div', 'pv-exp-fork');
  n.options.forEach((id) => {
    const o = resolveMatch(id, r.seed);
    if (!o) return;
    if (open.indexOf(id) >= 0) row.appendChild(nodeCard(o, button(T.choose, () => branch(id), 'main'), r));
    else row.appendChild(secretCard(o.opp));
  });
  body.appendChild(row);
}

function eventView(body: HTMLElement, r: ExpeditionRun): void {
  const ev = eventOf(r);
  if (!ev) return;
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
    if (ch === 'stone') {
      // 進化之石：選一隻隊伍裡的夥伴（不能覺醒、已經覺醒的不能選）
      box.appendChild(el('div', '', T.eventChoice.stone));
      const row = el('div', 'pv-exp-chars');
      r.partyIds.forEach((id) => {
        const full = r.awakened.indexOf(id) >= 0 || (r.bond[id] || 0) >= AWAKEN_AT;
        const b = button('', () => choose('stone', id), 'char');
        b.appendChild(portrait(id, 30));
        b.appendChild(el('span', '', charName(id) + (!canAwaken(id) ? '（' + T.noAwaken + '）' : full ? '★' : '')));
        if (!canAwaken(id) || full) b.disabled = true;
        row.appendChild(b);
      });
      box.appendChild(row);
      return;
    }
    const why = ch === 'heal' && r.hearts >= heartCap(r) ? T.heartsFull : ch === 'gamble' && r.hearts <= 1 ? T.gambleNo : '';
    const b = button(T.eventChoice[ch] + (why ? '（' + why + '）' : ''), () => choose(ch), ch === 'leave' ? '' : 'main');
    if (why) b.disabled = true;
    box.appendChild(b);
  });
  body.appendChild(box);
}

function supplyView(body: HTMLElement, r: ExpeditionRun, nodeId: string): void {
  const lo = ui.loadout || r.equippedCardIds.slice(), max = slotsOf(r);
  body.appendChild(el('b', '', nodeName(nodeId)));
  body.appendChild(el('p', '', fmt(T.supplyDesc, { max })));
  const tp = tip(r, nodeId); if (tp) body.appendChild(tp);
  const equipable = r.ownedCardIds.filter((id) => !isPassive(id));
  if (!r.ownedCardIds.length) body.appendChild(el('p', 'pv-exp-dim', T.noCards));
  else {
    body.appendChild(el('div', 'pv-exp-dim', fmt(T.slots, { n: lo.length, max }) + '｜' + T.tapToEquip));
    const row = el('div', 'pv-exp-cards');
    equipable.forEach((id) => row.appendChild(cardView(id, () => {
      const i = lo.indexOf(id);
      if (i >= 0) lo.splice(i, 1); else if (lo.length < max) lo.push(id); else return;
      ui.loadout = lo; view.render();
    }, lo.indexOf(id) >= 0)));
    r.ownedCardIds.filter(isPassive).forEach((id) => row.appendChild(cardView(id, null, true)));
    body.appendChild(row);
    body.appendChild(bonusView(r.partyIds[0], lo, r.partyIds[1]));
    body.appendChild(el('div', 'pv-exp-dim', T.bondHint));
  }
  body.appendChild(button(T.depart, depart, 'main'));
}

/** 打完了（通關或倒下）：明信片、結果、日誌；之後接 after（開新的一輪的選單） */
function endedView(body: HTMLElement, r: ExpeditionRun, after: (body: HTMLElement) => void): void {
  // 剛打完最後一場：先看演出，再看明信片
  if (ui.scenes.length) mapStage(body, r); else postcardView(body, r);
  if (ui.note) body.appendChild(el('p', 'pv-exp-note', ui.note));
  body.appendChild(el('p', 'pv-exp-big', r.phase === 'cleared' ? T.cleared : T.failed));
  sceneOk(body, view.render);
  const j = journalView(); if (j) body.appendChild(j);
  after(body);
}

export function runView(body: HTMLElement, r: ExpeditionRun, after: (body: HTMLElement) => void): void {
  if (ended(r)) { endedView(body, r, after); return; }
  mapStage(body, r);
  if (ui.note) body.appendChild(el('p', 'pv-exp-note', ui.note));
  sceneOk(body, view.render);
  const node = nodeById(r.nodeId), mn = resolveMatch(r.nodeId, r.seed);
  body.appendChild(el('div', 'pv-exp-dim', statusLine(r)));
  body.appendChild(partyView(r, ui.canWrite && r.phase === 'map'));
  const atSupply = !!node && node.kind === 'supply' && r.phase === 'map';
  const tail = (): void => {
    if (!atSupply) cardsRow(body, r, r.equippedCardIds);
    const j = journalView(); if (j) body.appendChild(j);
    if (ui.canWrite) body.appendChild(button(T.discard, discard, 'danger small'));
  };
  if (!ui.canWrite) { tail(); return; }
  if (ui.pausedHidden && match.playing()) {
    body.appendChild(el('p', 'pv-exp-note', T.paused));
    body.appendChild(button(T.resume, resume, 'main'));
    body.appendChild(button(T.forfeit, forfeit, 'danger'));
    return;
  }
  if (r.phase === 'reward' && r.pendingReward) rewardView(body, r.pendingReward.offeredCardIds);
  else if (r.phase === 'active' && mn) {
    if (match.playing()) {
      body.appendChild(el('p', 'pv-exp-note', T.inMatch));
      body.appendChild(button(T.backToMatch, view.hide, 'main'));
    } else {
      body.appendChild(nodeCard(mn, null, r));
      body.appendChild(el('p', 'pv-exp-note', T.interrupted));
      body.appendChild(button(T.retry, fight, 'main'));
    }
    body.appendChild(button(T.forfeit, forfeit, 'danger'));
  } else if (node && node.kind === 'fork') forkView(body, r, node.id);
  else if (node && node.kind === 'event') eventView(body, r);
  else if (atSupply) supplyView(body, r, r.nodeId);
  else if (mn) {
    body.appendChild(nodeCard(mn, null, r));
    const tp = tip(r, mn.id); if (tp) body.appendChild(tp);
    body.appendChild(button(T.fight, fight, 'main'));
  }
  tail();
}
