/**
 * 存檔。
 *
 * 經典版（另一個 repo）也在 kevin50057.github.io 底下，瀏覽器存檔是共用的。
 * 為了不互相蓋掉，這裡所有鍵名都加上 `pva:` 前綴；呼叫端照舊用原本的名字（例如 `pv-campaign-v1`）。
 * 第一次打開遠征版時，把經典版留下的存檔（包含舊版遠征版的闖關進度）複製一份過來。
 */
const PREFIX = 'pva:';
const MIGRATED = PREFIX + 'migrated-from-classic';

function area(session: boolean): Storage | null {
  try { return session ? window.sessionStorage : window.localStorage; } catch { return null; }
}

export const store = {
  get(name: string, session = false): string | null {
    try { return area(session)?.getItem(PREFIX + name) ?? null; } catch { return null; }
  },
  set(name: string, value: string, session = false): void {
    try { area(session)?.setItem(PREFIX + name, value); } catch { /* 私密模式或空間滿了：不存 */ }
  },
  remove(name: string, session = false): void {
    try { area(session)?.removeItem(PREFIX + name); } catch { /* 同上 */ }
  },
  getJSON<T>(name: string, session = false): T | null {
    const raw = store.get(name, session);
    if (raw == null) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  setJSON(name: string, value: unknown, session = false): void {
    store.set(name, JSON.stringify(value), session);
  },
};

/** 只複製一次；之後兩版各存各的。 */
export function migrateFromClassic(): void {
  const ls = area(false);
  if (!ls) return;
  try {
    if (ls.getItem(MIGRATED)) return;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith('pv-') && k !== 'pv-ed-notice-1') keys.push(k);
    }
    for (const k of keys) {
      if (ls.getItem(PREFIX + k) == null) {
        const v = ls.getItem(k);
        if (v != null) ls.setItem(PREFIX + k, v);
      }
    }
    ls.setItem(MIGRATED, String(Date.now()));
  } catch { /* 存不了就算了 */ }
}
