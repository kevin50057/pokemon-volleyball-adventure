// characters — 角色資料（唯一來源）
// 技能系統與選角面板都從這裡讀，新增或修改角色只要改這一份。
// （舊版 characters.js → window.PV_CHARS）
import type { CharacterId } from '../../core/types';

/** 屬性（中文單字，跟舊版一樣直接當鍵用）。 */
export type PokeType = '電' | '水' | '火' | '鬼' | '普' | '超' | '地' | '妖' | '龍';

/** 技能名稱（技能系統用來查表）。 */
export type AbilityName =
  | 'static' | 'flying' | 'acidArmor' | 'fireSmash' | 'emWave' | 'ghostPhase' | 'payday'
  | 'bellyBounce' | 'psychic' | 'fakeBall' | 'counter' | 'transform' | 'barrier' | 'dig'
  | 'leekBoomerang' | 'headache' | 'splash' | 'sing' | 'outrage' | 'psychicShield';

export interface CharDef {
  id: CharacterId;
  name: string;
  type: PokeType;
  ability: AbilityName;
  skill: string;
  desc: string;
  /** 屬性色（由 type 查 TYPE_COLORS 得來） */
  color: string;
}

type CharSource = Omit<CharDef, 'color'>;

// id 必須和遊戲本體內的角色 id、圖檔名稱一致
const SOURCE: CharSource[] = [
  { id: 'pikachu',    name: '皮卡丘',   type: '電', ability: 'static',
    skill: '靜電', desc: '殺出去的球帶電，對手接到時有 55% 機率被麻痺 0.8 秒。' },
  { id: 'bird',       name: '閃電鳥',     type: '電', ability: 'flying',
    skill: '飛行＋雷擊俯衝', desc: '在空中再按「上」拍翅，最多 6 次。同一次跳躍拍翅 3 次以上後殺球，會變成雷擊俯衝：又快又準，而且球帶電，對手接到有機率麻痺。' },
  { id: 'vaporeon',   name: '水伊布',   type: '水', ability: 'acidArmor',
    skill: '溶化滑行', desc: '可衝刺。撲救時留下水窪，球落在水窪上會自動彈起。' },
  { id: 'flareon',    name: '火伊布',   type: '火', ability: 'fireSmash',
    skill: '烈焰重擊＋引火', desc: '殺球是火球：對手用身體接到會灼傷 2 秒，這段時間內的下一次殺球會變弱（直接把火球殺回來就不會灼傷）。自己用身體接起對手的殺球會「引火」3 秒，這時殺球變成大字爆：又快又準、一定落在對面，灼傷也更久。' },
  { id: 'jolteon',    name: '雷伊布',   type: '電', ability: 'emWave',
    skill: '電光一閃', desc: '連按兩下左或右，瞬間閃過去一大段（地上、空中都可以，冷卻 2.4 秒）。閃完 0.4 秒內殺球，會變成又快又準的電光殺球。' },
  { id: 'gengar',     name: '耿鬼',     type: '鬼', ability: 'ghostPhase',
    skill: '空間偷渡＋暗影球', desc: '殺球後可穿網移動約 1.5 秒並推開對手，暗影球往下砸。' },
  { id: 'meowth',     name: '喵喵',     type: '普', ability: 'payday',
    skill: '聚寶功', desc: '得分有 15% 機率算 2 分；殺球在對面撒金幣（場上最多 2 枚），踩到會滑一跤、移動變慢 1 秒。' },
  { id: 'snorlax',    name: '卡比獸',   type: '普', ability: 'bellyBounce',
    skill: '肚皮彈簧床', desc: '慢、跳不高，但身體碰球會大力彈起；落地震飛地面上的對手。' },
  { id: 'mewtwo',     name: '超夢',     type: '超', ability: 'psychic',
    skill: '念力導向', desc: 'Boss。移動快，殺球後球會急墜。念力冷卻好時（身邊有紫色光環，每 6 秒一次），球一過網就被轉往離對手最遠的那一邊。' },
  { id: 'electrode',  name: '頑皮雷彈', type: '電', ability: 'fakeBall',
    skill: '大爆炸', desc: '殺球後球路突變，接著在球附近爆炸，炸開並定身對手。' },
  { id: 'wobbuffet',  name: '果然翁',   type: '超', ability: 'counter',
    skill: '雙倍奉還', desc: '用身體接到對手的殺球時，先把球高高彈起，到最高點自動朝對面猛砸回去。' },
  { id: 'ditto',      name: '百變怪',   type: '普', ability: 'transform',
    skill: '變身', desc: '每次有人得分，就隨機變成另一隻角色。' },
  { id: 'mrmime',     name: '魔牆人偶', type: '超', ability: 'barrier',
    skill: '屏障', desc: '殺球後網子上方出現約 1.5 秒的隱形牆，擋下一球就碎：一般球會軟軟彈回對面，對手的殺球會打穿但變慢。之後冷卻 4 秒。' },
  { id: 'dugtrio',    name: '三地鼠',   type: '地', ability: 'dig',
    skill: '沙丘陷阱', desc: '移動快。起跳時留下沙丘，球落在沙丘上會亂彈不算分。' },
  { id: 'farfetchd',  name: '大蔥鴨',   type: '普', ability: 'leekBoomerang',
    skill: '大蔥揮擊＋居合斬', desc: '拿著大蔥，殺球打得到比別人遠的球，不用貼到身上。直接把對手的殺球殺回去就是居合斬：又快又準，一定落在對面。一般殺球又平又快，過網後還會往回飄。' },
  { id: 'psyduck',    name: '可達鴨',   type: '水', ability: 'headache',
    skill: '頭痛爆發', desc: '走路偶爾跌倒。被得分、或接起對手的殺球都會累積頭痛，滿 3 層後下一次殺球是頭痛大爆發：必定打進對面，還讓對手頭暈一下。' },
  { id: 'magikarp',   name: '鯉魚王',   type: '水', ability: 'splash',
    skill: '躍起', desc: '又慢又弱，但每次跳有 7% 機率進化成暴鯉龍 4 秒，每一擊都是保證打進對面的重擊；接起對手殺球時有 15% 機率直接進化。進化時有一成機率變成紅色暴鯉龍：撐 6 秒、球更快，還會威嚇讓對手定身一下。' },
  { id: 'jigglypuff', name: '胖丁',     type: '妖', ability: 'sing',
    skill: '唱歌', desc: '落得很慢，像飄著一樣；在空中按「下」可以取消漂浮、快速落地。殺球讓對手左右顛倒 4 秒。' },
  { id: 'dragonite',  name: '快龍',     type: '龍', ability: 'outrage',
    skill: '逆鱗', desc: '殺球就暴走 3 秒、移動變快，這一球算第一層；暴走中每次殺球再疊一層，最多 3 層（連殺 3 球就滿），一層比一層砸得重。暴走結束會混亂 1 秒（左右顛倒）。' },
  { id: 'mew',        name: '夢幻',     type: '超', ability: 'psychicShield',
    skill: '瞬間移動＋念力護盾', desc: '神獸。連按兩下方向鍵瞬間移動：球會落在自己場上就往落點瞬移（有距離上限，每 6 秒一次）。身邊有粉紅光環時，快落地的球一定會被念力托起（每 20 秒一次）；趁球還帶著光環殺球就是念力彈，又快又準。' },
];

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
};

const LIST: CharDef[] = SOURCE.map((c) => ({ ...c, color: TYPE_COLORS[c.type] || '#FFFFFF' }));

/** 用 CharacterId 查一定有；用任意字串查（例如連線收到的、存檔讀出來的）可能是 undefined。 */
export type CharById = Record<CharacterId, CharDef> & { readonly [id: string]: CharDef | undefined };

const BY_ID = {} as CharById;   // 下一行逐一填滿 20 隻，所以這裡先轉型
LIST.forEach((c) => { (BY_ID as Record<string, CharDef>)[c.id] = c; });

export interface CharsData {
  list: CharDef[];
  byId: CharById;
  ids: CharacterId[];
  typeColors: Record<PokeType, string>;
}

/** 舊版 window.PV_CHARS。 */
export const CHARS: CharsData = {
  list: LIST,
  byId: BY_ID,
  ids: LIST.map((c) => c.id),
  typeColors: TYPE_COLORS,
};

/** 角色資料是純資料，載入時沒有要做的事。 */
export function init(): void {
  /* 沒有要做的事 */
}
