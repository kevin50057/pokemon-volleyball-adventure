/**
 * 遠征的內容：路線、對手、場地規則、卡牌、羈絆、圖鑑條件。全部是資料，不含邏輯。
 * 改了這裡要換 types.ts 的 CONTENT_VERSION。數值都是「驗證起點」，還沒有真人試玩的依據。
 *
 * 第一章「道館巡禮」（PLAN M3：九站、約 35～55 分鐘，還沒有真人計時）：
 *   熱身草原 → 岔路① → 奇遇 → 岔路② → 補給營地 → 強風山口 → 岔路③ → 龍之巢前的營火 → 龍之巢
 * 第二章「四天王與秘境」（十站）：
 *   發電廠（頑皮雷彈）→ 岔路④ → 奇遇 → 岔路⑤（雷電秘境：閃電鳥／一般）→ 營地
 *   → 四天王（果然翁 → 耿鬼 → 魔牆人偶，中間不能補給）→ 冠軍前的營火 → 冠軍（月伊布首領）
 * 岔路的兩個選項是「空位」：對手和場地規則由每一輪的種子抽（route.ts），每輪不一樣。
 */
import type { CharacterId } from '../../core/types';

export const START_HEARTS = 3;
export const PARTY_MAX = 2;
/** 卡槽上限（最後一章的值；每章實際幾格看 CHAPTERS） */
export const MAX_CARD_SLOTS = 4;
/** 遠征一開始就能選的夥伴（維護者決定：四隻起始角色加關都御三家） */
export const STARTERS: readonly CharacterId[] = ['pikachu', 'vaporeon', 'flareon', 'jolteon', 'charmander', 'bulbasaur', 'squirtle'];

// ---------- 場地規則 ----------
export type RuleId = 'rain' | 'gold' | 'wind' | 'lowgrav';
export const RULE_CFG = {
  // 水窪：先預警 1 秒才生效；球落在生效的水窪上會彈起來
  rain: { warn: 25, life: 200, every: 125, maxPairs: 2, half: 22, bounce: -15, damp: 0.5 },
  // 黃金球：第 3、7、11… 球，發球前明示，拿下得 2 分
  gold: { every: 4, first: 2, points: 2 },
  // 強風：每 7 秒一輪，3 秒無風、1 秒預警（顯示方向）、3 秒強風（每 10 幀推球 1）
  wind: { period: 175, warnAt: 75, onAt: 100, every: 10 },
  // 搖籃曲（低重力）：每 8 秒一輪，4 秒正常、1 秒預警、3 秒低重力（球每 2 幀少落 1）
  lowgrav: { period: 200, warnAt: 100, onAt: 125 },
} as const;
/**
 * 遠征自己動到球之後的球速上限（卡牌殺球加速）。遊戲本體的角色技能本來就可能超過這個值
 * （實測喵喵 62、可達鴨 56），那是原本的行為，遠征不去改它。
 */
export const MAX_BALL_SPEED = 30;

/** 電腦的強度。move：腳步（1 = 全速）、spike：起跳後會殺球的機率、lapse：球飛過來時慢半拍的機率 */
export interface Diff { move: number; spike: number; lapse: number }
export const LAPSE_FRAMES = 10;

/** 首領戰：比分當成血量 */
export interface BossDef {
  playerHp: number;
  hp: number;
  /** 首領剩這麼多血時進第二階段（下一球發球前預告） */
  phase2AtHp: number;
  /** 第二階段的球速係數（只動球，不動全域計時） */
  ballSpeed: number;
  /** 第二階段的名字（逆鱗、月光…），對應 texts 的 phase2Title／phase2Note */
  phase2: string;
  /** 場地色調：第一階段、第二階段 */
  tint: readonly [number, number];
}

export type Capture = 'sure' | 'chance';
/** 岔路的空位：對手從 pool 抽，規則從 RULE_POOL 抽（同一個岔路的兩個選項不重複） */
export interface Slot { fork: string; pool: readonly CharacterId[] }
export interface MatchNode {
  id: string;
  kind: 'match';
  opp: CharacterId;
  /** 搶幾分（首領戰是首領的血量） */
  score: number;
  rule?: RuleId;
  /** 不寫就是原本的電腦，一點都不調 */
  diff?: Diff;
  boss?: BossDef;
  /** 贏了有沒有三選一；rare：只給機制卡（菁英） */
  reward: boolean | 'rare';
  /** 岔路的空位（opp、rule 由種子決定；這裡的 opp 只是佔位） */
  slot?: Slot;
  capture?: Capture;
  next: string | null;
}
export interface ForkNode { id: string; kind: 'fork'; options: string[] }
export interface SupplyNode { id: string; kind: 'supply'; next: string }
/** 奇遇：由種子決定遇到哪一個，玩家從選項裡挑一個 */
export interface EventNode { id: string; kind: 'event'; pool: EventId[]; next: string }
export type NodeDef = MatchNode | ForkNode | SupplyNode | EventNode;

/**
 * heal：回 1 心；cards2／cards3：拿卡（二選一／三選一）；
 * gamble：付 1 顆心，換一次只有機制卡的三選一（只剩 1 顆心時不能選）；
 * trade：丟掉一張自己的卡，換一次三選一（沒有卡時不能選）；leave：直接走
 */
export type EventChoice = 'heal' | 'cards2' | 'cards3' | 'gamble' | 'trade' | 'leave';
export type EventId = 'picnic' | 'trainer' | 'spring' | 'stall' | 'dojo';
/** 每個奇遇的選項（最後一個一定是什麼都不做就走） */
export const EVENTS: Readonly<Record<EventId, readonly EventChoice[]>> = {
  picnic: ['heal', 'cards2', 'leave'],
  trainer: ['cards3', 'leave'],
  spring: ['heal', 'leave'],
  stall: ['gamble', 'leave'],
  dojo: ['trade', 'leave'],
};

export const CAPTURE_CHANCE = 0.6;

/** 岔路的場地規則池（強風留給菁英；null = 沒有規則） */
export const RULE_POOL: readonly (RuleId | null)[] = ['rain', 'gold', 'lowgrav', null];
// 第一章的岔路池（耿鬼、頑皮雷彈照 SPEC §3 留到第二章）
const P1: readonly CharacterId[] = ['psyduck', 'meowth', 'jigglypuff', 'wobbuffet', 'dugtrio'];
const P2: readonly CharacterId[] = ['snorlax', 'jigglypuff', 'mrmime', 'psyduck', 'meowth', 'wobbuffet'];
// 第三個岔路包含整章所有可能的對手：前兩個岔路最多用掉 4 隻，這裡一定還剩兩隻不重複的
const P3: readonly CharacterId[] = ['dugtrio', 'mrmime', 'snorlax', 'wobbuffet', 'psyduck', 'meowth', 'jigglypuff'];
// 第二章的岔路池（四天王的三隻不會出現在岔路）
const P4: readonly CharacterId[] = ['psyduck', 'meowth', 'jigglypuff', 'snorlax', 'dugtrio', 'farfetchd'];
const D1: Diff = { move: 0.70, spike: 0.45, lapse: 0.42 }, D2: Diff = { move: 0.78, spike: 0.55, lapse: 0.35 }, D3: Diff = { move: 0.90, spike: 0.74, lapse: 0.22 };
const D4: Diff = { move: 0.92, spike: 0.78, lapse: 0.18 }, DK: Diff = { move: 0.96, spike: 0.86, lapse: 0.12 };
function slot(id: string, fork: string, pool: readonly CharacterId[], diff: Diff, next: string): MatchNode {
  return { id, kind: 'match', opp: pool[0], score: 5, diff, reward: true, capture: 'chance', next, slot: { fork, pool } };
}

export const NODES: readonly NodeDef[] = [
  { id: 'warmup', kind: 'match', opp: 'magikarp', score: 5, diff: { move: 0.60, spike: 0.35, lapse: 0.50 }, reward: true, capture: 'sure', next: 'fork1' },
  { id: 'fork1', kind: 'fork', options: ['f1a', 'f1b'] },
  slot('f1a', 'fork1', P1, D1, 'event1'), slot('f1b', 'fork1', P1, D1, 'event1'),
  { id: 'event1', kind: 'event', pool: ['picnic', 'trainer', 'spring', 'stall', 'dojo'], next: 'fork2' },
  { id: 'fork2', kind: 'fork', options: ['f2a', 'f2b'] },
  slot('f2a', 'fork2', P2, D2, 'supply'), slot('f2b', 'fork2', P2, D2, 'supply'),
  { id: 'supply', kind: 'supply', next: 'elite' },
  { id: 'elite', kind: 'match', opp: 'farfetchd', score: 7, rule: 'wind', diff: { move: 0.86, spike: 0.66, lapse: 0.27 }, reward: 'rare', capture: 'sure', next: 'fork3' },
  { id: 'fork3', kind: 'fork', options: ['f3a', 'f3b'] },
  slot('f3a', 'fork3', P3, D3, 'camp'), slot('f3b', 'fork3', P3, D3, 'camp'),
  { id: 'camp', kind: 'supply', next: 'boss' },
  { id: 'boss', kind: 'match', opp: 'dragonite', score: 7, diff: { move: 0.94, spike: 0.82, lapse: 0.16 }, boss: { playerHp: 5, hp: 7, phase2AtHp: 3, ballSpeed: 1.10, phase2: 'outrage', tint: [0x8FA0E8, 0xE08A7A] }, reward: false, capture: 'sure', next: null },
  // ---- 第二章 ----
  { id: 'gate', kind: 'match', opp: 'electrode', score: 5, diff: { move: 0.86, spike: 0.66, lapse: 0.26 }, reward: true, capture: 'sure', next: 'fork4' },
  { id: 'fork4', kind: 'fork', options: ['f4a', 'f4b'] },
  slot('f4a', 'fork4', P4, D4, 'event2'), slot('f4b', 'fork4', P4, D4, 'event2'),
  { id: 'event2', kind: 'event', pool: ['picnic', 'trainer', 'spring', 'stall', 'dojo'], next: 'fork5' },
  { id: 'fork5', kind: 'fork', options: ['thunder', 'f5b'] },
  // 雷電秘境：比較難（搶 7、強風），贏了一定收服閃電鳥，而且給機制卡
  { id: 'thunder', kind: 'match', opp: 'bird', score: 7, rule: 'wind', diff: { move: 0.94, spike: 0.82, lapse: 0.16 }, reward: 'rare', capture: 'sure', next: 'c2camp' },
  slot('f5b', 'fork5', P4, D4, 'c2camp'),
  { id: 'c2camp', kind: 'supply', next: 'k1' },
  // 四天王：連戰，中間不能補給，心一路帶著
  { id: 'k1', kind: 'match', opp: 'wobbuffet', score: 5, diff: DK, reward: true, capture: 'chance', next: 'k2' },
  { id: 'k2', kind: 'match', opp: 'gengar', score: 5, rule: 'lowgrav', diff: DK, reward: false, capture: 'sure', next: 'k3' },
  { id: 'k3', kind: 'match', opp: 'mrmime', score: 5, rule: 'gold', diff: DK, reward: 'rare', capture: 'chance', next: 'c2camp2' },
  { id: 'c2camp2', kind: 'supply', next: 'champion' },
  { id: 'champion', kind: 'match', opp: 'umbreon', score: 8, diff: { move: 1, spike: 0.9, lapse: 0.08 }, boss: { playerHp: 5, hp: 8, phase2AtHp: 3, ballSpeed: 1.12, phase2: 'moonlight', tint: [0x7A70B8, 0x4B3F8A] }, reward: false, capture: 'sure', next: null },
];
export const FIRST_NODE = 'warmup';
/** 地圖上的站數（岔路的兩條算同一站；岔路口本身不算一站） */
export const STOPS: readonly (readonly string[])[] = [
  ['warmup'], ['f1a', 'f1b'], ['event1'], ['f2a', 'f2b'], ['supply'], ['elite'], ['f3a', 'f3b'], ['camp'], ['boss'],
];
/**
 * 章節。失敗的單位是「章」：心用完回到這一章的開頭（一命到底模式除外）。
 * 每章開始時心回滿；卡槽隨章成長（2 → 3 → 4）。目前只有第一章。
 */
export interface ChapterDef { id: string; first: string; slots: number; stops: readonly (readonly string[])[] }
export const STOPS2: readonly (readonly string[])[] = [
  ['gate'], ['f4a', 'f4b'], ['event2'], ['thunder', 'f5b'], ['c2camp'], ['k1'], ['k2'], ['k3'], ['c2camp2'], ['champion'],
];
export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'c1', first: 'warmup', slots: 2, stops: STOPS },
  { id: 'c2', first: 'gate', slots: 3, stops: STOPS2 },
];
/** 這個節點在第幾章（岔路口算在它分出去的那一章） */
export function chapterOf(id: string): number {
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (CHAPTERS[i].stops.some((st) => st.indexOf(id) >= 0)) return i;
    const n = nodeById(id);
    if (n && n.kind === 'fork' && CHAPTERS[i].stops.some((st) => st.indexOf(n.options[0]) >= 0)) return i;
  }
  return 0;
}
export function cardSlots(chapter: number): number { const c = CHAPTERS[chapter]; return c ? c.slots : CHAPTERS[0].slots; }

/** 岔路口 → 它分出去的那一站 */
export const FORK_OF: Readonly<Record<string, number>> = { fork1: 1, fork2: 3, fork3: 6, fork4: 1, fork5: 3 };

export function nodeById(id: string): NodeDef | undefined { return NODES.find((n) => n.id === id); }
/** 不帶種子：岔路空位只回傳樣板（對手是佔位）。要知道這一輪實際的對手，用 route.ts 的 resolveMatch */
export function matchNode(id: string): MatchNode | undefined { const n = nodeById(id); return n && n.kind === 'match' ? n : undefined; }

// ---------- 卡牌（招式學習器）與羈絆 ----------
export type Tag = 'thunder' | 'wind' | 'fire' | 'water';
export type Stat = 'move' | 'jump' | 'spike' | 'dive';
/** 機制卡（改變打法；效果在 mech.ts） */
export type MechId = 'charge' | 'counterSet' | 'doubleJump' | 'dropShot' | 'serveAce' | 'weatherBall';
export interface CardDef { id: string; tag?: Tag; mods: Partial<Record<Stat, number>>; mech?: MechId }

/**
 * 卡牌：一半是改變打法的機制卡，一半是「感覺得到」的數值卡（倍率拉到 SPEC 上限附近）。
 * 跟 SPEC §4.1 的差異：遊戲本體沒有「能量」，原本作用在能量的卡改成作用在撲救距離。
 */
export const CARDS: readonly CardDef[] = [
  // 機制卡
  { id: 'charge', tag: 'fire', mods: {}, mech: 'charge' },
  { id: 'counterSet', tag: 'water', mods: {}, mech: 'counterSet' },
  { id: 'doubleJump', tag: 'wind', mods: {}, mech: 'doubleJump' },
  { id: 'dropShot', mods: {}, mech: 'dropShot' },
  { id: 'serveAce', tag: 'thunder', mods: {}, mech: 'serveAce' },
  { id: 'weatherBall', mods: {}, mech: 'weatherBall' },
  // 數值卡
  { id: 'quickShoes', tag: 'thunder', mods: { move: 1.12 } },
  { id: 'lightFeather', tag: 'wind', mods: { jump: 1.12 } },
  { id: 'galeForce', tag: 'wind', mods: { spike: 1.12 } },
  { id: 'shellBell', tag: 'water', mods: { dive: 1.15 } },
  { id: 'muscleBand', tag: 'fire', mods: { spike: 1.15, move: 0.9 } },
  { id: 'windup', mods: { dive: 1.22, spike: 0.92 } },
];
export function cardById(id: string): CardDef | undefined { return CARDS.find((c) => c.id === id); }

/** 每隻角色最多一個標籤；只有上場的那隻算 */
export const CHAR_TAG: Readonly<Record<string, Tag>> = {
  pikachu: 'thunder', jolteon: 'thunder', farfetchd: 'wind', dragonite: 'wind',
  flareon: 'fire', charmander: 'fire', vaporeon: 'water', squirtle: 'water', psyduck: 'water', magikarp: 'water',
};
export const BOND_NEED = 2;
export const BONDS: Readonly<Record<Tag, { stat: Stat; mult: number }>> = {
  thunder: { stat: 'dive', mult: 1.08 },
  wind: { stat: 'jump', mult: 1.06 },
  fire: { stat: 'spike', mult: 1.05 },
  water: { stat: 'move', mult: 1.05 },
};
/** 各項倍率的上下限（卡 × 羈絆 × 角色本身一起算） */
export const CAPS: Readonly<Record<Stat, readonly [number, number]>> = {
  move: [0.85, 1.15], jump: [0.85, 1.15], spike: [0.85, 1.15], dive: [0.8, 1.25],
};

// ---------- 圖鑑 ----------
/** 這一版收得到的角色 → 在哪裡（fork = 第一章的岔路，每一輪抽到的不一樣） */
export const DEX_WHERE: Readonly<Record<string, string>> = (() => {
  const w: Record<string, string> = { magikarp: 'warmup', farfetchd: 'elite', dragonite: 'boss', electrode: 'gate', bird: 'thunder', gengar: 'k2', umbreon: 'champion' };
  P1.concat(P2, P3, P4).forEach((id) => { if (!w[id]) w[id] = 'fork'; });
  return w;
})();

// ---------- 難度等級 ----------
/** 0 = 一般。每通關一次（任何模式）就開放下一級。效果是累加的 */
export const RANK_MAX = 3;
export function rankDiff(d: Diff | undefined, rank: number): Diff | undefined {
  if (!d || rank < 1) return d;
  return { move: Math.min(1, d.move + 0.06), spike: Math.min(1, d.spike + 0.12), lapse: d.lapse * 0.6 };
}
export function rankBoss(b: BossDef | undefined, rank: number): BossDef | undefined {
  if (!b || rank < 2) return b;
  return { ...b, hp: b.hp + 2, phase2AtHp: b.phase2AtHp + 1 };
}
/** 等級 3：每章只有 2 顆心 */
export function maxHearts(rank: number): number { return rank >= 3 ? START_HEARTS - 1 : START_HEARTS; }
