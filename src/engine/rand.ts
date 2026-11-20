/**
 * 遊戲用的亂數產生器（原作 rand.js）。
 *
 * 物理引擎（physics.ts）和雲／浪（cloud-and-wave.ts）的亂數都從這裡來。
 * 逐幀比對測試時用 `setCustomRng()` 換成固定種子的產生器。
 */

/** 回傳 [0, 1) 之間亂數的函式。 */
export type RNG = () => number;

/** 自訂的亂數產生器；null 時用 Math.random。 */
let customRng: RNG | null = null;

/**
 * 回傳 [0, 32767] 之間的整數。
 *
 * 原作的機器碼用的是 Visual Studio 1988 函式庫的 `_rand()`，確切做法不明，
 * 這裡照 Visual Studio 2017 的 rand() 產生 [0, 32767] 的整數。
 * 預設用 `Math.random`；設定了自訂產生器就改用它。
 */
export function rand(): number {
  if (customRng === null) {
    return Math.floor(32768 * Math.random());
  }
  return Math.floor(32768 * customRng());
}

/** 設定自訂的亂數產生器（傳 null 恢復成 Math.random）。 */
export function setCustomRng(rng: RNG | null): void {
  customRng = rng;
}
