/**
 * 隊伍：上場／備援、親密度（滿了就覺醒）、後援換人，以及上場夥伴的進化之力說明。
 */
import { fmt } from '../../../core/i18n';
import { AWAKEN_AT, PARTY_MAX, auraColorOf, bondLevel, canAwaken } from '../content';
import { hasChallenge } from '../logic';
import { T } from '../texts';
import type { ExpeditionRun, ProfileV1 } from '../types';
import { sendIn, swap } from './actions';
import { charName } from './names';
import { profile, ui, view } from './state';
import { button, el, portrait } from './widgets';

/** 跨輪的羈絆等級（上場身分的累計勝場） */
export function levelOf(p: ProfileV1 | null, id: string): number { return bondLevel(((p && p.bondXp) || {})[id] || 0); }

/** 親密度那一行：●●○○、覺醒了就寫借來的力量 */
function friendLine(r: ExpeditionRun, id: string): HTMLElement {
  if (r.awakened.indexOf(id) >= 0) {
    const e = el('div', 'pv-exp-awake', '★ ' + (T.awakenName[id] || ''));
    e.style.color = auraColorOf(id);
    return e;
  }
  if (!canAwaken(id)) return el('div', 'pv-exp-dim', T.noAwaken);
  const b = Math.min(AWAKEN_AT, r.bond[id] || 0);
  return el('div', 'pv-exp-friend', T.bondLabel + ' ' + '●'.repeat(b) + '○'.repeat(AWAKEN_AT - b));
}

export function partyView(r: ExpeditionRun, canSwitch: boolean): HTMLElement {
  const wrap = el('div'), p = profile();
  const row = el('div', 'pv-exp-party');
  const solo = hasChallenge(r, 'solo');
  const picking = canSwitch && !solo && ui.swapPick && r.benchIds.indexOf(ui.swapPick) >= 0 ? ui.swapPick : '';
  r.partyIds.forEach((id, i) => {
    const awake = r.awakened.indexOf(id) >= 0;
    const cell = el('div', 'pv-exp-mate' + (i === 0 ? ' lead' : '') + (awake ? ' awake' : ''));
    if (awake) cell.style.setProperty('--aura', auraColorOf(id));
    cell.appendChild(portrait(id, i === 0 ? 44 : 34));
    const txt = el('div');
    const name = el('b', '', charName(id) + (awake ? '★' : ''));
    const lv = levelOf(p, id);
    if (lv >= 2) name.appendChild(el('span', 'pv-exp-lv', 'Lv' + lv));
    txt.appendChild(name);
    txt.appendChild(el('div', 'pv-exp-dim', i === 0 ? T.lead : T.backup));
    txt.appendChild(friendLine(r, id));
    cell.appendChild(txt);
    if (picking) cell.appendChild(button(fmt(T.swapWith, { name: charName(id) }), () => swap(picking, id), 'small main'));
    else if (i > 0 && canSwitch && !solo) cell.appendChild(button(T.switchLead, () => sendIn(id), 'small'));
    row.appendChild(cell);
  });
  if (picking && r.partyIds.length < PARTY_MAX) row.appendChild(button(T.joinParty, () => swap(picking, null), 'small main'));
  wrap.appendChild(row);
  wrap.appendChild(powerNote(r));
  if (r.benchIds.length) {
    const bench = el('div', 'pv-exp-bench');
    bench.appendChild(el('span', 'pv-exp-dim', T.bench + '：'));
    r.benchIds.forEach((id) => {
      const b = button('', () => { ui.swapPick = ui.swapPick === id ? '' : id; view.render(); }, 'char small' + (picking === id ? ' on' : ''));
      b.appendChild(portrait(id, 26)); b.appendChild(el('span', '', charName(id)));
      if (!canSwitch || solo) b.disabled = true;
      bench.appendChild(b);
    });
    if (picking) bench.appendChild(button(T.cancel, () => { ui.swapPick = ''; view.render(); }, 'small'));
    wrap.appendChild(bench);
    if (canSwitch && !solo) wrap.appendChild(el('div', 'pv-exp-dim', T.benchHint));
  }
  return wrap;
}

/** 上場夥伴的進化之力：還沒覺醒就說怎麼覺醒、覺醒後會怎樣；覺醒了就說現在的效果 */
function powerNote(r: ExpeditionRun): HTMLElement {
  const lead = r.partyIds[0], d = el('details', 'pv-exp-journal');
  const awake = r.awakened.indexOf(lead) >= 0;
  d.appendChild(el('summary', '', T.awakenTitle + '：' + (canAwaken(lead) ? T.awakenName[lead] || '' : T.noAwaken)));
  if (canAwaken(lead)) {
    if (!awake) d.appendChild(el('div', 'pv-exp-dim', fmt(T.friendHint, { n: AWAKEN_AT })));
    d.appendChild(el('div', '', T.awakenDesc[lead] || ''));
    d.appendChild(el('div', 'pv-exp-dim', lead === 'magikarp' ? T.evolveNote : T.awakenNote));
  }
  return d;
}
