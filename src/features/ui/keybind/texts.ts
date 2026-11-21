/** 按鍵設定面板的文字（照舊版 keybind.js）。依頁面語言用 zh／en／ko。 */
export interface Texts {
  menu: string; title: string; p1: string; p2: string;
  left: string; right: string; up: string; down: string; hit: string;
  press: string; esc: string; reset: string; done: string;
  hint: string;
  swapped: string; reserved: string;
  whyEsc: string; whySpace: string; whyC: string; whyTab: string; whyF: string; whyMod: string;
  saved: string; touch: string; size: string; small: string; normal: string; large: string;
  hand: string; leftHand: string; rightHand: string; note2p: string;
  /** 按鍵名稱：數字鍵盤的前綴、左右 Shift */
  numpad: string; shiftL: string; shiftR: string;
}

export const TEXTS: { zh: Texts; en: Texts; ko: Texts } = {
  zh: {
    menu: '按鍵設定…', title: '按鍵設定', p1: '1P（左）', p2: '2P（右）',
    left: '← 左', right: '→ 右', up: '↑ 跳', down: '↓ 下', hit: '殺球',
    press: '請按新按鍵…', esc: 'Esc 取消', reset: '恢復預設', done: '完成',
    hint: '點一個格子，再按鍵盤上的新按鍵。按到已經在用的鍵會自動對調。',
    swapped: '已和 {who} 的「{act}」對調', reserved: '「{key}」是保留鍵（{why}），換一個吧',
    whyEsc: '取消／顯示選單', whySpace: '遊戲功能鍵', whyC: '角色選擇', whyTab: '切換焦點', whyF: '瀏覽器功能鍵', whyMod: '系統鍵',
    saved: '已儲存', touch: '觸控按鈕', size: '大小', small: '小', normal: '標準', large: '大',
    hand: '搖桿位置', leftHand: '左邊（預設）', rightHand: '右邊（左撇子）', note2p: '直式時按鈕已依螢幕寬度放到最大，「大」主要影響橫式；放不下時會自動縮小。開啟本機 2P 時固定用預設位置。',
    numpad: '數字鍵 ', shiftL: '左 Shift', shiftR: '右 Shift',
  },
  en: {
    menu: 'Controls…', title: 'Controls', p1: '1P (left)', p2: '2P (right)',
    left: '← Left', right: '→ Right', up: '↑ Jump', down: '↓ Down', hit: 'Power hit',
    press: 'Press a key…', esc: 'Esc to cancel', reset: 'Reset', done: 'Done',
    hint: 'Tap a cell, then press the new key. Picking a key already in use swaps the two.',
    swapped: 'Swapped with {who} “{act}”', reserved: '“{key}” is reserved ({why}); pick another',
    whyEsc: 'cancel / menu', whySpace: 'game shortcut', whyC: 'character select', whyTab: 'focus', whyF: 'browser key', whyMod: 'system key',
    saved: 'Saved', touch: 'Touch buttons', size: 'Size', small: 'S', normal: 'M', large: 'L',
    hand: 'Joystick side', leftHand: 'Left (default)', rightHand: 'Right (left-handed)', note2p: 'In portrait the buttons already fill the width, so “L” mostly affects landscape; they shrink automatically if they would overlap. Local 2P always uses the default layout.',
    numpad: 'Num ', shiftL: 'L Shift', shiftR: 'R Shift',
  },
  ko: {
    menu: '키 설정…', title: '키 설정', p1: '1P (왼쪽)', p2: '2P (오른쪽)',
    left: '← 왼쪽', right: '→ 오른쪽', up: '↑ 점프', down: '↓ 아래', hit: '스파이크',
    press: '새 키를 누르세요…', esc: 'Esc 취소', reset: '기본값으로', done: '완료',
    hint: '칸을 누른 뒤 새 키를 누르세요. 이미 쓰고 있는 키를 고르면 서로 맞바뀝니다.',
    swapped: '{who} ‘{act}’ 키와 맞바꿨습니다', reserved: '‘{key}’는 예약된 키입니다({why}). 다른 키를 고르세요',
    whyEsc: '취소 / 메뉴 표시', whySpace: '게임 기능 키', whyC: '캐릭터 선택', whyTab: '포커스 이동', whyF: '브라우저 기능 키', whyMod: '시스템 키',
    saved: '저장됨', touch: '터치 버튼', size: '크기', small: '작게', normal: '보통', large: '크게',
    hand: '조이스틱 위치', leftHand: '왼쪽 (기본)', rightHand: '오른쪽 (왼손잡이)', note2p: '세로 화면에서는 버튼이 이미 화면 너비에 맞춰 최대 크기라서 ‘크게’는 주로 가로 화면에 적용됩니다. 공간이 부족하면 자동으로 줄어듭니다. 로컬 2P를 켜면 항상 기본 위치를 사용합니다.',
    numpad: 'Num ', shiftL: 'L Shift', shiftR: 'R Shift',
  },
};
