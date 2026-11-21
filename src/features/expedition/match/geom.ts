/** 場地座標（遊戲座標 432 × 304）與比賽中共用的小判斷。 */
import type { Ball, Controller } from '../../../core/types';
import { MAX_BALL_SPEED } from '../content';

export const W = 432, H = 304, NET_X = 216, FLOOR_Y = 270, GROUND_Y = 244, BALL_GROUND = 252;
/** 25 幀 ≈ 1 秒 */
export const FPS = 25;

/** 這一幀是對打中（還沒得分、比賽還沒結束） */
export function isLive(c: Controller): boolean { return c.state === c.round && !c.roundEnded && !c.gameEnded; }

/** 球速上限：遠征動過球之後一律再夾一次（卡牌、覺醒造成的球速都不會超過 MAX_BALL_SPEED） */
export function clampBall(ball: Pick<Ball, 'xVelocity' | 'yVelocity'>): void {
  ball.xVelocity = Math.max(-MAX_BALL_SPEED, Math.min(MAX_BALL_SPEED, ball.xVelocity));
  ball.yVelocity = Math.max(-MAX_BALL_SPEED, Math.min(MAX_BALL_SPEED, ball.yVelocity));
}

/** 完美舉球：球直直彈高，落回自己頭上（靠網時往後偏一點，免得掉到網上） */
export function perfectSet(ball: Ball, vy: number): void {
  ball.xVelocity = ball.x > NET_X - 40 ? -2 : 0;
  ball.yVelocity = vy;
}
