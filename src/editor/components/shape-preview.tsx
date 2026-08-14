/**
 * ShapePreview — SVG 形状预览组件
 *
 * 单一职责：根据 MermaidShapeType 渲染小的 SVG 形状预览（用于节点库图标）
 *
 * 复用 shape-geometry.ts 统一模型：
 *   - 尺寸/path/装饰与画布渲染同源，确保预览与实际渲染一致
 *   - 不再维护独立的 CENTERED_SHAPES 硬编码列表
 *
 * 数据流:
 *   MermaidShapeType → getShapeGeometry → computeSize(defaultLabel) → { width, height }
 *     → generatePath(previewW, previewH) + generateDecorations
 *     → SVG <path> + 装饰元素
 */

import type { ReactElement } from 'react';
import type { MermaidShapeType } from '@mermaid2aichat/serializer';
import {
  getShapeGeometry,
  estimateTextBBox,
  type ShapeDecoration,
} from '../nodes/flowchart/shapes/shape-geometry.js';

// ============================================================
// 类型
// ============================================================

export interface ShapePreviewProps {
  /** 形状类型 */
  shape: MermaidShapeType;
  /** 预览尺寸（宽=高，默认 32） */
  size?: number;
  /** 边框颜色（默认 currentColor） */
  color?: string;
  /** 填充颜色（默认 transparent） */
  fill?: string;
}

// ============================================================
// 常量
// ============================================================

const DEFAULT_SIZE = 32;
const DEFAULT_COLOR = '';
const DEFAULT_FILL = '';

/** 小尺寸预览的内边距（避免 stroke 被裁切） */
const PREVIEW_PAD = 2;

/** 缩略图默认标签，仅用于让 computeSize 返回合理尺寸 */
const PREVIEW_LABEL = 'A';

// ============================================================
// 组件实现
// ============================================================

/**
 * SVG 形状预览组件
 *
 * 使用 shape-geometry.ts 的统一模型：
 * - 先调用 computeSize 获取真实宽高比例
 * - 在固定 size 的 viewBox 内按比例缩放，保持几何不失真
 * - 再调用 generatePath / generateDecorations 绘制
 */
export function ShapePreview({
  shape,
  size = DEFAULT_SIZE,
  color = DEFAULT_COLOR,
  fill = DEFAULT_FILL,
}: ShapePreviewProps): ReactElement {
  const geometry = getShapeGeometry(shape);

  // text 形状：渲染文本占位
  if (shape === 'text') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          {...(color ? { fill: color } : {})}
          fontSize={size * 0.6}
          fontFamily="serif"
          fontStyle="italic"
        >
          T
        </text>
      </svg>
    );
  }

  // 使用统一模型计算真实尺寸比例
  const bbox = estimateTextBBox(PREVIEW_LABEL);
  const { width: naturalW, height: naturalH } = geometry.computeSize(bbox);

  // 在 size × size 的 viewBox 内留出边距，按自然比例缩放
  const innerSize = size - PREVIEW_PAD * 2;
  const scale = Math.min(innerSize / naturalW, innerSize / naturalH);
  const previewW = naturalW * scale;
  const previewH = naturalH * scale;
  const offsetX = (size - previewW) / 2;
  const offsetY = (size - previewH) / 2;

  const pathD = geometry.generatePath(previewW, previewH);
  const decorations = geometry.generateDecorations?.(previewW, previewH) ?? [];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${offsetX}, ${offsetY})`}>
        {pathD && (
          <path
            d={pathD}
            {...(fill ? { fill } : {})}
            {...(color ? { stroke: color } : {})}
            strokeWidth="1.5"
            fillRule="nonzero"
          />
        )}
        {decorations.map((deco, i) => {
          const key = `deco-${i}`;
          return <DecorationElement key={key} decoration={deco} color={color} fill={fill} />;
        })}
      </g>
    </svg>
  );
}

// ============================================================
// 装饰元素渲染
// ============================================================

function DecorationElement({
  decoration,
  color,
  fill,
}: {
  decoration: ShapeDecoration;
  color: string;
  fill: string;
}): ReactElement | null {
  const { tag, attrs } = decoration;
  const commonAttrs = {
    ...(color ? { stroke: color } : {}),
    ...(fill ? { fill } : {}),
    strokeWidth: 1.5,
  };

  switch (tag) {
    case 'ellipse':
      return <ellipse {...commonAttrs} {...attrs} />;
    case 'line':
      return <line {...commonAttrs} {...attrs} fill="none" />;
    case 'rect':
      return <rect {...commonAttrs} {...attrs} />;
    case 'circle':
      return <circle {...commonAttrs} {...attrs} />;
    case 'path':
      return <path {...commonAttrs} {...attrs} />;
    default:
      return null;
  }
}
