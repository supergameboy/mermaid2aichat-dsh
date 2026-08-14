/**
 * 形状边界计算 — 兼容层
 *
 * 单一职责：
 *   1. 保留 getShapeBoundary / handleOffsetToTransform 兼容接口，
 *      内部委托给 shape-geometry.ts 的统一 ShapeGeometry 模型
 *   2. 提供 getBoundaryConnectionPoint，用于边组件计算连线与形状边缘的真实交点
 *
 * 统一模型采用"path 充满容器"策略：
 * - 矩形/圆形/菱形/六边形/椭圆等大多数形状，path 生成的图形充满 width × height 容器
 * - 因此 Handle 默认位置（容器边缘）已经落在形状真实边界上，偏移量为 0
 * - 特殊形状（如以后需要内缩的图形）可在 ShapeGeometry.getHandleOffsets 中单独定义
 *
 * 新代码推荐直接使用 getShapeGeometry(shape).getHandleOffsets(width, height)。
 */

import type { InternalNode } from '@xyflow/react';
import { Position } from '@xyflow/react';
import type { MermaidShapeType, MermaidNode } from '@mermaid2aichat/serializer';
import { getShapeGeometry, intersectShapeRay } from './shape-geometry.js';
import type { Point } from './shape-geometry.js';

// ============================================================
// 类型
// ============================================================

/** 形状边界信息 */
export interface ShapeBoundary {
  /** Handle 在各方向的偏移量（相对于默认位置，单位 px） */
  handleOffsets: {
    top: { x: number; y: number };
    bottom: { x: number; y: number };
    left: { x: number; y: number };
    right: { x: number; y: number };
  };
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 根据形状类型和节点尺寸计算 Handle 偏移量
 *
 * @param shape - 形状类型
 * @param width - 节点宽度
 * @param height - 节点高度
 * @returns 形状边界信息（Handle 偏移量）
 */
export function getShapeBoundary(
  shape: MermaidShapeType,
  width: number,
  height: number,
): ShapeBoundary {
  const geometry = getShapeGeometry(shape);
  return {
    handleOffsets: geometry.getHandleOffsets(width, height),
  };
}

/**
 * 将 Handle 偏移量转换为 CSS transform 字符串
 *
 * @param offset - Handle 偏移量
 * @returns CSS transform 字符串（如 `translate(10px, 5px)`）
 */
export function handleOffsetToTransform(offset: { x: number; y: number }): string {
  return `translate(${offset.x}px, ${offset.y}px)`;
}

// ============================================================
// 边连接点辅助（供 flowchart-edge / floating-edge 复用）
// ============================================================

/** 计算节点几何中心（绝对坐标） */
export function getNodeCenter(node: InternalNode): { x: number; y: number } {
  const nodeX = node.internals.positionAbsolute.x;
  const nodeY = node.internals.positionAbsolute.y;
  // 优先使用节点显式尺寸（新创建节点已同步设置），未设置时再回退到 measured
  const width = node.width ?? node.measured.width ?? 0;
  const height = node.height ?? node.measured.height ?? 0;
  return { x: nodeX + width / 2, y: nodeY + height / 2 };
}

/**
 * 计算节点边界上、沿指定方向的连接点
 *
 * 从节点中心向 `towards` 点发出射线，返回射线与节点形状边缘的交点，
 * 以及该边界对应的 Position（用于 Bezier/SmoothStep 控制方向）。
 */
export function getBoundaryConnectionPoint(
  node: InternalNode<MermaidNode>,
  towards: Point,
): { x: number; y: number; position: Position } {
  const center = getNodeCenter(node);
  const width = node.width ?? node.measured.width ?? 0;
  const height = node.height ?? node.measured.height ?? 0;

  const dx = towards.x - center.x;
  const dy = towards.y - center.y;

  if (dx === 0 && dy === 0) {
    return { x: center.x, y: center.y + height / 2, position: Position.Bottom };
  }

  const shape = node.data.shape ?? 'rect';

  const hit = intersectShapeRay(shape, width, height, center, towards);

  const hitDx = hit.x - center.x;
  const hitDy = hit.y - center.y;
  const position = Math.abs(hitDx) > Math.abs(hitDy)
    ? (hitDx > 0 ? Position.Right : Position.Left)
    : (hitDy > 0 ? Position.Bottom : Position.Top);

  return { x: hit.x, y: hit.y, position };
}
