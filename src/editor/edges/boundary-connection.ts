/**
 * 边界连接算法 — 统一复用 hook + 纯函数
 *
 * 单一职责：计算两个节点之间的边界连接点（射线求交，自动选最近方向）
 *
 * 设计动机：
 *   - FlowchartEdgeComponent / FloatingEdgeComponent / ClassEdgeComponent / NoteEdgeComponent
 *     都需要"从节点中心向对端中心发出射线，计算与形状边缘的交点"这一算法
 *   - 提取为单一数据源，消除重复代码（DRY），保证所有边组件使用同一套连线算法
 *
 * 数据流:
 *   sourceNode / targetNode（useInternalNode）
 *     → getNodeCenter + getBoundaryConnectionPoint
 *     → 得到 source/target 边界连接点与 Position
 *     → 边组件用 Bezier/SmoothStep/Straight 生成 SVG path
 */
import { useMemo } from 'react';
import {
  Position,
  useInternalNode,
  type InternalNode,
} from '@xyflow/react';
import type { MermaidNode } from '@mermaid2aichat/serializer';
import {
  getBoundaryConnectionPoint,
  getNodeCenter,
} from '../nodes/flowchart/shapes/shape-boundary.js';

// ============================================================
// 类型
// ============================================================

/** 边界连接信息（source/target 的坐标和方向） */
export interface BoundaryConnection {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
}

// ============================================================
// 纯函数 — 供已持有 InternalNode 的调用方使用
// ============================================================

/**
 * 计算两个节点之间的边界连接点（纯函数）
 *
 * 从 source 中心向 target 中心发出射线，用 getBoundaryConnectionPoint
 * 计算射线与形状边缘的交点，返回 source/target 的坐标和方向。
 *
 * @param sourceNode - 源节点（已挂载，含 internals.positionAbsolute）
 * @param targetNode - 目标节点（已挂载）
 * @returns 边界连接信息（坐标 + Position）
 */
export function computeBoundaryConnection(
  sourceNode: InternalNode<MermaidNode>,
  targetNode: InternalNode<MermaidNode>,
): BoundaryConnection {
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);
  const sourceConn = getBoundaryConnectionPoint(sourceNode, targetCenter);
  const targetConn = getBoundaryConnectionPoint(targetNode, sourceCenter);
  return {
    sourceX: sourceConn.x,
    sourceY: sourceConn.y,
    sourcePosition: sourceConn.position,
    targetX: targetConn.x,
    targetY: targetConn.y,
    targetPosition: targetConn.position,
  };
}

// ============================================================
// Hook — 供边组件使用（内部调用 useInternalNode + useMemo）
// ============================================================

/**
 * Hook：计算两个节点之间的边界连接点
 *
 * 自环边（source === target）或节点未挂载时返回 null：
 *   - 自环边由 React Flow 内置自环渲染处理
 *   - 节点未挂载时边组件应回退到 React Flow 默认坐标（sourceX/sourceY 等 EdgeProps）
 *
 * @param source - 源节点 ID
 * @param target - 目标节点 ID
 * @returns 边界连接信息，或 null（自环/未挂载）
 */
export function useBoundaryConnection(
  source: string,
  target: string,
): BoundaryConnection | null {
  const sourceNode = useInternalNode<MermaidNode>(source);
  const targetNode = useInternalNode<MermaidNode>(target);

  return useMemo(() => {
    if (source === target) return null;
    if (!sourceNode || !targetNode) return null;
    return computeBoundaryConnection(sourceNode, targetNode);
  }, [source, target, sourceNode, targetNode]);
}
