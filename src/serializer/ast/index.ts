/**
 * AST 类型定义统一导出
 * 所有图表类型的 AST 类型定义汇总
 */

export type {
  FlowchartAST,
  FlowVertex,
  FlowEdge,
  FlowLink,
  FlowClass,
  FlowSubGraph,
  FlowClickEvent,
  FlowText,
  FlowVertexTypeParam,
  FlowLabelType,
} from './flowchart-ast.js';
export type { SequenceAST, SequenceSignalType } from './sequence-ast.js';
// Sequence 专用 AST 层类型（从 parser/sequence/types.ts 引用）
export type { Actor, Message, Note, Box, AddMessageParams } from '../parser/sequence/types.js';
export type { ClassAST } from './class-ast.js';
// Class 专用 AST 层类型（从 parser/class/types.ts 引用）
export type {
  ClassNode,
  ClassRelation,
  ClassNote,
  NamespaceNode,
  Interface,
  StyleClass,
  ClassMap,
  ClassNoteMap,
  NamespaceMap,
  ClassDBYY,
} from '../parser/class/types.js';
export type { ClassMember } from '../parser/class/class-member.js';
export type {
  ERAST,
  EntityNode,
  Attribute,
  Relationship,
  RelSpec,
  EntityClass,
  ErSubGraph,
  EntityMap,
  EntityClassMap,
} from './er-ast.js';
