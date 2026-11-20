// ============================================================
// 場地規則：跟著對手走，兩邊一視同仁，會改變球路的事件一定先預警
// （規則的說明文字在 config.ts 的 RULES）
// ============================================================
import { flags } from '../../core/services';
import type { Ball, Controller } from '../../core/types';
import { CFG, H, NET_X, FLOOR_Y, RULES, W } from './config';
import type { RuleId } from './config';
import { camp } from './state';
import type { RuleState } from './state';
import { sfx } from './sfx';
import { label } from './draw';

export function newRule(id: RuleId): RuleState { return { id: id, rt: 0, rally: 0, golden: false, touched: false, prev: null, puddles: [], spawn: 25, dir: 1, splash: [], pop: null }; }

function lowgravOn(t: number): boolean { const L = CFG.rules.lowgrav, k = t % L.period; return k >= L.onAt; }
function lowgravWarn(t: number): boolean { const L = CFG.rules.lowgrav, k = t % L.period; return k >= L.warnAt && k < L.onAt; }
function windOn(t: number): boolean { const L = CFG.rules.wind, k = t % L.period; return k >= L.onAt; }
function windWarn(t: number): boolean { const L = CFG.rules.wind, k = t % L.period; return k >= L.warnAt && k < L.onAt; }

// 每一個真的有跑物理的幀（在物理之前）
export function rulePhysics(c: Controller): void {
  const r = camp.rule;
  if (!r || camp.waiting) return;
  const ph = c.physics, ball = ph.ball, R = CFG.rules;
  if (c.state === c.round && r.prev !== c.round) {           // 新的一球
    r.touched = false;
    r.golden = r.id === 'gold' && r.rally % R.gold.every === R.gold.first;
    r.rally++;
  }
  r.prev = c.state;
  flags.goldBall = !!(r.golden && c.state === c.round && !c.roundEnded && !c.gameEnded);
  if (c.state !== c.round || c.roundEnded || c.gameEnded) return;
  r.rt++;
  if (ph.player1.isCollisionWithBallHappened || ph.player2.isCollisionWithBallHappened) r.touched = true;
  const air = ball.y < 252;
  if (r.id === 'rain') {
    const Rn = R.rain;
    if (--r.spawn <= 0 && r.puddles.length < Rn.maxPairs * 2) {
      const x = 52 + Math.random() * 116;
      r.puddles.push({ x: x, t: 0 }, { x: W - x, t: 0 });
      r.spawn = Rn.every;
    } else if (r.spawn <= 0) r.spawn = 25;
    for (let i = r.puddles.length - 1; i >= 0; i--) if (++r.puddles[i].t > Rn.warn + Rn.life) r.puddles.splice(i, 1);
    // 球下一幀就會落地：落點在水窪上就彈起來
    if (ball.yVelocity > 0 && ball.y + ball.yVelocity > 252) {
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
  } else if (r.id === 'lowgrav') {
    if (lowgravOn(r.rt) && air && r.rt % 2 === 0) ball.yVelocity -= 1;
  } else if (r.id === 'wind') {
    const Lw = R.wind, k = r.rt % Lw.period;
    if (k === Lw.warnAt) { r.dir = Math.random() < 0.5 ? -1 : 1; sfx('wind'); }
    if (windOn(r.rt) && r.touched && air && r.rt % Lw.every === 0) ball.xVelocity = Math.max(-30, Math.min(30, ball.xVelocity + r.dir));
  }
}

// AI 用的落點預測：跟遊戲本體同樣的球路計算，再加上「AI 已經看到預警」的規則效果
export function predictLanding(ball: Ball, r: RuleState): number | null {
  const R = CFG.rules, know = r.rt - R.react;
  let x = ball.x, y = ball.y, vx = ball.xVelocity, vy = ball.yVelocity, t = r.rt;
  const touched = r.touched;
  function knownGrav(tt: number): boolean {
    if (r.id !== 'lowgrav' || !lowgravOn(tt)) return false;
    const start = tt - tt % R.lowgrav.period + R.lowgrav.warnAt;     // 這一次的預警從哪一幀開始
    return start <= know;
  }
  function knownWind(tt: number): number {
    if (r.id !== 'wind' || !windOn(tt) || !touched) return 0;
    const start = tt - tt % R.wind.period + R.wind.warnAt;
    return start <= know && start > r.rt - R.wind.period ? r.dir : 0;   // 只知道這一次的風向
  }
  // AI 是在這一幀的球已經動完之後才判斷，所以從下一幀開始算：先套規則（跟 rulePhysics 一樣在物理之前），再走一步物理
  for (let k = 0; k < 160; k++) {
    t++;
    if (knownGrav(t) && t % 2 === 0 && y < 252) vy -= 1;
    const d = knownWind(t); if (d && t % R.wind.every === 0 && y < 252) vx = Math.max(-30, Math.min(30, vx + d));
    if (x + vx < 20 || x + vx > W) vx = -vx;
    if (y + vy < 0) vy = 1;
    if (Math.abs(x - NET_X) < 25 && y > 176) { if (y <= 192) { if (vy > 0) vy = -vy; } else vx = x < NET_X ? -Math.abs(vx) : Math.abs(vx); }
    if (y + vy > 252) return x;
    y += vy; x += vx; vy += 1;
  }
  return null;
}

// 黃金球：拿下這一球固定得 2 分（喵喵自己的「得 2 分」不會疊上去）
// hooks.score 的一層（包在技能系統外面）
export function scoreLayer(next: (ctrl: Controller, idx: 0 | 1) => number, ctrl: Controller, idx: 0 | 1): number {
  let pts = next(ctrl, idx);
  const r = camp.rule;
  if (camp.playing && r && r.golden) {
    pts = CFG.rules.gold.points;
    r.pop = { side: idx, t: 0 };
    sfx('coin');
  }
  return pts;
}

export function drawRule(c: Controller, g: CanvasRenderingContext2D, r: RuleState, t: number, lite: boolean): void {
  const R = CFG.rules, ball = c.physics.ball, live = c.state === c.round && !c.roundEnded && !c.gameEnded, def = RULES[r.id];
  if (r.id === 'rain') {
    g.strokeStyle = 'rgba(180,225,255,0.35)'; g.lineWidth = 1;
    for (let i = 0, n = lite ? 14 : 40; i < n; i++) {
      const rx = (i * 61 + t * 7) % (W + 40) - 20, ry = (i * 37 + t * 11) % (H + 20) - 10;
      g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 3, ry + 9); g.stroke();
    }
    r.puddles.forEach(function (pd) {
      const on = pd.t >= R.rain.warn, end = R.rain.warn + R.rain.life - pd.t;
      const a = on ? (end < 25 && end % 6 < 3 ? 0.35 : 0.8) : 0.12 + 0.3 * pd.t / R.rain.warn;
      g.globalAlpha = a; g.fillStyle = '#29B6F6';
      g.beginPath(); g.ellipse(pd.x, FLOOR_Y, R.rain.half, 5, 0, 0, Math.PI * 2); g.fill();
      if (!on) { g.strokeStyle = '#B3E5FC'; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = '#E1F5FE'; g.beginPath(); g.ellipse(pd.x - 7, FLOOR_Y - 1, 7, 1.6, 0, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    });
    r.splash = r.splash.filter(function (sp) {
      sp.t++;
      g.globalAlpha = 1 - sp.t / 14; g.strokeStyle = '#B3E5FC'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(sp.x, FLOOR_Y, 10 + sp.t * 3, 3 + sp.t, 0, 0, Math.PI * 2); g.stroke();
      for (let d = -1; d <= 1; d++) { g.beginPath(); g.arc(sp.x + d * (6 + sp.t), FLOOR_Y - 6 - sp.t * 2 + sp.t * sp.t * 0.15, 2, 0, Math.PI * 2); g.fillStyle = '#B3E5FC'; g.fill(); }
      g.globalAlpha = 1;
      return sp.t < 14;
    });
  } else if (r.id === 'lowgrav') {
    const on = lowgravOn(r.rt) && live, warn = lowgravWarn(r.rt) && live;
    if (on || warn) {
      if (!lite) { g.globalAlpha = on ? 0.12 : 0.06 + 0.06 * Math.sin(t / 2); g.fillStyle = '#FF80C8'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      for (let k = 0; k < (lite ? 4 : 9); k++) {
        const nx = (k * 53 + 30) % W, ny = H - ((t * (on ? 1.2 : 0.6) + k * 41) % H);
        label(g, k % 2 ? '♪' : '♫', nx, ny, 12, '#FFB3E6');
      }
      if (warn) label(g, '搖籃曲要來了！', NET_X, 58, 14, '#FFB3E6');
      else {
        const left = 1 - (r.rt % R.lowgrav.period - R.lowgrav.onAt) / (R.lowgrav.period - R.lowgrav.onAt);
        g.fillStyle = '#000'; g.fillRect(NET_X - 41, 51, 82, 8); g.fillStyle = '#FF8AD8'; g.fillRect(NET_X - 40, 52, 80 * left, 6);
        label(g, '低重力', NET_X, 66, 10, '#FFB3E6');
      }
    }
  } else if (r.id === 'wind') {
    const won = windOn(r.rt) && live, wwarn = windWarn(r.rt) && live, dir = r.dir;
    if (won || (wwarn && t % 6 < 4)) {
      g.save(); g.translate(NET_X, 60); g.scale(dir, 1);
      g.fillStyle = won ? '#B2FF59' : '#FFFFFF'; g.strokeStyle = '#000'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-26, -5); g.lineTo(8, -5); g.lineTo(8, -12); g.lineTo(26, 0); g.lineTo(8, 12); g.lineTo(8, 5); g.lineTo(-26, 5); g.closePath(); g.stroke(); g.fill();
      g.restore();
      label(g, wwarn ? '強風要來了！' : '強風', NET_X, 80, wwarn ? 13 : 10, won ? '#B2FF59' : '#fff');
    }
    if (won) {
      g.strokeStyle = 'rgba(220,255,200,0.45)'; g.lineWidth = 1.5;
      for (let w = 0, wn = lite ? 6 : 16; w < wn; w++) {
        const wy = 40 + (w * 47) % 200, base = (w * 97 + t * 9) % (W + 80) - 40, wx = dir > 0 ? base : W - base;
        g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx - dir * (18 + (w % 3) * 8), wy); g.stroke();
      }
    }
  } else if (r.id === 'gold') {
    const nextGold = r.rally % R.gold.every === R.gold.first;
    const serving = (c.state === c.beforeStartOfNextRound || c.state === c.afterEndOfRound) && nextGold && !c.gameEnded;
    if (serving) { label(g, '黃金球！', NET_X, 112, 30, '#FFD54F'); label(g, '本球 2 分', NET_X, 140, 15, '#fff'); }
    if (r.golden && c.state === c.round && !c.roundEnded) {
      g.globalAlpha = 0.85; g.strokeStyle = '#FFD54F'; g.lineWidth = 3;
      g.beginPath(); g.arc(ball.x, ball.y, 22 + Math.sin(t / 2) * 2, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      label(g, '2分', ball.x, ball.y - 30, 10, '#FFD54F');
      if (r.rt < 400) label(g, '黃金球　本球 2 分', NET_X, 58, 11, '#FFD54F');
    }
    if (r.pop && ++r.pop.t < 30) label(g, '+2', r.pop.side === 1 ? 382 : 50, 62 - r.pop.t, 22, '#FFD54F');
  }
  if (def) label(g, '場地：' + def.name, NET_X, 44, 9, def.color);
}
