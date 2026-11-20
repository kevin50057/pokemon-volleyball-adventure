// ============================================================
// 精靈的壓扁伸展（每次遊戲畫面更新之後，以及頓幀期間）、電光一閃的殘影、暴鯉龍換圖
// ============================================================
import type { Texture } from '@pixi/core';
import type { Rectangle } from '@pixi/math';
import type { Sprite } from '@pixi/sprite';
import type { AnimatedSprite } from '@pixi/sprite-animated';
import { IMAGES_URL } from '../../core/config';
import { svc } from '../../core/services';
import type { SideState } from '../../core/side-state';
import type { GameView, Physics, Player } from '../../core/types';
import { GROUND_BALL_Y } from './config';
import { S } from './state';
import { now, rand } from './util';

let ghosts: { sp: Sprite; t0: number; a0: number }[] = [];   // 電光一閃的角色殘影（PIXI sprite）

// 有彈性的回彈曲線：一開始壓扁，接著稍微反彈超過，最後回到 1
function spring(t: number, amt: number, k: number, w: number): number { return 1 - amt * Math.exp(-k * t) * Math.cos(w * t); }

export function applySprites(view: GameView, physics: Physics): void {
  const tn = now(), ball = physics.ball, b = view.ball;
  S.viewRef = view;
  if (!b || !b.scale) return;

  // 得分後落點的爆炸圖：原版會留在畫面上，這裡讓它 200ms 內淡掉
  if (view.punch) {
    const gt = tn - S.groundT;
    view.punch.alpha = S.groundT && gt > 120 ? Math.max(0, 1 - (gt - 120) / 200) : 1;
  }
  // 電光一閃的殘影淡出
  ghosts = ghosts.filter(function (gh) {
    const k = (tn - gh.t0) / 260;
    if (k >= 1) { if (gh.sp.parent) gh.sp.parent.removeChild(gh.sp); gh.sp.destroy(); return false; }
    gh.sp.alpha = gh.a0 * (1 - k);
    return true;
  });

  // 球：頓幀期間維持壓扁，頓幀結束才彈性回彈；高速飛行時往飛行方向拉長
  const ballFx = S.ballFx;
  let along = 1, rotTarget: number | null = null;
  const dt = (tn - ballFx.t0) / 1000;
  if (ballFx.hold) {
    along = 1 - 0.3 * ballFx.power; rotTarget = ballFx.ang;
  } else if (ballFx.t0 > 0 && dt < 0.35) {
    along = spring(dt, 0.3 * ballFx.power, 9, 26); rotTarget = ballFx.ang;
  } else {
    const speed = Math.hypot(ball.xVelocity, ball.yVelocity);
    if (speed > 14 && ball.y < GROUND_BALL_Y - 4) {
      along = 1 + Math.min(0.35, (speed - 14) / 30);
      rotTarget = Math.atan2(ball.yVelocity, ball.xVelocity);
    }
  }
  // 角度用平滑追上，避免寶貝球花紋瞬間跳動；不拉伸時角度看不出來，所以保持不動
  if (rotTarget !== null) {
    const d = Math.atan2(Math.sin(rotTarget - S.ballRot), Math.cos(rotTarget - S.ballRot));
    S.ballRot += d * 0.5;
  }
  b.rotation = S.ballRot;
  b.scale.x = along; b.scale.y = 1 / Math.sqrt(Math.max(0.5, along));
  // 落地壓扁時把球往下補，貼住地面不浮空
  b.y = ball.y + ((ballFx.ground && along < 1) ? (1 - along) * 20 : 0);

  swapGyarados(view, physics);

  // 角色
  const sprites = [view.player1, view.player2], ps = [physics.player1, physics.player2];
  for (let i = 0; i < 2; i++) {
    const sp = sprites[i], p = ps[i], fx = S.playerFx[i];
    if (!sp || !sp.scale) continue;
    let px = 1, py = 1;
    const t = (tn - fx.t0) / 1000;
    if (fx.t0 > 0 && t < 0.4) {
      if (fx.kind === 'land') { py = spring(t, 0.28, 10, 22); px = 2 - py; }
      else if (fx.kind === 'jump') { py = spring(t, -0.2, 10, 18); px = 2 - py; }
      else if (fx.kind === 'spike') { px = spring(t, -0.22, 11, 24); py = 2 - px; }
      else if (fx.kind === 'dive') { py = spring(t, 0.15, 10, 20); px = 2 - py; }
      else if (fx.kind === 'hurt' && t < 0.25) { py = 0.8 + 0.2 * (t / 0.25); px = 2 - py; }
    }
    const sign = sp.scale.x < 0 ? -1 : 1;
    // 閃電鳥的圖比較大，整體再縮一點（倍數在技能系統的 tuning.birdScale）
    const AB = svc.abilities, size = p.character === 'bird' && AB && AB.tuning.birdScale ? AB.tuning.birdScale : 1;
    sp.scale.x = sign * px * size;
    sp.scale.y = py * size;
    // 錨點在中間：壓扁時讓腳保持貼地。貼圖比 64px 大的角色（閃電鳥 96px＝1.5 倍）往上移，腳才會在同一條地平線
    const k = (sp.texture && sp.texture.height ? sp.texture.height / 64 : 1) * size;
    sp.y = p.y + 30 - 30 * py * k;
    if (k > 1) sp.y = Math.max(sp.y, 32 * k - 6);   // 飛到最高時不要整顆頭跑出畫面
    sp.x = p.x + ((fx.kind === 'hurt' && t < 0.15) ? Math.round(rand(-2, 2)) : 0);
  }

  // 計分板：得分數字從 1.6 倍彈回 1 倍（250ms）
  const boards = view.scoreBoards;
  if (boards) {
    for (let bi = 0; bi < 2; bi++) {
      const bd = boards[bi], st = (tn - S.scoreFx[bi].t0) / 250;
      let sc = 1;
      if (!bd) continue;
      if (S.scoreFx[bi].t0 > 0 && st < 1) sc = 1 + 0.6 * Math.pow(1 - st, 2) * Math.cos(st * 3);
      const bx = bi === 0 ? 14 : 354;
      bd.scale.set(sc);
      bd.x = bx - (sc - 1) * 32; bd.y = 10 - (sc - 1) * 16;
    }
  }
}

// ============================================================
// 暴鯉龍／紅色暴鯉龍的角色圖：鯉魚王進化期間把它的動畫格換成暴鯉龍的
// （兩張圖的格子位置跟鯉魚王完全一樣，所以直接用同樣的位置切）
// ============================================================
type GyaKind = 'normal' | 'red';
const gyaImg: Record<GyaKind, HTMLImageElement | null> = { normal: null, red: null };
const gyaTex: Record<GyaKind, Texture[] | null> = { normal: null, red: null };
/** 舊版在載入時就開始下載兩張圖；這裡在 init() 時。 */
export function loadGyaradosImages(): void {
  (['normal', 'red'] as GyaKind[]).forEach(function (k) {
    const im = new Image();
    im.onload = function () { gyaImg[k] = im; };
    im.src = IMAGES_URL + (k === 'red' ? 'redgyarados' : 'gyarados') + '_sheet.png';
  });
}
function gyaTextures(view: GameView, kind: GyaKind): Texture[] | null {
  const cached = gyaTex[kind];
  if (cached) return cached;
  const base = view.playerTextureArrays && view.playerTextureArrays.magikarp;
  const img = gyaImg[kind];
  if (!base || !img) return null;
  // 跟舊版一樣從現有貼圖拿建構子（確保跟遊戲本體用的是同一份 PIXI 類別）
  const T = base[0].constructor as typeof Texture, R = base[0].frame.constructor as typeof Rectangle;
  const bt = T.from(img).baseTexture;
  if (base[0].baseTexture.scaleMode != null) bt.scaleMode = base[0].baseTexture.scaleMode;
  const list = base.map(function (t) { return new T(bt, new R(t.frame.x, t.frame.y, t.frame.width, t.frame.height)); });
  gyaTex[kind] = list;
  return list;
}
function swapGyarados(view: GameView, physics: Physics): void {
  const A = svc.abilities && svc.abilities.state();
  if (!A || !view.playerTextureArrays) return;
  ([['player1', 'p1'], ['player2', 'p2']] as const).forEach(function (k) {
    const sp: AnimatedSprite = view[k[0]], p: Player = physics[k[0]], st: Partial<SideState> = A[k[1]] || {};
    if (!sp || p.character !== 'magikarp') return;
    const want = st.isGyarados ? gyaTextures(view, st.isRed ? 'red' : 'normal') : view.playerTextureArrays.magikarp;
    if (want && sp.textures !== want) {
      const f = sp.currentFrame;
      sp.textures = want;
      sp.gotoAndStop(Math.min(f, want.length - 1));
    }
  });
}

// 在角色身後放 4 個漸淡的殘影（用角色當下的貼圖）
export function makeGhosts(player: Player, x0: number, x1: number, y: number): void {
  const viewRef = S.viewRef;
  if (!viewRef) return;
  const sp = player.isPlayer2 ? viewRef.player2 : viewRef.player1;
  if (!sp || !sp.parent) return;
  // 跟舊版一樣從 ballHyper 拿 Sprite 建構子（不另外 import PIXI 類別）
  const SpriteCtor = Object.getPrototypeOf(viewRef.ballHyper).constructor as new (texture: Texture) => Sprite;
  for (let i = 1; i <= 4; i++) {
    const g = new SpriteCtor(sp.texture);
    g.anchor.set(sp.anchor.x, sp.anchor.y);
    g.scale.x = sp.scale.x; g.scale.y = sp.scale.y;
    g.x = x0 + (x1 - x0) * (i - 1) / 4; g.y = y;
    g.tint = 0xFFF176;
    // 舊版把 a0 也掛在 sprite 上（g.a0），只在這裡和 ghosts 用到，所以改成區域變數
    const a0 = 0.15 + i * 0.1;
    g.alpha = a0;
    sp.parent.addChildAt(g, sp.parent.getChildIndex(sp));
    ghosts.push({ sp: g, t0: now(), a0: a0 });
  }
}
