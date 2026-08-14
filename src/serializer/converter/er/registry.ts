/**
 * Er Converter Registry — ErBlockConverterEntry 判别联合 + ErConverterRegistry 实现
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块2-转换器.md
 * 阶段：模块2 L2-10
 *
 * 数据流：
 *   parse 方向：ErConverterRegistry.parseBlocks(blocks, diagramType) → BlockConvertResult
 *     - 创建 ErDefaultConverterContext + DefaultErMetadataCollector
 *     - 遍历 blocks，try/catch SubgraphStackError → BlockConvertError（不中断）
 *     - dispatchParse: exhaustive switch 10 case + never check
 *     - buildCanvas: 从 ctx 提取 nodes/edges，调用 mergeErNodeStyles 后处理，从 metadataCollector.build() 提取 metadata
 *   serialize 方向：ErConverterRegistry.serialize(canvas, diagramType) → ErRecognizedBlock[]
 *     - 1. 顶层 DirectionBlock（从 metadata.direction）
 *     - 2. AccTitle / AccDescription blocks（从 metadata）
 *     - 3. Relationship blocks（从 edges，type='er-relation'）
 *     - 4. Subgraph DFS（按 parentId 分组深度优先遍历，open/close 嵌套）
 *     - 5. Entity blocks（ALL 顶层产出，indent=0，不按 parentId 嵌套）
 *     - 6. ClassDef blocks（从 metadata.erClasses）
 *     - 7. ClassApply blocks（从 metadata.erClassApplyClasses，保留原始多目标多类名分组）
 *     - 8. Style blocks（从 nodes.data.styles，按节点聚合）
 *
 * 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（设计点6）：
 *   - erDiagram header 是固定字符串 `erDiagram`（无 direction 后缀），顶层 direction 必须作为独立 DirectionBlock 产出
 *   - 与 class 模式一致，与 flowchart 不同（flowchart header 含 direction）
 *
 * ER subgraph serialize 特性（设计点8）：
 *   - subgraph open rawText 包含 open + direction + 节点引用（多行，内部缩进 2 空格）
 *   - 嵌套 subgraph 由 DFS 递归产出（open/close 配对，indent 按 depth × 2 递增）
 *   - entity 定义全部在顶层产出（indent=0），subgraph 仅引用节点 ID
 *   - 与 class namespace 不同（class namespace open 是单行，子 class 在 namespace 内部定义）
 *
 * 实现组成：
 *   1. ErBlockConverterEntry 判别联合（10 种 BlockType 完整覆盖）
 *   2. 辅助函数（createDefaultNode / mergeNode / mergeNodeData + serialize 方向 block 工厂）
 *   3. ErDefaultConverterContext — ErConverterContext 默认实现
 *   4. DefaultErMetadataCollector — ErMetadataCollector 默认实现
 *   5. ErConverterRegistry — er 专属 Registry 实现（implements ConverterRegistry）
 *
 * 设计模式（对齐 flowchart/class）：
 *   - Converter 单例在 ./index.ts 实例化并打包为 erConverterEntries
 *   - ErConverterRegistry 构造函数消费 erConverterEntries 构建查找表
 *   - index.ts ↔ registry.ts 通过 `import type` 打破运行时循环依赖
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js、
 *   ./subgraph-converter.js、./style-converter.js、./index.js，不引用 React/DOM。
 */

import type {
  ErClassApplyInfo,
  ErClassInfo,
  ErSubGraphInfo,
  FlowchartDirection,
  GraphCanvasState,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
  MermaidNodeData,
  MermaidShapeType,
} from '../../types.js';
import type {
  ErAccDescriptionBlock,
  ErAccTitleBlock,
  ErBlockType,
  ErClassApplyBlock,
  ErClassDefBlock,
  ErDirectionBlock,
  ErEntityBlock,
  ErRecognizedBlock,
  ErRelationshipBlock,
  ErStyleBlock,
  ErSubgraphCloseBlock,
  ErSubgraphOpenBlock,
} from '../../recognizer/types.js';
import type {
  BlockConvertError,
  BlockConvertResult,
  IModelBlockConverter,
  ISideEffectBlockConverter,
} from '../types.js';
import type { CanvasState, DiagramType } from '../../types.js';
import type { ErConverterContext, ErMetadataCollector } from './types.js';
import type { ConverterRegistry } from '../registry.js';
import {
  SubgraphStackError,
  toBlockConvertError,
} from './subgraph-converter.js';
import { mergeErNodeStyles } from './style-converter.js';
import { erConverterEntries } from './index.js';

// ============================================================
// 1. ErBlockConverterEntry 判别联合（10 种 BlockType 完整覆盖）
// ============================================================

/**
 * er Converter 注册表 value 类型（判别 union 收窄分发）
 *
 * 分发时 switch(entry.type) + 类型收窄，编译器保证类型安全：
 *   - 产出型（3 种）：entity/relationship/subgraph-open → IModelBlockConverter 双向
 *   - 结构型（1 种）：subgraph-close → ISideEffectBlockConverter 仅 parse
 *   - 指令型（2 种）：class-apply/style → ISideEffectBlockConverter 仅 parse
 *   - 全局指令型（4 种）：classDef/direction/accTitle/accDescription → ISideEffectBlockConverter 仅 parse
 */
export type ErBlockConverterEntry =
  | { type: 'entity'; converter: IModelBlockConverter<ErEntityBlock, MermaidNode, ErConverterContext> }
  | { type: 'relationship'; converter: IModelBlockConverter<ErRelationshipBlock, MermaidEdge, ErConverterContext> }
  | { type: 'subgraph-open'; converter: IModelBlockConverter<ErSubgraphOpenBlock, MermaidNode, ErConverterContext> }
  | { type: 'subgraph-close'; converter: ISideEffectBlockConverter<ErSubgraphCloseBlock, ErConverterContext> }
  | { type: 'class-apply'; converter: ISideEffectBlockConverter<ErClassApplyBlock, ErConverterContext> }
  | { type: 'style'; converter: ISideEffectBlockConverter<ErStyleBlock, ErConverterContext> }
  | { type: 'classDef'; converter: ISideEffectBlockConverter<ErClassDefBlock, ErConverterContext> }
  | { type: 'direction'; converter: ISideEffectBlockConverter<ErDirectionBlock, ErConverterContext> }
  | { type: 'accTitle'; converter: ISideEffectBlockConverter<ErAccTitleBlock, ErConverterContext> }
  | { type: 'accDescription'; converter: ISideEffectBlockConverter<ErAccDescriptionBlock, ErConverterContext> };

// ============================================================
// 2. 模块级辅助函数
// ============================================================

/**
 * 创建前向引用默认节点（er-box 类型）
 *
 * 场景：ErStyleBlock/ErClassApplyBlock 可能出现在 ErEntityBlock 之前
 * （如 `style A fill:#fff` 在 `ENTITY_A` 之前）。
 * 对齐 flowchart/class createDefaultNode 行为：隐式创建节点，后续 registerNode 通过 merge 合并字段。
 *
 * 默认节点的 styles/classNames 为 undefined（不覆盖已有字段），
 * label 回退为 nodeId（对齐 flowchart/class 行为）。
 */
function createDefaultNode(nodeId: string): MermaidNode {
  return {
    id: nodeId,
    type: 'er-box',
    position: { x: 0, y: 0 },
    data: {
      label: nodeId,
      shape: 'er-box' as MermaidShapeType,
      isSubgraph: false,
    },
  };
}

/**
 * 合并两个 MermaidNode（incoming 非 undefined 字段覆盖 existing）
 *
 * id 是主键，永不变化。
 * data 字段通过 mergeNodeData 深层合并（incoming 非 undefined 字段覆盖 existing）。
 * parentId 由 incoming 优先（ER 不会在边定义时顺便更新节点，无需 flowchart 的 deepest-wins 决策）。
 * 其他顶层可选字段（extent/selected 等）按 incoming 非 undefined 覆盖。
 */
function mergeNode(existing: MermaidNode, incoming: MermaidNode): MermaidNode {
  const incomingRecord = incoming as unknown as Record<string, unknown>;
  const existingRecord = existing as unknown as Record<string, unknown>;
  const mergedTop: Record<string, unknown> = { ...existingRecord };

  for (const key of Object.keys(incomingRecord)) {
    if (key === 'data' || key === 'id') {
      continue; // data 单独处理，id 保持 existing
    }
    const value = incomingRecord[key];
    if (value !== undefined) {
      mergedTop[key] = value;
    }
  }

  const result = mergedTop as unknown as MermaidNode;
  result.id = existing.id;
  result.data = mergeNodeData(existing.data, incoming.data);
  return result;
}

/**
 * 合并两个 MermaidNodeData（incoming 非 undefined 字段覆盖 existing）
 *
 * 遍历 incoming 的所有 key，非 undefined 的值覆盖 existing 的对应字段。
 * 支持数组类型字段（如 styles/classNames）的整体替换语义 —
 * 数组替换而非拼接，因为同一 entityId 的 ErEntityBlock 重新定义时应当替换而非追加。
 */
function mergeNodeData(
  existing: MermaidNodeData,
  incoming: MermaidNodeData,
): MermaidNodeData {
  const existingRecord = existing as unknown as Record<string, unknown>;
  const incomingRecord = incoming as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...existingRecord };

  for (const key of Object.keys(incomingRecord)) {
    const value = incomingRecord[key];
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged as unknown as MermaidNodeData;
}

// === serialize 方向 block 构造函数（副作用型 block 由 Registry 直接产出）===

/**
 * 构造 ErSubgraphCloseBlock（rawText: 'end'，对齐 mermaid erDiagram subgraph 关闭语法）
 *
 * mermaid erDiagram 的 subgraph 关闭符号是 `end`（对齐 er.jison 官方语法
 * `subgraph <id> ... end`，与 flowchart subgraph 一致，与 classDiagram namespace 的 `}` 不同）。
 *
 * 语法偏差修复（2026-07-07）：原设计假设 ER subgraph 用 `}` 关闭（与 class namespace 一致），
 * 实际 er.jison 语法是 `end`。已修订 rawText + 注释。
 */
function createSubgraphCloseBlock(
  subgraphId: string,
  indent: number,
): ErSubgraphCloseBlock {
  return {
    type: 'subgraph-close',
    sourceLine: undefined,
    rawText: 'end',
    indent,
    subgraphId,
  };
}

/**
 * 构造顶层 ErDirectionBlock（rawText: `direction ${dir}`，indent=0）
 *
 * erDiagram header 是固定字符串 `erDiagram`（无 direction 后缀），
 * 顶层 direction 必须作为独立 DirectionBlock 产出（对齐老路径 serializeER 行为）。
 */
function createDirectionBlock(dir: FlowchartDirection): ErDirectionBlock {
  return {
    type: 'direction',
    sourceLine: undefined,
    rawText: `direction ${dir}`,
    indent: 0,
    dir,
  };
}

/** 构造 ErAccTitleBlock（rawText: `accTitle: ${accTitle}`） */
function createAccTitleBlock(accTitle: string): ErAccTitleBlock {
  return {
    type: 'accTitle',
    sourceLine: undefined,
    rawText: `accTitle: ${accTitle}`,
    indent: 0,
    accTitle,
  };
}

/** 构造 ErAccDescriptionBlock（rawText: `accDescr: ${accDescription}`，对齐官方缩写语法） */
function createAccDescriptionBlock(accDescription: string): ErAccDescriptionBlock {
  return {
    type: 'accDescription',
    sourceLine: undefined,
    rawText: `accDescr: ${accDescription}`,
    indent: 0,
    accDescription,
  };
}

/** 构造 ErClassDefBlock（rawText: `classDef className style1,style2,...`）
 *
 * 只输出 info.styles（textStyles 是 parser 从 styles 派生的数据，不应序列化输出）。
 *
 * 设计偏差修复（2026-07-07）：原实现合并 [...info.styles, ...info.textStyles] 输出，
 * 但 er-recognizer.ts 的 addClass 方法把含 `color` 的样式同时加入 styles 和 textStyles
 * （textStyles 中 fill 替换为 bgFill），导致 `color:#f00` 重复输出。
 * 修复为只输出 info.styles，第二次 parse 时 parser 会重新派生 textStyles。
 */
function createClassDefBlock(info: ErClassInfo): ErClassDefBlock {
  const allStyles = [...info.styles];
  const rawText = `classDef ${info.id} ${allStyles.join(',')}`;
  return {
    type: 'classDef',
    sourceLine: undefined,
    rawText,
    indent: 0,
    className: info.id,
    styles: [...info.styles],
    textStyles: [...info.textStyles],
  };
}

/** 构造 ErClassApplyBlock（rawText: `class id1,id2 className1,className2`）
 *
 * 保留原始多目标多类名分组（从 metadata.erClassApplyClasses 产出）。
 * 对齐 mermaid 官方 erDiagram 语法：`class A,B c1,c2`（逗号分隔多目标多类名）。
 */
function createClassApplyBlock(apply: ErClassApplyInfo): ErClassApplyBlock {
  return {
    type: 'class-apply',
    sourceLine: undefined,
    rawText: `class ${apply.ids.join(',')} ${apply.classNames.join(',')}`,
    indent: 0,
    ids: [...apply.ids],
    classNames: [...apply.classNames],
  };
}

/** 构造 ErStyleBlock（rawText: `style nodeId style1,style2,...`） */
function createStyleBlock(
  nodeId: string,
  styles: readonly string[],
): ErStyleBlock {
  return {
    type: 'style',
    sourceLine: undefined,
    rawText: `style ${nodeId} ${styles.join(',')}`,
    indent: 0,
    ids: [nodeId],
    styles: [...styles],
  };
}

// ============================================================
// 3. ErDefaultConverterContext — ErConverterContext 默认实现
// ============================================================

/**
 * ErConverterContext 默认实现
 *
 * 内部状态：
 *   - parentStack: string[] — subgraph 栈，pushParent/popParent/currentParent
 *   - nodes: Map<string, MermaidNode> — 节点注册表（保留插入顺序，merge 语义）
 *   - edges: MermaidEdge[] — 边列表（按注册顺序）
 *   - metadataCollector: ErMetadataCollector — 注入的元数据收集器
 *   - errors: BlockConvertError[] — 错误收集（不中断后续 block 处理）
 *
 * merge 语义：registerNode 时若 nodeId 已存在则按字段优先级 merge。
 * 前向引用：updateNode 在节点不存在时创建默认节点（对齐 flowchart/class createDefaultNode 行为）。
 */
export class ErDefaultConverterContext implements ErConverterContext {
  private readonly parentStack: string[] = [];
  private readonly nodes: Map<string, MermaidNode> = new Map();
  private readonly edges: MermaidEdge[] = [];
  private readonly errors: BlockConvertError[] = [];
  readonly metadataCollector: ErMetadataCollector;

  constructor(metadataCollector: ErMetadataCollector) {
    this.metadataCollector = metadataCollector;
  }

  // === parentStack 受控方法 ===

  pushParent(subgraphId: string): void {
    this.parentStack.push(subgraphId);
  }

  popParent(): string | undefined {
    return this.parentStack.pop();
  }

  currentParent(): string | undefined {
    return this.parentStack[this.parentStack.length - 1];
  }

  // === nodes 受控方法 ===

  /**
   * 注册新节点（merge 语义）
   *
   * 若 nodeId 已存在，按字段优先级 merge（incoming 非 undefined 字段覆盖 existing）。
   * 支持 ErEntityBlock 重新定义时替换字段（如 label/attributes 等）。
   *
   * parentId 归属语义：incoming.parentId 优先（ER 场景：ErEntityBlock 总是带正确 parentId，由模块1 前置）。
   */
  registerNode(node: MermaidNode): void {
    const existing = this.nodes.get(node.id);
    if (existing === undefined) {
      this.nodes.set(node.id, node);
      return;
    }
    const merged = mergeNode(existing, node);
    // incoming.parentId 优先（ER 场景：ErEntityBlock 总是带正确 parentId）
    if (node.parentId !== undefined) {
      merged.parentId = node.parentId;
    }
    this.nodes.set(node.id, merged);
  }

  /**
   * 更新已有节点（前向引用：节点不存在时创建默认节点）
   *
   * 场景：ErStyleBlock/ErClassApplyBlock 可能出现在 ErEntityBlock 之前。
   * 对齐 flowchart/class createDefaultNode 行为：隐式创建节点，后续 registerNode 通过 merge 合并。
   */
  updateNode(nodeId: string, mutate: (node: MermaidNode) => void): void {
    const existing = this.nodes.get(nodeId);
    if (existing === undefined) {
      const defaultNode = createDefaultNode(nodeId);
      mutate(defaultNode);
      this.nodes.set(nodeId, defaultNode);
      return;
    }
    mutate(existing);
  }

  getNode(nodeId: string): MermaidNode | undefined {
    return this.nodes.get(nodeId);
  }

  /** 获取所有节点（保留插入顺序，Map iteration order 保证） */
  getNodes(): MermaidNode[] {
    return [...this.nodes.values()];
  }

  // === edges 受控方法 ===

  registerEdge(edge: MermaidEdge): void {
    this.edges.push(edge);
  }

  getEdges(): readonly MermaidEdge[] {
    return this.edges;
  }

  // === 错误收集 ===

  addError(error: BlockConvertError): void {
    this.errors.push(error);
  }

  /** 获取累积的错误列表（parseBlocks 返回时使用） */
  getErrors(): readonly BlockConvertError[] {
    return this.errors;
  }
}

// ============================================================
// 4. DefaultErMetadataCollector — ErMetadataCollector 默认实现
// ============================================================

/**
 * ErMetadataCollector 默认实现
 *
 * 内部状态对应 GraphMetadata 的 er 相关字段：
 *   - erClassesValue: ErClassInfo[] — classDef 累积
 *   - erClassAppliesValue: ErClassApplyInfo[] — class 应用累积（保留原始分组）
 *   - erSubgraphsValue: ErSubGraphInfo[] — subgraph 累积（含 parentId）
 *   - directionValue / accTitleValue / accDescriptionValue — 覆盖式
 *
 * build() 返回 GraphMetadata，仅包含非空字段。
 */
export class DefaultErMetadataCollector implements ErMetadataCollector {
  private readonly erClassesValue: ErClassInfo[] = [];
  private readonly erClassAppliesValue: ErClassApplyInfo[] = [];
  private readonly erSubgraphsValue: ErSubGraphInfo[] = [];
  private directionValue: FlowchartDirection | undefined;
  private accTitleValue: string | undefined;
  private accDescriptionValue: string | undefined;

  // === er 专用字段 ===

  addErClass(classInfo: ErClassInfo): void {
    this.erClassesValue.push(classInfo);
  }

  addErClassApply(apply: ErClassApplyInfo): void {
    this.erClassAppliesValue.push(apply);
  }

  addErSubgraph(subgraph: ErSubGraphInfo): void {
    this.erSubgraphsValue.push(subgraph);
  }

  // === 通用字段 ===

  setDirection(dir: FlowchartDirection): void {
    this.directionValue = dir;
  }

  setAccTitle(title: string): void {
    this.accTitleValue = title;
  }

  setAccDescription(desc: string): void {
    this.accDescriptionValue = desc;
  }

  // === 序列化查询（serialize 方向使用）===

  getErClasses(): readonly ErClassInfo[] {
    return this.erClassesValue;
  }

  getErClassApplies(): readonly ErClassApplyInfo[] {
    return this.erClassAppliesValue;
  }

  getErSubgraphs(): readonly ErSubGraphInfo[] {
    return this.erSubgraphsValue;
  }

  getDirection(): FlowchartDirection | undefined {
    return this.directionValue;
  }

  getAccTitle(): string | undefined {
    return this.accTitleValue;
  }

  getAccDescription(): string | undefined {
    return this.accDescriptionValue;
  }

  /**
   * 构建最终 GraphMetadata（仅包含非空字段）
   */
  build(): GraphMetadata {
    const metadata: GraphMetadata = {};

    if (this.erClassesValue.length > 0) {
      metadata.erClasses = [...this.erClassesValue];
    }
    if (this.erClassAppliesValue.length > 0) {
      metadata.erClassApplyClasses = [...this.erClassAppliesValue];
    }
    if (this.erSubgraphsValue.length > 0) {
      metadata.erSubgraphs = [...this.erSubgraphsValue];
    }
    if (this.directionValue !== undefined) {
      metadata.direction = this.directionValue;
    }
    if (this.accTitleValue !== undefined) {
      metadata.accTitle = this.accTitleValue;
    }
    if (this.accDescriptionValue !== undefined) {
      metadata.accDescription = this.accDescriptionValue;
    }

    return metadata;
  }
}

// ============================================================
// 5. ErConverterRegistry — er 专属 Registry 实现
// ============================================================

/**
 * er 专属 ConverterRegistry 实现
 *
 * parse 方向：
 *   - 创建 ErDefaultConverterContext + DefaultErMetadataCollector
 *   - 遍历 blocks，try/catch SubgraphStackError → BlockConvertError（不中断）
 *   - dispatchParse: exhaustive switch 10 个 case + never check
 *   - buildCanvas: 从 ctx 提取 nodes/edges，调用 mergeErNodeStyles 后处理，从 metadataCollector.build() 提取 metadata
 *
 * serialize 方向（8 步扫描）：
 *   - 1. 顶层 DirectionBlock（从 metadata.direction）
 *   - 2. AccTitle / AccDescription blocks（从 metadata）
 *   - 3. Relationship blocks（从 edges，type='er-relation'）
 *   - 4. Subgraph DFS（按 parentId 分组深度优先遍历，open/close 嵌套）
 *   - 5. Entity blocks（ALL 顶层产出，indent=0，不按 parentId 嵌套）
 *   - 6. ClassDef blocks（从 metadata.erClasses）
 *   - 7. ClassApply blocks（从 metadata.erClassApplyClasses，保留原始多目标多类名分组）
 *   - 8. Style blocks（从 nodes.data.styles，按节点聚合）
 *
 * 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（设计点6）：
 *   - erDiagram header 是固定字符串 `erDiagram`（无 direction 后缀）
 *   - 顶层 direction 必须作为独立 DirectionBlock 产出（对齐老路径 serializeER 行为）
 *   - direction 数据源：metadata.direction（权威源），不 fallback 到 canvas.direction（避免掩盖缺陷）
 *
 * ER subgraph serialize 特性（设计点8）：
 *   - subgraph open rawText 包含 open + direction + 节点引用（多行，内部缩进 2 空格）
 *   - 嵌套 subgraph 由 DFS 递归产出（open/close 配对，indent 按 depth × 2 递增）
 *   - entity 定义全部在顶层产出（indent=0），subgraph 仅引用节点 ID
 *   - er-relation 边全部在顶层产出（ER 边无 subgraphId 概念）
 */
export class ErConverterRegistry implements ConverterRegistry {
  private readonly lookup: ReadonlyMap<ErBlockType, ErBlockConverterEntry>;

  constructor() {
    // 消费 er/index.ts 提供的 10 个无状态 Converter 单例（对齐 flowchart/class 模式）
    this.lookup = new Map(
      erConverterEntries.map((entry) => [entry.type, entry]),
    );
  }

  // === parse 方向 ===

  /**
   * parse：按 blockType 分发到对应 Converter.parseBlock
   *
   * - 产出型 block（entity/relationship/subgraph-open）→ IModelBlockConverter.parseBlock → model（累加到 ctx）
   * - 副作用型 block → ISideEffectBlockConverter.parseBlock → void（副作用通过 ctx 受控方法承载）
   * - SubgraphStackError 转为 BlockConvertError 累积到 errors，不中断后续 block 处理
   *
   * @returns BlockConvertResult { canvas, errors }
   */
  parseBlocks(
    blocks: readonly ErRecognizedBlock[],
    diagramType: DiagramType,
  ): BlockConvertResult {
    if (diagramType !== 'erDiagram') {
      throw new Error(
        `ErConverterRegistry only supports 'erDiagram', got '${diagramType}'`,
      );
    }

    const metadataCollector = new DefaultErMetadataCollector();
    const ctx = new ErDefaultConverterContext(metadataCollector);

    for (const block of blocks) {
      try {
        this.dispatchParse(block, ctx);
      } catch (err) {
        if (err instanceof SubgraphStackError) {
          ctx.addError(toBlockConvertError(err));
        } else {
          throw err;
        }
      }
    }

    const metadata = metadataCollector.build();
    const canvas = this.buildCanvas(ctx, metadata);

    return { canvas, errors: [...ctx.getErrors()] };
  }

  /**
   * 构建 GraphCanvasState
   *
   * 从 ctx 提取 nodes/edges，从 metadata 提取 direction。
   * 对每个 er-box 节点调用 mergeErNodeStyles 后处理（合并 cssCompiledStyles + data.styles → data.style）。
   * metadata 仅在非空时设置。
   *
   * direction 同步到顶层（单一数据源修复：metadata.direction 是方向唯一来源，
   * 同步到 canvas.direction 供 React Flow 直接读取）。
   */
  private buildCanvas(
    ctx: ErDefaultConverterContext,
    metadata: GraphMetadata,
  ): GraphCanvasState {
    const nodes = ctx.getNodes();

    // mergeErNodeStyles 后处理：对每个 er-box 节点合并 cssCompiledStyles + data.styles → data.style
    for (const node of nodes) {
      if (node.type === 'er-box') {
        mergeErNodeStyles(node);
      }
    }

    const canvas: GraphCanvasState = {
      diagramType: 'erDiagram',
      nodes,
      edges: [...ctx.getEdges()],
      needsLayout: true,
    };

    // direction 同步到顶层（单一数据源：metadata.direction → canvas.direction）
    if (metadata.direction !== undefined) {
      canvas.direction = metadata.direction;
    }

    if (Object.keys(metadata).length > 0) {
      canvas.metadata = metadata;
    }

    return canvas;
  }

  /**
   * exhaustive switch 分发 parse（10 个 case + never check）
   *
   * 按 block.type 分发到对应 Converter.parseBlock，类型收窄保证类型安全。
   * default 分支的 never check 确保所有 case 已覆盖，新增 block 类型时编译期报错。
   */
  private dispatchParse(
    block: ErRecognizedBlock,
    ctx: ErConverterContext,
  ): void {
    switch (block.type) {
      case 'entity': {
        const converter = this.requireConverter('entity');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'relationship': {
        const converter = this.requireConverter('relationship');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'subgraph-open': {
        const converter = this.requireConverter('subgraph-open');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'subgraph-close': {
        const converter = this.requireConverter('subgraph-close');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'class-apply': {
        const converter = this.requireConverter('class-apply');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'style': {
        const converter = this.requireConverter('style');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'classDef': {
        const converter = this.requireConverter('classDef');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'direction': {
        const converter = this.requireConverter('direction');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'accTitle': {
        const converter = this.requireConverter('accTitle');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'accDescription': {
        const converter = this.requireConverter('accDescription');
        converter.parseBlock(block, ctx);
        break;
      }
      default: {
        const _exhaustive: never = block;
        void _exhaustive;
        break;
      }
    }
  }

  // === serialize 方向 ===

  /**
   * serialize：从 canvas 产出所有 blocks（8 步扫描）
   *
   * - 1. 顶层 DirectionBlock（从 metadata.direction）
   * - 2. 全局指令：AccTitle / AccDescription（从 metadata）
   * - 3. Relationship blocks（从 edges，type='er-relation'）
   * - 4. Subgraph DFS（按 parentId 分组深度优先遍历，open/close 嵌套）
   * - 5. Entity blocks（ALL 顶层产出，indent=0，不按 parentId 嵌套）
   * - 6. ClassDef blocks（从 metadata.erClasses）
   * - 7. ClassApply blocks（从 metadata.erClassApplyClasses，保留原始多目标多类名分组）
   * - 8. Style blocks（从 nodes.data.styles，按节点聚合）
   *
   * 顶层 direction 数据源：metadata.direction（权威源），不 fallback 到 canvas.direction
   * （原始无 direction 声明的代码不应输出 direction，对齐官方示例）。
   *
   * ER entity 定义全部在顶层产出（设计点8）：
   *   - subgraph 仅引用节点 ID（在 open rawText 中），不包含 entity 定义
   *   - entity 定义在顶层独立产出（即使被 subgraph 引用也在顶层定义）
   *   - 与 class namespace 不同（class 定义在 namespace 内部产出）
   *
   * er-relation 边全部在顶层产出（ER 边无 subgraphId 概念，source/target 是全局 entityId）。
   */
  serialize(
    canvas: CanvasState,
    diagramType: DiagramType,
  ): readonly ErRecognizedBlock[] {
    if (diagramType !== 'erDiagram') {
      throw new Error(
        `ErConverterRegistry only supports 'erDiagram', got '${diagramType}'`,
      );
    }
    if (canvas.diagramType !== 'erDiagram') {
      throw new Error(
        `Expected GraphCanvasState with diagramType 'erDiagram', got '${canvas.diagramType}'`,
      );
    }

    const graphCanvas = canvas as GraphCanvasState;
    const metadata = graphCanvas.metadata ?? {};
    const blocks: ErRecognizedBlock[] = [];
    // serialize 方向的 ctx（ER Converter 的 serializeBlock 均不使用 ctx，创建空 ctx 保持接口一致）
    const ctx = new ErDefaultConverterContext(new DefaultErMetadataCollector());

    // 1. 顶层 DirectionBlock（仅从 metadata.direction 产出，不 fallback 到 canvas.direction）
    const direction = metadata.direction;
    if (direction !== undefined) {
      blocks.push(createDirectionBlock(direction));
    }

    // 2. 全局指令：AccTitle / AccDescription
    if (metadata.accTitle !== undefined) {
      blocks.push(createAccTitleBlock(metadata.accTitle));
    }
    if (metadata.accDescription !== undefined) {
      blocks.push(createAccDescriptionBlock(metadata.accDescription));
    }

    // 3. Relationship blocks（从 edges，type='er-relation'）
    const relationshipConverter = this.requireConverter('relationship');
    for (const edge of graphCanvas.edges) {
      if (edge.type !== 'er-relation') {
        continue;
      }
      const relationshipBlock = relationshipConverter.serializeBlock(edge, ctx);
      if (relationshipBlock !== null) {
        blocks.push({ ...relationshipBlock, indent: 0 });
      }
    }

    // 4. Subgraph DFS（按 parentId 分组深度优先遍历，open/close 嵌套）
    const subgraphNodes = graphCanvas.nodes.filter((n) => n.type === 'er-subgraph');
    const subgraphIdSet = new Set(subgraphNodes.map((n) => n.id));
    const nodesByParent = this.groupNodesByParent(subgraphNodes);
    this.dfsSubgraphSerialize(undefined, 0, nodesByParent, subgraphIdSet, ctx, blocks);

    // 5. Entity blocks（ALL 顶层产出，indent=0，不按 parentId 嵌套）
    const entityConverter = this.requireConverter('entity');
    for (const node of graphCanvas.nodes) {
      if (node.type !== 'er-box') {
        continue;
      }
      const entityBlock = entityConverter.serializeBlock(node, ctx);
      if (entityBlock !== null) {
        blocks.push({ ...entityBlock, indent: 0 });
      }
    }

    // 6. ClassDef blocks（从 metadata.erClasses）
    if (metadata.erClasses !== undefined) {
      for (const classInfo of metadata.erClasses) {
        blocks.push(createClassDefBlock(classInfo));
      }
    }

    // 7. ClassApply blocks（从 metadata.erClassApplyClasses，保留原始多目标多类名分组）
    if (metadata.erClassApplyClasses !== undefined) {
      for (const apply of metadata.erClassApplyClasses) {
        blocks.push(createClassApplyBlock(apply));
      }
    }

    // 8. Style blocks（从 nodes.data.styles，按节点聚合）
    const styleBlocks = this.serializeStyleBlocks(graphCanvas.nodes);
    blocks.push(...styleBlocks);

    return blocks;
  }

  /**
   * DFS 深度优先遍历产出 subgraph-open/subgraph-close blocks
   *
   * 遍历顺序：
   *   - 顶层入口（parentId === undefined）遍历所有顶层 subgraph
   *   - 每个 subgraph 产出：SubgraphOpenBlock → 递归子 subgraph → SubgraphCloseBlock
   *   - entity 节点不在此 DFS 中产出（entity 定义在顶层独立输出，步骤 5）
   *
   * indent 计算：depth × 2（subgraph 嵌套深度 × 2）
   * SubgraphCloseBlock 的 indent 与 SubgraphOpenBlock 相同（外层 indent）。
   *
   * subgraphNodes 过滤（设计点8 + 嵌套 subgraph 处理）：
   *   - parser 解析 `subgraph outer\n  subgraph inner` 时会把 'inner' 加入 outer.subgraphNodes
   *   - 序列化时嵌套 subgraph 由 DFS 递归产出（`subgraph inner ... end`），
   *     不应在父 subgraph 的 nodes 引用列表中重复输出
   *   - 用 subgraphIdSet 过滤 data.subgraphNodes，只保留 entity 子节点引用
   *   - round-trip 等价性：第一次和第二次 parse 都会把 'inner' 加入 outer.subgraphNodes（parser 行为一致），
   *     序列化输出一致，CanvasState 等价
   *
   * 与 class namespace DFS 的差异：
   *   - class DFS 在 namespace 内部产出 class/note blocks（按 parentId 分组）
   *   - ER DFS 仅产出 subgraph-open/close，entity 定义在顶层独立输出（设计点8）
   */
  private dfsSubgraphSerialize(
    parentId: string | undefined,
    depth: number,
    nodesByParent: Map<string | undefined, MermaidNode[]>,
    subgraphIdSet: Set<string>,
    ctx: ErConverterContext,
    blocks: ErRecognizedBlock[],
  ): void {
    const indent = depth * 2;
    const children = nodesByParent.get(parentId) ?? [];

    for (const node of children) {
      if (node.type !== 'er-subgraph') {
        continue;
      }

      // 过滤 subgraphNodes：排除嵌套 subgraph ID（嵌套 subgraph 由 DFS 递归产出）
      const rawSubgraphNodes = (node.data.subgraphNodes as string[] | undefined) ?? [];
      const hasNestedSubgraph = rawSubgraphNodes.some((id) => subgraphIdSet.has(id));
      const nodeToSerialize: MermaidNode = hasNestedSubgraph
        ? {
            ...node,
            data: {
              ...node.data,
              subgraphNodes: rawSubgraphNodes.filter((id) => !subgraphIdSet.has(id)),
            },
          }
        : node;

      // Subgraph open
      const subgraphOpenConverter = this.requireConverter('subgraph-open');
      const openBlock = subgraphOpenConverter.serializeBlock(nodeToSerialize, ctx);
      if (openBlock !== null) {
        blocks.push({ ...openBlock, indent });
      }

      // 递归处理子 subgraph（depth + 1）
      this.dfsSubgraphSerialize(
        node.id,
        depth + 1,
        nodesByParent,
        subgraphIdSet,
        ctx,
        blocks,
      );

      // Subgraph close（indent 与 open 相同）
      blocks.push(createSubgraphCloseBlock(node.id, indent));
    }
  }

  /**
   * 按 parentId 分组节点（undefined = 顶层）
   * 保留 canvas.nodes 的原始顺序（Map + push 保证）。
   */
  private groupNodesByParent(
    nodes: readonly MermaidNode[],
  ): Map<string | undefined, MermaidNode[]> {
    const map = new Map<string | undefined, MermaidNode[]>();
    for (const node of nodes) {
      const parentId = node.parentId;
      const existing = map.get(parentId);
      if (existing === undefined) {
        map.set(parentId, [node]);
      } else {
        existing.push(node);
      }
    }
    return map;
  }

  /**
   * 序列化 Style blocks
   *
   * 扫描所有 er-box 节点的 data.styles，每个有 styles 的节点产出独立的 ErStyleBlock。
   * 注意：ErStyleBlock 字段是 ids（数组，支持多目标），serialize 时按节点聚合为单目标。
   * 使用 \0 作为分隔符构建 key（避免 styles 内容冲突，对齐 flowchart）。
   */
  private serializeStyleBlocks(
    nodes: readonly MermaidNode[],
  ): ErStyleBlock[] {
    const blocks: ErStyleBlock[] = [];
    for (const node of nodes) {
      if (node.type !== 'er-box') {
        continue;
      }
      const styles = node.data.styles as string[] | undefined;
      if (styles === undefined || styles.length === 0) {
        continue;
      }
      blocks.push(createStyleBlock(node.id, styles));
    }
    return blocks;
  }

  // === 类型安全分发辅助（函数重载，按 block 类型字面量返回精确 Converter 类型）===

  /**
   * 获取指定类型的 Converter（类型安全，不存在则 throw）
   *
   * 使用函数重载而非泛型 — 泛型 + Extract<联合, { type: K }> 在 K 为类型参数时
   * 产生不可满足的交叉类型，TypeScript 无法验证。函数重载让每个调用点获得精确类型。
   *
   * runtime 安全由 lookup 构造保证 — entries 中 entry.type 与 entry.converter 的
   * 类型对应关系由 ErBlockConverterEntry 判别联合定义。
   */
  private requireConverter(type: 'entity'): IModelBlockConverter<ErEntityBlock, MermaidNode, ErConverterContext>;
  private requireConverter(type: 'relationship'): IModelBlockConverter<ErRelationshipBlock, MermaidEdge, ErConverterContext>;
  private requireConverter(type: 'subgraph-open'): IModelBlockConverter<ErSubgraphOpenBlock, MermaidNode, ErConverterContext>;
  private requireConverter(type: 'subgraph-close'): ISideEffectBlockConverter<ErSubgraphCloseBlock, ErConverterContext>;
  private requireConverter(type: 'class-apply'): ISideEffectBlockConverter<ErClassApplyBlock, ErConverterContext>;
  private requireConverter(type: 'style'): ISideEffectBlockConverter<ErStyleBlock, ErConverterContext>;
  private requireConverter(type: 'classDef'): ISideEffectBlockConverter<ErClassDefBlock, ErConverterContext>;
  private requireConverter(type: 'direction'): ISideEffectBlockConverter<ErDirectionBlock, ErConverterContext>;
  private requireConverter(type: 'accTitle'): ISideEffectBlockConverter<ErAccTitleBlock, ErConverterContext>;
  private requireConverter(type: 'accDescription'): ISideEffectBlockConverter<ErAccDescriptionBlock, ErConverterContext>;
  private requireConverter(type: ErBlockType): ErBlockConverterEntry['converter'] {
    const entry = this.lookup.get(type);
    if (entry === undefined) {
      throw new Error(`Converter not registered for block type: ${type}`);
    }
    return entry.converter;
  }
}
