/**
 * DirectionConverter — DirectionBlock 副作用型转换器（仅 parse 方向）
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4
 *
 * 数据流：
 *   parse 方向：DirectionBlock → metadataCollector.setDirection → metadata.direction
 *   serialize 方向：由 ConverterRegistry.serialize 扫描 metadata.direction 产出 DirectionBlock
 *
 * 字段映射：
 *   - DirectionBlock.dir → metadataCollector.setDirection(dir) → metadata.direction
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js、../types.js，不引用 React/DOM。
 */

import type { FlowchartDirection } from '../../types.js';
import type { DirectionBlock } from '../../recognizer/types.js';
import type {
  ConverterContext,
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// DirectionConverter 实现
// ============================================================

/**
 * DirectionBlock 副作用型转换器（仅 parse 方向）
 *
 * parse 时调用 metadataCollector.setDirection 累积到 metadata.direction。
 * 对齐 flow-db.ts setDirection 行为：direction 语句设置图表方向（覆盖式）。
 */
export class DirectionConverter
  implements ISideEffectBlockConverter<DirectionBlock, ConverterContext>
{
  parseBlock(block: DirectionBlock, context: ConverterContext): void {
    const dir: FlowchartDirection = block.dir;
    context.metadataCollector.setDirection(dir);
  }
}
