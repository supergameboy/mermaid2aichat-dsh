/**
 * ClickConverter — ClassClickBlock 副作用型转换器（仅 parse 方向）
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-8
 *
 * 决策15（对齐 flowchart）：仅 metadata 累积路径
 *   - ClickConverter 仅调用 metadataCollector.addClickEvent 累积到 classClickEvents/classTooltips
 *   - 不调用 ctx.updateNode 设置节点字段（消除数据冗余，单一数据源）
 *   - 节点字段由渲染层从 metadata 读取
 *
 * 数据流：
 *   parse 方向：ClassClickBlock → ClassClickEvent → metadataCollector.addClickEvent
 *     - 构造 ClassClickEvent（承载所有字段：classId/functionName/functionArgs/link/linkTarget/tooltip）
 *     - metadataCollector.addClickEvent 实现内部根据字段非空情况累积到 classClickEvents 和 classTooltips
 *   serialize 方向：由 Registry 的 7 步扫描统一处理（从 metadata.classClickEvents 产出 ClassClickBlock）
 *
 * 与 flowchart ClickConverter 的差异：
 *   - Block 类型：ClassClickBlock（字段 classId）vs flowchart ClickBlock（字段 nodeId）
 *   - Event 类型：ClassClickEvent（字段 classId）vs FlowClickEvent（字段 nodeId）
 *   - 其余字段完全对齐：functionName/functionArgs/link/linkTarget/tooltip
 *
 * ClassClickBlock 来源（ClassRecognizerCollector 的 3 个方法产出）：
 *   - setLink(classId, linkStr, target) → ClassClickBlock{link, linkTarget}
 *   - setTooltip(classId, tooltip) → ClassClickBlock{tooltip}
 *   - setClickEvent(classId, functionName, functionArgs) → ClassClickBlock{functionName, functionArgs}
 *
 * 单条 click 语句可能触发多个 yy 调用，产生多个 ClassClickBlock（每个只填部分字段）。
 * Converter 处理时每个 ClassClickBlock 独立构造 ClassClickEvent 调用 addClickEvent，
 * 渲染层按 classId merge 多条 ClassClickEvent。
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js，不引用 React/DOM。
 */

import type { ClassClickEvent } from '../../types.js';
import type { ClassClickBlock } from '../../recognizer/types.js';
import type { ClassConverterContext } from './types.js';
import type { ISideEffectBlockConverter } from '../types.js';

// ============================================================
// ClickConverter 实现
// ============================================================

/**
 * ClassClickBlock 副作用型转换器（仅 parse 方向，决策15：仅 metadata 累积）
 *
 * parse 时构造 ClassClickEvent 调用 metadataCollector.addClickEvent。
 * ClassClickEvent 承载所有 click 语义字段（functionName/functionArgs/link/linkTarget/tooltip），
 * addClickEvent 实现内部根据字段非空情况分别累积到 classClickEvents 和 classTooltips。
 */
export class ClickConverter
  implements ISideEffectBlockConverter<ClassClickBlock, ClassConverterContext>
{
  parseBlock(block: ClassClickBlock, context: ClassConverterContext): void {
    const event: ClassClickEvent = {
      classId: block.classId,
      ...(block.functionName !== undefined ? { functionName: block.functionName } : {}),
      ...(block.functionArgs !== undefined ? { functionArgs: block.functionArgs } : {}),
      ...(block.link !== undefined ? { link: block.link } : {}),
      ...(block.linkTarget !== undefined ? { linkTarget: block.linkTarget } : {}),
      ...(block.tooltip !== undefined ? { tooltip: block.tooltip } : {}),
    };
    context.metadataCollector.addClickEvent(event);
  }
}
