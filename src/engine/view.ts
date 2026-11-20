/**
 * MVC 的 View（原作 view.js）。
 *
 * 有些程式碼是逆向工程原作機器碼得到的，註解裡標了參考的函式位址，例如 FUN_00405d50。
 *
 * 這個專案加的：
 *  - 20 隻角色的動作圖（playerTextureArrays），角色換了就換掉 AnimatedSprite 的 textures。
 *  - 水伊布衝刺的拖影（p1Trails、p2Trails，各 2 個半透明 sprite）。
 *  - 畫完角色和球之後呼叫 `hooks.drawBall`（舊版 window._pvDrawBall）。
 */
import { AnimatedSprite } from '@pixi/sprite-animated';
import { Sprite } from '@pixi/sprite';
import { Container } from '@pixi/display';
import type { Texture } from '@pixi/core';
import { Cloud, Wave, cloudAndWaveEngine } from './cloud-and-wave';
import { ASSETS_PATH } from './assets';
import type { Resources } from './audio';
import { hooks } from '../core/hooks';
import type {
  CharacterId, FadeInOut as IFadeInOut, GameView as IGameView, GameViews, Physics,
} from '../core/types';

const TEXTURES = ASSETS_PATH.TEXTURES;

/** core/types.ts 裡開場、選單畫面的形狀 */
type IIntroView = GameViews['intro'];
type IMenuView = GameViews['menu'];

/** 名稱 → 貼圖（sprite sheet 的 textures） */
type TextureDict = Record<string, Texture>;

/** 要畫的雲的數量 */
const NUM_OF_CLOUDS = 10;

/**
 * 取出 sprite sheet 的貼圖。
 * 舊版直接讀 `resources[path].textures`（假設一定載入成功），這裡只做型別上的轉換。
 */
function texturesOf(resources: Resources, path: string): TextureDict {
  return resources[path].textures as TextureDict;
}

/**
 * 開場畫面：拿公事包的人的標誌
 */
export class IntroView implements IIntroView {
  declare mark: Sprite;
  declare container: Container;

  /** @param resources loader.resources */
  constructor(resources: Resources) {
    const textures = texturesOf(resources, ASSETS_PATH.SPRITE_SHEET);

    this.mark = makeSpriteWithAnchorXY(textures, TEXTURES.MARK, 0.5, 0.5);
    this.mark.x = 432 / 2;
    this.mark.y = 304 / 2;

    this.container = new Container();
    this.container.addChild(this.mark);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  set visible(bool: boolean) {
    this.container.visible = bool;
  }

  /** 畫「拿公事包的人」標誌 */
  drawMark(frameCounter: number): void {
    const mark = this.mark;
    if (frameCounter === 0) {
      mark.alpha = 0;
      return;
    }
    if (frameCounter < 100) {
      mark.alpha = Math.min(1, mark.alpha + 1 / 25);
    } else if (frameCounter >= 100) {
      mark.alpha = Math.max(0, mark.alpha - 1 / 25);
    }
  }
}

interface MenuMessages {
  pokemon: Sprite;
  pikachuVolleyball: Sprite;
  withWho: Sprite[];
  sachisoft: Sprite;
  fight: Sprite;
}

/**
 * 選單畫面：選「跟電腦玩」或「跟朋友玩」
 */
export class MenuView implements IMenuView {
  declare messages: MenuMessages;
  declare sittingPikachuTilesContainer: Container;
  declare container: Container;
  declare sittingPikachuTilesDisplacement: number;
  /** 0：跟電腦，1：跟朋友，-1：還沒選 */
  declare selectedWithWho: number;
  declare selectedWithWhoMessageSizeIncrement: number;

  /** @param resources loader.resources */
  constructor(resources: Resources) {
    const textures = texturesOf(resources, ASSETS_PATH.SPRITE_SHEET);

    this.messages = {
      pokemon: makeSpriteWithAnchorXY(textures, TEXTURES.POKEMON, 0, 0),
      pikachuVolleyball: makeSpriteWithAnchorXY(
        textures,
        TEXTURES.PIKACHU_VOLLEYBALL,
        0,
        0,
      ),
      withWho: [
        makeSpriteWithAnchorXY(textures, TEXTURES.WITH_COMPUTER, 0, 0),
        makeSpriteWithAnchorXY(textures, TEXTURES.WITH_FRIEND, 0, 0),
      ],
      sachisoft: makeSpriteWithAnchorXY(textures, TEXTURES.SACHISOFT, 0, 0),
      fight: makeSpriteWithAnchorXY(textures, TEXTURES.FIGHT, 0, 0),
    };
    this.sittingPikachuTilesContainer =
      makeSittingPikachuTilesContainer(textures);

    // 參考 FUN_004059f0
    this.messages.sachisoft.x = 216 - this.messages.sachisoft.texture.width / 2;
    this.messages.sachisoft.y = 264;

    // 參考 FUN_00405b70
    this.messages.pikachuVolleyball.x = 140;
    this.messages.pikachuVolleyball.y = 80;
    this.messages.pokemon.x = 170;
    this.messages.pokemon.y = 40;

    this.container = new Container();
    this.container.addChild(this.sittingPikachuTilesContainer);
    this.container.addChild(this.messages.pokemon);
    this.container.addChild(this.messages.pikachuVolleyball);
    this.container.addChild(this.messages.withWho[0]);
    this.container.addChild(this.messages.withWho[1]);
    this.container.addChild(this.messages.sachisoft);
    this.container.addChild(this.messages.fight);
    this.initializeVisibles();

    this.sittingPikachuTilesDisplacement = 0;
    this.selectedWithWho = -1; // 0：跟電腦，1：跟朋友，-1：還沒選
    this.selectedWithWhoMessageSizeIncrement = 2;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  set visible(bool: boolean) {
    this.container.visible = bool;

    // 關掉畫面時，把這個畫面裡 sprite 的顯示狀態初始化
    if (bool === false) {
      this.initializeVisibles();
    }
  }

  initializeVisibles(): void {
    for (const prop in this.messages) {
      // withWho 是陣列：原作也只是在陣列物件本身設 visible（不影響裡面的 sprite），照舊保留
      (this.messages[prop as keyof MenuMessages] as { visible: boolean }).visible = false;
    }
  }

  /**
   * 參考 FUN_00405d50
   * 畫隨著幀數變大變小的「fight!」字樣
   */
  drawFightMessage(frameCounter: number): void {
    const sizeArray = [20, 22, 25, 27, 30, 27, 25, 22, 20];
    const fightMessage = this.messages.fight;
    const w = fightMessage.texture.width;
    const h = fightMessage.texture.height;

    if (frameCounter === 0) {
      fightMessage.visible = true;
    }

    if (frameCounter < 30) {
      const halfWidth = Math.floor(Math.floor((frameCounter * w) / 30) / 2);
      const halfHeight = Math.floor(Math.floor((frameCounter * h) / 30) / 2);
      fightMessage.width = halfWidth * 2; // 寬
      fightMessage.height = halfHeight * 2; // 高
      fightMessage.x = 100 - halfWidth; // x 座標
      fightMessage.y = 70 - halfHeight; // y 座標
    } else {
      const index = (frameCounter + 1) % 9;
      const halfWidth = Math.floor(Math.floor((sizeArray[index] * w) / 30) / 2);
      const halfHeight = Math.floor(
        Math.floor((sizeArray[index] * h) / 30) / 2,
      );
      fightMessage.width = halfWidth * 2; // 寬
      fightMessage.height = halfHeight * 2; // 高
      fightMessage.y = 70 - halfHeight; // y 座標
      fightMessage.x = 100 - halfWidth; // x 座標
    }
  }

  /** 隨著幀數畫 sachisoft 字樣 */
  drawSachisoft(frameCounter: number): void {
    if (frameCounter === 0) {
      this.messages.sachisoft.visible = true;
      this.messages.sachisoft.alpha = 0;
    }
    this.messages.sachisoft.alpha = Math.min(
      1,
      this.messages.sachisoft.alpha + 0.04,
    );

    if (frameCounter > 70) {
      this.messages.sachisoft.alpha = 1;
    }
  }

  /**
   * 參考 FUN_00405ca0
   * 隨著幀數畫坐著的皮卡丘背景磚
   */
  drawSittingPikachuTiles(frameCounter: number): void {
    if (frameCounter === 0) {
      this.sittingPikachuTilesContainer.visible = true;
      this.sittingPikachuTilesContainer.alpha = 0;
    }

    // 移動（子物件都是 Sprite）
    const h = (this.sittingPikachuTilesContainer.getChildAt(0) as Sprite).texture.height;
    this.sittingPikachuTilesDisplacement =
      (this.sittingPikachuTilesDisplacement + 2) % h;
    this.sittingPikachuTilesContainer.x = -this.sittingPikachuTilesDisplacement;
    this.sittingPikachuTilesContainer.y = -this.sittingPikachuTilesDisplacement;

    if (frameCounter > 30) {
      // 透明度
      this.sittingPikachuTilesContainer.alpha = Math.min(
        1,
        this.sittingPikachuTilesContainer.alpha + 0.04,
      );
    }

    if (frameCounter > 70) {
      this.sittingPikachuTilesContainer.alpha = 1;
    }
  }

  /**
   * 參考 FUN_00405b70
   * 隨著幀數畫「皮卡丘排球」字樣
   */
  drawPikachuVolleyballMessage(frameCounter: number): void {
    if (frameCounter === 0) {
      this.messages.pikachuVolleyball.visible = false;
      return;
    }

    if (frameCounter > 30) {
      this.messages.pikachuVolleyball.visible = true;
    }

    if (frameCounter > 30 && frameCounter <= 44) {
      const xDiff = 195 - 15 * (frameCounter - 30);
      this.messages.pikachuVolleyball.x = 140 + xDiff;
    } else if (frameCounter > 44 && frameCounter <= 55) {
      this.messages.pikachuVolleyball.x = 140;
      this.messages.pikachuVolleyball.width = 200 - 15 * (frameCounter - 44);
    } else if (frameCounter > 55 && frameCounter <= 71) {
      this.messages.pikachuVolleyball.x = 140;
      this.messages.pikachuVolleyball.width = 40 + 15 * (frameCounter - 55);
    } else if (frameCounter > 71) {
      this.messages.pikachuVolleyball.x = 140;
      this.messages.pikachuVolleyball.width =
        this.messages.pikachuVolleyball.texture.width;
    }
  }

  /**
   * 參考 FUN_00405b70
   * 隨著幀數畫「寶可夢」字樣
   */
  drawPokemonMessage(frameCounter: number): void {
    if (frameCounter === 0) {
      this.messages.pokemon.visible = false;
      return;
    }

    if (frameCounter > 71) {
      this.messages.pokemon.visible = true;
    }
  }

  /**
   * 參考 FUN_00405ec0
   * 隨著幀數畫「跟電腦」「跟朋友」選項
   */
  drawWithWhoMessages(frameCounter: number): void {
    const withWho = this.messages.withWho;
    const w = withWho[0].texture.width;
    const h = withWho[0].texture.height;

    if (frameCounter === 0) {
      for (let i = 0; i < 2; i++) {
        withWho[i].visible = false;
      }
      return;
    }

    if (frameCounter > 70) {
      if (this.selectedWithWhoMessageSizeIncrement < 10) {
        this.selectedWithWhoMessageSizeIncrement += 1;
      }
      for (let i = 0; i < 2; i++) {
        const selected = Number(this.selectedWithWho === i); // 選中是 1，否則 0
        const halfWidthIncrement =
          selected * (this.selectedWithWhoMessageSizeIncrement + 2);
        const halfHeightIncrement =
          selected * this.selectedWithWhoMessageSizeIncrement;

        withWho[i].visible = true;
        withWho[i].x = 216 - w / 2 - halfWidthIncrement;
        withWho[i].y = 184 + 30 * i - halfHeightIncrement;
        withWho[i].width = w + 2 * halfWidthIncrement;
        withWho[i].height = h + 2 * halfHeightIncrement;
      }
    }
  }

  /**
   * 選擇對象（選中的選項會變大）
   * @param i 0：跟電腦，1：跟朋友
   */
  selectWithWho(i: number): void {
    this.selectedWithWho = i;
    this.selectedWithWhoMessageSizeIncrement = 2;
  }
}

interface GameMessages {
  gameStart: Sprite;
  ready: Sprite;
  gameEnd: Sprite;
}

/**
 * 比賽畫面：角色、球、雲、浪、背景
 */
export class GameView implements IGameView {
  declare bgContainer: Container;
  declare playerTextureArrays: Record<CharacterId, Texture[]>;
  /** 目前 player1／player2 這兩個 AnimatedSprite 用的是哪隻角色的圖 */
  declare player1Character: CharacterId;
  declare player2Character: CharacterId;
  declare player1: AnimatedSprite;
  declare player2: AnimatedSprite;
  declare ball: AnimatedSprite;
  declare ballHyper: Sprite;
  declare ballTrail: Sprite;
  declare punch: Sprite;
  /** [0] 是 1P 的計分板，[1] 是 2P 的 */
  declare scoreBoards: Container[];
  declare shadows: { forPlayer1: Sprite; forPlayer2: Sprite; forBall: Sprite };
  declare messages: GameMessages;
  declare cloudContainer: Container;
  declare waveContainer: Container;
  declare container: Container;
  /** 水伊布衝刺的拖影（各 2 個） */
  declare p1Trails: Sprite[];
  declare p2Trails: Sprite[];
  declare cloudArray: Cloud[];
  declare wave: Wave;

  /** @param resources loader.resources */
  constructor(resources: Resources) {
    const textures = texturesOf(resources, ASSETS_PATH.SPRITE_SHEET);
    const birdTextures = texturesOf(resources, ASSETS_PATH.BIRD_SHEET);

    // 以下是要畫的物件
    this.bgContainer = makeBGContainer(textures);
    this.playerTextureArrays = {
      pikachu: makePlayerTextureArray(textures, TEXTURES.PIKACHU),
      bird: makePlayerTextureArray(birdTextures, TEXTURES.BIRD),
      vaporeon: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.VAPOREON_SHEET), TEXTURES.VAPOREON),
      flareon: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.FLAREON_SHEET), TEXTURES.FLAREON),
      jolteon: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.JOLTEON_SHEET), TEXTURES.JOLTEON),
      gengar: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.GENGAR_SHEET), TEXTURES.GENGAR),
      meowth: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.MEOWTH_SHEET), TEXTURES.MEOWTH),
      snorlax: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.SNORLAX_SHEET), TEXTURES.SNORLAX),
      mewtwo: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.MEWTWO_SHEET), TEXTURES.MEWTWO),
      electrode: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.ELECTRODE_SHEET), TEXTURES.ELECTRODE),
      wobbuffet: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.WOBBUFFET_SHEET), TEXTURES.WOBBUFFET),
      ditto: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.DITTO_SHEET), TEXTURES.DITTO),
      mrmime: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.MRMIME_SHEET), TEXTURES.MRMIME),
      dugtrio: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.DUGTRIO_SHEET), TEXTURES.DUGTRIO),
      farfetchd: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.FARFETCHD_SHEET), TEXTURES.FARFETCHD),
      psyduck: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.PSYDUCK_SHEET), TEXTURES.PSYDUCK),
      magikarp: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.MAGIKARP_SHEET), TEXTURES.MAGIKARP),
      jigglypuff: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.JIGGLYPUFF_SHEET), TEXTURES.JIGGLYPUFF),
      dragonite: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.DRAGONITE_SHEET), TEXTURES.DRAGONITE),
      mew: makePlayerTextureArray(texturesOf(resources, ASSETS_PATH.MEW_SHEET), TEXTURES.MEW),
    };
    this.player1Character = 'pikachu';
    this.player2Character = 'pikachu';
    const playerSprites = makePlayerAnimatedSprites(textures);
    this.player1 = playerSprites[0];
    this.player2 = playerSprites[1];
    this.ball = makeBallAnimatedSprites(textures);
    this.ballHyper = makeSpriteWithAnchorXY(
      textures,
      TEXTURES.BALL_HYPER,
      0.5,
      0.5,
    );
    this.ballTrail = makeSpriteWithAnchorXY(
      textures,
      TEXTURES.BALL_TRAIL,
      0.5,
      0.5,
    );
    this.punch = makeSpriteWithAnchorXY(
      textures,
      TEXTURES.BALL_PUNCH,
      0.5,
      0.5,
    );

    // this.scoreBoards[0] 給 1P，this.scoreBoards[1] 給 2P
    this.scoreBoards = [
      makeScoreBoardSprite(textures),
      makeScoreBoardSprite(textures),
    ];

    this.shadows = {
      forPlayer1: makeSpriteWithAnchorXY(textures, TEXTURES.SHADOW, 0.5, 0.5),
      forPlayer2: makeSpriteWithAnchorXY(textures, TEXTURES.SHADOW, 0.5, 0.5),
      forBall: makeSpriteWithAnchorXY(textures, TEXTURES.SHADOW, 0.5, 0.5),
    };

    this.messages = {
      gameStart: makeSpriteWithAnchorXY(textures, TEXTURES.GAME_START, 0, 0),
      ready: makeSpriteWithAnchorXY(textures, TEXTURES.READY, 0, 0),
      gameEnd: makeSpriteWithAnchorXY(textures, TEXTURES.GAME_END, 0, 0),
    };

    this.cloudContainer = makeCloudContainer(textures);
    this.waveContainer = makeWaveContainer(textures);

    // 包含所有畫面物件的容器
    // 注意 addChild 的順序：越晚加的越上層
    this.container = new Container();
    this.container.addChild(this.bgContainer);
    this.container.addChild(this.cloudContainer);
    this.container.addChild(this.waveContainer);
    this.container.addChild(this.shadows.forPlayer1);
    this.container.addChild(this.shadows.forPlayer2);
    this.container.addChild(this.shadows.forBall);
    // 水伊布衝刺拖影（在角色下面）
    this.p1Trails = [];
    this.p2Trails = [];
    for (let t = 0; t < 2; t++) {
      const s1 = new Sprite(this.playerTextureArrays.vaporeon[0]);
      s1.anchor.x = 0.5;
      s1.anchor.y = 0.5;
      s1.alpha = 0;
      s1.visible = false;
      this.p1Trails.push(s1);
      const s2 = new Sprite(this.playerTextureArrays.vaporeon[0]);
      s2.anchor.x = 0.5;
      s2.anchor.y = 0.5;
      s2.alpha = 0;
      s2.visible = false;
      this.p2Trails.push(s2);
    }
    this.container.addChild(this.p1Trails[0]);
    this.container.addChild(this.p1Trails[1]);
    this.container.addChild(this.p2Trails[0]);
    this.container.addChild(this.p2Trails[1]);
    this.container.addChild(this.player1);
    this.container.addChild(this.player2);
    this.container.addChild(this.ballTrail);
    this.container.addChild(this.ballHyper);
    this.container.addChild(this.ball);
    this.container.addChild(this.punch);
    this.container.addChild(this.scoreBoards[0]);
    this.container.addChild(this.scoreBoards[1]);
    this.container.addChild(this.messages.gameStart);
    this.container.addChild(this.messages.ready);
    this.container.addChild(this.messages.gameEnd);

    // 位置和顯示狀態
    this.bgContainer.x = 0;
    this.bgContainer.y = 0;
    this.cloudContainer.x = 0;
    this.cloudContainer.y = 0;
    this.waveContainer.x = 0;
    this.waveContainer.y = 0;

    this.messages.ready.x = 176;
    this.messages.ready.y = 38;
    this.scoreBoards[0].x = 14; // 計分板離邊界 14 像素
    this.scoreBoards[0].y = 10;
    this.scoreBoards[1].x = 432 - 32 - 32 - 14; // 數字寬 32 像素，一個計分板有兩個數字
    this.scoreBoards[1].y = 10;

    this.shadows.forPlayer1.y = 273;
    this.shadows.forPlayer2.y = 273;
    this.shadows.forBall.y = 273;

    this.initializeVisibles();

    // 雲和浪的 model。
    // 它不受玩家輸入影響、只用來畫，所以放在 view 裡，不放在 controller。
    this.cloudArray = [];
    for (let i = 0; i < NUM_OF_CLOUDS; i++) {
      this.cloudArray.push(new Cloud());
    }
    this.wave = new Wave();
  }

  get visible(): boolean {
    return this.container.visible;
  }

  set visible(bool: boolean) {
    this.container.visible = bool;

    // 關掉畫面時
    if (bool === false) {
      this.initializeVisibles();
    }
  }

  initializeVisibles(): void {
    for (const prop in this.messages) {
      this.messages[prop as keyof GameMessages].visible = false;
    }
  }

  /** 畫出物理物件裡的角色和球 */
  drawPlayersAndBall(physics: Physics): void {
    const player1 = physics.player1;
    const player2 = physics.player2;
    const ball = physics.ball;

    // 角色換了就換圖
    if (this.player1Character !== player1.character) {
      this.player1.textures = this.playerTextureArrays[player1.character];
      this.player1Character = player1.character;
    }
    if (this.player2Character !== player2.character) {
      this.player2.textures = this.playerTextureArrays[player2.character];
      this.player2Character = player2.character;
    }

    this.player1.x = player1.x;
    this.player1.y = player1.y;
    if (player1.state === 3 || player1.state === 4) {
      this.player1.scale.x = player1.divingDirection === -1 ? -1 : 1;
    } else {
      this.player1.scale.x = 1;
    }
    this.shadows.forPlayer1.x = player1.x;

    this.player2.x = player2.x;
    this.player2.y = player2.y;
    if (player2.state === 3 || player2.state === 4) {
      this.player2.scale.x = player2.divingDirection === 1 ? 1 : -1;
    } else {
      this.player2.scale.x = -1;
    }
    this.shadows.forPlayer2.x = player2.x;

    // 只有 state 不是數字時才會是 undefined（原作同樣直接傳給 gotoAndStop）
    const frameNumber1 = getFrameNumberForPlayerAnimatedSprite(
      player1.state,
      player1.frameNumber,
    ) as number;
    const frameNumber2 = getFrameNumberForPlayerAnimatedSprite(
      player2.state,
      player2.frameNumber,
    ) as number;
    this.player1.gotoAndStop(frameNumber1);
    this.player2.gotoAndStop(frameNumber2);

    // 水伊布衝刺拖影
    // （AnimatedSprite.textures 的 getter 型別含 FrameObject[]，但我們設的一律是 Texture[]）
    for (let i = 0; i < 2; i++) {
      const tr1 = this.p1Trails[i];
      const tr2 = this.p2Trails[i];
      if (player1.isDashing && player1.dashTrailX.length > i) {
        tr1.texture = (this.player1.textures as Texture[])[frameNumber1];
        tr1.x = player1.dashTrailX[i];
        tr1.y = player1.dashTrailY[i];
        tr1.scale.x = this.player1.scale.x;
        tr1.alpha = 0.3 - i * 0.1;
        tr1.visible = true;
      } else {
        tr1.visible = false;
        tr1.alpha = 0;
      }
      if (player2.isDashing && player2.dashTrailX.length > i) {
        tr2.texture = (this.player2.textures as Texture[])[frameNumber2];
        tr2.x = player2.dashTrailX[i];
        tr2.y = player2.dashTrailY[i];
        tr2.scale.x = this.player2.scale.x;
        tr2.alpha = 0.3 - i * 0.1;
        tr2.visible = true;
      } else {
        tr2.visible = false;
        tr2.alpha = 0;
      }
    }

    this.ball.x = ball.x;
    this.ball.y = ball.y;
    this.shadows.forBall.x = ball.x;
    this.ball.gotoAndStop(ball.rotation);

    // 擊球特效，參考 FUN_00402ee0
    if (ball.punchEffectRadius > 0) {
      ball.punchEffectRadius -= 2;
      this.punch.width = 2 * ball.punchEffectRadius;
      this.punch.height = 2 * ball.punchEffectRadius;
      this.punch.x = ball.punchEffectX;
      this.punch.y = ball.punchEffectY;
      this.punch.visible = true;
    } else {
      this.punch.visible = false;
    }

    if (ball.isPowerHit === true) {
      this.ballHyper.x = ball.previousX;
      this.ballHyper.y = ball.previousY;
      this.ballTrail.x = ball.previousPreviousX;
      this.ballTrail.y = ball.previousPreviousY;

      this.ballHyper.visible = true;
      this.ballTrail.visible = true;
    } else {
      this.ballHyper.visible = false;
      this.ballTrail.visible = false;
    }

    // 外掛（特效、技能、黃金球…）在這之後畫自己的東西
    hooks.drawBall.run(this, physics);
  }

  /**
   * 把分數畫到計分板
   * @param scores [0] 是 1P 的分數，[1] 是 2P 的分數
   */
  drawScoresToScoreBoards(scores: number[]): void {
    for (let i = 0; i < 2; i++) {
      const scoreBoard = this.scoreBoards[i];
      const score = scores[i];
      // 計分板的兩個子物件都是 AnimatedSprite（見 makeScoreBoardSprite）
      const unitsAnimatedSprite = scoreBoard.getChildAt(0) as AnimatedSprite;
      const tensAnimatedSprite = scoreBoard.getChildAt(1) as AnimatedSprite;
      unitsAnimatedSprite.gotoAndStop(score % 10);
      tensAnimatedSprite.gotoAndStop(Math.floor(score / 10) % 10);
      if (score >= 10) {
        tensAnimatedSprite.visible = true;
      } else {
        tensAnimatedSprite.visible = false;
      }
    }
  }

  /** 畫雲和浪 */
  drawCloudsAndWave(): void {
    const cloudArray = this.cloudArray;
    const wave = this.wave;

    cloudAndWaveEngine(cloudArray, wave);

    for (let i = 0; i < NUM_OF_CLOUDS; i++) {
      const cloud = cloudArray[i];
      // 子物件都是 Sprite（見 makeCloudContainer）
      const cloudSprite = this.cloudContainer.getChildAt(i) as Sprite;
      cloudSprite.x = cloud.spriteTopLeftPointX;
      cloudSprite.y = cloud.spriteTopLeftPointY;
      cloudSprite.width = cloud.spriteWidth;
      cloudSprite.height = cloud.spriteHeight;
    }

    for (let i = 0; i < 432 / 16; i++) {
      const waveSprite = this.waveContainer.getChildAt(i);
      waveSprite.y = wave.yCoords[i];
    }
  }

  /**
   * 參考 FUN_00403f20
   * 隨著幀數畫「比賽開始」字樣
   * @param frameCounter 目前的幀數
   * @param frameTotal 這段字樣的總幀數
   */
  drawGameStartMessage(frameCounter: number, frameTotal: number): void {
    if (frameCounter === 0) {
      this.messages.gameStart.visible = true;
    } else if (frameCounter >= frameTotal - 1) {
      this.messages.gameStart.visible = false;
      return;
    }

    const gameStartMessage = this.messages.gameStart;
    const w = gameStartMessage.texture.width; // 字樣貼圖寬
    const h = gameStartMessage.texture.height; // 字樣貼圖高
    const halfWidth = Math.floor((w * frameCounter) / 50);
    const halfHeight = Math.floor((h * frameCounter) / 50);
    gameStartMessage.x = 216 - halfWidth;
    gameStartMessage.y = 50 + 2 * halfHeight;
    gameStartMessage.width = 2 * halfWidth;
    gameStartMessage.height = 2 * halfHeight;
  }

  /** 顯示／隱藏「Ready」字樣 */
  drawReadyMessage(bool: boolean): void {
    this.messages.ready.visible = bool;
  }

  /** 切換「Ready」字樣：開著就關，關著就開 */
  toggleReadyMessage(): void {
    this.messages.ready.visible = !this.messages.ready.visible;
  }

  /**
   * 參考 FUN_00404070
   * 隨著幀數畫「比賽結束」字樣
   */
  drawGameEndMessage(frameCounter: number): void {
    const gameEndMessage = this.messages.gameEnd;
    const w = gameEndMessage.texture.width; // 字樣貼圖寬
    const h = gameEndMessage.texture.height; // 字樣貼圖高

    if (frameCounter === 0) {
      gameEndMessage.visible = true;
    }
    if (frameCounter < 50) {
      const halfWidthIncrement = 2 * Math.floor(((50 - frameCounter) * w) / 50);
      const halfHeightIncrement =
        2 * Math.floor(((50 - frameCounter) * h) / 50);

      gameEndMessage.x = 216 - w / 2 - halfWidthIncrement;
      gameEndMessage.y = 50 - halfHeightIncrement;
      gameEndMessage.width = w + 2 * halfWidthIncrement;
      gameEndMessage.height = h + 2 * halfHeightIncrement;
    } else {
      gameEndMessage.x = 216 - w / 2;
      gameEndMessage.y = 50;
      gameEndMessage.width = w;
      gameEndMessage.height = h;
    }
  }
}

/**
 * 淡入淡出效果
 */
export class FadeInOut implements IFadeInOut {
  declare black: Sprite;

  constructor(resources: Resources) {
    const textures = texturesOf(resources, ASSETS_PATH.SPRITE_SHEET);
    this.black = makeSpriteWithAnchorXY(textures, TEXTURES.BLACK, 0, 0);
    this.black.width = 432;
    this.black.height = 304;
    this.black.x = 0;
    this.black.y = 0;
    this.black.alpha = 1;
  }

  get visible(): boolean {
    return this.black.visible;
  }

  set visible(bool: boolean) {
    this.black.visible = bool;
  }

  /**
   * 設定黑幕的透明度
   * @param alpha [0, 1]
   */
  setBlackAlphaTo(alpha: number): void {
    this.black.alpha = alpha;
    if (this.black.alpha === 0) {
      this.black.visible = false;
    } else {
      this.black.visible = true;
    }
  }

  /**
   * 增減黑幕的透明度
   * @param alphaIncrement > 0：淡出，否則淡入
   */
  changeBlackAlphaBy(alphaIncrement: number): void {
    if (alphaIncrement >= 0) {
      this.black.alpha = Math.min(1, this.black.alpha + alphaIncrement);
    } else {
      this.black.alpha = Math.max(0, this.black.alpha + alphaIncrement);
    }
    if (this.black.alpha === 0) {
      this.black.visible = false;
    } else {
      this.black.visible = true;
    }
  }
}

/** 做出坐著的皮卡丘背景磚 */
function makeSittingPikachuTilesContainer(textures: TextureDict): Container {
  const container = new Container();
  const texture = textures[TEXTURES.SITTING_PIKACHU];
  const w = texture.width;
  const h = texture.height;

  let tile;
  for (let j = 0; j < Math.floor(304 / h) + 2; j++) {
    for (let i = 0; i < Math.floor(432 / w) + 2; i++) {
      tile = new Sprite(texture);
      addChildToParentAndSetLocalPosition(container, tile, w * i, h * j);
    }
  }

  return container;
}

/** 做出背景 */
function makeBGContainer(textures: TextureDict): Container {
  const bgContainer = new Container();

  // 天空
  let tile;
  let texture = textures[TEXTURES.SKY_BLUE];
  for (let j = 0; j < 12; j++) {
    for (let i = 0; i < 432 / 16; i++) {
      tile = new Sprite(texture);
      addChildToParentAndSetLocalPosition(bgContainer, tile, 16 * i, 16 * j);
    }
  }

  // 山
  texture = textures[TEXTURES.MOUNTAIN];
  tile = new Sprite(texture);
  addChildToParentAndSetLocalPosition(bgContainer, tile, 0, 188);

  // 紅色地面
  texture = textures[TEXTURES.GROUND_RED];
  for (let i = 0; i < 432 / 16; i++) {
    tile = new Sprite(texture);
    addChildToParentAndSetLocalPosition(bgContainer, tile, 16 * i, 248);
  }

  // 地面的線
  texture = textures[TEXTURES.GROUND_LINE];
  for (let i = 1; i < 432 / 16 - 1; i++) {
    tile = new Sprite(texture);
    addChildToParentAndSetLocalPosition(bgContainer, tile, 16 * i, 264);
  }
  texture = textures[TEXTURES.GROUND_LINE_LEFT_MOST];
  tile = new Sprite(texture);
  addChildToParentAndSetLocalPosition(bgContainer, tile, 0, 264);
  texture = textures[TEXTURES.GROUND_LINE_RIGHT_MOST];
  tile = new Sprite(texture);
  addChildToParentAndSetLocalPosition(bgContainer, tile, 432 - 16, 264);

  // 黃色地面
  texture = textures[TEXTURES.GROUND_YELLOW];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 432 / 16; i++) {
      tile = new Sprite(texture);
      addChildToParentAndSetLocalPosition(
        bgContainer,
        tile,
        16 * i,
        280 + 16 * j,
      );
    }
  }

  // 網柱
  texture = textures[TEXTURES.NET_PILLAR_TOP];
  tile = new Sprite(texture);
  addChildToParentAndSetLocalPosition(bgContainer, tile, 213, 176);
  texture = textures[TEXTURES.NET_PILLAR];
  for (let j = 0; j < 12; j++) {
    tile = new Sprite(texture);
    addChildToParentAndSetLocalPosition(bgContainer, tile, 213, 184 + 8 * j);
  }

  return bgContainer;
}

/**
 * 某隻角色的動作圖陣列（這個專案加的）。
 * 每個動作的格數：動作 3 有 2 格、動作 4 有 1 格，其他都是 5 格。
 */
function makePlayerTextureArray(textures: TextureDict, path: (i: number, j: number) => string): Texture[] {
  const arr: Texture[] = [];
  for (let i = 0; i < 7; i++) {
    const n = i === 3 ? 2 : i === 4 ? 1 : 5;
    for (let j = 0; j < n; j++) arr.push(textures[path(i, j)]);
  }
  return arr;
}

/**
 * 做出兩位角色的 AnimatedSprite（一開始都是皮卡丘的圖）
 * @return [0] 給 1P，[1] 給 2P
 */
function makePlayerAnimatedSprites(textures: TextureDict): [AnimatedSprite, AnimatedSprite] {
  const getPlayerTexture = (i: number, j: number): Texture => textures[TEXTURES.PIKACHU(i, j)];
  const playerTextureArray: Texture[] = [];
  for (let i = 0; i < 7; i++) {
    if (i === 3) {
      playerTextureArray.push(getPlayerTexture(i, 0));
      playerTextureArray.push(getPlayerTexture(i, 1));
    } else if (i === 4) {
      playerTextureArray.push(getPlayerTexture(i, 0));
    } else {
      for (let j = 0; j < 5; j++) {
        playerTextureArray.push(getPlayerTexture(i, j));
      }
    }
  }
  const player1AnimatedSprite = new AnimatedSprite(playerTextureArray, false);
  const player2AnimatedSprite = new AnimatedSprite(playerTextureArray, false);

  player1AnimatedSprite.anchor.x = 0.5;
  player1AnimatedSprite.anchor.y = 0.5;
  player2AnimatedSprite.anchor.x = 0.5;
  player2AnimatedSprite.anchor.y = 0.5;

  return [player1AnimatedSprite, player2AnimatedSprite];
}

/** 做出球的 AnimatedSprite */
function makeBallAnimatedSprites(textures: TextureDict): AnimatedSprite {
  const getBallTexture = (s: number | string): Texture => textures[TEXTURES.BALL(s)];
  const ballTextureArray = [
    getBallTexture(0),
    getBallTexture(1),
    getBallTexture(2),
    getBallTexture(3),
    getBallTexture(4),
    getBallTexture('hyper'),
  ];
  const ballAnimatedSprite = new AnimatedSprite(ballTextureArray, false);

  ballAnimatedSprite.anchor.x = 0.5;
  ballAnimatedSprite.anchor.y = 0.5;

  return ballAnimatedSprite;
}

/**
 * 用指定路徑的貼圖做 sprite，並設定 anchor
 * @param anchorX anchor.x，[0, 1]
 * @param anchorY anchor.y，[0, 1]
 */
function makeSpriteWithAnchorXY(textures: TextureDict, path: string, anchorX: number, anchorY: number): Sprite {
  const sprite = new Sprite(textures[path]);
  sprite.anchor.x = anchorX;
  sprite.anchor.y = anchorY;
  return sprite;
}

/**
 * 做出計分板
 * @return 子物件 index 0 是個位數，index 1 是十位數
 */
function makeScoreBoardSprite(textures: TextureDict): Container {
  const getNumberTexture = (n: number): Texture => textures[TEXTURES.NUMBER(n)];
  const numberTextureArray: Texture[] = [];
  for (let i = 0; i < 10; i++) {
    numberTextureArray.push(getNumberTexture(i));
  }
  const numberAnimatedSprites: [AnimatedSprite, AnimatedSprite] = [
    new AnimatedSprite(numberTextureArray, false),
    new AnimatedSprite(numberTextureArray, false),
  ];

  const scoreBoard = new Container();
  addChildToParentAndSetLocalPosition(
    scoreBoard,
    numberAnimatedSprites[0],
    32,
    0,
  ); // 個位數
  addChildToParentAndSetLocalPosition(
    scoreBoard,
    numberAnimatedSprites[1],
    0,
    0,
  ); // 十位數

  scoreBoard.setChildIndex(numberAnimatedSprites[0], 0); // 個位數
  scoreBoard.setChildIndex(numberAnimatedSprites[1], 1); // 十位數

  return scoreBoard;
}

/** 做出放雲的容器 */
function makeCloudContainer(textures: TextureDict): Container {
  const cloudContainer = new Container();
  const texture = textures[TEXTURES.CLOUD];
  for (let i = 0; i < NUM_OF_CLOUDS; i++) {
    const cloud = new Sprite(texture);
    cloud.anchor.x = 0;
    cloud.anchor.y = 0;
    cloudContainer.addChild(cloud);
  }

  return cloudContainer;
}

/** 做出放浪的容器 */
function makeWaveContainer(textures: TextureDict): Container {
  const waveContainer = new Container();
  const texture = textures[TEXTURES.WAVE];
  for (let i = 0; i < 432 / 16; i++) {
    const tile = new Sprite(texture);
    addChildToParentAndSetLocalPosition(waveContainer, tile, 16 * i, 0);
  }

  return waveContainer;
}

/** 把子物件加進父容器，並設定在父容器裡的位置 */
function addChildToParentAndSetLocalPosition(parent: Container, child: Sprite, x: number, y: number): void {
  parent.addChild(child);
  child.anchor.x = 0;
  child.anchor.y = 0;
  child.x = x;
  child.y = y;
}

/**
 * 角色狀態對應到 AnimatedSprite 的第幾格
 *
 * 動作 0、1、2 各 5 格；動作 3 有 2 格；動作 4 有 1 格；動作 5、6 各 5 格。
 */
function getFrameNumberForPlayerAnimatedSprite(state: number, frameNumber: number): number | undefined {
  if (state < 4) {
    return 5 * state + frameNumber;
  } else if (state === 4) {
    return 17 + frameNumber;
  } else if (state > 4) {
    return 18 + 5 * (state - 5) + frameNumber;
  }
  return undefined;
}
