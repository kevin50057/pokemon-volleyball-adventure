// 打擊感：各檔案共用的狀態（舊版是 IIFE 裡的區域變數）
// ES 模組不能從別的檔案重新指定 export 的 let，所以全部放在同一個物件 S 裡；名稱跟舊版一樣。
import type { Controller, GameView } from '../../core/types';
import { GROUND_Y } from './config';

export interface Particle {
  kind: 'spark' | 'dust';
  x: number; y: number; vx: number; vy: number;
  g: number; drag: number; life: number; t0: number;
  color: string; size: number;
}
export interface Ring {
  x: number; y: number; r0: number; r1: number; t0: number; dur: number;
  color: string; w: number; flat?: boolean;
}
/** 全畫面閃光（full）或一小團白光 */
export type Flash =
  | { full: true; color: string; alpha: number; t0: number; dur: number }
  | { full?: false; x: number; y: number; r: number; t0: number; dur: number };
export interface Line {
  x: number; y: number; a: number; r0: number; len: number; t0: number; dur: number; color: string;
}
export interface BallFx { t0: number; ang: number; power: number; hold: boolean; ground: boolean }
export interface PlayerFx { t0: number; kind: string }
export interface Kick { x: number; y: number; t0: number }

export const S = {
  hitStop: 0,
  trauma: 0,            // 0~1，震動量（平方後使用，越大越劇烈）
  traumaScale: 0,
  traumaVertical: false,
  kick: { x: 0, y: 0, t0: -1 } as Kick,   // 有方向的鏡頭頓挫
  groundLock: false, groundT: 0,
  lastStopT: -1e9,      // 上一次頓幀的時間，避免近距離對殺連續凍結
  viewRef: null as GameView | null,
  latched: [0, 0],      // 頓幀期間按下的殺球鍵，頓幀結束後補上
  scoreFx: [{ t0: -1 }, { t0: -1 }] as { t0: number }[],
  lastScores: [0, 0],
  trailUntil: 0,
  pendingTrail: false as boolean | number,   // pendingTrail：false 或拖尾毫秒數
  lastSpikeLvl: [0, 0], lastSpikeT: 0, rallyMaxLvl: 0,   // 這一球最後是幾級打過來的（得分特效用）
  ultAt: [-1e9, -1e9], skillAt: [-1e9, -1e9],
  zoom: 0,              // 鏡頭衝擊
  particles: [] as Particle[],
  rings: [] as Ring[],
  flashes: [] as Flash[],
  lines: [] as Line[],  // 衝擊瞬間的放射速度線
  ballFx: { t0: -1, ang: 0, power: 0, hold: false, ground: false } as BallFx,
  playerFx: [{ t0: -1, kind: '' }, { t0: -1, kind: '' }] as PlayerFx[],
  prev: { ballY: 0, p: [{ y: GROUND_Y, state: 0, hit: false }, { y: GROUND_Y, state: 0, hit: false }] },
  lastHitColor: '#FFFFFF', lastHitType: '電',
  ctrlRef: null as Controller | null,
  /** 球的顯示角度（平滑追上目標） */
  ballRot: 0,
};
