# 部署指南：以 Git 安裝並可透過 GitHub 更新（Windows）

這是推薦給「裝在其他 Windows 電腦、且要能隨時更新到 GitHub 最新版」的部署方式。
作法是把 repo `git clone` 到目標管理機，之後用 `update.bat` 一鍵 `git pull` + 重建。

> 觀念提醒：CheckPC 只需裝在**你稽核用的 Windows 管理機**上，不是每台被稽核的電腦都要裝。

---

## 前置需求（管理機）

- [Git for Windows](https://git-scm.com)
- [Node.js 18+](https://nodejs.org)

## 首次安裝

> 💡 **PowerShell 使用者請加 `.\` 前綴**（如 `.\update.bat`）。PowerShell 預設不執行當前資料夾的腳本；`.\` 寫法在 PowerShell 與 cmd.exe 都可用。

```powershell
git clone https://github.com/Paul-Lee-TW/CheckPC.git
cd CheckPC
.\update.bat
.\start.bat
```

- `.\update.bat`：`git pull` → 後端 `npm install` → 前端 `npm install` + `npm run build`（首次無更新可拉，但會完成安裝與建置）。
- `.\start.bat`：啟動伺服器，瀏覽器開 http://localhost:3001。

## 更新到最新版

```powershell
cd CheckPC
.\update.bat      # 拉取最新程式 + 重新安裝/建置
.\start.bat       # 重新啟動
```

`update.bat` 用 `git pull --ff-only`；若失敗通常是該資料夾有本機修改或切到別的分支，請確認在 `main` 分支且無未提交變更。

---

## 資料與設定會保留

執行期資料都放在 `data/`（已被 `.gitignore`，**`git pull` 不會動到**），所以更新後設定、主機清單、歷史都還在：

```
data/
├── config.json       # 稽核政策（設定頁存這裡；首次從內建範本 seed）
├── inventory.json    # 主機清單庫存（不含密碼）
├── batches/          # 批次掃描結果
├── audit-log.jsonl   # 稽核軌跡
└── known_hosts.json  # SSH host-key 釘選
```

> 預設資料目錄為專案下的 `./data`。如要改放他處，設環境變數 `CHECKPC_DATA`（例如指向使用者設定檔夾）。

---

## 環境變數（選用）

| 變數 | 預設 | 說明 |
|------|------|------|
| `PORT` | `3001` | 伺服器埠 |
| `HOST` | `127.0.0.1` | 綁定位址；設 `0.0.0.0` 才開放 LAN（不建議） |
| `CHECKPC_DATA` | `./data` | 可寫資料目錄 |

啟動前設定，例如：
- PowerShell：`$env:PORT=4000; .\start.bat`
- cmd.exe：`set PORT=4000 && start.bat`

---

## 關於「遠端啟用 OpenSSH」腳本

`src/scripts/Enable-OpenSSH-Remote.ps1` 與 `Install_OpenSSH_Remote.ps1` 需要本機有
`src/scripts/OpenSSH-Win64/`（離線 OpenSSH 包）。該資料夾因體積較大而被 `.gitignore`，
clone 後不會帶 —— 但 **`update.bat` 會在偵測到它缺少時，自動從官方
[Win32-OpenSSH](https://github.com/PowerShell/Win32-OpenSSH/releases) release 下載並解壓**
（走 HTTPS，並印出 SHA256 供核對）。所以一般情況 clone + `.\update.bat` 後即可用。

需要手動或指定版本時：
```powershell
.\src\scripts\Get-OpenSSH.ps1                         # 抓 latest
.\src\scripts\Get-OpenSSH.ps1 -Version 10.0.0.0p2-Preview -Sha256 <hash>   # 指定版本並驗證
```

> 一般「遠端 SSH 掃描」功能**不需要**這個資料夾；只有「遠端啟用 OpenSSH」用得到。
> 若下載失敗（例如離線環境），`update.bat` 只會警告、不中斷；掃描功能照常。

---

## 現場單機一鍵設定（工作群組／無法遠端時）

當目標機是**工作群組**、或遠端啟用卡在 UAC／帳號（`存取被拒`）時，最省事的是直接到該機本機跑一次設定，使其可被掃描。

腳本：`src/scripts/Setup-CheckPC-Target.bat`（畫面訊息為英文，避免各語系主機亂碼）。

**作法**
1. 在管理機先確保有 OpenSSH 包：`.\update.bat` 或 `.\src\scripts\Get-OpenSSH.ps1`（會下載到 `src/scripts/OpenSSH-Win64/`）。
2. 把 **`src/scripts` 整個資料夾**複製到 USB（需含 `OpenSSH-Win64/`、`Install_OpenSSH_Remote.ps1`、`Get-OpenSSH.ps1`、`Setup-CheckPC-Target.bat`）。
3. 到目標機，**雙擊 `Setup-CheckPC-Target.bat`**（會自動要求系統管理員權限）。它會：
   - 安裝並啟用 OpenSSH Server、開放防火牆 TCP 22（離線；找不到包且有網路時自動下載）。
   - 顯示本機 IP（填入 CheckPC「遠端掃描」用）。
   - 詢問是否設定 `LocalAccountTokenFilterPolicy=1`（選用；只有未來想用一般本機 admin 遠端管理才需要，按 Enter 略過）。
4. 回管理機 CheckPC，用該 IP + 該機系統管理員帳密進行掃描。

> 一台只需跑一次；之後該機就能被遠端掃描。此法不需要處理網域／內建 Administrator／遠端 UAC 的問題。

---

## 與其他部署方式的差異

| 方式 | 更新 | 適合 |
|------|------|------|
| **本指南（git clone + update.bat）** | `git pull` 一鍵更新 | 要持續更新的管理機（推薦） |
| 可攜版 `.exe`（`npm run build:win`） | 需重新發佈 exe | 發給非技術人員 |
| `build-deploy.sh` 靜態包（`deploy/` 內的 .bat） | 需重新打包複製 | 不裝 Node 的離線環境 |
