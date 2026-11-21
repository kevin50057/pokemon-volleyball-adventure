/**
 * 遠征比賽中的修飾，把各個模組串起來：場地規則（rules）、數值卡（mods）、機制卡（mech）、覺醒（awaken）、
 * 電腦強度（ai）、首領（boss）、場上顯示（*-draw、hud）。
 *
 * 全部掛在 adapter.ts 的掛勾層上，只在遠征比賽進行中才有作用；begin() 沒給的項目完全不動
 * （「無修飾」的比賽跟遊戲本體原本的路徑一樣）。end() 把動過的東西全部還原。
 * 每球只有一顆計分用的真球；這裡不改碰撞箱、不改全域計時；比分只經過 hooks.score。
 */
import { flags, svc } from '../../../core/services';
import type { Ball, Controller, Player, UserInput } from '../../../core/types';
import { heart, label } from '../../campaign/draw';
import { sfx } from '../../campaign/sfx';
import type { Mods } from '../cards';
import { RULE_CFG, type BossDef, type Diff, type MechId, type RuleId } from '../content';
import { T } from '../texts';
import { newAiState, weakenAi, type AiState } from './ai';
import * as awaken from './awaken';
import { bossPhysics, bossPre, newBoss, phaseOf, type BossState } from './boss';
import { drawBoss } from './boss-draw';
import { NET_X, isLive } from './geom';
import { clearHud, hudContext } from './hud';
import * as mech from './mech';
import { applyMods, clearMods, newModsState, type ModsState } from './mods';
import { newRule, rulePhysics, type RuleState } from './rules';
import { drawRule } from './rules-draw';
import { restoreAll, scoreBoards, setBgmSpeed, setTint, setTuning } from './stage';

export interface FieldSpec {
  title: string;
  hearts: number;
  maxHearts: number;
  /** 上場夥伴的顯示名字（覺醒時會加★） */
  leadName: string;
  rule?: RuleId;
  diff?: Diff;
  mods?: Mods;
  /** 裝備中的機制卡 */
  mechs?: readonly MechId[];
  boss?: BossDef;
  /** 首領從第幾階段開始（同一次章節嘗試內打到過的最高階段） */
  bossStart?: number;
  /** 場地染色（時段氣氛） */
  tint?: number;
  /** 上場夥伴這一輪已經覺醒 */
  awakened?: boolean;
  /** 覺醒光環的顏色 */
  auraColor?: string;
}

const F = {
  spec: null as FieldSpec | null,
  rule: null as RuleState | null,
  boss: null as BossState | null,
  ai: newAiState() as AiState,
  mods: newModsState() as ModsState,
  tick: 0,
};

export function active(): boolean { return !!F.spec; }
/** 這一場打到過的首領最高階段（沒有首領是 0） */
export function bossReached(): number { return F.boss ? F.boss.reached : 0; }

function goldEvery(): number { return mech.has('weatherBall') ? 3 : RULE_CFG.gold.every; }

export function begin(c: Controller, spec: FieldSpec): void {
  F.spec = spec;
  F.rule = spec.rule ? newRule(spec.rule) : null;
  F.boss = null;
  F.ai = newAiState(); F.mods = newModsState(); F.tick = 0;
  mech.setup(spec.mechs);
  awaken.setup(c, spec.awakened ? c.physics.player1.character : '', spec.auraColor || '#FFD54F', T.awakenPop);
  flags.goldBall = false;
  if (spec.boss) {
    const start = Math.max(0, Math.min(spec.boss.phases.length - 1, spec.bossStart || 0));
    F.boss = newBoss(start);
    applyPhase(c, start);
  } else if (spec.tint !== undefined) setTint(c, spec.tint);
}

/** 首領切到第 idx 階段：色調、音樂、念力冷卻、這個階段的場地機制 */
function applyPhase(c: Controller, idx: number): void {
  const spec = F.spec;
  if (!spec || !spec.boss) return;
  const p = phaseOf(spec.boss, idx);
  setTint(c, p.tint);
  setBgmSpeed(c, p.bgm || 1);
  if (p.psyCooldown !== undefined) setTuning('psychicCooldown', p.psyCooldown);
  if (!spec.rule) F.rule = p.rule ? newRule(p.rule) : null;
}

export function end(c: Controller | null): void {
  if (!F.spec) return;
  const hadMods = !!F.spec.mods;
  F.spec = null; F.rule = null; F.boss = null;
  flags.goldBall = false;
  awaken.end(c);
  clearHud();
  restoreAll(c);
  if (c && hadMods) clearMods(c.physics.player1);
}

// ---------- 每幀：遊戲本體之前（可以讓整幀停住） ----------

/** 回傳 false：這一幀整個遊戲停住（首領換階段的預告） */
export function pre(c: Controller): false | void {
  const spec = F.spec;
  if (!spec) return;
  F.tick++;
  const b = F.boss, def = spec.boss;
  if (!b || !def) return;
  scoreBoards(c, false);
  return bossPre(c, b, def, (idx) => applyPhase(c, idx));
}

// ---------- 每幀：確定這一幀會跑物理之後、物理之前 ----------

export function physics(c: Controller): void {
  const spec = F.spec;
  if (!spec) return;
  const ph = c.physics, p1 = ph.player1, ball = ph.ball, live = isLive(c);
  if (spec.mods) applyMods(p1, ball, spec.mods, F.mods);
  const blocked = awaken.step(c);
  const def = spec.boss;
  const lastStand = def ? def.playerHp - c.scores[1] === 1 : c.winningScore - c.scores[1] === 1;
  mech.step(c, { blocked, lastStand, names: T.mechPop });
  const r = F.rule;
  flags.goldBall = r ? rulePhysics(c, r, { spares: mech.weatherSpares(), goldEvery: goldEvery() }) : false;
  if (F.boss && def) bossPhysics(c, F.boss, def, live);
}

// ---------- 計分：hooks.score 的一層（黃金球、喵喵覺醒） ----------
export function scoreLayer(next: (ctrl: Controller, idx: 0 | 1) => number, ctrl: Controller, idx: 0 | 1): number {
  let pts = next(ctrl, idx);
  if (!F.spec) return pts;
  pts = awaken.adjustScore(pts, idx);
  const r = F.rule;
  if (r && r.golden) {
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
  if (d) weakenAi(d, F.ai, player, ball, input);
}

// ---------- 場上顯示 ----------
export function drawHud(c: Controller): void {
  const spec = F.spec;
  if (!spec) return;
  const g = hudContext();
  if (!g) return;
  const t = F.tick, lite = !!(svc.fxLite && svc.fxLite());
  g.clearRect(0, 0, 432, 304);
  if (!c.view.game.visible) return;
  awaken.draw(g, c, t, lite, spec.leadName, label);
  if (F.rule) drawRule(c, g, F.rule, t, lite, goldEvery());
  if (F.boss && spec.boss) drawBoss(g, c, F.boss, spec.boss, { title: spec.title, hearts: spec.hearts, maxHearts: spec.maxHearts, leadName: spec.leadName + (awaken.awakenedChar() ? '★' : '') }, t, lite);
  else {
    for (let h = 0; h < spec.maxHearts; h++) heart(g, NET_X - 14 + h * 14, 14, 5.5, h < spec.hearts);
    label(g, spec.title, NET_X, 30, 9, '#fff');
  }
  mech.drawMech(g, c, label);
}
