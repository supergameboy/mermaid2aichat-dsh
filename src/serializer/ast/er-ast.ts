/**
 * ER Diagram AST 类型定义
 *
 * 单一职责：定义 ErDB.getData() 返回的 AST 结构
 * 来源：对齐官方 mermaid packages/mermaid/src/diagrams/er/erDb.ts 的 getData() 返回值
 *
 * 注意：
 * - 核心类型（ERCardinality / ERIdentification / ERAttributeKey / NodeAttribute /
 *   MermaidNodeData / MermaidEdgeData / GraphMetadata）
 *   已在 M0 `packages/serializer/src/types.ts` 中统一定义，本文件不重新定义
 * - 本文件仅定义 er 解析器内部使用的 AST 层数据结构
 * - EntityNode/Attribute/Relationship/RelSpec/EntityClass/ErSubGraph 从 parser/er/types.ts 引用
 */

import type {
  EntityNode,
  Attribute,
  Relationship,
  RelSpec,
  EntityClass,
  ErSubGraph,
  EntityMap,
  EntityClassMap,
} from '../parser/er/types.js';
import type { FlowchartDirection } from '../types.js';

/** ER 解析后的 AST（ErDB.getData() 返回结构）
 *
 * 对齐官方 erDb.ts 的内部数据结构（非 getData() 的渲染输出）
 * - entities/classes 使用 Map（保持官方结构）
 * - relationships/subGraphs 使用数组（保持官方结构）
 */
export interface ERAST {
  /** 实体映射（name → EntityNode） */
  entities: EntityMap;
  /** 关系列表 */
  relationships: Relationship[];
  /** 样式类映射（classDef id → EntityClass） */
  classes: EntityClassMap;
  /** 子图列表 */
  subGraphs: ErSubGraph[];
  /** 图表方向（TB/BT/RL/LR，默认 'TB'；jison 输出经 normalizeDirection 校验） */
  direction: FlowchartDirection;
  /** Accessibility 标题 */
  accTitle: string | undefined;
  /** Accessibility 描述 */
  accDescr: string | undefined;
}

// 重导出 er 专用 AST 层类型（便于外部引用）
export type {
  EntityNode,
  Attribute,
  Relationship,
  RelSpec,
  EntityClass,
  ErSubGraph,
  EntityMap,
  EntityClassMap,
} from '../parser/er/types.js';
