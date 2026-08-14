/**
 * Recognizer 层类型定义 — RecognizedBlock 联合类型
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 2 骨架（接口签名已固化，实现待 Stage 3 接入 flowchart-recognizer）
 *
 * 数据流：jison parse → FlowDB 状态 + 行号映射 → Recognizer → RecognizedBlock[] → Converter
 *
 * block 三分类：
 *   1. 产出型（3 种）— IModelBlockConverter 双向：vertex / edge / subgraph-open
 *   2. 指令型（3 种）— ISideEffectBlockConverter 仅 parse：class-apply / style / linkStyle
 *   3. 全局指令型（6 种）— ISideEffectBlockConverter 仅 parse：classDef / click / direction / title / accTitle / accDescription
 *   4. 格式保留型（2 种）— ISideEffectBlockConverter 仅 parse：comment / blank
 *   5. 结构型（1 种）— ISideEffectBlockConverter 仅 parse：subgraph-close
 */

import type { FlowLabelType } from '../ast/flowchart-ast.js';
import type {
  FlowchartDirection,
  MermaidEdgeStyle,
  MermaidShapeType,
} from '../types.js';

// ============================================================
// 1. Block 类型枚举
// ============================================================

/** flowchart AST 节点块类型枚举（15 种） */
export type FlowchartBlockType =
  | 'vertex'
  | 'edge'
  | 'subgraph-open'
  | 'subgraph-close'
  | 'classDef'
  | 'class-apply'
  | 'style'
  | 'linkStyle'
  | 'click'
  | 'direction'
  | 'title'
  | 'accTitle'
  | 'accDescription'
  | 'comment'
  | 'blank';

// ============================================================
// 2. 识别块基接口
// ============================================================

/**
 * 识别块基接口（泛型化 — 模块1 L2-1）
 *
 * 泛型参数 TBlockType 默认为 FlowchartBlockType，保证 flowchart 已有代码无需改动。
 * classDiagram 通过 RecognizedBlock<ClassBlockType> 复用此基接口。
 */
export interface RecognizedBlock<TBlockType extends string = FlowchartBlockType> {
  readonly type: TBlockType;
  /** 原始行号（0-based，对应 rawCode；决策10 方案B 适配器下 jison 不提供行号，可能为 undefined） */
  readonly sourceLine: number | undefined;
  /** 原始行文本（保留格式，用于 Assembler 还原；serialize 方向由 Converter 生成 — 严重-3 决策） */
  readonly rawText: string;
  /**
   * 缩进空格数（与 StackFrame.indent 单位一致，subgraph/namespace 嵌套深度 × 2；
   * 由 Recognizer 推断，Assembler 无需换算 — 中等-2 修订）
   */
  readonly indent: number;
}

// ============================================================
// 3. 产出型 block（IModelBlockConverter 双向）
// ============================================================

/** vertex 识别块 */
export interface VertexBlock extends RecognizedBlock {
  readonly type: 'vertex';
  readonly nodeId: string;
  /** 节点标签文本（A[Hello] 中的 Hello，对齐 FlowVertex.text） */
  readonly label: string | undefined;
  /** 标签类型（markdown 标签语法 <|...|>，对齐 FlowVertex.labelType） */
  readonly labelType: FlowLabelType | undefined;
  /** 形状类型（A[] → rect, A() → rounded, 等；对齐 FlowVertex.type / MermaidShapeType） */
  readonly shape: MermaidShapeType | undefined;
  /** 内联样式（vertex 定义时附带的 style 语句，通常为空，对齐 FlowVertex.styles） */
  readonly inlineStyles: readonly string[];
  /** 内联 class（vertex 定义时附带，如 A[Hello]:::className，对齐 FlowVertex.classes） */
  readonly inlineClasses: readonly string[];
  /** 节点方向（vertex 定义时附带，通常为空，方向多由 subgraph 继承，对齐 FlowVertex.dir；类型对齐决策6 data.dir） */
  readonly dir: FlowchartDirection | undefined;
  /** 节点属性（A[|field:value|Hello] 语法，对齐 FlowVertex.props） */
  readonly props: Readonly<Record<string, unknown>> | undefined;
}

/** edge 识别块 */
export interface EdgeBlock extends RecognizedBlock {
  readonly type: 'edge';
  readonly sourceId: string;
  readonly targetId: string;
  /** 行内是否同时定义了 source 顶点（A[Hello] --> B） */
  readonly hasSourceVertexDef: boolean;
  /** 行内是否同时定义了 target 顶点（A --> B[World]） */
  readonly hasTargetVertexDef: boolean;
  /** 边样式（线型 × 箭头头类型，对应 MermaidEdgeStyle） */
  readonly edgeStyle: MermaidEdgeStyle;
  /** 边标签文本（A -->|label| B 中的 label） */
  readonly label: string | undefined;
  /** 标签类型（对齐 FlowEdge.labelType，markdown/string/text 三种；P1-1 修订） */
  readonly labelType: FlowLabelType | undefined;
  /** 边长度（影响布局，A ---|5| B 中的 5） */
  readonly length: number | undefined;
  /** 显式边 ID（用于 linkStyle 索引定位，A ---|edgeId:label| B） */
  readonly edgeId: string | undefined;
  /** 行内 class 简写应用的 class 名列表（A --> B:::className 语法，对齐 FlowEdge.classes；非 class-apply 语法） */
  readonly classNames: readonly string[];
  /**
   * subgraphId 已移到 MermaidEdgeData.subgraphId（P1-6 方案B）。
   * 由 Converter.parseBlock(EdgeBlock, ctx) 时从 ctx.currentParent() 读取栈顶 subgraphId 设置到 MermaidEdgeData.subgraphId。
   * 原因：jison addSubGraph 在子内容解析完后调用（顺序倒置），需 pendingStack 机制回溯包装，
   * subgraphId 在 EdgeBlock 层无法准确推断，放到 MermaidEdgeData 由 Converter 在 parse 时设置更准确。
   * 详见决策11 pendingStack 机制。
   */
}

/** subgraph 开启块 */
export interface SubgraphOpenBlock extends RecognizedBlock {
  readonly type: 'subgraph-open';
  readonly subgraphId: string;
  /** subgraph 标题（无显式标题时为空字符串，Converter 序列化时若 title 为空则输出 `subgraph id` 不带 [title]） */
  readonly title: string;
  readonly classNames: readonly string[];
  readonly hasExplicitDir: boolean;
  /** subgraph 方向（对齐 FlowSubGraph.dir，类型对齐决策6 data.dir） */
  readonly dir: FlowchartDirection | undefined;
}

/** subgraph 关闭块（结构型，归入副作用型分类，仅 parse 方向 — 严重-1 修订） */
export interface SubgraphCloseBlock extends RecognizedBlock {
  readonly type: 'subgraph-close';
  /** 关闭的 subgraph ID（与对应 SubgraphOpenBlock.subgraphId 匹配，用于 LIFO 校验） */
  readonly subgraphId: string;
}

// ============================================================
// 4. 指令型 block（ISideEffectBlockConverter 仅 parse，通过 ctx.updateNode/updateEdge 应用副作用）
// ============================================================

/**
 * class 应用块（class nodeId className 或 class A,B,C className）
 * mermaid idString 支持 COMMA（flow.jison:597），Recognizer 从 idString 拆分为 nodeIds
 */
export interface ClassApplyBlock extends RecognizedBlock {
  readonly type: 'class-apply';
  /** 目标节点 ID 列表（从 idString 按 COMMA 拆分，可能多个） */
  readonly nodeIds: readonly string[];
  /** 应用的 class 名 */
  readonly className: string;
}

/**
 * 节点样式块（style nodeId fill:#fff，支持多目标 style A,B fill:#fff）
 * mermaid idString 支持 COMMA，Recognizer 从 idString 拆分为 nodeIds
 */
export interface StyleBlock extends RecognizedBlock {
  readonly type: 'style';
  /** 目标节点 ID 列表（从 idString 按 COMMA 拆分，可能多个） */
  readonly nodeIds: readonly string[];
  /** 样式字符串列表（原始格式，Converter parse 时通过 ctx.updateNode 应用到 MermaidNodeData.styles） */
  readonly styles: readonly string[];
}

/**
 * linkStyle 目标边标识（判别联合）
 * 证据：mermaid jison 只支持 default 和数字索引列表，不支持 edgeId
 * 见 flow.jison:562-575 linkStyleStatement 规则
 */
export type LinkStyleTarget =
  | { kind: 'default' }
  | { kind: 'indices'; indices: readonly number[] };

/**
 * 边样式块
 * - linkStyle default stroke:#f00
 * - linkStyle 0,1,2 stroke:#f00
 * - linkStyle 0 interpolate basis stroke:#f00
 */
export interface LinkStyleBlock extends RecognizedBlock {
  readonly type: 'linkStyle';
  /** 目标边标识（判别联合，编译器保证分支覆盖；中等-1 修订） */
  readonly target: LinkStyleTarget;
  /** 样式字符串列表（原始格式，Converter parse 时通过 ctx.updateEdge 应用到 MermaidEdgeData.styles） */
  readonly styles: readonly string[];
  /** 插值方式（对齐 INTERPOLATE 语法，如 linkStyle 0 interpolate basis stroke:#f00；关键修正-1 新增） */
  readonly interpolate: string | undefined;
  /** 动画（对齐 ANIMATE 语法，如 linkStyle 0 animate true；与 MermaidEdgeData.animate 同类型） */
  readonly animate: boolean | 'fast' | 'slow' | undefined;
}

// ============================================================
// 5. 全局指令型 block（ISideEffectBlockConverter 仅 parse，通过 ctx.metadataCollector 累积）
// ============================================================

/** classDef 定义块（classDef className fill:#fff,stroke:#000） */
export interface ClassDefBlock extends RecognizedBlock {
  readonly type: 'classDef';
  readonly className: string;
  /** 样式字符串列表（原始格式，对齐 FlowClassDefInfo.styles，如 ["fill:#fff", "stroke:#000"]） */
  readonly styles: readonly string[];
  /** 文本样式字符串列表（color 相关，对齐 FlowClassDefInfo.textStyles） */
  readonly textStyles: readonly string[];
}

/** click 事件块（click nodeId callback "tooltip" / click nodeId href "url"） */
export interface ClickBlock extends RecognizedBlock {
  readonly type: 'click';
  readonly nodeId: string;
  /** 回调函数名 */
  readonly functionName: string | undefined;
  /** 回调函数参数 */
  readonly functionArgs: string | undefined;
  /** href 链接 */
  readonly link: string | undefined;
  /** 链接 target */
  readonly linkTarget: string | undefined;
  /** tooltip */
  readonly tooltip: string | undefined;
}

/** 方向块（direction TB） */
export interface DirectionBlock extends RecognizedBlock {
  readonly type: 'direction';
  readonly dir: FlowchartDirection;
}

/** 图表标题块（title xxx） */
export interface TitleBlock extends RecognizedBlock {
  readonly type: 'title';
  readonly title: string;
}

/** 无障碍标题块（accTitle: xxx） */
export interface AccTitleBlock extends RecognizedBlock {
  readonly type: 'accTitle';
  readonly accTitle: string;
}

/** 无障碍描述块（accDescription: xxx） */
export interface AccDescriptionBlock extends RecognizedBlock {
  readonly type: 'accDescription';
  readonly accDescription: string;
}

// ============================================================
// 6. 格式保留型 block（ISideEffectBlockConverter 仅 parse，无副作用，Assembler 原样输出 rawText）
// ============================================================

/** 注释块（%% comment） */
export interface CommentBlock extends RecognizedBlock {
  readonly type: 'comment';
  /** 注释内容（不含 %% 前缀，Assembler 输出时还原） */
  readonly text: string;
}

/** 空行块 */
export interface BlankBlock extends RecognizedBlock {
  readonly type: 'blank';
}

// ============================================================
// 7. 识别结果联合类型
// ============================================================

/** 识别结果（联合类型，15 种 block） */
export type FlowchartRecognizedBlock =
  | VertexBlock
  | EdgeBlock
  | SubgraphOpenBlock
  | SubgraphCloseBlock
  | ClassDefBlock
  | ClassApplyBlock
  | StyleBlock
  | LinkStyleBlock
  | ClickBlock
  | DirectionBlock
  | TitleBlock
  | AccTitleBlock
  | AccDescriptionBlock
  | CommentBlock
  | BlankBlock;

// ============================================================
// 8. classDiagram Block 类型枚举
// ============================================================

/**
 * classDiagram AST 节点块类型枚举（12 种）
 *
 * 分类：
 *   1. 产出型（4 种）— IModelBlockConverter 双向：class / relation / note / namespace-open
 *   2. 结构型（1 种）— ISideEffectBlockConverter 仅 parse：namespace-close
 *   3. 指令型（2 种）— ISideEffectBlockConverter 仅 parse：class-apply / style
 *   4. 全局指令型（5 种）— ISideEffectBlockConverter 仅 parse：classDef / click / direction / accTitle / accDescription
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块1-识别器.md
 */
export type ClassBlockType =
  // 产出型（4 种）
  | 'class'
  | 'relation'
  | 'note'
  | 'namespace-open'
  // 结构型（1 种）
  | 'namespace-close'
  // 指令型（2 种）
  | 'class-apply'
  | 'style'
  // 全局指令型（5 种）
  | 'classDef'
  | 'click'
  | 'direction'
  | 'accTitle'
  | 'accDescription';

// ============================================================
// 9. classDiagram 产出型 Block（IModelBlockConverter 双向）
// ============================================================

/**
 * 类成员子结构（class Block 内嵌，保留 class 体语义）
 *
 * 设计决策（模块1 方案B）：class Block 携带 members[] 子数组，保留 class 体语义，
 * 避免平铺为独立 class-member Block 导致 Converter 需按 classId 重新分组。
 */
export interface ClassMemberBlock {
  /** 原始成员文本（未解析，保留可见性/classifier/泛型/参数/返回类型） */
  readonly memberText: string;
  /**
   * 成员类型（由 Recognizer 根据 jison addMember 调用上下文判定）：
   *   - 'annotation'：行外注解 <<annotation>>（由 addAnnotation 产出，对齐 ClassBoxFlowNode.data.annotations）
   *   - 'method'：方法（含 `)` 判定）
   *   - 'attribute'：属性（其他）
   */
  readonly memberKind: 'annotation' | 'method' | 'attribute';
}

/**
 * 类定义 Block（携带 members[] 子数组保留 class 体语义）
 *
 * 设计决策（模块1 方案B）：class Block 携带 members[]/annotations[] 子字段，
 * 保留 class 体语义，Converter 逻辑清晰（无需按 classId 重新分组）。
 *
 * LOLLIPOP 处理：Recognizer 保留原始 classId（含泛型 ~T~），由 Converter 决定是否拆分泛型。
 */
export interface ClassBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'class';
  /** 类名（含泛型 ~T~，由 Converter 拆分为 label + data.generics） */
  readonly classId: string;
  /** class Name [Label] 的 Label（显式标签，若与 classId 相同则为 undefined） */
  readonly label: string | undefined;
  /** 行内注解 <<interface>> 等（classId 后紧跟的 <<xxx>>，单一） */
  readonly stereotype: string | undefined;
  /** 行外注解 <<annotation>> 列表（由 addAnnotation 产出，对齐 ClassBoxFlowNode.data.annotations） */
  readonly annotations: readonly string[];
  /** 类体成员（属性/方法/注解，由 addMembers 产出，顺序与源码一致） */
  readonly members: readonly ClassMemberBlock[];
  /** :::cssClass 简写应用的 CSS 类（classId 后紧跟的 :::className） */
  readonly cssClasses: readonly string[];
}

/**
 * 关系 Block（双向对称，携带 relationType1/relationType2/lineType 三元组）
 *
 * 设计决策（模块2 方案B）：MermaidEdgeData 字段重构为双端对称，
 * 删除旧 relationType/startRelationType/endRelationType/classCardinality，
 * 新增 relationType1/relationType2/cardinality1/cardinality2。
 *
 * LOLLIPOP 处理：Recognizer 保留原始 sourceId/targetId（不替换为 interface${N}），
 * 由 Converter 决定是否生成 interface 节点（模块2 决策13：不生成，用 marker 表达）。
 */
export interface RelationBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'relation';
  /** 原始 id1（LOLLIPOP 不替换，由 Converter 决定） */
  readonly sourceId: string;
  /** 原始 id2（LOLLIPOP 不替换） */
  readonly targetId: string;
  /** 起点关系类型（0=AGGREGATION, 1=EXTENSION, 2=COMPOSITION, 3=DEPENDENCY, 4=LOLLIPOP, 'none'=无） */
  readonly relationType1: number | 'none';
  /** 终点关系类型（同上） */
  readonly relationType2: number | 'none';
  /** 线型（0=LINE, 1=DOTTED_LINE） */
  readonly lineType: number;
  /** 左基数 "1"（STR，jison cardinality1） */
  readonly cardinality1: string | undefined;
  /** 右基数 "0..*"（STR，jison cardinality2） */
  readonly cardinality2: string | undefined;
  /** 关系标签 : label（cleanupLabel 后） */
  readonly label: string | undefined;
}

/**
 * 注释 Block（note "text" / note for ClassName "text"）
 *
 * classDiagram 仅 2 种 note 形式：独立 note / note for ClassName，不支持方位语法。
 */
export interface NoteBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'note';
  /** note 文本 */
  readonly text: string;
  /** note for ClassName 的 ClassName；独立 note 为 undefined */
  readonly classId: string | undefined;
}

/**
 * namespace 开启 Block（addNamespace 产出）
 *
 * 设计决策：复用 flowchart pendingStack 机制管理 namespace 嵌套，
 * addNamespace 产出 namespace-open Block + enterScope，
 * popNamespace 产出 namespace-close Block + leaveScope。
 */
export interface NamespaceOpenBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'namespace-open';
  /** qualifiedId（点分名称 A.B.C，保留原始字符串） */
  readonly namespaceId: string;
  /** namespace Name [Label] 的 Label（显式标签） */
  readonly label: string | undefined;
}

// ============================================================
// 10. classDiagram 结构型 Block（ISideEffectBlockConverter 仅 parse，栈管理）
// ============================================================

/**
 * namespace 关闭 Block（popNamespace 产出，与 NamespaceOpenBlock.namespaceId 匹配）
 *
 * 设计决策：对齐 flowchart SubgraphCloseBlock 的 LIFO 校验模式，
 * Converter.parseBlock 时 popParent（失配抛 NamespaceStackError）。
 */
export interface NamespaceCloseBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'namespace-close';
  /** 与对应 NamespaceOpenBlock.namespaceId 匹配，用于 LIFO 校验 */
  readonly namespaceId: string;
}

// ============================================================
// 11. classDiagram 指令型 Block（ISideEffectBlockConverter 仅 parse，更新 node 字段或 metadata）
// ============================================================

/**
 * CSS 类应用 Block（cssClass "Id1,Id2" className / class Name ::: className）
 *
 * 命名冲突解决：flowchart 已有 ClassApplyBlock（字段 nodeIds: readonly string[]），
 * class 的字段不同（classIds: readonly string[]），故重命名为 ClassCssApplyBlock 避免冲突。
 * 依据 institution.md 第6条"架构缺陷必须解决" + TypeScript 严格模式禁止重复标识符。
 */
export interface ClassCssApplyBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'class-apply';
  /** 应用 CSS 类的类名列表（逗号拆分） */
  readonly classIds: readonly string[];
  /** CSS 类名 */
  readonly className: string;
}

/**
 * 内联样式 Block（style Id style1,style2）
 *
 * 命名冲突解决：flowchart 已有 StyleBlock（字段 nodeIds: readonly string[]），
 * class 的字段不同（classId: string），故重命名为 ClassStyleBlock 避免冲突。
 */
export interface ClassStyleBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'style';
  /** 应用样式的类名 */
  readonly classId: string;
  /** 样式列表（逗号拆分） */
  readonly styles: readonly string[];
}

// ============================================================
// 12. classDiagram 全局指令型 Block（ISideEffectBlockConverter 仅 parse，累积到 metadata）
// ============================================================

/**
 * CSS 类定义 Block（classDef name style1,style2）
 *
 * 命名冲突解决：flowchart 已有 ClassDefBlock，故重命名为 ClassCssDefBlock 避免冲突。
 */
export interface ClassCssDefBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'classDef';
  /** CSS 类名 */
  readonly className: string;
  /** 样式字符串列表 */
  readonly styles: readonly string[];
  /** 文本样式列表（含 color 的样式同时加入 textStyles） */
  readonly textStyles: readonly string[];
}

/**
 * 交互 Block（click/href/link/callback，13 种 jison 变体合并）
 *
 * 命名冲突解决：flowchart 已有 ClickBlock（字段 nodeId），
 * class 的字段不同（classId），故重命名为 ClassClickBlock 避免冲突。
 */
export interface ClassClickBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'click';
  readonly classId: string;
  /** 回调函数名（click call funcName） */
  readonly functionName: string | undefined;
  /** 回调函数参数（click call funcName(args)） */
  readonly functionArgs: string | undefined;
  /** href 链接（click href url / link url） */
  readonly link: string | undefined;
  /** 链接 target（_self/_blank/_parent/_top） */
  readonly linkTarget: string | undefined;
  /** tooltip */
  readonly tooltip: string | undefined;
}

/**
 * 方向 Block（direction TB/BT/RL/LR）
 *
 * 设计决策（[一-6-补] 修订）：classDiagram header 是固定字符串 `classDiagram`（无 direction 后缀，
 * mermaid 官方 classDiagram 不支持 `classDiagram TB` header 语法）。顶层 direction 和 namespace 内
 * direction 都作为 ClassDirectionBlock 产出（由 Converter 生成），Assembler 仅拼接 Block。
 * 与 flowchart 不同（flowchart header 是 `flowchart ${direction}`，顶层 direction 不产出 Block）。
 */
export interface ClassDirectionBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'direction';
  /** TB/BT/RL/LR（复用 FlowchartDirection 类型） */
  readonly dir: FlowchartDirection;
}

/** 无障碍标题 Block（accTitle: text） */
export interface ClassAccTitleBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'accTitle';
  readonly accTitle: string;
}

/** 无障碍描述 Block（accDescr: text / accDescr { multiline }） */
export interface ClassAccDescriptionBlock extends RecognizedBlock<ClassBlockType> {
  readonly type: 'accDescription';
  /** 多行内容保留原始换行 */
  readonly accDescription: string;
}

// ============================================================
// 13. classDiagram 识别结果联合类型
// ============================================================

/**
 * classDiagram 识别结果（联合类型，12 种 block）
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块1-识别器.md
 *
 * 命名冲突解决（4 种 Block 加 Class 前缀避免与 flowchart 同名冲突）：
 *   - ClassCssApplyBlock（flowchart 有 ClassApplyBlock，字段不同）
 *   - ClassStyleBlock（flowchart 有 StyleBlock，字段不同）
 *   - ClassCssDefBlock（flowchart 有 ClassDefBlock，字段不同）
 *   - ClassClickBlock（flowchart 有 ClickBlock，字段不同）
 *
 * 无冲突的 Block 保持设计文档原名：
 *   - ClassBlock（flowchart 是 VertexBlock）
 *   - RelationBlock（flowchart 是 EdgeBlock）
 *   - NoteBlock（flowchart 无对应）
 *   - NamespaceOpenBlock（flowchart 是 SubgraphOpenBlock）
 *   - NamespaceCloseBlock（flowchart 是 SubgraphCloseBlock）
 *   - ClassDirectionBlock/ClassAccTitleBlock/ClassAccDescriptionBlock（设计文档已加 Class 前缀）
 */
export type ClassRecognizedBlock =
  // 产出型（4 种）
  | ClassBlock
  | RelationBlock
  | NoteBlock
  | NamespaceOpenBlock
  // 结构型（1 种）
  | NamespaceCloseBlock
  // 指令型（2 种）
  | ClassCssApplyBlock
  | ClassStyleBlock
  // 全局指令型（5 种）
  | ClassCssDefBlock
  | ClassClickBlock
  | ClassDirectionBlock
  | ClassAccTitleBlock
  | ClassAccDescriptionBlock;

// ============================================================
// 14. erDiagram Block 类型枚举
// ============================================================

/**
 * erDiagram AST 节点块类型枚举（10 种）
 *
 * 分类：
 *   1. 产出型（3 种）— IModelBlockConverter 双向：entity / relationship / subgraph-open
 *   2. 结构型（1 种）— ISideEffectBlockConverter 仅 parse：subgraph-close
 *   3. 指令型（2 种）— ISideEffectBlockConverter 仅 parse：class-apply / style
 *   4. 全局指令型（4 种）— ISideEffectBlockConverter 仅 parse：classDef / direction / accTitle / accDescription
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块1-识别器.md
 */
export type ErBlockType =
  // 产出型（3 种）
  | 'entity'
  | 'relationship'
  | 'subgraph-open'
  // 结构型（1 种）
  | 'subgraph-close'
  // 指令型（2 种）
  | 'class-apply'
  | 'style'
  // 全局指令型（4 种）
  | 'classDef'
  | 'direction'
  | 'accTitle'
  | 'accDescription';

// ============================================================
// 15. erDiagram 产出型 Block（IModelBlockConverter 双向）
// ============================================================

/**
 * ER 属性子结构（entity Block 内嵌，保留实体体语义）
 *
 * 设计决策（模块1 方案B）：entity Block 携带 attributes[] 子数组，
 * 保留实体体语义，Converter 逻辑清晰（无需按 entityName 重新分组）。
 * 对齐官方 erTypes.ts Attribute 类型。
 */
export interface ErAttributeBlock {
  /** 属性类型（如 string/int） */
  readonly type: string;
  /** 属性名 */
  readonly name: string;
  /** 属性键列表（PK/FK/UK） */
  readonly keys: readonly ErAttributeKeyType[];
  /** 属性注释（空字符串表示无注释） */
  readonly comment: string;
}

/** ER 属性键类型（对齐官方 erTypes.ts，与 M0 ERAttributeKey 一致） */
export type ErAttributeKeyType = 'PK' | 'FK' | 'UK';

/**
 * 实体定义 Block（携带 attributes[] 子数组保留实体体语义）
 *
 * 设计决策（模块1 方案B 完整增强）：
 *   - entity Block 携带 attributes[]/alias/cssClasses 子字段，保留实体体语义
 *   - 前置 cssCompiledStyles（收尾阶段由 classes Map 计算）
 *   - 前置 parentId（收尾阶段由 subGraphLookup 计算）
 *
 * cssClasses 字段含 ErDB 默认的 'default' 类，Converter parse 时过滤。
 */
export interface ErEntityBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'entity';
  /** 实体名（原始 name，非 entity-${name}-${index}） */
  readonly entityName: string;
  /** 实体别名（空字符串表示无别名） */
  readonly alias: string;
  /** 属性列表（已 reverse，顺序与源码一致） */
  readonly attributes: readonly ErAttributeBlock[];
  /** CSS 类名字符串（空格分隔，含 ErDB 默认的 'default' 类，Converter parse 时过滤） */
  readonly cssClasses: string;
  /** 编译后的样式（收尾阶段由 classes Map 计算） */
  readonly cssCompiledStyles: readonly string[];
  /** 所属 subgraph ID（收尾阶段由 subGraphLookup 计算） */
  readonly parentId: string | undefined;
}

/**
 * 关系 Block（携带 entityA/entityB/roleA/cardA/cardB/relType）
 *
 * 设计决策（模块2 方案B）：MermaidEdgeData 字段重构为双端对称，
 * 删除旧 cardinality 对象字段和 erRole 单端字段，
 * 新增 erCardA/erCardB/erRoleA 双端对称字段。
 *
 * 端点类型（entity/subgraph）不冗余存储到 Block，由 Converter/渲染层
 * 通过端点节点的 MermaidNode.data.isSubgraph 字段判断（单一数据源）。
 */
export interface ErRelationshipBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'relationship';
  /** A 端实体名（原始 name，未替换为 entity.id） */
  readonly entityA: string;
  /** A 端角色（关系标签） */
  readonly roleA: string;
  /** B 端实体名 */
  readonly entityB: string;
  /** A 端基数（CARDINALITY 常量值：ZERO_OR_ONE/...） */
  readonly cardA: string;
  /** B 端基数 */
  readonly cardB: string;
  /** 关系类型（IDENTIFICATION 常量值：IDENTIFYING/NON_IDENTIFYING） */
  readonly relType: string;
}

/**
 * subgraph 开启 Block（携带已去重 nodes[]/dir/parentId）
 *
 * 设计决策（模块1 方案B 完整增强）：
 *   - 前置 makeUniq 节点去重（subgraph-open Block.nodes 已去重）
 *   - 前置 parentId（收尾阶段由 subGraphLookup 计算）
 *   - dir 统一为 FlowchartDirection（与 ErDirectionBlock.dir 和 ErSubgraphEditor.data.dir 一致）
 */
export interface ErSubgraphOpenBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'subgraph-open';
  /** subgraph ID（原始 name） */
  readonly subgraphId: string;
  /** subgraph 标题 */
  readonly title: string;
  /** subgraph 方向（TB/BT/RL/LR，统一为 FlowchartDirection；未声明为 undefined） */
  readonly dir: FlowchartDirection | undefined;
  /** 已去重的节点 ID 列表（makeUniq 处理后） */
  readonly nodes: readonly string[];
  /** 父 subgraph ID（嵌套 subgraph 场景） */
  readonly parentId: string | undefined;
}

// ============================================================
// 16. erDiagram 结构型 Block（ISideEffectBlockConverter 仅 parse，栈管理）
// ============================================================

/**
 * subgraph 关闭 Block（与 ErSubgraphOpenBlock 配对，LIFO 校验）
 *
 * 设计决策：复用 flowchart pendingStack 机制管理 subgraph 嵌套，
 * addSubGraph 产出 subgraph-open Block + leaveScope（pop 栈顶 scope），
 * 配对的 subgraph-close Block 标记作用域结束。
 */
export interface ErSubgraphCloseBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'subgraph-close';
  /** 与对应 ErSubgraphOpenBlock.subgraphId 匹配，用于 LIFO 校验 */
  readonly subgraphId: string;
}

// ============================================================
// 17. erDiagram 指令型 Block（ISideEffectBlockConverter 仅 parse，更新 node 字段或 metadata）
// ============================================================

/**
 * CSS 类应用 Block（class nodeId className）
 *
 * 命名冲突解决：flowchart 已有 ClassApplyBlock（字段 nodeIds + className），
 * class 有 ClassCssApplyBlock（字段 classIds + className），
 * ER 的字段不同（ids + classNames，支持多类名），故重命名为 ErClassApplyBlock。
 */
export interface ErClassApplyBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'class-apply';
  /** 应用 CSS 类的实体/subgraph ID 列表 */
  readonly ids: readonly string[];
  /** CSS 类名列表（支持 class A,B className1,className2 多类名） */
  readonly classNames: readonly string[];
}

/**
 * 内联样式 Block（style nodeId style1,style2）
 *
 * 命名冲突解决：flowchart 已有 StyleBlock（字段 nodeIds + styles），
 * class 有 ClassStyleBlock（字段 classId + styles），
 * ER 的字段不同（ids + styles，支持多目标），故重命名为 ErStyleBlock。
 */
export interface ErStyleBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'style';
  /** 应用样式的实体/subgraph ID 列表 */
  readonly ids: readonly string[];
  /** 样式列表 */
  readonly styles: readonly string[];
}

// ============================================================
// 18. erDiagram 全局指令型 Block（ISideEffectBlockConverter 仅 parse，累积到 metadata）
// ============================================================

/**
 * CSS 类定义 Block（classDef name style1,style2）
 *
 * 命名冲突解决：flowchart 已有 ClassDefBlock，class 有 ClassCssDefBlock，
 * 故重命名为 ErClassDefBlock。
 */
export interface ErClassDefBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'classDef';
  /** CSS 类名 */
  readonly className: string;
  /** 样式列表 */
  readonly styles: readonly string[];
  /** 文本样式列表（含 color 的样式同时加入 textStyles） */
  readonly textStyles: readonly string[];
}

/**
 * 方向 Block（direction TB/BT/RL/LR）
 *
 * 设计决策（模块2 设计点6）：erDiagram header 是 `erDiagram`（无 direction 后缀），
 * 顶层 direction 必须作为独立 DirectionBlock 产出。与 class 的 ClassDirectionBlock 模式一致。
 */
export interface ErDirectionBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'direction';
  /** TB/BT/RL/LR（复用 FlowchartDirection 类型） */
  readonly dir: FlowchartDirection;
}

/** 无障碍标题 Block（accTitle: text） */
export interface ErAccTitleBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'accTitle';
  readonly accTitle: string;
}

/** 无障碍描述 Block（accDescr: text / accDescr { multiline }） */
export interface ErAccDescriptionBlock extends RecognizedBlock<ErBlockType> {
  readonly type: 'accDescription';
  /** 多行内容保留原始换行 */
  readonly accDescription: string;
}

// ============================================================
// 19. erDiagram 识别结果联合类型
// ============================================================

/**
 * erDiagram 识别结果（联合类型，10 种 block）
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块1-识别器.md
 *
 * 命名冲突解决（所有 Block 加 Er 前缀避免与 flowchart/class 同名冲突）：
 *   - ErEntityBlock（flowchart 是 VertexBlock，class 是 ClassBlock）
 *   - ErRelationshipBlock（flowchart 是 EdgeBlock，class 是 RelationBlock）
 *   - ErSubgraphOpenBlock（flowchart 是 SubgraphOpenBlock，class 是 NamespaceOpenBlock）
 *   - ErSubgraphCloseBlock（flowchart 是 SubgraphCloseBlock，class 是 NamespaceCloseBlock）
 *   - ErClassApplyBlock（flowchart 是 ClassApplyBlock，class 是 ClassCssApplyBlock，字段不同）
 *   - ErStyleBlock（flowchart 是 StyleBlock，class 是 ClassStyleBlock，字段不同）
 *   - ErClassDefBlock（flowchart 是 ClassDefBlock，class 是 ClassCssDefBlock，字段不同）
 *   - ErDirectionBlock/ErAccTitleBlock/ErAccDescriptionBlock（避免与 flowchart/class 同名）
 */
export type ErRecognizedBlock =
  // 产出型（3 种）
  | ErEntityBlock
  | ErRelationshipBlock
  | ErSubgraphOpenBlock
  // 结构型（1 种）
  | ErSubgraphCloseBlock
  // 指令型（2 种）
  | ErClassApplyBlock
  | ErStyleBlock
  // 全局指令型（4 种）
  | ErClassDefBlock
  | ErDirectionBlock
  | ErAccTitleBlock
  | ErAccDescriptionBlock;
