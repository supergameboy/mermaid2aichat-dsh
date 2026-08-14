/**
 * ErClassApplyConverter / ErStyleConverter / ErClassDefConverter
 * — class-apply / style / classDef 3 种副作用型 Converter + mergeErNodeStyles 后处理
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块2-转换器.md
 * 阶段：模块2 L2-8
 *
 * 数据流（全部仅 parse 方向，ISideEffectBlockConverter）：
 *   - ErClassApplyConverter.parseBlock:
 *       对每个 id 调 ctx.updateNode 追加 classNames（去重，过滤 'default'）
 *       + metadataCollector.addErClassApply({ids, classNames})（保留原始分组供 serialize 还原）
 *   - ErStyleConverter.parseBlock:
 *       对每个 id 调 ctx.updateNode 追加 data.styles
 *       不构建 data.style（由 buildCanvas 阶段 mergeErNodeStyles 统一构建）
 *   - ErClassDefConverter.parseBlock:
 *       metadataCollector.addErClass({id, styles, textStyles}) 累积到 metadata.erClasses
 *
 * serialize 方向：由 ErConverterRegistry 的 7 步扫描统一处理
 *   - class-apply：从 metadata.erClassApplyClasses 产出 ErClassApplyBlock[]（保留原始多目标多类名分组）
 *   - style：扫描 node.data.styles 产出 ErStyleBlock[]（按节点聚合）
 *   - classDef：从 metadata.erClasses 产出 ErClassDefBlock[]
 *
 * 双存储设计说明（node.data.classNames + metadata.erClassApplyClasses）：
 *   - node.data.classNames：每节点存储已应用类名（渲染层 + 内联类名合并用），按节点查询
 *   - metadata.erClassApplyClasses：每语句存储原始分组（serialize 还原用），保留多目标多类名分组
 *   - 两者非冗余：前者支持渲染层 O(1) 查询节点样式，后者支持 serialize 还原原始语句分组
 *   - 与 flowchart 单一数据源差异：flowchart class-apply 仅支持单类名（class A,B className），
 *     可从 node.data.classNames 反推分组；ER 支持多类名（class A,B c1,c2），无法反推原始分组，
 *     必须独立存储 ErClassApplyInfo
 *
 * mergeErNodeStyles（buildCanvas 阶段后处理）：
 *   - 合并 node.data.cssCompiledStyles[] + node.data.styles[] → node.data.style（NodeStyle 对象）
 *   - cssCompiledStyles 是模块1 前置计算的 classDef 编译样式（无需查 erClasses 重新计算）
 *   - data.styles 是 ErStyleConverter 追加的内联样式（覆盖 cssCompiledStyles）
 *   - 复用 flowchart/style-converter.ts 的 parseStylesToNodeStyle（纯函数，无副作用）
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、./types.js、../types.js、
 *   ../flowchart/style-converter.js（复用 parseStylesToNodeStyle），不引用 React/DOM。
 */

import type {
  ErClassApplyInfo,
  ErClassInfo,
  MermaidNode,
  NodeStyle,
} from '../../types.js';
import type {
  ErClassApplyBlock,
  ErClassDefBlock,
  ErStyleBlock,
} from '../../recognizer/types.js';
import type { ErConverterContext } from './types.js';
import type {
  ISideEffectBlockConverter,
} from '../types.js';
import { parseStylesToNodeStyle } from '../flowchart/style-converter.js';

// ============================================================
// ErClassApplyConverter 实现（副作用型，追加 classNames + 累积 apply 信息）
// ============================================================

/**
 * ErClassApplyBlock 副作用型转换器
 *
 * parse 方向：
 *   1. 对每个 id 调 ctx.updateNode，将 block.classNames 追加到 data.classNames（去重，过滤 'default'）
 *   2. metadataCollector.addErClassApply({ids, classNames})（保留原始分组供 serialize 还原）
 *
 * ER class-apply 语法支持多目标多类名：
 *   `class A,B c1,c2` → A 和 B 都应用 c1 和 c2
 *
 * 'default' 类过滤：'default' 是 ErDB 的隐式基类，显式应用为 no-op，
 * 对齐 entity-converter.cssClasses 的 'default' 过滤行为。
 */
export class ErClassApplyConverter
  implements ISideEffectBlockConverter<ErClassApplyBlock, ErConverterContext>
{
  parseBlock(block: ErClassApplyBlock, context: ErConverterContext): void {
    // 过滤 'default' 类（对齐 entity-converter 行为）
    const filteredClassNames = block.classNames.filter((cn) => cn !== 'default');

    // 1. 对每个 id 追加 classNames（去重）
    for (const id of block.ids) {
      context.updateNode(id, (node) => {
        const existing = (node.data.classNames as string[] | undefined) ?? [];
        const merged = [...existing];
        for (const cn of filteredClassNames) {
          if (!merged.includes(cn)) {
            merged.push(cn);
          }
        }
        node.data.classNames = merged;
      });
    }

    // 2. 累积到 metadata.erClassApplyClasses（保留原始分组，serialize 还原用）
    //    仅存储过滤后的非空 classNames（避免 serialize 输出 `class A,B` 空语句）
    if (filteredClassNames.length > 0) {
      const applyInfo: ErClassApplyInfo = {
        ids: [...block.ids],
        classNames: filteredClassNames,
      };
      context.metadataCollector.addErClassApply(applyInfo);
    }
  }
}

// ============================================================
// ErStyleConverter 实现（副作用型，追加 data.styles）
// ============================================================

/**
 * ErStyleBlock 副作用型转换器
 *
 * parse 方向：对每个 id 调 ctx.updateNode，将 block.styles 追加到 data.styles
 *
 * 不构建 data.style（由 buildCanvas 阶段 mergeErNodeStyles 统一构建），
 * 对齐 flowchart/class StyleConverter 的延迟合并策略。
 *
 * ER style 语法支持多目标：
 *   `style A,B fill:#f00,stroke:#333` → A 和 B 都应用这些样式
 */
export class ErStyleConverter
  implements ISideEffectBlockConverter<ErStyleBlock, ErConverterContext>
{
  parseBlock(block: ErStyleBlock, context: ErConverterContext): void {
    for (const id of block.ids) {
      context.updateNode(id, (node) => {
        const existing = (node.data.styles as string[] | undefined) ?? [];
        // 追加 styles（不去重，对齐 flowchart StyleConverter 行为）
        node.data.styles = [...existing, ...block.styles];
      });
    }
  }
}

// ============================================================
// ErClassDefConverter 实现（副作用型，累积到 metadata.erClasses）
// ============================================================

/**
 * ErClassDefBlock 副作用型转换器
 *
 * parse 方向：metadataCollector.addErClass({id, styles, textStyles})
 * 累积到 metadata.erClasses（ErClassInfo[]）
 *
 * ER classDef 语法：
 *   `classDef className style1,style2` → 定义可复用的 CSS 类
 */
export class ErClassDefConverter
  implements ISideEffectBlockConverter<ErClassDefBlock, ErConverterContext>
{
  parseBlock(block: ErClassDefBlock, context: ErConverterContext): void {
    const classInfo: ErClassInfo = {
      id: block.className,
      styles: [...block.styles],
      textStyles: [...block.textStyles],
    };
    context.metadataCollector.addErClass(classInfo);
  }
}

// ============================================================
// mergeErNodeStyles — buildCanvas 阶段后处理（合并样式到 data.style）
// ============================================================

/**
 * 合并 cssCompiledStyles + data.styles 到节点的 data.style
 *
 * 合并优先级（对齐老 er-parser.ts mapAstToCanvasState 的 allStyles 逻辑）：
 *   1. 先合并 cssCompiledStyles（模块1 前置计算的 classDef 编译样式）
 *   2. 再合并 data.styles（ErStyleConverter 追加的内联样式，覆盖 classDef）
 *
 * 与 flowchart mergeNodeStyles 的差异：
 *   - flowchart 需要 flowClassDefs 参数查表计算 classDef 样式（classDef 未前置编译）
 *   - ER 的 cssCompiledStyles 已由模块1 前置编译，无需查表，直接 parseStylesToNodeStyle
 *
 * 该函数在 ErConverterRegistry.buildCanvas 阶段调用（post-process），
 * 构建 data.style NodeStyle 对象供渲染层（模块4）和编辑器（模块5）消费。
 *
 * @param node - 待合并样式的节点（mutate node.data.style）
 */
export function mergeErNodeStyles(node: MermaidNode): void {
  const mergedStyle: NodeStyle = {};
  let hasAnyStyle = false;

  // 1. 先合并 cssCompiledStyles（classDef 编译样式，模块1 前置计算）
  const cssCompiledStyles = node.data.cssCompiledStyles as string[] | undefined;
  if (cssCompiledStyles !== undefined && cssCompiledStyles.length > 0) {
    const compiledStyle = parseStylesToNodeStyle(cssCompiledStyles);
    if (compiledStyle !== undefined) {
      Object.assign(mergedStyle, compiledStyle);
      hasAnyStyle = true;
    }
  }

  // 2. 再合并 data.styles（内联样式，覆盖 classDef 编译样式）
  const directStyles = node.data.styles as string[] | undefined;
  if (directStyles !== undefined && directStyles.length > 0) {
    const directStyle = parseStylesToNodeStyle(directStyles);
    if (directStyle !== undefined) {
      Object.assign(mergedStyle, directStyle);
      hasAnyStyle = true;
    }
  }

  if (hasAnyStyle) {
    node.data.style = mergedStyle;
  }
}
