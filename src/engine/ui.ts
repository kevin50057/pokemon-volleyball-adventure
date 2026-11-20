/**
 * 網頁介面（選單列、按鈕等）的事件（原作 ui.js）。
 *
 * 這個專案加的：「選項 → 角色選擇」的 1P／2P 角色按鈕（`p1-<角色>-btn`、`p2-<角色>-btn`），
 * 選擇記在 `pv-offline-p1char`／`pv-offline-p2char`（預設 1P 閃電鳥、2P 皮卡丘）。
 *
 * 存檔改用 core/storage.ts 的 store（鍵名照舊）。
 */
import type { Ticker } from '@pixi/ticker';
import { store } from '../core/storage';
import { CHARACTER_IDS } from '../core/types';
import type { CharacterId, Controller } from '../core/types';

/** 選項（從存檔讀出來的值可能是 null） */
interface Options {
  graphic?: string | null;
  bgm?: string | null;
  sfx?: string | null;
  speed?: string | null;
  winningScore?: string | null;
}

/**
 * 依 id 取得頁面元素。
 * 原作假設這些元素一定存在（不存在就在使用時丟例外），這裡維持同樣的假設，只做型別轉換。
 */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/**
 * 「遊戲被什麼暫停」的優先順序，數字越大優先權越高。
 */
const PauseResumePrecedence = {
  pauseBtn: 3,
  messageBox: 2,
  dropdown: 1,
  notPaused: 0,
} as const;

/**
 * 管理遊戲的暫停與繼續
 */
const pauseResumeManager = {
  /** PauseResumePrecedence 的值 */
  _precedence: PauseResumePrecedence.notPaused as number,
  /** 暫停 */
  pause(pikaVolley: Controller, precedence: number): void {
    if (precedence > this._precedence) {
      pikaVolley.paused = true;
      this._precedence = precedence;
    }
  },
  /** 繼續 */
  resume(pikaVolley: Controller, precedence: number): void {
    if (precedence === this._precedence) {
      pikaVolley.paused = false;
      this._precedence = PauseResumePrecedence.notPaused;
    }
  },
};

/** 是不是角色 id */
function isCharacterId(v: string | null): v is CharacterId {
  return (CHARACTER_IDS as readonly (string | null)[]).includes(v);
}

/**
 * 設定使用者介面：選單列、按鈕、下拉選單、子選單等
 */
export function setUpUI(pikaVolley: Controller, ticker: Ticker): void {
  /** 套用選項 */
  const applyOptions = (options: Options): void => {
    setSelectedOptionsBtn(options);
    switch (options.graphic) {
      case 'sharp':
        byId('game-canvas').classList.remove('graphic-soft');
        break;
      case 'soft':
        byId('game-canvas').classList.add('graphic-soft');
        break;
    }
    switch (options.bgm) {
      case 'on':
        pikaVolley.audio.turnBGMVolume(true);
        break;
      case 'off':
        pikaVolley.audio.turnBGMVolume(false);
        break;
    }
    switch (options.sfx) {
      case 'stereo':
        pikaVolley.audio.turnSFXVolume(true);
        pikaVolley.isStereoSound = true;
        break;
      case 'mono':
        pikaVolley.audio.turnSFXVolume(true);
        pikaVolley.isStereoSound = false;
        break;
      case 'off':
        pikaVolley.audio.turnSFXVolume(false);
        break;
    }
    switch (options.speed) {
      case 'slow':
        pikaVolley.normalFPS = 20;
        ticker.maxFPS = pikaVolley.normalFPS;
        break;
      case 'medium':
        pikaVolley.normalFPS = 25;
        ticker.maxFPS = pikaVolley.normalFPS;
        break;
      case 'fast':
        pikaVolley.normalFPS = 30;
        ticker.maxFPS = pikaVolley.normalFPS;
        break;
    }
    switch (options.winningScore) {
      case '5':
        pikaVolley.winningScore = 5;
        break;
      case '10':
        pikaVolley.winningScore = 10;
        break;
      case '15':
        pikaVolley.winningScore = 15;
        break;
    }
  };

  /** 儲存選項 */
  const saveOptions = (options: Options): void => {
    setSelectedOptionsBtn(options);
    if (options.graphic) {
      store.set('pv-offline-graphic', options.graphic);
    }
    if (options.bgm) {
      store.set('pv-offline-bgm', options.bgm);
    }
    if (options.sfx) {
      store.set('pv-offline-sfx', options.sfx);
    }
    if (options.speed) {
      store.set('pv-offline-speed', options.speed);
    }
    if (options.winningScore) {
      store.set('pv-offline-winningScore', options.winningScore);
    }
  };

  /** 讀取選項 */
  const loadOptions = (): Options => ({
    graphic: store.get('pv-offline-graphic'),
    bgm: store.get('pv-offline-bgm'),
    sfx: store.get('pv-offline-sfx'),
    speed: store.get('pv-offline-speed'),
    winningScore: store.get('pv-offline-winningScore'),
  });

  /** 套用並儲存選項 */
  const applyAndSaveOptions = (options: Options): void => {
    applyOptions(options);
    saveOptions(options);
  };

  // 讀取並套用存下來的選項
  applyOptions(loadOptions());

  setUpBtns(pikaVolley, applyAndSaveOptions);
  setUpToShowDropdownsAndSubmenus(pikaVolley);
  setUpCharacterBtns(pikaVolley);

  // 按 Esc 隱藏／顯示選單列
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      const menuBar = byId('menu-bar');
      if (menuBar.classList.contains('hidden')) {
        menuBar.classList.remove('hidden');
      } else {
        menuBar.classList.add('hidden');
      }
      event.preventDefault();
    } else if (event.code === 'Space') {
      const aboutBox = byId('about-box');
      if (aboutBox.classList.contains('hidden')) {
        event.preventDefault();
      }
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      pikaVolley.audio.unmuteAll();
    } else {
      pikaVolley.audio.muteAll();
    }
  });
}

/**
 * 為按鈕掛上事件
 */
function setUpBtns(pikaVolley: Controller, applyAndSaveOptions: (options: Options) => void): void {
  const gameDropdownBtn = byId<HTMLButtonElement>('game-dropdown-btn');
  const optionsDropdownBtn = byId<HTMLButtonElement>('options-dropdown-btn');
  const aboutBtn = byId<HTMLButtonElement>('about-btn');
  gameDropdownBtn.disabled = false;
  optionsDropdownBtn.disabled = false;
  aboutBtn.disabled = false;

  const pauseBtn = byId('pause-btn');
  pauseBtn.addEventListener('click', () => {
    if (pauseBtn.classList.contains('selected')) {
      pauseBtn.classList.remove('selected');
      pauseResumeManager.resume(pikaVolley, PauseResumePrecedence.pauseBtn);
    } else {
      pauseBtn.classList.add('selected');
      pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.pauseBtn);
    }
  });

  const restartBtn = byId('restart-btn');
  restartBtn.addEventListener('click', () => {
    if (pauseBtn.classList.contains('selected')) {
      pauseBtn.classList.remove('selected');
      pauseResumeManager.resume(pikaVolley, PauseResumePrecedence.pauseBtn);
    }
    pikaVolley.restart();
  });

  const graphicSharpBtn = byId('graphic-sharp-btn');
  const graphicSoftBtn = byId('graphic-soft-btn');
  graphicSharpBtn.addEventListener('click', () => {
    applyAndSaveOptions({ graphic: 'sharp' });
  });
  graphicSoftBtn.addEventListener('click', () => {
    applyAndSaveOptions({ graphic: 'soft' });
  });

  const bgmOnBtn = byId('bgm-on-btn');
  const bgmOffBtn = byId('bgm-off-btn');
  bgmOnBtn.addEventListener('click', () => {
    applyAndSaveOptions({ bgm: 'on' });
  });
  bgmOffBtn.addEventListener('click', () => {
    applyAndSaveOptions({ bgm: 'off' });
  });

  const stereoBtn = byId('stereo-btn');
  const monoBtn = byId('mono-btn');
  const sfxOffBtn = byId('sfx-off-btn');
  stereoBtn.addEventListener('click', () => {
    applyAndSaveOptions({ sfx: 'stereo' });
  });
  monoBtn.addEventListener('click', () => {
    applyAndSaveOptions({ sfx: 'mono' });
  });
  sfxOffBtn.addEventListener('click', () => {
    applyAndSaveOptions({ sfx: 'off' });
  });

  // 遊戲速度：
  //   慢速：每 50ms 一幀 = 20 FPS
  //   普通：每 40ms 一幀 = 25 FPS
  //   快速：每 33ms 一幀 = 30.303030... FPS
  const slowSpeedBtn = byId('slow-speed-btn');
  const mediumSpeedBtn = byId('medium-speed-btn');
  const fastSpeedBtn = byId('fast-speed-btn');
  slowSpeedBtn.addEventListener('click', () => {
    applyAndSaveOptions({ speed: 'slow' });
  });
  mediumSpeedBtn.addEventListener('click', () => {
    applyAndSaveOptions({ speed: 'medium' });
  });
  fastSpeedBtn.addEventListener('click', () => {
    applyAndSaveOptions({ speed: 'fast' });
  });

  const winningScore5Btn = byId('winning-score-5-btn');
  const winningScore10Btn = byId('winning-score-10-btn');
  const winningScore15Btn = byId('winning-score-15-btn');
  const noticeBox1 = byId('notice-box-1');
  const noticeOKBtn1 = byId('notice-ok-btn-1');
  const winningScoreInNoticeBox1 = byId('winning-score-in-notice-box-1');
  function isWinningScoreAlreadyReached(winningScore: number): boolean {
    const isGamePlaying =
      pikaVolley.state === pikaVolley.round ||
      pikaVolley.state === pikaVolley.afterEndOfRound ||
      pikaVolley.state === pikaVolley.beforeStartOfNextRound;
    if (
      isGamePlaying &&
      (pikaVolley.scores[0] >= winningScore ||
        pikaVolley.scores[1] >= winningScore)
    ) {
      return true;
    }
    return false;
  }
  const noticeBox2 = byId('notice-box-2');
  const noticeOKBtn2 = byId('notice-ok-btn-2');
  winningScore5Btn.addEventListener('click', () => {
    if (winningScore5Btn.classList.contains('selected')) {
      return;
    }
    if (pikaVolley.isPracticeMode === true) {
      noticeBox2.classList.remove('hidden');
      gameDropdownBtn.disabled = true;
      optionsDropdownBtn.disabled = true;
      aboutBtn.disabled = true;
      pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.messageBox);
      return;
    }
    if (isWinningScoreAlreadyReached(5)) {
      winningScoreInNoticeBox1.textContent = '5';
      noticeBox1.classList.remove('hidden');
      gameDropdownBtn.disabled = true;
      optionsDropdownBtn.disabled = true;
      aboutBtn.disabled = true;
      pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.messageBox);
      return;
    }
    applyAndSaveOptions({ winningScore: '5' });
  });
  winningScore10Btn.addEventListener('click', () => {
    if (winningScore10Btn.classList.contains('selected')) {
      return;
    }
    if (pikaVolley.isPracticeMode === true) {
      noticeBox2.classList.remove('hidden');
      gameDropdownBtn.disabled = true;
      optionsDropdownBtn.disabled = true;
      aboutBtn.disabled = true;
      pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.messageBox);
      return;
    }
    if (isWinningScoreAlreadyReached(10)) {
      winningScoreInNoticeBox1.textContent = '10';
      noticeBox1.classList.remove('hidden');
      gameDropdownBtn.disabled = true;
      optionsDropdownBtn.disabled = true;
      aboutBtn.disabled = true;
      pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.messageBox);
      return;
    }
    applyAndSaveOptions({ winningScore: '10' });
  });
  winningScore15Btn.addEventListener('click', () => {
    if (winningScore15Btn.classList.contains('selected')) {
      return;
    }
    if (pikaVolley.isPracticeMode === true) {
      noticeBox2.classList.remove('hidden');
      gameDropdownBtn.disabled = true;
      optionsDropdownBtn.disabled = true;
      aboutBtn.disabled = true;
      pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.messageBox);
      return;
    }
    if (isWinningScoreAlreadyReached(15)) {
      winningScoreInNoticeBox1.textContent = '15';
      noticeBox1.classList.remove('hidden');
      gameDropdownBtn.disabled = true;
      optionsDropdownBtn.disabled = true;
      aboutBtn.disabled = true;
      pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.messageBox);
      return;
    }
    applyAndSaveOptions({ winningScore: '15' });
  });
  noticeOKBtn1.addEventListener('click', () => {
    if (!noticeBox1.classList.contains('hidden')) {
      noticeBox1.classList.add('hidden');
      gameDropdownBtn.disabled = false;
      optionsDropdownBtn.disabled = false;
      aboutBtn.disabled = false;
      pauseResumeManager.resume(pikaVolley, PauseResumePrecedence.messageBox);
    }
  });
  noticeOKBtn2.addEventListener('click', () => {
    if (!noticeBox2.classList.contains('hidden')) {
      noticeBox2.classList.add('hidden');
      gameDropdownBtn.disabled = false;
      optionsDropdownBtn.disabled = false;
      aboutBtn.disabled = false;
      pauseResumeManager.resume(pikaVolley, PauseResumePrecedence.messageBox);
    }
  });

  const practiceModeOnBtn = byId('practice-mode-on-btn');
  const practiceModeOffBtn = byId('practice-mode-off-btn');
  practiceModeOnBtn.addEventListener('click', () => {
    practiceModeOffBtn.classList.remove('selected');
    practiceModeOnBtn.classList.add('selected');
    pikaVolley.isPracticeMode = true;
  });
  practiceModeOffBtn.addEventListener('click', () => {
    practiceModeOnBtn.classList.remove('selected');
    practiceModeOffBtn.classList.add('selected');
    pikaVolley.isPracticeMode = false;
  });

  const aboutBox = byId('about-box');
  const closeAboutBtn = byId('close-about-btn');
  aboutBtn.addEventListener('click', () => {
    if (aboutBox.classList.contains('hidden')) {
      aboutBox.classList.remove('hidden');
      gameDropdownBtn.disabled = true;
      optionsDropdownBtn.disabled = true;
      pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.messageBox);
    } else {
      aboutBox.classList.add('hidden');
      gameDropdownBtn.disabled = false;
      optionsDropdownBtn.disabled = false;
      pauseResumeManager.resume(pikaVolley, PauseResumePrecedence.messageBox);
    }
  });
  closeAboutBtn.addEventListener('click', () => {
    if (!aboutBox.classList.contains('hidden')) {
      aboutBox.classList.add('hidden');
      gameDropdownBtn.disabled = false;
      optionsDropdownBtn.disabled = false;
      pauseResumeManager.resume(pikaVolley, PauseResumePrecedence.messageBox);
    }
  });

  const resetToDefaultBtn = byId('reset-to-default-btn');
  resetToDefaultBtn.addEventListener('click', () => {
    // 關掉練習模式
    practiceModeOffBtn.click();

    // 其他選項恢復預設值
    const defaultOptions: Options = {
      graphic: 'sharp',
      bgm: 'on',
      sfx: 'stereo',
      speed: 'medium',
      winningScore: '15',
    };
    applyAndSaveOptions(defaultOptions);
  });
}

/**
 * 讓選項按鈕的「已選」狀態符合選項
 */
function setSelectedOptionsBtn(options: Options): void {
  if (options.graphic) {
    const graphicSharpBtn = byId('graphic-sharp-btn');
    const graphicSoftBtn = byId('graphic-soft-btn');
    switch (options.graphic) {
      case 'sharp':
        graphicSoftBtn.classList.remove('selected');
        graphicSharpBtn.classList.add('selected');
        break;
      case 'soft':
        graphicSharpBtn.classList.remove('selected');
        graphicSoftBtn.classList.add('selected');
        break;
    }
  }
  if (options.bgm) {
    const bgmOnBtn = byId('bgm-on-btn');
    const bgmOffBtn = byId('bgm-off-btn');
    switch (options.bgm) {
      case 'on':
        bgmOffBtn.classList.remove('selected');
        bgmOnBtn.classList.add('selected');
        break;
      case 'off':
        bgmOnBtn.classList.remove('selected');
        bgmOffBtn.classList.add('selected');
        break;
    }
  }
  if (options.sfx) {
    const stereoBtn = byId('stereo-btn');
    const monoBtn = byId('mono-btn');
    const sfxOffBtn = byId('sfx-off-btn');
    switch (options.sfx) {
      case 'stereo':
        monoBtn.classList.remove('selected');
        sfxOffBtn.classList.remove('selected');
        stereoBtn.classList.add('selected');
        break;
      case 'mono':
        sfxOffBtn.classList.remove('selected');
        stereoBtn.classList.remove('selected');
        monoBtn.classList.add('selected');
        break;
      case 'off':
        stereoBtn.classList.remove('selected');
        monoBtn.classList.remove('selected');
        sfxOffBtn.classList.add('selected');
        break;
    }
  }
  if (options.speed) {
    const slowSpeedBtn = byId('slow-speed-btn');
    const mediumSpeedBtn = byId('medium-speed-btn');
    const fastSpeedBtn = byId('fast-speed-btn');
    switch (options.speed) {
      case 'slow':
        mediumSpeedBtn.classList.remove('selected');
        fastSpeedBtn.classList.remove('selected');
        slowSpeedBtn.classList.add('selected');
        break;
      case 'medium':
        fastSpeedBtn.classList.remove('selected');
        slowSpeedBtn.classList.remove('selected');
        mediumSpeedBtn.classList.add('selected');
        break;
      case 'fast':
        slowSpeedBtn.classList.remove('selected');
        mediumSpeedBtn.classList.remove('selected');
        fastSpeedBtn.classList.add('selected');
        break;
    }
  }
  if (options.winningScore) {
    const winningScore5Btn = byId('winning-score-5-btn');
    const winningScore10Btn = byId('winning-score-10-btn');
    const winningScore15Btn = byId('winning-score-15-btn');
    switch (options.winningScore) {
      case '5':
        winningScore10Btn.classList.remove('selected');
        winningScore15Btn.classList.remove('selected');
        winningScore5Btn.classList.add('selected');
        break;
      case '10':
        winningScore15Btn.classList.remove('selected');
        winningScore5Btn.classList.remove('selected');
        winningScore10Btn.classList.add('selected');
        break;
      case '15':
        winningScore5Btn.classList.remove('selected');
        winningScore10Btn.classList.remove('selected');
        winningScore15Btn.classList.add('selected');
        break;
    }
  }
}

/**
 * 掛上顯示下拉選單、子選單的事件
 */
function setUpToShowDropdownsAndSubmenus(pikaVolley: Controller): void {
  // 點在下拉選單、子選單以外的地方就收起來
  window.addEventListener('click', (event) => {
    // 跟原作一樣假設 target 是元素
    if (!(event.target as Element).matches('.dropdown-btn, .submenu-btn')) {
      hideSubmenus();
      hideDropdownsExcept('');
      pauseResumeManager.resume(pikaVolley, PauseResumePrecedence.dropdown);
    }
  });

  // 顯示下拉選單
  byId('game-dropdown-btn').addEventListener('click', () => {
    toggleDropdown('game-dropdown', pikaVolley);
  });
  byId('options-dropdown-btn').addEventListener('click', () => {
    toggleDropdown('options-dropdown', pikaVolley);
  });

  // 滑鼠移過去時顯示子選單
  byId('graphic-submenu-btn').addEventListener('mouseover', () => {
    showSubmenu('graphic-submenu-btn', 'graphic-submenu');
  });
  byId('bgm-submenu-btn').addEventListener('mouseover', () => {
    showSubmenu('bgm-submenu-btn', 'bgm-submenu');
  });
  byId('sfx-submenu-btn').addEventListener('mouseover', () => {
    showSubmenu('sfx-submenu-btn', 'sfx-submenu');
  });
  byId('speed-submenu-btn').addEventListener('mouseover', () => {
    showSubmenu('speed-submenu-btn', 'speed-submenu');
  });
  byId('winning-score-submenu-btn').addEventListener('mouseover', () => {
    showSubmenu('winning-score-submenu-btn', 'winning-score-submenu');
  });
  byId('practice-mode-submenu-btn').addEventListener('mouseover', () => {
    showSubmenu('practice-mode-submenu-btn', 'practice-mode-submenu');
  });
  byId('reset-to-default-btn').addEventListener('mouseover', () => {
    hideSubmenus();
  });

  // 點擊時顯示子選單（給接了實體鍵盤的觸控裝置）
  byId('bgm-submenu-btn').addEventListener('click', () => {
    showSubmenu('bgm-submenu-btn', 'bgm-submenu');
  });
  byId('sfx-submenu-btn').addEventListener('click', () => {
    showSubmenu('sfx-submenu-btn', 'sfx-submenu');
  });
  byId('speed-submenu-btn').addEventListener('click', () => {
    showSubmenu('speed-submenu-btn', 'speed-submenu');
  });
  byId('winning-score-submenu-btn').addEventListener('click', () => {
    showSubmenu('winning-score-submenu-btn', 'winning-score-submenu');
  });
  byId('practice-mode-submenu-btn').addEventListener('click', () => {
    showSubmenu('practice-mode-submenu-btn', 'practice-mode-submenu');
  });
  byId('reset-to-default-btn').addEventListener('click', () => {
    hideSubmenus();
  });
}

/**
 * 角色選擇按鈕（這個專案加的）
 * 頁面上沒有的按鈕就跳過（跟線上版一樣用 `if (btn)` 判斷）。
 */
function setUpCharacterBtns(pikaVolley: Controller): void {
  const storageKeys = { 1: 'pv-offline-p1char', 2: 'pv-offline-p2char' } as const;
  const defaults = { 1: 'bird', 2: 'pikachu' } as const;
  const select = (n: 1 | 2, id: CharacterId, save: boolean): void => {
    (n === 1 ? pikaVolley.physics.player1 : pikaVolley.physics.player2).character = id;
    for (const c of CHARACTER_IDS) {
      const btn = document.getElementById(`p${n}-${c}-btn`);
      if (btn) btn.classList.toggle('selected', c === id);
    }
    if (save) store.set(storageKeys[n], id);
  };
  for (const n of [1, 2] as const) {
    const saved = store.get(storageKeys[n]);
    select(n, isCharacterId(saved) ? saved : defaults[n], false);
    for (const c of CHARACTER_IDS) {
      const btn = document.getElementById(`p${n}-${c}-btn`);
      if (btn) btn.addEventListener('click', () => select(n, c, true));
    }
  }
  const submenuBtn = document.getElementById('character-submenu-btn');
  if (submenuBtn) {
    const show = (): void => showSubmenu('character-submenu-btn', 'character-submenu');
    submenuBtn.addEventListener('mouseover', show);
    submenuBtn.addEventListener('click', show);
  }
}

/**
 * 切換（顯示或隱藏）下拉選單
 * @param dropdownID 要切換的下拉選單的元素 id
 */
function toggleDropdown(dropdownID: string, pikaVolley: Controller): void {
  hideSubmenus();
  hideDropdownsExcept(dropdownID);
  const willShow = byId(dropdownID).classList.toggle('show');
  if (willShow) {
    pauseResumeManager.pause(pikaVolley, PauseResumePrecedence.dropdown);
  } else {
    pauseResumeManager.resume(pikaVolley, PauseResumePrecedence.dropdown);
  }
}

/**
 * 顯示子選單
 * @param submenuBtnID 子選單按鈕的元素 id
 * @param subMenuID 要顯示的子選單的元素 id
 */
function showSubmenu(submenuBtnID: string, subMenuID: string): void {
  hideSubmenus();
  byId(submenuBtnID).classList.add('open');
  byId(subMenuID).classList.add('show');
}

/**
 * 隱藏指定以外的所有下拉選單
 */
function hideDropdownsExcept(dropdownID: string): void {
  const dropdowns = document.getElementsByClassName('dropdown');
  for (let i = 0; i < dropdowns.length; i++) {
    if (dropdowns[i].id !== dropdownID) {
      dropdowns[i].classList.remove('show');
    }
  }
}

/**
 * 隱藏所有子選單
 */
function hideSubmenus(): void {
  const submenus = document.getElementsByClassName('submenu');
  for (let i = 0; i < submenus.length; i++) {
    submenus[i].classList.remove('show');
  }
  const submenuBtns = document.getElementsByClassName('submenu-btn');
  for (let i = 0; i < submenuBtns.length; i++) {
    submenuBtns[i].classList.remove('open');
  }
}
