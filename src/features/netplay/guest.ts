// ============================================================
// 客人（右 2P）：不跑物理，只送按鍵、收房主每幀的快照來畫
// ============================================================
// 體感：客人用「還沒被房主確認的輸入」預測自己的左右位置；快照沒到時球外推最多 2 幀。
import { svc } from '../../core/services';
import type { FxEventData, FxEventType } from '../../core/services';
import { hooks } from '../../core/hooks';
import type { Controller, GameState, Player, PlayerSound } from '../../core/types';
import type { PeerInfo } from './room-types';
import { EV_TYPES, at, num, type GuestPresence, type RemoteSnap } from './protocol';
import { net } from './state';
import { T } from './text';
import { A, J, ctrlOf, ensureGame, now, validCh } from './util';
import { closePanel, openPanel, panelOpen } from './ui';
import { send, stop } from './session';

// ------------------------------------------------------------
// 收到房主的 presence
// ------------------------------------------------------------
export function guestPeers(peers: PeerInfo[]): void {
  const hosts = peers.filter((p) => !p.sameTab && p.kind !== 'agent' && p.presence && p.presence.role === 'host' && p.presence.ph !== 'bye');
  const me = peers.filter((p) => p.sameTab)[0];
  // 選房主的順序：把我當對手的那個 > 原本跟著的那個 > peer 標籤最小的。
  // 這樣就算有人用同一個代碼開了第二個房間（或故意冒充），也搶不走正在進行的比賽。
  function rank(h: PeerInfo): number {
    const mine = me && h.presence.opp === me.peer;
    const live = h.presence.ph === 'play' || h.presence.ph === 'end';
    if (h.peer === net.hostPeer && mine) return 0;   // 正在跟我打的那個房主
    if (mine && live) return 1;
    if (h.peer === net.hostPeer) return 2;
    if (mine) return 3;
    return 4;
  }
  hosts.sort((a, b) => rank(a) - rank(b) || (a.peer < b.peer ? -1 : 1));
  const h = hosts[0];
  const bye = !h && net.hostPeer && peers.filter((p) => p.peer === net.hostPeer && p.presence && p.presence.ph === 'bye')[0];
  if (bye) { if (net.render || net.phase !== 'lobby') stop(T.ended); else net.hostPeer = null; return; }
  if (!h) { net.hostPeer = null; return; }
  net.hostPeer = h.peer;
  const pr = h.presence;
  if (pr.ts !== net.hostTs) { net.hostTs = pr.ts; net.hostSeenT = now(); if (net.lostAt) { net.lostAt = 0; } }
  net.hostHidden = !!pr.hid;
  net.hostCh = validCh(pr.ch);
  const mine = me && pr.opp === me.peer;
  net.hostRole = mine ? 'player' : 'spec';
  if (pr.ack && mine) {
    const aseq = num(at(pr.ack, 0)), t = num(at(pr.ack, 1));
    if (t && t !== net.lastAckT) { net.lastAckT = t; const rtt = now() - t; if (rtt >= 0 && rtt < 5000) net.rtt = net.rtt ? net.rtt * 0.8 + rtt * 0.2 : rtt; }
    net.ackSeq = aseq;
  }
  if (pr.ph === 'play' && net.prevPh === 'end') closePanel();
  if ((pr.ph === 'play' || pr.ph === 'end') && pr.s) {
    const c = ctrlOf();
    if (!c) { ensureGame(); return; }   // 還在載入：載好後下一包快照就會進場
    if (!net.render) guestEnter(c);
    net.phase = pr.ph;
    // 遠端資料：型別只是「正常時」的樣子，下面照舊版逐一防呆
    const s = pr.s as RemoteSnap;
    if (s.sid !== net.gSid) {
      // 房主開了新的一局或重新整理：幀號、計數器全部重新對齊
      net.gSid = s.sid; net.lastF = -1; net.queue = [];
      net.gHit = null; net.gSnd = null; net.evBase = true; net.gEv = 0; net.gScores = ''; net.gState = '';
    }
    net.hz = num(s.hz);
    if (typeof s.f === 'number' && s.f > net.lastF) {
      net.lastF = s.f;
      net.queue.push({ s, ack: net.ackSeq });   // 不改動收到的 presence 物件（連線層給的是凍結的）
      if (net.queue.length > 6) net.queue.shift();
    }
    if (pr.ph === 'end' && !panelOpen() && net.prevPh !== 'end') { openPanel(); }
  } else if (pr.ph === 'lobby' && net.render) {
    // 房主回到大廳（例如按了重來）
    guestExit(ctrlOf()); net.phase = 'lobby';
  }
  net.prevPh = pr.ph;
}

// ------------------------------------------------------------
// 進出觀看畫面
// ------------------------------------------------------------
/** 客人的狀態機：什麼都不做（畫面由 tick 掛勾裡的 guestFrame 負責）。 */
const guestState: GameState = function () { /* 不跑遊戲本體 */ };

function guestEnter(c: Controller): void {
  net.render = true;
  net.savedChars = [c.physics.player1.character, c.physics.player2.character];
  c.view.intro.visible = false; c.view.menu.visible = false;
  if (c.isPracticeMode) c.isPracticeMode = false;
  c.slowMotionFramesLeft = 0;
  c.state = guestState;
  net.queue = []; net.last = null; net.extrap = 0;
  net.gHit = null; net.gSnd = null; net.gScores = ''; net.gState = '';
  net.gEv = 0; net.evBase = true;
  net.hostSeenT = now(); net.lostAt = 0;
  closePanel();
}

export function guestExit(c: Controller | null): void {
  net.render = false;
  if (c) {
    try { c.audio.sounds.bgm.stop(); } catch (e) { /* 音效還沒載好 */ }
    if (net.savedChars) { c.physics.player1.character = net.savedChars[0]; c.physics.player2.character = net.savedChars[1]; }
    const an = A(); if (an) an.clear(c);
    c.restart();
  }
  net.savedChars = null;
}

// ------------------------------------------------------------
// 送出自己的輸入
// ------------------------------------------------------------
export function guestSend(): void {
  if (!net.room) return;
  const c = ctrlOf();
  // hostTs 是房主送來的 ts（正常是數字）；照舊版直接拿來加
  const p: GuestPresence = { role: 'guest', ch: net.myCh, ph: 'lobby', hp: net.render ? net.hostPeer : null, hid: document.hidden ? 1 : 0, ht: net.hostTs ? Math.round((net.hostTs as number) + now() - net.hostSeenT) : 0, t: Math.round(now()) };
  if (net.render && c) p.in = [net.curX || 0, net.curY || 0, net.pc, net.dc, net.dd, net.seq];
  send(p);
}

function guestReadInput(c: Controller): void {
  const kb = c.keyboardArray, k0 = kb[0], k1 = kb[1];
  const x = k0.xDirection || k1.xDirection, y = k0.yDirection || k1.yDirection;
  if (k0.powerHit === 1 || k1.powerHit === 1) net.pc++;
  const d = k0.dashRequest || k1.dashRequest;
  if (d) { net.dc++; net.dd = d; }
  net.curX = x; net.curY = y;
  net.seq++;
  net.hist.push([net.seq, x]);
  if (net.hist.length > 40) net.hist.shift();
}

// ------------------------------------------------------------
// 套用快照
// ------------------------------------------------------------
function setPl(p: Player, a: unknown): void {
  if (!Array.isArray(a)) return;
  p.x = num(a[0]); p.y = num(a[1]); p.state = num(a[2]); p.frameNumber = num(a[3]); p.divingDirection = num(a[4]);
  p.character = validCh(a[6]);
  p.isDashing = !!a[7]; p.yVelocity = num(a[8]);
  const tr: unknown = a[9];
  if (Array.isArray(tr)) { p.dashTrailX = [num(tr[0]), num(tr[2])]; p.dashTrailY = [num(tr[1]), num(tr[3])]; }
  else { p.dashTrailX = []; p.dashTrailY = []; }
}

function moveSpeed(ch: string): number {
  const tu: Record<string, number> = (svc.abilities && svc.abilities.tuning) || {};
  return 6 + (ch === 'jolteon' ? (tu.joltSpeed || 0) : ch === 'mewtwo' ? (tu.mewtwoSpeed || 0) : 0);
}

const SOUND_KEYS: Array<keyof PlayerSound> = ['pipikachu', 'pika', 'chu', 'flap'];

function applySnap(c: Controller, s: RemoteSnap, fresh: boolean): void {
  const ph = c.physics, b = ph.ball, g = c.view.game;
  setPl(ph.player1, s.p && s.p[0]);
  setPl(ph.player2, s.p && s.p[1]);
  // 擊球：用累計次數判斷，就算中間掉幀也不會漏掉擊球特效
  const hits = [num(s.p && s.p[0] && s.p[0][5]), num(s.p && s.p[1] && s.p[1][5])];
  if (!net.gHit) net.gHit = hits.slice();
  ph.player1.isCollisionWithBallHappened = fresh && hits[0] > net.gHit[0];
  ph.player2.isCollisionWithBallHappened = fresh && hits[1] > net.gHit[1];
  if (fresh) net.gHit = hits;

  const a = s.b || [];
  b.x = num(a[0]); b.y = num(a[1]); b.rotation = num(a[2]) | 0;
  b.punchEffectX = num(a[3]); b.punchEffectY = num(a[4]);
  b.punchEffectRadius = fresh ? num(a[5]) + (num(a[5]) > 0 ? 2 : 0) : b.punchEffectRadius;
  b.isPowerHit = !!a[6];
  b.previousX = num(a[7]); b.previousY = num(a[8]); b.previousPreviousX = num(a[9]); b.previousPreviousY = num(a[10]);
  b.xVelocity = num(a[11]); b.yVelocity = num(a[12]);
  ph.player1.isWinner = s.w === 1; ph.player2.isWinner = s.w === 2;

  if (Array.isArray(s.sc)) { c.scores[0] = num(s.sc[0]); c.scores[1] = num(s.sc[1]); }
  const scKey = c.scores[0] + ':' + c.scores[1];
  if (scKey !== net.gScores) { net.gScores = scKey; g.drawScoresToScoreBoards(c.scores); }

  // 畫面狀態
  if (s.st === 'startOfNewGame' && net.gState !== 'startOfNewGame') {
    try { c.audio.sounds.bgm.stop(); c.audio.sounds.bgm.play(); } catch (e) { /* 音效還沒載好 */ }   // 先停再播：再來一局、或進場前本機在跑示範賽時才不會疊兩層
    const an0 = A(); if (an0) an0.set(null);
  }
  net.gState = s.st;
  const gv = !!s.gv;
  if (g.visible !== gv) g.visible = gv;
  const ms = num(s.ms);
  if (ms & 1) g.drawGameStartMessage(Math.max(1, num(s.fc)), c.frameTotal.startOfNewGame + 100);
  if (ms & 4) g.drawGameEndMessage(s.st === 'round' ? num(s.fc) : 60);
  g.messages.gameStart.visible = !!(ms & 1);
  g.messages.ready.visible = !!(ms & 2);
  g.messages.gameEnd.visible = !!(ms & 4);
  c.view.fadeInOut.setBlackAlphaTo(Math.max(0, Math.min(1, num(s.fa))));

  // 音效：計數器增加就播
  if (fresh && Array.isArray(s.so)) {
    if (!net.gSnd) net.gSnd = s.so.slice();
    for (let i = 0; i < 2; i++) for (let k = 0; k < 4; k++) {
      if (num(s.so[i * 4 + k]) > num(net.gSnd[i * 4 + k])) (i ? ph.player2 : ph.player1).sound[SOUND_KEYS[k]] = true;
    }
    if (num(s.so[8]) > num(net.gSnd[8])) b.sound.powerHit = true;
    if (num(s.so[9]) > num(net.gSnd[9])) b.sound.ballTouchesGround = true;
    net.gSnd = s.so.slice();
    // 舊版呼叫 ctrl.playSoundEffect()（被 netplay 包過的那個）；這裡走同一條掛勾鏈
    hooks.playSoundEffect.run(c);
  }

  // 技能狀態與事件
  const an = A();
  if (an && s.ab) an.set(s.ab);
  if (fresh && Array.isArray(s.ev)) {
    let maxId = 0;
    s.ev.forEach((e: unknown) => {
      if (!Array.isArray(e)) return;
      const id = num(e[0]); maxId = Math.max(maxId, id);
      // EV_TYPES 是普通物件，用 e[1] 當鍵查（跟舊版一樣會轉成字串）
      if (net.evBase || id <= net.gEv || !EV_TYPES[String(e[1])]) return;
      const o: unknown = e[2];
      if (!o || typeof o !== 'object' || Array.isArray(o)) return;
      const ob = o as Record<string, unknown>;   // 上一行確認過是一般物件
      const d: Record<string, unknown> = {};
      Object.keys(ob).forEach((key) => {
        if (key === 'pl' || key === '__proto__' || key === 'constructor') return;
        const v = ob[key];
        d[key] = typeof v === 'string' && /^[A-Za-z]{1,8}$/.test(v) ? v : typeof v === 'boolean' ? v : num(v);
      });
      if ('pl' in ob) d.player = ob.pl ? ph.player2 : ph.player1;
      if (typeof ob.red === 'boolean') d.red = ob.red;
      // 種類照原樣傳（通過 EV_TYPES 檢查的正常是字串）；內容是上面逐欄清理過的
      if (svc.fxEvent) svc.fxEvent(e[1] as FxEventType, d as FxEventData);
    });
    net.gEv = Math.max(net.gEv, maxId);
  }
  if (fresh) net.evBase = false;
}

function predictSelf(c: Controller, s: RemoteSnap): void {
  // 只預測左右移動；被定身、被減速、撲救中就不預測，直接用房主的位置
  if (net.hostRole !== 'player' || !s.p || !s.p[1]) return;
  const p = c.physics.player2, st = s.p[1][2] as number;   // 遠端資料：比較運算照 JS 規則，跟舊版一樣
  const ab: Record<string, number> = (s.ab && s.ab.s && s.ab.s.p2) || {};
  if (st > 2 || ab.stunTimer > 0 || ab.slowTimer > 0 || ab.reverseTimer > 0 || ab.zipT > 0) return;
  const ack = net.lastAck || 0;
  let sum = 0, n = 0;
  for (let i = net.hist.length - 1; i >= 0 && n < 8; i--) {
    if (net.hist[i][0] <= ack) break;
    sum += net.hist[i][1]; n++;
  }
  if (!n) return;
  let x = p.x + sum * moveSpeed(p.character);
  if (x < 248) x = 248; if (x > 400) x = 400;
  if (Math.abs(x - p.x) < 60) p.x = x;
}

// ------------------------------------------------------------
// 每幀（tick 掛勾）：讀輸入、送出、套用快照、畫
// ------------------------------------------------------------
let guestErrs = 0;
export function guestFrame(c: Controller): void {
  try { guestFrameInner(c); }
  catch (e) {
    // 收到壞資料也不能讓遊戲迴圈死掉：丟掉這一幀，繼續下一幀
    if (guestErrs++ < 5) console.warn('[netplay] bad snapshot ignored', e);
    net.last = null;
  }
}
function guestFrameInner(c: Controller): void {
  guestReadInput(c);
  guestSend();
  const jn = J(); if (jn) jn.guestTick(c);
  let s: RemoteSnap | null = null, fresh = false;
  if (net.queue.length) {
    while (net.queue.length > 2) net.queue.shift();   // 落後太多就追上，最多緩衝 2 幀
    const qi = net.queue.shift()!; s = qi.s; net.lastAck = qi.ack; fresh = true; net.extrap = 0; net.last = s;
  } else s = net.last;
  if (!s || typeof s !== 'object') return;
  applySnap(c, s, fresh);
  const b = c.physics.ball;
  if (!fresh && s.st === 'round' && !s.sm && !s.hz && net.extrap < 2) {
    // 快照遲到：球照物理往前推一點，避免畫面卡住
    net.extrap++;
    for (let k = 0; k < net.extrap; k++) {
      b.x += b.xVelocity; b.y += b.yVelocity; b.yVelocity += 1;
      if (b.y > 252) b.y = 252;
    }
  }
  predictSelf(c, s);
  const g = c.view.game;
  if (g.visible) {
    g.drawPlayersAndBall(c.physics);
    g.drawCloudsAndWave();
    const an = A(); if (an) { try { an.draw(c); } catch (e) { an.set({}); } }
  }
}
