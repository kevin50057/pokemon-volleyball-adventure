// 闖關模式：各檔案共用的狀態（舊版是 IIFE 裡的區域變數 save、camp）
// ES 模組不能從別的檔案重新指定 export 的 let，所以都放在物件裡，只改欄位。
import { svc } from '../../core/services';
import type { AbilitiesApi } from '../../core/services';
import type { CharacterId, Controller, GameState } from '../../core/types';
import type { Diff, RuleId } from './config';

// ---------------- 存檔的形狀（不能改：經典版的進度會被匯入） ----------------
/** 進行中的一輪 */
export interface Run {
  char: string;
  order: string[];
  idx: number;
  hearts: number;
  bossPhase: number;
  frames: number;
  lost: number;
  /** 1 = 有一場打到一半（關掉、重新整理就算輸） */
  live?: number;
  /** 這一輪每一關挑戰了幾次 */
  att: Record<number, number>;
}
export interface Medal { n: number; frames: number; lost: number }
export interface StatRec { t: number; w: number }
export interface RunRec { c: string; lost: number; f: number; d: string }
export interface SaveData {
  run: Run | null;
  medals: Record<string, Medal>;
  owned: Record<string, number>;
  acq: number;
  tutDone: number;
  stats: Record<string, StatRec>;
  runs: RunRec[];
}

// ============================================================
// 存檔：進行中的一輪、獎章、收服的夥伴
// ============================================================
export const save: SaveData = { run: null, medals: {}, owned: {}, acq: 0, tutDone: 0, stats: {}, runs: [] };

// ---------------- 比賽中的狀態 ----------------
export interface AiState { acc: number; freeze: number; mine: boolean; noSpike: boolean }
export interface BossState {
  phase: number; init: boolean; pending: number; cut: number; next: number;
  flash: number; hit: number; hurt: number; s0: number; s1: number;
  /** 被扣血的那一刻原本有幾分（血條白閃用；第一次扣血時才設定） */
  hitFrom?: number;
}
export interface KoState {
  t: number; win: boolean; boss: boolean; x: number; px: number; py: number;
  isNew: boolean; idx: number; tint0: number;
}
export interface Puddle { x: number; t: number }
export interface RuleState {
  id: RuleId; rt: number; rally: number; golden: boolean; touched: boolean;
  prev: GameState | null;
  puddles: Puddle[]; spawn: number; dir: number;
  splash: Puddle[];
  pop: { side: number; t: number } | null;
}
export interface Saved {
  c1: CharacterId; c2: CharacterId; k1: boolean; k2: boolean;
  win: number; practice: boolean; startFrames: number;
}
export interface LoseInfo { opp: string; sc: number[]; boss: boolean; out: boolean; from: number; need: number }

export interface CampState {
  playing: boolean;     // 闖關模式接管遊戲中（比賽中或兩關之間）
  waiting: boolean;     // 兩關之間：場上停在結算，等玩家按下一步
  wantStart: boolean;   // 遊戲本體還沒載好，載好就開打
  opp: string; diff: Diff | null;
  /** 測試用：設定後 1P 也交給電腦，用這個強度 */
  proxy: Diff | null;
  ai1: AiState; ai2: AiState;
  prevState: GameState | null; saved: Saved | null; tuneOrig: Record<string, number> | null;
  boss: BossState | null; tut: number; speedEvery: number; spd: number; tick: number; ko: KoState | null;
  autoVs: boolean; view: string; pick: string | null; lastRun: Run | null; lose: LoseInfo | null;
  travelFrom: number | null; toast: string;
  /** 測試用：每場結束時呼叫 */
  onFinish: ((win: boolean) => void) | null;
  // 以下舊版一開始沒有，用到才加上去
  rule?: RuleState | null;
  shown?: string;
  openedAt?: number;
}

// ============================================================
// 狀態
// ============================================================
export function newAi(): AiState { return { acc: 0, freeze: 0, mine: false, noSpike: false }; }
export const camp: CampState = {
  playing: false,
  waiting: false,
  wantStart: false,
  opp: '', diff: null, proxy: null, ai1: newAi(), ai2: newAi(),
  prevState: null, saved: null, tuneOrig: null,
  boss: null, tut: 0, speedEvery: 0, spd: 0, tick: 0, ko: null,
  autoVs: false, view: '', pick: null, lastRun: null, lose: null, travelFrom: null, toast: '', onFinish: null
};

export function ctrlOf(): Controller | null { return svc.ctrl; }
export function AB(): AbilitiesApi | undefined { return svc.abilities; }
export function netBusy(): boolean { const n = svc.net && svc.net.state; return !!(n && (n.phase !== 'off' || n.render)) || !!(svc.expedition && svc.expedition.playing()); }
export function ensureGame(): void {
  if (ctrlOf()) return;
  const box = document.getElementById('about-box'), btn = document.getElementById('close-about-btn');
  if (box && btn && !box.classList.contains('hidden')) btn.click();
}
