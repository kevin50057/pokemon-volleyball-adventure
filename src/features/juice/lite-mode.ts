// 特效：完整／精簡
// 精簡：不震、不推鏡頭、不閃全畫面；頓幀、火花、衝擊環和音效照留。系統開了「減少動態效果」就預設精簡
import { store } from '../../core/storage';
import { LITE_KEY } from './config';
import { S } from './state';

let liteMode = false;

/** 舊版在載入時算一次；這裡在 init() 時算。 */
export function initLite(): void {
  liteMode = (function () {
    try { const v = store.get(LITE_KEY); if (v === '1') return true; if (v === '0') return false; } catch { /* 讀不到就看系統設定 */ }
    try { return !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  })();
}

export function lite(): boolean { return liteMode; }

// 選項選單：特效 完整／精簡
export function addLiteToggle(): void {
  const dd = document.getElementById('options-dropdown');
  if (!dd || document.getElementById('pv-fx-btn')) return;
  const zh = (document.documentElement.lang || 'zh').slice(0, 2) === 'zh';
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'pv-fx-btn'; b.className = 'btn';
  const paint = function () { b.textContent = zh ? ('特效：' + (liteMode ? '精簡' : '完整')) : ('Effects: ' + (liteMode ? 'Lite' : 'Full')); };
  paint();
  b.addEventListener('click', function (e) {
    e.stopPropagation();
    liteMode = !liteMode;
    store.set(LITE_KEY, liteMode ? '1' : '0');
    if (liteMode) { S.trauma = 0; S.zoom = 0; }
    paint();
  });
  dd.insertBefore(b, document.getElementById('reset-to-default-btn'));
}
