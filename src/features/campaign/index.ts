// 闖關模式「冠軍之路」（舊版 campaign.js）
// 依賴：角色、技能、連線（init 要在它們之後）、選角面板（角色圖）
// 進度存在 localStorage（'pv-campaign-v1'，格式跟經典版一樣）。
//
// 檔案分工：
//   config.ts   數值、關卡表、場地規則說明         state.ts  共用狀態（save、camp）
//   save.ts     讀寫存檔、收服、獎章              order.ts  排對手、開新的一輪
//   match.ts    開打／結束／離開、tick 與 gameLoop 掛勾
//   rules.ts    場地規則（物理、AI 預測、黃金球計分、場上畫面）   ai.ts  電腦強度
//   boss.ts     超夢三階段      ko.ts  打倒演出      hud.ts  場上的抬頭顯示
//   field.ts    場地染色等小工具      draw.ts  canvas 畫筆      sfx.ts  合成音效
//   ui/         css.ts 樣式、dom.ts 共用、screens.ts 各畫面、overlays.ts 收服／通關、entry.ts 入口與操作
import { hooks } from '../../core/hooks';
import { svc } from '../../core/services';
import { CFG, RULES, TIER, ruleFor } from './config';
import { charName } from './chars';
import { camp, ctrlOf, save } from './state';
import { howToGet, load, medalTier, owned, persist, unlock } from './save';
import { newRun } from './order';
import { gameLoopLayer, hookCtrl, startMatch, suspend, tickLayer } from './match';
import { predictLanding, scoreLayer } from './rules';
import { aiLayer } from './ai';
import { resetHudRect } from './hud';
import { stepAnims } from './ui/dom';
import { go } from './ui/screens';
import { playAcquire, playClear } from './ui/overlays';
import { build, openFromMenu, refreshEntry } from './ui/entry';

// 真人遊玩的紀錄：每一關「這一輪第一次挑戰就贏」的比例，和每一輪的敗場數
function stats() {
  const rows = Object.keys(save.stats).map(function (k) {
    const p = k.split(':'), v = save.stats[k], rid = ruleFor(+p[0], p[1]);
    return { 關卡: +p[0] + 1, 對手: charName(p[1]), 場地: rid ? RULES[rid].name : '', 第一次挑戰: v.t, 第一次就贏: v.w, 首勝率: v.t ? Math.round(v.w / v.t * 100) + '%' : '' };
  }).sort(function (a, b) { return a.關卡 - b.關卡; });
  return { 各關: rows, 通關紀錄: save.runs.map(function (r) { return { 角色: charName(r.c), 敗場: r.lost, 用時秒: Math.round(r.f / 25), 日期: r.d }; }) };
}

/** 除錯與測試用（舊版 window.PV_Campaign 的 cfg、state、save、rules、stats 和 _test）。 */
export const debug = {
  cfg: CFG, state: camp, rules: RULES,
  save: function () { return save; },
  stats: stats,
  // 舊版 PV_Campaign._test
  newRun: newRun, start: startMatch, suspend: function () { suspend(ctrlOf(), true); }, hook: hookCtrl, persist: persist, go: go,
  acquire: playAcquire, clear: playClear, unlock: unlock, predict: predictLanding, ruleFor: ruleFor
};

export function init(): void {
  // 掛勾：都包在技能、特效、連線那幾層外面（main.ts 的 init 順序保證）
  hooks.tick.use(tickLayer);
  hooks.score.use(scoreLayer);
  hooks.ai.use(aiLayer);
  hooks.gameLoop.use(gameLoopLayer);
  window.addEventListener('resize', resetHudRect);

  svc.campaign = {
    isActive: function () { return camp.playing; },
    playing: function () { return camp.playing && !camp.waiting; },
    owned: owned, howToGet: howToGet, medalTier: medalTier, tiers: TIER,
    open: openFromMenu
  };

  load();
  build();
  setInterval(function () {
    hookCtrl();
    if (camp.wantStart && ctrlOf()) startMatch();
    refreshEntry();
  }, 300);
  setInterval(stepAnims, 115);
}
