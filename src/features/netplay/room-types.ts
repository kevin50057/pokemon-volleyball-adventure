// 房間層的介面：自架層（selfroom/）和測試用的假房間（fake-room.ts）都長這樣。
// 形狀沿用舊版 artifact room capability 的 join(name) → { presence, peers, onPeers, onConnection, connected, leave }。

/** 每個人的 presence：一個物件，最新的覆蓋舊的。內容來自遠端，不保證形狀。 */
export type Presence = Readonly<Record<string, unknown>>;

/** presence 的部分更新：值為 null 表示刪掉這個欄位。 */
export type PresencePatch = Record<string, unknown>;

export interface PeerInfo {
  peer: string;
  presence: Presence;
  updatedAt: number;
  isMe: boolean;
  sameTab: boolean;
  kind: string;
  guest: boolean;
  by: null;
}

export interface PeersChange {
  peers: PeerInfo[];
  joined: PeerInfo[];
  left: PeerInfo[];
  updated: PeerInfo[];
}

/** join／presence 失敗時的錯誤物件。 */
export interface RoomError { code: string; message: string }

export type ConnFn = (ok: boolean) => void;
export type ErrFn = (e: RoomError) => void;

/** 加入後的具名房間。 */
export interface Room {
  name?: string;
  presence(patch: PresencePatch): Promise<void>;
  peers(): PeerInfo[];
  onPeers(fn: (ch: PeersChange) => void, onErr?: ErrFn): () => void;
  onConnection?(fn: ConnFn, onErr?: ErrFn): () => void;
  connected?(): boolean;
  /** 自架層才有：直連／中繼的狀態文字（除錯列用）。 */
  info?(): string;
  leave(): Promise<void>;
}

/** 取得房間的入口（舊版的 lobby）。 */
export interface Lobby {
  self?: boolean;
  connected(): boolean;
  onConnection?(fn: ConnFn, onErr?: ErrFn): () => void;
  join(name: string): Promise<Room>;
  /** 平台版 lobby 才有；自架層和假房間都沒有（除錯列會略過）。 */
  peers?(): PeerInfo[];
}
