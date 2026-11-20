/**
 * 天上的雲和畫面下方的浪的運動（原作 cloud_and_wave.js）。
 * 也是 MVC 的 Model，由 view.ts 畫出來。
 *
 * 一樣是逆向工程的結果，註解裡標了原作函式的位址，例如 FUN_00404770。
 * 注意：這裡每幀都會呼叫 rand()，呼叫次數和順序不能改（逐幀比對要用）。
 */
import { rand } from './rand';

/** 一朵雲 */
export class Cloud {
  declare topLeftPointX: number;
  declare topLeftPointY: number;
  declare topLeftPointXVelocity: number;
  declare sizeDiffTurnNumber: number;

  constructor() {
    this.topLeftPointX = -68 + (rand() % (432 + 68));
    this.topLeftPointY = rand() % 152;
    this.topLeftPointXVelocity = 1 + (rand() % 2);
    this.sizeDiffTurnNumber = rand() % 11;
  }

  get sizeDiff(): number {
    // 等同於 return [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0][this.sizeDiffTurnNumber]
    return 5 - Math.abs(this.sizeDiffTurnNumber - 5);
  }

  get spriteTopLeftPointX(): number {
    return this.topLeftPointX - this.sizeDiff;
  }

  get spriteTopLeftPointY(): number {
    return this.topLeftPointY - this.sizeDiff;
  }

  get spriteWidth(): number {
    return 48 + 2 * this.sizeDiff;
  }

  get spriteHeight(): number {
    return 24 + 2 * this.sizeDiff;
  }
}

/** 浪 */
export class Wave {
  declare verticalCoord: number;
  declare verticalCoordVelocity: number;
  declare yCoords: number[];

  constructor() {
    this.verticalCoord = 0;
    this.verticalCoordVelocity = 2;
    this.yCoords = [];
    for (let i = 0; i < 432 / 16; i++) {
      this.yCoords.push(314);
    }
  }
}

/**
 * FUN_00404770
 * 移動雲和浪
 */
export function cloudAndWaveEngine(cloudArray: Cloud[], wave: Wave): void {
  for (let i = 0; i < 10; i++) {
    cloudArray[i].topLeftPointX += cloudArray[i].topLeftPointXVelocity;
    if (cloudArray[i].topLeftPointX > 432) {
      cloudArray[i].topLeftPointX = -68;
      cloudArray[i].topLeftPointY = rand() % 152;
      cloudArray[i].topLeftPointXVelocity = 1 + (rand() % 2);
    }
    cloudArray[i].sizeDiffTurnNumber =
      (cloudArray[i].sizeDiffTurnNumber + 1) % 11;
  }

  wave.verticalCoord += wave.verticalCoordVelocity;
  if (wave.verticalCoord > 32) {
    wave.verticalCoord = 32;
    wave.verticalCoordVelocity = -1;
  } else if (wave.verticalCoord < 0 && wave.verticalCoordVelocity < 0) {
    wave.verticalCoordVelocity = 2;
    wave.verticalCoord = -(rand() % 40);
  }

  for (let i = 0; i < 432 / 16; i++) {
    wave.yCoords[i] = 314 - wave.verticalCoord + (rand() % 3);
  }
}
