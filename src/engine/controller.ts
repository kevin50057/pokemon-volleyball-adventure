/**
 * MVC 的 Controller（原作 pikavolley.js 的 PikachuVolleyball）。
 *
 * 這個專案加的（舊版的 window 掛勾改成 core/hooks.ts）：
 *  - gameLoop：讀按鍵時每組鍵盤讀完都跑 `hooks.afterInput`（觸控輔助），兩組都讀完後跑
 *    `hooks.tick`（舊版 window._pvTick），回傳 false 就不跑這一幀的狀態機。
 *  - 得分時一球算幾分由 `hooks.score` 決定（舊版 window._pvScore）。
 *  - gameLoop、playSoundEffect 原本的實作接在 `hooks.gameLoop`、`hooks.playSoundEffect` 的最裡層，
 *    `ctrl.gameLoop()`／`ctrl.playSoundEffect()` 一律經過掛勾鏈（取代舊版直接改寫 ctrl 上的方法）。
 *  - playSoundEffect：有角色專屬音效（`CHAR_<角色>_<call|hit|jump>`）就播專屬的；
 *    閃電鳥沒有專屬音效時用 birdShout／birdFlap；拍翅（sound.flap）播 birdFlap。
 */
import { GROUND_HALF_WIDTH, PikaPhysics } from './physics';
import { MenuView, GameView, FadeInOut, IntroView } from './view';
import { PikaKeyboard } from './keyboard';
import { PikaAudio } from './audio';
import type { Resources } from './audio';
import { hooks } from '../core/hooks';
import type { Container } from '@pixi/display';
import type { Controller, FrameTotal, GameState, SoundChannel } from '../core/types';

/**
 * 原本的 gameLoop（掛勾鏈最裡層）。
 * 每 1/FPS 秒呼叫一次。
 */
function baseGameLoop(c: Controller): void {
  if (c.paused === true) {
    return;
  }
  if (c.slowMotionFramesLeft > 0) {
    c.slowMotionNumOfSkippedFrames++;
    if (
      c.slowMotionNumOfSkippedFrames %
        Math.round(c.normalFPS / c.slowMotionFPS) !==
      0
    ) {
      return;
    }
    c.slowMotionFramesLeft--;
    c.slowMotionNumOfSkippedFrames = 0;
  }
  // 讀入鍵盤輸入並在這一幀凍結（每組讀完就讓觸控輔助修正）
  const [kb0, kb1] = c.keyboardArray;
  kb0.getInput();
  hooks.afterInput.run(c, kb0, 0);
  kb1.getInput();
  hooks.afterInput.run(c, kb1, 1);
  // 外掛（擊球停格、連線客機…）可以決定這一幀不跑遊戲本體
  if (hooks.tick.run(c) === false) return;
  c.state();
}

/**
 * 原本的 playSoundEffect（掛勾鏈最裡層）：在 {@link PikachuVolleyball.round} 裡播音效
 */
function basePlaySoundEffect(c: Controller): void {
  const audio = c.audio;
  for (let i = 0; i < 2; i++) {
    const player = i === 0 ? c.physics.player1 : c.physics.player2;
    const sound = player.sound;
    let leftOrCenterOrRight = 0;
    if (c.isStereoSound) {
      leftOrCenterOrRight = i === 0 ? -1 : 1;
    }
    const isBird = player.character === 'bird';
    const sounds = audio.sounds;
    /** 角色專屬音效（沒有就是 undefined） */
    const charSound = (k: string): SoundChannel | undefined =>
      sounds[`CHAR_${player.character}_${k}`];
    if (sound.pipikachu === true) {
      (charSound('call') || (isBird ? sounds.birdShout : sounds.pipikachu)).play(leftOrCenterOrRight);
      sound.pipikachu = false;
    }
    if (sound.pika === true) {
      (charSound('hit') || (isBird ? sounds.birdShout : sounds.pika)).play(leftOrCenterOrRight);
      sound.pika = false;
    }
    if (sound.chu === true) {
      (charSound('jump') || (isBird ? sounds.birdFlap : sounds.chu)).play(leftOrCenterOrRight);
      sound.chu = false;
    }
    if (sound.flap === true) {
      audio.sounds.birdFlap.play(leftOrCenterOrRight);
      sound.flap = false;
    }
  }
  const ball = c.physics.ball;
  const sound = ball.sound;
  let leftOrCenterOrRight = 0;
  if (c.isStereoSound) {
    if (ball.punchEffectX < GROUND_HALF_WIDTH) {
      leftOrCenterOrRight = -1;
    } else if (ball.punchEffectX > GROUND_HALF_WIDTH) {
      leftOrCenterOrRight = 1;
    }
  }
  if (sound.powerHit === true) {
    audio.sounds.powerHit.play(leftOrCenterOrRight);
    sound.powerHit = false;
  }
  if (sound.ballTouchesGround === true) {
    audio.sounds.ballTouchesGround.play(leftOrCenterOrRight);
    sound.ballTouchesGround = false;
  }
}

/** 遊戲本體的畫面們 */
export interface PikaViews {
  intro: IntroView;
  menu: MenuView;
  game: GameView;
  fadeInOut: FadeInOut;
}

/**
 * 皮卡丘排球遊戲
 */
export class PikachuVolleyball implements Controller {
  declare view: PikaViews;
  declare audio: PikaAudio;
  declare physics: PikaPhysics;
  declare keyboardArray: [PikaKeyboard, PikaKeyboard];
  /** 遊戲 FPS */
  declare normalFPS: number;
  /** 慢動作的 FPS */
  declare slowMotionFPS: number;
  /** 慢動作的幀數（常數） */
  declare SLOW_MOTION_FRAMES_NUM: number;
  /** 慢動作還剩幾幀 */
  declare slowMotionFramesLeft: number;
  /** 慢動作時已經略過幾個一般 FPS 的幀 */
  declare slowMotionNumOfSkippedFrames: number;
  /** 0：跟電腦，1：跟朋友 */
  declare selectedWithWho: number;
  /** [0] 是 1P 的分數，[1] 是 2P 的分數 */
  declare scores: [number, number];
  /** 獲勝分數：任一方到達就結束比賽 */
  declare winningScore: number;
  /** 比賽結束了嗎 */
  declare gameEnded: boolean;
  /** 這回合結束了嗎 */
  declare roundEnded: boolean;
  /** 下一回合是不是 2P 發球 */
  declare isPlayer2Serve: boolean;
  /** 幀數計數 */
  declare frameCounter: number;
  /** 各狀態的總幀數 */
  declare frameTotal: FrameTotal;
  /** 沒有鍵盤輸入的幀數計數 */
  declare noInputFrameCounter: number;
  /** 沒有輸入時最多跑幾幀 */
  declare noInputFrameTotal: { menu: number };
  /** true：暫停中 */
  declare paused: boolean;
  /** true：立體聲，false：單聲道 */
  declare isStereoSound: boolean;
  /** true：練習模式 */
  declare _isPracticeMode: boolean;
  /** 現在正在跑的狀態 */
  declare state: GameState;

  /**
   * 建立包含物理、畫面、音效的皮卡丘排球遊戲
   * @param stage 由 Renderer／CanvasRenderer 畫出來的容器
   * @param resources 載入遊戲資源用的 Loader 的 resources
   */
  constructor(stage: Container, resources: Resources) {
    this.view = {
      intro: new IntroView(resources),
      menu: new MenuView(resources),
      game: new GameView(resources),
      fadeInOut: new FadeInOut(resources),
    };
    stage.addChild(this.view.intro.container);
    stage.addChild(this.view.menu.container);
    stage.addChild(this.view.game.container);
    stage.addChild(this.view.fadeInOut.black);
    this.view.intro.visible = false;
    this.view.menu.visible = false;
    this.view.game.visible = false;
    this.view.fadeInOut.visible = false;

    this.audio = new PikaAudio(resources);
    this.physics = new PikaPhysics(true, true);
    this.keyboardArray = [
      new PikaKeyboard('KeyD', 'KeyG', 'KeyR', 'KeyV', 'KeyZ', 'KeyF'), // 1P
      new PikaKeyboard( // 2P
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
      ),
    ];

    this.normalFPS = 25;
    this.slowMotionFPS = 5;

    this.SLOW_MOTION_FRAMES_NUM = 6;
    this.slowMotionFramesLeft = 0;
    this.slowMotionNumOfSkippedFrames = 0;

    this.selectedWithWho = 0;

    this.scores = [0, 0];
    this.winningScore = 15;

    this.gameEnded = false;
    this.roundEnded = false;
    this.isPlayer2Serve = false;

    this.frameCounter = 0;
    this.frameTotal = {
      intro: 165,
      afterMenuSelection: 15,
      beforeStartOfNewGame: 15,
      startOfNewGame: 71,
      afterEndOfRound: 5,
      beforeStartOfNextRound: 30,
      gameEnd: 211,
    };

    this.noInputFrameCounter = 0;
    this.noInputFrameTotal = {
      menu: 225,
    };

    this.paused = false;

    this.isStereoSound = true;

    this._isPracticeMode = false;

    this.state = this.intro;

    // 原本的實作接在掛勾鏈的最裡層
    hooks.gameLoop.setBase(baseGameLoop);
    hooks.playSoundEffect.setBase(basePlaySoundEffect);
  }

  /**
   * 遊戲迴圈（經過 hooks.gameLoop，外掛包的層一定會跑到）。
   * 每 1/FPS 秒呼叫一次。
   */
  gameLoop(): void {
    hooks.gameLoop.run(this);
  }

  /**
   * 開場：拿公事包的人
   */
  intro(): void {
    if (this.frameCounter === 0) {
      this.view.intro.visible = true;
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.audio.sounds.bgm.stop();
    }
    this.view.intro.drawMark(this.frameCounter);
    this.frameCounter++;

    if (
      this.keyboardArray[0].powerHit === 1 ||
      this.keyboardArray[1].powerHit === 1
    ) {
      this.frameCounter = 0;
      this.view.intro.visible = false;
      this.state = this.menu;
    }

    if (this.frameCounter >= this.frameTotal.intro) {
      this.frameCounter = 0;
      this.view.intro.visible = false;
      this.state = this.menu;
    }
  }

  /**
   * 選單：要跟電腦玩還是跟朋友玩
   */
  menu(): void {
    if (this.frameCounter === 0) {
      this.view.menu.visible = true;
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.selectedWithWho = 0;
      this.view.menu.selectWithWho(this.selectedWithWho);
    }
    this.view.menu.drawFightMessage(this.frameCounter);
    this.view.menu.drawSachisoft(this.frameCounter);
    this.view.menu.drawSittingPikachuTiles(this.frameCounter);
    this.view.menu.drawPikachuVolleyballMessage(this.frameCounter);
    this.view.menu.drawPokemonMessage(this.frameCounter);
    this.view.menu.drawWithWhoMessages(this.frameCounter);
    this.frameCounter++;

    if (
      this.frameCounter < 71 &&
      (this.keyboardArray[0].powerHit === 1 ||
        this.keyboardArray[1].powerHit === 1)
    ) {
      this.frameCounter = 71;
      return;
    }

    if (this.frameCounter <= 71) {
      return;
    }

    if (
      (this.keyboardArray[0].yDirection === -1 ||
        this.keyboardArray[1].yDirection === -1) &&
      this.selectedWithWho === 1
    ) {
      this.noInputFrameCounter = 0;
      this.selectedWithWho = 0;
      this.view.menu.selectWithWho(this.selectedWithWho);
      this.audio.sounds.pi.play();
    } else if (
      (this.keyboardArray[0].yDirection === 1 ||
        this.keyboardArray[1].yDirection === 1) &&
      this.selectedWithWho === 0
    ) {
      this.noInputFrameCounter = 0;
      this.selectedWithWho = 1;
      this.view.menu.selectWithWho(this.selectedWithWho);
      this.audio.sounds.pi.play();
    } else {
      this.noInputFrameCounter++;
    }

    if (
      this.keyboardArray[0].powerHit === 1 ||
      this.keyboardArray[1].powerHit === 1
    ) {
      if (this.selectedWithWho === 1) {
        this.physics.player1.isComputer = false;
        this.physics.player2.isComputer = false;
      } else {
        if (this.keyboardArray[0].powerHit === 1) {
          this.physics.player1.isComputer = false;
          this.physics.player2.isComputer = true;
        } else if (this.keyboardArray[1].powerHit === 1) {
          this.physics.player1.isComputer = true;
          this.physics.player2.isComputer = false;
        }
      }
      this.audio.sounds.pikachu.play();
      this.frameCounter = 0;
      this.noInputFrameCounter = 0;
      this.state = this.afterMenuSelection;
      return;
    }

    if (this.noInputFrameCounter >= this.noInputFrameTotal.menu) {
      this.physics.player1.isComputer = true;
      this.physics.player2.isComputer = true;
      this.frameCounter = 0;
      this.noInputFrameCounter = 0;
      this.state = this.afterMenuSelection;
    }
  }

  /**
   * 選完之後淡出
   */
  afterMenuSelection(): void {
    this.view.fadeInOut.changeBlackAlphaBy(1 / 16);
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.afterMenuSelection) {
      this.frameCounter = 0;
      this.state = this.beforeStartOfNewGame;
    }
  }

  /**
   * 新比賽開始前的停頓（原作就有的停頓）
   */
  beforeStartOfNewGame(): void {
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.beforeStartOfNewGame) {
      this.frameCounter = 0;
      this.view.menu.visible = false;
      this.state = this.startOfNewGame;
    }
  }

  /**
   * 新比賽開始：初始化球和角色，顯示「比賽開始」字樣
   */
  startOfNewGame(): void {
    if (this.frameCounter === 0) {
      this.view.game.visible = true;
      this.gameEnded = false;
      this.roundEnded = false;
      this.isPlayer2Serve = false;
      this.physics.player1.gameEnded = false;
      this.physics.player1.isWinner = false;
      this.physics.player2.gameEnded = false;
      this.physics.player2.isWinner = false;

      this.scores[0] = 0;
      this.scores[1] = 0;
      this.view.game.drawScoresToScoreBoards(this.scores);

      this.physics.player1.initializeForNewRound();
      this.physics.player2.initializeForNewRound();
      this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
      this.view.game.drawPlayersAndBall(this.physics);

      this.view.fadeInOut.setBlackAlphaTo(1); // 全黑
      this.audio.sounds.bgm.play();
    }

    this.view.game.drawGameStartMessage(
      this.frameCounter,
      this.frameTotal.startOfNewGame,
    );
    this.view.game.drawCloudsAndWave();
    this.view.fadeInOut.changeBlackAlphaBy(-(1 / 17)); // 淡入
    this.frameCounter++;

    if (this.frameCounter >= this.frameTotal.startOfNewGame) {
      this.frameCounter = 0;
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.state = this.round;
    }
  }

  /**
   * 回合：角色們在這個狀態打排球
   */
  round(): void {
    const pressedPowerHit =
      this.keyboardArray[0].powerHit === 1 ||
      this.keyboardArray[1].powerHit === 1;

    if (
      this.physics.player1.isComputer === true &&
      this.physics.player2.isComputer === true &&
      pressedPowerHit
    ) {
      this.frameCounter = 0;
      this.view.game.visible = false;
      this.state = this.intro;
      return;
    }

    const isBallTouchingGround = this.physics.runEngineForNextFrame(
      this.keyboardArray,
    );

    this.playSoundEffect();
    this.view.game.drawPlayersAndBall(this.physics);
    this.view.game.drawCloudsAndWave();

    if (this.gameEnded === true) {
      this.view.game.drawGameEndMessage(this.frameCounter);
      this.frameCounter++;
      if (
        this.frameCounter >= this.frameTotal.gameEnd ||
        (this.frameCounter >= 70 && pressedPowerHit)
      ) {
        this.frameCounter = 0;
        this.view.game.visible = false;
        this.state = this.intro;
      }
      return;
    }

    if (
      isBallTouchingGround &&
      this._isPracticeMode === false &&
      this.roundEnded === false &&
      this.gameEnded === false
    ) {
      if (this.physics.ball.punchEffectX < GROUND_HALF_WIDTH) {
        this.isPlayer2Serve = true;
        this.scores[1] += hooks.score.run(this, 1);
        if (this.scores[1] >= this.winningScore) {
          this.gameEnded = true;
          this.physics.player1.isWinner = false;
          this.physics.player2.isWinner = true;
          this.physics.player1.gameEnded = true;
          this.physics.player2.gameEnded = true;
        }
      } else {
        this.isPlayer2Serve = false;
        this.scores[0] += hooks.score.run(this, 0);
        if (this.scores[0] >= this.winningScore) {
          this.gameEnded = true;
          this.physics.player1.isWinner = true;
          this.physics.player2.isWinner = false;
          this.physics.player1.gameEnded = true;
          this.physics.player2.gameEnded = true;
        }
      }
      this.view.game.drawScoresToScoreBoards(this.scores);
      if (this.roundEnded === false && this.gameEnded === false) {
        this.slowMotionFramesLeft = this.SLOW_MOTION_FRAMES_NUM;
      }
      this.roundEnded = true;
    }

    if (this.roundEnded === true && this.gameEnded === false) {
      // 這回合的最後一幀：開始淡出
      if (this.slowMotionFramesLeft === 0) {
        this.view.fadeInOut.changeBlackAlphaBy(1 / 16); // 淡出
        this.state = this.afterEndOfRound;
      }
    }
  }

  /**
   * 回合結束後淡出
   */
  afterEndOfRound(): void {
    this.view.fadeInOut.changeBlackAlphaBy(1 / 16);
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.afterEndOfRound) {
      this.frameCounter = 0;
      this.state = this.beforeStartOfNextRound;
    }
  }

  /**
   * 下一回合開始前：初始化球和角色，顯示「Ready」字樣
   */
  beforeStartOfNextRound(): void {
    if (this.frameCounter === 0) {
      this.view.fadeInOut.setBlackAlphaTo(1);
      this.view.game.drawReadyMessage(false);

      this.physics.player1.initializeForNewRound();
      this.physics.player2.initializeForNewRound();
      this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
      this.view.game.drawPlayersAndBall(this.physics);
    }

    this.view.game.drawCloudsAndWave();
    this.view.fadeInOut.changeBlackAlphaBy(-(1 / 16));

    this.frameCounter++;
    if (this.frameCounter % 5 === 0) {
      this.view.game.toggleReadyMessage();
    }

    if (this.frameCounter >= this.frameTotal.beforeStartOfNextRound) {
      this.frameCounter = 0;
      this.view.game.drawReadyMessage(false);
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.roundEnded = false;
      this.state = this.round;
    }
  }

  /**
   * 在 {@link round} 裡播音效（經過 hooks.playSoundEffect）
   */
  playSoundEffect(): void {
    hooks.playSoundEffect.run(this);
  }

  /**
   * 按下「重來」時呼叫
   */
  restart(): void {
    this.frameCounter = 0;
    this.noInputFrameCounter = 0;
    this.slowMotionFramesLeft = 0;
    this.slowMotionNumOfSkippedFrames = 0;
    this.view.menu.visible = false;
    this.view.game.visible = false;
    this.state = this.intro;
  }

  get isPracticeMode(): boolean {
    return this._isPracticeMode;
  }

  /** true：開練習模式，false：關練習模式 */
  set isPracticeMode(bool: boolean) {
    this._isPracticeMode = bool;
    this.view.game.scoreBoards[0].visible = !bool;
    this.view.game.scoreBoards[1].visible = !bool;
  }
}
