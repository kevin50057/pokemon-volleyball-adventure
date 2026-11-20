// 打擊感：小工具
import { flags } from '../../core/services';
import { CHARS, type CharDef } from '../characters';

export function now(): number { return performance.now(); }
export function rand(a: number, b: number): number { return a + Math.random() * (b - a); }
export function sim(): boolean { return !!flags.sim; }

/**
 * 舊版在載入時抓 `window.PV_CHARS.byId`；這裡改成呼叫當下才讀 `CHARS.byId`
 * （角色模組先 init，所以結果一樣）。查不到時是 undefined（跟舊版一樣）。
 */
export function charOf(id: string | undefined): CharDef | undefined {
  if (id === undefined) return undefined;
  return CHARS.byId[id];
}
