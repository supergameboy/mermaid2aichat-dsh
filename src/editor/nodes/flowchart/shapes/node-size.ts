/**
 * 节点尺寸计算 — 兼容层
 *
 * 单一职责：保留 computeNodeDimensions / computeNodeSize 兼容接口，
 * 内部委托给 shape-geometry.ts 的统一 ShapeGeometry 模型
 *
 * 新代码推荐直接使用 getShapeGeometry(shape).computeSize(estimateTextBBox(label))。
 */

import type { MermaidShapeType } from '@mermaid2aichat/serializer';
import {
  estimateTextBBox,
  getShapeGeometry,
  type NodeSizeResult,
} from './shape-geometry.js';

export type { NodeSizeResult } from './shape-geometry.js';

/**
 * 根据形状类型和标签文本计算节点完整尺寸（含 path 尺寸和 pad）
 *
 * @param shape - 形状类型
 * @param label - 标签文本（可能包含 <br>、\n、FontAwesome 图标语法）
 * @returns 节点完整尺寸信息
 */
export function computeNodeDimensions(
  shape: MermaidShapeType,
  label: string,
): NodeSizeResult {
  const geometry = getShapeGeometry(shape);
  const bbox = estimateTextBBox(label);
  return geometry.computeSize(bbox);
}

/**
 * 根据形状类型和标签文本计算节点渲染尺寸
 *
 * @param shape - 形状类型
 * @param label - 标签文本（可能包含 <br>、\n、FontAwesome 图标语法）
 * @returns 节点宽度和高度
 */
export function computeNodeSize(
  shape: MermaidShapeType,
  label: string,
): { width: number; height: number } {
  const { width, height } = computeNodeDimensions(shape, label);
  return { width, height };
}
