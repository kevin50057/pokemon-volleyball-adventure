// ============================================================
// 房主（左 1P）：跑完整遊戲，物理、技能、得分都只在房主算；每幀把快照傳給客人
// ============================================================
import type { FxEventData, FxEventType } from '../../core/services';
import type { Controller, FadeInOut, GameState, Player, PlayerSound } from '../../core/types';
import type { PeerInfo } from './room-types';
import { EV_TYPES, num, parseIn, r1, type HostPresence, type PlArr, type Snap } from './protocol';
import { net } from './state';
import { T } from './text';
import { A, ctrlOf, ensureGame, now, validCh } from './util';
import { closePanel, openPanel, overlay, status } from './ui';
import { selfDown, send, sendLobby } from './session';

// ------------------------------------------------------------
// 收到客人的 presence
// ------------------------------------------------------------
export function hostPeers(peers: PeerInfo[]): void {
  const others = peers.filter((p) => !p.sameTab && p.kind !== 'agent');
  // 同代碼撞房：peer 標籤比較小的那個當房主
  const me = peers.filter((p) => p.sameTab)[0];
  const rival = others.filter((p) => p.presence && p.presence.role === 'host')[0];
  net.msg = rival && me && rival.peer < me.peer ? 'dup' : '';
  const guests = others.filter((p) =>
    // 正在跟別的房主比賽的客人不搶（同代碼開了第二個房間時）
    p.presence && p.presence.role === 'guest' && p.presence.ph !== 'bye' && (!p.presence.hp || (me && p.presence.hp === me.peer)),
  );
  if (net.opp && (net.phase === 'play' || net.phase === 'end')) {
    const gone = others.filter((p) => p.peer === net.opp && p.presence && p.presence.ph === 'bye')[0];
    if (gone) { hostBackToLobby(); return; }
  }
  let opp = guests.filter((p) => p.peer === net.opp)[0];
  net.oppGone = !!net.opp && !opp;
  if (!opp && (net.phase === 'lobby' || net.phase === 'end' || net.paused)) {
    opp = guests[0];
    if (opp) { net.opp = opp.peer; sendLobby(); }
  }
  if (!opp) return;
  const pr = opp.presence;
  if (pr.ch) net.oppCh = validCh(pr.ch);
  if (opp.peer !== net.oppBase) {
    // 換了一個對手（或客人重新整理）：他的按鍵計數器從頭算，重新對齊，免得送出一堆舊的殺球
    net.oppBase = opp.peer;
    const g0 = parseIn(pr.in);
    net.usedPc = g0.pc; net.usedDc = g0.dc; net.oppTraw = undefined;
  }
  if (pr.in !== undefined) net.oppIn = pr.in;
  net.oppHidden = !!pr.hid;
  if (pr.t !== net.oppTraw && (net.phase !== 'play' || Array.isArray(pr.in))) {
    // 客人的 presence 有更新（比賽中還要有按鍵資料）＝還連著
    net.oppTraw = pr.t; net.oppT = num(pr.t); net.oppTArr = now(); net.oppSeen = now();
    if (net.paused && !net.oppHidden) { net.paused = false; net.lostAt = 0; net.resumeAt = now() + 1500; }
  }
  if (typeof pr.ht === 'number' && pr.ht !== net.lastHt) {
    // ht 已經扣掉客人那邊的停留時間，所以這就是網路來回
    net.lastHt = pr.ht; const rtt = now() - pr.ht;
    if (rtt >= 0 && rtt < 5000) net.rtt = net.rtt ? net.rtt * 0.8 + rtt * 0.2 : rtt;
  }
}

// ------------------------------------------------------------
// 狀態機
// ------------------------------------------------------------
const STATES = ['intro', 'menu', 'afterMenuSelection', 'beforeStartOfNewGame', 'startOfNewGame', 'round', 'afterEndOfRound', 'beforeStartOfNextRound'] as const;
function stateName(c: Controller): string {
  for (let i = 0; i < STATES.length; i++) if (c.state === c[STATES[i]]) return STATES[i];
  return c.state === hostWait ? 'wait' : 'other';
}
/** 比賽結束後停在結算畫面：只畫雲和浪。 */
const hostWait: GameState = function (this: Controller) { this.view.game.drawCloudsAndWave(); };

export function hostStart(): void {
  const c = ctrlOf();
  if (!c) ensureGame();
  if (!c || !net.opp) return;
  if (!net.savedChars) net.savedChars = [c.physics.player1.character, c.physics.player2.character, c.physics.player1.isComputer, c.physics.player2.isComputer];
  c.physics.player1.character = net.myCh;
  c.physics.player2.character = net.oppCh;
  c.physics.player1.isComputer = false;
  c.physics.player2.isComputer = false;
  if (c.isPracticeMode) c.isPracticeMode = false;
  c.paused = false;
  c.slowMotionFramesLeft = 0;
  c.view.intro.visible = false;
  c.view.menu.visible = false;
  c.frameCounter = 0;
  c.noInputFrameCounter = 0;
  // 開新的一局不會經過標題畫面，所以上一局留下的東西要自己清：
  // 畫面關掉再開會把訊息（Game Set）全部收起來；背景音樂先停，不然 startOfNewGame 再播一次就疊兩層
  c.view.game.visible = false;
  try { c.audio.sounds.bgm.stop(); } catch (e) { /* 音效還沒載好 */ }
  c.state = c.startOfNewGame;
  const g = parseIn(net.oppIn);
  net.usedPc = g.pc; net.usedDc = g.dc;
  net.phase = 'play';
  net.sid = Math.random().toString(36).slice(2, 8);
  net.paused = false; net.lostAt = 0; net.resumeAt = 0; net.oppSeen = now();
  closePanel(); overlay('');
  hostSend(true);
}

// 對手離開或斷線太久：房主留在房間裡，回到大廳等下一個人
export function hostBackToLobby(): void {
  const c = ctrlOf();
  if (c) hostExit(c);
  net.phase = 'lobby'; net.opp = null; net.paused = false; net.lostAt = 0;
  overlay(''); sendLobby(); openPanel(); status(T.ended);
}

export function hostExit(c: Controller): void {
  if (net.savedChars) {
    c.physics.player1.character = net.savedChars[0];
    c.physics.player2.character = net.savedChars[1];
    net.savedChars = null;
  }
  c.restart();
}

// ------------------------------------------------------------
// 每幀（掛勾）
// ------------------------------------------------------------
/** tick：讀完按鍵之後，把右邊（2P）換成客人的輸入。 */
export function hostInject(c: Controller): void {
  const kb = c.keyboardArray, k0 = kb[0], k1 = kb[1];
  // 房主兩組鍵都能控制左邊
  if (!k0.xDirection) k0.xDirection = k1.xDirection;
  if (!k0.yDirection) k0.yDirection = k1.yDirection;
  if (k1.powerHit === 1) k0.powerHit = 1;
  if (!k0.dashRequest && k1.dashRequest) k0.dashRequest = k1.dashRequest;
  // 右邊用客人的輸入
  const g = parseIn(net.oppIn);
  k1.xDirection = g.x; k1.yDirection = g.y;
  k1.powerHit = 0; k1.dashRequest = 0;
  if (g.pc > net.usedPc) { k1.powerHit = 1; net.usedPc = g.pc; }
  if (g.dc > net.usedDc) { k1.dashRequest = g.dd; net.usedDc = g.dc; }
  if (g.pc < net.usedPc - 50 || g.dc < net.usedDc - 50) { net.usedPc = g.pc; net.usedDc = g.dc; }   // 客人重新整理過
  net.ackSeq = g.seq;
}

/** gameLoop 跑完之後：比賽結束的處理、擊球計數、送出快照。 */
export function hostAfterLoop(c: Controller): void {
  if (net.role !== 'host' || (net.phase !== 'play' && net.phase !== 'end')) return;
  if (net.phase === 'play' && (c.state === c.intro || c.state === c.menu)) {
    // 比賽結束：不要回標題畫面，停在結算畫面等「再來一局」
    c.state = hostWait;
    c.view.intro.visible = false; c.view.menu.visible = false;
    c.view.game.visible = true;
    c.view.game.messages.gameEnd.visible = true;
    net.phase = 'end';
    openPanel();
  }
  const ph = c.physics;
  [ph.player1, ph.player2].forEach((p, i) => {
    const h = !!(p.isCollisionWithBallHappened || p.pvHit);   // pvHit：大蔥鴨用大蔥打到
    if (h && !net.prevHit[i]) net.hit[i]++;
    net.prevHit[i] = h;
  });
  if (net.ticked) {
    net.ticked = false;
    // 暫停中或結算畫面每幀都一樣，降到 5 次/秒，省下訊息額度
    const idle = net.phase === 'end' || net.paused || selfDown() || net.resumeAt > now();
    if (!idle || now() - net.lastSendT > 200) hostSend(false);
  }
}

/** playSoundEffect 之前：音效用累計計數器傳給客人。 */
export function hostCountSounds(c: Controller): void {
  const ph = c.physics;
  [ph.player1, ph.player2].forEach((p, i) => {
    const s: Partial<PlayerSound> = p.sound || {};
    if (s.pipikachu) net.snd[i * 4]++;
    if (s.pika) net.snd[i * 4 + 1]++;
    if (s.chu) net.snd[i * 4 + 2]++;
    if (s.flap) net.snd[i * 4 + 3]++;
  });
  const bs: Partial<Controller['physics']['ball']['sound']> = ph.ball.sound || {};
  if (bs.powerHit) net.snd[8]++;
  if (bs.ballTouchesGround) net.snd[9]++;
}

// ------------------------------------------------------------
// 快照
// ------------------------------------------------------------
function plArr(p: Player, i: number): PlArr {
  const a: PlArr = [r1(p.x), r1(p.y), p.state | 0, p.frameNumber | 0, p.divingDirection | 0, net.hit[i], validCh(p.character), p.isDashing ? 1 : 0, r1(p.yVelocity)];
  if (p.isDashing && p.dashTrailX && p.dashTrailX.length) a.push([r1(p.dashTrailX[0]), r1(p.dashTrailY[0]), r1(p.dashTrailX[1]), r1(p.dashTrailY[1])]);
  return a;
}

/** 遊戲本體的淡入淡出有 black（黑幕 Sprite），core/types 的 FadeInOut 沒列出來。 */
type FadeWithBlack = FadeInOut & { black: { alpha: number } };

function buildSnap(c: Controller): Snap {
  const ph = c.physics, b = ph.ball, g = c.view.game, m = g.messages;
  const name = stateName(c);
  const s: Snap = {
    f: net.f,
    st: name,
    fc: c.frameCounter | 0,
    fa: Math.round((c.view.fadeInOut as FadeWithBlack).black.alpha * 100) / 100,
    gv: g.visible ? 1 : 0,
    ms: (m.gameStart.visible ? 1 : 0) | (m.ready.visible ? 2 : 0) | (m.gameEnd.visible ? 4 : 0),
    sc: [c.scores[0], c.scores[1]],
    sm: c.slowMotionFramesLeft > 0 ? 1 : 0,
    p: [plArr(ph.player1, 0), plArr(ph.player2, 1)],
    b: [r1(b.x), r1(b.y), b.rotation | 0, r1(b.punchEffectX), r1(b.punchEffectY), b.punchEffectRadius | 0, b.isPowerHit ? 1 : 0,
      r1(b.previousX), r1(b.previousY), r1(b.previousPreviousX), r1(b.previousPreviousY), r1(b.xVelocity), r1(b.yVelocity)],
    so: net.snd.slice(),
    w: ph.player1.isWinner ? 1 : ph.player2.isWinner ? 2 : 0,
    sid: net.sid as string,
    hz: net.paused ? (net.oppHidden ? 3 : 1) : (net.resumeAt > now() ? 2 : 0),
  };
  const an = A();
  if (an) s.ab = an.get();
  if (net.ev.length) s.ev = net.ev;
  return s;
}

export function hostSend(force: boolean): void {
  const c = ctrlOf();
  if (!c || !net.room) return;
  const p: HostPresence = { role: 'host', ch: net.myCh, ph: net.phase, opp: net.opp, ts: Math.round(now()), hid: document.hidden ? 1 : 0, ack: [net.ackSeq, net.oppT ? Math.round(net.oppT + now() - (net.oppTArr as number)) : 0], s: buildSnap(c) };
  const txt = JSON.stringify(p);
  if (txt.length > 4000) {   // 太大時先丟掉技能特效的細節
    delete p.s.ab; delete p.s.ev;
    console.warn('[netplay] snapshot too large', txt.length);
  }
  net.lastSendT = now();
  send(p);
}

// ------------------------------------------------------------
// 技能事件（技能系統呼叫 svc.fxEvent）：房主記下來傳給客人重播
// ------------------------------------------------------------
export function recordFx(type: FxEventType, d: FxEventData): void {
  if (net.role === 'host' && net.phase === 'play' && EV_TYPES[type]) {
    const o: Record<string, unknown> = {};
    for (const k in d) {
      const v = d[k];
      if (k === 'player') o.pl = v && (v as { isPlayer2?: boolean }).isPlayer2 ? 1 : 0;
      else if (typeof v === 'number') o[k] = r1(v);
      else if (typeof v === 'boolean' || typeof v === 'string') o[k] = v;
    }
    net.ev.push([++net.evId, type, o]);
    if (net.ev.length > 8) net.ev.shift();
  }
}
