/**
 * 技能系統每一邊（p1／p2）的狀態。
 *
 * 連線對戰時主機把整份狀態傳給客機去畫，經典版和遠征版要能互連，所以形狀（欄位名稱）不能改。
 * `edge()` 之類的工具會用任意名稱存「上一幀是否…」的旗標，所以保留字串索引。
 */
export interface Puddle { x: number; timer: number; max: number }
export interface Coin { x: number; timer: number; max?: number; side?: string }
export interface Mound { x: number; timer: number; max: number }
/** 雷伊布電光一閃的殘影（一個物件，不是陣列）。 */
export interface ZipTrail { x0: number; y: number; t: number; x1?: number }
export interface Slash { x: number; y: number; bx: number; by: number; t: number; iai?: number }

export interface SideState {
  /** 這份狀態屬於哪隻角色；角色一換就整份重來。 */
  char: string;
  // 共用的負面狀態
  stunTimer?: number; stunX?: number | null;
  slowTimer?: number; reverseTimer?: number; burnTimer?: number;
  // 各角色
  puddles?: Puddle[]; coins?: Coin[]; mounds?: Mound[]; slash?: Slash | null;
  thunderReady?: boolean; charged?: boolean;
  flashFire?: number; fireBall?: number;
  ghostTimer?: number;
  psyCooldown?: number; psychicTimer?: number; psychicFrame?: number; redirected?: boolean;
  bombTimer?: number; bombFrame?: number;
  barrierTimer?: number; barrierCD?: number;
  outrageTimer?: number; rageStacks?: number;
  qaCooldown?: number; qaWindow?: number; qaHit?: boolean;
  zipRequest?: number; zipDir?: number; zipFrames?: number; zipTrail?: ZipTrail;
  headacheCharge?: number; tripCounter?: number;
  isGyarados?: boolean; isRed?: boolean; gyaradosTimer?: number; gyaFirst?: boolean;
  fastFalling?: boolean; jumpBoosted?: boolean;
  mewCD?: number; tpCD?: number; auraTimer?: number;
  leekSwung?: boolean; boomerangTimer?: number;
  counterPending?: boolean;
  quake?: number;
  ownSide?: number;
  [flag: string]: unknown;
}

export interface SidePair { p1: SideState; p2: SideState }
