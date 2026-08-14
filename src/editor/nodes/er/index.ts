/**
 * er 节点组件注册表 — 统一导出 er 节点组件和注册表
 *
 * 单一职责：导出 erDiagram 的节点组件，提供 nodeTypes 注册表
 *
 * 注册类型:
 *   - 'er-box': ErBoxComponent — 实体节点（含属性+别名）
 *   - 'er-subgraph': ErSubgraphComponent — 子图容器节点（标题+边框）
 */

export { ErBoxComponent } from './er-box.js';
export type { ErFlowNode } from './er-box.js';

export { ErSubgraphComponent } from './er-subgraph.js';
export type { ErSubgraphFlowNode, ErSubgraphNodeData } from './er-subgraph.js';

import type { NodeTypes } from '@xyflow/react';
import { ErBoxComponent } from './er-box.js';
import { ErSubgraphComponent } from './er-subgraph.js';

/** er 节点类型注册表（供 nodes/index.ts 注册） */
export const erNodeTypes: NodeTypes = {
  'er-box': ErBoxComponent,
  'er-subgraph': ErSubgraphComponent,
};
