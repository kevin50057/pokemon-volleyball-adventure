/**
 * 遠征的面板（開發版）。
 *
 *   state.ts       畫面上的狀態、讀狀態的小工具、畫面層的進入點（view）
 *   actions.ts     所有會改存檔的操作（guard：錯誤一律顯示）
 *   names.ts       角色、站、這一輪的名字
 *   render.ts      組版：標題列、分頁、錯誤、讀檔狀態
 *   run-view.ts    進行中的一輪（三選一、岔路、奇遇、補給站、開打）與打完之後
 *   party.ts       隊伍、親密度、進化之力說明
 *   node-card.ts   比賽站的卡片、藏起來的岔路、夥伴的一句話、日誌
 *   chooser.ts     開新的一輪（模式、難度、挑戰規則、夥伴）
 *   daily.ts       每日遠征
 *   collection.ts  圖鑑、訓練家手冊
 *   stage-view.ts  地圖、收服與覺醒演出、明信片的畫布
 *   art.ts         用程式畫的圖
 *   widgets.ts     小元件；css.ts 樣式
 *   shell.ts       掛到頁面上、開關、動畫迴圈、除錯介面
 */
export { debug, mount, show } from './shell';
