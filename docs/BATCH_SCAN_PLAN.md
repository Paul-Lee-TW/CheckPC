# 設計文件：批次稽核掃描（Batch Audit Scan）

> 狀態：**已決策、待實作** ｜ 作者：Paul ｜ 日期：2026-06-25 ｜ 目標版本：CheckPC vNext

## 0. 決策紀錄（2026-06-25 確認）

| # | 議題 | 決定 |
|---|------|------|
| 1 | 目標清單來源 | ✅ **要伺服器端主機清單庫存**（只存主機資訊，**不存密碼**） |
| 2 | 帳密模式 | ✅ **共用帳密** ＋ 逐列可覆寫 |
| 3 | 持久化／稽核軌跡 | ✅ **結果落地 + 稽核軌跡**（兩者都做） |
| 4 | 進度回報 | ✅ **輪詢（polling）** |
| 5 | 安全前提 | ✅ **僅受信任內網**使用 |
| 6 | 彙整匯出 | ✅ **要單一 Excel 總表**（整批多台彙整） |

> 這些決策把原 MVP 延後的項目（庫存、持久化、軌跡、彙整 Excel）拉進本次範圍，里程碑已於 §5 重排。

## 1. 背景與現況

CheckPC 目前**只能一次稽核一台機器**。實際流程（已從原始碼確認）：

- Electron 主程序以「同程序 `require`」啟動 Express（`src/server.js`，`app.listen(3001)`，未綁 `127.0.0.1`），再開 BrowserWindow 載入 `localhost:3001`。**伺服器與 UI 共用同一條 event loop**。
- 前端 `POST /api/scan/remote {host,port?,username,password}` → `src/routes/scan.js` 驗證必填（第 14 行）→ 呼叫 `services/sshScanner.js` 的 `remoteScan({host,port,username,password})`。
- `remoteScan`（`sshScanner.js:38`）：建立單一 `ssh2` Client（`readyTimeout 15000`、僅密碼、**無 host-key 驗證**）→ `echo %TEMP%` → SFTP 上傳 `CheckPC.ps1`、`config.json` → `powershell -ExecutionPolicy Bypass -File`（執行逾時 `120000ms`）→ 清檔 → stdout 經 `output.replace(/[^\x20-\x7E]/g,'')` 清洗後 `JSON.parse`。**它是無共享狀態、乾淨的 per-host async 函式，可直接當並行單位重用，無需改動。**
- 結果存進**程序內記憶體 Map** `scanResults`（`scan.js:7`），id = `` `${Date.now()}-${Math.random().toString(36).substr(2,6)}` ``（`scan.js:22`）。`GET /api/scan/results/:id` 取回。Map **無 TTL、重啟即失**。
- **沒有任何「目標 PC 清單」概念，沒有伺服器端持久化資料庫。** `config.json` 是稽核**政策**檔（`approvedSoftware / blockedSites / remoteCommKeywords / folderRules`），會被 SFTP 上傳到受測機，**不含 targets 或憑證**。
- 前端：掃描完成把 `{id,result}` 寫入 `sessionStorage['checkpc_scan']` 並導向 `/audit`；`AuditFormPage` 用 `CHECKLIST_ITEMS + evaluateAll` 顯示 13 項；`HistoryPage` 用 `localStorage`；Excel 匯出單張稽核單。

**痛點**：要稽核 N 台機器，使用者必須重複「輸入 → 等候 → 稽核 → 回到掃描頁」N 次，沒有整體進度、沒有失敗彙整、不能重複稽核同一批機器。

## 2. 目標與非目標（Scope）

### 目標（In Scope，依 §0 決策）
- 一次輸入多台目標，**伺服器端並行**呼叫既有 `remoteScan()`，前端看到**逐台即時進度**（pending / running / success / failed），任一台失敗只標記該台、**不中斷整批**。
- 每台成功結果**零改動**接回既有單機稽核流程（`/audit` → `evaluateAll` → 單張 Excel）。
- **主機清單庫存**：伺服器端儲存可重複使用的目標清單（**只存主機資訊、不含密碼**）。
- **結果持久化**：批次結果落地，App 重開後仍可回顧與重新匯出。
- **稽核軌跡**：append-only 操作日誌（誰／何時／對哪些機器／結果）。
- **彙整 Excel 總表**：整批多台彙整成單一活頁簿（總表 + 逐台分頁）。
- 順手修掉會被批次放大的既有缺陷：id 改 `crypto.randomUUID()`、`scanResults` 加 TTL、CJK 清洗修正、`server.js` 綁 `127.0.0.1`。

### 非目標（Out of Scope，本次不做）
- 不引入資料庫（持久化採**檔案**即可，見 §4.11）、不引入子程序 / worker_threads（伺服器維持在 Electron 主程序內）。
- 不改 `remoteScan` 的掃描內部邏輯（SSH 流程、逾時、SFTP 維持原樣）。
- **不做**：per-host 逐台不同帳密（採共用帳密）、CSV 檔匯入（庫存 UI + 貼上已足夠）、SSE/WebSocket（採輪詢）、端點認證（內網前提）。列為更後續迭代。
- 不改 `AuditFormPage` / `HistoryPage` / `settings.js` / `audit.js` 的核心邏輯（`excelExport.js` 為**新增**彙整函式，不動既有單張匯出）。

## 3. 方案比較與推薦

| 方案 | 契合度 | 工時(逆) | 穩健性 | 安全 | UX | **總分** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **方案 1**：MVP fan-out + 輪詢（in-memory、不改 server.js） | 5 | 4 | 3 | 2 | 3 | **17** |
| **方案 2**：批次工作管理器 + 並行池 + SSE + 雙層持久化 | 5 | 2 | 3 | 3 | 4 | **17** |
| **方案 3**：以「庫存 + 憑證管理」為核心 + 並行 + 輪詢 | 5 | 3 | 4 | 2 | 4 | **18** |

三方案契合度皆為 5（皆正確重用 `remoteScan` / `scanResults` / `sessionStorage['checkpc_scan']` → `/audit`）。

### 採用：**方案 1 的 fan-out 主幹 + 方案 3 的庫存/檔案持久化**（依 §0 決策融合）

- 主幹用方案 1 的 **fan-out worker-pool + 輪詢 + 重用 `remoteScan`**：落地成本最低、回歸風險最小、與既有 fetch 型 `api.js` 和 in-process 模型最契合。
- 因 §0 選了「庫存 + 結果落地 + 軌跡 + 彙整 Excel」，納入方案 3 的**主機庫存與檔案持久化**（但採**檔案**而非資料庫，避免方案 2 的複雜度與新相依）。
- 共同的低風險硬化（`crypto.randomUUID()`、`scanResults` TTL、CJK 清洗、綁 `127.0.0.1`）排在 **M1 先行**。
- 批次端點與儲存抽到獨立 `src/routes/batch.js` + `src/services/`，不污染目前唯一正常運作的單機路徑；憑證**絕不落地**。

## 4. 詳細設計

### 4.1 目標清單輸入（前端）

`ScanPage` 新增第三分頁「批次掃描」，目標可來自三處（等價，最終都組成 `targets` 陣列）：

- **從庫存挑選**：勾選已儲存的主機清單（見 §4.10）。
- **逐列表格**：每列 `{host, port(預設22)}`，可新增 / 刪除、可「加入庫存」。
- **貼上區**：每行一筆 `host[:port]`。

帳密採**共用帳密**：表單頂部一組 `username / password` 套用到所有目標，個別列可覆寫。憑證**不落地、不寫庫存、不寫 `config.json`**。

### 4.2 資料結構

```
BatchJob（in-memory：batchJobs Map；完成時快照落地，見 §4.11）
  { id, createdAt, operator?, status: 'running'|'done',
    total, concurrency,
    counts: { pending, running, success, error },
    results: [TargetResult] }        // 不含任何密碼

TargetResult（每台一筆，以 index 對位）
  { index, host, port,
    status: 'pending'|'running'|'success'|'error',
    scanId?,                          // 指向 scanResults 的單台完整結果
    error?,                          // 分類訊息：auth/timeout/connect/parse
    startedAt?, finishedAt? }

BatchRequest（僅存活於請求期間）
  { targets:[{host,port?,username,password}], concurrency?, operator? }
  // password 僅用於 remoteScan；存入任何 Map / 檔案前一律剔除
```

每台成功的**完整結果**沿用既有 `scanResults` Map（key = 單台 `scanId`）；`BatchJob.results` 只存輕量索引。前端 `sessionStorage['checkpc_scan']` 結構 `{id,result}` 完全沿用，故 `AuditFormPage` / `evaluateAll` / 單張 Excel **零改動**。

### 4.3 API 端點

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/scan/batch` | `{ targets:[...], concurrency?, operator? }` | `202 { batchId, total }`（立即回，背景 fan-out） |
| GET | `/api/scan/batch/:batchId` | — | `200 { id, status, total, concurrency, counts, createdAt, results:[...] }`（**不含密碼**） |
| GET | `/api/scan/batch` | — | `200 [{ id, createdAt, total, counts, ... }]` 歷史批次清單（讀落地檔，見 §4.11） |
| GET | `/api/scan/results/:id` | — | **既有端點，零改動重用** |
| GET | `/api/inventory` | — | `200 [{ id, label, host, port, group? }]`（**不含密碼**） |
| PUT | `/api/inventory` | `[{ label, host, port?, group? }]` | `200 { saved }`（整檔覆寫，沿用 settings.js 風格） |
| GET | `/api/audit-log` | `?limit=` | `200 [{ ts, operator?, action, batchId, total, success, failed, hosts:[...] }]` |

**驗證**：`targets` 非空、每筆 `host` 必填、共用或逐列須有 `username/password`、**目標上限 50**、`concurrency` 夾 `1..8`（預設 4）。

> `api.js` 的 `apiRequest` 僅在 `!res.ok` 才丟錯，**202 視為成功**，無需改 `api.js`。

### 4.4 並行模型與上限

伺服器端 fan-out，**固定大小 worker-pool**（手寫、無新相依）：index 游標 + `Promise.allSettled` 包 N 個 worker，每個 worker 迴圈取下一 target → `await remoteScan(...)` → 寫 `TargetResult` / `scanResults` → 取下一個。

- 預設 `concurrency = 4`，可覆寫，**硬上限 8**；**目標硬上限 50**（理由：伺服器在 Electron 主程序內，過高併發的 ssh2 + 大型 `JSON.parse` 同步點會拖累 UI）。
- 單台失敗只標 `status='error'` + 分類訊息，**不中斷整批**。
- 逐台沿用 `remoteScan` 內建逾時；批次背景跑（不 `await`），`POST` 立即回 202。

### 4.5 進度回報（輪詢）

`POST /batch` 回 `batchId` 後，前端 `useBatchPoll` 每約 1.5s `GET /batch/:batchId`，更新每列狀態與進度條（`counts`）；`status==='done'` 時停止。每台完成即時更新 `results`，進度為**逐台粒度**。

### 4.6 結果儲存與 id（含既有缺陷修正）

- 每台完整 result 存 `scanResults` Map；`batchJobs` 只存索引。
- **id**：`batchId` 與單台 `scanId` 改 `crypto.randomUUID()`（取代低熵 `substr`）。
- **TTL**：`scanResults` 每筆記 `createdAt` + `_batchId` 標記；每 10 分鐘 lazy 清掃超過 2 小時、**且帶 `_batchId`** 的條目（單機條目不受影響）。`batchJobs` 同理（落地檔不受 TTL 影響，見 §4.11）。

### 4.7 憑證與安全

- 密碼僅存在於 request body 與 `remoteScan()` 呼叫期間，**絕不寫入任何 Map / 檔案 / 日誌 / 回應**。庫存與軌跡**只記主機，不記密碼**。
- **綁 `127.0.0.1`**：`server.js` 的 `app.listen(PORT)` → `app.listen(PORT, '127.0.0.1')`，避免 LAN 可達。
- **殘留風險**（已知限制 5）：SSH 仍密碼制、**無 host-key 驗證**、密碼明文走 body；批次把攻擊面線性放大到最多 50 台，共用帳密尤甚（連到偽冒主機會一次送出網域憑證）。緩解：不落地/不回傳/不記錄 + 綁 127.0.0.1 + 內網前提（§0-5）+ UI 警語；**host-key 驗證列 M7 第一順位**。

### 4.8 前端 UI 變更

- `ScanPage.jsx`：新增「批次掃描」分頁。
- `BatchScanForm.jsx`：庫存挑選 + 逐列 + 貼上 + 共用帳密 + 並行數 + 操作者欄 + 內網/明文密碼警語。
- `BatchResultsTable.jsx`：逐列狀態徽章 + 錯誤訊息 + 進度條 + 成功/失敗計數；success 列「開啟稽核」（`GET /results/:scanId` → `sessionStorage` → `/audit`）；整批「匯出總表」（§4.12）。
- `useBatchPoll.js`：輪詢 hook。
- `InventoryPage`（或設定頁分頁）：庫存 CRUD（§4.10）。
- `BatchHistoryPage`（或併入歷史頁）：列出落地批次（§4.11）。

### 4.9 主機清單庫存（§0-1）

- 儲存於**可寫資料目錄**（見 §4.13）`inventory.json`：`[{ id, label, host, port, group? }]`，**不含帳密**。
- `GET/PUT /api/inventory`（沿用 `settings.js` 的整檔讀寫風格）。
- 前端可從庫存勾選帶入批次表單；逐列輸入可「加入庫存」。

### 4.10 結果持久化與稽核軌跡（§0-3）

- **結果落地**：批次完成時，將 `BatchJob`（含逐台結果，**不含密碼**）寫成 `data/batches/<batchId>.json`；`GET /batch` 列出、`GET /batch/:id` 找不到記憶體時回退讀檔。App 重開後仍可回顧與重新匯出。
- **稽核軌跡**：每次批次結束 append 一行到 `data/audit-log.jsonl`：`{ ts, operator?, action:'batch_scan', batchId, total, success, failed, hosts:[...] }`。`GET /api/audit-log` 讀回。
- **操作者**：因無登入機制，`operator` 由批次表單可選欄位提供（或退回 OS 使用者名稱）；於文件與 UI 標明此為「自填」而非驗證身分。

### 4.11 彙整 Excel 總表（§0-6）

- `excelExport.js` **新增** `exportBatchToExcel({ batch, perHostResults })`，不動既有 `exportToExcel`：
  - **總表 sheet**：一列一台（電腦名稱、host、整體 pass/fail/warning 計數、各 13 項狀態欄）。
  - **逐台 sheet**（可選）：重用既有單張稽核單版面。
- 重用 `CHECKLIST_ITEMS` + `evaluateAll`，前端在「匯出總表」時對每台 `scanId` 取 result 後產生。

### 4.12 可寫資料目錄（重要）

持久化檔案**不可寫進 app 目錄**：Electron 打包後 `app.asar` 唯讀。設計：

- `server.js` 新增 `const DATA = process.env.CHECKPC_DATA || path.join(ROOT, 'data')`，啟動時確保目錄存在。
- `electron/main.js` 設 `process.env.CHECKPC_DATA = app.getPath('userData')`（mac：`~/Library/Application Support/CheckPC`；Windows：`%APPDATA%/CheckPC`）。
- Node 部署包（`build-deploy.sh`）：可寫，預設 `./data`。
- 內容：`data/inventory.json`、`data/batches/<id>.json`、`data/audit-log.jsonl`。

### 4.13 要新增 / 修改的檔案

| 動作 | 檔案 | 內容 |
|---|---|---|
| 新增 | `src/routes/batch.js` | `batchJobs` Map、`POST/GET /api/scan/batch`、worker-pool、落地、TTL |
| 新增 | `src/routes/inventory.js` | `GET/PUT /api/inventory`（不含密碼） |
| 新增 | `src/routes/auditLog.js` | `GET /api/audit-log`（讀 jsonl） |
| 新增 | `src/services/resultStore.js` | 抽出 `scanResults` + TTL + `randomUUID`，供 scan/batch 共用 |
| 新增 | `src/services/persistence.js` | 讀寫 `data/` 下 inventory / batches / audit-log，集中可寫目錄邏輯 |
| 修改 | `src/routes/scan.js` | 改用 `resultStore`；id 改 `randomUUID` |
| 修改 | `src/server.js` | 掛載新 router；綁 `127.0.0.1`；建立 `DATA` 目錄 |
| 修改 | `electron/main.js` | 設 `CHECKPC_DATA = app.getPath('userData')` |
| 修改 | `src/services/sshScanner.js` | 清洗改為僅去控制字元，保留 CJK |
| 修改 | `frontend/src/lib/excelExport.js` | 新增 `exportBatchToExcel`（彙整總表） |
| 新增 | `frontend/src/components/BatchScanForm.jsx`、`BatchResultsTable.jsx`、`frontend/src/hooks/useBatchPoll.js` | 批次 UI 與輪詢 |
| 修改 | `frontend/src/pages/ScanPage.jsx` | 新增批次分頁 |
| 新增/修改 | 庫存與批次歷史頁（新頁或併入現有頁） | 庫存 CRUD、落地批次列表 |
| **不改** | `audit.js`、`settings.js`、`AuditFormPage.jsx`、`api.js`、`config.json` | — |

## 5. 分階段實作計畫（依 §0 決策重排）

每階段可獨立交付與驗證。

- **M1 — 基礎硬化 + 可寫資料目錄**（低風險先行）
  `resultStore`（`randomUUID` + TTL）、`scan.js` 改用之、`sshScanner` CJK 修正、`server.js` 綁 `127.0.0.1` 與建立 `DATA` 目錄、`electron/main.js` 設 `CHECKPC_DATA`。**驗證**：單機掃描無回歸、中文 computerName 不亂碼、`data/` 可寫。
- **M2 — 後端批次核心**
  `batch.js`：`POST/GET /batch`、worker-pool、失敗隔離、不含密碼回應。**驗證**：`curl` 對 2–3 台（或 mock）確認並行、隔離、逐台進度。
- **M3 — 結果持久化 + 稽核軌跡**
  `persistence.js`；批次完成寫 `batches/<id>.json` 與 append `audit-log.jsonl`；`GET /batch`、`GET /audit-log`、重開回退讀檔。**驗證**：重開 App 仍可列出/開啟舊批次；軌跡正確且不含密碼。
- **M4 — 主機清單庫存**
  `inventory.js` + `GET/PUT /api/inventory`；前端庫存 CRUD。**驗證**：存清單、重開仍在、不含密碼。
- **M5 — 前端批次輸入與輪詢**
  `BatchScanForm`（庫存/逐列/貼上 + 共用帳密 + 操作者）→ `POST /batch`；`BatchResultsTable` + `useBatchPoll`；`ScanPage` 分頁。**驗證**：端到端跑一批，進度與徽章正確。
- **M6 — 串接稽核 + 彙整 Excel 總表**
  success 列「開啟稽核」串既有 `/audit`；`exportBatchToExcel` 總表 + 逐台分頁。**驗證**：任一台進稽核並匯出；整批匯出總表正確。
- **M7 — 安全強化**（緊接 MVP，第一順位）
  `sshScanner` 可選 host-key 驗證（`hostVerifier`/known_hosts pin）；共用帳密警示強化。**驗證**：偽冒 host-key 被拒。

## 6. 風險與緩解

| 風險 | 說明 | 緩解 |
|---|---|---|
| **CJK 清洗破壞資料** | `replace(/[^\x20-\x7E]/g,'')` 洗掉中文，批次放大 | M1 改為僅去控制字元 |
| **Map 無 TTL，記憶體成長** | 批次持有多份大 result | M1 TTL + 上限；result 單份存放、batch 存索引；目標上限 50 |
| **id 熵不足 / `substr` 棄用** | 碰撞、棄用 | M1 改 `crypto.randomUUID()` |
| **Electron 主程序阻塞** | ssh2 + 大型 `JSON.parse` 同步點 | concurrency≤8、目標≤50、worker-pool 不互卡；根治需子程序（超範圍） |
| **打包後 app.asar 唯讀** | 持久化寫檔失敗 | §4.13 用 `CHECKPC_DATA`=userData / 部署包 `./data` |
| **SSH 安全放大** | 明文密碼 + 無 host-key，批次線性放大 | 不落地/不回傳/不記錄 + 綁 127.0.0.1 + 內網 + 警語；host-key 列 M7 |
| **共用 `scanResults` 引入回歸** | 抽 `resultStore`/改 id 動到單機路徑 | M1 獨立交付 + `_batchId` 標記區分 + 補測試 |
| **持久化檔損毀 / 並發寫** | jsonl/json 同時寫 | 集中於 `persistence.js`，append 用同步寫、batch 檔以 `<id>.json` 互不衝突 |
| **operator 非驗證身分** | 軌跡可被填假 | 文件與 UI 標明「自填」；內網信任前提下可接受 |

## 7. 已解決決策與剩餘小問題

§0 已拍板 6 大議題。實作中仍需確認的細項（可於對應里程碑再定）：

1. **庫存是否分組（group）** — schema 預留 `group`，UI 是否需要分組顯示？（M4 再定）
2. **彙整總表欄位** — 各 13 項顯示「符合/異常/待確認」文字，或加上未授權軟體數等摘要欄？（M6 再定）
3. **批次歷史保留上限** — 落地批次檔是否設保留數/天數上限以免無限成長？（M3 再定，預設保留近 100 筆）
4. **operator 來源** — 自填欄位為主；是否同時退回 OS 使用者名稱當預設值？（M5 再定）

---

**檔案參考**：[src/routes/scan.js](../src/routes/scan.js)、[src/services/sshScanner.js](../src/services/sshScanner.js)、[src/server.js](../src/server.js)、[electron/main.js](../electron/main.js)、[frontend/src/lib/excelExport.js](../frontend/src/lib/excelExport.js)、[frontend/src/pages/ScanPage.jsx](../frontend/src/pages/ScanPage.jsx)。
