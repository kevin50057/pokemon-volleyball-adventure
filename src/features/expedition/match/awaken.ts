/**
 * 覺醒（進化之力）在比賽中的效果：只作用在玩家（左邊）上場的那一隻，而且這一輪已經覺醒。
 * 每隻都是「看得到的條件 → 一個效果」，改的是技能的規則，不是加倍率；發動時頭上跳字。
 * 改球路的效果一律過 aimAtCourt／boostSafely 再夾球速；同一次觸球覺醒優先於卡牌（step 回傳 true）。
 * 動到的技能數值（TUNING）都經過 stage.ts，比賽結束一次還原。
 */
import type { Controller, Player } from '../../../core/types';
import { pushBurst } from '../../abilities/fx';
import { rt } from '../../abilities/state';
import { TUNING } from '../../abilities/tuning';
import { aimAtCourt, clampV } from '../../abilities/util';
import { AWAKEN } from '../content';
import { GROUND_Y, clampBall, isLive, perfectSet } from './geom';
import { pop } from './mech';
import { restoreTuning, setTuning } from './stage';

export const AWAKEN_CFG = {
  pikachuCharges: 2, pikachuStun: 30,
  setVy: -19,
  joltCharges: 2, joltRegen: 60,
  glideMaxVy: 2, glideFrames: 20,
  solarStill: 20, solarMaxVx: 24,
  shellMaxVx: 20,
  karpTouches: 4,
  snorlaxStill: 10,
  jigglyMaxVx: 24,
  rageMaxVx: 28,
  curseSlow: 25,
  bombDeepVx: 14, bombShortVx: 5, bombDrop: 6,
  duneMaxVx: 20,
};

const A = {
  char: '' as string,
  /** 只有外觀（夢幻、超夢、百變怪）：畫光環和★，沒有效果 */
  look: false,
  // 可達鴨：對手剛殺過來的球
  oppSpiked: false,
  color: '#FFD54F',
  names: {} as Readonly<Record<string, string>>,
  touchEdge: false, spikeEdge: false, jumpEdge: false,
  prevState: null as Controller['state'] | null,
  // 皮卡丘：用身體接球蓄電（跨球保留），滿格的殺球必定麻痺
  charges: 0, sureStatic: false,
  // 火伊布：大字爆得分後，引火延到下一球的第一次殺球
  blastFlying: false, grantFlash: false, flashGranted: false, prevScore0: 0,
  // 雷伊布：電光一閃 2 格充能
  joltCharges: 0, joltRegen: 0, prevQa: 0,
  // 小火龍：滑翔
  glide: 0,
  // 妙蛙種子：站定蓄日光、卡比獸：站定
  still: 0, lastX: 0, solar: false,
  // 鯉魚王：觸球數
  karp: 0,
  // 快龍：上一幀的逆鱗
  prevOutrage: 0,
  // 喵喵：這一球對手踩過金幣
  coinTrip: false,
  // 水伊布：剛改過球路，幾幀內不再改（球還在地面附近）
  vapLock: 0,
  // 對手這一幀剛碰到球（耿鬼、大蔥鴨用）、上一個碰球的是誰
  touch2Edge: false, lastToucher: '' as '' | 'p1' | 'p2',
  // 耿鬼：自己殺過去的暗影球還在飛
  shadow: false,
  // 頑皮雷彈：這一次大爆炸的球路已經導引過
  bombSteered: false,
  // 果然翁：這一球的鏡面反射用過了
  mirrorUsed: false,
  // 三地鼠：上一幀的沙丘數
  prevMounds: 0,
  /** 這一場覺醒發動了幾次（除錯、壓測用） */
  fired: 0,
};

function fire(text: string, p: Player): void { pop(text, p); A.fired++; }
/** 這一場覺醒發動了幾次（除錯、壓測用） */
export function awakenFired(): number { return A.fired; }

export function awakenedChar(): string { return A.char; }

/** 比賽開始。char：覺醒的上場夥伴（沒有覺醒傳空字串） */
export function setup(c: Controller, char: string, color: string, names: Readonly<Record<string, string>>): void {
  A.char = char && AWAKEN[char] ? char : '';
  A.look = !!A.char && AWAKEN[A.char] === 'look'; A.oppSpiked = false;
  A.color = color; A.names = names;
  A.touchEdge = A.spikeEdge = A.jumpEdge = false; A.prevState = null;
  A.charges = 0; A.sureStatic = false;
  A.blastFlying = false; A.grantFlash = false; A.flashGranted = false; A.prevScore0 = 0;
  A.joltCharges = AWAKEN_CFG.joltCharges; A.joltRegen = 0; A.prevQa = 0;
  A.glide = 0; A.still = 0; A.lastX = c.physics.player1.x; A.solar = false; A.karp = 0; A.prevOutrage = 0; A.coinTrip = false; A.vapLock = 0;
  A.touch2Edge = false; A.lastToucher = ''; A.shadow = false; A.bombSteered = false; A.mirrorUsed = false; A.prevMounds = 0; A.fired = 0;
  const opp = c.physics.player2.character;
  // 整場都改的技能數值（TUNING 兩邊共用）：對手是同一隻、或是會變成同一隻的百變怪時不改
  if (opp === 'ditto') return;
  if (A.char === 'magikarp' && opp !== 'magikarp') { setTuning('magikarpEvolveChance', 0); setTuning('magikarpReceiveEvolve', 0); }
  if (A.char === 'psyduck' && opp !== 'psyduck') setTuning('psyTrip', 0);
  if (A.char === 'bird' && opp !== 'bird') setTuning('birdChargeFlaps', 2);
}

/** 光環的顏色、比賽中的名字（給 HUD） */
export function auraColor(): string { return A.color; }

/** 每一個真的會跑物理的幀（物理之前）。回傳 true：這一幀覺醒改了球路，卡牌這一下不要再改 */
export function step(c: Controller): boolean {
  const ch = A.char;
  if (!ch || A.look) return false;
  const ph = c.physics, p1 = ph.player1, ball = ph.ball, k0 = c.keyboardArray[0], s = rt.state.p1, os = rt.state.p2;
  const newRally = c.state === c.round && A.prevState !== c.round;
  A.prevState = c.state;
  if (newRally) { A.coinTrip = false; A.blastFlying = false; A.shadow = false; A.mirrorUsed = false; A.lastToucher = ''; A.oppSpiked = false; }
  // 火伊布：新的一球開始時把延長的引火給牠
  if (ch === 'flareon') {
    if (newRally && A.grantFlash) { s.flashFire = 2000; A.grantFlash = false; A.flashGranted = true; fire(A.names.flareon || '', p1); }
    if (c.scores[0] > A.prevScore0 && A.blastFlying) A.grantFlash = true;
    A.prevScore0 = c.scores[0];
    if (c.roundEnded && A.flashGranted && (s.flashFire || 0) > 0) { s.flashFire = 0; A.flashGranted = false; }
  }
  if (!isLive(c)) {
    // 這一球結束了：必定麻痺的數值馬上還原，不帶進下一球
    if (A.sureStatic) { A.sureStatic = false; restoreTuning('staticChance'); restoreTuning('staticStun'); }
    A.touchEdge = A.spikeEdge = A.touch2Edge = false;
    return false;
  }
  const touch = p1.isCollisionWithBallHappened, newTouch = touch && !A.touchEdge;
  A.touchEdge = touch;
  const spike = touch && p1.state === 2 && ball.isPowerHit, newSpike = spike && !A.spikeEdge;
  A.spikeEdge = spike;
  const jump = p1.state === 1, newJump = jump && !A.jumpEdge;
  A.jumpEdge = jump;
  const touch2 = ph.player2.isCollisionWithBallHappened, newTouch2 = touch2 && !A.touch2Edge;
  A.touch2Edge = touch2;
  // 上一個碰球的是誰（這一幀之前）：大蔥鴨要知道這顆球是不是直接從對手那邊來的
  const fromOpp = A.lastToucher === 'p2';
  if (newTouch2) A.lastToucher = 'p2';
  if (newTouch) A.lastToucher = 'p1';
  const name = A.names[ch] || '';
  let changed = false;

  if (ch === 'pikachu') {
    if (newTouch && !newSpike && A.charges < AWAKEN_CFG.pikachuCharges) A.charges++;
    if (newSpike && A.charges >= AWAKEN_CFG.pikachuCharges) {
      A.charges = 0; A.sureStatic = true;
      setTuning('staticChance', 1); setTuning('staticStun', AWAKEN_CFG.pikachuStun);
      fire(name, p1);
    }
    // 這一顆帶電的球被接到或落地（技能系統把 charged 清掉）：數值還原
    if (A.sureStatic && !s.charged && !newSpike) { A.sureStatic = false; restoreTuning('staticChance'); restoreTuning('staticStun'); }
  } else if (ch === 'vaporeon') {
    // 自己場上的球從地面附近往上彈（水窪彈起來，不是任何人碰到）：改成完美舉球
    if (A.vapLock > 0) A.vapLock--;
    else if (!touch && !ph.player2.isCollisionWithBallHappened && ball.x < 216 && ball.y > 225 && ball.yVelocity < -5) {
      perfectSet(ball, AWAKEN_CFG.setVy); fire(name, p1); changed = true; A.vapLock = 10;
    }
  } else if (ch === 'flareon') {
    if ((s.fireBall || 0) === 2) A.blastFlying = true;
    if (ph.player2.isCollisionWithBallHappened) A.blastFlying = false;
    if (newSpike && A.flashGranted) A.flashGranted = false;
  } else if (ch === 'jolteon') {
    const qa = s.qaCooldown || 0;
    if (A.joltCharges < AWAKEN_CFG.joltCharges && ++A.joltRegen >= AWAKEN_CFG.joltRegen) { A.joltCharges++; A.joltRegen = 0; }
    if (qa > 0 && A.prevQa <= 0) {          // 剛閃過去
      A.joltCharges = Math.max(0, A.joltCharges - 1);
      if (A.joltCharges > 0) { s.qaCooldown = 0; fire(name, p1); }
    } else if (qa > 0 && A.joltCharges > 0) s.qaCooldown = 0;
    A.prevQa = s.qaCooldown || 0;
  } else if (ch === 'charmander') {
    if (p1.state === 0) A.glide = 0;
    if ((p1.state === 1 || p1.state === 2) && k0.yDirection === -1 && p1.yVelocity > AWAKEN_CFG.glideMaxVy && A.glide < AWAKEN_CFG.glideFrames) {
      if (A.glide === 0) fire(name, p1);
      p1.yVelocity = AWAKEN_CFG.glideMaxVy; A.glide++;
    }
  } else if (ch === 'bulbasaur' || ch === 'snorlax') {
    const still = p1.state === 0 && p1.x === A.lastX && k0.xDirection === 0;
    A.still = still ? A.still + 1 : 0;
    A.lastX = p1.x;
    if (ch === 'bulbasaur') {
      if (!still && p1.state === 0) A.solar = false;
      if (A.still >= AWAKEN_CFG.solarStill) A.solar = true;
      if (newSpike && A.solar) {
        A.solar = false; s.leaf = 0;
        aimAtCourt(ball, false, AWAKEN_CFG.solarMaxVx); fire(name, p1); changed = true;
      }
    } else if (newTouch && !newSpike && A.still >= AWAKEN_CFG.snorlaxStill) { perfectSet(ball, AWAKEN_CFG.setVy); fire(name, p1); changed = true; }
  } else if (ch === 'squirtle') {
    if (newTouch && p1.state === 3) { aimAtCourt(ball, false, AWAKEN_CFG.shellMaxVx); fire(name, p1); changed = true; }
  } else if (ch === 'magikarp') {
    if (!s.isGyarados) {
      if (newTouch) A.karp = Math.min(AWAKEN_CFG.karpTouches, A.karp + 1);
      if (newJump && A.karp >= AWAKEN_CFG.karpTouches) {
        A.karp = 0;
        s.isGyarados = true;
        s.isRed = c.scores[1] - c.scores[0] >= 2;        // 落後 2 分以上：紅色暴鯉龍
        s.gyaradosTimer = s.isRed ? TUNING.redGyaradosFrames : 100;
        s.gyaFirst = true;
        pushBurst(p1.x, p1.y, s.isRed ? '#FF1744' : '#29B6F6', 100);
        fire(name, p1);
      }
    }
  } else if (ch === 'umbreon') {
    if (newTouch && !newSpike && (os.moonMark || 0) > 0) { perfectSet(ball, AWAKEN_CFG.setVy); fire(name, p1); changed = true; }
  } else if (ch === 'jigglypuff') {
    if (newSpike && k0.yDirection === 1 && p1.y < GROUND_Y - 10) { aimAtCourt(ball, false, AWAKEN_CFG.jigglyMaxVx); fire(name, p1); changed = true; }
  } else if (ch === 'dragonite') {
    const og = s.outrageTimer || 0;
    if (og <= 0 && A.prevOutrage > 0 && (s.reverseTimer || 0) > 0) { s.reverseTimer = 0; fire(name, p1); }   // 逆鱗結束後不混亂
    // 逆鱗疊到 3 層之後的殺球一定落在對面
    if (newSpike && og > 0 && (s.rageStacks || 0) >= 3) { aimAtCourt(ball, false, AWAKEN_CFG.rageMaxVx); fire(name, p1); changed = true; }
    A.prevOutrage = og;
  } else if (ch === 'psyduck') {
    // 念力接球：用身體接起對手的殺球，球變成完美的舉球（頭痛照樣疊一層）
    if (newTouch2) A.oppSpiked = ph.player2.state === 2 && ball.isPowerHit;
    if (newTouch && !newSpike && A.oppSpiked) { perfectSet(ball, AWAKEN_CFG.setVy); fire(name, p1); changed = true; }
    if (newTouch) A.oppSpiked = false;
  } else if (ch === 'bird') {
    // 雷雲：雷擊俯衝帶的電，對手接到一定麻痺
    if (newSpike && s.charged && !A.sureStatic) { A.sureStatic = true; setTuning('staticChance', 1); fire(name, p1); }
    if (A.sureStatic && !s.charged && !newSpike) { A.sureStatic = false; restoreTuning('staticChance'); }
  } else if (ch === 'meowth') {
    if ((os.slowTimer || 0) > 0) A.coinTrip = true;
  } else if (ch === 'gengar') {
    // 詛咒：對手碰到你殺過去的暗影球，被拖慢一陣子
    if (newSpike) A.shadow = true;
    else if (newTouch) A.shadow = false;
    if (newTouch2 && A.shadow) { A.shadow = false; os.slowTimer = AWAKEN_CFG.curseSlow; fire(name, ph.player2); }
  } else if (ch === 'electrode') {
    // 精準爆破：球路突變之後，往對手站的反方向偏（對手在後面就吊短、在前面就打深）
    if (!((s.bombTimer || 0) > 0)) A.bombSteered = false;
    else if (A.lastToucher !== 'p1') A.bombSteered = true;      // 對手已經碰到球：不再導引
    else if (!A.bombSteered && (s.bombFrame || 0) >= 10 && ball.x > 226) {
      A.bombSteered = true;
      const p2 = ph.player2;
      if (p2.x > ball.x + 30) { ball.xVelocity = AWAKEN_CFG.bombShortVx; ball.yVelocity = clampV(ball.yVelocity + AWAKEN_CFG.bombDrop); }
      else ball.xVelocity = Math.max(ball.xVelocity, AWAKEN_CFG.bombDeepVx);
      fire(name, p1); changed = true;
    }
  } else if (ch === 'wobbuffet') {
    // 鏡面反射：每一球第一次用身體接到的一般球，也會彈高、到最高點自動砸回去（接殺球的雙倍奉還照舊）
    if (newTouch && !newSpike && !A.mirrorUsed && !s.counterPending && ball.x < 216) {
      A.mirrorUsed = true;
      ball.xVelocity = 2; ball.yVelocity = -TUNING.counterLaunch;
      s.counterPending = true;
      fire(name, p1); changed = true;
    }
  } else if (ch === 'mrmime') {
    // 冰之屏障：用身體接球之後也會立起屏障（冷卻照舊）
    if (newTouch && !newSpike && !((s.barrierCD || 0) > 0) && !((s.barrierTimer || 0) > 0)) { s.barrierTimer = TUNING.barrierFrames; fire(name, p1); }
  } else if (ch === 'dugtrio') {
    // 流沙地獄：球落在沙丘上不再亂彈，直接彈回對面
    const n = (s.mounds || []).length;
    if (n < A.prevMounds && ball.yVelocity <= -8 && ball.y > 200 && ball.x < 216) { aimAtCourt(ball, false, AWAKEN_CFG.duneMaxVx); fire(name, p1); changed = true; }
    A.prevMounds = n;
  } else if (ch === 'farfetchd') {
    // 流星突擊：直接把對手打過來的任何球殺回去，都算居合斬
    if (newSpike && fromOpp && !(s.slash && s.slash.iai)) { aimAtCourt(ball, false, TUNING.iaiVx); s.boomerangTimer = 0; fire(name, p1); changed = true; }
  }
  if (changed) clampBall(ball);
  return changed;
}

/** 喵喵覺醒：得 2 分不靠機率——對手這一球踩過金幣、而你得分就是 2 分，否則 1 分（首領戰固定 1 分） */
export function adjustScore(pts: number, idx: 0 | 1, boss: boolean): number {
  if (A.char !== 'meowth' || idx !== 0) return pts;
  return boss ? 1 : A.coinTrip ? 2 : 1;
}

/** 比賽結束 */
export function end(c: Controller | null): void {
  if (c && A.char) { try { c.view.game.player1.tint = 0xFFFFFF; } catch { /* 畫面還沒建好 */ } }
  A.char = '';
}

type LabelFn = (g: CanvasRenderingContext2D, t: string, x: number, y: number, s: number, col?: string) => void;
/** 腳下的光環、名字旁的★、各自的層數（皮卡丘的電、雷伊布的充能、鯉魚王的觸球、妙蛙種子的光圈） */
export function draw(g: CanvasRenderingContext2D, c: Controller, t: number, lite: boolean, leadName: string, label: LabelFn): void {
  const ch = A.char;
  if (!ch) return;
  const p1 = c.physics.player1, pulse = 0.5 + 0.3 * Math.sin(t / 5);
  try { c.view.game.player1.tint = 0xFFF4D6; } catch { /* 畫面還沒建好 */ }
  g.globalAlpha = pulse; g.strokeStyle = A.color; g.lineWidth = 2.5;
  g.beginPath(); g.ellipse(p1.x, 268, 26 + Math.sin(t / 4) * 2, 5, 0, 0, Math.PI * 2); g.stroke();
  if (!lite) {
    for (let i = 0; i < 4; i++) {
      const a = t / 7 + i * Math.PI / 2;
      g.fillStyle = A.color; g.fillRect(p1.x + Math.cos(a) * 24, p1.y + 20 - ((t * 1.5 + i * 13) % 50), 2, 2);
    }
  }
  g.globalAlpha = 1;
  label(g, leadName + '★', p1.x, p1.y - 58, 8, A.color);
  const pips = (n: number, max: number, col: string): void => {
    for (let i = 0; i < max; i++) {
      g.fillStyle = '#000'; g.fillRect(p1.x - max * 5 + i * 10, p1.y - 50, 8, 5);
      g.fillStyle = i < n ? col : 'rgba(255,255,255,0.3)'; g.fillRect(p1.x - max * 5 + i * 10 + 1, p1.y - 49, 6, 3);
    }
  };
  if (ch === 'pikachu') pips(A.charges, AWAKEN_CFG.pikachuCharges, '#FFE14D');
  else if (ch === 'jolteon') pips(A.joltCharges, AWAKEN_CFG.joltCharges, '#FFE14D');
  else if (ch === 'magikarp') pips(A.karp, AWAKEN_CFG.karpTouches, '#29B6F6');
  else if (ch === 'wobbuffet') pips(A.mirrorUsed ? 0 : 1, 1, '#4FC3F7');
  else if (ch === 'bulbasaur' && (A.solar || A.still > 4)) {
    g.globalAlpha = A.solar ? 0.9 : 0.4; g.strokeStyle = '#FFF59D'; g.lineWidth = 2;
    g.beginPath(); g.arc(p1.x, 262, A.solar ? 16 : 16 * A.still / AWAKEN_CFG.solarStill, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  }
}
