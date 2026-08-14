/**
 * flowchart 节点统一组件
 *
 * 单一职责：根据 data.shape 分发到具体形状组件，管理 Handle 连接点
 *
 * 数据流:
 *   React Flow NodeProps → DirectionContext → Handle 位置
 *     → computeNodeSize + getShapeBoundary → Handle 偏移（style.transform）
 *     → ShapeRenderer(data.shape) → SVG 形状 + 标签
 */

import { createContext, useContext, memo } from 'react';
import type { CSSProperties } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type {
  FlowchartDirection,
  MermaidShapeType,
} from '@mermaid2aichat/serializer';
import type { ReactFlowNodeData } from '../../types.js';
import { ShapeRenderer, handleStyle } from './shapes/shape-component.js';
import {
  computeNodeSize,
  getShapeBoundary,
  handleOffsetToTransform,
  type HandleOffsets,
} from './shapes/index.js';

// ============================================================
// 类型
// ============================================================

/** React Flow 节点类型，data 为 ReactFlowNodeData */
export type FlowchartFlowNode = Node<ReactFlowNodeData, MermaidShapeType>;

// ============================================================
// Context
// ============================================================

/** 连接模式：'direction' 按方向连接 | 'nearest' 就近连接 */
export type ConnectionMode = 'direction' | 'nearest';

/** 画布方向 Context — 由 Canvas 提供，节点组件消费，用于动态设置 Handle 位置 */
export const DirectionContext = createContext<FlowchartDirection>('TB');

/** 连接模式 Context — 由 Canvas 提供，节点组件消费，用于根据模式渲染 Handle */
export const ConnectionModeContext = createContext<ConnectionMode>('direction');

// ============================================================
// 辅助函数
// ============================================================

/** 根据 direction 计算 source/target Handle 位置（按方向连接模式） */
function getHandlePositions(direction: FlowchartDirection): {
  source: Position;
  target: Position;
} {
  switch (direction) {
    case 'TB':
    case 'TD':
      return { source: Position.Bottom, target: Position.Top };
    case 'BT':
      return { source: Position.Top, target: Position.Bottom };
    case 'LR':
      return { source: Position.Right, target: Position.Left };
    case 'RL':
      return { source: Position.Left, target: Position.Right };
  }
}

// ============================================================
// 节点组件
// ============================================================

/** Position 枚举值 → HandleOffsets key 映射（Position.Top='top' 等与 HandleOffsets key 一致） */
const POSITION_TO_OFFSET_KEY: Record<Position, keyof HandleOffsets> = {
  [Position.Top]: 'top',
  [Position.Bottom]: 'bottom',
  [Position.Left]: 'left',
  [Position.Right]: 'right',
};

/** flowchart 节点组件 — 根据形状渲染不同 SVG 形状 */
export const FlowchartNodeComponent = memo(function FlowchartNodeComponent({
  id,
  data,
  selected = false,
  width: nodeWidth,
  height: nodeHeight,
}: NodeProps<FlowchartFlowNode>) {
  // 从 Context 获取 direction 和 connectionMode
  const direction = useContext(DirectionContext);
  const connectionMode = useContext(ConnectionModeContext);

  // 按方向连接：Handle 位置由 direction 决定
  // 就近连接：Handle 位置用 Top/Bottom（floating edge 不依赖 Handle 位置，但用户手动拖拽需要 Handle）
  const { source: sourcePos, target: targetPos } =
    connectionMode === 'direction'
      ? getHandlePositions(direction)
      : { source: Position.Bottom, target: Position.Top };

  // resolve optional 字段为渲染默认值（与 shape-boundary.ts:106 / 序列化层 vertex-serializer 一致）
  // shape 默认 'rect'（Mermaid 默认形状），label 默认 node.id（边规则节点不携带 label/shape）
  const shape = data.shape ?? 'rect';
  const label = data.label ?? id;

  // 读取扩展字段
  const icon = data.icon;
  const img = data.img;

  // 计算节点尺寸 + Handle 偏移（与 ShapeRenderer 内部计算逻辑一致，保证 Handle 在形状真实边缘）
  // 优先使用 React Flow 传入的节点尺寸；未传入时按 label 计算
  const computedSize = computeNodeSize(shape, label);
  const width = nodeWidth ?? computedSize.width;
  const height = nodeHeight ?? computedSize.height;
  const { handleOffsets } = getShapeBoundary(shape, width, height);

  // 构造 Handle style：在 React Flow 默认居中 transform 基础上叠加形状偏移
  const makeHandleStyle = (position: Position): CSSProperties => {
    const key = POSITION_TO_OFFSET_KEY[position];
    const offset = handleOffsets[key];
    return {
      ...handleStyle,
      transform: handleOffsetToTransform(offset),
    };
  };

  return (
    <div
      className={`mermaid-node${selected ? ' selected' : ''}`}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <Handle type="target" position={targetPos} style={makeHandleStyle(targetPos)} />
      <ShapeRenderer
        shape={shape}
        label={label}
        style={data.style}
        selected={selected}
        icon={icon}
        img={img}
      />
      <Handle type="source" position={sourcePos} style={makeHandleStyle(sourcePos)} />
    </div>
  );
});

FlowchartNodeComponent.displayName = 'FlowchartNode';
