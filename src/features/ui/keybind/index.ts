// keybind — 自訂按鍵（鍵盤 1P／2P）＋ 觸控按鈕大小與左右手
// 遊戲本體的鍵盤類別每次都拿 e.code 跟 this.value 比，所以只要改 keyboardArray[i].xxxKey.value 就能換鍵，
// 不用動遊戲本體。觸控按鈕送出的是模擬按鍵，所以也要跟著換（svc.touchKeys）。
import type { KeyState, Keyboard } from '../../../core/types';
import { svc, nextZ, onReady } from '../../../core/services';
import { store } from '../../../core/storage';
import { CSS } from './style';
import { TEXTS, type Texts } from './texts';

/**
 * 遊戲本體的按鍵物件（原作的 Key 類別）還有一個 `value`：這個鍵對應的 e.code（null = 停用）。
 * core/types.ts 的 KeyState 沒有列出這個欄位，這裡在區域補上並在 `keyOf()` 這一處轉型。
 */
type BoundKey = KeyState & { value: string | null };

type Action = 'left' | 'right' | 'up' | 'down' | 'hit';
type Side = 1 | 2;
type TouchSize = 's' | 'm' | 'l';
type KeyMap = Record<Action, string>;
interface Config { 1: KeyMap; 2: KeyMap; touch: { size: TouchSize; lefty: boolean } }

const STORE = 'pv-keys-v1';
const ACTIONS: readonly Action[] = ['left', 'right', 'up', 'down', 'hit'];
const DEFAULTS: Record<Side, KeyMap> = {
  1: { left: 'KeyD', right: 'KeyG', up: 'KeyR', down: 'KeyV', hit: 'KeyZ' },
  2: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', hit: 'Enter' },
};
const FIELD: Record<Action, 'leftKey' | 'rightKey' | 'upKey' | 'downKey' | 'powerHitKey'> =
  { left: 'leftKey', right: 'rightKey', up: 'upKey', down: 'downKey', hit: 'powerHitKey' };
const TOUCH_FIELD: Record<Action, 'left' | 'right' | 'up' | 'down' | 'action'> =
  { left: 'left', right: 'right', up: 'up', down: 'down', hit: 'action' };
const DOWN_RIGHT_1P = 'KeyF';   // 原作 1P 的「右下」鍵；被拿去綁別的動作時就停用

// 語言在 init 時才讀（import 不能有副作用）
let LANG = 'zh';
let T: Texts = TEXTS.zh;

function keyOf(kb: Keyboard, field: 'leftKey' | 'rightKey' | 'upKey' | 'downKey' | 'powerHitKey' | 'downRightKey'): BoundKey | undefined {
  // 型別轉換：見 BoundKey 的說明
  return kb[field] as BoundKey | undefined;
}

// ------------------------------------------------------------------
// 設定的讀寫
// ------------------------------------------------------------------
function validCode(c: unknown): c is string { return typeof c === 'string' && /^[A-Za-z][A-Za-z0-9]{0,23}$/.test(c); }
function clone<V>(o: V): V { return JSON.parse(JSON.stringify(o)) as V; }
function load(): Config {
  const cfg: Config = { 1: clone(DEFAULTS[1]), 2: clone(DEFAULTS[2]), touch: { size: 'm', lefty: false } };
  try {
    const raw = store.getJSON<unknown>(STORE);
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;   // 存檔內容不可信：逐欄檢查
      ([1, 2] as const).forEach((n) => {
        const m = (r[n] || {}) as Record<string, unknown>;
        ACTIONS.forEach((a) => { const v = m[a]; if (validCode(v) && !reservedWhy(v)) cfg[n][a] = v; });
      });
      const t = r.touch;
      if (t && typeof t === 'object') {
        const tt = t as Record<string, unknown>;
        if (tt.size === 's' || tt.size === 'm' || tt.size === 'l') cfg.touch.size = tt.size;
        cfg.touch.lefty = tt.lefty === true;
      }
    }
  } catch { /* 壞掉的存檔：用預設 */ }
  // 壞掉的存檔（同一個鍵綁兩個動作）就整組回到預設
  const seen: Record<string, boolean> = {};
  let dup = false;
  ([1, 2] as const).forEach((n) => { ACTIONS.forEach((a) => { const c = cfg[n][a]; if (seen[c]) dup = true; seen[c] = true; }); });
  if (dup) { cfg[1] = clone(DEFAULTS[1]); cfg[2] = clone(DEFAULTS[2]); }
  return cfg;
}
let cfg: Config = { 1: clone(DEFAULTS[1]), 2: clone(DEFAULTS[2]), touch: { size: 'm', lefty: false } };
function save(): void { store.set(STORE, JSON.stringify(cfg)); }

function reservedWhy(code: string): string {
  if (code === 'Escape') return T.whyEsc;
  if (code === 'Space') return T.whySpace;
  if (code === 'KeyC') return T.whyC;
  if (code === 'Tab') return T.whyTab;
  if (/^F\d{1,2}$/.test(code)) return T.whyF;
  if (/^(Meta|OS|Alt|Control|ContextMenu|CapsLock|Fn)/.test(code)) return T.whyMod;
  return '';
}

function label(code: string | null | undefined): string {
  if (!code) return '—';
  let m: RegExpExecArray | null;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return (LANG === 'zh' ? '數字鍵 ' : 'Num ') + m[1];
  const map: Record<string, string | undefined> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter', NumpadEnter: 'Num Enter',
    ShiftLeft: (LANG === 'zh' ? '左 Shift' : 'L Shift'), ShiftRight: (LANG === 'zh' ? '右 Shift' : 'R Shift'),
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Backspace: 'Backspace', Delete: 'Del',
    Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
    NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
  };
  return map[code] || code;
}

// ------------------------------------------------------------------
// 套用到遊戲
// ------------------------------------------------------------------
function applyKeyboard(): boolean {
  const c = svc.ctrl;
  if (!c || !c.keyboardArray) return false;
  ([1, 2] as const).forEach((n) => {
    const kb = c.keyboardArray[n - 1];
    if (!kb) return;
    ACTIONS.forEach((a) => {
      const k = keyOf(kb, FIELD[a]);
      if (k && k.value !== cfg[n][a]) { k.value = cfg[n][a]; k.isDown = false; k.isUp = true; }
    });
    const dr = n === 1 ? keyOf(kb, 'downRightKey') : undefined;
    if (dr) {
      const used = usedBy(DOWN_RIGHT_1P);
      dr.value = used ? null : DOWN_RIGHT_1P;
      dr.isDown = false;
    }
  });
  return true;
}
function applyTouch(): void {
  const tk = svc.touchKeys;
  if (tk) ([1, 2] as const).forEach((n) => { ACTIONS.forEach((a) => { tk[n][TOUCH_FIELD[a]] = cfg[n][a]; }); });
  const b = document.body;
  if (!b) return;
  b.classList.toggle('pv-lefty', !!cfg.touch.lefty);
  b.classList.remove('pv-touch-s', 'pv-touch-m', 'pv-touch-l');
  b.classList.add('pv-touch-' + cfg.touch.size);
  fitTouch();
}
function applyAll(): boolean { applyTouch(); return applyKeyboard(); }

// 觸控按鈕縮放：選「大」但螢幕太窄放不下時，自動縮到剛好不重疊
const SCALE: Record<string, number | undefined> = { s: 0.82, m: 1, l: 1.18 };
function fitTouch(): void {
  const b = document.body;
  if (!b) return;
  const want = SCALE[cfg.touch.size] || 1;
  const j = document.getElementById('p1-joystick-zone'), p = document.getElementById('p1-pad');
  // 注意：position:fixed 的元素 offsetParent 永遠是 null，要用實際大小判斷有沒有顯示
  const vis = (el: HTMLElement | null): el is HTMLElement => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  if (!vis(j) || !vis(p)) { b.style.setProperty('--pv-touch-scale', String(want)); return; }
  const cur = parseFloat(getComputedStyle(b).getPropertyValue('--pv-touch-scale')) || 1;
  const jr = j.getBoundingClientRect(), pr = p.getBoundingClientRect();
  const jw = jr.width / cur, pw = pr.width / cur;       // 換算回未縮放前的寬
  const room = window.innerWidth - 16;
  const fit = Math.min(want, room / (jw + pw));
  const v = fit < want ? Math.max(0.7, Math.floor(fit * 100) / 100) : want;
  b.style.setProperty('--pv-touch-scale', String(v));
}

function usedBy(code: string): { n: Side; a: Action } | null {
  for (const n of [1, 2] as const) for (let i = 0; i < ACTIONS.length; i++) if (cfg[n][ACTIONS[i]] === code) return { n: n, a: ACTIONS[i] };
  return null;
}

// ------------------------------------------------------------------
// 介面
// ------------------------------------------------------------------
interface Ui { root?: HTMLDivElement; msg?: HTMLElement }
interface Capture { btn: HTMLButtonElement; n: Side; a: Action }
const ui: Ui = {};
let capture: Capture | null = null;

function build(): void {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div');
  root.id = 'pv-keys';
  const rows = ACTIONS.map((a) =>
    '<tr><td class="act">' + T[a] + '</td>' +
    '<td><button type="button" class="k" data-n="1" data-a="' + a + '"></button></td>' +
    '<td><button type="button" class="k" data-n="2" data-a="' + a + '"></button></td></tr>',
  ).join('');
  root.innerHTML = '<div class="box" role="dialog" aria-label="' + T.title + '">' +
    '<h2><span>' + T.title + '</span><button type="button" class="x" aria-label="close">✕</button></h2>' +
    '<p class="hint">' + T.hint + '</p>' +
    '<table><thead><tr><th></th><th class="p1">' + T.p1 + '</th><th class="p2">' + T.p2 + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="msg"></div>' +
    '<div class="touch"><h3>' + T.touch + '</h3>' +
    '<div class="seg" data-k="size"><span>' + T.size + '</span><button type="button" data-v="s">' + T.small + '</button><button type="button" data-v="m">' + T.normal + '</button><button type="button" data-v="l">' + T.large + '</button></div>' +
    '<div class="seg" data-k="lefty"><span>' + T.hand + '</span><button type="button" data-v="0">' + T.leftHand + '</button><button type="button" data-v="1">' + T.rightHand + '</button></div>' +
    '<div class="note">' + T.note2p + '</div></div>' +
    '<div class="row"><button type="button" class="b rs">' + T.reset + '</button><button type="button" class="b go dn">' + T.done + '</button></div></div>';
  document.body.appendChild(root);
  // 以下元素都在上面的 innerHTML 裡，一定找得到
  ui.root = root; ui.msg = root.querySelector('.msg') as HTMLElement;
  if ('ontouchstart' in window || navigator.maxTouchPoints) root.classList.add('has-touch');
  (root.querySelector('.x') as HTMLElement).onclick = close;
  (root.querySelector('.dn') as HTMLElement).onclick = close;
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  (root.querySelector('.rs') as HTMLElement).onclick = function () {
    cancelCapture();
    cfg[1] = clone(DEFAULTS[1]); cfg[2] = clone(DEFAULTS[2]); cfg.touch = { size: 'm', lefty: false };
    save(); applyAll(); render(); msg(T.saved);
  };
  root.querySelectorAll<HTMLButtonElement>('button.k').forEach((b) => {
    b.addEventListener('click', () => { startCapture(b); });
  });
  root.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      // click 的目標一定是元素
      const tgt = e.target as Element | null;
      const v = tgt && tgt.getAttribute('data-v');
      if (v == null) return;
      if (seg.getAttribute('data-k') === 'size') cfg.touch.size = v as TouchSize;   // data-v 只有 s／m／l
      else cfg.touch.lefty = v === '1';
      save(); applyTouch(); render();
    });
  });

  // 選項選單裡加一項
  const dd = document.getElementById('options-dropdown');
  if (dd) {
    const mb = document.createElement('button');
    mb.type = 'button'; mb.id = 'pv-keys-btn'; mb.className = 'btn'; mb.textContent = T.menu;
    mb.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dropdown.show,.submenu.show').forEach((d) => { d.classList.remove('show'); });
      document.querySelectorAll('.dropdown-btn.open,.submenu-btn.open').forEach((d) => { d.classList.remove('open'); });
      open();
    });
    const rst = document.getElementById('reset-to-default-btn');
    dd.insertBefore(mb, rst || null);
  }
}

function render(): void {
  const root = ui.root;
  if (!root) return;
  root.querySelectorAll<HTMLButtonElement>('button.k').forEach((b) => {
    if (b === (capture && capture.btn)) return;
    const n = Number(b.getAttribute('data-n')) as Side, a = b.getAttribute('data-a') as Action;   // 按鈕是 build() 依 1／2 與 ACTIONS 建的
    b.textContent = label(cfg[n][a]);
  });
  root.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
    const cur = seg.getAttribute('data-k') === 'size' ? cfg.touch.size : (cfg.touch.lefty ? '1' : '0');
    seg.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.getAttribute('data-v') === cur); });
  });
}
function msg(t: string, err?: boolean): void {
  if (!ui.msg) return;
  ui.msg.textContent = t || ''; ui.msg.className = 'msg' + (err ? ' err' : '');
}
function open(): void {
  if (!ui.root) return;
  render(); msg(''); ui.root.style.zIndex = String(nextZ()); ui.root.classList.add('open');
}
function close(): void { cancelCapture(); if (ui.root) ui.root.classList.remove('open'); }
function isOpen(): boolean { return !!ui.root && ui.root.classList.contains('open'); }

function startCapture(btn: HTMLButtonElement): void {
  cancelCapture();
  capture = { btn: btn, n: Number(btn.getAttribute('data-n')) as Side, a: btn.getAttribute('data-a') as Action };
  btn.classList.add('wait');
  btn.innerHTML = T.press + '<br><small style="opacity:.6">' + T.esc + '</small>';
  msg('');
}
function cancelCapture(): void {
  if (!capture) return;
  capture.btn.classList.remove('wait');
  capture = null;
  render();
}
function finishCapture(code: string): void {
  const c = capture;
  if (!c) return;   // 只會在 capture 進行中被呼叫
  const why = reservedWhy(code);
  if (why) { msg(T.reserved.replace('{key}', label(code)).replace('{why}', why), true); return; }
  const old = cfg[c.n][c.a];
  const other = usedBy(code);
  let note = '';
  if (other && !(other.n === c.n && other.a === c.a)) {
    cfg[other.n][other.a] = old;   // 對調
    note = T.swapped.replace('{who}', other.n === 1 ? T.p1 : T.p2).replace('{act}', T[other.a]);
  }
  cfg[c.n][c.a] = code;
  c.btn.classList.remove('wait');
  const btn = c.btn;
  capture = null;
  save(); applyAll(); render();
  btn.classList.add('flash'); setTimeout(() => { btn.classList.remove('flash'); }, 500);
  msg(note || T.saved);
}

// ------------------------------------------------------------------
// 舊版在載入當下（比選角、闖關的初始化都早）就掛上的監聽。
// 視窗捕獲階段的監聽依註冊順序執行，這幾個要排在選角面板（C／Esc）和闖關畫面的按鍵處理之前，
// 按鍵設定面板在等新按鍵時才攔得住。main.ts 可以提早呼叫這個函式；init() 也會呼叫（只會掛一次）。
let guardsInstalled = false;
export function installKeyGuards(): void {
  if (guardsInstalled) return;
  guardsInstalled = true;
  window.addEventListener('resize', () => { setTimeout(fitTouch, 50); });
  window.addEventListener('orientationchange', () => { setTimeout(fitTouch, 300); });
  // 搶在遊戲之前收按鍵：視窗的捕獲階段最先執行，攔下來遊戲就收不到
  window.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (capture) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') { cancelCapture(); msg(''); return; }
      if (!e.code) return;
      finishCapture(e.code);
      return;
    }
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);
  window.addEventListener('keyup', (e) => { if (isOpen()) { e.stopImmediatePropagation(); } }, true);
}

// ------------------------------------------------------------------
export function init(): void {
  LANG = (document.documentElement.lang || 'zh').slice(0, 2);
  T = LANG === 'zh' ? TEXTS.zh : TEXTS.en;
  cfg = load();
  installKeyGuards();
  svc.keys = { config: () => clone(cfg), open: open, close: close, label: label, apply: applyAll };
  build();
  applyTouch();
  // 遊戲本體載入後套用鍵盤設定（取代舊版每 200ms 檢查、最多 200 次的輪詢）
  onReady(() => { applyKeyboard(); });
  // 觸控按鈕在選單畫面時是藏起來的，量不到大小；所以定期重算一次（很便宜）
  if ('ontouchstart' in window || navigator.maxTouchPoints) setInterval(fitTouch, 1000);
}
