/**
 * 遠征的內容：路線、對手、場地規則、卡牌、羈絆、圖鑑條件。全部是資料，不含邏輯。
 * 改了這裡要換 types.ts 的 CONTENT_VERSION。數值都是「驗證起點」，還沒有真人試玩的依據。
 *
 * M2 短切片（SPEC §2）：
 *   鯉魚王熱身 → 岔路（可達鴨水窪／喵喵黃金球）→ 補給站 → 強風菁英大蔥鴨 → 快龍首領
 */
import type { CharacterId } from '../../core/types';

export const START_HEARTS = 3;
export const PARTY_MAX = 2;
export const CARD_SLOTS = 2;
/** 遠征一開始就能選的夥伴（維護者決定：四隻起始角色加關都御三家） */
export const STARTERS: readonly CharacterId[] = ['pikachu', 'vaporeon', 'flareon', 'jolteon', 'charmander', 'bulbasaur', 'squirtle'];

// ---------- 場地規則 ----------
export type RuleId = 'rain' | 'gold' | 'wind';
export const RULE_CFG = {
  // 水窪：先預警 1 秒才生效；球落在生效的水窪上會彈起來
  rain: { warn: 25, life: 200, every: 125, maxPairs: 2, half: 22, bounce: -15, damp: 0.5 },
  // 黃金球：第 3、7、11… 球，發球前明示，拿下得 2 分
  gold: { every: 4, first: 2, points: 2 },
  // 強風：每 7 秒一輪，3 秒無風、1 秒預警（顯示方向）、3 秒強風（每 10 幀推球 1）
  wind: { period: 175, warnAt: 75, onAt: 100, every: 10 },
} as const;

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
export type NodeDef = MatchNode | ForkNode | SupplyNode;

export const CAPTURE_CHANCE = 0.6;

export const NODES: readonly NodeDef[] = [
  { id: 'warmup', kind: 'match', opp: 'magikarp', score: 5, diff: { move: 0.60, spike: 0.35, lapse: 0.50 }, reward: true, capture: 'sure', next: 'fork' },
  { id: 'fork', kind: 'fork', options: ['puddle', 'gold'] },
  { id: 'puddle', kind: 'match', opp: 'psyduck', score: 5, rule: 'rain', diff: { move: 0.74, spike: 0.50, lapse: 0.38 }, reward: true, capture: 'chance', next: 'supply' },
  { id: 'gold', kind: 'match', opp: 'meowth', score: 5, rule: 'gold', diff: { move: 0.74, spike: 0.50, lapse: 0.38 }, reward: true, capture: 'chance', next: 'supply' },
  { id: 'supply', kind: 'supply', next: 'elite' },
  { id: 'elite', kind: 'match', opp: 'farfetchd', score: 7, rule: 'wind', diff: { move: 0.86, spike: 0.68, lapse: 0.26 }, reward: true, capture: 'sure', next: 'boss' },
  { id: 'boss', kind: 'match', opp: 'dragonite', score: 7, diff: { move: 0.94, spike: 0.82, lapse: 0.16 }, boss: { playerHp: 5, hp: 7, phase2AtHp: 3, ballSpeed: 1.10 }, reward: false, capture: 'sure', next: null },
];
export const FIRST_NODE = 'warmup';
/** 地圖上的站數（岔路的兩條算同一站） */
export const STOPS: readonly (readonly string[])[] = [['warmup'], ['puddle', 'gold'], ['supply'], ['elite'], ['boss']];

export function nodeById(id: string): NodeDef | undefined { return NODES.find((n) => n.id === id); }
export function matchNode(id: string): MatchNode | undefined { const n = nodeById(id); return n && n.kind === 'match' ? n : undefined; }

// ---------- 卡牌（招式學習器）與羈絆 ----------
export type Tag = 'thunder' | 'wind';
export type Stat = 'move' | 'jump' | 'spike' | 'dive';
export interface CardDef { id: string; tag?: Tag; mods: Partial<Record<Stat, number>> }

/**
 * 跟 SPEC §4.1 的差異：這個遊戲本體沒有「能量」這個東西，
 * 規格裡兩張「能量取得」的卡（電氣球、蓄勢）和雷羈絆改成作用在「撲救距離」。
 */
export const CARDS: readonly CardDef[] = [
  { id: 'quickShoes', tag: 'thunder', mods: { move: 1.08 } },
  { id: 'lightFeather', tag: 'wind', mods: { jump: 1.08 } },
  { id: 'voltBall', tag: 'thunder', mods: { dive: 1.12 } },
  { id: 'galeForce', tag: 'wind', mods: { spike: 1.08 } },
  { id: 'stance', mods: { move: 1.06, jump: 0.95 } },
  { id: 'windup', mods: { dive: 1.18, spike: 0.96 } },
];
export function cardById(id: string): CardDef | undefined { return CARDS.find((c) => c.id === id); }

/** 每隻角色最多一個標籤；只有上場的那隻算 */
export const CHAR_TAG: Readonly<Record<string, Tag>> = { pikachu: 'thunder', jolteon: 'thunder', farfetchd: 'wind' };
export const BOND_NEED = 2;
export const BONDS: Readonly<Record<Tag, { stat: Stat; mult: number }>> = {
  thunder: { stat: 'dive', mult: 1.08 },
  wind: { stat: 'jump', mult: 1.06 },
};
/** 各項倍率的上下限（卡 × 羈絆 × 角色本身一起算） */
export const CAPS: Readonly<Record<Stat, readonly [number, number]>> = {
  move: [0.85, 1.15], jump: [0.85, 1.15], spike: [0.85, 1.15], dive: [0.8, 1.25],
};

// ---------- 圖鑑 ----------
/** 這一版收得到的角色 → 在哪個節點 */
export const DEX_NODE: Readonly<Record<string, string>> = {
  magikarp: 'warmup', psyduck: 'puddle', meowth: 'gold', farfetchd: 'elite', dragonite: 'boss',
};
