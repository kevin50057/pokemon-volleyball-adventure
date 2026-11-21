/**
 * 遠征面板的小元件和樣式（純排版，不碰存檔）。
 */
import { fmt } from '../../core/i18n';
import { CHARS } from '../characters';
import { face } from './art';
import { diveMult, jumpMult, starterMove } from '../abilities/starters';
import { STATS, activeBonds, capped, cardMods, type Mods } from './cards';
import type { Stat } from './content';
import { BONDS, cardById } from './content';
import { T } from './texts';

export function charName(id: string): string { const c = CHARS.byId[id]; return c ? c.name : id; }
export function nodeName(id: string): string { return T.nodeName[id] || id; }

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
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.setTransform(2, 0, 0, 2, 0, 0);
  return [c, g];
}
function mult(v: number): string { return '×' + v.toFixed(2); }

/** 一張卡。onClick 有給就是可以按的 */
export function cardView(id: string, onClick: (() => unknown) | null, on: boolean): HTMLElement {
  const def = cardById(id), b = el(onClick ? 'button' : 'div', 'pv-exp-card' + (on ? ' on' : ''));
  if (onClick) { (b as HTMLButtonElement).type = 'button'; b.onclick = (e) => { e.stopPropagation(); void onClick(); }; }
  const top = el('div', 'pv-exp-card-top');
  top.appendChild(el('b', '', T.cardName[id] || id));
  if (def && def.tag) top.appendChild(el('span', 'pv-exp-tag ' + def.tag, T.tagName[def.tag]));
  b.appendChild(top);
  if (def && def.mech) { b.classList.add('mech'); b.appendChild(el('div', 'mechdesc', T.cardDesc[id] || '')); }
  if (def) STATS.forEach((k) => { const v = def.mods[k]; if (v !== undefined) b.appendChild(el('div', v >= 1 ? 'up' : 'down', (v >= 1 ? '▲ ' : '▼ ') + T.statName[k] + ' ' + mult(v))); });
  return b;
}

/** 角色本身的倍率（御三家有，其他角色都是 1） */
function charBase(lead: string, k: Stat): number {
  return k === 'move' ? starterMove(lead) : k === 'dive' ? diveMult(lead) : k === 'jump' ? jumpMult(lead) : 1;
}

/** 目前的加成：卡 × 羈絆，乘上角色本身之後做上限，顯示實際生效的倍率（碰到上限會標出來） */
export function bonusView(lead: string, equipped: readonly string[]): HTMLElement {
  const box = el('div', 'pv-exp-bonus'), m: Mods = cardMods(lead, equipped);
  const parts = STATS.filter((k) => m[k] !== 1).map((k) => {
    const b = charBase(lead, k), eff = capped(k, b, m[k]) / b;
    return T.statName[k] + ' ' + mult(eff) + (Math.abs(eff - m[k]) > 0.005 ? T.capNote : '');
  });
  box.appendChild(el('div', '', T.statsNow + '：' + (parts.length ? parts.join('、') : T.none)));
  activeBonds(lead, equipped).forEach((tag) => box.appendChild(el('div', 'pv-exp-tagline ' + tag, '★ ' + fmt(T.bondOn, { tag: T.tagName[tag], stat: T.statName[BONDS[tag].stat], v: BONDS[tag].mult.toFixed(2) }))));
  return box;
}

export const CSS = [
  '#pv-exp{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:14px/1.5 "Noto Sans TC","Noto Sans KR",sans-serif}',
  '#pv-exp .pv-exp-box{background:#1d2140;color:#fff;border:2px solid #7d8cff;border-radius:12px;width:min(580px,96vw);max-height:94vh;overflow:auto;padding:10px 14px;box-shadow:0 10px 30px rgba(0,0,0,.5);box-sizing:border-box}',
  '#pv-exp .pv-exp-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:16px;gap:8px}',
  '#pv-exp .pv-exp-tabs{display:flex;align-items:center;flex:none}',
  '#pv-exp p{margin:6px 0}',
  '#pv-exp .pv-exp-btn{display:inline-flex;align-items:center;gap:6px;margin:4px 6px 4px 0;padding:7px 12px;border:0;border-radius:8px;background:#3a4170;color:#fff;font:inherit;cursor:pointer}',
  '#pv-exp .pv-exp-btn.main{background:#ff7a3d;font-weight:700;padding:9px 18px}',
  '#pv-exp .pv-exp-btn.danger{background:#6b2a3a}',
  '#pv-exp .pv-exp-btn.small{font-size:12px;padding:4px 8px}',
  '#pv-exp .pv-exp-btn.on{outline:2px solid #ffd54f}',
  '#pv-exp .pv-exp-btn.x{background:none;font-size:20px;padding:0 6px;margin-right:0}',
  '#pv-exp .pv-exp-btn.char{padding:4px 8px 4px 4px}',
  '#pv-exp .pv-exp-chars{display:flex;flex-wrap:wrap}',
  '#pv-exp .pv-exp-err{background:#5a1f2b;border-radius:8px;padding:8px;margin-bottom:8px}',
  '#pv-exp .pv-exp-err code{display:block;font-size:11px;opacity:.7;word-break:break-all}',
  '#pv-exp .pv-exp-warn{color:#ffcf6b}',
  '#pv-exp .pv-exp-note{color:#9fe0ff}',
  '#pv-exp .pv-exp-dim{font-size:12px;opacity:.75}',
  '#pv-exp .pv-exp-big{font-size:18px;font-weight:700}',
  '#pv-exp .pv-exp-stage{display:block;width:100%;border-radius:10px;margin-bottom:6px}',
  '#pv-exp .pv-exp-face{image-rendering:pixelated;flex:none}',
  '#pv-exp .pv-exp-face.locked{filter:brightness(0);opacity:.55}',
  '#pv-exp .pv-exp-party{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}',
  '#pv-exp .pv-exp-mate{display:flex;align-items:center;gap:6px;background:#2a3060;border-radius:10px;padding:4px 8px}',
  '#pv-exp .pv-exp-mate.lead{outline:2px solid #ffd54f}',
  '#pv-exp .pv-exp-bench{display:flex;flex-wrap:wrap;align-items:center;gap:2px}',
  '#pv-exp .pv-exp-btn:disabled{opacity:.45;cursor:default}',
  '#pv-exp .pv-exp-tag.fire{background:#ff8a65} #pv-exp .pv-exp-tag.water{background:#4fc3f7}',
  '#pv-exp .pv-exp-tagline.fire{color:#ff8a65} #pv-exp .pv-exp-tagline.water{color:#4fc3f7}',
  '#pv-exp .pv-exp-rule.lowgrav{color:#ff8ad8}',
  '#pv-exp .pv-exp-node{background:#2a3060;border-radius:10px;padding:8px 10px;margin:6px 0;flex:1 1 220px}',
  '#pv-exp .pv-exp-node-head{display:flex;align-items:center;gap:8px}',
  '#pv-exp .pv-exp-fork{display:flex;flex-wrap:wrap;gap:8px}',
  '#pv-exp .pv-exp-cap{font-size:12px;color:#ffe082}',
  '#pv-exp .pv-exp-rule.rain{color:#4fc3f7} #pv-exp .pv-exp-rule.gold{color:#ffd54f} #pv-exp .pv-exp-rule.wind{color:#b2ff59}',
  '#pv-exp .pv-exp-tip{display:flex;align-items:center;gap:8px;background:#fff;color:#1d2140;border-radius:12px;padding:6px 10px;margin:6px 0}',
  '#pv-exp .pv-exp-cards{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}',
  '#pv-exp .pv-exp-card{flex:1 1 150px;text-align:left;background:#2f3568;color:#fff;border:2px solid #4a5296;border-radius:10px;padding:8px 10px;font:inherit}',
  '#pv-exp button.pv-exp-card{cursor:pointer}',
  '#pv-exp .pv-exp-card.on{border-color:#ffd54f;background:#3a3f7a}',
  '#pv-exp .pv-exp-card-top{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:2px}',
  '#pv-exp .pv-exp-card .up{color:#9dffb8} #pv-exp .pv-exp-card .down{color:#ffab91}',
  '#pv-exp .pv-exp-card.mech{border-color:#ff8a3d} #pv-exp .pv-exp-card .mechdesc{font-size:13px;color:#ffe0b2}',
  '#pv-exp .pv-exp-tag{font-size:11px;border-radius:999px;padding:0 7px;color:#1d2140;font-weight:700}',
  '#pv-exp .pv-exp-tag.thunder{background:#ffd54f} #pv-exp .pv-exp-tag.wind{background:#b2ff59}',
  '#pv-exp .pv-exp-tagline.thunder{color:#ffd54f} #pv-exp .pv-exp-tagline.wind{color:#b2ff59}',
  '#pv-exp .pv-exp-bonus{font-size:13px;margin:4px 0}',
  '#pv-exp .pv-exp-journal{margin:6px 0;font-size:13px}',
  '#pv-exp .pv-exp-journal summary{cursor:pointer;color:#9fe0ff}',
  '#pv-exp .pv-exp-dex{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}',
  '#pv-exp .pv-exp-dexcell{background:#2a3060;border-radius:10px;padding:6px;text-align:center;display:flex;flex-direction:column;align-items:center}',
  '#pv-exp .pv-exp-dexcell.have{outline:1px solid #69f0ae}',
  '#pv-exp .pv-exp-stamp{font-size:12px;color:#ffd54f}',
].join('');
