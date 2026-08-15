/**
 * 图表类型注册表 — 全类型统一元数据（12 种）
 *
 * 单一职责：作为 parse / serialize / 类型切换 UI 的单一事实源。
 * 里程碑推进时把对应类型的 `implemented` 翻转为 true（并落地
 * parse/serialize/canvas 实现），UI 与分派自动放行。
 *
 * 参考：mermaid 官方语法（本地 mermaid-develop v10.2.4 + 线上 v11）。
 */
import type { DiagramType } from './types.js';

/** 编辑族：决定该类型的编辑模型（见 PLAN.md「编辑方法设计」）。 */
export type DiagramFamily = 'graph' | 'sequence' | 'tree' | 'chart' | 'architecture';

/** 一种图表类型的注册信息。 */
export interface DiagramTypeInfo {
  type: DiagramType
  /** 中文标签（UI 展示）。 */
  label: string
  /** 编辑族。 */
  family: DiagramFamily
  /** 解析 + 序列化 + 画布是否已实现（未实现 = 计划中/开发中）。 */
  implemented: boolean
}

/** 全部 12 种类型（4 已实现 + 8 计划内）。 */
export const DIAGRAM_TYPES: readonly DiagramTypeInfo[] = [
  { type: 'flowchart', label: '流程图', family: 'graph', implemented: true },
  { type: 'sequenceDiagram', label: '时序图', family: 'sequence', implemented: true },
  { type: 'classDiagram', label: '类图', family: 'graph', implemented: true },
  { type: 'erDiagram', label: 'ER图', family: 'graph', implemented: true },
  { type: 'stateDiagram', label: '状态图', family: 'graph', implemented: false },
  { type: 'mindmap', label: '思维导图', family: 'tree', implemented: false },
  { type: 'architecture', label: '架构图', family: 'architecture', implemented: false },
  { type: 'gantt', label: '甘特图', family: 'chart', implemented: false },
  { type: 'pie', label: '饼图', family: 'chart', implemented: false },
  { type: 'timeline', label: '时间线', family: 'chart', implemented: false },
  { type: 'quadrantChart', label: '四象限图', family: 'chart', implemented: false },
  { type: 'xychart', label: '坐标图', family: 'chart', implemented: false },
] as const;

/** 已实现的类型（类型切换 UI 只放行这些）。 */
export const IMPLEMENTED_DIAGRAM_TYPES: readonly DiagramTypeInfo[] =
  DIAGRAM_TYPES.filter((info) => info.implemented);

/** 按类型取注册信息（未知类型返回 undefined）。 */
export function diagramTypeInfo(type: DiagramType): DiagramTypeInfo | undefined {
  return DIAGRAM_TYPES.find((info) => info.type === type);
}
