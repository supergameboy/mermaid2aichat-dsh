/**
 * classDiagram Converter 上下文与元数据收集器接口定义
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构（验证后修订 [一-5][一-6][一-10][技-1][完-2]）
 *
 * 数据流：
 *   parse 方向：ClassRecognizedBlock → Converter.parseBlock → MermaidNode/MermaidEdge（通过 ctx 受控方法注册）
 *   serialize 方向：MermaidNode/MermaidEdge → Converter.serializeBlock → ClassRecognizedBlock
 *
 * 接口职责：
 *   - ClassConverterContext：class 专用转换上下文，复用 flowchart ConverterContext 模式
 *     （registerNode/updateNode/registerEdge/pushParent/popParent/currentParent）
 *   - ClassMetadataCollector：class 专用元数据收集器，累积 classDefs/clickEvents/namespaces/
 *     notes/classStyleClasses/tooltips/direction/accTitle/accDescription
 *
 * 单一数据源（验证后修订 [一-3][一-4][技-1][完-2]）：
 *   - ClassNamespaceInfo/ClassNoteInfo 已在 types.ts 统一定义，本文件不重复定义
 *   - GraphMetadata.namespaces/classNotes 字段直接引用 types.ts 的 ClassNamespaceInfo/ClassNoteInfo
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js、../types.js，不引用 React/DOM。
 */

import type {
  ClassClickEvent,
  ClassDefInfo,
  ClassNamespaceInfo,
  ClassNoteInfo,
  FlowchartDirection,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
} from '../../types.js';
import type { BlockConvertError } from '../types.js';

// ClassDefInfo / ClassClickEvent 从 types.ts 引入（单一数据源，设计偏差修订，详见 types.ts 注释）

// ============================================================
// 1. ClassConverterContext — class 转换上下文接口
// ============================================================

/**
 * class Converter 上下文接口（复用 flowchart ConverterContext 模式）
 *
 * 提供 node/edge 注册、namespace 栈管理、metadata 收集、错误累积。
 *
 * 验证后修订 [一-10]：updateNode 签名对齐 flowchart ConverterContext.updateNode（mutate 模式）。
 * - updateNode(nodeId, mutate: (node) => void): void（mutate 模式，直接修改 node）
 * - 原 immutable 模式（updater: (node) => MermaidNode）已废弃，统一为 mutate 模式
 */
export interface ClassConverterContext {
  // === 节点注册 ===
  /** 注册新节点（class/note/namespace 节点，parentId 由 ctx.currentParent() 决定） */
  registerNode(node: MermaidNode): void;
  /** 更新已有节点（mutate 模式，对齐 flowchart ConverterContext.updateNode，验证后修订 [一-10]） */
  updateNode(nodeId: string, mutate: (node: MermaidNode) => void): void;
  /** 获取节点（只读访问） */
  getNode(nodeId: string): MermaidNode | undefined;
  /** 获取所有节点（保留插入顺序，serialize 方向用） */
  getNodes(): readonly MermaidNode[];

  // === 边注册 ===
  /** 注册新边（class-relation/note-edge） */
  registerEdge(edge: MermaidEdge): void;
  /** 获取边列表（只读访问，serialize 方向用） */
  getEdges(): readonly MermaidEdge[];

  // === namespace 栈管理（复用 flowchart pushParent/popParent/currentParent 模式）===
  /** 入栈 namespace id（NamespaceOpenConverter.parseBlock 时调用） */
  pushParent(namespaceId: string): void;
  /** 出栈 namespace id（NamespaceCloseConverter.parseBlock 时调用，LIFO 校验） */
  popParent(): string | undefined;
  /** 获取栈顶 namespace id（class 节点 parentId 由 currentParent() 决定） */
  currentParent(): string | undefined;

  // === 元数据收集器 ===
  readonly metadataCollector: ClassMetadataCollector;

  // === 错误收集（不中断后续 block 处理）===
  addError(error: BlockConvertError): void;
}

// ============================================================
// 2. ClassMetadataCollector — class 元数据收集器接口
// ============================================================

/**
 * class metadata 收集器接口，累积 class 专用 metadata 字段。
 *
 * build() 仅包含非空字段（对齐 flowchart DefaultMetadataCollector.build）。
 *
 * 字段对应 GraphMetadata：
 *   - addClassDef → metadata.classDefs（ClassDefInfo[]，新增字段）
 *   - addClickEvent → metadata.classClickEvents（ClassClickEvent[]，新增字段）
 *   - addTooltip → metadata.classTooltips（从 click event 提取，新增字段）
 *   - addNamespace → metadata.namespaces
 *   - addNote → metadata.classNotes
 *   - setDirection → metadata.direction（顶层 direction 单一数据源修复）
 *   - setAccTitle → metadata.accTitle
 *   - setAccDescription → metadata.accDescription
 *
 * 设计偏差修订（M3 实现期）：
 *   原设计的 addClassStyleClass/getClassStyleClasses 已移除。
 *   原因：apply 映射（classId → classNames）已在 node.data.classNames 中（单一数据源），
 *   重复存储到 metadata 违反 institution.md 第1.1条单一数据源原则。
 *   serialize 方向直接扫描 node.data.classNames（对齐 flowchart serializeClassApplyBlocks 模式）。
 *   原 metadata.classStyleClasses 字段（StyleClass[] 类型）保留供老 parser 使用，模块3 删除老路径时一并清理。
 */
export interface ClassMetadataCollector {
  // === class 专用字段 ===
  /** 添加 classDef 定义（classDef className styles） */
  addClassDef(classDef: ClassDefInfo): void;
  /** 添加 click 事件（click classId callback "tooltip"） */
  addClickEvent(click: ClassClickEvent): void;
  /** 添加 tooltip（从 click event 提取，对齐 flowchart addClickEvent 同步累积到 tooltips） */
  addTooltip(nodeId: string, tooltip: string): void;
  /** 添加 namespace 信息（NamespaceOpenConverter.parseBlock 时调用） */
  addNamespace(namespace: ClassNamespaceInfo): void;
  /** 添加 note 信息（NoteConverter.parseBlock 时调用） */
  addNote(note: ClassNoteInfo): void;

  // === 通用字段 ===
  /** 设置图表方向（direction TB，顶层 direction 单一数据源修复） */
  setDirection(dir: FlowchartDirection): void;
  /** 设置无障碍标题（accTitle: xxx） */
  setAccTitle(title: string): void;
  /** 设置无障碍描述（accDescr: xxx） */
  setAccDescription(desc: string): void;

  // === 序列化查询（serialize 方向使用）===
  /** 获取所有 classDef 定义 */
  getClassDefs(): readonly ClassDefInfo[];
  /** 获取所有 click 事件 */
  getClickEvents(): readonly ClassClickEvent[];
  /** 获取 tooltip 映射（nodeId → tooltip） */
  getTooltips(): Readonly<Record<string, string>>;
  /** 获取所有 namespace 信息 */
  getNamespaces(): readonly ClassNamespaceInfo[];
  /** 获取所有 note 信息 */
  getNotes(): readonly ClassNoteInfo[];
  /** 获取图表方向 */
  getDirection(): FlowchartDirection | undefined;
  /** 获取无障碍标题 */
  getAccTitle(): string | undefined;
  /** 获取无障碍描述 */
  getAccDescription(): string | undefined;

  /** 构建最终 GraphMetadata（仅包含非空字段） */
  build(): GraphMetadata;
}

// ============================================================
// 3. ClassDefInfo / ClassClickEvent — 已移至 types.ts（单一数据源，设计偏差修订）
// ============================================================
// ClassDefInfo 和 ClassClickEvent 原设计定义在此文件，但它们是 GraphMetadata 字段类型
// （数据模型），按 ClassNamespaceInfo/ClassNoteInfo 同一原则（单一数据源），
// 统一定义在 types.ts，避免 types.ts ↔ converter/class/types.ts 循环依赖。
// 详见 types.ts 中 ClassDefInfo / ClassClickEvent 的注释。
