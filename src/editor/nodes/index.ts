/**
 * 节点类型注册 — 按 diagramType 分发节点组件
 *
 * 单一职责：注册各图表类型的节点组件，提供按类型查询接口
 *
 * flowchart 使用 M1 新组件（FlowchartNodeComponent + SubgraphNodeComponent）
 * classDiagram 使用 M3 新组件（ClassBoxComponent + NoteNodeComponent + NamespaceNodeComponent）
 * erDiagram 使用 M4 新组件（ErBoxComponent + ErSubgraphComponent）
 * sequenceDiagram 使用专用 SequenceCanvas（不经过 React Flow，不在此注册）
 */
import type { NodeTypes } from '@xyflow/react';
import type { GraphDiagramType } from '@mermaid2aichat/serializer';
import { flowchartNodeTypes, DirectionContext, ConnectionModeContext } from './flowchart/index.js';
import type { ConnectionMode } from './flowchart/index.js';
import { classNodeTypes } from './class/index.js';
import { erNodeTypes } from './er/index.js';

// 导出 Context（供 graph-canvas、sequence-canvas、specialized-shell 使用）
export { DirectionContext, ConnectionModeContext } from './flowchart/index.js';
export type { ConnectionMode } from './flowchart/index.js';

// 导出各类型节点组件
export {
  FlowchartNodeComponent,
  SubgraphNodeComponent,
} from './flowchart/index.js';
export type {
  FlowchartFlowNode,
  SubgraphNodeData,
  SubgraphFlowNode,
} from './flowchart/index.js';

export {
  ClassBoxComponent,
  NoteNodeComponent,
  NamespaceNodeComponent,
} from './class/index.js';
export type {
  ClassBoxFlowNode,
  NoteFlowNode,
  NamespaceFlowNode,
} from './class/index.js';

export {
  ErBoxComponent,
  ErSubgraphComponent,
} from './er/index.js';
export type {
  ErFlowNode,
  ErSubgraphFlowNode,
  ErSubgraphNodeData,
} from './er/index.js';

/**
 * 根据 diagramType 获取节点类型注册表
 * - flowchart: M1 新组件（default + subgraph）
 * - classDiagram: M3 新组件（class-box + note + namespace）
 * - erDiagram: M4 新组件（er-box + er-subgraph）
 * - sequenceDiagram: 使用专用 SequenceCanvas，不经过此函数
 */
export function getNodeTypes(diagramType: GraphDiagramType): NodeTypes {
  switch (diagramType) {
    case 'flowchart':
      return flowchartNodeTypes;
    case 'classDiagram':
      return classNodeTypes;
    case 'erDiagram':
      return erNodeTypes;
    default:
      throw new Error(`未支持的图结构类型: ${diagramType}`);
  }
}
