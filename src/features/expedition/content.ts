/**
 * 遠征的路線內容。M1 只有一個節點、一場沒有任何修飾的比賽，用來驗證「地圖 → 開打 → 結算」整條路。
 * M2 換成 SPEC §2 的五節點短切片。
 */
import type { CharacterId } from '../../core/types';

export interface NodeDef {
  id: string;
  opp: CharacterId;
  /** 搶幾分 */
  score: number;
}

export const ROUTE: readonly NodeDef[] = [
  { id: 'm1-warmup', opp: 'magikarp', score: 5 },
];

export const START_HEARTS = 3;

export function nodeById(id: string): NodeDef | undefined {
  return ROUTE.find((n) => n.id === id);
}
