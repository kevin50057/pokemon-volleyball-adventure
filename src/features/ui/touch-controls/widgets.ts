/**
 * 觸控元件：搖桿、跳／殺按鈕區、技能鍵。
 */
import type { TouchKeySet } from '../../../core/services';
import { svc } from '../../../core/services';
import { noteCancel, pressKey, releaseKey } from './keys';
import { SKILLS, joyX, myPlayer, skillReq, towardBall } from './assist';

type Dir = 'left' | 'right' | 'up' | 'down';
type Dirs = Record<Dir, boolean>;
// 跟舊版 `for (var d in curDirs)` 的走訪順序一樣（物件建立時的鍵順序）
const DIRS: readonly Dir[] = ['left', 'right', 'up', 'down'];

/** Touch.target 的型別是 EventTarget；觸控事件的目標一定是 DOM 節點。 */
function targetNode(t: Touch): Node { return t.target as Node; }

// ========== JOYSTICK ==========
export function createJoystick(keys: TouchKeySet, side: 'p1' | 'p2'): HTMLDivElement {
  const zone = document.createElement('div');
  zone.className = 'joystick-zone';
  zone.id = side + '-joystick-zone';

  const base = document.createElement('div');
  base.className = 'joystick-base';
  const knob = document.createElement('div');
  knob.className = 'joystick-knob';
  base.appendChild(knob);
  zone.appendChild(base);

  let active = false, touchId: number | null = null;
  let baseRect: DOMRect, cx = 0, cy = 0, maxR = 50;
  let curDirs: Dirs = { left: false, right: false, up: false, down: false };

  function updateKeys(dx: number, dy: number): void {
    const dist = Math.sqrt(dx * dx + dy * dy);
    const deadzone = 12;
    const newDirs: Dirs = { left: false, right: false, up: false, down: false };
    if (dist > deadzone) {
      // 搖桿只管左右（和往下）；跳躍改用右邊的按鈕，才不會推搖桿時誤跳
      if (dx < -10) newDirs.left = true;
      if (dx > 10) newDirs.right = true;
      if (dy > 22 && dy > Math.abs(dx) * 0.8) newDirs.down = true;
    }
    for (const d of DIRS) {
      if (newDirs[d] && !curDirs[d]) pressKey(keys[d]);
      if (!newDirs[d] && curDirs[d]) releaseKey(keys[d]);
    }
    curDirs = newDirs;
    joyX[side === 'p1' ? 0 : 1] = newDirs.left ? -1 : newDirs.right ? 1 : 0;
  }

  function moveKnob(dx: number, dy: number): void {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxR) { dx = dx / dist * maxR; dy = dy / dist * maxR; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    updateKeys(dx, dy);
  }

  function resetKnob(): void {
    knob.style.transform = 'translate(0,0)';
    for (const d of DIRS) { if (curDirs[d]) releaseKey(keys[d]); }
    curDirs = { left: false, right: false, up: false, down: false };
    joyX[side === 'p1' ? 0 : 1] = 0;
  }

  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (active) return;
    let t: Touch | null = null;
    for (let i = 0; i < e.changedTouches.length; i++) if (zone.contains(targetNode(e.changedTouches[i]))) { t = e.changedTouches[i]; break; }
    if (!t) return;
    touchId = t.identifier;
    active = true;
    baseRect = base.getBoundingClientRect();
    maxR = Math.max(40, baseRect.width * 0.4);   // 搖桿大小會隨螢幕變（直式比較大），推動範圍跟著變
    cx = baseRect.left + baseRect.width / 2;
    cy = baseRect.top + baseRect.height / 2;
    moveKnob(t.clientX - cx, t.clientY - cy);
    base.classList.add('active');
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        moveKnob(e.changedTouches[i].clientX - cx, e.changedTouches[i].clientY - cy);
        break;
      }
    }
  }, { passive: false });

  function endTouch(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        active = false; touchId = null;
        resetKnob();
        base.classList.remove('active');
        break;
      }
    }
  }
  zone.addEventListener('touchend', endTouch, { passive: false });
  zone.addEventListener('touchcancel', (e) => { noteCancel(); endTouch(e); }, { passive: false });
  zone.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  return zone;
}

// ========== 按鈕區：跳躍＋殺球 ==========
// 兩顆按鈕緊貼在一起，由同一個觸控區判定：拇指按住「跳」之後直接滑到「殺」就能跳殺，不用抬手；
// 按在兩顆中間會同時按下兩顆
/** 舊版把技能鍵掛在 `pad.skillBtn` 上；這裡改成一起回傳。 */
export interface Pad { pad: HTMLDivElement; skillBtn: HTMLDivElement }

export function createPad(keys: TouchKeySet, side: 'p1' | 'p2'): Pad {
  const pad = document.createElement('div');
  pad.className = 'touch-pad';
  pad.id = side + '-pad';
  const jump = document.createElement('div'), hit = document.createElement('div');
  jump.className = 'touch-btn pad-btn pad-jump'; jump.textContent = '跳';
  hit.className = 'touch-btn pad-btn pad-hit'; hit.textContent = '殺';
  pad.appendChild(jump); pad.appendChild(hit);
  // 注意：跟舊版一樣，跳／殺的按鍵代碼在建立時就記下來（不會跟著自訂按鍵改；搖桿和技能鍵則是當下讀）
  const btns: Array<{ el: HTMLDivElement; key: string }> = [
    { el: jump, key: keys.up }, { el: hit, key: keys.action },
  ];
  const touches: Record<number, [boolean, boolean]> = {};   // identifier -> [在跳上, 在殺上]

  function which(t: Touch): [boolean, boolean] {
    const d = btns.map((b) => {
      const r = b.el.getBoundingClientRect();
      return Math.hypot(t.clientX - (r.left + r.width / 2), t.clientY - (r.top + r.height / 2)) / (r.width / 2);
    });
    const on: [boolean, boolean] = [d[0] < 1.15, d[1] < 1.15];
    if (!on[0] && !on[1]) on[d[0] < d[1] ? 0 : 1] = true;   // 按在外圍：算最近的那顆
    return on;
  }
  function refresh(): void {
    btns.forEach((b, i) => {
      let down = false;
      for (const id in touches) if (touches[id][i]) down = true;
      if (down) pressKey(b.key); else releaseKey(b.key);
      b.el.classList.toggle('active', down);
    });
  }
  // 多點觸控：瀏覽器在任何一根手指移動時，會把所有移動中的手指都通知給每個按鈕區，
  // 所以只處理「在這個按鈕區上按下去」的手指，不然搖桿那根手指會被當成按「跳」
  function onStart(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (pad.contains(targetNode(t))) touches[t.identifier] = which(t);
    }
    refresh();
  }
  function onMove(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (touches[t.identifier]) touches[t.identifier] = which(t);
    }
    refresh();
  }
  function onEnd(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) delete touches[e.changedTouches[i].identifier];
    refresh();
  }
  pad.addEventListener('touchstart', onStart, { passive: false });
  pad.addEventListener('touchmove', onMove, { passive: false });
  pad.addEventListener('touchend', onEnd, { passive: false });
  pad.addEventListener('touchcancel', (e) => { noteCancel(); onEnd(e); }, { passive: false });
  pad.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  // 技能鍵：只有目前角色有主動技能時才顯示（見 index.ts 的更新迴圈）。
  // 自己處理觸控、不往上傳，不然按鈕區會把它當成最近的「跳」
  const skill = document.createElement('div');
  skill.className = 'touch-btn pad-skill';
  pad.appendChild(skill);
  const idx = side === 'p1' ? 0 : 1;
  let held: string | null = null;
  skill.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    const c = svc.ctrl, me = c && myPlayer(c, idx), sk = me && SKILLS[me.character];
    if (!c || !me || !sk) return;
    skill.classList.add('active');
    if (sk.hold) { held = keys[sk.hold]; pressKey(held); }
    else skillReq[idx] = (joyX[idx] || towardBall(c, me)) * sk.dash;
  }, { passive: false });
  function skillEnd(e: TouchEvent): void {
    e.preventDefault(); e.stopPropagation();
    skill.classList.remove('active');
    if (held) { releaseKey(held); held = null; }
  }
  skill.addEventListener('touchmove', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  skill.addEventListener('touchend', skillEnd, { passive: false });
  skill.addEventListener('touchcancel', skillEnd, { passive: false });
  return { pad: pad, skillBtn: skill };
}
