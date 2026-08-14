/**
 * AccTitleConverter / AccDescriptionConverter
 * — ClassAccTitleBlock / ClassAccDescriptionBlock 副作用型转换器
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-8
 *
 * 数据流（仅 parse 方向，ISideEffectBlockConverter）：
 *   - AccTitleConverter.parseBlock: metadataCollector.setAccTitle(block.accTitle)
 *   - AccDescriptionConverter.parseBlock: metadataCollector.setAccDescription(block.accDescription)
 *
 * serialize 方向：由 Registry 的 7 步扫描统一处理
 *   - 从 metadata.accTitle 产出 ClassAccTitleBlock（若非空）
 *   - 从 metadata.accDescription 产出 ClassAccDescriptionBlock（若非空）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、./types.js、../types.js，不引用 React/DOM。
 */

import type {
  ClassAccDescriptionBlock,
  ClassAccTitleBlock,
} from '../../recognizer/types.js';
import type {
  ClassConverterContext,
} from './types.js';
import type {
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// AccTitleConverter 实现（副作用型，设置 metadata.accTitle）
// ============================================================

/**
 * ClassAccTitleBlock 副作用型转换器
 *
 * parse 方向：调 metadataCollector.setAccTitle，累积到 metadata.accTitle
 */
export class AccTitleConverter
  implements ISideEffectBlockConverter<ClassAccTitleBlock, ClassConverterContext>
{
  parseBlock(block: ClassAccTitleBlock, context: ClassConverterContext): void {
    context.metadataCollector.setAccTitle(block.accTitle);
  }
}

// ============================================================
// AccDescriptionConverter 实现（副作用型，设置 metadata.accDescription）
// ============================================================

/**
 * ClassAccDescriptionBlock 副作用型转换器
 *
 * parse 方向：调 metadataCollector.setAccDescription，累积到 metadata.accDescription
 */
export class AccDescriptionConverter
  implements ISideEffectBlockConverter<ClassAccDescriptionBlock, ClassConverterContext>
{
  parseBlock(block: ClassAccDescriptionBlock, context: ClassConverterContext): void {
    context.metadataCollector.setAccDescription(block.accDescription);
  }
}
