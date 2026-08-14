/**
 * Note 边组件 — 渲染 classDiagram 的注释连接边
 *
 * 单一职责：渲染 note 节点到 class 节点的虚线连接
 *
 * 数据流:
 *   MermaidEdge (type='note-edge') → NoteEdgeComponent
 *     → useBoundaryConnection（复用流程图边界连接算法）
 *     → getBezierPath 生成贝塞尔路径
 *     → 虚线渲染（无箭头）
 */

import { memo } from 'react';
import {
  BaseEdge,
  getBezierPath,
  Position,
  type EdgeProps,
} from '@xyflow/react';
import { useBoundaryConnection } from '../boundary-connection.js';

/** Note 边组件 — note 到 class 的虚线连接 */
export const NoteEdgeComponent = memo(function NoteEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  selected,
}: EdgeProps) {
  // 边界连接点计算（复用流程图统一算法：射线求交，自动选最近方向）
  const connection = useBoundaryConnection(source, target);

  // 路径生成：优先使用边界连接点，否则回退到 React Flow 默认坐标
  const pathParams = connection ?? {
    sourceX,
    sourceY,
    sourcePosition: sourcePosition as Position,
    targetX,
    targetY,
    targetPosition: targetPosition as Position,
  };
  const [edgePath] = getBezierPath(pathParams);

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: selected ? '#1890ff' : '#999',
        strokeWidth: 1.5,
        strokeDasharray: '4,4',
      }}
    />
  );
});

NoteEdgeComponent.displayName = 'NoteEdge';
