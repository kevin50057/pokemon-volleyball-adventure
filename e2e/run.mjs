// 瀏覽器自動化測試：用建好的 dist 開一個本機伺服器，叫系統裝的 Chrome（或 Edge）無頭跑。
//   npm run e2e                跑全部（會先 build）
//   node e2e/run.mjs soak      只跑名字裡有 soak 的
//   node e2e/run.mjs --update  重新產生逐幀比對的基準（確認一般對戰的行為「故意」改了才用）
//   node e2e/run.mjs --headed  看得到瀏覽器視窗
// 遠征的比賽用除錯介面（PVA.expedition）讓電腦代打並快轉；存檔是每個測試一個乾淨的瀏覽器環境。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, 'parity-golden.json');
const args = process.argv.slice(2);
const UPDATE = args.includes('--update'), HEADED = args.includes('--headed');
const only = args.filter((a) => !a.startsWith('--'));

// 快轉時 @pixi/sound 解碼音效會丟這個錯（main 也一樣），不算
const IGNORE = /AudioBufferSourceNode|AudioContext|detached ArrayBuffer/;

/** 注入頁面的小工具：快轉一場、等條件成立 */
const HELPERS = `
window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.__until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await __sleep(50); } return false; };
window.__run = () => { const s = PVA.expedition.state().state; return s && s.kind === 'ok' ? s.run : null; };
// 快轉目前這一場到分出勝負；回傳 { f, stuck }。
// 「卡住」是球真的停住不動 600 幀以上；兩邊電腦互相接得太好、一個回合打很久不算卡住（球一直在動），會繼續打。
window.__ff = async (max = 60000) => {
  const c = PVA.svc.ctrl; let f = 0, still = 0, px = NaN, py = NaN, frozen = false;
  for (let k = 0; k < 5; k++) { c.gameLoop(); f++; }
  while (f < max && PVA.svc.expedition.playing() && !c.gameEnded && !frozen) {
    for (let k = 0; k < 500 && !c.gameEnded; k++) {
      c.gameLoop(); f++;
      const b = c.physics.ball;
      if (b.x === px && b.y === py) { if (++still >= 600) { frozen = true; break; } } else still = 0;
      px = b.x; py = b.y;
    }
    await __sleep(0);
  }
  return { f, stuck: !c.gameEnded && PVA.svc.expedition.playing(), frozen, scores: [c.scores[0], c.scores[1]] };
};
// 開打、快轉、等結算寫完
window.__fight = async () => {
  const E = PVA.expedition, before = __run().revision;
  await E.actions.fight();
  if (!PVA.svc.expedition.playing()) return { error: 'did not start: ' + E.state().note };
  let res = await __ff();
  if (res.stuck && res.frozen) return { error: 'ball frozen ' + JSON.stringify(res) };
  if (res.stuck) {
    // 兩邊電腦互相接得到、一直打不完（球一直在動，不是卡住）：電腦對電腦才會這樣，按「放棄本場」往下走
    await E.actions.forfeit();
    res = { ...res, forfeited: true };
  }
  const ok = await __until(() => { const r = __run(); return r && r.phase !== 'active' && r.revision > before + 1 && !PVA.svc.expedition.playing(); }, 12000);
  return ok ? res : { error: 'settlement did not finish' };
};
// 往前走一步：三選一拿第一個、岔路走第一條、奇遇離開、補給站出發、不然就開打
window.__step = async () => {
  const E = PVA.expedition, A = E.actions, r = __run();
  if (!r) return 'no run';
  if (r.phase === 'cleared' || r.phase === 'failed') return 'ended ' + r.phase;
  if (r.phase === 'reward') { await A.pick(r.pendingReward.offeredCardIds[0]); return 'pick'; }
  const n = r.nodeId;
  if (/^fork/.test(n)) { const b = [...document.querySelectorAll('#pv-exp .pv-exp-fork .pv-exp-btn.main')][0]; if (!b) return 'error: no fork option'; b.click(); await __until(() => __run().nodeId !== n); return 'branch'; }
  if (/^event/.test(n)) { await A.choose('leave'); return 'leave'; }
  if (/camp|supply/.test(n)) { await A.depart(); return 'depart'; }
  const res = await __fight();
  return res.error ? 'error: ' + res.error : 'fight ' + n + ' ' + res.scores.join(':') + (res.forfeited ? ' (CPU stalemate, forfeited)' : '');
};
`;

let server, browser, base;
const results = [];

async function fresh(query = '?exp=1') {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!IGNORE.test(String(e.message))) errors.push(String(e.message)); });
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(HELPERS);
  await page.goto(base + query);
  // 關掉關於頁，等遊戲本體載好
  await page.evaluate(async () => { const b = document.getElementById('close-about-btn'); if (b) b.click(); await __until(() => window.PVA && PVA.svc && PVA.svc.ctrl, 30000); });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}
async function ready(page) {
  await page.evaluate(async () => { await __until(() => PVA.expedition && PVA.expedition.state().state, 15000); PVA.expedition.show(); PVA.expedition.autoplay(true); });
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

const tests = {
  // 開關關閉：沒有入口、沒有開遠征的資料庫
  async 'off: no entry, no database'() {
    const { ctx, page, errors } = await fresh('');
    const r = await page.evaluate(async () => ({
      btn: !!document.getElementById('pv-exp-btn'), panel: !!document.getElementById('pv-exp'),
      dbs: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [],
    }));
    expect(!r.btn && !r.panel, 'expedition UI exists while the flag is off');
    expect(!r.dbs.includes('pva-expedition'), 'expedition database was opened while the flag is off');
    expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
    await ctx.close();
  },

  // 一般對戰跟基準逐幀一致（遠征的程式沒有影響到其他模式）
  async 'parity: normal matches match the golden hashes'() {
    const { ctx, page } = await fresh('');
    await page.addScriptTag({ path: join(HERE, 'parity.js') });
    const pairs = [['pikachu', 'mewtwo'], ['jolteon', 'gengar'], ['squirtle', 'dragonite'], ['magikarp', 'psyduck'], ['bulbasaur', 'farfetchd'], ['meowth', 'jigglypuff'], ['electrode', 'wobbuffet'], ['charmander', 'snorlax'], ['flareon', 'bird'], ['umbreon', 'vaporeon']];
    const raw = await page.evaluate((ps) => ps.map(([a, b]) => [a + '-' + b, __parity.run(7, a, b, 3000).hashes]), pairs);
    const got = Object.fromEntries(raw.map(([k, h]) => [k, createHash('sha256').update(h).digest('hex').slice(0, 16)]));
    await ctx.close();
    if (UPDATE || !existsSync(GOLDEN)) { writeFileSync(GOLDEN, JSON.stringify(got, null, 2) + '\n'); console.log('    wrote ' + GOLDEN); return; }
    const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const diff = Object.keys(want).filter((k) => want[k] !== got[k]);
    expect(!diff.length, 'frame hashes changed for: ' + diff.join(', ') + ' (if intended, rerun with --update)');
  },

  // 重整不扣心、同一場；失焦會暫停
  async 'match: refresh keeps the match, focus loss pauses'() {
    const { ctx, page, errors } = await fresh();
    await ready(page);
    const a = await page.evaluate(async () => {
      const E = PVA.expedition; E.autoplay(false);
      await E.actions.startNewRun(); await __until(() => __run());
      await E.actions.fight(); await __until(() => PVA.svc.expedition.playing());
      const r = __run(); return { matchId: r.matchId, hearts: r.hearts, rev: r.revision };
    });
    expect(a.matchId === 'warmup#1', 'unexpected matchId ' + a.matchId);
    await page.reload();
    await page.evaluate(async () => { const b = document.getElementById('close-about-btn'); if (b) b.click(); await __until(() => window.PVA && PVA.svc.ctrl && PVA.expedition.state().state, 30000); });
    const b = await page.evaluate(async () => {
      const E = PVA.expedition, r0 = __run(), out = { phase: r0.phase, hearts: r0.hearts, panel: document.getElementById('pv-exp').style.display };
      await E.actions.fight(); await __until(() => PVA.svc.expedition.playing());
      const r = __run(); out.matchId = r.matchId; out.rev = r.revision;
      // 按住右鍵 → 視窗失焦
      const c = PVA.svc.ctrl, k = c.keyboardArray[0];
      await __sleep(600);
      k.rightKey.isDown = true; k.rightKey.isUp = false; await __sleep(150);
      const bx = c.physics.ball.x, by = c.physics.ball.y;
      window.dispatchEvent(new Event('blur')); await __sleep(500);
      const names = () => [...document.querySelectorAll('#pv-exp button')].map((x) => x.textContent.trim());
      out.blur = { paused: c.paused, key: k.rightKey.isDown, moved: c.physics.ball.x !== bx || c.physics.ball.y !== by, panel: document.getElementById('pv-exp').style.display, x: names().includes('×') };
      document.getElementById('pv-exp').click(); await __sleep(100);
      out.stillOpen = document.getElementById('pv-exp').style.display;
      await E.actions.switchTab('book'); await __sleep(150);
      out.resumeOnBook = !![...document.querySelectorAll('#pv-exp .pv-exp-btn.main')].length;
      [...document.querySelectorAll('#pv-exp .pv-exp-btn.main')][0].click(); await __sleep(300);
      out.resumed = { paused: c.paused, panel: document.getElementById('pv-exp').style.display };
      out.heartsAfter = __run().hearts;
      return out;
    });
    expect(b.phase === 'active' && b.hearts === a.hearts, 'refresh changed the run: ' + JSON.stringify(b));
    expect(b.panel === 'flex', 'panel did not reopen after refresh');
    expect(b.matchId === a.matchId && b.rev === a.rev, 'refresh started a different match');
    expect(b.blur.paused && !b.blur.key && !b.blur.moved, 'blur did not pause / clear keys: ' + JSON.stringify(b.blur));
    expect(b.blur.panel === 'flex' && !b.blur.x && b.stillOpen === 'flex', 'panel can be closed while paused');
    expect(b.resumeOnBook, 'no Resume on the handbook tab');
    expect(!b.resumed.paused && b.resumed.panel === 'none' && b.heartsAfter === a.hearts, 'resume failed: ' + JSON.stringify(b.resumed));
    expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
    await ctx.close();
  },

  // 電腦代打一整輪：每一步存檔都讀得回來、不會卡死，最後通關
  async 'run: a full autoplay run reaches the end'() {
    const { ctx, page, errors } = await fresh();
    await ready(page);
    await page.evaluate(async () => { await PVA.expedition.actions.startNewRun(); await __until(() => __run()); });
    const log = [];
    let last = '';
    for (let i = 0; i < 260 && !last.startsWith('ended'); i++) {
      last = await page.evaluate(() => __step());
      log.push(last);
      expect(!last.startsWith('error'), 'step ' + i + ': ' + last + ' after ' + log.slice(-4).join(' > '));
      const kind = await page.evaluate(() => PVA.expedition.state().state.kind);
      expect(kind === 'ok', 'save became ' + kind + ' after ' + last);
    }
    const end = await page.evaluate(() => { const s = PVA.expedition.state().state; return { phase: s.run.phase, chapter: s.run.chapter, retries: s.run.chapterRetries, stamps: s.profile.stamps, goals: Object.keys(s.profile.goals || {}), awakened: s.run.awakened }; });
    console.log('    ' + log.filter((l) => l.startsWith('fight')).length + ' matches, ' + end.retries + ' chapter restarts, awakened: ' + end.awakened.join(','));
    expect(end.phase === 'cleared' && end.chapter === 2, 'run did not clear: ' + JSON.stringify(end));
    expect(end.stamps && Object.keys(end.stamps).length === 1 && end.goals.includes('firstClear'), 'clear was not recorded: ' + JSON.stringify(end));
    // 重新整理：通關紀錄還在
    await page.reload();
    const after = await page.evaluate(async () => { await __until(() => window.PVA && PVA.expedition && PVA.expedition.state().state, 30000); const s = PVA.expedition.state().state; return { kind: s.kind, phase: s.run && s.run.phase, rank: s.profile.rankUnlocked }; });
    expect(after.kind === 'ok' && after.phase === 'cleared' && after.rank === 1, 'clear did not survive a reload: ' + JSON.stringify(after));
    expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
    await ctx.close();
  },

  // 每日遠征：打完記一筆，主線存檔不受影響
  async 'daily: a daily run is scored and leaves the main run alone'() {
    const { ctx, page, errors } = await fresh();
    await ready(page);
    const r = await page.evaluate(async () => {
      const E = PVA.expedition, A = E.actions;
      await A.startNewRun(); await __until(() => __run());
      const main = __run().runId;
      await A.switchTab('daily'); await __until(() => E.state().slot === 'daily' && E.state().state);
      await A.startDaily(); await __until(() => __run() && __run().daily);
      const log = []; let last = '';
      for (let i = 0; i < 80 && !last.startsWith('ended'); i++) { last = await __step(); log.push(last); if (last.startsWith('error')) break; }
      const d = E.state().state.profile.daily, dr = __run();
      await A.switchTab('run'); await __until(() => E.state().slot === 'current' && __run() && !__run().daily);
      return { last, log: log.slice(-3), daily: d, date: dr.daily, mainStill: __run().runId === main, mainNode: __run().nodeId, unlocked: E.state().state.profile.expeditionUnlocked };
    });
    expect(r.last.startsWith('ended'), 'daily did not finish: ' + JSON.stringify(r.log));
    expect(r.daily && r.daily.history.length === 1 && r.daily.history[0].date === r.date && r.daily.streak === 1, 'daily not recorded: ' + JSON.stringify(r.daily));
    expect(r.mainStill && r.mainNode === 'warmup', 'main run was touched');
    expect(!r.unlocked.length, 'daily granted a permanent capture: ' + r.unlocked.join(','));
    expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
    await ctx.close();
  },

  // 壓測：24 隻都在覺醒狀態下打各種場地和首領；不卡死、打完數值還原
  async 'soak: every awakened character on every rule and boss'() {
    const { ctx, page, errors } = await fresh();
    await ready(page);
    const leads = ['pikachu', 'bird', 'vaporeon', 'flareon', 'jolteon', 'gengar', 'meowth', 'snorlax', 'mewtwo', 'electrode', 'wobbuffet', 'ditto', 'mrmime', 'dugtrio', 'farfetchd', 'psyduck', 'magikarp', 'jigglypuff', 'dragonite', 'mew', 'charmander', 'bulbasaur', 'squirtle', 'umbreon'];
    // 節點：一般、強風、搖籃曲、黃金球、重力場、念力停球、百變怪、三個首領（超夢再從第 2、3 階段開始）
    const nodes = [['warmup', 0], ['elite', 0], ['k2', 0], ['k3', 0], ['t1', 0], ['t2', 0], ['c3gate', 0], ['boss', 0], ['champion', 1], ['mewtwo', 0], ['mewtwo', 1], ['mewtwo', 2]];
    const jobs = [];
    leads.forEach((l, i) => { jobs.push([l, ...nodes[i % nodes.length]], [l, ...nodes[(i + 5) % nodes.length]]); });
    const out = await page.evaluate(async (list) => {
      const E = PVA.expedition, T = PVA.svc.abilities.tuning, base = JSON.stringify(T), bad = [], fired = {};
      for (const [lead, node, bs] of list) {
        if (!E.soak(node, lead, undefined, undefined, true, true, bs)) { bad.push(lead + '@' + node + ': did not start'); continue; }
        const res = await __ff();
        fired[lead] = (fired[lead] || 0) + E.awakenFired();
        E.soakStop(); await __sleep(30);
        if (res.stuck && res.frozen) bad.push(lead + '@' + node + ': ball frozen ' + res.scores.join(':'));
        if (JSON.stringify(T) !== base) { bad.push(lead + '@' + node + ': tuning not restored'); Object.assign(T, JSON.parse(base)); }
        if (PVA.svc.ctrl.winningScore !== 15) bad.push(lead + '@' + node + ': winning score not restored');
      }
      return { bad, fired };
    }, jobs);
    console.log('    ' + jobs.length + ' matches; awakenings fired: ' + Object.entries(out.fired).map(([k, v]) => k + ' ' + v).join(', '));
    expect(!out.bad.length, out.bad.join(' | '));
    // 只有光環的三隻不會發動。
    const look = ['mew', 'mewtwo', 'ditto'];
    expect(look.every((l) => !out.fired[l]), 'an aura-only character fired an effect');
    // 電腦自己打就會觸發的那幾隻一定要發動過。其他的要玩家特定的操作（小火龍按住上滑翔、胖丁空中按下殺球、
    // 水伊布撲救留水窪、火伊布大字爆得分…）或看對手怎麼打，電腦代打測不到，這裡只列出次數、不判定。
    const must = ['pikachu', 'jolteon', 'gengar', 'snorlax', 'electrode', 'wobbuffet', 'mrmime', 'farfetchd', 'psyduck', 'magikarp', 'dragonite'];
    const silent = must.filter((l) => !out.fired[l]);
    expect(!silent.length, 'awakening never fired: ' + silent.join(', '));
    expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
    await ctx.close();
  },
};

// 要玩家特定操作才會發動的覺醒：電腦照樣打，但測試替左邊按住指定的方向鍵。
// 注意：左邊交給電腦時，電腦會自己改寫方向輸入，所以只有「電腦本來就會按的方向」測得到：
// 小火龍（跳起來時電腦按著上）會判定；胖丁（空中按下）、水伊布（撲救留水窪）、火伊布（大字爆得分）只記錄次數。
tests['awaken: powers that need player input'] = async function () {
  const { ctx, page, errors } = await fresh();
  await ready(page);
  const out = await page.evaluate(async () => {
    const E = PVA.expedition, k = PVA.svc.ctrl.keyboardArray[0], res = {};
    // 小火龍：空中按住上滑翔；胖丁：空中按住下快速落地時殺球；水伊布：撲救留下的水窪把球彈起；火伊布：大字爆得分
    const plan = [['charmander', 'upKey'], ['jigglypuff', null], ['vaporeon', null], ['flareon', null]];
    for (const [lead, key] of plan) {
      let fired = 0, n = 0;
      for (; n < (key === 'upKey' ? 8 : 3) && fired === 0; n++) {
        if (!E.soak(n % 2 ? 'k1' : 'warmup', lead, undefined, undefined, true, true, 0)) break;
        const hold = setInterval(() => { if (key) { k[key].isDown = true; k[key].isUp = false; } }, 5);
        const c = PVA.svc.ctrl; let f = 0;
        while (f < 40000 && PVA.svc.expedition.playing() && (f < 5 || !c.gameEnded)) {
          for (let i = 0; i < 200 && !c.gameEnded; i++) { if (key) { k[key].isDown = true; k[key].isUp = false; } c.gameLoop(); f++; }
          await __sleep(0);
        }
        clearInterval(hold);
        if (key) { k[key].isDown = false; k[key].isUp = true; }
        fired += E.awakenFired();
        E.soakStop(); await __sleep(30);
      }
      res[lead] = { fired, matches: n };
    }
    return res;
  });
  console.log('    ' + Object.entries(out).map(([k, v]) => k + ' ' + v.fired + ' (' + v.matches + ' 場)').join(', '));
  expect(out.charmander.fired > 0, 'Charmander glide never fired while holding Up');
  expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
  await ctx.close();
};

// 兩個分頁：只有一個能寫；能寫的那個關掉之後，另一個不用重整就變成可以寫
tests['tabs: write access moves to the other tab when the writer closes'] = async function () {
  const { ctx, page, errors } = await fresh();
  await ready(page);
  const second = await ctx.newPage();
  second.on('pageerror', (e) => { if (!IGNORE.test(String(e.message))) errors.push(String(e.message)); });
  await second.addInitScript(HELPERS);
  await second.goto(base + '?exp=1');
  await second.evaluate(async () => { await __until(() => window.PVA && PVA.expedition && PVA.expedition.state().state, 30000); });
  const before = await second.evaluate(() => PVA.expedition.state().canWrite);
  expect(await page.evaluate(() => PVA.expedition.state().canWrite), 'first tab cannot write');
  expect(!before, 'second tab can write while the first one holds the lock');
  await page.close();
  const after = await second.evaluate(async () => __until(() => PVA.expedition.state().canWrite, 10000));
  expect(after, 'second tab did not get write access after the first one closed');
  const started = await second.evaluate(async () => { await PVA.expedition.actions.startNewRun(); return __until(() => __run()); });
  expect(started, 'second tab could not start a run after taking over');
  expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
  await ctx.close();
};

// 御三家進化：比賽中換成進化型的圖、第二階加強；打完換回一階、數值還原
tests['evolve: starters show their evolved sprite in matches'] = async function () {
  const { ctx, page, errors } = await fresh();
  await ready(page);
  const out = await page.evaluate(async () => {
    const E = PVA.expedition, c = PVA.svc.ctrl, T = PVA.svc.abilities.tuning, base = JSON.stringify(T), res = [];
    for (const [lead, stage, want] of [['charmander', 2, 'charmeleon'], ['charmander', 3, 'charizard'], ['bulbasaur', 2, 'ivysaur'], ['bulbasaur', 3, 'venusaur'], ['squirtle', 2, 'wartortle'], ['squirtle', 3, 'blastoise'], ['charmander', 1, '']]) {
      E.soak('warmup', lead, undefined, undefined, true, stage === 3, 0, stage);
      let shown = '';
      for (let i = 0; i < 80 && !shown; i++) { c.gameLoop(); shown = E.evolveShowing(); await __sleep(10); }
      const tuned = JSON.stringify(T) !== base;
      const r = await __ff();
      E.soakStop(); await __sleep(30);
      const restored = c.view.game.player1.textures === c.view.game.playerTextureArrays[lead] && JSON.stringify(T) === base;
      res.push({ lead, stage, want, shown, tuned, stuck: r.stuck, restored });
    }
    return res;
  });
  out.forEach((r) => {
    expect(r.shown === r.want, r.lead + ' stage ' + r.stage + ' showed "' + r.shown + '" instead of "' + r.want + '"');
    expect(r.tuned === (r.stage >= 2), r.lead + ' stage ' + r.stage + ': stage-2 tuning ' + (r.tuned ? 'applied' : 'missing'));
    expect(!r.stuck, r.lead + ' stage ' + r.stage + ' got stuck');
    expect(r.restored, r.lead + ' stage ' + r.stage + ': sprite or tuning not restored after the match');
  });
  console.log('    ' + out.filter((r) => r.want).map((r) => r.want).join(', '));
  expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
  await ctx.close();
};

// 面板：帶小火龍出發，贏到親密度 3 點，播進化演出、隊伍上顯示火恐龍
tests['evolve: the panel plays the evolution and shows the new form'] = async function () {
  const { ctx, page, errors } = await fresh();
  await ready(page);
  const out = await page.evaluate(async () => {
    const E = PVA.expedition;
    const pick = [...document.querySelectorAll('#pv-exp .pv-exp-chars .pv-exp-btn.char')].find((b) => b.textContent.includes('小火龍') || b.textContent.includes('Charmander'));
    if (!pick) return { error: 'no Charmander button' };
    pick.click(); await __sleep(50);
    await E.actions.startNewRun(); await __until(() => __run());
    if (__run().partyIds[0] !== 'charmander') return { error: 'lead is ' + __run().partyIds[0] };
    let scene = null;
    for (let i = 0; i < 30 && !scene; i++) {
      const m = await __step();
      if (m.startsWith('error') || m.startsWith('ended')) return { error: m };
      const sc = E.state().scenes.find((s) => s.kind === 'evolve');
      if (sc) scene = { from: sc.from, to: sc.to };
    }
    await __sleep(300);
    const lead = document.querySelector('#pv-exp .pv-exp-mate.lead b');
    return { scene, bond: __run().bond.charmander, leadName: lead ? lead.textContent : '' };
  });
  expect(!out.error, out.error || '');
  expect(out.scene && out.scene.from === 'charmander' && out.scene.to === 'charmeleon', 'no evolution scene: ' + JSON.stringify(out));
  expect(/火恐龍|Charmeleon/.test(out.leadName), 'party still shows ' + out.leadName);
  expect(!errors.length, 'page errors: ' + [...new Set(errors)].join(' | '));
  await ctx.close();
};

async function main() {
  // 固定從 8790 開始找（讓系統隨便挑可能挑到瀏覽器擋掉的連接埠，例如 1720）
  server = await preview({ preview: { port: 8790, strictPort: false }, logLevel: 'silent' });
  const addr = server.httpServer.address();
  base = 'http://localhost:' + addr.port + server.config.base;
  for (const channel of ['chrome', 'msedge']) {
    try { browser = await chromium.launch({ channel, headless: !HEADED }); break; } catch { /* 試下一個 */ }
  }
  if (!browser) throw new Error('找不到 Chrome 或 Edge（需要其中一個）');
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    const t0 = Date.now();
    try { await fn(); console.log('  ✓ ' + name + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)'); results.push([name, true]); }
    catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + String(e && e.message || e)); results.push([name, false]); }
  }
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
  console.log('\n' + (results.length - failed) + '/' + results.length + ' 通過');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
