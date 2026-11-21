/**
 * 場地規則畫在 HUD 上：預警一定看得到，而且不只靠顏色（虛線框、箭頭、倒數條、文字）。
 */
import type { Controller } from '../../../core/types';
import { label } from '../../campaign/draw';
import { RULE_CFG, type RuleId } from '../content';
import { T } from '../texts';
import { FLOOR_Y, H, NET_X, W, isLive } from './geom';
import { cycleOf, gravflipHeavy, isGoldenRally, type RuleState } from './rules';

type G = CanvasRenderingContext2D;

export const RULE_COLOR: Readonly<Record<RuleId, string>> = {
  rain: '#4FC3F7', gold: '#FFD54F', wind: '#B2FF59', lowgrav: '#FF8AD8', heavy: '#90A4FF', stasis: '#CE93D8', gravflip: '#FF80AB',
};

/** 上下的大箭頭（重力場、重力崩壞的預警） */
function bigArrow(g: G, x: number, y: number, down: boolean, color: string): void {
  g.save(); g.translate(x, y); if (!down) g.scale(1, -1);
  g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-6, -22); g.lineTo(6, -22); g.lineTo(6, 0); g.lineTo(14, 0); g.lineTo(0, 16); g.lineTo(-14, 0); g.lineTo(-6, 0); g.closePath();
  g.stroke(); g.fill(); g.restore();
}
function timeBar(g: G, left: number, color: string, y: number): void {
  g.fillStyle = '#000'; g.fillRect(NET_X - 41, y, 82, 8); g.fillStyle = color; g.fillRect(NET_X - 40, y + 1, 80 * Math.max(0, Math.min(1, left)), 6);
}

export function drawRule(c: Controller, g: G, r: RuleState, t: number, lite: boolean, goldEvery: number): void {
  const ball = c.physics.ball, live = isLive(c), cy = cycleOf(r.id, r.rt);
  if (r.id === 'rain') drawRain(g, r, t, lite);
  else if (r.id === 'lowgrav') {
    if (live && (cy.on || cy.warn)) {
      if (!lite) { g.globalAlpha = cy.on ? 0.12 : 0.06 + 0.06 * Math.sin(t / 2); g.fillStyle = '#FF80C8'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      for (let k = 0; k < (lite ? 4 : 9); k++) {
        const nx = (k * 53 + 30) % W, ny = H - ((t * (cy.on ? 1.2 : 0.6) + k * 41) % H);
        label(g, k % 2 ? '♪' : '♫', nx, ny, 12, '#FFB3E6');
      }
      if (cy.warn) label(g, T.lullabyWarn, NET_X, 64, 14, '#FFB3E6');
      else {
        const L = RULE_CFG.lowgrav;
        timeBar(g, 1 - (cy.k - L.onAt) / (L.period - L.onAt), '#FF8AD8', 57);
        label(g, T.lullabyOn, NET_X, 72, 10, '#FFB3E6');
      }
    }
  } else if (r.id === 'heavy') {
    if (live && (cy.on || cy.warn)) {
      if (cy.warn ? t % 6 < 4 : true) bigArrow(g, NET_X, 70, true, cy.on ? '#90A4FF' : '#fff');
      if (cy.warn) label(g, T.heavyWarn, NET_X, 98, 13, '#C5CAE9');
      else {
        const L = RULE_CFG.heavy;
        timeBar(g, 1 - (cy.k - L.onAt) / (L.period - L.onAt), '#90A4FF', 92);
        label(g, T.heavyOn, NET_X, 106, 10, '#C5CAE9');
      }
    }
  } else if (r.id === 'gravflip') {
    const heavy = gravflipHeavy(r.rt);
    if (live && (cy.on || cy.warn)) {
      if (cy.warn ? t % 6 < 4 : true) bigArrow(g, NET_X, 70, heavy, cy.on ? (heavy ? '#90A4FF' : '#FF8AD8') : '#fff');
      if (cy.warn) label(g, heavy ? T.flipHeavyWarn : T.flipLightWarn, NET_X, 98, 13, '#F8BBD0');
      else {
        const L = RULE_CFG.gravflip;
        timeBar(g, 1 - (cy.k - L.onAt) / (L.offAt - L.onAt), heavy ? '#90A4FF' : '#FF8AD8', 92);
        label(g, heavy ? T.flipHeavy : T.flipLight, NET_X, 106, 10, '#F8BBD0');
      }
    }
  } else if (r.id === 'stasis') {
    if (live && cy.warn) {
      // 紫環往內收：收到最小就是判定的那一幀
      const L = RULE_CFG.stasis, k = (cy.k - L.warnAt) / (L.at - L.warnAt);
      g.globalAlpha = 0.9; g.strokeStyle = '#CE93D8'; g.lineWidth = 3;
      g.beginPath(); g.arc(ball.x, ball.y, 60 - 40 * k, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      if (!lite) { g.strokeStyle = 'rgba(206,147,216,' + (0.25 + 0.25 * Math.sin(t)) + ')'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6); }
      label(g, T.stasisWarn, NET_X, 64, 13, '#E1BEE7');
    }
    if (r.hold) {
      g.globalAlpha = 0.85; g.strokeStyle = '#E1BEE7'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(ball.x, ball.y, 20 + i * 5 + (t % 4), 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 1;
      label(g, T.stasisHold, NET_X, 64, 12, '#E1BEE7');
    }
    if (r.fizzle > 0) label(g, T.stasisFizzle, NET_X, 64, 11, '#BDBDBD');
  } else if (r.id === 'wind') {
    const won = cy.on && live, wwarn = cy.warn && live, dir = r.dir;
    if (won || (wwarn && t % 6 < 4)) {
      g.save(); g.translate(NET_X, 60); g.scale(dir, 1);
      g.fillStyle = won ? '#B2FF59' : '#FFFFFF'; g.strokeStyle = '#000'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-26, -5); g.lineTo(8, -5); g.lineTo(8, -12); g.lineTo(26, 0); g.lineTo(8, 12); g.lineTo(8, 5); g.lineTo(-26, 5); g.closePath(); g.stroke(); g.fill();
      g.restore();
      label(g, wwarn ? T.windWarn : T.windOn, NET_X, 80, wwarn ? 13 : 10, won ? '#B2FF59' : '#fff');
    }
    if (won) {
      g.strokeStyle = 'rgba(220,255,200,0.45)'; g.lineWidth = 1.5;
      for (let w = 0, wn = lite ? 6 : 16; w < wn; w++) {
        const wy = 40 + (w * 47) % 200, base = (w * 97 + t * 9) % (W + 80) - 40, wx = dir > 0 ? base : W - base;
        g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx - dir * (18 + (w % 3) * 8), wy); g.stroke();
      }
    }
  } else if (r.id === 'gold') {
    const serving = (c.state === c.beforeStartOfNextRound || c.state === c.afterEndOfRound || c.state === c.startOfNewGame) && isGoldenRally(r.rally, goldEvery) && !c.gameEnded;
    if (serving) { label(g, T.goldBall, NET_X, 112, 30, '#FFD54F'); label(g, T.goldWorth, NET_X, 140, 15, '#fff'); }
    if (r.golden && c.state === c.round && !c.roundEnded) {
      g.globalAlpha = 0.85; g.strokeStyle = '#FFD54F'; g.lineWidth = 3;
      g.beginPath(); g.arc(ball.x, ball.y, 22 + Math.sin(t / 2) * 2, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      label(g, '×2', ball.x, ball.y - 30, 10, '#FFD54F');
    }
    if (r.pop && ++r.pop.t < 30) label(g, '+2', r.pop.side === 1 ? 382 : 50, 62 - r.pop.t, 22, '#FFD54F');
  }
  label(g, T.ruleName[r.id] || '', NET_X, 44, 9, RULE_COLOR[r.id]);
}

function drawRain(g: G, r: RuleState, t: number, lite: boolean): void {
  const Rn = RULE_CFG.rain;
  g.strokeStyle = 'rgba(180,225,255,0.35)'; g.lineWidth = 1;
  for (let i = 0, n = lite ? 14 : 40; i < n; i++) {
    const rx = (i * 61 + t * 7) % (W + 40) - 20, ry = (i * 37 + t * 11) % (H + 20) - 10;
    g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 3, ry + 9); g.stroke();
  }
  r.puddles.forEach((pd) => {
    const on = pd.t >= Rn.warn, endIn = Rn.warn + Rn.life - pd.t;
    g.globalAlpha = on ? (endIn < 25 && endIn % 6 < 3 ? 0.35 : 0.8) : 0.12 + 0.3 * pd.t / Rn.warn;
    g.fillStyle = '#29B6F6';
    g.beginPath(); g.ellipse(pd.x, FLOOR_Y, Rn.half, 5, 0, 0, Math.PI * 2); g.fill();
    // 顏色之外的提示：還沒生效是虛線框，生效後有反光和「彈」的記號
    if (!on) { g.strokeStyle = '#B3E5FC'; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
    else { g.fillStyle = '#E1F5FE'; g.beginPath(); g.ellipse(pd.x - 7, FLOOR_Y - 1, 7, 1.6, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; label(g, '⤴', pd.x, FLOOR_Y - 10 - (t % 8 < 4 ? 1 : 0), 9, '#E1F5FE'); }
    g.globalAlpha = 1;
  });
  r.splash = r.splash.filter((sp) => {
    sp.t++;
    g.globalAlpha = 1 - sp.t / 14; g.strokeStyle = '#B3E5FC'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(sp.x, FLOOR_Y, 10 + sp.t * 3, 3 + sp.t, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    return sp.t < 14;
  });
}
