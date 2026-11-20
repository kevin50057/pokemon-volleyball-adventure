// 連線對戰的介面文字（中文／英文）。
// 舊版在載入時讀 <html lang>；這裡改成 init() 時呼叫 initText() 才讀（import 時不碰 DOM）。

const ZH = {
  btn: '連線對戰', title: '連線對戰', host: '開房間', join: '加入', codePh: '房間代碼',
  myChar: '你的角色', change: '換角色', leave: '離開房間', start: '開始對戰', again: '再來一局',
  waitOpp: '等待對手加入…把代碼傳給朋友。', oppIn: '對手已加入', waitHost: '已加入，等待房主開始…',
  noHost: '房間裡還沒有房主。確認代碼正確，或請朋友先開房。', dup: '代碼撞到別人的房間了，請離開後重開。',
  noRoom: '這個環境無法連線。連線對戰需要登入，而且必須是這個作品所屬組織的成員或受邀者；用公開連結開啟的人無法連線。',
  connecting: '連線中…', you: '房主（左）', guest: '客人（右）', spec: '觀戰中', ping: '延遲',
  lostOpp: '對手斷線，等待重新連線…', lostHost: '連線中斷，重新連線中…', ended: '連線已結束，回到單人模式。',
  youWin: '你贏了！', youLose: '你輸了', hostWin: '房主獲勝', guestWin: '客人獲勝',
  note: '房主當左邊 1P、客人當右邊 2P。鍵盤兩組按鍵、手機觸控都能操作。房主的分頁要保持在前景，切到背景遊戲會停。',
  badCode: '代碼是 4 個英數字', full: '已有其他人在對戰，你會以觀戰身分加入。',
  selfDown: '你的網路中斷，重新連線中…', reconnecting: '重新連線中…', youLag: '你的連線不穩，房主正在等你…',
  hostHidden: '房主切到背景了，遊戲暫停中…', oppHidden: '對手切到背景了，等待中…', resume: '繼續',
  noRelay: '連線元件載入失敗，請檢查網路後重試。', hostLost: '房主連線中斷，等待中…', paused: '暫停中…', back: '回到房間', revoked: '你的連線權限被收回了，回到單人模式。', gaveUp: '一直連不上，先回到單人模式。',
};

export type Texts = typeof ZH;

const EN: Texts = {
  btn: 'Online', title: 'Online match', host: 'Create room', join: 'Join', codePh: 'Room code',
  myChar: 'Your character', change: 'Change', leave: 'Leave room', start: 'Start match', again: 'Rematch',
  waitOpp: 'Waiting for an opponent… share the code.', oppIn: 'Opponent joined', waitHost: 'Joined. Waiting for the host to start…',
  noHost: 'No host in this room yet. Check the code, or ask your friend to create the room first.', dup: 'This code is taken by another room. Leave and create a new one.',
  noRoom: 'Online play is not available here. You must be signed in and be a member of (or invited to) the organization that owns this artifact; public-link viewers cannot connect.',
  connecting: 'Connecting…', you: 'Host (left)', guest: 'Guest (right)', spec: 'Spectating', ping: 'Ping',
  lostOpp: 'Opponent disconnected, waiting…', lostHost: 'Connection lost, reconnecting…', ended: 'Online session ended. Back to single player.',
  youWin: 'You win!', youLose: 'You lose', hostWin: 'Host wins', guestWin: 'Guest wins',
  note: 'Host plays left (1P), guest plays right (2P). Either key set or touch controls work. Keep the host tab in the foreground.',
  badCode: 'Code is 4 letters/digits', full: 'A match is already running; you will spectate.',
  selfDown: 'Your connection dropped, reconnecting…', reconnecting: 'Reconnecting…', youLag: 'Your connection is unstable; the host is waiting…',
  hostHidden: 'Host switched away; game paused…', oppHidden: 'Opponent switched away; waiting…', resume: 'Resume',
  noRelay: 'Could not load the network module. Check your connection and retry.', hostLost: 'Lost the host, waiting…', paused: 'Paused…', back: 'Back to room', revoked: 'Your access was revoked. Back to single player.', gaveUp: 'Could not reconnect. Back to single player.',
};

/** 介面語言（<html lang> 的前兩個字）。 */
export let LANG = 'zh';
/** 目前語言的文字表（ES module 的 live binding：initText() 之後別的檔案讀到的就是新的）。 */
export let T: Texts = ZH;

export function initText(): void {
  LANG = (document.documentElement.lang || 'zh').slice(0, 2);
  T = LANG === 'zh' ? ZH : EN;
}
