#!/usr/bin/env node
/* ============================================================
   tripsbook 發佈前檢查（規格書第二十九章）
   零依賴，Node.js 18 以上。

   用法：
     node tools/check.mjs                    檢查整個 repo
     node tools/check.mjs tokyo-202610       只檢查一本（另含書架與共用頁）
     node tools/check.mjs --deploy           push 後確認線上版本已更新（全部書本）
     node tools/check.mjs --deploy tokyo-202610

   結果：
     ✗ 錯誤：會擋 push（pre-push 掛鉤），修正後重跑
     ! 提醒：不擋，但建議處理
   私人比對清單：tools/privacy-deny.local.txt（不進 repo，格式見 privacy-deny.example.txt）
   公開資訊白名單：tools/privacy-allow.txt（例如緊急電話）
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = (process.env.TRIPSBOOK_SITE || "https://starellyn.github.io/tripsbook").replace(/\/$/, "");
const TEMPLATE = "旅遊行程書_模版.html";
const TEMPLATE_LS = "tripsbook_TRIPKEY_";
const BOOK_DIR = /^[a-z][a-z0-9]*-\d{6}(?:-[a-z0-9]+)?$/;

/* ---------- 輸出 ---------- */
const findings = []; // {file, line, group, level, msg}
const add = (file, line, group, level, msg) => findings.push({ file, line, group, level, msg });
const rel = f => path.relative(ROOT, f).split(path.sep).join("/");
const read = f => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const lineAt = (text, idx) => text.slice(0, Math.max(0, idx)).split("\n").length;
const short = (s, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);

/* ---------- 讀清單 ---------- */
function listFile(name) {
  const f = path.join(ROOT, "tools", name);
  if (!fs.existsSync(f)) return null;
  return read(f).split("\n").map(x => x.trim()).filter(x => x && !x.startsWith("#"));
}
const ALLOW = listFile("privacy-allow.txt") || [];
const DENY = listFile("privacy-deny.local.txt");
const allowed = m => ALLOW.some(a => a.includes(m) || m.includes(a));

/* ---------- 找檔案（優先用 git 追蹤清單，push 出去的就是這些）---------- */
function trackedFiles() {
  try {
    const out = execSync("git ls-files -z", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString();
    return out.split("\0").filter(Boolean).map(f => path.join(ROOT, f)).filter(f => fs.existsSync(f));
  } catch {
    const all = [];
    const walk = d => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if ([".git", "node_modules"].includes(e.name)) continue;
        const p = path.join(d, e.name);
        e.isDirectory() ? walk(p) : all.push(p);
      }
    };
    walk(ROOT);
    return all;
  }
}
const TEXT_EXT = /\.(html?|md|txt|js|mjs|gs|json|css|patch|diff)$/i;

/* ---------- 取出 TRIP / BOOKS 物件 ---------- */
function extractObject(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const eq = text.indexOf("=", at);
  if (eq < 0) return null;
  let start = eq + 1;
  while (/\s/.test(text[start] || "")) start++;
  if (!"{[".includes(text[start] || "x")) return null;
  const open = text[start], close = open === "{" ? "}" : "]";
  let depth = 0, i = start, q = null;
  for (; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (q) {
      if (c === "\\") { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === "/" && n === "/") { i = text.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && n === "*") { i = text.indexOf("*/", i + 2) + 1; if (i <= 0) break; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") { depth--; if (depth === 0) break; }
  }
  const src = text.slice(start, i + 1);
  try {
    return { value: vm.runInNewContext("(" + src + ")", {}, { timeout: 1000 }), offset: start };
  } catch (e) {
    return { error: e.message, offset: start };
  }
}

/* ============================================================
   1. 隱私（公開站規則，規格 28）
   ============================================================ */
const FLIGHT_CODES = "JL|NH|CI|BR|CX|MM|IT|TW|7C|KE|OZ|JX|GK|BC|UO|D7|TR|ZG|NU|HX|AE|B7|ZE|LJ|VJ|TG|SQ";
const PRIVACY_RULES = [
  { level: "error", re: new RegExp(`(?<![#\\w])(?:${FLIGHT_CODES})\\s?-?\\d{2,4}(?![\\d\\w%])`, "g"), msg: "航班編號" },
  { level: "error", re: /(?:班機|航班|班號|起飛|降落)[^\n"]{0,10}?\d{1,2}:\d{2}|\d{1,2}:\d{2}[^\n"]{0,8}?(?:班機|起飛|降落)/g, msg: "航班起降時刻" },
  { level: "error", re: /(?:\+81|\+886)[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{3,4}|(?<![\d-])0\d{1,4}-\d{1,4}-\d{3,4}(?![\d-])|(?<!\d)09\d{2}-?\d{3}-?\d{3}(?!\d)/g, msg: "電話號碼" },
  { level: "error", re: /〒\s?\d{3}-?\d{4}/g, msg: "日本郵遞區號" },
  { level: "error", re: /(?:確認號|確認碼|訂單編號|訂位代號|訂房代號|予約番[号號]|confirmation\s*(?:no\.?|number|#|code)|booking\s*(?:no\.?|number|ref|reference)|reservation\s*(?:no\.?|number)|\bPNR)[\s:：#＃=]*(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{4,}/gi, msg: "訂單／訂位編號" },
  { level: "error", re: /https?:\/\/[^\s"'<>)]+[?&](?:pin|pincode|token|auth|key|code|booking_?id|reservation_?id|confirm(?:ation)?|order_?id|pnr|hash)=/gi, msg: "連結帶 PIN／權杖等參數（多半是個人管理連結）" },
  { level: "warn", re: /https?:\/\/(?:[\w-]+\.)*(?:booking\.com|agoda\.com|jalan\.net|travel\.rakuten\.co\.jp|ikyu\.com|airbnb\.[\w.]+|expedia\.[\w.]+|trip\.com|hotels\.com|klook\.com|kkday\.com)\/[^\s"'<>]*(?:mybooking|myreservation|reservation|confirmation|manage|mypage|order)[^\s"'<>]*/gi, msg: "訂房／訂票網站的管理頁連結" },
  { level: "warn", re: /\d{1,4}丁目|\d+番地|(?<![\d\/:.\-–])\d{1,3}-\d{1,3}-\d{1,3}(?![\d\/:.\-–])/g, msg: "疑似門牌地址（店家公開地址可忽略）" }
];

function stripStyle(text) {
  // 保留行數：把 <style>…</style> 內容換成同樣多的換行
  return text.replace(/<style[\s\S]*?<\/style>/gi, m => m.replace(/[^\n]/g, " "));
}

function checkPrivacy(file, text) {
  const name = rel(file);
  if (/\.html?$/i.test(file)) {
    const t = stripStyle(text);
    for (const r of PRIVACY_RULES) {
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(t))) {
        if (allowed(m[0])) continue;
        add(name, lineAt(t, m.index), "隱私", r.level, `${r.msg}「${short(m[0])}」`);
      }
    }
  }
  if (DENY) {
    for (const d of DENY) {
      let i = text.indexOf(d);
      while (i >= 0) {
        add(name, lineAt(text, i), "隱私", "error", `私人比對清單命中「${d}」`);
        i = text.indexOf(d, i + d.length);
      }
    }
  }
}

/* ============================================================
   2. 結構與數字（TRIP 內容）
   ============================================================ */
const WD = "日一二三四五六";
const JP_WRONG_FORM = /[淺澤濱廣櫻國驛鐵臺溫會戶樂圓縣灣黑觀說站覽區號與學寫邊齋]/;
const AMOUNT = /(?:NT\$|¥|￥)\s?\d{1,3}(?:,\d{3})+|(?:NT\$|¥|￥)\s?\d{4,}/;

function findLine(text, needle, from = 0) {
  if (!needle) return 0;
  const i = text.indexOf(needle, from);
  return i >= 0 ? lineAt(text, i) : 0;
}

function checkTrip(file, text, isTemplate) {
  const name = rel(file);
  const got = extractObject(text, "const TRIP");
  if (!got) { add(name, 0, "結構", "error", "找不到 const TRIP 資料區"); return; }
  if (got.error) { add(name, lineAt(text, got.offset), "結構", "error", `TRIP 資料區語法錯誤：${got.error}`); return; }
  const T = got.value, M = T.meta || {}, at = got.offset;
  const L = needle => findLine(text, needle, at);

  // phase
  if (!["draft", "final", "travelling"].includes(M.phase))
    add(name, L("phase"), "結構", "error", `meta.phase 必須是 draft／final／travelling（目前：${M.phase}）`);
  if (isTemplate) return; // 模版只檢查能不能讀

  // 日期與星期
  const dep = /^\d{4}-\d{2}-\d{2}$/.test(M.departDate || "") ? M.departDate : "";
  if (!dep) add(name, L("meta"), "結構", "warn", "meta.departDate 沒填（倒數與「打開跳到當天」都靠它）");
  const folderYm = (path.basename(path.dirname(file)).match(/-(\d{4})(\d{2})/) || []).slice(1).map(Number);
  const y0 = dep ? +dep.slice(0, 4) : folderYm[0], m0 = dep ? +dep.slice(5, 7) : folderYm[1];
  const variants = Array.isArray(M.variants) ? M.variants : [];
  const vids = variants.map(v => v.id);
  (T.days || []).forEach(d => {
    const n = String(d.date || "").match(/(\d{1,2})\s*\/\s*(\d{1,2})[^一二三四五六日]*([一二三四五六日])?/);
    if (!n) { add(name, L(`date: "${d.date}"`) || L(d.title), "結構", "warn", `日期格式看不懂：「${d.date}」（建議 10/24（六））`); }
    else if (n[3] && y0) {
      const mm = +n[1], dd = +n[2], yy = mm < m0 ? y0 + 1 : y0;
      const real = WD[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()];
      if (real !== n[3]) add(name, L(d.date), "結構", "error", `${d.date} 星期不對，${yy}/${mm}/${dd} 是星期${real}`);
    }
    if (d.variant && !vids.includes(d.variant))
      add(name, L(d.title), "結構", "error", `「${d.title}」標了 variant "${d.variant}"，但 meta.variants 沒有這個版本`);
    if (d.dayMap === "當天代表地點") add(name, L("當天代表地點"), "結構", "warn", "dayMap 還是模版佔位字");
    const maps = [["dayMap", d.dayMap], ...(d.items || []).map(it => ["map", it.map])];
    for (const [k, v] of maps) {
      if (!v || /^https?:/.test(v)) continue;
      const bad = String(v).match(JP_WRONG_FORM);
      if (bad && !/[぀-ヿ]/.test(v))
        add(name, L(v), "結構", "warn", `${k}「${v}」含中文字形「${bad[0]}」；若是日本地點，建議用日文原名，Google 地圖比較搜得到`);
    }
  });
  if (variants.length) {
    const ids = new Set();
    variants.forEach(v => { if (ids.has(v.id)) add(name, L("variants"), "結構", "error", `meta.variants 的 id "${v.id}" 重複`); ids.add(v.id); });
    vids.forEach(id => { if (!(T.days || []).some(d => d.variant === id)) add(name, L("variants"), "結構", "warn", `版本 "${id}" 沒有任何分歧日`); });
  }

  // pending 與 bookings
  const pending = Array.isArray(T.pending) ? T.pending : [];
  const bookings = Array.isArray(T.bookings) ? T.bookings : [];
  const todo = bookings.filter(b => b.status === "todo");
  if (M.phase === "draft" && !pending.length && !todo.length)
    add(name, L("pending"), "結構", "warn", "草稿階段但 pending 是空的、預約也沒有待訂：若剛轉檔，確認候選沒有遺失");
  if (M.phase !== "draft" && pending.length)
    add(name, L("pending"), "結構", "error", "已定版（phase 不是 draft）但 pending 還有候選");
  if (M.phase !== "draft" && todo.length)
    add(name, L("bookings"), "結構", "warn", `已定版但預約還有 ${todo.length} 項待訂`);
  bookings.forEach(b => {
    const label = b.what || [b.area, b.type].filter(Boolean).join("・") || "(未命名)";
    const ln = L(b.what || b.area || "bookings");
    if (!["stay", "table", "ticket", "other"].includes(b.kind)) add(name, ln, "結構", "error", `預約「${label}」的 kind 必須是 stay／table／ticket／other`);
    if (!["todo", "booked", "none"].includes(b.status)) add(name, ln, "結構", "error", `預約「${label}」的 status 必須是 todo／booked／none`);
    if (b.variant && !vids.includes(b.variant)) add(name, ln, "結構", "error", `預約「${label}」標了 variant "${b.variant}"，但 meta.variants 沒有這個版本`);
    if (b.status === "booked" && ((b.candidates || []).length || b.name))
      add(name, ln, "隱私", "error", `預約「${label}」已訂，不能再寫名稱或候選（公開站規則）`);
    if (AMOUNT.test(JSON.stringify(b))) add(name, ln, "隱私", "error", `預約「${label}」寫了金額（實付金額記在私人備忘）`);
  });

  // setup：金額只放預估
  ((T.setup || {}).options || []).forEach(o => {
    const ln = L("roomEach") > L("渲染程式") && L("渲染程式") ? L("setup") : L("roomEach");
    if (o.roomEach == null) add(name, L("setup"), "結構", "warn", `setup「${o.label}」沒填 roomEach（每人住宿預估）`);
    else if (typeof o.roomEach !== "number") add(name, ln, "結構", "error", `setup「${o.label}」的 roomEach 必須是數字`);
    else if (o.roomEach % 100 !== 0) add(name, ln, "隱私", "warn", `roomEach ${o.roomEach} 看起來像實付精確值，建議取整成預估`);
    if (o.charterTotal != null && typeof o.charterTotal !== "number") add(name, L("charterTotal"), "結構", "error", `setup「${o.label}」的 charterTotal 必須是數字（沒有包車填 0）`);
    if (o.roomNote && AMOUNT.test(o.roomNote) && !/預估|估/.test(o.roomNote))
      add(name, L("roomNote"), "隱私", "error", "roomNote 寫了金額卻沒標「預估」（實付金額記在私人備忘）");
  });

  // 匯率與 NT$ 換算
  const rate = typeof M.rate === "number" && M.rate > 0 ? M.rate : null;
  if (!rate) add(name, L("rate"), "數字", "warn", "meta.rate 沒填，NT$ 換算無法核對");
  else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(M.rateDate || "")) add(name, L("rateDate"), "數字", "warn", "meta.rateDate 沒填或格式不是 YYYY-MM-DD");
    const num = s => +String(s).replace(/,/g, "");
    const re = /[¥￥]\s?([\d,]{3,})(?:\s*[–~\-]\s*([\d,]{3,}))?[^¥￥\n]{0,25}?NT\$\s?([\d,]{3,})(?:\s*[–~\-]\s*([\d,]{3,}))?/g;
    let m;
    const body = text.slice(at);
    const lvl = M.phase === "draft" ? "warn" : "error";
    while ((m = re.exec(body))) {
      const pairs = [[m[1], m[3]], [m[2], m[4]]].filter(p => p[0] && p[1]);
      for (const [yen, nt] of pairs) {
        const want = num(yen) * rate, got2 = num(nt);
        if (Math.abs(got2 - want) > Math.max(10, want * 0.03))
          add(name, lineAt(text, at + m.index), "數字", lvl, `¥${yen} × ${rate} ≈ NT$${Math.round(want).toLocaleString("en-US")}，書上寫 NT$${nt}`);
      }
    }
  }

  // 預算頁佔位字（出發前手填）
  const ph = (text.match(/NT\$X|NT\$XX|策略一句話|替換成你的連結|飯店名稱|車站名稱|個錢坑/g) || []).length;
  if (ph) add(name, findLine(text, "NT$X") || findLine(text, "替換成你的連結"), "結構", "warn", `預算頁或工具盒還有 ${ph} 處模版佔位字`);
}

/* ============================================================
   3. 語言（台灣繁體用語）
   ============================================================ */
const SIMP = /[们这个时过说从开长门间问车现该让东见还进运远选钟银阳队电页项顺预领风饭馆鱼鸟齐龙书买卖读话语认识转网视频设计订费乡镇岛汤线园场发处动务药价钱际关观欢气广庆厅宾铁乐亚尔华宁济经纪红枫热爱产两严丽举义乌习无专业丰临为么]/g;
const MAINLAND = ["软件", "軟件", "信息", "網絡", "网络", "視頻", "视频", "默認", "默认", "文件夾", "文件夹", "鏈接", "链接", "質量", "屏幕", "打印", "登錄", "用戶", "菜單", "點擊", "激活", "硬件", "短信", "出租車", "公交", "酒店", "性價比", "堂食", "智能"];
function checkLanguage(file, text) {
  const name = rel(file);
  const t = stripStyle(text);
  let m;
  SIMP.lastIndex = 0;
  const seen = new Set();
  while ((m = SIMP.exec(t))) {
    const ln = lineAt(t, m.index);
    if (seen.has(ln)) continue;
    seen.add(ln);
    add(name, ln, "語言", "warn", `疑似簡體字「${m[0]}」`);
  }
  for (const w of MAINLAND) {
    let i = t.indexOf(w);
    while (i >= 0) { add(name, lineAt(t, i), "語言", "warn", `中國大陸用語「${w}」`); i = t.indexOf(w, i + w.length); }
  }
}

/* ============================================================
   4. 書本與書架
   ============================================================ */
function checkShelf(books) {
  const shelf = path.join(ROOT, "index.html");
  if (!fs.existsSync(shelf)) return;
  const text = read(shelf);
  const got = extractObject(text, "const BOOKS");
  if (!got || got.error || !Array.isArray(got.value)) { add("index.html", 0, "書本", "error", "書架讀不到 BOOKS 陣列"); return; }
  const urls = got.value.map(b => b.url).filter(Boolean);
  urls.forEach(u => {
    if (!fs.existsSync(path.join(ROOT, u, "index.html"))) add("index.html", findLine(text, u), "書本", "error", `書架卡片連到「${u}」，但找不到 ${u}index.html`);
  });
  books.forEach(b => { if (!urls.includes(b + "/")) add("index.html", 0, "書本", "warn", `${b} 沒有出現在書架 BOOKS`); });
}

function checkPrefixes(books) {
  const seen = {};
  books.forEach(b => {
    const f = path.join(ROOT, b, "index.html");
    const text = read(f);
    const m = text.match(/const LS_PREFIX\s*=\s*"([^"]*)"/);
    if (!m) return; // 較舊的書沒有這個變數
    const ln = lineAt(text, m.index);
    if (m[1] === TEMPLATE_LS) add(`${b}/index.html`, ln, "書本", "error", `LS_PREFIX 還是模版預設「${TEMPLATE_LS}」，改成「tripsbook_${b.replace(/-/g, "")}_」`);
    if (seen[m[1]]) add(`${b}/index.html`, ln, "書本", "error", `LS_PREFIX「${m[1]}」和 ${seen[m[1]]} 重複，勾選紀錄會互相覆蓋`);
    seen[m[1]] = b;
  });
}

/* ============================================================
   5. 部署確認（push 後）
   ============================================================ */
async function deploy(targets) {
  const sha = s => crypto.createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");
  const pages = targets.map(b => ({ name: b ? `${b}/` : "書架", local: path.join(ROOT, b, "index.html"), url: `${SITE}/${b ? b + "/" : ""}` }))
    .filter(p => fs.existsSync(p.local));
  const t0 = Date.now(), LIMIT = 10 * 60 * 1000;
  console.log(`等待 GitHub Pages 更新（最多 10 分鐘）：${SITE}/`);
  let pendingPages = pages;
  while (pendingPages.length) {
    const still = [];
    for (const p of pendingPages) {
      const want = sha(read(p.local));
      try {
        const res = await fetch(`${p.url}?t=${Date.now()}`, { cache: "no-store" });
        const got = res.ok ? sha(await res.text()) : `HTTP ${res.status}`;
        if (got === want) console.log(`  ✓ ${p.name} 已上線（${Math.round((Date.now() - t0) / 1000)} 秒）`);
        else still.push(p);
      } catch { still.push(p); }
    }
    pendingPages = still;
    if (!pendingPages.length) break;
    if (Date.now() - t0 > LIMIT) {
      pendingPages.forEach(p => console.log(`  ✗ ${p.name} 10 分鐘內沒更新：到 GitHub 的 Actions 分頁看部署有沒有失敗`));
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 15000));
  }
  console.log("全部上線。");
}

/* ============================================================
   主程式
   ============================================================ */
const args = process.argv.slice(2);
const isDeploy = args.includes("--deploy");
const only = args.filter(a => !a.startsWith("--"));
const files = trackedFiles();
const books = [...new Set(files.map(f => rel(f).split("/")).filter(p => p.length === 2 && BOOK_DIR.test(p[0]) && p[1] === "index.html").map(p => p[0]))].sort();
only.forEach(b => { if (!books.includes(b)) { console.error(`找不到書本資料夾：${b}`); process.exit(2); } });

if (isDeploy) {
  await deploy(only.length ? only : ["", "_shared", ...books]);
  process.exit(0);
}

const inScope = f => {
  if (!only.length) return true;
  const r = rel(f);
  return only.some(b => r.startsWith(b + "/")) || !BOOK_DIR.test(r.split("/")[0]);
};
for (const f of files) {
  const r = rel(f);
  if (r.startsWith("tools/") || r.startsWith(".githooks/") || !TEXT_EXT.test(f) || !inScope(f)) continue;
  const text = read(f);
  const top = r.split("/")[0];
  if (/\.(patch|diff)$/i.test(r))
    add(r, 0, "隱私", "error", "patch 檔不要進 repo（裡面有被刪掉的舊內容）");
  if (BOOK_DIR.test(top) && !r.endsWith("/index.html") && /\.md$/i.test(r))
    add(r, 0, "隱私", "error", "書本資料夾裡有 .md 檔（構想書不放 repo，存在 claude.ai project）");
  checkPrivacy(f, text);
  checkLanguage(f, text);
  if (r === TEMPLATE) checkTrip(f, text, true);
  else if (BOOK_DIR.test(top) && r.endsWith("/index.html")) checkTrip(f, text, false);
}
checkShelf(books);
checkPrefixes(only.length ? only : books);

/* ---------- 報告 ---------- */
const order = { error: 0, warn: 1 };
findings.sort((a, b) => a.file.localeCompare(b.file) || order[a.level] - order[b.level] || a.line - b.line);
console.log("tripsbook 發佈前檢查");
console.log("────────────────────────────");
if (!DENY) console.log("（沒有私人比對清單 tools/privacy-deny.local.txt，家人名字與已訂飯店名不會被比對）");
let cur = "";
for (const x of findings) {
  if (x.file !== cur) { console.log(`\n${x.file}`); cur = x.file; }
  console.log(`  ${x.group}  ${x.level === "error" ? "✗" : "!"} ${x.line ? "第 " + x.line + " 行  " : ""}${x.msg}`);
}
const nErr = findings.filter(x => x.level === "error").length;
const nWarn = findings.length - nErr;
console.log("\n────────────────────────────");
if (nErr) {
  console.log(`結果：錯誤 ${nErr}、提醒 ${nWarn} → 不可 push。修正後重跑；確定要略過：git push --no-verify`);
  process.exit(1);
}
console.log(`結果：錯誤 0、提醒 ${nWarn} → 可以 push。push 後跑 node tools/check.mjs --deploy 確認上線。`);
