// ---------- 可調整的數值 ----------
// 平衡數值都集中在這裡。目前的值是用電腦對電腦模擬（20 隻角色兩兩對打）調出來的，
// 每隻對一般對手的勝率大約落在 40%～60%。改數值後建議重跑模擬確認。
// 這個物件會原封不動地放進 svc.abilities.tuning，其他功能（例如闖關的場地規則）可以暫時改它。
export const TUNING = {
  // 喵喵
  meowthDoubleChance: 0.15,   // 得分算 2 分的機率
  meowthMaxCoins: 2,          // 場上最多幾枚金幣
  coinRadius: 26,             // 金幣的判定範圍
  coinSlow: 25,               // 踩到金幣後移動速度減半幾幀（25 幀 ≈ 1 秒）
  coinStun: 10,               // coinSlow 設 0 時改成定身幾幀
  // 水伊布
  puddleMax: 3, puddleLife: 50,
  vaporeonAIDash: 110,        // 電腦離落點多遠才考慮衝刺
  vaporeonAIDashChance: 0.05, // 每幀衝刺的機率（太常衝刺會強到不平衡）
  // 火伊布／耿鬼：在這個引擎裡「球更快」反而容易出界，所以改成「往下砸」
  fireSmash: 1.0, fireDown: 4,
  // 火伊布：灼傷幾幀（50 = 2 秒）、灼傷時殺球剩幾成力、引火持續幾幀、大字爆的最大球速、大字爆的灼傷幾幀
  burnFrames: 50, burnWeak: 0.7, flashFireFrames: 75, fireBlastVx: 26, fireBlastBurn: 90,
  // 大蔥鴨：大蔥揮擊打得到多遠（一般角色的判定是 32）、居合斬的最大球速
  leekReachX: 54, leekReachY: 44, iaiVx: 28, leekAI: 0.5,
  shadowBall: 1.0, shadowDown: 3,
  // 超夢
  psychicDrop: 15, psychicReverse: 1.0, psychicAim: 0.65, psychicCooldown: 150, mewtwoSpeed: 2,  // 超夢是 Boss，目標勝率約 65%～70%
  // 卡比獸
  bellyBounce: 22, bellyPush: 0,
  // 果然翁
  wobbuffetSpike: 1.0, counterPower: 2, wobbuffetAISpike: 0, counterLaunch: 18, counterMaxVx: 28,
  // 魔牆人偶
  barrierFrames: 35, barrierCooldown: 100, barrierSoftVx: 5, barrierPierce: 0.55,
  // 胖丁
  jigglyJump: 0, jigglyFloat: 0.4,
  // 快龍
  outrageFrames: 75, outrageSpeed: 1, outrageDown: 4, outrageDrift: 0, outragePower: 1, outrageConfuse: 25,
  // 皮卡丘
  staticChance: 0.55, staticStun: 20,  // 麻痺機率、麻痺幾幀（20 幀 = 0.8 秒）
  // 雷伊布：電光一閃（距離、花幾幀閃完、冷卻、閃完後幾幀內殺球會強化、強化殺球的最大球速）
  joltSpeed: 1, qaDistance: 72, qaFrames: 2, qaCooldown: 60, qaWindow: 10, qaSpikeVx: 28, qaAI: 1,
  // 可達鴨：頭痛爆發（幾層觸發、讓對手頭暈幾幀、走路跌倒機率）
  headacheMaxVx: 30, headacheNeed: 3, headacheStun: 7, psyTrip: 0.1,
  // 閃電鳥：同一跳拍翅幾次後殺球變成雷擊俯衝
  birdChargeFlaps: 3, birdMaxVx: 26,
  // 閃電鳥的圖是 96px（其他角色 64px），場上縮成這個倍數，腳底位置不變（特效系統套用）
  birdScale: 0.82,
  // 胖丁：空中按下的快速落地加速、唱歌顛倒幾幀（100 幀 = 4 秒）
  jigglyFastFall: 3, singFrames: 100,
  // 鯉魚王
  magikarpEvolveChance: 0.07, magikarpSlow: 2, magikarpReceiveEvolve: 0.15,
  gyaradosVx: 24,
  // 紅色暴鯉龍：每次進化有幾 % 是紅色的、撐幾幀（150 = 6 秒）、球速上限、威嚇（對手定身幾幀）
  redGyaradosChance: 0.1, redGyaradosFrames: 150, redGyaradosVx: 30, redGyaradosStun: 10,
  // 夢幻
  mewShieldCD: 500, mewTeleport: 110, mewTeleportCD: 150, mewTeleportAI: 0.005, mewLift: 15, mewChargeFrames: 45, mewBlastVx: 28,
  // 關都御三家（一階，以皮卡丘為 1）
  // 小火龍：走路倍率、撲救距離倍率、「網前」的範圍（離網幾 px 以內，半場寬 216 的 1/3）、網前殺球的球速倍率
  charmanderMove: 1.03, charmanderDive: 1.10, charmanderNetZone: 72, charmanderNetSpike: 1.08,
  // 妙蛙種子：走路、跳躍高度倍率、擊球判定左右加寬幾 px、飛葉過網時水平速度減多少、過網後每幾幀多加 1 重力
  bulbasaurMove: 0.95, bulbasaurJump: 0.95, bulbasaurReach: 5, leafDrag: 1, leafGravEvery: 3,
  // 傑尼龜：走路、跳躍高度、殺球球速、撲救距離倍率、倒地少躺幾幀、硬殼（1 開 0 關）
  squirtleMove: 1.05, squirtleJump: 0.92, squirtleSpike: 0.95, squirtleDive: 1.15, squirtleGetup: 2, squirtleShell: 1,
  // 電腦防卡死：球在自己場上超過幾幀就強制起跳殺球
  antiStall: 100,
};

export type Tuning = typeof TUNING;
