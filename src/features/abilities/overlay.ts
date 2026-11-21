// ============================================================
// 特效（一張疊在遊戲畫面上的透明 canvas）
// 注意：zap()、fireTrail() 會呼叫 Math.random()，而且畫圖是在每幀 tick 裡做的，
// 所以這裡的呼叫順序也影響亂數序列，跟舊版保持一模一樣。
// ============================================================
import { flags, svc } from '../../core/services';
import type { Ball, Controller, Player } from '../../core/types';
import { rt } from './state';
import type { AbilitySide, SideKey } from './state';
import type { Slash } from '../../core/side-state';
import { FLOOR_Y, GROUND_Y, H, NET_X, W } from './util';

type G = CanvasRenderingContext2D;

let overlay: HTMLCanvasElement | null = null, octx: G | null = null, lastRect = '';

/** 視窗大小改變時要重新對齊（舊版在 resize 事件裡把 lastRect 清掉）。 */
export function invalidateRect(): void { lastRect = ''; }

function ensureOverlay(): boolean {
  if (overlay) return true;
  if (!document.body) return false;
  overlay = document.createElement('canvas');
  overlay.id = 'pv-fx-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:45;';
  document.body.appendChild(overlay);
  octx = overlay.getContext('2d');
  return true;
}

function syncOverlay(): boolean {
  // ensureOverlay() 成功之後才會呼叫，overlay／octx 一定已經建好
  const ov = overlay!, cx = octx!;
  const gc = document.getElementById('game-canvas');
  if (!gc) return false;
  // 用「沒有震動／鏡頭衝擊時」的位置，震動由特效系統用 CSS transform 套上去
  // （#game-canvas 是遊戲本體的 canvas；baseRect 的參數型別是 HTMLCanvasElement）
  const r = svc.baseRect ? svc.baseRect(gc as HTMLCanvasElement) : gc.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const dpr = window.devicePixelRatio || 1;
  const key = [r.left, r.top, r.width, r.height, dpr].join(',');
  if (key !== lastRect) {
    lastRect = key;
    ov.style.left = r.left + 'px';
    ov.style.top = r.top + 'px';
    ov.style.width = r.width + 'px';
    ov.style.height = r.height + 'px';
    ov.width = Math.round(r.width * dpr);
    ov.height = Math.round(r.height * dpr);
  }
  cx.setTransform(ov.width / W, 0, 0, ov.height / H, 0, 0);
  return true;
}

let drawTick = 0;
export function draw(ctrl: Controller, inMenu: boolean): void {
  if (flags.sim) return;
  drawTick++;
  if (!ensureOverlay() || !syncOverlay()) return;
  const g = octx!;   // syncOverlay() 成功代表已經建好
  g.clearRect(0, 0, W, H);
  if (inMenu) return;
  const ball = ctrl.physics.ball;

  (['p1', 'p2'] as SideKey[]).forEach(function (key) {
    const s = rt.state[key];
    const player = ctrl.physics[key === 'p1' ? 'player1' : 'player2'];
    drawFieldMarks(g, s, ball);
    drawStatus(g, s, player, drawTick);
  });

  rt.fx.bursts = rt.fx.bursts.filter(function (b) {
    const k = b.t / b.max, r = 4 + b.size / 2 * k;
    g.globalAlpha = 1 - k;
    g.strokeStyle = b.color; g.lineWidth = 3;
    g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = b.color; g.globalAlpha = (1 - k) * 0.25;
    g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    return ++b.t < b.max;
  });
  const liteFx = svc.fxLite && svc.fxLite();
  if (liteFx) rt.fx.flashes = [];   // 精簡特效：不閃全畫面
  rt.fx.flashes = rt.fx.flashes.filter(function (f) {
    g.globalAlpha = f.alpha * (1 - f.t / f.max);
    g.fillStyle = f.color; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    return ++f.t < f.max;
  });
}

function drawFieldMarks(g: G, s: AbilitySide, ball: Ball): void {
  (s.puddles || []).forEach(function (p) {
    g.globalAlpha = 0.35 + 0.5 * Math.min(1, p.timer / 15);
    g.fillStyle = '#29B6F6';
    g.beginPath(); g.ellipse(p.x, FLOOR_Y, 20, 4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#B3E5FC';
    g.beginPath(); g.ellipse(p.x - 5, FLOOR_Y - 1, 7, 1.5, 0, 0, Math.PI * 2); g.fill();
  });
  (s.coins || []).forEach(function (c) {
    g.globalAlpha = c.timer < 20 && c.timer % 4 < 2 ? 0.4 : 1;
    g.fillStyle = '#FFC107'; g.strokeStyle = '#8D6E00'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(c.x, FLOOR_Y, 9, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  });
  (s.mounds || []).forEach(function (m) {
    g.globalAlpha = 0.5 + 0.5 * Math.min(1, m.timer / 20);
    g.fillStyle = '#C8A26B'; g.strokeStyle = '#7B5B2E'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(m.x, FLOOR_Y + 2, 24, 9, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
  });
  g.globalAlpha = 1;
  if (s.barrierTimer > 0) {
    g.globalAlpha = 0.15 + 0.15 * Math.abs(Math.sin(s.barrierTimer / 3));
    g.fillStyle = '#FF80AB';
    g.fillRect(NET_X - 35, 30, 70, 146);
    g.globalAlpha = 0.7;
    g.strokeStyle = '#FF4081'; g.lineWidth = 1.5;
    g.strokeRect(NET_X - 35, 30, 70, 146);
    g.globalAlpha = 1;
  }
  if (s.auraTimer > 0) ring(g, ball.x, ball.y, 26, '#FF80AB', 0.8);
  if (s.fireBall) fireTrail(g, ball, s.fireBall === 2);
  if (s.slash) slashArc(g, s.slash);
  if (s.charged) zap(g, ball.x, ball.y);
  if (s.bombTimer > 0 && s.bombTimer % 4 < 2) ring(g, ball.x, ball.y, 22, '#FF1744', 0.9);
}

// 角色狀態一律用圖示表示，不寫字
function drawStatus(g: G, s: AbilitySide, player: Player, tick: number): void {
  const x = player.x, top = player.y - 40;
  if (s.isGyarados) {
    const pulse = 34 + Math.sin(tick / 2) * 3, gc = s.isRed ? '#FF1744' : '#29B6F6';
    ring(g, x, player.y, pulse, gc, 0.7);
    ring(g, x, player.y, pulse - 5, s.isRed ? '#FFD54F' : '#B3E5FC', 0.5);
    if (s.isRed) for (let sk = 0; sk < 3; sk++) {           // 紅色暴鯉龍：身邊閃金光
      const sa = tick / 5 + sk * 2.1;
      starIcon(g, x + Math.cos(sa) * 30, player.y + Math.sin(sa) * 26, 3, '#FFD54F');
    }
  }
  if (s.ghostTimer > 0) ring(g, x, player.y, 34, '#7C4DFF', 0.6);
  if (s.qaWindow > 0) zap(g, x, player.y);
  if (s.char === 'mew' && !s.mewCD) ring(g, x, player.y, 28 + Math.sin(tick / 3) * 2, '#FF80AB', 0.7);   // 夢幻：護盾準備好了
  if (s.char === 'mewtwo' && !s.psyCooldown) ring(g, x, player.y, 30 + Math.sin(tick / 3) * 2, '#B048FF', 0.7);   // 超夢：念力球準備好了
  if (s.fastFalling && player.y < GROUND_Y) {          // 胖丁快速落地：頭上的速度線
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 2; g.globalAlpha = 0.85;
    for (let ff = -1; ff <= 1; ff++) { g.beginPath(); g.moveTo(x + ff * 9, player.y - 30 - (tick % 3) * 3); g.lineTo(x + ff * 9, player.y - 48 - (tick % 3) * 3); g.stroke(); }
    g.globalAlpha = 1;
  }            // 雷伊布：電光殺球準備好了
  if (s.thunderReady) zap(g, x, player.y);          // 閃電鳥：雷擊俯衝準備好了
  if (s.outrageTimer > 0) {
    const st = s.rageStacks || 0;
    g.globalAlpha = 0.5 + 0.15 * st; g.strokeStyle = st >= 3 ? '#FF1744' : '#FF6D00'; g.lineWidth = 2 + st * 1.5;
    g.beginPath(); g.arc(x, player.y, 34 + (tick % 4), 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    for (let rs = 0; rs < 3; rs++) flame(g, x - 12 + rs * 12, top - 4, rs < st);
  }
  if (s.flashFire > 0) {             // 火伊布引火：火力全開，身邊冒火
    const blink = s.flashFire < 20 && s.flashFire % 4 < 2;
    if (!blink) {
      ring(g, x, player.y, 32 + Math.sin(tick / 2) * 2, '#FF5A1F', 0.75);
      for (let em = 0; em < 4; em++) {
        const ph = (tick * 3 + em * 11) % 30;
        flame(g, x - 21 + em * 14, player.y + 24 - ph, true, 0.55 + (30 - ph) / 60);
      }
    }
  }
  if (s.burnTimer > 0) {             // 灼傷：身上竄火、頭上一朵火（快結束時閃爍）
    for (let bf = 0; bf < 2; bf++) {
      const bp = (tick * 2 + bf * 9) % 18;
      flame(g, x - 10 + bf * 20 + Math.sin(tick + bf) * 2, player.y + 10 - bp, true, 0.6);
    }
    if (!(s.burnTimer < 15 && s.burnTimer % 4 < 2)) flame(g, x, top - 2, true, 1.1);
  }
  if (s.reverseTimer > 0) {           // 繞著頭轉的音符
    for (let i = 0; i < 2; i++) {
      const a = tick / 4 + i * Math.PI;
      note(g, x + Math.cos(a) * 14, top + Math.sin(a) * 4, '#FF80C0');
    }
  }
  if (s.stunTimer > 0) {              // 頭上轉圈的星星
    for (let k = 0; k < 3; k++) {
      const b = tick / 3 + k * Math.PI * 2 / 3;
      starIcon(g, x + Math.cos(b) * 13, top + Math.sin(b) * 4, 4, '#FFEB3B');
    }
  }
  if (s.moonMark > 0 && !(s.moonMark < 10 && s.moonMark % 4 < 2)) {   // 月伊布的月環：頭上一圈黃色的環
    g.globalAlpha = 0.9; g.strokeStyle = '#000'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(x, top - 3, 11, 4, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#FFD54F'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, top - 3, 11, 4, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  }
  if (s.slowTimer > 0) {             // 踩到金幣：頭上一枚轉動的金幣
    const sw = Math.abs(Math.cos(tick / 3)) * 4 + 1;
    g.fillStyle = '#000'; g.beginPath(); g.ellipse(x, top, sw + 1, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FFC107'; g.beginPath(); g.ellipse(x, top, sw, 4, 0, 0, Math.PI * 2); g.fill();
  }
  if (s.headacheCharge > 0) {         // 頭痛層數：三顆點
    const n = Math.min(3, s.headacheCharge);
    for (let m = 0; m < 3; m++) dot(g, x - 8 + m * 8, top, 3, m < n ? '#FFD54F' : 'rgba(255,255,255,0.35)');
  }
  if (s.quake > 0) {
    g.globalAlpha = s.quake / 8 * 0.6;
    g.strokeStyle = '#6D4C41'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, FLOOR_Y + 2, 30 + (8 - s.quake) * 6, 4, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }
}

// 帶電球：繞著球閃的鋸齒電弧
function zap(g: G, x: number, y: number): void {
  g.lineWidth = 2; g.strokeStyle = '#FFE14D'; g.globalAlpha = 0.9;
  for (let k = 0; k < 3; k++) {
    const a = Math.random() * Math.PI * 2;
    g.beginPath();
    for (let j = 0; j < 4; j++) {
      const r = 22 + j * 4, aa = a + (Math.random() - 0.5) * 0.6;
      const px = x + Math.cos(aa) * r, py = y + Math.sin(aa) * r;
      if (j) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

// 逆鱗層數：亮的火焰＝已疊的層，暗的＝還沒疊
function flame(g: G, x: number, y: number, on: boolean, k?: number): void {
  k = k || 1;
  g.beginPath();
  g.moveTo(x, y - 7 * k); g.quadraticCurveTo(x + 6 * k, y, x + 3 * k, y + 5 * k); g.lineTo(x - 3 * k, y + 5 * k); g.quadraticCurveTo(x - 6 * k, y, x, y - 7 * k);
  g.closePath();
  g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
  g.fillStyle = on ? '#FF3D00' : 'rgba(255,255,255,0.25)'; g.fill();
  if (on) { g.fillStyle = '#FFD54F'; g.beginPath(); g.arc(x, y + 2 * k, 2 * k, 0, Math.PI * 2); g.fill(); }
}

// 火球：球後面拖著一串火（大字爆比較大）
function fireTrail(g: G, ball: Ball, big: boolean): void {
  const vx = ball.xVelocity, vy = ball.yVelocity, len = Math.sqrt(vx * vx + vy * vy) || 1;
  const ux = -vx / len, uy = -vy / len, n = big ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const d = 14 + i * 9, j = (Math.random() - 0.5) * 8;
    g.globalAlpha = 0.95 - i * 0.15;
    flame(g, ball.x + ux * d + j, ball.y + uy * d + j, true, (big ? 1.5 : 1.1) - i * 0.15);
  }
  g.globalAlpha = 1;
  if (big) ring(g, ball.x, ball.y, 24 + Math.random() * 3, '#FF5A1F', 0.85);
}

// 大蔥揮擊：從大蔥鴨劃向球的一道弧光（居合斬是更粗的白光）
function slashArc(g: G, sl: Slash): void {
  const k = Math.max(0, sl.t) / (sl.iai ? 7 : 5);
  const mx = (sl.x + sl.bx) / 2, my = (sl.y + sl.by) / 2, dx = sl.bx - sl.x, dy = sl.by - sl.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len, bow = sl.iai ? 26 : 18;
  g.lineCap = 'round';
  const strokes: [number, string, number][] = [[sl.iai ? 9 : 6, sl.iai ? '#FFFFFF' : '#C5E1A5', 0.55], [sl.iai ? 4 : 2.5, '#FFFFFF', 0.95]];
  strokes.forEach(function (w) {
    g.globalAlpha = w[2] * k; g.strokeStyle = w[1]; g.lineWidth = w[0];
    g.beginPath();
    g.moveTo(sl.x - dx * 0.15 + nx * 6, sl.y - dy * 0.15 + ny * 6);
    g.quadraticCurveTo(mx - nx * bow, my - ny * bow, sl.bx + dx * 0.35, sl.by + dy * 0.35);
    g.stroke();
  });
  g.globalAlpha = 1; g.lineCap = 'butt';
}

function dot(g: G, x: number, y: number, r: number, color: string): void {
  g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r + 1, 0, Math.PI * 2); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function starIcon(g: G, x: number, y: number, r: number, color: string): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
  g.fillStyle = color; g.fill();
}
function note(g: G, x: number, y: number, color: string): void {
  g.lineWidth = 2; g.strokeStyle = '#000'; g.fillStyle = color;
  g.beginPath(); g.ellipse(x - 2, y + 4, 3, 2.2, -0.4, 0, Math.PI * 2); g.stroke(); g.fill();
  g.fillRect(x, y - 5, 1.6, 9);
  g.beginPath(); g.moveTo(x + 1.6, y - 5); g.quadraticCurveTo(x + 6, y - 3, x + 4, y + 1); g.stroke();
}

function ring(g: G, x: number, y: number, r: number, color: string, alpha: number): void {
  g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
}
