/**
 * subgraph 编辑面板 — 编辑子图标题、方向、成员管理
 *
 * 单一职责：提供 subgraph 节点的编辑 UI（标题、方向、成员移入/移出）
 *
 * 数据流:
 *   MermaidNode (subgraph) → SubgraphEditor → onChange/onDelete/onMoveToSubgraph → 更新 CanvasState
 *
 * 设计变更（M1）:
 *   - Props 从 FlowSubGraph（AST 类型）改为 MermaidNode（画布节点类型）
 *   - 新增 onCreateSubgraph 回调（创建子图包含选中节点）
 *   - 新增 onMoveToSubgraph 回调（成员移入/移出子图）
 */

import { memo, useState, useEffect } from 'react';
import type { MermaidNode, FlowchartDirection } from '@mermaid2aichat/serializer';

// ============================================================
// 类型
// ============================================================

export interface SubgraphEditorProps {
  /** 当前编辑的 subgraph 节点 */
  subgraph: MermaidNode;
  /** 画布上所有节点（用于成员管理列表） */
  nodes: MermaidNode[];
  /** 更新 subgraph 节点属性 */
  onChange: (updates: Partial<MermaidNode>) => void;
  /** 删除 subgraph */
  onDelete: () => void;
  /** 创建新 subgraph（包含选中节点） */
  onCreateSubgraph?: (title: string, selectedNodeIds: string[]) => void;
  /** 移动节点到子图（subgraphId 为 null 表示移出到顶层） */
  onMoveToSubgraph?: (nodeId: string, subgraphId: string | null) => void;
}

// ============================================================
// 常量
// ============================================================

const DIRECTION_OPTIONS: { value: FlowchartDirection | ''; label: string }[] = [
  { value: '', label: '继承父级' },
  { value: 'TB', label: 'TB (上→下)' },
  { value: 'TD', label: 'TD (上→下)' },
  { value: 'BT', label: 'BT (下→上)' },
  { value: 'LR', label: 'LR (左→右)' },
  { value: 'RL', label: 'RL (右→左)' },
];

// ============================================================
// 组件
// ============================================================

export const SubgraphEditor = memo(function SubgraphEditor({
  subgraph,
  nodes,
  onChange,
  onDelete,
  onMoveToSubgraph,
}: SubgraphEditorProps) {
  const [title, setTitle] = useState(subgraph.data.label ?? '');

  // 同步外部更新
  useEffect(() => {
    setTitle(subgraph.data.label ?? '');
  }, [subgraph.data.label]);

  const handleTitleCommit = () => {
    if (title !== (subgraph.data.label ?? '')) {
      onChange({
        data: { ...subgraph.data, label: title },
      });
    }
  };

  const handleDirectionChange = (value: string) => {
    if (value === '') {
      onChange({
        data: { ...subgraph.data, dir: undefined, hasExplicitDir: false },
      });
    } else {
      onChange({
        data: { ...subgraph.data, dir: value, hasExplicitDir: true },
      });
    }
  };

  // 当前子图的成员节点（parentId 指向此 subgraph）
  const memberNodes = nodes.filter((n) => n.parentId === subgraph.id);
  // 可移入的节点（顶层节点，非 subgraph 自身，非已成员）
  const availableNodes = nodes.filter(
    (n) => n.id !== subgraph.id && !n.parentId && !n.data.isSubgraph,
  );

  const handleMoveOut = (nodeId: string) => {
    onMoveToSubgraph?.(nodeId, null);
  };

  const handleMoveIn = (nodeId: string) => {
    onMoveToSubgraph?.(nodeId, subgraph.id);
  };

  const dir = subgraph.data.dir;

  return (
    <div className="subgraph-editor" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>子图编辑</h4>

      {/* 标题 */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>标题</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleCommit}
          onKeyDown={(e) => e.key === 'Enter' && handleTitleCommit()}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}
        />
      </label>

      {/* 方向 */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>方向</span>
        <select
          value={dir ?? ''}
          onChange={(e) => handleDirectionChange(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}
        >
          {DIRECTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* 成员节点列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>包含节点 ({memberNodes.length})</span>
        <div style={{
          padding: 'var(--space-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-xs)',
          backgroundColor: 'var(--color-bg-muted)',
          maxHeight: '120px',
          overflowY: 'auto',
        }}>
          {memberNodes.length === 0
            ? <span style={{ color: 'var(--color-text-muted)' }}>无子节点</span>
            : memberNodes.map((node) => (
              <div
                key={node.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '2px 0',
                }}
              >
                <span>{node.data.label ?? node.id}</span>
                {onMoveToSubgraph && (
                  <button
                    onClick={() => handleMoveOut(node.id)}
                    style={{
                      padding: '0 6px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '3px',
                      backgroundColor: 'var(--color-bg)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--color-destructive)',
                    }}
                  >
                    移出
                  </button>
                )}
              </div>
            ))
          }
        </div>
      </div>

      {/* 可移入节点列表 */}
      {onMoveToSubgraph && availableNodes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>可移入节点 ({availableNodes.length})</span>
          <div style={{
            padding: 'var(--space-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            backgroundColor: 'var(--color-bg-muted)',
            maxHeight: '120px',
            overflowY: 'auto',
          }}>
            {availableNodes.map((node) => (
              <div
                key={node.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '2px 0',
                }}
              >
                <span>{node.data.label ?? node.id}</span>
                <button
                  onClick={() => handleMoveIn(node.id)}
                  style={{
                    padding: '0 6px',
                    border: '1px solid var(--color-info)',
                    borderRadius: '3px',
                    backgroundColor: 'var(--color-bg)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    color: 'var(--color-info)',
                  }}
                >
                  移入
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 应用的 classDef */}
      {(() => {
        const classNames = subgraph.data.classNames;
        if (!classNames || classNames.length === 0) return null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>应用样式类</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
              {classNames.map((cls) => (
                <span
                  key={cls}
                  style={{
                    padding: '2px 8px',
                    backgroundColor: 'var(--color-bg-muted)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  {cls}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 删除按钮 */}
      <button
        onClick={onDelete}
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
        删除子图
      </button>
    </div>
  );
});


