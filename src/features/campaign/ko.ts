// 分出勝負那一球的演出：把被打倒的對手打飛、場上的勝利／落敗字樣
import type { Controller } from '../../core/types';
import { CFG, FLOOR_Y, H, NET_X, STAGES, W } from './config';
import { camp } from './state';
import type { KoState } from './state';
import { charName } from './chars';
import { mix, setTint } from './field';
import { confetti, label, slam, star4 } from './draw';
import { fmt } from '../../core/i18n';
import { T, josa } from './texts';

// 物理和遊戲本體畫完之後：把被打倒的對手打飛（直接動畫面上的那張圖）
export function post(c: Controller): void {
  const g = c.view.game, k = camp.ko, b = camp.boss;
  if (b) {
    try { g.player2.tint = b.hit > 0 && b.hit % 4 < 2 ? 0xFF6060 : 0xFFFFFF; g.player1.tint = b.hurt > 0 && b.hurt % 4 < 2 ? 0xFF6060 : 0xFFFFFF; } catch (e) { /* 畫面還沒建好 */ }
  }
  if (!k) return;
  try {
    g.messages.gameEnd.visible = false;            // 「Game Set」換成自己的勝利／落敗字樣
    if (!k.win) return;
    const K = CFG.ko, t = k.t - K.stop - (k.boss ? K.bossBoom : 0), sp = g.player2;
    if (k.boss && t <= 0) { sp.x = k.px + (k.t % 2 ? 3 : -3); sp.y = k.py; return; }   // 超夢先原地連環爆炸
    if (t > 0) {
      sp.x = k.px + t * 7; sp.y = k.py - t * 12; sp.rotation = t * 0.7;
      g.shadows.forPlayer2.visible = false;
      if (k.boss) setTint(c, mix(k.tint0, 0xFFFFFF, Math.min(1, t / 20)));             // 天色放晴
    }
  } catch (e) { /* 畫面還沒建好 */ }
}

// 只在 camp.ko 有值時呼叫
export function drawKo(c: Controller, g: CanvasRenderingContext2D, lite: boolean): void {
  const k = camp.ko as KoState, K = CFG.ko, t = k.t;
  if (!k.win) {
    g.globalAlpha = Math.min(0.42, t / 20); g.fillStyle = '#1b2233'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    if (t > 3) slam(g, T.defeat, NET_X, 112, 34, '#B0BEC5', t - 3);
    return;
  }
  if (t <= K.stop) {
    // 停格：白閃、落點衝擊波、放射線
    if (!lite) { g.globalAlpha = 0.7 * (1 - t / K.stop); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.globalAlpha = 1 - t / (K.stop + 2);
    g.beginPath(); g.ellipse(k.x, FLOOR_Y, t * 16, t * 5, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7 + 0.2, r0 = 30 + t * 6, r1 = r0 + 40 + (i % 3) * 22; g.beginPath(); g.moveTo(k.x + Math.cos(a) * r0, FLOOR_Y - 10 + Math.sin(a) * r0 * 0.7); g.lineTo(k.x + Math.cos(a) * r1, FLOOR_Y - 10 + Math.sin(a) * r1 * 0.7); g.stroke(); }
    g.globalAlpha = 1;
    return;
  }
  let u = t - K.stop;
  if (k.boss) {
    if (u <= K.bossBoom) {
      // 連環爆炸
      for (let e = 0; e < 5; e++) {
        const age = (u + e * 7) % 12, ex = k.px + Math.sin((Math.floor((u + e * 7) / 12) * 7 + e) * 2.3) * 34, ey = k.py + Math.cos((Math.floor((u + e * 7) / 12) * 5 + e) * 1.9) * 28;
        g.globalAlpha = 1 - age / 12; g.fillStyle = ['#fff', '#FFE082', '#E040FB'][e % 3];
        g.beginPath(); g.arc(ex, ey, 6 + age * 3, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      return;
    }
    u -= K.bossBoom;
    if (!lite && u < 20) { g.globalAlpha = 0.95 * (1 - u / 20); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  }
  // 對手飛出去之後天邊閃一下
  if (u > 20 && u < 34) { const tx = Math.min(W - 14, k.px + 20 * 7), q = 1 - Math.abs(u - 27) / 7; star4(g, tx, 14, 14 * q, '#fff'); star4(g, tx, 14, 7 * q, '#FFE082'); }
  confetti(g, u, k.boss ? 60 : 34);
  slam(g, k.boss ? fmt(T.koBoss, { boss: charName('mewtwo') }) : T.koWin, NET_X, 104, k.boss ? 48 : 40, '#FFD54F', u);
  if (k.boss && u > 6) label(g, T.koConquer, NET_X, 146, 15, '#fff');
  if (!k.boss && u > 6) {
    const on = charName(camp.opp);
    label(g, fmt(T.koBeat, { name: on, eul: josa(on, '을', '를') }) + (k.isNew ? T.koNew : ''), NET_X, 138, 12, k.isNew ? '#FFE082' : '#fff');
    // 進度：10 顆點，剛打完的這一顆彈一下
    for (let n = 0; n < STAGES; n++) {
      const dx = NET_X - (STAGES - 1) * 7 + n * 14, big = n === STAGES - 1, r = (big ? 5 : 3.5) + (n === k.idx ? Math.max(0, 14 - u) * 0.35 : 0);
      g.fillStyle = '#000'; g.beginPath(); g.arc(dx, 160, r + 1.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = n <= k.idx ? '#7be495' : big ? '#B048FF' : 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(dx, 160, r, 0, Math.PI * 2); g.fill();
    }
    const togo = STAGES - 2 - k.idx;
    label(g, fmt(togo > 0 ? T.koToBoss : T.koNextBoss, { boss: charName('mewtwo'), n: togo }), NET_X, 176, 9, '#fff');
  }
}
