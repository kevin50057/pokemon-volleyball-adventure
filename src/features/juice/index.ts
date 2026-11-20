// 打擊感（舊版 juice.js）：頓幀、畫面震動與鏡頭衝擊、球與角色的壓扁伸展、火花與塵土、合成衝擊音
// 依賴：角色資料（../characters）、技能系統（必須先 init：它的 tick／drawBall 層在裡面，svc.abilities 由它提供）
//
// 檔案分工：
//   config.ts        可調整的數值（JUICE）與場地常數
//   state.ts         各檔共用的狀態
//   stats.ts         測試用統計與擊球紀錄
//   lite-mode.ts     特效完整／精簡（存檔 'pv-fx-lite'、選項選單的按鈕）
//   hitstop.ts       擊球停格（hooks.tick 那層）、連線客機的 guestTick
//   events.ts        擊球／落地／得分偵測、技能與必殺分級、svc.fxEvent
//   particles.ts     火花、塵土、速度線與它們的繪製
//   camera.ts        震動、鏡頭頓挫與衝擊、疊在遊戲畫面上的粒子層（requestAnimationFrame）、svc.baseRect
//   sprites.ts       球與角色的壓扁伸展、閃電鳥縮小、計分板彈跳、電光一閃殘影、暴鯉龍換圖
//   sfx.ts           合成音效（Web Audio）、原版殺球音效壓低、必殺時壓低背景音樂
//   offline-audio.ts 試玩台的離線算音
import { hooks } from '../../core/hooks';
import { svc } from '../../core/services';
import { baseRect, cam, initClock, startFrameLoop } from './camera';
import { JUICE } from './config';
import { detect, fxEvent } from './events';
import { guestTick, tickLayer } from './hitstop';
import { addLiteToggle, initLite, lite } from './lite-mode';
import { renderAudio } from './offline-audio';
import { installAudioUnlock, sfxLog } from './sfx';
import { applySprites, loadGyaradosImages } from './sprites';
import { S } from './state';
import { log, stats } from './stats';
import { sim } from './util';

/** 除錯／試玩台用（main.ts 會掛到 window.PVA）。對應舊版的 window 全域： */
export const debug = {
  /** window._pvFxStats：實際震了幾次、各級觸發幾次 */
  fxStats: stats,
  /** window._pvSfxLog：合成音紀錄 */
  sfxLog,
  /** window._pvJuiceLog：擊球／落地紀錄 */
  juiceLog: log,
  /** window._pvRenderAudio：離線混音成 WAV（base64） */
  renderAudio,
  /** window._pvJuice：可調整的數值（可以直接改） */
  juice: JUICE,
  /** window._pvCam：鏡頭目前的位移與縮放 */
  cam,
};

export function init(): void {
  // ---------- 特效：完整／精簡 ----------
  initLite();
  svc.fxLite = lite;

  // ---------- 事件偵測與頓幀（包在技能系統的 tick 外面） ----------
  hooks.tick.use(tickLayer);

  // ---------- 精靈的壓扁伸展（包在技能系統的 drawBall 外面；先畫裡面那層） ----------
  hooks.drawBall.use(function (next, view, physics) {
    next(view, physics);
    if (sim()) return;
    // 在物理算完、畫面畫出之前偵測，特效和合成音跟原本的擊球音效同一幀
    const c = S.ctrlRef;
    if (c && c.state !== c.intro && c.state !== c.menu) detect(c);
    applySprites(view, physics);
  });

  // ---------- 鏡頭 ----------
  svc.baseRect = baseRect;
  initClock();

  // ---------- 合成音：第一次按鍵或觸控才 resume ----------
  installAudioUnlock();

  // ---------- 暴鯉龍的圖 ----------
  loadGyaradosImages();

  // ---------- 技能事件 ----------
  svc.fxEvent = fxEvent;

  // ---------- 選項選單：特效 完整／精簡 ----------
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLiteToggle); else addLiteToggle();

  startFrameLoop();
  // 連線對戰的客機不跑物理，只靠這個讓頓幀倒數、殺球回彈照常進行
  svc.juiceNet = { guestTick };
}
