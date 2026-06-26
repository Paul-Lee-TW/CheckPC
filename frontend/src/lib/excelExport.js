import * as XLSX from 'xlsx';
import { CHECKLIST_ITEMS, evaluateAll } from './checklistItems';

const STATUS_TEXT = {
  pass: '符合',
  fail: '異常',
  warning: '待確認',
  pending: '待檢查',
  error: '錯誤',
};

/**
 * 匯出稽核結果為 Excel
 * @param {object} param
 * @param {object} param.auditInfo - 基本資訊
 * @param {object} param.scanData - 掃描原始資料
 * @param {object} param.results - 各項結果
 */
export function exportToExcel({ auditInfo, scanData, results }) {
  const info = auditInfo || {};
  const wb = XLSX.utils.book_new();

  // ===== Sheet 1: 電腦稽核單 =====
  const rows = [];

  // 標題
  rows.push(['電腦稽核單']);
  rows.push([]);

  // 基本資訊
  rows.push(['受稽核單位 / 姓名', `${info.department || ''} / ${info.auditee || ''}`,'', '稽核日期', info.auditDate || '']);
  rows.push(['設備類型', info.deviceType || '', '', '資產編號', info.assetNumber || '']);
  rows.push(['電腦名稱', scanData?.computerName || '', '', '掃描時間', scanData?.scanTimestamp || '']);
  rows.push([]);

  // 檢查項目表頭
  rows.push(['項次', '查核項目', '結果', '備註']);

  // 各項檢查
  for (const item of CHECKLIST_ITEMS) {
    const r = results?.[item.id] || {};
    const status = STATUS_TEXT[r.status] || '未檢查';
    const remark = r.remark || '';
    const detail = r.detail || '';
    const remarkFull = [detail, remark].filter(Boolean).join(' | ');

    rows.push([item.number, item.label, status, remarkFull]);
  }

  rows.push([]);

  // 簽名區
  rows.push(['被稽核者確認聲明：']);
  rows.push(['本人確認上述設備及其使用情形均為目前實際狀況；如有未經公司核准之設備或軟體，已據實揭露。']);
  rows.push([]);
  rows.push(['被稽核者簽名/日期', '', '', '稽核員/日期', info.auditor || '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 設定欄寬
  ws['!cols'] = [
    { wch: 6 },   // 項次
    { wch: 55 },  // 查核項目
    { wch: 10 },  // 結果
    { wch: 45 },  // 備註
    { wch: 18 },  // 第五欄（日期等）
  ];

  // 合併標題列
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // 標題
  ];

  XLSX.utils.book_append_sheet(wb, ws, '電腦稽核單');

  // ===== Sheet 2: 未授權軟體明細（如果有）=====
  const softwareResult = results?.item05;
  if (softwareResult?.items && softwareResult.items.length > 0) {
    const swRows = [['未授權軟體明細'], []];
    swRows.push(['軟體名稱', '發行者', '版本', '遠端/通訊軟體']);
    for (const sw of softwareResult.items) {
      swRows.push([sw.name, sw.publisher || '', sw.version || '', sw.isRemoteComm ? '是' : '']);
    }
    const swSheet = XLSX.utils.aoa_to_sheet(swRows);
    swSheet['!cols'] = [{ wch: 40 }, { wch: 25 }, { wch: 15 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, swSheet, '未授權軟體');
  }

  // 產出檔案
  const computerName = scanData?.computerName || 'PC';
  const date = (info.auditDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const filename = `電腦稽核單_${computerName}_${date}.xlsx`;

  XLSX.writeFile(wb, filename);
}

/**
 * 匯出批次稽核總表（多台彙整成單一活頁簿）。
 * @param {object} param
 * @param {object} param.batch - 批次工作（id / operator 等）
 * @param {Array} param.perHostResults - [{ host, scanData }]（每台成功掃描的原始結果）
 */
export function exportBatchToExcel({ batch, perHostResults }) {
  const wb = XLSX.utils.book_new();
  const rows = [];

  rows.push(['批次稽核總表']);
  rows.push([
    `批次 ID: ${batch?.id || ''}`,
    `操作者: ${batch?.operator || ''}`,
    `產生時間: ${new Date().toLocaleString()}`,
  ]);
  rows.push([]);

  // 表頭：基本欄 + 每項稽核欄
  const header = ['電腦名稱', '主機', '符合', '異常', '待確認', '待檢查'];
  for (const item of CHECKLIST_ITEMS) header.push(`${item.number}. ${item.label}`);
  rows.push(header);

  // 每台一列
  for (const { host, scanData } of perHostResults || []) {
    const results = evaluateAll(scanData);
    let pass = 0, fail = 0, warning = 0, pending = 0;
    const statusCells = [];
    for (const item of CHECKLIST_ITEMS) {
      const st = results[item.id]?.status;
      if (st === 'pass') pass++;
      else if (st === 'fail') fail++;
      else if (st === 'warning') warning++;
      else pending++;
      statusCells.push(STATUS_TEXT[st] || '未檢查');
    }
    rows.push([scanData?.computerName || '', host, pass, fail, warning, pending, ...statusCells]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 }, { wch: 16 }, { wch: 6 }, { wch: 6 }, { wch: 8 }, { wch: 8 },
    ...CHECKLIST_ITEMS.map(() => ({ wch: 16 })),
  ];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  XLSX.utils.book_append_sheet(wb, ws, '批次總表');

  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  XLSX.writeFile(wb, `批次稽核總表_${date}.xlsx`);
}
