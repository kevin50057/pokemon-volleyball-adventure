/**
 * 觸控按鈕 → 模擬鍵盤事件。
 */
import type { TouchKeySet } from '../../../core/services';

export const P1_KEYS: TouchKeySet = { up: 'KeyR', down: 'KeyV', left: 'KeyD', right: 'KeyG', action: 'KeyZ' };
export const P2_KEYS: TouchKeySet = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: 'Enter' };
// 自訂按鍵（keybind）會直接改這兩個物件的內容，所以讀按鍵代碼一律在事件當下讀
export const KEYSETS: [TouchKeySet, TouchKeySet] = [P1_KEYS, P2_KEYS];
export const pressed: Record<string, boolean> = {};

function simKey(code: string, type: 'keydown' | 'keyup'): void {
  window.dispatchEvent(new KeyboardEvent(type, { code: code, key: code, bubbles: true, cancelable: true }));
}
// 遊戲每 40ms 才讀一次按鍵。手指很快點一下（比 40ms 短）的話，按下和放開都落在兩次讀取之間，
// 遊戲就完全沒看到，所以每次按鍵至少維持 MIN_HOLD 毫秒
const MIN_HOLD = 90;
const downAt: Record<string, number> = {};
const upTimer: Record<string, number | null> = {};
export function pressKey(code: string): void {
  const ut = upTimer[code];
  if (ut) { clearTimeout(ut); upTimer[code] = null; simKey(code, 'keyup'); pressed[code] = false; }
  if (!pressed[code]) { pressed[code] = true; downAt[code] = Date.now(); simKey(code, 'keydown'); }
}
export function releaseKey(code: string): void {
  if (!pressed[code] || upTimer[code]) return;
  const wait = MIN_HOLD - (Date.now() - downAt[code]);
  if (wait <= 0) { pressed[code] = false; simKey(code, 'keyup'); return; }
  upTimer[code] = window.setTimeout(() => { upTimer[code] = null; pressed[code] = false; simKey(code, 'keyup'); }, wait);
}

// 診斷：手指還按著，但系統／瀏覽器把觸控搶走（例如邊緣滑動手勢、縮放）時會收到 touchcancel，
// 按鍵會被迫放開。發生時在畫面上方中間顯示一個紅色數字，方便回報
let cancelCount = 0;
let cancelBadge: HTMLDivElement | null = null;
export function noteCancel(): void {
  cancelCount++;
  if (!cancelBadge) {
    cancelBadge = document.createElement('div');
    cancelBadge.style.cssText = 'position:fixed;top:36px;left:50%;transform:translateX(-50%);z-index:10002;background:#d32f2f;color:#fff;font:bold 11px sans-serif;padding:1px 6px;border-radius:8px;pointer-events:none;opacity:.85';
    document.body.appendChild(cancelBadge);
  }
  cancelBadge.textContent = '觸控被系統中斷 ×' + cancelCount;
}
