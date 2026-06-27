import { useState, useEffect } from 'react';
import { api } from '../lib/api';

/**
 * 啟用 OpenSSH 的歷史紀錄列表（讀後端落地的作業，記憶體 + data/batches）。
 * 點「查看」以 onOpen(id) 開啟該次結果。元件每次掛載時重新抓取。
 */
export function SshEnableHistory({ onOpen }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/ssh-enable')
      .then((d) => { if (!cancelled) { setJobs(Array.isArray(d) ? d : []); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p className="text-sm text-muted mt-6">載入啟用紀錄中...</p>;
  if (error) return <p className="text-sm text-red-600 mt-6">無法載入紀錄：{error}</p>;
  if (!jobs.length) return <p className="text-sm text-muted mt-6">尚無啟用紀錄。</p>;

  const fmt = (ts) => { try { return new Date(ts).toLocaleString(); } catch { return String(ts); } };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium mb-2">最近啟用紀錄</h3>
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-muted">
              <th className="py-2 px-3">時間</th>
              <th className="py-2 px-3">操作者</th>
              <th className="py-2 px-3">台數</th>
              <th className="py-2 px-3">結果</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const c = j.counts || {};
              return (
                <tr key={j.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-3 whitespace-nowrap">{fmt(j.createdAt)}</td>
                  <td className="py-2 px-3 text-muted">{j.operator || '-'}</td>
                  <td className="py-2 px-3">{j.total}</td>
                  <td className="py-2 px-3">
                    <span className="text-green-600">✅ {c.success || 0}</span>
                    {c.partial > 0 && <span className="text-yellow-600 ml-2">⚠️ {c.partial}</span>}
                    {c.blocked > 0 && <span className="text-gray-500 ml-2">🚫 {c.blocked}</span>}
                    <span className="text-red-600 ml-2">❌ {c.error || 0}</span>
                    {j.status !== 'done' && <span className="text-primary ml-2">處理中</span>}
                  </td>
                  <td className="py-2 px-3">
                    <button onClick={() => onOpen(j.id)} className="text-primary hover:underline">查看</button>
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
