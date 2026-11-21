// ------------------------------------------------------------
// 房間（舊版 selfroom.js 的 makeRoom）
// ------------------------------------------------------------
// presence 兩條路同時送：直連（有的話）＋中繼（沒有直連的對象、或每秒一次心跳）。
// 接收端用序號去重，所以切換時不會漏也不會重複。
import { anyBroker, pubAll, pubRaw } from './relay';
import { closeRtc, connectRtc, onSignal, scheduleRetry } from './rtc';
import { PREFIX } from './relay';
import type { BrokerClient, PeerState, SelfCtx, SelfRoom, SignalMsg } from './types';
import type { PeerInfo, PeersChange, PresencePatch, Room } from '../room-types';
import { T } from '../text';

const MIN_GAP = 12;   // 兩包之間最少間隔（毫秒）：平常一有資料就立刻送，只擋掉比這更密的
function now(): number { return performance.now(); }

export function makeRoom(ctx: SelfCtx, name: string): SelfRoom {
  const me = ctx.me;
  const tp = PREFIX + '/' + name + '/p/', ts = PREFIX + '/' + name + '/s/';

  function subscribe(c: BrokerClient): void { try { c.cl!.subscribe([tp + '+', ts + me], { qos: 0 }); } catch (e) { /* 這個伺服器訂閱失敗：重連時會再訂一次 */ } }

  function peerList(): PeerInfo[] {
    const list: PeerInfo[] = [Object.freeze({ peer: me, presence: R.mine, updatedAt: Date.now(), isMe: true, sameTab: true, kind: 'viewer', guest: false, by: null })];
    Object.keys(R.peers).forEach((k) => { const p = R.peers[k]; if (p.pub) list.push(p.pub); });
    return list;
  }
  function notify(): void {
    if (R.pendingNotify || R.dead) return;
    R.pendingNotify = true;
    // 收到就馬上交給遊戲，不等下一次畫面更新（那會平白多等最多一幀）
    void Promise.resolve().then(() => {
      R.pendingNotify = false;
      if (R.dead) return;
      const l = peerList();
      R.fns.forEach((f) => { try { f({ peers: l, joined: [], left: [], updated: l }); } catch (e) { /* 呼叫端的錯誤不影響其他人 */ } });
    });
  }

  function getPeer(id: string): PeerState {
    let p: PeerState | undefined = R.peers[id];
    if (!p) {
      p = R.peers[id] = { id, seq: -1, pub: null, seen: now(), pc: null, dc: null, dcOpen: false, dcSeen: 0, retryAt: 0, tries: 0, via: 'relay', sigSeen: {}, pendC: [] };
      if (!ctx.noRtc && me < id) connectRtc(ctx, R, p);   // id 比較小的那一方負責發起直連
    }
    return p;
  }

  function onPresence(id: string | undefined, msg: Record<string, unknown>, via: 'relay' | 'dc'): void {
    if (R.dead || typeof id !== 'string' || id.length > 24) return;
    if (msg.bye) { dropPeer(id); notify(); return; }
    const p = R.getPeer(id);
    p.seen = now();
    if (via === 'dc') p.dcSeen = now();
    const n = Number(msg.n);
    if (!(n > p.seq) || !msg.p || typeof msg.p !== 'object') return;   // 兩條路都會收到：用序號去重，只收最新的
    p.seq = n; p.via = via;
    p.pub = Object.freeze({ peer: id, presence: Object.freeze(msg.p as Record<string, unknown>), updatedAt: Date.now(), isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null });
    notify();
  }

  function dropPeer(id: string): void {
    const p = R.peers[id];
    if (!p) return;
    closeRtc(p);
    delete R.peers[id];
  }

  function handleSignal(msg: SignalMsg): void { onSignal(ctx, R, msg); }

  // ---------- 送出 ----------
  function flush(force: boolean): void {
    if (R.dead) return;
    R.dirty = false;
    const s = JSON.stringify({ n: ++R.seq, p: R.mine });
    const ids = Object.keys(R.peers);
    let needRelay = ids.length === 0;
    ids.forEach((id) => {
      const p = R.peers[id];
      if (p.dcOpen && p.dc && p.dc.readyState === 'open') { try { p.dc.send(s); } catch (e) { needRelay = true; } }
      else needRelay = true;
    });
    // 沒有直連的對象走中繼；就算全部都直連，也每秒經中繼送一次（讓新加入的人看得到、直連斷掉時無縫接手）
    const t = now();
    R.lastFlush = t;
    if (needRelay || force || t - R.lastRelay > 1000) {
      R.lastRelay = t;
      pubRaw(ctx, tp + me, s);
    }
  }

  function presence(patch: PresencePatch): Promise<void> {
    if (R.dead) return Promise.reject({ code: 'invalid_argument', message: 'left' });
    const next: PresencePatch = Object.assign({}, R.mine);
    for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
    R.mine = next;
    R.dirty = true;
    if (!R.timer) {
      // 立刻送出（同一輪裡的多次更新合併成一包）；只有送得比 MIN_GAP 還密才延後
      const go = (): void => { R.timer = 0; if (R.dirty) R.flush(false); };
      const wait = MIN_GAP - (now() - R.lastFlush);
      if (wait <= 0) { R.timer = -1; void Promise.resolve().then(go); }
      else R.timer = window.setTimeout(go, wait);
    }
    return Promise.resolve();
  }

  // ---------- 維護：逾時、直連看門狗、重試 ----------
  function startTimer(): number {
    return window.setInterval(() => {
      const t = now();
      let changed = false;
      Object.keys(R.peers).forEach((id) => {
        const p = R.peers[id];
        if (t - p.seen > 8000) { dropPeer(id); changed = true; return; }
        if (p.dcOpen && t - p.dcSeen > 4000) { closeRtc(p); scheduleRetry(ctx, p); R.connChanged(); }   // 直連通道還開著但沒資料：當它壞了
        if (p.retryAt && t > p.retryAt && !p.pc) { p.retryAt = 0; connectRtc(ctx, R, p); }
      });
      if (changed) notify();
      if (t - R.lastRelay > 1000) R.flush(false);   // 心跳
    }, 500);
  }

  function connected(): boolean {
    if (R.dead) return false;
    if (anyBroker(ctx)) return true;
    return Object.keys(R.peers).some((id) => R.peers[id].dcOpen);
  }
  function connChanged(): void {
    const c = R.connected();
    if (c === R.lastConn) return;
    R.lastConn = c;
    R.cfns.forEach((f) => { try { f(c); } catch (e) { /* 呼叫端的錯誤不影響其他人 */ } });
  }
  function info(): string {
    const ids = Object.keys(R.peers), direct = ids.filter((id) => R.peers[id].dcOpen).length;
    const up = ctx.clients.filter((c) => c.up).length;
    return (ids.length ? (direct === ids.length ? T.linkDirect : direct ? T.linkMixed : T.linkRelay) : T.linkWait) + T.relays + up + '/' + ctx.clients.length;
  }

  const api: Room = {
    name,
    presence,
    peers: peerList,
    onPeers(fn: (ch: PeersChange) => void) { R.fns.push(fn); window.setTimeout(notify, 0); return () => { R.fns = R.fns.filter((f) => f !== fn); }; },
    onConnection(fn: (ok: boolean) => void) { R.cfns.push(fn); window.setTimeout(() => { try { fn(R.connected()); } catch (e) { /* 同上 */ } }, 0); return () => { R.cfns = R.cfns.filter((f) => f !== fn); }; },
    connected,
    info,
    leave() {
      if (R.dead) return Promise.resolve();
      pubAll(ctx, tp + me, { bye: 1 });
      R.dead = true;
      clearInterval(R.iv); clearTimeout(R.timer);
      Object.keys(R.peers).forEach(dropPeer);
      ctx.clients.forEach((c) => { if (c.up) { try { c.cl!.unsubscribe([tp + '+', ts + me]); } catch (e) { /* 同上 */ } } });
      if (ctx.rooms[name] === R) delete ctx.rooms[name];
      R.fns = []; R.cfns = [];
      return Promise.resolve();
    },
  };
  // 方法都是上面的具名函式（它們在被呼叫時才用到 R），所以物件可以一次建好，不用先轉型再一個個掛上去
  const R: SelfRoom = {
    name, mine: {}, seq: 0, peers: {}, fns: [], cfns: [], dead: false,
    dirty: false, timer: 0, lastRelay: 0, lastFlush: 0, sigN: 0, pendingNotify: false, lastConn: null, iv: 0,
    tp, ts,
    subscribe, getPeer, onPresence, onSignal: handleSignal, flush, presence, connected, connChanged, info, api,
  };
  R.iv = startTimer();
  ctx.clients.forEach((c) => { if (c.up) R.subscribe(c); });
  return R;
}
