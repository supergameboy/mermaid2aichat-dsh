/**
 * Converter 层类型定义 — 双向转换器接口 + 转换上下文 + 结果类型
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 2 骨架（接口签名已固化，具体 Converter 实现待 Stage 4-5）
 *
 * 数据流：
 *   parse 方向：RecognizedBlock → Converter.parseBlock → MermaidNode/MermaidEdge（通过 ctx 受控方法注册）
 *   serialize 方向：MermaidNode/MermaidEdge → Converter.serializeBlock → RecognizedBlock（含 rawText）
 *
 * 接口拆分（严重-1 修订）：
 *   - IModelBlockConverter<TBlock, TModel, TContext>：1:1 双向，3 种产出型 block（vertex/edge/subgraph-open）
 *   - ISideEffectBlockConverter<TBlock, TContext>：仅 parse 方向，12 种无 model 的 block
 *
 * M3 重构（验证后修订 [一-5][一-6]）：
 *   - TBlock 约束改为 RecognizedBlock<string>，兼容 flowchart/class 双端
 *   - 新增 TContext 类型参数，解耦 context 类型（flowchart 用 ConverterContext，class 用 ClassConverterContext）
 *   - BlockConvertError.block 类型改为 RecognizedBlock<string>
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js、../ast/flowchart-ast.js，不引用 React/DOM。
 */

import type { FlowClickEvent } from '../ast/flowchart-ast.js';
import type {
  CanvasState,
  FlowClassDefInfo,
  FlowchartDirection,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
} from '../types.js';
import type { RecognizedBlock } from '../recognizer/types.js';

// ============================================================
// 1. 转换器接口（严重-1 修订：拆分为两个接口；M3 重构：泛型化 TContext）
// ============================================================

/**
 * 有 model 的双向块转换器（1:1 映射）
 *
 * 适用于 VertexBlock/EdgeBlock/SubgraphOpenBlock 三种产出型 block：
 *   - parseBlock: 从 block 产出 model（MermaidNode/MermaidEdge），或 null（无主产出）
 *   - serializeBlock: 从 model 产出 block（含 rawText 字段，由 Converter 生成），或 null
 *
 * 严重-1 修订：从单一 IBlockConverter<TBlock, TModel> 拆分，
 * 12 种无 model 的 block（SubgraphClose/指令型/全局/格式保留）改用 ISideEffectBlockConverter，
 * 消除"无 model 的 block 强制绑定 TModel + 实现无意义的 serializeBlock"的接口契约矛盾。
 *
 * M3 重构（验证后修订 [一-5][一-6]）：
 *   - TBlock 约束改为 RecognizedBlock<string>，兼容 flowchart（FlowchartBlockType）和 class（ClassBlockType）
 *   - 新增 TContext 类型参数，解耦 context 类型：
 *     - flowchart converter 用 IModelBlockConverter<VertexBlock, MermaidNode, ConverterContext>
 *     - class converter 用 IModelBlockConverter<ClassBlock, MermaidNode, ClassConverterContext>
 */
export interface IModelBlockConverter<
  TBlock extends RecognizedBlock<string>,
  TModel,
  TContext,
> {
  /** parse：返回产出的 model，或 null（无主产出） */
  parseBlock(block: TBlock, context: TContext): TModel | null;

  /** serialize：从 model 产出 block（含 rawText 字段，由 Converter 生成），或 null */
  serializeBlock(model: TModel, context: TContext): TBlock | null;
}

/**
 * 无 model 的副作用型块转换器（仅 parse 方向）
 *
 * 适用于 12 种无 model 的 block：
 *   - SubgraphCloseBlock: parse 时 ctx.popParent()
 *   - 指令型 ClassApplyBlock/StyleBlock/LinkStyleBlock: parse 时通过 ctx.updateNode/updateEdge 应用副作用
 *   - 全局指令型 ClassDefBlock/ClickBlock/DirectionBlock/TitleBlock/AccTitleBlock/AccDescriptionBlock:
 *     parse 时通过 ctx.metadataCollector 累积
 *   - 格式保留型 CommentBlock/BlankBlock: parse 时无副作用，仅 Assembler 输出 rawText
 *
 * serialize 方向：由 ConverterRegistry.serialize 扫描 canvas 全局产出 block（含 rawText），不走 1:1 serializeBlock。
 *
 * M3 重构（验证后修订 [一-5][一-6]）：
 *   - TBlock 约束改为 RecognizedBlock<string>，兼容 flowchart/class 双端
 *   - 新增 TContext 类型参数，解耦 context 类型
 */
export interface ISideEffectBlockConverter<
  TBlock extends RecognizedBlock<string>,
  TContext,
> {
  /** parse：执行副作用（更新 ctx 状态），无返回值 */
  parseBlock(block: TBlock, context: TContext): void;

  // 无 serializeBlock 方法 — serialize 由 ConverterRegistry.serialize 扫描产出
}

// ============================================================
// 2. 转换上下文（严重-2 修订：受控方法收敛副作用）
// ============================================================

/**
 * 转换上下文（跨 Converter 共享状态，parse 时可变）
 *
 * 严重-2 修订：提供受控方法收敛副作用，明确责任主体。
 * ConverterRegistry.parseBlocks 只负责按 type 分发，不触碰栈/index；
 * 各 Converter 调用对应受控方法执行副作用，责任主体明确，避免重复执行或遗漏执行。
 *
 * P1-2 修订：edgesIndex 重构为 edges + edgesById，支持 linkStyle 数字索引定位。
 */
export interface ConverterContext {
  // === parentStack 受控方法（parse 时 SubgraphOpenConverter.pushParent / SubgraphCloseConverter.popParent）===
  pushParent(subgraphId: string): void;
  popParent(): string | undefined;
  /** 获取栈顶 subgraphId（顶层为 undefined；EdgeConverter.parseBlock 时读取设置到 MermaidEdgeData.subgraphId，P1-6 方案B） */
  currentParent(): string | undefined;

  // === nodes 受控方法 ===
  /** 注册新节点（VertexConverter/SubgraphOpenConverter.parseBlock 时调用） */
  registerNode(node: MermaidNode): void;
  /** 更新已有节点（StyleConverter/ClassApplyConverter.parseBlock 时调用） */
  updateNode(nodeId: string, mutate: (node: MermaidNode) => void): void;
  /** 获取节点（只读访问） */
  getNode(nodeId: string): MermaidNode | undefined;

  // === edges 受控方法（P1-2 修订：edges + edgesById 支持 linkStyle 数字索引定位）===
  /** 注册新边（EdgeConverter.parseBlock 时调用） */
  registerEdge(edge: MermaidEdge): void;
  /** 按数字索引更新边（LinkStyleConverter.parseBlock 时调用，target.kind === 'indices'） */
  updateEdgeByIndex(index: number, mutate: (edge: MermaidEdge) => void): void;
  /** 更新所有边（LinkStyleConverter.parseBlock 时调用，target.kind === 'default'） */
  updateAllEdges(mutate: (edge: MermaidEdge) => void): void;
  /** 获取边列表（只读访问，serialize 方向用） */
  getEdges(): readonly MermaidEdge[];

  // === 元数据收集器（全局指令型 block 累积）===
  metadataCollector: IMetadataCollector;
}

// ============================================================
// 3. 元数据收集器（全局指令型 block 的累积）
// ============================================================

/**
 * 元数据收集器（承载全局指令型 block 的累积）
 *
 * 各方法对应 GraphMetadata 的字段：
 *   - addClassDef → metadata.flowClassDefs
 *   - addClickEvent → metadata.flowClickEvents（决策15：ClickConverter 仅走此路径，不再设置节点字段）
 *   - setDirection → metadata.direction
 *   - setTitle → metadata.title
 *   - setAccTitle → metadata.accTitle
 *   - setAccDescription → metadata.accDescription
 *   - setLinkStyleDefault → metadata.flowDefaultStyle + metadata.flowDefaultInterpolate（决策16 签名扩展）
 */
export interface IMetadataCollector {
  /** classDef 定义（classDef className fill:#fff,stroke:#000） */
  addClassDef(info: FlowClassDefInfo): void;
  /** click 事件（click nodeId callback "tooltip"） */
  addClickEvent(event: FlowClickEvent): void;
  /** 图表方向（direction TB） */
  setDirection(dir: FlowchartDirection): void;
  /** 图表标题（title xxx） */
  setTitle(title: string): void;
  /** 无障碍标题（accTitle: xxx） */
  setAccTitle(accTitle: string): void;
  /** 无障碍描述（accDescription: xxx） */
  setAccDescription(desc: string): void;
  /**
   * 默认边样式与插值（linkStyle default stroke:#f00 / linkStyle default interpolate basis stroke:#f00）
   *
   * 决策16 签名扩展：一次调用同时处理 styles 和 interpolate，对应 GraphMetadata.flowDefaultStyle + flowDefaultInterpolate。
   * 对应 LinkStyleBlock.target.kind === 'default' 的完整处理路径。
   * - styles: 样式字符串列表，累积到 metadata.flowDefaultStyle
   * - interpolate: 插值算法名（可选，对齐 INTERPOLATE 语法），累积到 metadata.flowDefaultInterpolate
   */
  setLinkStyleDefault(styles: readonly string[], interpolate?: string): void;
  /** 构建最终 GraphMetadata（不可变快照） */
  build(): GraphMetadata;
}

// ============================================================
// 4. 结果类型（中等-4 修订：显式定义）
// ============================================================

/**
 * 块转换结果（中等-4 修订：显式定义；命名修订：从 ParseResult 改为 BlockConvertResult）
 *
 * 命名修订原因：types.ts:1508 已存在全局 ParseResult（ParseSuccessResult | ParseFailureResult 判别联合，含 success 字段），
 * 是顶级 parseMermaid 的返回类型。converter 层的"块级转换结果"与顶级语义层级不同
 * （converter 总是返回 canvas + errors，无 success/failure 判别），同名会造成命名冲突与语义混淆。
 * 重命名为 BlockConvertResult 明确表达"块级转换结果"语义，与全局 ParseResult 区分。
 *
 * 用途：ConverterRegistry.parseBlocks 返回值
 */
export interface BlockConvertResult {
  readonly canvas: CanvasState;
  readonly errors: readonly BlockConvertError[];
}

/**
 * 组装结果（中等-4 修订：显式定义；命名修订：从 SerializeResult 改为 AssembleResult）
 *
 * 命名修订原因：types.ts:1518 已存在全局 SerializeResult（{ mermaid: string; errors: ParseError[] }），
 * 是顶级 serializeMermaid 的返回类型。Assembler.assemble 函数的返回类型与之同名但字段结构不同
 * （AssembleResult 用 code 字段，全局 SerializeResult 用 mermaid 字段），同名会造成命名冲突。
 * 重命名为 AssembleResult 明确表达"组装结果"语义，与全局 SerializeResult 区分。
 *
 * 用途：Assembler.assemble(canvas) 返回值
 */
export interface AssembleResult {
  readonly code: string;
  readonly errors: readonly AssembleError[];
}

/**
 * 块转换错误（不中断，由 ErrorCollector 收集；命名修订：从 ParseError 改为 BlockConvertError）
 *
 * 命名修订原因：types.ts:1510 已存在全局 ParseError（{ line, column, message, severity, context? }），
 * 是 jison parser 抛出的"行/列错误"，含位置信息。converter 层的错误是"块级错误"
 * （含 block 字段标识出错的 RecognizedBlock），语义不同。同名会造成命名冲突。
 * 重命名为 BlockConvertError 明确表达"块级转换错误"语义，与全局 ParseError 区分。
 *
 * M3 重构（验证后修订 [一-6]）：block 类型改为 RecognizedBlock<string>，
 * 兼容 flowchart（FlowchartRecognizedBlock）和 class（ClassRecognizedBlock）双端。
 */
export interface BlockConvertError {
  readonly block: RecognizedBlock<string>;
  readonly message: string;
}

/**
 * 组装错误（命名修订：从 SerializeError 改为 AssembleError）
 *
 * 命名修订原因：与 AssembleResult 配套命名，保持一致的 Assemble 前缀。
 */
export interface AssembleError {
  readonly message: string;
}
