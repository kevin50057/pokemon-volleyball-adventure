/**
 * 從 sprite sheet 切出每個角色的第一格當頭像（選角面板、闖關模式的動畫都用這裡）。
 */
import { IMAGES_URL } from '../../../core/config';
import { charIds } from '../chars-view';

interface Rect { x: number; y: number; w: number; h: number }
interface SheetFrame { frame: Rect }
/** TexturePacker 匯出的 sprite sheet JSON（只取用到的欄位）。 */
interface SheetJson { frames: Record<string, SheetFrame | undefined>; meta: { image: string } }
interface PortraitEntry { img: HTMLImageElement; frame: Rect; frames: SheetJson['frames'] }

// ---------- 從 sprite sheet 切出每個角色的第一格當頭像 ----------
const portraits: Record<string, PortraitEntry | undefined> = {};   // id -> {img, frame}
const waiting: Array<() => void> = [];

function sheetFor(id: string): string { return id === 'pikachu' ? 'sprite_sheet' : id + '_sheet'; }

export function loadPortraits(): void {
  const sheets: Record<string, boolean> = {};
  charIds().forEach((id) => { sheets[sheetFor(id)] = true; });
  Object.keys(sheets).forEach((name) => {
    fetch(IMAGES_URL + name + '.json').then((r) => r.json() as Promise<SheetJson>).then((json) => {
      const img = new Image();
      img.onload = function () {
        charIds().forEach((id) => {
          if (sheetFor(id) !== name) return;
          const f = json.frames[id + '/' + id + '_0_0.png'];
          if (f) portraits[id] = { img: img, frame: f.frame, frames: json.frames };
        });
        waiting.slice().forEach((fn) => { fn(); });
      };
      img.src = IMAGES_URL + json.meta.image;
    }).catch(() => {});
  });
}

/** canvas.getContext('2d') 在這裡一定拿得到（新建的一般 canvas）。 */
function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d') as CanvasRenderingContext2D;
}

export function paint(canvas: HTMLCanvasElement, id: string): boolean {
  const p = portraits[id];
  const g = ctx2d(canvas);
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!p) return false;
  const f = p.frame, s = Math.min(canvas.width / f.w, canvas.height / f.h);
  g.imageSmoothingEnabled = s < 1;   // 高解析貼圖（閃電鳥 96px）縮小時要平滑，像素圖放大時保持銳利
  g.drawImage(p.img, f.x, f.y, f.w, f.h,
    (canvas.width - f.w * s) / 2, (canvas.height - f.h * s) / 2, f.w * s, f.h * s);
  return true;
}

// 畫某個動作的某一格（闖關模式的動畫用）；那一格不存在就畫頭像
export function paintFrame(canvas: HTMLCanvasElement, id: string, st: number, fr: number): boolean {
  const p = portraits[id], e = p && p.frames && p.frames[id + '/' + id + '_' + st + '_' + fr + '.png'];
  if (!p || !e) return paint(canvas, id);
  const f = e.frame, g = ctx2d(canvas), s = Math.min(canvas.width / f.w, canvas.height / f.h);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = s < 1;
  g.drawImage(p.img, f.x, f.y, f.w, f.h, (canvas.width - f.w * s) / 2, (canvas.height - f.h * s) / 2, f.w * s, f.h * s);
  return true;
}

export function portrait(id: string, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.dataset.id = id;
  // dataset.id 一定有值（上一行剛設），`?? ''` 只是讓型別成立
  if (!paint(c, id)) waiting.push(() => { paint(c, c.dataset.id ?? ''); });
  return c;
}
