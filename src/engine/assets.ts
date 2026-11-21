/**
 * 遊戲資源（圖檔、音效）的路徑（原作 assets_path.js）。
 *
 * 這個專案加了 19 隻角色的圖檔（各自一張 sprite sheet）、閃電鳥的叫聲／拍翅音效，
 * 以及每隻新角色的 call／hit／jump 音效（`CHAR_<角色>_<call|hit|jump>`）。
 * 原本寫死的 '../resources/assets/…' 改成 core/config.ts 的 IMAGES_URL、SOUNDS_URL。
 *
 * 注意：載入器（index.ts）照這裡的鍵的順序加入資源，SOUNDS 的鍵順序不要改。
 */
import { IMAGES_URL, SOUNDS_URL } from '../core/config';
import { lang } from '../core/i18n';

/** 畫面上的日文訊息圖：韓文頁用原作韓文版的圖，其他語言用日文原圖。 */
const MSG = lang() === 'ko' ? 'ko' : 'ja';

const TEXTURES = {
  PIKACHU: (i: number, j: number): string => `pikachu/pikachu_${i}_${j}.png`,
  BIRD: (i: number, j: number): string => `bird/bird_${i}_${j}.png`,
  VAPOREON: (i: number, j: number): string => `vaporeon/vaporeon_${i}_${j}.png`,
  FLAREON: (i: number, j: number): string => `flareon/flareon_${i}_${j}.png`,
  JOLTEON: (i: number, j: number): string => `jolteon/jolteon_${i}_${j}.png`,
  GENGAR: (i: number, j: number): string => `gengar/gengar_${i}_${j}.png`,
  MEOWTH: (i: number, j: number): string => `meowth/meowth_${i}_${j}.png`,
  SNORLAX: (i: number, j: number): string => `snorlax/snorlax_${i}_${j}.png`,
  MEWTWO: (i: number, j: number): string => `mewtwo/mewtwo_${i}_${j}.png`,
  ELECTRODE: (i: number, j: number): string => `electrode/electrode_${i}_${j}.png`,
  WOBBUFFET: (i: number, j: number): string => `wobbuffet/wobbuffet_${i}_${j}.png`,
  DITTO: (i: number, j: number): string => `ditto/ditto_${i}_${j}.png`,
  MRMIME: (i: number, j: number): string => `mrmime/mrmime_${i}_${j}.png`,
  DUGTRIO: (i: number, j: number): string => `dugtrio/dugtrio_${i}_${j}.png`,
  FARFETCHD: (i: number, j: number): string => `farfetchd/farfetchd_${i}_${j}.png`,
  PSYDUCK: (i: number, j: number): string => `psyduck/psyduck_${i}_${j}.png`,
  MAGIKARP: (i: number, j: number): string => `magikarp/magikarp_${i}_${j}.png`,
  JIGGLYPUFF: (i: number, j: number): string => `jigglypuff/jigglypuff_${i}_${j}.png`,
  DRAGONITE: (i: number, j: number): string => `dragonite/dragonite_${i}_${j}.png`,
  MEW: (i: number, j: number): string => `mew/mew_${i}_${j}.png`,
  CHARMANDER: (i: number, j: number): string => `charmander/charmander_${i}_${j}.png`,
  UMBREON: (i: number, j: number): string => `umbreon/umbreon_${i}_${j}.png`,
  BULBASAUR: (i: number, j: number): string => `bulbasaur/bulbasaur_${i}_${j}.png`,
  SQUIRTLE: (i: number, j: number): string => `squirtle/squirtle_${i}_${j}.png`,
  BALL: (s: number | string): string => `ball/ball_${s}.png`,
  NUMBER: (n: number): string => `number/number_${n}.png`,

  SKY_BLUE: 'objects/sky_blue.png',
  MOUNTAIN: 'objects/mountain.png',
  GROUND_RED: 'objects/ground_red.png',
  GROUND_LINE: 'objects/ground_line.png',
  GROUND_LINE_LEFT_MOST: 'objects/ground_line_leftmost.png',
  GROUND_LINE_RIGHT_MOST: 'objects/ground_line_rightmost.png',
  GROUND_YELLOW: 'objects/ground_yellow.png',
  NET_PILLAR_TOP: 'objects/net_pillar_top.png',
  NET_PILLAR: 'objects/net_pillar.png',
  SHADOW: 'objects/shadow.png',
  BALL_HYPER: 'ball/ball_hyper.png',
  BALL_TRAIL: 'ball/ball_trail.png',
  BALL_PUNCH: 'ball/ball_punch.png',
  CLOUD: 'objects/cloud.png',
  WAVE: 'objects/wave.png',
  BLACK: 'objects/black.png',

  SACHISOFT: 'messages/common/sachisoft.png',
  READY: 'messages/common/ready.png',
  GAME_END: 'messages/common/game_end.png',

  MARK: `messages/${MSG}/mark.png`,
  POKEMON: `messages/${MSG}/pokemon.png`,
  PIKACHU_VOLLEYBALL: `messages/${MSG}/pikachu_volleyball.png`,
  FIGHT: `messages/${MSG}/fight.png`,
  WITH_COMPUTER: `messages/${MSG}/with_computer.png`,
  WITH_FRIEND: `messages/${MSG}/with_friend.png`,
  GAME_START: `messages/${MSG}/game_start.png`,

  SITTING_PIKACHU: 'sitting_pikachu.png',
};

/** 固定的音效，加上 `CHAR_<角色>_<call|hit|jump>` 這些動態加入的鍵。 */
export type SoundPaths = Record<string, string> & {
  BGM: string; PIPIKACHU: string; PIKA: string; CHU: string; PI: string; PIKACHU: string;
  POWERHIT: string; BALLTOUCHESGROUND: string; BIRD_SHOUT: string; BIRD_FLAP: string;
};

const SOUNDS: SoundPaths = {
  BGM: SOUNDS_URL + 'bgm.mp3',
  PIPIKACHU: SOUNDS_URL + 'WAVE140_1.wav',
  PIKA: SOUNDS_URL + 'WAVE141_1.wav',
  CHU: SOUNDS_URL + 'WAVE142_1.wav',
  PI: SOUNDS_URL + 'WAVE143_1.wav',
  PIKACHU: SOUNDS_URL + 'WAVE144_1.wav',
  POWERHIT: SOUNDS_URL + 'WAVE145_1.wav',
  BALLTOUCHESGROUND: SOUNDS_URL + 'WAVE146_1.wav',
  BIRD_SHOUT: SOUNDS_URL + 'bird_shout.wav',
  BIRD_FLAP: SOUNDS_URL + 'bird_flap.wav',
};
// 每隻新角色的專屬音效（皮卡丘用原作的音效，所以不在清單裡）
for (const c of [
  'bird', 'vaporeon', 'flareon', 'jolteon', 'gengar', 'meowth', 'snorlax', 'mewtwo',
  'electrode', 'wobbuffet', 'ditto', 'mrmime', 'dugtrio', 'farfetchd', 'psyduck',
  'magikarp', 'jigglypuff', 'dragonite', 'mew',
]) {
  for (const k of ['call', 'hit', 'jump']) {
    SOUNDS[`CHAR_${c}_${k}`] = `${SOUNDS_URL}${c}_${k}.wav`;
  }
}

export const ASSETS_PATH = {
  SPRITE_SHEET: IMAGES_URL + 'sprite_sheet.json',
  BIRD_SHEET: IMAGES_URL + 'bird_sheet.json',
  VAPOREON_SHEET: IMAGES_URL + 'vaporeon_sheet.json',
  FLAREON_SHEET: IMAGES_URL + 'flareon_sheet.json',
  JOLTEON_SHEET: IMAGES_URL + 'jolteon_sheet.json',
  GENGAR_SHEET: IMAGES_URL + 'gengar_sheet.json',
  MEOWTH_SHEET: IMAGES_URL + 'meowth_sheet.json',
  SNORLAX_SHEET: IMAGES_URL + 'snorlax_sheet.json',
  MEWTWO_SHEET: IMAGES_URL + 'mewtwo_sheet.json',
  ELECTRODE_SHEET: IMAGES_URL + 'electrode_sheet.json',
  WOBBUFFET_SHEET: IMAGES_URL + 'wobbuffet_sheet.json',
  DITTO_SHEET: IMAGES_URL + 'ditto_sheet.json',
  MRMIME_SHEET: IMAGES_URL + 'mrmime_sheet.json',
  DUGTRIO_SHEET: IMAGES_URL + 'dugtrio_sheet.json',
  FARFETCHD_SHEET: IMAGES_URL + 'farfetchd_sheet.json',
  PSYDUCK_SHEET: IMAGES_URL + 'psyduck_sheet.json',
  MAGIKARP_SHEET: IMAGES_URL + 'magikarp_sheet.json',
  JIGGLYPUFF_SHEET: IMAGES_URL + 'jigglypuff_sheet.json',
  DRAGONITE_SHEET: IMAGES_URL + 'dragonite_sheet.json',
  MEW_SHEET: IMAGES_URL + 'mew_sheet.json',
  CHARMANDER_SHEET: IMAGES_URL + 'charmander_sheet.json',
  UMBREON_SHEET: IMAGES_URL + 'umbreon_sheet.json',
  BULBASAUR_SHEET: IMAGES_URL + 'bulbasaur_sheet.json',
  SQUIRTLE_SHEET: IMAGES_URL + 'squirtle_sheet.json',
  TEXTURES,
  SOUNDS,
};
