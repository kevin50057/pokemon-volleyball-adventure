/**
 * 關都遠征的資料契約（SPEC §5）。存在 IndexedDB，跟 localStorage 的既有存檔完全分開。
 *
 * 改欄位要升 SCHEMA_VERSION，並在 logic.ts 的 validate* 補上舊版的讀法；
 * 不認得的版本一律當成「不支援」，保留原檔、唯讀，不會被覆寫。
 */
export const SCHEMA_VERSION = 1;
/** 亂數演算法版本：改了 rng.ts 的算法就要加一（同 seed 才會得到同樣的掉落） */
export const RNG_VERSION = 1;
/** 內容版本：路線、對手、勝分等設定改了就要換 */
export const CONTENT_VERSION = 'm1-1';

export type Phase = 'map' | 'active' | 'reward' | 'cleared' | 'failed';
export type MatchResult = 'win' | 'loss' | 'forfeit';

export interface ProfileV1 {
  schemaVersion: 1;
  /** 遠征收服的角色（M2 起才會寫入） */
  expeditionUnlocked: string[];
  captureMissesByCharacter: Record<string, number>;
  importedLegacyVersion?: string;
}

export interface ExpeditionRunV1 {
  schemaVersion: 1;
  runId: string;
  seed: string;
  rngVersion: number;
  contentVersion: string;
  phase: Phase;
  /** 目前所在（或正在打）的節點 */
  nodeId: string;
  /** phase 為 active 時一定有：入場前就先存好，重整後用同一個 id 重打 */
  matchId?: string;
  /** 這個節點第幾次開打（matchId 的一部分） */
  attemptNo: number;
  hearts: number;
  losses: number;
  partyIds: string[];
  equippedCardIds: string[];
  ownedCardIds: string[];
  visitedNodeIds: string[];
  pendingReward?: { settlementId: string; offeredCardIds: string[] };
  /** 每次寫入加一；寫入時版本對不上就拒絕（擋住另一個分頁的舊資料） */
  revision: number;
  createdAt: number;
}

/** 一場比賽的結算紀錄。id = runId + matchId，同一場只會有一筆。 */
export interface SettlementV1 {
  id: string;
  runId: string;
  matchId: string;
  nodeId: string;
  result: MatchResult;
  scores: [number, number];
  /** 寫入這筆結算之後 run 的 revision */
  revision: number;
  at: number;
}
