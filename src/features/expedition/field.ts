/**
 * 遠征比賽中的修飾：場地規則（水窪、黃金球、強風）、卡牌倍率、電腦強度、首領血量與第二階段、場上顯示。
 *
 * 全部掛在 adapter.ts 的掛勾層上，只在遠征比賽進行中才有作用；begin() 沒給的項目完全不動
 * （「無修飾」的比賽跟遊戲本體原本的路徑一樣）。end() 把動過的東西全部還原。
 *
 * 每球只有一顆計分用的真球；這裡不改碰撞箱、不改全域計時、不碰比分（黃金球走 hooks.score）。
 * 比賽中的亂數（水窪位置、風向、電腦失誤）跟遊戲本體一樣用 Math.random；
 * 路線、卡牌、收服才用種子亂數（rng.ts）。
 */
import type { Sprite } from '@pixi/sprite';
import { flags, svc } from '../../core/services';
import type { Ball, Controller, Player, UserInput } from '../../core/types';
import { boostSafely, diveMult, jumpMult, jumpVelocity, scaleBall, starterMove } from '../abilities/starters';
import { bar, heart, label, slam } from '../campaign/draw';
import { sfx } from '../campaign/sfx';
import { CHARS } from '../characters';
import { capped, type Mods } from './cards';
import * as mech from './mech';
import { LAPSE_FRAMES, MAX_BALL_SPEED, RULE_CFG, START_HEARTS, type BossDef, type Diff, type MechId, type RuleId } from './content';
import { T } from './texts';

const W = 432, H = 304, NET_X = 216, FLOOR_Y = 270, GROUND_Y = 244, BALL_GROUND = 252;

export interface FieldSpec {
  title: string;
  hearts: number;
  /** 這一輪的心上限（難度 3 是 2 顆） */
  maxHearts?: number;
  rule?: RuleId;
  diff?: Diff;
  mods?: Mods;
  /** 裝備中的機制卡 */
  mechs?: MechId[];
  boss?: BossDef;
  /** 場地染色（時段氣氛） */
  tint?: number;
}

interface Puddle { x: number; t: number }
interface RuleState {
  id: RuleId; rt: number; rally: number; golden: boolean; touched: boolean; prev: unknown;
  puddles: Puddle[]; spawn: number; dir: number; splash: Puddle[]; pop: { side: number; t: number } | null;
}
interface BossState { phase: 1 | 2; pending: boolean; cut: number; hit: number; hurt: number; s0: number; s1: number; acc: number; flash: number }

const CUT_FRAMES = 50, CUT_MID = 25;
const BOSS_TINT = [0x8FA0E8, 0xE08A7A];

const F = {
  spec: null as FieldSpec | null,
  rule: null as RuleState | null,
  boss: null as BossState | null,
  ai: { mine: false, freeze: 0, acc: 0, noSpike: false },
  hitEdge: false,
  tick: 0,
  bgm: 1,
};

export function active(): boolean { return !!F.spec; }

export function begin(c: Controller, spec: FieldSpec): void {
  F.spec = spec;
  F.rule = spec.rule ? { id: spec.rule, rt: 0, rally: 0, golden: false, touched: false, prev: null, puddles: [], spawn: 25, dir: 1, splash: [], pop: null } : null;
  F.boss = spec.boss ? { phase: 1, pending: false, cut: 0, hit: 0, hurt: 0, s0: 0, s1: 0, acc: 0, flash: 0 } : null;
  F.ai = { mine: false, freeze: 0, acc: 0, noSpike: false };
  F.hitEdge = false; F.tick = 0;
  mech.setup(spec.mechs);
  flags.goldBall = false;
  if (spec.boss) setTint(c, BOSS_TINT[0]); else if (spec.tint !== undefined) setTint(c, spec.tint);
}

export function end(c: Controller | null): void {
  if (!F.spec) return;
  const hadBoss = !!F.boss, hadMods = !!F.spec.mods;
  F.spec = null; F.rule = null; F.boss = null;
  flags.goldBall = false;
  clearHud();
  if (!c) return;
  setTint(c, 0xFFFFFF);
  if (F.bgm !== 1) setBgmSpeed(c, 1);
  if (hadBoss) scoreBoards(c, true);
  if (hadMods) { const p1 = c.physics.player1; p1.pvMoveMult = p1.pvDiveMult = undefined; }
}

function setTint(c: Controller, hex: number): void {
  try {
    const g = c.view.game;
    [g.bgContainer, g.cloudContainer, g.waveContainer].forEach((ct) => {
      if (ct && ct.children) ct.children.forEach((sp) => { (sp as Sprite).tint = hex; });
    });
  } catch { /* 畫面還沒建好 */ }
}
function setBgmSpeed(c: Controller, v: number): void {
  F.bgm = v;
  try { const b = c.audio.sounds.bgm; [b.center, b.left, b.right].forEach((s) => { if (s) s.speed = v; }); } catch { /* 沒有音效 */ }
}
function scoreBoards(c: Controller, on: boolean): void {
  try { c.view.game.scoreBoards[0].visible = on; c.view.game.scoreBoards[1].visible = on; } catch { /* 畫面還沒建好 */ }
}

// ---------- 每幀：遊戲本體之前（可以讓整幀停住） ----------

/** 回傳 false：這一幀整個遊戲停住（首領換階段的預告） */
export function pre(c: Controller): false | void {
  if (!F.spec) return;
  F.tick++;
  const b = F.boss, def = F.spec.boss;
  if (!b || !def) return;
  scoreBoards(c, false);
  if (b.cut > 0) {
    b.cut--;
    if (b.cut === CUT_MID) { b.phase = 2; b.flash = 6; setTint(c, BOSS_TINT[1]); setBgmSpeed(c, 1.1); }
    return false;
  }
  if (b.hit > 0) b.hit--;
  if (b.hurt > 0) b.hurt--;
  const live = c.state === c.round;
  if (c.state === c.startOfNewGame) { b.s0 = 0; b.s1 = 0; }
  if (live) {
    if (c.scores[0] > b.s0) { b.hit = 12; b.s0 = c.scores[0]; if (c.scores[0] < def.hp) sfx('hit'); }
    if (c.scores[1] > b.s1) { b.hurt = 12; b.s1 = c.scores[1]; if (c.scores[1] < def.playerHp) sfx('hurt'); }
  }
  if (live && !c.gameEnded) {
    // 玩家的血打完：遊戲本體只看 winningScore（首領的血），所以這裡自己判定結束
    if (c.scores[1] >= def.playerHp) {
      const ph = c.physics;
      c.gameEnded = true;
      ph.player1.isWinner = false; ph.player2.isWinner = true;
      ph.player1.gameEnded = true; ph.player2.gameEnded = true;
      return;
    }
    if (b.phase === 1 && def.hp - c.scores[0] <= def.phase2AtHp) b.pending = true;
  }
  // 換階段放在下一球發球前：先預告，再開打
  if (b.pending && b.phase === 1 && c.state === c.beforeStartOfNextRound && !c.gameEnded) {
    b.pending = false; b.cut = CUT_FRAMES;
    sfx('phase');
    return false;
  }
}

// ---------- 每幀：確定這一幀會跑物理之後、物理之前 ----------

export function physics(c: Controller): void {
  const spec = F.spec;
  if (!spec) return;
  const ph = c.physics, p1 = ph.player1, ball = ph.ball;
  if (spec.mods) applyMods(p1, ball, spec.mods);
  mech.step(c, T.mechPop as Record<MechId, string>);
  const live = c.state === c.round && !c.roundEnded && !c.gameEnded;
  const r = F.rule;
  if (r) rulePhysics(c, r);
  const b = F.boss;
  if (b && spec.boss && b.phase === 2 && live) {
    b.acc += spec.boss.ballSpeed - 1;
    if (b.acc >= 1) { b.acc -= 1; extraBallStep(ball, p1, ph.player2); }
  }
}

/** 卡牌與羈絆：只作用在玩家這一邊 */
function applyMods(p1: Player, ball: Ball, m: Mods): void {
  const ch = p1.character;
  p1.pvMoveMult = capped('move', starterMove(ch), m.move);
  p1.pvDiveMult = capped('dive', diveMult(ch), m.dive);
  // 跳躍：只改從地上起跳的那一下（本體剛起跳的下一幀一定是 y = 地面 - 16）
  if (m.jump !== 1 && p1.state === 1 && p1.y === GROUND_Y - 16) {
    const jm = jumpMult(ch), base = jm === 1 ? 15 : jumpVelocity(jm);
    if (p1.yVelocity === -base) p1.yVelocity = -jumpVelocity(capped('jump', jm, m.jump));
  }
  // 殺球：碰到球的那一幀調一次。加速只在球本來就會乾淨落在對面時才加（免得反而掛網）
  const hit = p1.isCollisionWithBallHappened && p1.state === 2;
  if (hit && !F.hitEdge && ball.isPowerHit && m.spike !== 1) {
    const k = capped('spike', 1, m.spike);
    if (k > 1) boostSafely(ball, false, k); else scaleBall(ball, k);
    clampBall(ball);
  }
  F.hitEdge = hit;
}

/** 球速上限：遠征動過球之後一律再夾一次（之後卡槽變多、倍率疊多高，卡牌造成的球速都不會超過 MAX_BALL_SPEED） */
export function clampBall(ball: Ball): void {
  ball.xVelocity = Math.max(-MAX_BALL_SPEED, Math.min(MAX_BALL_SPEED, ball.xVelocity));
  ball.yVelocity = Math.max(-MAX_BALL_SPEED, Math.min(MAX_BALL_SPEED, ball.yVelocity));
}

/**
 * 首領第二階段的球速：每隔幾幀讓球多走一步（只有球，不動角色和計時）。
 * 只在球前後都離地面、球網、牆壁、天花板和雙方角色夠遠時才多走，碰撞一律交給遊戲本體原本的那一步。
 */
function extraBallStep(ball: Ball, p1: Player, p2: Player): void {
  const vx = ball.xVelocity, vy = ball.yVelocity, nx = ball.x + vx, ny = ball.y + vy;
  const clear = (x: number, y: number): boolean =>
    x > 40 && x < W - 20 && y > 20 && y < 200 &&
    (Math.abs(x - NET_X) > 45 || y < 150) &&
    [p1, p2].every((p) => Math.abs(x - p.x) > 56 || Math.abs(y - p.y) > 56);
  if (!clear(ball.x, ball.y) || !clear(nx, ny) || !clear(nx + vx, ny + vy + 1)) return;
  ball.x = nx; ball.y = ny; ball.yVelocity = vy + 1;
}

function lowgravOn(t: number): boolean { return t % RULE_CFG.lowgrav.period >= RULE_CFG.lowgrav.onAt; }
function lowgravWarn(t: number): boolean { const k = t % RULE_CFG.lowgrav.period; return k >= RULE_CFG.lowgrav.warnAt && k < RULE_CFG.lowgrav.onAt; }
function windOn(t: number): boolean { return t % RULE_CFG.wind.period >= RULE_CFG.wind.onAt; }
function windWarn(t: number): boolean { const k = t % RULE_CFG.wind.period; return k >= RULE_CFG.wind.warnAt && k < RULE_CFG.wind.onAt; }

function rulePhysics(c: Controller, r: RuleState): void {
  const ph = c.physics, ball = ph.ball;
  if (c.state === c.round && r.prev !== c.round) {           // 新的一球
    r.touched = false;
    // 氣象球：黃金球變成每 3 球一次
    const every = mech.has('weatherBall') ? 3 : RULE_CFG.gold.every;
    r.golden = r.id === 'gold' && r.rally % every === RULE_CFG.gold.first % every;
    r.rally++;
  }
  r.prev = c.state;
  flags.goldBall = !!(r.golden && c.state === c.round && !c.roundEnded && !c.gameEnded);
  if (c.state !== c.round || c.roundEnded || c.gameEnded) return;
  r.rt++;
  if (ph.player1.isCollisionWithBallHappened || ph.player2.isCollisionWithBallHappened) r.touched = true;
  const air = ball.y < BALL_GROUND;
  if (r.id === 'rain') {
    const Rn = RULE_CFG.rain;
    if (--r.spawn <= 0 && r.puddles.length < Rn.maxPairs * 2) {
      const x = 52 + Math.random() * 116;
      r.puddles.push({ x, t: 0 }, { x: W - x, t: 0 });       // 兩邊對稱，一視同仁
      r.spawn = Rn.every;
    } else if (r.spawn <= 0) r.spawn = 25;
    for (let i = r.puddles.length - 1; i >= 0; i--) if (++r.puddles[i].t > Rn.warn + Rn.life) r.puddles.splice(i, 1);
    // 球下一幀就會落地：落點在生效的水窪上就彈起來
    if (ball.yVelocity > 0 && ball.y + ball.yVelocity > BALL_GROUND && !(mech.weatherSpares() && ball.x > NET_X)) {
      const nx = ball.x + ball.xVelocity;
      for (let j = 0; j < r.puddles.length; j++) {
        const pd = r.puddles[j];
        if (pd.t >= Rn.warn && Math.abs(nx - pd.x) < Rn.half) {
          ball.yVelocity = Rn.bounce;
          ball.xVelocity = Math.round(ball.xVelocity * Rn.damp);
          r.splash.push({ x: pd.x, t: 0 });
          r.puddles.splice(j, 1);
          sfx('splash');
          break;
        }
      }
    }
  } else if (r.id === 'lowgrav') {
    if (lowgravOn(r.rt) && air && r.rt % 2 === 0 && !mech.weatherSpares()) ball.yVelocity -= 1;
  } else if (r.id === 'wind') {
    const Lw = RULE_CFG.wind, k = r.rt % Lw.period;
    if (k === Lw.warnAt) { r.dir = Math.random() < 0.5 ? -1 : 1; sfx('wind'); }
    if (windOn(r.rt) && r.touched && air && r.rt % Lw.every === 0 && !mech.weatherSpares()) ball.xVelocity = Math.max(-30, Math.min(30, ball.xVelocity + r.dir));
  }
}

// ---------- 黃金球：hooks.score 的一層 ----------
export function scoreLayer(next: (ctrl: Controller, idx: 0 | 1) => number, ctrl: Controller, idx: 0 | 1): number {
  let pts = next(ctrl, idx);
  const r = F.rule;
  if (F.spec && r && r.golden) {
    pts = RULE_CFG.gold.points;        // 固定 2 分（喵喵自己的「得 2 分」不會再疊上去）
    r.pop = { side: idx, t: 0 };
    sfx('coin');
  }
  return pts;
}

// ---------- 電腦強度：hooks.ai 的一層 ----------
type AiNext = (player: Player, ball: Ball, opp: Player, input: UserInput) => void;
export function aiLayer(next: AiNext, player: Player, ball: Ball, opp: Player, input: UserInput): void {
  next(player, ball, opp, input);
  const d = F.spec && F.spec.diff;
  if (!d || !player.isComputer || !player.isPlayer2) return;
  const m = F.ai, mine = ball.x >= NET_X;
  if (mine && !m.mine && Math.random() < d.lapse) m.freeze = LAPSE_FRAMES;     // 球剛飛過來：慢半拍
  m.mine = mine;
  if (m.freeze > 0) { m.freeze--; input.xDirection = 0; input.yDirection = 0; input.powerHit = 0; return; }
  if (player.state === 0) {
    if (input.xDirection !== 0) { m.acc += d.move; if (m.acc >= 1) m.acc -= 1; else input.xDirection = 0; }   // 腳步變慢
    m.noSpike = Math.random() > d.spike;                                                                      // 這一跳殺不殺
  } else if (player.state === 1 && m.noSpike) input.powerHit = 0;
}

// ---------- 場上顯示 ----------
let hud: HTMLCanvasElement | null = null, hctx: CanvasRenderingContext2D | null = null, hudRect = '';
function syncHud(): boolean {
  if (flags.sim) return false;
  const gc = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!gc || !document.body) return false;
  if (!hud) {
    hud = document.createElement('canvas');
    hud.id = 'pv-exp-hud';
    hud.style.cssText = 'position:fixed;pointer-events:none;z-index:46;';
    document.body.appendChild(hud);
    hctx = hud.getContext('2d');
  }
  const r = svc.baseRect ? svc.baseRect(gc) : gc.getBoundingClientRect();
  if (!r.width || !r.height || !hctx) return false;
  const dpr = window.devicePixelRatio || 1, key = [r.left, r.top, r.width, r.height, dpr].join(',');
  if (key !== hudRect) {
    hudRect = key;
    hud.style.left = r.left + 'px'; hud.style.top = r.top + 'px';
    hud.style.width = r.width + 'px'; hud.style.height = r.height + 'px';
    hud.width = Math.round(r.width * dpr); hud.height = Math.round(r.height * dpr);
  }
  hctx.setTransform(hud.width / W, 0, 0, hud.height / H, 0, 0);
  return true;
}
function clearHud(): void { if (hud && hctx) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, hud.width, hud.height); } }
if (typeof window !== 'undefined') window.addEventListener('resize', () => { hudRect = ''; });

export function drawHud(c: Controller): void {
  const spec = F.spec;
  if (!spec || !syncHud()) return;
  const g = hctx as CanvasRenderingContext2D, t = F.tick;
  g.clearRect(0, 0, W, H);
  if (!c.view.game.visible) return;
  const lite = !!(svc.fxLite && svc.fxLite());
  const b = F.boss, def = spec.boss;
  if (b && def) {
    const ph = c.physics;
    if (b.hurt > 0 && !lite) {
      const vg = g.createRadialGradient(NET_X, H / 2, 90, NET_X, H / 2, 260);
      vg.addColorStop(0, 'rgba(255,0,40,0)'); vg.addColorStop(1, 'rgba(255,0,40,' + (0.55 * b.hurt / 12) + ')');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    if (b.phase === 2 && !lite) {      // 第二階段的氣氛：往上飄的火星
      for (let i = 0; i < 14; i++) {
        const px = (i * 97 + Math.sin((t + i * 40) / 23) * 14 + 400) % W, py = H - ((t * 1.8 + i * 53) % (H + 20));
        g.globalAlpha = 0.3 + 0.25 * Math.sin((t + i * 9) / 6); g.fillStyle = '#FFB36B'; g.fillRect(px, py, 2, 2 + (i % 3));
      }
      g.globalAlpha = 1;
    }
    const myHp = Math.max(0, def.playerHp - c.scores[1]), bossHp = Math.max(0, def.hp - c.scores[0]);
    const sh = b.hit > 0 ? Math.sin(b.hit * 2.6) * 3 : 0, sh2 = b.hurt > 0 ? Math.sin(b.hurt * 2.6) * 3 : 0;
    label(g, charName(ph.player1.character), 16, 11, 10, '#fff', 'left');
    bar(g, 16 + sh2, 19, 150, 9, def.playerHp, myHp, myHp <= 1 ? '#FF5252' : '#69F0AE', false, myHp + (b.hurt > 0 ? 1 : 0), b.hurt / 12);
    label(g, charName(ph.player2.character), 416, 11, 10, '#FFE0B2', 'right');
    bar(g, 266 + sh, 19 + Math.abs(sh) * 0.4, 150, 9, def.hp, bossHp, b.phase === 2 ? '#FF7043' : '#FFB74D', true, bossHp + (b.hit > 0 ? 1 : 0), b.hit / 12);
    // 第二階段的門檻記號
    const mx = 266 + sh + 150 * (def.hp - def.phase2AtHp) / def.hp;
    g.fillStyle = '#000'; g.fillRect(mx - 1.5, 15, 3, 17);
    label(g, b.phase === 2 ? T.phase2Tag : spec.title, NET_X, 12, 9, b.phase === 2 ? '#FFAB91' : '#fff');
    for (let h1 = 0; h1 < (spec.maxHearts || START_HEARTS); h1++) heart(g, NET_X - 14 + h1 * 14, 27, 5, h1 < spec.hearts);
    if (b.cut > 0) {
      const k2 = 1 - b.cut / CUT_FRAMES;
      g.globalAlpha = 0.55 * Math.sin(Math.PI * Math.min(1, k2 * 1.2)); g.fillStyle = '#2A0A00'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      slam(g, T.phase2Title, NET_X, 118, 30, '#FFAB91', CUT_FRAMES - b.cut);
      label(g, T.phase2Note, NET_X, 150, 13, '#fff');
    }
    if (b.flash > 0) { if (!lite) { g.globalAlpha = 0.5 * b.flash / 6; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; } b.flash--; }
    mech.drawMech(g, c, label);
    return;
  }
  for (let h2 = 0; h2 < (spec.maxHearts || START_HEARTS); h2++) heart(g, NET_X - 14 + h2 * 14, 14, 5.5, h2 < spec.hearts);
  label(g, spec.title, NET_X, 30, 9, '#fff');
  if (F.rule) drawRule(c, g, F.rule, t, lite);
  mech.drawMech(g, c, label);
}

function charName(id: string): string { const ch = CHARS.byId[id]; return ch ? ch.name : id; }

const RULE_COLOR: Record<RuleId, string> = { rain: '#4FC3F7', gold: '#FFD54F', wind: '#B2FF59', lowgrav: '#FF8AD8' };

function drawRule(c: Controller, g: CanvasRenderingContext2D, r: RuleState, t: number, lite: boolean): void {
  const ball = c.physics.ball, live = c.state === c.round && !c.roundEnded && !c.gameEnded;
  if (r.id === 'rain') {
    const Rn = RULE_CFG.rain;
    g.strokeStyle = 'rgba(180,225,255,0.35)'; g.lineWidth = 1;
    for (let i = 0, n = lite ? 14 : 40; i < n; i++) {
      const rx = (i * 61 + t * 7) % (W + 40) - 20, ry = (i * 37 + t * 11) % (H + 20) - 10;
      g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 3, ry + 9); g.stroke();
    }
    r.puddles.forEach((pd) => {
      const on = pd.t >= Rn.warn, endIn = Rn.warn + Rn.life - pd.t;
      g.globalAlpha = on ? (endIn < 25 && endIn % 6 < 3 ? 0.35 : 0.8) : 0.12 + 0.3 * pd.t / Rn.warn;
      g.fillStyle = '#29B6F6';
      g.beginPath(); g.ellipse(pd.x, FLOOR_Y, Rn.half, 5, 0, 0, Math.PI * 2); g.fill();
      // 顏色之外的提示：還沒生效是虛線框，生效後有反光和「彈」的記號
      if (!on) { g.strokeStyle = '#B3E5FC'; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = '#E1F5FE'; g.beginPath(); g.ellipse(pd.x - 7, FLOOR_Y - 1, 7, 1.6, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; label(g, '⤴', pd.x, FLOOR_Y - 10 - (t % 8 < 4 ? 1 : 0), 9, '#E1F5FE'); }
      g.globalAlpha = 1;
    });
    r.splash = r.splash.filter((sp) => {
      sp.t++;
      g.globalAlpha = 1 - sp.t / 14; g.strokeStyle = '#B3E5FC'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(sp.x, FLOOR_Y, 10 + sp.t * 3, 3 + sp.t, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
      return sp.t < 14;
    });
  } else if (r.id === 'lowgrav') {
    const on = lowgravOn(r.rt) && live, warn = lowgravWarn(r.rt) && live;
    if (on || warn) {
      if (!lite) { g.globalAlpha = on ? 0.12 : 0.06 + 0.06 * Math.sin(t / 2); g.fillStyle = '#FF80C8'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      for (let k = 0; k < (lite ? 4 : 9); k++) {
        const nx = (k * 53 + 30) % W, ny = H - ((t * (on ? 1.2 : 0.6) + k * 41) % H);
        label(g, k % 2 ? '♪' : '♫', nx, ny, 12, '#FFB3E6');
      }
      if (warn) label(g, T.lullabyWarn, NET_X, 64, 14, '#FFB3E6');
      else {
        const L = RULE_CFG.lowgrav, left = 1 - (r.rt % L.period - L.onAt) / (L.period - L.onAt);
        g.fillStyle = '#000'; g.fillRect(NET_X - 41, 57, 82, 8); g.fillStyle = '#FF8AD8'; g.fillRect(NET_X - 40, 58, 80 * left, 6);
        label(g, T.lullabyOn, NET_X, 72, 10, '#FFB3E6');
      }
    }
  } else if (r.id === 'wind') {
    const won = windOn(r.rt) && live, wwarn = windWarn(r.rt) && live, dir = r.dir;
    if (won || (wwarn && t % 6 < 4)) {
      g.save(); g.translate(NET_X, 60); g.scale(dir, 1);
      g.fillStyle = won ? '#B2FF59' : '#FFFFFF'; g.strokeStyle = '#000'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-26, -5); g.lineTo(8, -5); g.lineTo(8, -12); g.lineTo(26, 0); g.lineTo(8, 12); g.lineTo(8, 5); g.lineTo(-26, 5); g.closePath(); g.stroke(); g.fill();
      g.restore();
      label(g, wwarn ? T.windWarn : T.windOn, NET_X, 80, wwarn ? 13 : 10, won ? '#B2FF59' : '#fff');
    }
    if (won) {
      g.strokeStyle = 'rgba(220,255,200,0.45)'; g.lineWidth = 1.5;
      for (let w = 0, wn = lite ? 6 : 16; w < wn; w++) {
        const wy = 40 + (w * 47) % 200, base = (w * 97 + t * 9) % (W + 80) - 40, wx = dir > 0 ? base : W - base;
        g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx - dir * (18 + (w % 3) * 8), wy); g.stroke();
      }
    }
  } else {
    const G = RULE_CFG.gold, ev = mech.has('weatherBall') ? 3 : G.every, nextGold = r.rally % ev === G.first % ev;
    const serving = (c.state === c.beforeStartOfNextRound || c.state === c.afterEndOfRound || c.state === c.startOfNewGame) && nextGold && !c.gameEnded;
    if (serving) { label(g, T.goldBall, NET_X, 112, 30, '#FFD54F'); label(g, T.goldWorth, NET_X, 140, 15, '#fff'); }
    if (r.golden && c.state === c.round && !c.roundEnded) {
      g.globalAlpha = 0.85; g.strokeStyle = '#FFD54F'; g.lineWidth = 3;
      g.beginPath(); g.arc(ball.x, ball.y, 22 + Math.sin(t / 2) * 2, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      label(g, '×2', ball.x, ball.y - 30, 10, '#FFD54F');
    }
    if (r.pop && ++r.pop.t < 30) label(g, '+2', r.pop.side === 1 ? 382 : 50, 62 - r.pop.t, 22, '#FFD54F');
  }
  label(g, T.ruleName[r.id], NET_X, 44, 9, RULE_COLOR[r.id]);
}
