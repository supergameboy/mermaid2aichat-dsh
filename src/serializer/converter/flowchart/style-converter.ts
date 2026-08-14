/**
 * StyleConverter — ClassDef/ClassApply/Style/LinkStyle 4 种指令型 Block 转换器
 *
 * 设计文档：docs/design/modular-recognizer-converter-assembler.md
 * 阶段：Stage 4
 *
 * 数据流（全部仅 parse 方向，ISideEffectBlockConverter）：
 *   - ClassDefConverter.parseBlock: metadataCollector.addClassDef → metadata.flowClassDefs
 *   - ClassApplyConverter.parseBlock: ctx.updateNode 追加 classNames
 *   - StyleConverter.parseBlock: ctx.updateNode 追加 styles
 *   - LinkStyleConverter.parseBlock:
 *       target.kind='indices' → ctx.updateEdgeByIndex 设置 styles/interpolate
 *       target.kind='default' → metadataCollector.setLinkStyleDefault(styles, interpolate)（决策16）
 *
 * serialize 方向：由 ConverterRegistry.serialize 扫描 canvas.nodes/edges/metadata 产出 block
 * （不在本文件实现，由 Registry 层统一扫描）
 *
 * 字段映射要点：
 *   - ClassDefBlock: className→FlowClassDefInfo.id, styles→styles, textStyles→textStyles
 *   - ClassApplyBlock: nodeIds→遍历 ctx.updateNode, className→追加到 data.classNames
 *   - StyleBlock: nodeIds→遍历 ctx.updateNode, styles→追加到 data.styles
 *   - LinkStyleBlock: target.kind 分流, styles→data.styles, interpolate→data.interpolate
 *
 * 决策16：setLinkStyleDefault 签名扩展为 (styles, interpolate?)，一次调用同时累积到
 * metadata.flowDefaultStyle + metadata.flowDefaultInterpolate。
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../types.js、../types.js，不引用 React/DOM。
 */

import type { FlowClassDefInfo, MermaidNode, NodeStyle } from '../../types.js';
import type {
  ClassApplyBlock,
  ClassDefBlock,
  LinkStyleBlock,
  StyleBlock,
} from '../../recognizer/types.js';
import type {
  ConverterContext,
  ISideEffectBlockConverter,
} from '../types.js';

// ============================================================
// 0. 样式字符串 → NodeStyle 对象（纯函数，parse 方向 post-process）
// ============================================================

/**
 * 将 style 语句的字符串数组解析为结构化 NodeStyle 对象
 *
 * style 语句格式: "fill:#e1f5fe", "stroke:#333", "stroke-width:2", "color:#fff", "font-size:12px"
 *
 * Bug5 修复（对齐老 flowchart-parser.ts parseStylesToNodeStyle）：
 *   不再过滤非 fill/stroke/stroke-width/color 属性，将所有 key:value 对保留，
 *   确保 classDef / inline style 的任意 CSS 属性在 parse-serialize 往返中不丢失。
 *
 * 设计意图：data.style 是 NodeStyle 对象（用于渲染层），data.styles 是字符串数组（用于序列化层）。
 * 两个字段都是 parse 方向的产物：StyleConverter.parseBlock 追加到 data.styles，
 * buildCanvas 阶段调用 mergeNodeStyles 统一构建 data.style（合并 classDef + direct styles）。
 *
 * @param styles - style 语句的字符串数组（如 ['fill:#f00', 'font-size:12px']）
 * @returns NodeStyle 对象，若 styles 为空返回 undefined
 */
export function parseStylesToNodeStyle(
  styles: readonly string[],
): NodeStyle | undefined {
  if (styles.length === 0) return undefined;
  const result: NodeStyle = {};
  for (const s of styles) {
    const colonIndex = s.indexOf(':');
    if (colonIndex === -1) continue;
    const key = s.substring(0, colonIndex).trim();
    const value = s.substring(colonIndex + 1).trim();
    switch (key) {
      case 'fill':
        result.fill = value;
        break;
      case 'stroke':
        result.stroke = value;
        break;
      case 'stroke-width':
      case 'strokeWidth': {
        // 优先解析为数值（渲染层期望 number）；带单位（如 '2px'）时同时保留原始字符串
        // 与索引签名共存：result.strokeWidth=2（number）+ result['stroke-width']='2px'（string）
        const num = Number(value);
        if (Number.isFinite(num)) {
          result.strokeWidth = num;
        } else {
          (result as Record<string, string | number | undefined>)[key] = value;
          const loose = Number(value.replace(/[^0-9.]/g, ''));
          if (Number.isFinite(loose)) {
            result.strokeWidth = loose;
          }
        }
        break;
      }
      case 'color':
        result.color = value;
        break;
      default:
        // 保留所有其他 CSS 属性（font-size, font-family 等）
        result[key] = value;
        break;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 合并 classDef 样式和直接 style 到节点的 data.style
 *
 * 合并优先级（对齐老 flowchart-parser.ts mapVertexToNode 的 mergedStyle 逻辑）：
 *   1. 先合并 classDef 样式（按 node.data.classNames 声明顺序，后声明的覆盖先声明的）
 *   2. 再合并直接 style（node.data.styles，覆盖 classDef）
 *
 * 该函数在 FlowchartConverterRegistry.buildCanvas 阶段调用（post-process），
 * 因为 ClassApplyConverter.parseBlock 时 metadata.flowClassDefs 可能还未填充（顺序依赖）。
 *
 * 不破坏 serialize 方向：serialize 仍从 data.styles 读取，data.style 仅用于渲染层和 round-trip 语义保留。
 *
 * @param node - 待合并样式的节点（mutate node.data.style）
 * @param flowClassDefs - classDef 定义列表（从 metadata.flowClassDefs 读取）
 */
export function mergeNodeStyles(
  node: MermaidNode,
  flowClassDefs: readonly FlowClassDefInfo[],
): void {
  const mergedStyle: NodeStyle = {};
  let hasAnyStyle = false;

  // 1. 先合并 classDef 样式（按 class 声明顺序，后声明的覆盖先声明的）
  const classNames = node.data.classNames;
  if (classNames !== undefined && classNames.length > 0) {
    for (const className of classNames) {
      const classDef = flowClassDefs.find((cd) => cd.id === className);
      if (classDef !== undefined) {
        const classStyle = parseStylesToNodeStyle(classDef.styles);
        if (classStyle !== undefined) {
          Object.assign(mergedStyle, classStyle);
          hasAnyStyle = true;
        }
      }
    }
  }

  // 2. 再合并直接 style（覆盖 classDef）
  const directStyles = node.data.styles;
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

// ============================================================
// 1. ClassDefConverter — classDef 定义 → metadata.flowClassDefs
// ============================================================

/**
 * ClassDefBlock 副作用型转换器
 *
 * parse 时：构造 FlowClassDefInfo 调用 metadataCollector.addClassDef
 * 累积到 metadata.flowClassDefs
 */
export class ClassDefConverter
  implements ISideEffectBlockConverter<ClassDefBlock, ConverterContext>
{
  parseBlock(block: ClassDefBlock, context: ConverterContext): void {
    const info: FlowClassDefInfo = {
      id: block.className,
      styles: [...block.styles],
      textStyles: [...block.textStyles],
    };
    context.metadataCollector.addClassDef(info);
  }
}

// ============================================================
// 2. ClassApplyConverter — class 应用 → ctx.updateNode(classNames)
// ============================================================

/**
 * ClassApplyBlock 副作用型转换器
 *
 * parse 时：对每个 nodeId 调用 ctx.updateNode，将 className 追加到 data.classNames（去重）
 *
 * 对齐 flow-db.ts setClass 行为：class 应用是追加而非覆盖，同一节点可应用多个 class。
 */
export class ClassApplyConverter
  implements ISideEffectBlockConverter<ClassApplyBlock, ConverterContext>
{
  parseBlock(block: ClassApplyBlock, context: ConverterContext): void {
    for (const nodeId of block.nodeIds) {
      context.updateNode(nodeId, (node) => {
        const existing = node.data.classNames ?? [];
        if (!existing.includes(block.className)) {
          node.data.classNames = [...existing, block.className];
        }
      });
    }
  }
}

// ============================================================
// 3. StyleConverter — 节点样式 → ctx.updateNode(styles)
// ============================================================

/**
 * StyleBlock 副作用型转换器
 *
 * parse 时：对每个 nodeId 调用 ctx.updateNode，将 styles 追加到 data.styles
 *
 * 对齐 flow-db.ts addVertex 行为：style 语句追加到 vertex.styles 数组（不覆盖）。
 * data.style NodeStyle 对象由 buildCanvas 阶段调用 mergeNodeStyles 统一构建
 * （合并 classDef + direct styles，避免 ClassApplyConverter 顺序依赖问题）。
 */
export class StyleConverter implements ISideEffectBlockConverter<StyleBlock, ConverterContext> {
  parseBlock(block: StyleBlock, context: ConverterContext): void {
    for (const nodeId of block.nodeIds) {
      context.updateNode(nodeId, (node) => {
        const existing = node.data.styles ?? [];
        node.data.styles = [...existing, ...block.styles];
      });
    }
  }
}

// ============================================================
// 4. LinkStyleConverter — 边样式 → ctx.updateEdgeByIndex/updateAllEdges + metadataCollector
// ============================================================

/**
 * LinkStyleBlock 副作用型转换器
 *
 * parse 时按 target.kind 分流：
 *   - 'indices': 对每个 index 调用 ctx.updateEdgeByIndex，追加 styles 到 data.styles，
 *     若 interpolate 非空则设置 data.interpolate，若 animate 非空则设置 data.animate
 *   - 'default': 调用 metadataCollector.setLinkStyleDefault(styles, interpolate)（决策16）
 *
 * 对齐 flow-db.ts updateLink/updateLinkInterpolate 行为：
 *   - updateLink 按 index 追加 style 到 edge.style 数组
 *   - updateLinkInterpolate 按 index 设置 edge.interpolate
 *   - 'default' 时设置 edges.defaultStyle/defaultInterpolate
 */
export class LinkStyleConverter
  implements ISideEffectBlockConverter<LinkStyleBlock, ConverterContext>
{
  parseBlock(block: LinkStyleBlock, context: ConverterContext): void {
    const { target, styles, interpolate, animate } = block;

    if (target.kind === 'default') {
      // 决策16：setLinkStyleDefault 签名扩展，一次调用同时处理 styles + interpolate
      context.metadataCollector.setLinkStyleDefault(
        styles,
        interpolate,
      );
      return;
    }

    // target.kind === 'indices'
    for (const index of target.indices) {
      context.updateEdgeByIndex(index, (edge) => {
        const existing = edge.data.styles ?? [];
        edge.data.styles = [...existing, ...styles];
        if (interpolate !== undefined) {
          edge.data.interpolate = interpolate;
        }
        if (animate !== undefined) {
          edge.data.animate = animate;
        }
      });
    }
  }
}
