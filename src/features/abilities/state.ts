// 技能系統的狀態（每一邊的技能狀態、百變怪記憶、殺球記憶、場上特效佇列…）
//
// 舊版這些都是 IIFE 裡的 var，而且有幾個會被整個換掉（resetAll、連線 net.set），
// 拆成多個模組後沒辦法從別的模組重新指定 import 進來的變數，所以集中放在 `rt` 這個物件上。
import type { Coin, SideState } from '../../core/side-state';
import type { CharacterId, Controller, Player } from '../../core/types';

export type { ZipTrail } from '../../core/side-state';
import type { ZipTrail } from '../../core/side-state';

/** 喵喵的金幣：舊版還多存了 max（連線時也會傳出去，所以保留）。 */
export interface MeowthCoin extends Coin { max: number }

/**
 * 技能系統內部用的每邊狀態（core 的 SideState 再補上技能用到的欄位）。
 *
 * 注意：下面標成 `number` 的計時器／計數器「執行時可能還是 undefined」（還沒設過）。
 * 舊版就是靠 `undefined > 0 === false`、`!undefined === true` 這些特性在跑，
 * 型別上當成 number，程式就能跟舊版逐字相同（不必為了型別加上 `?? 0` 而改變任何判斷）。
 * 物件本身仍然是 `{ char: '' }` 起頭（見 newSide），連線傳的形狀不變。
 */
export interface AbilitySide extends SideState {
  stunTimer: number; slowTimer: number; reverseTimer: number; burnTimer: number;
  flashFire: number; fireBall: number; ghostTimer: number;
  psyCooldown: number; psychicTimer: number; psychicFrame: number;
  bombTimer: number; bombFrame: number; barrierTimer: number; barrierCD: number;
  outrageTimer: number; rageStacks: number;
  qaCooldown: number; qaWindow: number;
  zipRequest: number; zipDir: number; zipFrames: number;
  headacheCharge: number; tripCounter: number; gyaradosTimer: number;
  mewCD: number; tpCD: number; auraTimer: number; boomerangTimer: number;
  quake: number; ownSide: number;
  coins?: MeowthCoin[];
  // 只有技能系統自己用的欄位（舊版直接掛在同一個物件上）
  /** 雷伊布／夢幻：自己數的幀數、上一幀方向、連點判斷 */
  fc: number; prevDir: number; tapDir: number; tapAt: number; tapHeld: number;
  /** 卡比獸：上一幀在空中 */
  wasInAir?: boolean;
}

export type SideKey = 'p1' | 'p2';
export interface AbilityPair { p1: AbilitySide; p2: AbilitySide }

export interface Burst { x: number; y: number; color: string; size: number; t: number; max: number }
export interface Flash { color: string; alpha: number; t: number; max: number }

export function newSide(): AbilitySide {
  // 舊版是 { char: '' }，其餘欄位用到時才出現（見 AbilitySide 的說明）
  return { char: '' } as AbilitySide;
}

export const rt = {
  state: { p1: newSide(), p2: newSide() } as AbilityPair,
  // 百變怪：記住「原本選的角色」，變身後仍會持續變身
  meta: {
    p1: { origin: '' as string, transformedTo: null as CharacterId | null },
    p2: { origin: '' as string, transformedTo: null as CharacterId | null },
  },
  lastScoreSum: 0,
  // 超夢殺球後的紫色念力球
  psyBall: null as { owner: SideKey } | null,
  // 「接到對手的殺球」判斷：遊戲本體在球被碰到的那一幀就把 isPowerHit 清掉，
  // 所以要記住上一幀球是不是殺球、是誰殺的
  ballMem: { prevPower: false, prevVx: 0, lastPowerSide: null as SideKey | null },
  // 這一幀開始時，「對手殺過來、還沒被碰過的球」是衝著誰來的（大蔥鴨的居合斬用）
  incoming: { p1: false, p2: false },
  fx: { bursts: [] as Burst[], flashes: [] as Flash[] },
  // 最後碰到球的角色（球的屬性光用）
  lastHitter: null as Player | null,
};

export function pk(player: Player): SideKey { return player.isPlayer2 ? 'p2' : 'p1'; }

export function receivedSpike(player: Player): boolean {
  return player.isCollisionWithBallHappened && player.state !== 2 &&
    rt.ballMem.prevPower && rt.ballMem.lastPowerSide !== pk(player);
}

// 雷伊布電光一閃的殘影（一個物件，不是陣列）
export function getTrail(s: AbilitySide): ZipTrail | undefined {
  return s.zipTrail;
}
export function setTrail(s: AbilitySide, t: ZipTrail): void {
  s.zipTrail = t;
}

export function resetAll(ctrl: Controller): void {
  rt.state = { p1: newSide(), p2: newSide() };
  rt.psyBall = null;
  rt.fx = { bursts: [], flashes: [] };
  (['player1', 'player2'] as const).forEach(function (k) {
    const p = ctrl.physics[k];
    p.pvNoClamp = false;
    const m = rt.meta[pk(p)];
    if (m.origin === 'ditto') { p.character = 'ditto'; m.transformedTo = null; }
  });
}
