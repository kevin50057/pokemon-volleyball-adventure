/** 觸控介面的文字（依頁面語言）。按鈕很小，英文、韓文也盡量用短字。 */
import { pick } from '../../../core/i18n';

export const T = pick({
  zh: {
    jump: '跳', hit: '殺',
    skillDash: '衝', skillZip: '閃', skillWarp: '瞬', skillDrop: '降',
    p1: '左 1P', p2: '右 2P',
    cancelled: '觸控被系統中斷 ×',
  },
  en: {
    jump: 'Jump', hit: 'Hit',
    skillDash: 'Dash', skillZip: 'Zip', skillWarp: 'Warp', skillDrop: 'Drop',
    p1: 'Left 1P', p2: 'Right 2P',
    cancelled: 'Touch interrupted by system ×',
  },
  ko: {
    jump: '점프', hit: '강타',
    skillDash: '대시', skillZip: '전광', skillWarp: '워프', skillDrop: '낙하',
    p1: '왼쪽 1P', p2: '오른쪽 2P',
    cancelled: '시스템이 터치를 중단함 ×',
  },
});
