/**
 * 關都遠征的資料契約（SPEC §5）。存在 IndexedDB，跟 localStorage 的既有存檔完全分開。
 *
 * 改欄位要升版本，並在 logic/validate.ts 補上檢查；
 * 不認得的版本一律當成「不支援」，保留原檔、唯讀，不會被覆寫。
 * profile 新加的欄位一律可以沒有（舊的 profile 照樣能讀，收服紀錄不會掉）。
 */
export const SCHEMA_VERSION = 1;
/** 一輪（run）的存檔版本：2 = 章節制；3 = 羈絆與覺醒、首領階段、挑戰規則、每日遠征 */
export const RUN_SCHEMA = 3;
/** 亂數演算法版本：改了 rng.ts 的算法就要加一（同 seed 才會得到同樣的掉落） */
export const RNG_VERSION = 1;
/** 內容版本：路線、對手、勝分、卡牌等設定改了就要換 */
export const CONTENT_VERSION = 'c3-1';

export type Phase = 'map' | 'active' | 'reward' | 'cleared' | 'failed';
export type MatchResult = 'win' | 'loss' | 'forfeit';
/** chapter：心用完只重來這一章（預設）；ironman：一命到底，心用完整輪結束 */
export type RunMode = 'chapter' | 'ironman';
/** 挑戰規則（通關一次後開放，開新一輪時可以勾，可以疊加） */
export type ChallengeId = 'noCards' | 'solo' | 'storm' | 'fewSlots' | 'bigBoss' | 'random';
/** 存檔位：主線一輪、每日遠征一輪，互不覆蓋 */
export type SaveSlot = 'current' | 'daily';

/** 每一章開始時的樣子；章節制心用完就回到這裡 */
export interface Checkpoint {
  partyIds: string[];
  benchIds: string[];
  ownedCardIds: string[];
  equippedCardIds: string[];
  visitedNodeIds: string[];
  bond: Record<string, number>;
  awakened: string[];
}

export interface DailyRecord { date: string; score: number; cleared: boolean }
export interface DailyProgress {
  /** 最後一次打完（不論輸贏）的日期（UTC，YYYY-MM-DD） */
  lastDate: string;
  streak: number;
  bestStreak: number;
  /** 最近 14 筆 */
  history: DailyRecord[];
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
  /** 看過覺醒的夥伴（圖鑑的第二層） */
  awakenedSeen?: string[];
  /** 夥伴的羈絆等級：以上場身分的累計勝場 */
  bondXp?: Record<string, number>;
  /** 挑戰規則通關次數 */
  challengeClears?: Record<string, number>;
  /** 訓練家手冊：達成的目標 */
  goals?: Record<string, 1>;
  /** 靠目標解鎖、放進卡池的卡 */
  cardPool?: string[];
  daily?: DailyProgress;
}

export interface ExpeditionRun {
  schemaVersion: 3;
  mode: RunMode;
  /** 難度等級（0 = 一般） */
  rank: number;
  challenges: ChallengeId[];
  /** 每日遠征：這一份的日期（UTC）；主線沒有 */
  daily?: string;
  /** 第幾章（0 起算，對應 content/chapters.ts 的 CHAPTERS） */
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
  /** 這一輪所有比賽的得失分差（每日遠征的分數、明信片用） */
  pointDiff: number;
  /** 隊伍，最多 2 隻；第一隻是上場的 */
  partyIds: string[];
  /** 這一輪收服、但隊伍滿了沒帶在身上的（在地圖上可以換進隊伍） */
  benchIds: string[];
  /** 裝備中的卡，一定是 ownedCardIds 裡的；不佔卡槽的卡（達人帶）不在這裡 */
  equippedCardIds: string[];
  ownedCardIds: string[];
  visitedNodeIds: string[];
  /** 羈絆值（這一輪）：滿了就覺醒 */
  bond: Record<string, number>;
  /** 這一輪已經覺醒的夥伴 */
  awakened: string[];
  /** 首領戰打到過的最高階段（同一次章節嘗試內，重打從這裡開始；章節重來、打贏都會清掉） */
  bossPhase?: number;
  /** phase 為 reward 時一定有：這一場贏來的三選一（可能有「羈絆值 +1」「回 1 顆心」補位） */
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
  /** 收服條件還沒達成（百變怪要 3 隻夥伴的通關印章）：have／need */
  gated?: { have: number; need: number };
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
  /** 這一場讓誰覺醒了 */
  awakened?: string;
  /** 這一場給的三選一；picked 是玩家選的（null = 略過，undefined = 還沒選） */
  offered?: string[];
  picked?: string | null;
}
