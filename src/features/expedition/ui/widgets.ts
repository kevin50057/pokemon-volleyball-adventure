/**
 * 遠征面板的小元件（純排版，不碰存檔）。樣式在 css.ts。
 */
import { fmt } from '../../../core/i18n';
import { diveMult, jumpMult, starterMove } from '../../abilities/starters';
import { STATS, activeBonds, capped, cardMods, type Mods } from '../cards';
import { BONDS, cardById, isFill, type Stat } from '../content';
import { T } from '../texts';
import { face } from './art';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function button(text: string, fn: () => unknown, kind = ''): HTMLButtonElement {
  const b = el('button', 'pv-exp-btn ' + kind, text);
  b.type = 'button';
  b.onclick = (e) => { e.stopPropagation(); void fn(); };
  return b;
}
/** 頭像（複製一份，因為同一個 canvas 不能同時放在兩個地方）。locked：剪影 */
export function portrait(id: string, size: number, locked = false): HTMLElement {
  const src = face(id), c = el('canvas', 'pv-exp-face' + (locked ? ' locked' : ''));
  c.width = c.height = 64; c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d');
  if (g && src) { g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, 64, 64); }
  return c;
}
/** 畫圖用的 canvas：邏輯尺寸 w×h，實際解析度兩倍 */
export function stage(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = el('canvas', 'pv-exp-stage');
  c.width = w * 2; c.height = h * 2; c.style.aspectRatio = w + ' / ' + h;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d is not available');
  g.setTransform(2, 0, 0, 2, 0, 0);
  return [c, g];
}
function mult(v: number): string { return '×' + v.toFixed(2); }

/** 一張卡（或補位的「親密度 +1」「回 1 顆心」）。onClick 有給就是可以按的 */
export function cardView(id: string, onClick: (() => unknown) | null, on: boolean): HTMLElement {
  const def = cardById(id), b = onClick ? el('button', 'pv-exp-card' + (on ? ' on' : '')) : el('div', 'pv-exp-card' + (on ? ' on' : ''));
  if (b instanceof HTMLButtonElement) b.type = 'button';
  if (onClick) b.onclick = (e) => { e.stopPropagation(); void onClick(); };
  const top = el('div', 'pv-exp-card-top');
  top.appendChild(el('b', '', T.cardName[id] || id));
  if (def && def.tag) top.appendChild(el('span', 'pv-exp-tag ' + def.tag, T.tagName[def.tag]));
  if (def && def.passive) top.appendChild(el('span', 'pv-exp-tag passive', T.passiveTag));
  b.appendChild(top);
  if (isFill(id)) { b.classList.add('fill'); b.appendChild(el('div', 'mechdesc', T.cardDesc[id] || '')); }
  else if (def && (def.mech || def.effect)) { b.classList.add('mech'); b.appendChild(el('div', 'mechdesc', T.cardDesc[id] || '')); }
  if (def) STATS.forEach((k) => { const v = def.mods[k]; if (v !== undefined) b.appendChild(el('div', v >= 1 ? 'up' : 'down', (v >= 1 ? '▲ ' : '▼ ') + T.statName[k] + ' ' + mult(v))); });
  return b;
}

/** 角色本身的倍率（御三家有，其他角色都是 1） */
function charBase(lead: string, k: Stat): number {
  return k === 'move' ? starterMove(lead) : k === 'dive' ? diveMult(lead) : k === 'jump' ? jumpMult(lead) : 1;
}

/** 目前的加成：卡 × 羈絆，乘上角色本身之後做上限，顯示實際生效的倍率（碰到上限會標出來）。backup：學習裝置會算進備援的標籤 */
export function bonusView(lead: string, equipped: readonly string[], backup?: string): HTMLElement {
  const box = el('div', 'pv-exp-bonus'), m: Mods = cardMods(lead, equipped, backup);
  const parts = STATS.filter((k) => m[k] !== 1).map((k) => {
    const b = charBase(lead, k), eff = capped(k, b, m[k]) / b;
    return T.statName[k] + ' ' + mult(eff) + (Math.abs(eff - m[k]) > 0.005 ? T.capNote : '');
  });
  box.appendChild(el('div', '', T.statsNow + '：' + (parts.length ? parts.join('、') : T.none)));
  activeBonds(lead, equipped, backup).forEach((tag) => box.appendChild(el('div', 'pv-exp-tagline ' + tag, '★ ' + fmt(T.bondOn, { tag: T.tagName[tag], stat: T.statName[BONDS[tag].stat], v: BONDS[tag].mult.toFixed(2) }))));
  return box;
}
