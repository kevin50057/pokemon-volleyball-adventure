/**
 * 關都遠征（SPEC.md／PLAN.md）：三章（道館巡禮、四天王與秘境、華藍洞窟），進化之力、挑戰規則、每日遠征、訓練家手冊。
 *
 * 預設關閉：網址加 `?exp=1` 才會出現入口。關閉時這個模組什麼都不做，
 * 不註冊掛勾、不開 IndexedDB、不改畫面，其他模式的行為跟沒有這個模組完全一樣。
 *
 * 資料夾分工：
 *   types.ts    資料契約（ProfileV1、ExpeditionRun、SettlementV1）
 *   content/    全部是資料：章節與節點、場地規則、首領階段、卡牌、羈絆、覺醒、挑戰、手冊目標
 *   logic/      規則（純函式）：開局、地圖操作、奇遇、三選一、結算、每日遠征、讀檔檢查
 *   cards.ts    卡牌與羈絆的計算
 *   route.ts    每一輪的岔路對手（種子決定）
 *   db.ts       IndexedDB：每個變更一個 transaction、revision 檢查、錯誤不吞；主線和每日各一個存檔位
 *   rng.ts      依用途分開的種子亂數
 *   env.ts      開關、分頁寫入權（Web Locks）
 *   match/      比賽中的修飾（場地規則、卡牌、覺醒、首領、場上顯示）和跟遊戲本體的接線（adapter.ts）
 *   texts/      介面文字（繁中、英文、韓文）
 *   ui/         開發版面板
 */
import { svc } from '../../core/services';
import * as match from './match/adapter';
import { expeditionEnabled } from './env';
import { debug as uiDebug, mount } from './ui';

let on = false;

export function init(): void {
  on = expeditionEnabled();
  if (!on) return;
  match.installHooks();
  svc.expedition = { playing: match.playing };
  const go = (): void => { void mount(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
}

export function enabled(): boolean { return on; }
export const debug = uiDebug;
