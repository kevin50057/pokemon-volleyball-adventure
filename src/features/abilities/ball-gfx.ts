// ============================================================
// 球的光效（直接改遊戲本體的 PIXI 圖層，遊戲本體每次畫完球後跑 hooks.drawBall，舊版 window._pvDrawBall）
//  - 殺球閃光與殘影依「擊球者的屬性」上色（原本一律是黃色閃光＋藍色殘影）
//  - 超夢殺球後：寶貝球變紫色，後面拖著念力殘影
// ============================================================
import { Texture } from '@pixi/core';
import { Sprite } from '@pixi/sprite';
import { flags } from '../../core/services';
import type { GameView, Physics } from '../../core/types';
import { CHARS } from '../characters';
import type { PokeType } from '../characters';
import { punchShapes } from '../characters/punch-shapes';
import { rt } from './state';
import { GROUND_BALL_Y } from './util';

type RGB = [number, number, number];
type ColorMap = (r: number, g: number, b: number) => RGB | null;

interface Gfx {
  origBall: Texture[];
  purpleBall: Texture[];
  goldBall: Texture[];
  origPunch: Texture;
  punchByType: Record<string, Texture>;
  punchPurple: Texture | null;
  origTrail: Texture;
  whiteTrail: Texture | null;
  origHyper: Texture;
  purpleHyper: Texture | null;
  goldHyper: Texture | null;
  purple: boolean;
  look: 'orig' | 'purple' | 'gold';
  ghosts: Sprite[];
}

let gfx: Gfx | { failed: true } | null = null;   // 重新上色後的貼圖
let trailHist: { x: number; y: number; r: number }[] = [];   // 球最近幾幀的位置，給紫色殘影用
const GHOSTS = 5;

function hexToNum(hex: string): number { return parseInt(hex.slice(1), 16); }

function recolor(tex: Texture, map: ColorMap): Texture | null {
  // 舊版用 tex.constructor 取得 Texture 類別；這裡直接用 @pixi/core 的 Texture（同一個類別）。
  // resource 的 source 只有圖片類的 resource 才有，所以轉成可選欄位來讀。
  const res = tex.baseTexture.resource as { source?: CanvasImageSource } | null | undefined;
  const src = res && res.source;
  if (!src) return null;
  const f = tex.frame, c = document.createElement('canvas');
  c.width = f.width; c.height = f.height;
  const g = c.getContext('2d')!;   // 剛建好的 canvas，2d context 一定拿得到
  g.drawImage(src, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const out = map(px[i], px[i + 1], px[i + 2]);
    if (out) { px[i] = out[0]; px[i + 1] = out[1]; px[i + 2] = out[2]; }
  }
  g.putImageData(d, 0, 0);
  const t = Texture.from(c);
  if (tex.baseTexture.scaleMode != null) t.baseTexture.scaleMode = tex.baseTexture.scaleMode;
  return t;
}

// 黑色描邊保留，其餘變白，之後用 tint 染成任何顏色
function toWhite(r: number, g: number, b: number): RGB | null { return (r + g + b < 60) ? null : [255, 255, 255]; }
// 紅白寶貝球 → 紫色念力球
function toPurple(r: number, g: number, b: number): RGB | null {
  if (r > 200 && g < 60 && b < 60) return [176, 72, 255];     // 紅
  if (r > 100 && r < 160 && g < 40) return [92, 28, 160];      // 暗紅
  if (r > 140 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r < 230) return [222, 196, 255]; // 灰
  if (b > 200 && r < 60 && g < 60) return [200, 120, 255];     // 原殘影的藍
  return null;
}
// 紅白寶貝球 → 整顆金色的黃金球（闖關模式喵喵關）
function toGold(r: number, g: number, b: number): RGB | null {
  if (r > 200 && g < 60 && b < 60) return [255, 196, 30];      // 紅
  if (r > 100 && r < 160 && g < 40) return [176, 112, 0];      // 暗紅
  if (r > 230 && g > 230 && b > 230) return [255, 238, 150];   // 白
  if (r > 140 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12) return [236, 178, 40]; // 灰
  if (b > 200 && r < 60 && g < 60) return [255, 214, 80];      // 原殘影的藍
  return null;
}

function initGfx(view: GameView): void {
  // 球的動畫一律是用貼圖陣列建的（不是 FrameObject），所以轉成 Texture[]
  const ballTex = view.ball.textures as Texture[];
  const ready: Gfx = {
    origBall: ballTex.slice(),
    purpleBall: ballTex.map(function (t) { return recolor(t, toPurple) || t; }),
    goldBall: ballTex.map(function (t) { return recolor(t, toGold) || t; }),
    origPunch: view.punch.texture,
    punchByType: {},
    punchPurple: null,
    origTrail: view.ballTrail.texture,
    whiteTrail: recolor(view.ballTrail.texture, toWhite),
    origHyper: view.ballHyper.texture,
    purpleHyper: recolor(view.ballHyper.texture, toPurple),
    goldHyper: recolor(view.ballHyper.texture, toGold),
    purple: false, look: 'orig',
    ghosts: [],
  };
  gfx = ready;
  // 每種屬性一張專屬形狀的殺球特效（characters/punch-shapes.ts）
  const tc = CHARS.typeColors;
  const mode = view.punch.texture.baseTexture.scaleMode;
  const mk = function (t: string, col: string): Texture { const x = Texture.from(punchShapes.make(t, col)); if (mode != null) x.baseTexture.scaleMode = mode; return x; };
  (Object.keys(tc) as PokeType[]).forEach(function (t) { ready.punchByType[t] = mk(t, tc[t]); });
  ready.punchPurple = mk('超', '#B048FF');
  // 紫色殘影：放在球的後面
  const parent = view.ball.parent;
  for (let i = 0; i < GHOSTS; i++) {
    const sp = new Sprite(ready.purpleBall[0]);
    sp.anchor.set(0.5, 0.5);
    sp.visible = false;
    parent.addChildAt(sp, Math.max(0, parent.getChildIndex(view.ball)));
    ready.ghosts.push(sp);
  }
}

export function drawBall(view: GameView, physics: Physics): void {
  if (flags.sim) return;
  if (!gfx) {
    try { initGfx(view); } catch { gfx = { failed: true }; }
  }
  if (!gfx || 'failed' in gfx) return;
  const G = gfx;
  const ball = physics.ball, p1 = physics.player1, p2 = physics.player2;

  if (p1.isCollisionWithBallHappened) rt.lastHitter = p1;
  else if (p2.isCollisionWithBallHappened) rt.lastHitter = p2;

  // 紫色念力球：對手碰到球、球落地就結束
  if (rt.psyBall) {
    const other = rt.psyBall.owner === 'p1' ? p2 : p1;
    if (other.isCollisionWithBallHappened || ball.y >= GROUND_BALL_Y) rt.psyBall = null;
  }
  const purple = !!rt.psyBall;

  // 屬性光
  const c = rt.lastHitter && CHARS.byId[rt.lastHitter.character];
  const tint = purple ? 0xB048FF : hexToNum(c ? c.color : '#FFFFFF');
  const shape = purple ? G.punchPurple : (c && G.punchByType[c.type]);
  view.punch.texture = shape || G.origPunch;
  view.punch.tint = 0xFFFFFF;
  if (G.whiteTrail) { view.ballTrail.texture = G.whiteTrail; view.ballTrail.tint = tint; }

  // 寶貝球本身
  // 黃金球：闖關模式設 flags.goldBall（念力球優先）
  const look = purple ? 'purple' : flags.goldBall ? 'gold' : 'orig';
  if (look !== G.look) {
    G.look = look; G.purple = purple;
    view.ball.textures = look === 'purple' ? G.purpleBall : look === 'gold' ? G.goldBall : G.origBall;
    view.ballHyper.texture = (look === 'purple' && G.purpleHyper) || (look === 'gold' && G.goldHyper) || G.origHyper;
    trailHist = [];
  }
  view.ball.gotoAndStop(ball.rotation);

  trailHist.unshift({ x: ball.x, y: ball.y, r: ball.rotation });
  if (trailHist.length > GHOSTS * 2 + 1) trailHist.pop();
  for (let i = 0; i < GHOSTS; i++) {
    const sp = G.ghosts[i], h = trailHist[(i + 1) * 2];
    if (!purple || !h) { sp.visible = false; continue; }
    sp.visible = true;
    sp.texture = G.purpleBall[h.r] || G.purpleBall[0];
    sp.x = h.x; sp.y = h.y;
    sp.alpha = 0.55 - i * 0.1;
    sp.scale.set(1 + i * 0.06);
  }
  if (purple) {
    // 念力殘影一路顯示，不只在殺球那一下
    view.ballHyper.x = ball.previousX; view.ballHyper.y = ball.previousY;
    view.ballHyper.visible = true;
  }
}
