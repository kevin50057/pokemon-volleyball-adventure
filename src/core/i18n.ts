/**
 * 介面語言：繁中（zh）、英文（en）、韓文（ko）。
 *
 * 每種語言是一個獨立的頁面（index.html、en/index.html、ko/index.html），語言由 `<html lang>` 決定，
 * 載入後不會變。文字表的寫法：
 *
 *   const T = pick({ zh: { start: '開始' }, en: { start: 'Start' }, ko: { start: '시작' } });
 *   T.start
 *
 * 只要 zh 那一份有的鍵，en、ko 也一定要有（型別會檢查）。
 */
export type Lang = 'zh' | 'en' | 'ko';

let cached: Lang | null = null;

/** 目前頁面的語言。 */
export function lang(): Lang {
  if (cached) return cached;
  const l = (typeof document !== 'undefined' && document.documentElement.lang || 'zh').slice(0, 2).toLowerCase();
  cached = l === 'en' || l === 'ko' ? l : 'zh';
  return cached;
}

/** 從三種語言的文字表挑出目前語言那一份。 */
export function pick<T>(table: { zh: T; en: T; ko: T }): T {
  return table[lang()];
}

/** 簡單的 {名稱} 代換：`fmt('還差 {n} 分', { n: 3 })`。 */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 各語言頁面的網址（相對於網站根目錄）。 */
export const LANG_PATHS: Record<Lang, string> = { zh: '', en: 'en/', ko: 'ko/' };
