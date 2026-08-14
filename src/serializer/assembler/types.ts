/**
 * Assembler 层类型定义 — StackFrame + IContextStack + IAssembler + AssembleUserOptions/AssembleInternalOptions
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 5（Assembler 层）；M3 重构 L2-1（泛型化 + 字段重命名 + AssembleOptions 拆分为 User/Internal）
 *
 * 数据流（serialize 方向）：
 *   ConverterRegistry.serialize(canvas) → RecognizedBlock<string>[]
 *   → IAssembler.assemble(blocks) → 代码字符串
 *
 * 设计决策2：采用显式 ContextStack（StackFrame = { indent, scopeId }），
 *   不用递归 depth（递归隐式栈无法应对 LIFO 校验，显式栈可查询、可调试）。
 *
 * M3 重构 L2-1（验证后修订 [一-7][一-8][一-9][技-2][一-8-补][一-8-补-2]）：
 *   - StackFrame 泛型化 `StackFrame<TScopeId = string>`，字段 `subgraphId` → `scopeId`
 *     （scopeId 语义泛化，覆盖 subgraph/namespace/未来其他嵌套结构）
 *   - IContextStack 方法名对齐现有源码：`current()/currentIndent()/push()/pop()/depth()`
 *     （不引入 peek/size，与现有源码冲突）
 *   - AssembleOptions 拆分为 AssembleUserOptions（用户面向，仅 preserveIndent?）
 *     + AssembleInternalOptions（baseAssembler 内部，含 openBlockType/closeBlockType/getScopeId）
 *     — 拆分原因：IAssembler.assemble 调用方不应感知 baseAssembler 内部字段
 *   - AssembleInternalOptions.getScopeId 返回类型 `string`（非 undefined），
 *     与 SubgraphOpenBlock.subgraphId / NamespaceOpenBlock.namespaceId 必填字段一致
 *   - IAssembler.assemble 签名泛型化：`FlowchartRecognizedBlock[]` → `RecognizedBlock<string>[]`
 *     （兼容 flowchart/class，与模块1 RecognizedBlock 基接口泛型化协同）
 *
 * 模块边界：仅依赖 ../recognizer/types.js，不引用 React/DOM。
 */

import type { RecognizedBlock } from '../recognizer/types.js';

// ============================================================
// 1. StackFrame + IContextStack（决策2：显式栈；M3 泛型化）
// ============================================================

/**
 * 栈帧（决策2：删除冗余 blockType 字段；M3 泛型化 + 字段重命名）
 *
 * 泛型参数 TScopeId 默认为 string：
 *   - flowchart 用 subgraphId: string
 *   - class 用 namespaceId: string
 *   - 字段统一为 scopeId，类型由泛型参数承载
 */
export interface StackFrame<TScopeId = string> {
  /** 当前缩进级别（空格数） */
  readonly indent: number;
  /** 当前所属嵌套作用域 ID（subgraphId / namespaceId，顶层为 undefined） */
  readonly scopeId: TScopeId | undefined;
}

/**
 * ContextStack 接口（决策2；M3 验证后修订 [一-9] 方法名对齐现有源码）
 *
 * 维护嵌套作用域状态，提供 LIFO 校验。
 * - push：openBlock（subgraph-open / namespace-open）时压入新帧
 * - pop：closeBlock（subgraph-close / namespace-close）时弹出帧（LIFO 校验 scopeId 匹配）
 *
 * 栈非空不变式：构造函数初始化默认帧 + pop underflow 检查 → 栈永不为空。
 * current() 直接返回栈顶，无需 fallback（程序错误不可包容）。
 *
 * 不用于计算输出缩进（block.indent 已由 ConverterRegistry.serialize DFS 设置）。
 * currentIndent() 提供调试/验证便利方法。
 */
export interface IContextStack<TScopeId = string> {
  /** 获取栈顶帧（栈永不为空：构造函数初始化默认帧 + pop underflow 检查） */
  current(): StackFrame<TScopeId>;
  /** 获取当前缩进字符串（' '.repeat(current().indent)） */
  currentIndent(): string;
  /** 压入新帧 */
  push(frame: StackFrame<TScopeId>): void;
  /** 弹出栈顶帧（空栈时抛出程序错误 — 不包容程序错误） */
  pop(): StackFrame<TScopeId>;
  /** 栈深度（不含默认帧，0 表示顶层） */
  depth(): number;
}

// ============================================================
// 2. AssembleUserOptions + AssembleInternalOptions（严重-4 修订 + M3 验证后修订 [一-8][一-8-补]）
// ============================================================

/**
 * 用户面向的组装选项（仅 preserveIndent）
 *
 * 用于 IAssembler.assemble 和 assembler/index.ts assemble 入口 — 调用方只关心缩进策略，
 * 不应感知 baseAssembler 内部字段（openBlockType/closeBlockType/getScopeId）。
 *
 * 严重-4 修订：从 preserveFormat（保留全部格式含注释/空行）收缩为 preserveIndent（仅保留缩进）。
 * 注释/空行在 model 中转阶段丢失，serialize 方向不还原（决策14）。
 */
export interface AssembleUserOptions {
  /**
   * 是否保留缩进，默认 true
   * - true：使用 block.indent 作为缩进（subgraph/namespace 嵌套缩进）
   * - false：扁平输出（indent=0，调试用）
   */
  readonly preserveIndent?: boolean;
}

/**
 * baseAssembler 内部使用的组装选项（含全部字段）
 *
 * M3 验证后修订 [一-8]：preserveIndent? 与 openBlockType/closeBlockType 共存，
 * 两者正交（preserveIndent 控制缩进策略，openBlockType/closeBlockType 控制嵌套边界识别）。
 *
 * M3 验证后修订 [一-8-补]：新增 getScopeId 回调字段。
 * 偏差根因：baseAssembler 是 diagramType 无关的通用函数，无法硬编码
 * `block.subgraphId`（flowchart）或 `block.namespaceId`（class）字段名提取 scopeId。
 * 修订方案：由调用方（FlowchartAssembler/ClassAssembler）负责从 block 提取 scopeId，
 * baseAssembler 完整复用 LIFO scopeId 匹配校验 + 栈未归零校验逻辑，零代码重复。
 *
 * M3 验证后修订 [一-8-补-2]：getScopeId 返回类型从 `string | undefined` 收紧为 `string`。
 * 偏差根因：SubgraphOpenBlock.subgraphId / NamespaceOpenBlock.namespaceId 都是 string 必填字段
 * （recognizer/types.ts 定义），原 `string | undefined` 返回类型弱化 LIFO 校验语义
 * （理论上若 openBlock 和 closeBlock 的 scopeId 都返回 undefined，LIFO 校验会失效）。
 * 修订方案：返回类型改为 string，强制调用方返回非 undefined 的 scopeId，类型签名与实际语义一致。
 */
export interface AssembleInternalOptions extends AssembleUserOptions {
  /** 开启嵌套的 BlockType（flowchart: 'subgraph-open', class: 'namespace-open'） */
  readonly openBlockType: string;
  /** 关闭嵌套的 BlockType（flowchart: 'subgraph-close', class: 'namespace-close'） */
  readonly closeBlockType: string;
  /**
   * 从 openBlock/closeBlock 中提取 scopeId（用于 LIFO 校验）
   *
   * 由调用方负责从 block 的特定字段提取 scopeId：
   *   - FlowchartAssembler: `(block) => (block as SubgraphOpenBlock | SubgraphCloseBlock).subgraphId`
   *   - ClassAssembler: `(block) => (block as NamespaceOpenBlock | NamespaceCloseBlock).namespaceId`
   *
   * 返回类型为 string（非 undefined）：SubgraphOpenBlock.subgraphId / NamespaceOpenBlock.namespaceId
   * 都是 string 必填字段，LIFO 校验要求 scopeId 非空才能正确匹配。
   *
   * 仅在 block.type === openBlockType 或 block.type === closeBlockType 时调用。
   */
  readonly getScopeId: (block: RecognizedBlock<string>) => string;
}

// ============================================================
// 3. IAssembler 接口（M3 验证后修订 [一-7] 签名泛型化 + [一-8-补] options 类型收紧）
// ============================================================

/**
 * Assembler 接口（M3 验证后修订 [一-7]：assemble 签名泛型化）
 *
 * 当前源码 assemble(blocks: readonly FlowchartRecognizedBlock[]) 写死 flowchart 类型，
 * class 的 ClassRecognizedBlock[] 不兼容。
 *
 * 修复方案：assemble 参数类型改为 RecognizedBlock<string>[]，兼容 flowchart/class/未来其他 diagram
 * （FlowchartRecognizedBlock / ClassRecognizedBlock 均为 RecognizedBlock<string> 的子类型）。
 *
 * 组装 RecognizedBlock[] 为代码字符串：
 * - 仅做文本拼接（indent + rawText），不做 model 转换
 * - openBlock → push stack + 输出 indent + rawText
 * - closeBlock → pop stack（LIFO 校验）+ 输出 indent + rawText
 * - 其他 block → 输出 indent + rawText（严重-3 决策：统一用 rawText）
 *
 * 边归属：由 ConverterRegistry.serialize 的 DFS 遍历已正确处理（按 parentId 分组），
 *   Assembler 不重新判断边归属，仅按 block 顺序拼接文本。
 *
 * options 类型为 AssembleUserOptions（仅 preserveIndent），openBlockType/closeBlockType/getScopeId
 * 由 Assembler 实现类内部固定，调用方无需感知（M3 验证后修订 [一-8-补] 拆分接口）。
 */
export interface IAssembler {
  assemble(
    blocks: readonly RecognizedBlock<string>[],
    options?: AssembleUserOptions,
  ): string;
}
