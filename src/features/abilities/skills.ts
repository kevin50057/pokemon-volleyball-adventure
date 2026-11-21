// ============================================================
// 技能（每一邊每幀跑一次，見 tick.ts）
// ============================================================
import { svc } from '../../core/services';
import type { Ball, Controller, Player, UserInput } from '../../core/types';
import { CHARS } from '../characters';
import { pushBurst, pushFlash, tier } from './fx';
import { getTrail, newSide, pk, receivedSpike, rt, setTrail } from './state';
import type { AbilitySide, SideKey } from './state';
import { STARTER_ABILITIES } from './starters';
import { TUNING } from './tuning';
import {
  FLOOR_Y, GROUND_BALL_Y, GROUND_Y, NET_X, P1_MAX_X, P1_MIN_X, P2_MAX_X, P2_MIN_X,
  aimAtCourt, clampPlayer, clampV, edge, makePowerHit, moveBonus, powerHitEdge, skillKey, touchEdge,
} from './util';

type AbilityFn = (player: Player, opp: Player, ball: Ball, input: UserInput, s: AbilitySide, oppS: AbilitySide, ctrl: Controller) => void;

// 大蔥鴨「大蔥揮擊」：殺球姿勢中，球不用碰到身體，在大蔥構得到的範圍內就打得到。
// 做的事跟遊戲本體的殺球一樣（方向鍵決定球路），之後再交給 leekBoomerang 加上平快與回飄
export function leekReach(player: Player, ball: Ball, input: UserInput): void {
  if (player.character !== 'farfetchd') return;
  const s = rt.state[pk(player)];
  if (player.state !== 2) { s.leekSwung = false; return; }
  if (player.isCollisionWithBallHappened) { s.leekSwung = true; return; }   // 身體已經打到了
  if (s.leekSwung) return;                                                  // 一次揮擊只打一球
  if (Math.abs(ball.x - player.x) > TUNING.leekReachX || Math.abs(ball.y - player.y) > TUNING.leekReachY) return;
  const mine = player.isPlayer2 ? ball.x >= NET_X : ball.x < NET_X;           // 不能伸過網去打
  if (!mine || ball.y >= GROUND_BALL_Y - 2) return;
  s.leekSwung = true;
  ball.xVelocity = (player.isPlayer2 ? -1 : 1) * (Math.abs(input.xDirection) + 1) * 10;
  ball.yVelocity = Math.max(15, Math.abs(ball.yVelocity)) * input.yDirection * 2;
  ball.sound.powerHit = true;
  ball.isPowerHit = true;
  ball.punchEffectRadius = 20; ball.punchEffectX = ball.x; ball.punchEffectY = ball.y;
  player.isCollisionWithBallHappened = true;   // 這一幀的技能判斷用；物理算完就會被清掉，所以另外留 pvHit
  player.pvHit = true;
  rt.lastHitter = player;      // 球的屬性光跟著換成大蔥鴨的
  s.slash = { x: player.x, y: player.y, bx: ball.x, by: ball.y, t: 5 };
}

// 灼傷（火伊布造成）：時間內的第一次殺球會變弱，打完灼傷就解除
export function processBurn(player: Player, ball: Ball, key: SideKey): void {
  const s = rt.state[key];
  if (!(s.burnTimer > 0)) { s.burnHit = false; return; }
  s.burnTimer--;
  if (edge(s, 'burnHit', player.isCollisionWithBallHappened && player.state === 2) && ball.isPowerHit) {
    ball.xVelocity = Math.round(ball.xVelocity * TUNING.burnWeak);
    ball.yVelocity = Math.round(ball.yVelocity * TUNING.burnWeak);
    ball.isPowerHit = false;
    s.burnTimer = 0;
    pushBurst(ball.x, ball.y, '#9E9E9E', 45);
  }
}

export function processAbility(player: Player, opp: Player, ball: Ball, input: UserInput, key: SideKey, ctrl: Controller): void {
  let s = rt.state[key];
  const oppS = rt.state[key === 'p1' ? 'p2' : 'p1'];
  if (s.char !== player.character) {
    rt.state[key] = s = newSide();
    s.char = player.character;
    player.pvNoClamp = false;
    player.pvReachX = 0;
    player.pvMoveMult = player.pvDiveMult = undefined;
  }
  const def = CHARS.byId[player.character];
  if (!def || !def.ability) return;
  const fn = ABILITIES[def.ability];
  if (fn) fn(player, opp, ball, input, s, oppS, ctrl);
}

const ABILITIES: Record<string, AbilityFn | null> = {
  ...STARTER_ABILITIES,
  // 閃電鳥「雷擊俯衝」：同一次跳躍拍翅 3 次以上後殺球，球速加快、往下砸，而且帶電（對手接到會麻痺）
  flying: function (player, opp, ball, input, s, oppS) {
    const flaps = 6 - (player.flapsLeft || 0);
    s.thunderReady = player.state !== 0 && player.y < GROUND_Y && flaps >= TUNING.birdChargeFlaps;
    if (powerHitEdge(player, s, 'hit') && s.thunderReady) {
      aimAtCourt(ball, player.isPlayer2, TUNING.birdMaxVx);
      ball.punchEffectRadius = 35;
      pushBurst(ball.x, ball.y, '#FFE14D', 80);
      pushFlash('#FFE14D', 0.25, 6);
      tier(player, 3, ball.x, ball.y);
      s.charged = true;
    }
    if (s.charged) {
      if (edge(s, 'oppTouch', opp.isCollisionWithBallHappened)) {
        s.charged = false;
        if (Math.random() < TUNING.staticChance) {
          oppS.stunTimer = TUNING.staticStun; oppS.stunX = opp.x;
          pushBurst(opp.x, opp.y, '#FFE14D', 60);
        }
      } else if (ball.y >= GROUND_BALL_Y - 2) s.charged = false;
    }
  },

  // 水伊布：撲救留下水窪，球落在水窪會彈起
  acidArmor: function (player, opp, ball, input, s) {
    s.puddles = s.puddles || [];
    if (edge(s, 'diving', player.state === 3)) {
      s.puddles.push({ x: player.x, timer: TUNING.puddleLife, max: TUNING.puddleLife });
      if (s.puddles.length > TUNING.puddleMax) s.puddles.shift();
    }
    for (let i = s.puddles.length - 1; i >= 0; i--) {
      const pd = s.puddles[i];
      if (--pd.timer <= 0) { s.puddles.splice(i, 1); continue; }
      if (Math.abs(ball.x - pd.x) < 20 && ball.y >= GROUND_BALL_Y - 3 && ball.yVelocity > 0) {
        ball.yVelocity = -15;
        ball.y = GROUND_BALL_Y - 5;
        s.puddles.splice(i, 1);
        pushBurst(ball.x, FLOOR_Y, '#00BFFF', 40);
        break;
      }
    }
  },

  // 火伊布「烈焰重擊＋引火」
  //  - 殺出去的球是火球：對手用身體接到就灼傷（下一次殺球變弱）；直接把火球殺回來的話不會灼傷
  //  - 引火：自己用身體接起對手的殺球，就火力全開一小段時間，這時殺球是「大字爆」：一定落在對面場內、灼傷更久
  fireSmash: function (player, opp, ball, input, s, oppS) {
    if (edge(s, 'absorb', receivedSpike(player))) {
      s.flashFire = TUNING.flashFireFrames;
      pushBurst(player.x, player.y, '#FF5A1F', 70);
    }
    if (s.flashFire > 0) s.flashFire--;
    if (powerHitEdge(player, s, 'hit') && ball.isPowerHit) {
      const blast = s.flashFire > 0;
      if (blast) aimAtCourt(ball, player.isPlayer2, TUNING.fireBlastVx);   // 大字爆：單純再往下砸會掛網，所以改成瞄準對面
      else {
        ball.xVelocity = clampV(Math.round(ball.xVelocity * TUNING.fireSmash));
        if (TUNING.fireDown) ball.yVelocity = clampV(ball.yVelocity + TUNING.fireDown);
      }
      ball.punchEffectRadius = Math.min(ball.punchEffectRadius + (blast ? 18 : 10), 40);
      s.fireBall = blast ? 2 : 1;
      if (blast) {
        s.flashFire = 0;
        pushBurst(ball.x, ball.y, '#FF5A1F', 85);
        pushFlash('#FF5A1F', 0.25, 6);
        tier(player, 3, ball.x, ball.y);
      }
    }
    if (s.fireBall) {
      if (edge(s, 'oppTouch', opp.isCollisionWithBallHappened)) {
        if (opp.state !== 2) {
          oppS.burnTimer = s.fireBall === 2 ? TUNING.fireBlastBurn : TUNING.burnFrames;
          pushBurst(opp.x, opp.y, '#FF5A1F', 55);
        }
        s.fireBall = 0;
      } else if (ball.y >= GROUND_BALL_Y - 2 || (player.isCollisionWithBallHappened && player.state !== 2)) s.fireBall = 0;
    }
  },

  // 雷伊布：移動加速
  // 雷伊布「電光一閃」：連按兩下方向鍵，瞬間往那個方向閃過去（地上、空中都可以），
  // 閃完 0.6 秒內殺球會變成又快又準的電光殺球
  emWave: function (player, opp, ball, input, s) {
    moveBonus(player, input, TUNING.joltSpeed);
    if (s.qaCooldown > 0) s.qaCooldown--;
    // 自己判斷「連點兩下」：第一下必須是短促的點按（按住不超過 3 幀），第二下在 6 幀內。
    // 只看兩次按下的間隔的話，左右微調走位時很容易誤觸
    s.fc = (s.fc || 0) + 1;
    const dirNow = input.xDirection;
    let tap = 0;
    if (dirNow !== 0 && dirNow !== (s.prevDir || 0)) {
      if (s.tapDir === dirNow && s.fc - s.tapAt <= 6 && s.tapHeld <= 3) tap = dirNow;
      s.tapDir = dirNow; s.tapAt = s.fc; s.tapHeld = 0;
    } else if (dirNow !== 0 && dirNow === s.tapDir) s.tapHeld++;
    s.prevDir = dirNow;
    const req = (player.isComputer ? 0 : tap || skillKey(input)) || s.zipRequest || 0;
    s.zipRequest = 0;
    if (req && !s.qaCooldown && player.state < 3) {
      s.zipFrames = TUNING.qaFrames;
      s.zipDir = req;
      s.qaCooldown = TUNING.qaCooldown;
      setTrail(s, { x0: player.x, y: player.y, t: 8 });
      if (svc.fxEvent) svc.fxEvent('zipStart', { player: player, dir: req });
    }
    if (s.zipFrames > 0) {
      s.zipFrames--;
      player.x += s.zipDir * TUNING.qaDistance / TUNING.qaFrames;
      clampPlayer(player);
      getTrail(s)!.x1 = player.x;   // 跟舊版一樣：zipFrames > 0 時殘影一定已經建好
      getTrail(s)!.y = player.y;
      if (s.zipFrames === 0) {
        s.qaWindow = TUNING.qaWindow;
        if (svc.fxEvent) svc.fxEvent('zipEnd', { player: player, x0: getTrail(s)!.x0, x1: player.x, y: player.y });
      }
    }
    const zt = getTrail(s);
    if (zt && zt.t > 0) zt.t--;
    if (s.qaWindow > 0) {
      s.qaWindow--;
      if (powerHitEdge(player, s, 'qaHit')) {
        aimAtCourt(ball, player.isPlayer2, TUNING.qaSpikeVx);
        makePowerHit(ball, 35);
        pushBurst(ball.x, ball.y, '#FFE14D', 70);
        tier(player, 3, ball.x, ball.y);
        s.qaWindow = 0;
      }
    } else {
      s.qaHit = player.isCollisionWithBallHappened && player.state === 2;   // 讓邊緣偵測保持同步
    }
  },

  // 耿鬼：殺球後可穿網，推開對手；暗影球加速
  ghostPhase: function (player, opp, ball, input, s) {
    if (powerHitEdge(player, s, 'hit')) {
      s.ghostTimer = 37;
      player.pvNoClamp = true;
      ball.xVelocity = clampV(Math.round(ball.xVelocity * TUNING.shadowBall));
      if (TUNING.shadowDown) ball.yVelocity = clampV(ball.yVelocity + TUNING.shadowDown);
      pushFlash('#8B00FF', 0.25, 6);
    }
    if (s.ghostTimer > 0) {
      s.ghostTimer--;
      if (Math.abs(player.x - opp.x) < 40) {
        opp.x += (player.x < opp.x ? 1 : -1) * 4;
        clampPlayer(opp);
      }
      if (s.ghostTimer === 0) player.pvNoClamp = false;
    }
  },

  // 卡比獸：慢、跳低、肚皮彈球、落地震波
  bellyBounce: function (player, opp, ball, input, s) {
    moveBonus(player, input, -2);
    if (player.state === 1 && player.yVelocity < -10) player.yVelocity = -10;
    if (edge(s, 'body', player.isCollisionWithBallHappened && player.state !== 2)) {
      ball.yVelocity = -TUNING.bellyBounce;
      // 往對面推一點，避免球在肚子上無限直上直下
      if (TUNING.bellyPush) ball.xVelocity = clampV(ball.xVelocity + (player.isPlayer2 ? -1 : 1) * TUNING.bellyPush);
    }
    if (s.wasInAir && player.y >= GROUND_Y) {
      s.wasInAir = false;
      s.quake = 8;   // 每次落地都會有，所以只畫地震圈、不震畫面
      if (opp.y >= GROUND_Y - 4) opp.yVelocity = -8;
    }
    if (player.y < GROUND_Y) s.wasInAir = true;
    if (s.quake > 0) s.quake--;
  },

  // 喵喵：殺球撒金幣，對手踩到定身
  payday: function (player, opp, ball, input, s, oppS) {
    s.coins = s.coins || [];
    if (powerHitEdge(player, s, 'hit') && s.coins.length < TUNING.meowthMaxCoins) {
      const lo = player.isPlayer2 ? P1_MIN_X : P2_MIN_X;
      const hi = player.isPlayer2 ? P1_MAX_X : P2_MAX_X;
      s.coins.push({ x: lo + Math.random() * (hi - lo), timer: 100, max: 100 });
    }
    for (let i = s.coins.length - 1; i >= 0; i--) {
      const c = s.coins[i];
      if (--c.timer <= 0) { s.coins.splice(i, 1); continue; }
      if (Math.abs(opp.x - c.x) < TUNING.coinRadius && opp.y >= GROUND_Y - 4) {
        if (TUNING.coinSlow) oppS.slowTimer = TUNING.coinSlow;
        else { oppS.stunTimer = TUNING.coinStun; oppS.stunX = opp.x; }
        s.coins.splice(i, 1);
        pushBurst(c.x, FLOOR_Y, '#FFD700', 30);
        break;
      }
    }
  },

  // 超夢：移動快；殺球後球急墜、折返、猛砸
  // 超夢（Boss）：殺球後球會急墜；念力導向冷卻好的話，球一過網就被轉往對手場上「離對手最遠的那一邊」
  psychic: function (player, opp, ball, input, s) {
    moveBonus(player, input, TUNING.mewtwoSpeed);
    if (s.psyCooldown > 0) s.psyCooldown--;
    if (powerHitEdge(player, s, 'hit')) {
      s.psychicTimer = 40;
      s.psychicFrame = 0;
      s.redirected = false;
      rt.psyBall = { owner: pk(player) };   // 球變紫色＋殘影，直到對手碰到球或球落地
    }
    if (s.psychicTimer > 0) {
      s.psychicTimer--;
      s.psychicFrame++;
      if (opp.isCollisionWithBallHappened || ball.y >= GROUND_BALL_Y - 2) { s.psychicTimer = 0; return; }
      const onOppSide = player.isPlayer2 ? ball.x < NET_X : ball.x > NET_X;
      if (s.psychicFrame === 8) ball.yVelocity = clampV(ball.yVelocity + TUNING.psychicDrop);
      if (!s.redirected && !s.psyCooldown && TUNING.psychicReverse && onOppSide && ball.y < GROUND_BALL_Y - 40) {
        s.redirected = true;
        s.psyCooldown = TUNING.psychicCooldown;   // 冷卻好時超夢身邊有紫色光環
        const lo = player.isPlayer2 ? P1_MIN_X + 8 : P2_MIN_X + 8, hi = player.isPlayer2 ? P1_MAX_X - 8 : P2_MAX_X - 8;
        const far = Math.abs(opp.x - lo) > Math.abs(opp.x - hi) ? lo : hi;
        const target = opp.x + (far - opp.x) * TUNING.psychicAim;   // psychicAim：0 = 打向對手、1 = 打到最遠的角落
        const vy0 = ball.yVelocity, tt = -vy0 + Math.sqrt(vy0 * vy0 + 2 * Math.max(0, GROUND_BALL_Y - ball.y));
        if (tt > 0) ball.xVelocity = clampV(Math.round((target - ball.x) / tt));
        pushBurst(ball.x, ball.y, '#B048FF', 70);
        tier(player, 3, ball.x, ball.y, { k: 'psy' });
      }
    }
  },

  // 頑皮雷彈：球路突變後爆炸
  fakeBall: function (player, opp, ball, input, s, oppS) {
    if (powerHitEdge(player, s, 'hit')) { s.bombTimer = 25; s.bombFrame = 0; }
    if (s.bombTimer > 0) {
      s.bombTimer--;
      s.bombFrame++;
      if (s.bombFrame === 10) {
        ball.xVelocity = clampV(ball.xVelocity + (Math.random() - 0.5) * 12);
        ball.yVelocity = clampV(ball.yVelocity + (Math.random() - 0.5) * 8);
      }
      if (s.bombFrame === 25) {
        pushBurst(ball.x, ball.y, '#FF4444', 70);
        pushFlash('#FF4444', 0.2, 5);   // 每次殺球都會爆，不算技能級
        if (Math.abs(opp.x - ball.x) < 50) {
          opp.x += (opp.x < ball.x ? -1 : 1) * 30;
          clampPlayer(opp);
          oppS.stunTimer = 10;
          oppS.stunX = opp.x;
        }
      }
    }
  },

  // 果然翁：自己殺球弱，身體接殺球 2.5 倍反彈
  counter: function (player, opp, ball, input, s) {
    moveBonus(player, input, -1);
    if (edge(s, 'weak', player.isCollisionWithBallHappened && player.state === 2)) {
      ball.xVelocity = Math.round(ball.xVelocity * TUNING.wobbuffetSpike);
    }
    if (edge(s, 'counter', receivedSpike(player))) {
      // 先把球高高彈起（蓄力），到最高點再自動往對面猛砸
      ball.xVelocity = player.isPlayer2 ? -2 : 2;
      ball.yVelocity = -TUNING.counterLaunch;
      s.counterPending = true;
      makePowerHit(ball, 30);
      pushFlash('#4FC3F7', 0.3, 7);
      pushBurst(ball.x, ball.y, '#4FC3F7', 60);
    }
    if (s.counterPending) {
      if (opp.isCollisionWithBallHappened || ball.y >= GROUND_BALL_Y - 2) s.counterPending = false;
      else if (ball.yVelocity >= 0) {
        s.counterPending = false;
        aimAtCourt(ball, player.isPlayer2, TUNING.counterMaxVx);
        makePowerHit(ball, 35);
        pushFlash('#4FC3F7', 0.3, 6);
        pushBurst(ball.x, ball.y, '#4FC3F7', 80);
        tier(player, 3, ball.x, ball.y);
      }
    }
  },

  // （果然翁的反擊在 counterApex 處理）

  // 百變怪：變身在得分時處理
  transform: null,

  // 魔牆人偶：網上方彈珠牆
  barrier: function (player, opp, ball, input, s) {
    // 屏障不再是「原速反彈」：擋一球就碎；擋下的球只是軟軟掉回對面；對手的殺球會打穿，只被減速。碎掉或消失後要冷卻
    if (s.barrierCD > 0) s.barrierCD--;
    if (powerHitEdge(player, s, 'hit') && !(s.barrierCD > 0) && !(s.barrierTimer > 0)) s.barrierTimer = TUNING.barrierFrames;
    if (s.barrierTimer > 0) {
      s.barrierTimer--;
      if (s.barrierTimer === 0) s.barrierCD = TUNING.barrierCooldown;
      // 只擋「往自己這邊飛」的球；自己打出去的球直接通過
      const incoming = player.isPlayer2 ? ball.xVelocity > 0 : ball.xVelocity < 0;
      if (incoming && Math.abs(ball.x - NET_X) < 35 && ball.y > 30 && ball.y < 176) {
        const dir = player.isPlayer2 ? -1 : 1;   // 往對手那邊的方向
        if (ball.isPowerHit) {
          ball.xVelocity = clampV(ball.xVelocity * TUNING.barrierPierce);   // 殺球：打穿牆，但變慢
          ball.isPowerHit = false;
        } else {
          ball.xVelocity = dir * TUNING.barrierSoftVx;                      // 一般球：軟軟彈回去
          ball.yVelocity = Math.min(ball.yVelocity, -6);
          ball.x = NET_X + dir * 40;
        }
        pushBurst(ball.x, ball.y, '#FF69B4', 30);
        s.barrierTimer = 0; s.barrierCD = TUNING.barrierCooldown;           // 擋一次就碎
      }
    }
  },

  // 三地鼠：起跳留沙丘
  dig: function (player, opp, ball, input, s) {
    moveBonus(player, input, 2);
    s.mounds = s.mounds || [];
    if (edge(s, 'air', player.y < GROUND_Y) && s.mounds.length < 3) {
      s.mounds.push({ x: player.x, timer: 150, max: 150 });
    }
    for (let i = s.mounds.length - 1; i >= 0; i--) {
      const m = s.mounds[i];
      if (--m.timer <= 0) { s.mounds.splice(i, 1); continue; }
      if (Math.abs(ball.x - m.x) < 25 && ball.y >= GROUND_BALL_Y - 5 && ball.yVelocity > 0) {
        ball.yVelocity = -(10 + Math.random() * 10);
        ball.xVelocity = clampV(ball.xVelocity + (Math.random() - 0.5) * 15);
        ball.y = GROUND_BALL_Y - 6;
        s.mounds.splice(i, 1);
        pushBurst(ball.x, FLOOR_Y, '#D2B48C', 40);
        break;
      }
    }
  },

  // 大蔥鴨「大蔥揮擊＋居合斬＋迴力大蔥」
  //  - 大蔥揮擊：殺球打得到比別人遠的球（leekReach，在每幀最前面處理）
  //  - 居合斬：直接把對手的殺球殺回去，變成又快又準、一定落在對面的一刀
  //  - 迴力大蔥：一般殺球又平又快，過網後還會往回飄
  leekBoomerang: function (player, opp, ball, input, s) {
    if (powerHitEdge(player, s, 'hit') && ball.isPowerHit) {
      if (rt.incoming[pk(player)]) {
        aimAtCourt(ball, player.isPlayer2, TUNING.iaiVx);
        ball.punchEffectRadius = 35;
        s.boomerangTimer = 0;
        if (!s.slash) s.slash = { x: player.x, y: player.y, bx: ball.x, by: ball.y, t: 5 };
        s.slash.iai = 1; s.slash.t = 7;
        pushBurst(ball.x, ball.y, '#E8F5E9', 80);
        pushFlash('#FFFFFF', 0.3, 5);
        tier(player, 3, ball.x, ball.y);
      } else {
        ball.yVelocity = Math.round(ball.yVelocity * 0.3);
        ball.xVelocity = clampV(Math.round(ball.xVelocity * 1.5));
        s.boomerangTimer = 20;
      }
    }
    if (s.boomerangTimer > 0 && --s.boomerangTimer === 0) {
      const crossed = player.isPlayer2 ? ball.x < NET_X : ball.x > NET_X;
      if (crossed) ball.xVelocity = clampV(Math.round(-ball.xVelocity * 0.6));
    }
    if (s.slash && --s.slash.t <= 0) s.slash = null;
  },

  // 可達鴨：偶爾跌倒；累積頭痛後爆發
  headache: function (player, opp, ball, input, s, oppS, ctrl) {
    s.tripCounter = s.tripCounter || 0;
    if (player.state === 0 && input.xDirection !== 0) {
      if (++s.tripCounter >= 50) {
        s.tripCounter = 0;
        if (Math.random() < TUNING.psyTrip) { s.stunTimer = 5; s.stunX = player.x; }
      }
    } else {
      s.tripCounter = 0;
    }
    if (edge(s, 'charge', receivedSpike(player))) {        // 接起對手的殺球也會疊一層
      s.headacheCharge = (s.headacheCharge || 0) + 1;
    }
    if (edge(s, 'release', player.isCollisionWithBallHappened && player.state === 2) && (s.headacheCharge || 0) >= TUNING.headacheNeed) {
      // 頭痛大爆發：超快、往下砸的念力殺球
      aimAtCourt(ball, player.isPlayer2, TUNING.headacheMaxVx);
      if (TUNING.headacheStun) { oppS.stunTimer = TUNING.headacheStun; oppS.stunX = opp.x; }   // 念力讓對手頭暈一下
      makePowerHit(ball, 40);
      ctrl.slowMotionFramesLeft = 6;
      s.headacheCharge = 0;
      pushBurst(player.x, player.y - 30, '#FFD54F', 80);
      tier(player, 4, ball.x, ball.y);
    }
  },

  // 鯉魚王：弱，起跳有機率進化暴鯉龍
  splash: function (player, opp, ball, input, s, oppS) {
    if (!s.isGyarados) {
      moveBonus(player, input, -TUNING.magikarpSlow);
      const recv = edge(s, 'recv', receivedSpike(player)) && Math.random() < TUNING.magikarpReceiveEvolve;
      if ((edge(s, 'jump', player.state === 1) && Math.random() < TUNING.magikarpEvolveChance) || recv) {
        s.isGyarados = true;
        // 極少數會進化成紅色暴鯉龍：撐更久、打得更狠，還會威嚇對手
        s.isRed = Math.random() < TUNING.redGyaradosChance;
        s.gyaradosTimer = s.isRed ? TUNING.redGyaradosFrames : 100;
        pushBurst(player.x, player.y, s.isRed ? '#FF1744' : '#29B6F6', s.isRed ? 120 : 80);
        s.gyaFirst = true;   // 進化後的第一下殺球是必殺
        // 紅色暴鯉龍出現＝必殺；一般進化＝技能級（每分鐘會進化好幾次，每次都必殺會看膩）
        tier(player, s.isRed ? 4 : 3, player.x, player.y - 20, { k: s.isRed ? 'evoR' : 'evo' });
      }
      return;
    }
    moveBonus(player, input, 3);
    if (touchEdge(player, s, 'gyaHit')) {
      // 暴鯉龍的每一下都是保證打進對面的重擊（之前單純加速，常常出界）
      aimAtCourt(ball, player.isPlayer2, s.isRed ? TUNING.redGyaradosVx : TUNING.gyaradosVx);
      makePowerHit(ball, 35);
      // 紅色暴鯉龍進化後第一下＝必殺；一般暴鯉龍每一下都是技能級
      tier(player, s.gyaFirst && s.isRed ? 4 : 3, ball.x, ball.y, s.isRed ? { k: 'red' } : null);
      s.gyaFirst = false;
      if (s.isRed && TUNING.redGyaradosStun) { oppS.stunTimer = TUNING.redGyaradosStun; oppS.stunX = opp.x; }
    }
    if (--s.gyaradosTimer <= 0) { s.isGyarados = false; s.isRed = false; }
  },

  // 胖丁：高跳慢落，殺球讓對手左右顛倒
  sing: function (player, opp, ball, input, s, oppS) {
    if (player.state === 1 && !s.jumpBoosted && player.yVelocity <= -14 && player.yVelocity >= -18) {
      s.jumpBoosted = true;
      if (TUNING.jigglyJump) player.yVelocity = -TUNING.jigglyJump;
    }
    if (player.state === 0) s.jumpBoosted = false;
    const fastFall = (player.state === 1 || player.state === 2) && input.yDirection === 1 && player.y < GROUND_Y;
    if (fastFall) {
      // 空中按「下」：取消漂浮、快速落地
      player.yVelocity = Math.max(player.yVelocity, 2) + TUNING.jigglyFastFall;
      s.fastFalling = true;
    } else if (player.y < GROUND_Y && player.yVelocity > 0) {
      player.yVelocity = Math.max(player.yVelocity - TUNING.jigglyFloat, 0.3);
    }
    if (player.y >= GROUND_Y) s.fastFalling = false;
    if (powerHitEdge(player, s, 'hit')) oppS.reverseTimer = TUNING.singFrames;
  },

  // 夢幻：碰球機率替球加護盾
  psychicShield: function (player, opp, ball, input, s) {
    // 夢幻（神獸）：念力護盾不靠運氣——冷卻好就一定救起快落地的球（身邊有粉紅光環＝準備好）。
    // 救起來的球會被念力托在空中一小段時間；這時殺球就是「念力彈」：又快又準，一定落在對面場內。
    moveBonus(player, input, 1);
    if (s.mewCD > 0) s.mewCD--;
    // 瞬間移動：連按兩下方向鍵。球會落在自己場上時直接出現在落點；否則往那個方向瞬移一段距離
    if (s.tpCD > 0) s.tpCD--;
    s.fc = (s.fc || 0) + 1;
    const dirNow = input.xDirection;
    let tap = 0;
    if (dirNow !== 0 && dirNow !== (s.prevDir || 0)) {
      if (s.tapDir === dirNow && s.fc - s.tapAt <= 6 && s.tapHeld <= 3) tap = dirNow;
      s.tapDir = dirNow; s.tapAt = s.fc; s.tapHeld = 0;
    } else if (dirNow !== 0 && dirNow === s.tapDir) s.tapHeld++;
    s.prevDir = dirNow;
    const req = (player.isComputer ? 0 : tap || skillKey(input)) || s.zipRequest || 0;
    s.zipRequest = 0;
    if (req && !(s.tpCD > 0) && player.state < 3) {
      const x0 = player.x, land = ball.expectedLandingPointX;
      const landMine = player.isPlayer2 ? land > NET_X : land < NET_X;
      const toBall = landMine && (land - x0) * req > 0;       // 落點在自己場上、而且在按的那個方向
      // 最遠只能移動 mewTeleport 這麼遠：落點在範圍內就剛好到落點，太遠就只能靠近
      player.x = toBall ? x0 + req * Math.min(Math.abs(land - x0), TUNING.mewTeleport) : x0 + req * TUNING.mewTeleport;
      clampPlayer(player);
      s.tpCD = TUNING.mewTeleportCD;
      pushBurst(x0, player.y, '#FF80AB', 40);
      pushBurst(player.x, player.y, '#FFB6C1', 55);
      if (svc.fxEvent) {
        svc.fxEvent('zipStart', { player: player, dir: req });
        svc.fxEvent('zipEnd', { player: player, x0: x0, x1: player.x, y: player.y });
      }
    }
    const mySide = player.isPlayer2 ? ball.x >= NET_X : ball.x < NET_X;
    if (!(s.mewCD > 0) && mySide && ball.yVelocity > 0 && ball.y + ball.yVelocity + 1 >= 250) {   // 下一幀就要落地：在落地前托住
      ball.yVelocity = -TUNING.mewLift;
      ball.xVelocity = clampV(ball.xVelocity * 0.3);
      ball.y = Math.min(ball.y, 240);
      ball.isPowerHit = false;
      s.mewCD = TUNING.mewShieldCD;
      s.auraTimer = TUNING.mewChargeFrames;
      pushBurst(ball.x, ball.y, '#FFB6C1', 55);
    }
    if (s.auraTimer > 0) {
      s.auraTimer--;
      if (powerHitEdge(player, s, 'hit')) {
        aimAtCourt(ball, player.isPlayer2, TUNING.mewBlastVx);
        makePowerHit(ball, 35);
        s.auraTimer = 0;
        pushBurst(ball.x, ball.y, '#FF4FB8', 70);
        tier(player, 3, ball.x, ball.y);
      }
    } else powerHitEdge(player, s, 'hit');
  },

  // 快龍：殺球後暴走
  // 快龍「逆鱗」：殺球後暴走，那一球就是第一層。暴走中每次殺球再疊一層（最多 3 層），一層比一層砸得更重更快；
  // 暴走結束後會混亂（左右顛倒）一下，跟原作的逆鱗一樣有代價
  outrage: function (player, opp, ball, input, s) {
    moveBonus(player, input, 1);
    if (powerHitEdge(player, s, 'hit')) {
      if (!(s.outrageTimer > 0)) {
        pushBurst(player.x, player.y, '#FF6D00', 90);
        s.rageStacks = 0;
      }
      if (ball.isPowerHit) {
        // 開啟暴走的那一球就算第一層：殺 3 球就到滿層（原本要 4 球）
        s.rageStacks = Math.min(3, (s.rageStacks || 0) + 1);
        ball.yVelocity = clampV(ball.yVelocity + TUNING.outrageDown * s.rageStacks);
        ball.xVelocity = clampV(Math.round(ball.xVelocity * (1 + 0.08 * s.rageStacks)));
        ball.punchEffectRadius = Math.min(ball.punchEffectRadius + 6 * s.rageStacks, 40);
        if (s.rageStacks >= 2) {
          pushBurst(ball.x, ball.y, '#FF6D00', 40 + 15 * s.rageStacks);
          tier(player, s.rageStacks >= 3 ? 4 : 3, ball.x, ball.y, { k: 'rage' });   // 三層逆鱗＝必殺
        }
      }
      s.outrageTimer = TUNING.outrageFrames;
    }
    if (s.outrageTimer > 0) {
      s.outrageTimer--;
      moveBonus(player, input, TUNING.outrageSpeed);
      if (s.outrageTimer === 0) {
        s.rageStacks = 0;
        s.reverseTimer = TUNING.outrageConfuse;
      }
    }
  },

  // 皮卡丘「靜電」：殺出去的球帶電，對手接到時有機率被麻痺
  static: function (player, opp, ball, input, s, oppS) {
    if (powerHitEdge(player, s, 'hit')) s.charged = true;
    if (s.charged) {
      if (edge(s, 'oppTouch', opp.isCollisionWithBallHappened)) {
        s.charged = false;
        if (Math.random() < TUNING.staticChance) {
          oppS.stunTimer = TUNING.staticStun;
          oppS.stunX = opp.x;
          pushBurst(opp.x, opp.y, '#FFE14D', 60);
        }
      } else if (ball.y >= GROUND_BALL_Y - 2 || player.isCollisionWithBallHappened && player.state !== 2) {
        s.charged = false;
      }
    }
  },
};
