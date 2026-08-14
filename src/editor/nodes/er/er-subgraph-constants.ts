/**
 * er-subgraph 渲染参数共享常量 — 单一数据源供渲染和布局共用
 *
 * 单一职责：定义 er-subgraph 节点渲染参数常量，er-subgraph.tsx（渲染）共用
 *
 * 设计动机（模块4 L2-7，对齐 namespace-node 模式）：
 *   - 替换 er-subgraph.tsx 中的硬编码 TITLE_HEIGHT/MIN_WIDTH/MIN_HEIGHT
 *   - 与 class-namespace 模式一致，便于未来 dagre 布局接入 er-subgraph 时复用
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块4-渲染器.md
 */

/**
 * er-subgraph 渲染参数常量
 *
 * 命名约定：UPPER_SNAKE_CASE（code-standards.md §1 常量命名）
 *
 * 注：使用 `as const` 断言保证所有属性 readonly，对象字面量内不使用 readonly 关键字
 * （TS1042: readonly 修饰符不能用于对象字面量属性，仅适用于 interface/type/class 成员）
 */
export const ER_SUBGRAPH_CONSTANTS = {
  /** 标题栏高度（padding 0 + font 14 + line-height 1.2 ≈ 17，向上取整 28 与 class-namespace 对齐） */
  TITLE_HEIGHT: 28,
  /** 最小宽度（subgraph 容器需容纳子实体，对齐 class-namespace MIN_WIDTH=200） */
  MIN_WIDTH: 240,
  /** 最小高度（subgraph 容器需容纳子实体，对齐 class-namespace MIN_HEIGHT=100） */
  MIN_HEIGHT: 120,
} as const;
