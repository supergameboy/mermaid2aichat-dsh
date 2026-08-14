/**
 * accTitle/accDescription 编辑面板 — 编辑无障碍标题和描述
 *
 * 单一职责：提供 GraphMetadata.accTitle 和 accDescription 的编辑 UI
 *
 * 数据流:
 *   GraphMetadata.accTitle/accDescription → AccEditor → onUpdate → 更新 CanvasState.metadata
 *
 * 语法:
 *   accTitle: 标题文本
 *   accDescr: 描述文本
 */

import { memo, useState, useEffect } from 'react';

// ============================================================
// 类型
// ============================================================

export interface AccEditorProps {
  /** 当前无障碍标题 */
  accTitle?: string;
  /** 当前无障碍描述 */
  accDescription?: string;
  /** 更新无障碍信息 */
  onUpdate: (data: { accTitle?: string; accDescription?: string }) => void;
}

// ============================================================
// 组件
// ============================================================

export const AccEditor = memo(function AccEditor({
  accTitle,
  accDescription,
  onUpdate,
}: AccEditorProps) {
  const [title, setTitle] = useState(accTitle ?? '');
  const [description, setDescription] = useState(accDescription ?? '');

  // 同步外部更新
  useEffect(() => {
    setTitle(accTitle ?? '');
  }, [accTitle]);

  useEffect(() => {
    setDescription(accDescription ?? '');
  }, [accDescription]);

  const handleSave = () => {
    onUpdate({
      accTitle: title || undefined,
      accDescription: description || undefined,
    });
  };

  return (
    <div className="acc-editor" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>无障碍设置</h4>

      {/* accTitle */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>无障碍标题 (accTitle)</span>
        <input
          type="text"
          placeholder="图表标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
      </label>

      {/* accDescription */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>无障碍描述 (accDescr)</span>
        <textarea
          placeholder="图表描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>

      <button
        onClick={handleSave}
        style={{
          padding: 'var(--space-2) var(--space-4)',
          border: '1px solid var(--color-info)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--color-info)',
          color: 'var(--color-bg)',
          cursor: 'pointer',
          fontSize: 'var(--text-sm)',
        }}
      >
        保存
      </button>
    </div>
  );
});

// ============================================================
// 辅助
// ============================================================

const inputStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-sm)',
};
