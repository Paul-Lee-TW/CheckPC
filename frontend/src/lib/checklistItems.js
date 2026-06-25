/**
 * 稽核檢查項目定義
 * isAutomatic: true = 由 PowerShell 掃描自動判定
 * scanKey: 對應 JSON 結果中的 key
 * evaluate(data, settings): 接收掃描資料，回傳 { status, detail, items }
 */
export const CHECKLIST_ITEMS = [
  {
    id: 'item01',
    number: 1,
    category: '帳號與存取安全管理',
    label: '使用個人專屬帳號登入電腦',
    description: '必要時以其他帳號測試，確認無法登入',
    isAutomatic: true,
    scanKey: 'item01_account',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const userCount = data.allLocalUsers?.length || 0;
      return {
        status: data.isPersonalAccount ? 'pass' : 'fail',
        detail: `目前使用者: ${data.domainUser || data.currentUser}，本機共 ${userCount} 個啟用帳號`,
        items: data.allLocalUsers,
      };
    },
  },
  {
    id: 'item02',
    number: 2,
    category: '帳號與存取安全管理',
    label: '未使用 Gmail 等私人信箱傳送公司資料，亦未以私人雲端硬碟儲存公司資料',
    description: '測試私人信箱/雲端服務是否可連線',
    isAutomatic: true,
    scanKey: 'item02_11_websites',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const allSites = data.sites || [];
      // Match both English and legacy Chinese category keys
      const emailSites = allSites.filter((s) =>
        s.category === 'email' || s.category === '私人信箱雲端' ||
        s.url?.includes('mail.google') || s.url?.includes('drive.google') ||
        s.url?.includes('outlook.live') || s.url?.includes('onedrive.live')
      );
      if (emailSites.length === 0) {
        return { status: 'warning', detail: '未找到私人信箱/雲端服務的測試結果，請確認設定', items: allSites };
      }
      const accessible = emailSites.filter((s) => s.accessible);
      if (accessible.length === 0) {
        return { status: 'pass', detail: '所有私人信箱/雲端服務已封鎖', items: emailSites };
      }
      return {
        status: 'fail',
        detail: `${accessible.length} 個私人信箱/雲端服務可連線: ${accessible.map((s) => s.name).join(', ')}`,
        items: emailSites,
      };
    },
  },
  {
    id: 'item03',
    number: 3,
    category: '帳號與存取安全管理',
    label: '未將密碼明示或張貼於桌面、螢幕或周邊設備',
    description: '需現場目視檢查',
    isAutomatic: false,
    scanKey: null,
    evaluate: null,
  },
  {
    id: 'item04',
    number: 4,
    category: '帳號與存取安全管理',
    label: '公用區資料夾存取權限符合職務權責設定',
    description: '比對 ACL 與設定頁定義的權限規則',
    isAutomatic: true,
    scanKey: 'item04_folders',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      if (data.checked === 0) return { status: 'warning', detail: '未設定資料夾權限規則，請至設定頁新增' };
      const failed = (data.rules || []).filter((r) => r.status === 'fail');
      const notFound = (data.rules || []).filter((r) => r.status === 'not_found');
      if (failed.length === 0 && notFound.length === 0) {
        return { status: 'pass', detail: `${data.checked} 條規則全部符合`, items: data.rules };
      }
      const issues = [];
      if (failed.length > 0) issues.push(`${failed.length} 條權限異常`);
      if (notFound.length > 0) issues.push(`${notFound.length} 個資料夾不存在`);
      return { status: 'fail', detail: issues.join('，'), items: data.rules };
    },
  },
  {
    id: 'item05',
    number: 5,
    category: '軟體安裝與使用合規',
    label: '未自行安裝未經公司採購、授權之文書軟體、防毒、防護或專業工程軟體等',
    description: '比對核准軟體白名單，列出未授權軟體',
    isAutomatic: true,
    scanKey: 'item05_software',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const unauthorized = data.unauthorizedList || [];
      if (unauthorized.length === 0) {
        return {
          status: 'pass',
          detail: `共 ${data.totalInstalled} 個軟體，全部在白名單內`,
        };
      }
      return {
        status: 'fail',
        detail: `發現 ${unauthorized.length} 個未授權軟體`,
        items: unauthorized,
      };
    },
  },
  {
    id: 'item06',
    number: 6,
    category: '軟體安裝與使用合規',
    label: '未自行安裝未經核准之遠端連線、視訊或通訊軟體',
    description: '如 AnyDesk、TeamViewer、LINE、Skype 等',
    isAutomatic: true,
    scanKey: 'item06_remote',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const found = data.remoteCommFound || [];
      if (found.length === 0) {
        return { status: 'pass', detail: '未偵測到遠端/通訊軟體' };
      }
      return {
        status: 'fail',
        detail: `發現 ${found.length} 個遠端/通訊軟體: ${found.map((f) => f.name).join(', ')}`,
        items: found,
      };
    },
  },
  {
    id: 'item07',
    number: 7,
    category: '設備與周邊使用控管',
    label: '未攜帶任何個人筆電、記憶卡/SD卡、行動硬碟、行動電源、USB隨身碟等入廠',
    description: '需現場目視檢查',
    isAutomatic: false,
    scanKey: null,
    evaluate: null,
  },
  {
    id: 'item08',
    number: 8,
    category: '設備與周邊使用控管',
    label: '電腦 USB 連接埠已設定為封鎖或禁用狀態',
    description: '檢查 USBSTOR 服務和群組原則設定',
    isAutomatic: true,
    scanKey: 'item08_usb_policy',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const blocked = data.usbStorBlocked || data.gpoDenyAll;
      return {
        status: blocked ? 'pass' : 'fail',
        detail: blocked
          ? `USB 儲存已封鎖 (USBSTOR Start=${data.usbStorStart}${data.gpoDenyAll ? ', GPO Deny=啟用' : ''})`
          : `USB 儲存未封鎖 (USBSTOR Start=${data.usbStorStart})`,
      };
    },
  },
  {
    id: 'item09',
    number: 9,
    category: '設備與周邊使用控管',
    label: '未使用電腦 USB 連接埠作為充電用途',
    description: '列出 USB 裝置供稽核人員判斷',
    isAutomatic: true,
    scanKey: 'item09_10_usb_devices',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const total = data.totalUsbDevices || 0;
      return {
        status: 'warning',
        detail: `偵測到 ${total} 個 USB 裝置，請確認是否有充電用途`,
        items: data.connectedUsbDevices,
      };
    },
  },
  {
    id: 'item10',
    number: 10,
    category: '設備與周邊使用控管',
    label: '電腦無外接硬碟、磁碟機、行動電源、手機、風扇、讀卡機等硬體',
    description: '掃描 USB 外接儲存裝置',
    isAutomatic: true,
    scanKey: 'item09_10_usb_devices',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const storageCount = data.totalUsbStorage || 0;
      if (storageCount === 0) {
        return { status: 'pass', detail: '未偵測到 USB 外接儲存裝置' };
      }
      return {
        status: 'fail',
        detail: `偵測到 ${storageCount} 個 USB 外接儲存裝置`,
        items: data.usbStorageDevices,
      };
    },
  },
  {
    id: 'item11',
    number: 11,
    category: '其他',
    label: '網頁瀏覽權限已關閉影音及社群網站',
    description: '如 YouTube、Facebook、Instagram、Threads 等',
    isAutomatic: true,
    scanKey: 'item02_11_websites',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const allSites = data.sites || [];
      const socialSites = allSites.filter((s) =>
        s.category === 'social' || s.category === '影音社群' ||
        s.url?.includes('youtube') || s.url?.includes('facebook') ||
        s.url?.includes('instagram') || s.url?.includes('threads.net')
      );
      if (socialSites.length === 0) {
        return { status: 'warning', detail: '未找到影音/社群網站的測試結果，請確認設定', items: allSites };
      }
      const accessible = socialSites.filter((s) => s.accessible);
      if (accessible.length === 0) {
        return { status: 'pass', detail: '所有影音/社群網站已封鎖', items: socialSites };
      }
      return {
        status: 'fail',
        detail: `${accessible.length} 個影音/社群網站可連線: ${accessible.map((s) => s.name).join(', ')}`,
        items: socialSites,
      };
    },
  },
  {
    id: 'item12',
    number: 12,
    category: '其他',
    label: '影印設定為黑白列印模式；螢幕設定閒置超過 5 分鐘啟動螢幕保護功能',
    description: '檢查印表機色彩設定和螢幕保護逾時',
    isAutomatic: true,
    scanKey: 'item12_print_screensaver',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const issues = [];
      const details = [];

      // Printer check
      if (data.defaultPrinter === 'N/A' || !data.defaultPrinter) {
        issues.push('未偵測到預設印表機');
      } else if (data.colorMode === 'color') {
        issues.push(`印表機「${data.defaultPrinter}」為彩色列印`);
      } else if (data.colorMode === 'unknown') {
        issues.push(`印表機「${data.defaultPrinter}」色彩模式無法偵測`);
      } else {
        details.push(`印表機: ${data.defaultPrinter} (黑白)`);
      }

      // Screensaver check
      const ssActive = data.screensaverActive;
      const ssTimeout = data.screensaverTimeoutSeconds;
      const powerTimeout = data.powerDisplayTimeoutSeconds;

      if (!ssActive && !powerTimeout) {
        issues.push('螢幕保護未啟用且未設定電源關閉螢幕');
      } else if (!ssActive && powerTimeout) {
        if (powerTimeout > 300) {
          issues.push(`電源關閉螢幕設為 ${data.powerDisplayTimeoutMinutes || Math.round(powerTimeout/60)} 分鐘（超過 5 分鐘）`);
        } else {
          details.push(`電源關閉螢幕: ${data.powerDisplayTimeoutMinutes || Math.round(powerTimeout/60)} 分鐘`);
        }
      } else if (ssActive && !ssTimeout) {
        // Screensaver active but no timeout set - check power settings
        if (powerTimeout && powerTimeout <= 300) {
          details.push(`電源關閉螢幕: ${data.powerDisplayTimeoutMinutes || Math.round(powerTimeout/60)} 分鐘`);
        } else {
          issues.push('螢幕保護已啟用但未設定逾時時間');
        }
      } else if (ssActive && ssTimeout > 300) {
        issues.push(`螢幕保護逾時 ${data.screensaverTimeoutMinutes} 分鐘（超過 5 分鐘）`);
      } else if (ssActive && ssTimeout) {
        details.push(`螢幕保護: ${data.screensaverTimeoutMinutes} 分鐘`);
      }

      if (issues.length === 0) {
        return {
          status: 'pass',
          detail: details.join('，'),
          items: data.allPrinters,
        };
      }
      return {
        status: 'fail',
        detail: issues.join('；'),
        items: data.allPrinters,
      };
    },
  },
  {
    id: 'item13',
    number: 13,
    category: '軟體安裝與使用合規',
    label: '一般使用者（非系統管理員）無自行安裝軟體之權限',
    description: '檢查本機 Administrators 群組成員、AlwaysInstallElevated 政策與 UAC 設定',
    isAutomatic: true,
    scanKey: 'item13_install_permission',
    evaluate(data) {
      if (!data || data.error) return { status: 'error', detail: data?.error || '無資料' };
      const extras = data.extraAdminUsers || [];
      const issues = [];
      if (data.alwaysInstallElevated) {
        issues.push('AlwaysInstallElevated 已啟用，任何使用者皆可提權安裝軟體');
      }
      if (extras.length > 0) {
        issues.push(`${extras.length} 個非內建管理員的使用者帳號具管理權限：${extras.map((u) => u.name).join('、')}`);
      }
      if (issues.length > 0) {
        return { status: 'fail', detail: issues.join('；'), items: data.adminMembers };
      }
      const warns = [];
      if (data.uacEnabled === false) warns.push('UAC 已停用');
      if (data.standardUserInstallBlocked === false) warns.push('標準使用者可透過 UAC 憑證提示提權安裝');
      if (warns.length > 0) {
        return { status: 'warning', detail: `${warns.join('；')}，請確認是否符合政策`, items: data.adminMembers };
      }
      return { status: 'pass', detail: '僅內建管理員具備安裝權限，標準使用者受限', items: data.adminMembers };
    },
  },
];

/**
 * 根據掃描結果評估所有項目
 */
export function evaluateAll(scanData) {
  const results = {};
  for (const item of CHECKLIST_ITEMS) {
    if (item.isAutomatic && item.evaluate && scanData?.items) {
      const data = scanData.items[item.scanKey];
      results[item.id] = { ...item.evaluate(data), auto: true };
    } else {
      results[item.id] = { status: 'pending', detail: '待手動檢查', auto: false };
    }
  }
  return results;
}
