// 闖關模式「冠軍之路」：可調整的數值、關卡表、場地規則的說明文字
// （舊版 campaign.js 開頭那一段；數值全部照抄）

import { lang } from '../../core/i18n';
import { T } from './texts';

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
    { name: T.zoneMeadow, tint: 0xFFFFFF, score: 5, fixed: ['magikarp', 'psyduck', 'snorlax'], c1: '#49b36a', c2: '#2a7350' },
    { name: T.zoneGym, tint: 0xFFC79E, score: 5, pool: ['dugtrio', 'jigglypuff', 'wobbuffet', 'mrmime', 'meowth'], draw: 3, c1: '#e6933f', c2: '#a8502c' },
    { name: T.zoneTower, tint: 0x7F8EDC, score: 7, pool: ['farfetchd', 'gengar', 'electrode', 'bird'], draw: 2, last: 'dragonite', c1: '#4a61c9', c2: '#272f78' },
    { name: T.zoneFinal, boss: true, c1: '#8a47d6', c2: '#3d1766' }
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
/** name：單字（金／銀／銅）；medal：整個獎章的名稱（金獎章…）。都是顯示用的字，存檔只存敗場數。 */
export interface TierInfo { name: string; color: string; medal: string }
export const TIER: ReadonlyArray<TierInfo | null> = [null, { name: T.tierBronze, color: '#D08A4A', medal: T.medalBronze }, { name: T.tierSilver, color: '#D5DEE6', medal: T.medalSilver }, { name: T.tierGold, color: '#FFD54F', medal: T.medalGold }];
/** tierOf() 只會回傳 1～3，所以一定有值（TIER[0] 是佔位的 null）。 */
export function tierInfo(t: number): TierInfo { return TIER[t] as TierInfo; }
export function tierOf(lost: number): number { return lost <= 0 ? 3 : lost <= 1 ? 2 : 1; }

// ============================================================
// 場地規則：跟著對手走，兩邊一視同仁，會改變球路的事件一定先預警
// ============================================================
export type RuleId = 'rain' | 'lowgrav' | 'gold' | 'wind';
export interface RuleDef { opp: string; name: string; color: string; short: string; desc: string }
export const RULES: Record<RuleId, RuleDef> = {
  rain: { opp: 'psyduck', name: T.ruleRainName, color: '#4FC3F7', short: T.ruleRainShort, desc: T.ruleRainDesc },
  lowgrav: { opp: 'jigglypuff', name: T.ruleLowgravName, color: '#FF8AD8', short: T.ruleLowgravShort, desc: T.ruleLowgravDesc },
  gold: { opp: 'meowth', name: T.ruleGoldName, color: '#FFD54F', short: T.ruleGoldShort, desc: T.ruleGoldDesc },
  wind: { opp: 'farfetchd', name: T.ruleWindName, color: '#B2FF59', short: T.ruleWindShort, desc: T.ruleWindDesc }
};
const RULE_OF: Record<string, RuleId> = {};
(Object.keys(RULES) as RuleId[]).forEach(function (id) { RULE_OF[RULES[id].opp] = id; });
export function ruleFor(idx: number, opp: string): RuleId | null { return zoneOf(idx).boss || idx === 0 ? null : RULE_OF[opp] || null; }

// 韓文頁面把韓文字型排在前面（繁中字型多半沒有韓文字）
export const FONT = (lang() === 'ko' ? '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",' : '') + '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
export const CONF = ['#FFD54F', '#FF5A7A', '#4FC3F7', '#81C784', '#FFFFFF', '#BA68C8'];
