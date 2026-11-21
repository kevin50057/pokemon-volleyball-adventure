/** 訓練家手冊：用 profile 重算目標，新達成的記下來、把獎勵的卡放進卡池。不改輸入。 */
import { GOALS } from '../content';
import type { ExpeditionRun, ProfileV1 } from '../types';

export function refreshGoals(p: ProfileV1): { profile: ProfileV1; achieved: string[] } {
  const goals: Record<string, 1> = { ...(p.goals || {}) }, pool = (p.cardPool || []).slice(), achieved: string[] = [];
  GOALS.forEach((g) => {
    if (goals[g.id] || g.progress(p) < g.need) return;
    goals[g.id] = 1;
    achieved.push(g.id);
    if (g.card && pool.indexOf(g.card) < 0) pool.push(g.card);
  });
  return achieved.length ? { profile: { ...p, goals, cardPool: pool }, achieved } : { profile: p, achieved };
}

/** 這一輪新覺醒的夥伴記進圖鑑（看過覺醒），再重算手冊；沒有新的回 null */
export function noteAwakened(p: ProfileV1, run: Pick<ExpeditionRun, 'awakened'>): { profile: ProfileV1; achieved: string[] } | null {
  const seen = p.awakenedSeen || [];
  const add = run.awakened.filter((id) => seen.indexOf(id) < 0);
  return add.length ? refreshGoals({ ...p, awakenedSeen: seen.concat(add) }) : null;
}
