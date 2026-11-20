// 蓋在大廳上的全螢幕演出：收服動畫、通關動畫、通關證書
import { svc } from '../../../core/services';
import { CONF, FONT, STAGES, tierInfo, tierOf } from '../config';
import { CH } from '../chars';
import { camp } from '../state';
import type { Run } from '../state';
import { cry, sfx } from '../sfx';
import { R, S, anim, esc, fill, fmtTime, openRoot } from './dom';
import { nextGoal } from './screens';

/** 演出層的「主要動作」（Enter／空白／殺球鍵）。舊版掛在 ov._primary 上。 */
export const primaryOf = new WeakMap<Element, () => void>();

// ---------- 收服動畫 ----------
function confettiHtml(n: number, colors: string[]): string {
  let h = '';
  for (let i = 0; i < n; i++) h += '<i class="cf" style="left:' + (i * 97 % 100) + '%;background:' + colors[i % colors.length] + ';animation-duration:' + (1.6 + (i % 5) * 0.35) + 's;animation-delay:' + (-(i % 7) * 0.3) + 's"></i>';
  return h;
}
function overlay(cls: string, html: string): HTMLElement {
  const ov = document.createElement('div');
  ov.className = 'ov ' + cls; ov.innerHTML = html;
  R().appendChild(ov); fill(ov); openRoot();
  camp.openedAt = performance.now();
  return ov;
}
export function playAcquire(id: string, full: boolean, done: () => void): void {
  const c = CH.byId[id];
  S().innerHTML = '';
  const ov = overlay('acq', '<div class="rays"></div><div class="cap">成為夥伴了！</div><div class="im"><i data-sp="' + id + '" data-st="5" data-c="sil"></i></div>' +
    '<div class="nm">' + esc(c.name) + '</div><div class="sk">技能　<b style="color:' + c.color + '">' + esc(c.skill) + '</b></div><div class="fl"></div><div class="tap">點一下繼續</div>');
  ov.style.setProperty('--tc', c.color);
  let closed = false, can = false;
  function close() { if (closed || !can) return; closed = true; ov.remove(); done(); }
  function reveal() {
    if (closed) return;
    ov.classList.add('lit');
    const cv = ov.querySelector<HTMLCanvasElement>('canvas.sp');
    if (cv) { cv.classList.remove('sil'); const a = anim(cv); if (a) a.i = 0; }
    ov.insertAdjacentHTML('beforeend', confettiHtml(26, [c.color, '#FFD54F', '#fff']));
    sfx('get'); cry(id);
    setTimeout(function () { can = true; ov.classList.add('can'); }, 400);
    if (!full) setTimeout(close, 1300);
  }
  setTimeout(reveal, full ? 750 : 120);
  ov.addEventListener('click', close);
  primaryOf.set(ov, close);
}

// ---------- 通關動畫 ----------
function certificate(run: Run, tier: number): { url: string; name: string } | null {
  try {
    const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
    // getContext 拿不到時下一行會丟例外，跟舊版一樣由 catch 回傳 null
    const g = cv.getContext('2d') as CanvasRenderingContext2D, c = CH.byId[run.char], gr = g.createLinearGradient(0, 0, 0, 540);
    gr.addColorStop(0, '#1b2a6b'); gr.addColorStop(0.6, '#4d6fd0'); gr.addColorStop(1, '#f2c26b');
    g.fillStyle = gr; g.fillRect(0, 0, 960, 540);
    g.strokeStyle = '#FFD54F'; g.lineWidth = 8; g.strokeRect(18, 18, 924, 504);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.strokeRect(32, 32, 896, 476);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const txt = function (s: string, x: number, y: number, size: number, col: string, sw?: number) { g.font = '900 ' + size + 'px ' + FONT; g.lineWidth = sw || size / 5; g.strokeStyle = '#0a0f2e'; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y); };
    txt('冠軍之路　通關證書', 480, 84, 46, '#FFD54F');
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = 64;
    if (svc.charSelect && svc.charSelect.paintFrame) svc.charSelect.paintFrame(tmp, run.char, 5, 4);
    g.imageSmoothingEnabled = false; g.drawImage(tmp, 110, 150, 288, 288);
    txt(c.name, 650, 190, 64, '#fff');
    txt('★ ' + tierInfo(tier).name + '獎章', 650, 268, 40, tierInfo(tier).color);
    txt('用時 ' + fmtTime(run.frames) + '　' + STAGES + ' 勝 ' + run.lost + ' 敗', 650, 336, 30, '#fff');
    const d = new Date();
    txt(d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + '　打倒超夢', 650, 392, 24, '#E3F2FD');
    txt('寶可夢排球 Ultimate', 480, 478, 22, '#fff8d0');
    return { url: cv.toDataURL('image/png'), name: '冠軍之路-' + c.name + '.png' };
  } catch (e) { return null; }
}
export function playClear(run: Run, isRecord: boolean, done: () => void): void {
  const c = CH.byId[run.char], tier = tierOf(run.lost), T = tierInfo(tier);
  S().innerHTML = '';
  let beat = '';
  run.order.forEach(function (id) { beat += '<span><i data-sp="' + id + '" data-still></i></span>'; });
  const ov = overlay('clr', '<div class="rays"></div>' + confettiHtml(40, CONF) + '<h1>冠軍！</h1>' +
    '<div class="hero"><div class="im"><i data-sp="' + run.char + '" data-st="5"></i></div>' +
    '<div class="mdl" style="background:radial-gradient(circle at 35% 30%,#fff,' + T.color + ' 55%)"><b>★</b><span>' + T.name + '獎章</span></div></div>' +
    '<div class="st">' + esc(c.name) + '　用時 ' + fmtTime(run.frames) + '　' + STAGES + ' 勝 ' + run.lost + ' 敗' + (isRecord ? '<em>新紀錄</em>' : '') + '</div>' +
    '<div class="beat">' + beat + '</div>' + nextGoal() +
    '<div class="row"><button class="gh" data-a="cert" type="button">存成圖片</button><button class="cta" data-a="next" type="button">繼續</button></div>');
  const timers: number[] = [];
  let closed = false, rowAt = 0;
  function on(sel: string, ms: number, fn?: () => void) { timers.push(window.setTimeout(function () { const e = ov.querySelector(sel); if (e) e.classList.add('on'); if (fn) fn(); }, ms)); }
  function all() { timers.forEach(clearTimeout); ['.mdl', '.st', '.beat', '.goal', '.row'].forEach(function (s) { const e = ov.querySelector(s); if (e) e.classList.add('on'); }); if (!rowAt) rowAt = performance.now(); }
  sfx('fanfare'); cry(run.char);
  on('.mdl', 900, function () { sfx('stamp'); (ov.querySelector('.hero') as HTMLElement).style.animation = 'pvc-shake .2s'; });
  on('.st', 1400); on('.beat', 1800); on('.goal', 2000); on('.row', 2300, function () { rowAt = performance.now(); });
  function close() { if (closed) return; closed = true; ov.remove(); done(); }
  ov.addEventListener('click', function (e) {
    // 點擊的目標一定是元素
    const t = e.target as Element;
    const b = t.closest ? t.closest('[data-a]') : null;
    if (b && b.getAttribute('data-a') === 'cert') {
      const im = certificate(run, tier);
      if (im) ov.insertAdjacentHTML('beforeend', '<div class="cert" data-a="cert-x"><img alt="通關證書" src="' + im.url + '"><div class="row on"><a class="gh" download="' + esc(im.name) + '" href="' + im.url + '">下載圖片</a><button class="gh" data-a="cert-x" type="button">關閉</button></div><small>手機可以長按圖片儲存</small></div>');
      return;
    }
    if (t.closest && t.closest('.cert')) { if (!(t.closest('a') || t.tagName === 'IMG')) { const ce = ov.querySelector('.cert'); if (ce) ce.remove(); } return; }
    if (b && b.getAttribute('data-a') === 'next') { close(); return; }
    all();                                      // 點其他地方：快轉到最後
  });
  primaryOf.set(ov, function () {
    const ce = ov.querySelector('.cert');
    if (ce) { ce.remove(); return; }
    if (rowAt && performance.now() - rowAt > 600) close(); else all();
  });
}
