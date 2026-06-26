# 部署指南：以 Git 安裝並可透過 GitHub 更新（Windows）

這是推薦給「裝在其他 Windows 電腦、且要能隨時更新到 GitHub 最新版」的部署方式。
作法是把 repo `git clone` 到目標管理機，之後用 `update.bat` 一鍵 `git pull` + 重建。

> 觀念提醒：CheckPC 只需裝在**你稽核用的 Windows 管理機**上，不是每台被稽核的電腦都要裝。

---

## 前置需求（管理機）

- [Git for Windows](https://git-scm.com)
- [Node.js 18+](https://nodejs.org)

## 首次安裝

```bat
git clone https://github.com/Paul-Lee-TW/CheckPC.git
cd CheckPC
update.bat        :: 安裝相依套件並建置前端
start.bat         :: 啟動，瀏覽器開 http://localhost:3001
```

`update.bat` 會：`git pull` → 後端 `npm install` → 前端 `npm install` + `npm run build`。
首次執行雖然沒有可拉的更新，但會完成安裝與建置。

## 更新到最新版

```bat
cd CheckPC
update.bat        :: 拉取最新程式 + 重新安裝/建置
start.bat         :: 重新啟動
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

於 `start.bat` 前設定，例如：`set PORT=4000 && start.bat`

---

## 關於「遠端啟用 OpenSSH」腳本（選用）

`src/scripts/Enable-OpenSSH-Remote.ps1` 與 `Install_OpenSSH_Remote.ps1` 需要本機有
`src/scripts/OpenSSH-Win64/`（離線 OpenSSH 包）。該資料夾因體積較大而被 `.gitignore`，
**clone 後不會自動帶**。若要用這兩支腳本，請手動將官方
[Win32-OpenSSH](https://github.com/PowerShell/Win32-OpenSSH/releases/latest) 解壓到
`src/scripts/OpenSSH-Win64/`。一般「遠端 SSH 掃描」功能**不需要**這個資料夾。

---

## 與其他部署方式的差異

| 方式 | 更新 | 適合 |
|------|------|------|
| **本指南（git clone + update.bat）** | `git pull` 一鍵更新 | 要持續更新的管理機（推薦） |
| 可攜版 `.exe`（`npm run build:win`） | 需重新發佈 exe | 發給非技術人員 |
| `build-deploy.sh` 靜態包（`deploy/` 內的 .bat） | 需重新打包複製 | 不裝 Node 的離線環境 |
