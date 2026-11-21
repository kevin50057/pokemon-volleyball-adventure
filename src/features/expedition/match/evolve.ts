/**
 * 御三家進化在比賽中的樣子和第二階的加強：
 *  - 換圖：上場夥伴是二、三階時，把左邊角色的動畫格換成進化型的（格子位置跟一階完全一樣，所以直接用同樣的位置切），
 *    比賽結束換回來。遊戲本體只在「角色換了」的時候換圖，所以每一幀確認一次就夠。
 *  - 第二階起：一階技能的幾個數值加強（TUNING 兩邊共用：對手是同一隻、或是會變身的百變怪時不改）。
 *    第三階的新能力是 awaken.ts 的覺醒。
 */
import type { Texture } from '@pixi/core';
import type { Rectangle } from '@pixi/math';
import { IMAGES_URL } from '../../../core/config';
import type { Controller } from '../../../core/types';
import { setTuning } from './stage';

/** 第二階起的加強（一階的數值見 abilities/tuning.ts 的「關都御三家」） */
const STAGE2_TUNING: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  charmander: { charmanderNetZone: 96, charmanderNetSpike: 1.14 },
  bulbasaur: { bulbasaurReach: 10, leafGravEvery: 2 },
  squirtle: { squirtleDive: 1.25, squirtleGetup: 5 },
};

const images = new Map<string, HTMLImageElement>();
const textures = new Map<string, Texture[]>();
const E = { base: '', form: '' };

/** 先下載進化型的圖（面板上看到隊伍裡有人進化時就呼叫，開打時通常已經好了） */
export function preload(form: string): HTMLImageElement {
  const had = images.get(form);
  if (had) return had;
  const im = new Image();
  im.src = IMAGES_URL + form + '_sheet.png';
  images.set(form, im);
  return im;
}
/** 進化型的頭像（第一格），給面板和演出用；圖還沒載好回 null */
export function formFace(form: string): HTMLImageElement | null {
  const im = preload(form);
  return im.complete && im.naturalWidth > 0 ? im : null;
}

function texturesOf(c: Controller): Texture[] | null {
  const cached = textures.get(E.form);
  if (cached) return cached;
  const base = c.view.game.playerTextureArrays && c.view.game.playerTextureArrays[c.physics.player1.character];
  const im = formFace(E.form);
  if (!base || !base.length || !im) return null;
  // 跟暴鯉龍換圖一樣，從現有的貼圖拿建構子（確保跟遊戲本體用的是同一份 PIXI 類別）
  const T = base[0].constructor as typeof Texture, R = base[0].frame.constructor as typeof Rectangle;
  const bt = T.from(im).baseTexture;
  if (base[0].baseTexture.scaleMode != null) bt.scaleMode = base[0].baseTexture.scaleMode;
  const list = base.map((t) => new T(bt, new R(t.frame.x, t.frame.y, t.frame.width, t.frame.height)));
  textures.set(E.form, list);
  return list;
}

/** 比賽開始。base：上場夥伴（一階的 id）；form：這一階的樣子；stage：第幾階 */
export function setup(c: Controller, base: string, form: string, stage: number): void {
  E.base = base; E.form = form !== base ? form : '';
  if (E.form) preload(E.form);
  const opp = c.physics.player2.character, extra = STAGE2_TUNING[base];
  if (stage >= 2 && extra && opp !== base && opp !== 'ditto') Object.entries(extra).forEach(([k, v]) => setTuning(k, v));
}

/** 每一幀（畫面更新之後）：上場的還是那一隻，就用進化型的圖 */
export function swap(c: Controller): void {
  if (!E.form || c.physics.player1.character !== E.base) return;
  const sp = c.view.game.player1, want = texturesOf(c);
  if (sp && want && sp.textures !== want) {
    const f = sp.currentFrame;
    sp.textures = want;
    sp.gotoAndStop(Math.min(f, want.length - 1));
  }
}

/** 比賽結束：換回一階的圖（數值由 stage.ts 的 restoreAll 一起還原） */
export function end(c: Controller | null): void {
  if (c && E.form) {
    try {
      const sp = c.view.game.player1, base = c.view.game.playerTextureArrays[c.physics.player1.character];
      if (sp && base && sp.textures !== base) { const f = sp.currentFrame; sp.textures = base; sp.gotoAndStop(Math.min(f, base.length - 1)); }
    } catch { /* 畫面還沒建好 */ }
  }
  E.base = ''; E.form = '';
}

/** 除錯、測試用：左邊現在是不是進化型的圖 */
export function showing(c: Controller): string {
  const sp = c.view.game.player1, list = E.form ? textures.get(E.form) : undefined;
  return list && sp && sp.textures === list ? E.form : '';
}
