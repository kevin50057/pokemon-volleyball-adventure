// char-select — 角色選擇面板（桌機與手機共用）
// 依賴：characters。實際切換角色是點擊頁面中隱藏的 #p1-xxx-btn / #p2-xxx-btn，
// 讓遊戲本體原本的邏輯（含記住上次選擇）繼續運作。
// 這個 repo 只有遠征版：全遊戲鎖角色（舊版 PV_EDITION === 'adventure' 的分支一律成立）。
import type { CharacterId } from '../../../core/types';
import { svc, nextZ } from '../../../core/services';
import { store } from '../../../core/storage';
import { charById, charIds, charList } from '../chars-view';
import { CSS } from './style';
import { loadPortraits, paint, paintFrame, portrait } from './portraits';

type Side = 1 | 2;

// ---------- 目前選擇（讀遊戲本體標記的 .selected） ----------
// 遊戲本體要按了第一個畫面的「開始」才會載入；在那之前角色按鈕沒有作用、也沒有 .selected。
// 所以載入前的選擇先記在這裡（並寫進遊戲本體用的同一個儲存位置），載入後再補按一次。
const KEYS: Record<Side, string> = { 1: 'pv-offline-p1char', 2: 'pv-offline-p2char' };
let pending: Partial<Record<Side, CharacterId>> = {};
let pendingTimer = 0;
function gameReady(): boolean { return !!svc.ctrl; }
function isChar(v: string | null): v is CharacterId { return !!charById(v); }
function saved(n: Side): CharacterId | null {
  const v = store.get(KEYS[n]);
  return isChar(v) ? v : null;
}
// ---------- 遠征版：全遊戲鎖角色 ----------
// 解鎖狀態以闖關模式的存檔為準（campaign 的 owned）；沒有闖關模組時只開放起始 4 隻
const STARTERS = ['pikachu', 'vaporeon', 'flareon', 'jolteon'];
function unlocked(id: string): boolean {
  const PC = svc.campaign;
  return PC ? PC.owned(id) : STARTERS.indexOf(id) >= 0;
}
function fallback(n: Side): CharacterId { return n === 1 ? 'pikachu' : 'vaporeon'; }
function rawCurrent(n: Side): CharacterId {
  if (gameReady()) {
    const ids = charIds();
    for (let i = 0; i < ids.length; i++) {
      const b = document.getElementById('p' + n + '-' + ids[i] + '-btn');
      if (b && b.classList.contains('selected')) return ids[i];
    }
  }
  return pending[n] || saved(n) || (n === 1 ? 'bird' : 'pikachu');
}
function current(n: Side): CharacterId { const id = rawCurrent(n); return unlocked(id) ? id : fallback(n); }
// 選到鎖住的角色（例如經典版選的、或存檔是舊的）就換回可用的；闖關和連線進行中不動
function enforce(): void {
  if (!gameReady()) return;
  const NS = svc.net && svc.net.state;
  if (svc.campaign && svc.campaign.isActive()) return;
  if (NS && (NS.phase !== 'off' || NS.render)) return;
  ([1, 2] as const).forEach((n) => { if (!unlocked(rawCurrent(n))) choose(n, fallback(n)); });
}
function choose(n: Side, id: CharacterId): void {
  const b = document.getElementById('p' + n + '-' + id + '-btn');
  if (gameReady()) { if (b) b.click(); return; }
  pending[n] = id;
  store.set(KEYS[n], id);
  // 等遊戲本體載入（保留舊版每 200ms 檢查一次的時機：載入後才補按按鈕並刷新面板）
  if (!pendingTimer) pendingTimer = window.setInterval(() => {
    if (!gameReady()) return;
    clearInterval(pendingTimer); pendingTimer = 0;
    ([1, 2] as const).forEach((k) => {
      const pk = pending[k];
      const pb = pk && document.getElementById('p' + k + '-' + pk + '-btn');
      if (pb) pb.click();
    });
    pending = {};
    if (isOpen()) refresh();
  }, 200);
}

// ---------- 建立面板 ----------
interface SlotEls { el: HTMLDivElement; cv: HTMLCanvasElement; nm: HTMLElement; sk: HTMLElement }
let root: HTMLDivElement | null = null;
const slots: Partial<Record<Side, SlotEls>> = {};
const cards: Partial<Record<string, HTMLDivElement>> = {};
let descEl: HTMLElement;
let activeP: Side = 1, netMode = false;

/** 面板裡用 innerHTML 建好的元素，一定找得到。 */
function q<T extends Element = HTMLElement>(parent: ParentNode, sel: string): T {
  return parent.querySelector(sel) as T;
}

function build(): void {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  const r = document.createElement('div');
  root = r;
  r.id = 'pv-cs';
  r.innerHTML = '<div class="box" role="dialog" aria-label="選擇角色"><div class="top"></div><div class="grid"></div><div class="desc"></div><div class="hint">先點上方 1P 或 2P，再點角色。按 C 或 Esc 關閉。</div></div>';
  const top = q(r, '.top'), grid = q(r, '.grid');
  descEl = q(r, '.desc');

  ([1, 2] as const).forEach((n) => {
    const el = document.createElement('div');
    el.className = 'slot p' + n;
    el.innerHTML = '<span class="who">' + n + 'P ' + (n === 1 ? '左' : '右') + '</span>';
    const cv = portrait('pikachu', 64);
    el.appendChild(cv);
    const info = document.createElement('div');
    info.innerHTML = '<div class="nm"></div><div class="sk"></div>';
    el.appendChild(info);
    el.addEventListener('click', () => { activeP = n; refresh(); });
    top.appendChild(el);
    slots[n] = { el: el, cv: cv, nm: q(info, '.nm'), sk: q(info, '.sk') };
  });
  const x = document.createElement('button');
  x.className = 'x'; x.type = 'button'; x.textContent = '✕'; x.title = '關閉';
  x.addEventListener('click', close);
  top.appendChild(x);

  charList().forEach((c) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.appendChild(portrait(c.id, 64));
    card.insertAdjacentHTML('beforeend',
      '<div class="nm">' + c.name + '</div><div class="sk">' + c.skill + '</div>' +
      '<span class="ty" style="background:' + c.color + '">' + c.type + '</span>');
    card.addEventListener('click', () => { if (unlocked(c.id)) pick(c.id); else showLocked(c.id); });
    card.addEventListener('mouseenter', () => { showDesc(c.id); });
    card.addEventListener('mouseleave', () => { showDesc(current(activeP)); });
    grid.appendChild(card);
    cards[c.id] = card;
  });

  r.addEventListener('click', (e) => { if (e.target === r) close(); });
  document.body.appendChild(r);
}

function showLocked(id: string): void {
  const PC = svc.campaign, how = PC ? PC.howToGet(id) : '';
  descEl.innerHTML = '<b>？？？・尚未收服</b>' + (how ? '取得方式：' + how + '。' : '要在闖關模式中收服。');
}
function showDesc(id: string): void {
  const c = charById(id);
  if (!c) return;
  if (!unlocked(id)) { showLocked(id); return; }
  descEl.innerHTML = '<b style="color:' + c.color + '">' + c.name + '・' + c.skill + '</b>' + c.desc;
}

function refresh(): void {
  const sel: Record<Side, CharacterId> = { 1: current(1), 2: current(2) };
  ([1, 2] as const).forEach((n) => {
    const c = charById(sel[n]), sl = slots[n];
    if (!sl) return;   // build() 之後一定有
    sl.el.classList.toggle('active', activeP === n);
    sl.cv.dataset.id = sel[n];
    paint(sl.cv, sel[n]);
    sl.nm.textContent = c ? c.name : sel[n];
    sl.sk.textContent = c ? c.skill : '';
  });
  charIds().forEach((id) => {
    const card = cards[id], lk = !unlocked(id);
    const ch = charById(id);
    if (!card || !ch) return;   // 每個角色在 build() 時都建了卡片
    card.classList.toggle('lk', lk);
    q(card, '.nm').textContent = lk ? '？？？' : ch.name;
    q(card, '.sk').textContent = lk ? '尚未收服' : ch.skill;
    card.classList.toggle('sel-p1', sel[1] === id);
    card.classList.toggle('sel-p2', sel[2] === id);
    card.querySelectorAll('.mk').forEach((m) => { m.remove(); });
    if (sel[1] === id) card.insertAdjacentHTML('beforeend', '<span class="mk p1">1P</span>');
    if (sel[2] === id) card.insertAdjacentHTML('beforeend', '<span class="mk p2">2P</span>');
    // 闖關通關過的角色：左下角一顆獎章（金／銀／銅）
    const cm = card.querySelector('.cm'), PC = svc.campaign, tier = PC ? PC.medalTier(id) : 0;
    if (cm) cm.remove();
    const t = tier && PC ? PC.tiers[tier] : null;
    if (t) card.insertAdjacentHTML('beforeend', '<span class="cm" style="color:' + t.color + '" title="闖關' + t.name + '獎章">★</span>');
  });
  showDesc(sel[activeP]);
}

function pick(id: CharacterId): void {
  choose(activeP, id);
  if (netMode) { refresh(); close(); const np = document.getElementById('pv-net'); if (np && np.classList.contains('open') && svc.net) svc.net.open(); return; }
  if (activeP === 1) activeP = 2;   // 選完 1P 自動換 2P
  refresh();
}

function open(n?: Side, fromNet?: boolean): void {
  if (!root) return;
  if (n) activeP = n;
  // 連線房間裡只選自己的角色：只留一格，選完直接關掉回到連線面板
  netMode = fromNet === true;   // 只有從連線面板按「換角色」進來才是單格模式
  if (netMode) activeP = 1;
  root.classList.toggle('net', netMode);
  refresh();
  root.style.zIndex = String(nextZ());   // 最後打開的面板永遠在最上面
  root.classList.add('open');
  document.querySelectorAll('.dropdown.show,.submenu.show').forEach((d) => { d.classList.remove('show'); });
  document.querySelectorAll('.dropdown-btn.open,.submenu-btn.open').forEach((d) => { d.classList.remove('open'); });
}
function close(): void { if (root) root.classList.remove('open'); }
function isOpen(): boolean { return !!root && root.classList.contains('open'); }

export function init(): void {
  svc.charSelect = {
    open: open, close: close, current: current, unlocked: unlocked, portrait: portrait, paintFrame: paintFrame,
    toggle: () => { if (isOpen()) close(); else open(); },
  };
  build();
  loadPortraits();
  // 選單「角色」改成打開面板
  const menuBtn = document.getElementById('character-submenu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); open(); }, true);
  }
  setInterval(enforce, 800);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (isOpen()) close(); else open();
    } else if (e.code === 'Escape' && isOpen()) {
      close();
      e.stopImmediatePropagation();
    }
  }, true);
}
