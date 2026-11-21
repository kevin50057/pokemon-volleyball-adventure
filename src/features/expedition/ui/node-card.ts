/**
 * 比賽站的卡片（對手、勝分、收服條件、場地規則或首領說明）、藏起來的岔路、夥伴的一句話、日誌。
 */
import { fmt } from '../../../core/i18n';
import { CAPTURE_CHANCE, EVO_LINES, matchNode, type MatchNode } from '../content';
import { matchSetup, stampsCount } from '../logic';
import { rngFor } from '../rng';
import { resolveMatch } from '../route';
import { T } from '../texts';
import type { ExpeditionRun } from '../types';
import { charName, matchName, nodeName } from './names';
import { profile, run, ui } from './state';
import { el, portrait } from './widgets';

const STAMPS_FOR_DITTO = 3;

function captureLine(node: MatchNode): string {
  const p = profile();
  if (!node.capture || !p) return '';
  if (p.expeditionUnlocked.indexOf(node.opp) >= 0) return T.captureHave;
  if (node.capture === 'stamps3' && stampsCount(p) < STAMPS_FOR_DITTO) return fmt(T.dittoGate, { have: stampsCount(p), need: STAMPS_FOR_DITTO });
  if (node.capture !== 'chance') return T.captureSure;
  return (p.captureMissesByCharacter[node.opp] || 0) > 0 ? T.capturePity : fmt(T.captureChance, { pct: Math.round(CAPTURE_CHANCE * 100) });
}

/** 一站的卡片。r 有給就照這一輪的設定顯示（暴風季的強風、難度加的首領血量、上次打到的階段） */
export function nodeCard(node: MatchNode, action: HTMLElement | null, r: ExpeditionRun | null): HTMLElement {
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
  const setup = r ? matchSetup(r, node) : { rule: node.rule, boss: node.boss, bossStart: 0, score: node.score };
  const boss = setup.boss;
  if (setup.rule) { card.appendChild(el('b', 'pv-exp-rule ' + setup.rule, T.ruleName[setup.rule])); card.appendChild(el('p', '', T.ruleDesc[setup.rule])); }
  else if (boss) {
    card.appendChild(el('p', '', fmt(T.bossDesc2, { a: boss.playerHp, b: boss.hp, n: boss.phases.length, opp: charName(node.opp) })));
    if (setup.bossStart > 0) card.appendChild(el('p', 'pv-exp-note', fmt(T.bossResume, { n: setup.bossStart + 1 })));
  } else card.appendChild(el('p', 'pv-exp-dim', T.noRule));
  if (node.id === 'mewroom') card.appendChild(el('div', 'pv-exp-awk', '✦ ' + T.mewOpen));
  if (action) card.appendChild(action);
  return card;
}

/** 岔路上還不能走的那條：只看得到剪影和條件 */
export function secretCard(opp: string): HTMLElement {
  const card = el('div', 'pv-exp-node pv-exp-secret');
  const head = el('div', 'pv-exp-node-head');
  head.appendChild(portrait(opp, 46, true));
  const tt = el('div');
  tt.appendChild(el('b', '', T.mewHidden));
  tt.appendChild(el('div', 'pv-exp-dim', T.mewHint));
  head.appendChild(tt);
  card.appendChild(head);
  return card;
}

/** 夥伴的一句話（同時是這一站的提示），由種子決定講哪一句 */
export function tip(r: ExpeditionRun, nodeId: string): HTMLElement | null {
  const m = resolveMatch(nodeId, r.seed);
  const lines = m && m.slot ? (m.rule ? T.tipsRule[m.rule] : T.tipsOpp[m.opp]) : T.tips[nodeId];
  if (!lines || !lines.length) return null;
  const box = el('div', 'pv-exp-tip');
  box.appendChild(portrait(r.partyIds[0], 30));
  box.appendChild(el('div', '', charName(r.partyIds[0]) + '：「' + rngFor(r.seed, nodeId, 'event', r.rngVersion).pick(lines) + '」'));
  return box;
}

export function journalLines(): string[] {
  const r = run();
  return ui.journal.map((s) => {
    const node = r ? resolveMatch(s.nodeId, r.seed) : matchNode(s.nodeId), opp = node ? charName(node.opp) : '?';
    let ln = fmt(s.result === 'win' ? T.jWin : s.result === 'loss' ? T.jLoss : T.jForfeit, { node: node ? matchName(node) : nodeName(s.nodeId), a: s.scores[0], b: s.scores[1], opp });
    if (s.capture) ln += '・' + fmt(s.capture.ok ? T.jCaught : T.jMissed, { name: charName(s.capture.char) });
    if (s.awakened) {
      const line = EVO_LINES[s.awakened];
      ln += '・' + (line ? fmt(T.evolveTo, { from: T.formName[line[0]] || line[0], to: T.formName[line[1]] || line[1] })
        : fmt(s.awakened === 'magikarp' ? T.evolveScene : T.awakenScene, { name: charName(s.awakened) }));
    }
    if (s.picked) ln += '・' + fmt(T.jPick, { card: T.cardName[s.picked] || s.picked });
    return ln;
  });
}
export function journalView(): HTMLElement | null {
  if (!ui.journal.length) return null;
  const d = el('details', 'pv-exp-journal');
  d.appendChild(el('summary', '', T.journal + '（' + ui.journal.length + '）'));
  journalLines().forEach((ln) => d.appendChild(el('div', '', ln)));
  return d;
}
