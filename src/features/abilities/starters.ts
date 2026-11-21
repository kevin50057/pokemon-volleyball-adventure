// ============================================================
// 關都御三家（一階）：小火龍、妙蛙種子、傑尼龜
// ============================================================
// 設計上只比皮卡丘差 5%～15%，重點是手感不同；大招留給進化後（噴火龍、妙蛙花、水箭龜）。
// 數值都在 tuning.ts（charmander… / bulbasaur… / squirtle…），以皮卡丘為 1。
//
// 走路、撲救的倍率由遊戲本體套用（Player.pvMoveMult／pvDiveMult，見 engine/physics.ts），
// 因為要用這一幀真正的方向；在這裡（物理之前）算會用到上一幀的按鍵，電腦會走過頭。
import type { Ball, Player, UserInput } from '../../core/types';
import { pushBurst } from './fx';
import type { AbilitySide } from './state';
import { TUNING } from './tuning';
import { GROUND_BALL_Y, GROUND_Y, NET_X, powerHitEdge } from './util';

type StarterFn = (player: Player, opp: Player, ball: Ball, input: UserInput, s: AbilitySide) => void;

const JUMP_VY = 15;     // 起跳那一幀算完後的上升速度（本體給 -16，重力加 1）

/** 走路、撲救的倍率（netplay 客機預測位置也用這個）。 */
export function starterMove(ch: string): number {
  return ch === 'charmander' ? TUNING.charmanderMove
    : ch === 'bulbasaur' ? TUNING.bulbasaurMove
      : ch === 'squirtle' ? TUNING.squirtleMove : 1;
}
export function diveMult(ch: string): number {
  return ch === 'charmander' ? TUNING.charmanderDive : ch === 'squirtle' ? TUNING.squirtleDive : 1;
}
export function jumpMult(ch: string): number {
  return ch === 'bulbasaur' ? TUNING.bulbasaurJump : ch === 'squirtle' ? TUNING.squirtleJump : 1;
}

/**
 * 跳躍高度的倍率換成起跳速度。本體的跳躍：第一幀上升 16，之後 15、14、…每幀少 1，
 * 總高度 ≈ 16 + v(v+1)/2（v = 15 時是 136）。解 16 + v'(v'+1)/2 = 136 × 倍率。
 */
export function jumpVelocity(mult: number): number {
  const h = (16 + JUMP_VY * (JUMP_VY + 1) / 2) * mult - 16;
  return (-1 + Math.sqrt(1 + 8 * h)) / 2;
}

/** 走路、撲救、跳躍的倍率（每幀設定；換角色時技能系統會清掉）。 */
export function starterMotion(player: Player): void {
  const ch = player.character;
  if (ch !== 'charmander' && ch !== 'bulbasaur' && ch !== 'squirtle') return;
  player.pvMoveMult = starterMove(ch);
  player.pvDiveMult = diveMult(ch);
  // 跳躍高度：只改從地上起跳的那一下（本體剛起跳的下一幀一定是 y = 地面 - 16、速度 -15）
  const jm = jumpMult(ch);
  if (jm !== 1 && player.state === 1 && player.yVelocity === -JUMP_VY && player.y === GROUND_Y - 16) {
    player.yVelocity = -jumpVelocity(jm);
  }
}

/** 傑尼龜的硬殼：記下技能跑之前的位置，跑完之後把對手技能造成的推開、震飛還原。 */
export interface ShellMark { x: number; yVelocity: number }
export function shellMark(player: Player): ShellMark | null {
  if (player.character !== 'squirtle' || !TUNING.squirtleShell) return null;
  return { x: player.x, yVelocity: player.yVelocity };
}
export function shellRestore(player: Player, mark: ShellMark | null, s: AbilitySide): void {
  if (!mark || player.character !== 'squirtle') return;
  let blocked = false;
  if (player.x !== mark.x) {
    player.x = mark.x;
    if (s.stunTimer > 0) s.stunX = player.x;   // 被炸到的定身照算，只是不會被炸開
    blocked = true;
  }
  if (player.yVelocity < mark.yVelocity) {   // 被震飛（卡比獸落地）
    player.yVelocity = mark.yVelocity;
    blocked = true;
  }
  if (blocked) pushBurst(player.x, player.y, '#9CD8FF', 28);
}

export function scaleBall(ball: Ball, k: number): void {
  const sx = ball.xVelocity < 0 ? -1 : 1, sy = ball.yVelocity < 0 ? -1 : 1;
  ball.xVelocity = sx * Math.min(30, Math.round(Math.abs(ball.xVelocity) * k));
  ball.yVelocity = sy * Math.min(30, Math.round(Math.abs(ball.yVelocity) * k));
}

/**
 * 粗略模擬球路（照遊戲本體的球：每幀先移動、重力 +1；撞牆反彈、碰網柱彈開）。
 * 回傳「會乾淨地過網、在撞到對面底牆之前落在對面場內」。
 */
function landsClean(x: number, y: number, vx: number, vy: number, fromP2: boolean): boolean {
  for (let f = 0; f < 120; f++) {
    if (x + vx < 20 || x + vx > 432) return false;                       // 撞牆會彈回來
    if (Math.abs(x - NET_X) < 25 && y > 176) return false;               // 碰到網柱
    if (y + vy > GROUND_BALL_Y) return fromP2 ? x < NET_X : x > NET_X;   // 落地
    y += vy; x += vx; vy += 1;
  }
  return false;
}

/**
 * 殺球加速：先試「水平、垂直都乘 k」，不行再試「落點不變、早一點落地」。
 * 只有原本的球路就會乾淨落在對面、加速後也一樣時才改，免得加速反而掛網或撞牆彈回來。
 */
export function boostSafely(ball: Ball, fromP2: boolean, k: number): boolean {
  if (!landsClean(ball.x, ball.y, ball.xVelocity, ball.yVelocity, fromP2)) return false;
  const vx0 = ball.xVelocity, vy0 = ball.yVelocity;
  scaleBall(ball, k);
  if ((ball.xVelocity !== vx0 || ball.yVelocity !== vy0) && landsClean(ball.x, ball.y, ball.xVelocity, ball.yVelocity, fromP2)) return true;
  ball.xVelocity = vx0; ball.yVelocity = vy0;
  hastenBall(ball, k);
  if ((ball.xVelocity !== vx0 || ball.yVelocity !== vy0) && landsClean(ball.x, ball.y, ball.xVelocity, ball.yVelocity, fromP2)) return true;
  ball.xVelocity = vx0; ball.yVelocity = vy0;
  return false;
}

/**
 * 球速變快、落點不變：水平速度乘 k，再改垂直速度讓球早 1/k 的時間落在同一個地方。
 * （直接把球速乘上去，球會飛太遠撞到後面的牆彈回來，模擬起來反而變弱。）
 */
function hastenBall(ball: Ball, k: number): void {
  const drop = GROUND_BALL_Y - ball.y;
  if (!(drop > 0)) return;
  const vy = ball.yVelocity;
  const t = -vy + Math.sqrt(vy * vy + 2 * drop);   // 解 y + vy·t + t²/2 = 地面
  const tk = t / k;
  if (!(tk > 1)) return;
  ball.xVelocity = Math.max(-30, Math.min(30, Math.round(ball.xVelocity * k)));
  ball.yVelocity = Math.max(-30, Math.min(30, Math.round((drop - tk * tk / 2) / tk)));
}

export const STARTER_ABILITIES: Record<string, StarterFn> = {
  // 小火龍「小火苗」：靠網 1/3 的地方殺球，球速 +8%（底線殺球沒有）
  smallFlame: function (player, _opp, ball, _input, s) {
    if (!powerHitEdge(player, s, 'hit') || !ball.isPowerHit) return;
    const fromNet = player.isPlayer2 ? player.x - NET_X : NET_X - player.x;
    if (fromNet > TUNING.charmanderNetZone) return;
    if (!boostSafely(ball, player.isPlayer2, TUNING.charmanderNetSpike)) return;
    pushBurst(ball.x, ball.y, '#FF8A3D', 38);   // 常常會發動，只放小火花、不算技能級特效
  },

  // 妙蛙種子「短藤鞭」：判定左右加寬；「飛葉」：不按方向鍵殺球，過網後變慢、早一點落地
  vineWhip: function (player, opp, ball, _input, s) {
    player.pvReachX = TUNING.bulbasaurReach;
    // 不按方向鍵的殺球，本體給的球速一定是水平 ±10、垂直 0
    if (powerHitEdge(player, s, 'hit') && ball.isPowerHit && Math.abs(ball.xVelocity) === 10 && ball.yVelocity === 0) {
      s.leaf = 1; s.leafT = 0; s.leafCrossed = false;
      return;
    }
    if (!s.leaf) return;
    const crossed = player.isPlayer2 ? ball.x < NET_X : ball.x > NET_X;
    if (opp.isCollisionWithBallHappened || ball.y >= GROUND_BALL_Y - 2 || (s.leafCrossed && !crossed)) { s.leaf = 0; return; }
    if (!crossed) return;
    if (!s.leafCrossed) {
      s.leafCrossed = true;
      const sx = ball.xVelocity < 0 ? -1 : 1;
      ball.xVelocity = sx * Math.max(1, Math.abs(ball.xVelocity) - TUNING.leafDrag);
      pushBurst(ball.x, ball.y, '#5FD35F', 30);
    }
    s.leafT = ((s.leafT as number) || 0) + 1;
    if ((s.leafT as number) % TUNING.leafGravEvery === 0) ball.yVelocity += 1;
  },

  // 傑尼龜：殺球稍弱；撲救後起身快（滑行距離在 starterMotion，硬殼在 shellRestore）
  shellSlide: function (player, _opp, ball, _input, s) {
    if (powerHitEdge(player, s, 'hit') && ball.isPowerHit) scaleBall(ball, TUNING.squirtleSpike);
    // 撲救落地那一幀本體把倒地時間設成 3，這裡少躺幾幀
    if (player.state === 4 && player.lyingDownDurationLeft === 3) player.lyingDownDurationLeft -= TUNING.squirtleGetup;
  },
};
