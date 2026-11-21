/**
 * 關都遠征（SPEC.md／PLAN.md，目前是 M2：五站短切片）。
 *
 * 預設關閉：網址加 `?exp=1` 才會出現入口。關閉時這個模組什麼都不做，
 * 不註冊掛勾、不開 IndexedDB、不改畫面，其他模式的行為跟沒有這個模組完全一樣。
 *
 * 檔案分工：
 *   types.ts    資料契約（ProfileV1、ExpeditionRunV1、SettlementV1）
 *   content.ts  路線、場地規則、卡牌、羈絆（全部是資料）
 *   cards.ts    卡牌與羈絆的計算
 *   field.ts    比賽中的修飾：場地規則、卡牌倍率、首領、場上顯示
 *   art.ts      地圖、收服演出、明信片
 *   widgets.ts  面板的小元件和樣式
 *   logic.ts    規則（純函式）：入場、結算、讀檔檢查
 *   db.ts       IndexedDB：每個變更一個 transaction、revision 檢查、錯誤不吞
 *   rng.ts      依用途分開的種子亂數
 *   env.ts      開關、分頁寫入權（Web Locks）
 *   adapter.ts  跟遊戲本體的接線：入場、偵測勝負、離場、切背景暫停
 *   ui.ts       開發版面板
 */
import { svc } from '../../core/services';
import * as match from './adapter';
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
