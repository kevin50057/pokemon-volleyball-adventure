// 場上特效佇列（爆圈、全畫面閃色）與特效分級事件
import { svc } from '../../core/services';
import type { FxEventData } from '../../core/services';
import type { Player } from '../../core/types';
import { rt } from './state';

export function pushBurst(x: number, y: number, color: string, size: number): void {
  rt.fx.bursts.push({ x: x, y: y, color: color, size: size, t: 0, max: 8 });
}
// 全畫面閃色：在 25 FPS 下太強會像畫面壞掉，所以統一減半、最多 3 幀
// 特效分級：技能真正發動的那一刻告訴特效系統這一球是幾級（3 = 技能、4 = 必殺）
export function tier(player: Player, lvl: number, x: number, y: number, extra?: Record<string, unknown> | null): void {
  if (!svc.fxEvent) return;
  const d: FxEventData = { player: player, lvl: lvl, x: x, y: y };
  if (extra) for (const k in extra) d[k] = extra[k];
  svc.fxEvent('skill', d);
}
export function pushFlash(color: string, alpha: number, frames: number): void {
  rt.fx.flashes.push({ color: color, alpha: alpha * 0.5, t: 0, max: Math.min(3, frames) });
}
