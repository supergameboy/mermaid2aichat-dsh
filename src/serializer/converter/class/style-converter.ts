/**
 * ClassApplyConverter / StyleConverter / ClassDefConverter
 * — class-apply / style / classDef 3 种副作用型 Converter
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-7
 *
 * 数据流（全部仅 parse 方向，ISideEffectBlockConverter）：
 *   - ClassApplyConverter.parseBlock:
 *       对每个 classId 调 ctx.updateNode 追加 classNames（去重）
 *       （单一数据源：apply 映射只在 node.data.classNames，不存 metadata.classStyleClasses）
 *   - StyleConverter.parseBlock:
 *       ctx.updateNode(classId, mutate 追加 data.styles)
 *       不构建 data.style（由 buildCanvas 阶段 mergeNodeStyles 统一构建，对齐 flowchart 决策17）
 *   - ClassDefConverter.parseBlock:
 *       metadataCollector.addClassDef({className, styles, textStyles})
 *
 * serialize 方向：由 Registry 的 7 步扫描统一处理
 *   - class-apply：扫描 node.data.classNames 产出 ClassCssApplyBlock[]
 *   - style：扫描 node.data.styles 产出 ClassStyleBlock[]
 *   - classDef：从 metadata.classDefs 产出 ClassCssDefBlock[]
 *
 * 设计偏差修订（M3 实现期）：
 *   - 原设计的 addClassStyleClass/getClassStyleClasses 已从 ClassMetadataCollector 移除
 *   - 原因：apply 映射（classId → classNames）只在 node.data.classNames 中（单一数据源），
 *     重复存储到 metadata 违反 institution.md 第1.1条单一数据源原则
 *   - serialize 方向直接扫描 node.data.classNames 产出 ClassCssApplyBlock（对齐 flowchart serializeClassApplyBlocks）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js，不引用 React/DOM。
 */

import type {
  ClassDefInfo,
} from '../../types.js';
import type {
  ClassCssApplyBlock,
  ClassCssDefBlock,
  ClassStyleBlock,
} from '../../recognizer/types.js';
import type {
  ClassConverterContext,
} from './types.js';
import type {
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// ClassApplyConverter 实现（副作用型，累积 classNames）
// ============================================================

/**
 * ClassCssApplyBlock 副作用型转换器
 *
 * parse 方向：对每个 classId 调 ctx.updateNode 追加 className 到 data.classNames（去重）
 *
 * 单一数据源：apply 映射只在 node.data.classNames，不存 metadata（设计偏差修订）
 */
export class ClassApplyConverter
  implements ISideEffectBlockConverter<ClassCssApplyBlock, ClassConverterContext>
{
  parseBlock(block: ClassCssApplyBlock, context: ClassConverterContext): void {
    for (const classId of block.classIds) {
      context.updateNode(classId, (node) => {
        const existing = (node.data.classNames as string[] | undefined) ?? [];
        if (!existing.includes(block.className)) {
          node.data.classNames = [...existing, block.className];
        }
      });
    }
  }
}

// ============================================================
// StyleConverter 实现（副作用型，追加 data.styles）
// ============================================================

/**
 * ClassStyleBlock 副作用型转换器
 *
 * parse 方向：ctx.updateNode(classId, mutate 追加 data.styles)
 * 不构建 data.style（由 buildCanvas 阶段 mergeNodeStyles 统一构建，对齐 flowchart 决策17）
 */
export class StyleConverter
  implements ISideEffectBlockConverter<ClassStyleBlock, ClassConverterContext>
{
  parseBlock(block: ClassStyleBlock, context: ClassConverterContext): void {
    context.updateNode(block.classId, (node) => {
      const existing = (node.data.styles as string[] | undefined) ?? [];
      // 追加 styles（不去重，对齐 flowchart StyleConverter 行为）
      node.data.styles = [...existing, ...block.styles];
    });
  }
}

// ============================================================
// ClassDefConverter 实现（副作用型，累积到 metadata.classDefs）
// ============================================================

/**
 * ClassCssDefBlock 副作用型转换器
 *
 * parse 方向：metadataCollector.addClassDef({className, styles, textStyles})
 * 累积到 metadata.classDefs（ClassDefInfo[]）
 */
export class ClassDefConverter
  implements ISideEffectBlockConverter<ClassCssDefBlock, ClassConverterContext>
{
  parseBlock(block: ClassCssDefBlock, context: ClassConverterContext): void {
    const classDef: ClassDefInfo = {
      className: block.className,
      styles: [...block.styles],
      textStyles: [...block.textStyles],
    };
    context.metadataCollector.addClassDef(classDef);
  }
}
