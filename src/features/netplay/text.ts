// 連線對戰的介面文字（中文／英文／韓文）。
// 舊版在載入時讀 <html lang>；這裡改成 init() 時呼叫 initText() 才讀（import 時不碰 DOM）。
import { pick } from '../../core/i18n';

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
  inRoom: '房間內 {n} 人', backRoom: '{back} {code}（{role}）', colon: '：',
  linkDirect: '直連', linkMixed: '直連+中繼', linkRelay: '中繼', linkWait: '等待', relays: ' · 中繼伺服器 ',
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
  inRoom: 'In room: {n}', backRoom: '{back} {code} ({role})', colon: ': ',
  linkDirect: 'Direct', linkMixed: 'Direct+Relay', linkRelay: 'Relay', linkWait: 'Waiting', relays: ' · Relay servers ',
};

const KO: Texts = {
  btn: '온라인 대전', title: '온라인 대전', host: '방 만들기', join: '참가', codePh: '방 코드',
  myChar: '내 캐릭터', change: '캐릭터 변경', leave: '방 나가기', start: '대전 시작', again: '한 판 더',
  waitOpp: '상대를 기다리는 중… 친구에게 코드를 보내세요.', oppIn: '상대가 들어왔습니다', waitHost: '참가했습니다. 방장이 시작하기를 기다리는 중…',
  noHost: '방에 아직 방장이 없습니다. 코드가 맞는지 확인하거나, 친구에게 먼저 방을 만들어 달라고 하세요.', dup: '다른 방과 코드가 겹쳤습니다. 나간 뒤 다시 만들어 주세요.',
  noRoom: '이 환경에서는 연결할 수 없습니다. 온라인 대전은 로그인이 필요하고, 이 작품을 소유한 조직의 멤버이거나 초대받은 사람이어야 합니다. 공개 링크로 연 사람은 연결할 수 없습니다.',
  connecting: '연결 중…', you: '방장 (왼쪽)', guest: '손님 (오른쪽)', spec: '관전 중', ping: '지연',
  lostOpp: '상대의 연결이 끊겼습니다. 재연결을 기다리는 중…', lostHost: '연결이 끊겼습니다. 재연결 중…', ended: '연결이 종료되었습니다. 싱글 플레이로 돌아갑니다.',
  youWin: '이겼습니다!', youLose: '졌습니다', hostWin: '방장 승리', guestWin: '손님 승리',
  note: '방장은 왼쪽 1P, 손님은 오른쪽 2P입니다. 키보드 두 세트와 모바일 터치 모두 사용할 수 있습니다. 방장의 탭은 앞에 띄워 두세요. 백그라운드로 전환하면 게임이 멈춥니다.',
  badCode: '코드는 영문/숫자 4자리입니다', full: '이미 다른 사람들이 대전 중이라 관전자로 참가합니다.',
  selfDown: '네트워크가 끊겼습니다. 재연결 중…', reconnecting: '재연결 중…', youLag: '연결이 불안정합니다. 방장이 기다리는 중…',
  hostHidden: '방장이 다른 화면으로 전환해 게임이 일시 정지되었습니다…', oppHidden: '상대가 다른 화면으로 전환했습니다. 기다리는 중…', resume: '계속',
  noRelay: '연결 모듈을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.', hostLost: '방장의 연결이 끊겼습니다. 기다리는 중…', paused: '일시 정지 중…', back: '방으로 돌아가기', revoked: '연결 권한이 회수되었습니다. 싱글 플레이로 돌아갑니다.', gaveUp: '계속 연결되지 않아 싱글 플레이로 돌아갑니다.',
  inRoom: '방 안 {n}명', backRoom: '{back} {code} ({role})', colon: ': ',
  linkDirect: '직접 연결', linkMixed: '직접+중계', linkRelay: '중계', linkWait: '대기', relays: ' · 중계 서버 ',
};

/** 目前語言的文字表（ES module 的 live binding：initText() 之後別的檔案讀到的就是新的）。 */
export let T: Texts = ZH;

export function initText(): void {
  T = pick({ zh: ZH, en: EN, ko: KO });
}
