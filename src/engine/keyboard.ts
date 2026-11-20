/**
 * 鍵盤輸入（原作 keyboard.js）。
 *
 * 這個專案加的：衝刺請求 `dashRequest`
 *  - 250ms 內連按兩下左／右 → -1／1
 *  - 在畫面上快速點兩下滑鼠左鍵／右鍵（index.ts 設定）→ -1／1，由下一個讀按鍵的鍵盤（1P 先讀）接收
 */
import { PikaUserInput } from './physics';
import type { Keyboard, KeyState } from '../core/types';

/** 連按兩下方向鍵算衝刺的時間間隔（毫秒） */
const DOUBLE_TAP_MS = 250;

/**
 * 滑鼠雙擊送出的衝刺請求（舊版 window._mouseDashRequest）。
 * 下一次 getInput() 讀到後就清成 0。
 */
let mouseDashRequest = 0;

/** 滑鼠雙擊時呼叫（-1 左、1 右）。 */
export function setMouseDashRequest(direction: number): void {
  mouseDashRequest = direction;
}

/**
 * 控制一位角色的鍵盤
 */
export class PikaKeyboard extends PikaUserInput implements Keyboard {
  declare powerHitKeyIsDownPrevious: boolean;
  /** 衝刺／技能請求：±1 連按兩下方向鍵，±2 觸控技能鍵（觸控模組設定） */
  declare dashRequest: number;
  declare _lastLeftTime: number;
  declare _lastRightTime: number;
  declare _prevLeftDown: boolean;
  declare _prevRightDown: boolean;
  declare leftKey: Key;
  declare rightKey: Key;
  declare upKey: Key;
  declare downKey: Key;
  declare powerHitKey: Key;
  declare downRightKey: Key;

  /**
   * 參數都是 KeyboardEvent.code 的值
   * （https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code/code_values）
   * @param left 左
   * @param right 右
   * @param up 上
   * @param down 下
   * @param powerHit 殺球（也是選單的確定鍵）
   * @param downRight 等同同時按下和右的鍵（只有 1P 有）
   */
  constructor(left: string, right: string, up: string, down: string, powerHit: string, downRight: string | null = null) {
    super();

    this.powerHitKeyIsDownPrevious = false;
    this.dashRequest = 0;
    this._lastLeftTime = 0;
    this._lastRightTime = 0;
    this._prevLeftDown = false;
    this._prevRightDown = false;

    this.leftKey = new Key(left);
    this.rightKey = new Key(right);
    this.upKey = new Key(up);
    this.downKey = new Key(down);
    this.powerHitKey = new Key(powerHit);
    this.downRightKey = new Key(downRight);
  }

  /**
   * 從鍵盤讀出 xDirection、yDirection、powerHit（以及 dashRequest）。
   * 用來在一幀的處理過程中把輸入「凍結」住。
   */
  getInput(): void {
    if (this.leftKey.isDown) {
      this.xDirection = -1;
    } else if (
      this.rightKey.isDown ||
      (this.downRightKey && this.downRightKey.isDown)
    ) {
      this.xDirection = 1;
    } else {
      this.xDirection = 0;
    }

    if (this.upKey.isDown) {
      this.yDirection = -1;
    } else if (
      this.downKey.isDown ||
      (this.downRightKey && this.downRightKey.isDown)
    ) {
      this.yDirection = 1;
    } else {
      this.yDirection = 0;
    }

    const isDown = this.powerHitKey.isDown;
    if (!this.powerHitKeyIsDownPrevious && isDown) {
      this.powerHit = 1;
    } else {
      this.powerHit = 0;
    }
    this.powerHitKeyIsDownPrevious = isDown;

    // 衝刺請求
    const now = Date.now();
    this.dashRequest = 0;
    if (mouseDashRequest) {
      this.dashRequest = mouseDashRequest;
      mouseDashRequest = 0;
    }
    if (this.leftKey.isDown && !this._prevLeftDown) {
      if (now - this._lastLeftTime < DOUBLE_TAP_MS) this.dashRequest = -1;
      this._lastLeftTime = now;
    }
    if (this.rightKey.isDown && !this._prevRightDown) {
      if (now - this._lastRightTime < DOUBLE_TAP_MS) this.dashRequest = 1;
      this._lastRightTime = now;
    }
    this._prevLeftDown = this.leftKey.isDown;
    this._prevRightDown = this.rightKey.isDown;
  }

  /** 為這組鍵盤的按鍵掛上 keydown、keyup 監聽 */
  subscribe(): void {
    this.leftKey.subscribe();
    this.rightKey.subscribe();
    this.upKey.subscribe();
    this.downKey.subscribe();
    this.powerHitKey.subscribe();
    this.downRightKey.subscribe();
  }

  /** 移除這組鍵盤的按鍵的 keydown、keyup 監聽 */
  unsubscribe(): void {
    this.leftKey.unsubscribe();
    this.rightKey.unsubscribe();
    this.upKey.unsubscribe();
    this.downKey.unsubscribe();
    this.powerHitKey.unsubscribe();
    this.downRightKey.unsubscribe();
  }
}

/**
 * 鍵盤上的一個按鍵
 * 參考：https://github.com/kittykatattack/learningPixi
 */
export class Key implements KeyState {
  /** KeyboardEvent.code；null 表示沒有指定按鍵（2P 的 downRight） */
  declare value: string | null;
  declare isDown: boolean;
  declare isUp: boolean;
  declare downListener: (event: KeyboardEvent) => void;
  declare upListener: (event: KeyboardEvent) => void;

  /** @param value 這個按鍵的 KeyboardEvent.code */
  constructor(value: string | null) {
    this.value = value;
    this.isDown = false;
    this.isUp = true;

    this.downListener = this.downHandler.bind(this);
    this.upListener = this.upHandler.bind(this);
    this.subscribe();
  }

  /** 按下時 */
  downHandler(event: KeyboardEvent): void {
    if (event.code === this.value) {
      this.isDown = true;
      this.isUp = false;
      event.preventDefault();
    }
  }

  /** 放開時 */
  upHandler(event: KeyboardEvent): void {
    if (event.code === this.value) {
      this.isDown = false;
      this.isUp = true;
      event.preventDefault();
    }
  }

  /** 掛上監聽 */
  subscribe(): void {
    // keyup 的監聽應該比 keydown 先掛，避免錯誤：
    // 如果先掛 keydown，而按鍵在 keyup 監聽掛上之前就按下又放開，
    // isDown 會一直是 true（isUp 一直是 false），直到使用者再按一次這個鍵。
    window.addEventListener('keyup', this.upListener);
    window.addEventListener('keydown', this.downListener);
  }

  /** 移除監聽 */
  unsubscribe(): void {
    window.removeEventListener('keydown', this.downListener);
    window.removeEventListener('keyup', this.upListener);
    this.isDown = false;
    this.isUp = true;
  }
}
