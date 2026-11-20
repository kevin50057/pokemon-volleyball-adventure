// 連線協定：presence 的欄位、快照格式、房間代碼。
// ⚠ 經典版（舊程式）和遠征版要能進同一個房間對打：這裡的欄位名稱、編碼、數值一個都不能改。
//
// 傳輸只用 presence（每個人一個物件，最新的覆蓋舊的），所以掉包不會累積錯誤；
// 音效、擊球、技能特效都用「累計計數器／事件編號」傳，掉一兩幀也不會漏。

// ------------------------------------------------------------
// 房間代碼
// ------------------------------------------------------------
export const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newCode(): string { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
/** 房間代碼的格式（使用者輸入、sessionStorage 讀回來都用這個檢查）。 */
export const CODE_RE = /^[a-z0-9]{4}$/;
/** 具名房間的名稱：'pv-' + 代碼。 */
export function roomName(code: string): string { return 'pv-' + code; }

// ------------------------------------------------------------
// 數值小工具（收到的資料都要防呆）
// ------------------------------------------------------------
/** 四捨五入到小數一位。 */
export function r1(v: number): number { return Math.round((+v || 0) * 10) / 10; }
/** 轉成數字；不是有限數就當 0。 */
export function num(v: unknown): number { const n = Number(v); return isFinite(n) ? n : 0; }
/**
 * 跟 JS 的 `o[k]` 一樣：o 是 null/undefined 會丟 TypeError（舊版在這種情況也會丟，由外層的 try/catch 接住），
 * 其他值（包含字串、數字）照 JS 的規則取屬性。給沒信任的遠端資料用。
 */
export function at(o: unknown, k: string | number): unknown {
  if (o === null || o === undefined) throw new TypeError('Cannot read properties of ' + o + " (reading '" + k + "')");
  return (Object(o) as Record<string | number, unknown>)[k];
}

// ------------------------------------------------------------
// presence 的形狀（送出去的）
// 用 type 而不是 interface：才能直接當成 Record<string, unknown> 傳給 room.presence()。
// ------------------------------------------------------------
export type Role = 'host' | 'guest';
/** off | lobby | play | end（送出去的還有 'bye'） */
export type Phase = 'off' | 'lobby' | 'play' | 'end';

/** 大廳（房主還沒開打）。 */
export type LobbyPresence = {
  role: Role | null; ch: string; ph: Phase; ts: number; hid: 0 | 1;
  /** 房主才有：選定的對手 peer */
  opp?: string | null;
};

/** 房主比賽中（每幀一包）。 */
export type HostPresence = {
  role: 'host'; ch: string; ph: Phase; opp: string | null; ts: number; hid: 0 | 1;
  /** [客人輸入序號, 客人的 t 加上房主這邊停留的時間]：客人用來算來回延遲 */
  ack: [number, number];
  s: Snap;
};

/** 客人。 */
export type GuestPresence = {
  role: 'guest'; ch: string; ph: 'lobby';
  /** 正在跟哪個房主比賽（觀看畫面中才有） */
  hp: string | null;
  hid: 0 | 1;
  /** 房主的 ts 加上客人這邊停留的時間：房主用來算來回延遲 */
  ht: number;
  t: number;
  /** [x, y, 殺球累計, 衝刺累計, 衝刺方向, 輸入序號] */
  in?: [number, number, number, number, number, number];
};

/** 離開房間前送的最後一包（s: null 表示刪掉快照）。 */
export type ByePresence = { ph: 'bye'; s: null };

/**
 * 角色快照：[x, y, state, frameNumber, divingDirection, 擊球累計, 角色, isDashing, yVelocity, 衝刺殘影?]
 * 殘影：[x0, y0, x1, y1]
 */
export type PlArr = (number | string | number[])[];

/** 技能事件：[事件編號, 種類, 內容] */
export type FxEv = [number, string, Record<string, unknown>];

/** 房主每幀的快照。 */
export type Snap = {
  /** 幀號 */
  f: number;
  /** 狀態機的狀態名稱（見 host.ts 的 STATES，另外有 'wait'、'other'） */
  st: string;
  fc: number;
  /** 淡入淡出的黑幕透明度 */
  fa: number;
  /** 遊戲畫面是否顯示 */
  gv: 0 | 1;
  /** 訊息：1 開始、2 Ready、4 Game Set */
  ms: number;
  sc: [number, number];
  /** 慢動作中 */
  sm: 0 | 1;
  p: [PlArr, PlArr];
  /** 球：x, y, rotation, punchEffectX, punchEffectY, punchEffectRadius, isPowerHit, previousX, previousY, previousPreviousX, previousPreviousY, xVelocity, yVelocity */
  b: number[];
  /** 音效累計：[1P pipikachu, pika, chu, flap, 2P 同上, powerHit, ballTouchesGround] */
  so: number[];
  /** 1 = 1P 贏、2 = 2P 贏 */
  w: 0 | 1 | 2;
  /** 這一局的 id：換局或房主重新整理就換 */
  sid: string;
  /** 0 正常、1 等對手（斷線）、2 恢復倒數、3 對手切背景 */
  hz: 0 | 1 | 2 | 3;
  /** 技能系統的狀態（abilities.net.get()） */
  ab?: unknown;
  ev?: FxEv[];
};

/**
 * 客人收到的快照。來自網路，形狀不保證：
 * 型別只描述「正常時」長什麼樣子，程式照舊版的寫法逐一防呆（num()、Array.isArray…）。
 */
export type RemoteSnap = {
  f?: unknown; st?: unknown; fc?: unknown; fa?: unknown; gv?: unknown; ms?: unknown;
  sc?: unknown; sm?: unknown; sid?: unknown; hz?: unknown; w?: unknown;
  p?: unknown[][];
  b?: unknown[];
  so?: unknown[];
  /** predictSelf 只讀 ab.s.p2 的幾個數值 */
  ab?: { s?: { p2?: Record<string, number> } };
  ev?: unknown;
};

// ------------------------------------------------------------
// 客人的輸入
// ------------------------------------------------------------
export interface ParsedIn { x: number; y: number; pc: number; dc: number; dd: number; seq: number }
export function parseIn(a0: unknown): ParsedIn {
  const a: unknown[] = Array.isArray(a0) ? a0 : [];
  const x = num(a[0]), y = num(a[1]);
  return { x: x > 0 ? 1 : x < 0 ? -1 : 0, y: y > 0 ? 1 : y < 0 ? -1 : 0, pc: num(a[2]), dc: num(a[3]), dd: Math.max(-2, Math.min(2, Math.round(num(a[4])))), seq: num(a[5]) };   // ±1 連點兩下的衝刺，±2 觸控技能鍵
}

// ------------------------------------------------------------
// 技能事件
// ------------------------------------------------------------
/** 會轉送給客人重播的特效事件（普通物件：照舊版，用 EV_TYPES[type] 判斷）。 */
export const EV_TYPES: Record<string, number> = { zipStart: 1, zipEnd: 1, skill: 1 };
