/**
 * ErSubgraphEditor — erDiagram 子图属性编辑面板
 *
 * 单一职责：编辑选中 er-subgraph 节点的 label（名称）和 dir（方向）
 *
 * M4 重构模块5 L2-2（基于 NamespaceEditor 模式）：
 *   - 编辑 label（子图名称）
 *   - 编辑 dir（方向 LR/RL/TB/BT，可选）
 *   - dir 类型为 string（MermaidNodeData.dir），选项对齐 FlowchartDirection
 *
 * 数据流:
 *   MermaidNode (type='er-subgraph') → ErSubgraphEditor
 *     → onUpdate(Partial<MermaidNodeData>) 编辑 label / dir
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块5-编辑器.md
 */

import { memo } from 'react';
import type { MermaidNode } from '@mermaid2aichat/serializer';

// ============================================================
// 常量
// ============================================================

/** 方向选项（对齐 FlowchartDirection：TB/TD/BT/RL/LR + 无） */
const DIR_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: '（默认）' },
  { value: 'LR', label: 'LR（左 → 右）' },
  { value: 'RL', label: 'RL（右 → 左）' },
  { value: 'TB', label: 'TB（上 → 下）' },
  { value: 'TD', label: 'TD（上 → 下，同 TB）' },
  { value: 'BT', label: 'BT（下 → 上）' },
];

// ============================================================
// Props
// ============================================================

export interface ErSubgraphEditorProps {
  /** 当前选中的 er-subgraph 节点（type='er-subgraph'） */
  readonly subgraphNode: MermaidNode;
  /** 编辑子图属性（走 onUpdateNode） */
  readonly onUpdate: (data: Partial<MermaidNode['data']>) => void;
}

// ============================================================
// 组件
// ============================================================

/** 子图编辑面板组件 — 编辑 label + dir */
export const ErSubgraphEditor = memo(function ErSubgraphEditor({
  subgraphNode,
  onUpdate,
}: ErSubgraphEditorProps) {
  const label = subgraphNode.data.label ?? '';
  const dir = (subgraphNode.data.dir as string | undefined) ?? '';

  return (
    <div className="panel-content">
      <div className="panel-section-title">子图</div>

      {/* 子图名称 */}
      <label className="panel-label">
        名称
        <input
          className="panel-input"
          type="text"
          value={label}
          placeholder="子图名称"
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {/* 方向（可选） */}
      <label className="panel-label">
        方向
        <select
          className="panel-select"
          value={dir}
          onChange={(e) => {
            const value = e.target.value;
            // 空字符串表示无方向（dir = undefined）
            onUpdate({ dir: value || undefined });
          }}
        >
          {DIR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      <div className="panel-info">
        <span className="info-label">ID:</span>
        <span className="info-value">{subgraphNode.id}</span>
      </div>
    </div>
  );
});

ErSubgraphEditor.displayName = 'ErSubgraphEditor';
