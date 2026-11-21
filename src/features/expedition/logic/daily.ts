/**
 * 每日遠征：用 UTC 日期當種子，每天一章。種子決定打哪一章、三隻可選的夥伴、起始的兩張卡。
 * 固定難度 1、一命到底。分數 = 剩下的心 × 100 ＋ 總得失分差。只記本機；同一個日期打到的內容都一樣。
 * 存在另一個存檔位（'daily'），不會蓋掉主線那一輪。
 */
import { CARDS, CHAPTERS, STARTERS } from '../content';
import { rngFor } from '../rng';
import type { DailyProgress, ExpeditionRun, ProfileV1 } from '../types';
import { newRun } from './run';

export const DAILY_RANK = 1;
const HISTORY = 14;

export function utcDate(now: number): string { return new Date(now).toISOString().slice(0, 10); }
function prevDate(date: string): string { return utcDate(Date.parse(date + 'T00:00:00Z') - 86400000); }

export interface DailyPlan { date: string; seed: string; chapter: number; partners: string[]; cards: string[] }

export function dailyPlan(date: string): DailyPlan {
  const seed = 'daily-' + date, rng = rngFor(seed, 'daily', 'route');
  const chapter = rng.int(CHAPTERS.length);
  const starters = STARTERS.slice(), partners: string[] = [];
  while (partners.length < 3 && starters.length) partners.push(starters.splice(rng.int(starters.length), 1)[0]);
  const pool = CARDS.filter((c) => !c.locked && !c.passive).map((c) => c.id), cards: string[] = [];
  while (cards.length < 2 && pool.length) cards.push(pool.splice(rng.int(pool.length), 1)[0]);
  return { date, seed, chapter, partners, cards };
}

export function newDailyRun(plan: DailyPlan, partner: string, now: number, runId: string): ExpeditionRun {
  if (plan.partners.indexOf(partner) < 0) throw new Error(partner + ' is not offered today');
  return newRun({ runId, seed: plan.seed, party: partner, now, mode: 'ironman', rank: DAILY_RANK, daily: { date: plan.date, chapter: plan.chapter, cards: plan.cards } });
}

export function dailyScore(run: Pick<ExpeditionRun, 'phase' | 'hearts' | 'pointDiff'>): number {
  return (run.phase === 'cleared' ? run.hearts * 100 : 0) + run.pointDiff;
}

/**
 * 每日遠征打完（通關或心用完）：記一筆、算連續天數。
 * 同一個日期只記第一次打完的分數（之後再打是練習）；跨日才打完的舊日期只補進紀錄，不動連續天數。
 */
export function recordDaily(p: ProfileV1, run: ExpeditionRun): ProfileV1 {
  const date = run.daily;
  if (!date) return p;
  const d: DailyProgress = p.daily ? { ...p.daily, history: p.daily.history.slice() } : { lastDate: '', streak: 0, bestStreak: 0, history: [] };
  if (d.history.some((h) => h.date === date)) return p;
  d.history.push({ date, score: dailyScore(run), cleared: run.phase === 'cleared' });
  d.history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (d.history.length > HISTORY) d.history.splice(0, d.history.length - HISTORY);
  if (date > d.lastDate) {
    d.streak = d.lastDate === prevDate(date) ? d.streak + 1 : 1;
    d.bestStreak = Math.max(d.bestStreak, d.streak);
    d.lastDate = date;
  }
  return { ...p, daily: d };
}
/** 畫面上顯示的連續天數：最後一次是今天或昨天才算還在連續中 */
export function liveStreak(d: DailyProgress | undefined, today: string): number {
  return d && (d.lastDate === today || d.lastDate === prevDate(today)) ? d.streak : 0;
}
