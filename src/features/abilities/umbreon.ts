// ============================================================
// 月伊布：被動「同步」＋殺球「月環」
// ============================================================
// 同步：月伊布中了對手的異常狀態（定身、變慢、顛倒、灼傷），對手也會中同樣的狀態，
//       時間是一半；對手頭上掛著月環的時候是全額。
// 月環：月伊布的殺球帶月環。對手用身體接到（不是殺回來），頭上掛月環 1.5 秒；
//       這段時間內對手的下一顆殺球變弱（球速 ×0.9，只算一次），而且同步反彈全額。
// 數值都在 tuning.ts（umbreon…），以皮卡丘為基準，模擬目標勝率 48～52%。
import type { Ball, Player, UserInput } from '../../core/types';
import { pushBurst } from './fx';
import { scaleBall } from './starters';
import type { AbilitySide } from './state';
import { TUNING } from './tuning';
import { GROUND_BALL_Y, edge, powerHitEdge } from './util';

type Fn = (player: Player, opp: Player, ball: Ball, input: UserInput, s: AbilitySide, oppS: AbilitySide) => void;

const KEYS = ['stunTimer', 'slowTimer', 'reverseTimer', 'burnTimer'] as const;
type Key = typeof KEYS[number];

/** 記下這一幀結束時各個狀態的剩餘時間；下一幀變大了就是「剛中了新的」 */
function snapshot(s: AbilitySide): Record<Key, number> {
  return { stunTimer: s.stunTimer || 0, slowTimer: s.slowTimer || 0, reverseTimer: s.reverseTimer || 0, burnTimer: s.burnTimer || 0 };
}

/** 被月環套住的對手：殺球變弱（只算一次）。對手是誰都會跑（tick.ts 每邊都呼叫） */
export function processMoonMark(player: Player, ball: Ball, s: AbilitySide): void {
  // 沒有月環時什麼都不寫（不在每一邊的狀態上多出欄位：沒有月伊布的比賽、連線傳的資料都跟原本一模一樣）
  if (!(s.moonMark > 0)) { if (s.moonHit) s.moonHit = false; return; }
  s.moonMark--;
  if (edge(s, 'moonHit', player.isCollisionWithBallHappened && player.state === 2) && ball.isPowerHit) {
    scaleBall(ball, TUNING.umbreonMarkSpike);
    s.moonMark = 0;
    pushBurst(ball.x, ball.y, '#B39DDB', 40);
  }
}

export const UMBREON_ABILITIES: Record<string, Fn> = {
  synchronize: function (player, opp, ball, _input, s, oppS) {
    // ---- 同步 ----
    const prev = s.umbPrev as Record<Key, number> | undefined;
    if (prev) {
      const full = oppS.moonMark > 0;
      KEYS.forEach((k) => {
        const now = s[k] || 0;
        if (now > prev[k]) {
          const add = Math.max(1, Math.round(now * (full ? 1 : TUNING.umbreonSyncShare)));
          oppS[k] = Math.max(oppS[k] || 0, add);
          if (k === 'stunTimer') oppS.stunX = opp.x;
          // 對手也是月伊布：別讓它再反彈回來
          if (oppS.umbPrev) (oppS.umbPrev as Record<Key, number>)[k] = oppS[k];
          pushBurst(opp.x, opp.y, '#7E57C2', 50);
        }
      });
    }
    // ---- 月環 ----
    if (powerHitEdge(player, s, 'hit') && ball.isPowerHit) s.moonBall = 1;
    if (s.moonBall) {
      if (edge(s, 'oppTouch', opp.isCollisionWithBallHappened)) {
        if (opp.state !== 2) {
          oppS.moonMark = TUNING.umbreonMarkFrames;
          pushBurst(opp.x, opp.y, '#FFD54F', 45);
        }
        s.moonBall = 0;
      } else if (ball.y >= GROUND_BALL_Y - 2 || (player.isCollisionWithBallHappened && player.state !== 2)) s.moonBall = 0;
    }
    s.umbPrev = snapshot(s);
  },
};
