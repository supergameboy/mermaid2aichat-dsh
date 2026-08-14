/**
 * click 编辑面板 — 编辑节点的 click 交互（href 链接、callback 调用、tooltip）
 *
 * 单一职责：提供 FlowClickEvent 的编辑 UI
 *
 * 数据流:
 *   FlowClickEvent → ClickEditor → onUpdate(nodeId, Partial<FlowClickEvent>) → 更新 CanvasState
 *
 * click 语法:
 *   click nodeId href "https://example.com" _blank
 *   click nodeId call callbackFunction()
 *   click nodeId tooltip "提示文本"
 */

import { memo, useState, useEffect } from 'react';
import type { FlowClickEvent } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

export interface ClickEditorProps {
  /** 节点 ID */
  nodeId: string;
  /** 当前 click 事件（可选） */
  clickEvent?: FlowClickEvent;
  /** 更新 click 事件 */
  onUpdate: (nodeId: string, event: Partial<FlowClickEvent>) => void;
  /** 清除 click 事件 */
  onClear: (nodeId: string) => void;
}

// ============================================================
// 组件
// ============================================================

export const ClickEditor = memo(function ClickEditor({
  nodeId,
  clickEvent,
  onUpdate,
  onClear,
}: ClickEditorProps) {
  const [link, setLink] = useState(clickEvent?.link ?? '');
  const [linkTarget, setLinkTarget] = useState(clickEvent?.linkTarget ?? '_self');
  const [tooltip, setTooltip] = useState(clickEvent?.tooltip ?? '');
  const [functionName, setFunctionName] = useState(clickEvent?.functionName ?? '');

  // 同步外部更新
  useEffect(() => {
    setLink(clickEvent?.link ?? '');
    setLinkTarget(clickEvent?.linkTarget ?? '_self');
    setTooltip(clickEvent?.tooltip ?? '');
    setFunctionName(clickEvent?.functionName ?? '');
  }, [clickEvent]);

  const handleSaveLink = () => {
    if (link) {
      onUpdate(nodeId, { link, linkTarget });
    }
  };

  const handleSaveTooltip = () => {
    if (tooltip) {
      onUpdate(nodeId, { tooltip });
    }
  };

  const handleSaveCallback = () => {
    if (functionName) {
      onUpdate(nodeId, { functionName });
    }
  };

  return (
    <div className="click-editor" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>交互设置</h4>

      {/* href 链接 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>超链接 (href)</span>
        <input
          type="text"
          placeholder="https://example.com"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          style={inputStyle}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
          <span>打开方式:</span>
          <select
            value={linkTarget}
            onChange={(e) => setLinkTarget(e.target.value)}
            style={{ ...inputStyle, width: 'auto' }}
          >
            <option value="_self">当前窗口</option>
            <option value="_blank">新窗口</option>
            <option value="_parent">父窗口</option>
            <option value="_top">顶层窗口</option>
          </select>
        </label>
        <button onClick={handleSaveLink} disabled={!link} style={btnStyle(link)}>
          应用链接
        </button>
      </div>

      {/* Tooltip */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>提示文本 (tooltip)</span>
        <input
          type="text"
          placeholder="鼠标悬停提示"
          value={tooltip}
          onChange={(e) => setTooltip(e.target.value)}
          style={inputStyle}
        />
        <button onClick={handleSaveTooltip} disabled={!tooltip} style={btnStyle(tooltip)}>
          应用提示
        </button>
      </div>

      {/* Callback */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>回调函数 (call)</span>
        <input
          type="text"
          placeholder="callbackFunctionName"
          value={functionName}
          onChange={(e) => setFunctionName(e.target.value)}
          style={inputStyle}
        />
        <button onClick={handleSaveCallback} disabled={!functionName} style={btnStyle(functionName)}>
          应用回调
        </button>
      </div>

      {/* 清除按钮 */}
      {clickEvent && (
        <button
          onClick={() => onClear(nodeId)}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            border: '1px solid var(--color-destructive)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-destructive)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
          }}
        >
          清除所有交互
        </button>
      )}
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

function btnStyle(enabled: string): React.CSSProperties {
  return {
    padding: 'var(--space-2) var(--space-4)',
    border: '1px solid var(--color-info)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: enabled ? 'var(--color-info)' : 'var(--color-bg)',
    color: enabled ? 'var(--color-bg)' : 'var(--color-text-muted)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: 'var(--text-sm)',
  };
}
