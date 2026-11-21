/**
 * 數值卡與羈絆的倍率（只作用在玩家這一邊）：移動、撲救由遊戲本體套用（pvMoveMult／pvDiveMult），
 * 跳躍只改從地上起跳的那一下，殺球在碰到球的那一幀調一次（加速只在球本來就會乾淨落在對面時才加）。
 */
import type { Ball, Player } from '../../../core/types';
import { boostSafely, diveMult, jumpMult, jumpVelocity, scaleBall, starterMove } from '../../abilities/starters';
import { capped, type Mods } from '../cards';
import { GROUND_Y, clampBall } from './geom';

export interface ModsState { hitEdge: boolean }
export function newModsState(): ModsState { return { hitEdge: false }; }

export function applyMods(p1: Player, ball: Ball, m: Mods, st: ModsState): void {
  const ch = p1.character;
  p1.pvMoveMult = capped('move', starterMove(ch), m.move);
  p1.pvDiveMult = capped('dive', diveMult(ch), m.dive);
  // 跳躍：本體剛起跳的下一幀一定是 y = 地面 - 16
  if (m.jump !== 1 && p1.state === 1 && p1.y === GROUND_Y - 16) {
    const jm = jumpMult(ch), base = jm === 1 ? 15 : jumpVelocity(jm);
    if (p1.yVelocity === -base) p1.yVelocity = -jumpVelocity(capped('jump', jm, m.jump));
  }
  const hit = p1.isCollisionWithBallHappened && p1.state === 2;
  if (hit && !st.hitEdge && ball.isPowerHit && m.spike !== 1) {
    const k = capped('spike', 1, m.spike);
    if (k > 1) boostSafely(ball, false, k); else scaleBall(ball, k);
    clampBall(ball);
  }
  st.hitEdge = hit;
}

/** 比賽結束：清掉玩家身上的倍率 */
export function clearMods(p1: Player): void { p1.pvMoveMult = p1.pvDiveMult = undefined; }
