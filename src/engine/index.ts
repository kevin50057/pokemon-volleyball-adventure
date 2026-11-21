/**
 * 遊戲本體的進入點（原作 main.js）。
 *
 * 原作是皮卡丘打排球（1997 (C) SACHI SOFT / SAWAYAKAN Programmers、1997 (C) Satoshi Takenouchi）
 * 的網頁版，由 Kyutae Lee（gorisanson/pikachu-volleyball）逆向工程而來，分成 MVC 三部分：
 *  1) physics.ts（Model）：球和角色的物理引擎，逆向工程原作機器碼得到。
 *  2) view.ts（View）：用 pixi.js 畫畫面，部分程式碼也是逆向工程得到。
 *  3) controller.ts（Controller）：依玩家輸入控制 Model 和 View，讓遊戲動起來。
 * 其他檔案：
 *  - cloud-and-wave.ts：雲和浪的運動（也是 Model，也是逆向工程得到），由 view.ts 畫出來。
 *  - keyboard.ts：鍵盤輸入。
 *  - audio.ts：音效（使用 @pixi/sound）。
 *  - rand.ts：物理引擎和雲／浪用的亂數。
 *  - assets.ts：資源（圖檔、音效）路徑。
 *  - ui.ts：網頁介面（選單列、按鈕等）。
 *  - dark-color-scheme.ts：深色模式開關。
 *
 * import 時沒有副作用（第三方套件自己的註冊除外：@pixi/canvas-display 會擴充 Container、
 * @pixi/sound 會註冊載入器外掛，跟原作一樣）；原作 main.js 載入當下做的事都在 startEngine() 裡。
 */
import { settings } from '@pixi/settings';
import { SCALE_MODES } from '@pixi/constants';
import { Renderer, BatchRenderer, autoDetectRenderer } from '@pixi/core';
import { Prepare } from '@pixi/prepare';
import { Container } from '@pixi/display';
import { Loader } from '@pixi/loaders';
import { SpritesheetLoader } from '@pixi/spritesheet';
import { Ticker } from '@pixi/ticker';
import { CanvasRenderer } from '@pixi/canvas-renderer';
import { CanvasSpriteRenderer } from '@pixi/canvas-sprite';
import { CanvasPrepare } from '@pixi/canvas-prepare';
import '@pixi/canvas-display';
import { PikachuVolleyball } from './controller';
import { ASSETS_PATH } from './assets';
import { setUpUI, byId } from './ui';
import { setMouseDashRequest } from './keyboard';
import { setUpDarkColorSchemeCheckbox } from './dark-color-scheme';
import { setReady } from '../core/services';

export { rand, setCustomRng } from './rand';
export type { RNG } from './rand';
export { setMouseDashRequest } from './keyboard';
export { GROUND_HALF_WIDTH } from './physics';
export { ASSETS_PATH } from './assets';
export { PikachuVolleyball } from './controller';

/** 滑鼠在畫面上快速點兩下的間隔（毫秒） */
const MOUSE_DOUBLE_CLICK_MS = 300;

/**
 * 啟動遊戲本體：註冊 Pixi 外掛、建立 renderer，等使用者按「開始」再載入資源、建控制器、
 * 設定介面並開始跑 ticker。
 */
export function startEngine(): void {
  // Renderer.registerPlugin 的用法參考：
  // https://github.com/pixijs/pixijs/blob/af3c0c6bb15aeb1049178c972e4a14bb4cabfce4/bundles/pixi.js/src/index.ts#L27-L34
  Renderer.registerPlugin('prepare', Prepare);
  Renderer.registerPlugin('batch', BatchRenderer);
  // CanvasRenderer.registerPlugin 的用法參考：
  // https://github.com/pixijs/pixijs/blob/af3c0c6bb15aeb1049178c972e4a14bb4cabfce4/bundles/pixi.js-legacy/src/index.ts#L13-L19
  CanvasRenderer.registerPlugin('prepare', CanvasPrepare);
  CanvasRenderer.registerPlugin('sprite', CanvasSpriteRenderer);
  Loader.registerPlugin(SpritesheetLoader);

  // settings.RESOLUTION 設成 2 而不是 1：「soft」畫質用的是 'image-rendering: auto'（類似雙線性內插），
  // 解析度 1 的話畫面會太糊。
  settings.RESOLUTION = 2;
  settings.SCALE_MODE = SCALE_MODES.NEAREST;
  settings.ROUND_PIXELS = true;

  const renderer = autoDetectRenderer({
    width: 432,
    height: 304,
    antialias: false,
    backgroundColor: 0x000000,
    backgroundAlpha: 1,
    // 為了相容性只用 Canvas。曾有玩家回報在 pixi 選了 WebGL 的瀏覽器上畫面不正常，
    // 改用 Canvas 就好了；測試時也不用在 WebGL 和 Canvas 之間切換。
    forceCanvas: true,
  });

  const stage = new Container();
  const ticker = new Ticker();
  const loader = new Loader();

  renderer.view.setAttribute('id', 'game-canvas');
  byId('game-canvas-container').appendChild(renderer.view);
  setUpMouseDash(renderer.view);
  renderer.render(stage); // 讓 Firefox 一開始的畫布顯示穩定

  loader.add(ASSETS_PATH.SPRITE_SHEET);
  loader.add(ASSETS_PATH.BIRD_SHEET);
  loader.add(ASSETS_PATH.VAPOREON_SHEET);
  loader.add(ASSETS_PATH.FLAREON_SHEET);
  loader.add(ASSETS_PATH.JOLTEON_SHEET);
  loader.add(ASSETS_PATH.GENGAR_SHEET);
  loader.add(ASSETS_PATH.MEOWTH_SHEET);
  loader.add(ASSETS_PATH.SNORLAX_SHEET);
  loader.add(ASSETS_PATH.MEWTWO_SHEET);
  loader.add(ASSETS_PATH.ELECTRODE_SHEET);
  loader.add(ASSETS_PATH.WOBBUFFET_SHEET);
  loader.add(ASSETS_PATH.DITTO_SHEET);
  loader.add(ASSETS_PATH.MRMIME_SHEET);
  loader.add(ASSETS_PATH.DUGTRIO_SHEET);
  loader.add(ASSETS_PATH.FARFETCHD_SHEET);
  loader.add(ASSETS_PATH.PSYDUCK_SHEET);
  loader.add(ASSETS_PATH.MAGIKARP_SHEET);
  loader.add(ASSETS_PATH.JIGGLYPUFF_SHEET);
  loader.add(ASSETS_PATH.DRAGONITE_SHEET);
  loader.add(ASSETS_PATH.MEW_SHEET);
  loader.add(ASSETS_PATH.CHARMANDER_SHEET);
  loader.add(ASSETS_PATH.UMBREON_SHEET);
  loader.add(ASSETS_PATH.BULBASAUR_SHEET);
  loader.add(ASSETS_PATH.SQUIRTLE_SHEET);
  for (const prop in ASSETS_PATH.SOUNDS) {
    loader.add(ASSETS_PATH.SOUNDS[prop]);
  }

  /**
   * 建好遊戲和完整的介面，開始遊戲（資源載入完成後由 loader 呼叫）。
   */
  const setup = (): void => {
    const pikaVolley = new PikachuVolleyball(stage, loader.resources);
    setUpUI(pikaVolley, ticker);
    start(pikaVolley);
    // 通知外掛遊戲本體好了（舊版 window._pv = {ctrl, stage}，外掛用 setInterval 輪詢，
    // 實際上一定是在介面設定好、ticker 開始之後才拿到；所以這裡放在最後）
    setReady(pikaVolley, stage);
  };

  /** 開始遊戲 */
  const start = (pikaVolley: PikachuVolleyball): void => {
    ticker.maxFPS = pikaVolley.normalFPS;
    ticker.add(() => {
      pikaVolley.gameLoop();
      renderer.render(stage);
    });
    ticker.start();
  };

  setUpInitialUI(loader, setup);
  setUpDarkColorSchemeCheckbox();
}

/**
 * 在畫面上快速點兩下滑鼠：左鍵 = 往左衝刺，右鍵 = 往右衝刺（這個專案加的）。
 * 右鍵選單關掉。
 */
function setUpMouseDash(canvas: HTMLCanvasElement): void {
  let lastLeftClick = 0;
  let lastRightClick = 0;
  canvas.addEventListener('mousedown', (ev) => {
    const now = Date.now();
    if (ev.button === 0) {
      if (now - lastLeftClick < MOUSE_DOUBLE_CLICK_MS) {
        setMouseDashRequest(-1);
      }
      lastLeftClick = now;
    } else if (ev.button === 2) {
      if (now - lastRightClick < MOUSE_DOUBLE_CLICK_MS) {
        setMouseDashRequest(1);
      }
      lastRightClick = now;
    }
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

/**
 * 設定一開始的介面：按「開始」（或關閉說明）才開始載入資源。
 */
function setUpInitialUI(loader: Loader, setup: () => void): void {
  const loadingBox = byId('loading-box');
  const progressBar = byId('progress-bar');
  loader.onProgress.add(() => {
    progressBar.style.width = `${loader.progress}%`;
  });
  loader.onComplete.add(() => {
    loadingBox.classList.add('hidden');
  });

  const aboutBox = byId('about-box');
  const aboutBtn = byId<HTMLButtonElement>('about-btn');
  const closeAboutBtn = byId('close-about-btn');
  const gameDropdownBtn = byId<HTMLButtonElement>('game-dropdown-btn');
  const optionsDropdownBtn = byId<HTMLButtonElement>('options-dropdown-btn');
  gameDropdownBtn.disabled = true;
  optionsDropdownBtn.disabled = true;
  const closeAboutBox = (): void => {
    if (!aboutBox.classList.contains('hidden')) {
      aboutBox.classList.add('hidden');
      aboutBtn.disabled = true;
    }
    aboutBtn.getElementsByClassName('text-play')[0].classList.add('hidden');
    aboutBtn.getElementsByClassName('text-about')[0].classList.remove('hidden');
    aboutBtn.classList.remove('glow');
    closeAboutBtn
      .getElementsByClassName('text-play')[0]
      .classList.add('hidden');
    closeAboutBtn
      .getElementsByClassName('text-close')[0]
      .classList.remove('hidden');
    closeAboutBtn.classList.remove('glow');

    loader.load(setup); // 載入完成後呼叫 setup
    loadingBox.classList.remove('hidden');
    aboutBtn.removeEventListener('click', closeAboutBox);
    closeAboutBtn.removeEventListener('click', closeAboutBox);
  };
  aboutBtn.addEventListener('click', closeAboutBox);
  closeAboutBtn.addEventListener('click', closeAboutBox);
}
