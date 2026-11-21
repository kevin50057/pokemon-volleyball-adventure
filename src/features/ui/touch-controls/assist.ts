/**
 * 觸控輔助：修正遊戲每一幀讀到的輸入（接在 hooks.afterInput 上）。
 * 這裡只讀遊戲狀態、改這一幀的輸入，不呼叫 Math.random()。
 */
import type { Controller, Keyboard, Player } from '../../../core/types';
import { svc } from '../../../core/services';
import { KEYSETS, pressed } from './keys';
import { T } from './texts';

// ========== 觸控輔助：修正遊戲每一幀讀到的輸入 ==========
export const joyX: [number, number] = [0, 0];            // 搖桿目前的左右方向（技能鍵用它決定往哪邊）
export const skillReq: [number, number] = [0, 0];        // 技能鍵按下後，下一幀要送出的衝刺／瞬移請求
const aimLock: [boolean, boolean] = [false, false];

/** dash：送出衝刺請求；hold：按住等於按住那個方向鍵 */
export type SkillDef =
  | { label: string; dash: number; hold?: undefined }
  | { label: string; hold: 'down'; dash?: undefined };
// 需要主動施放的技能才有技能鍵。dash：送出衝刺請求（水伊布用遊戲本體的 ±1，其他用 ±2，見 abilities 的 skillKey）；
// hold：按住等於按住那個方向鍵
export const SKILLS: Readonly<Record<string, SkillDef | undefined>> = {
  vaporeon:   { label: T.skillDash, dash: 1 },
  jolteon:    { label: T.skillZip, dash: 2 },
  mew:        { label: T.skillWarp, dash: 2 },
  jigglypuff: { label: T.skillDrop, hold: 'down' },
};

function netState() { return svc.net && svc.net.state; }
// 這組按鍵現在控制的是哪一隻：連線對戰時房主一定是左邊、客人一定是右邊
export function myPlayer(c: Controller, i: number): Player {
  const n = netState();
  if (n && n.render) return c.physics.player2;
  if (svc.campaign && svc.campaign.playing()) return c.physics.player1;   // 闖關：兩組按鍵都控制左邊的自己
  if (n && n.role === 'host' && (n.phase === 'play' || n.phase === 'end')) return c.physics.player1;
  return i === 0 ? c.physics.player1 : c.physics.player2;
}
// 球在接下來 3 幀內會不會碰到這隻角色（碰撞範圍是上下左右各 32，多留一點）
function ballSoon(c: Controller, me: Player): boolean {
  const b = c.physics.ball;
  let bx = b.x, by = b.y, bvy = b.yVelocity, py = me.y, pvy = me.yVelocity;
  const leek = me.character === 'farfetchd', rx = leek ? 52 : 40, ry = leek ? 44 : 40;   // 大蔥鴨拿大蔥，構得到比較遠
  for (let k = 1; k <= 3; k++) {
    bx += b.xVelocity; by += bvy; bvy += 1;
    py = Math.min(244, py + pvy); pvy += 1;
    if (Math.abs(bx - me.x) <= rx && Math.abs(by - py) <= ry) return true;
  }
  return false;
}
// 沒推搖桿時技能往哪邊：往球會落下的地方（客人端沒有落點資料，用球現在的位置）
export function towardBall(c: Controller, me: Player): number {
  const b = c.physics.ball, n = netState(), land = n && n.render ? NaN : b.expectedLandingPointX;
  const mine = me.isPlayer2 ? land > 216 : land < 216;
  const d = (mine ? land : b.x) - me.x;
  return d > 4 ? 1 : d < -4 ? -1 : (me.isPlayer2 ? -1 : 1);
}
export function assist(c: Controller, kb: Keyboard, i: 0 | 1): void {
  const keys = KEYSETS[i], me = myPlayer(c, i), n = netState();
  const hit = !!pressed[keys.action], up = !!pressed[keys.up];
  const playing = c.state === c.round || !!(n && n.render);
  // 按住「殺」不放：球快碰到的那一刻自動出手。
  // 殺球姿勢只維持 0.4 秒，手指又不像鍵盤能精準點在那一瞬間，太早按就會落空
  if (playing && hit && me.state === 1 && kb.powerHit !== 1 && !me.isCollisionWithBallHappened && ballSoon(c, me)) kb.powerHit = 1;
  // 「跳」和「殺」同時壓著（拇指橫跨兩顆、或從跳滑到殺）：跳其實是「上」鍵，會讓殺球變成往上挑的高球。
  // 人在空中又按著殺時，不把它當成往上瞄準；要往下砸一樣把搖桿往下推
  if (hit && up && (me.state === 1 || me.state === 2)) aimLock[i] = true;
  if (!up) aimLock[i] = false;
  if (aimLock[i]) kb.yDirection = kb.downKey && kb.downKey.isDown ? 1 : 0;
  if (skillReq[i]) { kb.dashRequest = skillReq[i]; skillReq[i] = 0; }
}
