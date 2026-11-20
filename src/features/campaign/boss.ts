// ---------- 超夢：三個階段、血條判定、換階段的演出 ----------
import { svc } from '../../core/services';
import type { Controller } from '../../core/types';
import { CFG } from './config';
import { camp, save } from './state';
import type { BossState, Run } from './state';
import { persist } from './save';
import { scoreBoards, setBgmSpeed, setTint, setTuning } from './field';
import { sfx } from './sfx';

// 只在 camp.boss 已經建好時呼叫
export function applyPhase(c: Controller, phase: number, withFx: boolean): void {
  const B = CFG.boss, b = camp.boss as BossState;
  b.phase = phase;
  setTuning({ psychicCooldown: B.cooldown[phase - 1] });
  camp.speedEvery = B.speedEvery[phase - 1]; camp.spd = 0;
  setTint(c, B.tint[phase - 1]);
  setBgmSpeed(c, B.bgm[phase - 1]);
  if (withFx) {
    b.flash = 6;
    const p2 = c.physics.player2;
    try { if (svc.fxEvent) svc.fxEvent('skill', { player: p2, lvl: 4, x: p2.x, y: p2.y, k: 'psy' }); } catch (e) { /* 特效失敗不影響遊戲 */ }
  }
}
/** 回傳 false：這一幀整個遊戲停住（換階段的演出）。只在 camp.boss、save.run 都有時呼叫。 */
export function bossTick(c: Controller, live: boolean): false | void {
  const B = CFG.boss, b = camp.boss as BossState, run = save.run as Run, ph = c.physics;
  scoreBoards(c, false);
  // 從第 2、3 階段重打：超夢的血從那個階段開始算
  if (b.init && c.state === c.startOfNewGame && c.frameCounter >= 1) { c.scores[0] = (b.phase - 1) * B.perPhase; b.init = false; b.s0 = c.scores[0]; b.s1 = 0; }
  if (b.cut > 0) {
    b.cut--;
    if (b.cut === B.cutMid) applyPhase(c, b.next, true);
    return false;                              // 演出中整個遊戲停住
  }
  if (b.hit > 0) b.hit--;
  if (b.hurt > 0) b.hurt--;
  if (live && !b.init) {
    // 扣血的回饋
    if (c.scores[0] > b.s0) { b.hit = 12; b.hitFrom = b.s0; b.s0 = c.scores[0]; if (c.scores[0] < B.hp) sfx('hit'); }
    if (c.scores[1] > b.s1) { b.hurt = 12; b.s1 = c.scores[1]; if (c.scores[1] < B.playerHp) sfx('hurt'); }
  }
  if (live && !b.init && !c.gameEnded) {
    // 玩家的血打完：遊戲本體只會看 winningScore，所以自己判定結束
    if (c.scores[1] >= B.playerHp) {
      c.gameEnded = true;
      ph.player1.isWinner = false; ph.player2.isWinner = true;
      ph.player1.gameEnded = true; ph.player2.gameEnded = true;
      return;
    }
    const np = Math.min(3, Math.floor(c.scores[0] / B.perPhase) + 1);
    if (np > b.phase && !b.pending) b.pending = np;
    // 換階段的演出放在下一球發球前
    if (b.pending && camp.prevState === c.beforeStartOfNextRound) {
      b.next = b.pending; b.pending = 0; b.cut = B.cutFrames;
      run.bossPhase = b.next; persist();       // 超夢每個階段都是檢查點
      sfx('phase');
      return false;
    }
  }
}
