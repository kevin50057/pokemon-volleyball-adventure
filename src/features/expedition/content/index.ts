/**
 * 遠征的內容（全部是資料，不含規則）：
 *   basics.ts    心、隊伍、卡槽上限、起始夥伴、收服率
 *   rules.ts     場地規則、電腦強度、首領的型別與數值
 *   events.ts    奇遇
 *   nodes.ts     路線節點的型別
 *   chapter1.ts、chapter2.ts…  每一章的節點與站
 *   chapters.ts  章節總表、節點查詢、圖鑑位置
 *   cards.ts     卡牌與羈絆
 *   ranks.ts     難度等級
 * 改了這個資料夾裡的任何東西要換 ../types.ts 的 CONTENT_VERSION。
 */
export * from './basics';
export * from './rules';
export * from './events';
export * from './nodes';
export * from './chapters';
export * from './cards';
export * from './ranks';
export * from './awaken';
export * from './evolve';
export * from './challenges';
export * from './goals';
