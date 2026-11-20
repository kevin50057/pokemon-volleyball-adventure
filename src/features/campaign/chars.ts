// 角色資料（舊版 window.PV_CHARS）的闖關用視角
import { CHARS } from '../characters';

/** 闖關用到的角色欄位（形狀跟舊版 characters.js 一樣）。 */
export interface CharInfo { id: string; name: string; type: string; skill: string; desc: string; color: string }
interface CharTable { list: CharInfo[]; byId: Record<string, CharInfo>; ids: string[] }

/**
 * 角色模組自己的型別可能用 CharacterId 當 byId 的鍵；闖關會拿存檔裡讀到的任意字串去查
 * （查不到就當成壞檔），所以在這一處統一轉成「字串鍵的表」。
 * 用 getter 每次都去讀 CHARS，不在載入時抓住當下的值。
 */
function table(): CharTable { return CHARS as unknown as CharTable; }
export const CH = {
  get list(): CharInfo[] { return table().list; },
  get byId(): Record<string, CharInfo> { return table().byId; },
  get ids(): string[] { return table().ids; }
};

export function charName(id: string): string { const c = CH.byId[id]; return c ? c.name : id; }
