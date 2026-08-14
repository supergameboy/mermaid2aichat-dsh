/**
 * applyNodeStyle — 将 Mermaid NodeStyle 映射为 React CSSProperties
 *
 * 单一职责：样式模型转换（数据层 NodeStyle → 渲染层 CSSProperties）
 *
 * 设计动机（模块4 L2-1，提取自 class-box.tsx 局部函数）：
 *   - class-box.tsx 和 er-box.tsx 都需要将 data.style（NodeStyle）转为 CSSProperties
 *   - 提取为共享纯函数，避免 DRY 违规（institution §1.1 单一数据源）
 *   - 未来 state-box / arch-service 等节点也可复用
 *
 * 映射规则：
 *   - fill → background
 *   - stroke → borderColor
 *   - strokeWidth → borderWidth（带 px 单位）
 *   - color → color
 *   - 其他 CSS 属性（font-size/font-weight/text-align 等）kebab-case → camelCase 透传
 *
 * 模块边界：仅依赖 React 类型（CSSProperties）和 serializer 类型（NodeStyle），不引用 DOM
 *
 * 设计文档：docs/design/fractal-design-20260707-erDiagram重构/...-模块4-渲染器.md
 */

import type { CSSProperties } from 'react';
import type { NodeStyle } from '@mermaid2aichat/serializer';

/**
 * 将 NodeStyle（mermaid 样式模型）映射为 React CSSProperties（HTML 渲染模型）
 *
 * @param style - 节点样式对象（fill/stroke/strokeWidth/color + 其他 CSS 属性），undefined 时返回空对象
 * @returns React CSSProperties 对象
 */
export function applyNodeStyle(style: NodeStyle | undefined): CSSProperties {
  if (!style) return {};
  const result: CSSProperties = {};
  // fill → background, stroke → borderColor, strokeWidth → borderWidth, color → color
  if (style.fill !== undefined) result.background = style.fill;
  if (style.stroke !== undefined) result.borderColor = style.stroke;
  if (style.strokeWidth !== undefined) result.borderWidth = `${style.strokeWidth}px`;
  if (style.color !== undefined) result.color = style.color;
  // 透传其他 CSS 属性（font-size/font-weight/text-align 等）
  for (const [key, value] of Object.entries(style)) {
    if (key === 'fill' || key === 'stroke' || key === 'strokeWidth' || key === 'color') continue;
    if (value !== undefined) {
      // 将 kebab-case 转为 camelCase（如 font-size → fontSize）
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      (result as Record<string, string | number>)[camelKey] = value;
    }
  }
  return result;
}
