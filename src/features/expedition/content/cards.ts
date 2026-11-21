/**
 * 卡牌（招式學習器）與羈絆的資料。計算在 ../cards.ts，機制卡的效果在 ../match/mech.ts。
 * 卡牌一半是改變打法的機制卡，一半是「感覺得到」的數值卡（倍率拉到 SPEC 上限附近）。
 * 跟 SPEC §4.1 的差異：遊戲本體沒有「能量」，原本作用在能量的卡改成作用在撲救距離。
 */
export type Tag = 'thunder' | 'wind' | 'fire' | 'water';
export type Stat = 'move' | 'jump' | 'spike' | 'dive';
/** 機制卡（比賽中改變打法；效果在 ../match/mech.ts） */
export type MechId = 'charge' | 'counterSet' | 'doubleJump' | 'dropShot' | 'serveAce' | 'weatherBall' | 'diveSave' | 'apexSpike' | 'lastStand';
/** 結構卡（不在比賽中發動，改的是這一輪的規則） */
export type CardEffect = 'expShare' | 'expertBelt';
export interface CardDef {
  id: string;
  tag?: Tag;
  mods: Partial<Record<Stat, number>>;
  mech?: MechId;
  effect?: CardEffect;
  /** 一開始不在卡池裡，要靠訓練家手冊的目標解鎖 */
  locked?: boolean;
  /** 拿到就生效、不佔卡槽（只能在道場丟掉） */
  passive?: boolean;
}

export const CARDS: readonly CardDef[] = [
  // 機制卡
  { id: 'charge', tag: 'fire', mods: {}, mech: 'charge' },
  { id: 'counterSet', tag: 'water', mods: {}, mech: 'counterSet' },
  { id: 'doubleJump', tag: 'wind', mods: {}, mech: 'doubleJump' },
  { id: 'dropShot', mods: {}, mech: 'dropShot' },
  { id: 'serveAce', tag: 'thunder', mods: {}, mech: 'serveAce' },
  { id: 'weatherBall', mods: {}, mech: 'weatherBall' },
  { id: 'diveSave', tag: 'water', mods: {}, mech: 'diveSave' },
  { id: 'apexSpike', tag: 'wind', mods: {}, mech: 'apexSpike' },
  { id: 'lastStand', tag: 'fire', mods: {}, mech: 'lastStand' },
  // 結構卡（靠目標解鎖）
  { id: 'expShare', mods: {}, effect: 'expShare', locked: true },
  { id: 'expertBelt', mods: {}, effect: 'expertBelt', locked: true, passive: true },
  // 數值卡
  { id: 'quickShoes', tag: 'thunder', mods: { move: 1.12 } },
  { id: 'lightFeather', tag: 'wind', mods: { jump: 1.12 } },
  { id: 'galeForce', tag: 'wind', mods: { spike: 1.12 } },
  { id: 'shellBell', tag: 'water', mods: { dive: 1.15 } },
  { id: 'muscleBand', tag: 'fire', mods: { spike: 1.15, move: 0.9 } },
  { id: 'windup', mods: { dive: 1.22, spike: 0.92 } },
];
const BY_ID = new Map<string, CardDef>(CARDS.map((c) => [c.id, c]));
export function cardById(id: string): CardDef | undefined { return BY_ID.get(id); }
export function isMechCard(id: string): boolean { const c = BY_ID.get(id); return !!(c && c.mech); }
export function hasEffect(ids: readonly string[], effect: CardEffect): boolean { return ids.some((id) => { const c = BY_ID.get(id); return !!(c && c.effect === effect); }); }
/** 這張卡在卡池裡嗎（鎖著的要 profile 的 cardPool 有它） */
export function inPool(id: string, unlocked: readonly string[]): boolean { const c = BY_ID.get(id); return !!c && (!c.locked || unlocked.indexOf(id) >= 0); }

/**
 * 三選一的補位（卡池不夠時，不塞重複卡）：@bond 上場夥伴羈絆值 +1、@heal 回 1 顆心。
 * 不能裝卡的挑戰（noCards）只給這兩個。
 */
export const FILL_BOND = '@bond';
export const FILL_HEAL = '@heal';
export const FILLS: readonly string[] = [FILL_BOND, FILL_HEAL];
export function isFill(id: string): boolean { return FILLS.indexOf(id) >= 0; }

/** 每隻角色最多一個標籤；只有上場的那隻算（學習裝置：備援也算） */
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
