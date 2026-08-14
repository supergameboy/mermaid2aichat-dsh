/**
 * Converter Registry — BlockConverterEntry 判别联合 + ConverterRegistry 实现
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4（具体 Registry 实现）；M3 重构 L2-10（接入 classDiagram 路由 + 接口泛型化）
 *
 * 数据流：
 *   parse 方向：ConverterRegistry.parseBlocks(blocks, diagramType) → BlockConvertResult
 *     - 按 block.type 分发到对应 Converter.parseBlock
 *     - 产出型 block → IModelBlockConverter.parseBlock → model（通过 ctx.registerNode/registerEdge 累加）
 *     - 副作用型 block → ISideEffectBlockConverter.parseBlock → void（副作用通过 ctx 受控方法承载）
 *   serialize 方向：ConverterRegistry.serialize(canvas, diagramType) → blocks[]
 *     - 产出型 block → IModelBlockConverter.serializeBlock（从 model 产出 block，含 rawText）
 *     - 副作用型 block → 扫描 canvas.nodes/edges/metadata 产出 block（含 rawText）
 *
 * 实现组成：
 *   1. BlockConverterEntry 判别联合（类型定义，Stage 2 已固化；flowchart 专用）
 *   2. ConverterRegistry 接口（契约定义；M3 重构 L2-10 泛型化为 RecognizedBlock<string>[]）
 *   3. DefaultConverterContext — ConverterContext 默认实现（决策17 merge + 前向引用）
 *   4. DefaultMetadataCollector — IMetadataCollector 默认实现（决策16 setLinkStyleDefault）
 *   5. FlowchartConverterRegistry — flowchart 专属 Registry 实现
 *   6. RoutingConverterRegistry + converterRegistry singleton — 按 diagramType 路由
 *      （M3 重构 L2-10 接入 classDiagram → ClassConverterRegistry）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、./types.js、../types.js、./flowchart/index.js、
 *   ./class/registry.js、./flowchart/subgraph-converter.js，不引用 React/DOM。
 */

import type { FlowClickEvent } from '../ast/flowchart-ast.js';
import type {
  AccDescriptionBlock,
  AccTitleBlock,
  BlankBlock,
  ClassApplyBlock,
  ClassDefBlock,
  ClassRecognizedBlock,
  ClickBlock,
  CommentBlock,
  DirectionBlock,
  EdgeBlock,
  FlowchartRecognizedBlock,
  FlowchartBlockType,
  LinkStyleBlock,
  RecognizedBlock,
  StyleBlock,
  SubgraphCloseBlock,
  SubgraphOpenBlock,
  TitleBlock,
  VertexBlock,
} from '../recognizer/types.js';
import type {
  CanvasState,
  FlowClassDefInfo,
  FlowchartDirection,
  GraphCanvasState,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
  MermaidNodeData,
} from '../types.js';
import type {
  BlockConvertError,
  BlockConvertResult,
  ConverterContext,
  IModelBlockConverter,
  IMetadataCollector,
  ISideEffectBlockConverter,
} from './types.js';
import type { DiagramType } from '../types.js';
import { flowchartConverterEntries } from './flowchart/index.js';
import { ClassConverterRegistry } from './class/registry.js';
import { ErConverterRegistry } from './er/registry.js';
import type { ErRecognizedBlock } from '../recognizer/types.js';
import {
  SubgraphStackError,
  toBlockConvertError,
} from './flowchart/subgraph-converter.js';
import { mergeNodeStyles } from './flowchart/style-converter.js';

// ============================================================
// 1. BlockConverterEntry 判别联合（中等-6 修订：判别 union 收窄分发）
// ============================================================

/**
 * ConverterRegistry 注册表 value 类型（中等-6 修订：判别 union 收窄分发；M3 重构：泛型化 TContext）
 *
 * 分发时 switch(entry.type) + 类型收窄，编译器保证类型安全：
 *   - 'vertex' → IModelBlockConverter<VertexBlock, MermaidNode, ConverterContext>
 *   - 'edge' → IModelBlockConverter<EdgeBlock, MermaidEdge, ConverterContext>
 *   - 'subgraph-open' → IModelBlockConverter<SubgraphOpenBlock, MermaidNode, ConverterContext>
 *   - 其他 12 种 → ISideEffectBlockConverter<对应 Block, ConverterContext>
 *
 * M3 重构（验证后修订 [一-5][一-6]）：所有 converter 接口添加 TContext=ConverterContext 类型参数。
 */
export type BlockConverterEntry =
  | { type: 'vertex'; converter: IModelBlockConverter<VertexBlock, MermaidNode, ConverterContext> }
  | { type: 'edge'; converter: IModelBlockConverter<EdgeBlock, MermaidEdge, ConverterContext> }
  | { type: 'subgraph-open'; converter: IModelBlockConverter<SubgraphOpenBlock, MermaidNode, ConverterContext> }
  | { type: 'subgraph-close'; converter: ISideEffectBlockConverter<SubgraphCloseBlock, ConverterContext> }
  | { type: 'classDef'; converter: ISideEffectBlockConverter<ClassDefBlock, ConverterContext> }
  | { type: 'class-apply'; converter: ISideEffectBlockConverter<ClassApplyBlock, ConverterContext> }
  | { type: 'style'; converter: ISideEffectBlockConverter<StyleBlock, ConverterContext> }
  | { type: 'linkStyle'; converter: ISideEffectBlockConverter<LinkStyleBlock, ConverterContext> }
  | { type: 'click'; converter: ISideEffectBlockConverter<ClickBlock, ConverterContext> }
  | { type: 'direction'; converter: ISideEffectBlockConverter<DirectionBlock, ConverterContext> }
  | { type: 'title'; converter: ISideEffectBlockConverter<TitleBlock, ConverterContext> }
  | { type: 'accTitle'; converter: ISideEffectBlockConverter<AccTitleBlock, ConverterContext> }
  | { type: 'accDescription'; converter: ISideEffectBlockConverter<AccDescriptionBlock, ConverterContext> }
  | { type: 'comment'; converter: ISideEffectBlockConverter<CommentBlock, ConverterContext> }
  | { type: 'blank'; converter: ISideEffectBlockConverter<BlankBlock, ConverterContext> };

// ============================================================
// 2. ConverterRegistry 接口
// ============================================================

/**
 * Converter 注册表接口
 *
 * 职责（P1-3 修订：职责明确）：
 *   - parseBlocks：按 block.type 分发到对应 Converter.parseBlock，只分发不触碰栈/index（严重-2 决策）
 *   - serialize：从 canvas 产出所有 blocks，扫描 model 产出 block（含 rawText）
 *
 * 接口泛型化（M3 重构 L2-10）：
 *   - parseBlocks 参数类型为 `readonly RecognizedBlock<string>[]`（基类型）
 *   - serialize 返回类型为 `readonly RecognizedBlock<string>[]`（基类型）
 *   - 各 diagramType 的具体 Registry 实现使用各自的窄类型（FlowchartRecognizedBlock[]/ClassRecognizedBlock[]），
 *     子类型协变兼容（method 语法 bivariant）— FlowchartConverterRegistry/ClassConverterRegistry 均 implements 此接口
 *   - RoutingConverterRegistry 在 switch 分支内通过 `as` 收窄到具体窄类型（路由层安全转换）
 */
export interface ConverterRegistry {
  /**
   * parse：按 blockType 分发到对应 Converter.parseBlock（P1-3 修订：职责明确）
   *
   * - 产出型 block（vertex/edge/subgraph-open/class/relation/note/namespace-open）→ IModelBlockConverter.parseBlock → model（累加到 ctx）
   * - 副作用型 block → ISideEffectBlockConverter.parseBlock → void（副作用通过 ctx 受控方法承载）
   * - ConverterRegistry.parseBlocks 只负责按 type 分发，不触碰栈/index（严重-2 决策）
   *
   * @returns BlockConvertResult { canvas, errors } — 错误不中断，由 ErrorCollector 收集
   */
  parseBlocks(
    blocks: readonly RecognizedBlock<string>[],
    diagramType: DiagramType,
  ): BlockConvertResult;

  /**
   * serialize：从 canvas 产出所有 blocks（P1-3 修订：职责明确）
   *
   * - 产出型 block → IModelBlockConverter.serializeBlock（从 model 产出 block，含 rawText）
   * - 副作用型 block（指令型/全局）→ 扫描 canvas.nodes/edges/metadata 产出 block（含 rawText）
   * - SubgraphOpenBlock/SubgraphCloseBlock 或 NamespaceOpenBlock/NamespaceCloseBlock → 按 parentId 分组深度优先遍历产出（P1-4 修订）
   * - 格式保留型（comment/blank）→ serialize 方向不产出（model 中转阶段丢失，preserveIndent 不承诺保留，严重-4 决策）
   *
   * @returns blocks（含 rawText，由 Converter 生成；严重-3 决策）
   */
  serialize(
    canvas: CanvasState,
    diagramType: DiagramType,
  ): readonly RecognizedBlock<string>[];
}

// ============================================================
// 3. 模块级辅助函数
// ============================================================

/**
 * 创建前向引用默认节点
 *
 * 场景：StyleBlock/ClassApplyBlock 可能出现在 VertexBlock 之前
 * （如 `style A fill:#fff` 在 `A[Hello]` 之前）。
 * 对齐 mermaid flowDb.setClass 行为：隐式创建节点，后续 registerNode 通过决策17 merge 合并字段。
 *
 * 默认节点的 styles/classNames 为 undefined（不覆盖已有字段），
 * label 回退为 nodeId（对齐 flowchart-parser.ts:429 行为）。
 */
function createDefaultNode(nodeId: string): MermaidNode {
  return {
    id: nodeId,
    type: 'default',
    position: { x: 0, y: 0 },
    data: {
      label: nodeId,
      shape: 'rect',
      isSubgraph: false,
    },
  };
}

/**
 * 决策17：合并两个 MermaidNode
 *
 * id 是主键，永不变化。
 * data 字段通过 mergeNodeData 深层合并（incoming 非 undefined 字段覆盖 existing）。
 * parentId 由 registerNode 的 deepest-wins 决策处理，mergeNode 本身跳过 parentId ——
 *   归属语义：incoming.parentId 的嵌套深度 > existing.parentId 时覆盖（移到内层 subgraph），
 *   深度相同或更浅时保留 existing（先声明先占，处理平级 subgraph）。
 *   对齐 Mermaid 官方 addSubGraph 由内向外调用 + makeUniq 先注册先占 = 内层优先归属。
 *   详见 docs/design/node-attribution-fix.md。
 * 其他顶层可选字段（extent/selected 等）按 incoming 非 undefined 覆盖。
 */
function mergeNode(existing: MermaidNode, incoming: MermaidNode): MermaidNode {
  const incomingRecord = incoming as unknown as Record<string, unknown>;
  const existingRecord = existing as unknown as Record<string, unknown>;
  const mergedTop: Record<string, unknown> = { ...existingRecord };

  for (const key of Object.keys(incomingRecord)) {
    if (key === 'data' || key === 'id' || key === 'parentId') {
      continue; // data 单独处理，id 保持 existing，parentId 由 registerNode 决策
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
 * 决策17：合并两个 MermaidNodeData（incoming 非 undefined 字段覆盖 existing）
 *
 * 遍历 incoming 的所有 key，非 undefined 的值覆盖 existing 的对应字段。
 * 支持数组类型字段（如 styles/classNames）的整体替换语义 —
 * 数组替换而非拼接，因为同一 nodeId 的 VertexBlock 重新定义时应当替换而非追加。
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

/**
 * 将字符串解析为 FlowchartDirection（类型守卫）
 *
 * serialize 方向：MermaidNodeData.dir 类型为 string | undefined，
 * 需收窄为 FlowchartDirection 联合字面量类型。
 * 仅接受合法字面量，其他值返回 undefined（不产出 DirectionBlock）。
 */
function parseFlowchartDirection(dir: string | undefined): FlowchartDirection | undefined {
  if (dir === undefined) {
    return undefined;
  }
  if (dir === 'TB' || dir === 'TD' || dir === 'BT' || dir === 'RL' || dir === 'LR') {
    return dir;
  }
  return undefined;
}

// === serialize 方向 block 构造函数（副作用型 block 由 Registry 直接产出）===

/** 构造 SubgraphCloseBlock（rawText: 'end'） */
function createSubgraphCloseBlock(
  subgraphId: string,
  indent: number,
): SubgraphCloseBlock {
  return {
    type: 'subgraph-close',
    sourceLine: undefined,
    rawText: 'end',
    indent,
    subgraphId,
  };
}

/** 构造 DirectionBlock（rawText: `direction ${dir}`） */
function createDirectionBlock(dir: FlowchartDirection, indent: number): DirectionBlock {
  return {
    type: 'direction',
    sourceLine: undefined,
    rawText: `direction ${dir}`,
    indent,
    dir,
  };
}

/** 构造 TitleBlock（rawText: `title ${title}`） */
function createTitleBlock(title: string): TitleBlock {
  return {
    type: 'title',
    sourceLine: undefined,
    rawText: `title ${title}`,
    indent: 0,
    title,
  };
}

/** 构造 AccTitleBlock（rawText: `accTitle: ${accTitle}`） */
function createAccTitleBlock(accTitle: string): AccTitleBlock {
  return {
    type: 'accTitle',
    sourceLine: undefined,
    rawText: `accTitle: ${accTitle}`,
    indent: 0,
    accTitle,
  };
}

/** 构造 AccDescriptionBlock（rawText: `accDescr: ${accDescription}`，对齐官方缩写语法） */
function createAccDescriptionBlock(accDescription: string): AccDescriptionBlock {
  return {
    type: 'accDescription',
    sourceLine: undefined,
    rawText: `accDescr: ${accDescription}`,
    indent: 0,
    accDescription,
  };
}

/** 构造 ClassDefBlock（rawText: `classDef className style1,style2,...`） */
function createClassDefBlock(info: FlowClassDefInfo): ClassDefBlock {
  const allStyles = [...info.styles, ...info.textStyles];
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

/** 构造 ClassApplyBlock（rawText: `class nodeId1,nodeId2 className`） */
function createClassApplyBlock(
  nodeIds: readonly string[],
  className: string,
): ClassApplyBlock {
  return {
    type: 'class-apply',
    sourceLine: undefined,
    rawText: `class ${nodeIds.join(',')} ${className}`,
    indent: 0,
    nodeIds: [...nodeIds],
    className,
  };
}

/** 构造 StyleBlock（rawText: `style nodeId1,nodeId2 style1,style2,...`） */
function createStyleBlock(
  nodeIds: readonly string[],
  styles: readonly string[],
): StyleBlock {
  return {
    type: 'style',
    sourceLine: undefined,
    rawText: `style ${nodeIds.join(',')} ${styles.join(',')}`,
    indent: 0,
    nodeIds: [...nodeIds],
    styles: [...styles],
  };
}

/** 构造 LinkStyleBlock（default 目标，rawText: `linkStyle default [interpolate xxx] [styles] [animate xxx]`） */
function createLinkStyleDefaultBlock(
  styles: readonly string[],
  interpolate: string | undefined,
  animate: boolean | 'fast' | 'slow' | undefined,
): LinkStyleBlock {
  const interpolatePart = interpolate !== undefined ? ` interpolate ${interpolate}` : '';
  const stylesPart = styles.length > 0 ? ` ${styles.join(',')}` : '';
  const animatePart = animate !== undefined ? ` animate ${animate}` : '';
  const rawText = `linkStyle default${interpolatePart}${stylesPart}${animatePart}`;
  return {
    type: 'linkStyle',
    sourceLine: undefined,
    rawText,
    indent: 0,
    target: { kind: 'default' },
    styles: [...styles],
    interpolate,
    animate,
  };
}

/** 构造 LinkStyleBlock（indices 目标，rawText: `linkStyle 0,1,2 [interpolate xxx] [styles] [animate xxx]`） */
function createLinkStyleIndicesBlock(
  indices: readonly number[],
  styles: readonly string[],
  interpolate: string | undefined,
  animate: boolean | 'fast' | 'slow' | undefined,
): LinkStyleBlock {
  const interpolatePart = interpolate !== undefined ? ` interpolate ${interpolate}` : '';
  const stylesPart = styles.length > 0 ? ` ${styles.join(',')}` : '';
  const animatePart = animate !== undefined ? ` animate ${animate}` : '';
  const rawText = `linkStyle ${indices.join(',')}${interpolatePart}${stylesPart}${animatePart}`;
  return {
    type: 'linkStyle',
    sourceLine: undefined,
    rawText,
    indent: 0,
    target: { kind: 'indices', indices: [...indices] },
    styles: [...styles],
    interpolate,
    animate,
  };
}

/** 构造 ClickBlock（rawText 根据 event 字段组合，对齐官方 click 语法） */
function createClickBlock(event: FlowClickEvent): ClickBlock {
  const parts: string[] = ['click', event.nodeId];

  if (event.functionName !== undefined) {
    parts.push(event.functionName);
    if (event.functionArgs !== undefined) {
      parts.push('call', event.functionArgs);
    }
  }

  if (event.link !== undefined) {
    parts.push('href', `"${event.link}"`);
    if (event.linkTarget !== undefined) {
      parts.push(event.linkTarget);
    }
  }

  if (event.tooltip !== undefined) {
    parts.push(`"${event.tooltip}"`);
  }

  return {
    type: 'click',
    sourceLine: undefined,
    rawText: parts.join(' '),
    indent: 0,
    nodeId: event.nodeId,
    functionName: event.functionName,
    functionArgs: event.functionArgs,
    link: event.link,
    linkTarget: event.linkTarget,
    tooltip: event.tooltip,
  };
}

// ============================================================
// 4. DefaultConverterContext — ConverterContext 默认实现
// ============================================================

/**
 * ConverterContext 默认实现
 *
 * 内部状态：
 *   - parentStack: string[] — subgraph 栈，pushParent/popParent/currentParent
 *   - nodes: Map<string, MermaidNode> — 节点注册表（保留插入顺序，决策17 merge 语义）
 *   - edges: MermaidEdge[] — 边列表（按注册顺序，支持数字索引定位）
 *   - metadataCollector: IMetadataCollector — 注入的元数据收集器
 *
 * 决策17 merge 语义：registerNode 时若 nodeId 已存在则按字段优先级 merge。
 * 前向引用：updateNode 在节点不存在时创建默认节点（对齐 mermaid flowDb.setClass 行为）。
 */
export class DefaultConverterContext implements ConverterContext {
  private readonly parentStack: string[] = [];
  private readonly nodes: Map<string, MermaidNode> = new Map();
  private readonly edges: MermaidEdge[] = [];
  readonly metadataCollector: IMetadataCollector;

  constructor(metadataCollector: IMetadataCollector) {
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
   * 注册新节点（决策17 merge 语义 + deepest-wins 归属）
   *
   * 若 nodeId 已存在，按字段优先级 merge（incoming 非 undefined 字段覆盖 existing）。
   * 支持 `A[Hello] --> A[World]` 这种边定义时顺便更新节点标签的场景。
   *
   * parentId 归属语义（deepest-wins，对齐 Mermaid 官方内层优先归属）：
   *   - incoming.parentId 更深 → 覆盖 existing.parentId（移到内层 subgraph）
   *   - 深度相同或更浅 → 保留 existing.parentId（先声明先占，处理平级 subgraph）
   *   - incoming.parentId 为 undefined → 保留 existing.parentId（不回退到顶层）
   */
  registerNode(node: MermaidNode): void {
    const existing = this.nodes.get(node.id);
    if (existing === undefined) {
      this.nodes.set(node.id, node);
      return;
    }
    const merged = mergeNode(existing, node);
    // deepest-wins：incoming.parentId 更深时覆盖 existing.parentId
    if (node.parentId !== undefined) {
      const existingDepth = this.getNodeDepth(existing.parentId);
      const incomingDepth = this.getNodeDepth(node.parentId);
      if (incomingDepth > existingDepth) {
        merged.parentId = node.parentId;
      }
    }
    this.nodes.set(node.id, merged);
  }

  /**
   * 计算节点的 subgraph 嵌套深度
   *
   * 顶层节点（parentId 为 undefined）depth=0，直接子节点 depth=1，依此类推。
   * 用于 registerNode 的 deepest-wins 决策：比较 incoming 与 existing 的 parentId 深度。
   *
   * parent 未注册时视为 depth=1（前向引用场景：边端点引用尚未声明的 subgraph，
   * 但 subgraph 一旦声明其本身深度至少为 1，故按 1 估算保守值）。
   */
  private getNodeDepth(parentId: string | undefined): number {
    if (parentId === undefined) {
      return 0;
    }
    const parent = this.nodes.get(parentId);
    if (parent === undefined) {
      return 1;
    }
    return 1 + this.getNodeDepth(parent.parentId);
  }

  /**
   * 更新已有节点（前向引用：节点不存在时创建默认节点）
   *
   * 场景：StyleBlock/ClassApplyBlock 可能出现在 VertexBlock 之前。
   * 对齐 mermaid flowDb.setClass 行为：隐式创建节点，后续 registerNode 通过决策17 merge 合并。
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

  updateEdgeByIndex(index: number, mutate: (edge: MermaidEdge) => void): void {
    const edge = this.edges[index];
    if (edge === undefined) {
      return; // 索引越界，静默跳过（对齐 mermaid flowDb.updateLink 行为）
    }
    mutate(edge);
  }

  updateAllEdges(mutate: (edge: MermaidEdge) => void): void {
    for (const edge of this.edges) {
      mutate(edge);
    }
  }

  getEdges(): readonly MermaidEdge[] {
    return this.edges;
  }
}

// ============================================================
// 5. DefaultMetadataCollector — IMetadataCollector 默认实现
// ============================================================

/**
 * IMetadataCollector 默认实现
 *
 * 内部状态对应 GraphMetadata 的各字段：
 *   - flowClassDefs: FlowClassDefInfo[] — classDef 累积
 *   - flowClickEvents: FlowClickEvent[] — click 累积
 *   - flowTooltips: Record<string, string> — nodeId → tooltip（从 click event 提取）
 *   - directionValue / titleValue / accTitleValue / accDescriptionValue — 覆盖式
 *   - flowDefaultStyleValue / flowDefaultInterpolateValue — 决策16 setLinkStyleDefault
 *
 * build() 返回 GraphMetadata，仅包含非空字段。
 */
export class DefaultMetadataCollector implements IMetadataCollector {
  private readonly flowClassDefs: FlowClassDefInfo[] = [];
  private readonly flowClickEvents: FlowClickEvent[] = [];
  private readonly flowTooltips: Record<string, string> = {};
  private directionValue: FlowchartDirection | undefined;
  private titleValue: string | undefined;
  private accTitleValue: string | undefined;
  private accDescriptionValue: string | undefined;
  private flowDefaultStyleValue: string[] | undefined;
  private flowDefaultInterpolateValue: string | undefined;

  addClassDef(info: FlowClassDefInfo): void {
    this.flowClassDefs.push(info);
  }

  /**
   * 添加 click 事件
   *
   * 累积到 flowClickEvents，同时若 event.tooltip 非空则累积到 flowTooltips 映射。
   * 对齐 flow-db.ts setTooltip 行为：tooltip 通过 click 语句设置。
   */
  addClickEvent(event: FlowClickEvent): void {
    this.flowClickEvents.push(event);
    if (event.tooltip !== undefined) {
      this.flowTooltips[event.nodeId] = event.tooltip;
    }
  }

  setDirection(dir: FlowchartDirection): void {
    this.directionValue = dir;
  }

  setTitle(title: string): void {
    this.titleValue = title;
  }

  setAccTitle(accTitle: string): void {
    this.accTitleValue = accTitle;
  }

  setAccDescription(desc: string): void {
    this.accDescriptionValue = desc;
  }

  /**
   * 决策16：设置默认边样式与插值
   *
   * 一次调用同时处理 styles 和 interpolate。
   * - styles: 替换 flowDefaultStyleValue（对齐 mermaid flow-db.ts defaultStyle 替换语义，last wins）
   * - interpolate: 替换 flowDefaultInterpolateValue（非空时才替换）
   */
  setLinkStyleDefault(styles: readonly string[], interpolate?: string): void {
    this.flowDefaultStyleValue = [...styles];
    if (interpolate !== undefined) {
      this.flowDefaultInterpolateValue = interpolate;
    }
  }

  /**
   * 构建最终 GraphMetadata（仅包含非空字段）
   */
  build(): GraphMetadata {
    const metadata: GraphMetadata = {};

    if (this.flowClassDefs.length > 0) {
      metadata.flowClassDefs = this.flowClassDefs;
    }
    if (this.flowClickEvents.length > 0) {
      metadata.flowClickEvents = this.flowClickEvents;
    }
    if (Object.keys(this.flowTooltips).length > 0) {
      metadata.flowTooltips = this.flowTooltips;
    }
    if (this.directionValue !== undefined) {
      metadata.direction = this.directionValue;
    }
    if (this.titleValue !== undefined) {
      metadata.title = this.titleValue;
    }
    if (this.accTitleValue !== undefined) {
      metadata.accTitle = this.accTitleValue;
    }
    if (this.accDescriptionValue !== undefined) {
      metadata.accDescription = this.accDescriptionValue;
    }
    if (this.flowDefaultStyleValue !== undefined) {
      metadata.flowDefaultStyle = this.flowDefaultStyleValue;
    }
    if (this.flowDefaultInterpolateValue !== undefined) {
      metadata.flowDefaultInterpolate = this.flowDefaultInterpolateValue;
    }

    return metadata;
  }
}

// ============================================================
// 6. FlowchartConverterRegistry — flowchart 专属 Registry 实现
// ============================================================

/**
 * flowchart 专属 ConverterRegistry 实现
 *
 * parse 方向：
 *   - 创建 DefaultConverterContext + DefaultMetadataCollector
 *   - 遍历 blocks，try/catch SubgraphStackError → BlockConvertError（不中断）
 *   - dispatchParse: exhaustive switch 15 个 case + never check
 *   - buildCanvas: 从 ctx 提取 nodes/edges，从 metadataCollector.build() 提取 metadata
 *
 * serialize 方向：
 *   - 1. Title/AccTitle/AccDescription blocks（从 metadata）
 *   - 2. Nodes and edges DFS（按 parentId 分组深度优先遍历）
 *   - 3. ClassDef blocks（从 metadata.flowClassDefs）
 *   - 4. ClassApply blocks（从 nodes.classNames，按 className 分组）
 *   - 5. Style blocks（从 nodes.styles，按 styles 内容分组）
 *   - 6. LinkStyle blocks（default + per-edge by index）
 *   - 7. Click blocks（从 metadata.flowClickEvents）
 *
 * 顶层 direction 不产出 DirectionBlock（由 Assembler 通过 `flowchart TD` 行处理）。
 * 子图 direction 在 SubgraphOpenBlock 之后产出 DirectionBlock。
 */
export class FlowchartConverterRegistry implements ConverterRegistry {
  private readonly lookup: ReadonlyMap<
    FlowchartBlockType,
    BlockConverterEntry
  >;

  constructor() {
    this.lookup = new Map(
      flowchartConverterEntries.map((entry) => [entry.type, entry]),
    );
  }

  // === parse 方向 ===

  parseBlocks(
    blocks: readonly FlowchartRecognizedBlock[],
    diagramType: DiagramType,
  ): BlockConvertResult {
    if (diagramType !== 'flowchart') {
      throw new Error(
        `FlowchartConverterRegistry only supports 'flowchart', got '${diagramType}'`,
      );
    }

    const metadataCollector = new DefaultMetadataCollector();
    const ctx = new DefaultConverterContext(metadataCollector);
    const errors: BlockConvertError[] = [];

    for (const block of blocks) {
      try {
        this.dispatchParse(block, ctx);
      } catch (err) {
        if (err instanceof SubgraphStackError) {
          errors.push(toBlockConvertError(err));
        } else {
          throw err;
        }
      }
    }

    const metadata = metadataCollector.build();
    const canvas = this.buildCanvas(ctx, metadata);

    return { canvas, errors };
  }

  /**
   * 构建 GraphCanvasState
   *
   * 从 ctx 提取 nodes/edges，从 metadata 提取 direction。
   * metadata 仅在非空时设置。
   *
   * post-process:
   *   1. 合并 classDef + direct styles 到 node.data.style
   *      ClassApplyConverter.parseBlock 时 metadata.flowClassDefs 可能还未填充（顺序依赖），
   *      所以 data.style 必须在所有 block 处理完后统一构建。
   *      对齐老 flowchart-parser.ts mapVertexToNode 的 mergedStyle 逻辑。
   *   2. 构建 subgraph.data.subgraphNodes（从 parentId 关系推导）
   *      SubgraphOpenConverter.parseBlock 时子节点尚未注册，无法填充 subgraphNodes。
   *      对齐老 flowchart-parser.ts mapVertexToNode 的 subGraph.nodes 字段。
   */
  private buildCanvas(
    ctx: DefaultConverterContext,
    metadata: GraphMetadata,
  ): GraphCanvasState {
    const flowClassDefs = metadata.flowClassDefs ?? [];
    const nodes = ctx.getNodes();

    // 1. 合并 classDef + direct styles → data.style
    for (const node of nodes) {
      mergeNodeStyles(node, flowClassDefs);
    }

    // 2. 构建 subgraph.data.subgraphNodes（从 parentId 关系推导）
    const subgraphChildIds = new Map<string, string[]>();
    for (const node of nodes) {
      const parentId = node.parentId;
      if (parentId !== undefined) {
        const existing = subgraphChildIds.get(parentId);
        if (existing === undefined) {
          subgraphChildIds.set(parentId, [node.id]);
        } else {
          existing.push(node.id);
        }
      }
    }
    for (const node of nodes) {
      if (node.data.isSubgraph === true) {
        const childIds = subgraphChildIds.get(node.id);
        if (childIds !== undefined) {
          node.data.subgraphNodes = childIds;
        }
      }
    }

    const canvas: GraphCanvasState = {
      diagramType: 'flowchart',
      nodes,
      edges: [...ctx.getEdges()],
      needsLayout: true,
    };

    if (metadata.direction !== undefined) {
      canvas.direction = metadata.direction;
    }

    if (Object.keys(metadata).length > 0) {
      canvas.metadata = metadata;
    }

    return canvas;
  }

  /**
   * exhaustive switch 分发 parse（15 个 case + never check）
   *
   * 按 block.type 分发到对应 Converter.parseBlock，类型收窄保证类型安全。
   * default 分支的 never check 确保所有 case 已覆盖，新增 block 类型时编译期报错。
   */
  private dispatchParse(
    block: FlowchartRecognizedBlock,
    ctx: ConverterContext,
  ): void {
    switch (block.type) {
      case 'vertex': {
        const converter = this.requireConverter('vertex');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'edge': {
        const converter = this.requireConverter('edge');
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
      case 'classDef': {
        const converter = this.requireConverter('classDef');
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
      case 'linkStyle': {
        const converter = this.requireConverter('linkStyle');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'click': {
        const converter = this.requireConverter('click');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'direction': {
        const converter = this.requireConverter('direction');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'title': {
        const converter = this.requireConverter('title');
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
      case 'comment': {
        const converter = this.requireConverter('comment');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'blank': {
        const converter = this.requireConverter('blank');
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

  serialize(
    canvas: CanvasState,
    diagramType: DiagramType,
  ): readonly FlowchartRecognizedBlock[] {
    if (diagramType !== 'flowchart') {
      throw new Error(
        `FlowchartConverterRegistry only supports 'flowchart', got '${diagramType}'`,
      );
    }
    if (canvas.diagramType !== 'flowchart') {
      throw new Error(
        `Expected GraphCanvasState with diagramType 'flowchart', got '${canvas.diagramType}'`,
      );
    }

    const graphCanvas = canvas as GraphCanvasState;
    const metadata = graphCanvas.metadata ?? {};
    const blocks: FlowchartRecognizedBlock[] = [];
    const ctx = new DefaultConverterContext(new DefaultMetadataCollector());

    // 1. 全局指令：AccTitle / AccDescription
    // 注：title 不作为 block 产出 — flowchart 的 title 通过 frontmatter 序列化，
    //     由 assembler 入口函数（assemble）在 header 之前构造 `---\ntitle: xxx\n---`。
    if (metadata.accTitle !== undefined) {
      blocks.push(createAccTitleBlock(metadata.accTitle));
    }
    if (metadata.accDescription !== undefined) {
      blocks.push(createAccDescriptionBlock(metadata.accDescription));
    }

    // 2. Nodes and edges DFS（按 parentId 分组深度优先遍历）
    const nodesByParent = this.groupNodesByParent(graphCanvas.nodes);
    const edgesBySubgraph = this.groupEdgesBySubgraph(graphCanvas.edges);
    this.dfsSerialize(
      undefined,
      0,
      nodesByParent,
      edgesBySubgraph,
      ctx,
      blocks,
    );

    // 3. ClassDef blocks（从 metadata.flowClassDefs）
    if (metadata.flowClassDefs !== undefined) {
      for (const classDef of metadata.flowClassDefs) {
        blocks.push(createClassDefBlock(classDef));
      }
    }

    // 4. ClassApply blocks（从 nodes.classNames，按 className 分组）
    const classApplyBlocks = this.serializeClassApplyBlocks(graphCanvas.nodes);
    blocks.push(...classApplyBlocks);

    // 5. Style blocks（从 nodes.styles，按 styles 内容分组）
    const styleBlocks = this.serializeStyleBlocks(graphCanvas.nodes);
    blocks.push(...styleBlocks);

    // 6. LinkStyle blocks（default + per-edge by index）
    const linkStyleBlocks = this.serializeLinkStyleBlocks(
      graphCanvas.edges,
      metadata,
    );
    blocks.push(...linkStyleBlocks);

    // 7. Click blocks（从 metadata.flowClickEvents）
    if (metadata.flowClickEvents !== undefined) {
      for (const event of metadata.flowClickEvents) {
        blocks.push(createClickBlock(event));
      }
    }

    return blocks;
  }

  /**
   * DFS 深度优先遍历产出 vertex/edge/subgraph-open/subgraph-close/direction blocks
   *
   * 遍历顺序（P1-4 修订）：
   *   - 对当前层级的每个子节点（按插入顺序）：
   *     - 若为 subgraph：SubgraphOpenBlock → DirectionBlock（若显式方向）→ 递归 → SubgraphCloseBlock
   *     - 若为 vertex：VertexBlock
   *   - 当前层级的所有 edges（按 data.subgraphId 分组）
   *
   * indent 计算：depth × 2（subgraph 嵌套深度 × 2）
   * SubgraphCloseBlock 的 indent 与 SubgraphOpenBlock 相同（外层 indent）。
   */
  private dfsSerialize(
    parentId: string | undefined,
    depth: number,
    nodesByParent: Map<string | undefined, MermaidNode[]>,
    edgesBySubgraph: Map<string | undefined, MermaidEdge[]>,
    ctx: ConverterContext,
    blocks: FlowchartRecognizedBlock[],
  ): void {
    const indent = depth * 2;
    const children = nodesByParent.get(parentId) ?? [];

    for (const node of children) {
      if (node.data.isSubgraph === true) {
        // Subgraph open
        const subgraphOpenConverter = this.requireConverter('subgraph-open');
        const openBlock = subgraphOpenConverter.serializeBlock(node, ctx);
        if (openBlock !== null) {
          blocks.push({ ...openBlock, indent });
        }

        // Direction block（仅当 subgraph 显式声明方向时）
        if (node.data.hasExplicitDir === true) {
          const dir = parseFlowchartDirection(node.data.dir);
          if (dir !== undefined) {
            blocks.push(createDirectionBlock(dir, indent + 2));
          }
        }

        // 递归处理子节点
        this.dfsSerialize(
          node.id,
          depth + 1,
          nodesByParent,
          edgesBySubgraph,
          ctx,
          blocks,
        );

        // Subgraph close（indent 与 open 相同）
        blocks.push(createSubgraphCloseBlock(node.id, indent));
      } else {
        // Vertex
        const vertexConverter = this.requireConverter('vertex');
        const vertexBlock = vertexConverter.serializeBlock(node, ctx);
        if (vertexBlock !== null) {
          blocks.push({ ...vertexBlock, indent });
        }
      }
    }

    // 当前层级的 edges
    const edges = edgesBySubgraph.get(parentId) ?? [];
    const edgeConverter = this.requireConverter('edge');
    for (const edge of edges) {
      const edgeBlock = edgeConverter.serializeBlock(edge, ctx);
      if (edgeBlock !== null) {
        blocks.push({ ...edgeBlock, indent });
      }
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
   * 按 data.subgraphId 分组边（undefined = 顶层）
   * 保留 canvas.edges 的原始顺序。
   */
  private groupEdgesBySubgraph(
    edges: readonly MermaidEdge[],
  ): Map<string | undefined, MermaidEdge[]> {
    const map = new Map<string | undefined, MermaidEdge[]>();
    for (const edge of edges) {
      const subgraphId = edge.data.subgraphId;
      const existing = map.get(subgraphId);
      if (existing === undefined) {
        map.set(subgraphId, [edge]);
      } else {
        existing.push(edge);
      }
    }
    return map;
  }

  /**
   * 序列化 ClassApply blocks
   *
   * 扫描所有节点的 data.classNames，按 className 分组，
   * 每个 className 产出一个 ClassApplyBlock（含所有应用该 class 的节点 ID）。
   */
  private serializeClassApplyBlocks(
    nodes: readonly MermaidNode[],
  ): ClassApplyBlock[] {
    const classToNodes = new Map<string, string[]>();

    for (const node of nodes) {
      const classNames = node.data.classNames;
      if (classNames === undefined || classNames.length === 0) {
        continue;
      }
      for (const className of classNames) {
        const existing = classToNodes.get(className);
        if (existing === undefined) {
          classToNodes.set(className, [node.id]);
        } else {
          existing.push(node.id);
        }
      }
    }

    const blocks: ClassApplyBlock[] = [];
    for (const [className, nodeIds] of classToNodes) {
      blocks.push(createClassApplyBlock(nodeIds, className));
    }
    return blocks;
  }

  /**
   * 序列化 Style blocks
   *
   * 扫描所有节点的 data.styles，按 styles 内容分组（相同 styles 的节点合并为一个 StyleBlock）。
   * 使用 \0 作为分隔符构建 key（避免 styles 内容冲突）。
   */
  private serializeStyleBlocks(
    nodes: readonly MermaidNode[],
  ): StyleBlock[] {
    const stylesToNodes = new Map<
      string,
      { nodeIds: string[]; styles: string[] }
    >();

    for (const node of nodes) {
      const styles = node.data.styles;
      if (styles === undefined || styles.length === 0) {
        continue;
      }
      const key = styles.join('\0');
      const existing = stylesToNodes.get(key);
      if (existing === undefined) {
        stylesToNodes.set(key, { nodeIds: [node.id], styles: [...styles] });
      } else {
        existing.nodeIds.push(node.id);
      }
    }

    const blocks: StyleBlock[] = [];
    for (const { nodeIds, styles } of stylesToNodes.values()) {
      blocks.push(createStyleBlock(nodeIds, styles));
    }
    return blocks;
  }

  /**
   * 序列化 LinkStyle blocks
   *
   * 两种产出：
   *   1. default：从 metadata.flowDefaultStyle + flowDefaultInterpolate 产出（若有）
   *   2. per-edge：扫描 edges.data.{styles, interpolate, animate}，按内容分组，
   *      产出带数字索引列表的 LinkStyleBlock
   */
  private serializeLinkStyleBlocks(
    edges: readonly MermaidEdge[],
    metadata: GraphMetadata,
  ): LinkStyleBlock[] {
    const blocks: LinkStyleBlock[] = [];

    // 1. default linkStyle（flowDefaultStyle 或 flowDefaultInterpolate 任一存在即产出）
    if (metadata.flowDefaultStyle !== undefined || metadata.flowDefaultInterpolate !== undefined) {
      blocks.push(
        createLinkStyleDefaultBlock(
          metadata.flowDefaultStyle ?? [],
          metadata.flowDefaultInterpolate,
          undefined,
        ),
      );
    }

    // 2. per-edge linkStyle（按 styles+interpolate+animate 分组）
    const styleToIndices = new Map<
      string,
      {
        indices: number[];
        styles: string[];
        interpolate: string | undefined;
        animate: boolean | 'fast' | 'slow' | undefined;
      }
    >();

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const styles = edge.data.styles ?? [];
      const interpolate = edge.data.interpolate;
      const animate = edge.data.animate;
      // 边有 styles/interpolate/animate 任一才产出 linkStyle
      if (styles.length === 0 && interpolate === undefined && animate === undefined) {
        continue;
      }
      const key = `${styles.join('\0')}\0${interpolate ?? ''}\0${animate ?? ''}`;
      const existing = styleToIndices.get(key);
      if (existing === undefined) {
        styleToIndices.set(key, {
          indices: [i],
          styles: [...styles],
          interpolate,
          animate,
        });
      } else {
        existing.indices.push(i);
      }
    }

    for (const { indices, styles, interpolate, animate } of styleToIndices.values()) {
      blocks.push(createLinkStyleIndicesBlock(indices, styles, interpolate, animate));
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
   * runtime 安全由 lookup 构造保证 — flowchartConverterEntries 中
   * entry.type 与 entry.converter 的类型对应关系由 BlockConverterEntry 判别联合定义。
   */
  private requireConverter(type: 'vertex'): IModelBlockConverter<VertexBlock, MermaidNode, ConverterContext>;
  private requireConverter(type: 'edge'): IModelBlockConverter<EdgeBlock, MermaidEdge, ConverterContext>;
  private requireConverter(type: 'subgraph-open'): IModelBlockConverter<SubgraphOpenBlock, MermaidNode, ConverterContext>;
  private requireConverter(type: 'subgraph-close'): ISideEffectBlockConverter<SubgraphCloseBlock, ConverterContext>;
  private requireConverter(type: 'classDef'): ISideEffectBlockConverter<ClassDefBlock, ConverterContext>;
  private requireConverter(type: 'class-apply'): ISideEffectBlockConverter<ClassApplyBlock, ConverterContext>;
  private requireConverter(type: 'style'): ISideEffectBlockConverter<StyleBlock, ConverterContext>;
  private requireConverter(type: 'linkStyle'): ISideEffectBlockConverter<LinkStyleBlock, ConverterContext>;
  private requireConverter(type: 'click'): ISideEffectBlockConverter<ClickBlock, ConverterContext>;
  private requireConverter(type: 'direction'): ISideEffectBlockConverter<DirectionBlock, ConverterContext>;
  private requireConverter(type: 'title'): ISideEffectBlockConverter<TitleBlock, ConverterContext>;
  private requireConverter(type: 'accTitle'): ISideEffectBlockConverter<AccTitleBlock, ConverterContext>;
  private requireConverter(type: 'accDescription'): ISideEffectBlockConverter<AccDescriptionBlock, ConverterContext>;
  private requireConverter(type: 'comment'): ISideEffectBlockConverter<CommentBlock, ConverterContext>;
  private requireConverter(type: 'blank'): ISideEffectBlockConverter<BlankBlock, ConverterContext>;
  private requireConverter(type: FlowchartBlockType): BlockConverterEntry['converter'] {
    const entry = this.lookup.get(type);
    if (entry === undefined) {
      throw new Error(`Converter not registered for block type: ${type}`);
    }
    return entry.converter;
  }
}

// ============================================================
// 7. RoutingConverterRegistry + converterRegistry singleton
// ============================================================

/**
 * 路由型 ConverterRegistry — 按 diagramType 路由到具体 Registry
 *
 * 当前已注册：
 *   - 'flowchart' → FlowchartConverterRegistry（Stage 4）
 *   - 'classDiagram' → ClassConverterRegistry（M3 重构 L2-10）
 *   - 'erDiagram' → ErConverterRegistry（erDiagram 重构 模块2 L2-11）
 *
 * 路由表通过 switch 分发，未实现的 diagramType 抛出程序错误。
 *
 * 类型安全（M3 重构 L2-10）：
 *   - 接口层使用 `RecognizedBlock<string>[]` 基类型（协变兼容各 diagramType 窄类型）
 *   - switch 分支内通过 `as` 收窄到具体窄类型（FlowchartRecognizedBlock[]/ClassRecognizedBlock[]/ErRecognizedBlock[]）
 *   - 路由层转换安全：调用方按 diagramType 传入对应窄类型，路由层仅做类型断言不做值转换
 */
class RoutingConverterRegistry implements ConverterRegistry {
  private readonly flowchartRegistry = new FlowchartConverterRegistry();
  private readonly classRegistry = new ClassConverterRegistry();
  private readonly erRegistry = new ErConverterRegistry();

  parseBlocks(
    blocks: readonly RecognizedBlock<string>[],
    diagramType: DiagramType,
  ): BlockConvertResult {
    switch (diagramType) {
      case 'flowchart':
        return this.flowchartRegistry.parseBlocks(
          blocks as readonly FlowchartRecognizedBlock[],
          diagramType,
        );
      case 'classDiagram':
        return this.classRegistry.parseBlocks(
          blocks as readonly ClassRecognizedBlock[],
          diagramType,
        );
      case 'erDiagram':
        return this.erRegistry.parseBlocks(
          blocks as readonly ErRecognizedBlock[],
          diagramType,
        );
      default:
        throw new Error(
          `ConverterRegistry: diagramType '${diagramType}' not yet implemented`,
        );
    }
  }

  serialize(
    canvas: CanvasState,
    diagramType: DiagramType,
  ): readonly RecognizedBlock<string>[] {
    switch (diagramType) {
      case 'flowchart':
        return this.flowchartRegistry.serialize(canvas, diagramType);
      case 'classDiagram':
        return this.classRegistry.serialize(canvas, diagramType);
      case 'erDiagram':
        return this.erRegistry.serialize(canvas, diagramType);
      default:
        throw new Error(
          `ConverterRegistry: diagramType '${diagramType}' not yet implemented`,
        );
    }
  }
}

/**
 * 全局 ConverterRegistry singleton
 *
 * 按 diagramType 路由到具体 Registry 实现。
 * 当前已注册：flowchart、classDiagram、erDiagram。
 */
export const converterRegistry: ConverterRegistry =
  new RoutingConverterRegistry();
