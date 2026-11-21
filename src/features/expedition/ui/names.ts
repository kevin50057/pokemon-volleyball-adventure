/**
 * 畫面上要用的名字：角色、站、這一輪的名字、章節，以及地圖上藏起來的站。純函式（除了圖用隨機數的快取）。
 */
import { fmt } from '../../../core/i18n';
import { CHARACTER_IDS, type CharacterId } from '../../../core/types';
import { CHARS } from '../../characters';
import { CHAPTERS, NODES, type MatchNode, type Stops } from '../content';
import { mewOpen } from '../logic';
import { rngFor } from '../rng';
import { resolveMatch } from '../route';
import { T } from '../texts';
import type { ExpeditionRun, ProfileV1 } from '../types';
import { sceneNumbers } from './art';
import { ui } from './state';

export function charName(id: string): string { const c = CHARS.byId[id]; return c ? c.name : id; }
export function nodeName(id: string): string { return T.nodeName[id] || id; }
/** 字串 → 角色 id（不認得的回 undefined） */
export function charId(id: string): CharacterId | undefined { return CHARACTER_IDS.find((c) => c === id); }

export function runName(r: ExpeditionRun): string {
  return rngFor(r.seed, 'run', 'event', r.rngVersion).pick(T.runNames) + ' #' + r.seed.slice(0, 4).toUpperCase();
}
export function chapterLabel(r: Pick<ExpeditionRun, 'chapter'>): string {
  const c = CHAPTERS[r.chapter];
  return fmt(T.chapterLine, { n: r.chapter + 1, name: (c && T.chapterName[c.id]) || '' });
}
/** 比賽站的名字：岔路空位用抽到的對手取名（同一輪同一章對手不會重複），其他站用固定的名字 */
export function matchName(node: MatchNode): string {
  if (!node.slot) return nodeName(node.id);
  return T.placeByOpp[node.opp] || nodeName(node.id);
}
export function nameOf(id: string, seed: string): string { const m = resolveMatch(id, seed); return m ? matchName(m) : nodeName(id); }
export function stopsOf(r: ExpeditionRun): Stops { return (CHAPTERS[r.chapter] || CHAPTERS[0]).stops; }

/** 地圖上還不能看的站（藏起來的岔路，例如幻之間） */
export function veiledOf(r: ExpeditionRun, p: ProfileV1 | null): string[] {
  if (p && mewOpen(r, p)) return [];
  const out: string[] = [];
  NODES.forEach((n) => { if (n.kind === 'fork' && n.hidden) out.push(n.hidden); });
  return out;
}
export function stopNames(seed: string, veiled: readonly string[] = []): Record<string, string> {
  const names: Record<string, string> = {};
  CHAPTERS.forEach((c) => c.stops.forEach((st) => st.forEach((id) => { names[id] = veiled.indexOf(id) >= 0 ? T.mewHidden : nameOf(id, seed); })));
  return names;
}
/** 這一輪的圖用隨機數（雲、星星），換輪才重算 */
export function nums(seed: string): number[] {
  if (ui.numsSeed !== seed) { ui.nums = sceneNumbers(seed); ui.numsSeed = seed; }
  return ui.nums;
}
