/** 疊在遊戲畫面上的透明 canvas（場上的提示、血條、光環都畫在這裡，用遊戲座標）。 */
import { flags, svc } from '../../../core/services';
import { H, W } from './geom';

const S = { canvas: null as HTMLCanvasElement | null, ctx: null as CanvasRenderingContext2D | null, rect: '' };
if (typeof window !== 'undefined') window.addEventListener('resize', () => { S.rect = ''; });

/** 對齊遊戲畫面，回傳可以畫的 context（模擬模式、畫面還沒好時回 null） */
export function hudContext(): CanvasRenderingContext2D | null {
  if (flags.sim) return null;
  const gc = document.getElementById('game-canvas');
  if (!(gc instanceof HTMLCanvasElement) || !document.body) return null;
  if (!S.canvas) {
    S.canvas = document.createElement('canvas');
    S.canvas.id = 'pv-exp-hud';
    S.canvas.style.cssText = 'position:fixed;pointer-events:none;z-index:46;';
    document.body.appendChild(S.canvas);
    S.ctx = S.canvas.getContext('2d');
  }
  const cv = S.canvas, g = S.ctx;
  const r = svc.baseRect ? svc.baseRect(gc) : gc.getBoundingClientRect();
  if (!r.width || !r.height || !g) return null;
  const dpr = window.devicePixelRatio || 1, key = [r.left, r.top, r.width, r.height, dpr].join(',');
  if (key !== S.rect) {
    S.rect = key;
    cv.style.left = r.left + 'px'; cv.style.top = r.top + 'px';
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }
  g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  return g;
}

export function clearHud(): void {
  const cv = S.canvas, g = S.ctx;
  if (cv && g) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); }
}
