// 存檔：讀檔（逐欄檢查）、寫檔、收服、獎章、首勝率紀錄
import { store } from '../../core/storage';
import { CFG, KEY, STAGES, ZONE_START, tierOf, zoneIdx, zoneOf } from './config';
import { CH } from './chars';
import { save } from './state';
import type { Run, RunRec } from './state';
import { fmt } from '../../core/i18n';
import { T } from './texts';

// ---------- 讀存檔用的小工具：存檔是外來資料，每個欄位都要先檢查 ----------
/** 跟 JS 的 `o.k` 一樣：物件就取欄位，其他（null、數字、字串…）一律當成 undefined。 */
function get(o: unknown, k: string | number): unknown {
  return o !== null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;
}
/** 跟 JS 的 `CH.byId[x]` 一樣（屬性名稱會先轉成字串）。 */
function isChar(x: unknown): boolean { return !!CH.byId[String(x)]; }
// 註：下面的 Number(x) 等同舊版的 +x（JSON 讀不出 BigInt，兩者結果一樣）

function validRun(r: unknown): boolean {
  if (!r || typeof r !== 'object' || !isChar(get(r, 'char')) || !Array.isArray(get(r, 'order')) || (get(r, 'order') as unknown[]).length !== STAGES) return false;
  const order = get(r, 'order') as unknown[];
  for (let i = 0; i < order.length; i++) if (!isChar(order[i])) return false;
  const idx = Number(get(r, 'idx')), hearts = Number(get(r, 'hearts'));
  return idx >= 0 && idx < STAGES && hearts >= 1 && hearts <= CFG.hearts;
}
export function load(): void {
  try {
    const o = store.getJSON<unknown>(KEY);
    if (!o || typeof o !== 'object') return;
    CH.ids.forEach(function (id) {
      const m = get(get(o, 'medals'), id);
      if (m && Number(get(m, 'n')) > 0) { save.medals[id] = { n: Math.floor(Number(get(m, 'n'))) || 1, frames: Number(get(m, 'frames')) || 0, lost: Math.max(0, Math.floor(Number(get(m, 'lost'))) || 0) }; save.owned[id] = 1; }
      if (get(get(o, 'owned'), id)) save.owned[id] = 1;
    });
    save.acq = Math.max(0, Math.floor(Number(get(o, 'acq'))) || 0);
    save.tutDone = get(o, 'tutDone') ? 1 : 0;
    const stats = get(o, 'stats');
    if (stats && typeof stats === 'object') Object.keys(stats).forEach(function (k) {
      const v = get(stats, k);
      if (/^\d+:[a-z]+$/.test(k) && v && typeof v === 'object') save.stats[k] = { t: Math.max(0, Math.floor(Number(get(v, 't'))) || 0), w: Math.max(0, Math.floor(Number(get(v, 'w'))) || 0) };
    });
    const runs = get(o, 'runs');
    if (Array.isArray(runs)) save.runs = (runs as unknown[]).slice(-30).filter(function (r) { return r && isChar(get(r, 'c')); }).map(function (r): RunRec {
      // c 已經確認查得到角色；照舊保留原值
      return { c: get(r, 'c') as string, lost: Math.floor(Number(get(r, 'lost'))) || 0, f: Math.floor(Number(get(r, 'f'))) || 0, d: String(get(r, 'd') || '').slice(0, 10) };
    });
    const or = get(o, 'run');
    if (validRun(or)) {
      // validRun 已經檢查過 char、order 的每一格都是角色
      save.run = { char: get(or, 'char') as string, order: (get(or, 'order') as string[]).slice(), idx: Math.floor(Number(get(or, 'idx'))), hearts: Math.floor(Number(get(or, 'hearts'))),
        bossPhase: Math.min(3, Math.max(1, Math.floor(Number(get(or, 'bossPhase'))) || 1)), frames: Number(get(or, 'frames')) || 0, lost: Number(get(or, 'lost')) || 0, live: get(or, 'live') ? 1 : 0, att: {} };
      const att = get(or, 'att');
      if (att && typeof att === 'object') for (let ai = 0; ai < STAGES; ai++) if (Number(get(att, ai)) > 0) save.run.att[ai] = Math.floor(Number(get(att, ai)));
      save.owned[save.run.char] = 1;
      abandon();                                  // 上次打到一半就關掉或重新整理
    }
  } catch (e) { /* 壞檔：當成沒有存檔 */ }
}
export function persist(): void { try { store.setJSON(KEY, save); } catch (e) { /* 存不了就算了 */ } }

export function owned(id: string): boolean { return CFG.starters.indexOf(id) >= 0 || !!save.owned[id]; }
export function ownedCount(): number { return CH.ids.filter(owned).length; }
export function medalCount(): number { return Object.keys(save.medals).length; }
export function medalTier(id: string): number { const m = save.medals[id]; return m ? tierOf(m.lost) : 0; }
export function unlock(id: string): boolean { if (owned(id)) return false; save.owned[id] = 1; return true; }
// 百變怪：累積 3 面獎章；夢幻：一面金獎章，或 3 面銀以上
export function checkSpecial(): string[] {
  const got: string[] = [];
  let silver = 0, gold = 0;
  Object.keys(save.medals).forEach(function (id) { const t = medalTier(id); if (t >= 2) silver++; if (t >= 3) gold++; });
  if (medalCount() >= 3 && unlock('ditto')) got.push('ditto');
  if ((gold >= 1 || silver >= 3) && unlock('mew')) got.push('mew');
  // 月伊布：用水伊布、火伊布或雷伊布任一隻拿到獎章
  if (['vaporeon', 'flareon', 'jolteon'].some(function (id) { return !!save.medals[id]; }) && unlock('umbreon')) got.push('umbreon');
  return got;
}
export function howToGet(id: string): string {
  if (id === 'ditto') return T.howDitto;
  if (id === 'mew') return T.howMew;
  if (id === 'umbreon') return T.howUmbreon;
  if (id === 'mewtwo') return T.howMewtwo;
  for (let i = 0; i < CFG.zones.length; i++) {
    const z = CFG.zones[i], all = (z.fixed || []).concat(z.pool || [], z.last ? [z.last] : []);
    if (all.indexOf(id) >= 0) return fmt(T.howZone, { zone: z.name });
  }
  return '';
}

// 輸一場：敗場 +1、扣一顆心；心用完就補滿並退回區首（超夢則回到第一階段）。回傳是不是心用完了
export function applyLoss(run: Run): boolean {
  const boss = !!zoneOf(run.idx).boss;
  run.lost++;
  run.hearts--;
  if (run.hearts > 0) return false;
  run.hearts = CFG.hearts;
  if (boss) run.bossPhase = 1; else run.idx = ZONE_START[zoneIdx(run.idx)];
  return true;
}
// 打到一半就離開（暫停離開、按重來、重新整理）：跟輸掉一樣算，不然落後就離開反而划算
export function abandon(): void {
  const run = save.run;
  if (!run || !run.live) return;
  run.live = 0;
  applyLoss(run);
  persist();
}
