/**
 * 機制卡（改變打法的卡）。只作用在玩家（左邊）這一邊、只在遠征比賽中，由 field.ts 每幀呼叫。
 *
 * 規則（給 SPEC §4.1 的補充，待維護者確認）：
 *  - 每張卡 = 一個觸發條件＋一個效果。觸發條件不用機率，只用看得到、數得出來的狀態。
 *  - 同一次觸球最多只有一個「改球路」的效果生效，依卡的 ID 排序取第一張（聚氣、發球上手、吊球）。
 *  - 改過的球一律再夾到 MAX_BALL_SPEED；加速只在球本來就會乾淨落在對面時才加（boostSafely）。
 *  - 發動時頭上跳一個字（場上提示），這就是「可歸因」。
 *  - 不改碰撞箱、不穿牆、不反轉操控、不擊退、不免死、不讓真球瞬移、不碰計分。
 */
import type { Ball, Controller, Player } from '../../core/types';
import { aimAtCourt } from '../abilities/util';
import { rt } from '../abilities/state';
import { boostSafely } from '../abilities/starters';
import { MAX_BALL_SPEED, type MechId } from './content';

const NET_X = 216, GROUND_Y = 244, BALL_GROUND = 252;

export const MECH_CFG = {
  chargeMax: 3, chargePerLayer: 0.08,
  counterVy: -19,
  doubleJumpVy: -11, doubleJumpMinY: 100,
  dropVx: 3,
  serveMaxVx: 24,
};

export interface Pop { text: string; x: number; y: number; t: number }

const M = {
  on: new Set<MechId>(),
  charge: 0,
  /** 這一球我碰過幾次（新的一球歸零） */
  touchEdge: false,
  spikeEdge: false,
  prevState: null as unknown,
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
export function chargeLayers(): number { return M.charge; }
export function pops(): Pop[] { return M.pops; }
export function fired(): Partial<Record<MechId, number>> { return { ...M.fired }; }

function pop(id: MechId, text: string, p: Player): void { M.pops.push({ text, x: p.x, y: p.y - 46, t: 0 }); M.fired[id] = (M.fired[id] || 0) + 1; }
function clamp(ball: Ball): void {
  ball.xVelocity = Math.max(-MAX_BALL_SPEED, Math.min(MAX_BALL_SPEED, ball.xVelocity));
  ball.yVelocity = Math.max(-MAX_BALL_SPEED, Math.min(MAX_BALL_SPEED, ball.yVelocity));
}

/** 每一個真的會跑物理的幀（物理之前）。names：發動時跳的字（依語言） */
export function step(c: Controller, names: Record<MechId, string>): void {
  if (!M.on.size) return;
  const ph = c.physics, p1 = ph.player1, ball = ph.ball, k0 = c.keyboardArray[0];
  const live = c.state === c.round && !c.roundEnded && !c.gameEnded;
  // 新的一球
  if (c.state === c.round && M.prevState !== c.round) {
    M.charge = 0; M.firstTouchDone = false; M.dropping = false; M.dropCrossed = false;
    M.serveArmed = !c.isPlayer2Serve;
  }
  M.prevState = c.state;
  if (!live) { M.touchEdge = M.spikeEdge = false; return; }

  // ---- 二段跳：空中再按一次「上」（每次起跳一次） ----
  const up = k0.yDirection === -1;
  if (p1.state === 0 || p1.y >= GROUND_Y) M.jumpUsed = false;
  if (has('doubleJump') && up && !M.prevUp && (p1.state === 1 || p1.state === 2) && p1.y < GROUND_Y - 20 && p1.y > MECH_CFG.doubleJumpMinY && !M.jumpUsed) {
    M.jumpUsed = true;
    p1.yVelocity = MECH_CFG.doubleJumpVy;
    pop('doubleJump', names.doubleJump, p1);
  }
  M.prevUp = up;

  const touch = p1.isCollisionWithBallHappened;
  const newTouch = touch && !M.touchEdge;
  M.touchEdge = touch;
  const spike = touch && p1.state === 2 && ball.isPowerHit;
  const newSpike = spike && !M.spikeEdge;
  M.spikeEdge = spike;

  if (newTouch) {
    const first = !M.firstTouchDone;
    M.firstTouchDone = true;
    if (!newSpike) {
      // ---- 後發制人：用身體接起對手的殺球 → 完美舉球 ----
      if (has('counterSet') && rt.incoming.p1 && p1.state !== 2) {
        ball.xVelocity = ball.x > NET_X - 40 ? -2 : 0;
        ball.yVelocity = MECH_CFG.counterVy;
        pop('counterSet', names.counterSet, p1);
      }
      // ---- 聚氣：非殺球的觸球累積一層 ----
      if (has('charge') && M.charge < MECH_CFG.chargeMax) { M.charge++; }
    } else {
      // 殺球：依 ID 排序，只有一個改球路的效果生效（charge < dropShot < serveAce）
      let done = false;
      if (!done && has('charge') && M.charge > 0) {
        const k = 1 + MECH_CFG.chargePerLayer * M.charge;
        if (boostSafely(ball, false, k)) { pop('charge', names.charge + ' ×' + M.charge, p1); done = true; }
        M.charge = 0;
      }
      // 不按方向鍵的殺球（本體固定是水平 10、垂直 0）；妙蛙種子的飛葉用同一個觸發，牠優先
      const flat = Math.abs(ball.xVelocity) === 10 && ball.yVelocity === 0;
      if (!done && has('dropShot') && flat && !M.lastSpikeWasDrop && p1.character !== 'bulbasaur') {
        M.dropping = true; M.dropCrossed = false; M.lastSpikeWasDrop = true; done = true;
        pop('dropShot', names.dropShot, p1);
      } else M.lastSpikeWasDrop = false;
      if (!done && has('serveAce') && M.serveArmed && first) {
        aimAtCourt(ball, false, MECH_CFG.serveMaxVx);
        pop('serveAce', names.serveAce, p1); done = true;
      }
      clamp(ball);
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

/** 畫面上的層數和發動字，畫在 HUD（遊戲座標） */
export function drawMech(g: CanvasRenderingContext2D, c: Controller, label: (g: CanvasRenderingContext2D, t: string, x: number, y: number, s: number, col?: string) => void): void {
  if (!M.on.size) return;
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
