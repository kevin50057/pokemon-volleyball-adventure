/**
 * 進化之力：夥伴的親密度滿了就在這一輪「覺醒」。
 *  - 御三家是真的進化（二階、三階換圖，見 evolve.ts），三階的能力就是這裡的覺醒；鯉魚王進化成暴鯉龍（現有的圖）。
 *  - 其他角色是「覺醒」：樣子不變，借來進化後的力量。
 *  - 不畫任何進化型的圖。名字顯示成「皮卡丘★」，副標寫借來的力量（雷丘之力…）。
 *  - 效果只在這一輪；圖鑑永久記「看過牠覺醒」。效果在 ../match/awaken.ts，改的是技能的規則，不是加倍率。
 */
import { CHAR_TAG, type Tag } from './cards';

/** stages：御三家，二、三階真的換圖；evolve：鯉魚王 → 暴鯉龍；awaken：樣子不變；look：只有光環 */
export type AwakenKind = 'stages' | 'evolve' | 'awaken' | 'look';
/** 能覺醒的角色：全部 24 隻（look：只有外觀，沒有效果——超夢、夢幻照 SPEC §3 不加強度；百變怪本來就一直在變身） */
export const AWAKEN: Readonly<Record<string, AwakenKind>> = {
  pikachu: 'awaken', vaporeon: 'awaken', flareon: 'awaken', jolteon: 'awaken',
  charmander: 'stages', bulbasaur: 'stages', squirtle: 'stages', magikarp: 'evolve',
  umbreon: 'awaken', snorlax: 'awaken', jigglypuff: 'awaken', dragonite: 'awaken',
  psyduck: 'awaken', meowth: 'awaken', bird: 'awaken',
  gengar: 'awaken', electrode: 'awaken', wobbuffet: 'awaken', mrmime: 'awaken', dugtrio: 'awaken', farfetchd: 'awaken',
  mew: 'look', mewtwo: 'look', ditto: 'look',
};
export function canAwaken(id: string): boolean { return id in AWAKEN; }

/** 親密度：上場贏一場 +1，贏菁英（只給機制卡的站）或首領 +2；滿 AWAKEN_AT 覺醒（第一章大約在第三個岔路） */
export const AWAKEN_AT = 6;
export const BOND_WIN = 1;
export const BOND_BIG = 2;

/** 跨輪的羈絆等級：以上場身分的累計勝場，3／8／15／25 場升到 Lv2～5 */
export const BOND_LEVELS: readonly number[] = [3, 8, 15, 25];
export function bondLevel(wins: number): number {
  let lv = 1;
  BOND_LEVELS.forEach((need) => { if (wins >= need) lv++; });
  return lv;
}
/** 開新一輪時這隻的親密度：羈絆 Lv2 從 1 開始、Lv4 從 2 開始（Lv3、Lv5 是圖鑑上的光環和金框） */
export function startBond(wins: number): number { const lv = bondLevel(wins); return lv >= 4 ? 2 : lv >= 2 ? 1 : 0; }

/** 覺醒光環的顏色：有標籤的用標籤色，其他角色各自一個顏色 */
const TAG_AURA: Readonly<Record<Tag, string>> = { thunder: '#FFE34D', wind: '#B2FF59', fire: '#FF8A50', water: '#5CC8FF' };
const AURA: Readonly<Record<string, string>> = {
  umbreon: '#FFE082', mew: '#FF9DE2', mewtwo: '#B39DDB', snorlax: '#9CCC65', jigglypuff: '#F8BBD0', bulbasaur: '#81C784', meowth: '#FFD54F', bird: '#FFE34D',
};
export function auraColorOf(id: string): string {
  const tag = CHAR_TAG[id];
  return AURA[id] || (tag ? TAG_AURA[tag] : '#FFD54F');
}
