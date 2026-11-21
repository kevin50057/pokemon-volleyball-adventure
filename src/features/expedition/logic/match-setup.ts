/**
 * 開打前算好這一場的設定：場地規則（storm 挑戰：沒有規則的一般比賽一律強風）、
 * 首領（難度 2 起 +2 血、bigBoss 挑戰 +3 血，都加在第一階段）、電腦強度（難度 1 起變強）、
 * 首領從第幾階段開始（同一次章節嘗試內打到過的最高階段；一命到底沒有這個檢查點）。
 */
import { BIG_BOSS_HP, bossWithExtraHp, rankBoss, rankDiff, type BossDef, type Diff, type MatchNode, type RuleId } from '../content';
import type { ExpeditionRun } from '../types';
import { hasChallenge } from './run';

export interface MatchSetup {
  rule?: RuleId;
  diff?: Diff;
  boss?: BossDef;
  bossStart: number;
}

export function matchSetup(run: ExpeditionRun, node: MatchNode): MatchSetup {
  let rule = node.rule;
  if (!rule && !node.boss && hasChallenge(run, 'storm')) rule = 'wind';
  let boss = rankBoss(node.boss, run.rank);
  if (boss && hasChallenge(run, 'bigBoss')) boss = bossWithExtraHp(boss, BIG_BOSS_HP);
  const bossStart = boss && run.mode === 'chapter' ? Math.min(boss.phases.length - 1, run.bossPhase || 0) : 0;
  const out: MatchSetup = { diff: rankDiff(node.diff, run.rank), bossStart };
  if (rule) out.rule = rule;
  if (boss) out.boss = boss;
  return out;
}
