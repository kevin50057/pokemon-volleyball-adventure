/**
 * 御三家的真正進化：這一輪的親密度到 3 點變第二階、到 6 點（滿）變第三階，比賽中換成進化型的圖。
 * 圖是維護者提供的（public/resources/assets/images/<form>_sheet.png，由 scripts/make-evo-sheets.py 產生），
 * 格子排法跟一階完全一樣。第三階的能力就是原本「覺醒」的那一個（match/awaken.ts），第二階加強一階的技能（match/evolve.ts）。
 * 階段由親密度推出來，不另外存；章節重來時親密度退回快照，階段也跟著退回。
 */
import { AWAKEN_AT } from './awaken';

/** 一階 → [二階, 三階] */
export const EVO_LINES: Readonly<Record<string, readonly [string, string]>> = {
  charmander: ['charmeleon', 'charizard'],
  bulbasaur: ['ivysaur', 'venusaur'],
  squirtle: ['wartortle', 'blastoise'],
};
/** 第二階的門檻；第三階就是親密度滿（AWAKEN_AT） */
export const STAGE2_AT = 3;
/** 所有進化型的 id（載入圖片、文字檢查用） */
export const EVO_FORMS: readonly string[] = Object.values(EVO_LINES).flatMap((l) => [l[0], l[1]]);

export type Stage = 1 | 2 | 3;
export function hasStages(id: string): boolean { return id in EVO_LINES; }
export function stageOf(id: string, bond: number): Stage {
  if (!hasStages(id)) return 1;
  return bond >= AWAKEN_AT ? 3 : bond >= STAGE2_AT ? 2 : 1;
}
/** 這一階的樣子：一階（或不會進化的角色）就是自己 */
export function formOf(id: string, bond: number): string {
  const line = EVO_LINES[id], st = stageOf(id, bond);
  return line && st > 1 ? line[st - 2] : id;
}
