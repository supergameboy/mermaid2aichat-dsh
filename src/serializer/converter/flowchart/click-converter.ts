/**
 * ClickConverter — ClickBlock 副作用型转换器（仅 parse 方向）
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4
 *
 * 决策15：仅 metadata 累积路径
 *   - ClickConverter 仅调用 metadataCollector.addClickEvent 累积到 flowClickEvents/flowTooltips
 *   - 不再调用 ctx.updateNode 设置节点字段（tooltip/clickUrl/clickCallback/linkTarget/haveCallback）
 *   - 节点字段由渲染层从 metadata 读取（消除数据冗余，单一数据源）
 *
 * 数据流：
 *   parse 方向：ClickBlock → FlowClickEvent → metadataCollector.addClickEvent
 *     - 构造 FlowClickEvent（承载所有字段：nodeId/functionName/functionArgs/link/linkTarget/tooltip）
 *     - metadataCollector.addClickEvent 实现内部根据字段非空情况累积到 flowClickEvents 和 flowTooltips
 *   serialize 方向：由 ConverterRegistry.serialize 扫描 metadata.flowClickEvents 产出 ClickBlock
 *
 * ClickBlock 来源（RecognizerCollector 的 3 个方法产出）：
 *   - setLink(ids, linkStr, target) → ClickBlock{link, linkTarget}
 *   - setTooltip(ids, tooltip) → ClickBlock{tooltip}
 *   - setClickEvent(ids, functionName, functionArgs) → ClickBlock{functionName, functionArgs}
 *
 * 单条 click 语句可能触发多个 yy 调用，产生多个 ClickBlock（每个只填部分字段）。
 * Converter 处理时每个 ClickBlock 独立构造 FlowClickEvent 调用 addClickEvent，
 * 渲染层按 nodeId merge 多条 FlowClickEvent。
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../ast/flowchart-ast.js、../types.js，不引用 React/DOM。
 */

import type { FlowClickEvent } from '../../ast/flowchart-ast.js';
import type { ClickBlock } from '../../recognizer/types.js';
import type {
  ConverterContext,
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// ClickConverter 实现
// ============================================================

/**
 * ClickBlock 副作用型转换器（仅 parse 方向，决策15：仅 metadata 累积）
 *
 * parse 时构造 FlowClickEvent 调用 metadataCollector.addClickEvent。
 * FlowClickEvent 承载所有 click 语义字段（functionName/functionArgs/link/linkTarget/tooltip），
 * addClickEvent 实现内部根据字段非空情况分别累积到 flowClickEvents 和 flowTooltips。
 */
export class ClickConverter implements ISideEffectBlockConverter<ClickBlock, ConverterContext> {
  parseBlock(block: ClickBlock, context: ConverterContext): void {
    const event: FlowClickEvent = {
      nodeId: block.nodeId,
      ...(block.functionName !== undefined ? { functionName: block.functionName } : {}),
      ...(block.functionArgs !== undefined ? { functionArgs: block.functionArgs } : {}),
      ...(block.link !== undefined ? { link: block.link } : {}),
      ...(block.linkTarget !== undefined ? { linkTarget: block.linkTarget } : {}),
      ...(block.tooltip !== undefined ? { tooltip: block.tooltip } : {}),
    };
    context.metadataCollector.addClickEvent(event);
  }
}
