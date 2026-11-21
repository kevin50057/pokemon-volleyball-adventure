// characters — 角色資料（唯一來源）
// 技能系統與選角面板都從這裡讀，新增或修改角色只要改這一份。
// （舊版 characters.js → window.PV_CHARS）
import type { CharacterId } from '../../core/types';
import { pick } from '../../core/i18n';

/** 屬性（中文單字，跟舊版一樣直接當鍵用）。 */
export type PokeType = '電' | '水' | '火' | '鬼' | '普' | '超' | '地' | '妖' | '龍' | '草';

/** 技能名稱（技能系統用來查表）。 */
export type AbilityName =
  | 'static' | 'flying' | 'acidArmor' | 'fireSmash' | 'emWave' | 'ghostPhase' | 'payday'
  | 'bellyBounce' | 'psychic' | 'fakeBall' | 'counter' | 'transform' | 'barrier' | 'dig'
  | 'leekBoomerang' | 'headache' | 'splash' | 'sing' | 'outrage' | 'psychicShield'
  | 'smallFlame' | 'vineWhip' | 'shellSlide';

export interface CharDef {
  id: CharacterId;
  name: string;
  type: PokeType;
  ability: AbilityName;
  /** 以下三個是已依頁面語言（zh／en／ko）選好的顯示文字，不要拿來當鍵。 */
  skill: string;
  desc: string;
  /** 屬性色（由 type 查 TYPE_COLORS 得來） */
  color: string;
}

type CharSource = Pick<CharDef, 'id' | 'type' | 'ability'>;
/** 會依頁面語言改變的文字。 */
type CharText = Pick<CharDef, 'name' | 'skill' | 'desc'>;

// id 必須和遊戲本體內的角色 id、圖檔名稱一致
const SOURCE: CharSource[] = [
  { id: 'pikachu',    type: '電', ability: 'static' },
  { id: 'bird',       type: '電', ability: 'flying' },
  { id: 'vaporeon',   type: '水', ability: 'acidArmor' },
  { id: 'flareon',    type: '火', ability: 'fireSmash' },
  { id: 'jolteon',    type: '電', ability: 'emWave' },
  { id: 'gengar',     type: '鬼', ability: 'ghostPhase' },
  { id: 'meowth',     type: '普', ability: 'payday' },
  { id: 'snorlax',    type: '普', ability: 'bellyBounce' },
  { id: 'mewtwo',     type: '超', ability: 'psychic' },
  { id: 'electrode',  type: '電', ability: 'fakeBall' },
  { id: 'wobbuffet',  type: '超', ability: 'counter' },
  { id: 'ditto',      type: '普', ability: 'transform' },
  { id: 'mrmime',     type: '超', ability: 'barrier' },
  { id: 'dugtrio',    type: '地', ability: 'dig' },
  { id: 'farfetchd',  type: '普', ability: 'leekBoomerang' },
  { id: 'psyduck',    type: '水', ability: 'headache' },
  { id: 'magikarp',   type: '水', ability: 'splash' },
  { id: 'jigglypuff', type: '妖', ability: 'sing' },
  { id: 'dragonite',  type: '龍', ability: 'outrage' },
  { id: 'mew',        type: '超', ability: 'psychicShield' },
  // 關都御三家（一階）：跟皮卡丘只差 5%～15%，進化後才會有大招
  { id: 'charmander', type: '火', ability: 'smallFlame' },
  { id: 'bulbasaur',  type: '草', ability: 'vineWhip' },
  { id: 'squirtle',   type: '水', ability: 'shellSlide' },
];

// 角色名稱、技能名稱、說明（三種語言；鍵一定要齊全，型別會檢查）
const TEXTS: Record<CharacterId, CharText> = pick<Record<CharacterId, CharText>>({
  zh: {
    pikachu:    { name: '皮卡丘',   skill: '靜電', desc: '殺出去的球帶電，對手接到時有 55% 機率被麻痺 0.8 秒。' },
    bird:       { name: '閃電鳥',   skill: '飛行＋雷擊俯衝', desc: '在空中再按「上」拍翅，最多 6 次。同一次跳躍拍翅 3 次以上後殺球，會變成雷擊俯衝：又快又準，而且球帶電，對手接到有機率麻痺。' },
    vaporeon:   { name: '水伊布',   skill: '溶化滑行', desc: '可衝刺。撲救時留下水窪，球落在水窪上會自動彈起。' },
    flareon:    { name: '火伊布',   skill: '烈焰重擊＋引火', desc: '殺球是火球：對手用身體接到會灼傷 2 秒，這段時間內的下一次殺球會變弱（直接把火球殺回來就不會灼傷）。自己用身體接起對手的殺球會「引火」3 秒，這時殺球變成大字爆：又快又準、一定落在對面，灼傷也更久。' },
    jolteon:    { name: '雷伊布',   skill: '電光一閃', desc: '連按兩下左或右，瞬間閃過去一大段（地上、空中都可以，冷卻 2.4 秒）。閃完 0.4 秒內殺球，會變成又快又準的電光殺球。' },
    gengar:     { name: '耿鬼',     skill: '空間偷渡＋暗影球', desc: '殺球後可穿網移動約 1.5 秒並推開對手，暗影球往下砸。' },
    meowth:     { name: '喵喵',     skill: '聚寶功', desc: '得分有 15% 機率算 2 分；殺球在對面撒金幣（場上最多 2 枚），踩到會滑一跤、移動變慢 1 秒。' },
    snorlax:    { name: '卡比獸',   skill: '肚皮彈簧床', desc: '慢、跳不高，但身體碰球會大力彈起；落地震飛地面上的對手。' },
    mewtwo:     { name: '超夢',     skill: '念力導向', desc: 'Boss。移動快，殺球後球會急墜。念力冷卻好時（身邊有紫色光環，每 6 秒一次），球一過網就被轉往離對手最遠的那一邊。' },
    electrode:  { name: '頑皮雷彈', skill: '大爆炸', desc: '殺球後球路突變，接著在球附近爆炸，炸開並定身對手。' },
    wobbuffet:  { name: '果然翁',   skill: '雙倍奉還', desc: '用身體接到對手的殺球時，先把球高高彈起，到最高點自動朝對面猛砸回去。' },
    ditto:      { name: '百變怪',   skill: '變身', desc: '每次有人得分，就隨機變成另一隻角色。' },
    mrmime:     { name: '魔牆人偶', skill: '屏障', desc: '殺球後網子上方出現約 1.5 秒的隱形牆，擋下一球就碎：一般球會軟軟彈回對面，對手的殺球會打穿但變慢。之後冷卻 4 秒。' },
    dugtrio:    { name: '三地鼠',   skill: '沙丘陷阱', desc: '移動快。起跳時留下沙丘，球落在沙丘上會亂彈不算分。' },
    farfetchd:  { name: '大蔥鴨',   skill: '大蔥揮擊＋居合斬', desc: '拿著大蔥，殺球打得到比別人遠的球，不用貼到身上。直接把對手的殺球殺回去就是居合斬：又快又準，一定落在對面。一般殺球又平又快，過網後還會往回飄。' },
    psyduck:    { name: '可達鴨',   skill: '頭痛爆發', desc: '走路偶爾跌倒。被得分、或接起對手的殺球都會累積頭痛，滿 3 層後下一次殺球是頭痛大爆發：必定打進對面，還讓對手頭暈一下。' },
    magikarp:   { name: '鯉魚王',   skill: '躍起', desc: '又慢又弱，但每次跳有 7% 機率進化成暴鯉龍 4 秒，每一擊都是保證打進對面的重擊；接起對手殺球時有 15% 機率直接進化。進化時有一成機率變成紅色暴鯉龍：撐 6 秒、球更快，還會威嚇讓對手定身一下。' },
    jigglypuff: { name: '胖丁',     skill: '唱歌', desc: '落得很慢，像飄著一樣；在空中按「下」可以取消漂浮、快速落地。殺球讓對手左右顛倒 4 秒。' },
    dragonite:  { name: '快龍',     skill: '逆鱗', desc: '殺球就暴走 3 秒、移動變快，這一球算第一層；暴走中每次殺球再疊一層，最多 3 層（連殺 3 球就滿），一層比一層砸得重。暴走結束會混亂 1 秒（左右顛倒）。' },
    mew:        { name: '夢幻',     skill: '瞬間移動＋念力護盾', desc: '神獸。連按兩下方向鍵瞬間移動：球會落在自己場上就往落點瞬移（有距離上限，每 6 秒一次）。身邊有粉紅光環時，快落地的球一定會被念力托起（每 20 秒一次）；趁球還帶著光環殺球就是念力彈，又快又準。' },
    charmander: { name: '小火龍',   skill: '小火苗＋衝刺', desc: '移動稍快。在網前（靠網 1/3）殺球，球速快 8%；撲救滑得比較遠。' },
    bulbasaur:  { name: '妙蛙種子', skill: '短藤鞭＋飛葉', desc: '移動和跳躍稍慢，但身體左右的擊球範圍比較寬，擦邊球也接得到。不按方向鍵直接殺球是飛葉：過網後會慢下來、早一點落地。' },
    squirtle:   { name: '傑尼龜',   skill: '縮殼滑行＋硬殼', desc: '地上跑得快、跳得比較低，殺球稍弱。撲救滑得很遠，倒地後起身快。硬殼：不會被對手的技能震飛或推開。' },
  },
  en: {
    pikachu:    { name: 'Pikachu',    skill: 'Static', desc: 'Its spikes carry static: an opponent who receives one has a 55% chance to be paralyzed for 0.8s.' },
    bird:       { name: 'Zapdos',     skill: 'Fly + Thunder Dive', desc: 'Press Up again in midair to flap, up to 6 times. Spike after 3+ flaps in the same jump for a Thunder Dive: fast, accurate and electrified, with a chance to paralyze the opponent who receives it.' },
    vaporeon:   { name: 'Vaporeon',   skill: 'Acid Armor Glide', desc: 'Can dash. Dives leave a puddle; a ball landing on a puddle bounces back up on its own.' },
    flareon:    { name: 'Flareon',    skill: 'Flame Smash + Flash Fire', desc: 'Spikes are fireballs: an opponent who receives one with their body is burned for 2s, and their next spike in that time is weaker (spiking the fireball straight back avoids the burn). Receiving an opponent\'s spike with your body triggers Flash Fire for 3s, turning your spikes into Fire Blast: fast, accurate, sure to land on the other side, with a longer burn.' },
    jolteon:    { name: 'Jolteon',    skill: 'Quick Attack', desc: 'Double-tap Left or Right to zip a long way in an instant (on the ground or in the air; 2.4s cooldown). Spike within 0.4s after the zip for a fast, accurate Quick Attack spike.' },
    gengar:     { name: 'Gengar',     skill: 'Phase Shift + Shadow Ball', desc: 'After spiking, it can pass through the net for about 1.5s and shove the opponent aside. Shadow Ball slams downward.' },
    meowth:     { name: 'Meowth',     skill: 'Pay Day', desc: 'Its points have a 15% chance to count double. Spikes scatter coins on the other side (up to 2 on court); stepping on one makes you slip and slows you for 1s.' },
    snorlax:    { name: 'Snorlax',    skill: 'Belly Trampoline', desc: 'Slow and can\'t jump high, but the ball bounces hard off its body. Its landing knocks grounded opponents into the air.' },
    mewtwo:     { name: 'Mewtwo',     skill: 'Psychic Redirect', desc: 'Boss. Moves fast, and its spikes drop sharply. When Psychic is ready (purple aura around it, once every 6s), a ball crossing the net is turned toward the side farthest from the opponent.' },
    electrode:  { name: 'Electrode',  skill: 'Explosion', desc: 'After a spike the ball suddenly changes course, then explodes nearby, blasting the opponent away and freezing them in place.' },
    wobbuffet:  { name: 'Wobbuffet',  skill: 'Counter', desc: 'When it receives an opponent\'s spike with its body, it pops the ball high, then automatically slams it back across at the peak.' },
    ditto:      { name: 'Ditto',      skill: 'Transform', desc: 'Every time anyone scores, it turns into another random character.' },
    mrmime:     { name: 'Mr. Mime',   skill: 'Barrier', desc: 'After a spike, an invisible wall appears above the net for about 1.5s and shatters after stopping one ball: normal balls bounce softly back to the other side, while opponent spikes break through but slow down. Then a 4s cooldown.' },
    dugtrio:    { name: 'Dugtrio',    skill: 'Dune Trap', desc: 'Moves fast. Jumping leaves a sand mound; a ball landing on a mound bounces off wildly and doesn\'t score.' },
    farfetchd:  { name: 'Farfetch\'d', skill: 'Leek Swing + Iai Slash', desc: 'Wielding a leek, its spikes reach balls farther away than anyone else\'s, no body contact needed. Spiking an opponent\'s spike straight back is an Iai Slash: fast, accurate, sure to land on the other side. Normal spikes are flat and fast and drift back after crossing the net.' },
    psyduck:    { name: 'Psyduck',    skill: 'Headache Burst', desc: 'Sometimes trips while walking. Losing a point or receiving an opponent\'s spike builds up its headache; at 3 stacks its next spike is a Headache Burst: sure to land on the other side, and it leaves the opponent dizzy for a moment.' },
    magikarp:   { name: 'Magikarp',   skill: 'Splash', desc: 'Slow and weak, but every jump has a 7% chance to evolve into Gyarados for 4s, turning every hit into a heavy blow sure to land on the other side; receiving an opponent\'s spike has a 15% chance to evolve it instantly. Each evolution has a 10% chance to be a Red Gyarados: it lasts 6s, hits faster, and uses Intimidate to freeze the opponent briefly.' },
    jigglypuff: { name: 'Jigglypuff', skill: 'Sing', desc: 'Falls very slowly, as if floating; press Down in midair to stop floating and drop fast. Spikes swap the opponent\'s left and right for 4s.' },
    dragonite:  { name: 'Dragonite',  skill: 'Outrage', desc: 'A spike sends it into a 3s rampage with faster movement, and that spike counts as stack 1. Each spike during the rampage adds a stack, up to 3 (3 spikes in a row maxes it out), each hitting harder than the last. When the rampage ends it is confused for 1s (left and right swapped).' },
    mew:        { name: 'Mew',        skill: 'Teleport + Psychic Shield', desc: 'Mythical. Double-tap a direction to teleport: if the ball will land on your side, you warp to where it lands (limited range, once every 6s). While a pink aura surrounds you, a ball about to hit the ground is always lifted back up by psychic power (once every 20s); spike it while the ball still glows for a fast, accurate Psychic shot.' },
    charmander: { name: 'Charmander', skill: 'Ember + Dash', desc: 'Moves slightly faster. Spikes from near the net (the third of the court closest to it) are 8% faster; dives slide farther.' },
    bulbasaur:  { name: 'Bulbasaur',  skill: 'Short Vine Whip + Razor Leaf', desc: 'Moves and jumps slightly slower, but its hitting range to the left and right is wider, so it can reach glancing balls. Spiking without pressing a direction is Razor Leaf: it slows down after crossing the net and lands a little sooner.' },
    squirtle:   { name: 'Squirtle',   skill: 'Shell Slide + Hard Shell', desc: 'Runs fast on the ground but jumps lower, and its spikes are slightly weaker. Dives slide very far, and it gets up quickly. Hard Shell: opponents\' skills can\'t knock it away or push it.' },
  },
  ko: {
    pikachu:    { name: '피카츄',   skill: '정전기', desc: '스파이크한 공에 전기가 흘러, 상대가 받으면 55% 확률로 0.8초 동안 마비된다.' },
    bird:       { name: '썬더',     skill: '비행 + 번개 급강하', desc: '공중에서 ‘위’를 다시 누르면 날갯짓, 최대 6회. 한 번의 점프에서 3회 이상 날갯짓한 뒤 스파이크하면 번개 급강하: 빠르고 정확하며 공에 전기가 흘러, 상대가 받으면 일정 확률로 마비된다.' },
    vaporeon:   { name: '샤미드',   skill: '녹기 슬라이드', desc: '대시 가능. 다이빙하면 물웅덩이가 남고, 공이 물웅덩이에 떨어지면 저절로 튀어 오른다.' },
    flareon:    { name: '부스터',   skill: '화염 강타 + 타오르는불꽃', desc: '스파이크가 불덩이: 상대가 몸으로 받으면 2초 동안 화상을 입고, 그동안 다음 스파이크가 약해진다(불덩이를 바로 스파이크로 되받아치면 화상을 입지 않는다). 상대의 스파이크를 몸으로 받아내면 3초 동안 ‘타오르는불꽃’ 상태가 되어 스파이크가 불대문자로 바뀐다: 빠르고 정확하며 반드시 상대 코트에 떨어지고, 화상도 더 오래간다.' },
    jolteon:    { name: '쥬피썬더', skill: '전광석화', desc: '왼쪽이나 오른쪽을 두 번 연속 누르면 순식간에 먼 거리를 이동한다(지상·공중 모두 가능, 쿨타임 2.4초). 이동 후 0.4초 안에 스파이크하면 빠르고 정확한 전광석화 스파이크가 된다.' },
    gengar:     { name: '팬텀',     skill: '공간 잠입 + 섀도볼', desc: '스파이크 후 약 1.5초 동안 네트를 통과해 움직이며 상대를 밀쳐낸다. 섀도볼은 아래로 내리꽂힌다.' },
    meowth:     { name: '나옹',     skill: '고양이돈받기', desc: '득점할 때 15% 확률로 2점이 된다. 스파이크하면 상대 코트에 동전을 뿌리고(코트에 최대 2개), 밟으면 미끄러져 1초 동안 느려진다.' },
    snorlax:    { name: '잠만보',   skill: '배 트램펄린', desc: '느리고 높이 뛰지 못하지만, 몸에 닿은 공이 세게 튕겨 나간다. 착지하면 땅에 있는 상대를 띄워 날린다.' },
    mewtwo:     { name: '뮤츠',     skill: '염동력 유도', desc: '보스. 이동이 빠르고, 스파이크한 공이 급강하한다. 염동력이 준비되면(몸 주위에 보라색 오라, 6초마다 1회) 공이 네트를 넘자마자 상대에게서 가장 먼 쪽으로 방향이 바뀐다.' },
    electrode:  { name: '붐볼',     skill: '대폭발', desc: '스파이크 후 공의 궤도가 갑자기 바뀌고, 이어서 공 근처에서 폭발해 상대를 날려버리고 움직이지 못하게 한다.' },
    wobbuffet:  { name: '마자용',   skill: '카운터', desc: '상대의 스파이크를 몸으로 받으면 먼저 공을 높이 띄운 뒤, 최고점에서 자동으로 상대 코트에 세게 내리꽂는다.' },
    ditto:      { name: '메타몽',   skill: '변신', desc: '누군가 득점할 때마다 무작위로 다른 캐릭터로 변신한다.' },
    mrmime:     { name: '마임맨',   skill: '배리어', desc: '스파이크 후 약 1.5초 동안 네트 위에 투명한 벽이 생기고, 공을 한 번 막으면 부서진다: 일반 공은 상대 코트로 힘없이 튕겨 돌아가고, 상대의 스파이크는 뚫고 지나가지만 느려진다. 이후 쿨타임 4초.' },
    dugtrio:    { name: '닥트리오', skill: '모래 언덕 함정', desc: '이동이 빠르다. 점프할 때 모래 언덕을 남기고, 공이 모래 언덕에 떨어지면 엉뚱하게 튀어 득점이 되지 않는다.' },
    farfetchd:  { name: '파오리',   skill: '대파 휘두르기 + 거합베기', desc: '대파를 들고 있어 다른 캐릭터보다 먼 공도 몸에 붙지 않고 스파이크할 수 있다. 상대의 스파이크를 바로 스파이크로 되받아치면 거합베기: 빠르고 정확하며 반드시 상대 코트에 떨어진다. 일반 스파이크는 낮고 빠르며, 네트를 넘은 뒤 뒤쪽으로 휘어진다.' },
    psyduck:    { name: '고라파덕', skill: '두통 폭발', desc: '걷다가 가끔 넘어진다. 실점하거나 상대의 스파이크를 받아내면 두통이 쌓이고, 3단계가 차면 다음 스파이크는 두통 대폭발: 반드시 상대 코트에 들어가고, 상대를 잠깐 어지럽게 만든다.' },
    magikarp:   { name: '잉어킹',   skill: '튀어오르기', desc: '느리고 약하지만, 점프할 때마다 7% 확률로 4초 동안 갸라도스로 진화해 모든 공격이 반드시 상대 코트에 들어가는 강타가 된다. 상대의 스파이크를 받아낼 때는 15% 확률로 바로 진화한다. 진화할 때 10% 확률로 붉은 갸라도스가 된다: 6초 동안 유지되고 공이 더 빠르며, 위협으로 상대를 잠깐 움직이지 못하게 한다.' },
    jigglypuff: { name: '푸린',     skill: '노래하기', desc: '떠다니듯 아주 천천히 떨어진다. 공중에서 ‘아래’를 누르면 부유를 멈추고 빠르게 착지한다. 스파이크하면 상대의 좌우 조작이 4초 동안 반대로 바뀐다.' },
    dragonite:  { name: '망나뇽',   skill: '역린', desc: '스파이크하면 3초 동안 폭주해 이동이 빨라지고, 그 스파이크가 1단계가 된다. 폭주 중 스파이크할 때마다 1단계씩 쌓여 최대 3단계(연속 3번 스파이크하면 최대)이며, 단계가 오를수록 더 세게 내리친다. 폭주가 끝나면 1초 동안 혼란(좌우 반전) 상태가 된다.' },
    mew:        { name: '뮤',       skill: '순간이동 + 염동력 보호막', desc: '환상의 포켓몬. 방향키를 두 번 연속 누르면 순간이동: 공이 자기 코트에 떨어질 것 같으면 낙하 지점으로 순간이동한다(거리 제한, 6초마다 1회). 몸 주위에 분홍색 오라가 있으면 땅에 떨어지려는 공을 반드시 염동력으로 띄워 올린다(20초마다 1회). 공에 아직 오라가 남아 있을 때 스파이크하면 빠르고 정확한 염동력탄이 된다.' },
    charmander: { name: '파이리',   skill: '불꽃 + 대시', desc: '이동이 조금 빠르다. 네트 앞(네트 쪽 1/3)에서 스파이크하면 공 속도가 8% 빨라지고, 다이빙 때 더 멀리 미끄러진다.' },
    bulbasaur:  { name: '이상해씨', skill: '짧은 덩굴채찍 + 잎날가르기', desc: '이동과 점프가 조금 느리지만, 몸 좌우의 타격 범위가 넓어 스치는 공도 받을 수 있다. 방향키를 누르지 않고 스파이크하면 잎날가르기: 네트를 넘은 뒤 느려져 조금 일찍 떨어진다.' },
    squirtle:   { name: '꼬부기',   skill: '껍질 슬라이드 + 단단한 껍질', desc: '지상에서 빠르게 달리지만 점프가 낮고, 스파이크가 조금 약하다. 다이빙하면 아주 멀리 미끄러지고, 넘어진 뒤 빨리 일어난다. 단단한 껍질: 상대의 기술에 날아가거나 밀려나지 않는다.' },
  },
});

// 屬性 → 擊球光的顏色（殺球閃光、球的殘影、角色選擇的屬性標籤都用這個）
const TYPE_COLORS: Record<PokeType, string> = {
  '電': '#FFE14D',
  '水': '#3DA9FF',
  '火': '#FF5A1F',
  '鬼': '#8E44FF',
  '普': '#F2F2F2',
  '超': '#FF4FB8',
  '地': '#D9A55B',
  '妖': '#FF9FE0',
  '龍': '#5B6CFF',
  '草': '#5FD35F',
};

/** 屬性的顯示名稱（依頁面語言）。`type` 本身是內部鍵，畫面上要顯示屬性時用這個。 */
export const TYPE_LABELS: Record<PokeType, string> = pick<Record<PokeType, string>>({
  zh: { '電': '電', '水': '水', '火': '火', '鬼': '鬼', '普': '普', '超': '超', '地': '地', '妖': '妖', '龍': '龍', '草': '草' },
  en: { '電': 'Electric', '水': 'Water', '火': 'Fire', '鬼': 'Ghost', '普': 'Normal', '超': 'Psychic', '地': 'Ground', '妖': 'Fairy', '龍': 'Dragon', '草': 'Grass' },
  ko: { '電': '전기', '水': '물', '火': '불꽃', '鬼': '고스트', '普': '노말', '超': '에스퍼', '地': '땅', '妖': '페어리', '龍': '드래곤', '草': '풀' },
});

const LIST: CharDef[] = SOURCE.map((c) => ({ ...c, ...TEXTS[c.id], color: TYPE_COLORS[c.type] || '#FFFFFF' }));

/** 用 CharacterId 查一定有；用任意字串查（例如連線收到的、存檔讀出來的）可能是 undefined。 */
export type CharById = Record<CharacterId, CharDef> & { readonly [id: string]: CharDef | undefined };

const BY_ID = {} as CharById;   // 下一行逐一填滿每一隻，所以這裡先轉型
LIST.forEach((c) => { (BY_ID as Record<string, CharDef>)[c.id] = c; });

export interface CharsData {
  list: CharDef[];
  byId: CharById;
  ids: CharacterId[];
  typeColors: Record<PokeType, string>;
  /** 屬性的顯示名稱（依頁面語言）。 */
  typeLabels: Record<PokeType, string>;
}

/** 舊版 window.PV_CHARS。 */
export const CHARS: CharsData = {
  list: LIST,
  byId: BY_ID,
  ids: LIST.map((c) => c.id),
  typeColors: TYPE_COLORS,
  typeLabels: TYPE_LABELS,
};

/** 角色資料是純資料，載入時沒有要做的事。 */
export function init(): void {
  /* 沒有要做的事 */
}
