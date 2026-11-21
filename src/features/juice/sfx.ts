// ============================================================
// 合成衝擊音（Web Audio）：疊在遊戲原本的音效上，補足低頻的「碰」
// ============================================================
import type { Controller, SoundChannel } from '../../core/types';
import { JUICE } from './config';
import { rand } from './util';

/** 一般播放用 AudioContext；離線算音時暫時換成 OfflineAudioContext（兩者都有 resume）。 */
export type AudioCtx = AudioContext | OfflineAudioContext;

/** 音效的可變狀態。離線算音（offline-audio.ts）會暫時換掉 ac／master／noiseBuf／pitchVar／tAt，算完再換回來。 */
export const A = {
  ac: null as AudioCtx | null,
  master: null as GainNode | null,
  noiseBuf: null as AudioBuffer | null,
  pitchVar: 1,
  // 離線算音（試玩台用）：tAt 不是 null 時，聲音排在指定時間，畫到離線的 AudioContext
  tAt: null as number | null,
};

/** @pixi/sound 的底層物件上有 volume（core 的 SoundChannel 型別只列了 speed）。 */
function centerVolume(s: SoundChannel): number { return (s.center as unknown as { volume: number }).volume; }

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

function audio(): AudioCtx | null {
  if (A.ac) return A.ac;
  const AC = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AC) return null;
  const ac = A.ac = new AC();
  const master = A.master = ac.createGain(); master.gain.value = 0.48;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 8;
  master.connect(comp); comp.connect(ac.destination);
  return ac;
}
/** 使用者第一次按鍵或觸控才建立／resume AudioContext（瀏覽器的自動播放限制）。 */
export function installAudioUnlock(): void {
  ['keydown', 'pointerdown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { const a = audio(); if (a && a.state === 'suspended') a.resume(); }, { passive: true, capture: true });
  });
}

// sfxOn() 成功之後、或離線算音時才會用到，這時 ac／master 一定有值
function ctx(): AudioCtx { return A.ac as AudioCtx; }
function T0(): number { return A.tAt != null ? A.tAt : ctx().currentTime + 0.005; }

export interface SfxLogEntry { t: number; name: string; args: unknown[]; pitch: number }
/** 合成音紀錄（舊版 window._pvSfxLog），試玩台用，最多 400 筆 */
export const sfxLog: SfxLogEntry[] = [];
function logSfx(name: string, args: unknown[]): void {
  if (A.tAt == null) { sfxLog.push({ t: performance.now(), name: name, args: args, pitch: A.pitchVar }); if (sfxLog.length > 400) sfxLog.shift(); }
}

function sfxOn(ctrl: Controller | null): boolean {
  if (A.tAt != null) return true;
  if (!JUICE.sound || document.hidden) return false;
  // 呼叫端已經擋掉 tAt == null 且 ctrl 是 null 的情況
  const s = ctrl && ctrl.audio && ctrl.audio.sounds && ctrl.audio.sounds.pika;
  if (s && s.volume === 0) return false;     // 選單裡關掉音效時不播
  const a = audio();
  return !!a && a.state === 'running';
}
function env(g: GainNode, t: number, a: number, peak: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest?: AudioNode): void {
  const ac = ctx();
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  f0 *= A.pitchVar; f1 *= A.pitchVar;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.004, peak, dur);
  o.connect(g); g.connect(dest || (A.master as GainNode));
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(t: number, dur: number, peak: number, filterType: BiquadFilterType, f0: number, f1: number, q?: number): void {
  const ac = ctx();
  if (!A.noiseBuf) {
    A.noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = A.noiseBuf;
  f.type = filterType; f.Q.value = q || 1;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  env(g, t, 0.003, peak, dur);
  s.connect(f); f.connect(g); g.connect(A.master as GainNode);
  s.start(t); s.stop(t + dur + 0.05);
}

export function sfxSpike(ctrl: Controller | null, type: string, big: boolean, level?: number): void {
  if (A.tAt == null && !ctrl) return;
  level = level || 0;
  if (A.tAt == null) A.pitchVar = rand(0.94, 1.06) * (1 - 0.08 * level);   // 每次音高隨機 ±6%；技能強化每級再低 8%
  logSfx('spike', [type, big, level]);   // 試玩台：瀏覽器還沒允許播音也照樣記錄
  if (!sfxOn(ctrl)) return;
  const t = T0(), v = JUICE.sound * (big ? 1 : 0.8) * Math.pow(10, 2 * level / 20);   // 每級 +2dB
  // 骨幹：中低頻的「砰」為主（手機喇叭也聽得到），高頻的嘶聲只當點綴
  osc('sine', 170, 42, t, 0.22, 0.9 * v);                  // 低頻（大喇叭、耳機）
  osc('triangle', 320, 110, t, 0.2, 1.3 * v);              // 主體：蓋過原版殺球音效的嘶聲
  osc('triangle', 640, 220, t, 0.08, 0.35 * v);            // 中頻的「啪」，手機喇叭聽得到
  noise(t, 0.002, 0.9 * v, 'highpass', 4000, 3000, 0.5);   // 2ms 的 click，打到的瞬間
  noise(t, 0.06, 0.25 * v, 'highpass', 2500, 1200, 0.7);
  // 依屬性的音色（比骨幹再大 6dB，才分得出來）
  const a = 2 * v;
  switch (type) {
    case '電': osc('square', 1400, 180, t, 0.12, 0.18 * a); osc('sawtooth', 2200, 400, t + 0.02, 0.08, 0.1 * a); break;
    case '水': noise(t, 0.22, 0.45 * a, 'bandpass', 1800, 400, 3); osc('sine', 900, 300, t + 0.03, 0.12, 0.15 * a); break;
    case '火': noise(t, 0.28, 0.5 * a, 'lowpass', 2500, 250, 0.8); break;
    case '鬼': osc('sine', 520, 140, t, 0.3, 0.25 * a); osc('sine', 530, 150, t, 0.3, 0.2 * a); break;
    case '超': osc('sine', 700, 1700, t, 0.22, 0.2 * a); osc('triangle', 1050, 2400, t + 0.03, 0.18, 0.12 * a); break;
    case '地': noise(t, 0.3, 0.55 * a, 'lowpass', 900, 120, 1); osc('triangle', 260, 90, t, 0.2, 0.2 * a); break;
    case '妖': osc('triangle', 1600, 1650, t, 0.18, 0.16 * a); osc('triangle', 2400, 2450, t + 0.04, 0.16, 0.12 * a); break;
    case '龍': osc('sawtooth', 240, 90, t, 0.26, 0.25 * a); osc('sawtooth', 120, 55, t, 0.24, 0.2 * a); break;
    case '惡': osc('sine', 330, 160, t, 0.26, 0.22 * a); osc('triangle', 990, 660, t + 0.05, 0.16, 0.1 * a); break;
    case '草': noise(t, 0.16, 0.4 * a, 'bandpass', 3200, 1400, 2); osc('triangle', 820, 520, t, 0.1, 0.12 * a); break;
    default: noise(t, 0.12, 0.35 * a, 'lowpass', 1800, 300, 0.8);
  }
}
// 技能級：在殺球聲之後再補一層低頻＋屬性音色
export function sfxSkill(ctrl: Controller | null, type: string, lvl: number): void {
  if (A.tAt == null && !ctrl) return;
  logSfx('skill', [type, lvl]);
  if (!sfxOn(ctrl)) return;
  const t = T0(), v = JUICE.sound * 0.9;
  osc('sine', 140, 45, t, 0.28, 0.9 * v);
  osc('triangle', 260, 90, t, 0.22, 0.6 * v);
  noise(t, 0.18, 0.3 * v, 'lowpass', 1600, 200, 0.8);
}
// 必殺：很低的轟聲＋往下掃的噪音＋高頻的裂響，跟一般殺球明顯不同
export function sfxUlt(ctrl: Controller | null, type: string): void {
  if (A.tAt == null && !ctrl) return;
  logSfx('ult', [type]);
  if (!sfxOn(ctrl)) return;
  const t = T0(), v = JUICE.sound;
  osc('sine', 95, 28, t, 0.6, 1.2 * v);
  osc('sawtooth', 180, 50, t, 0.45, 0.35 * v);
  osc('triangle', 520, 140, t + 0.01, 0.3, 0.5 * v);
  noise(t, 0.003, 1.0 * v, 'highpass', 5000, 3000, 0.5);
  noise(t, 0.55, 0.45 * v, 'lowpass', 3000, 120, 0.9);
  sfxSpike(ctrl, type, true, 3);
}
export function sfxBump(ctrl: Controller | null): void {
  if (A.tAt == null && !ctrl) return;
  logSfx('bump', []);   // 試玩台：瀏覽器還沒允許播音也照樣記錄
  if (!sfxOn(ctrl)) return;
  const t = T0();
  // 普通擊球：放在手機喇叭聽得到的頻段（之前 220→90Hz 的 sine 在手機上幾乎聽不到）
  osc('triangle', 520, 260, t, 0.08, 0.5 * JUICE.sound);
  noise(t, 0.002, 0.5 * JUICE.sound, 'highpass', 4000, 3000, 0.5);
}
export function sfxGround(ctrl: Controller | null): void {
  if (A.tAt == null && !ctrl) return;
  logSfx('ground', []);   // 試玩台：瀏覽器還沒允許播音也照樣記錄
  if (!sfxOn(ctrl)) return;
  const t = T0(), v = JUICE.sound;
  osc('sine', 120, 32, t, 0.4, 0.9 * v);
  osc('triangle', 260, 80, t, 0.18, 0.7 * v);
  osc('triangle', 400, 180, t, 0.15, 0.6 * v);             // 給手機喇叭的中頻層
  noise(t, 0.002, 0.8 * v, 'highpass', 3500, 2500, 0.5);
  noise(t, 0.35, 0.55 * v, 'lowpass', 900, 90, 0.8);
  noise(t, 0.05, 0.4 * v, 'highpass', 3000, 1500, 0.7);
}
export function sfxEvolve(ctrl: Controller | null, red: boolean): void {
  if (A.tAt == null && !ctrl) return;
  logSfx('evolve', [red]);
  if (!sfxOn(ctrl)) return;
  const t = T0(), v = JUICE.sound;
  osc('sawtooth', 110, 220, t, 0.35, 0.35 * v);          // 往上爬的吼聲
  osc('triangle', 330, 660, t, 0.3, 0.45 * v);
  noise(t, 0.3, 0.35 * v, 'lowpass', 600, 2400, 1);
  if (red) { osc('triangle', 990, 1480, t + 0.18, 0.25, 0.3 * v); osc('sine', 1320, 1980, t + 0.26, 0.25, 0.2 * v); }
}
export function sfxPsy(ctrl: Controller | null): void {
  if (A.tAt == null && !ctrl) return;
  logSfx('psy', []);
  if (!sfxOn(ctrl)) return;
  const t = T0(), v = JUICE.sound;
  osc('sine', 1200, 500, t, 0.18, 0.45 * v);
  osc('triangle', 600, 250, t, 0.2, 0.6 * v);
  osc('sine', 1800, 900, t + 0.03, 0.14, 0.2 * v);
}
export function sfxZip(ctrl: Controller | null): void {
  if (A.tAt == null && !ctrl) return;
  logSfx('zip', []);   // 試玩台：瀏覽器還沒允許播音也照樣記錄
  if (!sfxOn(ctrl)) return;
  const t = T0();
  noise(t, 0.12, 1.1 * JUICE.sound, 'bandpass', 1500, 6000, 2);   // 比之前大約 9dB
  osc('square', 600, 1800, t, 0.08, 0.34 * JUICE.sound);
}

// ============================================================
// 遊戲本體的音效調整
// ============================================================
// 原版殺球音效又長又嘶，會蓋過「砰」的低頻；播放前把它壓到一般音效的一半音量
let sampleDucked = false;
export function duckSample(ctrl: Controller): void {
  const snd = ctrl.audio && ctrl.audio.sounds, o = snd && snd.powerHit;
  if (!o || sampleDucked) return;
  sampleDucked = true;
  const play = o.play.bind(o);
  o.play = function (e?: number) { o.volume = centerVolume(snd.pika) * JUICE.powerHitSample; return play(e); };
}

// 必殺時背景音樂短暫壓低
let bgmDuckTimer = 0, bgmVol: number | null = null;
export function duckBgm(ctrl: Controller | null, ms: number): void {
  try {
    const b = ctrl && ctrl.audio && ctrl.audio.sounds.bgm;
    if (!b || !b.center) return;
    if (bgmVol === null) bgmVol = centerVolume(b);
    b.volume = bgmVol * 0.35;
    clearTimeout(bgmDuckTimer);
    bgmDuckTimer = window.setTimeout(function () { try { b.volume = bgmVol as number; } catch { /* 忽略 */ } bgmVol = null; }, ms);
  } catch { /* 忽略 */ }
}
