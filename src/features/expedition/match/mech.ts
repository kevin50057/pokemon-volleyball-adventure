/**
 * 機制卡（改變打法的卡）。只作用在玩家（左邊）這一邊、只在遠征比賽中，由 field.ts 每幀呼叫。
 *
 * 規則（SPEC §4.1 的補充，待維護者確認）：
 *  - 每張卡 = 一個觸發條件＋一個效果。觸發條件不用機率，只用看得到、數得出來的狀態。
 *  - 同一次觸球最多只有一個「改球路」的效果生效：覺醒優先，其次依卡的 ID 排序取第一張。
 *  - 改過的球一律再夾到 MAX_BALL_SPEED；加速只在球本來就會乾淨落在對面時才加（boostSafely）。
 *  - 發動時頭上跳一個字（場上提示），這就是「可歸因」。
 *  - 不改碰撞箱、不穿牆、不反轉操控、不擊退、不免死、不讓真球瞬移、不碰計分。
 */
import type { Controller, Player } from '../../../core/types';
import { rt } from '../../abilities/state';
import { boostSafely } from '../../abilities/starters';
import { aimAtCourt } from '../../abilities/util';
import type { MechId } from '../content';
import { BALL_GROUND, GROUND_Y, NET_X, clampBall, isLive, perfectSet } from './geom';

export const MECH_CFG = {
  chargeMax: 3, chargePerLayer: 0.08,
  counterVy: -19, diveSaveVy: -17,
  doubleJumpVy: -11, doubleJumpMinY: 100,
  dropVx: 3,
  serveMaxVx: 24, lastStandMaxVx: 24,
  apexMaxVy: 2, apexMult: 1.15,
};

export interface Pop { text: string; x: number; y: number; t: number }
export interface MechContext {
  /** 這一幀覺醒已經改過球路：卡牌這一下不再改 */
  blocked: boolean;
  /** 對手只差 1 分就贏（首領戰是玩家只剩 1 滴血） */
  lastStand: boolean;
  names: Readonly<Record<string, string>>;
}

const M = {
  on: new Set<MechId>(),
  charge: 0,
  touchEdge: false,
  spikeEdge: false,
  prevState: null as Controller['state'] | null,
  serveArmed: false,
  firstTouchDone: false,
  dropping: false,
  dropCrossed: false,
  lastSpikeWasDrop: false,
  jumpUsed: false,
  prevUp: false,
  pops: [] as Pop[],
  /** 這一場每張卡發動了幾次（日誌、除錯用） */
  fired: {} as Partial<Record<MechId, number>>,
};

export function setup(mechs: readonly MechId[] | undefined): void {
  M.on = new Set(mechs || []);
  M.charge = 0; M.touchEdge = false; M.spikeEdge = false; M.prevState = null;
  M.serveArmed = false; M.firstTouchDone = false; M.dropping = false; M.dropCrossed = false; M.lastSpikeWasDrop = false;
  M.jumpUsed = false; M.prevUp = false; M.pops = []; M.fired = {};
}
export function has(id: MechId): boolean { return M.on.has(id); }
export function fired(): Partial<Record<MechId, number>> { return { ...M.fired }; }

/** 頭上跳字（覺醒也用這個） */
export function pop(text: string, p: Player): void { M.pops.push({ text, x: p.x, y: p.y - 46, t: 0 }); }
function fire(id: MechId, text: string, p: Player): void { pop(text, p); M.fired[id] = (M.fired[id] || 0) + 1; }

/** 每一個真的會跑物理的幀（物理之前） */
export function step(c: Controller, x: MechContext): void {
  if (!M.on.size) return;
  const ph = c.physics, p1 = ph.player1, ball = ph.ball, k0 = c.keyboardArray[0];
  if (c.state === c.round && M.prevState !== c.round) {
    M.charge = 0; M.firstTouchDone = false; M.dropping = false; M.dropCrossed = false;
    M.serveArmed = !c.isPlayer2Serve;
  }
  M.prevState = c.state;
  if (!isLive(c)) { M.touchEdge = M.spikeEdge = false; return; }

  // ---- 二段跳：空中再按一次「上」（每次起跳一次） ----
  const up = k0.yDirection === -1;
  if (p1.state === 0 || p1.y >= GROUND_Y) M.jumpUsed = false;
  if (has('doubleJump') && up && !M.prevUp && (p1.state === 1 || p1.state === 2) && p1.y < GROUND_Y - 20 && p1.y > MECH_CFG.doubleJumpMinY && !M.jumpUsed) {
    M.jumpUsed = true;
    p1.yVelocity = MECH_CFG.doubleJumpVy;
    fire('doubleJump', x.names.doubleJump, p1);
  }
  M.prevUp = up;

  const touch = p1.isCollisionWithBallHappened, newTouch = touch && !M.touchEdge;
  M.touchEdge = touch;
  const spike = touch && p1.state === 2 && ball.isPowerHit, newSpike = spike && !M.spikeEdge;
  M.spikeEdge = spike;

  if (newTouch) {
    const first = !M.firstTouchDone;
    M.firstTouchDone = true;
    if (!newSpike) {
      // 後發制人：用身體接起對手的殺球 → 完美舉球；魚躍救球：撲救碰到球 → 高球
      if (!x.blocked && has('counterSet') && rt.incoming.p1 && p1.state !== 2) { perfectSet(ball, MECH_CFG.counterVy); fire('counterSet', x.names.counterSet, p1); }
      else if (!x.blocked && has('diveSave') && p1.state === 3) { perfectSet(ball, MECH_CFG.diveSaveVy); fire('diveSave', x.names.diveSave, p1); }
      if (has('charge') && M.charge < MECH_CFG.chargeMax) M.charge++;
    } else {
      // 殺球：依 ID 排序，只有一個改球路的效果生效
      let done = x.blocked;
      if (!done && has('apexSpike') && Math.abs(p1.yVelocity) <= MECH_CFG.apexMaxVy) {
        if (boostSafely(ball, false, MECH_CFG.apexMult)) { fire('apexSpike', x.names.apexSpike, p1); done = true; }
      }
      if (!done && has('charge') && M.charge > 0) {
        if (boostSafely(ball, false, 1 + MECH_CFG.chargePerLayer * M.charge)) { fire('charge', x.names.charge + ' ×' + M.charge, p1); done = true; }
      }
      if (has('charge')) M.charge = 0;
      // 不按方向鍵的殺球（本體固定是水平 10、垂直 0）；妙蛙種子的飛葉用同一個觸發，牠優先
      const flat = Math.abs(ball.xVelocity) === 10 && ball.yVelocity === 0;
      if (!done && has('dropShot') && flat && !M.lastSpikeWasDrop && p1.character !== 'bulbasaur') {
        M.dropping = true; M.dropCrossed = false; M.lastSpikeWasDrop = true; done = true;
        fire('dropShot', x.names.dropShot, p1);
      } else M.lastSpikeWasDrop = false;
      if (!done && has('lastStand') && x.lastStand) { aimAtCourt(ball, false, MECH_CFG.lastStandMaxVx); fire('lastStand', x.names.lastStand, p1); done = true; }
      if (!done && has('serveAce') && M.serveArmed && first) { aimAtCourt(ball, false, MECH_CFG.serveMaxVx); fire('serveAce', x.names.serveAce, p1); done = true; }
      clampBall(ball);
    }
    M.serveArmed = false;
  }
  // 吊球：過網之後水平速度大減，落在網前
  if (M.dropping) {
    if (ph.player2.isCollisionWithBallHappened || ball.y >= BALL_GROUND - 2) M.dropping = false;
    else if (!M.dropCrossed && ball.x > NET_X + 4) {
      M.dropCrossed = true; M.dropping = false;
      ball.xVelocity = Math.sign(ball.xVelocity || 1) * MECH_CFG.dropVx;
    }
  }
}

/** 氣象球：這一球最後是不是玩家殺的（場地規則對它手下留情） */
export function weatherSpares(): boolean {
  if (!has('weatherBall')) return false;
  const last = rt.lastHitter;
  return !!last && !last.isPlayer2;
}

type LabelFn = (g: CanvasRenderingContext2D, t: string, x: number, y: number, s: number, col?: string) => void;
/** 聚氣的層數和發動字（覺醒的字也在這裡畫） */
export function drawMech(g: CanvasRenderingContext2D, c: Controller, label: LabelFn): void {
  const p1 = c.physics.player1;
  if (has('charge') && M.charge > 0) {
    for (let i = 0; i < MECH_CFG.chargeMax; i++) {
      g.fillStyle = '#000'; g.beginPath(); g.arc(p1.x - 10 + i * 10, p1.y - 40, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = i < M.charge ? '#FF8A3D' : 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(p1.x - 10 + i * 10, p1.y - 40, 3, 0, Math.PI * 2); g.fill();
    }
  }
  M.pops = M.pops.filter((p) => {
    p.t++;
    g.globalAlpha = Math.max(0, 1 - p.t / 30);
    label(g, p.text, p.x, p.y - p.t * 0.8, 10, '#FFE082');
    g.globalAlpha = 1;
    return p.t < 30;
  });
}
