import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useBatchPoll } from '../hooks/useBatchPoll';

const STATUS = {
  pending: { icon: '⏳', cls: 'text-muted', label: '等待中' },
  running: { icon: '🔄', cls: 'text-primary', label: '掃描中' },
  success: { icon: '✅', cls: 'text-green-600', label: '完成' },
  error: { icon: '❌', cls: 'text-red-600', label: '失敗' },
};

const ERR_LABEL = {
  auth: '帳密錯誤', timeout: '逾時', connect: '無法連線', parse: '結果解析失敗', error: '錯誤',
};

/**
 * 批次結果表：輪詢進度，逐台顯示狀態；成功列可「開啟稽核」。
 */
export function BatchResultsTable({ batchId, onNewBatch }) {
  const { job, error } = useBatchPoll(batchId);
  const [openErr, setOpenErr] = useState('');
  const navigate = useNavigate();

  const openAudit = async (scanId) => {
    setOpenErr('');
    try {
      const result = await api.get('/scan/results/' + scanId);
      sessionStorage.setItem('checkpc_scan', JSON.stringify({ id: scanId, result }));
      navigate('/audit');
    } catch (err) {
      setOpenErr(`無法開啟稽核：${err.message}`);
    }
  };

  if (!job) {
    return <div className="text-muted text-sm">{error ? `載入失敗：${error}` : '載入中...'}</div>;
  }

  const finished = job.counts.success + job.counts.error;
  const pct = job.total ? Math.round((finished / job.total) * 100) : 0;
  const done = job.status === 'done';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          進度 {finished}/{job.total}
          <span className="text-green-600 ml-3">✅ {job.counts.success}</span>
          <span className="text-red-600 ml-2">❌ {job.counts.error}</span>
          {done
            ? <span className="text-muted ml-3">已完成</span>
            : <span className="text-primary ml-3">掃描中...</span>}
          {job.operator && <span className="text-muted ml-3">操作者：{job.operator}</span>}
        </div>
        <button onClick={onNewBatch} className="text-sm text-primary hover:underline">+ 新批次</button>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {openErr && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{openErr}</div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-muted">
              <th className="py-2 px-3">主機</th>
              <th className="py-2 px-3">狀態</th>
              <th className="py-2 px-3">訊息</th>
              <th className="py-2 px-3">動作</th>
            </tr>
          </thead>
          <tbody>
            {job.results.map((r) => {
              const s = STATUS[r.status] || STATUS.pending;
              return (
                <tr key={r.index} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-3 font-mono">{r.host}:{r.port}</td>
                  <td className={`py-2 px-3 ${s.cls}`}>{s.icon} {s.label}</td>
                  <td className="py-2 px-3 text-muted">
                    {r.error ? (ERR_LABEL[r.error.type] || r.error.type) : ''}
                  </td>
                  <td className="py-2 px-3">
                    {r.status === 'success' && r.scanId && (
                      <button onClick={() => openAudit(r.scanId)} className="text-primary hover:underline">
                        開啟稽核
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
