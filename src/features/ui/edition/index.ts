// edition — 遠征版回經典版的入口
// 經典版（另一個 repo）：全部角色開放、沒有闖關；選單列有一顆「遠征版」（這個 repo 不需要那條路）。
// 遠征版（這個 repo）：鎖角色、有闖關；關於頁裡放回經典版的連結。
import { CLASSIC_URL } from '../../../core/config';
import { lang, pick } from '../../../core/i18n';

interface Texts { back: string; backLink: string }
// 空字串＝不放連結
const TEXTS = {
  zh: { back: '想用全部 20 隻角色隨手對戰？', backLink: '回到經典版' },
  en: { back: 'Want quick matches with all 20 characters?', backLink: 'Back to the classic edition' },
  ko: { back: '캐릭터 20마리 전부로 가볍게 대전하고 싶다면?', backLink: '클래식 버전으로 돌아가기' },
} satisfies Record<'zh' | 'en' | 'ko', Texts>;

/** 經典版同語言的頁面（經典版網址以 zh/ 結尾，en/、ko/ 是同一層的其他語言頁）。 */
function classicUrl(): string {
  const l = lang();
  return l === 'zh' ? CLASSIC_URL : CLASSIC_URL.replace(/zh\/$/, l + '/');
}

export function init(): void {
  const T: Texts = pick(TEXTS);
  // 關於頁：回經典版的連結
  const head = document.getElementById('about-box-head');
  if (head && T.back) {
    const p = document.createElement('p');
    p.innerHTML = T.back + ' <a href="' + classicUrl() + '">' + T.backLink + '</a>';
    const languages = head.querySelector('.languages');
    head.insertBefore(p, languages || null);
  }
}
