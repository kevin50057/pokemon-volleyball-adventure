// 連線對戰的狀態（舊版 netplay.js 的 net、conn 兩個物件）。
// net 同時當成 svc.net.state 給別的功能看（phase、render、role）。
import type { CharacterId } from '../../core/types';
import type { NetState } from '../../core/services';
import type { Room } from './room-types';
import type { FxEv, Phase, RemoteSnap, Role } from './protocol';

export interface QueuedSnap { s: RemoteSnap; ack: number }

export interface Net extends NetState {
  room: Room | null;            // 加入的具名房間
  code: string;
  role: Role | null;
  phase: Phase;
  myCh: CharacterId;
  unsub: Array<() => void>;
  msg: string;
  sid?: string;
  lastErr?: string;
  peerCount?: number;
  peerDbg?: string;
  // 房主
  opp: string | null;           // 對手的 peer 標籤
  oppCh: CharacterId;
  oppIn: unknown;               // 客人 presence 的 in（原樣保存，用 parseIn 讀）
  oppSeen: number;
  usedPc: number; usedDc: number;
  ackSeq: number; ackT: number;
  f: number; ticked: boolean;
  hit: [number, number]; prevHit: [boolean, boolean];
  snd: number[]; ev: FxEv[]; evId: number;
  paused: boolean; lostAt: number;
  /** 房主：[1P 角色, 2P 角色, 1P 電腦, 2P 電腦]；客人：[1P 角色, 2P 角色] */
  savedChars: [CharacterId, CharacterId, ...boolean[]] | null;
  lastSendT: number;
  resumeAt: number;
  oppBase?: string | null;
  oppTraw?: unknown;
  oppT?: number;
  oppTArr?: number;
  oppHidden?: boolean;
  oppGone?: boolean;
  lastHt?: number;
  // 客人
  hostPeer: string | null;
  hostSeenT: number;
  /** 房主 presence 的 ts（原樣保存；正常是數字） */
  hostTs: unknown;
  hostRole: 'player' | 'spec' | null;
  hostHidden?: boolean;
  hostCh?: CharacterId;
  render: boolean;
  queue: QueuedSnap[];
  lastF: number;
  last: RemoteSnap | null;
  extrap: number;
  gHit: number[] | null;
  gSnd: unknown[] | null;
  gEv: number;
  gScores: string;
  gState: unknown;
  gSid?: unknown;
  evBase?: boolean;
  hz?: number;
  prevPh?: unknown;
  lastAckT?: number;
  lastAck?: number;
  curX?: number; curY?: number;
  seq: number; pc: number; dc: number; dd: number;
  hist: Array<[number, number]>;
  predX: number | null;
  joinedAt: number;
  // 共用
  rtt: number;
}

export const net: Net = {
  room: null,
  code: '',
  role: null,
  phase: 'off',
  myCh: 'pikachu',
  unsub: [],
  // 房主
  opp: null,
  oppCh: 'pikachu',
  oppIn: null, oppSeen: 0, usedPc: 0, usedDc: 0, ackSeq: 0, ackT: 0,
  f: 0, ticked: false, hit: [0, 0], prevHit: [false, false],
  snd: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ev: [], evId: 0,
  paused: false, lostAt: 0, savedChars: null, lastSendT: 0, resumeAt: 0,   // resumeAt：舊版一開始沒有這個欄位（undefined），比較時跟 0 一樣
  // 客人
  hostPeer: null, hostSeenT: 0, hostTs: 0, hostRole: null,
  render: false, queue: [], lastF: -1, last: null, extrap: 0,
  gHit: null, gSnd: null, gEv: 0, gScores: '', gState: '',
  seq: 0, pc: 0, dc: 0, dd: 0, hist: [], predX: null, joinedAt: 0,
  // 共用
  rtt: 0, msg: '',
};

// ------------------------------------------------------------
// 連線管理的狀態
// ------------------------------------------------------------
export interface Conn {
  up: boolean;
  downSince: number;
  attempt: number;
  timer: number;
  gen: number;
  joining: number;
  failSends: number;
  firstFail: number;
  lostSince: number;
  token: number;
  leaving: Room | null;
  leaveTimer: number;
  lastForce?: number;
}

export const conn: Conn = { up: false, downSince: 0, attempt: 0, timer: 0, gen: 0, joining: 0, failSends: 0, firstFail: 0, lostSince: 0, token: 0, leaving: null, leaveTimer: 0 };
