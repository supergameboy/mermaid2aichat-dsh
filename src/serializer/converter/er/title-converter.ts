/**
 * ErAccTitleConverter / ErAccDescriptionConverter
 * — ErAccTitleBlock / ErAccDescriptionBlock 副作用型转换器
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块2-转换器.md
 * 阶段：模块2 L2-9
 *
 * 数据流（仅 parse 方向，ISideEffectBlockConverter）：
 *   - ErAccTitleConverter.parseBlock: metadataCollector.setAccTitle(block.accTitle)
 *   - ErAccDescriptionConverter.parseBlock: metadataCollector.setAccDescription(block.accDescription)
 *
 * serialize 方向：由 ErConverterRegistry 的 7 步扫描统一处理
 *   - 从 metadata.accTitle 产出 ErAccTitleBlock（若非空）
 *   - 从 metadata.accDescription 产出 ErAccDescriptionBlock（若非空）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、./types.js、../types.js，不引用 React/DOM。
 */

import type {
  ErAccDescriptionBlock,
  ErAccTitleBlock,
} from '../../recognizer/types.js';
import type { ErConverterContext } from './types.js';
import type {
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// ErAccTitleConverter 实现（副作用型，设置 metadata.accTitle）
// ============================================================

/**
 * ErAccTitleBlock 副作用型转换器
 *
 * parse 方向：调 metadataCollector.setAccTitle，累积到 metadata.accTitle
 */
export class ErAccTitleConverter
  implements ISideEffectBlockConverter<ErAccTitleBlock, ErConverterContext>
{
  parseBlock(block: ErAccTitleBlock, context: ErConverterContext): void {
    context.metadataCollector.setAccTitle(block.accTitle);
  }
}

// ============================================================
// ErAccDescriptionConverter 实现（副作用型，设置 metadata.accDescription）
// ============================================================

/**
 * ErAccDescriptionBlock 副作用型转换器
 *
 * parse 方向：调 metadataCollector.setAccDescription，累积到 metadata.accDescription
 */
export class ErAccDescriptionConverter
  implements ISideEffectBlockConverter<ErAccDescriptionBlock, ErConverterContext>
{
  parseBlock(block: ErAccDescriptionBlock, context: ErConverterContext): void {
    context.metadataCollector.setAccDescription(block.accDescription);
  }
}
