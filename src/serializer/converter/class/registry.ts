/**
 * Class Converter Registry — ClassBlockConverterEntry 判别联合 + ClassConverterRegistry 实现
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-9（L2-10 注册入口已抽离到 ./index.ts）
 *
 * 数据流：
 *   parse 方向：ClassConverterRegistry.parseBlocks(blocks, diagramType) → BlockConvertResult
 *     - 创建 ClassDefaultConverterContext + DefaultClassMetadataCollector
 *     - 遍历 blocks，try/catch NamespaceStackError → BlockConvertError（不中断）
 *     - dispatchParse: exhaustive switch 12 case + never check
 *     - buildCanvas: 从 ctx 提取 nodes/edges，从 metadataCollector.build() 提取 metadata
 *   serialize 方向：ClassConverterRegistry.serialize(canvas, diagramType) → ClassRecognizedBlock[]
 *     - 1. AccTitle / AccDescription blocks（从 metadata）
 *     - 2. Nodes DFS（按 parentId 分组深度优先遍历，namespace 嵌套产出 open/close）
 *     - 3. ClassDef blocks（从 metadata.classDefs）
 *     - 4. ClassApply blocks（从 nodes.classNames，按 className 分组）
 *     - 5. Style blocks（从 nodes.styles，按 styles 内容分组）
 *     - 6. Click blocks（从 metadata.classClickEvents）
 *
 * 顶层 direction 不产出 DirectionBlock（由 Assembler 通过 `classDiagram TB` header 处理，对齐 flowchart）。
 *
 * 实现组成：
 *   1. ClassBlockConverterEntry 判别联合（12 种 BlockType 完整覆盖）
 *   2. 辅助函数（createDefaultNode / mergeNode / mergeNodeData）
 *   3. serialize 方向 block 构造函数
 *   4. ClassDefaultConverterContext — ClassConverterContext 默认实现
 *   5. DefaultClassMetadataCollector — ClassMetadataCollector 默认实现
 *   6. ClassConverterRegistry — class 专属 Registry 实现（implements ConverterRegistry）
 *
 * 设计模式（对齐 flowchart）：
 *   - Converter 单例在 ./index.ts 实例化并打包为 classConverterEntries
 *   - ClassConverterRegistry 构造函数消费 classConverterEntries 构建查找表
 *   - ./index.ts ↔ ./registry.ts 通过 `import type` 打破运行时循环依赖
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js、
 *   ./namespace-converter.js、./index.js，不引用 React/DOM。
 */

import type {
  ClassClickEvent,
  ClassDefInfo,
  ClassNamespaceInfo,
  ClassNoteInfo,
  FlowchartDirection,
  GraphCanvasState,
  GraphMetadata,
  MermaidEdge,
  MermaidNode,
  MermaidNodeData,
  MermaidShapeType,
} from '../../types.js';
import type {
  ClassAccDescriptionBlock,
  ClassAccTitleBlock,
  ClassBlock,
  ClassBlockType,
  ClassClickBlock,
  ClassCssApplyBlock,
  ClassCssDefBlock,
  ClassDirectionBlock,
  ClassRecognizedBlock,
  ClassStyleBlock,
  NamespaceCloseBlock,
  NamespaceOpenBlock,
  NoteBlock,
  RelationBlock,
} from '../../recognizer/types.js';
import type {
  BlockConvertError,
  BlockConvertResult,
  IModelBlockConverter,
  ISideEffectBlockConverter,
} from '../types.js';
import type { CanvasState, DiagramType } from '../../types.js';
import type { ClassConverterContext, ClassMetadataCollector } from './types.js';
import type { ConverterRegistry } from '../registry.js';
import {
  NamespaceStackError,
  toBlockConvertError,
} from './namespace-converter.js';
import { classConverterEntries } from './index.js';

// ============================================================
// 1. ClassBlockConverterEntry 判别联合（12 种 BlockType 完整覆盖）
// ============================================================

/**
 * class Converter 注册表 value 类型（判别 union 收窄分发）
 *
 * 分发时 switch(entry.type) + 类型收窄，编译器保证类型安全：
 *   - 产出型（4 种）：class/relation/note/namespace-open → IModelBlockConverter 双向
 *   - 结构型（1 种）：namespace-close → ISideEffectBlockConverter 仅 parse
 *   - 指令型（2 种）：class-apply/style → ISideEffectBlockConverter 仅 parse
 *   - 全局指令型（5 种）：classDef/click/direction/accTitle/accDescription → ISideEffectBlockConverter 仅 parse
 */
export type ClassBlockConverterEntry =
  | { type: 'class'; converter: IModelBlockConverter<ClassBlock, MermaidNode, ClassConverterContext> }
  | { type: 'relation'; converter: IModelBlockConverter<RelationBlock, MermaidEdge, ClassConverterContext> }
  | { type: 'note'; converter: IModelBlockConverter<NoteBlock, MermaidNode, ClassConverterContext> }
  | { type: 'namespace-open'; converter: IModelBlockConverter<NamespaceOpenBlock, MermaidNode, ClassConverterContext> }
  | { type: 'namespace-close'; converter: ISideEffectBlockConverter<NamespaceCloseBlock, ClassConverterContext> }
  | { type: 'class-apply'; converter: ISideEffectBlockConverter<ClassCssApplyBlock, ClassConverterContext> }
  | { type: 'style'; converter: ISideEffectBlockConverter<ClassStyleBlock, ClassConverterContext> }
  | { type: 'classDef'; converter: ISideEffectBlockConverter<ClassCssDefBlock, ClassConverterContext> }
  | { type: 'click'; converter: ISideEffectBlockConverter<ClassClickBlock, ClassConverterContext> }
  | { type: 'direction'; converter: ISideEffectBlockConverter<ClassDirectionBlock, ClassConverterContext> }
  | { type: 'accTitle'; converter: ISideEffectBlockConverter<ClassAccTitleBlock, ClassConverterContext> }
  | { type: 'accDescription'; converter: ISideEffectBlockConverter<ClassAccDescriptionBlock, ClassConverterContext> };

// ============================================================
// 2. 模块级辅助函数
// ============================================================

/**
 * 创建前向引用默认节点（class-box 类型）
 *
 * 场景：ClassStyleBlock/ClassCssApplyBlock 可能出现在 ClassBlock 之前
 * （如 `style A fill:#fff` 在 `class A` 之前）。
 * 对齐 flowchart createDefaultNode 行为：隐式创建节点，后续 registerNode 通过 merge 合并字段。
 *
 * 默认节点的 styles/classNames 为 undefined（不覆盖已有字段），
 * label 回退为 nodeId（对齐 flowchart 行为）。
 */
function createDefaultNode(nodeId: string): MermaidNode {
  return {
    id: nodeId,
    type: 'class-box',
    position: { x: 0, y: 0 },
    data: {
      label: nodeId,
      shape: 'class-box' as MermaidShapeType,
      isSubgraph: false,
    },
  };
}

/**
 * 合并两个 MermaidNode（incoming 非 undefined 字段覆盖 existing）
 *
 * id 是主键，永不变化。
 * data 字段通过 mergeNodeData 深层合并（incoming 非 undefined 字段覆盖 existing）。
 * parentId 由 incoming 优先（class 不会在边定义时顺便更新节点，无需 deepest-wins 决策）。
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
 * 数组替换而非拼接，因为同一 classId 的 ClassBlock 重新定义时应当替换而非追加。
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

/** 构造 NamespaceCloseBlock（rawText: '}'，对齐 mermaid classDiagram namespace 关闭语法）
 *
 * mermaid classDiagram 的 namespace 关闭符号是 `}`（不是 flowchart subgraph 的 `end`）。
 * 老路径 namespace-serializer.ts line 120 确认：`lines.push(`${indent}}`)`。
 */
function createNamespaceCloseBlock(
  namespaceId: string,
  indent: number,
): NamespaceCloseBlock {
  return {
    type: 'namespace-close',
    sourceLine: undefined,
    rawText: '}',
    indent,
    namespaceId,
  };
}

/**
 * 构造顶层 DirectionBlock（rawText: `direction ${dir}`，indent=0）
 *
 * [一-6-补] 修订：classDiagram header 是固定字符串 `classDiagram`（无 direction 后缀，
 * mermaid 官方 classDiagram 不支持 `classDiagram TB` header 语法），顶层 direction
 * 必须作为独立 DirectionBlock 产出（对齐老路径 serializeClass 行为）。
 * 与 flowchart 不同（flowchart header 含 direction，Converter 不产出顶层 DirectionBlock）。
 */
function createDirectionBlock(dir: FlowchartDirection): ClassDirectionBlock {
  return {
    type: 'direction',
    sourceLine: undefined,
    rawText: `direction ${dir}`,
    indent: 0,
    dir,
  };
}

/** 构造 AccTitleBlock（rawText: `accTitle: ${accTitle}`） */
function createAccTitleBlock(accTitle: string): ClassAccTitleBlock {
  return {
    type: 'accTitle',
    sourceLine: undefined,
    rawText: `accTitle: ${accTitle}`,
    indent: 0,
    accTitle,
  };
}

/** 构造 AccDescriptionBlock（rawText: `accDescr: ${accDescription}`，对齐官方缩写语法） */
function createAccDescriptionBlock(accDescription: string): ClassAccDescriptionBlock {
  return {
    type: 'accDescription',
    sourceLine: undefined,
    rawText: `accDescr: ${accDescription}`,
    indent: 0,
    accDescription,
  };
}

/** 构造 ClassCssDefBlock（rawText: `classDef className style1,style2,...`） */
function createClassDefBlock(info: ClassDefInfo): ClassCssDefBlock {
  const allStyles = [...info.styles, ...info.textStyles];
  const rawText = `classDef ${info.className} ${allStyles.join(',')}`;
  return {
    type: 'classDef',
    sourceLine: undefined,
    rawText,
    indent: 0,
    className: info.className,
    styles: [...info.styles],
    textStyles: [...info.textStyles],
  };
}

/** 构造 ClassCssApplyBlock（rawText: `class classId1,classId2 ::: className`）
 *
 * 对齐 mermaid 官方 classDiagram 语法：`class A ::: red`（用 ::: 分隔符应用 CSS 类）。
 * 多个 classId 可合并为 `class A,B ::: red`（官方允许逗号分隔）。
 */
function createClassApplyBlock(
  classIds: readonly string[],
  className: string,
): ClassCssApplyBlock {
  return {
    type: 'class-apply',
    sourceLine: undefined,
    rawText: `class ${classIds.join(',')} ::: ${className}`,
    indent: 0,
    classIds: [...classIds],
    className,
  };
}

/** 构造 ClassStyleBlock（rawText: `style classId style1,style2,...`） */
function createStyleBlock(
  classId: string,
  styles: readonly string[],
): ClassStyleBlock {
  return {
    type: 'style',
    sourceLine: undefined,
    rawText: `style ${classId} ${styles.join(',')}`,
    indent: 0,
    classId,
    styles: [...styles],
  };
}

/** 构造 ClassClickBlock（rawText 根据 event 字段组合，对齐官方 click 语法） */
function createClickBlock(event: ClassClickEvent): ClassClickBlock {
  const parts: string[] = ['click', event.classId];

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
    classId: event.classId,
    functionName: event.functionName,
    functionArgs: event.functionArgs,
    link: event.link,
    linkTarget: event.linkTarget,
    tooltip: event.tooltip,
  };
}

/**
 * 构造 NoteBlock（从 ClassNoteInfo，对齐 NoteConverter.formatNote 行为）
 *
 * rawText 格式：
 *   - 关联 class 的 note：`note for ClassId "text"`（双引号转义）
 *   - 独立 note（无 classId）：`note "text"`
 *
 * 使用场景：serialize 方向 fallback — 当 canvas 无 note 节点（type='class-note'）
 * 但有 metadata.classNotes 时，从 metadata.classNotes 产出 NoteBlock。
 * 保证数据不丢失（兼容老路径数据，对齐老路径 serializeNotes 优先用 metadata.classNotes 的行为）。
 */
function createNoteBlockFromInfo(note: ClassNoteInfo): NoteBlock {
  const escapedText = note.text.replace(/"/g, '\\"');
  const classId = note.classId;
  const rawText = classId !== undefined && classId !== ''
    ? `note for ${classId} "${escapedText}"`
    : `note "${escapedText}"`;
  return {
    type: 'note',
    sourceLine: undefined,
    rawText,
    indent: 0,
    text: note.text,
    classId,
  };
}

// ============================================================
// 3. ClassDefaultConverterContext — ClassConverterContext 默认实现
// ============================================================

/**
 * ClassConverterContext 默认实现
 *
 * 内部状态：
 *   - parentStack: string[] — namespace 栈，pushParent/popParent/currentParent
 *   - nodes: Map<string, MermaidNode> — 节点注册表（保留插入顺序，merge 语义）
 *   - edges: MermaidEdge[] — 边列表（按注册顺序）
 *   - metadataCollector: ClassMetadataCollector — 注入的元数据收集器
 *   - errors: BlockConvertError[] — 错误收集（不中断后续 block 处理）
 *
 * merge 语义：registerNode 时若 nodeId 已存在则按字段优先级 merge。
 * 前向引用：updateNode 在节点不存在时创建默认节点（对齐 flowchart createDefaultNode 行为）。
 */
export class ClassDefaultConverterContext implements ClassConverterContext {
  private readonly parentStack: string[] = [];
  private readonly nodes: Map<string, MermaidNode> = new Map();
  private readonly edges: MermaidEdge[] = [];
  private readonly errors: BlockConvertError[] = [];
  readonly metadataCollector: ClassMetadataCollector;

  constructor(metadataCollector: ClassMetadataCollector) {
    this.metadataCollector = metadataCollector;
  }

  // === parentStack 受控方法 ===

  pushParent(namespaceId: string): void {
    this.parentStack.push(namespaceId);
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
   * 支持 ClassBlock 重新定义时替换字段（如 label/members 等）。
   *
   * parentId 归属语义：incoming.parentId 优先（class 不会在边定义时顺便更新节点，
   * 无需 flowchart 的 deepest-wins 决策）。
   */
  registerNode(node: MermaidNode): void {
    const existing = this.nodes.get(node.id);
    if (existing === undefined) {
      this.nodes.set(node.id, node);
      return;
    }
    const merged = mergeNode(existing, node);
    // incoming.parentId 优先（class 场景：ClassBlock 总是带正确 parentId）
    if (node.parentId !== undefined) {
      merged.parentId = node.parentId;
    }
    this.nodes.set(node.id, merged);
  }

  /**
   * 更新已有节点（前向引用：节点不存在时创建默认节点）
   *
   * 场景：ClassStyleBlock/ClassCssApplyBlock 可能出现在 ClassBlock 之前。
   * 对齐 flowchart createDefaultNode 行为：隐式创建节点，后续 registerNode 通过 merge 合并。
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
// 4. DefaultClassMetadataCollector — ClassMetadataCollector 默认实现
// ============================================================

/**
 * ClassMetadataCollector 默认实现
 *
 * 内部状态对应 GraphMetadata 的 class 相关字段：
 *   - classDefs: ClassDefInfo[] — classDef 累积
 *   - clickEvents: ClassClickEvent[] — click 累积
 *   - tooltips: Record<string, string> — classId → tooltip（从 click event 提取）
 *   - namespaces: ClassNamespaceInfo[] — namespace 累积
 *   - notes: ClassNoteInfo[] — note 累积
 *   - directionValue / accTitleValue / accDescriptionValue — 覆盖式
 *
 * addClickEvent 内部根据 tooltip 非空情况同步累积到 tooltips（对齐 flowchart addClickEvent）。
 * build() 返回 GraphMetadata，仅包含非空字段。
 */
export class DefaultClassMetadataCollector implements ClassMetadataCollector {
  private readonly classDefsValue: ClassDefInfo[] = [];
  private readonly clickEventsValue: ClassClickEvent[] = [];
  private readonly tooltipsValue: Record<string, string> = {};
  private readonly namespacesValue: ClassNamespaceInfo[] = [];
  private readonly notesValue: ClassNoteInfo[] = [];
  private directionValue: FlowchartDirection | undefined;
  private accTitleValue: string | undefined;
  private accDescriptionValue: string | undefined;

  // === class 专用字段 ===

  addClassDef(classDef: ClassDefInfo): void {
    this.classDefsValue.push(classDef);
  }

  /**
   * 添加 click 事件
   *
   * 累积到 clickEvents，同时若 event.tooltip 非空则累积到 tooltips 映射。
   * 对齐 flowchart DefaultMetadataCollector.addClickEvent 行为。
   */
  addClickEvent(click: ClassClickEvent): void {
    this.clickEventsValue.push(click);
    if (click.tooltip !== undefined) {
      this.tooltipsValue[click.classId] = click.tooltip;
    }
  }

  addTooltip(nodeId: string, tooltip: string): void {
    this.tooltipsValue[nodeId] = tooltip;
  }

  addNamespace(namespace: ClassNamespaceInfo): void {
    this.namespacesValue.push(namespace);
  }

  addNote(note: ClassNoteInfo): void {
    this.notesValue.push(note);
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

  getClassDefs(): readonly ClassDefInfo[] {
    return this.classDefsValue;
  }

  getClickEvents(): readonly ClassClickEvent[] {
    return this.clickEventsValue;
  }

  getTooltips(): Readonly<Record<string, string>> {
    return this.tooltipsValue;
  }

  getNamespaces(): readonly ClassNamespaceInfo[] {
    return this.namespacesValue;
  }

  getNotes(): readonly ClassNoteInfo[] {
    return this.notesValue;
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

    if (this.classDefsValue.length > 0) {
      metadata.classDefs = [...this.classDefsValue];
    }
    if (this.clickEventsValue.length > 0) {
      metadata.classClickEvents = [...this.clickEventsValue];
    }
    if (Object.keys(this.tooltipsValue).length > 0) {
      metadata.classTooltips = { ...this.tooltipsValue };
    }
    if (this.namespacesValue.length > 0) {
      metadata.namespaces = [...this.namespacesValue];
    }
    if (this.notesValue.length > 0) {
      metadata.classNotes = [...this.notesValue];
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
// 5. ClassConverterRegistry — class 专属 Registry 实现
// ============================================================

/**
 * class 专属 ConverterRegistry 实现
 *
 * parse 方向：
 *   - 创建 ClassDefaultConverterContext + DefaultClassMetadataCollector
 *   - 遍历 blocks，try/catch NamespaceStackError → BlockConvertError（不中断）
 *   - dispatchParse: exhaustive switch 12 个 case + never check
 *   - buildCanvas: 从 ctx 提取 nodes/edges，从 metadataCollector.build() 提取 metadata
 *
 * serialize 方向（7 步扫描，[一-6-补] 修订：新增顶层 DirectionBlock；L2-7 修订：新增 Note fallback）：
 *   - 1. 顶层 DirectionBlock（从 metadata.direction ?? canvas.direction，[一-6-补] 修订）
 *   - 2. AccTitle / AccDescription blocks（从 metadata）
 *   - 3. Nodes DFS（按 parentId 分组深度优先遍历，namespace 嵌套产出 open/close）
 *   - 3.5 Note from metadata.classNotes（fallback：当无 note 节点时从 metadata.classNotes 产出，L2-7 修订）
 *   - 4. ClassDef blocks（从 metadata.classDefs）
 *   - 5. ClassApply blocks（从 nodes.classNames，按 className 分组）
 *   - 6. Style blocks（从 nodes.styles，按 styles 内容分组）
 *   - 7. Click blocks（从 metadata.classClickEvents）
 *
 * 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（[一-6-补] 修订）：
 *   - classDiagram header 是固定字符串 `classDiagram`（无 direction 后缀，mermaid 官方不支持 `classDiagram TB`）
 *   - 顶层 direction 必须作为独立 DirectionBlock 产出（对齐老路径 serializeClass 行为）
 *   - 与 flowchart 不同（flowchart header 含 direction，Converter 不产出顶层 DirectionBlock）
 * class-relation 边全部在顶层产出（class 边无 subgraphId 概念，source/target 是全局 classId）。
 * note-edge 不产出（由 NoteConverter 处理 note 节点时内部推断 classId）。
 */
export class ClassConverterRegistry implements ConverterRegistry {
  private readonly lookup: ReadonlyMap<ClassBlockType, ClassBlockConverterEntry>;

  constructor() {
    // 消费 class/index.ts 提供的 12 个无状态 Converter 单例（对齐 flowchart 模式）
    this.lookup = new Map(
      classConverterEntries.map((entry) => [entry.type, entry]),
    );
  }

  // === parse 方向 ===

  /**
   * parse：按 blockType 分发到对应 Converter.parseBlock
   *
   * - 产出型 block（class/relation/note/namespace-open）→ IModelBlockConverter.parseBlock → model（累加到 ctx）
   * - 副作用型 block → ISideEffectBlockConverter.parseBlock → void（副作用通过 ctx 受控方法承载）
   * - NamespaceStackError 转为 BlockConvertError 累积到 errors，不中断后续 block 处理
   *
   * @returns BlockConvertResult { canvas, errors }
   */
  parseBlocks(
    blocks: readonly ClassRecognizedBlock[],
    diagramType: DiagramType,
  ): BlockConvertResult {
    if (diagramType !== 'classDiagram') {
      throw new Error(
        `ClassConverterRegistry only supports 'classDiagram', got '${diagramType}'`,
      );
    }

    const metadataCollector = new DefaultClassMetadataCollector();
    const ctx = new ClassDefaultConverterContext(metadataCollector);

    for (const block of blocks) {
      try {
        this.dispatchParse(block, ctx);
      } catch (err) {
        if (err instanceof NamespaceStackError) {
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
   * metadata 仅在非空时设置。
   *
   * direction 同步到顶层（单一数据源修复：metadata.direction 是方向唯一来源，
   * 同步到 canvas.direction 供 React Flow 直接读取）。
   */
  private buildCanvas(
    ctx: ClassDefaultConverterContext,
    metadata: GraphMetadata,
  ): GraphCanvasState {
    const canvas: GraphCanvasState = {
      diagramType: 'classDiagram',
      nodes: ctx.getNodes(),
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
   * exhaustive switch 分发 parse（12 个 case + never check）
   *
   * 按 block.type 分发到对应 Converter.parseBlock，类型收窄保证类型安全。
   * default 分支的 never check 确保所有 case 已覆盖，新增 block 类型时编译期报错。
   */
  private dispatchParse(
    block: ClassRecognizedBlock,
    ctx: ClassConverterContext,
  ): void {
    switch (block.type) {
      case 'class': {
        const converter = this.requireConverter('class');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'relation': {
        const converter = this.requireConverter('relation');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'note': {
        const converter = this.requireConverter('note');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'namespace-open': {
        const converter = this.requireConverter('namespace-open');
        converter.parseBlock(block, ctx);
        break;
      }
      case 'namespace-close': {
        const converter = this.requireConverter('namespace-close');
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
   * serialize：从 canvas 产出所有 blocks（8 步扫描，[一-6-补] 修订：新增顶层 DirectionBlock；L2-7 修订：新增 Note fallback）
   *
   * - 1. 顶层 DirectionBlock（从 metadata.direction ?? canvas.direction，[一-6-补] 修订）
   * - 2. 全局指令：AccTitle / AccDescription（从 metadata）
   * - 3. Nodes DFS（按 parentId 分组深度优先遍历，namespace 嵌套产出 open/close）
   * - 3.5 Note from metadata.classNotes（fallback：当无 note 节点时从 metadata.classNotes 产出，L2-7 修订）
   * - 4. ClassDef blocks（从 metadata.classDefs）
   * - 5. ClassApply blocks（从 nodes.classNames，按 className 分组）
   * - 6. Style blocks（从 nodes.styles，按 styles 内容分组）
   * - 7. Click blocks（从 metadata.classClickEvents）
   *
   * 顶层 direction 由 Converter 全局指令步骤产出 DirectionBlock（[一-6-补] 修订）：
   *   - classDiagram header 是固定字符串 `classDiagram`（无 direction 后缀，mermaid 官方不支持 `classDiagram TB`）
   *   - 顶层 direction 必须作为独立 DirectionBlock 产出（对齐老路径 serializeClass 行为）
   *   - direction 数据源优先级：metadata.direction（权威）→ canvas.direction（顶层冗余字段）
   *   - 与 flowchart 不同（flowchart header 含 direction，Converter 不产出顶层 DirectionBlock）
   * class-relation 边全部在顶层产出（class 边无 subgraphId 概念）。
   * note-edge 不产出（由 NoteConverter 处理 note 节点时内部推断 classId）。
   * Note fallback（L2-7 修订）：当 canvas 无 note 节点（type='class-note'）但有 metadata.classNotes 时，
   *   从 metadata.classNotes 产出 NoteBlock，保证数据不丢失（兼容老路径数据）。
   */
  serialize(
    canvas: CanvasState,
    diagramType: DiagramType,
  ): readonly ClassRecognizedBlock[] {
    if (diagramType !== 'classDiagram') {
      throw new Error(
        `ClassConverterRegistry only supports 'classDiagram', got '${diagramType}'`,
      );
    }
    if (canvas.diagramType !== 'classDiagram') {
      throw new Error(
        `Expected GraphCanvasState with diagramType 'classDiagram', got '${canvas.diagramType}'`,
      );
    }

    const graphCanvas = canvas as GraphCanvasState;
    const metadata = graphCanvas.metadata ?? {};
    const blocks: ClassRecognizedBlock[] = [];
    // serialize 方向的 ctx 仅用于 NoteConverter.serializeBlock 查询 edges 推断 classId
    const ctx = new ClassDefaultConverterContext(new DefaultClassMetadataCollector());
    // 将 edges 注入 ctx 供 NoteConverter.serializeBlock 查询
    for (const edge of graphCanvas.edges) {
      ctx.registerEdge(edge);
    }

    // 1. 顶层 DirectionBlock（M3 修订：仅从 metadata.direction 产出）
    //    classDiagram header 无 direction 后缀，顶层 direction 必须作为独立 Block 产出（对齐老路径）
    //    direction 数据源：metadata.direction（权威源）
    //    [修订] 删除 ?? graphCanvas.direction fallback：fallback 掩盖编辑器强制默认值缺陷
    //    （原始无 direction 声明的代码不应输出 direction TD，对齐官方示例）
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

    // 3. Nodes DFS（按 parentId 分组深度优先遍历）
    const nodesByParent = this.groupNodesByParent(graphCanvas.nodes);
    this.dfsSerialize(undefined, 0, nodesByParent, ctx, blocks);

    // 3.5 Note from metadata.classNotes（fallback：当无 note 节点时从 metadata.classNotes 产出）
    //     数据源优先级：note 节点（type='class-note'，dfsSerialize 处理）→ metadata.classNotes（fallback）
    //     当 note 节点存在时，metadata.classNotes 是冗余数据（parse 方向同时产出），不重复序列化
    //     当 note 节点不存在但 metadata.classNotes 存在时，从 metadata.classNotes 产出 NoteBlock（保证数据不丢失）
    const hasNoteNodes = graphCanvas.nodes.some((n) => n.type === 'class-note');
    if (!hasNoteNodes && metadata.classNotes !== undefined) {
      for (const note of metadata.classNotes) {
        blocks.push(createNoteBlockFromInfo(note));
      }
    }

    // 4. ClassDef blocks（从 metadata.classDefs）
    if (metadata.classDefs !== undefined) {
      for (const classDef of metadata.classDefs) {
        blocks.push(createClassDefBlock(classDef));
      }
    }

    // 5. ClassApply blocks（从 nodes.classNames，按 className 分组）
    const classApplyBlocks = this.serializeClassApplyBlocks(graphCanvas.nodes);
    blocks.push(...classApplyBlocks);

    // 6. Style blocks（从 nodes.styles，按 styles 内容分组）
    const styleBlocks = this.serializeStyleBlocks(graphCanvas.nodes);
    blocks.push(...styleBlocks);

    // 7. Click blocks（从 metadata.classClickEvents）
    if (metadata.classClickEvents !== undefined) {
      for (const event of metadata.classClickEvents) {
        blocks.push(createClickBlock(event));
      }
    }

    return blocks;
  }

  /**
   * DFS 深度优先遍历产出 class/relation/note/namespace-open/namespace-close blocks
   *
   * 遍历顺序（M3 修订：对齐官方示例）：
   *   - 顶层入口（parentId === undefined）先产出所有 class-relation 边（关系骨架在前）
   *   - 然后遍历当前层级的子节点：
   *     - 若为 namespace（type='class-namespace'）：NamespaceOpenBlock → 递归 → NamespaceCloseBlock
   *     - 若为 class-box（type='class-box'）：ClassBlock
   *     - 若为 note（type='class-note'）：NoteBlock
   *   - class-relation 边仅顶层产出（class 边无 subgraphId 概念）
   *
   * 修订原因：原实现"先 children 后 relation"导致官方示例（`Animal <|-- Duck` 在前，class 在后）
   * 序列化后变成"先 class 后 relation"。修订后与官方示例顺序一致。
   *
   * indent 计算：depth × 2（namespace 嵌套深度 × 2）
   * NamespaceCloseBlock 的 indent 与 NamespaceOpenBlock 相同（外层 indent）。
   */
  private dfsSerialize(
    parentId: string | undefined,
    depth: number,
    nodesByParent: Map<string | undefined, MermaidNode[]>,
    ctx: ClassConverterContext,
    blocks: ClassRecognizedBlock[],
  ): void {
    const indent = depth * 2;

    // [修订] 顶层入口先产出所有 class-relation 边（对齐官方示例：关系骨架在前）
    if (parentId === undefined) {
      const relationConverter = this.requireConverter('relation');
      for (const edge of ctx.getEdges()) {
        if (edge.type !== 'class-relation') {
          continue; // 跳过 note-edge（由 NoteConverter 处理）
        }
        const relationBlock = relationConverter.serializeBlock(edge, ctx);
        if (relationBlock !== null) {
          blocks.push({ ...relationBlock, indent });
        }
      }
    }

    // 然后遍历当前层级的子节点产出 class/note/namespace blocks
    const children = nodesByParent.get(parentId) ?? [];
    for (const node of children) {
      if (node.type === 'class-namespace') {
        // Namespace open
        const namespaceOpenConverter = this.requireConverter('namespace-open');
        const openBlock = namespaceOpenConverter.serializeBlock(node, ctx);
        if (openBlock !== null) {
          blocks.push({ ...openBlock, indent });
        }

        // 递归处理子节点
        this.dfsSerialize(
          node.id,
          depth + 1,
          nodesByParent,
          ctx,
          blocks,
        );

        // Namespace close（indent 与 open 相同）
        blocks.push(createNamespaceCloseBlock(node.id, indent));
      } else if (node.type === 'class-box') {
        // Class block
        const classConverter = this.requireConverter('class');
        const classBlock = classConverter.serializeBlock(node, ctx);
        if (classBlock !== null) {
          blocks.push({ ...classBlock, indent });
        }
      } else if (node.type === 'class-note') {
        // Note block
        const noteConverter = this.requireConverter('note');
        const noteBlock = noteConverter.serializeBlock(node, ctx);
        if (noteBlock !== null) {
          blocks.push({ ...noteBlock, indent });
        }
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
   * 序列化 ClassApply blocks
   *
   * 扫描所有节点的 data.classNames，按 className 分组，
   * 每个 className 产出一个 ClassCssApplyBlock（含所有应用该 class 的节点 ID）。
   * 对齐 flowchart serializeClassApplyBlocks 模式。
   */
  private serializeClassApplyBlocks(
    nodes: readonly MermaidNode[],
  ): ClassCssApplyBlock[] {
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

    const blocks: ClassCssApplyBlock[] = [];
    for (const [className, classIds] of classToNodes) {
      blocks.push(createClassApplyBlock(classIds, className));
    }
    return blocks;
  }

  /**
   * 序列化 Style blocks
   *
   * 扫描所有节点的 data.styles，按 styles 内容分组（相同 styles 的节点合并为一个 ClassStyleBlock）。
   * 注意：class 的 ClassStyleBlock 字段是 classId（单个），不是 nodeIds（数组），
   * 所以每个有 styles 的节点产出独立的 ClassStyleBlock（不合并）。
   * 使用 \0 作为分隔符构建 key（避免 styles 内容冲突，对齐 flowchart）。
   */
  private serializeStyleBlocks(
    nodes: readonly MermaidNode[],
  ): ClassStyleBlock[] {
    const blocks: ClassStyleBlock[] = [];
    for (const node of nodes) {
      const styles = node.data.styles;
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
   * 类型对应关系由 ClassBlockConverterEntry 判别联合定义。
   */
  private requireConverter(type: 'class'): IModelBlockConverter<ClassBlock, MermaidNode, ClassConverterContext>;
  private requireConverter(type: 'relation'): IModelBlockConverter<RelationBlock, MermaidEdge, ClassConverterContext>;
  private requireConverter(type: 'note'): IModelBlockConverter<NoteBlock, MermaidNode, ClassConverterContext>;
  private requireConverter(type: 'namespace-open'): IModelBlockConverter<NamespaceOpenBlock, MermaidNode, ClassConverterContext>;
  private requireConverter(type: 'namespace-close'): ISideEffectBlockConverter<NamespaceCloseBlock, ClassConverterContext>;
  private requireConverter(type: 'class-apply'): ISideEffectBlockConverter<ClassCssApplyBlock, ClassConverterContext>;
  private requireConverter(type: 'style'): ISideEffectBlockConverter<ClassStyleBlock, ClassConverterContext>;
  private requireConverter(type: 'classDef'): ISideEffectBlockConverter<ClassCssDefBlock, ClassConverterContext>;
  private requireConverter(type: 'click'): ISideEffectBlockConverter<ClassClickBlock, ClassConverterContext>;
  private requireConverter(type: 'direction'): ISideEffectBlockConverter<ClassDirectionBlock, ClassConverterContext>;
  private requireConverter(type: 'accTitle'): ISideEffectBlockConverter<ClassAccTitleBlock, ClassConverterContext>;
  private requireConverter(type: 'accDescription'): ISideEffectBlockConverter<ClassAccDescriptionBlock, ClassConverterContext>;
  private requireConverter(type: ClassBlockType): ClassBlockConverterEntry['converter'] {
    const entry = this.lookup.get(type);
    if (entry === undefined) {
      throw new Error(`Converter not registered for block type: ${type}`);
    }
    return entry.converter;
  }
}
