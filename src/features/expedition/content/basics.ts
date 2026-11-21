/**
 * 遠征的基本數值。全部是資料；改了這個資料夾裡的任何東西要換 types.ts 的 CONTENT_VERSION。
 * 數值都是「驗證起點」，還沒有真人試玩的依據。
 */
import type { CharacterId } from '../../../core/types';

export const START_HEARTS = 3;
export const PARTY_MAX = 2;
/** 卡槽上限：最後一章 4 格，加上達人帶 1 格（每章實際幾格看 logic/derived.ts 的 slotsOf） */
export const MAX_CARD_SLOTS = 5;
/** 遠征一開始就能選的夥伴（維護者決定：四隻起始角色加關都御三家） */
export const STARTERS: readonly CharacterId[] = ['pikachu', 'vaporeon', 'flareon', 'jolteon', 'charmander', 'bulbasaur', 'squirtle'];
/** 「機率收服」的成功率；失敗一次之後下一次保底 */
export const CAPTURE_CHANCE = 0.6;
