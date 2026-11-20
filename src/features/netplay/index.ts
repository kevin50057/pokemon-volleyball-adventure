// netplay — 寶可夢排球 連線對戰（主機權威）
// 依賴：characters、abilities（svc.abilities.net）、juice（svc.juiceNet、svc.fxEvent），init 要在它們之後呼叫。
//
// 架構：
//  - 房主（左 1P）跑完整遊戲：物理、技能、得分都只在房主算。（host.ts）
//  - 客人（右 2P）不跑物理，只送按鍵、收房主每幀的快照來畫。（guest.ts）
//  - 傳輸只用 presence（每個人一個物件，最新的覆蓋舊的），所以掉包不會累積錯誤；
//    音效、擊球、技能特效都用「累計計數器／事件編號」傳，掉一兩幀也不會漏。（protocol.ts）
//    房間由自架層提供（selfroom/：WebRTC 直連＋MQTT 中繼），本機測試可用假房間（fake-room.ts）。
//  - 體感：客人用「還沒被房主確認的輸入」預測自己的左右位置；快照沒到時球外推最多 2 幀；
//    兩邊都顯示來回延遲；斷線時暫停並等待重連，太久就回單人模式。（session.ts）
import { hooks } from '../../core/hooks';
import { svc } from '../../core/services';
import { net } from './state';
import { initText } from './text';
import { initValid, now } from './util';
import { buildUI, openPanel, lastRoom } from './ui';
import { resendNow, selfDown, start, stop, tick250 } from './session';
import { hostAfterLoop, hostCountSounds, hostInject, hostStart, recordFx } from './host';
import { guestFrame } from './guest';

export { debug } from './debug';

export function init(): void {
  initText();
  initValid();

  // ============================================================
  // 掛勾：tick（包在技能與特效外面）
  // ============================================================
  hooks.tick.use((next, c) => {
    if (net.render) { guestFrame(c); return false; }
    if (net.role === 'host' && net.phase === 'play') {
      // 對手斷線、自己斷線、或剛恢復的倒數中：物理停住，等大家都在再繼續
      if (net.paused || selfDown()) { net.ticked = true; return false; }
      if (net.resumeAt > now()) { net.ticked = true; return false; }
      hostInject(c);
      net.f++; net.ticked = true;
    } else if (net.role === 'host' && net.phase === 'end') {
      net.f++; net.ticked = true;
    }
    return next(c);
  });

  // 定時檢查與分頁切換（舊版在載入時就註冊）
  window.setInterval(tick250, 250);
  document.addEventListener('visibilitychange', () => { if (net.room) resendNow(); });

  buildUI();

  // 技能事件（技能系統呼叫 svc.fxEvent）：房主記下來傳給客人重播，再交給原本的特效
  const orig = svc.fxEvent;
  svc.fxEvent = (type, d) => {
    recordFx(type, d);
    return orig ? orig(type, d) : undefined;
  };

  // 包住 gameLoop 與 playSoundEffect（舊版等遊戲本體載好後改寫 ctrl 上的函式）
  hooks.gameLoop.use((next, c) => {
    next(c);
    hostAfterLoop(c);
  });
  hooks.playSoundEffect.use((next, c) => {
    if (net.role === 'host' && net.phase === 'play') hostCountSounds(c);
    return next(c);
  });

  window.addEventListener('pagehide', () => { if (net.room) try { void net.room.leave(); } catch (e) { /* 關頁中 */ } });
  // 重新整理前在房間裡：直接把面板打開，讓玩家一鍵回去
  if (lastRoom()) window.setTimeout(openPanel, 800);

  svc.net = { state: net, open: openPanel, start, stop, hostStart };
}
