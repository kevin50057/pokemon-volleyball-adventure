// 排一輪的對手順序、開新的一輪
import { CFG, zoneOf } from './config';
import { save } from './state';
import { owned, persist } from './save';

function shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
export function buildOrder(char: string): string[] {
  let order: string[] = [];
  CFG.zones.forEach(function (z) {
    if (z.boss) { order.push('mewtwo'); return; }
    if (z.fixed) order = order.concat(z.fixed);
    if (z.pool) {
      // 不抽到跟自己一樣的；還沒收服的優先
      const pool = shuffle(z.pool.filter(function (id) { return id !== char; }));
      pool.sort(function (a, b) { return (owned(a) ? 1 : 0) - (owned(b) ? 1 : 0); });
      order = order.concat(shuffle(pool.slice(0, z.draw)));
    }
    if (z.last) order.push(z.last);
  });
  for (let i = 0; i < order.length - 1; i++) {
    if (order[i] !== char) continue;
    const free = function (id: string) { return id !== char && order.indexOf(id) < 0; };
    let spare = shuffle((zoneOf(i).pool || []).filter(free));
    if (!spare.length) spare = shuffle(CFG.starters.filter(free));
    spare.sort(function (a, b) { return (owned(a) ? 1 : 0) - (owned(b) ? 1 : 0); });
    if (spare.length) order[i] = spare[0];
  }
  return order;
}
export function newRun(char: string): void {
  save.run = { char: char, order: buildOrder(char), idx: 0, hearts: CFG.hearts, bossPhase: 1, frames: 0, lost: 0, att: {} };
  persist();
}
