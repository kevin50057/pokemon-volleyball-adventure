/**
 * 遊戲音效（原作 audio.js），使用 @pixi/sound。
 *
 * 這個專案加的：閃電鳥的叫聲 birdShout、拍翅 birdFlap，
 * 以及每隻新角色的 `CHAR_<角色>_<call|hit|jump>`（有載入成功的才加）。
 */
import { sound, Sound, filters } from '@pixi/sound';
import type { LoaderResource } from '@pixi/loaders';
import { ASSETS_PATH } from './assets';
import type { GameAudio, SoundChannel } from '../core/types';

const SOUNDS = ASSETS_PATH.SOUNDS;

/** loader.resources */
export type Resources = Record<string, LoaderResource>;

/** 音效包：固定的音效加上 `CHAR_…` 動態加入的音效 */
export type PikaSounds = Record<string, PikaStereoSound> & {
  bgm: PikaStereoSound; pipikachu: PikaStereoSound; pika: PikaStereoSound; chu: PikaStereoSound;
  pi: PikaStereoSound; pikachu: PikaStereoSound; powerHit: PikaStereoSound;
  ballTouchesGround: PikaStereoSound; birdShout: PikaStereoSound; birdFlap: PikaStereoSound;
};

/**
 * 取出載入好的 Sound。
 * 舊版直接讀 `resources[path].sound`，載入失敗時在建 PikaStereoSound 時丟例外；這裡維持同樣的行為，
 * 所以只做型別上的轉換（不另外檢查）。
 */
function soundOf(resources: Resources, path: string): Sound {
  return resources[path].sound as Sound;
}

/** 遊戲音效 */
export class PikaAudio implements GameAudio {
  declare sounds: PikaSounds;
  /** 適當的背景音樂音量 */
  declare properBGMVolume: number;
  /** 適當的音效音量 */
  declare properSFXVolume: number;

  /** @param resources loader.resources */
  constructor(resources: Resources) {
    this.sounds = {
      bgm: new PikaStereoSound(soundOf(resources, SOUNDS.BGM)),
      pipikachu: new PikaStereoSound(soundOf(resources, SOUNDS.PIPIKACHU)),
      pika: new PikaStereoSound(soundOf(resources, SOUNDS.PIKA)),
      chu: new PikaStereoSound(soundOf(resources, SOUNDS.CHU)),
      pi: new PikaStereoSound(soundOf(resources, SOUNDS.PI)),
      pikachu: new PikaStereoSound(soundOf(resources, SOUNDS.PIKACHU)),
      powerHit: new PikaStereoSound(soundOf(resources, SOUNDS.POWERHIT)),
      ballTouchesGround: new PikaStereoSound(soundOf(resources, SOUNDS.BALLTOUCHESGROUND)),
      birdShout: new PikaStereoSound(soundOf(resources, SOUNDS.BIRD_SHOUT)),
      birdFlap: new PikaStereoSound(soundOf(resources, SOUNDS.BIRD_FLAP)),
    };
    // 各角色專屬音效：鍵名照 SOUNDS 的 `CHAR_<角色>_<call|hit|jump>`
    for (const key in SOUNDS) {
      if (key.startsWith('CHAR_') && resources[SOUNDS[key]]) {
        this.sounds[key] = new PikaStereoSound(soundOf(resources, SOUNDS[key]));
      }
    }

    this.sounds.bgm.loop = true;
    this.properBGMVolume = 0.2;
    this.properSFXVolume = 0.35;
    this.adjustVolume();
  }

  /** 調整音量 */
  adjustVolume(): void {
    for (const prop in this.sounds) {
      if (prop === 'bgm') {
        this.sounds[prop].volume = this.properBGMVolume;
      } else {
        this.sounds[prop].volume = this.properSFXVolume;
      }
    }
  }

  /** 開／關背景音樂 */
  turnBGMVolume(turnOn: boolean): void {
    let volume;
    if (turnOn) {
      volume = this.properBGMVolume;
    } else {
      volume = 0;
    }
    this.sounds.bgm.volume = volume;
  }

  /** 開／關音效 */
  turnSFXVolume(turnOn: boolean): void {
    let volume;
    if (turnOn) {
      volume = this.properSFXVolume;
    } else {
      volume = 0;
    }
    for (const prop in this.sounds) {
      if (prop !== 'bgm') {
        this.sounds[prop].volume = volume;
      }
    }
  }

  muteAll(): void {
    sound.muteAll();
  }

  unmuteAll(): void {
    sound.unmuteAll();
  }
}

/**
 * 立體聲音效：同一個聲音準備置中、偏左、偏右三份。
 *
 * `volume`、`loop` 跟原作一樣只有 setter（讀取會得到 undefined）。
 */
export class PikaStereoSound implements SoundChannel {
  declare readonly center: Sound;
  declare readonly left: Sound;
  declare readonly right: Sound;

  constructor(sound: Sound) {
    this.center = sound;
    this.left = Sound.from(sound.url);
    this.right = Sound.from(sound.url);

    const centerPanning = new filters.StereoFilter(0);
    const leftPanning = new filters.StereoFilter(-0.75);
    const rightPanning = new filters.StereoFilter(0.75);
    this.center.filters = [centerPanning];
    this.left.filters = [leftPanning];
    this.right.filters = [rightPanning];
  }

  /** 音量：[0, 1] */
  set volume(v: number) {
    this.center.volume = v;
    this.left.volume = v;
    this.right.volume = v;
  }

  set loop(bool: boolean) {
    this.center.loop = bool;
    this.left.loop = bool;
    this.right.loop = bool;
  }

  /**
   * 播放
   * @param leftOrCenterOrRight -1：左，0：中，1：右
   */
  play(leftOrCenterOrRight = 0): void {
    if (leftOrCenterOrRight === 0) {
      this.center.play();
    } else if (leftOrCenterOrRight === -1) {
      this.left.play();
    } else if (leftOrCenterOrRight === 1) {
      this.right.play();
    }
  }

  /** 停止 */
  stop(): void {
    this.center.stop();
    this.left.stop();
    this.right.stop();
  }
}
