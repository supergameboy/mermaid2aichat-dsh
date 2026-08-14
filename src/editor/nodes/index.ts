/**
 * 节点类型注册 — 按 diagramType 分发节点组件
 *
 * 单一职责：注册各图表类型的节点组件，提供按类型查询接口
 *
 * flowchart 使用 M1 新组件（FlowchartNodeComponent + SubgraphNodeComponent）
 * classDiagram 使用 M3 新组件（ClassBoxComponent + NoteNodeComponent + NamespaceNodeComponent）
 * erDiagram 使用 M4 新组件（ErBoxComponent + ErSubgraphComponent）
 * stateDiagram 使用 M5 新组件（9 种状态节点类型）
 * mindmap 使用 M6 新组件（7 种 mindmap 节点类型）
 * sequenceDiagram 使用专用 SequenceCanvas（不经过 React Flow，不在此注册）
 * architecture 保留旧组件，将在 M7 重构
 */
import type { NodeTypes } from '@xyflow/react';
import type { GraphDiagramType } from '@mermaid2aichat/serializer';
import { flowchartNodeTypes, DirectionContext, ConnectionModeContext } from './flowchart/index.js';
import type { ConnectionMode } from './flowchart/index.js';
import { classNodeTypes } from './class/index.js';
import { erNodeTypes } from './er/index.js';
import { stateNodeTypes } from './state/index.js';
import {
  MindmapDefaultComponent,
  MindmapRectComponent,
  MindmapRoundedComponent,
  MindmapCircleComponent,
  MindmapCloudComponent,
  MindmapBangComponent,
  MindmapHexagonComponent,
} from './mindmap-nodes.js';
import {
  ArchServiceComponent,
  ArchJunctionComponent,
  ArchGroupComponent,
} from './architecture-nodes.js';

// 导出 Context（供 graph-canvas、toolbar、sequence-canvas、specialized-shell 使用）
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

export {
  StateBoxComponent,
  StateStartComponent,
  StateEndComponent,
  StateForkComponent,
  StateJoinComponent,
  StateChoiceComponent,
  StateDividerComponent,
  StateCompositeComponent,
  StateNoteComponent,
} from './state/index.js';
export type {
  StateBoxFlowNode,
  StateStartFlowNode,
  StateEndFlowNode,
  StateForkFlowNode,
  StateJoinFlowNode,
  StateChoiceFlowNode,
  StateDividerFlowNode,
  StateCompositeFlowNode,
  StateCompositeNodeData,
  StateNoteFlowNode,
} from './state/index.js';

// mindmap 节点组件导出（M6 新组件，7 种节点形状）
export {
  MindmapDefaultComponent,
  MindmapRectComponent,
  MindmapRoundedComponent,
  MindmapCircleComponent,
  MindmapCloudComponent,
  MindmapBangComponent,
  MindmapHexagonComponent,
} from './mindmap-nodes.js';
export type {
  MindmapDefaultFlowNode,
  MindmapRectFlowNode,
  MindmapRoundedFlowNode,
  MindmapCircleFlowNode,
  MindmapCloudFlowNode,
  MindmapBangFlowNode,
  MindmapHexagonFlowNode,
} from './mindmap-nodes.js';

// architecture 节点组件导出（M7 新组件，3 种节点类型）
export {
  ArchServiceComponent,
  ArchJunctionComponent,
  ArchGroupComponent,
} from './architecture-nodes.js';
export type {
  ArchServiceFlowNode,
  ArchJunctionFlowNode,
  ArchGroupFlowNode,
} from './architecture-nodes.js';

// architecture icon 渲染器导出
export {
  ArchitectureIcon,
  ARCHITECTURE_ICONS,
  isArchitectureIcon,
} from './architecture-icons.js';
export type { ArchitectureIconProps, ArchitectureIconName } from './architecture-icons.js';

/** mindmap 节点类型注册表（M6 新组件，7 种节点形状） */
const mindmapNodeTypes: NodeTypes = {
  'mindmap-default': MindmapDefaultComponent,
  'mindmap-rect': MindmapRectComponent,
  'mindmap-rounded': MindmapRoundedComponent,
  'mindmap-circle': MindmapCircleComponent,
  'mindmap-cloud': MindmapCloudComponent,
  'mindmap-bang': MindmapBangComponent,
  'mindmap-hexagon': MindmapHexagonComponent,
};

/** architecture 节点类型注册表（M7 新组件，3 种节点类型） */
const architectureNodeTypes: NodeTypes = {
  'arch-service': ArchServiceComponent,
  'arch-junction': ArchJunctionComponent,
  'arch-group': ArchGroupComponent,
};

/**
 * 根据 diagramType 获取节点类型注册表
 * - flowchart: M1 新组件（default + subgraph）
 * - classDiagram: M3 新组件（class-box + note + namespace）
 * - erDiagram: M4 新组件（er-box + er-subgraph）
 * - stateDiagram: M5 新组件（9 种状态节点）
 * - mindmap: M6 新组件（7 种 mindmap 节点形状）
 * - architecture: M7 新组件（3 种 arch 节点类型）
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
    case 'stateDiagram':
      return stateNodeTypes;
    case 'mindmap':
      return mindmapNodeTypes;
    case 'architecture':
      return architectureNodeTypes;
    default: {
      // 穷尽检查
      const _exhaustive: never = diagramType;
      throw new Error(`未支持的图结构类型: ${_exhaustive}`);
    }
  }
}
