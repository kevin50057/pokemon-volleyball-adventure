// 場地常數與技能共用的小工具
import type { Ball, Player, UserInput } from '../../core/types';
import type { AbilitySide } from './state';

// ---------- 場地常數（遊戲座標 432 x 304） ----------
export const W = 432, H = 304;
export const NET_X = 216;
export const GROUND_Y = 244;        // 角色站地時的 y
export const GROUND_BALL_Y = 252;   // 球落地時的 y
export const FLOOR_Y = 270;         // 畫地面標記用
export const P1_MIN_X = 32, P1_MAX_X = 184, P2_MIN_X = 248, P2_MAX_X = 400;

export function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }
export function clampV(v: number): number { return clamp(v, -30, 30); }
export function clampPlayer(p: Player): void {
  if (p.pvNoClamp) { p.x = clamp(p.x, P1_MIN_X, P2_MAX_X); return; }
  p.x = p.isPlayer2 ? clamp(p.x, P2_MIN_X, P2_MAX_X) : clamp(p.x, P1_MIN_X, P1_MAX_X);
}
export function moveBonus(player: Player, input: UserInput, dx: number): void {
  if (player.state < 3 && input.xDirection !== 0) {
    player.x += dx * input.xDirection;
    clampPlayer(player);
  }
}
// 「這一幀剛碰到球」的上升緣判斷
// key 是任意字串：旗標直接存在每邊狀態物件上（跟舊版同一個物件、同樣的鍵名，連線會一起傳）
export function edge(s: AbilitySide, key: string, cond: boolean): boolean {
  if (cond && !s[key]) { s[key] = true; return true; }
  if (!cond) s[key] = false;
  return false;
}
export function powerHitEdge(player: Player, s: AbilitySide, key: string): boolean {
  return edge(s, key, player.isCollisionWithBallHappened && player.state === 2);
}
// 觸控的技能鍵：dashRequest 是 ±2（鍵盤連點兩下產生的是 ±1，那個容易誤觸，所以不算）
export function skillKey(input: UserInput): number {
  return input.dashRequest === 2 ? 1 : input.dashRequest === -2 ? -1 : 0;
}
export function touchEdge(player: Player, s: AbilitySide, key: string): boolean {
  return edge(s, key, player.isCollisionWithBallHappened);
}
// 算一條「一定過網、落在對面場內」的最低、最快球路（球的重力每幀 +1）
export function aimAtCourt(ball: Ball, fromP2: boolean, maxVx: number): void {
  const target = fromP2 ? 70 + Math.random() * 60 : 300 + Math.random() * 60;
  for (let vy = 8; vy >= -16; vy -= 2) {
    // 解 y + vy·t + t²/2 = 252
    const t = -vy + Math.sqrt(vy * vy + 2 * (GROUND_BALL_Y - ball.y));
    if (!(t > 0)) continue;
    const vx = (target - ball.x) / t;
    if (Math.abs(vx) > maxVx) continue;
    const tn = (NET_X - ball.x) / vx;            // 過網的時間點
    const yn = ball.y + vy * tn + tn * tn / 2;
    if (tn > 0 && yn < 150) { ball.xVelocity = Math.round(vx); ball.yVelocity = vy; return; }
  }
  ball.xVelocity = fromP2 ? -maxVx : maxVx; ball.yVelocity = -14;
}

export function makePowerHit(ball: Ball, radius: number): void {
  // 如果這一下本來就是殺球，遊戲已經播過殺球音效了，不要再播一次
  if (!ball.isPowerHit) ball.sound.powerHit = true;
  ball.isPowerHit = true;
  ball.punchEffectRadius = radius;
  ball.punchEffectX = ball.x;
  ball.punchEffectY = ball.y;
}
