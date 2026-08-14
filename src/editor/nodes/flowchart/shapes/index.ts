/**
 * 形状注册表入口
 *
 * 统一数据源：shape-geometry.ts 是形状几何的单一真相源
 * node-size / shape-boundary 均委托给 shape-geometry
 *
 * 导出层级：
 *   - 一级 API：ShapeGeometry 模型（推荐使用）
 *   - 二级 API：兼容 API（computeNodeSize / getShapeBoundary 等）
 */

// === 一级 API：统一形状几何模型 ===
export {
  shapeGeometryRegistry,
  getShapeGeometry,
  isShapeGeometryRegistered,
  estimateTextBBox,
} from './shape-geometry.js';
export type {
  ShapeGeometry,
  ShapeCategory,
  TextBBox,
  NodeSizeResult,
  HandleOffsets,
  ShapeDecoration,
} from './shape-geometry.js';

// === 二级 API：兼容封装（委托 shape-geometry）===
export { ShapeRenderer, handleStyle } from './shape-component.js';
export type { ShapeComponentProps } from './shape-component.js';
export { computeNodeDimensions, computeNodeSize } from './node-size.js';
export {
  getShapeBoundary,
  handleOffsetToTransform,
  getNodeCenter,
  getBoundaryConnectionPoint,
} from './shape-boundary.js';
export type { ShapeBoundary } from './shape-boundary.js';
