/**
 * 每日遠征的分頁（沒有進行中的每日遠征時）：今天的章節、三隻可選的夥伴、起始卡、連續天數、最近紀錄。
 */
import { fmt } from '../../../core/i18n';
import { CHAPTERS } from '../content';
import { dailyPlan, liveStreak, utcDate } from '../logic';
import { T } from '../texts';
import { startDaily } from './actions';
import { charName } from './names';
import { profile, ui, view } from './state';
import { button, cardView, el, portrait } from './widgets';

const HISTORY_SHOWN = 7;

export function dailyPanel(body: HTMLElement): void {
  const plan = dailyPlan(utcDate(Date.now())), p = profile(), d = p && p.daily;
  if (plan.partners.indexOf(ui.dailyPartner) < 0) ui.dailyPartner = plan.partners[0];
  const box = el('div', 'pv-exp-daily');
  box.appendChild(el('b', '', fmt(T.dailyTitle, { date: plan.date })));
  const ch = CHAPTERS[plan.chapter];
  box.appendChild(el('p', '', fmt(T.dailyDesc, { n: plan.chapter + 1, name: (ch && T.chapterName[ch.id]) || '' })));
  const g = el('div', 'pv-exp-chars');
  plan.partners.forEach((id) => {
    const b = button('', () => { ui.dailyPartner = id; view.render(); }, 'char' + (id === ui.dailyPartner ? ' on' : ''));
    b.appendChild(portrait(id, 36)); b.appendChild(el('span', '', charName(id)));
    g.appendChild(b);
  });
  box.appendChild(g);
  if (plan.cards.length) {
    box.appendChild(el('div', 'pv-exp-dim', T.dailyCards));
    const row = el('div', 'pv-exp-cards');
    plan.cards.forEach((id) => row.appendChild(cardView(id, null, true)));
    box.appendChild(row);
  }
  const today = d ? d.history.filter((h) => h.date === plan.date)[0] : undefined;
  if (today) box.appendChild(el('p', 'pv-exp-note', fmt(T.dailyDone, { score: today.score })));
  if (ui.canWrite) box.appendChild(button(today ? T.dailyNew : T.dailyStart, startDaily, 'main'));
  body.appendChild(box);
  if (d) {
    body.appendChild(el('div', 'pv-exp-dim', fmt(T.dailyStreak, { n: liveStreak(d, plan.date), best: d.bestStreak })));
    if (d.history.length) {
      body.appendChild(el('b', '', T.dailyHistory));
      const hist = el('div', 'pv-exp-hist');
      d.history.slice(-HISTORY_SHOWN).reverse().forEach((h) => {
        hist.appendChild(el('span', '', h.date));
        hist.appendChild(el('span', '', fmt(T.dailyScore, { score: h.score })));
        hist.appendChild(el('span', 'pv-exp-dim', h.cleared ? T.dailyCleared : T.dailyFailed));
      });
      body.appendChild(hist);
    }
  }
}
