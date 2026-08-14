/**
 * style 编辑面板 — 编辑节点的 inline style 和 classDef 应用
 *
 * 单一职责：提供节点 inline style 编辑和 classDef 应用 UI
 *
 * 数据流:
 *   node.data.style + node.data.classNames → StyleEditor → onUpdateStyle/onApplyClass → 更新 CanvasState
 *
 * style 语法:
 *   style nodeId fill:#f9f,stroke:#333,stroke-width:2px;
 *   inlineStyles 数组每项为 "key:value" 字符串
 */

import { memo, useState, useEffect } from 'react';
import type { FlowClass } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

export interface StyleEditorProps {
  /** 节点 ID */
  nodeId: string;
  /** 当前 inline 样式列表 */
  inlineStyles: string[];
  /** 当前应用的 classDef id 列表 */
  classes: string[];
  /** 可用的 classDef 列表 */
  availableClasses: FlowClass[];
  /** 更新 inline 样式 */
  onUpdateStyle: (nodeId: string, styles: string[]) => void;
  /** 应用/取消 classDef */
  onApplyClass: (nodeId: string, className: string) => void;
  /** 移除 classDef 应用 */
  onRemoveClass: (nodeId: string, className: string) => void;
}

// ============================================================
// 组件
// ============================================================

export const StyleEditor = memo(function StyleEditor({
  nodeId,
  inlineStyles,
  classes,
  availableClasses,
  onUpdateStyle,
  onApplyClass,
  onRemoveClass,
}: StyleEditorProps) {
  const [styleText, setStyleText] = useState(inlineStyles.join(','));

  // 同步外部更新
  useEffect(() => {
    setStyleText(inlineStyles.join(','));
  }, [inlineStyles]);

  const handleSaveStyle = () => {
    const styles = styleText
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    onUpdateStyle(nodeId, styles);
  };

  const handleToggleClass = (className: string) => {
    if (classes.includes(className)) {
      onRemoveClass(nodeId, className);
    } else {
      onApplyClass(nodeId, className);
    }
  };

  return (
    <div className="style-editor">
      <h4 className="editor-title">节点样式</h4>

      {/* Inline Style */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span className="editor-section-label">Inline 样式 (style)</span>
        <input
          type="text"
          placeholder="如: fill:#f9f,stroke:#333"
          value={styleText}
          onChange={(e) => setStyleText(e.target.value)}
          className="editor-input"
        />
        <button
          onClick={handleSaveStyle}
          className="editor-btn-primary"
        >
          应用样式
        </button>
      </div>

      {/* ClassDef 应用 */}
      {availableClasses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="editor-section-label">样式类 (class)</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {availableClasses.map((cls) => {
              const applied = classes.includes(cls.id);
              return (
                <label
                  key={cls.id}
                  className={`classdef-item ${applied ? 'classdef-item-applied' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={applied}
                    onChange={() => handleToggleClass(cls.id)}
                  />
                  <span>{cls.id}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                    ({cls.styles.join(',')})
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
