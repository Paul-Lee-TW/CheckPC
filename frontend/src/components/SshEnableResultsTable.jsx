import { useBatchPoll } from '../hooks/useBatchPoll';

const STATUS = {
  pending:  { icon: '⏳', cls: 'text-muted',     label: '等待中' },
  running:  { icon: '🔄', cls: 'text-primary',   label: '處理中' },
  success:  { icon: '✅', cls: 'text-green-600', label: '已啟用' },
  partial:  { icon: '⚠️', cls: 'text-yellow-600',label: '部分完成' },
  blocked:  { icon: '🚫', cls: 'text-gray-500',  label: '無法連線' },
  error:    { icon: '❌', cls: 'text-red-600',   label: '失敗' },
};

const ERR_LABEL = {
  unsupported: '僅限 Windows 管理機', no_channel: '445/135 不可達', access_denied: '存取被拒（UAC/帳號）',
  auth: '帳密錯誤', firewall: '已裝但 22 被擋', install_failed: '安裝失敗',
  verify_timeout: '逾時未確認', spawn: '無法啟動 PowerShell', parse: '結果解析失敗', error: '錯誤',
};

/**
 * 遠端啟用 OpenSSH 結果表：輪詢進度，逐台顯示狀態；成功列可前往遠端掃描。
 */
export function SshEnableResultsTable({ batchId, onNewJob, onGoScan }) {
  const { job, error } = useBatchPoll(batchId, '/ssh-enable/');

  if (!job) {
    return <div className="text-muted text-sm">{error ? `載入失敗：${error}` : '載入中...'}</div>;
  }

  const c = job.counts;
  const finished = c.success + c.partial + c.blocked + c.error;
  const pct = job.total ? Math.round((finished / job.total) * 100) : 0;
  const done = job.status === 'done';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          進度 {finished}/{job.total}
          <span className="text-green-600 ml-3">✅ {c.success}</span>
          {c.partial > 0 && <span className="text-yellow-600 ml-2">⚠️ {c.partial}</span>}
          {c.blocked > 0 && <span className="text-gray-500 ml-2">🚫 {c.blocked}</span>}
          <span className="text-red-600 ml-2">❌ {c.error}</span>
          {done ? <span className="text-muted ml-3">已完成</span> : <span className="text-primary ml-3">處理中...</span>}
          {job.operator && <span className="text-muted ml-3">操作者：{job.operator}</span>}
        </div>
        <button onClick={onNewJob} className="text-sm text-primary hover:underline">+ 新作業</button>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-muted">
              <th className="py-2 px-3">主機</th>
              <th className="py-2 px-3">狀態</th>
              <th className="py-2 px-3">通道</th>
              <th className="py-2 px-3">訊息 / 動作</th>
            </tr>
          </thead>
          <tbody>
            {job.results.map((r) => {
              const s = STATUS[r.status] || STATUS.pending;
              return (
                <tr key={r.index} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-3 font-mono">{r.host}</td>
                  <td className={`py-2 px-3 ${s.cls}`}>{s.icon} {s.label}</td>
                  <td className="py-2 px-3 text-muted">{r.channel || '-'}</td>
                  <td className="py-2 px-3">
                    {r.status === 'success'
                      ? (onGoScan
                          ? <button onClick={onGoScan} className="text-primary hover:underline">前往遠端掃描</button>
                          : <span className="text-green-600">可掃描</span>)
                      : <span className="text-muted">{r.error ? (ERR_LABEL[r.error.type] || r.error.type) : ''}</span>}
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
