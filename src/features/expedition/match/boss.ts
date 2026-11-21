/**
 * 首領戰：比分當成血量、多個階段。
 *  - 首領剩下的血 ≤ 某個階段的 atHp：下一球發球前預告（整個遊戲停 50 幀），然後切換。不在對打中途換。
 *  - 玩家的血打完：遊戲本體只看 winningScore（首領的血），所以這裡自己判定結束。
 *  - 從第 k 階段開始（同一次章節嘗試內打到過的最高階段）：首領的血從那個階段的起點算。
 *  - 球速係數：每隔幾幀讓球多走一步（只有球），而且只在球離地面、網、牆、角色都夠遠時才多走。
 *  - 幻影：首領殺球時放出兩顆沒有影子的假球，只畫在 HUD 上，不碰撞、不計分。
 */
import type { Ball, Controller, Player } from '../../../core/types';
import { sfx } from '../../campaign/sfx';
import type { BossDef, BossPhase } from '../content';
import { NET_X, W } from './geom';

export const CUT_FRAMES = 50;
const CUT_MID = 25, PHANTOM_LIFE = 18, PHANTOM_COOLDOWN = 100;

export interface Phantom { x: number; y: number; vx: number; vy: number; t: number }
export interface BossState {
  /** 目前的階段 */
  idx: number;
  /** 等著在下一球發球前切換到的階段（-1 沒有） */
  pending: number;
  /** 切換演出還剩幾幀；next：切到哪一階段 */
  cut: number;
  next: number;
  hit: number;
  hurt: number;
  s0: number;
  s1: number;
  acc: number;
  flash: number;
  /** 從後面的階段開始：開場時要把首領的血扣到那個階段的起點 */
  init: boolean;
  /** 這一場打到過的最高階段（結算時存檔，章節重來前重打從這裡開始） */
  reached: number;
  phantoms: Phantom[];
  phantomCd: number;
  spikeEdge: boolean;
}

export function newBoss(start: number): BossState {
  return { idx: start, pending: -1, cut: 0, next: start, hit: 0, hurt: 0, s0: 0, s1: 0, acc: 0, flash: 0, init: start > 0, reached: start, phantoms: [], phantomCd: 0, spikeEdge: false };
}
export function phaseOf(def: BossDef, idx: number): BossPhase { return def.phases[Math.max(0, Math.min(def.phases.length - 1, idx))]; }
/** 首領剩 bossHp 滴血時應該在第幾階段 */
export function phaseForHp(def: BossDef, bossHp: number): number {
  let k = 0;
  def.phases.forEach((p, i) => { if (bossHp <= p.atHp) k = i; });
  return k;
}

/** 回傳 false：這一幀整個遊戲停住（換階段的預告）。onPhase：切換的那一刻 */
export function bossPre(c: Controller, b: BossState, def: BossDef, onPhase: (idx: number) => void): false | void {
  if (b.cut > 0) {
    b.cut--;
    if (b.cut === CUT_MID) { b.idx = b.next; b.reached = Math.max(b.reached, b.idx); b.flash = 6; onPhase(b.idx); }
    return false;
  }
  if (b.hit > 0) b.hit--;
  if (b.hurt > 0) b.hurt--;
  if (b.phantomCd > 0) b.phantomCd--;
  // 從後面的階段重打：開場時首領的血從那個階段的起點算
  if (b.init && c.state === c.startOfNewGame && c.frameCounter >= 1) {
    c.scores[0] = def.hp - phaseOf(def, b.idx).atHp;
    b.s0 = c.scores[0]; b.s1 = 0; b.init = false;
  }
  const live = c.state === c.round;
  if (live && !b.init) {
    if (c.scores[0] > b.s0) { b.hit = 12; b.s0 = c.scores[0]; if (c.scores[0] < def.hp) sfx('hit'); }
    if (c.scores[1] > b.s1) { b.hurt = 12; b.s1 = c.scores[1]; if (c.scores[1] < def.playerHp) sfx('hurt'); }
  }
  if (live && !b.init && !c.gameEnded) {
    if (c.scores[1] >= def.playerHp) {
      const ph = c.physics;
      c.gameEnded = true;
      ph.player1.isWinner = false; ph.player2.isWinner = true;
      ph.player1.gameEnded = true; ph.player2.gameEnded = true;
      return;
    }
    const want = phaseForHp(def, def.hp - c.scores[0]);
    if (want > b.idx) b.pending = want;
  }
  if (b.pending > b.idx && c.state === c.beforeStartOfNextRound && !c.gameEnded) {
    b.next = b.pending; b.pending = -1; b.cut = CUT_FRAMES;
    sfx('phase');
    return false;
  }
}

/** 物理之前：球速係數、幻影 */
export function bossPhysics(c: Controller, b: BossState, def: BossDef, live: boolean): void {
  const ph = c.physics, ball = ph.ball, p = phaseOf(def, b.idx);
  const speed = p.ballSpeed || 1;
  if (live && speed > 1) {
    b.acc += speed - 1;
    if (b.acc >= 1) { b.acc -= 1; extraBallStep(ball, ph.player1, ph.player2); }
  }
  const p2 = ph.player2, spike = p2.isCollisionWithBallHappened && p2.state === 2 && ball.isPowerHit;
  if (live && p.phantoms && spike && !b.spikeEdge && b.phantomCd <= 0) {
    b.phantomCd = PHANTOM_COOLDOWN;
    [-1, 1].forEach((d) => b.phantoms.push({ x: ball.x, y: ball.y, vx: ball.xVelocity + d * 4, vy: ball.yVelocity - d * 3, t: 0 }));
  }
  b.spikeEdge = spike;
  b.phantoms = b.phantoms.filter((f) => {
    f.t++; f.x += f.vx; f.y += f.vy; f.vy += 1;
    if (f.x < 20 || f.x > W) f.vx = -f.vx;
    return f.t < PHANTOM_LIFE && f.y < 260;
  });
}

function extraBallStep(ball: Ball, p1: Player, p2: Player): void {
  const vx = ball.xVelocity, vy = ball.yVelocity, nx = ball.x + vx, ny = ball.y + vy;
  const clear = (x: number, y: number): boolean =>
    x > 40 && x < W - 20 && y > 20 && y < 200 &&
    (Math.abs(x - NET_X) > 45 || y < 150) &&
    [p1, p2].every((p) => Math.abs(x - p.x) > 56 || Math.abs(y - p.y) > 56);
  if (!clear(ball.x, ball.y) || !clear(nx, ny) || !clear(nx + vx, ny + vy + 1)) return;
  ball.x = nx; ball.y = ny; ball.yVelocity = vy + 1;
}
