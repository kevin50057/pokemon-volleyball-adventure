// 自架連線層內部共用的型別。
// 舊版 selfroom.js 是一個 IIFE，這些狀態原本是閉包變數；拆檔後改成明確傳遞的 context 物件。
import type { MqttClient } from './mqtt';
import type { ConnFn, PeerInfo, PeersChange, PresencePatch, Room } from '../room-types';

/** 一個 MQTT 中繼伺服器的連線。 */
export interface BrokerClient {
  url: string;
  up: boolean;
  /** connect() 丟例外時是 null（這個伺服器就一直不會 up） */
  cl: MqttClient | null;
  idx: number;
}

/** 整個自架層共用的狀態（舊版 IIFE 的頂層變數）。 */
export interface SelfCtx {
  /** 自己的 peer 標籤 */
  me: string;
  brokers: string[];
  noRtc: boolean;
  ice: RTCIceServer[];
  clients: BrokerClient[];
  started: boolean;
  lobbyFns: ConnFn[];
  rooms: Record<string, SelfRoom>;
  /** lobby.connected()（notifyConn 用） */
  lobbyConnected(): boolean;
}

/** 房間裡的另一個人。 */
export interface PeerState {
  id: string;
  seq: number;
  pub: PeerInfo | null;
  seen: number;
  pc: RTCPeerConnection | null;
  dc: RTCDataChannel | null;
  dcOpen: boolean;
  dcSeen: number;
  retryAt: number;
  tries: number;
  via: 'relay' | 'dc';
  sigSeen: Record<number, number>;
  pendC: RTCIceCandidateInit[];
}

/** 收到的訊號（交換直連資訊）。來自網路，形狀不保證；處理時都包在 try/catch 裡。 */
export interface SignalMsg {
  from?: unknown;
  i?: unknown;
  d?: { sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit };
}

/** 一個具名房間（舊版 makeRoom 裡的 R）。 */
export interface SelfRoom {
  name: string;
  mine: PresencePatch;
  seq: number;
  peers: Record<string, PeerState>;
  fns: Array<(ch: PeersChange) => void>;
  cfns: ConnFn[];
  dead: boolean;
  dirty: boolean;
  /** 0 沒排程；-1 排在 microtask；其他是 setTimeout 的 id */
  timer: number;
  lastRelay: number;
  lastFlush: number;
  sigN: number;
  pendingNotify: boolean;
  lastConn: boolean | null;
  iv: number;
  /** presence 的 topic 前綴：PREFIX/房名/p/ */
  tp: string;
  /** 訊號的 topic 前綴：PREFIX/房名/s/ */
  ts: string;
  subscribe(c: BrokerClient): void;
  getPeer(id: string): PeerState;
  onPresence(id: string | undefined, msg: Record<string, unknown>, via: 'relay' | 'dc'): void;
  onSignal(msg: SignalMsg): void;
  flush(force: boolean): void;
  presence(patch: PresencePatch): Promise<void>;
  connected(): boolean;
  connChanged(): void;
  info(): string;
  api: Room;
}
