/**
 * 場地規則的物理（每一個真的會跑物理的幀，在遊戲本體的物理之前）。
 * 兩邊一視同仁；會改變球路的事件一定先預警。只動球，不動角色、不碰計分（黃金球的分數在 field.ts 的 scoreLayer）。
 * 比賽中的亂數（水窪位置、風向）跟遊戲本體一樣用 Math.random。
 */
import type { Controller, GameState } from '../../../core/types';
import { sfx } from '../../campaign/sfx';
import { RULE_CFG, type RuleId } from '../content';
import { BALL_GROUND, W } from './geom';

export interface Puddle { x: number; t: number }
/** 念力停球：停住的位置和速度（原樣保存，時間到照原速度繼續） */
export interface Hold { left: number; x: number; y: number; vx: number; vy: number }
export interface RuleState {
  id: RuleId;
  /** 這一場對打中的幀數（規則的週期以它計） */
  rt: number;
  rally: number;
  golden: boolean;
  /** 這一球有人碰過了（強風只吹被打過的球，發球不吹） */
  touched: boolean;
  prev: GameState | null;
  puddles: Puddle[];
  spawn: number;
  /** 強風的方向 */
  dir: number;
  splash: Puddle[];
  pop: { side: 0 | 1; t: number } | null;
  hold: Hold | null;
  /** 念力停球這一輪判定失敗（球太低或太靠近角色）：顯示「失效」幾幀 */
  fizzle: number;
}

export function newRule(id: RuleId): RuleState {
  return { id, rt: 0, rally: 0, golden: false, touched: false, prev: null, puddles: [], spawn: 25, dir: 1, splash: [], pop: null, hold: null, fizzle: 0 };
}

/** 週期規則的狀態：warn 預警中、on 生效中 */
export interface Cycle { warn: boolean; on: boolean; k: number }
export function cycleOf(id: RuleId, rt: number): Cycle {
  if (id === 'lowgrav' || id === 'heavy') {
    const L = RULE_CFG[id], k = rt % L.period;
    return { warn: k >= L.warnAt && k < L.onAt, on: k >= L.onAt, k };
  }
  if (id === 'wind') {
    const L = RULE_CFG.wind, k = rt % L.period;
    return { warn: k >= L.warnAt && k < L.onAt, on: k >= L.onAt, k };
  }
  if (id === 'gravflip') {
    const L = RULE_CFG.gravflip, k = rt % L.period;
    return { warn: k >= L.warnAt && k < L.onAt, on: k >= L.onAt && k < L.offAt, k };
  }
  if (id === 'stasis') {
    const L = RULE_CFG.stasis, k = rt % L.period;
    return { warn: k >= L.warnAt && k < L.at, on: false, k };
  }
  return { warn: false, on: false, k: 0 };
}
/** 重力崩壞這一輪是變重（true）還是變輕：第一輪變重，之後交替 */
export function gravflipHeavy(rt: number): boolean { return Math.floor(rt / RULE_CFG.gravflip.period) % 2 === 0; }

/** 這一球是不是黃金球；every：幾球一次（氣象球卡會改成 3） */
export function isGoldenRally(rally: number, every: number): boolean { return rally % every === RULE_CFG.gold.first % every; }

export interface RuleOpts {
  /** 氣象球：這一球最後是玩家殺的，場地規則對它手下留情 */
  spares: boolean;
  /** 黃金球幾球一次 */
  goldEvery: number;
}

/** 回傳 true：這一幀黃金球亮著（給球的貼圖用） */
export function rulePhysics(c: Controller, r: RuleState, o: RuleOpts): boolean {
  const ph = c.physics, ball = ph.ball;
  if (c.state === c.round && r.prev !== c.round) {           // 新的一球
    r.touched = false;
    r.hold = null;
    r.golden = r.id === 'gold' && isGoldenRally(r.rally, o.goldEvery);
    r.rally++;
  }
  r.prev = c.state;
  const golden = r.golden && c.state === c.round && !c.roundEnded && !c.gameEnded;
  if (c.state !== c.round || c.roundEnded || c.gameEnded) return golden;
  r.rt++;
  if (r.fizzle > 0) r.fizzle--;
  const touchedNow = ph.player1.isCollisionWithBallHappened || ph.player2.isCollisionWithBallHappened;
  if (touchedNow) r.touched = true;
  const air = ball.y < BALL_GROUND;
  const cy = cycleOf(r.id, r.rt);
  if (r.id === 'rain') rain(c, r, o);
  else if (r.id === 'lowgrav') {
    if (cy.on && air && r.rt % 2 === 0 && !o.spares) ball.yVelocity -= 1;
  } else if (r.id === 'heavy') {
    if (cy.on && air && r.rt % 2 === 0 && !o.spares) ball.yVelocity += 1;
  } else if (r.id === 'gravflip') {
    if (cy.on && air && r.rt % 2 === 0 && !o.spares) ball.yVelocity += gravflipHeavy(r.rt) ? 1 : -1;
  } else if (r.id === 'wind') {
    const Lw = RULE_CFG.wind;
    if (cy.k === Lw.warnAt) { r.dir = Math.random() < 0.5 ? -1 : 1; sfx('wind'); }
    if (cy.on && r.touched && air && r.rt % Lw.every === 0 && !o.spares) ball.xVelocity = Math.max(-30, Math.min(30, ball.xVelocity + r.dir));
  } else if (r.id === 'stasis') stasis(c, r, o, cy, touchedNow);
  return golden;
}

function rain(c: Controller, r: RuleState, o: RuleOpts): void {
  const ball = c.physics.ball, Rn = RULE_CFG.rain;
  if (--r.spawn <= 0 && r.puddles.length < Rn.maxPairs * 2) {
    const x = 52 + Math.random() * 116;
    r.puddles.push({ x, t: 0 }, { x: W - x, t: 0 });       // 兩邊對稱，一視同仁
    r.spawn = Rn.every;
  } else if (r.spawn <= 0) r.spawn = 25;
  for (let i = r.puddles.length - 1; i >= 0; i--) if (++r.puddles[i].t > Rn.warn + Rn.life) r.puddles.splice(i, 1);
  // 球下一幀就會落地：落點在生效的水窪上就彈起來（氣象球：玩家殺過去的球在對面不彈）
  if (ball.yVelocity > 0 && ball.y + ball.yVelocity > BALL_GROUND && !(o.spares && ball.x > W / 2)) {
    const nx = ball.x + ball.xVelocity;
    for (let j = 0; j < r.puddles.length; j++) {
      const pd = r.puddles[j];
      if (pd.t >= Rn.warn && Math.abs(nx - pd.x) < Rn.half) {
        ball.yVelocity = Rn.bounce;
        ball.xVelocity = Math.round(ball.xVelocity * Rn.damp);
        r.splash.push({ x: pd.x, t: 0 });
        r.puddles.splice(j, 1);
        sfx('splash');
        break;
      }
    }
  }
}

/**
 * 念力停球：預警 1 秒後判定一次。球夠高、離雙方角色都夠遠才停；停住時每幀把球放回保存的位置、速度歸零
 * （遊戲本體這一步就不會移動它），任何一方碰到球立刻解除（保留碰撞後的新速度），時間到照原速度繼續。
 */
function stasis(c: Controller, r: RuleState, o: RuleOpts, cy: Cycle, touchedNow: boolean): void {
  const ph = c.physics, ball = ph.ball, L = RULE_CFG.stasis;
  const h = r.hold;
  if (h) {
    if (touchedNow) { r.hold = null; return; }
    if (--h.left <= 0) { ball.x = h.x; ball.y = h.y; ball.xVelocity = h.vx; ball.yVelocity = h.vy; r.hold = null; return; }
    ball.x = h.x; ball.y = h.y; ball.xVelocity = 0; ball.yVelocity = 0;
    return;
  }
  if (cy.k !== L.at) return;
  const far = [ph.player1, ph.player2].every((p) => Math.hypot(ball.x - p.x, ball.y - p.y) > L.clear);
  if (!o.spares && ball.y < L.minHeight && far) {
    r.hold = { left: L.hold, x: ball.x, y: ball.y, vx: ball.xVelocity, vy: ball.yVelocity };
    sfx('phase');
  } else r.fizzle = 20;
}
