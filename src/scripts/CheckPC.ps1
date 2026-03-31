#Requires -Version 5.1
param(
    [string]$ConfigJson = ""
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ===== Sanitize string for safe JSON output =====
function Clean-String([string]$s) {
    if ([string]::IsNullOrEmpty($s)) { return "" }
    # Only keep printable ASCII (space to tilde), exclude double-quote to protect JSON
    $sb = New-Object System.Text.StringBuilder
    foreach ($c in $s.ToCharArray()) {
        $code = [int]$c
        if ($code -ge 0x20 -and $code -le 0x7E -and $code -ne 0x22) {
            [void]$sb.Append($c)
        }
    }
    return $sb.ToString().Trim()
}

# ===== Load Config =====
$config = $null
if ($ConfigJson -ne "") {
    $config = $ConfigJson | ConvertFrom-Json
} else {
    $configPath = Join-Path $PSScriptRoot "config.json"
    if (Test-Path $configPath) {
        $config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
}

$approvedSoftware = @()
$remoteCommKeywords = @("AnyDesk","TeamViewer","LINE","Skype","Telegram","WeChat","LogMeIn","RustDesk","Chrome Remote Desktop","UltraViewer","Zoom","Discord")
$blockedSites = @()
$folderRules = @()

if ($config) {
    if ($config.approvedSoftware) { $approvedSoftware = $config.approvedSoftware }
    if ($config.remoteCommKeywords) { $remoteCommKeywords = $config.remoteCommKeywords }
    if ($config.blockedSites) { $blockedSites = $config.blockedSites }
    if ($config.folderRules) { $folderRules = $config.folderRules }
}

$result = @{
    scanTimestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz")
    computerName  = $env:COMPUTERNAME
    scanVersion   = "1.0.0"
    items         = @{}
}

# ===== Item 1: Account Check =====
try {
    $currentUser = $env:USERNAME
    $domainUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $localUsers = @()
    try {
        $localUsers = Get-LocalUser | Where-Object { $_.Enabled -eq $true } | Select-Object -ExpandProperty Name
    } catch {
        $localUsers = @($currentUser)
    }
    $result.items["item01_account"] = @{
        currentUser    = $currentUser
        domainUser     = $domainUser
        allLocalUsers  = @($localUsers)
        isPersonalAccount = $true
    }
} catch {
    $result.items["item01_account"] = @{ error = $_.Exception.Message }
}

# ===== Item 4: Folder Permissions =====
try {
    $folderResults = @()
    foreach ($rule in $folderRules) {
        $folderPath = $rule.path
        $allowedGroups = @($rule.allowedGroups)
        $expectedAccess = $rule.accessLevel

        $folderCheck = @{
            path           = $folderPath
            expectedAccess = $expectedAccess
            allowedGroups  = $allowedGroups
            status         = "unknown"
            actualAcl      = @()
        }

        if (Test-Path $folderPath) {
            $acl = Get-Acl $folderPath
            $currentUserIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
            $currentUserGroups = $currentUserIdentity.Groups | ForEach-Object {
                try { $_.Translate([System.Security.Principal.NTAccount]).Value } catch { $_.Value }
            }
            $currentUserAccounts = @($currentUserIdentity.Name) + @($currentUserGroups)

            $relevantRules = @()
            foreach ($accessRule in $acl.Access) {
                $identity = $accessRule.IdentityReference.Value
                if ($currentUserAccounts -contains $identity -or $identity -eq "Everyone" -or $identity -eq "BUILTIN\Users") {
                    $relevantRules += @{
                        identity = $identity
                        rights   = $accessRule.FileSystemRights.ToString()
                        type     = $accessRule.AccessControlType.ToString()
                    }
                }
            }
            $folderCheck.actualAcl = $relevantRules

            $hasAccess = $relevantRules.Count -gt 0
            $isAllowed = $false
            foreach ($group in $allowedGroups) {
                if ($currentUserAccounts | Where-Object { $_ -like "*$group*" }) {
                    $isAllowed = $true
                    break
                }
            }

            if ($expectedAccess -eq "None") {
                $folderCheck.status = if ($hasAccess) { "fail" } else { "pass" }
            } elseif ($isAllowed) {
                $folderCheck.status = "pass"
            } else {
                $folderCheck.status = if ($hasAccess) { "fail" } else { "pass" }
            }
        } else {
            $folderCheck.status = "not_found"
        }
        $folderResults += $folderCheck
    }
    $result.items["item04_folders"] = @{
        rules   = @($folderResults)
        checked = $folderResults.Count
    }
} catch {
    $result.items["item04_folders"] = @{ error = $_.Exception.Message }
}

# ===== Item 5 + 6: Software (Whitelist) =====
try {
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    $installedPrograms = @()
    foreach ($p in $regPaths) {
        $items = Get-ItemProperty $p 2>$null | Where-Object { $_.DisplayName }
        foreach ($item in $items) {
            $installedPrograms += @{
                name        = (Clean-String $item.DisplayName)
                publisher   = if ($item.Publisher) { Clean-String $item.Publisher } else { "" }
                installDate = if ($item.InstallDate) { $item.InstallDate } else { "" }
                version     = if ($item.DisplayVersion) { Clean-String $item.DisplayVersion } else { "" }
            }
        }
    }

    # Deduplicate
    $uniquePrograms = @()
    $seenNames = @{}
    foreach ($prog in $installedPrograms) {
        if (-not $seenNames.ContainsKey($prog.name)) {
            $seenNames[$prog.name] = $true
            $uniquePrograms += $prog
        }
    }

    # Compare with whitelist
    $authorizedList = @()
    $unauthorizedList = @()
    $remoteCommFound = @()

    foreach ($prog in $uniquePrograms) {
        $isApproved = $false
        $matchedCategory = ""
        foreach ($rule in $approvedSoftware) {
            $pattern = $rule.name
            if ($prog.name -like $pattern) {
                $isApproved = $true
                $matchedCategory = $rule.category
                break
            }
        }

        if ($isApproved) {
            $authorizedList += @{
                name     = $prog.name
                category = $matchedCategory
            }
        } else {
            $isRemoteComm = $false
            foreach ($keyword in $remoteCommKeywords) {
                if ($prog.name -like "*$keyword*") {
                    $isRemoteComm = $true
                    break
                }
            }
            $entry = @{
                name      = $prog.name
                publisher = $prog.publisher
                version   = $prog.version
            }
            if ($isRemoteComm) {
                $entry["isRemoteComm"] = $true
                $remoteCommFound += $entry
            }
            $unauthorizedList += $entry
        }
    }

    $result.items["item05_software"] = @{
        totalInstalled   = $uniquePrograms.Count
        authorizedCount  = $authorizedList.Count
        unauthorizedList = @($unauthorizedList)
    }
    $result.items["item06_remote"] = @{
        remoteCommFound = @($remoteCommFound)
    }
} catch {
    $result.items["item05_software"] = @{ error = $_.Exception.Message }
    $result.items["item06_remote"] = @{ error = $_.Exception.Message }
}

# ===== Item 8: USB Policy =====
try {
    $usbStorStart = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" -Name Start -ErrorAction SilentlyContinue).Start
    $usbBlocked = ($usbStorStart -eq 4)

    $gpoDenyAll = $false
    $gpoPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}"
    if (Test-Path $gpoPath) {
        $denyRead = (Get-ItemProperty $gpoPath -Name "Deny_Read" -ErrorAction SilentlyContinue).Deny_Read
        $denyWrite = (Get-ItemProperty $gpoPath -Name "Deny_Write" -ErrorAction SilentlyContinue).Deny_Write
        if ($denyRead -eq 1 -and $denyWrite -eq 1) { $gpoDenyAll = $true }
    }

    $result.items["item08_usb_policy"] = @{
        usbStorStart = if ($usbStorStart) { $usbStorStart } else { "N/A" }
        usbStorBlocked = $usbBlocked
        gpoDenyAll     = $gpoDenyAll
    }
} catch {
    $result.items["item08_usb_policy"] = @{ error = $_.Exception.Message }
}

# ===== Item 9 + 10: USB Devices =====
try {
    $usbDevices = @()
    $pnpDevices = Get-PnpDevice -PresentOnly 2>$null | Where-Object { $_.InstanceId -match "^USB" }
    foreach ($dev in $pnpDevices) {
        $usbDevices += @{
            name       = $dev.FriendlyName
            class      = $dev.Class
            status     = $dev.Status
            instanceId = $dev.InstanceId
        }
    }

    $usbStorage = @()
    $diskDrives = Get-CimInstance Win32_DiskDrive 2>$null | Where-Object { $_.InterfaceType -eq "USB" }
    foreach ($disk in $diskDrives) {
        $usbStorage += @{
            name  = $disk.Caption
            size  = [math]::Round($disk.Size / 1GB, 2)
            model = $disk.Model
        }
    }

    $result.items["item09_10_usb_devices"] = @{
        connectedUsbDevices = @($usbDevices)
        usbStorageDevices   = @($usbStorage)
        totalUsbDevices     = $usbDevices.Count
        totalUsbStorage     = $usbStorage.Count
    }
} catch {
    $result.items["item09_10_usb_devices"] = @{ error = $_.Exception.Message }
}

# ===== Item 2 + 11: Website Blocking =====
try {
    $siteResults = @()
    foreach ($site in $blockedSites) {
        $url = $site.url
        $testUrl = "https://$url"
        $accessible = $false
        try {
            $response = Invoke-WebRequest -Uri $testUrl -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0
            $accessible = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
        } catch {
            $statusCode = $null
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            if ($statusCode -ge 200 -and $statusCode -lt 400) {
                $accessible = $true
            } elseif ($statusCode -ge 300 -and $statusCode -lt 400) {
                $accessible = $true
            } else {
                $tcpResult = Test-NetConnection -ComputerName $url -Port 443 -WarningAction SilentlyContinue
                $accessible = $tcpResult.TcpTestSucceeded
            }
        }
        $siteResults += @{
            url        = $url
            name       = $site.name
            category   = $site.category
            accessible = $accessible
        }
    }
    $result.items["item02_11_websites"] = @{
        sites = @($siteResults)
    }
} catch {
    $result.items["item02_11_websites"] = @{ error = $_.Exception.Message }
}

# ===== Item 12: Print + Screensaver =====
try {
    # Get ALL printers, not just default
    $allPrinters = @(Get-CimInstance Win32_Printer 2>$null)
    $defaultPrinter = $allPrinters | Where-Object { $_.Default -eq $true }
    # If no default, use first available
    if (-not $defaultPrinter -and $allPrinters.Count -gt 0) {
        $defaultPrinter = $allPrinters[0]
    }

    $printerName = "N/A"
    $colorMode = "unknown"
    $allPrinterInfo = @()

    foreach ($p in $allPrinters) {
        $pName = Clean-String $p.Name
        $pConfig = Get-CimInstance Win32_PrinterConfiguration 2>$null | Where-Object { $_.Name -eq $p.Name }
        $pColor = "unknown"
        if ($pConfig) {
            if ($pConfig.Color -eq 1) { $pColor = "monochrome" }
            elseif ($pConfig.Color -eq 2) { $pColor = "color" }
        }
        $allPrinterInfo += @{
            name = $pName
            isDefault = ($p.Default -eq $true)
            colorMode = $pColor
        }
    }

    if ($defaultPrinter) {
        $printerName = Clean-String $defaultPrinter.Name
        $pConfig = Get-CimInstance Win32_PrinterConfiguration 2>$null | Where-Object { $_.Name -eq $defaultPrinter.Name }
        if ($pConfig) {
            if ($pConfig.Color -eq 1) { $colorMode = "monochrome" }
            elseif ($pConfig.Color -eq 2) { $colorMode = "color" }
        }
    }

    # Screensaver
    $ssActive = (Get-ItemProperty "HKCU:\Control Panel\Desktop" -Name "ScreenSaveActive" -ErrorAction SilentlyContinue).ScreenSaveActive
    $ssTimeout = (Get-ItemProperty "HKCU:\Control Panel\Desktop" -Name "ScreenSaveTimeOut" -ErrorAction SilentlyContinue).ScreenSaveTimeOut

    # Power display timeout (fallback)
    $powerTimeout = $null
    try {
        $powerCfg = powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE 2>$null
        $acLine = ($powerCfg | Select-String "Current AC Power Setting Index" | Select-Object -First 1)
        if (-not $acLine) { $acLine = ($powerCfg | Select-String "AC Power Setting Index" | Select-Object -First 1) }
        if (-not $acLine) { $acLine = ($powerCfg | Select-String "Setting Index" | Select-Object -First 1) }
        if ($acLine) {
            $hex = ($acLine -split ": *")[1].Trim()
            $powerTimeout = [convert]::ToInt32($hex, 16)
        }
    } catch {}

    $ssTimeoutInt = $null
    $ssTimeoutMin = $null
    if ($ssTimeout) {
        $ssTimeoutInt = [int]$ssTimeout
        $ssTimeoutMin = [math]::Round($ssTimeoutInt / 60, 1)
    }
    $powerTimeoutMin = $null
    if ($powerTimeout) {
        $powerTimeoutMin = [math]::Round($powerTimeout / 60, 1)
    }

    $result.items["item12_print_screensaver"] = @{
        defaultPrinter              = $printerName
        colorMode                   = $colorMode
        allPrinters                 = @($allPrinterInfo)
        screensaverActive           = ($ssActive -eq "1")
        screensaverTimeoutSeconds   = $ssTimeoutInt
        screensaverTimeoutMinutes   = $ssTimeoutMin
        powerDisplayTimeoutSeconds  = $powerTimeout
        powerDisplayTimeoutMinutes  = $powerTimeoutMin
    }
} catch {
    $result.items["item12_print_screensaver"] = @{ error = $_.Exception.Message }
}

# ===== Output JSON =====
$jsonOutput = $result | ConvertTo-Json -Depth 5 -Compress
# Final cleanup: remove any non-ASCII that slipped through
$safeOutput = ""
foreach ($c in $jsonOutput.ToCharArray()) {
    $code = [int]$c
    if ($code -ge 0x20 -and $code -le 0x7E) {
        $safeOutput += $c
    }
}
$safeOutput
