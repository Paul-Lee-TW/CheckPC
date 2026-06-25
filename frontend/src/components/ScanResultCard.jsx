export function ScanResultCard({ items, itemId }) {
  if (!items || items.length === 0) return null;

  // 根據不同項目類型顯示不同格式
  if (itemId === 'item01') {
    return (
      <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-medium text-muted mb-2">本機啟用帳號：</p>
        <div className="flex flex-wrap gap-1">
          {items.map((user, i) => (
            <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded">{user}</span>
          ))}
        </div>
      </div>
    );
  }

  if (itemId === 'item05') {
    return (
      <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3 max-h-60 overflow-auto">
        <p className="text-xs font-medium text-muted mb-2">未授權軟體明細：</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 pr-2">軟體名稱</th>
              <th className="text-left py-1 pr-2">發行者</th>
              <th className="text-left py-1">類型</th>
            </tr>
          </thead>
          <tbody>
            {items.map((sw, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1 pr-2">{sw.name}</td>
                <td className="py-1 pr-2 text-muted">{sw.publisher || '-'}</td>
                <td className="py-1">
                  {sw.isRemoteComm && (
                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs">遠端/通訊</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (itemId === 'item06') {
    return (
      <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-medium text-muted mb-2">偵測到的遠端/通訊軟體：</p>
        {items.map((sw, i) => (
          <div key={i} className="text-xs py-1 border-b border-gray-100 last:border-0">
            <span className="font-medium">{sw.name}</span>
            {sw.version && <span className="text-muted ml-2">v{sw.version}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (itemId === 'item04') {
    return (
      <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-medium text-muted mb-2">資料夾權限檢查結果：</p>
        {items.map((rule, i) => (
          <div key={i} className="text-xs py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2">
              <span>{rule.status === 'pass' ? '✅' : rule.status === 'not_found' ? '❓' : '❌'}</span>
              <span className="font-mono text-gray-700">{rule.path}</span>
            </div>
            <div className="ml-6 text-muted mt-0.5">
              預期: {rule.expectedAccess} | 允許: {rule.allowedGroups?.join(', ')}
              {rule.status === 'not_found' && ' | 資料夾不存在'}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (itemId === 'item02' || itemId === 'item11') {
    return (
      <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-medium text-muted mb-2">網站連線測試結果：</p>
        {items.map((site, i) => (
          <div key={i} className="text-xs py-1 flex items-center gap-2 border-b border-gray-100 last:border-0">
            <span>{site.accessible ? '🔴 可連線' : '✅ 已封鎖'}</span>
            <span className="font-medium">{site.name}</span>
            <span className="text-muted">({site.url})</span>
          </div>
        ))}
      </div>
    );
  }

  if (itemId === 'item09' || itemId === 'item10') {
    return (
      <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3 max-h-40 overflow-auto">
        <p className="text-xs font-medium text-muted mb-2">USB 裝置清單：</p>
        {items.map((dev, i) => (
          <div key={i} className="text-xs py-1 border-b border-gray-100 last:border-0">
            <span className="font-medium">{dev.name || dev.model || 'Unknown'}</span>
            {dev.class && <span className="text-muted ml-2">[{dev.class}]</span>}
            {dev.size && <span className="text-muted ml-2">{dev.size} GB</span>}
          </div>
        ))}
      </div>
    );
  }

  if (itemId === 'item13') {
    return (
      <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3 max-h-60 overflow-auto">
        <p className="text-xs font-medium text-muted mb-2">本機 Administrators 群組成員：</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 pr-2">帳號</th>
              <th className="text-left py-1 pr-2">類型</th>
              <th className="text-left py-1">來源</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1 pr-2">
                  <span className="font-medium">{m.name}</span>
                  {m.isBuiltinAdmin && (
                    <span className="ml-2 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">內建</span>
                  )}
                  {!m.isBuiltinAdmin && m.objectClass === 'User' && (
                    <span className="ml-2 bg-red-100 text-red-700 px-1.5 py-0.5 rounded">額外管理員</span>
                  )}
                </td>
                <td className="py-1 pr-2 text-muted">{m.objectClass || '-'}</td>
                <td className="py-1 text-muted">{m.source || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 預設：顯示 JSON
  return (
    <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3">
      <pre className="text-xs overflow-auto max-h-40">{JSON.stringify(items, null, 2)}</pre>
    </div>
  );
}
