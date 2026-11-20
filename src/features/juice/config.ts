// 打擊感：可調整的數值與固定常數（舊版 juice.js 開頭）

export const W = 432, H = 304, GROUND_BALL_Y = 252, GROUND_Y = 244, FLOOR_Y = 270;

// ---------- 可調整 ----------
// 不加 as const：試玩台／除錯時會從 debug.juice 直接改數值（舊版 window._pvJuice）
export const JUICE = {
  hitStopBySpeed: [[24, 3], [18, 2], [0, 1]] as number[][], // 殺球頓幀：球速 ≥24 停 3 幀、≥18 停 2 幀、其他 1 幀（1 幀 = 40ms）
  hitStopGround: 0,     // 球落地得分：遊戲本體得分後本來就有慢動作（每幀 200ms），再頓幀會變成凍結 1 秒
  hitStopFinal: 0,      // 決勝分
  stopCooldown: 500,    // 這段時間內已經頓過，下一次殺球只停 1 幀、落地只停 3 幀（毫秒）
  shakeSpike: 3,        // 重擊／技能殺球的震動強度（遊戲座標的像素）；一般殺球不震
  shakeGround: 3.5,     // 落地只上下震
  kickSpike: 1.5,       // 殺球時鏡頭往球飛的方向頓一下
  zoomSpike: 0.008,     // 鏡頭往前衝的比例
  zoomGround: 0.015,
  sparks: 16,           // 殺球火花數量
  shakeDown: 1.6,       // 往下砸的殺球：輕震（上下）
  shakeSkill: 1.5,      // 技能級（L3）
  shakeUlt: 4,          // 必殺（L4）
  kickUlt: 2.5,
  zoomUlt: 0.02,
  ultCooldown: 45000,   // 同一位玩家的必殺冷卻；冷卻中降成技能級（毫秒）
  ultGlobal: 20000,     // 兩位玩家合計：必殺之間至少隔這麼久
  skillShakeCD: 8000,   // 同一位玩家技能級的震動冷卻：冷卻中只有光環和音效、不震
  shakeBudget: 2.0,     // 10 秒內震動累計超過這個量，之後的震動減半
  sound: 1.0,           // 合成衝擊音的音量（0 = 關閉）
  powerHitSample: 0.5,  // 原版殺球音效的音量倍率（1 = 原本大小）
};

// ---------- 特效：完整／精簡 ----------
export const LITE_KEY = 'pv-fx-lite';
