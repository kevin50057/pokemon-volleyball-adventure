/** 遠征的介面文字：依頁面語言選一份（zh／en／ko 各一個檔案，型別以 zh 為準）。 */
import { pick } from '../../../core/i18n';
import { en } from './en';
import { ko } from './ko';
import { zh } from './zh';

export type { ExpTexts } from './zh';
export const T = pick({ zh, en, ko });
