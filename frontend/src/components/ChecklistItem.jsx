import { useState } from 'react';
import { ScanResultCard } from './ScanResultCard';

const STATUS_STYLES = {
  pass: { bg: 'bg-green-50', border: 'border-green-200', icon: '✅', text: '符合' },
  fail: { bg: 'bg-red-50', border: 'border-red-200', icon: '❌', text: '異常' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '⚠️', text: '待確認' },
  pending: { bg: 'bg-gray-50', border: 'border-gray-200', icon: '⏳', text: '待檢查' },
  error: { bg: 'bg-orange-50', border: 'border-orange-200', icon: '🔴', text: '錯誤' },
};

export function ChecklistItem({ item, result, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const status = result?.status || 'pending';
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;

  const handleStatusChange = (newStatus) => {
    onUpdate({ ...result, status: newStatus, overridden: true });
  };

  const handleRemarkChange = (e) => {
    onUpdate({ ...result, remark: e.target.value });
  };

  return (
    <div className={`${style.bg} border ${style.border} rounded-lg p-4 transition-all`}>
      <div className="flex items-start gap-3">
        {/* 項次 + 狀態 */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1">
          <span className="text-xs text-muted font-mono">#{item.number}</span>
          <span className="text-lg">{style.icon}</span>
        </div>

        {/* 內容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm leading-snug">{item.label}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              item.isAutomatic ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {item.isAutomatic ? '自動' : '手動'}
            </span>
          </div>

          {/* 自動檢測結果 */}
          {result?.detail && (
            <p className="text-sm text-gray-600 mt-1">{result.detail}</p>
          )}

          {/* 展開詳情 */}
          {result?.items && result.items.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expanded ? '收合詳情 ▲' : `查看詳情 (${result.items.length} 筆) ▼`}
            </button>
          )}
          {expanded && result?.items && (
            <ScanResultCard items={result.items} itemId={item.id} />
          )}

          {/* 手動項目：選擇狀態 */}
          {!item.isAutomatic && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleStatusChange('pass')}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  status === 'pass' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 hover:bg-green-50'
                }`}
              >
                ✅ 符合
              </button>
              <button
                onClick={() => handleStatusChange('fail')}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  status === 'fail' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 hover:bg-red-50'
                }`}
              >
                ❌ 異常
              </button>
            </div>
          )}

          {/* 自動項目：覆寫按鈕 */}
          {item.isAutomatic && result?.auto && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleStatusChange(status === 'pass' ? 'fail' : 'pass')}
                className="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-100 transition-colors"
              >
                手動覆寫為「{status === 'pass' ? '異常' : '符合'}」
              </button>
              {result.overridden && (
                <span className="text-xs text-warning">（已手動覆寫）</span>
              )}
            </div>
          )}

          {/* 備註 */}
          <textarea
            value={result?.remark || ''}
            onChange={handleRemarkChange}
            placeholder="備註..."
            rows={1}
            className="mt-2 w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-primary bg-white/70"
          />
        </div>
      </div>
    </div>
  );
}
