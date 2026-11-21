/**
 * 遠征的規則（純函式，不碰 IndexedDB、DOM、遊戲本體）。db.ts 在 transaction 裡呼叫這些。
 *
 * 規則（SPEC §2、§4、§5）：
 *  - 開打前先把 matchId 寫進存檔（phase → active）。
 *  - 重整、離開、被系統回收：phase 還是 active，回來從這一場的開頭重打，不扣心、matchId 不變。
 *  - 只有分出勝負，或明確按「放棄本場」，才結算一次：輸了（或放棄）扣 1 心。
 *  - 同一個 matchId 只會結算一次。收服、三選一的內容都在結算那一筆決定，由種子決定，重整刷不出別的結果。
 *  - 有三選一時先進 reward：選一個或主動略過才回地圖；reward 不能重開已經結算的比賽。
 *  - 章節制（預設）：心用完回到這一章的開頭（快照，含羈絆與覺醒），心回滿；永久收服不收回。一命到底：心用完整輪結束。
 *  - 打倒一章的首領：有下一章就從下一章開頭開始（心回滿、記新的快照），沒有就整輪通關（印章、難度、挑戰徽章）。
 *  - 首領戰輸了：記下打到過的最高階段，章節重來之前重打從那裡開始。
 *
 * 檔案分工：
 *   errors      RuleError
 *   run         建立一輪、共用小工具
 *   derived     由 run／profile 推出來的值（卡槽、心的上限、夢幻的門）
 *   bond        羈絆值與覺醒
 *   map         地圖上的操作（入場、岔路、補給、換人）
 *   events      奇遇
 *   rewards     三選一（含補位）與選獎勵
 *   settle      結算
 *   match-setup 開打前的設定（難度、挑戰、首領階段）
 *   goals       訓練家手冊
 *   daily       每日遠征
 *   validate    讀檔檢查
 */
export * from './errors';
export * from './run';
export * from './derived';
export * from './bond';
export * from './map';
export * from './events';
export * from './rewards';
export * from './settle';
export * from './match-setup';
export * from './goals';
export * from './daily';
export * from './validate';
