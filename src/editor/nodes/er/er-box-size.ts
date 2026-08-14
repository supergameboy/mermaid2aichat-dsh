/**
 * er-box 节点尺寸估算 — 用于 dagre 布局输入
 *
 * 单一职责：根据 er-box 节点的数据（label/alias/attributes）估算渲染尺寸
 *
 * 设计动机（模块4 L2-3，对齐 class-box-size.ts 模式）：
 *   - 避免"代码初始化后布局出现 er-box 重叠"bug（与 class-box 同类问题）
 *   - dagre-layout.ts:getNodeSize 对 er-box 节点调用本函数估算动态尺寸
 *   - er-box 节点实际高度 = 标题 + alias + N 属性 × 行高 + divider（动态）
 *
 * 算法（对齐 er-box.tsx 实际渲染参数，er-box-constants.ts 共享常量）：
 *   height = LABEL_HEIGHT + LABEL_PADDING_Y
 *            + (alias ? ALIAS_LINE_HEIGHT : 0)
 *            + DIVIDER_HEIGHT（有属性时）
 *            + (attributes.length > 0 ? attributes.length × ATTRIBUTE_LINE_HEIGHT + ATTRIBUTE_PADDING_Y : EMPTY_HINT_HEIGHT)
 *
 *   width = max(MIN_WIDTH,
 *               labelWidth,
 *               attributeAreaWidth)
 *     labelWidth = label.length × LABEL_FONT_WIDTH + LABEL_HORIZONTAL_PADDING
 *     attributeAreaWidth = sum(每列列宽) + ATTRIBUTE_HORIZONTAL_PADDING
 *       每列列宽 = max(最小列宽, 该列最长文本宽度)
 *       对齐 CSS grid minmax(min, auto) 语义，估算值与渲染值一致
 *
 * 字宽估算说明：
 *   - monospace 字体（type/name 列）：字符等宽 × ATTRIBUTE_FONT_WIDTH=7，估算精确
 *   - comment 列（fontSize 12 italic）：× COMMENT_FONT_WIDTH=6，比 type/name 略小
 *   - keys 列（badge 非文本）：按 badge 数 × KEY_BADGE_WIDTH=24 估算
 *   - proportional 字体（label, bolder）：字符不等宽，按平均字宽 LABEL_FONT_WIDTH=8 估算
 *     对齐现有 shape-geometry.ts:CHAR_WIDTH=8 的估算方式
 *   - 不使用 canvas.measureText：会引入 DOM 依赖，破坏纯函数特性（影响 SSR/测试）
 *
 * 模块边界：仅依赖 @mermaid2aichat/serializer 类型，不引用 React/DOM（code-standards.md §7）
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块4-渲染器.md
 */

import type { MermaidNode } from '@mermaid2aichat/serializer';
import { ER_BOX_CONSTANTS as C } from './er-box-constants.js';

/**
 * 估算 er-box 节点的 dagre 布局尺寸
 *
 * @param node - type='er-box' 的 MermaidNode
 * @returns 节点宽高（用于 dagre 布局输入，估算值偏大时浪费空间，偏小时仍会重叠）
 */
export function computeErBoxSize(node: MermaidNode): { width: number; height: number } {
  const data = node.data;
  const attributes = data.attributes ?? [];
  const alias = data.alias;
  const label = String(data.label ?? node.id);

  // === 高度估算 ===
  let height = C.LABEL_HEIGHT + C.LABEL_PADDING_Y;

  // alias 行（有 alias 时附加一行）
  if (alias) {
    height += C.ALIAS_LINE_HEIGHT;
  }

  // divider（有属性时标题与属性区之间有 divider）
  if (attributes.length > 0) {
    height += C.DIVIDER_HEIGHT;
    // 属性区：N 属性 × 行高 + 垂直 padding
    height += attributes.length * C.ATTRIBUTE_LINE_HEIGHT + C.ATTRIBUTE_PADDING_Y;
  } else {
    // 空属性提示
    height += C.EMPTY_HINT_HEIGHT;
  }

  // === 宽度估算（per-column 自适应，对齐 CSS grid minmax(min, auto) 语义）===
  // 标题宽度（label 文本）
  const labelWidth = label.length * C.LABEL_FONT_WIDTH + C.LABEL_HORIZONTAL_PADDING;

  // 计算每列最长内容宽度
  // cellPadding = padding '0 4px' × 2 = 8px（对齐 er-box.tsx 每个 cell 的水平 padding）
  const cellPadding = 8;
  let maxTypeWidth = 0;
  let maxNameWidth = 0;
  let maxKeysWidth = 0;
  let maxCommentWidth = 0;

  for (const attr of attributes) {
    const typeText = attr.type ?? '';
    const nameText = attr.name ?? '';
    const commentText = attr.comment ? `"${attr.comment}"` : '';

    const typeWidth = typeText.length * C.ATTRIBUTE_FONT_WIDTH + cellPadding;
    const nameWidth = nameText.length * C.ATTRIBUTE_FONT_WIDTH + cellPadding;
    const keysWidth = attr.keys.length * C.KEY_BADGE_WIDTH + cellPadding;
    const commentWidth = commentText.length * C.COMMENT_FONT_WIDTH + cellPadding;

    if (typeWidth > maxTypeWidth) maxTypeWidth = typeWidth;
    if (nameWidth > maxNameWidth) maxNameWidth = nameWidth;
    if (keysWidth > maxKeysWidth) maxKeysWidth = keysWidth;
    if (commentWidth > maxCommentWidth) maxCommentWidth = commentWidth;
  }

  // 列宽 = max(最小列宽, 最长内容宽度) — 对齐 CSS grid minmax(min, auto) 语义
  const typeColWidth = Math.max(C.COLUMN_TYPE_MIN_WIDTH, maxTypeWidth);
  const nameColWidth = Math.max(C.COLUMN_NAME_MIN_WIDTH, maxNameWidth);
  const keysColWidth = Math.max(C.COLUMN_KEYS_MIN_WIDTH, maxKeysWidth);
  const commentColWidth = Math.max(C.COLUMN_COMMENT_MIN_WIDTH, maxCommentWidth);

  const attributeAreaWidth =
    typeColWidth + nameColWidth + keysColWidth + commentColWidth +
    C.ATTRIBUTE_HORIZONTAL_PADDING;

  const width = Math.max(C.MIN_WIDTH, labelWidth, attributeAreaWidth);

  return { width, height };
}
