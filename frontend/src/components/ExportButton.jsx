import { exportToExcel } from '../lib/excelExport';

export function ExportButton({ auditData, disabled }) {
  const handleExport = () => {
    try {
      exportToExcel(auditData);
    } catch (err) {
      alert(`匯出失敗: ${err.message}`);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled}
      className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      匯出 Excel
    </button>
  );
}
