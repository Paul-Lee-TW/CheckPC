# CheckPC — 電腦稽核工具

CheckPC 是一套以 **Electron** 封裝的 Windows 電腦稽核工具，用於對目標電腦執行資安與合規檢查（帳號、資料夾權限、已安裝軟體、遠端／通訊軟體、USB 政策與裝置、被封鎖網站連線性、印表機／螢幕保護、軟體安裝權限等），並可將結果匯出為 Excel 稽核單。

> 技術組成：Electron + Express(Node.js) 後端、React + Vite 前端、PowerShell 稽核腳本、透過 SSH 遠端執行。

---

## 功能特色

- **三種稽核方式**
  - 🔌 **遠端 SSH 掃描**：輸入目標 PC 的 IP 與帳密，後端透過 SSH 連線、上傳並執行稽核腳本，自動取回結果。
  - 📄 **手動上傳**：在目標 PC 本機執行 `CheckPC.ps1` 產生 JSON，再貼上或上傳檔案。
  - 🗂️ **批次掃描**：一次對多台目標 PC 並行掃描（伺服器端 worker-pool），逐台即時進度，單台失敗不影響整批。
- **13 項自動／手動稽核項目**（詳見下方清單），自動項目由 PowerShell 掃描判定 `符合 / 異常 / 待確認`，可手動覆寫。
- **主機清單庫存**：儲存可重複使用的目標主機清單（**不含密碼**），批次掃描可直接勾選。
- **稽核軌跡**：每次批次掃描記錄一筆 append-only 軌跡（操作者／時間／主機／結果），供合規追溯。
- **可設定的稽核政策**：核准軟體白名單、封鎖網站清單、遠端／通訊軟體關鍵字、資料夾權限規則，皆可於設定頁編輯（寫入 `config.json`）。
- **Excel 匯出**：一鍵產生正式的電腦稽核單；批次可匯出**單一彙整總表**（多台一覽）。
- **歷史紀錄**：稽核結果存於瀏覽器本機儲存，可回顧。

> 安全性：Web 服務預設僅綁 `127.0.0.1`（本機）；SSH 掃描採 **host-key 驗證（TOFU）**；多台憑證為「共用帳密」、僅用於當次掃描、**絕不落地或寫入軌跡**。詳見 [安全性與環境變數](#安全性與環境變數)。

---

## 稽核項目

| # | 類別 | 查核項目 | 方式 |
|---|------|----------|------|
| 1 | 帳號與存取安全管理 | 使用個人專屬帳號登入電腦 | 自動 |
| 2 | 帳號與存取安全管理 | 未使用 Gmail 等私人信箱／雲端硬碟傳送或儲存公司資料 | 自動 |
| 3 | 帳號與存取安全管理 | 未將密碼明示或張貼於桌面、螢幕或周邊設備 | 手動 |
| 4 | 帳號與存取安全管理 | 公用區資料夾存取權限符合職務權責設定 | 自動 |
| 5 | 軟體安裝與使用合規 | 未自行安裝未經採購／授權之軟體（比對白名單） | 自動 |
| 6 | 軟體安裝與使用合規 | 未自行安裝未經核准之遠端連線、視訊或通訊軟體 | 自動 |
| 7 | 設備與周邊使用控管 | 未攜帶任何個人筆電、記憶卡、行動硬碟、USB 等入廠 | 手動 |
| 8 | 設備與周邊使用控管 | USB 連接埠已設定為封鎖或禁用 | 自動 |
| 9 | 設備與周邊使用控管 | 未使用 USB 連接埠作為充電用途 | 自動 |
| 10 | 設備與周邊使用控管 | 電腦無外接硬碟、磁碟機、行動電源等硬體 | 自動 |
| 11 | 其他 | 網頁瀏覽權限已關閉影音及社群網站 | 自動 |
| 12 | 其他 | 影印設為黑白；螢幕閒置逾 5 分鐘啟動螢幕保護 | 自動 |
| 13 | 軟體安裝與使用合規 | 一般使用者（非系統管理員）無自行安裝軟體之權限 | 自動 |

> **第 13 項**透過三個 Windows 訊號判定：本機 Administrators 群組的多餘成員（well-known SID `S-1-5-32-544`）、`AlwaysInstallElevated` 政策（HKLM + HKCU）、以及 UAC 設定（`EnableLUA`、`ConsentPromptBehaviorUser`）。

---

## 系統需求

- **稽核主機（執行 CheckPC 的電腦）**：Node.js 18+（開發另需 npm）。
- **目標 PC（被稽核的電腦）**：Windows 10／Server 2016 以上、PowerShell 5.1+；遠端掃描需啟用 OpenSSH Server。

---

## 專案結構

```
CheckPC/
├── electron/
│   └── main.js                 # Electron 主程序（啟動 Express、開視窗）
├── src/
│   ├── server.js               # Express 伺服器（預設綁 127.0.0.1:3001）
│   ├── routes/                 # API 路由：scan / batch / inventory / auditLog / audit / settings
│   ├── services/
│   │   ├── sshScanner.js       # ssh2 遠端掃描（SFTP 上傳 + 執行腳本）
│   │   ├── resultStore.js      # 掃描結果記憶體暫存（UUID + TTL）
│   │   ├── persistence.js      # 批次結果 / 軌跡 / 庫存的檔案存儲（CHECKPC_DATA）
│   │   └── hostKeys.js         # SSH host-key 釘選（known_hosts，TOFU）
│   └── scripts/
│       ├── CheckPC.ps1         # PowerShell 稽核腳本（產生 JSON）
│       ├── config.json         # 稽核政策（白名單／封鎖站／規則）
│       ├── Run_CheckPC.bat     # 目標機本機執行（自我提權）
│       ├── Install_OpenSSH.bat # 目標機安裝／啟用 OpenSSH Server
│       └── OpenSSH-Win64/      # 內附的 OpenSSH（供離線安裝）
├── frontend/                   # React + Vite 前端
│   ├── src/{pages,components,hooks,lib,layout}
│   └── dist/                   # 前端建置產物（由後端靜態服務）
├── deploy/                     # Windows 部署用 setup.bat / start.bat
├── build-deploy.sh             # 打包 Node 版部署包到 dist-deploy/
├── start.sh                    # macOS/Linux 啟動腳本
└── package.json

# 執行期可寫資料目錄（CHECKPC_DATA，預設 ./data；Electron 用 userData）
data/
├── batches/<id>.json           # 批次結果落地（不含密碼）
├── audit-log.jsonl             # 稽核軌跡（append-only）
├── inventory.json              # 主機清單庫存（不含密碼）
└── known_hosts.json            # SSH host-key 釘選
```

---

## 開發環境啟動

需同時啟動「後端」與「前端開發伺服器」（前端 Vite 會將 `/api` 代理到後端 3001）。

```bash
# 1) 安裝後端依賴
npm install

# 2) 安裝前端依賴
cd frontend && npm install && cd ..

# 3a) 啟動後端（埠 3001）
npm run dev          # node --watch src/server.js（自動重載）
# 或 npm start        # node src/server.js

# 3b) 另開一個終端機啟動前端開發伺服器（埠 5180）
cd frontend && npm run dev
```

開發時瀏覽 **http://localhost:5180** （前端 HMR，API 代理到 3001）。

### 以正式建置方式預覽

```bash
cd frontend && npm run build && cd ..   # 產生 frontend/dist
npm start                               # 後端同時服務前端：http://localhost:3001
```

---

## 建置與部署

### 1) Electron 桌面應用（Windows 可攜版 .exe）

```bash
cd frontend && npm run build && cd ..   # 先建置前端
npm run build:win                       # electron-builder → dist-electron/CheckPC.exe
# macOS：npm run build:mac
```

桌面版啟動時會自動以 in-process 方式啟動 Express（埠 3001）並開啟視窗。

### 2) Node 版部署包（不含 Electron，適合伺服器／內網）

```bash
./build-deploy.sh        # 產生 dist-deploy/CheckPC/
```

將 `dist-deploy/CheckPC/` 整個資料夾複製到目標 Windows，安裝 Node.js 後：

```bat
setup.bat   :: 首次安裝依賴
start.bat   :: 啟動伺服器，瀏覽 http://localhost:3001
```

---

## 使用方式

### A. 遠端 SSH 掃描

1. 於**目標 PC** 以系統管理員身分執行 `src/scripts/Install_OpenSSH.bat`，安裝並啟用 OpenSSH Server（開放 TCP 22）。
2. 於 CheckPC「掃描 → 遠端掃描」分頁輸入目標 IP、Port（預設 22）、Windows 帳密。
3. 系統透過 SSH 上傳 `CheckPC.ps1` 與 `config.json` 並執行，自動取回並顯示結果。

### B. 手動上傳

1. 於「掃描 → 手動上傳」分頁下載 `CheckPC.ps1` 與 `config.json`。
2. 於目標 PC 執行：
   ```powershell
   powershell -ExecutionPolicy Bypass -File CheckPC.ps1 > result.json
   ```
   （或直接執行 `Run_CheckPC.bat`，會自我提權並輸出 `result_<電腦名稱>.json`）
3. 回到 CheckPC 上傳該 JSON 檔或貼上內容，即可檢視稽核結果。

### C. 批次掃描

1. 各目標 PC 需如 A 啟用 OpenSSH Server。
2. 於「掃描 → 批次掃描」分頁：
   - 填入**共用帳號／密碼**（套用所有目標，個別列可覆寫）；可填「稽核人員（操作者）」記入軌跡。
   - 從**主機清單**勾選，或在貼上區每行一筆 `host[:port]`（兩者可併用、自動去重）。
   - 選擇並行數（1–8，預設 4），按「開始批次掃描」。
3. 結果表即時輪詢顯示逐台進度與狀態；成功列可「開啟稽核」進入單機稽核表單，或整批「**匯出總表**」。
4. 主機清單於「設定」維護；批次結果與軌跡落地於 `CHECKPC_DATA`，App 重開仍可回顧。

### 匯出與設定

- 於稽核表單頁可填寫基本資訊、手動調整各項判定，並 **匯出 Excel** 稽核單。
- 於「設定」頁可編輯核准軟體白名單、封鎖網站、遠端軟體關鍵字、資料夾規則（儲存至 `config.json`）。

---

## API 一覽

| Method | 路徑 | 說明 |
|--------|------|------|
| GET | `/api/health` | 健康檢查 |
| POST | `/api/scan/remote` | 遠端 SSH 掃描（body：`host, port?, username, password`） |
| GET | `/api/scan/results/:id` | 取回掃描結果快取 |
| POST | `/api/scan/batch` | 建立批次掃描（body：`targets[], concurrency?, operator?`）→ `202 {batchId,total}`，背景並行 |
| GET | `/api/scan/batch` | 列出批次摘要（記憶體 + 落地，新到舊） |
| GET | `/api/scan/batch/:batchId` | 批次進度／結果（**不含密碼**；記憶體找不到時讀落地檔） |
| GET | `/api/inventory` | 讀取主機清單（不含密碼） |
| PUT | `/api/inventory` | 覆寫主機清單（驗證並剔除憑證） |
| GET | `/api/audit-log` | 批次操作軌跡（`?limit=`，新到舊） |
| POST | `/api/audit/upload` | 上傳掃描 JSON（文字） |
| POST | `/api/audit/upload-file` | 上傳掃描 JSON 檔（自動偵測編碼） |
| GET | `/api/audit/script` | 下載 `CheckPC.ps1` |
| GET | `/api/audit/config` | 下載 `config.json` |
| GET | `/api/settings` | 讀取稽核政策 |
| PUT | `/api/settings` | 更新稽核政策 |

---

## 安全性與環境變數

CheckPC 設計為**內網／本機**使用的稽核工具，請留意：

- API 端點**無身分驗證**；Web 服務**預設僅綁 `127.0.0.1`**（本機），不對 LAN 開放。
- SSH 掃描採**密碼認證 + host-key 驗證（TOFU）**：首次連線釘選主機金鑰指紋，之後金鑰變更（可能 MITM）即拒絕。憑證以明文傳於請求、僅用於當次掃描，**不落地、不入軌跡**。請僅於受信任的內網使用。
- 主機清單與軌跡**只存主機資訊、不含任何帳密**。

### 環境變數

| 變數 | 預設 | 說明 |
|------|------|------|
| `PORT` | `3001` | 伺服器埠 |
| `HOST` | `127.0.0.1` | 綁定位址；設 `0.0.0.0` 才開放 LAN 存取（不建議） |
| `CHECKPC_DATA` | `./data`（Electron 為 userData） | 可寫資料目錄（批次／軌跡／庫存／known_hosts） |
| `CHECKPC_SSH_VERIFY` | （啟用） | 設 `false` 關閉 host-key 驗證（回到舊行為） |
| `CHECKPC_SSH_STRICT` | （TOFU） | 設 `true` 則未知主機一律拒絕（須先釘選）；TOFU 下若主機合法重裝，需清除 `known_hosts.json` 對應條目後重掃 |

---

## 授權

本專案目前未附帶開源授權條款（內部稽核工具）。如需開放，請於此補上授權聲明。
