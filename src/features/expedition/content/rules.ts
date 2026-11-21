/**
 * 場地規則、電腦強度、首領的資料型別與數值。
 * 規則一定先預警：水窪閃 1 秒、黃金球發球前明示、強風和搖籃曲提前 1 秒。
 */

/**
 * rain 水窪、gold 黃金球、wind 強風、lowgrav 搖籃曲（低重力）；第三章：heavy 重力場、stasis 念力停球；
 * gravflip 重力崩壞（只用在超夢第三階段：一輪變重、一輪變輕，交替）
 */
export type RuleId = 'rain' | 'gold' | 'wind' | 'lowgrav' | 'heavy' | 'stasis' | 'gravflip';
export const RULE_CFG = {
  // 水窪：先預警 1 秒才生效；球落在生效的水窪上會彈起來
  rain: { warn: 25, life: 200, every: 125, maxPairs: 2, half: 22, bounce: -15, damp: 0.5 },
  // 黃金球：第 3、7、11… 球，發球前明示，拿下得 2 分
  gold: { every: 4, first: 2, points: 2 },
  // 強風：每 7 秒一輪，3 秒無風、1 秒預警（顯示方向）、3 秒強風（每 10 幀推球 1）
  wind: { period: 175, warnAt: 75, onAt: 100, every: 10 },
  // 搖籃曲（低重力）：每 8 秒一輪，4 秒正常、1 秒預警、3 秒低重力（球每 2 幀少落 1）
  lowgrav: { period: 200, warnAt: 100, onAt: 125 },
  // 重力場：每 8 秒一輪，4 秒正常、1 秒預警（向下的大箭頭）、3 秒變重（球每 2 幀多落 1）
  heavy: { period: 200, warnAt: 100, onAt: 125 },
  // 念力停球：每 9 秒一輪，第 150～174 幀預警（球上的紫環往內收），第 175 幀判定：
  // 球夠高、離雙方都夠遠才停住 20 幀（位置、速度原樣保存，不移動球）；任何一方碰到就立刻解除
  stasis: { period: 225, warnAt: 150, at: 175, hold: 20, minHeight: 200, clear: 56 },
  // 重力崩壞：每 8 秒一輪，75～99 預警、100～174 生效；變重、變輕交替（第一輪變重）
  gravflip: { period: 200, warnAt: 75, onAt: 100, offAt: 175 },
} as const;
/** 岔路的場地規則池（強風留給菁英；null = 沒有規則） */
export const RULE_POOL: readonly (RuleId | null)[] = ['rain', 'gold', 'lowgrav', null];

/**
 * 遠征自己動到球之後的球速上限（卡牌殺球加速）。遊戲本體的角色技能本來就可能超過這個值
 * （實測喵喵 62、可達鴨 56），那是原本的行為，遠征不去改它。
 */
export const MAX_BALL_SPEED = 30;

/** 電腦的強度。move：腳步（1 = 全速）、spike：起跳後會殺球的機率、lapse：球飛過來時慢半拍的機率 */
export interface Diff { move: number; spike: number; lapse: number }
export const LAPSE_FRAMES = 10;

/**
 * 首領的一個階段。首領剩下的血 ≤ atHp 時，在下一球發球前預告並切換到這個階段。
 * 第一個階段的 atHp 等於首領的血量（難度、挑戰加的血都算在第一階段）。
 */
export interface BossPhase {
  /** 對應 texts 的 phaseTitle／phaseNote */
  id: string;
  atHp: number;
  /** 球速係數（只動球，不動全域計時；1 = 不變） */
  ballSpeed?: number;
  /** 這個階段才開的場地機制（每場仍然只有一項） */
  rule?: RuleId;
  /** 場地色調 */
  tint: number;
  /** 背景音樂速度（1 = 原本） */
  bgm?: number;
  /** 超夢念力導向的冷卻（幀）；不寫就是原本的 */
  psyCooldown?: number;
  /** 首領殺球時放出沒有影子的假球（只是畫面，不碰撞、不計分） */
  phantoms?: boolean;
}
/** 首領戰：比分當成血量 */
export interface BossDef {
  playerHp: number;
  hp: number;
  phases: readonly BossPhase[];
}
