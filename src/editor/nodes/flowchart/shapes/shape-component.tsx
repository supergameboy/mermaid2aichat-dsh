/**
 * 形状渲染组件 — 根据 MermaidShapeType 渲染对应 SVG 形状 + 标签
 *
 * 单一职责：从 ShapeGeometry 统一模型获取尺寸/path/装饰，渲染 SVG 形状和 HTML 标签
 *
 * 数据流:
 *   MermaidShapeType → getShapeGeometry → ShapeGeometry
 *     → computeSize(estimateTextBBox(label)) → { width, height, pathWidth, pathHeight, pad }
 *     → generatePath(pathWidth, pathHeight) → SVG <path d="...">
 *     → generateDecorations(pathWidth, pathHeight) → 装饰元素
 *     → HTML 标签（支持 FontAwesome 图标、多行文本）
 */

import { memo } from 'react';
import type { MermaidShapeType, NodeStyle } from '@mermaid2aichat/serializer';
import {
  getShapeGeometry,
  estimateTextBBox,
  type ShapeDecoration,
} from './shape-geometry.js';
import { nodeStyleToCss } from './node-style-css.js';

// ============================================================
// 类型
// ============================================================

/** 形状组件 Props */
export interface ShapeComponentProps {
  /** 形状类型 */
  shape: MermaidShapeType;
  /** 标签文本 */
  label: string;
  /** 标签类型 */
  labelType?: 'text' | 'string' | 'markdown';
  /** 节点样式 */
  style?: NodeStyle;
  /** 是否选中 */
  selected: boolean;
  /** 图标名称（可选） */
  icon?: string;
  /** 图片 URL（可选） */
  img?: string;
}

// ============================================================
// 常量
// ============================================================

/** 默认样式 — 空字符串表示不设置 inline style，由 CSS class 控制 */
const DEFAULT_STROKE = '';
const DEFAULT_FILL = '';
const DEFAULT_COLOR = '';
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_LINE_HEIGHT = 18;

/** Handle 样式 */
export const handleStyle = { width: 8, height: 8 };

// ============================================================
// 标签图标解析
// ============================================================

interface LabelParseResult {
  /** 移除图标语法后的纯净标签 */
  cleanLabel: string;
  /** FontAwesome CSS 类名列表 */
  faIcons: string[];
}

/**
 * 解析 label 中的 FontAwesome 图标语法
 *
 * 官方语法: fa[bklrs]?:fa-xxx，例如:
 *   - fa:fa-car      → fa-solid fa-car
 *   - fab:fa-twitter → fa-brands fa-twitter
 *   - fas:fa-car     → fa-solid fa-car
 *
 * 同时支持通过 metadata icon 字段传入的图标类名（如 "fa fa-car"）
 */
function parseLabelIcons(label: string, icon?: string): LabelParseResult {
  const faIcons: string[] = [];

  // 1. 解析 label 文本中的 fa:fa-xxx 语法
  const cleanLabel = label
    .replace(/\b(fa[bklrs]?):fa-([\w-]+)\b/g, (_match, prefix, iconName) => {
      const styleClass = mapFaPrefixToStyle(prefix);
      faIcons.push(`${styleClass} fa-${iconName}`);
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();

  // 2. 解析 metadata icon 字段（如 "fa fa-car" 或 "fas fa-car"）
  if (icon) {
    const iconClasses = icon
      .split(/\s+/)
      .filter(Boolean)
      .map((cls) => (cls === 'fa' ? 'fas' : cls));
    faIcons.push(iconClasses.join(' '));
  }

  return { cleanLabel, faIcons };
}

/** 将 FontAwesome 前缀映射到 CSS 样式类 */
function mapFaPrefixToStyle(prefix: string): string {
  switch (prefix) {
    case 'fab':
      return 'fa-brands';
    case 'far':
      return 'fa-regular';
    case 'fal':
      return 'fa-light';
    case 'fad':
      return 'fa-duotone';
    case 'fas':
    case 'fa':
    default:
      return 'fa-solid';
  }
}

// ============================================================
// 形状渲染组件
// ============================================================

/** 形状渲染器 — 根据形状类型渲染 SVG 形状 + HTML 标签 */
export const ShapeRenderer = memo(function ShapeRenderer({
  shape,
  label,
  style,
  selected,
  icon,
  img,
}: ShapeComponentProps) {
  // 形状几何统一模型（未注册形状由 getShapeGeometry 内部回退为 rect）
  const geometry = getShapeGeometry(shape);

  // 样式
  const stroke = style?.stroke ?? DEFAULT_STROKE;
  const fill = style?.fill ?? DEFAULT_FILL;
  const color = style?.color ?? DEFAULT_COLOR;
  const strokeWidth = selected ? Math.max(3, (style?.strokeWidth ?? 2) + 1) : (style?.strokeWidth ?? 2);
  const strokeColor = selected ? 'var(--node-selected-stroke)' : stroke;

  // 解析 label 中的 fa:fa-xxx 图标语法（如 fa:fa-car Car）
  const { cleanLabel, faIcons } = parseLabelIcons(label, icon);

  // 基础矩形尺寸（用于文本布局）
  const lines = cleanLabel.split(/<br\s*\/?>|\n/i);

  // 根据形状几何模型计算尺寸 + 生成 path + 装饰
  // estimateTextBBox 接收原始 label，内部清洗与 parseLabelIcons 一致，
  // 保证 ShapeRenderer 与 flowchart-node（用 data.label）计算出相同的尺寸
  const bbox = estimateTextBBox(label);
  const { width, height, pathWidth, pathHeight, pad } = geometry.computeSize(bbox);
  const pathD = geometry.generatePath(pathWidth, pathHeight);
  const decorations = geometry.generateDecorations?.(pathWidth, pathHeight) ?? [];

  // 渲染标签（HTML，支持图标、图片和多行文本）
  // 图标/图片与第一行文字在同一行，后续行换行显示
  const firstLine = lines[0] ?? '';
  const restLines = lines.slice(1);
  const hasIcon = faIcons.length > 0 || Boolean(img);
  // Bug5: 将节点 style 中的任意 CSS 属性应用到标签（如 font-size、font-family 等）
  const extraLabelStyle = nodeStyleToCss(style);
  const renderLabel = () => (
    <div
      className="mermaid-shape-label"
      style={{
        ...(color ? { color } : {}),
        fontSize: DEFAULT_FONT_SIZE,
        lineHeight: `${DEFAULT_LINE_HEIGHT}px`,
        ...extraLabelStyle,
      }}
    >
      {hasIcon ? (
        <span className="mermaid-shape-label-row">
          {faIcons.map((cls, i) => (
            <i key={i} className={cls} />
          ))}
          {img && <img src={img} alt="" className="mermaid-shape-img" />}
          {firstLine && (
            <span className="mermaid-shape-label-line">{firstLine}</span>
          )}
        </span>
      ) : (
        firstLine && (
          <span className="mermaid-shape-label-line">{firstLine}</span>
        )
      )}
      {restLines.map((line, i) => (
        <span key={i} className="mermaid-shape-label-line">
          {line}
        </span>
      ))}
    </div>
  );

  // text 形状特殊处理（无边框，仅文本）
  if (shape === 'text') {
    return (
      <div className="mermaid-shape" style={{ width, height }}>
        {renderLabel()}
      </div>
    );
  }

  return (
    <div className="mermaid-shape" style={{ width, height }}>
      <svg
        className="mermaid-shape-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible' }}
      >
        <g transform={`translate(${pad}, ${pad})`}>
          {pathD && (
            <path
              d={pathD}
              {...(fill ? { fill } : {})}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fillRule="nonzero"
            />
          )}
          {decorations.map((dec, i) => (
            <DecorationElement
              key={i}
              decoration={dec}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fill={fill}
            />
          ))}
        </g>
      </svg>
      {renderLabel()}
    </div>
  );
});

// ============================================================
// 装饰元素渲染
// ============================================================

/** 渲染单个装饰元素 */
function DecorationElement({
  decoration,
  stroke,
  strokeWidth,
  fill,
}: {
  decoration: ShapeDecoration;
  stroke: string;
  strokeWidth: number;
  fill: string;
}) {
  const { tag, attrs } = decoration;
  const commonAttrs = {
    stroke,
    strokeWidth,
    fill: tag === 'line' ? 'none' : fill,
  };

  switch (tag) {
    case 'ellipse':
      return <ellipse {...commonAttrs} {...attrs} />;
    case 'line':
      return <line {...commonAttrs} {...attrs} />;
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
