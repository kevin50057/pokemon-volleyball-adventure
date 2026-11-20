// 統計（給測試用）：實際震了幾次、各級觸發幾次（舊版 window._pvFxStats）
export const stats = { shake: 0, spike1: 0, spike2: 0, down: 0, skill: 0, ult: 0, ultDowngraded: 0, ground: 0, fullFlash: 0 };

/** 擊球事件紀錄（舊版 window._pvJuiceLog），最多 50 筆 */
export const log: { t: number; e: string }[] = [];
