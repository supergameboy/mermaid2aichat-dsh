/**
 * class-box 渲染参数共享常量 — 单一数据源供渲染和布局共用
 *
 * 单一职责：定义 class-box 节点渲染参数常量，class-box.tsx（渲染）和 class-box-size.ts（dagre 布局估算）共用
 *
 * 设计动机（M3 修订）：
 *   - 修复"代码初始化后布局出现类重叠"bug：dagre 收到的节点高度仅基于 label，
 *     不含 members/stereotype/annotations 高度，导致渲染时 class-box 实际高度超出 dagre 算的高度 → 重叠
 *   - 修复 magic number 双源：原 class-box.tsx inline style 与 class-box-size.ts 公式独立硬编码，
 *     一边修改另一边不同步 → bug
 *   - 单一数据源（institution §1.1）：常量集中管理，渲染和布局共用同一组数值
 *
 * 数值来源：
 *   - 来自 class-box.tsx 的实际 inline style（padding/font-size/font-weight/line-height）
 *   - styles.css 仅有 CSS 变量（颜色），不覆盖 padding/font-size/line-height
 *   - 修改 class-box.tsx 渲染参数时必须同步修改此处常量（保持一致）
 */

/**
 * class-box 渲染参数常量
 *
 * 命名约定：UPPER_SNAKE_CASE（code-standards.md §1 常量命名）
 *
 * 注：使用 `as const` 断言保证所有属性 readonly，对象字面量内不使用 readonly 关键字
 * （TS1042: readonly 修饰符不能用于对象字面量属性，仅适用于 interface/type/class 成员）
 */
export const CLASS_BOX_CONSTANTS = {
  // === 标题区（label-group）===
  /** 标题区高度（padding 4+4 + font 13 + line-height 1.2 ≈ 16 → 24，向上取整 28 留余量） */
  LABEL_HEIGHT: 28,
  /** 标题区垂直 padding（4+4） */
  LABEL_PADDING_Y: 8,
  /** 标题区水平 padding（12+12） */
  LABEL_HORIZONTAL_PADDING: 24,
  /** 标题字体宽度（proportional 字体估算，对齐 shape-geometry.ts CHAR_WIDTH=8） */
  LABEL_FONT_WIDTH: 8,

  // === annotation 区（annotation-group：stereotype + annotations）===
  /** annotation 区垂直 padding（4+2） */
  ANNOTATION_PADDING_Y: 6,
  /** annotation 行高（font-size 11 + line-height 1.2 ≈ 13.2，向上取整 14） */
  ANNOTATION_LINE_HEIGHT: 14,

  // === 成员区（members-group / methods-group）===
  /** 单个成员行高（padding 1+1 + font 13 + line-height 5 ≈ 20） */
  MEMBER_LINE_HEIGHT: 20,
  /** 成员组垂直 padding（4+4） */
  MEMBER_GROUP_PADDING_Y: 8,
  /** 成员组水平 padding（8+8） */
  MEMBER_HORIZONTAL_PADDING: 16,
  /** 成员字体宽度（monospace 字体，等宽精确） */
  MEMBER_FONT_WIDTH: 7,

  // === divider ===
  /** divider 高度（1px border） */
  DIVIDER_HEIGHT: 1,

  // === 空类提示 ===
  /** 空类提示区高度（padding 4+4 + font 13 + line-height ≈ 22，向上取整 30 留余量） */
  EMPTY_CLASS_HINT_HEIGHT: 30,

  // === 整体 ===
  /** 最小宽度（class-box.tsx minWidth: 180） */
  MIN_WIDTH: 180,
} as const;
