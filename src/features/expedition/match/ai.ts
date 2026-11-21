/**
 * 電腦強度（hooks.ai 的一層，在遊戲本體和角色 AI 決定好按鍵之後再調弱）：
 * 球剛飛過來時有機率慢半拍、腳步變慢、起跳後不一定殺球。只調右邊（對手）的電腦。
 */
import type { Ball, Player, UserInput } from '../../../core/types';
import { LAPSE_FRAMES, type Diff } from '../content';
import { NET_X } from './geom';

export interface AiState { mine: boolean; freeze: number; acc: number; noSpike: boolean }
export function newAiState(): AiState { return { mine: false, freeze: 0, acc: 0, noSpike: false }; }

export function weakenAi(d: Diff, m: AiState, player: Player, ball: Ball, input: UserInput): void {
  if (!player.isComputer || !player.isPlayer2) return;
  const mine = ball.x >= NET_X;
  if (mine && !m.mine && Math.random() < d.lapse) m.freeze = LAPSE_FRAMES;
  m.mine = mine;
  if (m.freeze > 0) { m.freeze--; input.xDirection = 0; input.yDirection = 0; input.powerHit = 0; return; }
  if (player.state === 0) {
    if (input.xDirection !== 0) { m.acc += d.move; if (m.acc >= 1) m.acc -= 1; else input.xDirection = 0; }
    m.noSpike = Math.random() > d.spike;
  } else if (player.state === 1 && m.noSpike) input.powerHit = 0;
}
