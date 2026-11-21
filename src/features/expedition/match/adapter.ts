/**
 * 遠征跟遊戲本體的接線（M0 報告 §3 的三個接線點），照冠軍之路（campaign/match.ts）的做法：
 *
 *  1. 入場 start()：記下原本的設定 → 設定雙方角色、勝分 → state = startOfNewGame。
 *     呼叫前 matchId 已經寫進存檔（ui.ts 先呼叫 db.beginMatch）。
 *  2. 結算：比分只在遊戲本體 controller.ts 的 round() 改變；這裡偵測到 gameEnded 的第一幀
 *     就把結果交出去（只交一次），存檔層再用 matchId 去重。
 *  3. 離場 stop()：還原角色、勝分、練習模式，回到標題畫面。
 *
 * 比賽的修飾（場地規則、卡牌、首領…）都在 field.ts；spec.field 沒給的話比賽跟遊戲本體原本的一模一樣。
 */
import { hooks } from '../../../core/hooks';
import { svc } from '../../../core/services';
import type { CharacterId, Controller, GameState } from '../../../core/types';
import type { MatchResult } from '../types';
import * as field from './field';
import type { FieldSpec } from './field';

export interface MatchSpec {
  matchId: string;
  p1: CharacterId;
  p2: CharacterId;
  score: number;
  /** 場地規則、卡牌、電腦強度、首領…（不給就是完全沒有修飾的比賽） */
  field?: FieldSpec;
  /** 除錯用：左邊也交給電腦打（電腦對電腦，檢查場地規則會不會卡死）。不會寫存檔。 */
  cpuP1?: boolean;
}

/** 比賽結束時交出去的額外資訊 */
export interface EndInfo {
  /** 首領戰打到過的最高階段（沒有首領是 0） */
  bossReached: number;
}
/** 分出勝負的那一幀呼叫一次 */
export type OnEnd = (matchId: string, result: Exclude<MatchResult, 'forfeit'>, scores: [number, number], info: EndInfo) => void;
/** 比賽被打斷（切到背景、連線開始、玩家從選單按了重來…）。不算輸。 */
export type OnInterrupt = (why: 'hidden' | 'left') => void;

interface Saved { c1: CharacterId; c2: CharacterId; k1: boolean; k2: boolean; win: number; practice: boolean }

const S = {
  spec: null as MatchSpec | null,
  saved: null as Saved | null,
  /** 這一場已經交出結果 */
  ended: false,
  /** 交出結果後再顯示幾幀「GAME END」才停下來 */
  endFrames: 0,
  onEnd: null as OnEnd | null,
  onInterrupt: null as OnInterrupt | null,
  hiddenPaused: false,
};

const waitState: GameState = function (this: Controller) { this.view.game.drawCloudsAndWave(); };
const END_SHOW_FRAMES = 45;   // 約 1.8 秒；遊戲本體 70 幀後按殺球會回標題，要在那之前停住

export function playing(): boolean { return !!S.spec; }
export function currentMatchId(): string | null { return S.spec ? S.spec.matchId : null; }
/** 現在這一場的首領打到過的最高階段（放棄本場時用） */
export function bossReached(): number { return field.bossReached(); }

function netBusy(): boolean { const n = svc.net && svc.net.state; return !!(n && (n.phase !== 'off' || n.render)); }
/** 其他模式正在用遊戲本體（冠軍之路、連線）：不能開打 */
export function otherModeBusy(): boolean { return netBusy() || !!(svc.campaign && svc.campaign.isActive()); }

export function start(spec: MatchSpec, onEnd: OnEnd, onInterrupt: OnInterrupt): boolean {
  const c = svc.ctrl;
  if (!c || otherModeBusy()) return false;
  const ph = c.physics;
  if (!S.saved) S.saved = { c1: ph.player1.character, c2: ph.player2.character, k1: ph.player1.isComputer, k2: ph.player2.isComputer, win: c.winningScore, practice: !!c.isPracticeMode };
  S.spec = spec; S.ended = false; S.endFrames = 0; S.onEnd = onEnd; S.onInterrupt = onInterrupt; S.hiddenPaused = false;
  ph.player1.character = spec.p1; ph.player2.character = spec.p2;
  ph.player1.isComputer = !!spec.cpuP1; ph.player2.isComputer = true;
  if (c.isPracticeMode) c.isPracticeMode = false;
  c.winningScore = spec.score;
  c.paused = false;
  c.slowMotionFramesLeft = 0;
  c.view.intro.visible = false;
  c.view.menu.visible = false;
  c.frameCounter = 0;
  c.noInputFrameCounter = 0;
  c.view.game.visible = false;
  try { c.audio.sounds.bgm.stop(); } catch { /* 沒有音效 */ }
  field.end(c);
  if (spec.field) field.begin(c, spec.field);
  c.state = c.startOfNewGame;
  return true;
}

/** 離場：還原設定。toTitle：送回標題畫面。 */
export function stop(toTitle: boolean): void {
  const c = svc.ctrl;
  S.spec = null; S.onEnd = null; S.onInterrupt = null; S.ended = false; S.hiddenPaused = false;
  field.end(c);
  if (c && S.saved) {
    const s = S.saved, ph = c.physics;
    ph.player1.character = s.c1; ph.player2.character = s.c2;
    ph.player1.isComputer = s.k1; ph.player2.isComputer = s.k2;
    c.winningScore = s.win;
    c.isPracticeMode = s.practice;
    c.paused = false;
    if (toTitle) c.restart();
  }
  S.saved = null;
}

/** 切回前景後玩家按「繼續」 */
export function resume(): void {
  const c = svc.ctrl;
  if (!c || !S.spec) return;
  S.hiddenPaused = false;
  clearInputs(c);
  c.paused = false;
}

function clearInputs(c: Controller): void {
  c.keyboardArray.forEach((k) => {
    k.xDirection = 0; k.yDirection = 0; k.powerHit = 0; k.dashRequest = 0;
    [k.leftKey, k.rightKey, k.upKey, k.downKey, k.powerHitKey, k.downRightKey].forEach((ks) => { if (ks) { ks.isDown = false; ks.isUp = true; } });
  });
}

// ---------- 掛勾 ----------

function tickLayer(next: (c: Controller) => boolean | void, c: Controller): boolean | void {
  const spec = S.spec;
  if (!spec) return next(c);
  if (netBusy()) { const cb = S.onInterrupt; stop(false); if (cb) cb('left'); return next(c); }
  if (field.pre(c) === false) return false;     // 首領換階段的預告：整幀停住
  const ph = c.physics, k0 = c.keyboardArray[0], k1 = c.keyboardArray[1];
  // 比賽中從選角面板換角色不算數（百變怪自己會變身，不管它）
  if (spec.p1 !== 'ditto' && ph.player1.character !== spec.p1) ph.player1.character = spec.p1;
  if (spec.p2 !== 'ditto' && ph.player2.character !== spec.p2) ph.player2.character = spec.p2;
  ph.player1.isComputer = !!spec.cpuP1; ph.player2.isComputer = true;
  // 兩組按鍵（和兩邊的觸控）都能控制自己
  if (!k0.xDirection) k0.xDirection = k1.xDirection;
  if (!k0.yDirection) k0.yDirection = k1.yDirection;
  if (k1.powerHit === 1) k0.powerHit = 1;
  if (!k0.dashRequest && k1.dashRequest) k0.dashRequest = k1.dashRequest;
  // 剛開新的一場的頭一幀，gameEnded 還是上一場的，所以只在對打中才看
  if (c.state === c.round && c.gameEnded) {
    if (!S.ended) {
      S.ended = true;
      const win = !!ph.player1.isWinner;
      const cb = S.onEnd;
      if (cb) cb(spec.matchId, win ? 'win' : 'loss', [c.scores[0], c.scores[1]], { bossReached: field.bossReached() });
    } else if (++S.endFrames >= END_SHOW_FRAMES) {
      c.state = waitState;     // 停在場上，等畫面上的結算
    }
  }
  const res = next(c);
  if (res !== false) field.physics(c);          // 只在這一幀真的會跑物理時才套（擊球停格的幀不算）
  return res;
}

function gameLoopLayer(next: (c: Controller) => void, c: Controller): void {
  next(c);
  field.drawHud(c);
  // 玩家從選單按了「重來」：遊戲本體自己回到標題。比賽算中斷（不扣心，下次從頭重打）
  if (S.spec && !S.ended && (c.state === c.intro || c.state === c.menu)) {
    const cb = S.onInterrupt; stop(false); if (cb) cb('left');
  }
}

export function installHooks(): void {
  hooks.tick.use(tickLayer);
  hooks.gameLoop.use(gameLoopLayer);
  hooks.score.use(field.scoreLayer);
  hooks.ai.use(field.aiLayer);
  // 切到背景：暫停並清空按鍵；回到前景要玩家明確按「繼續」（SPEC §5.2）
  document.addEventListener('visibilitychange', () => {
    const c = svc.ctrl;
    if (!c || !S.spec || S.ended || document.visibilityState !== 'hidden') return;
    c.paused = true;
    S.hiddenPaused = true;
    clearInputs(c);
    const cb = S.onInterrupt; if (cb) cb('hidden');
  });
  window.addEventListener('blur', () => { const c = svc.ctrl; if (c && S.spec) clearInputs(c); });
}
