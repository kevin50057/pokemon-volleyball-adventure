// 場上的小工具：暫時改技能數值、場地染色、背景音樂速度、計分板、還原圖
import type { Sprite } from '@pixi/sprite';
import type { Controller, GameState } from '../../core/types';
import { AB, camp } from './state';

export function setTuning(o: Record<string, number>): void {
  const a = AB(); if (!a) return;
  camp.tuneOrig = camp.tuneOrig || {};
  for (const k in o) { if (!(k in camp.tuneOrig)) camp.tuneOrig[k] = a.tuning[k]; a.tuning[k] = o[k]; }
}
export function restoreTuning(): void {
  const a = AB(); if (!a || !camp.tuneOrig) { camp.tuneOrig = null; return; }
  for (const k in camp.tuneOrig) a.tuning[k] = camp.tuneOrig[k];
  camp.tuneOrig = null;
}
export function setTint(c: Controller, hex: number): void {
  try {
    const g = c.view.game;
    [g.bgContainer, g.cloudContainer, g.waveContainer].forEach(function (ct) {
      // 背景、雲、海浪底下都是 Sprite
      if (ct && ct.children) ct.children.forEach(function (sp) { (sp as Sprite).tint = hex; });
    });
  } catch (e) { /* 畫面還沒建好 */ }
}
export function mix(a: number, b: number, k: number): number {
  const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k),
    g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k),
    bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * k);
  return (r << 16) | (g << 8) | bl;
}
export function setBgmSpeed(c: Controller, v: number): void {
  try { const b = c.audio.sounds.bgm; [b.center, b.left, b.right].forEach(function (s) { if (s) s.speed = v; }); } catch (e) { /* 沒有音效 */ }
}
export function scoreBoards(c: Controller, on: boolean): void { try { c.view.game.scoreBoards[0].visible = on; c.view.game.scoreBoards[1].visible = on; } catch (e) { /* 畫面還沒建好 */ } }
// 打飛對手時動過的東西（旋轉、影子、染色）還原
export function resetSprites(c: Controller): void {
  try {
    const g = c.view.game;
    g.player2.rotation = 0; g.player2.tint = 0xFFFFFF; g.player1.tint = 0xFFFFFF; g.ball.tint = 0xFFFFFF;
    g.shadows.forPlayer2.visible = true;
  } catch (e) { /* 畫面還沒建好 */ }
}
/** 兩關之間：場上停在結算，只讓雲和海浪繼續動 */
export const waitState: GameState = function (this: Controller) { this.view.game.drawCloudsAndWave(); };
