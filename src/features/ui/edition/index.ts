// edition — 遠征版回經典版的入口
// 經典版（另一個 repo）：全部角色開放、沒有闖關；選單列有一顆「遠征版」（這個 repo 不需要那條路）。
// 遠征版（這個 repo）：鎖角色、有闖關；關於頁裡放回經典版的連結。
import { CLASSIC_URL } from '../../../core/config';

interface Texts { back: string; backLink: string }
// 只有中文頁有回經典版的文字（跟舊版一樣，英文、韓文是空字串＝不放連結）
const TEXTS: Record<string, Texts | undefined> = {
  zh: { back: '想用全部 20 隻角色隨手對戰？', backLink: '回到經典版' },
  en: { back: '', backLink: '' },
  ko: { back: '', backLink: '' },
};

export function init(): void {
  const LANG = (document.documentElement.lang || 'zh').slice(0, 2);
  const T = TEXTS[LANG];
  if (!T) return;
  // 關於頁：回經典版的連結
  const head = document.getElementById('about-box-head');
  if (head && T.back) {
    const p = document.createElement('p');
    p.innerHTML = T.back + ' <a href="' + CLASSIC_URL + '">' + T.backLink + '</a>';
    const lang = head.querySelector('.languages');
    head.insertBefore(p, lang || null);
  }
}
