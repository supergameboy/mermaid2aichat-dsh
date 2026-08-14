/**
 * NodeStyle → CSSProperties 转换工具
 *
 * 单一职责：将 Mermaid NodeStyle 中的非 path 样式属性转换为 React CSSProperties
 *
 * 数据流:
 *   NodeStyle { fill, stroke, strokeWidth, color, ...其他CSS } → nodeStyleToCss
 *     → CSSProperties { fontSize, fontFamily, ... }（排除 fill/stroke/strokeWidth/color）
 *
 * 共享原因：subgraph-node 与 shape-component 均需将 NodeStyle 的额外 CSS 属性
 * 应用到容器/标签，提取为单一工具避免重复实现（code-standards 第2章单一职责）。
 */

import type { CSSProperties } from 'react';
import type { NodeStyle } from '@mermaid2aichat/serializer';

/**
 * 将 NodeStyle 中的非 path 样式属性转换为 React CSSProperties
 *
 * - 保留 fill/stroke/strokeWidth/color 之外的所有原始 CSS 属性
 * - 将连字符命名（如 font-size）转换为驼峰命名（fontSize）
 * - undefined 值跳过
 *
 * @param style - Mermaid NodeStyle（可能为 undefined）
 * @returns React CSSProperties，无额外属性时返回 undefined
 */
export function nodeStyleToCss(style: NodeStyle | undefined): CSSProperties | undefined {
  if (style === undefined) {
    return undefined;
  }
  // 剥离 fill/stroke/strokeWidth/color（由调用方单独应用到 path/容器），保留其余 CSS 属性
  const { fill, stroke, strokeWidth, color, ...rest } = style;
  const css: CSSProperties = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) {
      continue;
    }
    const reactKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    (css as Record<string, unknown>)[reactKey] = value;
  }
  return Object.keys(css).length > 0 ? css : undefined;
}
