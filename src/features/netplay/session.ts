// ============================================================
// 進出房間、連線管理、定時檢查
// ============================================================
// ------------------------------------------------------------
// 連線管理：連線層會自己處理 socket 的短暫重連；這裡處理它處理不了的：
//  - 具名房間「結束」（upstream_error / limit_reached）→ 指數退避後重新 join（peer 標籤不變，對局接得回來）
//  - 永久性錯誤（revoked / not_granted / capability_*）→ 直接結束，不重試
//  - connected() 掉下去持續 2 秒才算斷線（短暫掉一下是正常的）
//  - 斷線太久仍沒恢復 → 主動重 join；總共 60 秒都救不回來才放棄
// ------------------------------------------------------------
import { store } from '../../core/storage';
import { getRoom, roomWhy, selfMode } from './room';
import type { Lobby, PeersChange, PresencePatch, Room } from './room-types';
import { roomName, type Role } from './protocol';
import { conn, net } from './state';
import { T } from './text';
import { ctrlOf, ensureGame, now } from './util';
import { hud, overlay, panelOpen, renderPanel, status, ui } from './ui';
import { hostBackToLobby, hostExit, hostPeers, hostSend } from './host';
import { guestExit, guestPeers, guestSend } from './guest';

/** 目前用的 lobby（自架層或假房間）。 */
export let lobby: Lobby | null = null;
/** 已經掛過永久性錯誤監聽的 lobby（舊版在 lobby 物件上設 __pvWatched）。 */
const watched = new WeakSet<Lobby>();

const TERMINAL: Record<string, number> = { revoked: 1, not_granted: 1, capability_disabled: 1, capability_removed: 1, transform_error: 1 };

/** 錯誤物件的代碼（沒有就當成 upstream_error）。 */
function errCode(e: unknown): string {
  // 錯誤來自連線層（{ code, message }），正常 code 是字串；照舊版直接拿來用
  return (e ? (e as { code?: string }).code : undefined) || 'upstream_error';
}

export function start(role: Role, code: string): void {
  if (net.phase !== 'off') stop();
  ensureGame();
  const token = ++conn.token;   // 每次開始一個新的 token；舊的 join 結果回來就丟掉
  status(T.connecting);
  getRoom().then((room) => {
    if (token !== conn.token) return;
    if (!room) { status((selfMode ? T.noRelay : T.noRoom) + '  [' + roomWhy + ']', true); return; }
    lobby = room;
    net.code = code; net.role = role; net.phase = 'lobby'; net.msg = '';
    net.joinedAt = now();
    net.sid = Math.random().toString(36).slice(2, 8);
    conn.attempt = 0; conn.lostSince = 0;
    if (lobby.onConnection && !watched.has(lobby)) {
      watched.add(lobby);
      lobby.onConnection(() => { /* 只要錯誤通知 */ }, (e) => { if (TERMINAL[errCode(e)] && net.phase !== 'off') fatal(errCode(e)); });
    }
    joinRoom();
    renderPanel();
  }).catch((e: unknown) => { status(errCode(e), true); });
}

function joinRoom(): void {
  if (net.phase === 'off' || !lobby) return;
  const token = conn.token;
  if (conn.joining === token) return;
  conn.joining = token;
  const name = roomName(net.code);
  // 剛按過「離開」又馬上進同一個房間：連線層會回傳同一個房間物件，所以取消那個延遲的 leave，免得把新的連線踢掉
  if (conn.leaving) { clearTimeout(conn.leaveTimer); conn.leaving = null; }
  lobby.join(name).then((nr) => {
    if (conn.joining === token) conn.joining = 0;
    if (token !== conn.token || net.phase === 'off') {
      if (net.room !== nr) { try { void nr.leave(); } catch (e) { /* 已經離開 */ } }
      // 這段時間內又開始了新的一次：如果新的那次被擋住了，補一次 join
      if (net.phase !== 'off' && !net.room && !conn.timer) joinRoom();
      return;
    }
    conn.attempt = 0;
    attach(nr);
    // 記在這個分頁裡：不小心重新整理後可以一鍵回到同一個房間
    store.set('pv-net-last', JSON.stringify({ role: net.role, code: net.code }), true);
  }, (e: unknown) => {
    if (conn.joining === token) conn.joining = 0;
    if (token !== conn.token) { if (net.phase !== 'off' && !net.room && !conn.timer) joinRoom(); return; }
    const code = errCode(e);
    net.lastErr = code;
    if (TERMINAL[code] || code === 'not_permitted') { fatal(code); return; }
    if (code === 'invalid_argument') { stop(code); return; }
    if (!conn.lostSince) conn.lostSince = now();   // 一開始就一直加入失敗，也要算進 60 秒放棄
    if (!conn.downSince) conn.downSince = now();
    scheduleRejoin();
  });
}

function attach(nr: Room): void {
  detach(false);
  const gen = ++conn.gen;
  net.room = nr;
  const lost = (e: unknown): void => { if (gen === conn.gen) roomLost(e); };
  net.unsub.push(nr.onPeers((ch) => { if (gen === conn.gen) onPeers(ch); }, lost));
  if (nr.onConnection) net.unsub.push(nr.onConnection((ok) => { if (gen === conn.gen) connChanged(ok); }, lost));
  connChanged(nr.connected ? nr.connected() : true);
}

function detach(leave: boolean): void {
  net.unsub.forEach((u) => { try { u(); } catch (e) { /* 已經取消 */ } });
  net.unsub = [];
  conn.gen++;
  const r = net.room;
  net.room = null;
  if (r && leave) { try { void r.leave(); } catch (e) { /* 已經離開 */ } }
}

function connChanged(ok: boolean): void {
  if (ok) {
    // 從「真的斷線」恢復：給對方的資料一點緩衝時間，並倒數後才繼續，免得一恢復就被判對手斷線或直接開打
    if (conn.downSince && now() - conn.downSince > 2000 && (net.phase === 'play' || net.phase === 'end')) {
      if (net.role === 'host') { net.resumeAt = now() + 1500; net.oppSeen = now(); }
      else net.hostSeenT = now();
    }
    conn.up = true; conn.downSince = 0; conn.lostSince = 0; conn.failSends = 0;
    resendNow();
  } else if (conn.up || !conn.downSince) {
    conn.up = false; conn.downSince = now();
    if (!conn.lostSince) conn.lostSince = now();
  }
}

function roomLost(e: unknown): void {
  const code = errCode(e);
  net.lastErr = code;
  if (TERMINAL[code] || code === 'not_permitted') { fatal(code); return; }
  conn.up = false;
  if (!conn.downSince) conn.downSince = now();
  if (!conn.lostSince) conn.lostSince = now();
  detach(true);
  scheduleRejoin();
}

function scheduleRejoin(): void {
  if (conn.timer || net.phase === 'off') return;
  // 0.5s → 1s → 2s → 4s → 8s（上限），加 ±25% 抖動，避免兩邊同時重試撞在一起
  const base = Math.min(8000, 500 * Math.pow(2, conn.attempt));
  const delay = base * (0.75 + Math.random() * 0.5);
  conn.attempt++;
  conn.timer = window.setTimeout(() => { conn.timer = 0; joinRoom(); }, delay);
}

function fatal(code: string): void {
  stop(code === 'revoked' ? T.revoked : T.noRoom);
}

/** 自己斷線超過 2 秒。 */
export function selfDown(): boolean { return !conn.up && !!conn.downSince && now() - conn.downSince > 2000; }

// presence 送出的共同入口：送失敗累積太多次就當房間壞了，重新 join
export function send(p: PresencePatch): void {
  const r = net.room;
  if (!r) return;
  r.presence(p).then(() => { conn.failSends = 0; conn.firstFail = 0; }, (e: unknown) => {
    const code = errCode(e);
    net.lastErr = code;
    if (code === 'invalid_argument') { console.warn('[netplay] presence rejected', e && (e as { message?: unknown }).message); return; }
    if (TERMINAL[code]) { fatal(code); return; }
    if (!conn.firstFail) conn.firstFail = now();
    // 重連期間送失敗是正常的：連續失敗而且超過 3 秒才當成房間壞了
    if (++conn.failSends > 25 && now() - conn.firstFail > 3000 && r === net.room) roomLost(e);
  });
}

export function resendNow(): void {
  if (!net.room) return;
  if (net.role === 'host') { if (net.phase === 'play' || net.phase === 'end') hostSend(true); else sendLobby(); }
  else guestSend();
}

export function stop(msg?: string): void {
  const c = ctrlOf();
  const wasPlaying = net.phase === 'play' || net.phase === 'end';
  if (conn.timer) { clearTimeout(conn.timer); conn.timer = 0; }
  const r = net.room;
  detach(false);
  conn.token++; conn.joining = 0;
  if (r) {
    // 先告訴對方「我走了」，對方就不用等斷線倒數；稍後再真的離開（讓這則 presence 送得出去）
    try { r.presence({ ph: 'bye', s: null }).catch(() => { /* 已經斷了 */ }); } catch (e) { /* 同上 */ }
    if (conn.leaving) clearTimeout(conn.leaveTimer);
    conn.leaving = r;
    conn.leaveTimer = window.setTimeout(() => { if (conn.leaving === r) { conn.leaving = null; try { void r.leave(); } catch (e) { /* 已經離開 */ } } }, 400);
  }
  if (c) {
    if (net.render) guestExit(c);
    else if (net.role === 'host' && wasPlaying) hostExit(c);
  }
  Object.assign(net, {
    code: '', role: null, phase: 'off', opp: null, oppIn: null, oppBase: null, paused: false, lostAt: 0, resumeAt: 0,
    hostPeer: null, render: false, queue: [], last: null, lastF: -1, rtt: 0, msg: '', hostRole: null, gSid: null,
  });
  conn.up = false; conn.downSince = 0; conn.lostSince = 0; conn.attempt = 0; conn.failSends = 0; conn.firstFail = 0;
  store.remove('pv-net-last', true);
  overlay('');
  hud();
  renderPanel();
  status(msg || '');
  if (ui.codeIn) ui.codeIn.value = '';
}

export function sendLobby(): void {
  if (!net.room) return;
  const p: PresencePatch = { role: net.role, ch: net.myCh, ph: net.phase, ts: Math.round(now()), hid: document.hidden ? 1 : 0 };
  if (net.role === 'host') { p.opp = net.opp; }
  send(p);
}

/** 每 250ms：斷線處理、逾時檢查、介面更新、大廳心跳。 */
export function tick250(): void {
  if (net.phase === 'off') return;
  // 斷線 15 秒還沒救回來：主動重新 join；總共 60 秒都不行就放棄
  if (conn.lostSince && !conn.timer && !conn.joining && now() - conn.lostSince > 15000 && now() - (conn.lastForce || 0) > 15000) {
    conn.lastForce = now(); detach(true); scheduleRejoin();
  }
  if (conn.lostSince && now() - conn.lostSince > 60000) { stop(T.gaveUp); return; }
  checkTimeouts();
  if (panelOpen()) renderPanel();
  hud();
  if (!net.room) return;
  if (net.role === 'host' && net.phase === 'lobby') sendLobby();
  if (net.role === 'host' && net.phase === 'play' && now() - net.lastSendT > 400) hostSend(true);   // 暫停或慢動作時的心跳
  if (net.role === 'guest' && !net.render) guestSend();
}

// ============================================================
// 收到房間裡其他人的 presence
// ============================================================
let peerErrs = 0;
function onPeers(ch: PeersChange): void {
  try { onPeersInner(ch); }
  catch (e) { if (peerErrs++ < 5) console.warn('[netplay] bad presence ignored', e); }
}
function onPeersInner(ch: PeersChange): void {
  const peers = Array.isArray(ch && ch.peers) ? ch.peers : [];
  net.peerCount = peers.length;
  net.peerDbg = peers.map((p) => (p.sameTab ? '*' : '') + (p.kind || '?') + ':' + String((p.presence && p.presence.role) || '-')).join(' ');
  if (net.role === 'host') hostPeers(peers);
  else guestPeers(peers);
}

// ============================================================
// 逾時：對手斷線、房主斷線、暫停中的提示
// ============================================================
function checkTimeouts(): void {
  const t = now();
  if (net.phase !== 'play' && net.phase !== 'end') {
    overlay('');
    if (net.phase === 'lobby' && (selfDown() || !net.room) && panelOpen()) status(T.reconnecting, true);
    return;
  }
  let msg = '';
  if (selfDown()) msg = T.selfDown;
  if (net.role === 'host') {
    if (net.phase === 'play' && net.opp) {
      const stale = t - net.oppSeen > 2500;
      if ((stale || net.oppHidden) && !selfDown()) {
        if (!net.paused) { net.paused = true; net.lostAt = t; }
        const lim = net.oppGone ? 10 : net.oppHidden ? 120 : 30;   // 對方已經不在房間就不用等那麼久；切背景就多等
        msg = (net.oppHidden ? T.oppHidden : T.lostOpp) + ' ' + Math.max(0, Math.ceil(lim - (t - net.lostAt) / 1000));
        if (t - net.lostAt > lim * 1000) { hostBackToLobby(); return; }
      }
      if (!msg && net.resumeAt > t) msg = T.resume + ' ' + Math.ceil((net.resumeAt - t) / 500);
    }
  } else if (net.render) {
    if (!msg && t - net.hostSeenT > 2500) {
      if (!net.lostAt) net.lostAt = t;
      msg = T.hostLost + ' ' + Math.max(0, Math.ceil(30 - (t - net.lostAt) / 1000));
      if (t - net.lostAt > 30000) { stop(T.ended); return; }
    } else if (!msg && net.hostHidden) msg = T.hostHidden;
    else if (!msg && net.hz === 1 && net.hostRole === 'player') msg = T.youLag;
    else if (!msg && net.hz === 3) msg = net.hostRole === 'player' ? T.paused : T.oppHidden;
    else if (!msg && net.hz === 2) msg = T.resume;
  }
  overlay(msg);
}
