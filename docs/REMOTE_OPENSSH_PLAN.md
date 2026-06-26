# 設計文件：遠端啟用 OpenSSH Server（批次／單點）

> CheckPC 內網稽核工具 — 新增功能設計提案
> 狀態：待審 · 推薦方案：**WMI/DCOM + schtasks 雙觸發、SMB 推送、無代理（agentless）、重用批次基礎建設**

---

## 1. 背景與問題

CheckPC 的遠端掃描（`遠端掃描 (SSH)` 與 `批次掃描` 分頁）都建立在一個前提上：**目標 PC 已啟用 OpenSSH Server**。實務上絕大多數桌面版 Windows 11 預設沒有 sshd，稽核員必須**親自走到每一台機器**、以系統管理員身分手動執行 `src/scripts/Install_OpenSSH.bat`，才能讓那台機器進入可被掃描的狀態。在數十台規模下，這個「第一哩路」非常繁瑣，且與工具「集中、批次、可稽核」的定位矛盾。

本功能要把「啟用 OpenSSH」本身也變成一個**集中、可批次、有軌跡**的動作：稽核員在管理機上一次選好目標、輸入 admin 帳密，系統就把每一台從「無遠端」變成「有 SSH」，之後即可回到既有掃描流程。

**「先有雞或先有蛋」的 bootstrap 問題**：要遠端對一台機器做事，最乾淨的路是 PowerShell Remoting（`Invoke-Command`），但它依賴 **WinRM**，而**桌面版 Win11 的 WinRM 服務預設是關閉的**。換言之，「啟用遠端能力」這件事本身不能假設遠端能力已存在。本設計的核心，就是只用**預設 Win11 仍可能開放、且不需 WinRM** 的內建遠端通道（SMB/445 系統管理共用 + RPC/135 DCOM-WMI）來打破這個僵局。

---

## 2. 目標與非目標（Scope）

**目標（In Scope）**

- 在 `ScanPage` 上方新增「**啟用 OpenSSH**」分頁，支援**單點**與**批次**（單點 = 批次大小 1，共用同一條後端管線）。
- 後端在 Windows 管理機上 shell out 呼叫**內建遠端工具**，把內附的離線 OpenSSH 包推到目標並以 SYSTEM 安裝、啟動、設開機自啟、開防火牆 TCP 22。
- 自動探測每台可用通道，選擇可行的觸發方式；無通道者標記 `blocked` 並提示走 GPO/實體，**不中斷整批**。
- 主動驗證 sshd 真的起來（輪詢 TCP 22 + SSH banner）。
- 重用既有批次基礎建設（worker-pool、進度模型、落地、audit-log、輪詢 UI）。
- 憑證紀律與既有掃描一致：密碼只活在請求期間、絕不落地、不入軌跡。

**非目標（Out of Scope，本期不做）**

- **不**改走 WinRM/PSRemoting（前提即為 WinRM 關閉）。
- **不**散布 PsExec.exe（Sysinternals 再散布授權限制）；只用 Windows 內建工具。
- **不**自建長期常駐代理（agent）。OpenSSH 一旦啟用，後續維運一律回到既有 ssh2 掃描路徑。
- **不**在本期實作 GPO/Intune 資產產生器（列為 Open Question / 後續）。
- **不**承諾在「防火牆把 445 與 135 都擋掉」的機器上能即時啟用 —— 那種機器只能靠 GPO/實體，UI 會明確標示。
- **停用／移除 OpenSSH 的反向動作**列為 Open Question（見 §9）。
- macOS 管理機**不支援**即時啟用（內建工具不存在），僅供開發期 mock。

---

## 3. 可用遠端通道與前提

### 3.1 通道比較

| 通道 | 連接埠 | 機制 | 預設 Win11 桌面可用性 | 在本設計的角色 |
|---|---|---|---|---|
| **SMB / 系統管理共用** | TCP 445 | `net use \\host\C$` + `robocopy` 推檔；`sc.exe \\host`（SVCCTL）建服務 | 視防火牆設定檔。Domain/已設 GPO 常開；純工作群組/公用網路常擋入站 | **檔案推送的必要通道**（無替代）；亦可作服務觸發備援 |
| **RPC / DCOM-WMI** | TCP 135 + 動態埠 | `New-CimSession -Protocol Dcom` → `Invoke-CimMethod Win32_Process Create`，**不需 WinRM** | 同上，視防火牆。常與 445 一起開或一起關 | **首選觸發通道**（行為較不像建服務） |
| **遠端排程 schtasks** | 走 RPC(135)+SMB(445) | `schtasks /s host /ru SYSTEM` 建一次性任務並 `/run` | 需 445+135 皆可達 | **備援觸發通道** |
| WinRM / PSRemoting | 5985/5986 | `Invoke-Command` | **預設關閉** —— 本功能要解決的對象 | 不使用 |
| RDP | 3389 | 互動桌面 | 預設關閉 | 不使用（探測時僅順帶記錄供 UI 顯示） |

> **誠實前提**：在「真·預設 Win11 桌面 + 工作群組」上，445/135 入站很可能**雙雙被防火牆擋下**，該台會落到 `blocked`。本功能在「已加入網域 / 已用 GPO 開放檔案與印表機共用＋WMI」的環境最可靠；在純工作群組桌面成功率有限。這是現實邊界，UI 與文件須據此管理期望。

### 3.2 自動探測順序（probe-then-act）

每台主機在啟用前先跑輕量探測（只測連通與認證，**不改目標狀態**）：

1. **SMB/445**：TCP 連通 → `net use \\host\IPC$ /user:<DOMAIN\user> <pwd>` 認證測試。失敗 → 整台無法推檔 → `blocked`（445 是檔案推送的必要通道）。
2. **RPC/135**：TCP 連通 → `New-CimSession -ComputerName host -Credential -Protocol Dcom` 建會話測試。成功 → 觸發走 **WMI**（首選）。
3. **135 不通但 445 通** → 觸發退而求其次走 **schtasks**（注意：schtasks 仍需 135，若兩者皆不可達則此退路不成立 → 仍 `blocked`）；最後備援為 **sc.exe 建服務**（行為最像橫向移動，列為最後手段，見 §6）。
4. 445 與 135 **皆不可達** → `channel: 'none'`、`status: 'blocked'`，訊息提示需 GPO/實體/主控台。

探測結果（`canSmb` / `canRpc` / 選定 `channel`）只記在**記憶體 job**，不落地、不含密碼。

---

## 4. 方案比較與推薦

三個候選方案的評審評分如下（五項，各 5 分，總分 25）：

| 方案 | win11 相容 | 工時（逆） | 健壯性 | 安全 | UX | **總分** |
|---|---|---|---|---|---|---|
| 1 — 多觸發（schtasks/sc/WMI），**sc 服務為首選** | 2 | 2 | 2 | 3 | 4 | **13** |
| 2 — **CIM/WMI over DCOM 為核心**、schtasks 退路 | 2 | 3 | 2 | **4** | 4 | **15** |
| 3 — Agentless 內建通道 **+ 企業推送雙軌（GPO/Intune）** | 2 | 2 | 2 | 3 | 4 | **13** |

### 推薦：以**方案 2 為主幹**，吸收方案 1/3 的若干修正

三方案在 `win11Fit` 與 `robustness` 同分（皆受「預設防火牆可能擋 445/135」與「sc/WMI 觸發像橫向移動」這兩個共同天花板限制），勝負落在**工程乾淨度與安全姿態**。方案 2 勝出的理由：

- **觸發機制最乾淨**：以 **WMI/DCOM (`Win32_Process.Create`)** 為首選，而非「遠端建服務（`sc.exe \\host create`）」。後者是 PsExec 的底層機制、也是 EDR 判定橫向移動最強的指紋之一；把它**降為最後備援**而非首選（方案 1 的主要扣分點）。
- **安全評分最高（4/5）**：明確讓密碼走子行程 **stdin / `-Credential` 物件**而非命令列 argv，並指出 schtasks `/p` 會把密碼放進 argv 的風險。
- **不過度承諾**：方案 3 的「雙軌 + GPO/Intune 資產產生器」雖務實，但會把工時拉到 L 且本質是「腳本產生器」，超出本期 in-app 即時啟用的核心訴求 —— 我們把它收斂為 **Open Question / 後續迭代**，本期不做。

**從方案 1/3 吸收的修正**（融合）：

- 採方案 3 的 **TCP22 + `SSH-` banner 前綴**作為權威驗證信號（排除「埠被別的東西占用」誤判），優於只看埠是否開。
- 採方案 1/2 一致確認的**前置阻斷項**：必須先寫**離線版安裝腳本**（見 §5.1），因為現有 `Install_OpenSSH.bat` 硬依賴不存在的 zip。
- 保留 **schtasks 作為 WMI 失敗時的備援**，但在文件與 UI 明示其 `/p` 密碼會出現在目標端 argv，列為已知取捨。

---

## 5. 詳細設計（推薦方案）

### 5.0 前置阻斷項（必須先解）— 已查證

倉庫實況（已確認）：`src/scripts/` 下有**已解壓**的 `OpenSSH-Win64/`（含 `sshd.exe`、`install-sshd.ps1` 等完整 binary），但**沒有** `OpenSSH-Win64.zip`。而現有 `Install_OpenSSH.bat`：

- **第 26 行**硬性要求 `%~dp0OpenSSH-Win64.zip` 存在，否則 `exit /b 1`；
- **第 38–39 行**走 `Expand-Archive` 解壓該 zip；
- **第 7–12 行**自我 UAC 提權（`Start-Process -Verb RunAs`）；**第 34/78 行**有 `pause`。

→ **直接遠端沿用這支 bat 必然失敗**（找不到 zip）且不適合無人值守（pause/互動式提權）。因此必須新增一支離線、無人值守版安裝腳本（§5.1 的 `Install_OpenSSH_Remote.ps1`）。**這是整個功能的第一個里程碑（M1），其餘工作都依賴它。**

### 5.1 每台主機流程

```
探測通道 (probeChannels)
   └─ 445 認證成功？ 否 → blocked
   └─ 135 可達？     是 → channel='wmi'(首選)  否 → channel='schtasks'(需135)/sc(最後手段)
        │
SMB 認證複製 (net use \\host\C$ + robocopy)
   └─ 推送 OpenSSH-Win64\ + Install_OpenSSH_Remote.ps1 → \\host\C$\Windows\Temp\CheckPC_SSH\
        │
遠端以 SYSTEM 觸發安裝 (擇優 + 失敗降級)
   ├─ WMI:  New-CimSession(Dcom) → Invoke-CimMethod Win32_Process Create 跑 powershell -File ...ps1
   ├─ schtasks: /create /ru SYSTEM ... → /run → /delete
   └─ sc(最後備援): sc \\host create ... → start → delete
        │   (安裝腳本: xcopy OpenSSH-Win64 → C:\Program Files\OpenSSH → install-sshd.ps1
        │    → netsh 開 TCP22 → net start sshd → sc config sshd start=auto → 寫 done.flag)
        │
驗證 (pollPort22)
   └─ 每 2s net.connect(host,22) 讀首封包，收到 'SSH-' 前綴 → success（記 sshVersion）
   └─ 90s 逾時但埠開 → partial；埠仍關 → error(install_failed/firewall)
        │
清理 (best-effort)
   └─ net use \\host\C$ /delete；遠端刪暫存夾與臨時服務/排程（失敗只記 warning，不影響判定）
```

**新安裝腳本 `Install_OpenSSH_Remote.ps1` 要點**：消費**已解壓的** `OpenSSH-Win64\` 子夾（跳過 `Expand-Archive`、不需 zip、不需連網）；移除 `pause` 與 UAC 自提權（由 SYSTEM 觸發，天然 elevated）；冪等（已裝則只啟動）；把每步結果寫入 `C:\Windows\Temp\CheckPC_SSH\setup.log`，最後寫 `done.flag`。

### 5.2 資料結構（password-free，鏡像 `batch.js`）

```jsonc
// enableJob（記憶體，沿用 batch.js job 形狀，絕不含密碼）
{
  "id": "<uuid>", "kind": "ssh_enable", "createdAt": 0, "operator": "?",
  "status": "running|done", "total": 0, "concurrency": 4,
  "counts": { "pending": 0, "running": 0, "success": 0, "error": 0, "blocked": 0, "partial": 0 },
  "results": [ /* enableResult[] */ ]
}

// enableResult（每台，password-free）
{
  "index": 0, "host": "192.168.1.10", "port": 22,
  "status": "pending|probing|copying|triggering|verifying|success|partial|blocked|error",
  "channel": null,            // 'wmi' | 'schtasks' | 'sc' | 'none'
  "phase": null,              // 供 UI 顯示「複製中/觸發中/驗證中」
  "sshVersion": null,         // 成功時記錄偵測到的 banner，如 SSH-2.0-OpenSSH_for_Windows_x.x
  "error": null,              // { type, message }
  "startedAt": null, "finishedAt": null
}
```

**錯誤分類**（擴充 `batch.js` 既有 `classifyError` 詞表）：`auth`（net use/憑證失敗）、`smb_denied`（C$ 拒絕 / UAC remote restriction）、`no_channel`/`blocked`（445+135 皆不可達）、`copy_failed`（robocopy 退出碼 ≥8）、`trigger_failed`（wmi/schtasks/sc 全失敗）、`install_failed`（埠未開）、`firewall`（服務起但 22 不通）、`verify_timeout`、`error`。

**落地**：完成時 `persistence.saveBatch(jobView)` → `data/batches/<uuid>.json`，加 `kind:'ssh_enable'` 區隔掃描批次；沿用既有 `UUID_RE` 命名與 path-traversal 防護。**僅存 password-free 視圖。**

**audit-log.jsonl**：`persistence.appendAuditLog({ ts, operator, action:'ssh_enable', batchId, total, success, failed, blocked, hosts:[{host,status,channel}] })` —— 只記主機 + 動作 + 結果 + 通道，**無任何憑證**。

### 5.3 API 端點

掛載於 `server.js`：`app.use('/api/ssh-enable/batch', sshEnableRoutes)` **置於** `/api/ssh-enable` **之前**（對齊既有「更具體路由先掛」慣例）。

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/ssh-enable` | `{ targets:[{host,port?,username,password}], concurrency?, operator?, channel?:'auto'|'wmi'|'schtasks' }`（單點 = `targets` 長度 1）。驗證沿用 `batch.js`：`MAX_TARGETS=50`、port 範圍、必填 host/username/password | `202 { batchId, total }`，背景以 worker-pool 執行；密碼只活在請求閉包 |
| `GET` | `/api/ssh-enable` | — | 啟用作業摘要陣列（記憶體 + `persistence.listBatches()` 過濾 `kind==='ssh_enable'`，去重、新到舊） |
| `GET` | `/api/ssh-enable/:batchId` | — | 進度／結果（記憶體優先，否則 `persistence.loadBatch`，password-free）。形狀與 `/api/scan/batch/:id` 一致，可直接餵輪詢表 |
| `POST` | `/api/ssh-enable/probe`（可選） | `{ targets:[{host}], username, password }` | 每台 `{host, channel, canSmb, canRpc, canRdp }`，給 UI「預檢通道」按鈕；密碼即用即丟 |

> 安全：沿用 `server.js` 既有 **`HOST=127.0.0.1` loopback 預設**，API 不開放到 LAN（見 §6）。

### 5.4 UI（ScanPage 新增分頁）

- 在 `ScanPage.jsx` 既有 tab 列（`remote` / `manual` / `batch`）**新增第 4 個分頁**「啟用 OpenSSH」（`tab==='ssh-enable'`），沿用既有 active 樣式（`bg-white shadow text-primary`）與 `PageCard` 容器。
- 分頁內以 `batchId` 狀態切換（鏡像既有 batch 分頁）：未建立 → `SshEnableForm`；已建立 → `SshEnableResultsTable`。
- **`SshEnableForm.jsx`**（以 `BatchScanForm.jsx` 為藍本）：共用 admin 帳密 + inventory 多選 + 貼上 host + 並行數 + operator + `buildTargets` 去重邏輯。差異：帳密標籤改「**管理員帳號（可含網域 `DOMAIN\user`）**」「管理員密碼」；新增「**通道**」下拉（自動 / WMI / schtasks）；強化既有黃色警示框 —— 明示「將以系統管理共用複製檔案並以 **SYSTEM** 執行安裝、屬標準端點管理、密碼僅本次使用、不落地不入軌跡、需 445 或 135 其一可達」。單點 = 填一台。提交打 `POST /api/ssh-enable`。
- **`SshEnableResultsTable.jsx`**（以 `BatchResultsTable.jsx` 為藍本）：**直接重用 `useBatchPoll`**（指向 `/ssh-enable/`，見下）+ 進度條 + counts。`STATUS` map 擴充 `probing`/`copying`/`triggering`/`verifying`/`partial`/`blocked` 的圖示與顏色；每列顯示 `host`、status、**通道（WMI/排程）**、目前 `phase`；成功列顯示偵測到的 `sshVersion` 與「**前往遠端掃描**」（帶入該 host 切到 `remote` 分頁，形成「啟用→掃描」動線）；`blocked` 列提示需 GPO/實體；失敗列顯示分類訊息。**移除**「開啟稽核 / 匯出總表」（本功能不產掃描結果）。
- **`useBatchPoll`** 加一個可選 `basePath` 參數（預設維持 `/scan/batch/` 以**不影響現有呼叫**），`SshEnableResultsTable` 傳入 `/ssh-enable/`。`status:'done'` 仍為停止輪詢條件。

### 5.5 檔案清單

**重用（不改或極小改動）**

| 檔案 | 重用內容 |
|---|---|
| `src/routes/batch.js` | worker-pool（`runBatch` 的 cursor/worker/`Promise.allSettled`）、`normPort`、`classifyError`、`MAX_TARGETS`/`MAX_CONCURRENCY`/`DEFAULT_CONCURRENCY`、`jobView`/`jobSummary`、`enforceMaxJobs`、TTL cleanup、202 模式 —— 作為新 `sshEnable.js` 的藍本 |
| `src/services/persistence.js` | `saveBatch`/`loadBatch`/`listBatches`/`appendAuditLog`（以 `kind` 區隔），原樣 |
| `src/services/resultStore.js` | `newId()`（uuid，與 `UUID_RE` 落地校驗相容） |
| `src/routes/inventory.js` + `data/inventory.json` | 主機清單（不含密碼）→ 啟用表單挑機 |
| `src/server.js` | 路由掛載點（新增一行 `app.use`）、`CHECKPC_ROOT`/`CHECKPC_DATA` 解析、`HOST=127.0.0.1` |
| `src/services/sshScanner.js` + `hostKeys.js` | （可選）啟用成功後做一次 SSH noop 二段確認，順帶讓 TOFU 釘選指紋，把啟用接回既有掃描信任鏈 |
| `frontend/src/hooks/useBatchPoll.js` | 輪詢（加可選 `basePath`） |
| `frontend/src/components/BatchScanForm.jsx`、`BatchResultsTable.jsx` | 新 UI 元件藍本 |
| `frontend/src/pages/ScanPage.jsx` | 新增第 4 分頁 |
| `frontend/src/lib/api.js` | `api.get`/`post` |
| `src/scripts/OpenSSH-Win64/`（含 `install-sshd.ps1`） | 離線安裝包來源，robocopy 推送內容 |

**新增**

| 檔案 | 職責 |
|---|---|
| `src/services/winRemote.js` | 內建工具薄封裝層：`probeChannels`、`netUse`/`netUseDelete`、`robocopyPush`、`triggerViaWmi`/`ViaSchtasks`/`ViaSc`、`verifyTcp22`、`queryService`。全部以 `child_process.execFile`（**陣列參數，非字串拼接**）shell out；單一 `winExec` 介面集中逾時/退出碼/**密碼遮蔽**，便於 mac 以 mock 注入 |
| `src/services/sshEnabler.js` | 單台編排 `enableSsh({host,port,username,password,channel})`：probe→netUse→robocopyPush→trigger（擇優+降級）→pollPort22→cleanup，回傳 `enableResult`（password-free）。對應 `sshScanner.remoteScan` 的角色 |
| `src/routes/sshEnable.js` | REST + worker-pool（複用 `batch.js` 模式），呼叫 `sshEnabler` 並 `persistence` 落地/軌跡 |
| `src/scripts/Install_OpenSSH_Remote.ps1` | 離線/無人值守安裝腳本（§5.1） |
| `frontend/src/components/SshEnableForm.jsx` / `SshEnableResultsTable.jsx` | 新 UI（藍本見 §5.4） |
| `test/winRemote.mock.test.js`、`sshEnabler.mock.test.js`、`sshEnable.route.test.js` | mock child_process 驗證命令組裝/輸出解析/落地與軌跡 password-free（mac 可跑；需先引入輕量 runner，見 §7） |

### 5.6 如何重用 `batch.js` 的 worker-pool

`sshEnable.js` 幾乎是 `batch.js` 的孿生：保留固定大小 worker-pool（`cursor++` 取下一台、`Promise.allSettled`、失敗只標該台不中斷整批）、`counts` 進度模型、`jobView`/`jobSummary`、`enforceMaxJobs`、TTL+`unref` timer、POST 驗證與 202 回應、GET 列表/詳情。**唯一替換的是 per-host action**：把 `runBatch` 內的 `remoteScan(...)` + `saveScanResult(...)` 換成 `sshEnabler.enableSsh(...)` + 寫 `enableResult`。`counts` 擴充 `blocked`/`partial` 兩個計數。為避免複製整支檔案造成維護分歧，可把 worker-pool 抽到共用 `lib/workerPool.js`（次要重構，非必要）。

---

## 6. 憑證與安全

**憑證處置（沿用既有鐵律，延伸到新通道）**

- admin（可能是**網域管理員**）密碼**只活在請求期間的 `targets` 閉包**；**絕不**寫入 job/results/落地檔/audit-log/setup.log。
- 一律以 `execFile`（**陣列參數**）呼叫內建工具，避免字串拼接落入 shell 歷史。密碼優先走子行程 **stdin / PowerShell `-Credential` 物件**，**不進 argv**。
- `winRemote` 的 `winExec` 對 log 做密碼遮蔽；route 測試須**主動斷言** `data/batches/*.json` 與 `audit-log.jsonl` 不含密碼。
- 已知取捨：**`schtasks /p <pwd>` 會把密碼放進目標端 argv**（其他本機程序可由 `Win32_Process` 讀到），與「密碼不進 argv」原則衝突 → 因此 schtasks 僅為**備援**，文件明示此風險；首選 **WMI**（`-Credential` 物件）無此問題。
- **網域管理員憑證撒到大量端點**本身是安全姿態問題：建議在環境允許時改用**專用維運服務帳號 / LAPS**，而非到處用 DA；列為 Open Question。

**軌跡**：`audit-log.jsonl` 只記主機 + 動作（`ssh_enable`）+ 結果 + 通道，無憑證。

**API 防護**：沿用 `server.js` 既有 **`HOST=127.0.0.1` loopback 預設**，把這個威力更大的端點（能遠端以 SYSTEM 執行）擋在 LAN 之外；文件強調**勿設 `HOST=0.0.0.0`**。

**Defender / EDR — 橫向移動指紋（必讀）**

「遠端 `net use C$` + 推 exe 到 `Windows\Temp` + 以 SYSTEM 觸發安裝」是 PsExec 系橫向移動的教科書行為（ATT&CK T1021/T1543/T1047）。EDR 攔截的是**行為樣式**而非二進位名稱，故「用內建 sc.exe 而非 PsExec」不會免於告警。緩解與設計取捨：

- **觸發順序刻意排序以降低告警面**：**WMI (`Win32_Process.Create`) / schtasks 為首選**，**遠端建服務（`sc.exe \\host create`）降為最後備援** —— 後者是最強的橫向移動指紋。
- **清楚命名**所有暫存物（`CheckPC_SSH`、任務名 `CheckPC_SSHSetup`），便於 SOC 辨識為授權維運而非攻擊。
- **文件化授權用途**：本功能是對自有資產的標準端點管理，建議在部署環境的 EDR 加白名單（管理機 IP / 腳本路徑）。
- 把「**被 EDR 當攻擊攔截**」列為**一級風險**：受控企業環境須先在目標 EDR 上驗證觸發是否被靜默擋下（失敗訊號未必是乾淨的退出碼，`verify` 須對此容錯）。

**工作群組 UAC remote restriction**：純工作群組機器的本機 admin 經網路會被 `LocalAccountTokenFilterPolicy` 降權，導致 C$ 寫入 / sc / schtasks 被 `ACCESS_DENIED`（分類為 `smb_denied`/`auth`）。緩解：使用網域帳號、內建 Administrator，或預設該註冊表 —— 列為**已知限制**，UI 明確提示以免誤判為帳密錯。

---

## 7. 分階段實作計畫

| 里程碑 | 內容 | 可獨立交付/驗證 |
|---|---|---|
| **M1 — 離線安裝腳本（前置阻斷項）** | 新增 `Install_OpenSSH_Remote.ps1`：去 zip、去 pause、去 UAC 自提權、直接 xcopy 已解壓的 `OpenSSH-Win64\` → install-sshd.ps1 → netsh 開 22 → 啟動 → 自啟 → 寫 setup.log/done.flag。冪等 | **Windows 管理機本機**手動跑通無人值守安裝（先不談遠端） |
| **M2 — `winRemote.js` 封裝層** | 以 `execFile` 包 net use/robocopy/WMI/schtasks/sc/verifyTcp22/queryService，單一 `winExec` 介面，集中逾時/退出碼/密碼遮蔽 | **mac mock**：命令字串組裝、UNC/路徑組裝、退出碼分類、輸出解析、密碼不入 log |
| **M3 — `sshEnabler.js` 單台編排** | probe→netUse→robocopy→trigger（WMI 首選、降級 schtasks/sc）→pollPort22（等 `SSH-` banner）→cleanup | **mac mock**：happy-path + 各失敗分支 + 通道降級 + phase 轉移 |
| **M4 — `routes/sshEnable.js` + 掛載** | 複用 `batch.js` worker-pool/驗證/TTL；接 `persistence` 落地與 audit-log；掛 `/api/ssh-enable`(+`/batch`/`/probe`) | **mac mock exec**：端到端編排、202+輪詢、進度模型、落地與軌跡**斷言無密碼** |
| **M5 — 前端分頁** | ScanPage 第 4 分頁；`SshEnableForm`/`SshEnableResultsTable`；`useBatchPoll` 加 `basePath` | **mac 合成資料**：單點/批次 UI、進度條、中間態、`blocked`/`partial` 顯示 |
| **M6 — Windows 實機驗證（必須）** | Windows 管理機 + 一台預設 Win11(WinRM 關) 目標，逐一驗證 WMI / schtasks / sc 三觸發、SMB 推送、SYSTEM 執行、TCP22 上線、清理；測**網域 admin** 與**工作群組 admin** 兩情境；測 **Defender 開啟**下是否被攔 | 真實環境通過/失敗矩陣 |
| **M7 — 強化與文件** | 通道探測快取、部分防火牆情境（445 通 135 擋等）、`blocked` 主機文件指引（GPO/實體）、README 與安全聲明、audit-log 欄位定案、(可選) SSH noop 二段確認接 TOFU | 文件與邊界情境完備 |

> **測試基建**：倉庫目前**無測試框架**（`package.json` 無 test script、無 jest/mocha/vitest）。M2 同時引入輕量 runner（建議內建 `node:test`，零相依）+ `CHECKPC_DATA` temp dir 機制，列入工時。

**工時估計**：中等偏大。後端編排/路由因高度複用 `batch.js`/`persistence` 而快（約 2 天）；`winRemote` 三通道 + 離線腳本因需謹慎處理憑證與退出碼（約 2 天）；前端複製改寫（約 1 天）；引入 runner + mac mock 測試（約 0.5–1 天）。**真正的不確定性集中在 M6**（三通道相容性、工作群組 UAC、防火牆、EDR），需獨立預留 **1–2 天**且依賴一台可用 Win11 目標 —— M1–M5 全綠**不能**證明在預設 Win11 可用，故建議把 M6 的**最小通道實測前移為可行性閘門**（先用最小腳本確認三通道是否真能在目標環境打通，再投入完整骨架）。

---

## 8. 驗證策略

| 可在 **macOS 開發機**驗證（mock / 合成） | 必須在 **Windows 管理機 + Win11 目標**實測 |
|---|---|
| `winRemote` 命令字串組裝（net use/robocopy/WMI/schtasks/sc 參數正確） | 三觸發通道真實行為（WMI Win32_Process.Create **確認不需 WinRM**、schtasks、sc）|
| UNC / 路徑組裝（`\\host\C$\Windows\Temp\CheckPC_SSH`） | SMB 系統管理共用實際可寫、robocopy 退出碼語意 |
| 退出碼分類、英文錯誤訊息 → `error.type` 映射（以合成輸出） | 以 SYSTEM 執行 `install-sshd.ps1` 每步是否成功（ACL/防火牆/服務註冊） |
| `sshEnabler` 編排：phase 轉移、通道降級、失敗隔離 | TCP22 真的上線 + `SSH-` banner、`sc query sshd` RUNNING |
| 進度模型、202+輪詢、`status:'done'` 停止 | **工作群組** UAC remote restriction 對本機 admin 的影響 |
| 落地檔 + audit-log **斷言 password-free** | **預設防火牆** profile 是否擋 445/135（核心可行性） |
| 前端 UI（合成 job：各 status/phase/channel）、進度條、`blocked`/`partial` 呈現 | **Defender/EDR** 開啟下觸發是否被攔截/告警 |
| `Install_OpenSSH_Remote.ps1` 邏輯靜態審閱 | 清理乾淨、冪等（對已裝機器重跑）、(可選) SSH noop + TOFU 釘選 |

> **根本限制**：所有 `win11Fit` / `robustness` 的真實答案都在 macOS 碰不到的地方。M1–M5 的 mock/合成測試只保證**編排邏輯與解析正確**，**不**保證功能在預設 Win11 跑得起來 —— 這是 M6 不可省略且需前移為閘門的原因。

---

## 9. 待決問題（Open Questions）

1. **目標環境的防火牆現況**：環境中桌面 Win11 的 **SMB/445** 或 **RPC/135** 入站是否已對管理機開放（透過 GPO 或本機規則）？若兩者皆預設擋下，本功能在那些機器只能 `blocked`，是否可接受？
2. **是否願意改走更乾淨的路線？** 若環境本就由 GPO 管理，是否願意**一次用 GPO 啟用 WinRM**（或直接用 GPO 啟動腳本/Intune 推 OpenSSH）？在受控環境，GPO/Intune 推送**反而最穩、不觸發橫向移動告警** —— 若可行，本 agentless 即時啟用可降為「非受控/小型網段」的次要選項（對應方案 3 的雙軌構想，本期未做）。
3. **觸發通道偏好**：是否接受用內建 **`sc`/`schtasks`/WMI** 觸發（會被 EDR 視為橫向移動行為）？或要求只走 WMI、完全不碰建服務？目標環境的 **EDR 是否需要先加白名單**？
4. **憑證模型**：是否能提供**專用維運服務帳號 / LAPS**，而非到處使用網域管理員帳密？這會大幅改善安全姿態。
5. **反向動作**：是否需要「**停用 / 移除 OpenSSH**」的反向功能（停服務、移防火牆規則、`uninstall-sshd.ps1`、刪 `C:\Program Files\OpenSSH`）？倉庫已附 `OpenSSH-Win64/uninstall-sshd.ps1`，可作為後續迭代。
6. **企業資產產生器（後續）**：是否需要在 `blocked` 情境下一鍵產出 **GPO 啟動腳本 / Intune Win32 / PsExec one-liner**（不含密碼）交給管理員用既有管道推送？（方案 3 的軌道 B，本期 Out of Scope）

---

**附：本文已查證的關鍵事實**

- `src/scripts/OpenSSH-Win64/` 確含 `sshd.exe`、`install-sshd.ps1`、`uninstall-sshd.ps1` 等完整 binary；**無** `OpenSSH-Win64.zip`。
- `Install_OpenSSH.bat`：第 26 行硬要求 zip；第 38–39 行 `Expand-Archive`；第 7–12 行 UAC 自提權；第 34/78 行 `pause` → 不可遠端無人值守沿用。
- `batch.js` worker-pool/`classifyError`/`jobView`/`jobSummary`/TTL/202、`persistence` 的 `saveBatch`/`appendAuditLog`/`UUID_RE`、`useBatchPoll`（停止條件 `status:'done'`）、`ScanPage` 三分頁模式、`server.js` 的「具體路由先掛」與 `HOST=127.0.0.1` 預設 —— 全部存在且可如本文所述重用。
