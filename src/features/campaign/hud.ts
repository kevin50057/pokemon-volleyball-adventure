// ============================================================
// 場上的抬頭顯示（心、關卡、超夢血條）和打倒演出
// ============================================================
import { flags, svc } from '../../core/services';
import type { SideState } from '../../core/side-state';
import type { Controller } from '../../core/types';
import { CFG, FLOOR_Y, H, NET_X, STAGES, W, tierInfo, tierOf, zoneOf } from './config';
import { AB, camp, save } from './state';
import { charName } from './chars';
import { bar, confetti, heart, label, slam } from './draw';
import { drawRule } from './rules';
import { drawKo } from './ko';

let hud: HTMLCanvasElement | null = null, hctx: CanvasRenderingContext2D | null = null, hudRect = '';
function syncHud(): boolean {
  if (flags.sim) return false;
  const gc = document.getElementById('game-canvas');
  if (!gc || !document.body) return false;
  if (!hud) {
    hud = document.createElement('canvas');
    hud.id = 'pv-camp-hud';
    hud.style.cssText = 'position:fixed;pointer-events:none;z-index:46;';
    document.body.appendChild(hud);
    hctx = hud.getContext('2d');
  }
  // #game-canvas 是遊戲本體的 canvas
  const r = svc.baseRect ? svc.baseRect(gc as HTMLCanvasElement) : gc.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const dpr = window.devicePixelRatio || 1, key = [r.left, r.top, r.width, r.height, dpr].join(',');
  if (key !== hudRect) {
    hudRect = key;
    hud.style.left = r.left + 'px'; hud.style.top = r.top + 'px';
    hud.style.width = r.width + 'px'; hud.style.height = r.height + 'px';
    hud.width = Math.round(r.width * dpr); hud.height = Math.round(r.height * dpr);
  }
  // 2D context 一定拿得到（拿不到的話舊版在這裡一樣會丟例外）
  (hctx as CanvasRenderingContext2D).setTransform(hud.width / W, 0, 0, hud.height / H, 0, 0);
  return true;
}
export function clearHud(): void { if (hud && hctx) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, hud.width, hud.height); } }
/** 視窗大小變了：下次畫的時候重新對齊 */
export function resetHudRect(): void { hudRect = ''; }

export function drawHud(c: Controller): void {
  if (!syncHud()) return;
  const g = hctx as CanvasRenderingContext2D, run = save.run || camp.lastRun, t = camp.tick;
  g.clearRect(0, 0, W, H);
  if (!run || !c.view.game.visible) return;
  const b = camp.boss, lite = !!(svc.fxLite && svc.fxLite()), k = camp.ko;
  if (b) {
    const B = CFG.boss, phase = b.phase, calm = k && k.win;       // 打倒超夢後場地氣氛就收掉
    // 場地氣氛：往上飄的念力光點、偶爾的閃電
    if (phase >= 2 && !calm) {
      for (let i = 0; i < 16; i++) {
        const px = (i * 97 + Math.sin((t + i * 40) / 23) * 14 + 400) % W, py = H - ((t * (phase === 3 ? 2.2 : 1.3) + i * 53) % (H + 20));
        g.globalAlpha = 0.25 + 0.25 * Math.sin((t + i * 9) / 6);
        g.fillStyle = phase === 3 ? '#FF6FB5' : '#C58BFF';
        g.fillRect(px, py, 2, 2 + (i % 3));
      }
      g.globalAlpha = 1;
      const lt = t % (phase === 3 ? 70 : 110);
      if (!lite && lt < 3 && !camp.waiting) {
        const lx = 40 + ((Math.floor(t / 110) * 131) % 350);
        g.globalAlpha = 0.10; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
        g.globalAlpha = 0.9; g.strokeStyle = '#F3E5FF'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(lx, 0);
        for (let j = 1; j <= 6; j++) g.lineTo(lx + ((j * 37 + Math.floor(t / 110) * 13) % 31) - 15, j * 30);
        g.stroke(); g.globalAlpha = 1;
      }
    }
    // 念力導向後的落點預告
    const a = AB(), s2: Partial<SideState> = a ? a.state().p2 || {} : {};
    if (s2.redirected && (s2.psychicTimer as number) > 0) {
      const bx = c.physics.ball.expectedLandingPointX;
      if (bx > 0 && bx < NET_X) {
        const pr = 12 + (t % 6);
        g.globalAlpha = 0.9; g.strokeStyle = '#E040FB'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(bx, FLOOR_Y, pr, pr * 0.35, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(bx, FLOOR_Y - 16 - (t % 4)); g.lineTo(bx - 5, FLOOR_Y - 26 - (t % 4)); g.lineTo(bx + 5, FLOOR_Y - 26 - (t % 4)); g.closePath();
        g.fillStyle = '#E040FB'; g.fill(); g.globalAlpha = 1;
      }
    }
    // 自己被扣血：畫面邊緣閃紅
    if (b.hurt > 0 && !lite) {
      const vg = g.createRadialGradient(NET_X, H / 2, 90, NET_X, H / 2, 260);
      vg.addColorStop(0, 'rgba(255,0,40,0)'); vg.addColorStop(1, 'rgba(255,0,40,' + (0.55 * b.hurt / 12) + ')');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    // 血條：左邊自己、右邊超夢（被打到會震）
    const myHp = Math.max(0, B.playerHp - c.scores[1]), bossHp = Math.max(0, B.hp - c.scores[0]);
    const sh = b.hit > 0 ? Math.sin(b.hit * 2.6) * 3 : 0, sh2 = b.hurt > 0 ? Math.sin(b.hurt * 2.6) * 3 : 0;
    label(g, charName(run.char), 16, 11, 10, '#fff', 'left');
    bar(g, 16 + sh2, 19, 150, 9, B.playerHp, myHp, myHp <= 1 ? '#FF5252' : '#69F0AE', false, myHp + (b.hurt > 0 ? 1 : 0), b.hurt / 12);
    label(g, '超夢', 416, 11, 10, '#E1BEE7', 'right');
    // b.hit > 0 時 hitFrom 一定已經設定過
    bar(g, 266 + sh, 19 + Math.abs(sh) * 0.4, 150, 9, B.hp, bossHp, phase === 3 ? '#FF4081' : '#B048FF', true, B.hp - (b.hit > 0 ? b.hitFrom as number : c.scores[0]), b.hit / 12);
    for (let q = 1; q < 3; q++) { g.fillStyle = '#000'; g.fillRect(266 + sh + 150 * q / 3 - 1.5, 15, 3, 17); }
    label(g, ['第一階段', '第二階段', '第三階段'][phase - 1], NET_X, 12, 9, phase === 3 ? '#FF80AB' : '#E1BEE7');
    for (let h1 = 0; h1 < CFG.hearts; h1++) heart(g, NET_X - 14 + h1 * 14, 27, 5, h1 < run.hearts);
    label(g, '★', NET_X + 34, 27, 11, tierInfo(tierOf(run.lost)).color);
    // 換階段的演出
    if (b.cut > 0) {
      const k2 = 1 - b.cut / B.cutFrames;
      g.globalAlpha = 0.55 * Math.sin(Math.PI * Math.min(1, k2 * 1.2)); g.fillStyle = '#14002A'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      slam(g, b.next === 3 ? '第三階段' : '第二階段', NET_X, 118, 32, b.next === 3 ? '#FF80AB' : '#D7A8FF', B.cutFrames - b.cut);
      label(g, b.next === 3 ? '全場加速，念力更頻繁' : '念力增強', NET_X, 150, 12, '#fff');
    }
    if (b.flash > 0) { if (!lite) { g.globalAlpha = 0.5 * b.flash / 6; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; } b.flash--; }
  } else if (run === save.run) {
    // 剛輸掉的那顆心閃一閃
    const lostNow = k && !k.win && !camp.waiting ? 1 : 0;
    for (let h2 = 0; h2 < CFG.hearts; h2++) heart(g, NET_X - 14 + h2 * 14, 14, 5.5, h2 < run.hearts - lostNow || (!!lostNow && h2 === run.hearts - 1 && !!k && k.t < 20 && k.t % 4 < 2));
    label(g, zoneOf(run.idx).name + '  ' + (run.idx + 1) + '/' + STAGES, NET_X, 30, 9, '#fff');
    label(g, '★', NET_X + 36, 14, 12, tierInfo(tierOf(run.lost)).color);
    if (camp.rule && camp.playing) drawRule(c, g, camp.rule, t, lite);
  }
  if (k && !camp.waiting) drawKo(c, g, lite);
  else if (k && camp.waiting && k.win) confetti(g, t, 20);
}
