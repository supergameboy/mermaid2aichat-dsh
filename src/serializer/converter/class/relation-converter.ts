/**
 * RelationConverter — RelationBlock ↔ MermaidEdge 双向转换
 *
 * 设计文档：docs/design/fractal-design-20260703-classDiagram重构/...-模块2-转换器.md
 * 阶段：M3 重构 L2-4
 *
 * 数据流：
 *   parse 方向：RelationBlock → MermaidEdge（通过 ctx.registerEdge 注册）
 *     - source/target 直接复用 block.sourceId/targetId（LOLLIPOP 不替换，保留原始 id）
 *     - relationType1/relationType2 直接复用 block 数值（无折叠，无信息丢失）
 *     - lineType: block.lineType (number) → ClassLineType ('line'|'dotted')，用 LINE_TYPE_MAP 映射
 *     - cardinality1/cardinality2 直接复用 block 字符串
 *     - label → relationLabel
 *     - edgeId 自动生成 `class-relation-${edgeIndex}`
 *   serialize 方向：MermaidEdge → RelationBlock（含 rawText，对齐设计点1）
 *     - 反向映射：lineType ('line'|'dotted') → number (0|1)
 *     - relationType1/relationType2/cardinality1/cardinality2/relationLabel 直接复用
 *     - sourceId/targetId 直接复用 edge.source/target
 *     - rawText 由 formatRelation 生成（如 `A <|-- B : label`）
 *
 * LOLLIPOP 处理（决策13/方案B）：
 *   - 不生成 interface 虚拟节点（画布节点与源代码 1:1 对应）
 *   - relationType1=4 或 relationType2=4 表达 lollipop 端，渲染层用 marker 表达
 *
 * 双端对称（架构缺陷修复）：
 *   - MermaidEdgeData 与 RelationBlock 字段一一对应：relationType1/relationType2/cardinality1/cardinality2/lineType/relationLabel
 *   - 无字符串折叠，无信息丢失，双向转换完全对称
 *
 * 模块边界：仅依赖 ../recognizer/types.js、../../types.js、../../parser/class/constants.js，不引用 React/DOM。
 */

import type {
  ClassLineType,
  MermaidEdge,
  MermaidEdgeData,
  MermaidEdgeStyle,
} from '../../types.js';
import type { RelationBlock } from '../../recognizer/types.js';
import type {
  ClassConverterContext,
} from './types.js';
import type {
  IModelBlockConverter,
} from '../types.js';
import { LINE_TYPE, LINE_TYPE_TO_CLASS_LINE_TYPE, RELATION_TYPE } from '../../parser/class/constants.js';

// ============================================================
// 映射表常量
// ============================================================

/**
 * LINE_TYPE 数值 → ClassLineType 字符串（parse 方向使用）
 *
 * 复用 constants.ts 已有的 LINE_TYPE_TO_CLASS_LINE_TYPE 映射，
 * 包装为 ReadonlyMap 提供类型安全的查询接口。
 */
export const LINE_TYPE_MAP: ReadonlyMap<number, ClassLineType> = new Map(
  (Object.entries(LINE_TYPE_TO_CLASS_LINE_TYPE) as readonly [string, ClassLineType][])
    .map(([key, value]) => [Number(key), value] as [number, ClassLineType]),
);

/**
 * ClassLineType 字符串 → LINE_TYPE 数值（serialize 方向反向映射）
 *
 * 反向查表：'line' → 0 (LINE_TYPE.LINE)，'dotted' → 1 (LINE_TYPE.DOTTED_LINE)
 */
export const LINE_TYPE_REVERSE_MAP: ReadonlyMap<ClassLineType, number> = new Map([
  ['line', LINE_TYPE.LINE],
  ['dotted', LINE_TYPE.DOTTED_LINE],
]);

/**
 * 数值型关系类型 → 左端（source 端）符号（serialize 方向使用）
 *
 * jison 语法中左端符号出现在线型左侧：
 *   - EXTENSION: `<|` 空心三角指向 source
 *   - COMPOSITION: `*` 实心菱形在 source 端
 *   - AGGREGATION: `o` 空心菱形在 source 端
 *   - DEPENDENCY: `<` 箭头指向 source
 *   - LOLLIPOP: `()` 圆圈在 source 端
 */
const LEFT_SYMBOL: Readonly<Record<number, string>> = {
  [RELATION_TYPE.AGGREGATION]: 'o',
  [RELATION_TYPE.EXTENSION]: '<|',
  [RELATION_TYPE.COMPOSITION]: '*',
  [RELATION_TYPE.DEPENDENCY]: '<',
  [RELATION_TYPE.LOLLIPOP]: '()',
};

/**
 * 数值型关系类型 → 右端（target 端）符号（serialize 方向使用）
 *
 * jison 语法中右端符号出现在线型右侧：
 *   - EXTENSION: `|>` 空心三角指向 target
 *   - COMPOSITION: `*` 实心菱形在 target 端
 *   - AGGREGATION: `o` 空心菱形在 target 端
 *   - DEPENDENCY: `>` 箭头指向 target
 *   - LOLLIPOP: `()` 圆圈在 target 端
 */
const RIGHT_SYMBOL: Readonly<Record<number, string>> = {
  [RELATION_TYPE.AGGREGATION]: 'o',
  [RELATION_TYPE.EXTENSION]: '|>',
  [RELATION_TYPE.COMPOSITION]: '*',
  [RELATION_TYPE.DEPENDENCY]: '>',
  [RELATION_TYPE.LOLLIPOP]: '()',
};

/** 线型 → 线符号（serialize 方向使用） */
const LINE_SYMBOL: Readonly<Record<ClassLineType, string>> = {
  line: '--',
  dotted: '..',
};

/**
 * 构建箭头语法（双端对称，serialize 方向使用）
 *
 * 策略：根据数值型 type1/type2 分别查 LEFT_SYMBOL/RIGHT_SYMBOL，
 *       组合为 `左符号 + 线符号 + 右符号`。
 *   - type1 存在: 左端有符号（如 `<|--`, `*--`, `o--`, `<..`, `<|..`）
 *   - type2 存在: 右端有符号（如 `-->`, `--o`, `--()`, `..>`, `..|>`）
 *   - 双端都有: 如 `<|--o`（左端继承 + 右端聚合）
 *   - 双端都无: 仅线型 `--` 或 `..`
 */
function buildArrowSyntax(
  type1: number | undefined,
  type2: number | undefined,
  lineType: ClassLineType,
): string {
  const lineSymbol = LINE_SYMBOL[lineType];
  const leftPart = type1 !== undefined ? (LEFT_SYMBOL[type1] ?? '') : '';
  const rightPart = type2 !== undefined ? (RIGHT_SYMBOL[type2] ?? '') : '';
  return `${leftPart}${lineSymbol}${rightPart}`;
}

/**
 * 生成 relation block 的 rawText（对齐老路径 serializeRelation 行为）
 *
 * 格式：`source "card1" arrow "card2" target : label`
 * - cardinality1/cardinality2 可选，存在时用双引号包裹
 * - label 可选，存在时用 ` : ` 分隔
 * - arrow 由 buildArrowSyntax 生成（双端对称符号组合）
 */
function formatRelation(edge: MermaidEdge): string {
  const { source, target, data } = edge;
  const type1 = typeof data.relationType1 === 'number' ? data.relationType1 : undefined;
  const type2 = typeof data.relationType2 === 'number' ? data.relationType2 : undefined;
  const lineType = (data.lineType as ClassLineType | undefined) ?? 'line';

  const arrow = buildArrowSyntax(type1, type2, lineType);

  // 基数（双端字段 cardinality1/cardinality2）
  const fromPart = data.cardinality1 ? `"${data.cardinality1}" ` : '';
  const toPart = data.cardinality2 ? ` "${data.cardinality2}"` : '';

  // 关系标签（relationLabel 是 class 关系专用字段，label 是通用字段）
  const label = (data.relationLabel as string | undefined) ?? data.label;
  const labelPart = label ? ` : ${label}` : '';

  return `${source} ${fromPart}${arrow}${toPart} ${target}${labelPart}`;
}

// ============================================================
// RelationConverter 实现
// ============================================================

/**
 * RelationBlock ↔ MermaidEdge 双向转换器
 *
 * 双端关系类型完整对称，LOLLIPOP 保留原始 source/target（不生成 interface 节点）
 */
export class RelationConverter
  implements IModelBlockConverter<RelationBlock, MermaidEdge, ClassConverterContext>
{
  /** parse：RelationBlock → MermaidEdge，通过 ctx.registerEdge 注册 */
  parseBlock(block: RelationBlock, context: ClassConverterContext): MermaidEdge | null {
    const edgeIndex = context.getEdges().length;
    const edgeId = `class-relation-${edgeIndex}`;

    // lineType 数值 → ClassLineType 字符串
    const classLineType: ClassLineType = LINE_TYPE_MAP.get(block.lineType) ?? 'line';
    // edgeStyle：class 关系仅 dotted 或 line 两种
    const edgeStyle: MermaidEdgeStyle = classLineType === 'dotted' ? 'dotted' : 'line';

    // 构建边数据（双端对称字段，与 RelationBlock 一一对应）
    const data: MermaidEdgeData = {
      edgeStyle,
      ...(block.label !== undefined && block.label !== ''
        ? { label: block.label, relationLabel: block.label }
        : {}),
      relationType1: block.relationType1,
      relationType2: block.relationType2,
      lineType: classLineType,
      ...(block.cardinality1 !== undefined
        ? { cardinality1: block.cardinality1 }
        : {}),
      ...(block.cardinality2 !== undefined
        ? { cardinality2: block.cardinality2 }
        : {}),
      ...(block.sourceLine !== undefined ? { _sourceLine: block.sourceLine } : {}),
    };

    const edge: MermaidEdge = {
      id: edgeId,
      source: block.sourceId,
      target: block.targetId,
      type: 'class-relation',
      data,
    };

    context.registerEdge(edge);
    return edge;
  }

  /** serialize：MermaidEdge → RelationBlock（含 rawText，对齐设计点1） */
  serializeBlock(model: MermaidEdge, _context: ClassConverterContext): RelationBlock | null {
    // 非关系边返回 null（note-edge 由 NoteConverter 处理）
    if (model.type !== 'class-relation') {
      return null;
    }

    const data = model.data;
    const classLineType = (data.lineType as ClassLineType | undefined) ?? 'line';
    const lineNumber = LINE_TYPE_REVERSE_MAP.get(classLineType) ?? LINE_TYPE.LINE;

    // relationLabel → label（serialize 方向）
    const label = (data.relationLabel as string | undefined) ?? data.label;

    // rawText 由 formatRelation 生成（设计点1：rawText 由 Converter 生成）
    const rawText = formatRelation(model);

    const block: RelationBlock = {
      type: 'relation',
      sourceLine: data._sourceLine,
      rawText,
      indent: 0,
      sourceId: model.source,
      targetId: model.target,
      relationType1: (data.relationType1 as number | 'none' | undefined) ?? 'none',
      relationType2: (data.relationType2 as number | 'none' | undefined) ?? 'none',
      lineType: lineNumber,
      cardinality1: data.cardinality1 as string | undefined,
      cardinality2: data.cardinality2 as string | undefined,
      label,
    };

    return block;
  }
}
