/**
 * MVC 的 Model：物理引擎（原作 physics.js）。
 *
 * 計算球和兩位角色的移動。這是對原作機器碼逆向工程的結果，
 * 每個函式上方的註解標了原本機器碼的位址，例如 FUN_00403dd0 = 位址 00403dd0 的函式。
 *
 * ** 一些有用的數值 **
 *  場地寬：432 = 0x1B0、場地高：304 = 0x130
 *  X 座標：[0, 432]，往右增加；Y 座標：[0, 304]，往下增加
 *  球半徑：20 = 0x14、球直徑：40 = 0x28
 *  角色半寬＝半高：32 = 0x20、角色寬＝高：64 = 0x40
 *
 * 這個專案加的修改（行為跟線上版完全一致，不要改動順序）：
 *  - 每個角色每幀都會呼叫 `hooks.ai`（舊版 window._pvAI），不限電腦控制的角色。
 *  - 水伊布衝刺（dashRequest、isDashing、拖影座標 dashTrailX/Y、冷卻 dashCooldown）。
 *  - 耿鬼空間偷渡 `pvNoClamp`：可以越過網子移動。
 *  - 閃電鳥拍翅：一跳最多拍 6 次（flapsLeft），飛行高度上限 y = 36，按住上時下降速度上限 3。
 */
import { rand } from './rand';
import { hooks } from '../core/hooks';
import type {
  Ball as IBall, BallSound, CharacterId, Physics, Player as IPlayer, PlayerSound, UserInput,
} from '../core/types';

/** 場地寬 */
const GROUND_WIDTH = 432;
/** 場地半寬，也是網柱的 x 座標 */
export const GROUND_HALF_WIDTH = (GROUND_WIDTH / 2) | 0; // 整數除法
/** 角色（皮卡丘）邊長：寬 = 高 = 64 */
const PLAYER_LENGTH = 64;
/** 角色半邊長 */
const PLAYER_HALF_LENGTH = (PLAYER_LENGTH / 2) | 0; // 整數除法
/** 角色站在地上時的 y 座標 */
const PLAYER_TOUCHING_GROUND_Y_COORD = 244;
/** 球半徑 */
const BALL_RADIUS = 20;
/** 球碰到地面時的 y 座標 */
const BALL_TOUCHING_GROUND_Y_COORD = 252;
/** 網柱半寬（只用在物理引擎，不是圖片的像素寬） */
const NET_PILLAR_HALF_WIDTH = 25;
/** 網柱頂端上緣的 y 座標 */
const NET_PILLAR_TOP_TOP_Y_COORD = 176;
/** 網柱頂端下緣的 y 座標（只用在物理引擎） */
const NET_PILLAR_TOP_BOTTOM_Y_COORD = 192;

/**
 * 限制無窮迴圈的次數。原作機器碼沒有這個限制。
 *
 * 原作的球 x 範圍（[20, 432]）下，{@link calculateExpectedLandingPointXFor} 和
 * {@link expectedLandingPointXWhenPowerHit} 的無窮迴圈似乎都很快就會結束；
 * 但如果改了範圍（例如為了左右對稱改成 [20, 432 - 20]），後者的迴圈會停不下來，
 * 所以保險起見加上這個上限。
 */
const INFINITE_LOOP_LIMIT = 1000;

// ---- 這個專案加的常數 ----
/** 水伊布衝刺：每幀的水平速度倍數 */
const DASH_SPEED = 18;
/** 水伊布衝刺持續幾幀 */
const DASH_FRAMES = 6;
/** 水伊布衝刺結束後的冷卻幀數 */
const DASH_COOLDOWN = 30;
/** 水伊布拖影最多保留幾格 */
const DASH_TRAIL_LENGTH = 2;
/** 閃電鳥一跳最多拍幾次翅膀 */
const BIRD_FLAPS_PER_JUMP = 6;
/** 閃電鳥拍翅時的向上速度 */
const BIRD_FLAP_Y_VELOCITY = -11;
/** 閃電鳥飛行高度上限（y 不會小於這個值） */
const BIRD_CEILING_Y = 36;
/** 閃電鳥按住上時的最大下降速度 */
const BIRD_GLIDE_MAX_Y_VELOCITY = 3;

/**
 * 一組角色和球的物理物件，由 {@link physicsEngine} 計算並設定數值。
 */
export class PikaPhysics implements Physics {
  declare player1: Player;
  declare player2: Player;
  declare ball: Ball;

  /**
   * @param isPlayer1Computer 左邊（1P）是不是電腦
   * @param isPlayer2Computer 右邊（2P）是不是電腦
   */
  constructor(isPlayer1Computer: boolean, isPlayer2Computer: boolean) {
    this.player1 = new Player(false, isPlayer1Computer);
    this.player2 = new Player(true, isPlayer2Computer);
    this.ball = new Ball(false);
  }

  /**
   * 用這組物理物件和玩家輸入跑一次 {@link physicsEngine}。
   * @param userInputArray [0] 是 1P 的輸入，[1] 是 2P 的輸入
   * @return 球是不是碰到地面了
   */
  runEngineForNextFrame(userInputArray: UserInput[]): boolean {
    const isBallTouchingGround = physicsEngine(
      this.player1,
      this.player2,
      this.ball,
      userInputArray,
    );
    return isBallTouchingGround;
  }
}

/**
 * 玩家輸入（鍵盤、搖桿都一樣）的基本形狀。
 * 衝刺請求 `dashRequest` 由 PikaKeyboard 加上（跟線上版一樣不放在這裡）。
 */
export class PikaUserInput {
  /** 0：沒有水平輸入，-1：左，1：右 */
  declare xDirection: number;
  /** 0：沒有垂直輸入，-1：上，1：下 */
  declare yDirection: number;
  /** 0：自動連發或沒按殺球，1：這一幀按下殺球 */
  declare powerHit: number;

  constructor() {
    this.xDirection = 0;
    this.yDirection = 0;
    this.powerHit = 0;
  }
}

/**
 * 角色。
 *
 * 1P 屬性位址：00411F28 -> +28 -> +10 -> +C -> ...
 * 2P 屬性位址：00411F28 -> +28 -> +10 -> +10 -> ...
 * "..." 的部分寫在各屬性右邊的註解。
 * 初始值參考 FUN_000403a90 和 FUN_00401f40。
 *
 * 欄位都在建構子裡依序設定（用 `declare` 宣告，避免 class field 語意改變設定順序）。
 */
export class Player implements IPlayer {
  /** 是不是右邊的角色 */
  declare readonly isPlayer2: boolean; // 0xA0
  /** 是不是電腦控制 */
  declare isComputer: boolean; // 0xA4
  declare x: number; // 0xA8
  declare y: number; // 0xAC
  declare yVelocity: number; // 0xB0
  declare isCollisionWithBallHappened: boolean; // 0xBC
  /**
   * 角色狀態
   * 0：一般、1：跳、2：跳起殺球、3：撲救、4：撲救後倒地、5：獲勝、6：落敗
   */
  declare state: number; // 0xC0
  declare frameNumber: number; // 0xC4
  declare normalStatusArmSwingDirection: number; // 0xC8
  declare delayBeforeNextFrame: number; // 0xCC
  /**
   * 每回合開始前設成 (_rand() % 5)。數字越大電腦越大膽：
   * 越常判斷球在對方場上、跟預測落點保持越遠的距離、越常跳、越少撲救。
   * 見 {@link letComputerDecideUserInput}（FUN_00402360）。
   */
  declare computerBoldness: number; // 0xD8
  /** -1：左、0：沒撲救、1：右 */
  declare divingDirection: number; // 0xB4
  declare lyingDownDurationLeft: number; // 0xB8
  declare isWinner: boolean; // 0xD0
  declare gameEnded: boolean; // 0xD4
  /**
   * 球在對方場上晃的時候，{@link letComputerDecideUserInput}（FUN_00402360）會隨機把它切成 0 或 1。
   * 0：電腦站在自己場地中間待命；1：電腦站在網子旁邊待命。
   */
  declare computerWhereToStandBy: number; // 0xDC
  /**
   * 原作的角色指標裡沒有這個屬性；為了音效（特別是立體聲）方便才加在角色身上。
   */
  declare sound: PlayerSound;
  // ---- 這個專案加的 ----
  declare character: CharacterId;
  declare flapsLeft: number;
  declare prevYDirection: number;
  declare isDashing: boolean;
  declare dashDirection: number;
  declare dashFramesLeft: number;
  declare dashCooldown: number;
  declare dashTrailX: number[];
  declare dashTrailY: number[];
  /** 耿鬼空間偷渡：可以越過網子移動（技能系統設定；初始為 undefined） */
  declare pvNoClamp?: boolean;
  /** 這一幀「沒碰到身體但算擊球」（技能系統設定；初始為 undefined） */
  declare pvHit?: boolean;

  /**
   * @param isPlayer2 是不是右邊的角色
   * @param isComputer 是不是電腦控制
   */
  constructor(isPlayer2: boolean, isComputer: boolean) {
    this.isPlayer2 = isPlayer2; // 0xA0
    this.isComputer = isComputer; // 0xA4
    this.initializeForNewRound();

    this.divingDirection = 0; // 0xB4
    this.lyingDownDurationLeft = -1; // 0xB8
    this.isWinner = false; // 0xD0
    this.gameEnded = false; // 0xD4
    this.computerWhereToStandBy = 0; // 0xDC
    this.sound = {
      pipikachu: false,
      pika: false,
      chu: false,
      flap: false,
    };
    this.character = 'pikachu';
    this.flapsLeft = 0;
    this.prevYDirection = 0;
    this.isDashing = false;
    this.dashDirection = 0;
    this.dashFramesLeft = 0;
    this.dashCooldown = 0;
    this.dashTrailX = [];
    this.dashTrailY = [];
  }

  /** 新回合的初始化 */
  initializeForNewRound(): void {
    this.x = 36; // 0xA8 // 1P 初始 36，2P 初始 396
    if (this.isPlayer2) {
      this.x = GROUND_WIDTH - 36;
    }
    this.y = PLAYER_TOUCHING_GROUND_Y_COORD; // 0xAC   // 初始 244
    this.yVelocity = 0; // 0xB0  // 初始 0
    this.isCollisionWithBallHappened = false; // 0xBC   // 初始 0（false）
    this.state = 0; // 0xC0   // 初始 0
    this.frameNumber = 0; // 0xC4   // 初始 0
    this.normalStatusArmSwingDirection = 1; // 0xC8  // 初始 1
    this.delayBeforeNextFrame = 0; // 0xCC  // 初始 0
    this.computerBoldness = rand() % 5; // 0xD8  // 初始 (_rand() % 5)
  }
}

/**
 * 球。
 *
 * 屬性位址：00411F28 -> +28 -> +10 -> +14 -> ...
 * 初始值參考 FUN_000403a90 和 FUN_00402d60。
 */
export class Ball implements IBall {
  declare x: number; // 0x30
  declare y: number; // 0x34
  declare xVelocity: number; // 0x38
  declare yVelocity: number; // 0x3C
  declare punchEffectRadius: number; // 0x4c
  declare isPowerHit: boolean; // 0x68
  /** 預測落點的 x 座標 */
  declare expectedLandingPointX: number; // 0x40
  /**
   * 球的旋轉圖格（0～5）。持續是 5 的期間會出現「超級球」的圖（hyper ball glitch）。
   */
  declare rotation: number; // 0x44
  declare fineRotation: number; // 0x48
  /** 擊球特效的 x 座標 */
  declare punchEffectX: number; // 0x50
  /** 擊球特效的 y 座標 */
  declare punchEffectY: number; // 0x54
  /** 以下四個是殺球拖影用的前幾幀位置 */
  declare previousX: number; // 0x58
  declare previousPreviousX: number; // 0x5c
  declare previousY: number; // 0x60
  declare previousPreviousY: number; // 0x64
  /** 原作的球指標裡沒有這個屬性；為了音效（立體聲）方便才加上。 */
  declare sound: BallSound;

  /** @param isPlayer2Serve 這個新回合是不是 2P 發球 */
  constructor(isPlayer2Serve: boolean) {
    this.initializeForNewRound(isPlayer2Serve);
    this.expectedLandingPointX = 0; // 0x40
    this.rotation = 0; // 0x44
    this.fineRotation = 0; // 0x48
    this.punchEffectX = 0; // 0x50
    this.punchEffectY = 0; // 0x54
    this.previousX = 0; // 0x58
    this.previousPreviousX = 0; // 0x5c
    this.previousY = 0; // 0x60
    this.previousPreviousY = 0; // 0x64
    this.sound = {
      powerHit: false,
      ballTouchesGround: false,
    };
  }

  /** 新回合的初始化 @param isPlayer2Serve 這個新回合是不是 2P 發球 */
  initializeForNewRound(isPlayer2Serve: boolean): void {
    this.x = 56; // 0x30    // 初始 56 或 376
    if (isPlayer2Serve === true) {
      this.x = GROUND_WIDTH - 56;
    }
    this.y = 0; // 0x34   // 初始 0
    this.xVelocity = 0; // 0x38  // 初始 0
    this.yVelocity = 1; // 0x3C  // 初始 1
    this.punchEffectRadius = 0; // 0x4c // 初始 0
    this.isPowerHit = false; // 0x68  // 初始 0（false）
  }
}

/**
 * FUN_00403dd0
 * 這就是皮卡丘打排球的物理引擎！計算並設定下一幀的物理數值。
 *
 * @param player1 左邊的角色
 * @param player2 右邊的角色
 * @param ball 球
 * @param userInputArray [0]：1P 的輸入，[1]：2P 的輸入
 * @return 球是不是碰到地面了
 */
function physicsEngine(player1: Player, player2: Player, ball: Ball, userInputArray: UserInput[]): boolean {
  const isBallTouchingGround =
    processCollisionBetweenBallAndWorldAndSetBallPosition(ball);

  let player: Player;
  let theOtherPlayer: Player;
  for (let i = 0; i < 2; i++) {
    if (i === 0) {
      player = player1;
      theOtherPlayer = player2;
    } else {
      player = player2;
      theOtherPlayer = player1;
    }

    // FUN_00402d90、FUN_00402810 省略：
    // 這份程式重構成不需要這兩個函式，只保留 FUN_00402d90 裡呼叫的
    // FUN_004031b0（calculateExpectedLandingPointXFor）
    calculateExpectedLandingPointXFor(ball); // 計算預測落點

    processPlayerMovementAndSetPlayerPosition(
      player,
      userInputArray[i],
      theOtherPlayer,
      ball,
    );

    // FUN_00402830、FUN_00406020 省略：大概是畫角色用的
  }

  for (let i = 0; i < 2; i++) {
    if (i === 0) {
      player = player1;
    } else {
      player = player2;
    }

    // FUN_00402810 省略：重構成不需要這個函式

    const isHappened = isCollisionBetweenBallAndPlayerHappened(
      ball,
      player.x,
      player.y,
    );
    if (isHappened === true) {
      if (player.isCollisionWithBallHappened === false) {
        processCollisionBetweenBallAndPlayer(
          ball,
          player.x,
          userInputArray[i],
          player.state,
        );
        player.isCollisionWithBallHappened = true;
      }
    } else {
      player.isCollisionWithBallHappened = false;
    }
  }

  // FUN_00403040、FUN_00406020 省略：大概是畫角色用的

  return isBallTouchingGround;
}

/**
 * FUN_00403070
 * 球和角色有沒有碰撞
 */
function isCollisionBetweenBallAndPlayerHappened(ball: Ball, playerX: number, playerY: number): boolean {
  let diff = ball.x - playerX;
  if (Math.abs(diff) <= PLAYER_HALF_LENGTH) {
    diff = ball.y - playerY;
    if (Math.abs(diff) <= PLAYER_HALF_LENGTH) {
      return true;
    }
  }
  return false;
}

/**
 * FUN_00402dc0
 * 處理球跟世界（邊界、網子、地面）的碰撞，並設定球的位置
 * @return 球是不是碰到地面了
 */
function processCollisionBetweenBallAndWorldAndSetBallPosition(ball: Ball): boolean {
  // 原作是在另一個函式（FUN_00402ee0）處理這段，但放在這裡比較合適。
  ball.previousPreviousX = ball.previousX;
  ball.previousPreviousY = ball.previousY;
  ball.previousX = ball.x;
  ball.previousY = ball.y;

  // "(ball.xVelocity / 2) | 0" 是除以 2 的整數除法
  let futureFineRotation = ball.fineRotation + ((ball.xVelocity / 2) | 0);
  // 如果 futureFineRotation === 50，會剛好跳過下面的 if，
  // 於是 ball.fineRotation = 50、ball.rotation = 5（超級球的圖！），這就是 hyper ball glitch。
  // 如果剛好發生在回合結束，因為每回合開始時 xVelocity 會歸零，
  // 超級球的圖會一直維持到下一次碰撞。
  if (futureFineRotation < 0) {
    futureFineRotation += 50;
  } else if (futureFineRotation > 50) {
    futureFineRotation += -50;
  }
  ball.fineRotation = futureFineRotation;
  ball.rotation = (ball.fineRotation / 10) | 0; // 整數除法

  const futureBallX = ball.x + ball.xVelocity;
  /*
    球心如果要超出左右邊界就反彈。
    考慮左右對稱的話，"futureBallX > GROUND_WIDTH" 應該是 "futureBallX > (GROUND_WIDTH - BALL_RADIUS)"，
    或 "futureBallX < BALL_RADIUS" 應該是 "futureBallX < 0"。
    是原作作者的失誤，還是為了避開無窮迴圈刻意這樣設？（見常數 INFINITE_LOOP_LIMIT 的註解）
  */
  if (futureBallX < BALL_RADIUS || futureBallX > GROUND_WIDTH) {
    ball.xVelocity = -ball.xVelocity;
  }

  let futureBallY = ball.y + ball.yVelocity;
  // 球心如果要超出上邊界
  if (futureBallY < 0) {
    ball.yVelocity = 1;
  }

  // 球碰到網子
  if (
    Math.abs(ball.x - GROUND_HALF_WIDTH) < NET_PILLAR_HALF_WIDTH &&
    ball.y > NET_PILLAR_TOP_TOP_Y_COORD
  ) {
    if (ball.y <= NET_PILLAR_TOP_BOTTOM_Y_COORD) {
      if (ball.yVelocity > 0) {
        ball.yVelocity = -ball.yVelocity;
      }
    } else {
      if (ball.x < GROUND_HALF_WIDTH) {
        ball.xVelocity = -Math.abs(ball.xVelocity);
      } else {
        ball.xVelocity = Math.abs(ball.xVelocity);
      }
    }
  }

  futureBallY = ball.y + ball.yVelocity;
  // 球要碰到地面了
  if (futureBallY > BALL_TOUCHING_GROUND_Y_COORD) {
    // FUN_00408470 省略：它收到 100 * (ball.x - 216)，也就是離網子的水平距離，大概是立體聲用的
    // (ballpointer + 0x28 + 0x10) 的函式省略；這兩個大概負責一部分音效播放
    ball.sound.ballTouchesGround = true;

    ball.yVelocity = -ball.yVelocity;
    ball.punchEffectX = ball.x;
    ball.y = BALL_TOUCHING_GROUND_Y_COORD;
    ball.punchEffectRadius = BALL_RADIUS;
    ball.punchEffectY = BALL_TOUCHING_GROUND_Y_COORD + BALL_RADIUS;
    return true;
  }
  ball.y = futureBallY;
  ball.x = ball.x + ball.xVelocity;
  ball.yVelocity += 1;

  return false;
}

/**
 * FUN_00401fc0
 * 依玩家輸入處理角色移動，並設定角色位置
 */
function processPlayerMovementAndSetPlayerPosition(
  player: Player,
  userInput: UserInput,
  theOtherPlayer: Player,
  ball: Ball,
): void {
  if (player.isComputer === true) {
    letComputerDecideUserInput(player, ball, theOtherPlayer, userInput);
  }
  // 外掛（技能系統的各角色 AI 等）可以修正這一幀的輸入；跟線上版一樣，每個角色都會呼叫
  hooks.ai.run(player, ball, theOtherPlayer, userInput);

  // 角色倒在地上……不能動
  if (player.state === 4) {
    player.lyingDownDurationLeft += -1;
    if (player.lyingDownDurationLeft < -1) {
      player.state = 0;
    }
    return;
  }

  // 處理水平移動
  let playerVelocityX = 0;
  if (player.dashCooldown > 0) {
    player.dashCooldown -= 1;
  }
  if (player.state < 5) {
    if (player.state < 3) {
      playerVelocityX = userInput.xDirection * 6;
    } else {
      // player.state === 3，角色正在撲救……
      playerVelocityX = player.divingDirection * 8;
    }
  }

  // 水伊布衝刺中：用衝刺速度取代一般移動，並記錄拖影位置
  if (player.character === 'vaporeon' && player.isDashing) {
    playerVelocityX = DASH_SPEED * player.dashDirection;
    player.dashTrailX.push(player.x);
    player.dashTrailY.push(player.y);
    if (player.dashTrailX.length > DASH_TRAIL_LENGTH) {
      player.dashTrailX.shift();
      player.dashTrailY.shift();
    }
    player.dashFramesLeft -= 1;
    if (player.dashFramesLeft <= 0) {
      player.isDashing = false;
      player.dashCooldown = DASH_COOLDOWN;
      player.dashTrailX = [];
      player.dashTrailY = [];
    }
  }
  // 水伊布開始衝刺（下一幀才開始移動）
  if (
    player.character === 'vaporeon' &&
    !player.isDashing &&
    player.dashCooldown === 0 &&
    userInput.dashRequest !== 0 &&
    player.state < 3
  ) {
    player.isDashing = true;
    player.dashDirection = userInput.dashRequest;
    player.dashFramesLeft = DASH_FRAMES;
    player.dashTrailX = [];
    player.dashTrailY = [];
  }

  const futurePlayerX = player.x + playerVelocityX;
  player.x = futurePlayerX;

  // 處理角色的水平邊界
  if (player.pvNoClamp) {
    // 耿鬼空間偷渡：只限制在整個場地內，可以越過網子
    if (futurePlayerX < PLAYER_HALF_LENGTH) {
      player.x = PLAYER_HALF_LENGTH;
    } else if (futurePlayerX > GROUND_WIDTH - PLAYER_HALF_LENGTH) {
      player.x = GROUND_WIDTH - PLAYER_HALF_LENGTH;
    }
  } else if (player.isPlayer2 === false) {
    // 1P
    if (futurePlayerX < PLAYER_HALF_LENGTH) {
      player.x = PLAYER_HALF_LENGTH;
    } else if (futurePlayerX > GROUND_HALF_WIDTH - PLAYER_HALF_LENGTH) {
      player.x = GROUND_HALF_WIDTH - PLAYER_HALF_LENGTH;
    }
  } else {
    // 2P
    if (futurePlayerX < GROUND_HALF_WIDTH + PLAYER_HALF_LENGTH) {
      player.x = GROUND_HALF_WIDTH + PLAYER_HALF_LENGTH;
    } else if (futurePlayerX > GROUND_WIDTH - PLAYER_HALF_LENGTH) {
      player.x = GROUND_WIDTH - PLAYER_HALF_LENGTH;
    }
  }

  // 跳
  if (
    player.state < 3 &&
    userInput.yDirection === -1 && // 按上
    player.y === PLAYER_TOUCHING_GROUND_Y_COORD // 站在地上
  ) {
    player.yVelocity = -16;
    player.state = 1;
    player.frameNumber = 0;
    player.flapsLeft = BIRD_FLAPS_PER_JUMP;
    // 疑似立體聲函式 FUN_00408470 (0x90) 省略；(playerpointer + 0x90 + 0x10) 的音效函式省略
    player.sound.chu = true;
  }

  // 閃電鳥在空中（跳／殺球）再按一次上 = 拍翅
  const canFlap =
    player.character === 'bird' &&
    (player.state === 1 || player.state === 2) &&
    player.y < PLAYER_TOUCHING_GROUND_Y_COORD;
  if (
    canFlap &&
    userInput.yDirection === -1 &&
    player.prevYDirection !== -1 &&
    player.flapsLeft > 0
  ) {
    player.yVelocity = BIRD_FLAP_Y_VELOCITY;
    player.flapsLeft -= 1;
    player.sound.flap = true;
  }
  player.prevYDirection = userInput.yDirection;

  // 重力
  const futurePlayerY = player.y + player.yVelocity;
  player.y = futurePlayerY;
  // 閃電鳥的飛行高度上限
  if (player.character === 'bird' && player.y < BIRD_CEILING_Y && player.state < 3) {
    player.y = BIRD_CEILING_Y;
    if (player.yVelocity < 0) {
      player.yVelocity = 0;
    }
  }
  if (futurePlayerY < PLAYER_TOUCHING_GROUND_Y_COORD) {
    player.yVelocity += 1;
    // 閃電鳥按住上：滑翔，下降速度有上限
    if (canFlap && userInput.yDirection === -1) {
      player.yVelocity = Math.min(player.yVelocity, BIRD_GLIDE_MAX_Y_VELOCITY);
    }
  } else if (futurePlayerY > PLAYER_TOUCHING_GROUND_Y_COORD) {
    // 角色著地……
    player.yVelocity = 0;
    player.y = PLAYER_TOUCHING_GROUND_Y_COORD;
    player.frameNumber = 0;
    if (player.state === 3) {
      // 撲救中著地 → 倒地
      player.state = 4;
      player.frameNumber = 0;
      player.lyingDownDurationLeft = 3;
    } else {
      player.state = 0;
    }
  }

  if (userInput.powerHit === 1) {
    if (player.state === 1) {
      // 跳起來時按殺球 → 殺球！
      player.delayBeforeNextFrame = 5;
      player.frameNumber = 0;
      player.state = 2;
      // (playerpointer + 0x90 + 0x18)、FUN_00408470 (0x90)、(playerpointer + 0x90 + 0x14) 的音效函式省略
      player.sound.pika = true;
    } else if (player.state === 0 && userInput.xDirection !== 0) {
      // 撲救！
      player.state = 3;
      player.frameNumber = 0;
      player.divingDirection = userInput.xDirection;
      player.yVelocity = -5;
      // FUN_00408470 (0x90)、(playerpointer + 0x90 + 0x10) 的音效函式省略
      player.sound.chu = true;
    }
  }

  if (player.state === 1) {
    player.frameNumber = (player.frameNumber + 1) % 3;
  } else if (player.state === 2) {
    if (player.delayBeforeNextFrame < 1) {
      player.frameNumber += 1;
      if (player.frameNumber > 4) {
        player.frameNumber = 0;
        player.state = 1;
      }
    } else {
      player.delayBeforeNextFrame -= 1;
    }
  } else if (player.state === 0) {
    player.delayBeforeNextFrame += 1;
    if (player.delayBeforeNextFrame > 3) {
      player.delayBeforeNextFrame = 0;
      const futureFrameNumber =
        player.frameNumber + player.normalStatusArmSwingDirection;
      if (futureFrameNumber < 0 || futureFrameNumber > 4) {
        player.normalStatusArmSwingDirection =
          -player.normalStatusArmSwingDirection;
      }
      player.frameNumber =
        player.frameNumber + player.normalStatusArmSwingDirection;
    }
  }

  if (player.gameEnded === true) {
    if (player.state === 0) {
      if (player.isWinner === true) {
        player.state = 5;
        // FUN_00408470 (0x90)、(0x98 + 0x10) 的音效函式省略
        player.sound.pipikachu = true;
      } else {
        player.state = 6;
      }
      player.delayBeforeNextFrame = 0;
      player.frameNumber = 0;
    }
    processGameEndFrameFor(player);
  }
}

/**
 * FUN_004025e0
 * 處理比賽結束時（獲勝／落敗動作）的圖格
 */
function processGameEndFrameFor(player: Player): void {
  if (player.gameEnded === true && player.frameNumber < 4) {
    player.delayBeforeNextFrame += 1;
    if (player.delayBeforeNextFrame > 4) {
      player.delayBeforeNextFrame = 0;
      player.frameNumber += 1;
    }
  }
}

/**
 * FUN_004030a0
 * 處理球和角色的碰撞。
 * 這裡只設定球的速度和預測落點，不設定球的位置；
 * 球的位置由 {@link processCollisionBetweenBallAndWorldAndSetBallPosition} 設定。
 */
function processCollisionBetweenBallAndPlayer(
  ball: Ball,
  playerX: number,
  userInput: UserInput,
  playerState: number,
): void {
  // 碰撞時，角色和球的水平距離越大，球的水平速度越大。
  if (ball.x < playerX) {
    // JavaScript 的除法是浮點數除法，這裡用 "| 0" 做整數除法
    ball.xVelocity = -((Math.abs(ball.x - playerX) / 3) | 0);
  } else if (ball.x > playerX) {
    ball.xVelocity = (Math.abs(ball.x - playerX) / 3) | 0;
  }

  // 水平速度是 0 的話，隨機選 -1、0、1
  if (ball.xVelocity === 0) {
    ball.xVelocity = (rand() % 3) - 1;
  }

  const ballAbsYVelocity = Math.abs(ball.yVelocity);
  ball.yVelocity = -ballAbsYVelocity;

  if (ballAbsYVelocity < 15) {
    ball.yVelocity = -15;
  }

  // 角色跳起來殺球
  if (playerState === 2) {
    if (ball.x < GROUND_HALF_WIDTH) {
      ball.xVelocity = (Math.abs(userInput.xDirection) + 1) * 10;
    } else {
      ball.xVelocity = -(Math.abs(userInput.xDirection) + 1) * 10;
    }
    ball.punchEffectX = ball.x;
    ball.punchEffectY = ball.y;

    ball.yVelocity = Math.abs(ball.yVelocity) * userInput.yDirection * 2;
    ball.punchEffectRadius = BALL_RADIUS;
    // FUN_00408470 (0x90)、(ballpointer + 0x24 + 0x10) 的音效函式省略
    ball.sound.powerHit = true;

    ball.isPowerHit = true;
  } else {
    ball.isPowerHit = false;
  }

  calculateExpectedLandingPointXFor(ball);
}

/**
 * FUN_004031b0
 * 計算球的預測落點 x 座標
 */
function calculateExpectedLandingPointXFor(ball: Ball): void {
  const copyBall = {
    x: ball.x,
    y: ball.y,
    xVelocity: ball.xVelocity,
    yVelocity: ball.yVelocity,
  };
  let loopCounter = 0;
  while (true) {
    loopCounter++;

    const futureCopyBallX = copyBall.xVelocity + copyBall.x;
    if (futureCopyBallX < BALL_RADIUS || futureCopyBallX > GROUND_WIDTH) {
      copyBall.xVelocity = -copyBall.xVelocity;
    }
    if (copyBall.y + copyBall.yVelocity < 0) {
      copyBall.yVelocity = 1;
    }

    // 複製的球碰到網子
    if (
      Math.abs(copyBall.x - GROUND_HALF_WIDTH) < NET_PILLAR_HALF_WIDTH &&
      copyBall.y > NET_PILLAR_TOP_TOP_Y_COORD
    ) {
      // 照 FUN_00402dc0 應該是 <= NET_PILLAR_TOP_BOTTOM_Y_COORD，可能是原作作者的失誤？
      if (copyBall.y < NET_PILLAR_TOP_BOTTOM_Y_COORD) {
        if (copyBall.yVelocity > 0) {
          copyBall.yVelocity = -copyBall.yVelocity;
        }
      } else {
        if (copyBall.x < GROUND_HALF_WIDTH) {
          copyBall.xVelocity = -Math.abs(copyBall.xVelocity);
        } else {
          copyBall.xVelocity = Math.abs(copyBall.xVelocity);
        }
      }
    }

    copyBall.y = copyBall.y + copyBall.yVelocity;
    // 複製的球要碰到地面了
    if (
      copyBall.y > BALL_TOUCHING_GROUND_Y_COORD ||
      loopCounter >= INFINITE_LOOP_LIMIT
    ) {
      break;
    }
    copyBall.x = copyBall.x + copyBall.xVelocity;
    copyBall.yVelocity += 1;
  }
  ball.expectedLandingPointX = copyBall.x;
}

/**
 * FUN_00402360
 * 電腦用這個函式控制角色：依照它從參數（角色、球、對手）判斷的局勢決定按鍵，寫進 userInput。
 */
function letComputerDecideUserInput(
  player: Player,
  ball: Ball,
  theOtherPlayer: Player,
  userInput: UserInput,
): void {
  userInput.xDirection = 0;
  userInput.yDirection = 0;
  userInput.powerHit = 0;

  let virtualExpectedLandingPointX = ball.expectedLandingPointX;
  if (
    Math.abs(ball.x - player.x) > 100 &&
    Math.abs(ball.xVelocity) < player.computerBoldness + 5
  ) {
    const leftBoundary = Number(player.isPlayer2) * GROUND_HALF_WIDTH;
    if (
      (ball.expectedLandingPointX <= leftBoundary ||
        ball.expectedLandingPointX >=
          Number(player.isPlayer2) * GROUND_WIDTH + GROUND_HALF_WIDTH) &&
      player.computerWhereToStandBy === 0
    ) {
      // 符合上面的條件時，電腦把待命位置估成自己場地的中間
      virtualExpectedLandingPointX =
        leftBoundary + ((GROUND_HALF_WIDTH / 2) | 0);
    }
  }

  if (
    Math.abs(virtualExpectedLandingPointX - player.x) >
    player.computerBoldness + 8
  ) {
    if (player.x < virtualExpectedLandingPointX) {
      userInput.xDirection = 1;
    } else {
      userInput.xDirection = -1;
    }
  } else if (rand() % 20 === 0) {
    player.computerWhereToStandBy = rand() % 2;
  }

  if (player.state === 0) {
    if (
      Math.abs(ball.xVelocity) < player.computerBoldness + 3 &&
      Math.abs(ball.x - player.x) < PLAYER_HALF_LENGTH &&
      ball.y > -36 &&
      ball.y < 10 * player.computerBoldness + 84 &&
      ball.yVelocity > 0
    ) {
      userInput.yDirection = -1;
    }

    const leftBoundary = Number(player.isPlayer2) * GROUND_HALF_WIDTH;
    const rightBoundary = (Number(player.isPlayer2) + 1) * GROUND_HALF_WIDTH;
    if (
      ball.expectedLandingPointX > leftBoundary &&
      ball.expectedLandingPointX < rightBoundary &&
      Math.abs(ball.x - player.x) >
        player.computerBoldness * 5 + PLAYER_LENGTH &&
      ball.x > leftBoundary &&
      ball.x < rightBoundary &&
      ball.y > 174
    ) {
      // 符合上面的條件時，電腦決定撲救！
      userInput.powerHit = 1;
      if (player.x < ball.x) {
        userInput.xDirection = 1;
      } else {
        userInput.xDirection = -1;
      }
    }
  } else if (player.state === 1 || player.state === 2) {
    if (Math.abs(ball.x - player.x) > 8) {
      if (player.x < ball.x) {
        userInput.xDirection = 1;
      } else {
        userInput.xDirection = -1;
      }
    }
    if (Math.abs(ball.x - player.x) < 48 && Math.abs(ball.y - player.y) < 48) {
      const willInputPowerHit = decideWhetherInputPowerHit(
        player,
        ball,
        theOtherPlayer,
        userInput,
      );
      if (willInputPowerHit === true) {
        userInput.powerHit = 1;
        if (
          Math.abs(theOtherPlayer.x - player.x) < 80 &&
          userInput.yDirection !== -1
        ) {
          userInput.yDirection = -1;
        }
      }
    }
  }
}

/**
 * FUN_00402630
 * 由 {@link letComputerDecideUserInput} 呼叫；同時設定水平、垂直輸入，決定殺球的方向。
 * @return 要不要按殺球
 */
function decideWhetherInputPowerHit(
  player: Player,
  ball: Ball,
  theOtherPlayer: Player,
  userInput: UserInput,
): boolean {
  if (rand() % 2 === 0) {
    for (let xDirection = 1; xDirection > -1; xDirection--) {
      for (let yDirection = -1; yDirection < 2; yDirection++) {
        const expectedLandingPointX = expectedLandingPointXWhenPowerHit(
          xDirection,
          yDirection,
          ball,
        );
        if (
          (expectedLandingPointX <=
            Number(player.isPlayer2) * GROUND_HALF_WIDTH ||
            expectedLandingPointX >=
              Number(player.isPlayer2) * GROUND_WIDTH + GROUND_HALF_WIDTH) &&
          Math.abs(expectedLandingPointX - theOtherPlayer.x) > PLAYER_LENGTH
        ) {
          userInput.xDirection = xDirection;
          userInput.yDirection = yDirection;
          return true;
        }
      }
    }
  } else {
    for (let xDirection = 1; xDirection > -1; xDirection--) {
      for (let yDirection = 1; yDirection > -2; yDirection--) {
        const expectedLandingPointX = expectedLandingPointXWhenPowerHit(
          xDirection,
          yDirection,
          ball,
        );
        if (
          (expectedLandingPointX <=
            Number(player.isPlayer2) * GROUND_HALF_WIDTH ||
            expectedLandingPointX >=
              Number(player.isPlayer2) * GROUND_WIDTH + GROUND_HALF_WIDTH) &&
          Math.abs(expectedLandingPointX - theOtherPlayer.x) > PLAYER_LENGTH
        ) {
          userInput.xDirection = xDirection;
          userInput.yDirection = yDirection;
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * FUN_00402870
 * 由 {@link decideWhetherInputPowerHit} 呼叫，計算殺球後球的預測落點 x 座標
 */
function expectedLandingPointXWhenPowerHit(
  userInputXDirection: number,
  userInputYDirection: number,
  ball: Ball,
): number {
  const copyBall = {
    x: ball.x,
    y: ball.y,
    xVelocity: ball.xVelocity,
    yVelocity: ball.yVelocity,
  };
  if (copyBall.x < GROUND_HALF_WIDTH) {
    copyBall.xVelocity = (Math.abs(userInputXDirection) + 1) * 10;
  } else {
    copyBall.xVelocity = -(Math.abs(userInputXDirection) + 1) * 10;
  }
  copyBall.yVelocity = Math.abs(copyBall.yVelocity) * userInputYDirection * 2;

  let loopCounter = 0;
  while (true) {
    loopCounter++;

    const futureCopyBallX = copyBall.x + copyBall.xVelocity;
    if (futureCopyBallX < BALL_RADIUS || futureCopyBallX > GROUND_WIDTH) {
      copyBall.xVelocity = -copyBall.xVelocity;
    }
    if (copyBall.y + copyBall.yVelocity < 0) {
      copyBall.yVelocity = 1;
    }
    if (
      Math.abs(copyBall.x - GROUND_HALF_WIDTH) < NET_PILLAR_HALF_WIDTH &&
      copyBall.y > NET_PILLAR_TOP_TOP_Y_COORD
    ) {
      /*
        這段大概是故意讓電腦犯錯：電腦偶爾會去殺被網柱彈回來的球，
        因為這裡沒有預測到網柱的反彈。
        不讓電腦犯這種錯的寫法如下：

        if (copyBall.y <= NET_PILLAR_TOP_BOTTOM_Y_COORD) {
          if (copyBall.yVelocity > 0) {
            copyBall.yVelocity = -copyBall.yVelocity;
          }
        } else {
          if (copyBall.x < GROUND_HALF_WIDTH) {
            copyBall.xVelocity = -Math.abs(copyBall.xVelocity);
          } else {
            copyBall.xVelocity = Math.abs(copyBall.xVelocity);
          }
        }
      */
      if (copyBall.yVelocity > 0) {
        copyBall.yVelocity = -copyBall.yVelocity;
      }
    }
    copyBall.y = copyBall.y + copyBall.yVelocity;
    if (
      copyBall.y > BALL_TOUCHING_GROUND_Y_COORD ||
      loopCounter >= INFINITE_LOOP_LIMIT
    ) {
      return copyBall.x;
    }
    copyBall.x = copyBall.x + copyBall.xVelocity;
    copyBall.yVelocity += 1;
  }
}
