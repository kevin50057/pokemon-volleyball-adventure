// 入口與操作：選單列的「闖關」按鈕、標題畫面的橫幅、畫面上的按鈕、鍵盤
import { CFG, RULES, ZONE_START, ruleFor, zoneIdx, zoneOf } from '../config';
import type { RuleId } from '../config';
import { CH, charName } from '../chars';
import { camp, ctrlOf, ensureGame, netBusy, save } from '../state';
import { owned, persist } from '../save';
import { newRun } from '../order';
import { sfx } from '../sfx';
import { startMatch, suspend } from '../match';
import { cssText } from './css';
import { R, S, esc, hide, isOpen, openRoot, ui } from './dom';
import { cancelAuto, go, render } from './screens';
import { primaryOf } from './overlays';

/** 跟舊版 `t.closest ? t.closest(sel) : null` 一樣（點擊、按鍵的目標都是元素）。 */
function closest(t: EventTarget | null, sel: string): Element | null {
  const el = t as Element;
  return el.closest ? el.closest(sel) : null;
}

// ---------- 操作 ----------
function act(a: string, el?: Element): void {
  const c = ctrlOf();
  if (a === 'close') {
    hide();
    camp.wantStart = false;
    if (camp.waiting) suspend(c, true);        // 兩關之間離開＝先不玩了，回標題
  } else if (a === 'hub') { go('hub'); }
  else if (a === 'pick') { go('pick'); }
  else if (a === 'vs' || a === 'back-vs') {
    if (a === 'back-vs' && camp.lose) camp.travelFrom = camp.lose.from;   // 退回區首：角色在進度列上走回去
    go('vs');
  } else if (a === 'reset') {
    // reset、new 只會從按鈕點進來，el 一定有值
    if (!ui.confirmReset) { ui.confirmReset = true; (el as Element).textContent = '再按一次確定'; return; }
    save.run = null; persist(); ui.confirmReset = false;
    if (camp.waiting) suspend(c, true);
    go('pick');
  } else if (a === 'new') {
    if (!camp.pick || !owned(camp.pick)) return;
    if (save.run && !ui.confirmReset) { ui.confirmReset = true; (el as Element).textContent = '再按一次確定'; return; }
    newRun(camp.pick);
    go('vs');
  } else if (a === 'fight') { startMatch(); }
  else if (a === 'more') {
    const run = save.run, opp = run && CH.byId[run.order[run.idx]];
    if (run && opp) {
      const rid = ruleFor(run.idx, opp.id);
      (S().querySelector('.scr') as Element).insertAdjacentHTML('beforeend', '<div class="more" data-a="less"><div><b style="color:' + opp.color + '">' + esc(opp.name) + '・' + esc(opp.skill) + '</b><br>' + esc(opp.desc) + (rid ? '<br><br><b style="color:' + RULES[rid].color + '">場地規則・' + esc(RULES[rid].name) + '</b><br>' + esc(RULES[rid].desc) : '') + '<br><small style="opacity:.6">點一下關閉</small></div></div>');
    }
  } else if (a === 'less') { const m = S().querySelector('.more'); if (m) m.remove(); }
  else if (a === 'resume') { if (c) c.paused = false; hide(); }
  else if (a === 'quit') { if (c) c.paused = false; suspend(c, true); go('hub'); }
}

// 從入口進來：比賽中＝暫停；有進行中的一輪＝直接到下一關的 VS；都沒有＝選夥伴
export function openFromMenu(toHub?: boolean): void {
  if (netBusy()) { go('net'); return; }
  ensureGame();
  const c = ctrlOf();
  if (camp.playing && !camp.waiting && c) { if (camp.ko) return; c.paused = true; go('pause'); return; }
  if (R().querySelector('.ov')) { openRoot(); return; }
  if (camp.waiting && camp.view) { go(camp.view); return; }
  go(!save.run ? 'pick' : toHub ? 'hub' : 'vs');
}

let banner: HTMLElement | null = null, menuBtn: HTMLButtonElement | null = null;
export function refreshEntry(): void {
  const c = ctrlOf(), gc = document.getElementById('game-canvas');
  if (menuBtn) menuBtn.textContent = camp.playing && !camp.waiting ? '暫停' : '闖關';
  if (!banner) return;
  const show = !!(c && gc && !camp.playing && !netBusy() && !isOpen() && c.state === c.menu && c.view.menu.visible);
  banner.classList.toggle('on', show);
  if (!show) return;
  const r = (gc as HTMLElement).getBoundingClientRect(), run = save.run;
  banner.style.left = (r.left + r.width / 2) + 'px';
  banner.style.top = (r.top + r.height * 0.835) + 'px';
  banner.style.fontSize = Math.max(10, Math.min(16, r.height * 0.036)) + 'px';
  banner.innerHTML = run ? '冠軍之路<small>繼續第 ' + (run.idx + 1) + ' 關　▶︎</small>' : '闖關模式　冠軍之路<small>▶︎</small>';
}

export function build(): void {
  const st = document.createElement('style'); st.textContent = cssText(); document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'pv-camp';
  root.innerHTML = '<div class="scrs"></div>';
  ui.root = root;
  ui.scr = root.querySelector<HTMLElement>('.scrs');
  const scr = S();
  document.body.appendChild(root);
  const setVh = function () { root.style.setProperty('--vh', (window.innerHeight / 100) + 'px'); };
  setVh(); window.addEventListener('resize', setVh);
  scr.addEventListener('click', function (e) {
    cancelAuto();
    const t = e.target, b = closest(t, '[data-a]'), card = closest(t, '[data-pick]');
    // data-a 也可能是 div（.more），那時 disabled 是 undefined，跟舊版一樣
    if (b && !(b as HTMLButtonElement).disabled) { act(b.getAttribute('data-a') as string, b); return; }
    if (card) { camp.pick = card.getAttribute('data-pick'); ui.confirmReset = false; sfx('tick'); render(); return; }
    const nd = closest(t, '[data-node]'), who = scr.querySelector('.ninfo');
    scr.querySelectorAll('.nd.pk').forEach(function (x) { x.classList.remove('pk'); });
    if (who) who.innerHTML = '';
    if (nd && who) {
      nd.classList.add('pk');
      const ni = Number(nd.getAttribute('data-node')), nz = zoneOf(ni), run = save.run;
      const nid = run ? run.order[ni] : nz.boss ? 'mewtwo' : (nz.fixed && nz.fixed[ni - ZONE_START[zoneIdx(ni)]]) || '';
      const seen = nz.boss || (run && ni <= run.idx) || (nid && nz.fixed && nz.fixed.indexOf(nid) >= 0);
      const rid: RuleId | null = seen && nid ? ruleFor(ni, nid) : null;
      sfx('tick');
      who.innerHTML = '<div><b>' + (nz.boss ? '最終戰' : '第 ' + (ni + 1) + ' 關') + '　' + esc(nz.name) + '</b><br><small>' +
        (seen && nid ? '對手：' + esc(charName(nid)) : '對手：到了才知道') + '　｜　' + (nz.boss ? '超夢 ' + CFG.boss.hp + ' 格血、分三階段' : '先得 ' + nz.score + ' 分') +
        (nid && !owned(nid) ? '　｜　✦ 打倒可收服' : seen && nid ? '　｜　已是夥伴' : '') +
        (rid ? '　｜　場地：' + esc(RULES[rid].name) : '') + '</small></div>';
    }
  });
  // 鍵盤：Enter／空白／殺球鍵＝主要按鈕，Esc＝返回。攔在遊戲本體之前，免得同一下按鍵也被遊戲吃到
  window.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    const ov = root.querySelector('.ov');
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ' || e.code === 'NumpadEnter') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat || performance.now() - (camp.openedAt || 0) < 350) return;
      const fe = document.activeElement as HTMLElement | null;
      if (ov) {
        if (e.code !== 'KeyZ' && fe && ov.contains(fe) && (fe.tagName === 'BUTTON' || fe.tagName === 'A') && !ov.querySelector('.cert')) { fe.click(); return; }
        const pf = primaryOf.get(ov);
        if (pf) pf();
        return;
      }
      const more = scr.querySelector('.more'); if (more) { more.remove(); return; }
      if (e.code !== 'KeyZ' && fe && fe.tagName === 'BUTTON' && scr.contains(fe) && !(fe as HTMLButtonElement).disabled) { fe.click(); return; }
      const p = scr.querySelector<HTMLButtonElement>('[data-primary]'); if (p && !p.disabled) p.click();
    } else if (camp.view === 'pick' && /^Arrow/.test(e.code) && !ov) {
      e.preventDefault(); e.stopImmediatePropagation();
      const cards = Array.from(scr.querySelectorAll<HTMLElement>('[data-pick]')), selEl = scr.querySelector<HTMLElement>('.pc.sel'), at = selEl ? cards.indexOf(selEl) : -1;
      let cols = 1;
      if (at < 0 || !cards.length) return;
      while (cols < cards.length && cards[cols].offsetTop === cards[0].offsetTop) cols++;
      const to = at + (e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowRight' ? 1 : e.code === 'ArrowUp' ? -cols : cols);
      if (to >= 0 && to < cards.length) cards[to].click();
    } else if (e.code === 'Escape') {
      e.stopImmediatePropagation();
      if (ov) { const ce0 = ov.querySelector('.cert'); if (ce0) ce0.remove(); return; }
      if (scr.querySelector('.more')) { act('less'); return; }
      act(camp.view === 'pause' ? 'resume' : (camp.view === 'vs' || camp.view === 'lose' || (camp.view === 'pick' && save.run)) ? 'hub' : 'close');
    }
  }, true);

  const left = document.querySelector('#menu-bar .btn-container.left');
  if (left) {
    const wrap = document.createElement('div'); wrap.className = 'relative-container';
    const btn = menuBtn = document.createElement('button'); btn.type = 'button'; btn.id = 'pv-camp-btn'; btn.className = 'btn'; btn.textContent = '闖關';
    btn.onclick = function (e) { e.stopPropagation(); openFromMenu(true); };
    wrap.appendChild(btn);
    const netBtn = document.getElementById('pv-net-btn');
    left.insertBefore(wrap, netBtn && netBtn.parentNode && netBtn.parentNode.parentNode === left ? netBtn.parentNode : left.querySelector('.color-scheme-toggle-switch-container'));
  }
  banner = document.createElement('div'); banner.id = 'pv-camp-banner';
  banner.addEventListener('click', function () { openFromMenu(false); });
  document.body.appendChild(banner);
}
