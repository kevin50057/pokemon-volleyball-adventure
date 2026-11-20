// 本機測試用：模擬 room.join。每個分頁一個 peer，presence 合併後廣播（約 30 次/秒）。
// 網址帶 ?fakeroom 時啟用（見 room.ts）。
// 網址參數：lag=單程延遲ms  jitter=抖動ms  loss=掉包率
// 故障注入：debug.fake.down(ms) 斷線一段時間；.endRoom(code) 讓具名房間結束；
//           .failJoins(n) 接下來 n 次 join 失敗；.terminal(code) 永久性錯誤
import { debug } from './debug';
import type { ConnFn, ErrFn, Lobby, PeerInfo, PeersChange, PresencePatch, Room, RoomError } from './room-types';

function now(): number { return performance.now(); }

/** 分頁之間廣播的訊息。 */
interface FakeMsg { t: 'hello' | 'bye' | 'p'; name: string; peer: string; presence?: PresencePatch }

interface FakeRoomState extends Room {
  name: string;
  mine: PresencePatch;
  others: Record<string, PeerInfo>;
  fns: Array<(ch: PeersChange) => void>;
  cfns: ConnFn[];
  errs: ErrFn[];
  pending: boolean;
  lastSend: number;
  timer: number;
  /** 結束的原因（錯誤代碼）；null 表示還活著 */
  dead: string | null;
  notify(): void;
  send(): void;
  conn(ok: boolean): void;
}

export function fakeRoom(): Lobby {
  const q = new URLSearchParams(location.search);
  const lag = +(q.get('lag') ?? '') || 0, jitter = +(q.get('jitter') ?? '') || 0, loss = +(q.get('loss') ?? '') || 0;
  const me = 'p' + Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel('pv-fakeroom');
  const rooms: Record<string, FakeRoomState> = {};
  let online = true, failJoins = 0;
  const lobbyConnFns: ErrFn[] = [];
  function deliver(fn: () => void): void { if (Math.random() < loss) return; window.setTimeout(fn, lag + Math.random() * jitter); }
  function post(m: FakeMsg): void { if (online) bc.postMessage(m); }
  bc.onmessage = (e: MessageEvent<FakeMsg>) => {
    const m = e.data, R = rooms[m.name];
    if (!online || !R || R.dead || m.peer === me) return;
    deliver(() => {
      if (!online || R.dead) return;
      if (m.t === 'hello') R.send();
      if (m.t === 'bye') { delete R.others[m.peer]; R.notify(); return; }
      if (m.t === 'p') { R.others[m.peer] = Object.freeze({ peer: m.peer, presence: m.presence as PresencePatch, updatedAt: Date.now(), isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null }); R.notify(); }
    });
  };
  window.addEventListener('pagehide', () => { Object.keys(rooms).forEach((n) => { post({ t: 'bye', name: n, peer: me }); }); });
  function err(code: string): RoomError { return { code, message: code }; }
  debug.fake = {
    down(ms) {
      online = false;
      Object.keys(rooms).forEach((n) => { rooms[n].conn(false); });
      window.setTimeout(() => {
        online = true;
        Object.keys(rooms).forEach((n) => { const R = rooms[n]; R.conn(true); R.send(); post({ t: 'hello', name: n, peer: me }); });
      }, ms);
    },
    endRoom(code) {
      Object.keys(rooms).forEach((n) => { const R = rooms[n]; R.dead = code || 'upstream_error'; const d = R.dead; R.errs.forEach((f) => { f(err(d)); }); post({ t: 'bye', name: n, peer: me }); delete rooms[n]; });
    },
    failJoins(n) { failJoins = n; },
    terminal(code) {
      lobbyConnFns.forEach((f) => { f(err(code)); });
      Object.keys(rooms).forEach((n) => { const R = rooms[n]; R.dead = code; R.errs.forEach((f) => { f(err(code)); }); });
    },
    me,
  };
  return {
    onConnection(fn, onErr) { window.setTimeout(() => { fn(online); }, 0); if (onErr) lobbyConnFns.push(onErr); return () => { /* 舊版也沒有取消 */ }; },
    connected() { return online; },
    join(name: string): Promise<Room> {
      if (failJoins > 0) { failJoins--; return new Promise<Room>((_, rej) => { window.setTimeout(() => { rej(err('upstream_error')); }, 200); }); }
      if (rooms[name]) return Promise.resolve(rooms[name]);
      const R: FakeRoomState = {
        name, mine: {}, others: {}, fns: [], cfns: [], errs: [], pending: false, lastSend: 0, timer: 0, dead: null,
        peers() {
          const list: PeerInfo[] = [{ peer: me, presence: R.mine, updatedAt: Date.now(), isMe: true, sameTab: true, kind: 'viewer', guest: false, by: null }];
          Object.keys(R.others).forEach((k) => { list.push(R.others[k]); });
          return list;
        },
        notify() {
          if (R.pending) return;
          R.pending = true;
          requestAnimationFrame(() => { R.pending = false; if (R.dead) return; const p = R.peers(); R.fns.forEach((f) => { f({ peers: p, joined: [], left: [], updated: p }); }); });
        },
        send() { post({ t: 'p', name, peer: me, presence: R.mine }); R.lastSend = now(); },
        conn(ok) { R.cfns.forEach((f) => { f(ok); }); },
        presence(patch) {
          if (R.dead) return Promise.reject(err(R.dead));
          const next: PresencePatch = Object.assign({}, R.mine);
          for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
          if (JSON.stringify(next).length > 4096) return Promise.reject(err('invalid_argument'));
          R.mine = next;
          const wait = Math.max(0, 33 - (now() - R.lastSend));
          if (!R.timer) R.timer = window.setTimeout(() => { R.timer = 0; R.send(); }, wait);
          return Promise.resolve();
        },
        onPeers(fn, onErr) { R.fns.push(fn); if (onErr) R.errs.push(onErr); window.setTimeout(R.notify, 0); return () => { R.fns = R.fns.filter((f) => f !== fn); R.errs = R.errs.filter((f) => f !== onErr); }; },
        onConnection(fn, onErr) { R.cfns.push(fn); if (onErr) R.errs.push(onErr); window.setTimeout(() => { fn(online); }, 0); return () => { R.cfns = R.cfns.filter((f) => f !== fn); R.errs = R.errs.filter((f) => f !== onErr); }; },
        connected() { return online && !R.dead; },
        leave() { post({ t: 'bye', name, peer: me }); if (rooms[name] === R) delete rooms[name]; R.fns = []; R.cfns = []; R.errs = []; return Promise.resolve(); },
      };
      rooms[name] = R;
      post({ t: 'hello', name, peer: me });
      return Promise.resolve(R);
    },
  };
}
