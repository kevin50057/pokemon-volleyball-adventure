# TASKS.md｜關都遠征工單

規則見 PLAN.md「協調者、子代理與 TASKS.md 的分界」。每張工單只有一個負責人；同時寫程式的工單不能改到同一個檔案。

| ID | 里程碑 | 狀態 | 負責 | 依賴 |
|---|---|---|---|---|
| M0-1 | M0 | 完成 | 主會話 | — |
| M1-1 | M1 | 完成，待正式評審 | 主會話（Builder） | M0-1 |
| M1-R | M1 | 待開 | Fable 5.2（獨立工作階段） | M1-1 |
| M2-1 | M2 | 內容完成，待正式評審與真人試玩 | 主會話（Builder） | 維護者要求先做（M1-R 還沒開） |
| M2-R | M2 | 待開 | Fable 5.2（獨立工作階段） | M2-1 |
| M2-P | M2 | 待開 | 維護者＋4～6 位玩家 | M2-R |

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

## M2-1 五站短切片
- 分支：`expedition-m2`（疊在 `expedition-m1` 上；不合併、不部署）。
- 可以改：`src/features/expedition/**`、`src/features/abilities/starters.ts`（只把五個既有函式加上 `export`，行為不變）。
- 不得改：引擎物理與計分、連線協定、既有 localStorage 鍵與格式、冠軍之路規則。
- 交付、跟 SPEC 的差異、驗證證據、未驗項目：見 `docs/M2-review.md`。

## M2-R 正式評審（待開）
- 交給評審：SPEC.md、PLAN.md、`git diff main...expedition-m2`、`docs/M1-review.md`、`docs/M2-review.md`、`npm test` 輸出。M1 和 M2 一起審。

## M2-P 真人試玩（待開）
- PLAN M2 的通過條件：至少 4 位完成首輪、完成時間中位數 15～30 分鐘、至少 3 位能說出並展示對策、至少半數願意再開一輪、每條岔路都有人打過、零阻塞。
