/**
 * 遠征的內容：路線、對手、場地規則、卡牌、羈絆、圖鑑條件。全部是資料，不含邏輯。
 * 改了這裡要換 types.ts 的 CONTENT_VERSION。數值都是「驗證起點」，還沒有真人試玩的依據。
 *
 * 第一章「道館巡禮」（PLAN M3：九站、約 35～55 分鐘，還沒有真人計時）：
 *   熱身草原 → 岔路①（雨天池塘／招財巷）→ 奇遇 → 岔路②（搖籃丘／打瞌睡的路口）→ 補給營地
 *   → 強風山口 → 岔路③（地底隧道／鏡子屋）→ 龍之巢前的營火 → 龍之巢
 */
import type { CharacterId } from '../../core/types';

export const START_HEARTS = 3;
export const PARTY_MAX = 2;
export const CARD_SLOTS = 2;
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
}

export type Capture = 'sure' | 'chance';
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
  /** 贏了有沒有三選一 */
  reward: boolean;
  capture?: Capture;
  next: string | null;
}
export interface ForkNode { id: string; kind: 'fork'; options: string[] }
export interface SupplyNode { id: string; kind: 'supply'; next: string }
/** 奇遇：由種子決定遇到哪一個，玩家從選項裡挑一個 */
export interface EventNode { id: string; kind: 'event'; pool: EventId[]; next: string }
export type NodeDef = MatchNode | ForkNode | SupplyNode | EventNode;

export type EventChoice = 'heal' | 'cards2' | 'cards3' | 'leave';
export type EventId = 'picnic' | 'trainer' | 'spring';
/** 每個奇遇的選項（最後一個一定是什麼都不做就走） */
export const EVENTS: Readonly<Record<EventId, readonly EventChoice[]>> = {
  picnic: ['heal', 'cards2', 'leave'],
  trainer: ['cards3', 'leave'],
  spring: ['heal', 'leave'],
};

export const CAPTURE_CHANCE = 0.6;

export const NODES: readonly NodeDef[] = [
  { id: 'warmup', kind: 'match', opp: 'magikarp', score: 5, diff: { move: 0.60, spike: 0.35, lapse: 0.50 }, reward: true, capture: 'sure', next: 'fork1' },
  { id: 'fork1', kind: 'fork', options: ['puddle', 'gold'] },
  { id: 'puddle', kind: 'match', opp: 'psyduck', score: 5, rule: 'rain', diff: { move: 0.70, spike: 0.45, lapse: 0.42 }, reward: true, capture: 'chance', next: 'event1' },
  { id: 'gold', kind: 'match', opp: 'meowth', score: 5, rule: 'gold', diff: { move: 0.70, spike: 0.45, lapse: 0.42 }, reward: true, capture: 'chance', next: 'event1' },
  { id: 'event1', kind: 'event', pool: ['picnic', 'trainer', 'spring'], next: 'fork2' },
  { id: 'fork2', kind: 'fork', options: ['lullaby', 'nap'] },
  { id: 'lullaby', kind: 'match', opp: 'jigglypuff', score: 5, rule: 'lowgrav', diff: { move: 0.78, spike: 0.55, lapse: 0.35 }, reward: true, capture: 'chance', next: 'supply' },
  { id: 'nap', kind: 'match', opp: 'snorlax', score: 5, diff: { move: 0.78, spike: 0.55, lapse: 0.35 }, reward: true, capture: 'chance', next: 'supply' },
  { id: 'supply', kind: 'supply', next: 'elite' },
  { id: 'elite', kind: 'match', opp: 'farfetchd', score: 7, rule: 'wind', diff: { move: 0.86, spike: 0.66, lapse: 0.27 }, reward: true, capture: 'sure', next: 'fork3' },
  { id: 'fork3', kind: 'fork', options: ['tunnel', 'mirror'] },
  { id: 'tunnel', kind: 'match', opp: 'dugtrio', score: 5, diff: { move: 0.90, spike: 0.74, lapse: 0.22 }, reward: true, capture: 'chance', next: 'camp' },
  { id: 'mirror', kind: 'match', opp: 'mrmime', score: 5, diff: { move: 0.90, spike: 0.74, lapse: 0.22 }, reward: true, capture: 'chance', next: 'camp' },
  { id: 'camp', kind: 'supply', next: 'boss' },
  { id: 'boss', kind: 'match', opp: 'dragonite', score: 7, diff: { move: 0.94, spike: 0.82, lapse: 0.16 }, boss: { playerHp: 5, hp: 7, phase2AtHp: 3, ballSpeed: 1.10 }, reward: false, capture: 'sure', next: null },
];
export const FIRST_NODE = 'warmup';
/** 地圖上的站數（岔路的兩條算同一站；岔路口本身不算一站） */
export const STOPS: readonly (readonly string[])[] = [
  ['warmup'], ['puddle', 'gold'], ['event1'], ['lullaby', 'nap'], ['supply'], ['elite'], ['tunnel', 'mirror'], ['camp'], ['boss'],
];
/** 岔路口 → 它分出去的那一站 */
export const FORK_OF: Readonly<Record<string, number>> = { fork1: 1, fork2: 3, fork3: 6 };

export function nodeById(id: string): NodeDef | undefined { return NODES.find((n) => n.id === id); }
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
/** 這一版收得到的角色 → 在哪個節點 */
export const DEX_NODE: Readonly<Record<string, string>> = {
  magikarp: 'warmup', psyduck: 'puddle', meowth: 'gold', jigglypuff: 'lullaby', snorlax: 'nap',
  farfetchd: 'elite', dugtrio: 'tunnel', mrmime: 'mirror', dragonite: 'boss',
};
