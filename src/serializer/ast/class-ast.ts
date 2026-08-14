/**
 * Class Diagram AST 类型定义
 *
 * 单一职责：定义 ClassDB.getData() 返回的 AST 结构
 * 来源：对齐官方 mermaid packages/mermaid/src/diagrams/class/classDb.ts 的 getData() 返回值
 *
 * 注意：
 * - 核心类型（ClassRelationType / ClassLineType / ClassVisibility / ClassClassifier /
 *   ClassNamespaceInfo / ClassNoteInfo / NodeMember / MermaidNodeData / MermaidEdgeData / GraphMetadata）
 *   已在 M0 `packages/serializer/src/types.ts` 中统一定义，本文件不重新定义
 * - 本文件仅定义 class 解析器内部使用的 AST 层数据结构
 * - ClassNode/ClassRelation/ClassNote/NamespaceNode/Interface/StyleClass 从 parser/class/types.ts 引用
 */

import type {
  ClassNode,
  ClassRelation,
  ClassNote,
  NamespaceNode,
  Interface,
  StyleClass,
} from '../parser/class/types.js';
import type { FlowchartDirection } from '../types.js';

/** Class 解析后的 AST（ClassDB.getData() 返回结构）
 *
 * 对齐官方 classDb.ts 的内部数据结构（非 getData() 的渲染输出）
 * - classes/namespaces/notes/styleClasses 使用 Map（保持官方结构）
 * - relations/interfaces 使用数组（保持官方结构）
 */
export interface ClassAST {
  /** 类映射（id → ClassNode） */
  classes: Map<string, ClassNode>;
  /** 关系列表 */
  relations: ClassRelation[];
  /** 注释映射（noteId → ClassNote） */
  notes: Map<string, ClassNote>;
  /** 接口列表（lollipop 关系自动生成） */
  interfaces: Interface[];
  /** 命名空间映射（qualifiedId → NamespaceNode） */
  namespaces: Map<string, NamespaceNode>;
  /** 样式类映射（classDef id → StyleClass） */
  styleClasses: Map<string, StyleClass>;
  /** 图表方向（TB/BT/RL/LR，未显式设置时为 undefined；jison 输出经 normalizeDirection 校验） */
  direction: FlowchartDirection | undefined;
  /** Accessibility 标题 */
  accTitle: string | undefined;
  /** Accessibility 描述 */
  accDescr: string | undefined;
}
