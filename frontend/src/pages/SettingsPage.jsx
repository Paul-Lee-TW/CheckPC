import { useState, useEffect } from 'react';
import { PageCard } from '../components/PageCard';
import { EditableList } from '../components/EditableList';
import { api } from '../lib/api';
import { DEFAULT_SETTINGS } from '../lib/defaultSettings';

export function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // 載入設定
  useEffect(() => {
    api.get('/settings')
      .then((data) => {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      })
      .catch(() => {
        // 使用預設值
      })
      .finally(() => setLoading(false));
  }, []);

  // 儲存設定
  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api.put('/settings', settings);
      setMessage('設定已儲存');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(`儲存失敗: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 匯出 config.json
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 重設為預設值
  const handleReset = () => {
    if (confirm('確定要重設為預設值嗎？所有自訂設定將會遺失。')) {
      setSettings(DEFAULT_SETTINGS);
    }
  };

  if (loading) {
    return <p className="text-muted text-center py-8">載入設定中...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">設定</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            匯出 config.json
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            重設預設值
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`text-sm px-4 py-2 rounded-lg ${
          message.includes('失敗') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* 核准軟體白名單 */}
      <PageCard title="核准軟體白名單（項目 5、6）">
        <p className="text-sm text-muted mb-3">
          定義公司允許安裝的軟體。不在清單上的軟體將標記為「未授權」。支援 * 模糊比對（如 Microsoft* 匹配所有微軟產品）。
        </p>
        <EditableList
          items={settings.approvedSoftware}
          columns={[
            { key: 'name', label: '軟體名稱', placeholder: '例: Microsoft*' },
            {
              key: 'category',
              label: '類別',
              type: 'select',
              options: ['system', 'driver', 'authorized', 'security', 'tool'],
            },
          ]}
          onChange={(items) => setSettings({ ...settings, approvedSoftware: items })}
          newItemTemplate={() => ({ name: '', category: 'authorized' })}
        />
      </PageCard>

      {/* 遠端/通訊軟體關鍵字 */}
      <PageCard title="遠端/通訊軟體關鍵字（項目 6）">
        <p className="text-sm text-muted mb-3">
          未授權軟體中若名稱包含以下關鍵字，會額外標記為「遠端/通訊軟體」。
        </p>
        <div className="flex flex-wrap gap-2">
          {(settings.remoteCommKeywords || []).map((kw, i) => (
            <span key={i} className="flex items-center gap-1 text-sm bg-red-50 text-red-700 px-3 py-1 rounded-full border border-red-200">
              {kw}
              <button
                onClick={() => {
                  const updated = settings.remoteCommKeywords.filter((_, idx) => idx !== i);
                  setSettings({ ...settings, remoteCommKeywords: updated });
                }}
                className="text-red-400 hover:text-red-600 ml-1"
              >
                x
              </button>
            </span>
          ))}
          <button
            onClick={() => {
              const kw = prompt('輸入關鍵字');
              if (kw) {
                setSettings({
                  ...settings,
                  remoteCommKeywords: [...(settings.remoteCommKeywords || []), kw],
                });
              }
            }}
            className="text-sm text-primary hover:text-primary-hover font-medium px-3 py-1 border border-dashed border-primary rounded-full"
          >
            + 新增
          </button>
        </div>
      </PageCard>

      {/* 資料夾權限規則 */}
      <PageCard title="資料夾權限規則（項目 4）">
        <p className="text-sm text-muted mb-3">
          定義資料夾路徑和預期的存取權限，掃描時會用 Get-Acl 比對實際 ACL。
        </p>
        <EditableList
          items={settings.folderRules}
          columns={[
            { key: 'path', label: '資料夾路徑', placeholder: '\\\\Server\\公用\\業務部' },
            { key: 'allowedGroups', label: '允許的使用者/群組', placeholder: '業務部, IT部' },
            {
              key: 'accessLevel',
              label: '權限等級',
              type: 'select',
              options: ['Read', 'ReadWrite', 'FullControl', 'None'],
            },
          ]}
          onChange={(items) => setSettings({ ...settings, folderRules: items })}
          newItemTemplate={() => ({ path: '', allowedGroups: '', accessLevel: 'Read' })}
        />
      </PageCard>

      {/* 網站封鎖清單 */}
      <PageCard title="網站封鎖清單（項目 2 + 11）">
        <p className="text-sm text-muted mb-3">
          定義需要封鎖的網站。掃描時會測試是否可連線，分為「私人信箱雲端」（項目 2）和「影音社群」（項目 11）。
        </p>
        <EditableList
          items={settings.blockedSites}
          columns={[
            { key: 'url', label: '網站網址', placeholder: 'www.example.com' },
            { key: 'name', label: '顯示名稱', placeholder: 'Example' },
            {
              key: 'category',
              label: '類別',
              type: 'select',
              options: ['email', 'social'],
            },
          ]}
          onChange={(items) => setSettings({ ...settings, blockedSites: items })}
          newItemTemplate={() => ({ url: '', name: '', category: 'social' })}
        />
      </PageCard>
    </div>
  );
}
