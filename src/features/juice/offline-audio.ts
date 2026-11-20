// 試玩台：把一段時間內的遊戲音效＋合成音，照實際時間點混成一個 WAV（base64）
// （舊版 window._pvRenderAudio；現在放在 debug.renderAudio）
import { A, sfxBump, sfxEvolve, sfxGround, sfxPsy, sfxSpike, sfxZip } from './sfx';
import { S } from './state';

/** 一段要錄的時間窗（t0：performance.now() 毫秒，ms：長度） */
export interface AudioWindow { t0: number; ms: number }
/** 遊戲本體的音效事件（k：音效名稱，pan：-1 左、0 中、1 右） */
export interface GameSoundEvent { t: number; k: string; vol: number; pan: number }
/** 合成音事件（就是 debug.sfxLog 的內容） */
export interface SynthEvent { t: number; name: string; args: unknown[]; pitch?: number }

export async function renderAudio(windows: AudioWindow[], gameEvents: GameSoundEvent[], synthEvents: SynthEvent[], which?: string): Promise<string> {
  const SR = 22050, GAP = 0.25;
  let total = 0;
  windows.forEach(function (w) { total += w.ms / 1000 + GAP; });
  const off = new OfflineAudioContext(2, Math.ceil(SR * (total + 1)), SR);
  const buffers: Record<string, AudioBuffer | null> = {};
  // 舊版直接用 ctrlRef.audio.sounds（遊戲還沒開始跑就呼叫會丟 TypeError，這裡一樣）
  const sounds = S.ctrlRef!.audio.sounds;
  async function buf(name: string): Promise<AudioBuffer | null> {
    if (buffers[name] !== undefined) return buffers[name];
    // @pixi/sound 的底層物件有 url（core 的 SoundChannel 型別沒列）
    const snd = sounds[name], url = snd && snd.center && (snd.center as unknown as { url?: string }).url;
    if (!url) return (buffers[name] = null);
    const ab = await (await fetch(url)).arrayBuffer();
    return (buffers[name] = await off.decodeAudioData(ab));
  }
  // 視窗時間 → 音檔時間
  function place(t: number): number | null {
    let acc = 0;
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (t >= w.t0 && t <= w.t0 + w.ms + 300) return acc + (t - w.t0) / 1000;
      acc += w.ms / 1000 + GAP;
    }
    return null;
  }
  if (which !== 'synth') {
    for (let i = 0; i < gameEvents.length; i++) {
      const e = gameEvents[i], at = place(e.t);
      if (at == null || e.k === 'bgm') continue;
      const b = await buf(e.k); if (!b) continue;
      const src = off.createBufferSource(), g = off.createGain(), pan = off.createStereoPanner();
      src.buffer = b; g.gain.value = e.vol; pan.pan.value = e.pan === -1 ? -0.75 : e.pan === 1 ? 0.75 : 0;
      src.connect(g); g.connect(pan); pan.connect(off.destination); src.start(at);
    }
  }
  if (which !== 'game') {
    const saved = { ac: A.ac, master: A.master, noiseBuf: A.noiseBuf, pitchVar: A.pitchVar };
    A.ac = off; A.noiseBuf = null;
    const master = A.master = off.createGain(); master.gain.value = 0.48;
    const comp = off.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 8;
    master.connect(comp); comp.connect(off.destination);
    synthEvents.forEach(function (ev) {
      const at = place(ev.t); if (at == null) return;
      A.tAt = at; A.pitchVar = ev.pitch || 1;
      // args 的內容就是當初 logSfx 記下的參數
      if (ev.name === 'spike') sfxSpike(null, ev.args[0] as string, ev.args[1] as boolean, ev.args[2] as number);
      else if (ev.name === 'psy') sfxPsy(null);
      else if (ev.name === 'evolve') sfxEvolve(null, ev.args[0] as boolean);
      else if (ev.name === 'bump') sfxBump(null);
      else if (ev.name === 'ground') sfxGround(null);
      else if (ev.name === 'zip') sfxZip(null);
    });
    A.tAt = null; A.ac = saved.ac; A.master = saved.master; A.noiseBuf = saved.noiseBuf; A.pitchVar = saved.pitchVar;
  }
  const out = await off.startRendering();
  const L = out.getChannelData(0), R = out.getChannelData(1), n = L.length;
  const wav = new DataView(new ArrayBuffer(44 + n * 4));
  function str(o: number, x: string): void { for (let i = 0; i < x.length; i++) wav.setUint8(o + i, x.charCodeAt(i)); }
  str(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
  wav.setUint32(24, SR, true); wav.setUint32(28, SR * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true);
  str(36, 'data'); wav.setUint32(40, n * 4, true);
  for (let k = 0; k < n; k++) {
    wav.setInt16(44 + k * 4, Math.max(-1, Math.min(1, L[k])) * 32767, true);
    wav.setInt16(46 + k * 4, Math.max(-1, Math.min(1, R[k])) * 32767, true);
  }
  const bytes = new Uint8Array(wav.buffer);
  let bin = '';
  // 舊版用 String.fromCharCode.apply(null, 片段)；展開寫法結果相同
  for (let q = 0; q < bytes.length; q += 0x8000) bin += String.fromCharCode(...bytes.subarray(q, q + 0x8000));
  return btoa(bin);
}
