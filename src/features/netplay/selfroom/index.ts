// selfroom — 自架版的連線層（不依賴 claude.ai）
// 對 netplay 提供跟平台 room 一樣的介面：join(name) → { presence, peers, onPeers, onConnection, connected, leave }
//
// 三層防護：
//  1. WebRTC 資料通道（點對點直連，延遲最低）。不可靠模式：掉包不重傳，下一包直接蓋過去，不會卡。
//  2. 中繼：同時連上多個公開 MQTT 伺服器（WebSocket）。直連打不通（行動網路、公司防火牆）或斷掉時，
//     資料自動改走中繼；任何一個中繼伺服器掛了，立刻換下一個。配對（交換直連資訊）也是走這一層。
//  3. 自我修復：每一層各自自動重連（退避重試）；直連 4 秒沒收到資料就判定失效、退回中繼並在背景重建。
//     兩條路同時送心跳，接收端用序號去重，所以切換時不會漏也不會重複。
//
// 舊版是 mqtt.min.js 載入後再載入 selfroom.js，在載入當下建立；這裡改成 createSelfLobby() 在同一個時間點呼叫。
import { BROKERS } from '../../../core/config';
import { debug } from '../debug';
import type { Lobby, Room } from '../room-types';
import { anyBroker, startBrokers } from './relay';
import { makeRoom } from './room';
import type { SelfCtx } from './types';

/** ICE 伺服器（舊版 window.PV_ICE 的預設值）。 */
const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function now(): number { return performance.now(); }

/** 建立自架層的 lobby。window.mqtt 不在（函式庫沒載入成功）就回傳 null。 */
export function createSelfLobby(): Lobby | null {
  if (!window.mqtt) return null;

  const q = new URLSearchParams(location.search);
  let brokers = (q.get('brokers') || '').split(',').filter(Boolean);
  if (!brokers.length) brokers = BROKERS.slice();
  const ctx: SelfCtx = {
    me: Math.random().toString(36).slice(2, 12),
    brokers,
    noRtc: q.has('nortc') || !window.RTCPeerConnection,
    ice: ICE,
    clients: [],
    started: false,
    lobbyFns: [],
    rooms: {},
    lobbyConnected: () => lobby.connected(),
  };

  const lobby: Lobby = {
    self: true,
    connected() { return anyBroker(ctx); },
    onConnection(fn) { ctx.lobbyFns.push(fn); window.setTimeout(() => { try { fn(anyBroker(ctx)); } catch (e) { /* 呼叫端的錯誤 */ } }, 0); return () => { /* 舊版也沒有取消 */ }; },
    join(name: string): Promise<Room> {
      startBrokers(ctx);
      if (ctx.rooms[name]) return Promise.resolve(ctx.rooms[name].api);
      const R = ctx.rooms[name] = makeRoom(ctx, name);
      // 等任何一個中繼伺服器連上（最多 10 秒）
      return new Promise<Room>((res, rej) => {
        const t0 = now();
        (function wait(): void {
          if (R.dead) return rej({ code: 'upstream_error', message: 'left' });
          if (anyBroker(ctx)) return res(R.api);
          if (now() - t0 > 10000) { void R.api.leave(); return rej({ code: 'upstream_error', message: 'no relay reachable' }); }
          window.setTimeout(wait, 150);
        })();
      });
    },
  };

  window.addEventListener('pagehide', () => { Object.keys(ctx.rooms).forEach((n) => { try { void ctx.rooms[n].api.leave(); } catch (e) { /* 關頁中 */ } }); });
  // 測試用：故障注入（舊版 window.__self）
  debug.self = {
    me: ctx.me, clients: ctx.clients, rooms: ctx.rooms,
    killRtc() {
      Object.keys(ctx.rooms).forEach((n) => {
        const R = ctx.rooms[n];
        Object.keys(R.peers).forEach((id) => { const p = R.peers[id]; try { if (p.pc) p.pc.close(); } catch (e) { /* 已經關了 */ } p.dcOpen = false; p.pc = null; p.dc = null; p.retryAt = now() + 3000; });
      });
    },
  };
  return lobby;
}
