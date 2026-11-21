# TASKS.md｜關都遠征工單

規則見 PLAN.md「協調者、子代理與 TASKS.md 的分界」。每張工單只有一個負責人；同時寫程式的工單不能改到同一個檔案。

| ID | 里程碑 | 狀態 | 負責 | 依賴 |
|---|---|---|---|---|
| M0-1 | M0 | 完成 | 主會話 | — |
| M1-1 | M1 | 完成，待正式評審 | 主會話（Builder） | M0-1 |
| M1-R | M1 | 待開 | Fable 5.2（獨立工作階段） | M1-1 |
| M2-1 | M2 | 未開始 | — | M1-R 通過 |

---

## M0-1 盤點
- 交付：`docs/M0.md`（檔案位置、測試現況、三個接線點、不可改清單、規格差異、M1 方案、B0 接口）。
- 狀態：完成；維護者已就 A／B／C 三項差異做出決定（見 M0.md）。

## M1-1 遠征骨架、存檔、最小除錯
- 分支：`expedition-m1`（不合併、不部署）。
- 可以改：`src/features/expedition/**`（新增）、`src/main.ts`（一行 init）、`src/core/services.ts`（`svc.expedition` 型別）、`src/features/campaign/state.ts`（`netBusy()` 多判斷遠征進行中）、`package.json`（`test` 指令與 devDependencies）。
- 不得改：引擎物理與計分、連線協定、既有 localStorage 鍵與格式、冠軍之路規則。
- 完成條件（PLAN M1）與證據：見 `docs/M1-review.md`。
- 未驗：手機實機（切 App、轉向、雙指）；Safari 的 Web Locks／IndexedDB；容量被拒在真實瀏覽器的表現（只在 fake-indexeddb 模擬）。

## M1-R 正式評審（待開）
- 評審者：Fable 5.2，獨立工作階段，不沿用 Builder 的對話。
- 交給評審：SPEC.md、PLAN.md、`git diff main...expedition-m1`、`docs/M1-review.md`、`npm test` 輸出。
- 回報欄位：決策／嚴重度／檔名與行號／重現與預期實際／證據／最小修正／缺的測試。

## M2-1（未開始）
- SPEC §2 五節點短切片、6 張 TM、2 條羈絆、快龍首領 V0、手機暫停規則實機驗證。M1-R 通過後再拆細。
