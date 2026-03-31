import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageCard } from '../components/PageCard';
import { exportToExcel } from '../lib/excelExport';

export function HistoryPage() {
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('checkpc_history') || '[]');
    setHistory(saved);
  }, []);

  const handleOpen = (record) => {
    sessionStorage.setItem('checkpc_scan', JSON.stringify({
      id: record.id,
      result: record.scanData,
    }));
    navigate('/audit');
  };

  const handleExport = (record) => {
    try {
      exportToExcel({
        auditInfo: record.auditInfo,
        scanData: record.scanData,
        results: record.results,
      });
    } catch (err) {
      alert(`匯出失敗: ${err.message}`);
    }
  };

  const handleDelete = (id) => {
    if (!confirm('確定要刪除此紀錄嗎？')) return;
    const updated = history.filter((r) => r.id !== id);
    setHistory(updated);
    localStorage.setItem('checkpc_history', JSON.stringify(updated));
  };

  const handleClearAll = () => {
    if (!confirm('確定要清除所有歷史紀錄嗎？此操作無法復原。')) return;
    setHistory([]);
    localStorage.removeItem('checkpc_history');
  };

  const getStats = (results) => {
    if (!results) return { pass: 0, fail: 0 };
    return Object.values(results).reduce(
      (acc, r) => {
        if (r.status === 'pass') acc.pass++;
        else if (r.status === 'fail') acc.fail++;
        return acc;
      },
      { pass: 0, fail: 0 }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">歷史紀錄</h1>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-sm text-red-600 hover:text-red-700 px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            清除全部
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <PageCard>
          <p className="text-muted text-center py-8">尚無歷史紀錄</p>
        </PageCard>
      ) : (
        <div className="space-y-3">
          {history.map((record) => {
            const stats = getStats(record.results);
            const info = record.auditInfo || {};
            return (
              <div
                key={record.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium text-sm">
                      {info.department || '未知單位'} / {info.auditee || '未知'}
                    </h3>
                    <span className="text-xs text-muted">
                      {record.scanData?.computerName || ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>{info.auditDate || new Date(record.timestamp).toLocaleDateString()}</span>
                    <span>稽核員: {info.auditor || '-'}</span>
                    <span className="text-green-600">✅ {stats.pass}</span>
                    <span className="text-red-600">❌ {stats.fail}</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleOpen(record)}
                    className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                  >
                    開啟
                  </button>
                  <button
                    onClick={() => handleExport(record)}
                    className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    匯出
                  </button>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="text-xs px-3 py-1.5 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    刪除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
