# 📌 待更新到 GitHub 的記錄

> 本次新增了幾個功能，整理成這份清單。回家後照著做即可。
> repo：`Starellyn/tripsbook`　·　網址：`https://starellyn.github.io/tripsbook/`

---

## 一、這次新增 / 改動了什麼

| # | 功能 | 狀態 |
|---|---|---|
| 1 | **書架首頁**（所有旅遊書總目錄） | 已做好，待上傳 |
| 2 | **共用資源頁**（我的地圖、App、行李清單、緊急聯絡） | 已做好，待上傳 |
| 3 | **簡易記帳頁**（單人記出入、分類、結餘、匯出） | 已做好，待上傳 |
| 4 | **多人分帳頁**（一人記帳、自動算誰補誰） | 已做好，待上傳 |
| 5 | **記帳同步 Google 試算表** | 程式已改好，**需另做設定**（見下方四） |
| 6 | **家人意見回饋按鈕**（連 Google 表單） | 按鈕已加，**需自己建表單填網址** |
| 7 | **東京行程書**：資料夾改名、加記帳/分帳/日記/意見按鈕 | 部分要操作（見下方二） |
| 8 | **旅途日記頁**（記實際去哪、計劃 vs 實際） | 已做好，待上傳 |
| 9 | **規格書**更新到第二十一章 | 已做好，待上傳 |

---

## 二、檔案要放的位置（目標結構）

```
tripsbook/
├── index.html                      ← #1 書架（放根目錄，覆蓋舊的）
├── 旅遊行程書_規格書.md             ← #8 規格書（根目錄）
├── 旅遊行程書_模版.html             ← 模版（根目錄）
├── _shared/
│   └── index.html                  ← #2 共用資源（由 _shared_共用資源.html 改名）
├── _kakeibo/
│   └── index.html                  ← #3 簡易記帳（由 _kakeibo_記帳.html 改名）
├── _warikan/
│   └── index.html                  ← #4 多人分帳（由 _warikan_分帳.html 改名）
├── _nikki/
│   └── index.html                  ← #8 旅途日記（由 _nikki_旅途日記.html 改名）
└── tokyo-202610/                   ← #7 注意：資料夾要從 tokyo-2026 改成 tokyo-202610
    └── index.html                  ← 東京行程書（已加好工具按鈕）
```

### 各檔案對應（我給的檔名 → 放上去的位置）

| 我給的檔名 | 放到 GitHub 的位置 |
|---|---|
| `index.html`（書架） | `tripsbook/index.html` |
| `_shared_共用資源.html` | `tripsbook/_shared/index.html`（改名 index.html） |
| `_kakeibo_記帳.html` | `tripsbook/_kakeibo/index.html`（改名 index.html） |
| `_warikan_分帳.html` | `tripsbook/_warikan/index.html`（改名 index.html） |
| `_nikki_旅途日記.html` | `tripsbook/_nikki/index.html`（改名 index.html） |
| `東京輕井澤草津行程書.html` | `tripsbook/tokyo-202610/index.html`（覆蓋舊的） |
| `旅遊行程書_規格書.md` | `tripsbook/旅遊行程書_規格書.md` |
| `旅遊行程書_模版.html` | `tripsbook/旅遊行程書_模版.html` |
| `Google同步_AppsScript程式碼.gs` | 不放 repo，貼進 Google Apps Script（見四） |
| `Google同步_設定說明.md` | 可放 repo 留存，或自己留著參考 |

---

## 三、操作步驟（VS Code）

1. **改資料夾名**：`tokyo-2026` → `tokyo-202610`（左側右鍵 Rename）。
   - 書架 `index.html` 裡東京的 `url` 已經是 `tokyo-202610/`，對得上，不用再改。
2. **建四個新資料夾**：`_shared`、`_kakeibo`、`_warikan`、`_nikki`，各放一個改名成 `index.html` 的檔。
3. **覆蓋 / 新增**其餘檔案到對應位置。
4. **Source Control** → 寫 commit 訊息（例：「加入書架、共用資源、記帳/分帳、東京改名」）→ ✓ → Sync/Push。
5. 等 1–2 分鐘，測這些網址：
   - `…/tripsbook/` → 書架
   - `…/tripsbook/tokyo-202610/` → 東京行程書
   - `…/tripsbook/_shared/`、`…/_kakeibo/`、`…/_warikan/` → 三個工具頁

---

## 四、需要「另外設定」的兩件事

### A. 記帳同步 Google 試算表（選做，想要雲端備份才設）

詳見 `Google同步_設定說明.md`，簡述：

1. 開一份 Google 試算表。
2. 擴充功能 → Apps Script，貼上 `Google同步_AppsScript程式碼.gs`，存檔。
3. 部署 → 新增部署 → 網頁應用程式（執行身分：我自己；存取：所有人）→ 複製網址。
4. 把 `_kakeibo/index.html` 和 `_warikan/index.html` 最上面的 `const SHEET_API=""` 填入那個網址。
5. push。記一筆看到「已同步 ✓」就成功。

> 沒設也沒關係：留空 `""` 時記帳照常運作，只是僅存本機。

### B. 家人意見 Google 表單（選做）

1. 到 forms.google.com 建表單（欄位：哪一天/項目、想怎麼改、其他）。
2. 取連結。
3. 把 `tokyo-202610/index.html` 裡 `feedback-btn` 的 `href="https://forms.gle/你的表單網址"` 換成你的連結。
4. push。

---

## 五、各功能的入口（上線後從哪點到）

- **書架** = 總入口 `…/tripsbook/`，列出所有旅遊書。
- **東京行程書**內：
  - 預算頁工具盒 → 🗺️ 我的地圖、🧾 旅遊記帳、👥 多人分帳、📔 旅途日記
  - 總覽頁底部 → 💬 家人意見（連表單）
- **共用資源** `…/_shared/`：每趟通用的地圖、App、行李清單、緊急聯絡。

---

## 六、小提醒（避免踩雷）

- 每本行程書、每個工具頁的檔名都用 `index.html`，網址才乾淨。
- 網址一定要帶資料夾名，`…/tripsbook/` 是書架、各頁在子資料夾。
- 記帳頁換新旅程時要改 `KEY` 和 `TRIP_NAME`（帳本才分開）。
- 改了 Apps Script 程式要「重新部署」才生效。
- push 後若沒更新，是瀏覽器快取 → 重新整理或用無痕視窗。

---

*記錄建立於規劃階段，回家後照「三、操作步驟」走，選做項見「四」。*
