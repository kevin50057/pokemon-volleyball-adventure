/**
 * 遠征的亂數（SPEC §4.2）：由 runSeed + rngVersion + nodeId + purpose 決定，各用途互不影響。
 * 同一個 seed、同樣的選擇，重新讀檔後得到的路線、卡牌、捕獲結果一樣。
 *
 * 不碰全域 Math.random（比賽中的物理、技能、AI 照舊用它）。
 * 改了這裡的算法要把 types.ts 的 RNG_VERSION 加一。
 */
import { RNG_VERSION } from './types';

/** 字串 → 4 個 32 位元整數（cyrb128） */
function hash128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32：回傳 [0, 1) */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export type Purpose = 'route' | 'cards' | 'capture' | 'event';

export interface Rng {
  next(): number;
  /** [0, n) 的整數 */
  int(n: number): number;
  pick<T>(arr: readonly T[]): T;
}

export function rngFor(seed: string, nodeId: string, purpose: Purpose, rngVersion = RNG_VERSION): Rng {
  const h = hash128(seed + '|' + rngVersion + '|' + nodeId + '|' + purpose);
  const f = sfc32(h[0], h[1], h[2], h[3]);
  for (let i = 0; i < 12; i++) f();   // 丟掉開頭幾個，讓相近的種子拉開
  return {
    next: f,
    int: (n) => Math.floor(f() * n),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
  };
}

/** 新一輪的種子：用瀏覽器的密碼學亂數，不用 Math.random。 */
export function newSeed(): string {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(8, '0')).join('');
}
