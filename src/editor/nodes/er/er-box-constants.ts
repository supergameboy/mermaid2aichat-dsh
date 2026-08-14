/**
 * er-box 渲染参数共享常量 — 单一数据源供渲染和布局共用
 *
 * 单一职责：定义 er-box 节点渲染参数常量，er-box.tsx（渲染）和 er-box-size.ts（dagre 布局估算）共用
 *
 * 设计动机（模块4 L2-2，对齐 class-box-constants 模式）：
 *   - 避免 dagre 收到的节点高度仅基于 label，不含 attributes 高度，导致渲染时 er-box 实际高度超出 dagre 算的高度 → 重叠
 *   - 避免 magic number 双源：er-box.tsx inline style 与 er-box-size.ts 公式独立硬编码，一边修改另一边不同步 → bug
 *   - 单一数据源（institution §1.1）：常量集中管理，渲染和布局共用同一组数值
 *
 * 数值来源：
 *   - 来自 er-box.tsx 的实际 inline style（padding/font-size/font-weight/line-height）
 *   - styles.css 仅有 CSS 变量（颜色），不覆盖 padding/font-size/line-height
 *   - 修改 er-box.tsx 渲染参数时必须同步修改此处常量（保持一致）
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块4-渲染器.md
 */

/**
 * er-box 渲染参数常量
 *
 * 命名约定：UPPER_SNAKE_CASE（code-standards.md §1 常量命名）
 *
 * 注：使用 `as const` 断言保证所有属性 readonly，对象字面量内不使用 readonly 关键字
 * （TS1042: readonly 修饰符不能用于对象字面量属性，仅适用于 interface/type/class 成员）
 */
export const ER_BOX_CONSTANTS = {
  // === 标题区（header：label + alias）===
  /** 标题区高度（padding 6+6 + font 13 + line-height 1.2 ≈ 16 → 24，含 alias 行时 +14，向上取整 28 留余量） */
  LABEL_HEIGHT: 28,
  /** 标题区垂直 padding（6+6） */
  LABEL_PADDING_Y: 12,
  /** 标题区水平 padding（12+12） */
  LABEL_HORIZONTAL_PADDING: 24,
  /** 标题字体宽度（proportional 字体估算，对齐 shape-geometry.ts CHAR_WIDTH=8） */
  LABEL_FONT_WIDTH: 8,
  /** alias 行附加高度（font 11 + line-height 1.2 + marginTop 2 ≈ 15，向上取整 16） */
  ALIAS_LINE_HEIGHT: 16,

  // === 属性区（4 列分栏：type/name/keys/comment）===
  /** 单个属性行高（padding 1+1 + font 13 + line-height 1.2 ≈ 18，向上取整 20） */
  ATTRIBUTE_LINE_HEIGHT: 20,
  /** 属性区垂直 padding（4+4） */
  ATTRIBUTE_PADDING_Y: 8,
  /** 属性区水平 padding（8+8） */
  ATTRIBUTE_HORIZONTAL_PADDING: 16,
  /** 属性字体宽度（monospace 字体，等宽精确，对齐 class-box MEMBER_FONT_WIDTH=7） */
  ATTRIBUTE_FONT_WIDTH: 7,

  // === 4 列分栏最小宽度（CSS grid minmax 下限，仅作下限保护，实际列宽由内容撑开）===
  /** type 列最小宽度（最短类型 "int" = 3字符 × 7px + 8px padding = 29px，40px 留余量） */
  COLUMN_TYPE_MIN_WIDTH: 40,
  /** name 列最小宽度（最短属性名 "id" = 2字符 × 7px + 8px padding = 22px，40px 留余量） */
  COLUMN_NAME_MIN_WIDTH: 40,
  /** keys 列最小宽度（无 key 时空列，有一个 badge 时 24px + 8px = 32px） */
  COLUMN_KEYS_MIN_WIDTH: 32,
  /** comment 列最小宽度（无 comment 时空列，有短 comment 时 40px 足够） */
  COLUMN_COMMENT_MIN_WIDTH: 40,

  // === 字宽估算（per-column，供 dagre 估算对齐 CSS grid 自适应列宽）===
  /** comment 列字体宽度（fontSize 12 italic monospace，比 ATTRIBUTE_FONT_WIDTH=7 略小） */
  COMMENT_FONT_WIDTH: 6,
  /** 单个 key badge 宽度（PK/FK/UK：2 字符 × 6px bold + 8px padding + 4px marginRight = 24） */
  KEY_BADGE_WIDTH: 24,

  // === divider ===
  /** divider 高度（1px border，标题与属性区之间） */
  DIVIDER_HEIGHT: 1,

  // === 空属性提示 ===
  /** 空属性提示区高度（padding 4+4 + font 13 + line-height ≈ 22，向上取整 30 留余量） */
  EMPTY_HINT_HEIGHT: 30,

  // === 整体 ===
  /** 最小宽度（4 列最小总宽 + padding 的兜底下限） */
  MIN_WIDTH: 200,
} as const;
