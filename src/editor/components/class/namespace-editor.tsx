/**
 * NamespaceEditor — classDiagram 命名空间编辑面板（节点编辑模式）
 *
 * 单一职责：编辑选中 namespace 节点的 data.label，只读展示包含的类
 *
 * M3 重构模块5 L2-8：
 *   - 从 metadata.namespaces 数组模式重构为节点编辑模式
 *   - 编辑选中 namespace 节点的 data.label（namespace 名称）
 *   - 只读展示包含的类（从 parentId 嵌套推断，过滤 parentId === namespaceNodeId 的 class-box 节点）
 *   - 无创建/删除按钮（通过节点库拖拽创建 + 选中删除）
 *
 * 数据流:
 *   namespaceNode + containedClasses → NamespaceEditor
 *     → onUpdate(Partial<MermaidNodeData>) 编辑 label
 *
 * 包含关系表达（对齐模块4 parentId 嵌套机制）:
 *   - 子节点通过 parentId 指向 namespace 节点
 *   - 子节点 extent: 'parent' 限制在父节点范围内
 *   - property-panel 从 nodes 过滤 parentId === namespaceNodeId 且 type==='class-box' 推断包含类
 *   - 用户想包含 class → 拖拽 class 节点到 namespace 内（设置 parentId，graph-canvas 处理）
 */

import { memo } from 'react';
import type { MermaidNode } from '@mermaid2aichat/serializer';

// ============================================================
// Props
// ============================================================

export interface NamespaceEditorProps {
  /** 当前选中的 namespace 节点（type='class-namespace'） */
  readonly namespaceNode: MermaidNode;
  /** 从 parentId 嵌套推断的包含类（只读展示） */
  readonly containedClasses: readonly MermaidNode[];
  /** 编辑 namespace 名称（走 onUpdateNode） */
  readonly onUpdate: (data: Partial<MermaidNode['data']>) => void;
}

// ============================================================
// 组件
// ============================================================

/** 命名空间编辑面板组件 — 节点编辑模式 */
export const NamespaceEditor = memo(function NamespaceEditor({
  namespaceNode,
  containedClasses,
  onUpdate,
}: NamespaceEditorProps) {
  const label = namespaceNode.data.label ?? '';

  return (
    <div className="panel-content">
      <div className="panel-section-title">命名空间</div>

      {/* 命名空间名称 */}
      <label className="panel-label">
        名称
        <input
          className="panel-input"
          type="text"
          value={label}
          placeholder="命名空间名称"
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {/* 包含的类（只读展示） */}
      <div className="panel-label">
        <div style={{ marginBottom: 'var(--space-1)' }}>包含类 ({containedClasses.length})</div>
        {containedClasses.length === 0 ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            拖拽 class 节点到 namespace 内以包含
          </span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {containedClasses.map((c) => (
              <span
                key={c.id}
                style={{
                  padding: '2px 8px',
                  backgroundColor: 'var(--color-bg-muted)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {c.data.label ?? c.id}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{namespaceNode.id}</span>
      </div>
    </div>
  );
});
