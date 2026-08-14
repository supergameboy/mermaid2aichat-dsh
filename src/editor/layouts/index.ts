/**
 * 布局注册 — 按 diagramType 分发布局算法
 *
 * 单一职责：注册各图表类型的布局算法，提供按类型查询接口
 *
 * sequenceDiagram 使用专用 SequenceCanvas（不经过 React Flow，不在此注册）
 */
import type {
  FlowchartDirection,
  GraphDiagramType,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
} from '@mermaid2aichat/serializer';
import { layoutWithDagre } from './dagre-layout.js';

/** 布局结果（节点 + 边） */
export interface LayoutResult {
  nodes: MermaidNode[];
  edges: MermaidEdge[];
}

/** 布局函数类型 */
export type LayoutFn = (
  nodes: MermaidNode[],
  edges: MermaidEdge[],
  direction?: FlowchartDirection,
  metadata?: GraphMetadata,
) => LayoutResult;

/**
 * 根据 diagramType 获取布局函数
 * - flowchart/class/er: dagre 布局（compound + 动态尺寸 + minlen + 自环）
 * - sequence: 专用 SequenceCanvas，不经过此函数
 * - 其它图表类型本插件不支持，抛错。
 */
export function getLayoutFn(diagramType: GraphDiagramType): LayoutFn {
  switch (diagramType) {
    case 'flowchart':
    case 'classDiagram':
    case 'erDiagram':
      // 这些类型使用 dagre 布局
      return (nodes, edges, direction, metadata) =>
        layoutWithDagre(nodes, edges, direction ?? 'TB', metadata);
    default:
      throw new Error(`未支持的图结构类型布局: ${diagramType}`);
  }
}

// 导出布局函数
export { layoutWithDagre } from './dagre-layout.js';
