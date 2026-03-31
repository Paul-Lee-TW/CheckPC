import { useState } from 'react';

/**
 * 通用可增刪清單元件
 * @param {object} props
 * @param {Array} props.items - 清單項目
 * @param {Array} props.columns - 欄位定義 [{ key, label, placeholder, type, options }]
 * @param {function} props.onChange - 清單變更回呼
 * @param {function} [props.newItemTemplate] - 新項目範本函數
 */
export function EditableList({ items, columns, onChange, newItemTemplate }) {
  const [editingIdx, setEditingIdx] = useState(null);

  const handleAdd = () => {
    const newItem = newItemTemplate ? newItemTemplate() : {};
    columns.forEach((col) => {
      if (!(col.key in newItem)) {
        newItem[col.key] = col.options ? col.options[0] : '';
      }
    });
    onChange([...items, newItem]);
    setEditingIdx(items.length);
  };

  const handleRemove = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const handleChange = (idx, key, value) => {
    const updated = items.map((item, i) => (i === idx ? { ...item, [key]: value } : item));
    onChange(updated);
  };

  return (
    <div>
      {/* 表頭 */}
      <div className="hidden sm:grid gap-2 mb-1 text-xs font-medium text-muted"
        style={{ gridTemplateColumns: `${columns.map(() => '1fr').join(' ')} 60px` }}
      >
        {columns.map((col) => (
          <span key={col.key}>{col.label}</span>
        ))}
        <span></span>
      </div>

      {/* 列表 */}
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="grid gap-2 items-center bg-white border border-gray-200 rounded-lg px-3 py-2"
            style={{ gridTemplateColumns: `${columns.map(() => '1fr').join(' ')} 60px` }}
          >
            {columns.map((col) => (
              <div key={col.key}>
                {col.type === 'select' ? (
                  <select
                    value={item[col.key] || ''}
                    onChange={(e) => handleChange(idx, col.key, e.target.value)}
                    className="w-full text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {col.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={item[col.key] || ''}
                    onChange={(e) => handleChange(idx, col.key, e.target.value)}
                    placeholder={col.placeholder}
                    className="w-full text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
            ))}
            <button
              onClick={() => handleRemove(idx)}
              className="text-red-500 hover:text-red-700 text-sm px-2 py-1 rounded hover:bg-red-50 transition-colors"
              title="刪除"
            >
              刪除
            </button>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted text-center py-4">尚無項目</p>
      )}

      <button
        onClick={handleAdd}
        className="mt-2 text-sm text-primary hover:text-primary-hover font-medium flex items-center gap-1"
      >
        <span className="text-lg leading-none">+</span> 新增項目
      </button>
    </div>
  );
}
