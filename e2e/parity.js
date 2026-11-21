// 新舊版本逐幀比對：同一個亂數種子、同樣的角色組合，讓兩邊電腦對打，記錄每一幀的狀態。
// 在舊版（window._pv）和新版（window.PVA）都能用。用法：
//   await __parity.ready();  __parity.run(seed, 'pikachu', 'mewtwo', 3000) -> { hashes: '…', frames }
//   __parity.detail(seed, c1, c2, frame) -> 那一幀的完整狀態文字
(function () {
  function api() {
    if (window.PVA && window.PVA.svc) {
      var P = window.PVA;
      return { ctrl: P.svc.ctrl, abil: P.svc.abilities, setSim: function (v) { P.flags.sim = v; }, camp: P.campaign, campState: P.campaign && P.campaign.state };
    }
    var PC = window.PV_Campaign;
    return { ctrl: window._pv && window._pv.ctrl, abil: window._pvAbilities, setSim: function (v) { window._pvSim = v; }, camp: PC && PC._test, campState: PC && PC.state };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var STATES = ['intro', 'menu', 'afterMenuSelection', 'beforeStartOfNewGame', 'startOfNewGame', 'round', 'afterEndOfRound', 'beforeStartOfNextRound'];
  function stableJSON(v) {
    if (v === null || typeof v !== 'object') return typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableJSON).join(',') + ']';
    return '{' + Object.keys(v).filter(function (k) { return typeof v[k] !== 'function' && v[k] !== undefined && !(v[k] && v[k].isPlayer2 !== undefined); }).sort().map(function (k) { return k + ':' + stableJSON(v[k]); }).join(',') + '}';
  }
  function pl(p) {
    return [p.x, p.y, p.yVelocity, p.state, p.frameNumber, p.isCollisionWithBallHappened ? 1 : 0, p.character, p.divingDirection, p.lyingDownDurationLeft,
      p.flapsLeft, p.isDashing ? 1 : 0, p.dashCooldown, p.isWinner ? 1 : 0, p.computerBoldness, p.computerWhereToStandBy, p.pvNoClamp ? 1 : 0].join(',');
  }
  function snap(A) {
    var c = A.ctrl, ph = c.physics, b = ph.ball, st = '?';
    for (var i = 0; i < STATES.length; i++) if (c.state === c[STATES[i]]) st = STATES[i];
    return [st, c.frameCounter, c.scores.join('-'), c.gameEnded ? 1 : 0, c.roundEnded ? 1 : 0, c.isPlayer2Serve ? 1 : 0,
      [b.x, b.y, b.xVelocity, b.yVelocity, b.rotation, b.fineRotation, b.expectedLandingPointX, b.isPowerHit ? 1 : 0, b.punchEffectX, b.punchEffectRadius].join(','),
      pl(ph.player1), pl(ph.player2), A.abil ? stableJSON(A.abil.state()) : '',
      A.campState && A.campState.playing ? stableJSON({ rule: A.campState.rule, ko: A.campState.ko && A.campState.ko.t, boss: A.campState.boss && [A.campState.boss.phase, A.campState.boss.cut], opp: A.campState.opp, waiting: A.campState.waiting, speed: A.campState.speedEvery }) : ''].join('|');
  }
  function fnv(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
  var orig = null;
  function setup(seed, c1, c2) {
    var A = api(), c = A.ctrl;
    if (!orig) { orig = c.gameLoop; c.gameLoop = function () {}; }
    Math.random = mulberry32(seed);
    A.setSim(true);
    c.paused = false; c.slowMotionFramesLeft = 0; c.slowMotionNumOfSkippedFrames = 0;
    // 會影響亂數用量的隱藏狀態：雲、海浪、角色上一場留下來的欄位，一律設成固定值
    var g = c.view.game;
    if (g.cloudArray) g.cloudArray.forEach(function (cl, i) { cl.topLeftPointX = -68 + i * 50; cl.topLeftPointY = (i * 37) % 152; cl.topLeftPointXVelocity = 1 + (i % 2); cl.sizeDiffTurnNumber = i % 11; });
    if (g.wave) { g.wave.verticalCoord = 0; g.wave.verticalCoordVelocity = 2; for (var w = 0; w < g.wave.yCoords.length; w++) g.wave.yCoords[w] = 314; }
    [c.physics.player1, c.physics.player2].forEach(function (p) {
      p.computerWhereToStandBy = 0; p.divingDirection = 0; p.lyingDownDurationLeft = -1; p.flapsLeft = 0; p.prevYDirection = 0;
      p.isDashing = false; p.dashDirection = 0; p.dashFramesLeft = 0; p.dashCooldown = 0; p.dashTrailX = []; p.dashTrailY = []; p.pvNoClamp = false;
    });
    c.keyboardArray.forEach(function (k) { k.xDirection = 0; k.yDirection = 0; k.powerHit = 0; k.dashRequest = 0; });
    c.physics.player1.character = c1; c.physics.player2.character = c2;
    c.physics.player1.isComputer = true; c.physics.player2.isComputer = true;
    c.view.intro.visible = false; c.view.menu.visible = false;
    c.state = c.startOfNewGame; c.frameCounter = 0;
    return A;
  }
  function step(A) {
    var c = A.ctrl;
    c.physics.player1.isComputer = true; c.physics.player2.isComputer = true;
    orig.call(c);
  }
  // 闖關：從第 idx 關開打（雙方都是電腦），逐幀記錄
  function setupCampaign(seed, ch, idx) {
    var A = api(), c = A.ctrl;
    if (A.camp.hook) A.camp.hook();   // 舊版闖關是用 300ms 計時器才包住 gameLoop：先包好再接手
    if (!orig) { orig = c.gameLoop; c.gameLoop = function () {}; }
    Math.random = mulberry32(seed);
    A.setSim(true);
    var g = c.view.game;
    if (g.cloudArray) g.cloudArray.forEach(function (cl, i) { cl.topLeftPointX = -68 + i * 50; cl.topLeftPointY = (i * 37) % 152; cl.topLeftPointXVelocity = 1 + (i % 2); cl.sizeDiffTurnNumber = i % 11; });
    if (g.wave) { g.wave.verticalCoord = 0; g.wave.verticalCoordVelocity = 2; for (var w = 0; w < g.wave.yCoords.length; w++) g.wave.yCoords[w] = 314; }
    [c.physics.player1, c.physics.player2].forEach(function (p) { p.computerWhereToStandBy = 0; p.divingDirection = 0; p.lyingDownDurationLeft = -1; p.flapsLeft = 0; p.prevYDirection = 0; p.isDashing = false; p.dashCooldown = 0; p.dashTrailX = []; p.dashTrailY = []; });
    A.campState.proxy = { move: 1, spike: 1, lapse: 0 };
    A.camp.newRun(ch);
    var save = (window.PVA ? window.PVA.campaign.save() : window.PV_Campaign.save());
    save.run.idx = idx;
    A.camp.start();
    return A;
  }
  window.__parity = {
    campaign: function (seed, ch, idx, frames) {
      var A = setupCampaign(seed, ch, idx), out = [];
      for (var f = 0; f < frames; f++) { orig.call(A.ctrl); out.push(fnv(snap(A))); if (A.campState.waiting) break; }
      return { hashes: out.join(''), frames: out.length, end: snap(A).slice(0, 120) };
    },
    campaignDetail: function (seed, ch, idx, frame) {
      var A = setupCampaign(seed, ch, idx), s = '';
      for (var f = 0; f <= frame; f++) { orig.call(A.ctrl); if (f >= frame - 1) s += 'F' + f + ' ' + snap(A) + '\n'; }
      return s;
    },
    ready: async function () {
      for (var i = 0; i < 300; i++) { var A = api(); if (A.ctrl) return true; await new Promise(function (r) { setTimeout(r, 100); }); }
      return false;
    },
    run: function (seed, c1, c2, frames) {
      var A = setup(seed, c1, c2), out = [];
      for (var f = 0; f < frames; f++) { step(A); out.push(fnv(snap(A))); }
      return { hashes: out.join(''), frames: frames, end: snap(A).slice(0, 120) };
    },
    detail: function (seed, c1, c2, frame) {
      var A = setup(seed, c1, c2), s = '';
      for (var f = 0; f <= frame; f++) { step(A); if (f >= frame - 1) s += 'F' + f + ' ' + snap(A) + '\n'; }
      return s;
    }
  };
})();
