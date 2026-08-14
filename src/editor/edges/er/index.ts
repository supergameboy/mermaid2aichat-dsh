/**
 * er 边组件注册表 — 统一导出 er 边组件、marker 定义和注册表
 *
 * 单一职责：导出 erDiagram 的边组件、marker 定义组件、基数映射表，提供 edgeTypes 注册表
 *
 * 模块4 L2-5/L2-4：
 *   - ErEdgeComponent：ER 关系边组件（curveBasis + 10 marker + relationshipLabelBox）
 *   - ErEdgeMarkers：10 个 ER marker 的 SVG defs 组件
 *   - ER_CARDINALITY_TO_MARKER_START/END：基数 → marker id 映射表（exhaustive）
 */

export { ErEdgeComponent } from './er-edge.js';
export {
  ErEdgeMarkers,
  ER_CARDINALITY_TO_MARKER_START,
  ER_CARDINALITY_TO_MARKER_END,
} from './er-edge-markers.js';

import type { EdgeTypes } from '@xyflow/react';
import { ErEdgeComponent } from './er-edge.js';

/** er 边类型注册表（供 edges/index.ts 注册） */
export const erEdgeTypes: EdgeTypes = {
  'er-relation': ErEdgeComponent,
};
