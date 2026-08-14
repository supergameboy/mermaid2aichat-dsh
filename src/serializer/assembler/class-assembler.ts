/**
 * ClassAssembler — classDiagram 装配器（M3 重构 L2-4 新增）
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块3-装配器.md
 * 阶段：M3 重构 L2-4（ClassAssembler 新增，调用 baseAssembler.assembleBlocks）
 *
 * 数据流（serialize 方向）：
 *   RecognizedBlock<string>[] → 代码字符串
 *     内部委托 baseAssembler.assembleBlocks 处理：
 *     - namespace-open → stack.push + 输出 indent + rawText
 *     - namespace-close → stack.pop（LIFO 校验 scopeId）+ 输出 indent + rawText
 *     - 其他 block（class/relation/note/class-apply/style/classDef/click/direction/accTitle/accDescription）
 *       → 输出 indent + rawText
 *
 * 设计决策（M3 方案B）：
 *   - 调用 baseAssembler.assembleBlocks 零代码重复（与 FlowchartAssembler 共用通用拼装逻辑）
 *   - 无特化逻辑（class Block 与 flowchart Block 都继承自 RecognizedBlock 基接口，含 rawText/indent）
 *   - 复用 ContextStack LIFO 校验（namespace 嵌套配对校验）
 *
 * M3 重构 L2-4（验证后修订 [一-7][一-8-补]）：
 *   - assemble 签名 `RecognizedBlock<string>[]`（兼容 IAssembler 接口，ClassRecognizedBlock 是子类型）
 *   - 传入 getScopeId 回调：从 NamespaceOpenBlock/NamespaceCloseBlock 提取 namespaceId
 *
 * 程序错误不可包容：栈未归零（namespace 未关闭）或 scopeId 不匹配时由 baseAssembler 抛出错误。
 *
 * 模块边界：仅依赖 ./types.js、./base-assembler.js、../recognizer/types.js，不引用 React/DOM。
 */

import type {
  NamespaceCloseBlock,
  NamespaceOpenBlock,
  RecognizedBlock,
} from '../recognizer/types.js';
import type { AssembleUserOptions, IAssembler } from './types.js';
import { assembleBlocks } from './base-assembler.js';

/** classDiagram 嵌套边界 BlockType */
const CLASS_OPEN_BLOCK_TYPE = 'namespace-open';
const CLASS_CLOSE_BLOCK_TYPE = 'namespace-close';

/**
 * 从 classDiagram openBlock/closeBlock 提取 scopeId（namespaceId）
 *
 * 类型断言安全：仅当 block.type === 'namespace-open' 或 'namespace-close' 时调用，
 * 对应 NamespaceOpenBlock / NamespaceCloseBlock，两者均有 namespaceId: string 必填字段。
 * 返回类型为 string（非 undefined），与 AssembleInternalOptions.getScopeId 签名一致。
 */
function getClassScopeId(block: RecognizedBlock<string>): string {
  return (block as NamespaceOpenBlock | NamespaceCloseBlock).namespaceId;
}

export class ClassAssembler implements IAssembler {
  /**
   * 组装 blocks 为 classDiagram 代码字符串
   *
   * @param blocks - RecognizedBlock 数组（由 ClassConverterRegistry.serialize 产出，含正确 indent + rawText）
   * @param options - 用户面向组装选项（仅 preserveIndent；openBlockType/closeBlockType/getScopeId 由本类固定）
   * @returns 代码字符串（不含 header，header 由入口函数 assemble() 生成）
   * @throws Error 当 namespace-open/close 不配对或 scopeId 不匹配时（由 baseAssembler 抛出）
   */
  assemble(
    blocks: readonly RecognizedBlock<string>[],
    options?: AssembleUserOptions,
  ): string {
    return assembleBlocks(blocks, {
      preserveIndent: options?.preserveIndent,
      openBlockType: CLASS_OPEN_BLOCK_TYPE,
      closeBlockType: CLASS_CLOSE_BLOCK_TYPE,
      getScopeId: getClassScopeId,
    });
  }
}
