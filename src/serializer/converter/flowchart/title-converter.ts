/**
 * TitleConverter — TitleBlock/AccTitleBlock/AccDescriptionBlock 3 种全局指令型 Block 转换器
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4
 *
 * 数据流（全部仅 parse 方向，ISideEffectBlockConverter）：
 *   - TitleConverter.parseBlock: metadataCollector.setTitle → metadata.title
 *   - AccTitleConverter.parseBlock: metadataCollector.setAccTitle → metadata.accTitle
 *   - AccDescriptionConverter.parseBlock: metadataCollector.setAccDescription → metadata.accDescription
 *
 * serialize 方向：由 ConverterRegistry.serialize 扫描 metadata 产出 block
 *
 * 字段映射：
 *   - TitleBlock.title → metadata.title
 *   - AccTitleBlock.accTitle → metadata.accTitle
 *   - AccDescriptionBlock.accDescription → metadata.accDescription
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js，不引用 React/DOM。
 */

import type {
  AccDescriptionBlock,
  AccTitleBlock,
  TitleBlock,
} from '../../recognizer/types.js';
import type {
  ConverterContext,
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// 1. TitleConverter — title → metadata.title
// ============================================================

/**
 * TitleBlock 副作用型转换器（仅 parse 方向）
 *
 * parse 时调用 metadataCollector.setTitle 累积到 metadata.title（覆盖式）。
 * 对齐 flow-db.ts setDiagramTitle 行为。
 */
export class TitleConverter implements ISideEffectBlockConverter<TitleBlock, ConverterContext> {
  parseBlock(block: TitleBlock, context: ConverterContext): void {
    context.metadataCollector.setTitle(block.title);
  }
}

// ============================================================
// 2. AccTitleConverter — accTitle → metadata.accTitle
// ============================================================

/**
 * AccTitleBlock 副作用型转换器（仅 parse 方向）
 *
 * parse 时调用 metadataCollector.setAccTitle 累积到 metadata.accTitle（覆盖式）。
 * 对齐 flow-db.ts setAccTitle 行为。
 */
export class AccTitleConverter
  implements ISideEffectBlockConverter<AccTitleBlock, ConverterContext>
{
  parseBlock(block: AccTitleBlock, context: ConverterContext): void {
    context.metadataCollector.setAccTitle(block.accTitle);
  }
}

// ============================================================
// 3. AccDescriptionConverter — accDescription → metadata.accDescription
// ============================================================

/**
 * AccDescriptionBlock 副作用型转换器（仅 parse 方向）
 *
 * parse 时调用 metadataCollector.setAccDescription 累积到 metadata.accDescription（覆盖式）。
 * 对齐 flow-db.ts setAccDescription 行为。
 */
export class AccDescriptionConverter
  implements ISideEffectBlockConverter<AccDescriptionBlock, ConverterContext>
{
  parseBlock(block: AccDescriptionBlock, context: ConverterContext): void {
    context.metadataCollector.setAccDescription(block.accDescription);
  }
}
