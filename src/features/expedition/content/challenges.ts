/**
 * 挑戰規則：通關一次（任何模式）後開放，開新一輪時可以勾，可以疊加，跟難度等級並存。
 * 每一條通關一次就在訓練家手冊上記一枚徽章。效果都在規則層（logic/），不碰比賽本身的物理。
 */
import type { ChallengeId } from '../types';

export const CHALLENGES: readonly ChallengeId[] = ['noCards', 'solo', 'storm', 'fewSlots', 'bigBoss', 'random'];
/** 首領多幾滴血（bigBoss） */
export const BIG_BOSS_HP = 3;
export function isChallenge(id: string): id is ChallengeId { return (CHALLENGES as readonly string[]).indexOf(id) >= 0; }
