/**
 * 浏览器安全入口 — DSH 插件内部序列化库的公开出口
 *
 * 本插件仅迁移四种图表类型：flowchart / sequenceDiagram / classDiagram / erDiagram。
 * 该入口只导出这四种类型所需的类型、解析器、序列化器与工具，其它图表类型的
 * 代码已被移除。
 */

// ============================================================
// 类型导出（types.ts — 单一数据源，仅四种图表类型相关）
// ============================================================
export type {
  // 基础类型
  MermaidShapeType,
  MermaidEdgeStyle,
  FlowchartDirection,
  NodeStyle,
  EdgeMarker,
  // 节点和边
  MermaidNodeData,
  MermaidEdgeData,
  MermaidNode,
  MermaidEdge,
  Viewport,
  // 图表类型
  DiagramType,
  GraphDiagramType,
  SequenceDiagramType,
  // 类型专用子类型
  ClassRelationType,
  ClassLineType,
  ClassVisibility,
  ClassClassifier,
  ClassStereotype,
  ERCardinality,
  ERIdentification,
  ERAttributeKey,
  ErClassInfo,
  ErClassApplyInfo,
  SequenceArrowType,
  SequenceBlockType,
  SequenceActorType,
  SequenceParticipant,
  SequenceMessage,
  NodeMember,
  NodeAttribute,
  SequenceBlockInfo,
  SequenceBlockMidBranch,
  SequenceNoteInfo,
  ClassNamespaceInfo,
  ClassNoteInfo,
  FlowClassDefInfo,
  // 元数据
  GraphMetadata,
  // 画布状态
  CanvasState,
  GraphCanvasState,
  SequenceCanvasState,
  GraphCanvasUpdate,
  // 来源和消费
  CanvasSource,
  ConsumedState,
  // 解析和序列化结果
  ParseResult,
  ParseSuccessResult,
  ParseFailureResult,
  ParseError,
  SerializeResult,
  // 画布快照
  CanvasSnapshot,
} from './types.js';

// 函数导出（types.ts）
export {
  isGraphDiagramType,
  isSequenceDiagramType,
  isGraphCanvasState,
  isSequenceCanvasState,
  migrateCanvasState,
  createEmptyCanvasState,
} from './types.js';

// ============================================================
// AST 类型导出
// ============================================================
export type {
  FlowchartAST,
  FlowVertex,
  FlowEdge,
  FlowLink,
  FlowClass,
  FlowSubGraph,
  FlowClickEvent,
  SequenceAST,
  SequenceSignalType,
  Actor,
  Message,
  Note,
  Box,
  AddMessageParams,
  ClassAST,
  ClassNode,
  ClassRelation,
  ClassNote,
  NamespaceNode,
  ERAST,
  EntityNode,
  Attribute,
  Relationship,
  RelSpec,
  EntityClass,
  ErSubGraph,
  EntityMap,
  EntityClassMap,
} from './ast/index.js';

// ============================================================
// DB 类与常量 — 浏览器安全
// ============================================================

// flowchart DB
export { FlowDB } from './parser/flowchart/flow-db.js';
export type { FlowDBYY } from './parser/flowchart/flow-db.js';

// sequence DB + 常量
export { SequenceDB } from './parser/sequence/sequence-db.js';
export type { SequenceDBYY } from './parser/sequence/sequence-db.js';
export { LINETYPE, ARROWTYPE, PLACEMENT, PARTICIPANT_TYPE } from './parser/sequence/constants.js';
export {
  LINETYPE_TO_ARROW_TYPE,
  LINETYPE_TO_BLOCK_TYPE,
} from './parser/sequence/constants.js';

// class 常量与类型
export type { ClassDBYY } from './parser/class/types.js';
export { ClassMember } from './parser/class/class-member.js';
export {
  RELATION_TYPE,
  LINE_TYPE,
  VISIBILITY_VALUES,
} from './parser/class/constants.js';

// er 常量
export type { ErDBYY } from './parser/er/types.js';
export {
  CARDINALITY,
  IDENTIFICATION,
  CARDINALITY_TO_SYMBOL,
  IDENTIFICATION_TO_SYMBOL,
  CARDINALITY_TO_ER_CARDINALITY,
  IDENTIFICATION_TO_ER_IDENTIFICATION,
  resolveCardinality,
  resolveIdentification,
} from './parser/er/constants.js';

// ============================================================
// 序列化器导出 — 浏览器安全
// ============================================================

// flowchart 序列化器
export {
  serializeVertex,
  serializeVertexClassSuffix,
  serializeEdge,
  serializeSubgraph,
  serializeClassDefs,
  serializeClassApplications,
  serializeNodeStyles,
  serializeLinkStyles,
  serializeClickEvents,
} from './serializer/flowchart/index.js';

// sequence 序列化器
export {
  serializeSequence,
  serializeParticipants,
  serializeMessage,
  serializeNotes,
  serializeNote,
  serializeBlockStart,
  serializeBlockEnd,
  serializeBlockMidBranch,
  serializeBlockMidBranches,
  hasBlockMid,
} from './serializer/sequence/index.js';
export type { SequenceBoxInfo } from './types.js';

// ============================================================
// 工具导出 — 浏览器安全
// ============================================================
export { IdGenerator, idGenerator } from './id-generator.js';
export { ErrorCollector } from './error-collector.js';

// 样式解析工具（ClassDefPreview 复用）
export { parseStylesToNodeStyle } from './converter/flowchart/style-converter.js';

// 转义辅助函数
export {
  escapeLabel,
  escapeEdgeLabel,
  escapeStringLiteral,
  unescapeStringLiteral,
  unescapeLabel,
} from './serializer/shared/escape-helpers.js';

// 图结构辅助函数
export { detectCycle } from './serializer/shared/graph-helpers.js';

// ============================================================
// 序列化调度（浏览器安全）
// ============================================================
export { serializeMermaid, detectDiagramType } from './serialize-dispatcher.js';

// ============================================================
// 图表类型注册表（12 种统一元数据：标签/编辑族/实现状态）
// ============================================================
export { DIAGRAM_TYPES, IMPLEMENTED_DIAGRAM_TYPES, diagramTypeInfo } from './diagram-registry.js';
export type { DiagramTypeInfo, DiagramFamily } from './diagram-registry.js';
// ============================================================
// jison 解析器导出（浏览器安全 — 静态 import ESM）
// ============================================================
export {
  parseFlowchart,
  parseSequence,
  parseClass,
  parseER,
  clearParserCache,
} from './parser/jison-parser.js';
export type { JisonParseResult, JisonParser } from './parser/jison-parser.js';

// ============================================================
// 专用解析器导出（浏览器安全 — 返回 CanvasState）
// ============================================================

// sequence 专用解析器
export { parseSequence as parseSequenceCode } from './parser/sequence/sequence-parser.js';
export type { SequenceParseResult } from './parser/sequence/sequence-parser.js';
// sequence CanvasState → AST 逆向映射
export { mapCanvasStateToAst } from './parser/sequence/sequence-parser.js';

// ============================================================
// 解析调度（浏览器安全）
// ============================================================
export { parseMermaid } from './parse-dispatcher.js';
export type { ParseMermaidOptions } from './parse-dispatcher.js';
