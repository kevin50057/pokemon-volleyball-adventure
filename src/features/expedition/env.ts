/**
 * 遠征的開關與分頁寫入權。
 *
 * 開關（SPEC §5.5）：預設關閉。網址加 `?exp=1` 打開（記在這個分頁的 sessionStorage），`?exp=0` 關掉。
 * 關閉時遠征的程式什麼都不做：不註冊掛勾、不開 IndexedDB、不加按鈕。
 *
 * 寫入權（SPEC §5.3）：同一個瀏覽器只有一個分頁能寫遠征存檔，用 Web Locks 拿一把一直不放的鎖。
 * 拿不到的分頁只能看。沒有 Web Locks 的瀏覽器照樣可以玩：存檔每次寫入都會檢查 revision，舊分頁寫不進去。
 */
import { store } from '../../core/storage';

const FLAG = 'exp-dev';

export function expeditionEnabled(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('exp');
    if (q === '1') store.set(FLAG, '1', true);
    else if (q === '0') store.remove(FLAG, true);
  } catch { /* 沒有 location（測試環境） */ }
  return store.get(FLAG, true) === '1';
}

interface LockManagerLike {
  request(name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void): Promise<unknown>;
}

let writer: Promise<boolean> | null = null;

/**
 * 另一個分頁關掉、把寫入權讓出來的時候通知（排隊等鎖，拿到就一直持有）。
 * 拿到之前不會呼叫；沒有 Web Locks 的瀏覽器一開始就能寫，不會呼叫。
 */
export function waitForWriter(onGranted: () => void): void {
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  if (!locks) return;
  void locks.request('pva-expedition-writer', { ifAvailable: false }, () => {
    writer = Promise.resolve(true);
    onGranted();
    return new Promise<void>(() => { /* 一直持有 */ });
  }).catch(() => { /* 拿不到就維持唯讀 */ });
}

/** 拿這個分頁的寫入權（只拿一次，拿到就一直保留到關頁）。 */
export function acquireWriter(): Promise<boolean> {
  if (writer) return writer;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  if (!locks) { writer = Promise.resolve(true); return writer; }
  writer = new Promise<boolean>((resolve) => {
    locks.request('pva-expedition-writer', { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(false); return; }
      resolve(true);
      return new Promise<void>(() => { /* 一直持有 */ });
    }).catch(() => resolve(false));
  });
  // 沒拿到的話，下次再試（例如另一個分頁關掉了）
  void writer.then((ok) => { if (!ok) writer = null; });
  return writer;
}
