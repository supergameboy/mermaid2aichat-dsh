/**
 * Note 节点组件 — 渲染 classDiagram 的注释节点（折角矩形）
 *
 * 单一职责：调用 ShapeRenderer 渲染 class-note 形状，管理 Handle 连接点
 *
 * M3 重构模块4 L2-3：
 *   - 调用 ShapeRenderer(shape='class-note')，复用 ShapeGeometry 的折角矩形几何
 *   - CSS 变量适配暗色模式（fill/stroke/color 用 CSS 变量）
 *   - selected 状态由 NoteNodeComponent 控制（不传给 ShapeRenderer，避免 ShapeRenderer 用全局 --node-selected-stroke 覆盖 class-note 专属色）
 *
 * 数据流:
 *   MermaidNode (type='class-note') → NoteNodeComponent
 *     → ShapeRenderer(shape='class-note', label=data.label, style=nodeStyle)
 *     → 折角矩形 SVG（fill=var(--class-note-bg), stroke=var(--class-note-stroke)）
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { NodeStyle } from '@mermaid2aichat/serializer';
import { ShapeRenderer, handleStyle } from '../flowchart/shapes/shape-component.js';
import type { ReactFlowNodeData } from '../../types.js';

// ============================================================
// 类型
// ============================================================

/** React Flow 节点类型，data 为 ReactFlowNodeData */
export type NoteFlowNode = Node<ReactFlowNodeData, 'class-note'>;

// ============================================================
// 节点组件
// ============================================================

/** Note 节点组件 — 渲染 classDiagram 注释（折角矩形，接入 ShapeRenderer） */
export const NoteNodeComponent = memo(function NoteNodeComponent({
  data,
  selected,
}: NodeProps<NoteFlowNode>) {
  // CSS 变量适配暗色模式 + selected 状态
  // NoteNodeComponent 自己控制 selected（传 selected={false} 给 ShapeRenderer），
  // 避免 ShapeRenderer 内部用全局 --node-selected-stroke 覆盖 class-note 专属 selected 色
  const nodeStyle: NodeStyle = {
    fill: 'var(--class-note-bg)',
    stroke: selected ? 'var(--class-note-selected-stroke)' : 'var(--class-note-stroke)',
    color: 'var(--class-note-text)',
    strokeWidth: selected ? 2 : 1,
  };

  return (
    <div className="class-note" style={{ position: 'relative', display: 'inline-block' }}>
      {/* 四方向 Handle — 支持任意方向连接 */}
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
      <ShapeRenderer
        shape="class-note"
        label={data.label ?? ''}
        style={nodeStyle}
        selected={false}
      />
    </div>
  );
});

NoteNodeComponent.displayName = 'ClassNote';
