/**
 * 每一輪的路線：岔路空位的對手和場地規則由種子決定（rngFor(seed, forkId, 'route')）。
 * 同一個種子、同一個內容版本，重整幾次都是同一條路線；不需要存進存檔。
 */
import type { CharacterId } from '../../core/types';
import { NODES, RULE_POOL, chapterOf, matchNode, type MatchNode, type RuleId } from './content';
import { rngFor } from './rng';

interface Pick { opp: CharacterId; rule?: RuleId }
const cache = new Map<string, Record<string, Pick>>();

/** 這個種子的所有空位（依岔路順序抽；同一章裡同一隻對手不會出現兩次） */
export function routeOf(seed: string): Record<string, Pick> {
  const hit = cache.get(seed);
  if (hit) return hit;
  const out: Record<string, Pick> = {};
  let used = new Set<string>(), ch = -1;
  const forks = NODES.filter((n) => n.kind === 'fork');
  forks.forEach((f) => {
    if (f.kind !== 'fork') return;
    const c = chapterOf(f.id);
    if (c !== ch) { ch = c; used = new Set<string>(); }
    const rng = rngFor(seed, f.id, 'route');
    const rules = RULE_POOL.slice();
    f.options.forEach((id) => {
      const t = matchNode(id);
      if (!t || !t.slot) return;
      const pool = t.slot.pool.filter((c) => !used.has(c));
      const opp = (pool.length ? pool : t.slot.pool)[rng.int(pool.length || t.slot.pool.length)];
      used.add(opp);
      const rule = rules.splice(rng.int(rules.length), 1)[0];
      out[id] = rule ? { opp, rule } : { opp };
    });
  });
  if (cache.size > 50) cache.clear();
  cache.set(seed, out);
  return out;
}

/** 這一輪實際的比賽節點（岔路空位換成抽到的對手和規則；其他節點原樣回傳） */
export function resolveMatch(id: string, seed: string): MatchNode | undefined {
  const t = matchNode(id);
  if (!t || !t.slot) return t;
  const p = routeOf(seed)[id];
  if (!p) return t;
  const n: MatchNode = { ...t, opp: p.opp };
  if (p.rule) n.rule = p.rule; else delete n.rule;
  return n;
}
