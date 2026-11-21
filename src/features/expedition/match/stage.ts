/**
 * 比賽中暫時改動的「舞台」：場地色調、背景音樂速度、計分板、技能數值（TUNING）。
 * 改過的都記下原值，比賽結束時 restoreAll() 一次還原。
 */
import type { Sprite } from '@pixi/sprite';
import { svc } from '../../../core/services';
import type { Controller } from '../../../core/types';

const S = { bgm: 1, tuning: new Map<string, number>() };

export function setTint(c: Controller, hex: number): void {
  try {
    const g = c.view.game;
    [g.bgContainer, g.cloudContainer, g.waveContainer].forEach((ct) => {
      if (ct && ct.children) ct.children.forEach((sp) => { (sp as Sprite).tint = hex; });
    });
  } catch { /* 畫面還沒建好 */ }
}

export function setBgmSpeed(c: Controller, v: number): void {
  S.bgm = v;
  try { const b = c.audio.sounds.bgm; [b.center, b.left, b.right].forEach((s) => { if (s) s.speed = v; }); } catch { /* 沒有音效 */ }
}

export function scoreBoards(c: Controller, on: boolean): void {
  try { c.view.game.scoreBoards[0].visible = on; c.view.game.scoreBoards[1].visible = on; } catch { /* 畫面還沒建好 */ }
}

/** 暫時改一個技能數值（第一次改時記下原值） */
export function setTuning(key: string, value: number): void {
  const t = svc.abilities && svc.abilities.tuning;
  if (!t || !(key in t)) return;
  if (!S.tuning.has(key)) S.tuning.set(key, t[key]);
  t[key] = value;
}
/** 還原一個技能數值 */
export function restoreTuning(key: string): void {
  const t = svc.abilities && svc.abilities.tuning, v = S.tuning.get(key);
  if (t && v !== undefined) t[key] = v;
  S.tuning.delete(key);
}

/** 比賽結束：色調、音樂、計分板、技能數值全部還原 */
export function restoreAll(c: Controller | null): void {
  Array.from(S.tuning.keys()).forEach(restoreTuning);
  if (!c) return;
  setTint(c, 0xFFFFFF);
  if (S.bgm !== 1) setBgmSpeed(c, 1);
  scoreBoards(c, true);
}
