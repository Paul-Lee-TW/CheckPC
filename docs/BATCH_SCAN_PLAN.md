# 設計文件：批次稽核掃描（Batch Audit Scan）

> 狀態：草案待審 ｜ 作者：Paul ｜ 日期：2026-06-25 ｜ 目標版本：CheckPC vNext

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

### 目標（In Scope）
- 一次輸入多台目標，**伺服器端並行**呼叫既有 `remoteScan()`，前端看到**逐台即時進度**（pending / running / success / failed）。
- 任一台失敗只標記該台、**不中斷整批**。
- 每台成功結果**零改動**接回既有單機稽核流程（`/audit` → `evaluateAll` → Excel 匯出）。
- 順手修掉會被批次放大的既有缺陷：id 改 `crypto.randomUUID()`、`scanResults` 加 TTL、CJK 清洗修正。
- 在 UI 與文件明列「明文密碼 + 無 host-key 驗證」的殘留風險與內網使用前提。

### 非目標（Out of Scope，本次不做）
- 不引入資料庫、不引入子程序 / worker_threads（伺服器維持在 Electron 主程序內）。
- 不改 `remoteScan` 的掃描內部邏輯（SSH 流程、逾時、SFTP 維持原樣）。
- **MVP 不做**：伺服器端主機庫存（inventory）、CSV 檔匯入、per-host 逐台不同帳密、批次彙整成單一 Excel 總表、批次歷史持久化、SSE/WebSocket、端點認證。以上列為後續迭代（見 §5、§7）。
- 不改 `AuditFormPage` / `HistoryPage` / `excelExport.js` / `settings.js` / `audit.js` 的核心邏輯。

## 3. 方案比較與推薦

| 方案 | 契合度 | 工時(逆) | 穩健性 | 安全 | UX | **總分** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **方案 1**：MVP fan-out + 輪詢（in-memory、不改 server.js） | 5 | 4 | 3 | 2 | 3 | **17** |
| **方案 2**：批次工作管理器 + 並行池 + SSE + 雙層持久化 | 5 | 2 | 3 | 3 | 4 | **17** |
| **方案 3**：以「庫存 + 憑證管理」為核心 + 並行 + 輪詢 | 5 | 3 | 4 | 2 | 4 | **18** |

三方案契合度皆為 5（皆正確重用 `remoteScan` / `scanResults` / `sessionStorage['checkpc_scan']` → `/audit`）。差異在範圍與成本：方案 2 自寫整套 job-queue + SSE + 雙層持久化（reconcile 複雜、面積大），方案 3 把庫存 / CSV / per-host / abort 全綁進一個樂觀估計（範圍蔓延）。

### 推薦：以**方案 1 為交付主幹**，吸收方案 2、3 的關鍵硬化

理由：方案 1 落地成本最低、回歸風險最小、與既有 fetch 型 `api.js`（僅 `get/post/put`）和 in-process 模型最契合；不改 `server.js`、不引新相依。但其安全（2 分）與穩健（3 分）是短板。因此**綜合取長**：

1. 採方案 1 的 **fan-out worker-pool + 輪詢 + in-memory** 為主幹。
2. 吸收方案 2/3 共同點名、且**獨立低風險**的硬化：`crypto.randomUUID()`、`scanResults` 加 TTL、**CJK 清洗修正**——這些排在 **M1 先行**，不依賴批次功能。
3. 採方案 3 的**架構潔癖**：批次端點與儲存抽到獨立 `src/routes/batch.js`，避免污染目前唯一正常運作的單機路徑；憑證**絕不落地**。
4. 把方案 2/3 都低估的**安全**從「文件警語」**升一級**：MVP 即綁 `127.0.0.1`，並把 host-key 驗證列為緊接 M4 的第一順位（不無限延後）。

被刻意延後的（庫存、CSV、per-host 帳密、SSE、彙整 Excel）價值真實但非核心，拆為獨立迭代以保證 MVP 可快速、可審。

## 4. 詳細設計（推薦方案）

### 4.1 目標清單輸入（前端，伺服器不維護清單）

維持「無伺服器端目標清單」現狀。`ScanPage` 新增第三分頁「批次掃描」，提供兩種等價輸入：

- **逐列表格**：每列 `{host, port(預設22), username, password}`，可新增 / 刪除列。
- **貼上區**：每行一筆，`host[:port],username,password`，或僅 `host[:port]`（帳密留空則套用「共用帳密」欄）。
- **共用帳密**：多數情境同一組網域帳密套多台，提供「套用第一列 / 共用帳密到全部」降低明文重複輸入。

前端解析成 `targets` 陣列後 `POST /api/scan/batch`。憑證**不落地、不寫 `config.json`**。CSV 檔匯入列為後續（貼上已覆蓋大量輸入）。

### 4.2 資料結構

```
BatchJob（in-memory，存於 batch.js 新增的 batchJobs Map）
  { id, createdAt, status: 'running'|'done',
    total, concurrency,
    counts: { pending, running, success, error },
    results: [TargetResult] }        // 不含任何密碼

TargetResult（每台一筆，以 index 對位）
  { index, host, port,
    status: 'pending'|'running'|'success'|'error',
    scanId?,                          // 指向既有 scanResults Map 的單台完整結果
    error?,                          // 分類訊息：auth/timeout/connect/parse
    startedAt?, finishedAt? }

BatchRequest（僅存活於請求期間的 request body）
  { targets: [{host, port?, username, password}], concurrency? }
  // password 僅用於 remoteScan 呼叫；存入任何 Map 前一律剔除
```

每台成功的**完整結果**沿用既有 `scanResults` Map（key = 單台 `scanId`），`BatchJob.results` 只存輕量索引（`scanId` 參照），避免重複儲存大物件。前端 `sessionStorage['checkpc_scan']` 結構 `{id,result}` 完全沿用，故 `AuditFormPage` / `evaluateAll` / Excel 匯出**零改動**。

### 4.3 API 端點

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/scan/batch` | `{ targets:[{host,port?,username,password}], concurrency? }` | `202 { batchId, total }`（立即回，背景 fan-out） |
| GET | `/api/scan/batch/:batchId` | — | `200 { id, status, total, concurrency, counts, createdAt, results:[{index,host,port,status,scanId,error,...}] }`（**不含密碼**） |
| GET | `/api/scan/results/:id` | — | **既有端點，零改動重用**：單台完整 result，供「開啟稽核」與 Excel 匯出 |

**驗證**（沿用 `scan.js:14` 的 400 訊息風格，逐台套用）：`targets` 為非空陣列、每筆 `host/username/password` 必填、**目標上限 50**、`concurrency` 夾在 `1..8`（預設 4）。

> 注意：`api.js` 的 `apiRequest` 僅在 `!res.ok` 才丟錯，**202 視為成功**並可正常取得 body，無需改 `api.js`。但 202 後若背景啟動出錯，僅能靠後續輪詢狀態發現（見 §6 可觀測性）。

### 4.4 並行模型與上限

伺服器端 fan-out，**固定大小 worker-pool**（手寫，無新相依）：一個 index 游標 + `Promise.allSettled` 包住 N 個 worker，每個 worker 迴圈取下一個 target → `await remoteScan(...)` → 寫 `TargetResult` 與 `scanResults` → 取下一個，直到佇列空。

- 預設 `concurrency = 4`，request 可覆寫，**硬上限 8**；**目標硬上限 50**。理由：伺服器在 Electron 主程序內，過高併發的 ssh2 + 大型 stdout `JSON.parse`（同步點）會吃 CPU、拖累 UI（已知限制 4）。
- 單台失敗（reject）只標 `status='error'` 並記分類訊息，**不中斷整批**（`allSettled` 語意）。
- 逐台沿用 `remoteScan` 內建逾時（`readyTimeout 15000`、執行 `120000ms`）。
- 批次以背景方式跑（不 `await`），`POST` 立即回 202。

### 4.5 進度回報

採**輪詢（polling）**，與既有 fetch 型 `api.js` 與 in-process 模型最契合、零額外相依、不需改 `server.js`：

- `POST /batch` 回 `batchId` 後，前端 `useBatchPoll` 以 `setInterval` 每約 1.5s `GET /batch/:batchId`，更新每列狀態與整體進度條（`counts`）。
- `status === 'done'`（`counts.pending + counts.running === 0`）時停止輪詢。
- 每台完成即時更新 `job.results`，故進度為**逐台粒度**而非整批 await。

刻意不採 SSE/WebSocket：批次量小、輪詢實作量最小、不需在 Electron 主程序維護長連線（列為後續，見 §7）。

### 4.6 結果儲存與 id（含既有缺陷修正）

- 每台成功的完整 result 存入既有 `scanResults` Map；`batchJobs` Map 只存輕量索引。
- **id 修正（已知限制 3）**：`batchId` 與單台 `scanId` 一律改用 `crypto.randomUUID()`，取代 `Date.now()-Math.random().toString(36).substr(2,6)`（熵不足 + `substr` 已棄用）。
- **TTL（已知限制 2）**：兩個 Map 每筆記 `createdAt`，`setInterval` 每 10 分鐘掃描刪除超過 2 小時的 batch 與其**由批次產生**的 `scanResults` 條目。為避免誤刪單機掃描的條目，批次寫入 `scanResults` 時加標記（如 `_batchId`），TTL 僅清掃帶標記者，單機條目沿用既有生命週期不受影響。
- 重啟即失語意維持不變（最終稽核紀錄本就靠前端 `localStorage['checkpc_history']` 持久化）。

### 4.7 憑證與安全

- 密碼僅存在於 `POST /batch` 的 request body 與 `remoteScan()` 呼叫期間，**絕不寫入任何 Map、不回傳於任何 GET、不寫入日誌、不落地 `config.json`**（現有 `console.log` 只印 host，沿用）。批次表單在前端 state 持有明文密碼（與既有 `RemoteScanForm` 同水準），離開頁面即清。
- **綁 `127.0.0.1`（本次納入）**：將 `server.js` 的 `app.listen(PORT)` 改為 `app.listen(PORT, '127.0.0.1')`，避免預設聽 `0.0.0.0` 使 LAN 可達。此為單行、低風險，且與「多主機憑證」情境疊加風險顯著，故不延後。
- **殘留風險明列**（已知限制 5）：SSH 仍為密碼制、**無 host-key 驗證**、密碼明文走 request body；批次會把此攻擊面從單台**線性放大**到最多 50 台。MVP 以「不落地 / 不回傳 / 不記錄 + 綁 127.0.0.1 + 共用帳密減少散佈 + UI 內網警語」緩解，**並把 host-key 驗證（`hostVerifier`/known_hosts pin）列為緊接 MVP 的第一順位安全強化（M5），不無限延後**。共用帳密模式需在 UI 明確警示：連到偽冒主機會一次送出網域憑證。

### 4.8 前端 UI 變更

- `ScanPage.jsx`：新增第三分頁「批次掃描」，與 remote / manual 並列（沿用既有 tab 樣式）。
- 新元件 `BatchScanForm.jsx`：逐列目標表格 + 貼上解析區 + 共用帳密欄 + concurrency 選擇（1..8，預設 4）+ 明文密碼 / 內網警語 + 「開始批次掃描」。
- 新元件 `BatchResultsTable.jsx`：每列 host、即時狀態徽章、錯誤訊息；success 列提供「開啟稽核」（`GET /results/:scanId` → 寫 `sessionStorage['checkpc_scan']` → `navigate('/audit')`）；頂部進度條與成功 / 失敗計數。
- 新 hook `useBatchPoll.js`：封裝 `setInterval` 輪詢與清理。
- `api.js`、`AuditFormPage.jsx`、`HistoryPage.jsx`、`excelExport.js`：**不改動**。

### 4.9 要新增 / 修改的檔案清單

| 動作 | 檔案 | 內容 |
|---|---|---|
| 新增 | `src/routes/batch.js` | `batchJobs` Map、`POST /api/scan/batch`（fan-out worker-pool）、`GET /api/scan/batch/:batchId`、TTL 清理 interval |
| 修改 | `src/routes/scan.js` | 匯出 `scanResults`（或抽到共用 store 供 `batch.js` 回填）；id 改 `crypto.randomUUID()`；`scanResults` 加 TTL 與 `createdAt`/`_batchId` 標記 |
| (建議) 新增 | `src/services/resultStore.js` | 抽出 `scanResults` + TTL，避免 `scan.js`/`batch.js` 重複實作（需測試覆蓋，見 §6） |
| 修改 | `src/server.js` | `app.use('/api/scan', ...)` 已涵蓋新路徑（同 router 掛載）；`app.listen` 綁 `127.0.0.1` |
| 修改 | `src/services/sshScanner.js` | 第 73 行清洗改為僅去控制字元（如 `replace(/[\x00-\x1F\x7F]/g,'')`）以保留 CJK（已知限制 1） |
| 新增 | `frontend/src/components/BatchScanForm.jsx` | 目標輸入（逐列 + 貼上 + 共用帳密 + 並行數 + 警語） |
| 新增 | `frontend/src/components/BatchResultsTable.jsx` | 輪詢進度表 + 每列「開啟稽核」 |
| 新增 | `frontend/src/hooks/useBatchPoll.js` | 輪詢邏輯 |
| 修改 | `frontend/src/pages/ScanPage.jsx` | 新增「批次掃描」分頁 |
| **不改** | `audit.js`、`settings.js`、`AuditFormPage.jsx`、`HistoryPage.jsx`、`excelExport.js`、`api.js`、`config.json` | 批次只是把人導回既有單台稽核流程 |

> 註：若一併把 `audit.js`（id 亦用 `substr`）統一改 `randomUUID`，建議透過共用工具，但屬可選、非批次依賴。

## 5. 分階段實作計畫

每階段可獨立交付與驗證。

- **M1 — 基礎硬化（低風險先行，獨立可合併）**
  改 id 為 `crypto.randomUUID()`；`scanResults` 加 TTL + 上限；`sshScanner` CJK 清洗修正。**驗證**：單機掃描仍正常；中文 computerName 不再亂碼；舊 id 路徑無回歸。立即修掉已知限制 1/2/3。

- **M2 — 後端批次核心**
  新增 `batch.js`：`batchJobs` Map、`POST /batch`（驗證、建立 job、背景 worker-pool 呼叫 `remoteScan`、逐台寫 `results` 與 `scanResults`）、`GET /batch/:id`。**驗證**：`curl` 對 2–3 台（或 mock）確認並行、失敗隔離、進度逐台更新、回應不含密碼。

- **M3 — 前端輸入與輪詢**
  `BatchScanForm`（逐列 + 貼上 + 共用帳密 + 並行數）→ `POST /batch`；`BatchResultsTable` + `useBatchPoll` 顯示即時進度；`ScanPage` 掛第三分頁。**驗證**：端到端跑通一批，進度條與徽章正確。

- **M4 — 串接既有稽核 + 安全前提**
  success 列「開啟稽核」→ `GET /results/:scanId` → `sessionStorage` → `/audit`，確認 `AuditFormPage`/`evaluateAll`/Excel 全程零改動可用；`server.js` 綁 `127.0.0.1`；UI 加內網 / 明文密碼 / 共用帳密警語。**驗證**：從批次任一台進稽核並匯出 Excel；外部主機無法連到 3001。

- **M5 — 安全強化（緊接 MVP，第一順位）**
  `sshScanner` 加可選 host-key 驗證（`hostVerifier` / known_hosts pin）；共用帳密模式強化警示。**驗證**：偽冒 host-key 被拒。

- **M6（可選後續）**：批次彙整 Excel、批次歷史持久化、伺服器端庫存 + CSV 匯入、per-host 逐台帳密、SSE 進度、端點認證。

## 6. 風險與緩解

| 風險 | 說明 | 緩解 |
|---|---|---|
| **CJK 清洗破壞資料（限制 1）** | `replace(/[^\x20-\x7E]/g,'')` 洗掉中文 computerName / 路徑；批次在多台放大此正確性問題 | **M1 修正**為僅去控制字元，保留合法 CJK |
| **Map 無 TTL，記憶體成長（限制 2）** | 批次同時持有多份大 result | **M1** 加 TTL + 上限 + lazy 清掃；result 優先以 `scanId` 單份存放、`batchJobs` 只存索引；目標上限 50 |
| **id 熵不足 / `substr` 棄用（限制 3）** | 低熵碰撞、API 棄用 | **M1** 改 `crypto.randomUUID()` |
| **Electron 主程序阻塞（限制 4）** | ssh2 + 大型 stdout `JSON.parse` 為同步點，高併發拖累 UI | `concurrency` 上限 8、目標上限 50、慢台不互卡（worker-pool）；根治需移子程序，超出 MVP 範圍 |
| **SSH 安全放大（限制 5）** | 明文密碼 + 無 host-key 驗證，批次線性放大攻擊面；共用帳密尤甚 | 不落地 / 不回傳 / 不記錄 + **綁 127.0.0.1（M4）** + 內網警語；**host-key 驗證列 M5 第一順位**，不無限延後 |
| **in-memory 重啟即失** | 批次跑到一半主程序重啟，結果全失需重跑 | MVP 接受此語意（最終稽核走前端 `localStorage` 持久化）；持久化列 M6 |
| **共用 `scanResults` 引入回歸** | 抽 `resultStore` / 改 id 動到唯一正常的單機路徑 | M1 獨立交付 + 以 `_batchId` 標記區分批次 vs 單機條目，TTL 僅清批次條目；補基本測試 |
| **202 後背景錯誤可觀測性弱** | `POST` 立即回 202，背景啟動出錯僅能靠輪詢發現 | `GET /batch/:id` 回 job 級錯誤狀態；後端 `console.error` 記錄（不含密碼） |
| **貼上格式錯誤 / 重複 host** | 大量輸入易產生沉默錯列 | 前端解析時做基本驗證與重複提示，後端 400 把關 |

## 7. 待決問題（Open Questions）

1. **目標清單來源**：MVP 僅前端輸入（逐列 + 貼上）。是否需要伺服器端**主機庫存**（重複稽核同一批機器、不含密碼的 `inventory.json` + `credentialRef`）？若需要，提升至 M6 並評估與「無清單」現狀的取捨。
2. **共用 vs 逐台帳密**：MVP 提供「共用帳密 + 逐列覆寫」。是否需要完整 **per-host 逐台不同帳密**模式（含 UI 切換）？此會放大瀏覽器記憶體中的明文憑證 blast radius，需確認必要性。
3. **持久化與稽核軌跡**：是否需要批次結果**落地**與「操作者 / 時間 / 結果」可匯出的**稽核軌跡**？目前 MVP 為 in-memory + 重啟即失，最終紀錄靠前端 `localStorage`。
4. **進度回報**：MVP 用**輪詢**。批次規模 / 即時性需求是否大到值得引入 **SSE**（須在 Electron 主程序維護長連線）？
5. **安全前提確認**：是否確定**僅在受信任內網**使用？這決定 host-key 驗證（M5）與端點認證的優先級——若會跨網段或多人共用主機，需提前。
6. **彙整匯出**：是否需要把整批多台彙整成**單一 Excel 總表**（多 sheet），或維持 MVP 的「逐台沿用既有單張匯出」即可？

---

**檔案參考**：[src/routes/scan.js](../src/routes/scan.js)、[src/services/sshScanner.js](../src/services/sshScanner.js)、[src/server.js](../src/server.js)、[frontend/src/lib/api.js](../frontend/src/lib/api.js)、[frontend/src/pages/ScanPage.jsx](../frontend/src/pages/ScanPage.jsx)、[frontend/src/pages/AuditFormPage.jsx](../frontend/src/pages/AuditFormPage.jsx)。
