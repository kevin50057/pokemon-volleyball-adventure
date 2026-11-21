// touch-controls — 手機觸控：搖桿、跳／殺按鈕、技能鍵、按住殺球自動出手、2P 切換、選角按鈕、直式資訊條
// 不是觸控裝置就什麼都不做（也不提供 svc.touchKeys）。
import { svc } from '../../../core/services';
import type { SideState } from '../../../core/side-state';
import { hooks } from '../../../core/hooks';
import { charById, typeColor } from '../chars-view';
import { P1_KEYS, P2_KEYS } from './keys';
import { SKILLS, assist, myPlayer } from './assist';
import { createJoystick, createPad } from './widgets';
import { T } from './texts';

export function init(): void {
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;

  // 給 keybind 用：自訂按鍵後，觸控要送出新的按鍵代碼（直接改這兩個物件的內容）
  svc.touchKeys = { 1: P1_KEYS, 2: P2_KEYS };

  // 擋掉瀏覽器自己的雙指縮放／捲動手勢，避免它們搶走觸控
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => {
    document.addEventListener(ev, (e) => { e.preventDefault(); }, { passive: false });
  });

  // 遊戲讀完每組鍵盤的按鍵之後，接上觸控輔助（取代舊版改寫 kb.getInput）
  hooks.afterInput.use((next, c, kb, i) => { next(c, kb, i); assist(c, kb, i); });

  // ========== BUILD CONTROLS ==========
  const p1Joystick = createJoystick(P1_KEYS, 'p1');
  const p1Action = createPad(P1_KEYS, 'p1');
  const p2Joystick = createJoystick(P2_KEYS, 'p2');
  const p2Action = createPad(P2_KEYS, 'p2');
  p2Joystick.style.display = 'none';
  p2Action.pad.style.display = 'none';

  document.body.appendChild(p1Joystick);
  document.body.appendChild(p1Action.pad);
  document.body.appendChild(p2Joystick);
  document.body.appendChild(p2Action.pad);

  // 技能鍵跟著角色出現／消失（百變怪會中途換角色），冷卻中變淡
  setInterval(() => {
    const c = svc.ctrl;
    if (!c || !c.physics) return;
    const st = svc.abilities && svc.abilities.state && svc.abilities.state();
    [p1Action, p2Action].forEach((pad, i) => {
      const me = myPlayer(c, i), sk = SKILLS[me.character], b = pad.skillBtn;
      b.classList.toggle('show', !!sk);
      if (!sk) return;
      if (b.textContent !== sk.label) b.textContent = sk.label;
      const s: Partial<SideState> = (st && st[me.isPlayer2 ? 'p2' : 'p1']) || {};
      // undefined > 0 是 false，跟舊版一樣；`?? 0` 只是讓型別成立
      b.classList.toggle('cd', (s.qaCooldown ?? 0) > 0 || (s.tpCD ?? 0) > 0 || me.dashCooldown > 0 || !!me.isDashing);
    });
  }, 150);

  // 2P toggle
  const toggle2P = document.createElement('div');
  toggle2P.id = 'toggle-2p-btn';
  toggle2P.textContent = '2P';
  let show2P = false;
  toggle2P.addEventListener('click', () => {
    show2P = !show2P;
    p2Joystick.style.display = show2P ? 'block' : 'none';
    p2Action.pad.style.display = show2P ? 'block' : 'none';
    toggle2P.style.background = show2P ? 'rgba(100,255,100,0.5)' : 'rgba(100,100,255,0.4)';
    document.body.classList.toggle('pv-2p-on', show2P);
  });
  document.body.appendChild(toggle2P);

  // ========== CHARACTER SELECT OVERLAY ==========
  const charSelectBtn = document.createElement('div');
  charSelectBtn.id = 'char-select-btn';
  charSelectBtn.textContent = '🎭';
  charSelectBtn.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:10001;width:36px;height:28px;border-radius:6px;background:rgba(0,0,0,0.6);border:2px solid rgba(255,255,255,0.4);color:white;font-size:16px;display:flex;justify-content:center;align-items:center;touch-action:manipulation;user-select:none;-webkit-touch-callout:none;cursor:pointer;';
  document.body.appendChild(charSelectBtn);
  // 角色選擇改用 char-select 的共用面板
  function openCharSelect(e: Event | null): void { if (e) e.preventDefault(); if (svc.charSelect) svc.charSelect.toggle(); }
  charSelectBtn.addEventListener('touchend', openCharSelect, { passive: false });
  charSelectBtn.addEventListener('click', () => { openCharSelect(null); });

  // ========== MENU DROPDOWN HANDLING ==========
  function checkDropdowns(): void {
    const open = document.querySelector('.dropdown.show,.submenu.show');
    if (open) {
      p1Joystick.style.opacity = '0'; p1Action.pad.style.opacity = '0';
      p2Joystick.style.opacity = '0'; p2Action.pad.style.opacity = '0';
      toggle2P.style.display = 'none'; charSelectBtn.style.display = 'none';
    } else {
      p1Joystick.style.opacity = '1'; p1Action.pad.style.opacity = '1';
      p2Joystick.style.opacity = '1'; p2Action.pad.style.opacity = '1';
      toggle2P.style.display = 'flex'; charSelectBtn.style.display = 'flex';
    }
  }
  const observer = new MutationObserver(checkDropdowns);
  const menuBar = document.getElementById('menu-bar');
  if (menuBar) {
    observer.observe(menuBar, { attributes: true, attributeFilter: ['class'], subtree: true });
    menuBar.addEventListener('touchend', (e) => {
      // 觸控事件的目標一定是元素
      const btn = (e.target as Element).closest('.submenu-btn');
      if (!btn) return;
      e.stopPropagation();
      // .submenu-btn 一定包在 .relative-container 裡
      const sub = (btn.parentElement as HTMLElement).querySelector('.submenu');
      if (sub) {
        const shown = sub.classList.contains('show');
        document.querySelectorAll('.submenu.show').forEach((s) => { s.classList.remove('show'); });
        document.querySelectorAll('.submenu-btn.open').forEach((s) => { s.classList.remove('open'); });
        if (!shown) { sub.classList.add('show'); btn.classList.add('open'); }
      }
    }, { passive: false });
  }
  document.addEventListener('click', () => { setTimeout(checkDropdowns, 50); }, true);
  document.addEventListener('touchend', () => { setTimeout(checkDropdowns, 50); }, true);

  // ========== 直式：雙方角色與技能資訊條 ==========
  const info = document.createElement('div');
  info.id = 'pv-portrait-info';
  document.body.appendChild(info);
  let lastInfo = '';
  setInterval(() => {
    const c = svc.ctrl;
    if (!c || !c.physics) return;
    const rows: Array<[string, string]> = [[T.p1, c.physics.player1.character], [T.p2, c.physics.player2.character]];
    const key = rows.map((r) => r[1]).join('|');
    if (key === lastInfo) return;
    lastInfo = key;
    info.innerHTML = '';
    rows.forEach((r) => {
      const ch = charById(r[1]); if (!ch) return;
      const row = document.createElement('div'); row.className = 'row';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = typeColor(ch.type) || '#999';
      const side = document.createElement('span'); side.className = 'side'; side.textContent = r[0];
      const name = document.createElement('b'); name.textContent = ch.name;
      const ab = document.createElement('span'); ab.className = 'ab'; ab.textContent = ch.skill || '';
      row.appendChild(dot); row.appendChild(side); row.appendChild(name); row.appendChild(ab);
      info.appendChild(row);
    });
  }, 500);

  // Prevent zoom
  document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTE = 0;
  document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTE <= 300) e.preventDefault(); lastTE = n; }, { passive: false });

  console.log('Joystick controls loaded');
}
