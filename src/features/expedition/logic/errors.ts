/** 規則違反（舊的 revision、不對的階段、不是這一場、不合法的輸入）。存檔層照樣丟出去，由畫面決定怎麼顯示。 */
export class RuleError extends Error {
  constructor(public code: 'stale' | 'phase' | 'mismatch' | 'invalid', message: string) { super(message); }
}
