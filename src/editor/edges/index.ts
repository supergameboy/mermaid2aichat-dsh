/**
 * 边类型注册 — 按 diagramType 分发边组件
 *
 * 单一职责：注册各图表类型的边组件，提供按类型查询接口
 *
 * flowchart 使用 M1 新组件（FlowchartEdgeComponent，16 种边样式）
 * classDiagram 使用 M3 新组件（ClassEdgeComponent + NoteEdgeComponent，7 种关系类型）
 * erDiagram 使用 M4 新组件（ErEdgeComponent，5 种基数 + 2 种关系类型）
 * sequenceDiagram 使用专用 SequenceCanvas（不经过 React Flow，不在此注册）
 * 其他类型保留旧组件，将在 M5 重构
 */
import type { EdgeTypes } from '@xyflow/react';
import type { GraphDiagramType } from '@mermaid2aichat/serializer';
import { flowchartEdgeTypes } from './flowchart/index.js';
import { FloatingEdgeComponent } from './floating-edge.js';
import { classEdgeTypes, ClassEdgeComponent, NoteEdgeComponent } from './class/index.js';
import { erEdgeTypes, ErEdgeComponent } from './er/index.js';

// 导出所有边组件
export { FlowchartEdgeComponent } from './flowchart/index.js';
export { FloatingEdgeComponent } from './floating-edge.js';
export { ClassEdgeComponent, NoteEdgeComponent, classEdgeTypes } from './class/index.js';
export { ErEdgeComponent, erEdgeTypes } from './er/index.js';

/**
 * 根据 diagramType 获取边类型注册表
 * flowchart 使用 M1 新组件（16 种边样式 + floating 就近连接）
 * classDiagram 使用 M3 新组件（7 种关系类型 + note 边）
 * erDiagram 使用 M4 新组件（er-relation 边，承载基数+关系类型+角色）
 * sequenceDiagram 使用专用 SequenceCanvas，不经过此函数
 * 其它图表类型本插件不支持，抛错。
 */
export function getEdgeTypes(diagramType: GraphDiagramType): EdgeTypes {
  switch (diagramType) {
    case 'flowchart':
      return { ...flowchartEdgeTypes, floating: FloatingEdgeComponent };
    case 'classDiagram':
      return classEdgeTypes;
    case 'erDiagram':
      return erEdgeTypes;
    default:
      throw new Error(`未支持的图结构类型: ${diagramType}`);
  }
}
