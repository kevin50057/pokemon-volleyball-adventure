/**
 * 卡牌與羈絆的計算（純函式）。SPEC §4.1：依 ID 排序後相乘、最後做上下限；同一張卡不會重複生效。
 */
import { BONDS, BOND_NEED, CAPS, CARD_SLOTS, CARDS, CHAR_TAG, cardById, type Stat, type Tag } from './content';
import type { Rng } from './rng';

export type Mods = Record<Stat, number>;
export const STATS: readonly Stat[] = ['move', 'jump', 'spike', 'dive'];

export function activeBonds(lead: string, equipped: readonly string[]): Tag[] {
  const n: Record<Tag, number> = { thunder: 0, wind: 0, fire: 0, water: 0 };
  const t = CHAR_TAG[lead];
  if (t) n[t]++;
  uniqueSorted(equipped).forEach((id) => { const c = cardById(id); if (c && c.tag) n[c.tag]++; });
  return (Object.keys(n) as Tag[]).filter((k) => n[k] >= BOND_NEED).sort();
}

function uniqueSorted(ids: readonly string[]): string[] { return Array.from(new Set(ids)).sort(); }

/** 卡 × 羈絆（還沒乘角色本身、還沒做上下限） */
export function cardMods(lead: string, equipped: readonly string[]): Mods {
  const m: Mods = { move: 1, jump: 1, spike: 1, dive: 1 };
  uniqueSorted(equipped).slice(0, CARD_SLOTS).forEach((id) => {
    const c = cardById(id);
    if (!c) return;
    STATS.forEach((s) => { const v = c.mods[s]; if (v !== undefined) m[s] *= v; });
  });
  activeBonds(lead, equipped).forEach((tag) => { const b = BONDS[tag]; m[b.stat] *= b.mult; });
  return m;
}

/** 乘上角色本身的倍率之後做上下限；角色本身就超出範圍的（不該發生）維持角色原本的值 */
export function capped(stat: Stat, charBase: number, cardMult: number): number {
  if (cardMult === 1) return charBase;
  const [lo, hi] = CAPS[stat];
  return Math.min(Math.max(charBase * cardMult, Math.min(lo, charBase)), Math.max(hi, charBase));
}

/** 三選一：從還沒有的卡裡抽，最多 3 張；不夠就少給，沒有就空的。同一個 rng 得到同樣的結果。 */
export function offerCards(owned: readonly string[], rng: Rng, n = 3): string[] {
  const pool = CARDS.map((c) => c.id).filter((id) => owned.indexOf(id) < 0);
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(i + 1); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, n);
}
