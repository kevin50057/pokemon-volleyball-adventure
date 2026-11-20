/**
 * 深色模式切換開關（原作 utils/dark_color_scheme.js）。
 *
 * 舊版是獨立的 dark_color_scheme.bundle.js，在 main.bundle.js 之後載入、載入當下就執行；
 * 這裡改成函式，由 index.ts 的 startEngine() 在最後呼叫。
 * 存檔鍵名照舊是 'colorScheme'（core/storage.ts 會自己加前綴）。
 */
import { store } from '../core/storage';

const THEME_COLOR_LIGHT = '#FFFFFF';
const THEME_COLOR_DARK = '#202124';

/**
 * 設定深色模式的勾選框
 */
export function setUpDarkColorSchemeCheckbox(): void {
  // 這些元素都是 <input type="checkbox">
  const darkColorSchemeCheckboxElements = Array.from(
    document.getElementsByClassName('dark-color-scheme-checkbox'),
  ) as HTMLInputElement[];
  const colorScheme = store.get('colorScheme');
  if (colorScheme === 'dark' || colorScheme === 'light') {
    darkColorSchemeCheckboxElements.forEach((elem) => {
      elem.checked = colorScheme === 'dark';
    });
    applyColorScheme(colorScheme);
  } else {
    const doesPreferDarkColorScheme = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches;
    // 下面這行不是為了 document.documentElement.dataset.colorScheme：
    // 顯示深色模式不需要它，style.css 的 "@media (prefers-color-scheme: dark)" 不靠 JavaScript 就會處理。
    // 這行是為了設定 theme color 等等。
    applyColorScheme(doesPreferDarkColorScheme ? 'dark' : 'light');
    darkColorSchemeCheckboxElements.forEach((elem) => {
      elem.checked = doesPreferDarkColorScheme;
    });
  }
  darkColorSchemeCheckboxElements.forEach((elem) => {
    elem.addEventListener('change', () => {
      const colorScheme = elem.checked ? 'dark' : 'light';
      applyColorScheme(colorScheme);
      store.set('colorScheme', colorScheme);
      // 讓其他勾選框同步
      darkColorSchemeCheckboxElements.forEach((element) => {
        if (element !== elem) {
          element.checked = elem.checked;
        }
      });
    });
  });
}

/**
 * 套用（把配色顯示到畫面上）
 * @param colorScheme 'dark' 或 'light'
 */
function applyColorScheme(colorScheme: 'dark' | 'light'): void {
  document.documentElement.dataset.colorScheme = colorScheme;
  const themeColorMetaElement = document.querySelector(
    'meta[name="theme-color"]',
  );
  if (themeColorMetaElement !== null) {
    // 這是給 Apple 裝置上 PWA 的狀態列顏色（由 theme-color meta 標籤決定）
    themeColorMetaElement.setAttribute(
      'content',
      colorScheme === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT,
    );
  }
}
