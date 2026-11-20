/**
 * 遊戲本體留給外掛的掛勾。
 *
 * 舊版是每個外掛把 `window._pvTick` 之類的函式「包一層」：後載入的包在外面。
 * 這裡改成明確的中介層鏈：`use()` 後註冊的在外層，先執行；每一層自己決定要不要呼叫 `next()`。
 * 外掛的載入順序（src/main.ts）決定了鏈的順序，必須跟舊版一致：
 *   技能 abilities → 特效 juice → 連線 netplay → 闖關 campaign（最外層）
 */
import type { Ball, Controller, GameView, Keyboard, Physics, Player, UserInput } from './types';

type Middleware<A extends unknown[], R> = (next: (...args: A) => R, ...args: A) => R;

export class Chain<A extends unknown[], R> {
  private layers: Middleware<A, R>[] = [];
  constructor(private base: (...args: A) => R) {}
  /** 設定最裡面那一層（遊戲本體原本的行為）。 */
  setBase(base: (...args: A) => R): void { this.base = base; }
  /** 加一層；後加的在外層。回傳移除這一層的函式。 */
  use(layer: Middleware<A, R>): () => void {
    this.layers.push(layer);
    return () => { this.layers = this.layers.filter((l) => l !== layer); };
  }
  run(...args: A): R {
    const layers = this.layers;
    const call = (i: number, ...a: A): R =>
      i < 0 ? this.base(...a) : layers[i]((...b: A) => call(i - 1, ...b), ...a);
    return call(layers.length - 1, ...args);
  }
  get size(): number { return this.layers.length; }
}

export const hooks = {
  /**
   * 每幀讀完按鍵、跑狀態機之前。回傳 `false` 表示這一幀不要跑遊戲本體（擊球停格、連線客機只負責畫…）。
   * 對應舊版 `window._pvTick`。
   */
  tick: new Chain<[Controller], boolean | void>(() => undefined),
  /** 有人得分時，這一球算幾分。對應舊版 `window._pvScore`。 */
  score: new Chain<[Controller, 0 | 1], number>(() => 1),
  /**
   * 電腦（含原作 AI）決定好這一幀的按鍵之後，可以再修正。只有 `player.isComputer` 時才會被呼叫。
   * 對應舊版 `window._pvAI`。
   */
  ai: new Chain<[Player, Ball, Player, UserInput], void>(() => undefined),
  /** 遊戲本體畫完角色和球之後。對應舊版 `window._pvDrawBall`。 */
  drawBall: new Chain<[GameView, Physics], void>(() => undefined),
  /**
   * 包住整個 gameLoop（舊版是直接改寫 `ctrl.gameLoop`）。
   * 引擎用 `setBase` 把原本的 gameLoop 接在最裡面；ticker 每幀呼叫 `hooks.gameLoop.run(ctrl)`。
   */
  gameLoop: new Chain<[Controller], void>(() => undefined),
  /** 包住 playSoundEffect（引擎同樣用 `setBase` 接上原本的實作）。 */
  playSoundEffect: new Chain<[Controller], void>(() => undefined),
  /** 每組鍵盤讀完按鍵之後（觸控輔助用）。index 0 = 左邊那組。 */
  afterInput: new Chain<[Controller, Keyboard, 0 | 1], void>(() => undefined),
};

export type Hooks = typeof hooks;

