// 介面共用：根節點、文字小工具、角色動畫、開關畫面
import { nextZ, svc } from '../../../core/services';
import { CFG } from '../config';
import { CH } from '../chars';

/** 介面的共用狀態（舊版的 root、scr、confirmReset、autoTimer、anims）。build() 之後 root、scr 才有值。 */
export const ui = {
  root: null as HTMLElement | null,
  scr: null as HTMLElement | null,
  confirmReset: false,
  autoTimer: 0,
  anims: [] as HTMLCanvasElement[]
};
/** build() 之後才會呼叫到的地方用（舊版直接用 root／scr，沒有就丟例外）。 */
export function R(): HTMLElement { return ui.root as HTMLElement; }
export function S(): HTMLElement { return ui.scr as HTMLElement; }

export function esc(s: unknown): string { return String(s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[m]; }); }
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16), r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
export function heartsHtml(n: number, broken?: boolean): string {
  let s = '';
  for (let i = 0; i < CFG.hearts; i++) s += i < n ? '♥︎' : (broken && i === n ? '<span class="brk">♥︎</span>' : '<i>♥︎</i>');
  return '<span class="hearts">' + s + '</span>';
}
export function firstLine(desc: string): string {
  const parts = desc.split('。');
  let s = '';
  for (let i = 0; i < parts.length && s.length < 10; i++) if (parts[i]) s += parts[i] + '。';
  return s;
}
export function fmtTime(frames: number): string { const s = Math.round(frames / 25); return Math.floor(s / 60) + ' 分 ' + ('0' + (s % 60)).slice(-2) + ' 秒'; }

// ---------- 角色圖：用現成的動作圖在介面裡播動畫 ----------
// 舊版把動畫狀態掛在 canvas._a 上；這裡改放 WeakMap，行為一樣
interface Anim { id: string; st: number; i: number }
const animOf = new WeakMap<HTMLCanvasElement, Anim>();
export function anim(cv: HTMLCanvasElement): Anim | undefined { return animOf.get(cv); }
const SEQ: Record<number, number[]> = { 0: [0, 1, 2, 3, 4, 3, 2, 1], 5: [0, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4], 6: [0, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4] };
export function paintSp(cv: HTMLCanvasElement): void {
  const a = animOf.get(cv) as Anim, CS = svc.charSelect, seq = SEQ[a.st] || [0];
  if (CS && CS.paintFrame) CS.paintFrame(cv, a.id, a.st, seq[a.i % seq.length]);
}
function sprite(id: string, st: number, cls: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64; cv.className = 'sp ' + (cls || '');
  animOf.set(cv, { id: id, st: st || 0, i: 0 });
  paintSp(cv); ui.anims.push(cv);
  return cv;
}
function still(id: string): HTMLCanvasElement {
  const CS = svc.charSelect;
  if (CS && CS.portrait) return CS.portrait(id, 64);
  return document.createElement('canvas');
}
// 把 <i data-sp="id"> 換成角色圖（data-st：動作，data-c：樣式；data-still：不播動畫）
export function fill(el: ParentNode): void {
  el.querySelectorAll('[data-sp]').forEach(function (e) {
    const id = e.getAttribute('data-sp') as string;
    if (!CH.byId[id]) return;
    const cv = e.hasAttribute('data-still') ? still(id) : sprite(id, Number(e.getAttribute('data-st')) || 0, e.getAttribute('data-c') || '');
    if (e.hasAttribute('data-still') && e.getAttribute('data-c')) cv.className = e.getAttribute('data-c') as string;
    e.appendChild(cv);
  });
}
/** 每 115ms 推進一格動畫（init 裡的 setInterval 呼叫） */
export function stepAnims(): void {
  if (!ui.anims.length) return;
  ui.anims = ui.anims.filter(function (cv) { return cv.isConnected; });
  ui.anims.forEach(function (cv) { (animOf.get(cv) as Anim).i++; paintSp(cv); });
}

export function openRoot(): void {
  const root = R();
  root.classList.remove('fade');
  root.style.zIndex = String(nextZ());
  root.classList.add('open');
  document.querySelectorAll('.dropdown.show,.submenu.show').forEach(function (d) { d.classList.remove('show'); });
  document.querySelectorAll('.dropdown-btn.open,.submenu-btn.open').forEach(function (d) { d.classList.remove('open'); });
}
export function hide(fade?: boolean): void {
  const root = ui.root;
  if (!root) return;
  clearTimeout(ui.autoTimer);
  if (fade && isOpen()) { root.classList.add('fade'); setTimeout(function () { if (root.classList.contains('fade')) { root.classList.remove('open', 'fade'); S().innerHTML = ''; } }, 260); }
  else { root.classList.remove('open', 'fade'); S().innerHTML = ''; }
}
export function isOpen(): boolean { return !!(ui.root && ui.root.classList.contains('open') && !ui.root.classList.contains('fade')); }
