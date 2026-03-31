import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageCard } from '../components/PageCard';
import { ChecklistItem } from '../components/ChecklistItem';
import { ExportButton } from '../components/ExportButton';
import { CHECKLIST_ITEMS, evaluateAll } from '../lib/checklistItems';

const CATEGORIES = [
  '帳號與存取安全管理',
  '軟體安裝與使用合規',
  '設備與周邊使用控管',
  '其他',
];

export function AuditFormPage() {
  const navigate = useNavigate();
  const [scanData, setScanData] = useState(null);
  const [results, setResults] = useState({});
  const [auditInfo, setAuditInfo] = useState({
    auditor: '',
    auditee: '',
    department: '',
    deviceType: '筆電',
    assetNumber: '',
    auditDate: new Date().toISOString().split('T')[0],
  });

  // 從 sessionStorage 載入掃描結果
  useEffect(() => {
    const saved = sessionStorage.getItem('checkpc_scan');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const scan = data.result || data;
        setScanData(scan);
        setResults(evaluateAll(scan));
        // 自動填入電腦名稱
        if (scan.computerName) {
          setAuditInfo((prev) => ({ ...prev, computerName: scan.computerName }));
        }
      } catch (e) {
        console.error('載入掃描結果失敗:', e);
      }
    }
  }, []);

  const handleUpdateResult = (itemId, newResult) => {
    setResults((prev) => ({ ...prev, [itemId]: newResult }));
  };

  const handleSaveHistory = () => {
    const record = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      auditInfo,
      scanData,
      results,
    };
    const history = JSON.parse(localStorage.getItem('checkpc_history') || '[]');
    history.unshift(record);
    localStorage.setItem('checkpc_history', JSON.stringify(history.slice(0, 100)));
    alert('已儲存到歷史紀錄');
  };

  // 統計
  const stats = Object.values(results).reduce(
    (acc, r) => {
      if (r.status === 'pass') acc.pass++;
      else if (r.status === 'fail') acc.fail++;
      else if (r.status === 'warning') acc.warning++;
      else acc.pending++;
      return acc;
    },
    { pass: 0, fail: 0, warning: 0, pending: 0 }
  );

  if (!scanData) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">稽核表單</h1>
        <PageCard>
          <p className="text-muted text-center py-8">
            尚無掃描資料。請先至
            <button onClick={() => navigate('/scan')} className="text-primary hover:underline ml-1">
              掃描頁面
            </button>
            進行掃描。
          </p>
        </PageCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">電腦稽核表單</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-600">✅ {stats.pass}</span>
          <span className="text-red-600">❌ {stats.fail}</span>
          <span className="text-yellow-600">⚠️ {stats.warning}</span>
          <span className="text-gray-400">⏳ {stats.pending}</span>
        </div>
      </div>

      {/* 基本資訊 */}
      <PageCard title="基本資訊">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1">受稽核單位</label>
            <input
              type="text"
              value={auditInfo.department}
              onChange={(e) => setAuditInfo({ ...auditInfo, department: e.target.value })}
              placeholder="部門名稱"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">受稽核者姓名</label>
            <input
              type="text"
              value={auditInfo.auditee}
              onChange={(e) => setAuditInfo({ ...auditInfo, auditee: e.target.value })}
              placeholder="姓名"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">稽核人員</label>
            <input
              type="text"
              value={auditInfo.auditor}
              onChange={(e) => setAuditInfo({ ...auditInfo, auditor: e.target.value })}
              placeholder="稽核人員姓名"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">設備類型</label>
            <select
              value={auditInfo.deviceType}
              onChange={(e) => setAuditInfo({ ...auditInfo, deviceType: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="桌機">桌機</option>
              <option value="筆電">筆電</option>
              <option value="其他">其他</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">資產編號</label>
            <input
              type="text"
              value={auditInfo.assetNumber}
              onChange={(e) => setAuditInfo({ ...auditInfo, assetNumber: e.target.value })}
              placeholder="IICAP0000"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">稽核日期</label>
            <input
              type="date"
              value={auditInfo.auditDate}
              onChange={(e) => setAuditInfo({ ...auditInfo, auditDate: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">電腦名稱</label>
            <input
              type="text"
              value={scanData.computerName || ''}
              readOnly
              className="w-full px-3 py-2 bg-gray-50 border border-border rounded-lg text-sm text-muted"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">掃描時間</label>
            <input
              type="text"
              value={scanData.scanTimestamp || ''}
              readOnly
              className="w-full px-3 py-2 bg-gray-50 border border-border rounded-lg text-sm text-muted"
            />
          </div>
        </div>
      </PageCard>

      {/* 檢查項目 —— 依類別分組 */}
      {CATEGORIES.map((cat) => {
        const catItems = CHECKLIST_ITEMS.filter((item) => item.category === cat);
        return (
          <PageCard key={cat} title={cat}>
            <div className="space-y-3">
              {catItems.map((item) => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  result={results[item.id]}
                  onUpdate={(newResult) => handleUpdateResult(item.id, newResult)}
                />
              ))}
            </div>
          </PageCard>
        );
      })}

      {/* 操作按鈕 */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={handleSaveHistory}
          className="px-6 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
        >
          儲存到歷史紀錄
        </button>
        <ExportButton
          auditData={{ auditInfo, scanData, results }}
        />
      </div>
    </div>
  );
}
