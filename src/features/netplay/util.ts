// 小工具：時間、遊戲本體、角色。
import { svc } from '../../core/services';
import type { AbilitiesApi, JuiceNetApi } from '../../core/services';
import type { CharacterId, Controller } from '../../core/types';
import { CHARS } from '../characters';

export function now(): number { return performance.now(); }
export function ctrlOf(): Controller | null { return svc.ctrl; }
/** 技能系統的連線介面（呼叫當下才去拿）。 */
export function A(): AbilitiesApi['net'] | undefined { return svc.abilities && svc.abilities.net; }
/** 特效系統的連線介面。 */
export function J(): JuiceNetApi | undefined { return svc.juiceNet; }

// 遊戲本體要等第一個畫面的「開始」被按下才會載入。玩家可能沒按就直接進房間，
// 這樣開局時沒有遊戲可以進入（客人卡在等待、房主以為對手斷線），所以幫他按。
export function ensureGame(): void {
  if (ctrlOf()) return;
  const box = document.getElementById('about-box'), btn = document.getElementById('close-about-btn');
  if (box && btn && !box.classList.contains('hidden')) btn.click();   // 已經隱藏＝載入中，不用再按
}

// 不能用 {}：'constructor'、'__proto__' 會被當成合法角色
const VALID: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
/** init() 時呼叫（舊版在載入時從 PV_CHARS.ids 建表）。 */
export function initValid(): void {
  CHARS.ids.forEach((id) => { VALID[id] = true; });
}
/** 收到的角色 id 不合法就當皮卡丘。 */
export function validCh(c: unknown): CharacterId {
  // VALID 裡只有 CHARS.ids，所以通過檢查的一定是 CharacterId
  return typeof c === 'string' && VALID[c] === true ? c as CharacterId : 'pikachu';
}
export function selectedChar(n: 1 | 2): CharacterId {
  const cs = svc.charSelect;
  if (cs && cs.current) return validCh(cs.current(n));   // 遊戲還沒載入時也讀得到剛選的角色
  for (let i = 0; i < CHARS.ids.length; i++) {
    const b = document.getElementById('p' + n + '-' + CHARS.ids[i] + '-btn');
    if (b && b.classList.contains('selected')) return CHARS.ids[i];
  }
  return n === 1 ? 'bird' : 'pikachu';
}
export function charName(id: string): string { const c = CHARS.byId[id]; return c ? c.name : id; }
