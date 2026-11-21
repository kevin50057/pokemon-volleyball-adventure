/**
 * 功能之間互相呼叫的入口（取代舊版的 window.PV_xxx / window._pvXxx 全域變數）。
 *
 * 每個功能在初始化時把自己的公開 API 填進 `svc`，別的功能在「呼叫的當下」才去拿，
 * 所以功能之間不會互相 import（避免循環相依），也跟舊版「有就用、沒有就跳過」的行為一致。
 */
import type { Controller, CharacterId, Physics, Player } from './types';
import type { SidePair } from './side-state';
import type { Container } from '@pixi/display';

// ---------------- 各功能的公開 API ----------------

/** 技能系統（舊版 window._pvAbilities）。 */
export interface AbilitiesApi {
  /** 可調整的數值（平衡用），其他功能可以暫時改（例如闖關的場地規則）。 */
  tuning: Record<string, number>;
  /** 各角色的電腦 AI 修正。 */
  ai: Record<string, (p: Player, ball: Physics['ball'], opp: Player, input: import('./types').UserInput, s: SidePair['p1']) => void>;
  state(): SidePair;
  /** 連線對戰：主機把技能狀態傳給客機，客機只負責畫。 */
  net: {
    get(): unknown;
    set(o: unknown): void;
    draw(ctrl: Controller): void;
    clear(ctrl: Controller): void;
  };
}

/** 特效系統給連線用的（舊版 window._pvJuiceNet）。 */
export interface JuiceNetApi {
  guestTick(ctrl: Controller): void;
}

/** 特效事件的種類與內容（舊版 window._pvFxEvent(type, data)）。 */
export type FxEventType = 'skill' | 'zipStart' | 'zipEnd' | string;
export interface FxEventData { player?: Player; lvl?: number; x?: number; y?: number; k?: string; [key: string]: unknown }

/** 連線對戰（舊版 window.PV_Net）。 */
export interface NetState {
  /** 'off' 沒在連線；'lobby' 在房間等人；'play' 比賽中；'end' 結算畫面 */
  phase: string;
  /** 客機：只畫主機傳來的畫面 */
  render: boolean;
  /** 'host' | 'guest' | null */
  role: string | null;
  [key: string]: unknown;
}
export interface NetApi {
  state: NetState;
  open(): void;
  start(role: 'host' | 'guest', code: string): void;
  stop(msg?: string): void;
  hostStart(): void;
}

/** 選角面板（舊版 window.PV_CharSelect）。 */
export interface CharSelectApi {
  /** n：先選 1P 還是 2P；fromNet：從連線面板進來（只選自己的角色） */
  open(n?: 1 | 2, fromNet?: boolean): void;
  close(): void;
  toggle(): void;
  current(n: 1 | 2): CharacterId;
  /** 遠征版鎖角色：這隻能不能選 */
  unlocked(id: string): boolean;
  /** 角色頭像（站姿第一格）畫在新的 canvas 上 */
  portrait(id: string, size: number): HTMLCanvasElement;
  /** 把某個動作的某一格畫到 canvas 上（st：動作 0～6，fr：第幾格） */
  paintFrame(canvas: HTMLCanvasElement, id: string, st: number, fr: number): boolean;
}

/** 闖關模式（舊版 window.PV_Campaign）。 */
export interface CampaignApi {
  /** 闖關正在接管遊戲（比賽中，或兩關之間） */
  isActive(): boolean;
  /** 比賽中（不含兩關之間） */
  playing(): boolean;
  owned(id: string): boolean;
  howToGet(id: string): string;
  /** 0 沒有、1 銅、2 銀、3 金 */
  medalTier(id: string): number;
  tiers: ReadonlyArray<{ name: string; color: string } | null>;
  open(toHub?: boolean): void;
}

/** 自訂按鍵（舊版 window.PV_Keys）。 */
export interface KeysApi {
  config(): unknown;
  open(): void;
  close(): void;
  label(code: string): string;
  apply(): void;
}

/** 觸控按鈕送出的模擬按鍵代碼（舊版 window.PV_TouchKeys）。index 1 = 1P、2 = 2P。 */
export interface TouchKeySet { left: string; right: string; up: string; down: string; action: string; [key: string]: string }

// ---------------- 註冊表 ----------------

export interface Services {
  /** 遊戲本體載入完成後才有（舊版 window._pv.ctrl） */
  ctrl: Controller | null;
  stage: Container | null;
  abilities?: AbilitiesApi;
  juiceNet?: JuiceNetApi;
  /** 特效事件（技能發動、瞬移…）。特效系統提供，連線系統會包一層轉送給客機。 */
  fxEvent?: (type: FxEventType, data: FxEventData) => void;
  /** 精簡特效模式（手機省電） */
  fxLite?: () => boolean;
  /** 遊戲畫面「沒有震動時」的位置（疊圖用） */
  baseRect?: (canvas: HTMLCanvasElement) => DOMRect;
  net?: NetApi;
  charSelect?: CharSelectApi;
  campaign?: CampaignApi;
  /** 關都遠征（開發中，開關打開才有） */
  expedition?: { playing(): boolean };
  keys?: KeysApi;
  touchKeys?: { 1: TouchKeySet; 2: TouchKeySet };
}

export const svc: Services = { ctrl: null, stage: null };

/** 共用旗標（舊版散落在 window 上的開關）。 */
export const flags = {
  /** 模擬模式：關掉畫面和頓幀，給電腦對打測試用（舊版 window._pvSim） */
  sim: false,
  /** 闖關的黃金球：球換成金色貼圖（舊版 window._pvGoldBall） */
  goldBall: false,
};

/** 面板的 z-index：最後打開的永遠在最上面（舊版 window._pvZ）。 */
let zTop = 20010;
export function nextZ(): number { zTop += 1; return zTop; }

// ---------------- 遊戲本體載入完成 ----------------

type ReadyFn = (ctrl: Controller) => void;
const readyFns: ReadyFn[] = [];
/** 遊戲本體建好控制器之後呼叫（已經建好就馬上呼叫）。 */
export function onReady(fn: ReadyFn): void {
  if (svc.ctrl) fn(svc.ctrl); else readyFns.push(fn);
}
/** 引擎用。 */
export function setReady(ctrl: Controller, stage: Container): void {
  svc.ctrl = ctrl; svc.stage = stage;
  readyFns.splice(0).forEach((fn) => fn(ctrl));
}
