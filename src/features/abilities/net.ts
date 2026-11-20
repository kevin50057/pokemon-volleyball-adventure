// 連線對戰：主機把技能狀態傳給客機，客機只負責畫
// 訊息形狀 { s, pb, b, f } 與 slim／clean／mergeSide 的規則要跟經典版完全相同（互連與安全性都靠它）。
import type { Controller } from '../../core/types';
import { draw } from './overlay';
import { newSide, rt } from './state';
import type { AbilitySide, Burst, Flash } from './state';

type Dict = Record<string, unknown>;

function rnd(v: unknown): unknown { return typeof v === 'number' ? Math.round(v * 10) / 10 : v; }
function slim(o: unknown, depth: number): unknown {
  if (o === null || typeof o !== 'object') return rnd(o);
  if (depth > 4) return null;
  if (Array.isArray(o)) return o.map(function (v) { return slim(v, depth + 1); });
  const src = o as Dict;   // 一般物件（上面已經排除 null 與陣列）
  const r: Dict = {};
  for (const k in src) {
    const v = src[k];
    if (typeof v === 'function' || v === undefined || v === false || v === 0 || v === '') continue;
    if (v && typeof v === 'object' && ((v as Dict).isPlayer2 !== undefined || (v as Dict).sprite)) continue;   // 不傳物件參照
    r[k] = slim(v, depth + 1);
  }
  return r;
}
function clean(v: unknown, depth: number): unknown {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length <= 40 ? v : '';
  if (!v || typeof v !== 'object' || depth > 4) return undefined;
  if (Array.isArray(v)) {
    const arr: unknown[] = [];
    for (let i = 0; i < v.length && i < 32; i++) {
      const x = clean(v[i], depth + 1);
      if (typeof x === 'number' || (x && typeof x === 'object' && !Array.isArray(x))) arr.push(x);
    }
    return arr;
  }
  const src = v as Dict;
  const r: Dict = Object.create(null);
  Object.keys(src).forEach(function (k) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
    const x = clean(src[k], depth + 1);
    if (x !== undefined) r[k] = x;
  });
  const out: Dict = {};
  Object.keys(r).forEach(function (k) { out[k] = r[k]; });
  return out;
}
function mergeSide(o: unknown): AbilitySide {
  const d = newSide();
  if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
  const src = o as Dict;
  Object.keys(src).forEach(function (k) {
    // 型別要跟本機預設一致（預設是陣列就只收陣列…），預設沒有的鍵照收
    if (k in d && d[k] !== null && typeof d[k] === 'object' && Array.isArray(d[k]) !== Array.isArray(src[k])) return;
    if (k in d && typeof d[k] === 'number' && typeof src[k] !== 'number') return;
    d[k] = src[k];
  });
  return d;
}
function objList<T>(v: unknown): T[] {
  const a = clean(v, 1);
  if (!Array.isArray(a)) return [];
  // 跟舊版一樣只檢查到「是物件、而且有數字的 x／alpha／t」，其餘欄位交給 draw 自己處理
  return a.filter(function (x) {
    return x && typeof x === 'object' && typeof (x as Dict).x === 'number' ||
      x && typeof x === 'object' && typeof (x as Dict).alpha === 'number' ||
      x && typeof x === 'object' && typeof (x as Dict).t === 'number';
  }) as T[];
}

export const net = {
  get(): unknown {
    return { s: slim(rt.state, 0), pb: rt.psyBall ? rt.psyBall.owner : 0, b: slim(rt.fx.bursts, 0), f: slim(rt.fx.flashes, 0) };
  },
  set(o: unknown): void {
    // 資料來自另一台電腦（不可信）：只留數字、布林、短字串、陣列、物件，陣列裡只留物件或數字，
    // 而且一律接在全新的空物件上，避免 __proto__ 之類的鍵污染或形狀不對讓 draw 當掉
    if (!o || typeof o !== 'object') return;
    const m = o as Dict;
    const ss: Dict = m.s && typeof m.s === 'object' ? m.s as Dict : {};
    rt.state = { p1: mergeSide(clean(ss.p1, 0)), p2: mergeSide(clean(ss.p2, 0)) };
    rt.psyBall = m.pb === 'p1' || m.pb === 'p2' ? { owner: m.pb } : null;
    rt.fx.bursts = objList<Burst>(m.b); rt.fx.flashes = objList<Flash>(m.f);
  },
  draw(ctrl: Controller): void { draw(ctrl, false); },
  clear(ctrl: Controller): void { draw(ctrl, true); },
};
