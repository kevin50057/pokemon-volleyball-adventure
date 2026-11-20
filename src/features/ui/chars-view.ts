/**
 * 介面類外掛（選角面板、觸控資訊條）讀角色資料用的小工具。
 *
 * 角色資料由 features/characters 提供（形狀跟舊版 window.PV_CHARS 一樣：list、byId、ids、typeColors）。
 * 一律在呼叫當下才讀 CHARS，import 時不做任何事。
 */
import type { CharacterId } from '../../core/types';
import { CHARS, type CharDef, type PokeType } from '../characters';

export type CharView = CharDef;

export function charList(): readonly CharDef[] { return CHARS.list; }
export function charIds(): readonly CharacterId[] { return CHARS.ids; }
/** 用任意字串查角色（查不到回傳 undefined，跟舊版 `CH.byId[v]` 一樣；null 會被當成 "null" 這個鍵）。 */
export function charById(id: string | null | undefined): CharDef | undefined {
  return CHARS.byId[String(id)];
}
export function typeColor(type: PokeType): string | undefined {
  return CHARS.typeColors && CHARS.typeColors[type];
}
