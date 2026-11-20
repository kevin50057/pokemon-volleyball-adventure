# 寶可夢排球 Ultimate 遠征版

網址：https://kevin50057.github.io/pokemon-volleyball-adventure/

經典版（20 隻角色全開、沒有闖關）在另一個 repo：https://github.com/kevin50057/pokemon-volleyball

## 開發

```bash
npm install
npm run dev        # http://localhost:8766/pokemon-volleyball-adventure/
npm run build      # 型別檢查 + 建置到 dist/
```

推到 `main` 會自動建置並部署到 GitHub Pages（`.github/workflows/deploy.yml`）。

## 程式結構

```
src/
  main.ts             進入點：照順序初始化各功能，最後啟動遊戲本體
  core/               各功能之間的共用介面
    types.ts            遊戲本體（控制器、物理、角色、球、畫面）的形狀
    hooks.ts            遊戲本體留給功能的掛勾鏈（每幀、得分、電腦 AI、畫球、gameLoop…）
    services.ts         功能之間互相呼叫的入口與共用旗標
    storage.ts          存檔（加 pva: 前綴，第一次會匯入經典版的進度）
    config.ts           網址、資源路徑、連線伺服器
  engine/             遊戲本體：原作（gorisanson/pikachu-volleyball）的引擎，加上 20 隻角色
  features/
    characters/         角色資料、殺球特效形狀
    abilities/          技能、電腦 AI 修正、技能特效
    juice/              打擊感（停格、震動、音效）
    netplay/            連線對戰（WebRTC 直連＋MQTT 中繼）
    campaign/           闖關模式「冠軍之路」
    ui/                 選角、觸控、自訂按鍵、版本入口
public/               圖檔、音效、樣式（原樣複製到網站）
```

掛勾鏈的內外層由 `main.ts` 的初始化順序決定：後初始化的包在外層。

## 致謝與授權

- 原作《對戰ぴかちゅ～ ビーチバレー編》：1997 (C) SACHI SOFT / SAWAYAKAN Programmers、Satoshi Takenouchi。
- 網頁版引擎：Kyutae Lee（[gorisanson/pikachu-volleyball](https://github.com/gorisanson/pikachu-volleyball)）。原作者的 repo 標示為 UNLICENSED，這是同人改作，非商業用途。
- 寶可夢相關名稱與角色屬於其權利人。
