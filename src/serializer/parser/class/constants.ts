/**
 * Class Diagram 常量定义
 *
 * 单一职责：定义 RELATION_TYPE / LINE_TYPE / VISIBILITY_VALUES 常量
 * 这些常量值必须与 jison 语法中引用的 yy.relationType / yy.lineType 完全一致
 *
 * 来源：对齐官方 mermaid packages/mermaid/src/diagrams/class/classDb.ts 的 relationType/lineType
 */

/** 关系类型（jison 通过 yy.relationType 访问）
 *
 * 数值含义（与官方 classDb.ts 一致）：
 *   - AGGREGATION: o-- 空心菱形（聚合）
 *   - EXTENSION:   <|-- 空心三角箭头（继承）/ <|.. 实现虚线
 *   - COMPOSITION: *-- 实心菱形（组合）
 *   - DEPENDENCY:  <.. 开放箭头虚线（依赖）/ --> 开放箭头实线（关联）
 *   - LOLLIPOP:    ()-- 棒棒糖（接口实现）
 *
 * 注意：jison 语法层只有 5 种 relationType，association/realization 由 relationType + lineType 组合决定：
 *   - association  = DEPENDENCY + LINE（-->）
 *   - realization  = EXTENSION + DOTTED_LINE（<|..）
 *   - dependency   = DEPENDENCY + DOTTED_LINE（<..）
 *   - extension    = EXTENSION + LINE（<|--）
 */
export const RELATION_TYPE = {
  AGGREGATION: 0,
  EXTENSION: 1,
  COMPOSITION: 2,
  DEPENDENCY: 3,
  LOLLIPOP: 4,
} as const;

/** 线型（jison 通过 yy.lineType 访问） */
export const LINE_TYPE = {
  LINE: 0,
  DOTTED_LINE: 1,
} as const;

/** 可见性符号集合（对齐官方 classTypes.ts visibilityValues） */
export const VISIBILITY_VALUES = ['#', '+', '~', '-', ''] as const;

/** 可见性类型 */
export type Visibility = (typeof VISIBILITY_VALUES)[number];

/** RELATION_TYPE → ClassRelationType 映射
 *
 * 用于将 jison 语法层的数值关系类型映射到 M0 types.ts 的 ClassRelationType 字符串
 * 注意：association/realization 需要结合 lineType 判断，不能直接映射
 */
export const RELATION_TYPE_TO_CLASS_RELATION_TYPE: Readonly<Record<number, string>> = {
  [RELATION_TYPE.AGGREGATION]: 'aggregation',
  [RELATION_TYPE.EXTENSION]: 'extension',
  [RELATION_TYPE.COMPOSITION]: 'composition',
  [RELATION_TYPE.DEPENDENCY]: 'dependency',
  [RELATION_TYPE.LOLLIPOP]: 'lollipop',
};

/** LINE_TYPE → ClassLineType 映射 */
export const LINE_TYPE_TO_CLASS_LINE_TYPE: Readonly<Record<number, 'line' | 'dotted'>> = {
  [LINE_TYPE.LINE]: 'line',
  [LINE_TYPE.DOTTED_LINE]: 'dotted',
};

/**
 * 根据 relationType + lineType 组合推断语义关系类型
 *
 * 官方 jison 语法只有 5 种 relationType，但 M0 ClassRelationType 有 7 种
 * 通过组合判断：
 *   - DEPENDENCY + LINE       → association（-->）
 *   - DEPENDENCY + DOTTED_LINE → dependency（<..）
 *   - EXTENSION + LINE        → extension（<|--）
 *   - EXTENSION + DOTTED_LINE → realization（<|..）
 *   - 其他直接映射
 */
export function resolveRelationType(
  relationType: number,
  lineType: number,
): 'aggregation' | 'extension' | 'composition' | 'association' | 'dependency' | 'realization' | 'lollipop' {
  if (relationType === RELATION_TYPE.DEPENDENCY) {
    return lineType === LINE_TYPE.DOTTED_LINE ? 'dependency' : 'association';
  }
  if (relationType === RELATION_TYPE.EXTENSION) {
    return lineType === LINE_TYPE.DOTTED_LINE ? 'realization' : 'extension';
  }
  const mapped = RELATION_TYPE_TO_CLASS_RELATION_TYPE[relationType];
  if (mapped === 'aggregation' || mapped === 'composition' || mapped === 'lollipop') {
    return mapped;
  }
  // 理论上不会到达此处，所有 relationType 已覆盖
  return 'association';
}
