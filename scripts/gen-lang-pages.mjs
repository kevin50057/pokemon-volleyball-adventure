// 由繁中頁（index.html）產生英文、韓文頁（en/index.html、ko/index.html）。
// 改了 index.html 之後執行 `npm run pages`（`npm run build` 也會先跑）。
// 介面上程式產生的文字在各功能的文字表裡（src/core/i18n.ts）；這裡只處理 HTML 裡寫死的部分。
// 關於頁的原作說明、提示等段落沿用經典版（gorisanson/pikachu-volleyball）的英文、韓文版本。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIC = 'https://kevin50057.github.io/pokemon-volleyball/';

const NAMES = {
  en: { pikachu: 'Pikachu', bird: 'Zapdos', vaporeon: 'Vaporeon', flareon: 'Flareon', jolteon: 'Jolteon', gengar: 'Gengar', meowth: 'Meowth', snorlax: 'Snorlax', mewtwo: 'Mewtwo', electrode: 'Electrode', wobbuffet: 'Wobbuffet', ditto: 'Ditto', mrmime: 'Mr. Mime', dugtrio: 'Dugtrio', farfetchd: "Farfetch'd", psyduck: 'Psyduck', magikarp: 'Magikarp', jigglypuff: 'Jigglypuff', dragonite: 'Dragonite', mew: 'Mew', charmander: 'Charmander', bulbasaur: 'Bulbasaur', squirtle: 'Squirtle' },
  ko: { pikachu: '피카츄', bird: '썬더', vaporeon: '샤미드', flareon: '부스터', jolteon: '쥬피썬더', gengar: '팬텀', meowth: '나옹', snorlax: '잠만보', mewtwo: '뮤츠', electrode: '붐볼', wobbuffet: '마자용', ditto: '메타몽', mrmime: '마임맨', dugtrio: '닥트리오', farfetchd: '파오리', psyduck: '고라파덕', magikarp: '잉어킹', jigglypuff: '푸린', dragonite: '망나뇽', mew: '뮤', charmander: '파이리', bulbasaur: '이상해씨', squirtle: '꼬부기' },
};
const SIDE = { en: { 1: '1P (left): ', 2: '2P (right): ' }, ko: { 1: '1P (왼쪽): ', 2: '2P (오른쪽): ' } };

// 經典版英文、韓文頁的段落（原作的說明、提示、通知框）
const CLASSIC_SEGMENTS = {
  "en": {
    "aboutBody": "<div class=\"margin-top limit-width\"><div class=\"align-center-horizontally\"></div><p>Pikachu Volleyball is an old Windows game which was developed in Japan in 1997. The game was popular in Korea when I was young. I had played it with my friends.</p><p>This web version is made by reverse engineering the original game and implementing it to JavaScript. It is executed directly on the web browser so, unlike the original game, you can play it regardless of the operating system of your computer.</p><p class=\"margin-top\"><span class=\"thick\">Controls:</span></p><div class=\"align-center-horizontally\"><p>If you have a Bluetooth keyboard, you can play also on your touch/mobile devices.</p></div><p class=\"margin-top\"><span class=\"thick\">Tip 1:</span><br>Like the original game, when you select <span class=\"no_wrap\">\"1人でぴかちゅ~\"</span> to play against the computer, you would play as player 1 if you select by pressing the \"Z\" key, or you would play as player 2 if you select by pressing the Enter key.</p><p class=\"margin-top\"><span class=\"thick\">Tip 2:</span><br>Player 1 has the \"V\" key as an additional down key. The \"V\" key works differently compared to the \"F\" key, so you can try using it. (<span class=\"no-wrap\"><a href=\"https://twitter.com/repeat_c/status/1256494157884841984\" target=\"_blank\" rel=\"noopener\">Thanks to @repeat_c</a></span>, this characteristic of the original game could be reflected in this web version.)</p><p class=\"margin-top\"><span class=\"thick\">Tip 3:</span><br>If you want to hide/show the game menu bar, press the Esc key.</p><p class=\"margin-top\"><span class=\"thick\">Tip 4:</span><br>I've added a practice mode which is not in the original game, you can turn on this mode at <span class=\"no_wrap\">\"Options &rarr; Practice mode &rarr; on\"</span>.</p>",
    "p2p-online-version": "<p class=\"p2p-online-version\">You can also play <a href=\"https://gorisanson.github.io/pikachu-volleyball-p2p-online/en/\">the P2P online version</a>.</p>",
    "super-ai-edition": "<p class=\"super-ai-edition\">You can also play <a href=\"https://pika.duckll.tw/en/\" target=\"_blank\" rel=\"noopener\">Super AI Edition</a> by <a href=\"https://blog.duckll.tw/\" target=\"_blank\" rel=\"noopener\">DuckLL</a>.</p>",
    "seungsu-ai": "<p class=\"seungsu-ai\">You can also play <a href=\"https://seungsu.com/pikachu\" target=\"_blank\" rel=\"noopener\">Pikachu Volleyball AI</a> by <a href=\"https://seungsu.com/\" target=\"_blank\" rel=\"noopener\">Sungsu Kim</a>.</p>",
    "original-by": "<p class=\"original-by\">The original Pikachu Volleyball (対戦ぴかちゅ～　ﾋﾞｰﾁﾊﾞﾚｰ編) was developed by<br>1997 (C) <span class=\"no-wrap\">SACHI SOFT / SAWAYAKAN Programmers</span><br>1997 (C) <span class=\"no-wrap\">Satoshi Takenouchi</span></p>",
    "reverse-engineered-by": "<p class=\"reverse-engineered-by\">The original game was reverse engineered<br>and implemented into this web version by<br><span class=\"no-wrap\"><a href=\"https://gorisanson.github.io/\">Kyutae Lee</a></span></p>",
    "source-code-on": "<p class=\"source-code-on\">You can view the source code on <a href=\"https://github.com/gorisanson/pikachu-volleyball\" target=\"_blank\" rel=\"noopener\">GitHub</a>.</p>",
    "release-date": "<p class=\"release-date\">Release Date: 2020-03-26</p>",
    "notice-box-1": "<div class=\"fade-in-box notice hidden\" id=\"notice-box-1\"><p>The winning score can not be set to the <span id=\"winning-score-in-notice-box-1\"></span> pts, since the score is already reached.</p><button type=\"button\" id=\"notice-ok-btn-1\" class=\"btn-in-box\">OK</button></div>",
    "notice-box-2": "<div class=\"fade-in-box notice hidden\" id=\"notice-box-2\"><p>There's no point adjusting the winning score in practice mode.<br>You can turn off practice mode at <span class=\"no_wrap\">\"Options &rarr; Practice mode &rarr; off\"</span>.</p><button type=\"button\" id=\"notice-ok-btn-2\" class=\"btn-in-box\">OK</button></div>",
    "loading-box": "<div class=\"fade-in-box loading hidden\" id=\"loading-box\"><div><p>Loading the game assets...</p><div id=\"progress-bar-border\"><div id=\"progress-bar\" style=\"width: 0%\"></div></div></div></div>",
    "update-notification-message-box": "<div class=\"fade-in-box update hidden\" id=\"update-notification-message-box\">A new version is available. Update now?<div><button type=\"button\" class=\"update\" id=\"update-now\">Update Now (current game state will be lost)</button> <button type=\"button\" class=\"update\" id=\"later\">Later (automatically at relaunching the browser)</button></div></div>"
  },
  "ko": {
    "aboutBody": "<div class=\"margin-top limit-width\"><div class=\"align-center-horizontally\"></div><p>피카츄 배구는 일본에서 1997년에 만들어진 윈도우용 게임입니다. 이 게임을 처음 접한 건 아마 초등학교 컴퓨터실에서였던 것으로 기억합니다. 친구들과 같이하면 정말 재미있지요. 어떤 분이 일본어 스프라이트를 한국어로 번역한 '피카츄 버전 한글판'이 나오기도 했습니다. (이 '피카츄 버전 한글판'의 한국어 스프라이트를 이 한국어 웹 버전에서도 사용했습니다.)</p><p>이 웹 버전은 원조 피카츄 배구 게임을 리버스 엔지니어링하여 이를 자바스크립트 코드로 구현한 것입니다. 이 웹 버전 게임은 웹 브라우저 상에서 직접 돌아가기 때문에 컴퓨터 운영체제에 상관 없이 플레이할 수 있습니다.</p><p class=\"margin-top\"><span class=\"thick\">조작법:</span></p><div class=\"align-center-horizontally\"><p>블루투스 키보드를 연결하면 스마트폰이나 태블릿에서도 플레이할 수 있습니다.</p></div><p class=\"margin-top\"><span class=\"thick\">팁 1:</span><br>원조 게임에서도 그랬듯이, <span class=\"no_wrap\">\"혼자서재미있게~\"</span>를 선택할 때 \"Z\" 키를 눌러서 선택하면, 왼쪽 피카츄(1P)를 선택하여 컴퓨터와 플레이할 수 있습니다. 엔터(Enter) 키를 눌러서 선택하면, 오른쪽 피카츄(2P)를 선택하여 컴퓨터와 플레이할 수 있고요.</p><p class=\"margin-top\"><span class=\"thick\">팁 2:</span><br>왼쪽 피카츄(1P)의 경우 아래 방향키로 \"V\" 키가 추가로 있습니다. \"V\" 키는 \"F\" 키와 작동 방식에 차이가 있으므로, 직접 사용해볼 수 있습니다. (<span class=\"no-wrap\"><a href=\"https://twitter.com/repeat_c/status/1256494157884841984\" target=\"_blank\" rel=\"noopener\">@repeat_c님의 제보</a></span> 덕분에, 원조 게임의 이 특성을 이 웹 버전에 반영할 수 있었습니다.)</p><p class=\"margin-top\"><span class=\"thick\">팁 3:</span><br>메뉴 바를 숨기려면 (또는 다시 보이게 하려면), Esc 키를 누르면 됩니다.</p><p class=\"margin-top\"><span class=\"thick\">팁 4:</span><br>원조 피카츄 배구에는 없는 \"연습모드\"를 추가했습니다. <span class=\"no_wrap\">\"설정 &rarr; 연습모드 &rarr; 켜기\"</span>를 누르면 활성화가 됩니다.</p>",
    "p2p-online-version": "<p class=\"p2p-online-version\"><a href=\"https://gorisanson.github.io/pikachu-volleyball-p2p-online/ko/\">P2P 온라인 버전</a>도 있습니다.</p>",
    "super-ai-edition": "<p class=\"super-ai-edition\"><a href=\"https://pika.duckll.tw/ko/\" target=\"_blank\" rel=\"noopener\">슈퍼 AI 버전</a>(만든 사람: <a href=\"https://blog.duckll.tw/\" target=\"_blank\" rel=\"noopener\">DuckLL</a>)도 있습니다.</p>",
    "seungsu-ai": "<p class=\"seungsu-ai\"><a href=\"https://seungsu.com/pikachu\" target=\"_blank\" rel=\"noopener\">스스로 배운 피카츄 배구 AI</a>(만든 사람: <a href=\"https://seungsu.com/\" target=\"_blank\" rel=\"noopener\">김성수</a>)도 있습니다.</p>",
    "original-by": "<p class=\"original-by\">원조 피카츄 배구 (対戦ぴかちゅ～　ﾋﾞｰﾁﾊﾞﾚｰ編) 게임은 다음 분들이 만들었습니다.<br>1997 (C) <span class=\"no-wrap\">SACHI SOFT / SAWAYAKAN Programmers</span><br>1997 (C) <span class=\"no-wrap\">Satoshi Takenouchi</span></p>",
    "reverse-engineered-by": "<p class=\"reverse-engineered-by\">원조 피카츄 배구 게임을 리버스 엔지니어링하여 웹 버전으로 만들었습니다.<br>웹 버전으로 만든 사람: <span class=\"no-wrap\"><a href=\"https://gorisanson.github.io/\">이규태</a></span></p>",
    "source-code-on": "<p class=\"source-code-on\">소스 코드를 <a href=\"https://github.com/gorisanson/pikachu-volleyball\" target=\"_blank\" rel=\"noopener\">GitHub</a>에서 볼 수 있습니다.</p>",
    "release-date": "<p class=\"release-date\">공개한 날: 2020-03-26</p>",
    "notice-box-1": "<div class=\"fade-in-box notice hidden\" id=\"notice-box-1\"><p>승리점수를 <span id=\"winning-score-in-notice-box-1\"></span>점으로 바꿀 수 없습니다. 이미 이 점수가 됐거나 넘어버렸습니다.</p><button type=\"button\" id=\"notice-ok-btn-1\" class=\"btn-in-box\">알겠어요</button></div>",
    "notice-box-2": "<div class=\"fade-in-box notice hidden\" id=\"notice-box-2\"><p>연습모드에서 승리점수를 바꾸는 건 의미가 없습니다.<br>연습모드를 끄려면 <span class=\"no_wrap\">\"설정 &rarr; 연습모드 &rarr; 끄기\"</span>를 눌러주세요.</p><button type=\"button\" id=\"notice-ok-btn-2\" class=\"btn-in-box\">알겠어요</button></div>",
    "loading-box": "<div class=\"fade-in-box loading hidden\" id=\"loading-box\"><div><p>게임 스프라이트/사운드 로드 중...</p><div id=\"progress-bar-border\"><div id=\"progress-bar\" style=\"width: 0%\"></div></div></div></div>",
    "update-notification-message-box": "<div class=\"fade-in-box update hidden\" id=\"update-notification-message-box\">새 버전이 나왔습니다. 지금 업데이트할까요?<div><button type=\"button\" class=\"update\" id=\"update-now\">지금 업데이트 (게임 상태가 초기화됩니다)</button> <button type=\"button\" class=\"update\" id=\"later\">나중에 (브라우저 다시 켤 때 자동 업데이트)</button></div></div>"
  }
};

// [繁中片段, 英文, 韓文]：照順序逐一取代，每一段都必須在 index.html 裡找得到
const PAIRS = [
  ['<html lang="zh">', '<html lang="en">', '<html lang="ko">'],
  ['<title>寶可夢排球 Ultimate 遠征版</title>', '<title>Pokémon Volleyball Ultimate: Adventure</title>', '<title>포켓몬 배구 Ultimate 원정판</title>'],
  ['content="線上玩皮卡丘打排球"', 'content="Play Pikachu Volleyball online"', 'content="온라인 피카츄 배구"'],
  ['content="寶可夢排球 遠征版"', 'content="PV Adventure"', 'content="포켓몬 배구 원정판"'],
  ['<div>請旋轉手機為橫向</div>', '<div>Please rotate your phone to landscape</div>', '<div>가로 모드로 전환해 주세요</div>'],
  ['dropdown-btn">遊戲</button>', 'dropdown-btn">Game</button>', 'dropdown-btn">게임</button>'],
  ['</span>暫停</button>', '</span>Pause</button>', '</span>일시정지</button>'],
  ['class="btn">重來</button>', 'class="btn">Restart</button>', 'class="btn">다시시작</button>'],
  ['dropdown-btn">選項</button>', 'dropdown-btn">Options</button>', 'dropdown-btn">설정</button>'],
  ['submenu-btn">Graphic &#9654;', 'submenu-btn">Graphic &#9654;', 'submenu-btn">그래픽 &#9654;'],
  ['</span>sharp</button>', '</span>sharp</button>', '</span>예리하게</button>'],
  ['</span>soft</button>', '</span>soft</button>', '</span>부드럽게</button>'],
  ['submenu-btn">背景音樂 &#9654;', 'submenu-btn">BGM &#9654;', 'submenu-btn">배경음악 &#9654;'],
  ['submenu-btn">SFX &#9654;', 'submenu-btn">SFX &#9654;', 'submenu-btn">효과음 &#9654;'],
  ['</span>stereo</button>', '</span>stereo</button>', '</span>스테레오</button>'],
  ['</span>mono</button>', '</span>mono</button>', '</span>모노</button>'],
  ['submenu-btn">速度 &#9654;', 'submenu-btn">Speed &#9654;', 'submenu-btn">속도 &#9654;'],
  ['</span>慢速</button>', '</span>slow</button>', '</span>느리게</button>'],
  ['</span>普通</button>', '</span>medium</button>', '</span>보통</button>'],
  ['</span>快速</button>', '</span>fast</button>', '</span>빠르게</button>'],
  ['submenu-btn">角色選擇… (C)</button>', 'submenu-btn">Characters… (C)</button>', 'submenu-btn">캐릭터 선택… (C)</button>'],
  ['submenu-btn">遊戲分數 &#9654;', 'submenu-btn">Winning score &#9654;', 'submenu-btn">승리점수 &#9654;'],
  ['</span>5分</button>', '</span>5 pts</button>', '</span>5점</button>'],
  ['</span>10分</button>', '</span>10 pts</button>', '</span>10점</button>'],
  ['</span>15分</button>', '</span>15 pts</button>', '</span>15점</button>'],
  ['submenu-btn">練習模式 &#9654;', 'submenu-btn">Practice mode &#9654;', 'submenu-btn">연습모드 &#9654;'],
  ['class="btn">恢復至預設值</button>', 'class="btn">Reset to default</button>', 'class="btn">설정 초기화</button>'],
  ['</span>開</button>', '</span>on</button>', '</span>켜기</button>', true],
  ['</span>關</button>', '</span>off</button>', '</span>끄기</button>', true],
  ['<span class="text-about hidden">關於</span><span class="text-play">開始</span>', '<span class="text-about hidden">About</span><span class="text-play">Play</span>', '<span class="text-about hidden">게임 소개</span><span class="text-play">게임 시작</span>'],
  ['<h1>寶可夢排球 Ultimate 遠征版</h1>', '<h1>Pokémon Volleyball Ultimate: Adventure</h1>', '<h1>포켓몬 배구 Ultimate 원정판</h1>'],
  ['<p style="margin-top:4px">遠征版一開始有皮卡丘、三隻伊布和關都御三家，其他角色要在「闖關」中打倒才會收服，收服後一般對戰和連線也能用。按 <b>C</b> 選角色。</p>',
    '<p style="margin-top:4px">You start with Pikachu, three Eeveelutions and the three Kanto starters. Beat the other characters in Campaign to catch them; once caught, you can also use them in regular and online matches. Press <b>C</b> to choose a character.</p>',
    '<p style="margin-top:4px">피카츄, 이브이 진화형 셋, 관동 스타팅 포켓몬 셋으로 시작합니다. 다른 캐릭터는 캠페인에서 이기면 잡을 수 있고, 잡은 뒤에는 일반 대전과 온라인 대전에서도 쓸 수 있습니다. <b>C</b>를 눌러 캐릭터를 고르세요.</p>'],
  ['<p class="languages">&check; Chinese(中文) | <a href="en/">English</a> | <a href="ko/">Korean(한국어)</a></p>',
    '<p class="languages"><a href="../">Chinese(中文)</a> | &check; English | <a href="../ko/">Korean(한국어)</a></p>',
    '<p class="languages"><a href="../">Chinese(中文)</a> | <a href="../en/">English</a> | &check; Korean(한국어)</p>'],
  ['<span class="text-close hidden">關閉</span><span class="text-play">開始</span>', '<span class="text-close hidden">close</span><span class="text-play">Play</span>', '<span class="text-close hidden">닫기</span><span class="text-play">게임 시작</span>'],
];

function replaceBlock(html, re, to) {
  if (!re.test(html)) throw new Error('index.html 裡找不到 ' + re);
  return html.replace(re, () => to);
}

function build(l) {
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const idx = l === 'en' ? 1 : 2;
  for (const pair of PAIRS) {
    const [zh, , , all] = pair;
    if (!html.includes(zh)) throw new Error('index.html 裡找不到：' + zh);
    html = all ? html.split(zh).join(pair[idx]) : html.replace(zh, () => pair[idx]);
  }
  // 選單裡的角色按鈕
  html = html.replace(/(id="p([12])-(\w+)-btn" class="btn"><span class="check">&check; <\/span>)[^<]*?(\s*(?:\S*[^\x00-\x7F\uAC00-\uD7A3\u4E00-\u9FFF：]\S*)?)<\/button>/g,
    (m, head, n, id, emoji) => {
      const name = NAMES[l][id];
      if (!name) throw new Error('沒有名字：' + id);
      const em = (m.match(/\s(\S+)<\/button>$/) || [])[1];
      return head + SIDE[l][n] + name + (em && !/[\u4E00-\u9FFF]/.test(em) ? ' ' + em : '') + '</button>';
    });
  // 關於頁：原作的段落、提示、通知框換成經典版的英文／韓文
  const S = CLASSIC_SEGMENTS[l];
  for (const c of ['p2p-online-version', 'super-ai-edition', 'seungsu-ai', 'original-by', 'reverse-engineered-by', 'source-code-on', 'release-date']) {
    html = replaceBlock(html, new RegExp('<p class="' + c + '">[\\s\\S]*?</p>'), S[c]);
  }
  html = replaceBlock(html, /<div class="margin-top limit-width">[\s\S]*?(?=<div class="margin-top"><button type="button" id="close-about-btn")/, S.aboutBody);
  for (const id of ['notice-box-1', 'notice-box-2', 'loading-box', 'update-notification-message-box']) {
    const start = html.search(new RegExp('<div class="fade-in-box[^"]*" id="' + id + '">'));
    if (start < 0) throw new Error('找不到 ' + id);
    let depth = 0, end = -1;
    const re = /<div\b|<\/div>/g; re.lastIndex = start;
    for (let m; (m = re.exec(html));) { depth += m[0] === '<div' ? 1 : -1; if (depth === 0) { end = m.index + m[0].length; break; } }
    html = html.slice(0, start) + S[id] + html.slice(end);
  }
  // 子資料夾裡的頁面：靜態檔的相對路徑多一層
  html = html.replace(/(href|src)="(?!https?:|\/|#|\.\.\/)([^"]+)"/g, (m, a, u) => `${a}="../${u}"`);
  if (/[\u4E00-\u9FFF]/.test(html.replace(/対戦ぴかちゅ～|ﾋﾞｰﾁﾊﾞﾚｰ編|1人でぴかちゅ~|Chinese\(中文\)/g, ''))) {
    const left = html.replace(/対戦ぴかちゅ～|ﾋﾞｰﾁﾊﾞﾚｰ編|1人でぴかちゅ~|Chinese\(中文\)/g, '').match(/.{0,30}[\u4E00-\u9FFF]+.{0,30}/g);
    throw new Error(l + ' 頁還有中文：' + left.slice(0, 5).join(' ／ '));
  }
  mkdirSync(join(ROOT, l), { recursive: true });
  writeFileSync(join(ROOT, l, 'index.html'), html);
}

build('en');
build('ko');
console.log('已產生 en/index.html、ko/index.html');
