// 測試／除錯用的入口（舊版掛在 window.__fake、window.__self）。main.ts 會把它掛到 window.PVA.net。
import { net, type Net } from './state';

/** 假房間的故障注入（舊版 window.__fake）。 */
export interface FakeControls {
  /** 斷線一段時間（毫秒） */
  down(ms: number): void;
  /** 讓具名房間結束 */
  endRoom(code?: string): void;
  /** 接下來 n 次 join 失敗 */
  failJoins(n: number): void;
  /** 永久性錯誤 */
  terminal(code: string): void;
  me: string;
}

/** 自架層的狀態與故障注入（舊版 window.__self）。 */
export interface SelfDebug {
  me: string;
  clients: unknown[];
  rooms: Record<string, unknown>;
  killRtc(): void;
}

export interface NetDebug {
  /** 連線狀態（同 svc.net.state） */
  state: Net;
  fake: FakeControls | null;
  self: SelfDebug | null;
}

export const debug: NetDebug = { state: net, fake: null, self: null };
