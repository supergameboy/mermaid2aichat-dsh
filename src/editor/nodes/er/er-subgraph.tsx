/**
 * er-subgraph 节点组件 — 渲染 ER 子图边框 + 标题栏，子实体由 React Flow Parent Node 机制管理
 *
 * 单一职责：渲染 ER subgraph 容器视觉（标题栏 + 边框），不负责子节点定位
 *
 * 模块4 L2-6（套用 NamespaceNodeComponent 模式）：
 *   - CSS 变量适配暗色模式（替换硬编码颜色，对齐 class-namespace 模式）
 *   - 共享 ER_SUBGRAPH_CONSTANTS（单一数据源）
 *   - 保持 Parent Node 机制不变
 *
 * 数据流:
 *   MermaidNode (type='er-subgraph') → ErSubgraphComponent
 *     → 标题栏 (data.label + data.dir) + 边框 + 子节点容器
 *
 * React Flow Parent Node 机制:
 *   - 子实体节点通过 parentId 指向 subgraph 节点
 *   - 子实体节点 extent: 'parent' 限制在父节点范围内
 *   - React Flow 自动管理子节点的相对定位
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块4-渲染器.md
 */

import { memo } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import type { ReactFlowNodeData } from '../../types.js';
import { ER_SUBGRAPH_CONSTANTS as C } from './er-subgraph-constants.js';

// ============================================================
// 类型
// ============================================================

/**
 * er-subgraph 节点数据
 *
 * dir 字段已在 MermaidNodeData 中显式声明（types.ts），无需在此扩展。
 * 类型形式选择：必须使用 `type` 别名，不可改回 `interface extends`。
 * 原因：interface 不享有隐式索引签名推导，会破坏 React Flow
 * `Node<T extends Record<string, unknown>>` 约束。
 */
export type ErSubgraphNodeData = ReactFlowNodeData;

/** React Flow 节点类型 */
export type ErSubgraphFlowNode = Node<ErSubgraphNodeData, 'er-subgraph'>;

// ============================================================
// er-subgraph 节点组件
// ============================================================

/**
 * er-subgraph 节点组件
 *
 * 渲染标题栏 + 边框，子实体节点由 React Flow Parent Node 机制自动定位
 * 不渲染 Handle（subgraph 本身不可连接，边连接到子实体）
 *
 * 颜色全部用 CSS 变量，自动适配暗色模式（:root ↔ .dark）
 */
export const ErSubgraphComponent = memo(function ErSubgraphComponent({
  data,
  selected,
}: NodeProps<ErSubgraphFlowNode>) {
  const borderColor = selected
    ? 'var(--er-subgraph-selected-stroke)'
    : 'var(--er-subgraph-stroke)';
  const label = data.label || '';
  const dir = data.dir;

  // 方向标签
  const dirLabel = dir ? ` [${dir}]` : '';

  return (
    <div
      className="er-subgraph"
      style={{
        width: '100%',
        height: '100%',
        minWidth: C.MIN_WIDTH,
        minHeight: C.MIN_HEIGHT,
        border: `1px solid ${borderColor}`,
        borderRadius: '4px',
        backgroundColor: 'var(--er-subgraph-bg)',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* 标题栏 */}
      <div
        className="er-subgraph-title"
        style={{
          height: C.TITLE_HEIGHT,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--er-subgraph-text)',
          backgroundColor: 'var(--er-subgraph-header-bg)',
          borderBottom: `1px solid ${borderColor}`,
          borderRadius: '4px 4px 0 0',
          userSelect: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}{dirLabel}
      </div>

      {/* 子节点容器 — React Flow 自动渲染子实体节点到此区域 */}
      <div
        className="er-subgraph-content"
        style={{
          position: 'relative',
          width: '100%',
          height: `calc(100% - ${C.TITLE_HEIGHT}px)`,
        }}
      />
    </div>
  );
});

ErSubgraphComponent.displayName = 'ErSubgraph';
