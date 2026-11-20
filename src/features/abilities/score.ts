// ============================================================
// 得分（hooks.score，舊版 window._pvScore(ctrl, scorerIndex)）
// ============================================================
import type { Controller, Player } from '../../core/types';
import { CHARS } from '../characters';
import { pushBurst } from './fx';
import { newSide, pk, rt } from './state';
import { TUNING } from './tuning';

export function scorePoints(ctrl: Controller, scorerIdx: 0 | 1): number {
  const scorer = scorerIdx === 1 ? ctrl.physics.player2 : ctrl.physics.player1;
  const loser = scorerIdx === 1 ? ctrl.physics.player1 : ctrl.physics.player2;
  const lState = rt.state[pk(loser)];
  let points = 1;

  if (scorer.character === 'meowth' && Math.random() < TUNING.meowthDoubleChance) {
    points = 2;
    pushBurst(scorer.x, scorer.y - 10, '#FFC107', 70);
  }
  if (loser.character === 'psyduck') {
    lState.headacheCharge = (lState.headacheCharge || 0) + 1;
  }
  [scorer, loser].forEach(transformIfDitto);
  return points;
}

function transformIfDitto(player: Player): void {
  const m = rt.meta[pk(player)];
  if (m.origin !== 'ditto') return;
  const pool = CHARS.ids.filter(function (id) { return id !== 'ditto' && id !== player.character; });
  const next = pool[Math.floor(Math.random() * pool.length)];
  player.character = next;
  player.pvNoClamp = false;
  m.transformedTo = next;
  rt.state[pk(player)] = newSide();
  rt.state[pk(player)].char = next;
  pushBurst(player.x, player.y, '#FF69B4', 70);
}
