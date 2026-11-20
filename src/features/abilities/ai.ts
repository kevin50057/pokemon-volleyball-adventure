// ============================================================
// 電腦 AI：遊戲本體的 AI 只會打皮卡丘，這裡依角色修正它的輸入
// 遊戲本體在 AI 決定好按鍵之後跑 hooks.ai（舊版 window._pvAI(player, ball, opponent, input)）
// ============================================================
import type { Ball, Player, UserInput } from '../../core/types';
import { rt, pk } from './state';
import type { AbilitySide } from './state';
import { TUNING } from './tuning';
import { NET_X } from './util';

export type AiFn = (p: Player, ball: Ball, opp: Player, input: UserInput, s: AbilitySide) => void;

export const AI: Record<string, AiFn> = {
  // 水伊布：球落點離很遠時用衝刺趕過去
  vaporeon: function (p, ball, opp, input) {
    const target = ball.expectedLandingPointX;
    const mySide = p.isPlayer2 ? target > NET_X : target < NET_X;
    if (p.state === 0 && mySide && Math.abs(target - p.x) > TUNING.vaporeonAIDash && Math.random() < TUNING.vaporeonAIDashChance && !p.isDashing && p.dashCooldown === 0) {
      input.dashRequest = target > p.x ? 1 : -1;
    }
  },
  // 閃電鳥：在空中、球在頭上方時拍翅追球（拍翅需要每次重新按「上」）
  bird: function (p, ball, opp, input) {
    if ((p.state === 1 || p.state === 2) && p.flapsLeft > 0 &&
        ball.y < p.y - 16 && Math.abs(ball.x - p.x) < 60 && p.yVelocity > -4) {
      input.yDirection = p.prevYDirection === -1 ? 0 : -1;
    }
  },
  // 胖丁：球在對面、自己還在空中時快速落地回防
  jigglypuff: function (p, ball, opp, input) {
    const away = p.isPlayer2 ? ball.x < NET_X : ball.x > NET_X;
    if ((p.state === 1 || p.state === 2) && away && p.yVelocity > 0) input.yDirection = 1;
  },
  // 雷伊布：球的落點很遠就電光一閃過去；在空中球就在旁邊但構不到時，閃過去打
  jolteon: function (p, ball, opp, input, s) {
    if (s.qaCooldown || !TUNING.qaAI) return;
    const target = ball.expectedLandingPointX, mySide = p.isPlayer2 ? target > NET_X : target < NET_X;
    if (p.state === 0 && mySide && Math.abs(target - p.x) > 90 && Math.random() < 0.15) s.zipRequest = target > p.x ? 1 : -1;
    else if ((p.state === 1 || p.state === 2) && Math.abs(ball.y - p.y) < 45) {
      const dx = ball.x - p.x;
      if (Math.abs(dx) > 35 && Math.abs(dx) < 90) s.zipRequest = dx > 0 ? 1 : -1;
    }
  },
  // 夢幻：落點離自己很遠就瞬間移動過去
  mew: function (p, ball, opp, input, s) {
    if (s.tpCD > 0) return;
    const target = ball.expectedLandingPointX, mySide = p.isPlayer2 ? target > NET_X : target < NET_X;
    if (p.state === 0 && mySide && Math.abs(target - p.x) > 90 && Math.random() < TUNING.mewTeleportAI) s.zipRequest = target > p.x ? 1 : -1;
  },
  // 大蔥鴨：在空中、球進到大蔥構得到的範圍就揮（不用等球貼到身上）
  farfetchd: function (p, ball, opp, input, s) {
    if (p.state !== 1 || s.leekSwung) return;
    const mine = p.isPlayer2 ? ball.x >= NET_X : ball.x < NET_X;
    if (mine && Math.abs(ball.x - p.x) < TUNING.leekReachX - 6 && Math.abs(ball.y - p.y) < TUNING.leekReachY - 6 &&
        Math.random() < TUNING.leekAI) input.powerHit = 1;
  },
  // 卡比獸：跳不高，球還在高處時不要起跳，等球掉下來用肚子接
  snorlax: function (p, ball, opp, input) {
    if (p.state === 0 && input.yDirection === -1 && ball.y < 150) input.yDirection = 0;
  },
  // 可達鴨：頭痛滿 3 層時，在空中一碰到球就殺
  psyduck: function (p, ball, opp, input, s) {
    if ((s.headacheCharge || 0) >= 3 && (p.state === 1 || p.state === 2) &&
        Math.abs(ball.x - p.x) < 40 && Math.abs(ball.y - p.y) < 40) input.powerHit = 1;
  },
};

/** 舊版 window._pvAI 的內容。 */
export function runAI(player: Player, ball: Ball, opp: Player, input: UserInput): void {
  if (!player.isComputer) return;
  // 舊版是 `state[pk(player)] || {}`：state 兩邊一定都在，`{}` 只是保險（型別上當成空的每邊狀態）
  const s = rt.state[pk(player)] || ({} as AbilitySide);
  const fn = AI[player.character];
  if (fn) fn(player, ball, opp, input, s);

  // 防卡死：原版 AI 有時會在自己場上一直用頭頂球、永遠不殺球
  const mine = player.isPlayer2 ? ball.x >= NET_X : ball.x < NET_X;
  s.ownSide = mine ? (s.ownSide || 0) + 1 : 0;
  if (TUNING.antiStall && s.ownSide > TUNING.antiStall) {
    if (player.state === 0 && Math.abs(ball.x - player.x) < 30 && ball.yVelocity > 0 && ball.y > 40 && ball.y < 150) input.yDirection = -1;
    if ((player.state === 1 || player.state === 2) && Math.abs(ball.x - player.x) < 40 && Math.abs(ball.y - player.y) < 40) {
      input.powerHit = 1;
      input.xDirection = player.isPlayer2 ? -1 : 1;
    }
  }
}
