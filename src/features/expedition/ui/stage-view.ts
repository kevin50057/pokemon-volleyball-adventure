/**
 * 面板上方的畫布：地圖（剛結算完先依序播收服、覺醒演出）和通關明信片。
 */
import { fmt } from '../../../core/i18n';
import { AWAKEN_AT, auraColorOf, formOf } from '../content';
import { heartCap } from '../logic';
import { resolveMatch } from '../route';
import { T } from '../texts';
import type { ExpeditionRun } from '../types';
import { download, stamp } from './actions';
import { drawAwaken, drawCapture, drawMap, drawPostcard, face } from './art';
import { charName, formIn, nums, runName, stopNames, stopsOf, veiledOf } from './names';
import { journalLines } from './node-card';
import { ended, profile, ui, type Scene } from './state';
import { button, stage } from './widgets';

/** 一段演出播完之後，再停多久才換下一段（幀） */
const SCENE_HOLD = 30;

type G = CanvasRenderingContext2D;

/** 畫一段演出；回傳演完了沒 */
function drawScene(g: G, w: number, h: number, sc: Scene, f: number, t: number, n: readonly number[]): boolean {
  if (sc.kind === 'evolve') {
    const from = sc.from === sc.char ? charName(sc.char) : T.formName[sc.from] || sc.from, to = T.formName[sc.to] || sc.to;
    const third = sc.to === formOf(sc.char, AWAKEN_AT);
    return drawAwaken(g, w, h, f, t, n, {
      char: sc.to, from: sc.from, color: auraColorOf(sc.char), title: fmt(T.evolveTo, { from, to }),
      sub: third ? T.awakenName[sc.char] || '' : T.stage2Desc[sc.char] || '', note: '',
    });
  }
  if (sc.kind === 'awaken') {
    const name = charName(sc.char), evolve = sc.char === 'magikarp';
    return drawAwaken(g, w, h, f, t, n, {
      char: sc.char, color: auraColorOf(sc.char), title: fmt(evolve ? T.evolveScene : T.awakenScene, { name }),
      sub: T.awakenName[sc.char] || '', note: evolve ? T.evolveNote : T.awakenNote,
    });
  }
  const rec = sc.rec, name = charName(rec.char);
  const text = rec.gated ? fmt(T.dittoGate, rec.gated) : fmt(rec.returning ? T.captureBack : rec.ok ? T.captureOk : T.captureFail, { name });
  return drawCapture(g, w, h, f, t, n, rec.char, rec.ok, text, rec.ok ? (rec.joined ? T.captureJoin : T.captureDex) : '');
}

export function mapStage(body: HTMLElement, r: ExpeditionRun): void {
  // 窄螢幕：畫布的邏輯寬度變小（同樣的字在手機上大一點），只標目前這一站
  const compact = window.innerWidth < 560, W2 = compact ? 380 : 520, H2 = compact ? 190 : 200;
  const [c, g] = stage(W2, H2), n = nums(r.seed), veiled = veiledOf(r, profile()), names = stopNames(r.seed, veiled);
  const resolve = (id: string) => resolveMatch(id, r.seed);
  body.appendChild(c);
  let doneAt = 0;
  ui.draw = (t) => {
    const sc = ui.scenes[0];
    if (sc) {
      const now = performance.now();
      if (!sc.start) sc.start = now;
      const f = (now - sc.start) / 33;
      const done = drawScene(g, W2, H2, sc, f, t, n);
      // 還有下一段：這一段播完、停一下之後換下一段（最後一段停在最後一格，等玩家按「好」）
      if (done && ui.scenes.length > 1) {
        if (!doneAt) doneAt = f;
        if (f - doneAt > SCENE_HOLD) { ui.scenes.shift(); doneAt = 0; }
      }
      return;
    }
    drawMap(g, W2, H2, t, {
      compact, nums: n, nodeId: r.nodeId, visited: r.visitedNodeIds, lead: formIn(r, r.partyIds[0]), hearts: r.hearts, maxHearts: heartCap(r),
      resolve, stops: stopsOf(r), chapter: r.chapter, ended: ended(r), names, veiled,
    });
  };
}

export function postcardView(body: HTMLElement, r: ExpeditionRun): void {
  const [c, g] = stage(520, 250), cleared = r.phase === 'cleared';
  const lines = journalLines().slice(-5)
    .concat(r.ownedCardIds.length ? [r.ownedCardIds.map((id) => T.cardName[id] || id).join('・')] : [])
    .concat([fmt(T.pcLosses, { n: r.losses }) + (r.mode === 'ironman' ? '・' + T.modeIronman : r.chapterRetries ? '・' + fmt(T.retries, { n: r.chapterRetries }) : '')]);
  const paint = (): void => drawPostcard(g, 520, 250, {
    title: T.postcard, runName: runName(r), headline: cleared ? T.pcCleared : T.pcFailed, cleared,
    party: r.partyIds.map((id) => formIn(r, id)), visited: r.visitedNodeIds, names: stopNames(r.seed), hearts: r.hearts, maxHearts: heartCap(r),
    resolve: (id: string) => resolveMatch(id, r.seed), stops: stopsOf(r), awakened: r.awakened,
    lines, date: new Date(r.createdAt).toISOString().slice(0, 10), nums: nums(r.seed),
  });
  paint();
  // 頭像素材可能晚一點才載好：載好之後補畫一次
  ui.draw = () => { if (!c.dataset.done && face(formIn(r, r.partyIds[0]))) { paint(); c.dataset.done = '1'; } };
  body.appendChild(c);
  body.appendChild(button(T.savePostcard, () => { c.toBlob((b) => { if (b) download(b, 'pva-postcard-' + stamp() + '.png'); }); }, 'small'));
}

/** 演出還在畫面上時的「好」：收起演出、回到地圖 */
export function sceneOk(body: HTMLElement, render: () => void): void {
  if (ui.scenes.length) body.appendChild(button(T.ok, () => { ui.scenes = []; render(); }, 'main'));
}
