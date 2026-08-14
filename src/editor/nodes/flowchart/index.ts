/**
 * flowchart 节点组件入口
 *
 * 导出 flowchart 节点组件、subgraph 节点组件、形状注册表和 Context
 */

export { FlowchartNodeComponent } from './flowchart-node.js';
export type { FlowchartFlowNode } from './flowchart-node.js';
export { DirectionContext, ConnectionModeContext } from './flowchart-node.js';
export type { ConnectionMode } from './flowchart-node.js';
export { SubgraphNodeComponent } from './subgraph-node.js';
export type { SubgraphNodeData, SubgraphFlowNode } from './subgraph-node.js';
export { ShapeRenderer } from './shapes/index.js';
export type { ShapeComponentProps, ShapeDecoration } from './shapes/index.js';

import type { NodeTypes } from '@xyflow/react';
import { FlowchartNodeComponent } from './flowchart-node.js';
import { SubgraphNodeComponent } from './subgraph-node.js';

/** flowchart 节点类型注册表（供 nodes/index.ts 注册） */
export const flowchartNodeTypes: NodeTypes = {
  'default': FlowchartNodeComponent,
  'subgraph': SubgraphNodeComponent,
};
