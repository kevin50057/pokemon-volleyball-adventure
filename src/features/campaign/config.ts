// 闖關模式「冠軍之路」：可調整的數值、關卡表、場地規則的說明文字
// （舊版 campaign.js 開頭那一段；數值全部照抄）

export const KEY = 'pv-campaign-v1';
export const W = 432, H = 304, NET_X = 216, FLOOR_Y = 270;

export interface Zone {
  name: string;
  /** 場地染色（魔王關沒有，由超夢各階段決定） */
  tint?: number;
  /** 過關分數（魔王關沒有，看超夢的血） */
  score?: number;
  fixed?: string[];
  pool?: string[];
  draw?: number;
  last?: string;
  boss?: boolean;
  c1: string;
  c2: string;
}
/** 電腦的強度。move：腳步（1 = 全速）、spike：起跳後會殺球的機率、lapse：球飛過來時慢半拍的機率 */
export interface Diff { move: number; spike: number; lapse: number }

// ============================================================
// 可調整的數值（關卡、強度、魔王、演出長度）都集中在這裡
// ============================================================
export const CFG = {
  hearts: 3,
  starters: ['pikachu', 'vaporeon', 'flareon', 'jolteon', 'charmander', 'bulbasaur', 'squirtle'],
  zones: [
    { name: '新手草原', tint: 0xFFFFFF, score: 5, fixed: ['magikarp', 'psyduck', 'snorlax'], c1: '#49b36a', c2: '#2a7350' },
    { name: '道館連戰', tint: 0xFFC79E, score: 5, pool: ['dugtrio', 'jigglypuff', 'wobbuffet', 'mrmime', 'meowth'], draw: 3, c1: '#e6933f', c2: '#a8502c' },
    { name: '強敵之塔', tint: 0x7F8EDC, score: 7, pool: ['farfetchd', 'gengar', 'electrode', 'bird'], draw: 2, last: 'dragonite', c1: '#4a61c9', c2: '#272f78' },
    { name: '最終戰', boss: true, c1: '#8a47d6', c2: '#3d1766' }
  ] as Zone[],
  // 第 1～10 關電腦的強度。move：腳步（1 = 全速）、spike：起跳後會殺球的機率、lapse：球飛過來時慢半拍的機率
  diff: [
    { move: 0.50, spike: 0.20, lapse: 0.60 },
    { move: 0.60, spike: 0.35, lapse: 0.50 },
    { move: 0.70, spike: 0.45, lapse: 0.40 },
    { move: 0.78, spike: 0.55, lapse: 0.35 },
    { move: 0.84, spike: 0.65, lapse: 0.30 },
    { move: 0.90, spike: 0.72, lapse: 0.25 },
    { move: 0.94, spike: 0.80, lapse: 0.18 },
    { move: 0.97, spike: 0.88, lapse: 0.12 },
    { move: 1.00, spike: 0.95, lapse: 0.06 },
    { move: 1.00, spike: 1.00, lapse: 0.00 }
  ] as Diff[],
  lapseFrames: 10,
  autoVs: 5000,                    // 贏了接下一關：VS 畫面停幾毫秒後自動開打（點一下畫面可取消）
  startFrames: 45,                 // 闖關時每場開場的幀數（遊戲本體原本是 71；VS 畫面已經演過一次開場了）
  // 分出勝負那一球的演出（幀）：stop 停格、之後打飛對手；hold 到了就進結算；skipAfter 之後按殺球鍵可跳過
  ko: { stop: 8, winHold: 42, loseHold: 30, bossBoom: 34, bossHold: 84, skipAfter: 20, bossSkipAfter: 64 },
  // 場地規則（跟著對手走；教學關和超夢不套用）
  rules: {
    react: 8,                                   // AI 看到預警後幾幀才開始照規則判斷（玩家也大約要這麼久）
    rain: { warn: 25, life: 200, every: 125, maxPairs: 2, half: 22, bounce: -15, damp: 0.5 },
    lowgrav: { period: 200, warnAt: 100, onAt: 125 },          // 每 8 秒：4 秒正常、1 秒預警、3 秒低重力
    gold: { every: 4, first: 2, points: 2 },                    // 第 3、7、11… 球是黃金球
    wind: { period: 175, warnAt: 75, onAt: 100, every: 10 }     // 每 7 秒：3 秒無風、1 秒預警、3 秒強風（每 10 幀推球 1）
  },
  fullAcquire: 2,                  // 前幾次收服播完整版，之後播短版（超夢、百變怪、夢幻一律完整版）
  boss: {
    hp: 9, playerHp: 5, perPhase: 3,
    cooldown: [150, 100, 70],      // 各階段念力導向的冷卻（幀）
    speedEvery: [0, 0, 7],         // 第三階段：每幾幀多跑一幀（7 ≈ 全場快 14%）
    bgm: [1, 1.1, 1.22],           // 背景音樂播放速度
    tint: [0xB9A4EA, 0x6B50AA, 0x8E3C70],
    cutFrames: 50, cutMid: 25
  }
};

// 各區第一關的索引、總關數（模組載入時算好；只是純計算，沒有副作用）
export const ZONE_START: number[] = [];
export let STAGES = 0;
CFG.zones.forEach(function (z) {
  ZONE_START.push(STAGES);
  STAGES += z.boss ? 1 : (z.fixed ? z.fixed.length : 0) + (z.draw || 0) + (z.last ? 1 : 0);
});
export function zoneIdx(i: number): number { let z = 0; for (let k = 0; k < ZONE_START.length; k++) if (i >= ZONE_START[k]) z = k; return z; }
export function zoneOf(i: number): Zone { return CFG.zones[zoneIdx(i)]; }

// 獎章分三級：金＝一場都沒輸、銀＝只輸 1 場、銅＝通關
export interface TierInfo { name: string; color: string }
export const TIER: ReadonlyArray<TierInfo | null> = [null, { name: '銅', color: '#D08A4A' }, { name: '銀', color: '#D5DEE6' }, { name: '金', color: '#FFD54F' }];
/** tierOf() 只會回傳 1～3，所以一定有值（TIER[0] 是佔位的 null）。 */
export function tierInfo(t: number): TierInfo { return TIER[t] as TierInfo; }
export function tierOf(lost: number): number { return lost <= 0 ? 3 : lost <= 1 ? 2 : 1; }

// ============================================================
// 場地規則：跟著對手走，兩邊一視同仁，會改變球路的事件一定先預警
// ============================================================
export type RuleId = 'rain' | 'lowgrav' | 'gold' | 'wind';
export interface RuleDef { opp: string; name: string; color: string; short: string; desc: string }
export const RULES: Record<RuleId, RuleDef> = {
  rain: { opp: 'psyduck', name: '雨天水窪', color: '#4FC3F7', short: '球落在水窪上會彈起來（兩邊都一樣）',
    desc: '場上會出現成對的水窪，淡淡出現 1 秒後才有效。球落在水窪上會彈起來，兩邊都一樣。' },
  lowgrav: { opp: 'jigglypuff', name: '搖籃曲', color: '#FF8AD8', short: '每 8 秒有 3 秒低重力，球會飄',
    desc: '每 8 秒有 3 秒重力減半，球飛得慢、飄得高。開始前 1 秒會出現音符、畫面變粉紅。' },
  gold: { opp: 'meowth', name: '黃金球', color: '#FFD54F', short: '每 4 球有一顆黃金球，拿下得 2 分',
    desc: '第 3、7、11… 球是黃金球，發球前會寫「本球 2 分」。拿下它得 2 分，可以直接拿到過關分。' },
  wind: { opp: 'farfetchd', name: '強風', color: '#B2FF59', short: '箭頭出現 1 秒後起風，把球往箭頭方向推',
    desc: '每 7 秒颳一次 3 秒的風。上方箭頭先出現 1 秒，之後把飛行中的球往箭頭方向推（發球後第一次碰球前不會吹）。' }
};
const RULE_OF: Record<string, RuleId> = {};
(Object.keys(RULES) as RuleId[]).forEach(function (id) { RULE_OF[RULES[id].opp] = id; });
export function ruleFor(idx: number, opp: string): RuleId | null { return zoneOf(idx).boss || idx === 0 ? null : RULE_OF[opp] || null; }

export const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
export const CONF = ['#FFD54F', '#FF5A7A', '#4FC3F7', '#81C784', '#FFFFFF', '#BA68C8'];
