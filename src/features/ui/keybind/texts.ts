/** 按鍵設定面板的文字（照舊版 keybind.js）。中文頁用 zh，其他語言用 en。 */
export interface Texts {
  menu: string; title: string; p1: string; p2: string;
  left: string; right: string; up: string; down: string; hit: string;
  press: string; esc: string; reset: string; done: string;
  hint: string;
  swapped: string; reserved: string;
  whyEsc: string; whySpace: string; whyC: string; whyTab: string; whyF: string; whyMod: string;
  saved: string; touch: string; size: string; small: string; normal: string; large: string;
  hand: string; leftHand: string; rightHand: string; note2p: string;
}

export const TEXTS: { zh: Texts; en: Texts } = {
  zh: {
    menu: '按鍵設定…', title: '按鍵設定', p1: '1P（左）', p2: '2P（右）',
    left: '← 左', right: '→ 右', up: '↑ 跳', down: '↓ 下', hit: '殺球',
    press: '請按新按鍵…', esc: 'Esc 取消', reset: '恢復預設', done: '完成',
    hint: '點一個格子，再按鍵盤上的新按鍵。按到已經在用的鍵會自動對調。',
    swapped: '已和 {who} 的「{act}」對調', reserved: '「{key}」是保留鍵（{why}），換一個吧',
    whyEsc: '取消／顯示選單', whySpace: '遊戲功能鍵', whyC: '角色選擇', whyTab: '切換焦點', whyF: '瀏覽器功能鍵', whyMod: '系統鍵',
    saved: '已儲存', touch: '觸控按鈕', size: '大小', small: '小', normal: '標準', large: '大',
    hand: '搖桿位置', leftHand: '左邊（預設）', rightHand: '右邊（左撇子）', note2p: '直式時按鈕已依螢幕寬度放到最大，「大」主要影響橫式；放不下時會自動縮小。開啟本機 2P 時固定用預設位置。',
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
  },
};
