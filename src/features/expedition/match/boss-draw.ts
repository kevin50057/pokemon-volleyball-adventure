/** 首領戰的 HUD：雙方血條（各階段的門檻記號）、心、換階段的預告、受傷閃紅、幻影。 */
import type { Controller } from '../../../core/types';
import { bar, heart, label, slam } from '../../campaign/draw';
import { CHARS } from '../../characters';
import type { BossDef } from '../content';
import { T } from '../texts';
import { CUT_FRAMES, phaseOf, type BossState } from './boss';
import { H, NET_X, W } from './geom';

type G = CanvasRenderingContext2D;

function charName(id: string): string { const ch = CHARS.byId[id]; return ch ? ch.name : id; }
function hex(n: number): string { return '#' + ('000000' + n.toString(16)).slice(-6); }

export interface BossView { title: string; hearts: number; maxHearts: number; leadName: string }

export function drawBoss(g: G, c: Controller, b: BossState, def: BossDef, v: BossView, t: number, lite: boolean): void {
  const last = b.idx === def.phases.length - 1 && def.phases.length > 1, accent = last ? '#FF7043' : b.idx > 0 ? '#FFB36B' : '#FFB74D';
  if (b.hurt > 0 && !lite) {
    const vg = g.createRadialGradient(NET_X, H / 2, 90, NET_X, H / 2, 260);
    vg.addColorStop(0, 'rgba(255,0,40,0)'); vg.addColorStop(1, 'rgba(255,0,40,' + (0.55 * b.hurt / 12) + ')');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  if (b.idx > 0 && !lite) {      // 後面的階段：往上飄的光點，顏色跟著階段的色調
    const col = hex(phaseOf(def, b.idx).tint);
    for (let i = 0; i < 14; i++) {
      const px = (i * 97 + Math.sin((t + i * 40) / 23) * 14 + 400) % W, py = H - ((t * 1.8 + i * 53) % (H + 20));
      g.globalAlpha = 0.35 + 0.25 * Math.sin((t + i * 9) / 6); g.fillStyle = col; g.fillRect(px, py, 2, 2 + (i % 3));
    }
    g.globalAlpha = 1;
  }
  // 幻影：沒有影子的半透明假球
  b.phantoms.forEach((f) => {
    g.globalAlpha = (lite ? 0.25 : 0.45) * (1 - f.t / 18);
    g.fillStyle = '#E1BEE7'; g.strokeStyle = '#7E57C2'; g.lineWidth = 2;
    g.beginPath(); g.arc(f.x, f.y, 18, 0, Math.PI * 2); g.fill(); g.stroke();
    g.globalAlpha = 1;
  });
  const myHp = Math.max(0, def.playerHp - c.scores[1]), bossHp = Math.max(0, def.hp - c.scores[0]);
  const sh = b.hit > 0 ? Math.sin(b.hit * 2.6) * 3 : 0, sh2 = b.hurt > 0 ? Math.sin(b.hurt * 2.6) * 3 : 0;
  label(g, v.leadName, 16, 11, 10, '#fff', 'left');
  bar(g, 16 + sh2, 19, 150, 9, def.playerHp, myHp, myHp <= 1 ? '#FF5252' : '#69F0AE', false, myHp + (b.hurt > 0 ? 1 : 0), b.hurt / 12);
  label(g, charName(c.physics.player2.character), 416, 11, 10, '#FFE0B2', 'right');
  bar(g, 266 + sh, 19 + Math.abs(sh) * 0.4, 150, 9, def.hp, bossHp, accent, true, bossHp + (b.hit > 0 ? 1 : 0), b.hit / 12);
  // 各階段的門檻記號
  def.phases.forEach((p, i) => {
    if (i === 0) return;
    const mx = 266 + sh + 150 * (def.hp - p.atHp) / def.hp;
    g.fillStyle = '#000'; g.fillRect(mx - 1.5, 15, 3, 17);
  });
  const tag = b.idx > 0 ? (T.phaseTitle[phaseOf(def, b.idx).id] || '') : v.title;
  label(g, tag, NET_X, 12, 9, b.idx > 0 ? '#FFAB91' : '#fff', 'center', 150);
  for (let h = 0; h < v.maxHearts; h++) heart(g, NET_X - 14 + h * 14, 27, 5, h < v.hearts);
  if (b.cut > 0) {
    const k = 1 - b.cut / CUT_FRAMES, next = phaseOf(def, b.next);
    g.globalAlpha = 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.2)); g.fillStyle = '#14002A'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    slam(g, T.phaseTitle[next.id] || '', NET_X, 118, 30, '#FFAB91', CUT_FRAMES - b.cut);
    label(g, T.phaseNote[next.id] || '', NET_X, 150, 12, '#fff');
  }
  if (b.flash > 0) { if (!lite) { g.globalAlpha = 0.5 * b.flash / 6; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; } b.flash--; }
}
