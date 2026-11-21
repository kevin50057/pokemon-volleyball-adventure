// ============================================================
// 事件偵測（每個遊戲幀，在物理之前；看到的是上一幀物理運算的結果）
// 以及特效分級事件（技能 L3／必殺 L4、瞬移）
// ============================================================
import type { FxEventData, FxEventType } from '../../core/services';
import type { Ball, Controller, Player } from '../../core/types';
import { shakeEvent } from './camera';
import { FLOOR_Y, GROUND_BALL_Y, GROUND_Y, JUICE } from './config';
import { lite } from './lite-mode';
import { dust, sparks, speedLines } from './particles';
import { duckBgm, sfxBump, sfxEvolve, sfxGround, sfxPsy, sfxSkill, sfxSpike, sfxUlt, sfxZip } from './sfx';
import { makeGhosts } from './sprites';
import { S } from './state';
import { log, stats } from './stats';
import { charOf, now, rand, sim } from './util';

export function detect(ctrl: Controller): void {
  const ph = ctrl.physics, ball = ph.ball, players = [ph.player1, ph.player2];

  // 得分：計分板彈跳，失分方被震一下
  if (ctrl.scores) {
    for (let si = 0; si < 2; si++) {
      if (ctrl.scores[si] > S.lastScores[si]) {
        S.scoreFx[si] = { t0: now() };
        S.playerFx[1 - si] = { t0: now(), kind: 'hurt' };
      }
      S.lastScores[si] = ctrl.scores[si];
    }
  }

  // 殺球後 200ms 內在球後面補火花，像拖著尾巴
  if (now() < S.trailUntil) {
    for (let ti = 0; ti < 2; ti++) {
      S.particles.push({ kind: 'spark', x: ball.x + rand(-6, 6), y: ball.y + rand(-6, 6),
        vx: -ball.xVelocity * rand(0.05, 0.15), vy: -ball.yVelocity * rand(0.05, 0.15),
        g: 0.15, drag: 0.85, life: rand(160, 280), t0: now(), color: S.lastHitColor, size: 3 });
    }
  }

  for (let i = 0; i < 2; i++) {
    const p = players[i], pp = S.prev.p[i];
    const hit = !!(p.isCollisionWithBallHappened || p.pvHit);   // pvHit：大蔥鴨用大蔥打到（球沒碰到身體）
    if (hit && !pp.hit) onBallHit(ctrl, p, i, ball);
    pp.hit = hit;

    // 起跳、落地、撲救
    if (pp.state === 0 && p.state === 1) S.playerFx[i] = { t0: now(), kind: 'jump' };
    if (pp.y < GROUND_Y - 2 && p.y >= GROUND_Y) {
      S.playerFx[i] = { t0: now(), kind: 'land' };
      dust(p.x, FLOOR_Y, 5, 0.6);
    }
    if (pp.state !== 3 && p.state === 3) {
      dust(p.x, FLOOR_Y, 8, 1);
      S.playerFx[i] = { t0: now(), kind: 'dive' };
    }
    pp.y = p.y; pp.state = p.state;
  }

  // 球落地（得分）：每回合只觸發一次，下一球發球（球回到高處）才解鎖
  // 遊戲觸地時會把球放在剛好 252、並把速度反彈成向上；只用 y 判斷會在快落地的前一幀誤判
  if (!S.groundLock && ball.y === GROUND_BALL_Y && ball.yVelocity < 0) { S.groundLock = true; onGround(ctrl, ball); }
  if (ball.y < 120) { S.groundLock = false; S.groundT = 0; }
  S.prev.ballY = ball.y;
}

function onBallHit(ctrl: Controller, p: Player, idx: number, ball: Ball): void {
  log.push({ t: now(), e: ball.isPowerHit ? 'spike' : 'hit' }); if (log.length > 50) log.shift();
  const c = charOf(p.character);
  S.lastHitColor = c ? c.color : '#FFFFFF';
  S.lastHitType = c ? c.type : '電';
  const speed = Math.hypot(ball.xVelocity, ball.yVelocity);
  const ang = Math.atan2(ball.yVelocity, ball.xVelocity);

  if (ball.isPowerHit) {
    // 殺球分兩級：直線殺（L1）、斜殺（L2，殺球時按了上或下，球速明顯快）。
    // 更重的「技能」（L3）和「必殺」（L4）由技能系統在技能真正發動時送 'skill' 事件來加碼，這裡不猜。
    const diag = speed >= 24;
    const down = diag && ball.yVelocity > 0;
    S.hitStop = diag ? 2 : 1;
    if (now() - S.lastStopT < JUICE.stopCooldown) S.hitStop = 1;   // 剛頓過：只停 1 幀，節奏才不會卡
    S.lastStopT = now();
    S.ballFx = { t0: now(), ang: ang, power: 1, hold: true, ground: false };
    S.ballRot = ang;   // 頓幀開始時直接對準方向，壓扁軸第一幀就正確
    S.playerFx[idx] = { t0: now(), kind: 'spike' };
    sparks(ball.x, ball.y, ang, S.lastHitColor, diag ? 12 : 8, diag ? 8 : 7);
    S.rings.push({ x: ball.x, y: ball.y, r0: 28, r1: diag ? 52 : 40, t0: now(), dur: 260, color: S.lastHitColor, w: 3 });
    if (diag) {
      speedLines(ball.x, ball.y, S.lastHitColor, 6);
      S.flashes.push({ x: ball.x, y: ball.y, r: 16, t0: now(), dur: 50 });
      S.pendingTrail = 200;
    }
    if (down) shakeEvent(0.45, JUICE.shakeDown, true);   // 往下砸：輕輕上下震一下
    S.lastSpikeLvl[idx] = diag ? 2 : 1;
    stats[diag ? 'spike2' : 'spike1']++; if (down) stats.down++;
    S.lastSpikeT = now();
    sfxSpike(ctrl, S.lastHitType, diag, 0);
  } else {
    // 一般擊球：小小的壓扁＋一點火花，不頓幀也不震
    S.ballFx = { t0: now(), ang: ang, power: 0.5, hold: false, ground: false };
    sparks(ball.x, ball.y, ang, '#FFFFFF', 4, 5);
    S.rings.push({ x: ball.x, y: ball.y, r0: 14, r1: 22, t0: now(), dur: 120, color: '#FFFFFF', w: 2 });
    sfxBump(ctrl);
  }
}

function onGround(ctrl: Controller, ball: Ball): void {
  log.push({ t: now(), e: 'ground' }); if (log.length > 50) log.shift();
  const scorer = ball.x < 216 ? 1 : 0, win = ctrl.winningScore || 15;
  const final = ctrl.scores && ctrl.scores[scorer] + 1 >= win;
  // 技能／必殺直接砸地才用原本的強度；一般得分降一半（每一分都有回饋，但不刺眼）
  const big = S.rallyMaxLvl >= 3 && now() - S.lastSpikeT < 2500;
  stats.ground++;
  S.rallyMaxLvl = 0;
  S.hitStop = final ? JUICE.hitStopFinal : JUICE.hitStopGround;
  if (!final && now() - S.lastStopT < JUICE.stopCooldown) S.hitStop = Math.min(S.hitStop, 3);
  S.lastStopT = now(); S.groundT = now();
  shakeEvent(1, big ? JUICE.shakeGround : JUICE.shakeGround * 0.57, true);
  if (!lite()) S.zoom = big ? JUICE.zoomGround : JUICE.zoomGround * 0.53;
  S.ballFx = { t0: now(), ang: Math.PI / 2, power: 1.1, hold: S.hitStop > 0, ground: true };
  dust(ball.x, FLOOR_Y, 22, 1.8);
  sparks(ball.x, GROUND_BALL_Y + 6, -Math.PI / 2, S.lastHitColor, 14, 8, Math.PI * 0.9);
  S.rings.push({ x: ball.x, y: FLOOR_Y, r0: 10, r1: 110, t0: now(), dur: 380, color: S.lastHitColor, w: 4, flat: true });
  S.rings.push({ x: ball.x, y: FLOOR_Y, r0: 6, r1: 70, t0: now(), dur: 260, color: '#FFFFFF', w: 2, flat: true });
  S.flashes.push({ x: ball.x, y: GROUND_BALL_Y, r: 22, t0: now(), dur: 60 });
  if (final) ultimate(ball.x, GROUND_BALL_Y, S.lastHitColor, false);   // 決勝分：一場只有一次，給完整必殺簽名
  else S.flashes.push({ full: true, color: S.lastHitColor, alpha: big ? 0.22 : 0.10, t0: now(), dur: 160 });
  sfxGround(ctrl);
}

// ------------------------------------------------------------
// 技能（L3）與必殺（L4）：技能系統送來 'skill' 事件
// ------------------------------------------------------------
function colorOfPlayer(p: Player | undefined): string { const c = p && charOf(p.character); return c ? c.color : '#FFFFFF'; }
function typeOfPlayer(p: Player | undefined): string { const c = p && charOf(p.character); return c ? c.type : '電'; }

function onSkill(d: FxEventData): void {
  const p = d.player, idx = p && p.isPlayer2 ? 1 : 0;
  // Number(x) >= 4 跟舊版的 d.lvl >= 4 對任何輸入結果都一樣（undefined → false）
  let lvl = Number(d.lvl) >= 4 ? 4 : 3;
  const col = d.k === 'psy' ? '#B048FF' : d.k === 'evoR' || d.k === 'red' ? '#FF1744' : d.k === 'evo' ? '#29B6F6' : colorOfPlayer(p);
  // 型別轉換：舊版 +d.x || 0（沒帶座標 → NaN → 0）；TS 不讓可能是 undefined 的值做一元 +，執行結果不變
  const x = +(d.x as number) || 0, y = +(d.y as number) || 0, tn = now();
  const lastAnyUlt = Math.max(S.ultAt[0], S.ultAt[1]);
  if (lvl === 4 && (tn - S.ultAt[idx] < JUICE.ultCooldown || tn - lastAnyUlt < JUICE.ultGlobal)) { lvl = 3; stats.ultDowngraded++; }   // 必殺冷卻中：降成技能級
  S.rallyMaxLvl = Math.max(S.rallyMaxLvl, lvl);
  S.lastSpikeT = tn;
  if (lvl === 4) {
    S.ultAt[idx] = tn;
    stats.ult++;
    ultimate(x, y, col, true, typeOfPlayer(p), d.k);
    return;
  }
  stats.skill++;
  const canShake = tn - S.skillAt[idx] >= JUICE.skillShakeCD;
  S.hitStop = Math.max(S.hitStop, d.v ? 0 : 2);
  if (canShake) {
    S.skillAt[idx] = tn;
    shakeEvent(0.5, JUICE.shakeSkill, !!d.v);
    if (!d.v && !lite()) S.kick = { x: (idx ? -1 : 1), y: 0.5, t0: tn };
  }
  if (d.v) {
    S.rings.push({ x: x, y: y, r0: 14, r1: 90, t0: tn, dur: 340, color: col, w: 4, flat: true });
  } else {
    S.rings.push({ x: x, y: y, r0: 28, r1: 70, t0: tn, dur: 300, color: col, w: 4 });
    S.rings.push({ x: x, y: y, r0: 34, r1: 86, t0: tn + 50, dur: 260, color: '#FFFFFF', w: 2 });
    speedLines(x, y, col, 10);
    S.pendingTrail = 200;
  }
  const ctrlRef = S.ctrlRef;
  if (ctrlRef) {
    if (d.k === 'psy') sfxPsy(ctrlRef);
    else if (d.k === 'evo') sfxEvolve(ctrlRef, false);
    else sfxSkill(ctrlRef, typeOfPlayer(p), 1);
  }
}

// 必殺的專屬簽名：先暗一下，再爆出屬性色全畫面閃光、三層大環、全畫面放射線、長拖尾、低頻轟聲。
// 「壓暗」只有必殺和決勝分有，玩家一眼就知道這球不一樣。
function ultimate(x: number, y: number, col: string, withStop: boolean, type?: string, kind?: string): void {
  const tn = now();
  if (withStop) S.hitStop = Math.max(S.hitStop, 5);
  shakeEvent(1, JUICE.shakeUlt, false);
  if (!lite()) {
    S.kick = { x: (x < 216 ? 1 : -1) * JUICE.kickUlt, y: JUICE.kickUlt * 0.4, t0: tn };
    S.zoom = JUICE.zoomUlt;
  }
  S.flashes.push({ full: true, color: '#000000', alpha: 0.35, t0: tn, dur: 140 });
  S.flashes.push({ full: true, color: col, alpha: 0.3, t0: tn + 120, dur: 240 });
  S.rings.push({ x: x, y: y, r0: 28, r1: 110, t0: tn, dur: 360, color: col, w: 4 });
  S.rings.push({ x: x, y: y, r0: 34, r1: 140, t0: tn + 60, dur: 340, color: '#FFFFFF', w: 3 });
  S.rings.push({ x: x, y: y, r0: 40, r1: 160, t0: tn + 120, dur: 320, color: col, w: 2 });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + rand(-0.08, 0.08);
    S.lines.push({ x: x, y: y, a: a, r0: rand(30, 40), len: rand(120, 200), t0: tn + 100, dur: 260, color: i % 2 ? col : '#FFFFFF' });
  }
  sparks(x, y, -Math.PI / 2, col, 24, 9, Math.PI * 2);
  S.pendingTrail = 400;
  duckBgm(S.ctrlRef, 500);
  const ctrlRef = S.ctrlRef;
  if (ctrlRef) {
    if (kind === 'evoR') sfxEvolve(ctrlRef, true);
    sfxUlt(ctrlRef, type || '電');
  }
}

// ============================================================
// 技能事件（技能系統呼叫；svc.fxEvent）
// ============================================================
/** 瞬移事件的內容：技能系統（與連線重播）一定帶數字座標。這裡逐欄檢查，缺欄位（例如連線傳壞的資料）就不演出。 */
interface ZipStartData { player: Player; dir: number }
interface ZipEndData { player: Player; x0: number; x1: number; y: number }
function zipStart(d: FxEventData): ZipStartData | null {
  const { player, dir } = d;
  return player && typeof dir === 'number' ? { player, dir } : null;
}
function zipEnd(d: FxEventData): ZipEndData | null {
  const { player, x0, x1, y } = d;
  return player && typeof x0 === 'number' && typeof x1 === 'number' && typeof y === 'number' ? { player, x0, x1, y } : null;
}

export function fxEvent(type: FxEventType, d: FxEventData): void {
  if (sim()) return;
  if (type === 'zipStart') {
    const z = zipStart(d);
    if (!z) return;
    const p = z.player;
    sparks(p.x, p.y, z.dir > 0 ? Math.PI : 0, '#FFE14D', 6, 5);
    if (S.ctrlRef) sfxZip(S.ctrlRef);   // 位移技能不頓幀，否則整個畫面會卡一下
  } else if (type === 'zipEnd') {
    const z = zipEnd(d);
    if (!z) return;
    sparks(z.x1, z.y, z.x1 > z.x0 ? 0 : Math.PI, '#FFE14D', 6, 5);
    makeGhosts(z.player, z.x0, z.x1, z.y);
  } else if (type === 'skill') {
    onSkill(d);
  }
}
