// abilities — 寶可夢排球 角色技能、變化球與場上特效（舊版 abilities.js）
// 依賴：characters（CHARS）、characters/punch-shapes（punchShapes）
// 掛勾：hooks.tick（每幀，在物理運算之前）、hooks.score（得分時這一球算幾分）、
//       hooks.ai（電腦的按鍵修正）、hooks.drawBall（畫完球之後改球的光效）。
// 技能系統最先載入，所以這四層都是最裡面的一層。
// 角色音效已改由遊戲本體的音效系統播放（會跟著音效開關與立體聲設定）。
//
// 檔案分工：
//   tuning.ts   平衡數值（svc.abilities.tuning）
//   state.ts    每邊技能狀態與其他共用狀態
//   util.ts     場地常數、邊緣偵測、瞄準等小工具
//   fx.ts       爆圈／閃色佇列、特效分級事件
//   skills.ts   各角色技能、大蔥揮擊、灼傷
//   debuffs.ts  共用的負面狀態
//   ai.ts       電腦 AI 修正
//   score.ts    得分（喵喵雙倍、可達鴨頭痛、百變怪變身）
//   tick.ts     每幀的執行順序
//   overlay.ts  疊在畫面上的特效 canvas
//   ball-gfx.ts 球的屬性光、念力球、黃金球
//   net.ts      連線同步
import { hooks } from '../../core/hooks';
import { svc } from '../../core/services';
import type { AbilitiesApi } from '../../core/services';
import { AI, runAI } from './ai';
import { drawBall } from './ball-gfx';
import { net } from './net';
import { invalidateRect } from './overlay';
import { scorePoints } from './score';
import { pk, rt } from './state';
import { tick } from './tick';
import { TUNING } from './tuning';

/** 對外的 AI 表：同樣的鍵，參數換成 core 的 SideState；實際狀態用技能系統自己的那一份 */
function publicAi(): AbilitiesApi['ai'] {
  const out: AbilitiesApi['ai'] = {};
  Object.keys(AI).forEach((k) => {
    const fn = AI[k];
    out[k] = (p, ball, opp, input) => fn(p, ball, opp, input, rt.state[pk(p)]);
  });
  return out;
}

export function init(): void {
  // 每幀：舊版 _pvTick 沒有內層；這裡仍呼叫 next（最底層是遊戲本體的預設，什麼都不做）
  hooks.tick.use(function (next, ctrl) {
    tick(ctrl);
    return next(ctrl);
  });
  // 得分：舊版 _pvScore 直接回傳分數、沒有內層，所以不呼叫 next（最底層的預設只是回傳 1）
  hooks.score.use(function (_next, ctrl, scorerIdx) {
    return scorePoints(ctrl, scorerIdx);
  });
  hooks.ai.use(function (next, player, ball, opp, input) {
    runAI(player, ball, opp, input);
    next(player, ball, opp, input);
  });
  hooks.drawBall.use(function (next, view, physics) {
    drawBall(view, physics);
    next(view, physics);
  });

  window.addEventListener('resize', function () { invalidateRect(); });

  svc.abilities = {
    tuning: TUNING,
    // AI 表內部用的是補上技能欄位的每邊狀態（AbilitySide）。對外包一層：呼叫端傳進來的狀態不用，
    // 一律改用技能系統自己那一邊的狀態（執行時本來就是同一個物件），型別就不必硬轉
    ai: publicAi(),
    state: function () { return rt.state; },
    net: net,
  };
}
