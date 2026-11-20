/** 部署相關的設定。 */

/** 網站根目錄（結尾有 /），例如 `/pokemon-volleyball-adventure/`。 */
export const BASE_URL: string = import.meta.env.BASE_URL;

/** 靜態檔（public/ 底下）的網址。`assetUrl('resources/assets/images/mew_sheet.json')` */
export function assetUrl(path: string): string {
  return BASE_URL + path.replace(/^\/+/, '');
}

/** 圖檔資料夾（結尾有 /）。 */
export const IMAGES_URL = assetUrl('resources/assets/images/');
/** 音效資料夾（結尾有 /）。 */
export const SOUNDS_URL = assetUrl('resources/assets/sounds/');

/** 經典版（全角色開放、沒有闖關）的網址。 */
export const CLASSIC_URL = 'https://kevin50057.github.io/pokemon-volleyball/zh/';

/**
 * 連線對戰的 MQTT 中繼伺服器（依序嘗試）。第一個是作者自架的。
 * 網址可以用 `?brokers=wss://a,wss://b` 覆蓋（測試用）。
 */
export const BROKERS: readonly string[] = [
  'wss://desktop-rre5em4.tail237dd2.ts.net/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

/** 這個 repo 只有遠征版：全遊戲鎖角色、有闖關。 */
export const EDITION = 'adventure' as const;
