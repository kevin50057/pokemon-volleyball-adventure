// ============================================================
// 合成音效（Web Audio）：只用在闖關的演出，跟著選單的音效開關
// ============================================================
import { flags } from '../../core/services';
import type { Controller } from '../../core/types';
import { ctrlOf } from './state';

let ac: AudioContext | null = null, master: GainNode | null = null;
function audio(): AudioContext | null {
  if (ac) return ac;
  // 舊 Safari 只有 webkitAudioContext
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AC = window.AudioContext || w.webkitAudioContext;
  if (!AC) return null;
  try { ac = new AC(); master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination); } catch (e) { ac = null; }
  return ac;
}
function sfxOn(): boolean {
  if (flags.sim || document.hidden) return false;
  const c = ctrlOf(), s = c && c.audio && c.audio.sounds && c.audio.sounds.pika;
  if (s && s.volume === 0) return false;
  const a = audio();
  if (a && a.state === 'suspended') { try { a.resume(); } catch (e) { /* 沒關係 */ } }
  return !!a && a.state === 'running';
}
// sfxOn() 為 true 才會呼叫到這裡，此時 ac、master 一定已經建好
function tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, vol: number): void {
  const A = ac as AudioContext;
  const o = A.createOscillator(), g = A.createGain(), t = A.currentTime + 0.01 + at;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master as GainNode); o.start(t); o.stop(t + dur + 0.05);
}
function notes(type: OscillatorType, list: number[], step: number, dur: number, vol: number, at?: number): void { list.forEach(function (f, i) { tone(type, f, f, (at || 0) + i * step, dur, vol); }); }
export function sfx(name: string): void {
  if (!sfxOn()) return;
  try {
    if (name === 'ko') { tone('sine', 150, 40, 0, 0.35, 1); tone('square', 880, 220, 0, 0.12, 0.25); notes('square', [523, 659, 784, 1047], 0.07, 0.14, 0.3, 0.32); }
    else if (name === 'lose') notes('triangle', [392, 330, 262, 196], 0.14, 0.26, 0.5);
    else if (name === 'vs') { tone('sine', 110, 45, 0, 0.3, 1); tone('sawtooth', 300, 80, 0, 0.14, 0.25); }
    else if (name === 'step') notes('square', [660, 880], 0.07, 0.07, 0.2);
    else if (name === 'tick') tone('square', 990, 990, 0, 0.04, 0.15);
    else if (name === 'get') { notes('square', [659, 784, 988, 1319], 0.08, 0.16, 0.3); notes('triangle', [1319, 1568, 2093], 0.06, 0.2, 0.25, 0.36); }
    else if (name === 'stamp') { tone('sine', 180, 50, 0, 0.3, 1); tone('square', 1200, 300, 0, 0.08, 0.3); }
    else if (name === 'fanfare') { notes('square', [523, 523, 523, 659, 784, 659, 784, 1047], 0.13, 0.2, 0.3); notes('triangle', [262, 262, 330, 392, 523], 0.26, 0.4, 0.4); }
    else if (name === 'hit') { tone('square', 260, 90, 0, 0.14, 0.35); tone('sine', 120, 50, 0, 0.18, 0.8); }
    else if (name === 'hurt') tone('sawtooth', 180, 60, 0, 0.22, 0.4);
    else if (name === 'splash') { tone('sine', 900, 300, 0, 0.12, 0.3); tone('triangle', 500, 1200, 0.03, 0.1, 0.2); }
    else if (name === 'wind') { tone('sawtooth', 120, 260, 0, 0.5, 0.12); tone('sine', 300, 600, 0.1, 0.4, 0.15); }
    else if (name === 'coin') notes('square', [988, 1319], 0.06, 0.12, 0.3);
    else if (name === 'phase') { tone('sawtooth', 80, 320, 0, 0.6, 0.4); tone('sine', 60, 30, 0.55, 0.5, 1); }
  } catch (e) { /* 音效失敗不影響遊戲 */ }
}
export function cry(id: string): void {
  if (!sfxOn()) return;
  try {
    // 遊戲本體還沒載好時這裡會丟例外，跟舊版一樣被 catch 吃掉
    const s = (ctrlOf() as Controller).audio.sounds, snd = s['CHAR_' + id + '_call'] || (id === 'bird' ? s.birdShout : s.pipikachu);
    if (snd) snd.play(0);
  } catch (e) { /* 同上 */ }
}
