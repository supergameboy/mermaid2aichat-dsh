/**
 * FlowchartAssembler — flowchart 装配器（M3 重构 L2-3：调用 baseAssembler）
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块3-装配器.md
 * 阶段：Stage 5；M3 重构 L2-3（重构为调用 baseAssembler.assembleBlocks）
 *
 * 数据流（serialize 方向）：
 *   RecognizedBlock<string>[] → 代码字符串
 *     内部委托 baseAssembler.assembleBlocks 处理：
 *     - subgraph-open → stack.push + 输出 indent + rawText
 *     - subgraph-close → stack.pop（LIFO 校验 scopeId）+ 输出 indent + rawText
 *     - 其他 block → 输出 indent + rawText
 *
 * 设计决策：
 *   - 决策2：显式 ContextStack（LIFO 校验，不用递归 depth）— L2-3 起委托 baseAssembler
 *   - 严重-3：统一用 rawText（由 Converter 生成）
 *   - 严重-4：preserveIndent 选项控制缩进保留
 *   - 决策14：注释/空行 serialize 方向不还原
 *
 * M3 重构 L2-3（验证后修订 [一-7][一-8-补]）：
 *   - 移除内联 ContextStack 逻辑，调用 baseAssembler.assembleBlocks 零代码重复
 *   - assemble 签名泛型化为 `RecognizedBlock<string>[]`（兼容 IAssembler 接口）
 *   - 传入 getScopeId 回调：从 SubgraphOpenBlock/SubgraphCloseBlock 提取 subgraphId
 *
 * 边归属：由 ConverterRegistry.serialize DFS 已正确处理（edgesBySubgraph 分组），
 *   Assembler 不重新判断，仅按 block 顺序拼接。
 *
 * 程序错误不可包容：栈未归零（subgraph 未关闭）或 scopeId 不匹配时由 baseAssembler 抛出错误。
 *
 * 模块边界：仅依赖 ./types.js、./base-assembler.js、../recognizer/types.js，不引用 React/DOM。
 */

import type {
  RecognizedBlock,
  SubgraphCloseBlock,
  SubgraphOpenBlock,
} from '../recognizer/types.js';
import type { AssembleUserOptions, IAssembler } from './types.js';
import { assembleBlocks } from './base-assembler.js';

/** flowchart 嵌套边界 BlockType */
const FLOWCHART_OPEN_BLOCK_TYPE = 'subgraph-open';
const FLOWCHART_CLOSE_BLOCK_TYPE = 'subgraph-close';

/**
 * 从 flowchart openBlock/closeBlock 提取 scopeId（subgraphId）
 *
 * 类型断言安全：仅当 block.type === 'subgraph-open' 或 'subgraph-close' 时调用，
 * 对应 SubgraphOpenBlock / SubgraphCloseBlock，两者均有 subgraphId: string 必填字段。
 * 返回类型为 string（非 undefined），与 AssembleInternalOptions.getScopeId 签名一致。
 */
function getFlowchartScopeId(block: RecognizedBlock<string>): string {
  return (block as SubgraphOpenBlock | SubgraphCloseBlock).subgraphId;
}

export class FlowchartAssembler implements IAssembler {
  /**
   * 组装 blocks 为代码字符串
   *
   * @param blocks - RecognizedBlock 数组（由 ConverterRegistry.serialize 产出，含正确 indent + rawText）
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
      openBlockType: FLOWCHART_OPEN_BLOCK_TYPE,
      closeBlockType: FLOWCHART_CLOSE_BLOCK_TYPE,
      getScopeId: getFlowchartScopeId,
    });
  }
}
