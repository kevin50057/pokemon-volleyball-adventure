// 打擊感：粒子（火花、塵土、放射速度線）與粒子層的繪製
import { FLOOR_Y, H, W } from './config';
import { lite } from './lite-mode';
import { S } from './state';
import { now, rand } from './util';

// ============================================================
// 粒子
// ============================================================
export function sparks(x: number, y: number, ang: number, color: string, n: number, spd: number, spread?: number): void {
  spread = spread || Math.PI * 0.75;
  for (let i = 0; i < n; i++) {
    const a = ang + rand(-spread, spread) * (Math.random() < 0.25 ? 2.2 : 1);
    const v = rand(spd * 0.75, spd * 1.95);
    S.particles.push({
      kind: 'spark', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      g: 0.25, drag: 0.88, life: rand(240, 440), t0: now(),
      color: color, size: Math.random() < 0.4 ? 4 : 3,
    });
  }
}
export function dust(x: number, y: number, n: number, power: number): void {
  for (let i = 0; i < n; i++) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    S.particles.push({
      kind: 'dust', x: x + rand(-8, 8), y: y - rand(0, 4),
      vx: dir * rand(0.8, 3.2) * power, vy: -rand(0.3, 1.8) * power,
      g: 0.05, drag: 0.93, life: rand(300, 600), t0: now(),
      color: Math.random() < 0.55 ? '#FFFFFF' : '#6B4A2B', size: rand(3, 6) * Math.min(1.4, power),
    });
  }
}
export function speedLines(x: number, y: number, color: string, n?: number): void {
  n = n || 10;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rand(-0.15, 0.15);
    S.lines.push({ x: x, y: y, a: a, r0: rand(14, 22), len: rand(18, 34), t0: now(), dur: 150, color: i % 2 ? color : '#FFFFFF' });
  }
}

// ============================================================
// 繪製（requestAnimationFrame 每次呼叫）
// ============================================================
export function drawParticles(g: CanvasRenderingContext2D, tn: number, dt: number): void {
  // 全畫面閃光
  S.flashes = S.flashes.filter(function (f) {
    const k = (tn - f.t0) / f.dur;
    if (k < 0) return true;          // 延遲出現（必殺：先暗再閃）
    if (k >= 1) return false;
    if (f.full && lite()) return true;
    if (f.full) {
      g.globalAlpha = f.alpha * (1 - k);
      g.fillStyle = f.color; g.fillRect(0, 0, W, H);
    } else {
      g.globalAlpha = 1 - k;
      g.fillStyle = '#FFFFFF';
      g.beginPath(); g.arc(f.x, f.y, f.r * (0.6 + 0.4 * k), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    return true;
  });

  // 放射速度線
  S.lines = S.lines.filter(function (l) {
    const k = (tn - l.t0) / l.dur;
    if (k < 0) return true;
    if (k >= 1) return false;
    const r0 = l.r0 + k * 30, r1 = r0 + l.len * (1 - k);
    g.globalAlpha = 1 - k;
    g.strokeStyle = l.color; g.lineWidth = 2.5 * (1 - k) + 0.5;
    g.beginPath();
    g.moveTo(l.x + Math.cos(l.a) * r0, l.y + Math.sin(l.a) * r0);
    g.lineTo(l.x + Math.cos(l.a) * r1, l.y + Math.sin(l.a) * r1);
    g.stroke();
    g.globalAlpha = 1;
    return true;
  });

  // 衝擊波
  S.rings = S.rings.filter(function (o) {
    const k = (tn - o.t0) / o.dur;
    if (k < 0) return true;          // 延遲出現的環還沒開始
    if (k >= 1) return false;
    const e = 1 - Math.pow(1 - k, 3), r = o.r0 + (o.r1 - o.r0) * e;
    g.globalAlpha = (1 - k) * 0.95;
    g.beginPath();
    if (o.flat) g.ellipse(o.x, o.y, r, r * 0.22, 0, 0, Math.PI * 2);
    else g.arc(o.x, o.y, r, 0, Math.PI * 2);
    const lw = Math.min(o.w, 4) * (1 - k) + 1;   // 環的線寬上限 4：不要蓋住球和角色
    if (o.color !== '#FFFFFF') { g.strokeStyle = '#FFFFFF'; g.lineWidth = lw + 2; g.stroke(); }
    g.strokeStyle = o.color; g.lineWidth = lw; g.stroke();
    g.globalAlpha = 1;
    return true;
  });

  // 火花與塵土（頓幀期間也繼續飛，畫面才不會像當機）
  S.particles = S.particles.filter(function (p) {
    const age = tn - p.t0;
    if (age >= p.life) return false;
    p.vx *= Math.pow(p.drag, dt); p.vy = p.vy * Math.pow(p.drag, dt) + p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'dust' && p.y > FLOOR_Y + 2) { p.y = FLOOR_Y + 2; p.vy *= -0.2; }
    const k = age / p.life;
    if (p.kind === 'spark') {
      // 像素方塊：黑框＋屬性色＋白芯，任何背景都看得到
      const sz = Math.max(2, Math.round(p.size * (1 - k * 0.5))), px = Math.round(p.x - sz / 2), py = Math.round(p.y - sz / 2);
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.fillStyle = '#000'; g.fillRect(px - 1, py - 1, sz + 2, sz + 2);
      g.fillStyle = p.color; g.fillRect(px, py, sz, sz);
      if (sz >= 3 && k < 0.5) { g.fillStyle = '#FFF'; g.fillRect(px + 1, py + 1, sz - 2, sz - 2); }
    } else {
      g.globalAlpha = (1 - k) * 0.85;
      g.fillStyle = p.color;
      const sz = p.size * (1 + k * 1.2);
      g.beginPath(); g.arc(p.x, p.y, sz, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    return true;
  });
}
