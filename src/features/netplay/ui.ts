// ============================================================
// 介面：連線面板（#pv-net）、右上角的延遲指示（#pv-net-hud）、畫面中央的提示（#pv-net-ov）
// ============================================================
import { svc, nextZ } from '../../core/services';
import { store } from '../../core/storage';
import { CODE_RE, newCode } from './protocol';
import { conn, net } from './state';
import { LANG, T } from './text';
import { charName, ctrlOf, ensureGame, now, selectedChar } from './util';
import { lobby, start, stop } from './session';
import { hostStart } from './host';

const css = [
  '#pv-net{position:fixed;inset:0;z-index:20001;display:none;align-items:center;justify-content:center;background:rgba(10,12,24,.82);font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;color:#fff}',
  '#pv-net.open{display:flex}',
  '#pv-net .box{width:min(440px,94vw);max-height:92vh;max-height:calc(100dvh - 24px);overflow:auto;background:#1b1e33;border:2px solid #3a3f66;border-radius:14px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.5)}',
  '#pv-net h2{margin:0 0 10px;font-size:18px;display:flex;justify-content:space-between;align-items:center}',
  '#pv-net .x{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;opacity:.7}',
  '#pv-net .row{display:flex;gap:8px;align-items:center;margin:10px 0}',
  '#pv-net button.b{flex:1;padding:11px 10px;border-radius:10px;border:0;background:#3f51b5;color:#fff;font-size:15px;font-weight:700;cursor:pointer}',
  '#pv-net button.b.alt{background:#2e3358}',
  '#pv-net button.b.go{background:#e53935}',
  '#pv-net button.b:disabled{opacity:.45;cursor:default}',
  '#pv-net input{flex:1;min-width:0;padding:10px;border-radius:10px;border:2px solid #3a3f66;background:#11132a;color:#fff;font-size:18px;letter-spacing:4px;text-transform:uppercase;text-align:center}',
  '#pv-net .code{font-size:42px;font-weight:900;letter-spacing:10px;text-align:center;margin:6px 0;color:#FFE14D}',
  '#pv-net .st{font-size:14px;line-height:1.6;opacity:.9;min-height:22px;white-space:pre-line}',
  '#pv-net .st.err{color:#ff8a80}',
  '#pv-net .ch{display:flex;align-items:center;gap:8px;font-size:14px;background:#262a47;border-radius:10px;padding:8px 10px}',
  '#pv-net .ch b{flex:1}',
  '#pv-net .ch button{background:#3a3f66;color:#fff;border:0;border-radius:8px;padding:6px 10px;cursor:pointer}',
  '#pv-net .note{font-size:12px;opacity:.55;margin-top:10px;line-height:1.5}',
  '#pv-net-hud{position:fixed;top:52px;right:10px;z-index:19000;display:none;gap:8px;align-items:center;font:600 12px/1 "Noto Sans TC",sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:5px 10px;border-radius:999px;pointer-events:auto}',
  '#pv-net-hud.on{display:flex}',
  '#pv-net-hud .dot{width:8px;height:8px;border-radius:50%;background:#66BB6A}',
  '#pv-net-hud .dot.mid{background:#FFCA28}#pv-net-hud .dot.bad{background:#EF5350}',
  '#pv-net-hud button{background:#555;color:#fff;border:0;border-radius:999px;padding:3px 8px;font-size:11px;cursor:pointer}',
  '#pv-net-ov{position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:19001;display:none;background:rgba(0,0,0,.75);color:#fff;padding:12px 18px;border-radius:12px;font:700 15px "Noto Sans TC",sans-serif;text-align:center}',
  '#pv-net-ov.on{display:block}',
].join('\n');

export interface UiRefs {
  root: HTMLElement;
  mych: HTMLElement; home: HTMLElement; inroom: HTMLElement; code: HTMLElement;
  act: HTMLElement; st: HTMLElement; dbg: HTMLElement; codeIn: HTMLInputElement;
  backRow: HTMLElement; back: HTMLElement;
  hud: HTMLElement; ov: HTMLElement;
}
// buildUI() 會把每個欄位都填好；在那之前只有 status()／overlay() 會被呼叫，而它們跟舊版一樣先檢查欄位在不在
export const ui = {} as UiRefs;

function el(tag: string, attrs: Record<string, string>, html?: string): HTMLElement {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (html != null) e.innerHTML = html;
  return e;
}
/** querySelector；找不到時跟舊版一樣，在下一步用到時才出錯。 */
function pick<E extends HTMLElement = HTMLElement>(root: ParentNode, s: string): E {
  return root.querySelector(s) as E;
}

export function buildUI(): void {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  ui.root = el('div', { id: 'pv-net' });
  ui.root.innerHTML = '<div class="box" role="dialog"><h2><span>' + T.title + '</span><button class="x" type="button">✕</button></h2>' +
    '<div class="ch"><span>' + T.myChar + '</span><b class="mych"></b><button type="button" class="chg">' + T.change + '</button></div>' +
    '<div class="home"><div class="row back-row" style="display:none"><button class="b go back" type="button"></button></div>' +
    '<div class="row"><button class="b mk" type="button">' + T.host + '</button></div>' +
    '<div class="row"><input class="code-in" maxlength="4" placeholder="' + T.codePh + '" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="b alt jn" type="button">' + T.join + '</button></div></div>' +
    '<div class="inroom" style="display:none"><div class="code"></div><div class="row act"></div><div class="row"><button class="b alt lv" type="button">' + T.leave + '</button></div></div>' +
    '<div class="st"></div><div class="dbg" style="font-size:11px;opacity:.4;margin-top:4px"></div><div class="note">' + T.note + '</div></div>';
  document.body.appendChild(ui.root);
  const q = <E extends HTMLElement = HTMLElement>(s: string): E => pick<E>(ui.root, s);
  ui.mych = q('.mych'); ui.home = q('.home'); ui.inroom = q('.inroom'); ui.code = q('.code');
  ui.act = q('.act'); ui.st = q('.st'); ui.dbg = q('.dbg'); ui.codeIn = q<HTMLInputElement>('.code-in');
  q('.x').onclick = closePanel;
  ui.root.addEventListener('click', (e) => { if (e.target === ui.root) closePanel(); });
  q('.chg').onclick = () => { if (svc.charSelect) svc.charSelect.open(1, true); };
  q('.mk').onclick = () => { if (net.phase === 'off' && !conn.joining) start('host', newCode()); };
  ui.backRow = q('.back-row'); ui.back = q('.back');
  ui.back.onclick = () => { const l = lastRoom(); if (l) start(l.role, l.code); };
  q('.jn').onclick = () => {
    const c = (ui.codeIn.value || '').trim().toLowerCase();
    if (!CODE_RE.test(c)) { status(T.badCode, true); return; }
    start('guest', c);
  };
  ui.codeIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') pick(ui.root, '.jn').click(); });
  ui.codeIn.addEventListener('keyup', (e) => { e.stopPropagation(); });
  q('.lv').onclick = () => { stop(); };

  ui.hud = el('div', { id: 'pv-net-hud' }, '<span class="dot"></span><span class="who"></span><span class="pg"></span><button type="button">' + T.leave + '</button>');
  pick(ui.hud, 'button').onclick = () => { stop(); };
  document.body.appendChild(ui.hud);
  ui.ov = el('div', { id: 'pv-net-ov' });
  document.body.appendChild(ui.ov);

  // 選單列加一顆「連線對戰」
  const left = document.querySelector('#menu-bar .btn-container.left');
  if (left) {
    const wrap = el('div', { class: 'relative-container' });
    const b = el('button', { type: 'button', id: 'pv-net-btn', class: 'btn' }, T.btn);
    b.onclick = (e) => { e.stopPropagation(); ensureGame(); openPanel(); };   // 趁玩家還在選角色、輸入代碼時先把遊戲載好
    wrap.appendChild(b);
    left.insertBefore(wrap, left.querySelector('.color-scheme-toggle-switch-container'));
  }
  window.setInterval(refreshChar, 700);
}

function refreshChar(): void {
  const c = selectedChar(1);
  if (c !== net.myCh) net.myCh = c;
  if (ui.mych) ui.mych.textContent = charName(net.myCh);
}
export function status(t: string, err?: boolean): void { if (!ui.st) return; ui.st.textContent = t || ''; ui.st.className = 'st' + (err ? ' err' : ''); }
export function openPanel(): void { refreshChar(); renderPanel(); ui.root.style.zIndex = String(nextZ()); ui.root.classList.add('open'); /* 不暫停：讓背景照跑 */ }
export function closePanel(): void { ui.root.classList.remove('open'); }
export function panelOpen(): boolean { return ui.root.classList.contains('open'); }
export function overlay(t: string): void { if (!ui.ov) return; ui.ov.textContent = t || ''; ui.ov.classList.toggle('on', !!t); }

function resultText(): string {
  const c = ctrlOf();
  if (!c || net.phase !== 'end') return '';
  const p1w = c.physics.player1.isWinner, p2w = c.physics.player2.isWinner;
  if (!p1w && !p2w) return '';
  const mine = net.role === 'host' ? p1w : (net.hostRole === 'player' ? p2w : null);
  const head = mine === null ? (p1w ? T.hostWin : T.guestWin) : (mine ? T.youWin : T.youLose);
  return head + '  ' + c.scores[0] + ' : ' + c.scores[1] + '\n';
}

function diag(): string {
  let t = '';
  try { t += ' conn:' + (net.room && net.room.connected ? (net.room.connected() ? 'Y' : 'N') : '?'); } catch (e) { t += ' conn:err'; }
  // 自架層和假房間的 lobby 沒有 peers()：舊版在這裡丟例外被接住、什麼都不加，結果一樣
  try { if (lobby && lobby.peers) t += ' lobby:' + lobby.peers().length + (lobby.connected() ? 'Y' : 'N'); } catch (e) { /* 同上 */ }
  try { if (net.room && net.room.info) t += ' · ' + net.room.info(); } catch (e) { /* 除錯資訊 */ }
  if (net.lastErr) t += ' err:' + net.lastErr;
  return t;
}

export interface LastRoom { role: 'host' | 'guest'; code: string }
export function lastRoom(): LastRoom | null {
  try {
    const l = JSON.parse(store.get('pv-net-last', true) || 'null') as { role?: unknown; code?: unknown } | null;
    return l && CODE_RE.test(l.code as string) && (l.role === 'host' || l.role === 'guest') ? l as LastRoom : null;
  } catch (e) { return null; }
}

export function renderPanel(): void {
  const inRoom = net.phase !== 'off';
  const l = !inRoom && lastRoom();
  if (ui.backRow) { ui.backRow.style.display = l ? '' : 'none'; if (l) ui.back.textContent = T.back + ' ' + l.code.toUpperCase() + '（' + (l.role === 'host' ? T.you : T.guest) + '）'; }
  if (ui.dbg) ui.dbg.textContent = inRoom ? (LANG === 'zh' ? '房間內 ' : 'In room: ') + (net.peerCount || 0) + (LANG === 'zh' ? ' 人' : '') + '  [' + (net.peerDbg || '') + ']' + diag() : '';
  ui.home.style.display = inRoom ? 'none' : '';
  ui.inroom.style.display = inRoom ? '' : 'none';
  ui.code.textContent = net.code.toUpperCase();
  ui.act.innerHTML = '';
  if (!inRoom) return;
  if (net.role === 'host') {
    const go = el('button', { type: 'button', class: 'b go' }, net.phase === 'end' ? T.again : T.start) as HTMLButtonElement;
    go.disabled = !net.opp || net.phase === 'play';
    go.onclick = () => { hostStart(); };
    ui.act.appendChild(go);
    if (net.phase === 'lobby' || net.phase === 'end') {
      if (!net.room) status(conn.lostSince ? T.reconnecting : T.connecting, !!conn.lostSince);
      else if (net.msg === 'dup') status(T.dup, true);
      else status(resultText() + (net.opp ? T.oppIn + '：' + charName(net.oppCh) : T.waitOpp));
    }
  } else {
    if (!net.room) status(conn.lostSince ? T.reconnecting : T.connecting, !!conn.lostSince);
    else if (!net.hostPeer && now() - net.joinedAt > 6000) status(T.noHost, true);
    else if (!net.hostPeer) status(T.connecting);
    else if (net.render && net.hostRole === 'spec') status(T.spec);
    else status(resultText() + T.waitHost);
  }
}

export function hud(): void {
  const on = net.phase === 'play' || net.phase === 'end';
  ui.hud.classList.toggle('on', on);
  if (!on) return;
  const who = net.role === 'host' ? T.you : (net.hostRole === 'spec' ? T.spec : T.guest);
  pick(ui.hud, '.who').textContent = who;
  const ms = Math.round(net.rtt);
  pick(ui.hud, '.pg').textContent = net.rtt ? T.ping + ' ' + ms + 'ms' : '';
  pick(ui.hud, '.dot').className = 'dot' + (ms > 180 ? ' bad' : ms > 90 ? ' mid' : '');
}
