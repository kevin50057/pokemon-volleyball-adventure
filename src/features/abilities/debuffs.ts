// 所有角色共用的負面狀態（定身、變慢、顛倒），不論被誰施放都會生效
import type { Player, UserInput } from '../../core/types';
import { rt } from './state';
import type { SideKey } from './state';
import { clampPlayer } from './util';

export function processDebuffs(player: Player, input: UserInput, key: SideKey): void {
  const s = rt.state[key];
  if (s.stunTimer > 0) {
    s.stunTimer--;
    if (s.stunX != null) player.x = s.stunX;
  }
  if (s.slowTimer > 0) {             // 踩到金幣滑一跤：移動速度減半
    s.slowTimer--;
    if (player.state < 3 && input.xDirection !== 0) { player.x -= input.xDirection * 3; clampPlayer(player); }
  }
  if (s.reverseTimer > 0) {
    s.reverseTimer--;
    // 遊戲本體每幀移動 6 * 方向；先反推 10，淨效果是反方向 4
    if (player.state < 3 && input.xDirection !== 0) {
      player.x -= input.xDirection * 10;
      clampPlayer(player);
    }
  }
}
