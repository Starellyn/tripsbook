# 日本旅遊收據記帳系統 — Claude Code 開發規格書 v3

> 使用方式：把本文件存為 `receipt-tracker/SPEC.md`，在 Claude Code session 說：
> 「請閱讀 SPEC.md，依照 Phase 順序開發，每完成一個 Phase 停下來等我驗收。」
>
> 本版（v3）為定稿版，所有資料模型與技術決策已敲定，可直接開發。

---

## 0. 工作守則（最優先，全程遵守）

- 只實作本規格明確列出的功能，**禁止**自行新增功能、套件或檔案。
- 依 Phase 順序開發，**每個 Phase 完成後停止**，輸出「✅ 已完成項目清單 + 如何驗證」，等待確認後才能進入下一個 Phase。
- 以下動作**必須先詢問**才能執行：刪除任何檔案、新增 SPEC 未列出的相依套件、修改 Notion 資料庫結構、執行 `npm update` 或升級任何套件、執行任何 `git push`。
- 所有金鑰只能放在 `.env.local`（並寫入 `.gitignore`），**絕不**出現在前端程式碼、commit 或文件範例中。
- 介面文字一律使用**繁體中文**。
- 不確定的需求先問，不要猜。

---

## 1. 專案總覽

**起始狀態**：`receipt-tracker/` 資料夾（已有 `package.json`、`.env`、`node_modules`，已安裝 `@notionhq/client@5.22.0` 與 `dotenv`，Notion 連線已用 `test-notion.mjs` 驗證通過）。

**目標狀態**：可部署到 Vercel 的 Next.js PWA 記帳網站——拍攝日文收據 → AI 辨識（店名、品項、金額、稅制，翻譯繁中）→ 確認後寫入 Notion 資料庫；提供 Dashboard（含公費池）、歷史記錄、統計分析、結算、設定頁。

**使用情境**：4 人（Mom、大姊、二姊、Ellyn）秋季日本旅行（東京 → 草津 → 輕井澤），由 Ellyn 一人負責掃描記帳，主要在手機瀏覽器使用。每年 2–3 次旅行，所有旅程記錄在同一個 Notion 資料庫，以「旅程」欄位區分。

**後續規劃**：記帳 App 獨立完成後，再併入既有旅遊書（Starellyn/tripsbook），整合成單一 Next.js 網站。本規格不含旅遊書整合，Phase 0 留空供後續使用。

---

## 2. 技術棧（鎖定，不得替換或升級）

| 層 | 技術 |
|---|---|
| 框架 | Next.js 15（App Router）+ TypeScript strict mode |
| 樣式 | Tailwind CSS，手機優先（max-width 560px 置中） |
| AI 辨識 | Provider 抽象介面，內建 `gemini`（預設）與 `claude` 兩實作，以環境變數 `AI_PROVIDER` 切換 |
| 資料庫 | Notion API，`@notionhq/client@5.22.0`（**鎖定此版本，禁止升級**） |
| 部署 | GitHub + Vercel 免費方案 |

允許的相依套件：`@notionhq/client`（已裝，鎖 5.22.0）、`@google/generative-ai`、`@anthropic-ai/sdk`、`recharts`。其他一律先問。

---

## 3. 環境變數

`.env.local`（本機）與 Vercel 環境變數需同步設定：

```
AI_PROVIDER=gemini
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
NOTION_TOKEN=
NOTION_DATABASE_ID=388918c6627b80da914dcf010e504116
APP_PASSWORD=
```

同時產生 `.env.example`（不含實值，可 commit）。

---

## 4. Notion 串接（重要：API 版本策略）

### 4.1 Client 設定（單一共用實例）

專案已安裝 `@notionhq/client@5.22.0`。此版本**預設走 Notion API 2025-09-03（data source 模型）**，但本專案的資料庫是單一 data source，刻意沿用舊版語意以維持簡單。

- 在 `lib/notion.ts` 建立**單一共用 client**，全專案 import 它，不得在各處各自 new：
```ts
import { Client } from "@notionhq/client";
export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: "2022-06-28",   // 刻意鎖舊版，全專案統一
});
export const DATABASE_ID = process.env.NOTION_DATABASE_ID!;
```
- **所有** API 呼叫一律使用 `database_id`，走舊版語意：
  - 查詢列表用 `notion.databases.query({ database_id })`
  - 取 schema 用 `notion.databases.retrieve({ database_id })`
  - 新增用 `notion.pages.create({ parent: { database_id } })`
- **不**使用 data source 端點、**不**走 2025-09-03 的 `dataSources.*`。本決策已驗證可行（`databases.retrieve` 在此設定下正常回傳 `db.properties`）。

### 4.2 實作注意事項

- Notion 查詢每次最多 100 筆，必須以 `start_cursor` 迴圈取完全部資料
- 欄位名稱逐字照抄第 5 節對照表（注意半形括號與前置空格，如 `金額 (JPY)`）；萬一寫入回報 `property not found`，重跑一次 `databases.retrieve` 比對實際欄位名再修正
- Formula 欄位（`金額 (TWD)`）程式只讀不寫
- `收據照片`（files）程式不處理，跳過此欄
- Select / Multi-select 寫入不存在的選項時 Notion 會自動建立，無需預先建好

---

## 5. Notion 資料庫 Schema 與三層欄位對照表

資料庫名稱：**日本旅遊記帳總表**（21 欄）
Database ID：`388918c6627b80da914dcf010e504116`

### 5.1 三層對照表（App 內部型別 ↔ Notion 欄位 ↔ AI JSON key）

| App 欄位 | Notion 欄位名（逐字） | Notion 型別 | AI JSON key | 寫入組裝方式 |
|---|---|---|---|---|
| title | `商品名稱` | title | （由 items 組） | items[].name 以「、」串接 |
| storeName | `商店名稱` | rich_text | storeName | 直接寫入 |
| storeNameJa | `商店日文` | rich_text | storeNameJa | 直接寫入 |
| itemsJa | `商品日文` | rich_text | （由 items 組） | items[].nameJa 以「、」串接 |
| note | `備註` | rich_text | note | 稅制/折扣摘要 + 各品項稅率摘要 |
| splitTargets | `分攤對象` | multi_select | （UI 選） | 旅伴名陣列，見 5.3 |
| date | `日期` | date | date | YYYY-MM-DD（JST） |
| amountJPY | `金額 (JPY)` | number | totalJPY | 數字 |
| amountTWD | `金額 (TWD)` | formula | — | **唯讀**，Notion 自動算 |
| day | `旅行天數 Day` | number | — | App 依出發日(JST)算 |
| taxRefund | `退稅` | checkbox | — | UI 勾選，預設 false |
| taxRefundJPY | `退稅金額 (JPY)` | number | — | 選填 |
| category | `類別` | select | category | 七類擇一 |
| payer | `付款人` | select | — | 旅伴名，見 5.3 |
| region | `地區` | select | — | App 依日期自動判定，可改 |
| payment | `支付方式` | select | paymentMethod | 五種擇一 |
| source | `支出來源` | select | — | 三種擇一，見 5.4 |
| reimbursed | `公費補還` | checkbox | — | UI 勾選，預設 false |
| settled | `已結算` | checkbox | — | UI 勾選，預設 false |
| trip | `旅程` | select | — | 帶入設定的目前旅程 |
| （不處理） | `收據照片` | files | — | 程式跳過 |

### 5.2 共用 TypeScript 型別（三層中介）

```ts
export interface ExpenseItem {
  name: string;      // 繁中品名
  nameJa: string;    // 日文品名
  price: number;
  taxRate: string;   // "8%" | "10%" | "免税"
}

export interface Expense {
  id?: string;             // Notion page id（新增前無）
  title: string;           // 商品名稱（items.name 串接）
  storeName: string;
  storeNameJa: string;
  itemsJa: string;         // items.nameJa 串接
  items: ExpenseItem[];    // 編輯用，不直接存 Notion
  note: string;
  date: string;            // YYYY-MM-DD
  amountJPY: number;
  day: number | null;
  category: string;
  payment: string;
  source: "公費現付" | "公費待補還" | "個人自付";
  payer: string;           // Mom | 大姊 | 二姊 | Ellyn
  splitTargets: string[];  // 分攤對象，個人自付才有意義
  region: string;
  trip: string;
  reimbursed: boolean;     // 公費補還
  settled: boolean;        // 已結算
  taxRefund: boolean;
  taxRefundJPY: number | null;
}
```

GET 時把 Notion page 反向解析回此型別（formula 欄 `金額 (TWD)` 不需回讀，前端用匯率自行換算）。

### 5.3 成員（固定四位，名稱逐字一致）

`付款人` 與 `分攤對象` 兩欄共用同一組成員，App 設定頁的旅伴名單也必須與之逐字相同：

```
Mom、大姊、二姊、Ellyn
```

App 端將此四名定義為常數 `MEMBERS = ["Mom","大姊","二姊","Ellyn"]`，用於付款人選擇、分攤對象勾選、結算分組。

### 5.4 支出來源（公費邏輯核心）

`支出來源` 三選一：
- **公費現付**：當下直接從公費現金（信封）支付
- **公費待補還**：應由公費出，但某人先墊個人的錢，之後從公費補還給他（補還後勾 `公費補還`）
- **個人自付**：個人消費，走旅伴間 AA 分帳（依 `分攤對象` 平均分）

### 5.5 分攤規則（只支援平均分，不做加權）

- `分攤對象` 為 Multi-select，勾選的人之間**平均分攤**該筆金額
- 每人份額 = `金額 (JPY)` ÷ `分攤對象`.length，由 **App 端計算**（Notion 不再有 `每人金額` 公式）
- **不支援加權**（同一筆內每人比例不同）。遇到不平均的情況（例如某人多點一份酒），**拆成兩筆**記錄：一筆全體均分、一筆只勾該人。此規則寫入 UI 說明提示。
- `分攤對象` 僅在 `支出來源 = 個人自付` 時有意義；公費支出（現付/待補還）不在旅伴間 AA，確認頁於非個人自付時隱藏分攤對象選擇器。

---

## 6. 頁面規格

```
/              Dashboard
/login         密碼輸入頁（middleware 未通過時導向此）
/scan          掃描收據
/scan/confirm  確認與編輯辨識結果
/add           手動新增
/edit/[id]     編輯既有記錄（與 add/confirm 共用表單元件）
/history       歷史記錄
/stats         統計分析
/settlement    結算（公費 & AA 分帳）
/settings      設定
```

### 6.1 Dashboard（/）

- 旅程名稱（讀設定的目前旅程）、Day N／共 M 天（依出發日 JST 自動計算）
- 今日支出（JPY + TWD）、旅程累計支出（JPY + TWD）

**公費池區塊（金額為示意）：**
```
公費池總額    ¥200,000   （設定頁填入）
  已動用      ¥87,400    ← 公費現付 Σ + 公費待補還且已補還 Σ
  信封剩餘    ¥112,600   ← 總額 − 已動用
  其中待補還  ¥12,000    ← 公費待補還且未補還 Σ（這筆錢要從信封還給墊款人）
  可自由動用  ¥100,600   ← 信封剩餘 − 待補還
```
- 「待補還」可依墊款人（付款人）拆分顯示，提醒誰該去跟公費領錢
- **「公費待補還」一律由公費償還，不在旅伴間 AA，絕不計入下方個人墊付**

**個人墊付待分帳區塊（只含個人自付、未結算）：**
```
個人墊付待分帳（AA）
  Ellyn   付了 ¥8,200（2 筆，待結算）
  二姊    付了 ¥5,500（1 筆，待結算）
```
- 今日消費列表（最新在前）、掃描快捷按鈕

### 6.2 掃描（/scan）

- `<input type="file" accept="image/*" capture="environment">`
- 上傳前 client-side 以 canvas 壓縮：長邊最大 1280px、輸出 **JPEG 品質 0.85**
- 呼叫 `/api/analyze`，loading 顯示「AI 辨識中…」
- 成功後攜帶辨識結果跳轉 `/scan/confirm`

### 6.3 確認頁（/scan/confirm）

- 顯示收據縮圖
- 可編輯欄位：商品名稱、商店名稱、商店日文、商品日文、日期、金額、類別、支付方式、支出來源、付款人、地區、備註、退稅、退稅金額
- **分攤對象**：僅當支出來源＝個人自付時顯示，預設**全選四人**，可手動取消未參與者
- 品項明細可逐條增刪改；商品名稱(title) 與 商品日文 由品項自動串接，亦可手動覆寫
- 地區依日期自動帶入（見 6.8 行程地區），可改
- 旅行天數 Day 依出發日(JST)自動計算，可改
- 旅程自動帶入設定的目前旅程，可改
- 確認後寫入 Notion，跳回 Dashboard

### 6.4 手動新增（/add）／編輯（/edit/[id]）

- 與確認頁共用同一個表單元件
- /add：空白表單，無收據縮圖，送出走 POST
- /edit/[id]：載入既有記錄帶入表單，送出走 PATCH；頁內提供刪除（DELETE，將 Notion page 設 archived）

### 6.5 歷史記錄（/history）

- 按日期／按類別兩種分組切換，每組顯示小計（JPY + TWD）
- 每筆顯示：商品名稱、商店名稱、金額、類別、支付方式、支出來源、付款人
- 點擊跳 `/edit/[id]`
- 可依旅程篩選

### 6.6 統計分析（/stats）

- 可依旅程篩選（預設目前旅程）、可依付款人篩選
- 圖表：每日趨勢長條圖、類別佔比圓餅、支付方式圓餅、支出來源圓餅
- TOP 10 消費列表
- （選配）一行「實際淨支出 = 累計 − 退稅金額 Σ」
- 使用 recharts

### 6.7 結算（/settlement）

**公費結算：**
- 公費池總額、已動用、信封剩餘、可自由動用（同 Dashboard 算法）
- 公費待補還列表（依墊款人分組），可逐筆勾 `公費補還` 完成補還
- 補還後該筆從「待補還」移除、計入「已動用」

**AA 分帳（只含 個人自付 + 未結算）：**
- 每筆：付款人先墊全額，`分攤對象` 內每人各欠 金額 ÷ 分攤人數
- 每人淨額 = Σ(他當付款人付的個人自付) − Σ(他出現在分攤對象中應分的份額)
  - 正數＝別人欠他，負數＝他要付給別人
- 顯示每人淨額；提供「全部結算」批次勾 `已結算`
- （加分項，先不做）最少轉帳筆數建議

### 6.8 設定（/settings，存 localStorage）

| 欄位 | 型別 | 說明 |
|---|---|---|
| 目前旅程 | 文字 | 自由輸入，例：東京草津 2026/10；寫入時成為 Notion `旅程` 選項 |
| 旅程出發日期 | 日期 | 用於 Day N 計算（JST） |
| 旅行天數 | 數字 | 共 M 天 |
| 行程地區 | 多行文字 | 每行「地區 月/日-月/日」，例：`草津 10/14-10/15`；供地區自動判定 |
| 公費總額 (JPY) | 數字 | Dashboard 公費池計算基準 |
| 匯率（JPY→TWD） | 數字 | 預設 0.21 |
| 旅伴名稱 | 文字 ×4 | 預設 Mom、大姊、二姊、Ellyn，須與 Notion 選項逐字一致 |

**行程地區解析**：將每行解析為「地區 + 日期區間」，掃描收據時依收據日期落在哪段帶入對應地區；無對應則留空待手動選。

---

## 7. API Routes

| Endpoint | Method | 功能 |
|---|---|---|
| /api/analyze | POST | 收 `{ imageBase64, mimeType }` → AI Provider → 回傳結構化 JSON |
| /api/expenses | GET | 取得全部記錄（分頁迴圈取完，支援 `?trip=` 篩選） |
| /api/expenses | POST | 新增一筆到 Notion |
| /api/expenses/[id] | PATCH | 更新既有記錄 |
| /api/expenses/[id] | DELETE | 將 Notion page 設為 archived |

- 所有外部 API 呼叫只能在 Route Handlers（伺服器端）
- **不做 in-memory cache**（serverless 不可靠且資料量小）；每次 GET 直接查 Notion
- 全站 middleware 檢查密碼 cookie，未通過導向 `/login`；`/login` 與 `/api` 的登入驗證端點除外

### 7.1 /api/analyze 請求 / 回應

請求 body：
```json
{ "imageBase64": "（不含 data: 前綴的 base64）", "mimeType": "image/jpeg" }
```
回應：即第 8 節的辨識 JSON。兩個 provider 都需正規化成此形狀。

---

## 8. AI 辨識規格

回傳格式（強制純 JSON，無 markdown 圍欄）：

```json
{
  "storeName": "繁中店名",
  "storeNameJa": "日文店名",
  "date": "YYYY-MM-DD（和暦換算西元；無法辨識回空字串）",
  "items": [
    { "name": "繁中品名", "nameJa": "日文品名", "price": 0, "taxRate": "8%|10%|免税" }
  ],
  "totalJPY": 0,
  "taxType": "内税|外税|免税",
  "paymentMethod": "現金|信用卡|Suica|PayPay|其他",
  "category": "餐飲|交通|購物|住宿|門票|藥品|其他",
  "note": "稅制與折扣摘要"
}
```

Prompt 必須處理的邊界情況：
1. 三種稅制：外税（標價未含稅）、内税（含稅）、免税（退稅）——合計以實付金額為準
2. 同一張收據混合 8%（食品）與 10%（非食品）稅率
3. 割引、値引等折扣須反映在金額並寫入 note
4. 要求模型自行驗算品項加總與合計是否一致，不一致以收據合計為準
5. 後端解析容錯：剝除 ``` 圍欄、僅擷取第一個 `{` 到最後一個 `}`

### 8.1 Provider 抽象

- `lib/ai/index.ts` 匯出 `analyzeReceipt(imageBase64, mimeType): Promise<ReceiptJSON>`，依 `AI_PROVIDER` 分派
- 兩實作分別處理各自的圖片輸入格式與回應解析，對外回傳同一個正規化 JSON
- 模型 id 設為各 provider 檔頂端常數，方便替換：
  - Claude 預設 `claude-sonnet-4-6`
  - Gemini 預設使用當前免費 Flash 機型
  - **Phase 3 動工前，先到兩家官方文件確認當下可用的模型字串**

---

## 9. 前端狀態管理

- 使用者設定：`localStorage`
- 收據資料：source of truth 是 Notion，每次需要時查 API；統計頁允許單次 session 內 cache
- 掃描/編輯表單草稿：React state（不持久化）

---

## 10. 日期與時區

- **所有日期計算固定使用 JST（Asia/Tokyo）**：今日支出、Day N、地區判定皆以 JST 當日為準，避免 Vercel(UTC) 與裝置時區造成 off-by-one
- 儲存的 `日期` 為收據當天日曆日（不含時間）

---

## 11. PWA 與視覺

- `manifest.json`（名稱、icon、theme-color），可加入手機主畫面
- 手機優先，max-width 560px 置中
- 底部五分頁導覽：首頁、掃描、記錄、統計、設定；結算從首頁公費區塊或統計頁進入
- 色調：和風暖色系（紙白 #F7F3EC、柿色 #D4502A、藍墨 #3D5A73）
- 所有介面文字繁體中文

---

## 12. 開發階段

**Phase 1 — 專案骨架**
Next.js 15 + TS strict + Tailwind 初始化、`.env.example`、`/login` + 密碼 middleware、底部五分頁導覽空殼、PWA manifest。
驗收：`npm run dev` 可啟動，未登入導向 /login，輸入密碼後能在五個空頁間切換。

**Phase 2 — Notion 串接**
`lib/notion.ts` 單一 client（釘 2022-06-28）、`Expense` 型別與雙向轉換、GET/POST/PATCH/DELETE 四支 API、分頁迴圈、旅程篩選。
驗收：以測試頁新增一筆假資料能在 Notion 看到（含分攤對象），GET 能正確取回並反解析成 Expense，PATCH 能改、DELETE 後 Notion page 為 archived。

**Phase 3 — AI 辨識**
Provider 抽象 + gemini/claude 兩實作、/api/analyze、圖片壓縮工具函式。
驗收：上傳一張日文收據，回傳合法 JSON，稅制欄位正確。

**Phase 4 — 核心頁面**
/scan、/scan/confirm（地區自動判定、Day 自動計算、分攤對象條件顯示）、/add、/edit/[id]、/history、/（Dashboard 含公費池與個人墊付）。
驗收：掃描 → 確認 → 儲存 → 首頁與歷史正確顯示；公費池五個數字正確；個人墊付不含公費待補還。

**Phase 5 — 統計、結算、設定**
/stats 四圖 + 篩選、/settlement 公費補還與 AA 淨額、/settings 全欄位 + 行程地區解析。
驗收：見第 13 節總驗收清單。

**Phase 6 — 部署文件**
README：Notion Integration 設定、各 API key 取得、Vercel 環境變數、部署流程。不執行 git push。

---

## 13. 總驗收清單

- [ ] 手機尺寸（375px）下各頁排版正常，底部導覽不遮擋內容
- [ ] 未登入無法存取任何頁面或 API，輸入密碼後正常
- [ ] 掃描一張内税收據與一張 8%/10% 混合稅率收據，辨識結果正確
- [ ] confirm 頁修改品項與金額後，Notion 資料與修改一致
- [ ] 欄位名稱完全對應（`商品名稱` title、`旅行天數 Day` 含空格、`金額 (JPY)` 半形括號加空格）
- [ ] 寫入含 `分攤對象`（multi_select），四個名字與付款人一致：Mom、大姊、二姊、Ellyn
- [ ] 支出來源＝個人自付時才顯示分攤對象，預設全選；公費支出時隱藏
- [ ] 行程設定「草津 10/14-10/15」後，10/14 的記錄自動帶入地區「草津」
- [ ] 旅行天數 Day 依出發日（JST）計算正確
- [ ] 公費池：已動用＝公費現付＋公費待補還已補還；可自由動用＝信封剩餘−待補還未補還
- [ ] 公費待補還未補還，只出現在公費池待補還，**不**出現在個人墊付 AA
- [ ] AA 結算：每人淨額＝付的個人自付−應分份額，正負號正確；可批次結算
- [ ] 統計頁可依旅程與付款人篩選，四圖數字與歷史加總一致
- [ ] 刪除記錄後 Notion 該頁面 archived，前端列表即時消失
- [ ] 所有日期邏輯以 JST 計算
- [ ] `@notionhq/client` 維持 5.22.0，client 釘 `notionVersion: "2022-06-28"`
- [ ] repo 中搜尋不到任何金鑰字串
- [ ] Vercel 部署成功，手機瀏覽器可正常使用並加入主畫面
