/**
 * 遊戲本體（src/engine）對外的形狀。
 *
 * 外掛功能（技能、特效、連線、闖關…）只透過這裡的介面碰遊戲本體，
 * 引擎的類別用 `implements` 保證跟這裡一致。欄位名稱沿用原作（gorisanson/pikachu-volleyball）。
 */
import type { Container } from '@pixi/display';
import type { Sprite } from '@pixi/sprite';
import type { AnimatedSprite } from '@pixi/sprite-animated';
import type { Texture } from '@pixi/core';

/** 角色 id，跟圖檔名稱一致（`resources/assets/images/<id>_sheet.json`）。 */
export type CharacterId =
  | 'pikachu' | 'bird' | 'vaporeon' | 'flareon' | 'jolteon' | 'gengar' | 'meowth'
  | 'snorlax' | 'mewtwo' | 'electrode' | 'wobbuffet' | 'ditto' | 'mrmime' | 'dugtrio'
  | 'farfetchd' | 'psyduck' | 'magikarp' | 'jigglypuff' | 'dragonite' | 'mew'
  | 'charmander' | 'bulbasaur' | 'squirtle' | 'umbreon';

export const CHARACTER_IDS: readonly CharacterId[] = [
  'pikachu', 'bird', 'vaporeon', 'flareon', 'jolteon', 'gengar', 'meowth', 'snorlax',
  'mewtwo', 'electrode', 'wobbuffet', 'ditto', 'mrmime', 'dugtrio', 'farfetchd', 'psyduck',
  'magikarp', 'jigglypuff', 'dragonite', 'mew', 'charmander', 'bulbasaur', 'squirtle', 'umbreon',
];

/**
 * 角色動作狀態（原作）：0 一般、1 跳、2 殺球、3 撲救、4 倒地、5 獲勝、6 落敗。
 */
export type PlayerState = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PlayerSound { pipikachu: boolean; pika: boolean; chu: boolean; flap: boolean }

export interface Player {
  readonly isPlayer2: boolean;
  isComputer: boolean;
  x: number;
  y: number;
  yVelocity: number;
  isCollisionWithBallHappened: boolean;
  state: PlayerState | number;
  frameNumber: number;
  normalStatusArmSwingDirection: number;
  delayBeforeNextFrame: number;
  divingDirection: number;
  lyingDownDurationLeft: number;
  isWinner: boolean;
  gameEnded: boolean;
  computerWhereToStandBy: number;
  computerBoldness: number;
  sound: PlayerSound;
  // ---- 這個專案加的 ----
  character: CharacterId;
  /** 閃電鳥：這一跳還能拍翅幾次。 */
  flapsLeft: number;
  prevYDirection: number;
  /** 水伊布衝刺。 */
  isDashing: boolean;
  dashDirection: number;
  dashFramesLeft: number;
  dashCooldown: number;
  dashTrailX: number[];
  dashTrailY: number[];
  /** 耿鬼空間偷渡：可以越過網子移動。 */
  pvNoClamp?: boolean;
  /** 擊球判定左右多寬幾 px（妙蛙種子的短藤鞭）；沒設就是 0。 */
  pvReachX?: number;
  /** 走路／撲救速度倍率（御三家）；沒設就是 1。 */
  pvMoveMult?: number;
  pvDiveMult?: number;
  /** 這一幀「沒碰到身體但算擊球」（大蔥鴨的大蔥）。給特效和連線看。 */
  pvHit?: boolean;
  initializeForNewRound(): void;
}

export interface BallSound { powerHit: boolean; ballTouchesGround: boolean }

export interface Ball {
  x: number;
  y: number;
  xVelocity: number;
  yVelocity: number;
  expectedLandingPointX: number;
  rotation: number;
  fineRotation: number;
  punchEffectX: number;
  punchEffectY: number;
  punchEffectRadius: number;
  previousX: number;
  previousPreviousX: number;
  previousY: number;
  previousPreviousY: number;
  isPowerHit: boolean;
  sound: BallSound;
  initializeForNewRound(isPlayer2Serve: boolean): void;
}

export interface Physics {
  player1: Player;
  player2: Player;
  ball: Ball;
  /** 跑一幀物理；回傳「球這一幀落地了」。 */
  runEngineForNextFrame(inputs: UserInput[]): boolean;
}

export interface KeyState {
  /** 這個鍵對應的 KeyboardEvent.code；null 表示停用（自訂按鍵靠改它）。 */
  value: string | null;
  isDown: boolean;
  isUp: boolean;
}

export interface UserInput {
  /** -1 左、0、1 右 */
  xDirection: number;
  /** -1 上、0、1 下 */
  yDirection: number;
  /** 1 = 這一幀按下殺球 */
  powerHit: number;
  /** 衝刺／技能請求：±1 連按兩下方向鍵，±2 觸控技能鍵。 */
  dashRequest: number;
}

export interface Keyboard extends UserInput {
  leftKey: KeyState;
  rightKey: KeyState;
  upKey: KeyState;
  downKey: KeyState;
  powerHitKey: KeyState;
  downRightKey: KeyState;
  getInput(): void;
  subscribe(): void;
  unsubscribe(): void;
}

export interface SoundChannel {
  volume: number;
  loop: boolean;
  /** -1 左、0 中、1 右 */
  play(leftOrCenterOrRight?: number): void;
  stop(): void;
  /** 底層的 @pixi/sound 物件（改速度、音量用；離線算音要讀 url）。 */
  readonly center: { speed: number; volume: number; url: string };
  readonly left: { speed: number };
  readonly right: { speed: number };
}

export interface GameAudio {
  sounds: Record<string, SoundChannel> & {
    bgm: SoundChannel; pipikachu: SoundChannel; pika: SoundChannel; chu: SoundChannel; pi: SoundChannel;
    pikachu: SoundChannel; powerHit: SoundChannel; ballTouchesGround: SoundChannel;
    birdShout: SoundChannel; birdFlap: SoundChannel;
  };
  turnBGMVolume(on: boolean): void;
  turnSFXVolume(on: boolean): void;
  muteAll(): void;
  unmuteAll(): void;
}

export interface GameView {
  container: Container;
  visible: boolean;
  bgContainer: Container;
  cloudContainer: Container;
  waveContainer: Container;
  player1: AnimatedSprite;
  player2: AnimatedSprite;
  ball: AnimatedSprite;
  ballHyper: Sprite;
  ballTrail: Sprite;
  punch: Sprite;
  shadows: { forPlayer1: Sprite; forPlayer2: Sprite; forBall: Sprite };
  messages: { gameStart: Sprite; ready: Sprite; gameEnd: Sprite };
  scoreBoards: Container[];
  playerTextureArrays: Record<CharacterId, Texture[]>;
  drawPlayersAndBall(physics: Physics): void;
  drawCloudsAndWave(): void;
  drawScoresToScoreBoards(scores: number[]): void;
  drawGameStartMessage(frameCounter: number, frameTotal: number): void;
  drawReadyMessage(visible: boolean): void;
  toggleReadyMessage(): void;
  drawGameEndMessage(frameCounter: number): void;
}

export interface SimpleView { container: Container; visible: boolean }

export interface FadeInOut {
  /** 全黑的遮罩（連線快照會讀它的 alpha）。 */
  black: Sprite;
  visible: boolean;
  setBlackAlphaTo(alpha: number): void;
  changeBlackAlphaBy(delta: number): void;
}

export interface GameViews {
  intro: SimpleView & { drawMark(frameCounter: number): void };
  menu: SimpleView & { selectWithWho(i: number): void };
  game: GameView;
  fadeInOut: FadeInOut;
}

/** 遊戲本體的狀態機函式（`ctrl.state` 指向其中一個，或外掛自己的狀態）。 */
export type GameState = (this: Controller) => void;

export interface FrameTotal {
  intro: number; afterMenuSelection: number; beforeStartOfNewGame: number; startOfNewGame: number;
  afterEndOfRound: number; beforeStartOfNextRound: number; gameEnd: number;
}

/** 原作的 PikachuVolleyball 控制器。 */
export interface Controller {
  view: GameViews;
  audio: GameAudio;
  physics: Physics;
  keyboardArray: [Keyboard, Keyboard];
  normalFPS: number;
  slowMotionFPS: number;
  SLOW_MOTION_FRAMES_NUM: number;
  slowMotionFramesLeft: number;
  slowMotionNumOfSkippedFrames: number;
  selectedWithWho: number;
  scores: [number, number];
  winningScore: number;
  gameEnded: boolean;
  roundEnded: boolean;
  isPlayer2Serve: boolean;
  frameCounter: number;
  frameTotal: FrameTotal;
  noInputFrameCounter: number;
  noInputFrameTotal: { menu: number };
  paused: boolean;
  isStereoSound: boolean;
  isPracticeMode: boolean;
  state: GameState;
  // 狀態機
  intro: GameState;
  menu: GameState;
  afterMenuSelection: GameState;
  beforeStartOfNewGame: GameState;
  startOfNewGame: GameState;
  round: GameState;
  afterEndOfRound: GameState;
  beforeStartOfNextRound: GameState;
  gameLoop(): void;
  playSoundEffect(): void;
  restart(): void;
}
