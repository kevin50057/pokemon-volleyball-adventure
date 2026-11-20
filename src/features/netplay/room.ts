// ============================================================
// 連線層：自架層（點對點直連＋多個中繼伺服器備援）；本機測試時（網址帶 ?fakeroom）改用 BroadcastChannel 模擬
// ============================================================
// 舊版在 claude.ai 內嵌頁面裡會改用平台的 window.claude.use('room')；遠征版只在自己的網址上跑，那條路拿掉了。
import { assetUrl } from '../../core/config';
import { fakeRoom } from './fake-room';
import type { Lobby } from './room-types';
import { createSelfLobby } from './selfroom';

let roomP: Promise<Lobby | null> | null = null;
/** 拿不到房間的原因（顯示在錯誤訊息後面）。 */
export let roomWhy = '';
/** 用的是自架層（拿不到時顯示「連線元件載入失敗」而不是平台的權限訊息）。 */
export let selfMode = false;

export function getRoom(): Promise<Lobby | null> {
  if (roomP) return roomP;
  let p: Promise<Lobby | null>;
  if (/[?&]fakeroom/.test(location.search)) p = Promise.resolve(fakeRoom());
  else {
    // 自架版：用自己的連線層（點對點直連＋多個中繼伺服器備援）
    selfMode = true;
    p = loadScript(assetUrl('vendor/mqtt.min.js'))
      .then(() => { const l = createSelfLobby(); if (!l) roomWhy = 'self-load'; return l; })
      .catch(() => { roomWhy = 'self-load'; return null; });
  }
  roomP = p;
  // 拿不到就不要記住失敗結果：下次按按鈕再試一次（可能只是網路還沒好）
  void p.then((r) => { if (!r) { if (!roomWhy) roomWhy = 'use-null'; if (roomP === p) roomP = null; } else roomWhy = ''; });
  return p;
}

function loadScript(src: string): Promise<Event> {
  return new Promise((res, rej) => {
    const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = rej; document.head.appendChild(el);
  });
}
