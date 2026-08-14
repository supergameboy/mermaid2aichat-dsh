/**
 * Namespace 节点组件 — 渲染 classDiagram 命名空间容器
 *
 * 单一职责：渲染命名空间容器视觉（标题栏 + 边框），不负责子节点定位
 *
 * M3 重构模块4 L2-4：
 *   - 保持独立组件（用户决策：namespace 是标题栏 + 子节点容器复合结构，不适合 ShapeRenderer）
 *   - CSS 变量适配暗色模式（替换硬编码颜色）
 *   - NamespaceFlowNode 类型对齐 Converter 创建的 'class-namespace'
 *
 * 数据流:
 *   MermaidNode (type='class-namespace') → NamespaceNodeComponent
 *     → 标题栏 (data.label) + 边框 + 子节点容器
 *
 * React Flow Parent Node 机制:
 *   - 子节点通过 parentId 指向 namespace 节点
 *   - 子节点 extent: 'parent' 限制在父节点范围内
 *   - React Flow 自动管理子节点的相对定位
 *
 * 参考: packages/editor/src/nodes/flowchart/subgraph-node.tsx
 */

import { memo } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import type { ReactFlowNodeData } from '../../types.js';

// ============================================================
// 类型
// ============================================================

/** React Flow 节点类型，data 为 ReactFlowNodeData */
export type NamespaceFlowNode = Node<ReactFlowNodeData, 'class-namespace'>;

// ============================================================
// 常量
// ============================================================

const TITLE_HEIGHT = 28;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 100;

// ============================================================
// 节点组件
// ============================================================

/**
 * Namespace 节点组件
 *
 * 渲染标题栏 + 边框，子节点由 React Flow Parent Node 机制自动定位
 * 不渲染 Handle（namespace 本身不可连接，边连接到子节点）
 *
 * 颜色全部用 CSS 变量，自动适配暗色模式（:root ↔ .dark）
 */
export const NamespaceNodeComponent = memo(function NamespaceNodeComponent({
  data,
  selected,
}: NodeProps<NamespaceFlowNode>) {
  const borderColor = selected
    ? 'var(--class-namespace-selected-stroke)'
    : 'var(--class-namespace-stroke)';
  const label = data.label || '';

  return (
    <div
      className="class-namespace"
      style={{
        width: '100%',
        height: '100%',
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        border: `1px solid ${borderColor}`,
        borderRadius: '4px',
        backgroundColor: 'var(--class-namespace-bg)',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* 标题栏 */}
      <div
        className="class-namespace-title"
        style={{
          height: TITLE_HEIGHT,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--class-namespace-text)',
          backgroundColor: 'var(--class-namespace-header-bg)',
          borderBottom: `1px solid ${borderColor}`,
          borderRadius: '4px 4px 0 0',
          userSelect: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ marginRight: 6 }}>namespace</span>
        {label}
      </div>

      {/* 子节点容器 — React Flow 自动渲染子节点到此区域 */}
      <div
        className="class-namespace-content"
        style={{
          position: 'relative',
          width: '100%',
          height: `calc(100% - ${TITLE_HEIGHT}px)`,
        }}
      />
    </div>
  );
});

NamespaceNodeComponent.displayName = 'ClassNamespace';
