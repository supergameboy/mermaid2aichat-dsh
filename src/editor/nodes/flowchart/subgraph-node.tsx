/**
 * subgraph 节点组件 — 渲染子图边框 + 标题栏，子节点由 React Flow Parent Node 机制管理
 *
 * 单一职责：渲染 subgraph 容器视觉（标题栏 + 边框），消费 data.style 应用样式，不负责子节点定位
 *
 * 数据流:
 *   MermaidNode (data.isSubgraph=true) → SubgraphNodeComponent
 *     → 读取 data.style（fill/stroke/strokeWidth/color + 额外 CSS）
 *     → 标题栏 (data.label + data.dir) + 边框 + 子节点容器
 *
 * Style 消费（对齐 Mermaid `style <subgraphId> fill:xxx` 语义）:
 *   - data.style.fill → 容器背景 + 标题栏背景
 *   - data.style.stroke → 边框颜色（选中时被 SELECTED_BORDER_COLOR 覆盖）
 *   - data.style.strokeWidth → 边框粗细
 *   - data.style.color → 标题文字颜色
 *   - 其他 CSS 属性（font-size 等）→ 通过 nodeStyleToCss 应用到标题栏
 *
 * React Flow Parent Node 机制:
 *   - 子节点通过 parentId 指向 subgraph 节点
 *   - 子节点 extent: 'parent' 限制在父节点范围内
 *   - React Flow 自动管理子节点的相对定位
 */

import { memo } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import type { MermaidNodeData } from '@mermaid2aichat/serializer';
import { nodeStyleToCss } from './shapes/node-style-css.js';

// ============================================================
// 类型
// ============================================================

/**
 * subgraph 节点数据（扩展 MermaidNodeData）
 *
 * 类型形式选择：必须使用 `type` 别名（与 MermaidNodeData 保持一致），不可改回
 * `interface extends MermaidNodeData`。原因：interface 不享有隐式索引签名推导，
 * 会破坏 React Flow `Node<T extends Record<string, unknown>>` 约束。
 */
export type SubgraphNodeData = MermaidNodeData & {
  /** subgraph 标记 */
  isSubgraph: true;
  /** 子节点 ID 列表 */
  subgraphNodes: string[];
  /** subgraph 方向（可选） */
  dir?: string;
  /** 是否为用户显式声明的方向 */
  hasExplicitDir?: boolean;
};

/** React Flow 节点类型 */
export type SubgraphFlowNode = Node<SubgraphNodeData, 'subgraph'>;

// ============================================================
// 常量
// ============================================================

const DEFAULT_BORDER_COLOR = '#676767';
const DEFAULT_BG_COLOR = 'rgba(135, 131, 120, 0.1)';
const DEFAULT_TITLE_BG = 'rgba(135, 131, 120, 0.2)';
const SELECTED_BORDER_COLOR = '#1890ff';
const TITLE_HEIGHT = 28;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 100;

// ============================================================
// subgraph 节点组件
// ============================================================

/**
 * subgraph 节点组件
 *
 * 渲染标题栏 + 边框，子节点由 React Flow Parent Node 机制自动定位
 * 不渲染 Handle（subgraph 本身不可连接，边连接到子节点）
 */
export const SubgraphNodeComponent = memo(function SubgraphNodeComponent({
  data,
  selected,
  width,
  height,
}: NodeProps<SubgraphFlowNode>) {
  // 消费 data.style（Mermaid `style <subgraphId> fill:xxx` 等语句产出的 NodeStyle）
  const nodeStyle = data.style;
  const fillColor = nodeStyle?.fill;
  const strokeColor = selected ? SELECTED_BORDER_COLOR : (nodeStyle?.stroke ?? DEFAULT_BORDER_COLOR);
  const strokeWidth = nodeStyle?.strokeWidth ?? 1;
  const textColor = nodeStyle?.color ?? '#333';
  const titleBgColor = fillColor ?? DEFAULT_TITLE_BG;
  const bgColor = fillColor ?? DEFAULT_BG_COLOR;
  const extraTitleCss = nodeStyleToCss(nodeStyle);

  const label = data.label || '';
  const dir = data.dir;

  // 方向标签
  const dirLabel = dir ? ` [${dir}]` : '';

  return (
    <div
      className="mermaid-subgraph"
      style={{
        width: '100%',
        height: '100%',
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        border: `${strokeWidth}px solid ${strokeColor}`,
        borderRadius: '4px',
        backgroundColor: bgColor,
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
    >
      {/* 标题栏 */}
      <div
        className="mermaid-subgraph-title"
        style={{
          height: TITLE_HEIGHT,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          fontSize: '14px',
          fontWeight: 500,
          color: textColor,
          backgroundColor: titleBgColor,
          borderBottom: `${strokeWidth}px solid ${strokeColor}`,
          borderRadius: '4px 4px 0 0',
          userSelect: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          ...extraTitleCss,
        }}
      >
        {label}{dirLabel}
      </div>

      {/* 子节点容器 — React Flow 自动渲染子节点到此区域 */}
      <div
        className="mermaid-subgraph-content"
        style={{
          position: 'relative',
          width: '100%',
          height: `calc(100% - ${TITLE_HEIGHT}px)`,
        }}
      />
    </div>
  );
});

SubgraphNodeComponent.displayName = 'SubgraphNode';
