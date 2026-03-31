// Category mapping for display
export const CATEGORY_LABELS = {
  system: '系統內建',
  driver: '系統驅動',
  authorized: '公司授權',
  security: '防毒防護',
  tool: '工具軟體',
  email: '私人信箱雲端',
  social: '影音社群',
};

export const DEFAULT_APPROVED_SOFTWARE = [
  { name: 'Microsoft*', category: 'system' },
  { name: 'Windows*', category: 'system' },
  { name: 'Update for*', category: 'system' },
  { name: 'Security Update*', category: 'system' },
  { name: 'Hotfix*', category: 'system' },
  { name: 'Intel*', category: 'driver' },
  { name: 'Realtek*', category: 'driver' },
  { name: 'NVIDIA*', category: 'driver' },
  { name: 'AMD*', category: 'driver' },
  { name: 'Synaptics*', category: 'driver' },
  { name: 'Dell*', category: 'driver' },
  { name: 'HP *', category: 'driver' },
  { name: 'Lenovo*', category: 'driver' },
  { name: 'Google Chrome', category: 'authorized' },
  { name: 'Adobe Acrobat*', category: 'authorized' },
  { name: '7-Zip*', category: 'tool' },
];

// 遠端/通訊軟體關鍵字（用於項目 6 額外標記）
export const REMOTE_COMM_KEYWORDS = [
  'AnyDesk',
  'TeamViewer',
  'LINE',
  'Skype',
  'Telegram',
  'WeChat',
  'LogMeIn',
  'RustDesk',
  'Chrome Remote Desktop',
  'UltraViewer',
  'Zoom',
  'Discord',
];

// 網站封鎖清單（項目 2 + 11）
export const DEFAULT_BLOCKED_SITES = [
  { url: 'mail.google.com', name: 'Gmail', category: 'email' },
  { url: 'drive.google.com', name: 'Google Drive', category: 'email' },
  { url: 'outlook.live.com', name: 'Outlook.com', category: 'email' },
  { url: 'onedrive.live.com', name: 'OneDrive Personal', category: 'email' },
  { url: 'www.youtube.com', name: 'YouTube', category: 'social' },
  { url: 'www.facebook.com', name: 'Facebook', category: 'social' },
  { url: 'www.instagram.com', name: 'Instagram', category: 'social' },
  { url: 'www.threads.net', name: 'Threads', category: 'social' },
];

// 資料夾權限規則（項目 4）
export const DEFAULT_FOLDER_RULES = [
  // 範例（預設為空，由使用者自行設定）
];

// 組合所有設定
export const DEFAULT_SETTINGS = {
  approvedSoftware: DEFAULT_APPROVED_SOFTWARE,
  remoteCommKeywords: REMOTE_COMM_KEYWORDS,
  blockedSites: DEFAULT_BLOCKED_SITES,
  folderRules: DEFAULT_FOLDER_RULES,
};
