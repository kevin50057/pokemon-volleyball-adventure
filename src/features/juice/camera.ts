// 打擊感：畫面震動、鏡頭頓挫與衝擊，以及鏡頭與粒子層（requestAnimationFrame）
// 遊戲邏輯是 25 FPS；震動、粒子用 requestAnimationFrame 以螢幕更新率（通常 60 FPS）畫，看起來比較滑順。
import { H, JUICE, W } from './config';
import { lite } from './lite-mode';
import { drawParticles } from './particles';
import { S } from './state';
import { now, rand, sim } from './util';
import { stats } from './stats';

function addTrauma(v: number): void { S.trauma = Math.min(1, S.trauma + v); }
// 每次事件決定自己的震幅；正在震的話取比較大的那個
let shakeHist: { t: number; v: number }[] = [];
export function shakeEvent(t: number, amp: number, vertical: boolean): void {
  if (lite()) return;
  // 防疲勞：10 秒內震太多次，後面的都減半
  const tn = now();
  shakeHist = shakeHist.filter(function (h) { return tn - h.t < 10000; });
  const spent = shakeHist.reduce(function (a, h) { return a + h.v; }, 0);
  shakeHist.push({ t: tn, v: t });
  stats.shake++;
  if (spent > JUICE.shakeBudget) amp *= 0.5;
  const cur = S.trauma * S.trauma * S.traumaScale, next = t * t * amp;
  if (next >= cur) { S.traumaScale = amp; S.traumaVertical = vertical; }
  addTrauma(t);
}

// ============================================================
// 鏡頭與粒子層（requestAnimationFrame）
// ============================================================
let layer: HTMLCanvasElement | null = null, lctx: CanvasRenderingContext2D | null = null, lastKey = '';
/** 鏡頭目前的位移與縮放（除錯用：舊版 window._pvCam） */
export const cam = { x: 0, y: 0, s: 1 };

function ensureLayer(): boolean {
  if (layer) return true;
  if (!document.body) return false;
  layer = document.createElement('canvas');
  layer.id = 'pv-juice-overlay';
  layer.style.cssText = 'position:fixed;pointer-events:none;z-index:46;transform-origin:50% 50%;';
  document.body.appendChild(layer);
  lctx = layer.getContext('2d');
  return true;
}

/**
 * 取得「沒有鏡頭效果時」的畫布位置（svc.baseRect）。
 * 舊版回傳一般物件 { left, top, width, height }；core 的介面要 DOMRect，所以改用 new DOMRect 建立，
 * left／top／width／height 的值完全一樣（另外多了 x、y、right、bottom）。
 */
export function baseRect(gc: Element): DOMRect {
  const r = gc.getBoundingClientRect();
  const w = r.width / cam.s, h = r.height / cam.s;
  const cx = r.left + r.width / 2 - cam.x, cy = r.top + r.height / 2 - cam.y;
  return new DOMRect(cx - w / 2, cy - h / 2, w, h);
}

let lastT = 0;
function frame(): void {
  requestAnimationFrame(frame);
  const tn = now(), dt = Math.min(50, tn - lastT) / 16.67;
  lastT = tn;
  const gc = document.getElementById('game-canvas');
  if (!gc || !ensureLayer() || sim()) return;
  const r = baseRect(gc);
  if (!r.width) return;
  // ensureLayer() 回傳 true 之後 layer 一定已經建好
  const ly = layer as HTMLCanvasElement;

  // 鏡頭：震動（trauma² 讓小震很輕、大震很猛）＋往前衝
  S.trauma = Math.max(0, S.trauma - 0.045 * dt);
  S.zoom = Math.max(0, S.zoom - 0.004 * dt);
  if (S.trauma === 0) S.traumaScale = 0;
  const px2 = r.width / W;
  const shake = S.trauma * S.trauma * S.traumaScale * px2;
  const kick = S.kick;
  const kt = (tn - kick.t0) / 80, kk = kick.t0 > 0 && kt < 1 ? (1 - kt) : 0;
  cam.x = (S.traumaVertical ? 0 : shake * rand(-1, 1)) + kick.x * kk * px2;
  cam.y = shake * rand(-1, 1) + kick.y * kk * px2;
  // 放大到剛好蓋住位移，震動時不會露出畫面外的底色
  // 用震幅的包絡值（不是這一幀的隨機值），縮放才不會每幀亂跳；x 除以寬、y 除以高
  const envX = (S.traumaVertical ? 0 : shake) + Math.abs(kick.x * kk * px2);
  const envY = shake + Math.abs(kick.y * kk * px2);
  const need = Math.max(2 * envX / r.width, 2 * envY / r.height);
  cam.s = 1 + Math.max(S.zoom, need);
  const tf = (cam.x || cam.y || S.zoom) ? 'translate(' + cam.x.toFixed(2) + 'px,' + cam.y.toFixed(2) + 'px) scale(' + cam.s.toFixed(4) + ')' : '';
  gc.style.transformOrigin = '50% 50%';
  gc.style.transform = tf;
  const fxo = document.getElementById('pv-fx-overlay');
  if (fxo) { fxo.style.transformOrigin = '50% 50%'; fxo.style.transform = tf; }
  ly.style.transform = tf;

  const dpr = window.devicePixelRatio || 1;
  const key = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), dpr].join(',');
  if (key !== lastKey) {
    lastKey = key;
    ly.style.left = r.left + 'px'; ly.style.top = r.top + 'px';
    ly.style.width = r.width + 'px'; ly.style.height = r.height + 'px';
    ly.width = Math.round(r.width * dpr); ly.height = Math.round(r.height * dpr);
  }
  // getContext('2d') 在一般瀏覽器不會是 null（舊版也直接用）
  const g = lctx as CanvasRenderingContext2D;
  g.setTransform(ly.width / W, 0, 0, ly.height / H, 0, 0);
  g.clearRect(0, 0, W, H);
  drawParticles(g, tn, dt);
}

/** 舊版在載入時 `lastT = now()`，最後 `requestAnimationFrame(frame)`。 */
export function initClock(): void { lastT = now(); }
export function startFrameLoop(): void { requestAnimationFrame(frame); }
