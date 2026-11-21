// ============================================================
// 每幀（hooks.tick，舊版 window._pvTick；遊戲本體在讀完按鍵、物理運算之前呼叫）
// ============================================================
import type { Controller, Player } from '../../core/types';
import { processDebuffs } from './debuffs';
import { draw } from './overlay';
import { leekReach, processAbility, processBurn } from './skills';
import { shellMark, shellRestore, starterMotion } from './starters';
import { pk, resetAll, rt } from './state';

export function tick(ctrl: Controller): void {
  const p1 = ctrl.physics.player1, p2 = ctrl.physics.player2, ball = ctrl.physics.ball;
  const inMenu = ctrl.state === ctrl.intro || ctrl.state === ctrl.menu;

  const sum = (ctrl.scores ? ctrl.scores[0] + ctrl.scores[1] : 0);
  if (sum < rt.lastScoreSum) resetAll(ctrl);
  rt.lastScoreSum = sum;

  trackOrigin(p1); trackOrigin(p2);
  p1.pvHit = p2.pvHit = false;   // 「沒碰到身體但算擊球」的記號（大蔥揮擊），給特效和連線看
  if (p1.isCollisionWithBallHappened) rt.lastHitter = p1;
  else if (p2.isCollisionWithBallHappened) rt.lastHitter = p2;

  if (!inMenu) {
    rt.incoming.p1 = rt.ballMem.prevPower && rt.ballMem.lastPowerSide === 'p2';
    rt.incoming.p2 = rt.ballMem.prevPower && rt.ballMem.lastPowerSide === 'p1';
    // 大蔥揮擊要在所有技能之前算：它等於「這一幀碰到球了」，後面的判斷才會一致
    leekReach(p1, ball, ctrl.keyboardArray[0]);
    leekReach(p2, ball, ctrl.keyboardArray[1]);
    [p1, p2].forEach(function (p) {
      if (p.isCollisionWithBallHappened && ball.isPowerHit) rt.ballMem.lastPowerSide = pk(p);
    });
    const shell1 = shellMark(p1), shell2 = shellMark(p2);
    processAbility(p1, p2, ball, ctrl.keyboardArray[0], 'p1', ctrl);
    processAbility(p2, p1, ball, ctrl.keyboardArray[1], 'p2', ctrl);
    // 御三家：傑尼龜的硬殼先還原被推開的位置，再算走路／撲救／跳躍的倍率
    shellRestore(p1, shell1, rt.state.p1);
    shellRestore(p2, shell2, rt.state.p2);
    starterMotion(p1);
    starterMotion(p2);
    processBurn(p1, ball, 'p1');
    processBurn(p2, ball, 'p2');
    processDebuffs(p1, ctrl.keyboardArray[0], 'p1');
    processDebuffs(p2, ctrl.keyboardArray[1], 'p2');
    rt.ballMem.prevPower = !!ball.isPowerHit;
    rt.ballMem.prevVx = ball.xVelocity;
  }
  draw(ctrl, inMenu);
}

function trackOrigin(player: Player): void {
  const m = rt.meta[pk(player)];
  if (player.character !== m.transformedTo) {
    m.origin = player.character;   // 玩家從選單換了角色
    m.transformedTo = null;
  }
}
