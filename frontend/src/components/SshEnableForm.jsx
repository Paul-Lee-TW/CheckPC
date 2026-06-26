import { useState, useEffect } from 'react';
import { api } from '../lib/api';

/**
 * 遠端啟用 OpenSSH 表單：共用管理員帳密 + 主機清單挑選 + 貼上主機 + 來源限縮 + 並行數。
 * onStarted(batchId) 於成功建立作業後呼叫。
 */
export function SshEnableForm({ onStarted }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [operator, setOperator] = useState('');
  const [allowedSource, setAllowedSource] = useState('');
  const [concurrency, setConcurrency] = useState(4);
  const [pasteText, setPasteText] = useState('');
  const [inventory, setInventory] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/inventory').then(setInventory).catch(() => {});
  }, []);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parsePaste = () =>
    pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [host, port] = line.split(':');
        return { host: (host || '').trim(), port: port ? parseInt(port, 10) : 22 };
      })
      .filter((t) => t.host);

  const buildTargets = () => {
    const fromInv = inventory.filter((i) => selected.has(i.id)).map((i) => ({ host: i.host, port: i.port || 22 }));
    const fromPaste = parsePaste();
    const seen = new Set();
    return [...fromInv, ...fromPaste]
      .filter((t) => {
        const k = `${t.host}:${t.port}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((t) => ({ ...t, username, password }));
  };

  const targetCount = buildTargets().length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const targets = buildTargets();
    if (!username || !password) { setError('請填寫共用的管理員帳號和密碼'); return; }
    if (targets.length === 0) { setError('請至少選擇或輸入一台目標主機'); return; }
    setSubmitting(true);
    try {
      const data = await api.post('/ssh-enable', {
        targets,
        concurrency: Number(concurrency),
        operator: operator || undefined,
        allowedSource: allowedSource || undefined,
      });
      onStarted(data.batchId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-xs space-y-1">
        <p>⚠️ 此功能會以系統管理共用（SMB）複製檔案並透過 WMI 以 <b>SYSTEM</b> 在目標機安裝 OpenSSH，屬標準端點管理。</p>
        <p>僅限**受信任內網**、對**自有電腦**使用；需目標可達 445 與 135、且帳號具系統管理權限。密碼僅本次使用，不會儲存或寫入軌跡。</p>
        <p>⚙️ 僅在 <b>Windows 管理機</b>上執行有效（後端需呼叫 Windows 內建工具）。</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">管理員帳號（共用）</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="DOMAIN\\user 或 HOST\\Administrator" required className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">管理員密碼（共用）</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="密碼" required className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">允許來源（防火牆 RemoteAddress）</label>
          <input type="text" value={allowedSource} onChange={(e) => setAllowedSource(e.target.value)}
            placeholder="例：192.168.50.0/24（留空＝對所有來源開放）" className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">並行數</label>
          <select value={concurrency} onChange={(e) => setConcurrency(e.target.value)} className={inputCls}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">稽核人員（操作者）</label>
          <input type="text" value={operator} onChange={(e) => setOperator(e.target.value)}
            placeholder="選填，記入稽核軌跡" className={inputCls} />
        </div>
      </div>

      {inventory.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1">從主機清單選擇</label>
          <div className="border border-border rounded-lg p-2 max-h-40 overflow-auto space-y-1">
            {inventory.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                <span className="font-medium">{i.label}</span>
                <span className="text-muted">({i.host}:{i.port})</span>
                {i.group && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{i.group}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">或貼上主機（每行一筆 host[:port]）</label>
        <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={5}
          placeholder={'192.168.50.68\n192.168.50.69'}
          className={`${inputCls} font-mono text-sm`} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
      )}

      <button type="submit" disabled={submitting}
        className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {submitting ? '建立作業中...' : `開始遠端啟用（${targetCount} 台）`}
      </button>
    </form>
  );
}
