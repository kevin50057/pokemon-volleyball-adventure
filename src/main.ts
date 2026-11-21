/**
 * 進入點。
 *
 * 初始化順序就是舊版 <script> 的載入順序，掛勾鏈（core/hooks.ts）的內外層靠這個順序決定，不要隨意調換：
 *   觸控 → 角色 → 技能 → 特效 → 連線 → 選角 → 闖關 → 遠征 → 版本入口 → 自訂按鍵 → 遊戲本體
 */
import { migrateFromClassic } from './core/storage';
import { svc, flags } from './core/services';
import { hooks } from './core/hooks';
import { init as initTouch } from './features/ui/touch-controls';
import { init as initCharacters } from './features/characters';
import { init as initAbilities } from './features/abilities';
import { init as initJuice, debug as juiceDebug } from './features/juice';
import { init as initNetplay, debug as netDebug } from './features/netplay';
import { init as initCharSelect } from './features/ui/char-select';
import { init as initCampaign, debug as campaignDebug } from './features/campaign';
import { init as initExpedition, debug as expeditionDebug } from './features/expedition';
import { init as initEdition } from './features/ui/edition';
import { init as initKeybind, installKeyGuards } from './features/ui/keybind';
import { startEngine } from './engine';
import { setCustomRng } from './engine/rand';

declare global {
  interface Window {
    /** 除錯與自動測試用的入口（主控台：`PVA.svc.ctrl`）。 */
    PVA?: unknown;
  }
}

migrateFromClassic();

// 舊版 keybind.js 的按鍵攔截在載入當下就掛上，比選角、闖關的鍵盤監聽都早；要先掛才能維持同樣的優先順序
installKeyGuards();
initTouch();
initCharacters();
initAbilities();
initJuice();
initNetplay();
initCharSelect();
initCampaign();
initExpedition();   // 預設關閉（網址 ?exp=1 才打開）；關閉時什麼都不做
initEdition();
initKeybind();
startEngine();

window.PVA = { svc, flags, hooks, setCustomRng, juice: juiceDebug, net: netDebug, campaign: campaignDebug, expedition: expeditionDebug };
