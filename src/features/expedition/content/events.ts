/**
 * 奇遇。heal：回 1 心；cards2／cards3：拿卡（二選一／三選一）；
 * gamble：付 1 顆心，換一次只有機制卡的三選一（只剩 1 顆心時不能選）；
 * trade：丟掉一張自己的卡，換一次三選一（沒有卡時不能選）；leave：直接走
 */
export type EventChoice = 'heal' | 'cards2' | 'cards3' | 'gamble' | 'trade' | 'stone' | 'leave';
export type EventId = 'picnic' | 'trainer' | 'spring' | 'stall' | 'dojo' | 'evoStone';
/** 進化之石：指定隊伍裡的一隻，羈絆值 +2 */
export const STONE_BOND = 2;
/** 每個奇遇的選項（最後一個一定是什麼都不做就走） */
export const EVENTS: Readonly<Record<EventId, readonly EventChoice[]>> = {
  picnic: ['heal', 'cards2', 'leave'],
  trainer: ['cards3', 'leave'],
  spring: ['heal', 'leave'],
  stall: ['gamble', 'leave'],
  dojo: ['trade', 'leave'],
  evoStone: ['stone', 'leave'],
};
export const ALL_EVENTS: readonly EventId[] = ['picnic', 'trainer', 'spring', 'stall', 'dojo'];
/** 第二、三章的奇遇池多了進化之石 */
export const LATE_EVENTS: readonly EventId[] = [...ALL_EVENTS, 'evoStone'];
