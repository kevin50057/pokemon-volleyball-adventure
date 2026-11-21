/**
 * 面板的狀態（畫面上暫存的選擇、目前看哪一個存檔位、正在播的演出）和讀狀態的小工具。
 * 存檔內容只放在 ui.state（db.load 的結果）；畫面上的選擇沒有存檔，重整就重來。
 */
import { CHARS } from '../../characters';
import { STARTERS } from '../content';
import type { DbError, ExpeditionDb, LoadState } from '../db';
import type { CaptureRecord, ChallengeId, ExpeditionRun, ProfileV1, RunMode, SaveSlot, SettlementV1 } from '../types';

export type Tab = 'run' | 'daily' | 'dex' | 'book';

/** 結算後在地圖畫布上依序播的演出；start 是 0 表示還沒開始（第一次畫的時候才開始計時） */
export type Scene =
  | { kind: 'capture'; rec: CaptureRecord; start: number }
  | { kind: 'awaken'; char: string; start: number };

export interface UiState {
  root: HTMLDivElement | null;
  /** 資料庫（存檔位 'current'）；每日遠征用 forSlot('daily') */
  db: ExpeditionDb | null;
  /** 現在畫面上看的存檔位 */
  slot: SaveSlot;
  /** 正在打的那一場屬於哪個存檔位（打到一半切分頁也不會結算到另一邊） */
  matchSlot: SaveSlot;
  state: LoadState | null;
  error: DbError | null;
  /** 出錯時「再試一次」要做的事 */
  retry: (() => Promise<void>) | null;
  canWrite: boolean;
  note: string;
  interrupted: boolean;
  pausedHidden: boolean;
  partner: string;
  backup: string;
  mode: RunMode;
  rank: number;
  challenges: ChallengeId[];
  dailyPartner: string;
  tab: Tab;
  /** 補給站正在編輯的裝備（還沒存） */
  loadout: string[] | null;
  journal: SettlementV1[];
  scenes: Scene[];
  nums: number[];
  numsSeed: string;
  raf: number;
  draw: ((t: number) => void) | null;
  /** 後援換人：先點了哪一隻後援 */
  swapPick: string;
  /** 除錯用：左邊也交給電腦打（照樣結算、寫存檔），用來在瀏覽器裡跑完整的流程 */
  autoplay: boolean;
}

export const ui: UiState = {
  root: null, db: null, slot: 'current', matchSlot: 'current', state: null, error: null, retry: null,
  canWrite: false, note: '', interrupted: false, pausedHidden: false,
  partner: '', backup: '', mode: 'chapter', rank: 0, challenges: [], dailyPartner: '',
  tab: 'run', loadout: null, journal: [], scenes: [], nums: [], numsSeed: '', raf: 0, draw: null, swapPick: '', autoplay: false,
};

/**
 * 畫面層的進入點，由 shell.ts 在載入時註冊。
 * 存檔操作（actions.ts）只透過這裡要求重畫，不直接 import 畫面，免得模組互相依賴。
 */
export interface ViewHooks { render(): void; show(): void; hide(): void }
const noop = (): void => { /* 還沒註冊 */ };
export const view: ViewHooks = { render: noop, show: noop, hide: noop };
export function setView(v: ViewHooks): void { view.render = v.render; view.show = v.show; view.hide = v.hide; }

type Ok = Extract<LoadState, { kind: 'ok' }>;
export function okState(): Ok | null { return ui.state && ui.state.kind === 'ok' ? ui.state : null; }
export function run(): ExpeditionRun | null { const s = okState(); return s ? s.run : null; }
export function profile(): ProfileV1 | null { const s = okState(); return s ? s.profile : null; }
export function setRun(r: ExpeditionRun, p?: ProfileV1): void { const s = okState(); if (s) ui.state = { kind: 'ok', profile: p || s.profile, run: r }; }
export function ids(): readonly string[] { return CHARS.ids; }
export function ended(r: ExpeditionRun): boolean { return r.phase === 'cleared' || r.phase === 'failed'; }

/** 可以帶出門的夥伴：起始夥伴加上遠征收服過的 */
export function partners(): string[] {
  const p = profile(), got = p ? p.expeditionUnlocked : [];
  return CHARS.ids.filter((id) => STARTERS.some((s) => s === id) || got.indexOf(id) >= 0);
}
