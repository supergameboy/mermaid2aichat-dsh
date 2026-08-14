/**
 * DirectionConverter — ClassDirectionBlock 副作用型转换器
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-8（[一-6-补] 修订：顶层 direction 由 Converter 产出 DirectionBlock）
 *
 * 数据流（仅 parse 方向，ISideEffectBlockConverter）：
 *   - DirectionConverter.parseBlock: metadataCollector.setDirection(block.dir)
 *
 * direction 字段单一数据源（架构缺陷修复，设计点6 + [一-6-补] 修订）：
 *   - parse 时只写 metadata.direction
 *   - buildCanvas 阶段同步到顶层 canvas.direction（metadata 为权威，顶层为镜像）
 *   - serialize 时从顶层读取，Converter 在全局指令步骤产出顶层 DirectionBlock（rawText=`direction ${direction}`，indent=0）
 *   - classDiagram header 是固定字符串 `classDiagram`（无 direction 后缀），顶层 direction 必须作为独立 DirectionBlock 产出
 *   - 与 flowchart 不同（flowchart header 含 direction，Converter 不产出顶层 DirectionBlock）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、./types.js、../types.js，不引用 React/DOM。
 */

import type { ClassDirectionBlock } from '../../recognizer/types.js';
import type {
  ClassConverterContext,
} from './types.js';
import type {
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// DirectionConverter 实现（副作用型，设置 metadata.direction）
// ============================================================

/**
 * ClassDirectionBlock 副作用型转换器
 *
 * parse 方向：调 metadataCollector.setDirection，累积到 metadata.direction
 * buildCanvas 阶段同步到顶层 canvas.direction（单一数据源修复）
 */
export class DirectionConverter
  implements ISideEffectBlockConverter<ClassDirectionBlock, ClassConverterContext>
{
  parseBlock(block: ClassDirectionBlock, context: ClassConverterContext): void {
    context.metadataCollector.setDirection(block.dir);
  }
}
