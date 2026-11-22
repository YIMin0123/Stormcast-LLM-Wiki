# LLM Wiki：多個 AI 協作開發一款遊戲（Stormcast 案例）

生成式 AI 第十週作業：用 LLM Wiki 做一份教學 HTML 簡報。朝陽科大 資通系 吳翊銘（11430624）

- **教學簡報**：https://yimin0123.github.io/Stormcast-LLM-Wiki/slides/ （←→ 鍵或點右下角翻頁，手機可左右滑）
- **Wiki 入口**：[wiki/index.md](wiki/index.md)

## 主題

Stormcast 是一款瀏覽器 3D 線上多人釣魚遊戲，由 Claude、Codex、Gemini、Antigravity 等好幾個 AI 輪流開發（12 天、819 次提交、247 篇交接日誌）。AI 之間看不到彼此的對話，靠什麼交接？怎麼互相檢查？出過什麼錯？這份 Wiki 從專案裡 12 份真實資料整理出答案，再用 Wiki 做成一份給沒寫過程式的人看的教學簡報。

## 資料夾

```
raw/        12 份原始資料（從 Stormcast 專案原樣複製，唯讀）
wiki/       AI 整理的 Wiki：13 頁內容＋index、log、SCHEMA（規則）
slides/     教學 HTML 簡報（18 張，單一檔案）
tools/      三支檢查程式＋共用術語清單
紀錄/       討論紀錄、兩版大綱、每次檢查的完整輸出、18 張截圖
流程設計.md  loop / graph 設計
反思.md     哪個節點最常出錯、檢查往前移到哪裡
```

## 流程

```
討論 → Ingest → [wiki_lint] → Query（大綱）→ [outline_check] → 生成簡報 → [slide_check] → [人工看截圖] → 發佈
```

詳見 [流程設計.md](流程設計.md)，實際執行的紀錄在 [紀錄/](紀錄/)，反思在 [反思.md](反思.md)。

## 自己跑檢查

需要 Node.js 18 以上；slide_check 會用到 Windows 上的 Microsoft Edge。

```bash
node tools/wiki_lint.mjs
node tools/outline_check.mjs 紀錄/08-簡報大綱-v2.md
node tools/slide_check.mjs --outline 紀錄/08-簡報大綱-v2.md --shots
```

## 原始資料出處

`raw/` 的檔案都來自 Stormcast 專案（https://github.com/YIMin0123/Stormcast-GenAI-Final ），對應路徑：

| raw | 專案裡的位置 |
|---|---|
| 01-CLAUDE.md | `CLAUDE.md` |
| 02-工程架構手冊.md | `docs/工程架構手冊.md` |
| 03-日誌說明與範本.md | `docs/日誌/0000-說明與範本.md` |
| 04-審查流程.md | `docs/審查流程.md` |
| 05-上線流程.md | `docs/上線流程.md` |
| 06-日誌-修正進遊戲白畫面.md | `docs/日誌/2026-11-16-修正進遊戲白畫面.md` |
| 07-日誌-正式機人物變白.md | `docs/日誌/2026-11-17-正式機人物變白修正.md` |
| 08-日誌-手冊檢查工具.md | `docs/日誌/2026-11-23-手冊檢查工具.md` |
| 09-審查報告-風景升級.md | `docs/審查/2026-11-21-風景升級.md` |
| 10-提交紀錄-暴風雨畫面變深藍.txt | `git show 432fe16 9804271 5b8aaca` |
| 11-docLint.mjs | `tools/docLint.mjs` |
| 12-日誌作者與提交統計.md | 用 `grep`、`git rev-list` 等指令產生（指令寫在檔案裡） |
