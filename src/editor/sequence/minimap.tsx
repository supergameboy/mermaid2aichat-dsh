/**
 * SequenceMiniMap — 时序图画布缩略图（仅展示）
 *
 * 单一职责：缩略渲染元素 rect + viewport mask，不响应点击/拖拽
 *
 * 对齐 React Flow <MiniMap/> 视觉：
 *   - 节点 rect（react-flow__minimap-node）：每个元素缩略为 rect，shape-rendering="crispEdges"
 *   - viewport mask（react-flow__minimap-mask）：evenodd path 挖空 viewport 区域，viewport 外半透明遮罩
 *
 * 渲染层次（从底到顶）：
 *   1. bounds 外框（整体边界）
 *   2. 节点 rects（按传入顺序，大容器在前避免遮挡）
 *   3. viewport mask（最顶层，遮罩 viewport 外区域）
 *
 * 坐标映射：
 *   画布坐标 → minimap 坐标：minimap = canvas * scale + offset
 *   scale = min(availW / boundsW, availH / boundsH)
 *   offset = padding - boundsStart * scale
 *
 * viewport mask 计算：
 *   SVG transform = translate(viewport.x, viewport.y) scale(viewport.zoom)
 *   viewBox 区域 [0, 0, canvasWidth, canvasHeight] 对应画布可见区域：
 *     x: [-viewport.x / zoom, (canvasWidth - viewport.x) / zoom]
 *     y: [-viewport.y / zoom, (canvasHeight - viewport.y) / zoom]
 *   宽度: canvasWidth / zoom，高度: canvasHeight / zoom
 *   mask path 外层覆盖整个 minimap，内层为 viewport 矩形，evenodd 挖空 viewport
 *
 * 设计文档：docs/design/sequence-canvas-unification.md §关键设计决策 8
 */
import type { Viewport } from '@mermaid2aichat/serializer';
import type { BoundsData } from './sequence-bounds.js';

/** MiniMap 内部坐标系尺寸（与 .seq-minimap-container CSS width/height 对齐） */
const MINIMAP_WIDTH = 150;
const MINIMAP_HEIGHT = 100;

/** MiniMap 内边距（bounds 与 minimap 边缘的距离） */
const MINIMAP_PADDING = 4;

/** 元素缩略矩形（聚合 participants/blocks/boxes/notes 的 bounds） */
export interface SequenceMiniMapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** SequenceMiniMap Props */
export interface SequenceMiniMapProps {
  /** layout.bounds（画布包围盒） */
  bounds: BoundsData;
  /** 当前 viewport（平移/缩放状态） */
  viewport: Viewport;
  /** SVG viewBox 尺寸（layout.canvasWidth/canvasHeight） */
  viewBoxSize: { width: number; height: number };
  /**
   * 元素缩略 rect 数组（调用方按渲染顺序聚合：box → block → participant → note）
   * 渲染顺序保证大容器在下层，小元素在上层，避免遮挡
   */
  rects: SequenceMiniMapRect[];
}

/**
 * SequenceMiniMap — 缩略图组件
 *
 * 空图场景（boundsW<=0 || boundsH<=0）：渲染空 minimap，仅显示外框
 */
export function SequenceMiniMap({
  bounds,
  viewport,
  viewBoxSize,
  rects,
}: SequenceMiniMapProps): JSX.Element {
  const boundsStartX = bounds.startx ?? 0;
  const boundsStopX = bounds.stopx ?? 0;
  const boundsStartY = bounds.starty ?? 0;
  const boundsStopY = bounds.stopy ?? 0;
  const boundsW = boundsStopX - boundsStartX;
  const boundsH = boundsStopY - boundsStartY;

  // 空图场景：渲染空 minimap
  if (boundsW <= 0 || boundsH <= 0) {
    return (
      <div className="seq-minimap-container">
        <svg width="100%" height="100%" viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}>
          <rect
            x={MINIMAP_PADDING}
            y={MINIMAP_PADDING}
            width={MINIMAP_WIDTH - 2 * MINIMAP_PADDING}
            height={MINIMAP_HEIGHT - 2 * MINIMAP_PADDING}
            style={{
              fill: 'var(--seq-minimap-bounds-fill)',
              stroke: 'var(--seq-minimap-bounds-stroke)',
            }}
            strokeWidth={1}
          />
        </svg>
      </div>
    );
  }

  // 缩放计算：bounds 缩放到 minimap 内部（留 padding 边距）
  const availW = MINIMAP_WIDTH - 2 * MINIMAP_PADDING;
  const availH = MINIMAP_HEIGHT - 2 * MINIMAP_PADDING;
  const scale = Math.min(availW / boundsW, availH / boundsH);
  const offsetX = MINIMAP_PADDING - boundsStartX * scale;
  const offsetY = MINIMAP_PADDING - boundsStartY * scale;

  // viewport 可见区域（画布坐标系）
  const vpZoom = viewport.zoom;
  const visibleX = -viewport.x / vpZoom;
  const visibleY = -viewport.y / vpZoom;
  const visibleW = viewBoxSize.width / vpZoom;
  const visibleH = viewBoxSize.height / vpZoom;

  // viewport 转换到 minimap 坐标
  const vpMmX = visibleX * scale + offsetX;
  const vpMmY = visibleY * scale + offsetY;
  const vpMmW = visibleW * scale;
  const vpMmH = visibleH * scale;

  // viewport mask path（对齐 React Flow react-flow__minimap-mask，evenodd 挖空 viewport）
  // 外层大矩形覆盖整个 minimap，内层为 viewport 区域，evenodd 规则挖空 viewport
  const maskPath = `M0,0 h${MINIMAP_WIDTH} v${MINIMAP_HEIGHT} h-${MINIMAP_WIDTH} z M${vpMmX},${vpMmY} h${vpMmW} v${vpMmH} h-${vpMmW} z`;

  return (
    <div className="seq-minimap-container">
      <svg width="100%" height="100%" viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}>
        {/* 1. bounds 外框（整体边界） */}
        <rect
          x={boundsStartX * scale + offsetX}
          y={boundsStartY * scale + offsetY}
          width={boundsW * scale}
          height={boundsH * scale}
          style={{
            fill: 'var(--seq-minimap-bounds-fill)',
            stroke: 'var(--seq-minimap-bounds-stroke)',
          }}
          strokeWidth={1}
        />

        {/* 2. 节点 rects（按传入顺序渲染，大容器在下层） */}
        {rects.map((rect, idx) => (
          <rect
            key={`mm-node-${idx}`}
            x={rect.x * scale + offsetX}
            y={rect.y * scale + offsetY}
            width={rect.width * scale}
            height={rect.height * scale}
            style={{ fill: 'var(--seq-minimap-node-fill)' }}
            shapeRendering="crispEdges"
          />
        ))}

        {/* 3. viewport mask（evenodd path 挖空 viewport，viewport 外半透明遮罩） */}
        <path
          d={maskPath}
          fillRule="evenodd"
          style={{ fill: 'var(--seq-minimap-mask)' }}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}
