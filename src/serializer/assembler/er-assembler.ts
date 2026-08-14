/**
 * ErAssembler — erDiagram 装配器（erDiagram 重构 模块3 L2-1 新增）
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块3-装配器.md
 * 阶段：模块3 L2-1（ErAssembler 新增，调用 baseAssembler.assembleBlocks）
 *
 * 数据流（serialize 方向）：
 *   RecognizedBlock<string>[] → 代码字符串
 *     内部委托 baseAssembler.assembleBlocks 处理：
 *     - subgraph-open → stack.push + 输出 indent + rawText
 *     - subgraph-close → stack.pop（LIFO 校验 scopeId）+ 输出 indent + rawText
 *     - 其他 block（entity/relationship/class-apply/style/classDef/direction/accTitle/accDescription）
 *       → 输出 indent + rawText
 *
 * 设计决策（模块3 方案B）：
 *   - 调用 baseAssembler.assembleBlocks 零代码重复（与 FlowchartAssembler/ClassAssembler 共用通用拼装逻辑）
 *   - 无特化逻辑（ER Block 与 flowchart/class Block 都继承自 RecognizedBlock 基接口，含 rawText/indent）
 *   - 复用 ContextStack LIFO 校验（subgraph 嵌套配对校验）
 *
 * ER 嵌套边界选择（设计点1）：
 *   - ER subgraph 嵌套边界与 flowchart 相同（subgraph-open/subgraph-close）
 *   - 与 class 的 namespace-open/namespace-close 不同
 *   - 原因：ER 语法用 `subgraph "Title" { ... }` 表达嵌套，与 flowchart 一致；
 *           class 语法用 `namespace Name { ... }` 表达嵌套，故 BlockType 不同
 *
 * 多行 rawText 处理（设计点4）：
 *   - ErEntityBlock 的 rawText 可能是多行（实体名 + 属性块，含 `{` 和 `}`）
 *   - 由 baseAssembler.indentBlock 函数处理，对每一行应用 block 级 indent，空行不应用 indent
 *   - 无需 ErAssembler 特化逻辑
 *
 * 程序错误不可包容：栈未归零（subgraph 未关闭）或 scopeId 不匹配时由 baseAssembler 抛出错误。
 *
 * 模块边界：仅依赖 ./types.js、./base-assembler.js、../recognizer/types.js，不引用 React/DOM。
 */

import type {
  ErSubgraphCloseBlock,
  ErSubgraphOpenBlock,
  RecognizedBlock,
} from '../recognizer/types.js';
import type { AssembleUserOptions, IAssembler } from './types.js';
import { assembleBlocks } from './base-assembler.js';

/** erDiagram 嵌套边界 BlockType */
const ER_OPEN_BLOCK_TYPE = 'subgraph-open';
const ER_CLOSE_BLOCK_TYPE = 'subgraph-close';

/**
 * 从 erDiagram openBlock/closeBlock 提取 scopeId（subgraphId）
 *
 * 类型断言安全：仅当 block.type === 'subgraph-open' 或 'subgraph-close' 时调用，
 * 对应 ErSubgraphOpenBlock / ErSubgraphCloseBlock，两者均有 subgraphId: string 必填字段。
 * 返回类型为 string（非 undefined），与 AssembleInternalOptions.getScopeId 签名一致。
 */
function getErScopeId(block: RecognizedBlock<string>): string {
  return (block as ErSubgraphOpenBlock | ErSubgraphCloseBlock).subgraphId;
}

export class ErAssembler implements IAssembler {
  /**
   * 组装 blocks 为 erDiagram 代码字符串
   *
   * @param blocks - RecognizedBlock 数组（由 ErConverterRegistry.serialize 产出，含正确 indent + rawText）
   * @param options - 用户面向组装选项（仅 preserveIndent；openBlockType/closeBlockType/getScopeId 由本类固定）
   * @returns 代码字符串（不含 header，header 由入口函数 assemble() 生成）
   * @throws Error 当 subgraph-open/close 不配对或 scopeId 不匹配时（由 baseAssembler 抛出）
   */
  assemble(
    blocks: readonly RecognizedBlock<string>[],
    options?: AssembleUserOptions,
  ): string {
    return assembleBlocks(blocks, {
      preserveIndent: options?.preserveIndent,
      openBlockType: ER_OPEN_BLOCK_TYPE,
      closeBlockType: ER_CLOSE_BLOCK_TYPE,
      getScopeId: getErScopeId,
    });
  }
}
