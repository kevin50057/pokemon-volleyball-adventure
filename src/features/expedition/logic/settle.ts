/**
 * 比賽結算：勝負、收服、羈絆與覺醒、三選一、章節重來或前進、通關紀錄、每日遠征、訓練家手冊。
 * 呼叫前要確認這個 matchId 還沒結算過（db.ts 用結算紀錄的 id 去重）。不會修改輸入。
 */
import { BOND_BIG, BOND_WIN, CAPTURE_CHANCE, CHAPTERS, PARTY_MAX, RANK_MAX, hasEffect } from '../content';
import { rngFor } from '../rng';
import { resolveMatch } from '../route';
import type { CaptureRecord, ExpeditionRun, MatchResult, ProfileV1, SettlementV1 } from '../types';
import { addBond } from './bond';
import { recordDaily } from './daily';
import { heartCap, stampsCount } from './derived';
import { RuleError } from './errors';
import { refreshGoals } from './goals';
import { makeOffer } from './rewards';
import { bump, hasChallenge, settlementIdOf, snapshot } from './run';

export interface Settled {
  run: ExpeditionRun;
  profile: ProfileV1;
  capture?: CaptureRecord;
  offered?: string[];
  /** 心用完，回到這一章的開頭（章節制） */
  chapterRestart?: boolean;
  /** 這一場讓誰覺醒了 */
  awakened?: string;
  /** 新達成的訓練家手冊目標 */
  goals: string[];
}

export interface SettleInfo {
  /** 首領戰打到過的最高階段 */
  bossReached?: number;
}

/** 結算時改得到的 profile 欄位一律先建好（之後不必再判斷有沒有） */
type FullProfile = ProfileV1 & Required<Pick<ProfileV1, 'stamps' | 'ironmanClears' | 'awakenedSeen' | 'bondXp' | 'challengeClears'>>;
function cloneProfile(p: ProfileV1): FullProfile {
  return {
    ...p, expeditionUnlocked: p.expeditionUnlocked.slice(), captureMissesByCharacter: { ...p.captureMissesByCharacter },
    stamps: { ...(p.stamps || {}) }, ironmanClears: (p.ironmanClears || []).slice(), awakenedSeen: (p.awakenedSeen || []).slice(),
    bondXp: { ...(p.bondXp || {}) }, challengeClears: { ...(p.challengeClears || {}) },
  };
}

/** 收服的角色加入這一輪：有空位進隊伍（solo 挑戰一律進後援），否則進後援 */
function join(next: ExpeditionRun, char: string): boolean {
  if (next.partyIds.indexOf(char) >= 0 || next.benchIds.indexOf(char) >= 0) return false;
  if (next.partyIds.length < PARTY_MAX && !hasChallenge(next, 'solo')) { next.partyIds.push(char); return true; }
  next.benchIds.push(char);
  return false;
}

export function applySettlement(run: ExpeditionRun, profile: ProfileV1, matchId: string, result: MatchResult, scores: readonly [number, number], info: SettleInfo = {}): Settled {
  if (run.phase !== 'active') throw new RuleError('phase', 'settle in phase ' + run.phase);
  if (run.matchId !== matchId) throw new RuleError('mismatch', 'settle ' + matchId + ' but active is ' + run.matchId);
  const node = resolveMatch(run.nodeId, run.seed);
  if (!node) throw new RuleError('invalid', run.nodeId + ' is not a match node');
  const next = bump(run), p = cloneProfile(profile);
  delete next.matchId;
  next.pointDiff = run.pointDiff + (scores[0] - scores[1]);
  const out: Settled = { run: next, profile: p, goals: [] };
  /** 收尾：這一輪看過的覺醒記進圖鑑、（每日遠征）記一筆、重算訓練家手冊 */
  const finish = (post?: (q: ProfileV1) => ProfileV1): Settled => {
    next.awakened.forEach((ch) => { if (p.awakenedSeen.indexOf(ch) < 0) p.awakenedSeen.push(ch); });
    const g = refreshGoals(post ? post(p) : p);
    out.profile = g.profile; out.goals = g.achieved;
    return out;
  };

  if (result !== 'win') {
    next.losses = run.losses + 1;
    next.hearts = run.hearts - 1;
    next.phase = 'map';
    if (node.boss && info.bossReached !== undefined) next.bossPhase = Math.max(run.bossPhase || 0, info.bossReached);
    if (next.hearts > 0) return finish();
    if (run.mode === 'ironman') {
      next.phase = 'failed';
      return finish(run.daily ? (q) => recordDaily(q, next) : undefined);
    }
    // 章節制：回到這一章的開頭（快照），心回滿
    const cp = run.checkpoint;
    next.partyIds = cp.partyIds.slice(); next.benchIds = cp.benchIds.slice();
    next.ownedCardIds = cp.ownedCardIds.slice(); next.equippedCardIds = cp.equippedCardIds.slice();
    next.visitedNodeIds = cp.visitedNodeIds.slice();
    next.bond = { ...cp.bond }; next.awakened = cp.awakened.slice();
    next.nodeId = CHAPTERS[run.chapter].first; next.attemptNo = 0;
    next.hearts = heartCap(next);
    next.chapterRetries = run.chapterRetries + 1;
    delete next.bossPhase;
    out.chapterRestart = true;
    return finish();
  }

  // ---------- 贏了 ----------
  next.visitedNodeIds.push(run.nodeId);
  delete next.bossPhase;
  const lead = run.partyIds[0];
  p.bondXp[lead] = (p.bondXp[lead] || 0) + 1;
  // 收服：落在結算，不打斷決勝球。每日遠征只有「老朋友回來幫忙」，不會有新的永久收服
  if (node.capture && (!run.daily || p.expeditionUnlocked.indexOf(node.opp) >= 0)) {
    const have = p.expeditionUnlocked.indexOf(node.opp) >= 0;
    if (have) {
      // 早就收服過：不擲收服、圖鑑不動，直接來幫這一輪的忙
      if (next.partyIds.indexOf(node.opp) < 0 && next.benchIds.indexOf(node.opp) < 0) {
        out.capture = { char: node.opp, ok: true, sure: true, joined: join(next, node.opp), returning: true };
      }
    } else if (node.capture === 'stamps3' && stampsCount(p) < 3) {
      out.capture = { char: node.opp, ok: false, sure: false, joined: false, gated: { have: stampsCount(p), need: 3 } };
    } else {
      const missed = (p.captureMissesByCharacter[node.opp] || 0) > 0;
      const sure = node.capture !== 'chance' || missed;
      const ok = sure || rngFor(run.seed, run.nodeId, 'capture', run.rngVersion).next() < CAPTURE_CHANCE;
      let joined = false;
      if (ok) {
        p.expeditionUnlocked.push(node.opp);
        delete p.captureMissesByCharacter[node.opp];
        joined = join(next, node.opp);
      } else p.captureMissesByCharacter[node.opp] = (p.captureMissesByCharacter[node.opp] || 0) + 1;
      out.capture = { char: node.opp, ok, sure, joined };
    }
  }
  // 羈絆值：上場贏一場 +1，菁英（只給機制卡的站）或首領 +2；學習裝置：備援也拿
  const gain = node.boss || node.reward === 'rare' ? BOND_BIG : BOND_WIN;
  const woke = addBond(next, lead, gain);
  const backup = run.partyIds[1];        // 開打時的備援（這一場剛收服補進來的不算）
  const woke2 = backup && hasEffect(next.equippedCardIds, 'expShare') ? addBond(next, backup, gain) : null;
  if (woke || woke2) out.awakened = woke || woke2 || undefined;

  if (node.next === null) {
    // 這一章的最後一站：每日遠征就到這裡；主線有下一章就從下一章開頭開始，沒有就整輪通關
    const nc = run.daily ? undefined : CHAPTERS[run.chapter + 1];
    if (!nc) {
      next.phase = 'cleared';
      if (run.daily) return finish((q) => recordDaily(q, next));
      p.rankUnlocked = Math.max(p.rankUnlocked || 0, Math.min(RANK_MAX, run.rank + 1));
      p.stamps[lead] = Math.max(p.stamps[lead] || 0, run.rank + 1);
      if (run.mode === 'ironman' && p.ironmanClears.indexOf(lead) < 0) p.ironmanClears.push(lead);
      run.challenges.forEach((ch) => { p.challengeClears[ch] = (p.challengeClears[ch] || 0) + 1; });
      return finish();
    }
    next.chapter = run.chapter + 1; next.nodeId = nc.first; next.attemptNo = 0; next.phase = 'map';
    next.hearts = heartCap(next);
    next.checkpoint = snapshot(next);
    return finish();
  }
  next.nodeId = node.next; next.attemptNo = 0; next.phase = 'map';
  if (node.reward) {
    const pool = run.daily ? [] : p.cardPool || [];
    const offered = makeOffer(run, rngFor(run.seed, run.nodeId, 'cards', run.rngVersion), 3, { rare: node.reward === 'rare', pool, after: next });
    if (offered.length) {
      out.offered = offered;
      next.phase = 'reward';
      next.pendingReward = { settlementId: settlementIdOf(run.runId, matchId), offeredCardIds: offered };
    }
  }
  return finish();
}

/** 結算紀錄 */
export function makeSettlement(run: ExpeditionRun, s: Settled, matchId: string, result: MatchResult, scores: [number, number], now: number): SettlementV1 {
  const st: SettlementV1 = { id: settlementIdOf(run.runId, matchId), runId: run.runId, matchId, nodeId: run.nodeId, result, scores, revision: s.run.revision, at: now, lead: run.partyIds[0] };
  if (s.capture) st.capture = s.capture;
  if (s.chapterRestart) st.chapterRestart = true;
  if (s.awakened) st.awakened = s.awakened;
  if (s.offered) st.offered = s.offered;
  return st;
}
