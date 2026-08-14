/**
 * 形状几何统一模型 — 单一数据源
 *
 * 单一职责：集中定义每个 MermaidShapeType 的尺寸公式、path 生成、handle 偏移
 *
 * 对齐官方 mermaid v11 neo look 几何公式
 * 参考: mermaid-develop/packages/mermaid/src/rendering-util/rendering-elements/shapes/
 *
 * 数据流:
 *   MermaidShapeType → shapeGeometryRegistry → ShapeGeometry
 *     → computeSize(bbox) → NodeSizeResult
 *     → generatePath(pathWidth, pathHeight) → SVG path d
 *     → generateDecorations(pathWidth, pathHeight) → ShapeDecoration[]
 *     → getHandleOffsets(width, height) → HandleOffsets
 */

import type { MermaidShapeType } from '@mermaid2aichat/serializer';

// ============================================================
// 类型定义
// ============================================================

/** 文本边界框（由 label 估算得出） */
export interface TextBBox {
  width: number;
  height: number;
}

/** 节点尺寸计算结果 */
export interface NodeSizeResult {
  /** 外层容器宽度（React Flow 节点尺寸） */
  width: number;
  /** 外层容器高度（React Flow 节点尺寸） */
  height: number;
  /** 传给 path 生成器的宽度 */
  pathWidth: number;
  /** 传给 path 生成器的高度 */
  pathHeight: number;
  /** path 相对容器的内边距（大多数形状为 0） */
  pad: number;
}

/** Handle 偏移量（相对于 React Flow 默认 Handle 位置） */
export interface HandleOffsets {
  top: { x: number; y: number };
  bottom: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
}

/** 额外 SVG 装饰元素（如 cylinder 顶部椭圆、subroutine 竖线等） */
export interface ShapeDecoration {
  tag: 'ellipse' | 'line' | 'rect' | 'circle' | 'path';
  attrs: Record<string, string | number>;
}

/** 二维点 */
export interface Point {
  x: number;
  y: number;
}

/** 形状分类 — 决定渲染策略和 handle 偏移 */
export type ShapeCategory =
  | 'rect'        // 矩形类（path 充满容器，handle 偏移 0）
  | 'circle'      // 圆形（正圆，基于宽度）
  | 'diamond'     // 菱形（正方形菱形）
  | 'hexagon'     // 六边形
  | 'ellipse'     // 椭圆
  | 'stadium'     // 体育场（胶囊形）
  | 'cylinder'    // 圆柱
  | 'polygon'     // 多边形（由点集定义）
  | 'custom';     // 自定义（复杂路径）

/** 形状几何模型 — 集中定义一个形状的尺寸、path、handle 偏移 */
export interface ShapeGeometry {
  /** 形状分类 */
  category: ShapeCategory;
  /** 根据文本边界框计算节点完整尺寸 */
  computeSize: (bbox: TextBBox) => NodeSizeResult;
  /** 生成 SVG path d 字符串（基于 pathWidth/pathHeight） */
  generatePath: (pathWidth: number, pathHeight: number) => string;
  /** 生成额外装饰元素 */
  generateDecorations?: (pathWidth: number, pathHeight: number) => ShapeDecoration[];
  /** 计算 Handle 偏移量（相对于容器边缘默认位置） */
  getHandleOffsets: (width: number, height: number) => HandleOffsets;
  /**
   * 多边形顶点（基于 pathWidth/pathHeight，本地坐标）— 仅 polygon/diamond/hexagon 类形状需提供
   * 用于与射线求交计算边界连接点，使边端点贴合实际形状边缘
   */
  getPolygonPoints?: (pathWidth: number, pathHeight: number) => Point[];
}

// ============================================================
// 文本尺寸估算（从 node-size.ts 迁移）
// ============================================================

const CHAR_WIDTH = 8;
const DEFAULT_BASE_HEIGHT = 48;
const DEFAULT_LINE_HEIGHT = 18;
const MIN_TEXT_WIDTH = 60;

/** 估算文本边界框（不含 padding） */
export function estimateTextBBox(label: string): TextBBox {
  // 与 shape-component.tsx 的 parseLabelIcons 保持一致的清洗逻辑：
  // 1. 移除 FontAwesome 图标语法 2. 折叠连续空白 3. trim
  // 保证 flowchart-node（用 data.label）与 ShapeRenderer（用 cleanLabel）计算出相同的尺寸
  const cleanLabel = label
    .replace(/\b(fa[bklrs]?):fa-[\w-]+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = cleanLabel.split(/<br\s*\/?>|\n/i);
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  const width = Math.max(maxLineLength * CHAR_WIDTH, MIN_TEXT_WIDTH);
  const height = DEFAULT_BASE_HEIGHT + (lines.length - 1) * DEFAULT_LINE_HEIGHT;
  return { width, height };
}

// ============================================================
// Handle 偏移常量
// ============================================================

/** 零偏移（矩形类形状和充满容器的形状） */
const ZERO_OFFSETS: HandleOffsets = {
  top: { x: 0, y: 0 },
  bottom: { x: 0, y: 0 },
  left: { x: 0, y: 0 },
  right: { x: 0, y: 0 },
};

// ============================================================
// 工厂函数 — 减少重复代码
// ============================================================

/**
 * 创建矩形类形状几何
 * 矩形类：path 充满容器，handle 偏移 0
 */
function makeRectLike(
  paddingX: number,
  paddingY: number,
  pathGen: (w: number, h: number) => string,
  decorations?: (w: number, h: number) => ShapeDecoration[],
): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const width = bbox.width + paddingX * 2;
      const height = bbox.height + paddingY * 2;
      return { width, height, pathWidth: width, pathHeight: height, pad: 0 };
    },
    generatePath: pathGen,
    generateDecorations: decorations,
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/**
 * 创建圆形几何（基于宽度计算半径，正圆）
 * 官方: r = bbox.width/2 + padding
 */
function makeCircle(padding: number): ShapeGeometry {
  return {
    category: 'circle',
    computeSize: (bbox) => {
      const r = bbox.width / 2 + padding;
      const size = r * 2;
      return { width: size, height: size, pathWidth: size, pathHeight: size, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/**
 * 创建双圆几何（外圆 + 内圆装饰）
 * 官方: outerR = bbox.width/2 + padding, innerR = outerR - gap
 */
function makeDoubleCircle(padding: number, gap: number): ShapeGeometry {
  return {
    category: 'circle',
    computeSize: (bbox) => {
      const outerR = bbox.width / 2 + padding;
      const size = outerR * 2;
      return { width: size, height: size, pathWidth: size, pathHeight: size, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    },
    generateDecorations: (w, h) => {
      const r = Math.min(w, h) / 2 - gap;
      const cx = w / 2;
      const cy = h / 2;
      return [{ tag: 'circle', attrs: { cx, cy, r } }];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/**
 * 创建菱形几何（正方形菱形，对齐官方）
 * 官方: s = bbox.width + bbox.height，菱形是正方形
 */
function makeDiamond(padding: number): ShapeGeometry {
  return {
    category: 'diamond',
    computeSize: (bbox) => {
      const s = bbox.width + bbox.height + padding * 2;
      return { width: s, height: s, pathWidth: s, pathHeight: s, pad: 0 };
    },
    generatePath: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      return `M ${cx} 0 L ${w} ${cy} L ${cx} ${h} L 0 ${cy} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => [
      { x: w / 2, y: 0 },
      { x: w, y: h / 2 },
      { x: w / 2, y: h },
      { x: 0, y: h / 2 },
    ],
  };
}

/**
 * 创建六边形几何（m 基于高度计算，对齐官方）
 * 官方: h = bbox.height + paddingX, m = h/f, w = bbox.width + 2*m + paddingY
 */
function makeHexagon(paddingX: number, paddingY: number, f: number): ShapeGeometry {
  return {
    category: 'hexagon',
    computeSize: (bbox) => {
      const h = bbox.height + paddingX;
      const m = h / f;
      const w = bbox.width + 2 * m + paddingY;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const m = h / f;
      return `M ${m} 0 L ${w - m} 0 L ${w} ${h / 2} L ${w - m} ${h} L ${m} ${h} L 0 ${h / 2} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => {
      const m = h / f;
      return [
        { x: m, y: 0 },
        { x: w - m, y: 0 },
        { x: w, y: h / 2 },
        { x: w - m, y: h },
        { x: m, y: h },
        { x: 0, y: h / 2 },
      ];
    },
  };
}

/**
 * 创建椭圆几何
 */
function makeEllipse(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'ellipse',
    computeSize: (bbox) => {
      const width = bbox.width + paddingX * 2;
      const height = bbox.height + paddingY * 2;
      return { width, height, pathWidth: width, pathHeight: height, pad: 0 };
    },
    generatePath: (w, h) => {
      const rx = w / 2;
      const ry = h / 2;
      return `M ${rx} 0 A ${rx} ${ry} 0 1 0 ${rx} ${h} A ${rx} ${ry} 0 1 0 ${rx} 0 Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/**
 * 创建体育场几何（胶囊形，对齐官方）
 * 官方: h = bbox.height + paddingY*2, w = bbox.width + h/4 + paddingX*2, r = h/2
 */
function makeStadium(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'stadium',
    computeSize: (bbox) => {
      const h = bbox.height + paddingY * 2;
      const w = bbox.width + h / 4 + paddingX * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = h / 2;
      return `M ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w - r} ${h} L ${r} ${h} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/**
 * 创建圆柱几何（对齐官方）
 * 官方: w = bbox.width + padding, rx = w/2, ry = rx/(2.5+w/50), h = bbox.height + padding + ry
 */
function makeCylinder(padding: number): ShapeGeometry {
  return {
    category: 'cylinder',
    computeSize: (bbox) => {
      const w = bbox.width + padding;
      const rx = w / 2;
      const ry = rx / (2.5 + w / 50);
      const h = bbox.height + padding + ry;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const rx = w / 2;
      const ry = rx / (2.5 + w / 50);
      // 官方 createCylinderPathD: 顶部椭圆 + 右侧 + 底部椭圆 + 左侧
      return `M 0 ${ry} A ${rx} ${ry} 0 0 0 ${w} ${ry} A ${rx} ${ry} 0 0 0 0 ${ry} L 0 ${h} A ${rx} ${ry} 0 0 0 ${w} ${h} L ${w} ${ry}`;
    },
    generateDecorations: (w) => {
      const rx = w / 2;
      const ry = rx / (2.5 + w / 50);
      // 顶部椭圆装饰（让顶部看起来是完整椭圆）
      return [{ tag: 'path', attrs: { d: `M 0 ${ry} A ${rx} ${ry} 0 0 0 ${w} ${ry}` } }];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/**
 * 创建子程序几何（带左右竖线的矩形，对齐官方）
 * 官方: totalWidth = bbox.width + 2*FRAME_WIDTH + paddingX, totalHeight = bbox.height + paddingY
 */
function makeSubroutine(paddingX: number, paddingY: number, frameWidth: number): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const width = bbox.width + 2 * frameWidth + paddingX;
      const height = bbox.height + paddingY;
      return { width, height, pathWidth: width, pathHeight: height, pad: 0 };
    },
    generatePath: (w, h) => {
      // 官方 subroutine: 内框 + 外框（带左右耳朵）
      return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
    },
    generateDecorations: (w, h) => [
      { tag: 'line', attrs: { x1: frameWidth, y1: 0, x2: frameWidth, y2: h } },
      { tag: 'line', attrs: { x1: w - frameWidth, y1: 0, x2: w - frameWidth, y2: h } },
    ],
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

// ============================================================
// 各形状几何定义
// ============================================================

/** 矩形 path */
const rectPath = (w: number, h: number) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;

/** 圆角矩形 path（radius=5，对齐官方默认） */
const roundedPath = (w: number, h: number) => {
  const r = 5;
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
};

/** 奇形 path（左侧 V 形凹槽，对齐官方 rectLeftInvArrow） */
function makeOdd(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const notch = h / 4;
      // 左侧 V 形凹槽：从左上凹槽右点 → 左中凹槽顶点 → 左下凹槽右点 → 右下 → 右上
      return `M ${notch} 0 L 0 ${h / 2} L ${notch} ${h} L ${w} ${h} L ${w} 0 Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => {
      const notch = h / 4;
      return [
        { x: notch, y: 0 },
        { x: 0, y: h / 2 },
        { x: notch, y: h },
        { x: w, y: h },
        { x: w, y: 0 },
      ];
    },
  };
}

/** 梯形 path（上宽下窄，对齐官方 trapezoid: 顶部比底部宽 h） */
function makeTrapezoid(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const h = bbox.height + paddingY * 2;
      // 容器宽度比 bbox 宽 h，留给梯形斜边（确保 w > h，顶部宽度 = w - h > 0）
      const w = bbox.width + h + paddingX * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const offset = h / 2;
      // 上宽下窄：顶部充满容器，底部缩窄 offset
      return `M 0 0 L ${w} 0 L ${w - offset} ${h} L ${offset} ${h} Z`;
    },
    getHandleOffsets: (_w, h) => {
      // 左/右边在 y=h/2 处的 x 偏移 = offset/2 = h/4
      const dx = h / 4;
      return { ...ZERO_OFFSETS, left: { x: dx, y: 0 }, right: { x: -dx, y: 0 } };
    },
    getPolygonPoints: (w, h) => {
      const offset = h / 2;
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w - offset, y: h },
        { x: offset, y: h },
      ];
    },
  };
}

/** 倒梯形 path（上窄下宽，对齐官方 inv_trapezoid: 底部比顶部宽 h） */
function makeTrapezoidReverse(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const h = bbox.height + paddingY * 2;
      // 容器宽度比 bbox 宽 h，留给梯形斜边（确保 w > h，底部宽度 = w > 0）
      const w = bbox.width + h + paddingX * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const offset = h / 2;
      // 上窄下宽：顶部缩窄 offset，底部充满容器
      return `M ${offset} 0 L ${w - offset} 0 L ${w} ${h} L 0 ${h} Z`;
    },
    getHandleOffsets: (_w, h) => {
      const dx = h / 4;
      return { ...ZERO_OFFSETS, left: { x: dx, y: 0 }, right: { x: -dx, y: 0 } };
    },
    getPolygonPoints: (w, h) => {
      const offset = h / 2;
      return [
        { x: offset, y: 0 },
        { x: w - offset, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    },
  };
}

/** 右倾斜 path（平行四边形，对齐官方 lean_right: 顶部右移，底部左移） */
function makeLeanRight(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const h = bbox.height + paddingY * 2;
      // 容器宽度比 bbox 宽 h，留给平行四边形斜边（确保 w > h）
      const w = bbox.width + h + paddingX * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const offset = h / 2;
      // 右倾斜：顶部右移 offset，底部左移 offset（不超出容器）
      return `M ${offset} 0 L ${w} 0 L ${w - offset} ${h} L 0 ${h} Z`;
    },
    getHandleOffsets: (_w, h) => {
      const dx = h / 4;
      return { ...ZERO_OFFSETS, left: { x: dx, y: 0 }, right: { x: -dx, y: 0 } };
    },
    getPolygonPoints: (w, h) => {
      const offset = h / 2;
      return [
        { x: offset, y: 0 },
        { x: w, y: 0 },
        { x: w - offset, y: h },
        { x: 0, y: h },
      ];
    },
  };
}

/** 左倾斜 path（平行四边形，对齐官方 lean_left: 顶部左移，底部右移） */
function makeLeanLeft(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const h = bbox.height + paddingY * 2;
      const w = bbox.width + h + paddingX * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const offset = h / 2;
      // 左倾斜：顶部左移，底部右移（不超出容器）
      return `M 0 0 L ${w - offset} 0 L ${w} ${h} L ${offset} ${h} Z`;
    },
    getHandleOffsets: (_w, h) => {
      const dx = h / 4;
      return { ...ZERO_OFFSETS, left: { x: dx, y: 0 }, right: { x: -dx, y: 0 } };
    },
    getPolygonPoints: (w, h) => {
      const offset = h / 2;
      return [
        { x: 0, y: 0 },
        { x: w - offset, y: 0 },
        { x: w, y: h },
        { x: offset, y: h },
      ];
    },
  };
}

/** 文档 path（波浪底边，对齐官方 waveEdgedRectangle） */
function makeDocument(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      const waveAmp = h / 4;
      const finalH = h + waveAmp;
      return { width: w, height: finalH, pathWidth: w, pathHeight: finalH, pad: 0 };
    },
    generatePath: (w, h) => {
      // 近似正弦波底边（用两段贝塞尔曲线模拟）
      const waveAmp = h / 5;
      const topY = 0;
      const bottomY = h - waveAmp;
      return `M 0 ${topY} L ${w} ${topY} L ${w} ${bottomY} Q ${w * 0.75} ${h} ${w / 2} ${bottomY} Q ${w * 0.25} ${bottomY - waveAmp * 2} 0 ${bottomY} Z`;
    },
    // 波浪底边在 x=w/2 处的 y 坐标为 bottomY = h - waveAmp
    // Bottom Handle 默认在 (w/2, h)，需上移 waveAmp 到波浪基线
    getHandleOffsets: (_w, h) => ({
      ...ZERO_OFFSETS,
      bottom: { x: 0, y: -h / 5 },
    }),
  };
}

/**
 * 三角形 path（向上，等边三角形）
 *
 * 等边三角形几何：底边 = base，高度 = base × √3/2，底角 60°，顶角 60°
 * 底边 = bbox.width + bbox.height + padding，确保三角形足够大容纳文本
 *
 * 注：官方 mermaid triangle 用等腰直角三角形（底边=高度），视觉上偏高，
 * 用户反馈要求等边三角形（正三角），故偏离官方公式。
 */
const SQRT3_HALF = Math.sqrt(3) / 2;

function makeTriangle(paddingX: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      // 等边三角形：底边 = base，高度 = base × √3/2
      // 底边 = 文本宽度 + 文本高度 + padding，确保三角形足够大
      const base = bbox.width + bbox.height + paddingX;
      const height = base * SQRT3_HALF;
      return { width: base, height, pathWidth: base, pathHeight: height, pad: 0 };
    },
    generatePath: (w, h) => `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`,
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => [
      { x: w / 2, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  };
}

/**
 * 倒三角 path（向下，等边三角形）
 * 同 triangle：底边 = base，高度 = base × √3/2
 */
function makeFlippedTriangle(paddingX: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const base = bbox.width + bbox.height + paddingX;
      const height = base * SQRT3_HALF;
      return { width: base, height, pathWidth: base, pathHeight: height, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L ${w / 2} ${h} Z`,
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w / 2, y: h },
    ],
  };
}

/** 沙漏 path（X 形，对齐官方 hourglass） */
function makeHourglass(): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const size = Math.max(30, Math.max(bbox.width, bbox.height));
      return { width: size, height: size, pathWidth: size, pathHeight: size, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L 0 ${h} L ${w} ${h} Z`,
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: 0, y: h },
      { x: w, y: h },
    ],
  };
}

/** 卡片 path（左上角凹槽，对齐官方 card） */
function makeCard(paddingX: number, paddingY: number, notchSize: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      // 左上角凹槽：从 (notch, 0) → (w, 0) → (w, h) → (0, h) → (0, h-notch) → (notch, 0)
      return `M ${notchSize} 0 L ${w} 0 L ${w} ${h} L 0 ${h} L 0 ${h - notchSize} L ${notchSize} 0 Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => [
      { x: notchSize, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: h - notchSize },
    ],
  };
}

/** 闪电 path（对齐官方 lightningBolt） */
function makeLightningBolt(): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const size = Math.max(35, Math.max(bbox.width, bbox.height));
      return { width: size, height: size * 2, pathWidth: size, pathHeight: size * 2, pad: 0 };
    },
    generatePath: (w, h) => {
      const gap = 7;
      const halfH = h / 2;
      return `M ${w} 0 L 0 ${halfH + gap / 2} L ${w - 2 * gap} ${halfH + gap / 2} L 0 ${h} L ${w} ${halfH - gap / 2} L ${2 * gap} ${halfH - gap / 2} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 云形 path（近似官方 cloud） */
function makeCloud(): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const padding = 16;
      const w = bbox.width + padding * 2;
      const h = bbox.height + padding * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const r1 = 0.15 * w;
      const r2 = 0.25 * w;
      const r3 = 0.35 * w;
      const r4 = 0.2 * w;
      // 近似官方 10 段圆弧云朵形
      return `M ${cx - r3} ${cy} a ${r1} ${r1} 0 0 1 ${r1} ${-r1} a ${r2} ${r2} 0 0 1 ${r2} ${-r2} a ${r3} ${r3} 0 0 1 ${r3} ${r3} a ${r4} ${r4} 0 0 1 ${r4} ${r4} a ${r3} ${r3} 0 0 1 ${-r3} ${r3} a ${r2} ${r2} 0 0 1 ${-r2} ${r2} a ${r1} ${r1} 0 0 1 ${-r1} ${-r1} a ${r4} ${r4} 0 0 1 ${r4} ${-r4} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 爆炸形 path（近似官方 bang） */
function makeBang(): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const padding = 20;
      const w = Math.max(bbox.width + padding, bbox.width + 20);
      const h = Math.max(bbox.height + padding, bbox.height + 20);
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) / 2;
      const points: string[] = [];
      const spikes = 12;
      for (let i = 0; i < spikes * 2; i++) {
        const angle = (i * Math.PI) / spikes;
        const radius = i % 2 === 0 ? r : r * 0.8;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        points.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
      }
      return points.join(' ') + ' Z';
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 文本块（无边框矩形） */
function makeText(): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const width = bbox.width + 16;
      const height = bbox.height + 12;
      return { width, height, pathWidth: width, pathHeight: height, pad: 0 };
    },
    generatePath: () => '',
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** Fork/Join（细长矩形） */
function makeForkJoin(): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const width = Math.max(70, bbox.width);
      const height = Math.max(10, bbox.height);
      return { width, height, pathWidth: width, pathHeight: height, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 延迟（半圆角矩形，对齐官方 halfRoundedRectangle） */
function makeDelay(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'stadium',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = h / 2;
      // 左侧方角，右侧半圆
      return `M 0 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w - r} ${h} L 0 ${h} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 水平圆柱（对齐官方 tiltedCylinder） */
function makeHorizontalCylinder(padding: number): ShapeGeometry {
  return {
    category: 'cylinder',
    computeSize: (bbox) => {
      const h = bbox.height + padding;
      const ry = h / 2;
      const rx = ry / (2.5 + h / 50);
      const w = bbox.width + rx + padding;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const ry = h / 2;
      const rx = ry / (2.5 + h / 50);
      // 左侧椭圆 + 顶部 + 右侧椭圆 + 底部
      return `M 0 0 A ${rx} ${ry} 0 0 1 0 ${h} L ${w} ${h} A ${rx} ${ry} 0 0 1 ${w} 0 Z`;
    },
    generateDecorations: (w, h) => {
      const ry = h / 2;
      const rx = ry / (2.5 + h / 50);
      return [{ tag: 'ellipse', attrs: { cx: 0, cy: h / 2, rx, ry } }];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 带线圆柱（对齐官方 linedCylinder） */
function makeLinedCylinder(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'cylinder',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const rx = w / 2;
      const ry = rx / (2.5 + w / 50);
      const h = bbox.height + ry + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const rx = w / 2;
      const ry = rx / (2.5 + w / 50);
      return `M 0 ${ry} A ${rx} ${ry} 0 0 0 ${w} ${ry} A ${rx} ${ry} 0 0 0 0 ${ry} L 0 ${h} A ${rx} ${ry} 0 0 0 ${w} ${h} L ${w} ${ry}`;
    },
    generateDecorations: (w, h) => {
      const rx = w / 2;
      const ry = rx / (2.5 + w / 50);
      const outerOffset = h * 0.1;
      return [
        { tag: 'path', attrs: { d: `M 0 ${ry} A ${rx} ${ry} 0 0 0 ${w} ${ry}` } },
        { tag: 'path', attrs: { d: `M 0 ${ry + outerOffset} A ${rx} ${ry} 0 0 0 ${w} ${ry + outerOffset}` } },
      ];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 曲边梯形（对齐官方 curvedTrapezoid） */
function makeCurvedTrapezoid(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = Math.max(20, (bbox.width + paddingX * 2) * 1.25);
      const h = Math.max(5, bbox.height + paddingY * 2);
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = h / 2;
      const rw = w - r;
      const tw = h / 4;
      // 右侧半圆 + 左侧梯形斜边
      return `M ${rw} 0 L ${tw} 0 Q 0 0 0 ${h / 2} Q 0 ${h} ${tw} ${h} L ${rw} ${h} A ${r} ${r} 0 0 0 ${rw} 0 Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 分割矩形（对齐官方 dividedRectangle） */
function makeDividedRectangle(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX;
      const h = bbox.height + paddingY;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
    generateDecorations: (w, h) => {
      const rectOffset = h * 0.2;
      return [{ tag: 'line', attrs: { x1: 0, y1: rectOffset, x2: w, y2: rectOffset } }];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 窗格（对齐官方 windowPane） */
function makeWindowPane(paddingX: number, paddingY: number, rectOffset: number): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2 + rectOffset;
      const h = bbox.height + paddingY * 2 + rectOffset;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
    generateDecorations: (w, h) => [
      { tag: 'line', attrs: { x1: w / 2, y1: 0, x2: w / 2, y2: h } },
      { tag: 'line', attrs: { x1: 0, y1: h / 2, x2: w, y2: h / 2 } },
    ],
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 凹五边形（对齐官方 trapezoidalPentagon） */
function makeNotchedPentagon(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      // 顶部凹槽：左上 → 凹槽右点 → 凹槽左点 → 左上 → ... → 闭合
      return `M ${-w / 2 * 0.8 + w / 2} 0 L ${w / 2 * 0.8 + w / 2 - w / 2} 0 L ${w} ${h / 2 * 0.6} L ${w} ${h} L 0 ${h} L 0 ${h / 2 * 0.6} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => [
      { x: -w / 2 * 0.8 + w / 2, y: 0 },
      { x: w / 2 * 0.8 + w / 2 - w / 2, y: 0 },
      { x: w, y: h / 2 * 0.6 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: h / 2 * 0.6 },
    ],
  };
}

/** 斜矩形（对齐官方 slopedRect） */
function makeSlopedRectangle(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'polygon',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      // 右下角向上倾斜 h/2
      return `M 0 ${h} L 0 0 L ${w} 0 L ${w} ${h / 2} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
    getPolygonPoints: (w, h) => [
      { x: 0, y: h },
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h / 2 },
    ],
  };
}

/** 堆叠矩形（对齐官方 multiRect） */
function makeStackedRectangle(paddingX: number, paddingY: number, rectOffset: number): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2 + rectOffset * 2;
      const h = bbox.height + paddingY * 2 + rectOffset * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
    generateDecorations: (w, h) => {
      // 左上角堆叠折角
      return [
        { tag: 'path', attrs: { d: `M ${rectOffset} ${rectOffset} L ${w} ${rectOffset} L ${w} ${rectOffset * 2} L ${rectOffset} ${rectOffset * 2} Z` } },
        { tag: 'path', attrs: { d: `M 0 0 L ${w - rectOffset} 0 L ${w - rectOffset} ${rectOffset} L 0 ${rectOffset} Z` } },
      ];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 堆叠文档（对齐官方 multiWaveEdgedRectangle） */
function makeStackedDocument(paddingX: number, paddingY: number, rectOffset: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 3;
      const waveAmp = h / 4;
      // finalH = h + waveAmp，使 generatePath 的 waveAmp = finalH/5 = h/4 与 computeSize 一致
      const finalH = h + waveAmp;
      return { width: w, height: finalH, pathWidth: w, pathHeight: finalH, pad: 0 };
    },
    generatePath: (w, h) => {
      const waveAmp = h / 5;
      const bottomY = h - waveAmp;
      return `M 0 0 L ${w} 0 L ${w} ${bottomY} Q ${w * 0.75} ${h} ${w / 2} ${bottomY} Q ${w * 0.25} ${bottomY - waveAmp * 2} 0 ${bottomY} Z`;
    },
    generateDecorations: (w) => {
      // 右上角堆叠折角
      return [
        { tag: 'path', attrs: { d: `M ${rectOffset} ${rectOffset} L ${w} ${rectOffset} L ${w} ${rectOffset * 2} L ${rectOffset} ${rectOffset * 2} Z` } },
      ];
    },
    // 同 document：波浪底边 Bottom Handle 需上移 waveAmp
    getHandleOffsets: (_w, h) => ({
      ...ZERO_OFFSETS,
      bottom: { x: 0, y: -h / 5 },
    }),
  };
}

/** 蝴蝶结矩形（对齐官方 bowTieRect） */
function makeBowTieRectangle(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const h = bbox.height + paddingY;
      const ry = h / 2;
      const rx = ry / (2.5 + h / 50);
      const sagitta = Math.min(rx, ry) * (1 - Math.sqrt(1 - Math.pow(h / Math.max(rx, ry) / 2, 2)));
      const w = bbox.width + paddingX * 2 + sagitta;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      // 矩形 + 对角线（简化版本）
      return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z M 0 0 L ${cx} ${cy} L 0 ${h} M ${w} 0 L ${cx} ${cy} L ${w} ${h}`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 交叉圆（对齐官方 crossedCircle） */
function makeCrossedCircle(): ShapeGeometry {
  return {
    category: 'circle',
    computeSize: (bbox) => {
      const r = Math.max(30, bbox.width / 2);
      const size = r * 2;
      return { width: size, height: size, pathWidth: size, pathHeight: size, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    },
    generateDecorations: (w, h) => {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      const d = r * 0.707;
      return [
        { tag: 'line', attrs: { x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d } },
        { tag: 'line', attrs: { x1: cx - d, y1: cy + d, x2: cx + d, y2: cy - d } },
      ];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 标签矩形（对齐官方 taggedRect） */
function makeTaggedRectangle(paddingX: number, paddingY: number, tagRatio: number): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const h = bbox.height + paddingY * 2;
      const tagWidth = tagRatio * h;
      const w = bbox.width + paddingX * 2 + tagWidth;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
    generateDecorations: (w, h) => {
      const tagH = 0.2 * h;
      const tagW = 0.2 * h;
      // 右下角折角三角形
      return [{ tag: 'path', attrs: { d: `M ${w - tagW} ${h} L ${w} ${h} L ${w} ${h - tagH} Z` } }];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 标签文档（对齐官方 taggedWaveEdgedRectangle） */
function makeTaggedDocument(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      const waveAmp = h / 8;
      // finalH = h + waveAmp = 9h/8，generatePath 的 waveAmp = finalH/9 = h/8 与 computeSize 一致
      const finalH = h + waveAmp;
      return { width: w, height: finalH, pathWidth: w, pathHeight: finalH, pad: 0 };
    },
    generatePath: (w, h) => {
      // waveAmp = h/9（finalH = 9h1/8，waveAmp = h1/8 = finalH/9）
      const waveAmp = h / 9;
      const bottomY = h - waveAmp;
      return `M 0 0 L ${w} 0 L ${w} ${bottomY} Q ${w * 0.75} ${h} ${w / 2} ${bottomY} Q ${w * 0.25} ${bottomY - waveAmp * 2} 0 ${bottomY} Z`;
    },
    generateDecorations: (w, h) => {
      const tagW = 0.2 * w;
      const tagH = 0.2 * h;
      // 右上角折角
      return [{ tag: 'path', attrs: { d: `M ${w - tagW} 0 L ${w} 0 L ${w} ${tagH} Z` } }];
    },
    // 波浪底边在 x=w/2 处 y=bottomY=h-waveAmp（waveAmp=h/9），Bottom Handle 需上移 waveAmp
    getHandleOffsets: (_w, h) => ({
      ...ZERO_OFFSETS,
      bottom: { x: 0, y: -h / 9 },
    }),
  };
}

/** 旗帜/纸带（对齐官方 waveRectangle） */
function makeFlag(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY;
      const waveAmp = h / 8;
      // 双向波浪：finalH = h + 2*waveAmp = 5h/4，generatePath 的 waveAmp = finalH/10 = h/8 与 computeSize 一致
      const finalH = h + waveAmp * 2;
      return { width: w, height: finalH, pathWidth: w, pathHeight: finalH, pad: 0 };
    },
    generatePath: (w, h) => {
      // waveAmp = h/10（finalH = 5h1/4，双向波浪 waveAmp = h1/8 = finalH/10）
      const waveAmp = h / 10;
      const bottomY = h - waveAmp;
      // 顶部和底部都是波浪
      return `M 0 0 Q ${w * 0.25} ${waveAmp * 2} ${w / 2} 0 Q ${w * 0.75} ${-waveAmp * 2} ${w} 0 L ${w} ${bottomY} Q ${w * 0.75} ${h} ${w / 2} ${bottomY} Q ${w * 0.25} ${bottomY - waveAmp * 2} 0 ${bottomY} Z`;
    },
    // 波浪底边在 x=w/2 处 y=bottomY=h-waveAmp（waveAmp=h/10），Bottom Handle 需上移 waveAmp
    getHandleOffsets: (_w, h) => ({
      ...ZERO_OFFSETS,
      bottom: { x: 0, y: -h / 10 },
    }),
  };
}

/** 带线文档（对齐官方 linedWaveEdgedRect） */
function makeLinedDocument(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      const waveAmp = h / 4;
      const finalH = h + waveAmp;
      return { width: w, height: finalH, pathWidth: w, pathHeight: finalH, pad: 0 };
    },
    generatePath: (w, h) => {
      const waveAmp = h / 5;
      const bottomY = h - waveAmp;
      return `M 0 0 L ${w} 0 L ${w} ${bottomY} Q ${w * 0.75} ${h} ${w / 2} ${bottomY} Q ${w * 0.25} ${bottomY - waveAmp * 2} 0 ${bottomY} Z`;
    },
    generateDecorations: (w, h) => {
      const waveAmp = h / 5;
      const bottomY = h - waveAmp;
      // 左侧额外竖线
      return [{ tag: 'line', attrs: { x1: 0, y1: 0, x2: 0, y2: bottomY } }];
    },
    // 波浪底边在 x=w/2 处 y=bottomY=h-waveAmp（waveAmp=h/5），Bottom Handle 需上移 waveAmp
    getHandleOffsets: (_w, h) => ({
      ...ZERO_OFFSETS,
      bottom: { x: 0, y: -h / 5 },
    }),
  };
}

/** 带线矩形（对齐官方 shadedProcess） */
function makeLinedRectangle(paddingX: number, paddingY: number, frameWidth: number): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2 + frameWidth;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
    generateDecorations: (w, h) => [
      { tag: 'line', attrs: { x1: frameWidth, y1: 0, x2: frameWidth, y2: h } },
    ],
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 数据存储（对齐官方 datastore — 虚线顶底边的矩形） */
function makeDatastore(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
    generateDecorations: (w, h) => [
      // 虚线顶边和底边（datastore 特征）
      { tag: 'line', attrs: { x1: 0, y1: 0, x2: w, y2: 0 } },
      { tag: 'line', attrs: { x1: 0, y1: h, x2: w, y2: h } },
    ],
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 左花括号（对齐官方 curlyBraceLeft） */
function makeBraceLeft(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX;
      const h = bbox.height + paddingY;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.max(5, h * 0.1);
      return `M ${w} 0 Q ${cx} 0 ${cx} ${r} Q ${cx} ${cy - r} ${cx - r} ${cy} Q ${cx} ${cy + r} ${cx} ${h - r} Q ${cx} ${h} ${w} ${h}`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 右花括号（对齐官方 curlyBraceRight） */
function makeBraceRight(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.max(5, h * 0.1);
      return `M 0 0 Q ${cx} 0 ${cx} ${r} Q ${cx} ${cy - r} ${cx + r} ${cy} Q ${cx} ${cy + r} ${cx} ${h - r} Q ${cx} ${h} 0 ${h}`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 双花括号（对齐官方 curlyBraces） */
function makeBraces(paddingX: number, paddingY: number): ShapeGeometry {
  return {
    category: 'custom',
    computeSize: (bbox) => {
      const w = bbox.width + paddingX * 2;
      const h = bbox.height + paddingY * 2;
      return { width: w, height: h, pathWidth: w, pathHeight: h, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = Math.max(5, h * 0.1);
      const cx1 = w * 0.25;
      const cx2 = w * 0.75;
      const cy = h / 2;
      return `M ${w} 0 Q ${cx2} 0 ${cx2} ${r} Q ${cx2} ${cy - r} ${cx2 - r} ${cy} Q ${cx2} ${cy + r} ${cx2} ${h - r} Q ${cx2} ${h} ${w} ${h} M 0 0 Q ${cx1} 0 ${cx1} ${r} Q ${cx1} ${cy - r} ${cx1 + r} ${cy} Q ${cx1} ${cy + r} ${cx1} ${h - r} Q ${cx1} ${h} 0 ${h}`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 实心圆（连接点，固定半径） */
function makeFilledCircle(radius: number): ShapeGeometry {
  return {
    category: 'circle',
    computeSize: () => {
      const size = radius * 2;
      return { width: size, height: size, pathWidth: size, pathHeight: size, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** 小起点圆（固定尺寸，对齐官方 stateStart） */
function makeSmallCircle(): ShapeGeometry {
  return makeFilledCircle(7);
}

/** 带框圆（停止点，对齐官方 stateEnd） */
function makeFramedCircle(): ShapeGeometry {
  return {
    category: 'circle',
    computeSize: () => {
      const size = 14;
      return { width: size, height: size, pathWidth: size, pathHeight: size, pad: 0 };
    },
    generatePath: (w, h) => {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    },
    generateDecorations: (w, h) => {
      const r = Math.min(w, h) / 2 * 5 / 7;
      const cx = w / 2;
      const cy = h / 2;
      return [{ tag: 'circle', attrs: { cx, cy, r } }];
    },
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

/** classDiagram 注释（折角矩形，右上角折叠，对齐官方 classDiagram note 视觉） */
function makeClassNote(paddingX: number, paddingY: number, foldSize: number): ShapeGeometry {
  return {
    category: 'rect',
    computeSize: (bbox) => {
      const width = bbox.width + paddingX * 2;
      const height = bbox.height + paddingY * 2;
      return { width, height, pathWidth: width, pathHeight: height, pad: 0 };
    },
    // 折角矩形 path：右上角折叠（foldSize 大小的三角形缺角）
    generatePath: (w, h) => `M 0 0 L ${w - foldSize} 0 L ${w} ${foldSize} L ${w} ${h} L 0 ${h} Z`,
    // 折角线（从 (w-fold, 0) 到 (w, fold)，渲染折叠效果）
    generateDecorations: (w) => [
      { tag: 'line', attrs: { x1: w - foldSize, y1: 0, x2: w, y2: foldSize } },
    ],
    getHandleOffsets: () => ZERO_OFFSETS,
  };
}

// ============================================================
// 形状几何注册表
// ============================================================

/** 默认几何（矩形，用于未注册的形状） */
const DEFAULT_GEOMETRY: ShapeGeometry = makeRectLike(16, 12, rectPath);

/** 形状几何注册表 — MermaidShapeType → ShapeGeometry */
export const shapeGeometryRegistry: Partial<Record<MermaidShapeType, ShapeGeometry>> = {
  // === 基本形状（jison 语法 16 种）===
  rect: makeRectLike(16, 12, rectPath),
  rounded: makeRectLike(16, 12, roundedPath),
  stadium: makeStadium(20, 12),
  ellipse: makeEllipse(16, 12),
  subroutine: makeSubroutine(28, 12, 8),
  cylinder: makeCylinder(24),
  circle: makeCircle(32),
  doublecircle: makeDoubleCircle(16, 12),
  diamond: makeDiamond(0),
  hexagon: makeHexagon(70, 32, 3.5),
  odd: makeOdd(21, 12),
  trapezoid: makeTrapezoid(24, 12),
  'trapezoid-reverse': makeTrapezoidReverse(24, 12),
  'lean-right': makeLeanRight(24, 12),
  'lean-left': makeLeanLeft(24, 12),
  'rect-with-prop': makeRectLike(16, 12, rectPath),

  // === 扩展形状 ===
  datastore: makeDatastore(16, 12),
  document: makeDocument(16, 12),
  note: makeRectLike(8, 8, rectPath), // 官方 note 是普通矩形
  triangle: makeTriangle(0),
  'fork-join': makeForkJoin(),
  hourglass: makeHourglass(),
  'lightning-bolt': makeLightningBolt(),
  cloud: makeCloud(),
  bang: makeBang(),
  text: makeText(),
  card: makeCard(28, 24, 12),
  'lined-rectangle': makeLinedRectangle(16, 12, 8),
  'small-circle': makeSmallCircle(),
  'framed-circle': makeFramedCircle(),
  'brace-left': makeBraceLeft(18, 12),
  'brace-right': makeBraceRight(18, 12),
  braces: makeBraces(18, 12),
  delay: makeDelay(16, 12),
  'horizontal-cylinder': makeHorizontalCylinder(12),
  'lined-cylinder': makeLinedCylinder(16, 24),
  'curved-trapezoid': makeCurvedTrapezoid(16, 12),
  'divided-rectangle': makeDividedRectangle(16, 16),
  'window-pane': makeWindowPane(16, 12, 10),
  'filled-circle': makeFilledCircle(7),
  'notched-pentagon': makeNotchedPentagon(16, 12),
  'flipped-triangle': makeFlippedTriangle(0),
  'sloped-rectangle': makeSlopedRectangle(16, 12),
  'stacked-document': makeStackedDocument(16, 12, 10),
  'stacked-rectangle': makeStackedRectangle(16, 12, 10),
  'bow-tie-rectangle': makeBowTieRectangle(16, 12),
  'crossed-circle': makeCrossedCircle(),
  'tagged-document': makeTaggedDocument(16, 12),
  'tagged-rectangle': makeTaggedRectangle(16, 12, 0.2),
  flag: makeFlag(16, 20),
  'lined-document': makeLinedDocument(16, 12),

  // === class 专用形状 ===
  'class-note': makeClassNote(8, 8, 12),
};

// ============================================================
// 公共 API
// ============================================================

/**
 * 获取形状几何定义
 * 未注册的形状返回默认矩形几何
 */
export function getShapeGeometry(shape: MermaidShapeType): ShapeGeometry {
  return shapeGeometryRegistry[shape] ?? DEFAULT_GEOMETRY;
}

/**
 * 检查形状是否已注册几何定义
 */
export function isShapeGeometryRegistered(shape: MermaidShapeType): boolean {
  return shape in shapeGeometryRegistry;
}

// ============================================================
// 形状射线求交 — 对齐官方 intersect.polygon / intersect.ellipse
// ============================================================

/**
 * 判断两个数是否同号（用于线段求交的同侧判断）
 */
function sameSign(r1: number, r2: number): boolean {
  return r1 * r2 > 0;
}

/**
 * 线段求交（对齐官方 intersect-line.js，Graphics Gems 算法）
 *
 * 返回 p1-p2 与 q1-q2 两条线段的交点，无交点返回 undefined
 *
 * 注：官方实现含 `offset = denom/2` 的整数四舍五入逻辑（为 C 整数运算设计），
 * JavaScript 浮点除法不需要此补偿，直接用精确除法避免 0.5px 偏差。
 */
function intersectLine(p1: Point, p2: Point, q1: Point, q2: Point): Point | undefined {
  // 计算 p1-p2 直线方程系数: a1·x + b1·y + c1 = 0
  const a1 = p2.y - p1.y;
  const b1 = p1.x - p2.x;
  const c1 = p2.x * p1.y - p1.x * p2.y;

  // 计算 q1 在 p 直线的符号 r3，q2 的符号 r4
  const r3 = a1 * q1.x + b1 * q1.y + c1;
  const r4 = a1 * q2.x + b1 * q2.y + c1;

  const epsilon = 1e-6;

  // r3 和 r4 同号 → q1、q2 在 p 直线同侧，无交点
  if (r3 !== 0 && r4 !== 0 && sameSign(r3, r4)) {
    return undefined;
  }

  // 计算 q1-q2 直线方程系数: a2·x + b2·y + c2 = 0
  const a2 = q2.y - q1.y;
  const b2 = q1.x - q2.x;
  const c2 = q2.x * q1.y - q1.x * q2.y;

  // 计算 p1、p2 在 q 直线的符号
  const r1 = a2 * p1.x + b2 * p1.y + c2;
  const r2 = a2 * p2.x + b2 * p2.y + c2;

  if (Math.abs(r1) < epsilon && Math.abs(r2) < epsilon && sameSign(r1, r2)) {
    return undefined;
  }

  // 计算交点坐标（精确浮点除法，无四舍五入）
  const denom = a1 * b2 - a2 * b1;
  if (denom === 0) {
    return undefined; // 共线
  }

  const numX = b1 * c2 - b2 * c1;
  const numY = a2 * c1 - a1 * c2;

  return { x: numX / denom, y: numY / denom };
}

/**
 * 射线与多边形求交（对齐官方 intersect-polygon.js）
 *
 * 从中心向 target 发出射线，返回射线与多边形最近的交点
 *
 * @param center 形状中心点（绝对坐标）
 * @param target 射线方向的目标点（绝对坐标）
 * @param width 形状宽度
 * @param height 形状高度
 * @param points 多边形顶点（本地坐标，相对于左上角）
 */
function intersectRayWithPolygon(
  center: Point,
  target: Point,
  width: number,
  height: number,
  points: Point[],
): Point {
  // 多边形顶点本地坐标 → 绝对坐标（以 center 为中心）
  const left = center.x - width / 2;
  const top = center.y - height / 2;
  const absPoints = points.map((p) => ({ x: left + p.x, y: top + p.y }));

  const intersections: Point[] = [];

  for (let i = 0; i < absPoints.length; i++) {
    const p1 = absPoints[i];
    const p2 = absPoints[i < absPoints.length - 1 ? i + 1 : 0];
    const hit = intersectLine(center, target, p1, p2);
    if (hit) {
      intersections.push(hit);
    }
  }

  if (intersections.length === 0) {
    return center;
  }

  // 多个交点时，选离 target 最近的
  if (intersections.length > 1) {
    intersections.sort((p, q) => {
      const pdx = p.x - target.x;
      const pdy = p.y - target.y;
      const distp = Math.sqrt(pdx * pdx + pdy * pdy);
      const qdx = q.x - target.x;
      const qdy = q.y - target.y;
      const distq = Math.sqrt(qdx * qdx + qdy * qdy);
      return distp < distq ? -1 : distp === distq ? 0 : 1;
    });
  }
  return intersections[0];
}

/**
 * 射线与椭圆求交（对齐官方 intersect-ellipse.js）
 *
 * 从椭圆中心向 target 发出射线，返回射线与椭圆的交点
 *
 * @param center 椭圆中心（绝对坐标）
 * @param target 射线方向的目标点（绝对坐标）
 * @param rx x 方向半径
 * @param ry y 方向半径
 */
function intersectRayWithEllipse(
  center: Point,
  target: Point,
  rx: number,
  ry: number,
): Point {
  const cx = center.x;
  const cy = center.y;
  const px = cx - target.x;
  const py = cy - target.y;

  const det = Math.sqrt(rx * rx * py * py + ry * ry * px * px);
  if (det === 0) {
    return center;
  }

  let dx = Math.abs((rx * ry * px) / det);
  if (target.x < cx) {
    dx = -dx;
  }
  let dy = Math.abs((rx * ry * py) / det);
  if (target.y < cy) {
    dy = -dy;
  }

  return { x: cx + dx, y: cy + dy };
}

/**
 * 射线与矩形包围盒求交（fallback，用于未提供 getPolygonPoints 的形状）
 *
 * 从中心向 target 发出射线，返回射线与矩形包围盒的交点
 */
function intersectRayWithRect(
  center: Point,
  target: Point,
  width: number,
  height: number,
): Point {
  const dx = target.x - center.x;
  const dy = target.y - center.y;

  if (dx === 0 && dy === 0) {
    return center;
  }

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const tx = dx > 0 ? halfWidth / dx : dx < 0 ? -halfWidth / dx : Infinity;
  const ty = dy > 0 ? halfHeight / dy : dy < 0 ? -halfHeight / dy : Infinity;
  const t = Math.min(tx, ty);

  return { x: center.x + dx * t, y: center.y + dy * t };
}

/**
 * 计算射线与形状边缘的交点（统一入口）
 *
 * 根据形状类型选择求交算法：
 * - ellipse/circle: 解析公式（精确）
 * - 提供了 getPolygonPoints 的形状（diamond/hexagon/triangle/polygon 等）: 多边形求交
 * - 其他形状（rect/stadium/cylinder/custom 等）: 矩形包围盒求交（fallback，对边端点贴合无影响因为容器=形状边界）
 *
 * @param shape 形状类型
 * @param width 形状宽度（节点 measured.width）
 * @param height 形状高度（节点 measured.height）
 * @param center 形状中心点（绝对坐标）
 * @param target 射线方向的目标点（绝对坐标）
 */
export function intersectShapeRay(
  shape: MermaidShapeType,
  width: number,
  height: number,
  center: Point,
  target: Point,
): Point {
  const geometry = getShapeGeometry(shape);

  // 椭圆/圆形：解析公式
  if (geometry.category === 'ellipse' || geometry.category === 'circle') {
    const rx = width / 2;
    const ry = height / 2;
    return intersectRayWithEllipse(center, target, rx, ry);
  }

  // 多边形：用 getPolygonPoints 与射线求交
  if (geometry.getPolygonPoints) {
    const points = geometry.getPolygonPoints(width, height);
    return intersectRayWithPolygon(center, target, width, height, points);
  }

  // 其他形状（rect/stadium/cylinder/custom 等）：矩形包围盒求交
  // 这些形状的容器边界 = 形状边界（path 充满容器），矩形求交结果与形状边缘一致
  return intersectRayWithRect(center, target, width, height);
}
