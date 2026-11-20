// ============================================================
// 開打／結束／離開，以及每幀接管遊戲本體的那幾層掛勾
// 做法跟連線對戰的房主一樣：直接設定兩邊角色後把遊戲本體切到 startOfNewGame，
// 比賽結束時攔下來不回標題畫面，改顯示闖關的畫面。
// ============================================================
import { flags } from '../../core/services';
import type { SideState } from '../../core/side-state';
import type { CharacterId, Controller } from '../../core/types';
import { CFG, STAGES, ruleFor, zoneIdx, zoneOf } from './config';
import { CH } from './chars';
import { AB, camp, ctrlOf, ensureGame, netBusy, newAi, save } from './state';
import type { LoseInfo, Run } from './state';
import { abandon, applyLoss, checkSpecial, owned, persist, unlock } from './save';
import { resetSprites, restoreTuning, scoreBoards, setBgmSpeed, setTint, setTuning, waitState } from './field';
import { newRule, rulePhysics } from './rules';
import { applyPhase, bossTick } from './boss';
import { post } from './ko';
import { clearHud, drawHud } from './hud';
import { sfx } from './sfx';
import { go, render } from './ui/screens';
import { hide } from './ui/dom';
import { playAcquire, playClear } from './ui/overlays';

/** run.char／order 都已經檢查過是角色 id（讀檔時、或 buildOrder 從 CFG 排出來的） */
function asId(id: string): CharacterId { return id as CharacterId; }

export function startMatch(): void {
  const run = save.run;
  if (!run) return;
  if (netBusy()) { camp.toast = '先離開連線房間，才能闖關。'; go('vs'); return; }
  const c = ctrlOf();
  if (!c) { ensureGame(); camp.wantStart = true; render(); return; }
  hookCtrl();
  camp.wantStart = false;
  const ph = c.physics, p1 = ph.player1, p2 = ph.player2;
  let idx = run.idx, z = zoneOf(idx);
  if (!camp.saved) camp.saved = { c1: p1.character, c2: p2.character, k1: p1.isComputer, k2: p2.isComputer, win: c.winningScore, practice: !!c.isPracticeMode, startFrames: c.frameTotal.startOfNewGame };
  abandon();                                      // 保險：上一場沒打完的話先結算
  idx = run.idx; z = zoneOf(idx);
  run.live = 1;
  camp.opp = run.order[idx];
  // 這一輪第幾次挑戰這一關；第一次的話記進首勝率
  run.att = run.att || {};
  run.att[idx] = (run.att[idx] || 0) + 1;
  if (run.att[idx] === 1 && !camp.proxy) { const sk = idx + ':' + camp.opp; save.stats[sk] = save.stats[sk] || { t: 0, w: 0 }; save.stats[sk].t++; }
  persist();
  p1.character = asId(run.char); p2.character = asId(camp.opp);
  p1.isComputer = !!camp.proxy; p2.isComputer = true;
  if (c.isPracticeMode) c.isPracticeMode = false;
  // 一般關一定有 score
  c.winningScore = z.boss ? CFG.boss.hp : z.score as number;
  c.frameTotal.startOfNewGame = CFG.startFrames;
  c.paused = false;
  c.slowMotionFramesLeft = 0;
  c.view.intro.visible = false;
  c.view.menu.visible = false;
  c.frameCounter = 0;
  c.noInputFrameCounter = 0;
  c.view.game.visible = false;                     // 關掉再開，上一場的訊息才會收起來
  try { c.audio.sounds.bgm.stop(); } catch (e) { /* 沒有音效 */ }
  c.state = c.startOfNewGame;

  camp.playing = true; camp.waiting = false; camp.ko = null; camp.prevState = null;
  camp.diff = CFG.diff[idx]; camp.ai1 = newAi(); camp.ai2 = newAi();
  camp.boss = null; camp.tut = 0; camp.speedEvery = 0; camp.spd = 0;
  const rid = ruleFor(idx, camp.opp);
  camp.rule = rid ? newRule(rid) : null;
  flags.goldBall = false;
  restoreTuning();
  resetSprites(c);
  setBgmSpeed(c, 1);
  if (z.boss) {
    camp.boss = { phase: run.bossPhase || 1, init: true, pending: 0, cut: 0, next: 0, flash: 0, hit: 0, hurt: 0, s0: -1, s1: -1 };
    applyPhase(c, camp.boss.phase, false);
    scoreBoards(c, false);
  } else {
    setTint(c, z.tint as number);
    scoreBoards(c, true);
  }
  // 第一關是教學：鯉魚王不會隨機進化，玩家拿到 3 分時固定進化一次給他看
  if (idx === 0 && camp.opp === 'magikarp' && !save.tutDone) {
    camp.tut = 1;
    setTuning({ magikarpEvolveChance: 0, magikarpReceiveEvolve: 0 });
  }
  hide(true);
}

// 只在比賽中（save.run 有值）分出勝負時呼叫
function finish(c: Controller): void {
  const run = save.run as Run, win = !!c.physics.player1.isWinner, boss = !!camp.boss, opp = camp.opp, sc = c.scores.slice();
  camp.waiting = true;
  run.live = 0;
  c.state = waitState;
  restoreTuning(); camp.speedEvery = 0; camp.tut = 0; setBgmSpeed(c, 1);
  const steps: ((next: () => void) => void)[] = [];
  let after: () => void;
  if (win) {
    if (run.idx === 0) save.tutDone = 1;
    if (run.att && run.att[run.idx] === 1 && !camp.proxy) { const sk2 = run.idx + ':' + opp; if (save.stats[sk2]) save.stats[sk2].w++; }
    const got = unlock(opp), full = save.acq < CFG.fullAcquire || opp === 'mewtwo' || opp === 'dragonite';
    if (got) save.acq++;
    if (run.idx >= STAGES - 1) {
      let m = save.medals[run.char];
      const rec = !!m && (run.lost < m.lost || (run.lost === m.lost && run.frames < m.frames));
      m = m || { n: 0, frames: 0, lost: 99 };
      m.n++;
      if (run.lost < m.lost || (run.lost === m.lost && (!m.frames || run.frames < m.frames))) { m.lost = run.lost; m.frames = run.frames; }
      save.medals[run.char] = m;
      camp.lastRun = run;
      save.run = null;
      if (!camp.proxy) { save.runs.push({ c: run.char, lost: run.lost, f: Math.round(run.frames), d: new Date().toISOString().slice(0, 10) }); if (save.runs.length > 30) save.runs.shift(); }
      const extra = checkSpecial();
      if (got) steps.push(function (next) { playAcquire(opp, true, next); });
      steps.push(function (next) { playClear(run, rec, next); });
      extra.forEach(function (id) { steps.push(function (next) { playAcquire(id, true, next); }); });
      after = function () {
        const fresh = CH.ids.filter(function (id) { return owned(id) && !save.medals[id]; });
        camp.pick = fresh.length ? fresh[0] : run.char;
        go('pick');
      };
    } else {
      run.idx++;
      run.bossPhase = 1;
      if (got) steps.push(function (next) { playAcquire(opp, full, next); });
      if (zoneIdx(run.idx) !== zoneIdx(run.idx - 1)) camp.toast = '進入「' + zoneOf(run.idx).name + '」';
      after = function () { camp.travelFrom = run.idx - 1; camp.autoVs = true; go('vs'); };
    }
  } else {
    // 一般關一定有 score
    const L: LoseInfo = camp.lose = { opp: opp, sc: sc, boss: boss, out: false, from: run.idx, need: boss ? CFG.boss.hp : zoneOf(run.idx).score as number };
    L.out = applyLoss(run);
    after = function () { go('lose'); };
  }
  persist();
  if (camp.onFinish) { try { camp.onFinish(win); } catch (e) { /* 測試用的回呼出錯不影響遊戲 */ } }
  if (flags.sim) return;
  (function runSteps(i: number) { if (i < steps.length) steps[i](function () { runSteps(i + 1); }); else after(); })(0);
}

// 離開闖關模式：把角色、分數設定、場地都還原。restart：順便把遊戲本體送回標題畫面
export function suspend(c: Controller | null, restart: boolean): void {
  if (!camp.playing) return;
  if (!camp.waiting && save.run && save.run.live) {
    if (camp.ko && camp.ko.win) { save.run.live = 0; persist(); } else abandon();
  }
  camp.playing = false; camp.waiting = false; camp.boss = null; camp.tut = 0; camp.speedEvery = 0; camp.wantStart = false; camp.ko = null; camp.rule = null; flags.goldBall = false;
  restoreTuning();
  if (c) {
    setTint(c, 0xFFFFFF);
    setBgmSpeed(c, 1);
    resetSprites(c);
    const s = camp.saved;
    if (s) {
      c.physics.player1.character = s.c1; c.physics.player2.character = s.c2;
      c.physics.player1.isComputer = s.k1; c.physics.player2.isComputer = s.k2;
      c.winningScore = s.win;
      c.frameTotal.startOfNewGame = s.startFrames;
      c.isPracticeMode = s.practice;       // setter 會順便把計分板顯示還原
    } else scoreBoards(c, true);
    if (restart) c.restart();
  }
  camp.saved = null;
  clearHud();
}

// ============================================================
// 每幀（在所有其他掛勾之前）
// ============================================================
function pre(c: Controller): false | void {
  const run = save.run;
  if (netBusy()) { suspend(c, false); hide(); return; }
  camp.tick++;
  if (camp.waiting || !run) { drawHud(c); return; }
  const ph = c.physics, p1 = ph.player1, p2 = ph.player2, k0 = c.keyboardArray[0], k1 = c.keyboardArray[1];
  // 比賽中從角色面板換角色不算數（百變怪自己會變身，不管它）
  if (run.char !== 'ditto' && p1.character !== run.char) p1.character = asId(run.char);
  if (p2.character !== camp.opp) p2.character = asId(camp.opp);
  p1.isComputer = !!camp.proxy; p2.isComputer = true;
  if (!camp.proxy) {
    // 兩組按鍵（和兩邊的觸控）都能控制自己
    if (!k0.xDirection) k0.xDirection = k1.xDirection;
    if (!k0.yDirection) k0.yDirection = k1.yDirection;
    if (k1.powerHit === 1) k0.powerHit = 1;
    if (!k0.dashRequest && k1.dashRequest) k0.dashRequest = k1.dashRequest;
  }
  // 開新一場的頭一幀，分數和 gameEnded 還是上一場留下來的，所以下面這些只在對打中才看
  const live = c.state === c.round;
  if (live && !c.gameEnded) run.frames++;
  if (camp.tut && live) tutorial(c);
  if (camp.boss && bossTick(c, live) === false) { drawHud(c); return false; }
  if (live && c.gameEnded) {
    const K = CFG.ko;
    let k = camp.ko;
    if (!k) {
      const bw = !!p1.isWinner;
      k = camp.ko = { t: 0, win: bw, boss: !!camp.boss, x: c.physics.ball.punchEffectX || (bw ? 330 : 100), px: p2.x, py: p2.y, isNew: !owned(camp.opp), idx: run.idx, tint0: camp.boss ? CFG.boss.tint[camp.boss.phase - 1] : 0 };
      sfx(bw ? 'ko' : 'lose');
      if (bw) { run.live = 0; persist(); }
    }
    k.t++;
    if (k.win && k.t <= K.stop) { drawHud(c); return false; }      // 停格
    const hold = !k.win ? K.loseHold : k.boss ? K.bossHold : K.winHold;
    if (k.t >= hold || (k.t > (k.boss && k.win ? K.bossSkipAfter : K.skipAfter) && !camp.proxy && (k0.powerHit === 1 || k1.powerHit === 1))) finish(c);
  }
  camp.prevState = c.state;
  drawHud(c);
}

function tutorial(c: Controller): void {
  const a = AB(); if (!a) return;
  const s2: Partial<SideState> = a.state().p2 || {};
  if (camp.tut === 1 && c.scores[0] >= 3) { a.tuning.magikarpEvolveChance = 1; camp.tut = 2; }
  else if (camp.tut === 2 && s2.isGyarados) { a.tuning.magikarpEvolveChance = 0; camp.tut = 3; }
}

// ---------- 掛勾 ----------
/** hooks.tick 的一層（最外層）。舊版：pre 回傳 false 就整幀跳過；內層真的有跑物理時才套場地規則。 */
export function tickLayer(next: (c: Controller) => boolean | void, c: Controller): boolean | void {
  if (camp.playing && pre(c) === false) return false;
  const res = next(c);
  if (res !== false && camp.playing) rulePhysics(c);      // 只在這一幀真的有跑物理時才套規則（擊球停格的幀不算）
  return res;
}

/**
 * hooks.gameLoop 的一層（包在連線那層外面）。舊版是在 hookCtrl() 裡改寫 ctrl.gameLoop；
 * 現在這一層在 init 時就註冊好，hookCtrl() 只記錄「遊戲本體已經載好」。
 * 掛上之前 camp.playing 一定是 false（startMatch 會先呼叫 hookCtrl），這一層什麼都不做，所以效果一樣。
 */
export function gameLoopLayer(next: (c: Controller) => void, c: Controller): void {
  next(c);
  if (camp.playing && !camp.waiting) {
    // 超夢第三階段：每隔幾幀多跑一幀，全場變快
    if (camp.speedEvery && c.state === c.round && !c.paused && !c.gameEnded &&
        !(camp.boss && camp.boss.cut > 0) && ++camp.spd >= camp.speedEvery) { camp.spd = 0; next(c); }
    // 玩家按了選單的「重來」之類：遊戲本體自己回到標題，闖關就先收起來（進度還在）
    if (camp.playing && !camp.waiting && (c.state === c.intro || c.state === c.menu)) suspend(c, false);
  }
  if (camp.playing) post(c);
}

let hooked = false;
export function hookCtrl(): boolean {
  const c = ctrlOf();
  if (!c || hooked) return hooked;
  hooked = true;
  return true;
}
