// 角色資料（舊版 window.PV_CHARS）的闖關用視角
import { CHARS } from '../characters';

/** 闖關用到的角色欄位（形狀跟舊版 characters.js 一樣）。 */
export interface CharInfo { id: string; name: string; type: string; skill: string; desc: string; color: string }
interface CharTable { readonly list: readonly CharInfo[]; readonly byId: { readonly [id: string]: CharInfo | undefined }; readonly ids: readonly string[] }

/**
 * 角色模組自己的型別可能用 CharacterId 當 byId 的鍵；闖關會拿存檔裡讀到的任意字串去查
 * （查不到就當成壞檔），所以在這一處統一轉成「字串鍵的表」。
 * 用 getter 每次都去讀 CHARS，不在載入時抓住當下的值。
 */
function table(): CharTable { return CHARS; }
export const CH = {
  get list(): readonly CharInfo[] { return table().list; },
  get byId(): { readonly [id: string]: CharInfo | undefined } { return table().byId; },
  get ids(): readonly string[] { return table().ids; }
};

export function charName(id: string): string { const c = CH.byId[id]; return c ? c.name : id; }
/**
 * 一定拿得到的角色資料：查不到（例如壞掉的存檔）就給一個用 id 當名字的佔位，畫面不會因此整個壞掉。
 * 存檔讀進來時已經檢查過角色 id，正常情況下不會用到佔位。
 */
export function charInfo(id: string): CharInfo {
  return CH.byId[id] || { id, name: id, type: '普', skill: '', desc: '', color: '#FFFFFF' };
}
/** 屬性的顯示名稱（c.type 是內部的鍵，不直接顯示）。 */
export function typeName(type: string): string { return (CHARS.typeLabels as Record<string, string>)[type] || type; }
