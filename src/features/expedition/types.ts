/**
 * 關都遠征的資料契約（SPEC §5）。存在 IndexedDB，跟 localStorage 的既有存檔完全分開。
 *
 * 改欄位要升 SCHEMA_VERSION，並在 logic.ts 的 validate* 補上舊版的讀法；
 * 不認得的版本一律當成「不支援」，保留原檔、唯讀，不會被覆寫。
 */
export const SCHEMA_VERSION = 1;
/** 一輪（run）的存檔版本：2 = 章節制（每章有起點快照、心用完重來這一章） */
export const RUN_SCHEMA = 2;
/** 亂數演算法版本：改了 rng.ts 的算法就要加一（同 seed 才會得到同樣的掉落） */
export const RNG_VERSION = 1;
/** 內容版本：路線、對手、勝分、卡牌等設定改了就要換 */
export const CONTENT_VERSION = 'c1-4';

export type Phase = 'map' | 'active' | 'reward' | 'cleared' | 'failed';
export type MatchResult = 'win' | 'loss' | 'forfeit';
/** chapter：心用完只重來這一章（預設）；ironman：一命到底，心用完整輪結束 */
export type RunMode = 'chapter' | 'ironman';

/** 每一章開始時的樣子；章節制心用完就回到這裡 */
export interface Checkpoint {
  partyIds: string[];
  benchIds: string[];
  ownedCardIds: string[];
  equippedCardIds: string[];
  visitedNodeIds: string[];
}

export interface ProfileV1 {
  schemaVersion: 1;
  /** 遠征收服的角色（永久） */
  expeditionUnlocked: string[];
  /** 機率收服連續失敗的次數；有失敗過，下一次合格的勝利保底 */
  captureMissesByCharacter: Record<string, number>;
  importedLegacyVersion?: string;
  /** 開放到第幾級難度（0～RANK_MAX；沒有欄位 = 0） */
  rankUnlocked?: number;
  /** 通關印章：夥伴 → 用牠通關過的最高難度 + 1 */
  stamps?: Record<string, number>;
  /** 用一命到底通關過的夥伴 */
  ironmanClears?: string[];
}

export interface ExpeditionRun {
  schemaVersion: 2;
  mode: RunMode;
  /** 難度等級（0 = 一般） */
  rank: number;
  /** 第幾章（0 起算，對應 content.ts 的 CHAPTERS） */
  chapter: number;
  /** 這一輪總共重來過幾次章節 */
  chapterRetries: number;
  checkpoint: Checkpoint;
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
  /** 隊伍，最多 2 隻；第一隻是上場的 */
  partyIds: string[];
  /** 這一輪收服、但隊伍滿了沒帶在身上的（在地圖上可以換進隊伍） */
  benchIds: string[];
  /** 裝備中的卡，最多 2 張，一定是 ownedCardIds 裡的 */
  equippedCardIds: string[];
  ownedCardIds: string[];
  visitedNodeIds: string[];
  /** phase 為 reward 時一定有：這一場贏來的三選一 */
  pendingReward?: { settlementId: string; offeredCardIds: string[] };
  /** 每次寫入加一；寫入時版本對不上就拒絕（擋住另一個分頁的舊資料） */
  revision: number;
  createdAt: number;
}

export interface CaptureRecord {
  char: string;
  ok: boolean;
  /** 這次是保底（首次必中的節點，或上次失敗後的保底） */
  sure: boolean;
  /** 有沒有加入這一輪的隊伍（隊伍滿了就進後援） */
  joined: boolean;
  /** 早就收服過了，這次只是來幫忙（不擲收服、不改圖鑑） */
  returning?: boolean;
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
  /** 上場的夥伴（日誌用） */
  lead?: string;
  capture?: CaptureRecord;
  /** 這一場輸掉後心用完，回到這一章的開頭 */
  chapterRestart?: boolean;
  /** 這一場給的三選一；picked 是玩家選的（null = 略過，undefined = 還沒選） */
  offered?: string[];
  picked?: string | null;
}
