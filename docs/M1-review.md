# M1 評審包｜遠征骨架、存檔、最小除錯

分支 `expedition-m1`，基準 `main @ 87d13b5`。開關預設關閉，網址加 `?exp=1` 才有「遠征 β」入口。

## 改了什麼

| 檔案 | 內容 |
|---|---|
| `src/features/expedition/types.ts` | 資料契約：`ProfileV1`、`ExpeditionRunV1`（SPEC §5）、`SettlementV1` |
| `src/features/expedition/content.ts` | 路線：M1 只有一個節點（鯉魚王、搶 5 分、無修飾） |
| `src/features/expedition/logic.ts` | 規則（純函式）：入場、結算、讀檔檢查 |
| `src/features/expedition/db.ts` | IndexedDB `pva-expedition`：每個變更一個 transaction、revision 檢查、結算去重、壞檔隔離、錯誤不吞 |
| `src/features/expedition/rng.ts` | 依 `seed + rngVersion + nodeId + purpose` 的亂數（cyrb128 + sfc32），不碰 `Math.random` |
| `src/features/expedition/env.ts` | 開關（`?exp=1`／`?exp=0`，存在 sessionStorage）、分頁寫入權（Web Locks） |
| `src/features/expedition/adapter.ts` | 接線：入場、偵測勝負（只交一次）、離場還原、切背景暫停並清空按鍵、失焦清空按鍵 |
| `src/features/expedition/ui.ts`、`texts.ts`、`index.ts` | 開發版面板（繁中／英文／韓文） |
| `src/features/expedition/expedition.test.ts` | 17 個自動測試 |
| `src/main.ts` | 多一行 `initExpedition()`（開關關閉時立刻 return） |
| `src/core/services.ts` | `svc.expedition?: { playing() }` |
| `src/features/campaign/state.ts` | `netBusy()` 也把「遠征比賽中」算進去（冠軍之路不能同時開打） |
| `package.json` | `npm test`（vitest 2.1.8）、devDependencies：vitest、fake-indexeddb 6.0.0 |

## 規則（SPEC §5.2、§5.3）

- 開打前先把 `matchId`（`節點#第幾次`）寫進存檔，phase → `active`。
- 重整、離開、被回收、玩家從選單按重來、連線開始：phase 還是 `active`，回來從這一場開頭重打，**不扣心、matchId 不變**。
- 分出勝負的那一幀就結算（不等動畫）；明確按「放棄本場」也結算（算輸）。輸了扣 1 心，心用完這輪結束。
- 同一個 matchId 只結算一次（settlement id = runId + matchId，存在同一個 transaction 裡）。
- 讀到壞檔：顯示、可匯出、不自動重設；玩家確認後原檔搬進 `quarantine` 才能開新的一輪。讀到較新版本：唯讀，原檔不動。
- 寫不進去（容量、權限、版本）：顯示錯誤和「再試一次」，不假裝已存。
- 切到背景：暫停、清空按鍵，回來要按「繼續」，不算輸。

## PLAN M1 通過條件與證據

| 條件 | 證據 | 結果 |
|---|---|---|
| refresh → refresh 不多扣心、不複製獎勵 | 單元測試 `refresh then refresh`；瀏覽器實測：開打後重整兩次，心 2 → 2、matchId `m1-warmup#2` 不變、revision 4 不變 | 通過 |
| 結算寫到一半中斷，重開只會是完整的前或後 | 單元測試 `a crash in the middle of settling`：run 寫入後模擬當機 → 重開與結算前完全相同、沒有結算紀錄；重試後正常結算一次 | 通過 |
| 容量／權限拒絕看得見 | 單元測試 `quota`：`QuotaExceededError` → `DbError('quota')`，存檔不變；畫面有對應訊息與「再試一次」 | 通過（只在 fake-indexeddb 模擬） |
| 雙分頁不能同時寫同一個 run | 單元測試 `second tab with an old revision`；瀏覽器實測：第二個分頁顯示唯讀、沒有開打按鈕；關掉第一個分頁、重整後才可寫 | 通過 |
| 關開關仍可進舊模式 | 逐幀比對 branch vs main（開關關閉）：一般對戰 3/3、冠軍之路 2/2（含超夢關）完全相同 | 通過 |
| 固定輸入下，無修飾遠征對戰與原引擎計分一致 | 同種子、同角色（皮卡丘不操作 vs 鯉魚王）：一般對戰與遠征對戰逐幀相同直到分出勝負，3 個種子都一致；遠征結算紀錄各一筆 `loss 0:5` | 通過 |
| 重複結算只算一次 | 單元測試 `settling the same match twice` | 通過 |
| 放棄本場扣 1 心、只記一次 | 瀏覽器實測：心 2 → 1、losses 1 → 2、結算紀錄 `#1 loss`、`#2 forfeit` | 通過 |

`npm test`：17/17 通過。`npx tsc --noEmit`：0 錯誤。

## 未驗證

- 手機實機（iPhone Safari、Android Chrome）：切 App、轉向、雙指按住時切出去。
- Safari 的 Web Locks（沒有的話退回只靠 revision 檢查）、Safari 私密瀏覽的 IndexedDB。
- 真實瀏覽器的容量不足（只用 fake-indexeddb 模擬）。
- 遠征裡的「贏」只有單元測試；瀏覽器自動測試的玩家不操作，所以都是輸。
- 切到背景暫停：程式有，但自動測試沒涵蓋（背景分頁沒辦法自動切換）。

## 已知限制（刻意不在 M1 做）

- 路線只有一個節點；沒有卡牌、羈絆、捕獲、首領（M2）。
- 遠征收服還不會解鎖角色（`expeditionUnlocked` 欄位已有，M2 接上全局鎖）。
- 開關是網址參數；正式版合併前要決定是否只在測試建置開放。
