// ============================================================
// 畫面：全螢幕的模式大廳。一個畫面只做一個決定
// （路線圖、選夥伴、VS、落敗卡、暫停、連線中的提示）
// ============================================================
import { CFG, RULES, STAGES, ZONE_START, ruleFor, tierInfo, tierOf, zoneIdx, zoneOf } from '../config';
import type { RuleId } from '../config';
import { CH, charName, typeName } from '../chars';
import { camp, save } from '../state';
import type { LoseInfo, Run } from '../state';
import { howToGet, medalCount, medalTier, owned, ownedCount } from '../save';
import { sfx } from '../sfx';
import { startMatch } from '../match';
import { R, S, esc, fill, firstLine, fmtTime, heartsHtml, isOpen, openRoot, shade, ui } from './dom';
import { fmt } from '../../../core/i18n';
import { T, josa, plural } from '../texts';

const boss = function (): string { return charName('mewtwo'); };

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
    const z = zoneOf(i), isBoss = !!z.boss, id = run ? run.order[i] : (isBoss ? 'mewtwo' : (z.fixed && z.fixed[i - ZONE_START[zoneIdx(i)]]) || '');
    const known = isBoss || (run && i <= run.idx) || (id && z.fixed && z.fixed.indexOf(id) >= 0);
    const cls = 'nd' + (isBoss ? ' bs' : '') + (run && i < run.idx ? ' done' : run && i === run.idx ? ' cur' : '');
    h += '<div class="' + cls + '"' + (strip ? '' : ' data-node="' + i + '"') + ' style="left:' + pts[i].x + '%;top:' + pts[i].y + '%">' + (id ? '<i data-sp="' + id + '" data-still' + (known ? '' : ' data-c="sil"') + '></i>' : '?') +
      (id && !owned(id) && !(run && i < run.idx) ? '<span class="nw">✦</span>' : '') +
      (run && i === run.idx ? '<span class="lb">' + (isBoss ? T.boss : T.nextStage) + '</span>' : isBoss ? '<span class="lb">' + T.boss + '</span>' : '') + '</div>';
  }
  if (run) {
    const at = pts[tokenAt == null ? run.idx : tokenAt];
    h += '<div class="tok" data-to="' + pts[run.idx].x + ',' + pts[run.idx].y + '" style="left:' + at.x + '%;top:' + at.y + '%"><div><i data-sp="' + run.char + '"></i></div></div>';
  }
  return h + '</div>';
}
function chips(): string { return '<div class="chips"><span class="chip">' + T.partners + ' <b>' + ownedCount() + '</b> / ' + CH.ids.length + '</span><span class="chip">' + T.medals + ' <b>' + medalCount() + '</b> / ' + CH.ids.length + '</span></div>'; }

// ---------- 各個畫面 ----------
function hubHtml(): string {
  const run = save.run;
  let h = '<div class="scr sky hub"><div class="top"><div class="logo">' + T.logo + '</div>' + chips() + '<button class="x" data-a="close" type="button" title="' + T.exit + '">✕</button></div>';
  h += '<div class="mid">' + mapHtml(run, false) + '</div><div class="dock"><div class="ninfo"></div>';
  if (run) {
    h += '<div class="who"><div class="av"><i data-sp="' + run.char + '"></i></div><div><b>' + esc(charName(run.char)) + '</b>' + T.sp + heartsHtml(run.hearts) +
      '<br><small>' + fmt(T.vs, { a: fmt(T.stage, { n: run.idx + 1 }), b: esc(charName(run.order[run.idx])) }) + '</small></div></div>' +
      '<button class="lnk" data-a="reset" type="button">' + (ui.confirmReset ? T.confirmAgain : T.abandonRun) + '</button>' +
      '<button class="gh" data-a="pick" type="button">' + T.partners + '</button>' +
      '<button class="cta" data-a="vs" data-primary type="button">' + (zoneOf(run.idx).boss ? fmt(T.challengeBoss, { boss: esc(boss()) }) : fmt(T.continueStage, { n: run.idx + 1 })) + '</button>';
  } else {
    h += '<div class="who"><div>' + fmt(T.hubIntro, { n: STAGES - 1, boss: esc(boss()) }) + '<br><small>' + T.hubIntroSub + '</small></div></div>' +
      '<button class="cta" data-a="pick" data-primary type="button">' + T.startAdventure + '</button>';
  }
  return h + '</div></div>';
}

function pickHtml(): string {
  const run = save.run, sel = camp.pick && CH.byId[camp.pick] ? camp.pick : (run ? run.char : CFG.starters[0]);
  camp.pick = sel;
  const list = CH.list.slice().sort(function (a, b) { return (owned(a.id) ? 0 : 1) - (owned(b.id) ? 0 : 1); });   // 有的排前面
  let h = '<div class="scr sky pick"><div class="top"><button class="bk" data-a="hub" type="button">‹ ' + T.map + '</button><div class="ttl">' + T.choosePartner + '</div>' + chips() +
    '<button class="x" data-a="close" type="button" title="' + T.exit + '">✕</button></div>' + (medalCount() || run ? '' : '<div class="guide">' + T.pickGuide + '</div>') + '<div class="body"><div class="grid">';
  list.forEach(function (c) {
    const t = medalTier(c.id);
    h += '<div class="pc' + (owned(c.id) ? '' : ' lk') + (sel === c.id ? ' sel' : '') + '" data-pick="' + c.id + '"><i data-sp="' + c.id + '" data-still></i>' +
      (t ? '<span class="md" style="color:' + tierInfo(t).color + '">★</span>' : '') + '</div>';
  });
  const c = CH.byId[sel], has = owned(sel), m = save.medals[sel], t2 = medalTier(sel);
  h += '</div><div class="det" style="--tc:' + c.color + '"><div class="big"><i data-sp="' + sel + '" data-c="' + (has ? '' : 'sil') + '"></i></div>';
  if (has) {
    h += '<div class="nm">' + esc(c.name) + '<span class="ty" style="background:' + c.color + '">' + esc(typeName(c.type)) + '</span></div><div class="sk" style="color:' + c.color + '">' + esc(c.skill) + '</div>' +
      '<div class="ds">' + esc(c.desc) + '</div>' +
      '<div class="rec">' + (m ? '<b style="color:' + tierInfo(t2).color + '">★ ' + tierInfo(t2).medal + '</b>' + T.sp + fmt(T.recLine, { time: fmtTime(m.frames), n: m.lost }) : T.noRecord) + '</div>';
    const same = run && run.char === sel;
    h += goalHtml();
    if (run && !same) h += '<button class="gh" data-a="new" type="button">' + (ui.confirmReset ? T.confirmAgain : T.switchRestart) + '</button>';
    else h += '<button class="cta" data-a="' + (same ? 'vs' : 'new') + '" data-primary type="button">' + (same ? T.continueAdventure : T.go) + '</button>';
  } else {
    h += '<div class="nm">' + T.unknown + '</div><div class="sk">' + T.notPartner + '</div><div class="ds" style="text-align:center">' + fmt(T.howToGet, { how: esc(howToGet(sel)) }) + '</div>' +
      '<button class="cta" type="button" disabled>' + T.locked + '</button>';
  }
  return h + '</div></div></div>';
}

function ruleHtml(id: RuleId | null): string {
  const d = id && RULES[id];
  if (!d) return '';
  return '<div class="rulep" style="--rc:' + d.color + '"><b>' + fmt(T.ruleHead, { name: esc(d.name) }) + '</b>' + esc(d.short) + '</div>';
}
// 只在 save.run 有值時呼叫（render() 會先擋掉）
function vsHtml(): string {
  const run = save.run as Run, idx = run.idx, z = zoneOf(idx), me = CH.byId[run.char], opp = CH.byId[run.order[idx]], B = CFG.boss;
  const tip = firstLine(opp.desc);
  const rule = z.boss ? fmt(T.bossRule, { boss: boss(), hp: B.hp, php: B.playerHp }) + (run.bossPhase > 1 ? fmt(T.bossRuleFrom, { p: run.bossPhase }) : '')
    : fmt(T.stageRule, { n: z.score as number }) + (idx === 0 ? T.tutorialRule : '');
  let h = '<div class="scr vs" style="--c1:' + shade(me.color, 0.85) + ';--c1d:' + shade(me.color, 0.4) + ';--c2:' + shade(opp.color, 0.85) + ';--c2d:' + shade(opp.color, 0.4) + '">' +
    '<div class="hf l"></div><div class="hf r"></div>' +
    '<div class="vtop"><button class="bk" data-a="hub" type="button">‹ ' + T.map + '</button><div class="stg">' + (z.boss ? T.zoneFinal : fmt(T.stage, { n: idx + 1 })) + '<small>' + esc(z.name) + '</small></div><span class="chip" title="' + T.medalChipTitle + '"><b style="color:' + tierInfo(tierOf(run.lost)).color + '">★</b> ' + fmt(T.medalChip, { medal: tierInfo(tierOf(run.lost)).medal }) + '</span>' + heartsHtml(run.hearts) + '</div>' +
    mapHtml(run, true, camp.travelFrom) + ruleHtml(ruleFor(idx, opp.id)) +
    '<div class="arena"><div class="ft l"><div class="im"><i data-sp="' + me.id + '"></i></div><div class="nm">' + esc(me.name) + '</div></div>' +
    '<div class="vsx">VS</div>' +
    '<div class="ft r"><div class="im"><i data-sp="' + opp.id + '" data-c="flip"></i></div><div class="nm">' + esc(opp.name) + '</div>' + (owned(opp.id) ? '' : '<div class="tg">' + T.recruitTag + '</div>') + '</div></div>' +
    '<div class="vbot"><div class="tip"><span class="tx"><b style="color:' + opp.color + '">' + esc(opp.skill) + '</b>' + esc(tip) + '</span><span class="rl">' + esc(rule) + '</span></div><button class="q" data-a="more" type="button" title="' + T.moreTitle + '">' + T.q + '</button>' +
    '<button class="cta" data-a="fight" data-primary type="button"' + (camp.wantStart ? ' disabled' : '') + '>' + (camp.wantStart ? T.loading : T.fight) + '</button></div>';
  if (camp.toast) h += '<div class="toast">' + esc(camp.toast) + '</div>';
  return h + '</div>';
}

// 只在 save.run 有值時呼叫（render() 會先擋掉）
function loseHtml(): string {
  // camp.lose 在輸掉時一定會設定；舊版沒有的話會在 L.sc[0] 丟例外，這裡保留同樣的寫法
  const run = save.run as Run, L: Partial<LoseInfo> = camp.lose || {};
  let h = '<div class="scr dim"><div class="cd"><h3>' + (L.out ? T.outOfHearts : T.defeat) + '</h3>';
  h += '<div>' + heartsHtml(L.out ? 0 : run.hearts, true) + '</div>' + (L.out ? '' : '<p style="margin:0;font-weight:800">' + fmt(T.heartsLeft, { n: run.hearts, s: plural(run.hearts) }) + '</p>');
  const need = L.need as number, sc = L.sc as number[];
  const left = need - (L.sc ? L.sc[0] : 0);
  let msg: string;
  if (L.boss) msg = fmt(left <= 2 ? T.bossClose : T.bossLeft, { boss: boss(), n: left });
  else {
    const on = charName(L.opp as string), v = { opp: on, eul: josa(on, '을', '를'), i: josa(on, '이', '가'), sc: sc[0], n: left };
    msg = fmt(left <= 1 ? T.oneShort : sc[0] * 2 >= need ? T.halfway : T.upperHand, v);
  }
  h += '<p>' + esc(msg) + '</p>';
  if (L.out) h += '<p>' + (L.boss ? fmt(T.refillBoss, { n: CFG.hearts, boss: esc(boss()) }) : fmt(T.refillZone, { n: CFG.hearts, zone: esc(zoneOf(run.idx).name) })) + '</p>';
  else if (L.boss && run.bossPhase > 1) h += '<p>' + fmt(T.nextFromPhase, { p: run.bossPhase }) + '</p>';
  h += '<p class="keep">' + T.partnersKept + '</p>';
  h += '<div class="row"><button class="gh" data-a="hub" type="button">' + T.map + '</button><button class="cta" data-a="' + (L.out && !L.boss ? 'back-vs' : 'fight') + '" data-primary type="button">' + (L.out && !L.boss ? T.cont : T.tryAgain) + '</button></div>';
  return h + '</div></div>';
}

function pauseHtml(): string {
  const run = save.run;
  return '<div class="scr dim"><div class="cd"><h3>' + T.paused + '</h3>' +
    (run ? '<p>' + fmt(T.vs, { a: esc(charName(run.char)), b: esc(charName(run.order[run.idx])) }) + T.sp + heartsHtml(run.hearts) + '</p>' : '') +
    '<p class="keep">' + T.quitWarn + '</p>' +
    '<div class="row"><button class="gh" data-a="quit" type="button">' + T.quitCampaign + '</button><button class="cta" data-a="resume" data-primary type="button">' + T.resume + '</button></div></div></div>';
}

// 通關後的下一個目標：讓人知道再打一輪能拿到什麼
function goals(): string[] {
  const g: string[] = [], left = CH.ids.length - ownedCount();
  let silver = 0;
  Object.keys(save.medals).forEach(function (id) { if (medalTier(id) >= 2) silver++; });
  const nd = Math.max(1, 3 - medalCount()), ns = Math.max(1, 3 - silver);
  if (!owned('ditto')) g.push(fmt(T.goalDitto, { n: nd, s: plural(nd), name: charName('ditto') }));
  if (!owned('mew')) g.push(T.goalGold + (silver ? fmt(T.goalSilver, { n: ns, s: plural(ns) }) : '') + ' → ' + charName('mew'));
  if (!g.length) g.push(left > 0 ? fmt(T.goalLeft, { n: left, s: plural(left) }) : fmt(T.goalAll, { m: medalCount(), total: CH.ids.length }));
  return g;
}
export function nextGoal(): string { return '<div class="goal">' + T.goalPrefix + esc(goals().join(T.sep)) + '</div>'; }
// 選夥伴畫面的版本：標題和每一項各占一行
function goalHtml(): string { return '<div class="goal">' + T.goalTitle + '<br>' + goals().map(esc).join('<br>') + '</div>'; }

export function render(): void {
  if (!ui.root) return;
  const scr = S();
  clearTimeout(ui.autoTimer);
  let v = camp.view;
  if ((v === 'vs' || v === 'lose') && !save.run) v = camp.view = 'pick';
  const again = camp.shown === v && isOpen();
  scr.innerHTML = v === 'hub' ? hubHtml() : v === 'pick' ? pickHtml() : v === 'vs' ? vsHtml() : v === 'lose' ? loseHtml() : v === 'pause' ? pauseHtml() : v === 'net' ? '<div class="scr dim"><div class="cd"><h3>' + T.netTitle + '</h3><p>' + T.netBody + '</p><div class="row"><button class="cta" data-a="close" data-primary type="button">' + T.ok + '</button></div></div></div>' : '';
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
      if (rl) rl.insertAdjacentHTML('beforeend', '<span class="an">' + T.sep + T.autoNote + '</span>');
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
