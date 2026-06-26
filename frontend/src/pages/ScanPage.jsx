import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageCard } from '../components/PageCard';
import { RemoteScanForm } from '../components/RemoteScanForm';
import { BatchScanForm } from '../components/BatchScanForm';
import { BatchResultsTable } from '../components/BatchResultsTable';
import { api } from '../lib/api';

export function ScanPage() {
  const [tab, setTab] = useState('remote');
  const [jsonText, setJsonText] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [batchId, setBatchId] = useState(null);
  const navigate = useNavigate();

  const handleScanComplete = (data) => {
    // 儲存掃描結果到 sessionStorage，然後跳轉
    sessionStorage.setItem('checkpc_scan', JSON.stringify(data));
    navigate('/audit');
  };

  const handleManualUpload = () => {
    setUploadError('');
    try {
      const cleanText = jsonText.replace(/\uFEFF/g, '').replace(/\0/g, '').trim();
      const parsed = JSON.parse(cleanText);
      if (!parsed.items) {
        throw new Error('JSON 缺少 items 欄位');
      }
      const data = { id: `manual-${Date.now()}`, result: parsed };
      handleScanComplete(data);
    } catch (err) {
      setUploadError(`JSON 解析失敗: ${err.message}`);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError('');
    try {
      // Send raw file to backend for encoding-safe parsing
      const buf = await file.arrayBuffer();
      const res = await fetch('/api/audit/upload-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      handleScanComplete(data);
    } catch (err) {
      setUploadError(`Upload failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">電腦稽核掃描</h1>

      {/* Tab 切換 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('remote')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'remote' ? 'bg-white shadow text-primary' : 'text-muted hover:text-gray-700'
          }`}
        >
          遠端掃描 (SSH)
        </button>
        <button
          onClick={() => setTab('manual')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'manual' ? 'bg-white shadow text-primary' : 'text-muted hover:text-gray-700'
          }`}
        >
          手動上傳
        </button>
        <button
          onClick={() => setTab('batch')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'batch' ? 'bg-white shadow text-primary' : 'text-muted hover:text-gray-700'
          }`}
        >
          批次掃描
        </button>
      </div>

      {/* 遠端掃描 */}
      {tab === 'remote' && (
        <PageCard title="遠端掃描">
          <p className="text-sm text-muted mb-4">
            輸入目標 PC 的 IP 位址和 SSH 帳密，系統會透過 SSH 連線遠端執行掃描腳本。
            目標 PC 需已啟用 OpenSSH Server。
          </p>
          <RemoteScanForm onScanComplete={handleScanComplete} />
        </PageCard>
      )}

      {/* 手動上傳 */}
      {tab === 'manual' && (
        <PageCard title="手動上傳掃描結果">
          <p className="text-sm text-muted mb-4">
            在目標 PC 上手動執行 CheckPC.ps1 後，將 JSON 結果貼上或上傳檔案。
          </p>

          <div className="flex gap-2 mb-4">
            <a
              href="/api/audit/script"
              download
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              下載 CheckPC.ps1
            </a>
            <span className="text-muted">|</span>
            <a
              href="/api/audit/config"
              download
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              下載 config.json
            </a>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-muted font-mono">
            powershell -ExecutionPolicy Bypass -File CheckPC.ps1 &gt; result.json
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">上傳 JSON 檔案</label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">或直接貼上 JSON</label>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{"scanTimestamp":"...","computerName":"...","items":{...}}'
                rows={8}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {uploadError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {uploadError}
              </div>
            )}

            <button
              onClick={handleManualUpload}
              disabled={!jsonText.trim()}
              className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              驗證並繼續
            </button>
          </div>
        </PageCard>
      )}

      {/* 批次掃描 */}
      {tab === 'batch' && (
        <PageCard title={batchId ? '批次掃描進度' : '批次掃描'}>
          {!batchId ? (
            <>
              <p className="text-sm text-muted mb-4">
                一次對多台目標 PC 執行遠端掃描。可從主機清單選擇或貼上 IP，使用共用帳密連線。
                目標 PC 需已啟用 OpenSSH Server。
              </p>
              <BatchScanForm onStarted={setBatchId} />
            </>
          ) : (
            <BatchResultsTable batchId={batchId} onNewBatch={() => setBatchId(null)} />
          )}
        </PageCard>
      )}
    </div>
  );
}
