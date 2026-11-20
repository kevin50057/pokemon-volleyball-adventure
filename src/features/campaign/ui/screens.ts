// ============================================================
// 畫面：全螢幕的模式大廳。一個畫面只做一個決定
// （路線圖、選夥伴、VS、落敗卡、暫停、連線中的提示）
// ============================================================
import { CFG, RULES, STAGES, ZONE_START, ruleFor, tierInfo, tierOf, zoneIdx, zoneOf } from '../config';
import type { RuleId } from '../config';
import { CH, charName } from '../chars';
import { camp, save } from '../state';
import type { LoseInfo, Run } from '../state';
import { howToGet, medalCount, medalTier, owned, ownedCount } from '../save';
import { sfx } from '../sfx';
import { startMatch } from '../match';
import { R, S, esc, fill, firstLine, fmtTime, heartsHtml, isOpen, openRoot, shade, ui } from './dom';

// ---------- 路線圖（大廳的大圖和 VS 上緣的進度列共用） ----------
function nodeXY(i: number, strip?: boolean): { x: number; y: number } { return { x: i >= STAGES - 1 ? 93 : 5.5 + i * 9.3, y: 52 + Math.sin(i * 1.3 + 0.5) * (strip ? 0 : 19) }; }
function mapHtml(run: Run | null, strip: boolean, tokenAt?: number | null): string {
  let h = '<div class="map' + (strip ? ' strip' : '') + '">';
  const pts: { x: number; y: number }[] = [];
  CFG.zones.forEach(function (z, zi) {
    const from = ZONE_START[zi], to = zi + 1 < ZONE_START.length ? ZONE_START[zi + 1] : STAGES;
    const x0 = from === 0 ? 0.5 : (nodeXY(from - 1).x + nodeXY(from).x) / 2 + 0.4, x1 = to >= STAGES ? 99.5 : (nodeXY(to - 1).x + nodeXY(to).x) / 2 - 0.4;
    h += '<div class="zb" style="left:' + x0 + '%;width:' + (x1 - x0) + '%;background:linear-gradient(' + z.c1 + ',' + z.c2 + ')"><span>' + esc(z.name) + '</span></div>';
  });
  let i: number;
  for (i = 0; i < STAGES; i++) pts.push(nodeXY(i, strip));
  h += '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="' + pts.map(function (p) { return p.x + ',' + p.y; }).join(' ') +
    '" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
  for (i = 0; i < STAGES; i++) {
    const z = zoneOf(i), boss = !!z.boss, id = run ? run.order[i] : (boss ? 'mewtwo' : (z.fixed && z.fixed[i - ZONE_START[zoneIdx(i)]]) || '');
    const known = boss || (run && i <= run.idx) || (id && z.fixed && z.fixed.indexOf(id) >= 0);
    const cls = 'nd' + (boss ? ' bs' : '') + (run && i < run.idx ? ' done' : run && i === run.idx ? ' cur' : '');
    h += '<div class="' + cls + '"' + (strip ? '' : ' data-node="' + i + '"') + ' style="left:' + pts[i].x + '%;top:' + pts[i].y + '%">' + (id ? '<i data-sp="' + id + '" data-still' + (known ? '' : ' data-c="sil"') + '></i>' : '?') +
      (id && !owned(id) && !(run && i < run.idx) ? '<span class="nw">✦</span>' : '') +
      (run && i === run.idx ? '<span class="lb">' + (boss ? '魔王' : '下一關') + '</span>' : boss ? '<span class="lb">魔王</span>' : '') + '</div>';
  }
  if (run) {
    const at = pts[tokenAt == null ? run.idx : tokenAt];
    h += '<div class="tok" data-to="' + pts[run.idx].x + ',' + pts[run.idx].y + '" style="left:' + at.x + '%;top:' + at.y + '%"><div><i data-sp="' + run.char + '"></i></div></div>';
  }
  return h + '</div>';
}
function chips(): string { return '<div class="chips"><span class="chip">夥伴 <b>' + ownedCount() + '</b> / ' + CH.ids.length + '</span><span class="chip">獎章 <b>' + medalCount() + '</b> / ' + CH.ids.length + '</span></div>'; }

// ---------- 各個畫面 ----------
function hubHtml(): string {
  const run = save.run;
  let h = '<div class="scr sky hub"><div class="top"><div class="logo">冠軍之路</div>' + chips() + '<button class="x" data-a="close" type="button" title="離開">✕</button></div>';
  h += '<div class="mid">' + mapHtml(run, false) + '</div><div class="dock"><div class="ninfo"></div>';
  if (run) {
    h += '<div class="who"><div class="av"><i data-sp="' + run.char + '"></i></div><div><b>' + esc(charName(run.char)) + '</b>　' + heartsHtml(run.hearts) +
      '<br><small>第 ' + (run.idx + 1) + ' 關　對　' + esc(charName(run.order[run.idx])) + '</small></div></div>' +
      '<button class="lnk" data-a="reset" type="button">' + (ui.confirmReset ? '再按一次確定' : '放棄這一輪') + '</button>' +
      '<button class="gh" data-a="pick" type="button">夥伴</button>' +
      '<button class="cta" data-a="vs" data-primary type="button">' + (zoneOf(run.idx).boss ? '挑戰超夢' : '繼續第 ' + (run.idx + 1) + ' 關') + '</button>';
  } else {
    h += '<div class="who"><div>選一個夥伴，連過 9 關後挑戰超夢。<br><small>打倒誰，誰就會成為你的夥伴。</small></div></div>' +
      '<button class="cta" data-a="pick" data-primary type="button">開始冒險</button>';
  }
  return h + '</div></div>';
}

function pickHtml(): string {
  const run = save.run, sel = camp.pick && CH.byId[camp.pick] ? camp.pick : (run ? run.char : CFG.starters[0]);
  camp.pick = sel;
  const list = CH.list.slice().sort(function (a, b) { return (owned(a.id) ? 0 : 1) - (owned(b.id) ? 0 : 1); });   // 有的排前面
  let h = '<div class="scr sky pick"><div class="top"><button class="bk" data-a="hub" type="button">‹ 路線圖</button><div class="ttl">選擇夥伴</div>' + chips() +
    '<button class="x" data-a="close" type="button" title="離開">✕</button></div>' + (medalCount() || run ? '' : '<div class="guide">先選一隻出發。闖關時打倒誰，誰就會成為新夥伴。</div>') + '<div class="body"><div class="grid">';
  list.forEach(function (c) {
    const t = medalTier(c.id);
    h += '<div class="pc' + (owned(c.id) ? '' : ' lk') + (sel === c.id ? ' sel' : '') + '" data-pick="' + c.id + '"><i data-sp="' + c.id + '" data-still></i>' +
      (t ? '<span class="md" style="color:' + tierInfo(t).color + '">★</span>' : '') + '</div>';
  });
  const c = CH.byId[sel], has = owned(sel), m = save.medals[sel], t2 = medalTier(sel);
  h += '</div><div class="det" style="--tc:' + c.color + '"><div class="big"><i data-sp="' + sel + '" data-c="' + (has ? '' : 'sil') + '"></i></div>';
  if (has) {
    h += '<div class="nm">' + esc(c.name) + '<span class="ty" style="background:' + c.color + '">' + esc(c.type) + '</span></div><div class="sk" style="color:' + c.color + '">' + esc(c.skill) + '</div>' +
      '<div class="ds">' + esc(c.desc) + '</div>' +
      '<div class="rec">' + (m ? '<b style="color:' + tierInfo(t2).color + '">★ ' + tierInfo(t2).name + '獎章</b>　' + fmtTime(m.frames) + '・輸 ' + m.lost + ' 場' : '還沒挑戰過，用牠通關可以拿到獎章') + '</div>';
    const same = run && run.char === sel;
    h += goalHtml();
    if (run && !same) h += '<button class="gh" data-a="new" type="button">' + (ui.confirmReset ? '再按一次確定' : '換牠重新開始（放棄目前這一輪）') + '</button>';
    else h += '<button class="cta" data-a="' + (same ? 'vs' : 'new') + '" data-primary type="button">' + (same ? '繼續冒險' : '出發！') + '</button>';
  } else {
    h += '<div class="nm">？？？</div><div class="sk">還沒成為夥伴</div><div class="ds" style="text-align:center">取得方式：' + esc(howToGet(sel)) + '</div>' +
      '<button class="cta" type="button" disabled>尚未收服</button>';
  }
  return h + '</div></div></div>';
}

function ruleHtml(id: RuleId | null): string {
  const d = id && RULES[id];
  if (!d) return '';
  return '<div class="rulep" style="--rc:' + d.color + '"><b>場地規則・' + esc(d.name) + '</b>' + esc(d.short) + '</div>';
}
// 只在 save.run 有值時呼叫（render() 會先擋掉）
function vsHtml(): string {
  const run = save.run as Run, idx = run.idx, z = zoneOf(idx), me = CH.byId[run.char], opp = CH.byId[run.order[idx]], B = CFG.boss;
  const tip = firstLine(opp.desc);
  const rule = z.boss ? '超夢 ' + B.hp + ' 格血、你 ' + B.playerHp + ' 格，得一分打掉對方一格' + (run.bossPhase > 1 ? '（從第 ' + run.bossPhase + ' 階段開始）' : '')
    : '先得 ' + z.score + ' 分過關' + (idx === 0 ? '。左右移動，跳起來再按殺球鍵把球砸過去' : '');
  let h = '<div class="scr vs" style="--c1:' + shade(me.color, 0.85) + ';--c1d:' + shade(me.color, 0.4) + ';--c2:' + shade(opp.color, 0.85) + ';--c2d:' + shade(opp.color, 0.4) + '">' +
    '<div class="hf l"></div><div class="hf r"></div>' +
    '<div class="vtop"><button class="bk" data-a="hub" type="button">‹ 路線圖</button><div class="stg">' + (z.boss ? '最終戰' : '第 ' + (idx + 1) + ' 關') + '<small>' + esc(z.name) + '</small></div><span class="chip" title="照目前的敗場，通關可以拿到的獎章"><b style="color:' + tierInfo(tierOf(run.lost)).color + '">★</b> 目前可拿' + tierInfo(tierOf(run.lost)).name + '獎章</span>' + heartsHtml(run.hearts) + '</div>' +
    mapHtml(run, true, camp.travelFrom) + ruleHtml(ruleFor(idx, opp.id)) +
    '<div class="arena"><div class="ft l"><div class="im"><i data-sp="' + me.id + '"></i></div><div class="nm">' + esc(me.name) + '</div></div>' +
    '<div class="vsx">VS</div>' +
    '<div class="ft r"><div class="im"><i data-sp="' + opp.id + '" data-c="flip"></i></div><div class="nm">' + esc(opp.name) + '</div>' + (owned(opp.id) ? '' : '<div class="tg">打倒就能收服！</div>') + '</div></div>' +
    '<div class="vbot"><div class="tip"><span class="tx"><b style="color:' + opp.color + '">' + esc(opp.skill) + '</b>' + esc(tip) + '</span><span class="rl">' + esc(rule) + '</span></div><button class="q" data-a="more" type="button" title="完整說明">？</button>' +
    '<button class="cta" data-a="fight" data-primary type="button"' + (camp.wantStart ? ' disabled' : '') + '>' + (camp.wantStart ? '載入中…' : '開打') + '</button></div>';
  if (camp.toast) h += '<div class="toast">' + esc(camp.toast) + '</div>';
  return h + '</div>';
}

// 只在 save.run 有值時呼叫（render() 會先擋掉）
function loseHtml(): string {
  // camp.lose 在輸掉時一定會設定；舊版沒有的話會在 L.sc[0] 丟例外，這裡保留同樣的寫法
  const run = save.run as Run, L: Partial<LoseInfo> = camp.lose || {};
  let h = '<div class="scr dim"><div class="cd"><h3>' + (L.out ? '心用完了' : '落敗…') + '</h3>';
  h += '<div>' + heartsHtml(L.out ? 0 : run.hearts, true) + '</div>' + (L.out ? '' : '<p style="margin:0;font-weight:800">還剩 ' + run.hearts + ' 顆心</p>');
  const need = L.need as number, sc = L.sc as number[];
  const left = need - (L.sc ? L.sc[0] : 0);
  let msg: string;
  if (L.boss) msg = left <= 2 ? '就差一點！超夢只剩 ' + left + ' 格血。' : '超夢還剩 ' + left + ' 格血。';
  else msg = left <= 1 ? '就差一點！只差 1 分就打倒' + charName(L.opp as string) + '了。' : sc[0] * 2 >= need ? '已經拿下 ' + sc[0] + ' 分，再 ' + left + ' 分就能打倒' + charName(L.opp as string) + '。' : charName(L.opp as string) + '這場佔了上風。看一下牠的技能，換個打法再試一次。';
  h += '<p>' + esc(msg) + '</p>';
  if (L.out) h += '<p>補滿 ' + CFG.hearts + ' 顆心，' + (L.boss ? '從超夢的第一階段重新挑戰。' : '回到「' + esc(zoneOf(run.idx).name) + '」第一關。') + '</p>';
  else if (L.boss && run.bossPhase > 1) h += '<p>下一場從第 ' + run.bossPhase + ' 階段開始。</p>';
  h += '<p class="keep">已經收服的夥伴不會消失。</p>';
  h += '<div class="row"><button class="gh" data-a="hub" type="button">路線圖</button><button class="cta" data-a="' + (L.out && !L.boss ? 'back-vs' : 'fight') + '" data-primary type="button">' + (L.out && !L.boss ? '繼續' : '再打一次') + '</button></div>';
  return h + '</div></div>';
}

function pauseHtml(): string {
  const run = save.run;
  return '<div class="scr dim"><div class="cd"><h3>暫停</h3>' +
    (run ? '<p>' + esc(charName(run.char)) + '　對　' + esc(charName(run.order[run.idx])) + '　' + heartsHtml(run.hearts) + '</p>' : '') +
    '<p class="keep">現在離開，這一場會算輸：扣一顆心、敗場加一。</p>' +
    '<div class="row"><button class="gh" data-a="quit" type="button">離開闖關</button><button class="cta" data-a="resume" data-primary type="button">回到比賽</button></div></div></div>';
}

// 通關後的下一個目標：讓人知道再打一輪能拿到什麼
export function nextGoal(): string {
  const g: string[] = [], left = CH.ids.length - ownedCount();
  let silver = 0;
  Object.keys(save.medals).forEach(function (id) { if (medalTier(id) >= 2) silver++; });
  if (!owned('ditto')) g.push('再 ' + Math.max(1, 3 - medalCount()) + ' 面獎章 → 百變怪');
  if (!owned('mew')) g.push('一場不輸拿金獎章' + (silver ? '，或再 ' + Math.max(1, 3 - silver) + ' 面銀獎章' : '') + ' → 夢幻');
  if (!g.length) g.push(left > 0 ? '還有 ' + left + ' 隻夥伴等你收服' : '獎章 ' + medalCount() + ' / ' + CH.ids.length + '，換一隻夥伴再挑戰');
  return '<div class="goal">下一個目標：' + esc(g.join('　｜　')) + '</div>';
}
function goalHtml(): string { return nextGoal().replace('class="goal"', 'class="goal"').replace('下一個目標：', '下一個目標<br>').replace(/　｜　/g, '<br>'); }

export function render(): void {
  if (!ui.root) return;
  const scr = S();
  clearTimeout(ui.autoTimer);
  let v = camp.view;
  if ((v === 'vs' || v === 'lose') && !save.run) v = camp.view = 'pick';
  const again = camp.shown === v && isOpen();
  scr.innerHTML = v === 'hub' ? hubHtml() : v === 'pick' ? pickHtml() : v === 'vs' ? vsHtml() : v === 'lose' ? loseHtml() : v === 'pause' ? pauseHtml() : v === 'net' ? '<div class="scr dim"><div class="cd"><h3>連線房間開著</h3><p>先離開連線房間，才能進闖關模式。</p><div class="row"><button class="cta" data-a="close" data-primary type="button">知道了</button></div></div></div>' : '';
  if (again && scr.firstChild) (scr.firstChild as HTMLElement).style.animation = 'none';
  fill(scr);
  if (v === 'vs') {
    camp.toast = '';
    // 自己的角色從上一關走到這一關
    const tok = scr.querySelector<HTMLElement>('.tok');
    if (tok && camp.travelFrom != null) {
      const to = (tok.getAttribute('data-to') as string).split(',');
      requestAnimationFrame(function () { requestAnimationFrame(function () { tok.style.left = to[0] + '%'; tok.style.top = to[1] + '%'; }); });
      sfx('step');
    }
    camp.travelFrom = null;
    setTimeout(function () { if (camp.view === 'vs' && isOpen()) sfx('vs'); }, 300);
    const auto = camp.autoVs && save.run && save.run.idx > 0 && !zoneOf(save.run.idx).boss && !camp.wantStart;
    if (auto) {
      const btn = scr.querySelector('[data-a=fight]');
      (scr.querySelector('.scr') as Element).insertAdjacentHTML('beforeend', '<div class="auto" style="animation-duration:' + CFG.autoVs + 'ms"></div>');
      let left = Math.round(CFG.autoVs / 1000);
      const rl = scr.querySelector('.tip .rl');
      if (btn) btn.insertAdjacentHTML('beforeend', '<small>' + left + '</small>');
      if (rl) rl.insertAdjacentHTML('beforeend', '<span class="an">　｜　倒數完自動開打，點一下畫面取消</span>');
      const tickAuto = function () {
        if (camp.view !== 'vs' || !isOpen() || R().querySelector('.ov')) return;
        if (--left <= 0) { startMatch(); return; }
        const sm = scr.querySelector('[data-a=fight] small'); if (sm) sm.textContent = String(left);
        ui.autoTimer = window.setTimeout(tickAuto, 1000);
      };
      ui.autoTimer = window.setTimeout(tickAuto, 1000);
    }
  }
  camp.autoVs = false;
  if (camp.shown !== v) camp.openedAt = performance.now();
  camp.shown = v;
}

export function cancelAuto(): void {
  const scr = S();
  clearTimeout(ui.autoTimer); ui.autoTimer = 0;
  const a = scr.querySelector('.auto'); if (a) a.remove();
  const s = scr.querySelector('[data-a=fight] small'); if (s) s.remove();
  const an = scr.querySelector('.tip .an'); if (an) an.remove();
}
export function go(view: string): void { if (!ui.root) return; camp.view = view; ui.confirmReset = false; render(); openRoot(); }
