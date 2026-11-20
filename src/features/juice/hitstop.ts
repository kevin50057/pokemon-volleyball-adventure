// 打擊感：擊球停格（頓幀）
// 舊版是包住 window._pvTick；這裡是 hooks.tick 的一層（技能系統那層在裡面）。
import type { Controller } from '../../core/types';
import { duckSample } from './sfx';
import { applySprites } from './sprites';
import { S } from './state';
import { now, sim } from './util';

/** hooks.tick 的中介層：頓幀期間回傳 false，讓遊戲本體跳過這一幀的物理。 */
export function tickLayer(next: (ctrl: Controller) => boolean | void, ctrl: Controller): boolean | void {
  S.ctrlRef = ctrl;
  duckSample(ctrl);
  if (sim()) return next(ctrl);
  const view = ctrl.view && ctrl.view.game, kb = ctrl.keyboardArray;

  if (S.hitStop > 0) {
    S.hitStop--;
    // 頓幀期間按的殺球鍵先記住，不要吃掉
    for (let i = 0; i < 2; i++) if (kb[i].powerHit === 1) S.latched[i] = 1;
    if (S.hitStop === 0) releaseHold();
    if (view) applySprites(view, ctrl.physics);
    return false;          // 讓遊戲本體跳過這一幀的物理
  }
  for (let k = 0; k < 2; k++) {
    if (S.latched[k]) { kb[k].powerHit = 1; S.latched[k] = 0; }
  }
  return next(ctrl);
}

function releaseHold(): void {
  // 頓幀結束的瞬間才開始回彈，球被「彈射」出去
  if (S.ballFx.hold) { S.ballFx.hold = false; S.ballFx.t0 = now(); }
  if (S.pendingTrail) { S.trailUntil = now() + (S.pendingTrail === true ? 200 : S.pendingTrail); S.pendingTrail = false; }   // 拖尾從球真的飛出去才開始算
}

// 連線對戰的客機不跑物理，只靠這個讓頓幀倒數、殺球回彈照常進行（svc.juiceNet.guestTick）
export function guestTick(ctrl: Controller): void {
  S.ctrlRef = ctrl; duckSample(ctrl);
  if (S.hitStop > 0) { S.hitStop--; if (S.hitStop === 0) releaseHold(); }
}
