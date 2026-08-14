/**
 * erDiagram Converter 上下文与元数据收集器接口定义
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块2-转换器.md
 * 阶段：模块2 L2-4
 *
 * 数据流：
 *   parse 方向：ErRecognizedBlock → Converter.parseBlock → MermaidNode/MermaidEdge（通过 ctx 受控方法注册）
 *   serialize 方向：MermaidNode/MermaidEdge → Converter.serializeBlock → ErRecognizedBlock
 *
 * 接口职责：
 *   - ErConverterContext：er 专用转换上下文，复用 flowchart/class ConverterContext 模式
 *     （registerNode/updateNode/registerEdge/pushParent/popParent/currentParent）
 *   - ErMetadataCollector：er 专用元数据收集器，累积 erClasses/erClassApplyClasses/
 *     erSubgraphs/direction/accTitle/accDescription
 *
 * 单一数据源：
 *   - ErSubGraphInfo/ErClassInfo/ErClassApplyInfo 已在 types.ts 统一定义，本文件不重复定义
 *   - GraphMetadata.erSubgraphs/erClasses/erClassApplyClasses 字段直接引用 types.ts 类型
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、../types.js，不引用 React/DOM。
 */

import type {
  ErClassApplyInfo,
  ErClassInfo,
  ErSubGraphInfo,
  FlowchartDirection,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
} from '../../types.js';
import type { BlockConvertError } from '../types.js';

// ErSubGraphInfo/ErClassInfo/ErClassApplyInfo 从 types.ts 引入（单一数据源，设计偏差修订）

// ============================================================
// 1. ErConverterContext — er 转换上下文接口
// ============================================================

/**
 * er Converter 上下文接口（复用 flowchart/class ConverterContext 模式）
 *
 * 提供 node/edge 注册、subgraph 栈管理、metadata 收集、错误累积。
 *
 * updateNode 签名对齐 flowchart/class ConverterContext.updateNode（mutate 模式）：
 *   - updateNode(nodeId, mutate: (node) => void): void（mutate 模式，直接修改 node）
 *
 * 模块2 设计点4 关键差异（模块1 方案B 增强）：
 *   - 模块1 已通过 parentDB 前置计算 parentId，Converter 无需依赖 ctx.currentParent() 为 entity 节点设置 parentId
 *   - pushParent/popParent 仅用于 subgraph-open/close 块的 LIFO 栈管理校验
 *   - currentParent() 在 ER Converter 中不被主动调用（style/class-apply 块的 ids[] 字段已显式指定目标实体）
 */
export interface ErConverterContext {
  // === 节点注册 ===
  /** 注册新节点（entity/subgraph 节点，parentId 由 block.parentId 决定，模块1 已前置） */
  registerNode(node: MermaidNode): void;
  /** 更新已有节点（mutate 模式，对齐 flowchart/class ConverterContext.updateNode） */
  updateNode(nodeId: string, mutate: (node: MermaidNode) => void): void;
  /** 获取节点（只读访问） */
  getNode(nodeId: string): MermaidNode | undefined;
  /** 获取所有节点（保留插入顺序，serialize 方向用） */
  getNodes(): readonly MermaidNode[];

  // === 边注册 ===
  /** 注册新边（er-relation） */
  registerEdge(edge: MermaidEdge): void;
  /** 获取边列表（只读访问，serialize 方向用） */
  getEdges(): readonly MermaidEdge[];

  // === subgraph 栈管理（复用 flowchart pushParent/popParent/currentParent 模式）===
  /** 入栈 subgraph id（ErSubgraphOpenConverter.parseBlock 时调用） */
  pushParent(subgraphId: string): void;
  /** 出栈 subgraph id（ErSubgraphCloseConverter.parseBlock 时调用，LIFO 校验） */
  popParent(): string | undefined;
  /** 获取栈顶 subgraph id（ER Converter 不主动调用，保留对齐 flowchart/class 接口） */
  currentParent(): string | undefined;

  // === 元数据收集器 ===
  readonly metadataCollector: ErMetadataCollector;

  // === 错误收集（不中断后续 block 处理）===
  addError(error: BlockConvertError): void;
}

// ============================================================
// 2. ErMetadataCollector — er 元数据收集器接口
// ============================================================

/**
 * er metadata 收集器接口，累积 er 专用 metadata 字段。
 *
 * build() 仅包含非空字段（对齐 flowchart/class DefaultMetadataCollector.build）。
 *
 * 字段对应 GraphMetadata：
 *   - addErClass → metadata.erClasses（ErClassInfo[]）
 *   - addErClassApply → metadata.erClassApplyClasses（ErClassApplyInfo[]，模块2 方案B 新增）
 *   - addErSubgraph → metadata.erSubgraphs（ErSubGraphInfo[]，含 parentId 字段）
 *   - setDirection → metadata.direction（顶层 direction 单一数据源修复）
 *   - setAccTitle → metadata.accTitle
 *   - setAccDescription → metadata.accDescription
 */
export interface ErMetadataCollector {
  // === er 专用字段 ===
  /** 添加 classDef 定义（classDef className styles） */
  addErClass(classInfo: ErClassInfo): void;
  /** 添加 class 应用（class nodeId1,nodeId2 className1,className2，serialize 还原用） */
  addErClassApply(apply: ErClassApplyInfo): void;
  /** 添加 subgraph 信息（ErSubgraphOpenConverter.parseBlock 时调用） */
  addErSubgraph(subgraph: ErSubGraphInfo): void;

  // === 通用字段 ===
  /** 设置图表方向（direction TB，顶层 direction 单一数据源修复） */
  setDirection(dir: FlowchartDirection): void;
  /** 设置无障碍标题（accTitle: xxx） */
  setAccTitle(title: string): void;
  /** 设置无障碍描述（accDescr: xxx） */
  setAccDescription(desc: string): void;

  // === 序列化查询（serialize 方向使用）===
  /** 获取所有 classDef 定义 */
  getErClasses(): readonly ErClassInfo[];
  /** 获取所有 class 应用 */
  getErClassApplies(): readonly ErClassApplyInfo[];
  /** 获取所有 subgraph 信息 */
  getErSubgraphs(): readonly ErSubGraphInfo[];
  /** 获取图表方向 */
  getDirection(): FlowchartDirection | undefined;
  /** 获取无障碍标题 */
  getAccTitle(): string | undefined;
  /** 获取无障碍描述 */
  getAccDescription(): string | undefined;

  /** 构建最终 GraphMetadata（仅包含非空字段） */
  build(): GraphMetadata;
}
