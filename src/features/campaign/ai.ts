// ---------- 電腦強度：在遊戲本體和角色 AI 決定好按鍵之後，再依關卡把它調弱 ----------
// hooks.ai 的一層（包在技能系統外面）：
//   呼叫 next 之前：低重力、強風關把落點換成「看得到預警」的預測
//   呼叫 next 之後：依關卡難度削弱
import type { Ball, Player, UserInput } from '../../core/types';
import { CFG, NET_X } from './config';
import { camp } from './state';
import { predictLanding } from './rules';

type AiNext = (player: Player, ball: Ball, opp: Player, input: UserInput) => void;

export function aiLayer(next: AiNext, player: Player, ball: Ball, opp: Player, input: UserInput): void {
  const r = camp.rule;
  if (r && camp.playing && !camp.waiting && player.isComputer && (r.id === 'lowgrav' || r.id === 'wind')) {
    const pred = predictLanding(ball, r);
    if (pred != null && Math.abs(pred - ball.expectedLandingPointX) > 6) {
      ball.expectedLandingPointX = pred;                     // 角色 AI（衝刺、瞬移）也照這個落點
      const mineP = player.isPlayer2 ? pred >= NET_X : pred < NET_X;
      if (mineP && player.state === 0) input.xDirection = Math.abs(pred - player.x) > 8 ? (pred > player.x ? 1 : -1) : 0;
    }
  }
  next(player, ball, opp, input);
  if (!camp.playing || camp.waiting || !player.isComputer) return;
  const d = player.isPlayer2 ? camp.diff : camp.proxy, m = player.isPlayer2 ? camp.ai2 : camp.ai1;
  if (!d) return;
  const mine = player.isPlayer2 ? ball.x >= NET_X : ball.x < NET_X;
  if (mine && !m.mine && Math.random() < d.lapse) m.freeze = CFG.lapseFrames;     // 球剛飛過來：慢半拍
  m.mine = mine;
  if (m.freeze > 0) { m.freeze--; input.xDirection = 0; input.yDirection = 0; input.powerHit = 0; return; }
  if (player.state === 0) {
    if (input.xDirection !== 0) { m.acc += d.move; if (m.acc >= 1) m.acc -= 1; else input.xDirection = 0; }   // 腳步變慢
    m.noSpike = Math.random() > d.spike;                                                                      // 這一跳殺不殺
  } else if (player.state === 1 && m.noSpike) input.powerHit = 0;
}
