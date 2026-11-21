/**
 * 章節：把每一章的節點、站、岔路、圖鑑位置合起來。
 * 失敗的單位是「章」：心用完回到這一章的開頭（一命到底模式除外）。每章開始時心回滿；卡槽隨章成長。
 */
import { CH1_DEX, CH1_FORKS, CH1_NODES, CH1_POOLS, CH1_STOPS } from './chapter1';
import { CH2_DEX, CH2_FORKS, CH2_NODES, CH2_POOLS, CH2_STOPS } from './chapter2';
import { CH3_DEX, CH3_FORKS, CH3_NODES, CH3_POOLS, CH3_STOPS } from './chapter3';
import type { MatchNode, NodeDef, Stops } from './nodes';

export interface ChapterDef { id: string; first: string; slots: number; stops: Stops }
export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'c1', first: 'warmup', slots: 2, stops: CH1_STOPS },
  { id: 'c2', first: 'gate', slots: 3, stops: CH2_STOPS },
  { id: 'c3', first: 'c3gate', slots: 4, stops: CH3_STOPS },
];
export const NODES: readonly NodeDef[] = [...CH1_NODES, ...CH2_NODES, ...CH3_NODES];
/** 第一章的站（地圖沒指定章時的預設） */
export const STOPS: Stops = CH1_STOPS;
/** 岔路口 → 它分出去的那一站（在它那一章的第幾站） */
export const FORK_OF: Readonly<Record<string, number>> = { ...CH1_FORKS, ...CH2_FORKS, ...CH3_FORKS };

const BY_ID = new Map<string, NodeDef>(NODES.map((n) => [n.id, n]));
export function nodeById(id: string): NodeDef | undefined { return BY_ID.get(id); }
/** 不帶種子：岔路空位只回傳樣板（對手是佔位）。要知道這一輪實際的對手，用 route.ts 的 resolveMatch */
export function matchNode(id: string): MatchNode | undefined { const n = nodeById(id); return n && n.kind === 'match' ? n : undefined; }

/** 這個節點在第幾章（岔路口算在它分出去的那一章） */
export function chapterOf(id: string): number {
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (CHAPTERS[i].stops.some((st) => st.indexOf(id) >= 0)) return i;
    const n = nodeById(id);
    if (n && n.kind === 'fork' && CHAPTERS[i].stops.some((st) => st.indexOf(n.options[0]) >= 0)) return i;
  }
  return 0;
}
export function cardSlots(chapter: number): number { const c = CHAPTERS[chapter]; return c ? c.slots : CHAPTERS[0].slots; }

/** 這一版收得到的角色 → 在哪裡（fork = 岔路，每一輪抽到的不一樣） */
export const DEX_WHERE: Readonly<Record<string, string>> = (() => {
  const w: Record<string, string> = { ...CH1_DEX, ...CH2_DEX, ...CH3_DEX };
  CH1_POOLS.concat(CH2_POOLS, CH3_POOLS).forEach((pool) => pool.forEach((id) => { if (!w[id]) w[id] = 'fork'; }));
  return w;
})();
